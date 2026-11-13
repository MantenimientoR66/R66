-- Órdenes de Trabajo · Ruta de la Fruta
-- Turnos de emergencia asignados a mano por calendario.
--
-- CÓMO USARLO
--  1. Pega este archivo completo en Supabase > SQL Editor y ejecútalo. Se puede volver a ejecutar sin perder datos.
--  2. Para que no se pierda si algún día vuelves a ejecutar supabase.sql, pega también este contenido
--     AL FINAL de supabase.sql en GitHub (después del bloque de pg_cron o del plan preventivo inicial).
--
-- QUÉ HACE
--  - Cada turno parte un viernes a las 14:30. El administrador puede fijar a quién le toca el turno de
--    cualquier viernes (actual o futuro). Esa asignación manda sobre la rotación automática.
--  - Si quita la asignación manual, ese turno vuelve a la rotación automática.
--  - Se puede asignar a cualquier técnico activo, aunque no esté en la rotación (por ejemplo, un reemplazo).
--  - Las incidencias y rondas de luminarias ya creadas no cambian de técnico; el cambio vale para las nuevas.

-- ---------- tabla ----------
-- 'viernes' es el viernes en que parte el turno (el mismo valor que usa ot_turno_inicio).
create table if not exists public.turnos_manual (
  viernes date primary key check (extract(isodow from viernes) = 5),
  trabajador_id uuid not null references public.usuarios(id) on delete cascade,
  creado timestamptz not null default now()
);
alter table public.turnos_manual enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.turnos_manual from anon, authenticated;
  end if;
end $$;

-- ---------- quién tiene el turno: la asignación manual manda sobre la rotación ----------
create or replace function public.ot_turno_de(p_inicio date) returns uuid
language plpgsql stable security definer set search_path = public, extensions as $$
declare ids uuid[]; ancla date; n int; idx int; m uuid;
begin
  select tm.trabajador_id into m
    from public.turnos_manual tm join public.usuarios u on u.id = tm.trabajador_id
   where tm.viernes = p_inicio and u.activo and u.rol = 'trabajador';
  if m is not null then return m; end if;

  ids := array(select id from public.usuarios where turno_orden is not null and rol = 'trabajador' and activo order by turno_orden, nombre);
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then return null; end if;
  select valor::date into ancla from public.ajustes where clave = 'turno_ancla';
  idx := (p_inicio - coalesce(ancla, p_inicio)) / 7;      -- semanas desde el ancla; negativo = turnos anteriores
  return ids[1 + ((idx % n) + n) % n];
end $$;

-- ---------- funciones para el administrador ----------

-- Fija a quién le toca el turno que parte el viernes dado.
create or replace function public.ot_turno_asignar(p_token text, p_inicio date, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  if p_inicio is null or extract(isodow from p_inicio) <> 5 then
    raise exception 'Cada turno parte un viernes. Elige un viernes en el calendario.';
  end if;
  if p_inicio < public.ot_turno_inicio((now() at time zone 'America/Santiago')::timestamp) then
    raise exception 'No se pueden cambiar turnos que ya terminaron.';
  end if;
  if not exists (select 1 from public.usuarios where id = p_id and rol = 'trabajador' and activo) then
    raise exception 'Elige a un técnico activo.';
  end if;
  insert into public.turnos_manual(viernes, trabajador_id) values (p_inicio, p_id)
    on conflict (viernes) do update set trabajador_id = excluded.trabajador_id, creado = now();
end $$;

-- Quita la asignación manual: ese turno vuelve a la rotación automática.
create or replace function public.ot_turno_quitar(p_token text, p_inicio date) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  if p_inicio < public.ot_turno_inicio((now() at time zone 'America/Santiago')::timestamp) then
    raise exception 'No se pueden cambiar turnos que ya terminaron.';
  end if;
  delete from public.turnos_manual where viernes = p_inicio;
end $$;

-- ---------- el centro de control puede elegir al técnico de turno aunque no esté en la rotación ----------
create or replace function public.ot_incidencia_crear(p_token text, p_trabajador uuid, p_descripcion text, p_ubicacion text) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios; n int; d text := trim(coalesce(p_descripcion,''));
begin
  u := public.ot_quien(p_token);
  if u.rol <> 'control' then raise exception 'Solo el centro de control puede crear incidencias.'; end if;
  if not u.sin_horario and not public.ot_fuera_horario() then
    raise exception 'Las incidencias solo se pueden crear fuera del horario laboral (lunes a jueves de 8:30 a 18:30, viernes de 8:30 a 14:30, sin contar feriados).';
  end if;
  if not exists (select 1 from public.usuarios
                  where id = p_trabajador and rol = 'trabajador' and activo
                    and (turno_orden is not null or id = public.ot_turno_actual())) then
    raise exception 'Elige a un técnico activo que haga turnos de emergencia.';
  end if;
  if length(d) = 0 then raise exception 'Describe lo que está pasando.'; end if;
  insert into public.ordenes(tipo, creada_por, trabajador_id, titulo, detalle, ubicacion, prioridad)
    values ('incidencia', u.id, p_trabajador, case when length(d) > 80 then left(d, 77) || '…' else d end, d,
            trim(coalesce(p_ubicacion,'')), 'Urgente')
    returning numero into n;
  return n;
end $$;

-- ---------- listado: agrega 'turnos_calendario' (26 semanas desde el turno vigente) ----------
-- Cada elemento: inicio (viernes), hasta (viernes siguiente), tecnico_id, tecnico y manual (true si se fijó a mano).
-- La clave 'turnos' (6 semanas) se mantiene igual para no romper la página actual.
create or replace function public.ot_listar(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios; ords jsonb; trabs jsonb := '[]'::jsonb; plan jsonb := '[]'::jsonb; fers jsonb := '[]'::jsonb;
  turnos jsonb := '[]'::jsonb; cal jsonb := '[]'::jsonb; actual uuid := public.ot_turno_actual();
  inicio date := public.ot_turno_inicio((now() at time zone 'America/Santiago')::timestamp);
begin
  u := public.ot_quien(p_token);
  perform public.ot_generar_plan();
  perform public.ot_generar_rondas();
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'numero', o.numero, 'tipo', o.tipo, 'creada_por', c.nombre,
      'trabajador_id', o.trabajador_id, 'trabajador', t.nombre,
      'telefono', case when u.rol in ('admin','control') and o.tipo = 'incidencia' then t.telefono end,
      'actividad', o.actividad, 'cantidad', o.cantidad, 'unidad', o.unidad, 'origen', o.origen, 'titulo', o.titulo, 'detalle', o.detalle, 'ubicacion', o.ubicacion, 'prioridad', o.prioridad,
      'fecha_limite', o.fecha_limite, 'estado', o.estado, 'creada', o.creada, 'aceptada', o.aceptada,
      'codigo_actividad', o.codigo_actividad, 'descripcion_realizada', o.descripcion_realizada,
      'tiene_foto', o.foto is not null, 'tiene_foto2', o.foto2 is not null, 'enviado', o.enviado,
      'nota_devolucion', o.nota_devolucion, 'nota_cierre', o.nota_cierre, 'cerrada', o.cerrada)
    order by o.creada desc), '[]'::jsonb)
    into ords
    from public.ordenes o join public.usuarios t on t.id = o.trabajador_id
    left join public.usuarios c on c.id = o.creada_por
   where u.rol = 'admin' or (u.rol = 'control' and o.tipo = 'incidencia') or o.trabajador_id = u.id;
  if u.rol = 'admin' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'usuario', usuario, 'nombre', nombre, 'activo', activo,
      'rol', rol, 'de_turno', id = actual, 'en_turnos', turno_orden is not null, 'telefono', telefono, 'sin_horario', sin_horario, 'sin_clave', clave is null, 'debe_cambiar', debe_cambiar)
      order by rol desc, nombre), '[]'::jsonb) into trabs from public.usuarios where rol in ('trabajador','control');
    select coalesce(jsonb_agg(jsonb_build_object('id', pl.id, 'fecha', pl.fecha, 'tecnico', t.nombre,
      'actividad', pl.actividad, 'cantidad', pl.cantidad, 'unidad', pl.unidad)
      order by pl.fecha, t.nombre, pl.actividad), '[]'::jsonb) into plan
      from public.plan_preventivo pl join public.usuarios t on t.id = pl.trabajador_id where pl.generada is null;
    select coalesce(jsonb_agg(jsonb_build_object('desde', inicio + 7 * i, 'hasta', inicio + 7 * i + 7,
      'tecnico', (select nombre from public.usuarios where id = public.ot_turno_de(inicio + 7 * i))) order by i), '[]'::jsonb)
      into turnos from generate_series(0, 5) as i;
    select coalesce(jsonb_agg(jsonb_build_object('inicio', inicio + 7 * i, 'hasta', inicio + 7 * i + 7,
      'tecnico_id', public.ot_turno_de(inicio + 7 * i),
      'tecnico', (select nombre from public.usuarios where id = public.ot_turno_de(inicio + 7 * i)),
      'manual', exists (select 1 from public.turnos_manual tm join public.usuarios uu on uu.id = tm.trabajador_id
                         where tm.viernes = inicio + 7 * i and uu.activo and uu.rol = 'trabajador')) order by i), '[]'::jsonb)
      into cal from generate_series(0, 25) as i;
    select coalesce(jsonb_agg(jsonb_build_object('fecha', fecha, 'nombre', nombre) order by fecha), '[]'::jsonb) into fers
      from public.feriados where fecha >= (now() at time zone 'America/Santiago')::date;
  elsif u.rol = 'control' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'activo', true, 'rol', rol, 'de_turno', id = actual, 'telefono', telefono)
      order by nombre), '[]'::jsonb) into trabs from public.usuarios
     where rol = 'trabajador' and activo and (turno_orden is not null or id = actual);
  end if;
  return jsonb_build_object('ordenes', ords, 'trabajadores', trabs, 'plan', plan, 'feriados', fers, 'turnos', turnos,
    'turnos_calendario', cal,
    'fuera_horario', public.ot_fuera_horario() or (u.rol = 'control' and u.sin_horario), 'sin_horario', u.sin_horario);
end $$;

-- ---------- permisos de las funciones nuevas (la página las llama con la clave pública) ----------
do $$
begin
  revoke all on function public.ot_turno_asignar(text, date, uuid) from public;
  revoke all on function public.ot_turno_quitar(text, date) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.ot_turno_asignar(text, date, uuid) to anon, authenticated;
    grant execute on function public.ot_turno_quitar(text, date) to anon, authenticated;
  end if;
end $$;
