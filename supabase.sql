-- Órdenes de Trabajo · Ruta de la Fruta
-- Pega este archivo completo en Supabase > SQL Editor y ejecútalo una vez.
-- Se puede volver a ejecutar sin perder datos.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  usuario text not null unique,
  nombre text not null,
  clave text,
  rol text not null check (rol in ('admin','trabajador')),
  activo boolean not null default true,
  fallos int not null default 0,
  bloqueado_hasta timestamptz,
  debe_cambiar boolean not null default false,
  creado timestamptz not null default now()
);

create table if not exists public.sesiones (
  token text primary key,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  expira timestamptz not null
);

create table if not exists public.ordenes (
  id uuid primary key default gen_random_uuid(),
  numero serial,
  trabajador_id uuid not null references public.usuarios(id),
  titulo text not null,
  detalle text not null,
  ubicacion text not null default '',
  prioridad text not null default 'Normal',
  fecha_limite date,
  estado text not null default 'asignada' check (estado in ('asignada','revision','devuelta','cerrada')),
  creada timestamptz not null default now(),
  codigo_actividad text,
  descripcion_realizada text,
  foto text,
  enviado timestamptz,
  nota_devolucion text,
  nota_cierre text,
  cerrada timestamptz
);

alter table public.usuarios alter column clave drop not null;
alter table public.usuarios add column if not exists debe_cambiar boolean not null default false;
alter table public.usuarios add column if not exists de_turno boolean not null default false; -- técnico de turno fuera de horario
alter table public.usuarios add column if not exists telefono text; -- para avisar por WhatsApp; se escribe desde la página, no en este archivo
alter table public.usuarios add column if not exists turno_orden int; -- posición en la rotación de turnos de emergencia (vacío = no hace turnos)
alter table public.usuarios add column if not exists sin_horario boolean not null default false; -- centro de control que puede crear incidencias a cualquier hora (pruebas)
-- Roles: admin, trabajador (técnico de terreno) y control (centro de control).
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check check (rol in ('admin','trabajador','control'));
alter table public.ordenes add column if not exists tipo text not null default 'ot'; -- 'ot' o 'incidencia'
alter table public.ordenes add column if not exists creada_por uuid references public.usuarios(id);
alter table public.ordenes add column if not exists actividad text; -- código de actividad que asigna el administrador
alter table public.ordenes add column if not exists cantidad numeric; -- cantidad programada para ese día
alter table public.ordenes add column if not exists unidad text;
alter table public.ordenes add column if not exists origen text not null default 'manual'; -- 'manual', 'plan' o 'ronda'

-- Ajustes generales. 'turno_ancla' es el viernes en que parte la rotación con el primer técnico.
create table if not exists public.ajustes (
  clave text primary key,
  valor text not null
);
alter table public.ajustes enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.ajustes from anon, authenticated;
  end if;
end $$;
-- Rotación inicial: Luis Jiménez cubre desde ya y el turno que parte el viernes 13-11-2026 a las 14:30;
-- Ricardo Díaz toma el del viernes 20-11-2026, y así se van alternando cada semana.
insert into public.ajustes(clave, valor) values ('turno_ancla', '2026-11-13') on conflict (clave) do nothing;

-- Feriados: esos días completos cuentan como fuera del horario laboral.
create table if not exists public.feriados (
  fecha date primary key,
  nombre text not null default ''
);
alter table public.feriados enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.feriados from anon, authenticated;
  end if;
end $$;
-- Feriados nacionales que quedan en 2026. Los de 2027 en adelante los agrega el administrador desde la página.
insert into public.feriados(fecha, nombre) values
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad')
on conflict (fecha) do nothing;

-- Plan de mantenimiento preventivo: una fila por día, técnico y actividad.
-- Cuando llega la fecha, la fila se convierte sola en una orden de trabajo.
create table if not exists public.plan_preventivo (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  trabajador_id uuid not null references public.usuarios(id),
  actividad text not null,
  titulo text not null,
  cantidad numeric not null check (cantidad > 0),
  unidad text not null default 'UN',
  generada timestamptz,
  creado timestamptz not null default now(),
  unique (fecha, trabajador_id, actividad)
);
alter table public.plan_preventivo enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.plan_preventivo from anon, authenticated;
  end if;
end $$;

-- Ronda de luminarias: una OT automática por día para el técnico de turno de emergencia.
-- Esta tabla recuerda qué días ya tienen su ronda, para no repetirla.
create table if not exists public.rondas (
  fecha date primary key,
  orden_id uuid references public.ordenes(id) on delete set null,
  generada timestamptz not null default now()
);
alter table public.rondas enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.rondas from anon, authenticated;
  end if;
end $$;
-- Las rondas se generan desde el momento en que se instala esta función (no se crean rondas de días pasados).
insert into public.ajustes(clave, valor)
  values ('ronda_desde', to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI:SS'))
  on conflict (clave) do nothing;

-- Cuentas iniciales, sin contraseña. El administrador crea la suya al entrar por primera vez
-- y entrega a cada técnico una clave temporal desde su panel.
insert into public.usuarios(usuario, nombre, rol, debe_cambiar) values
  ('admin', 'Administrador', 'admin', true),
  ('ricardo.diaz', 'Ricardo Díaz', 'trabajador', true),
  ('luis.jimenez', 'Luis Jiménez', 'trabajador', true),
  ('manuel.pacheco', 'Manuel Pacheco', 'trabajador', true)
on conflict (usuario) do nothing;
-- Rotación de turnos de emergencia: Luis Jiménez y Ricardo Díaz. Manuel Pacheco aún no hace turnos.
do $$
begin
  if not exists (select 1 from public.usuarios where turno_orden is not null) then
    update public.usuarios set turno_orden = 1 where usuario = 'luis.jimenez';
    update public.usuarios set turno_orden = 2 where usuario = 'ricardo.diaz';
  end if;
end $$;

-- Nadie lee ni escribe las tablas directamente: todo pasa por las funciones de abajo.
alter table public.usuarios enable row level security;
alter table public.sesiones enable row level security;
alter table public.ordenes enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.usuarios, public.sesiones, public.ordenes from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.usuarios, public.sesiones, public.ordenes from authenticated;
  end if;
end $$;

-- ---------- funciones internas ----------

create or replace function public.ot_sesion(p_token text) returns public.usuarios
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  select us.* into u from public.sesiones s join public.usuarios us on us.id = s.usuario_id
   where s.token = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
     and s.expira > now() and us.activo;
  if not found then
    raise exception 'Tu sesión venció. Vuelve a ingresar.' using errcode = 'OT401';
  end if;
  return u;
end $$;

create or replace function public.ot_quien(p_token text) returns public.usuarios
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  u := public.ot_sesion(p_token);
  if u.debe_cambiar then
    raise exception 'Antes de continuar debes crear tu contraseña nueva.' using errcode = 'OT402';
  end if;
  return u;
end $$;

create or replace function public.ot_admin(p_token text) returns public.usuarios
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  u := public.ot_quien(p_token);
  if u.rol <> 'admin' then raise exception 'Solo el administrador puede hacer esto.'; end if;
  return u;
end $$;

create or replace function public.ot_abrir_sesion(p_usuario_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t text; u public.usuarios;
begin
  t := encode(gen_random_bytes(32), 'hex');
  delete from public.sesiones where expira < now();
  insert into public.sesiones(token, usuario_id, expira)
    values (encode(digest(t, 'sha256'), 'hex'), p_usuario_id, now() + interval '30 days');
  select * into u from public.usuarios where id = p_usuario_id;
  return jsonb_build_object('ok', true, 'token', t,
    'usuario', jsonb_build_object('id', u.id, 'usuario', u.usuario, 'nombre', u.nombre, 'rol', u.rol, 'debe_cambiar', u.debe_cambiar));
end $$;

create or replace function public.ot_validar(p_usuario text, p_nombre text, p_clave text) returns text
language plpgsql immutable as $$
declare v text := lower(trim(coalesce(p_usuario,'')));
begin
  if v !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'El usuario debe tener entre 3 y 30 caracteres: letras, números, punto o guion.';
  end if;
  if length(trim(coalesce(p_nombre,''))) < 2 then raise exception 'Escribe el nombre de la persona.'; end if;
  if length(coalesce(p_clave,'')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres.'; end if;
  return v;
end $$;

-- ---------- acceso ----------

create or replace function public.ot_estado() returns jsonb
language sql security definer set search_path = public, extensions as $$
  select jsonb_build_object('admin_pendiente',
    exists (select 1 from public.usuarios where rol = 'admin' and clave is null));
$$;

-- Primer ingreso del administrador: crea su contraseña. Solo funciona mientras no tenga una.
create or replace function public.ot_activar_admin(p_clave text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare a uuid;
begin
  lock table public.usuarios in exclusive mode;
  select id into a from public.usuarios where rol = 'admin' and clave is null order by creado limit 1;
  if not found then raise exception 'El administrador ya tiene contraseña. Ingresa con tu usuario.'; end if;
  if length(coalesce(p_clave,'')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres.'; end if;
  update public.usuarios set clave = crypt(p_clave, gen_salt('bf')), debe_cambiar = false where id = a;
  return public.ot_abrir_sesion(a);
end $$;

create or replace function public.ot_login(p_usuario text, p_clave text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  select * into u from public.usuarios where usuario = lower(trim(coalesce(p_usuario,'')));
  if not found or not u.activo then
    return jsonb_build_object('ok', false, 'error', 'Usuario o contraseña incorrectos.');
  end if;
  if u.clave is null then
    return jsonb_build_object('ok', false, 'error', 'Tu cuenta aún no tiene contraseña. Pide al administrador una clave temporal.');
  end if;
  if u.bloqueado_hasta is not null and u.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos fallidos. Espera 10 minutos e intenta otra vez.');
  end if;
  if u.clave <> crypt(coalesce(p_clave,''), u.clave) then
    update public.usuarios set fallos = fallos + 1,
      bloqueado_hasta = case when fallos + 1 >= 8 then now() + interval '10 minutes' else null end
      where id = u.id;
    return jsonb_build_object('ok', false, 'error', 'Usuario o contraseña incorrectos.');
  end if;
  update public.usuarios set fallos = 0, bloqueado_hasta = null where id = u.id;
  return public.ot_abrir_sesion(u.id);
end $$;

create or replace function public.ot_yo(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  u := public.ot_sesion(p_token);
  return jsonb_build_object('id', u.id, 'usuario', u.usuario, 'nombre', u.nombre, 'rol', u.rol, 'debe_cambiar', u.debe_cambiar);
end $$;

create or replace function public.ot_salir(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from public.sesiones where token = encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
$$;

create or replace function public.ot_cambiar_mi_clave(p_token text, p_actual text, p_nueva text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  u := public.ot_sesion(p_token);
  if u.clave <> crypt(coalesce(p_actual,''), u.clave) then raise exception 'La contraseña actual no es correcta.'; end if;
  if length(coalesce(p_nueva,'')) < 8 then raise exception 'La contraseña nueva debe tener al menos 8 caracteres.'; end if;
  if p_nueva = p_actual then raise exception 'La contraseña nueva debe ser distinta de la actual.'; end if;
  update public.usuarios set clave = crypt(p_nueva, gen_salt('bf')), debe_cambiar = false where id = u.id;
end $$;

-- ---------- equipo (solo administrador) ----------

drop function if exists public.ot_crear_trabajador(text, text, text, text);
create or replace function public.ot_crear_trabajador(p_token text, p_usuario text, p_nombre text, p_clave text, p_rol text default 'trabajador') returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  perform public.ot_admin(p_token);
  if p_rol not in ('trabajador','control') then raise exception 'El rol debe ser técnico o centro de control.'; end if;
  v := public.ot_validar(p_usuario, p_nombre, p_clave);
  if exists (select 1 from public.usuarios where usuario = v) then
    raise exception 'El usuario "%" ya existe. Elige otro.', v;
  end if;
  insert into public.usuarios(usuario, nombre, clave, rol, debe_cambiar)
    values (v, trim(p_nombre), crypt(p_clave, gen_salt('bf')), p_rol, true);
end $$;

create or replace function public.ot_clave_trabajador(p_token text, p_id uuid, p_clave text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  if length(coalesce(p_clave,'')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres.'; end if;
  update public.usuarios set clave = crypt(p_clave, gen_salt('bf')), fallos = 0, bloqueado_hasta = null, debe_cambiar = true
    where id = p_id and rol in ('trabajador','control');
  if not found then raise exception 'No se encontró al usuario.'; end if;
  delete from public.sesiones where usuario_id = p_id;
end $$;

create or replace function public.ot_activar_trabajador(p_token text, p_id uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  update public.usuarios set activo = p_activo where id = p_id and rol in ('trabajador','control');
  if not found then raise exception 'No se encontró al usuario.'; end if;
  if not p_activo then delete from public.sesiones where usuario_id = p_id; end if;
end $$;

-- ---------- turnos de emergencia ----------
-- Cada turno parte el viernes a las 14:30 (hora de Chile) y dura hasta el viernes siguiente a las 8:29:59.

-- Fecha del viernes en que partió el turno vigente en el momento dado.
create or replace function public.ot_turno_inicio(p_t timestamp) returns date
language plpgsql immutable as $$
declare d date := p_t::date; atras int := (extract(isodow from p_t)::int - 5 + 7) % 7;
begin
  if atras = 0 and p_t::time < time '14:30' then atras := 7; end if;
  return d - atras;
end $$;

-- Técnico al que le toca el turno que parte el viernes dado.
create or replace function public.ot_turno_de(p_inicio date) returns uuid
language plpgsql stable security definer set search_path = public, extensions as $$
declare ids uuid[]; ancla date; n int; idx int;
begin
  ids := array(select id from public.usuarios where turno_orden is not null and rol = 'trabajador' and activo order by turno_orden, nombre);
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then return null; end if;
  select valor::date into ancla from public.ajustes where clave = 'turno_ancla';
  idx := greatest((p_inicio - coalesce(ancla, p_inicio)) / 7, 0);
  return ids[1 + idx % n];
end $$;

create or replace function public.ot_turno_actual() returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select public.ot_turno_de(public.ot_turno_inicio((now() at time zone 'America/Santiago')::timestamp));
$$;

-- Incluye o saca a un técnico de la rotación de turnos.
create or replace function public.ot_turno(p_token text, p_id uuid, p_turno boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  if coalesce(p_turno, false) then
    update public.usuarios set turno_orden = coalesce((select max(turno_orden) from public.usuarios), 0) + 1
     where id = p_id and rol = 'trabajador' and turno_orden is null;
  else
    update public.usuarios set turno_orden = null where id = p_id and rol = 'trabajador';
  end if;
end $$;

-- Deja a un técnico de la rotación como el que está de turno ahora; los siguientes turnos se corren desde ahí.
create or replace function public.ot_turno_fijar(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare ids uuid[]; pos int; inicio date;
begin
  perform public.ot_admin(p_token);
  ids := array(select id from public.usuarios where turno_orden is not null and rol = 'trabajador' and activo order by turno_orden, nombre);
  pos := array_position(ids, p_id);
  if pos is null then raise exception 'Ese técnico no está en la rotación de turnos. Inclúyelo primero.'; end if;
  inicio := public.ot_turno_inicio((now() at time zone 'America/Santiago')::timestamp);
  insert into public.ajustes(clave, valor) values ('turno_ancla', (inicio - 7 * (pos - 1))::text)
    on conflict (clave) do update set valor = excluded.valor;
end $$;

create or replace function public.ot_telefono(p_token text, p_id uuid, p_telefono text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare t text := regexp_replace(coalesce(p_telefono,''), '[^0-9+]', '', 'g');
begin
  perform public.ot_admin(p_token);
  if length(trim(coalesce(p_telefono,''))) > 0 and t !~ '^\+?[0-9]{8,15}$' then raise exception 'Escribe el teléfono con código de país, por ejemplo +56912345678.'; end if;
  update public.usuarios set telefono = nullif(t, '') where id = p_id and rol in ('trabajador','control');
  if not found then raise exception 'No se encontró al usuario.'; end if;
end $$;

-- Permite o impide que un usuario de centro de control cree incidencias a cualquier hora (para pruebas).
create or replace function public.ot_sin_horario(p_token text, p_id uuid, p_valor boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  update public.usuarios set sin_horario = coalesce(p_valor, false) where id = p_id and rol = 'control';
  if not found then raise exception 'No se encontró al usuario de centro de control.'; end if;
end $$;

-- ---------- incidencias fuera de horario (centro de control) ----------

-- Horario laboral, hora de Chile: lunes a jueves de 8:30 a 18:30, viernes de 8:30 a 14:30.
-- Sábados, domingos y feriados cuentan completos como fuera de horario.
create or replace function public.ot_fuera_horario() returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare ahora timestamp := now() at time zone 'America/Santiago'; d int := extract(isodow from ahora); h time := ahora::time;
begin
  if exists (select 1 from public.feriados where fecha = ahora::date) then return true; end if;
  if d between 1 and 4 then return h < time '08:30' or h >= time '18:30'; end if;
  if d = 5 then return h < time '08:30' or h >= time '14:30'; end if;
  return true;
end $$;

create or replace function public.ot_incidencia_crear(p_token text, p_trabajador uuid, p_descripcion text, p_ubicacion text) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios; n int; d text := trim(coalesce(p_descripcion,''));
begin
  u := public.ot_quien(p_token);
  if u.rol <> 'control' then raise exception 'Solo el centro de control puede crear incidencias.'; end if;
  if not u.sin_horario and not public.ot_fuera_horario() then
    raise exception 'Las incidencias solo se pueden crear fuera del horario laboral (lunes a jueves de 8:30 a 18:30, viernes de 8:30 a 14:30, sin contar feriados).';
  end if;
  if not exists (select 1 from public.usuarios where id = p_trabajador and rol = 'trabajador' and activo and turno_orden is not null) then
    raise exception 'Elige a un técnico activo que haga turnos de emergencia.';
  end if;
  if length(d) = 0 then raise exception 'Describe lo que está pasando.'; end if;
  insert into public.ordenes(tipo, creada_por, trabajador_id, titulo, detalle, ubicacion, prioridad)
    values ('incidencia', u.id, p_trabajador, case when length(d) > 80 then left(d, 77) || '…' else d end, d,
            trim(coalesce(p_ubicacion,'')), 'Urgente')
    returning numero into n;
  return n;
end $$;

create or replace function public.ot_feriado_agregar(p_token text, p_fecha date, p_nombre text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  if p_fecha is null then raise exception 'Elige la fecha del feriado.'; end if;
  insert into public.feriados(fecha, nombre) values (p_fecha, trim(coalesce(p_nombre,'')))
    on conflict (fecha) do update set nombre = excluded.nombre;
end $$;

create or replace function public.ot_feriado_quitar(p_token text, p_fecha date) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  delete from public.feriados where fecha = p_fecha;
end $$;

-- ---------- ronda de luminarias ----------

-- Crea la OT "Ronda de luminarias" para el técnico de turno de emergencia, una por día (hora de Chile):
--   lunes a jueves a las 18:30 y viernes a las 14:30 (hora de salida del horario laboral);
--   sábados, domingos y feriados a las 8:30.
-- Se ejecuta sola cada vez que alguien abre o actualiza la página y, si el proyecto tiene pg_cron, cada 5 minutos.
create or replace function public.ot_generar_rondas() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare ahora timestamp := now() at time zone 'America/Santiago'; desde timestamp; d date; momento timestamp;
  libre boolean; tec uuid; oid uuid; c int; n int := 0;
begin
  select valor::timestamp into desde from public.ajustes where clave = 'ronda_desde';
  if desde is null then return 0; end if;
  for d in select g::date from generate_series(greatest(desde::date, ahora::date - 7)::timestamp, ahora::date::timestamp, interval '1 day') g loop
    libre := extract(isodow from d) >= 6 or exists (select 1 from public.feriados where fecha = d);
    momento := d + case when libre then time '08:30' when extract(isodow from d) = 5 then time '14:30' else time '18:30' end;
    continue when momento > ahora or momento < desde;
    continue when exists (select 1 from public.rondas where fecha = d);
    tec := public.ot_turno_de(public.ot_turno_inicio(momento));   -- quien estaba de turno a esa hora
    continue when tec is null;
    insert into public.rondas(fecha) values (d) on conflict (fecha) do nothing;
    get diagnostics c = row_count;
    continue when c = 0;
    insert into public.ordenes(trabajador_id, titulo, detalle, prioridad, fecha_limite, origen)
      values (tec, 'Ronda de luminarias',
        'Ronda de luminarias a cargo del técnico de turno de emergencia. Generada automáticamente el ' ||
        to_char(momento, 'DD-MM-YYYY') || ' a las ' || to_char(momento, 'HH24:MI') || '.',
        'Normal', d, 'ronda')
      returning id into oid;
    update public.rondas set orden_id = oid where fecha = d;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- plan preventivo ----------

-- Convierte en órdenes de trabajo las filas del plan cuya fecha ya llegó (hora de Chile).
-- Se ejecuta sola cada vez que alguien abre o actualiza la página.
create or replace function public.ot_generar_plan() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare p record; n int := 0; hoy date := (now() at time zone 'America/Santiago')::date; cant text;
begin
  for p in select pl.* from public.plan_preventivo pl join public.usuarios u on u.id = pl.trabajador_id
            where pl.generada is null and pl.fecha <= hoy and u.activo
            order by pl.fecha, pl.actividad
            for update of pl skip locked loop
    cant := case when p.cantidad = trunc(p.cantidad) then trunc(p.cantidad)::bigint::text else p.cantidad::text end;
    insert into public.ordenes(trabajador_id, actividad, titulo, detalle, prioridad, fecha_limite, cantidad, unidad, origen)
      values (p.trabajador_id, p.actividad, p.titulo,
        'Mantenimiento preventivo programado, semana ' || to_char(p.fecha, 'IW') ||
        '. Cantidad programada para este día: ' || cant || ' ' || p.unidad || '.',
        'Normal', p.fecha, p.cantidad, p.unidad, 'plan');
    update public.plan_preventivo set generada = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.ot_plan_cargar(p_token text, p_filas jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare f jsonb; n int := 0;
begin
  perform public.ot_admin(p_token);
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then raise exception 'El calendario no trae actividades.'; end if;
  if jsonb_array_length(p_filas) > 1000 then raise exception 'El calendario trae demasiadas filas. Cárgalo por partes.'; end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    if not exists (select 1 from public.usuarios where id = (f->>'trabajador_id')::uuid and rol = 'trabajador') then
      raise exception 'El calendario nombra a un técnico que no existe en Equipo.';
    end if;
    if coalesce((f->>'cantidad')::numeric, 0) <= 0 or length(trim(coalesce(f->>'actividad',''))) = 0 then
      raise exception 'Hay una fila del calendario sin actividad o sin cantidad.';
    end if;
    insert into public.plan_preventivo(fecha, trabajador_id, actividad, titulo, cantidad, unidad)
      values ((f->>'fecha')::date, (f->>'trabajador_id')::uuid, trim(f->>'actividad'),
              coalesce(nullif(trim(f->>'titulo'),''), trim(f->>'actividad')), (f->>'cantidad')::numeric,
              coalesce(nullif(trim(f->>'unidad'),''), 'UN'))
      on conflict (fecha, trabajador_id, actividad) do update
        set cantidad = excluded.cantidad, titulo = excluded.titulo, unidad = excluded.unidad
        where public.plan_preventivo.generada is null;
    n := n + 1;
  end loop;
  perform public.ot_generar_plan();
  return n;
end $$;

create or replace function public.ot_plan_eliminar(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  delete from public.plan_preventivo where id = p_id and generada is null;
  if not found then raise exception 'Esa actividad ya se convirtió en orden de trabajo o no existe.'; end if;
end $$;

-- ---------- órdenes ----------

create or replace function public.ot_listar(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios; ords jsonb; trabs jsonb := '[]'::jsonb; plan jsonb := '[]'::jsonb; fers jsonb := '[]'::jsonb;
  turnos jsonb := '[]'::jsonb; actual uuid := public.ot_turno_actual();
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
      'fecha_limite', o.fecha_limite, 'estado', o.estado, 'creada', o.creada,
      'codigo_actividad', o.codigo_actividad, 'descripcion_realizada', o.descripcion_realizada,
      'tiene_foto', o.foto is not null, 'enviado', o.enviado,
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
    select coalesce(jsonb_agg(jsonb_build_object('fecha', fecha, 'nombre', nombre) order by fecha), '[]'::jsonb) into fers
      from public.feriados where fecha >= (now() at time zone 'America/Santiago')::date;
  elsif u.rol = 'control' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'activo', true, 'rol', rol, 'de_turno', id = actual, 'telefono', telefono)
      order by nombre), '[]'::jsonb) into trabs from public.usuarios where rol = 'trabajador' and activo and turno_orden is not null;
  end if;
  return jsonb_build_object('ordenes', ords, 'trabajadores', trabs, 'plan', plan, 'feriados', fers, 'turnos', turnos,
    'fuera_horario', public.ot_fuera_horario() or (u.rol = 'control' and u.sin_horario), 'sin_horario', u.sin_horario);
end $$;

create or replace function public.ot_foto(p_token text, p_ot uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios; f text;
begin
  u := public.ot_quien(p_token);
  select foto into f from public.ordenes
   where id = p_ot and (u.rol = 'admin' or trabajador_id = u.id or (u.rol = 'control' and tipo = 'incidencia'));
  return f;
end $$;

drop function if exists public.ot_crear(text, uuid, text, text, text, text, date);
create or replace function public.ot_crear(p_token text, p_trabajador uuid, p_actividad text, p_titulo text, p_detalle text,
  p_ubicacion text, p_prioridad text, p_fecha date) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform public.ot_admin(p_token);
  if not exists (select 1 from public.usuarios where id = p_trabajador and rol = 'trabajador' and activo) then
    raise exception 'Elige un trabajador activo.';
  end if;
  if length(trim(coalesce(p_actividad,''))) = 0 then raise exception 'Elige el código de actividad.'; end if;
  if length(trim(coalesce(p_titulo,''))) = 0 or length(trim(coalesce(p_detalle,''))) = 0 then
    raise exception 'Completa el título y el detalle del trabajo.';
  end if;
  insert into public.ordenes(trabajador_id, actividad, titulo, detalle, ubicacion, prioridad, fecha_limite)
    values (p_trabajador, trim(p_actividad), trim(p_titulo), trim(p_detalle), trim(coalesce(p_ubicacion,'')),
            case when p_prioridad in ('Normal','Alta','Urgente') then p_prioridad else 'Normal' end, p_fecha)
    returning numero into n;
  return n;
end $$;

create or replace function public.ot_reportar(p_token text, p_ot uuid, p_codigo text, p_descripcion text, p_foto text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios; o public.ordenes;
begin
  u := public.ot_quien(p_token);
  select * into o from public.ordenes where id = p_ot and trabajador_id = u.id;
  if not found then raise exception 'Esta orden no está asignada a ti.'; end if;
  if o.estado not in ('asignada','devuelta') then raise exception 'Esta orden ya fue enviada o cerrada.'; end if;
  if p_foto is not null and (p_foto !~ '^data:image/jpeg;base64,' or length(p_foto) > 700000) then
    raise exception 'La foto no es válida o es demasiado grande.';
  end if;
  if o.tipo = 'incidencia' then
    -- Una incidencia no lleva código de actividad ni exige foto: el reporte del técnico la cierra.
    if length(trim(coalesce(p_descripcion,''))) = 0 then raise exception 'Describe cómo se resolvió la incidencia.'; end if;
    update public.ordenes set descripcion_realizada = trim(p_descripcion), foto = coalesce(p_foto, foto),
      enviado = now(), estado = 'cerrada', cerrada = now(), nota_cierre = null where id = p_ot;
    return;
  end if;
  if length(trim(coalesce(p_codigo,''))) = 0 or length(trim(coalesce(p_descripcion,''))) = 0 then
    raise exception 'Completa el código de actividad y la descripción.';
  end if;
  if p_foto is null and o.foto is null then raise exception 'Agrega una foto del trabajo antes de enviar.'; end if;
  if p_foto is not null and (p_foto !~ '^data:image/jpeg;base64,' or length(p_foto) > 700000) then
    raise exception 'La foto no es válida o es demasiado grande.';
  end if;
  update public.ordenes set codigo_actividad = trim(p_codigo), descripcion_realizada = trim(p_descripcion),
    foto = coalesce(p_foto, foto), enviado = now(), estado = 'revision' where id = p_ot;
end $$;

create or replace function public.ot_cerrar(p_token text, p_ot uuid, p_nota text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  update public.ordenes set estado = 'cerrada', cerrada = now(), nota_cierre = trim(coalesce(p_nota,''))
    where id = p_ot and estado = 'revision';
  if not found then raise exception 'Solo se puede cerrar una orden con reporte enviado.'; end if;
end $$;

create or replace function public.ot_devolver(p_token text, p_ot uuid, p_nota text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  if length(trim(coalesce(p_nota,''))) = 0 then raise exception 'Escribe en la nota qué debe corregir el trabajador.'; end if;
  update public.ordenes set estado = 'devuelta', nota_devolucion = trim(p_nota)
    where id = p_ot and estado = 'revision';
  if not found then raise exception 'Solo se puede devolver una orden con reporte enviado.'; end if;
end $$;

create or replace function public.ot_reabrir(p_token text, p_ot uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  update public.ordenes set
      estado = case when tipo = 'incidencia' then 'devuelta' else 'revision' end,
      nota_devolucion = case when tipo = 'incidencia' then 'Reabierta por el administrador.' else nota_devolucion end,
      cerrada = null, nota_cierre = null
    where id = p_ot and estado = 'cerrada';
  if not found then raise exception 'La orden no está cerrada.'; end if;
end $$;

create or replace function public.ot_eliminar(p_token text, p_ot uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  delete from public.ordenes where id = p_ot;
end $$;

-- ---------- permisos de las funciones ----------
do $$
declare f record; internas text[] := array['ot_sesion','ot_quien','ot_admin','ot_abrir_sesion','ot_validar','ot_generar_plan','ot_generar_rondas','ot_turno_inicio','ot_turno_de','ot_turno_actual'];
begin
  for f in select p.oid::regprocedure as firma, p.proname from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ot\_%' loop
    execute format('revoke all on function %s from public', f.firma);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      if f.proname = any(internas) then
        execute format('revoke all on function %s from anon, authenticated', f.firma);
      else
        execute format('grant execute on function %s to anon, authenticated', f.firma);
      end if;
    end if;
  end loop;
end $$;

-- ---------- generación a la hora exacta (opcional) ----------
-- Con pg_cron la ronda de luminarias y el plan preventivo se generan aunque nadie tenga la página abierta.
-- Si el proyecto no permite pg_cron, no pasa nada: se generan al abrir la página.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('ot-generar', '*/5 * * * *', 'select public.ot_generar_rondas(), public.ot_generar_plan()');
exception when others then
  raise notice 'pg_cron no está disponible (%): las OT automáticas se generan al abrir la página.', sqlerrm;
end $$;

-- ---------- plan preventivo inicial: semanas 47 y 48 (16 al 27 de noviembre de 2026) ----------
-- La cantidad programada de cada actividad se repartió en partes enteras entre los días asignados.
insert into public.plan_preventivo(fecha, trabajador_id, actividad, titulo, cantidad)
select v.fecha::date, u.id, v.actividad, v.titulo, v.cantidad
  from (values
  ('2026-11-16', 'luis.jimenez', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-17', 'luis.jimenez', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-18', 'luis.jimenez', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-19', 'luis.jimenez', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-20', 'luis.jimenez', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-16', 'ricardo.diaz', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 3),
  ('2026-11-17', 'ricardo.diaz', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 3),
  ('2026-11-18', 'ricardo.diaz', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 2),
  ('2026-11-19', 'ricardo.diaz', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 2),
  ('2026-11-20', 'ricardo.diaz', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 2),
  ('2026-11-17', 'manuel.pacheco', 'DMV 06 · Mantención de Iluminación Interior Edificios', 'Mantención de Iluminación Interior Edificios', 1),
  ('2026-11-18', 'manuel.pacheco', 'DMV 06 · Mantención de Iluminación Interior Edificios', 'Mantención de Iluminación Interior Edificios', 1),
  ('2026-11-19', 'ricardo.diaz', 'DMV 18 · Mantención de Estaciones y Servidores de Video', 'Mantención de Estaciones y Servidores de Video', 1),
  ('2026-11-16', 'luis.jimenez', 'DMV 17 · Mantención Cámaras de Seguridad', 'Mantención Cámaras de Seguridad', 1),
  ('2026-11-17', 'luis.jimenez', 'DMV 17 · Mantención Cámaras de Seguridad', 'Mantención Cámaras de Seguridad', 1),
  ('2026-11-18', 'luis.jimenez', 'DMV 17 · Mantención Cámaras de Seguridad', 'Mantención Cámaras de Seguridad', 1),
  ('2026-11-19', 'luis.jimenez', 'DMV 17 · Mantención Cámaras de Seguridad', 'Mantención Cámaras de Seguridad', 1),
  ('2026-11-16', 'ricardo.diaz', 'DMV 20 · Mantención de Iluminación Exterior de Calzadas', 'Mantención de Iluminación Exterior de Calzadas', 4),
  ('2026-11-17', 'ricardo.diaz', 'DMV 20 · Mantención de Iluminación Exterior de Calzadas', 'Mantención de Iluminación Exterior de Calzadas', 3),
  ('2026-11-18', 'ricardo.diaz', 'DMV 20 · Mantención de Iluminación Exterior de Calzadas', 'Mantención de Iluminación Exterior de Calzadas', 3),
  ('2026-11-19', 'ricardo.diaz', 'DMV 20 · Mantención de Iluminación Exterior de Calzadas', 'Mantención de Iluminación Exterior de Calzadas', 3),
  ('2026-11-20', 'ricardo.diaz', 'DMV 20 · Mantención de Iluminación Exterior de Calzadas', 'Mantención de Iluminación Exterior de Calzadas', 3),
  ('2026-11-16', 'manuel.pacheco', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 2),
  ('2026-11-17', 'manuel.pacheco', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 2),
  ('2026-11-18', 'manuel.pacheco', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 1),
  ('2026-11-19', 'manuel.pacheco', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 1),
  ('2026-11-20', 'manuel.pacheco', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 1),
  ('2026-11-17', 'luis.jimenez', 'DMV 22 · Mantención de Letreros Dinámicos', 'Mantención de Letreros Dinámicos', 1),
  ('2026-11-18', 'luis.jimenez', 'DMV 22 · Mantención de Letreros Dinámicos', 'Mantención de Letreros Dinámicos', 1),
  ('2026-11-23', 'ricardo.diaz', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-24', 'ricardo.diaz', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-25', 'ricardo.diaz', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-26', 'ricardo.diaz', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-27', 'ricardo.diaz', 'DMV 01 · Mantención Plantas de Tratamiento de Aguas Servidas', 'Mantención Plantas de Tratamiento de Aguas Servidas', 1),
  ('2026-11-23', 'manuel.pacheco', 'DMV 03 · Mantención Grupos Generadores', 'Mantención Grupos Generadores', 1),
  ('2026-11-24', 'manuel.pacheco', 'DMV 03 · Mantención Grupos Generadores', 'Mantención Grupos Generadores', 1),
  ('2026-11-25', 'manuel.pacheco', 'DMV 03 · Mantención Grupos Generadores', 'Mantención Grupos Generadores', 1),
  ('2026-11-23', 'luis.jimenez', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 3),
  ('2026-11-24', 'luis.jimenez', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 3),
  ('2026-11-25', 'luis.jimenez', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 2),
  ('2026-11-26', 'luis.jimenez', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 2),
  ('2026-11-27', 'luis.jimenez', 'DMV 04 · Mantención de Subestaciones y Empalmes', 'Mantención de Subestaciones y Empalmes', 2),
  ('2026-11-25', 'ricardo.diaz', 'DMV 15 · Mantención Transmisión de Voz, Datos y Video', 'Mantención Transmisión de Voz, Datos y Video', 3),
  ('2026-11-25', 'manuel.pacheco', 'DMV 16 · Mantención Rack de Comunicaciones', 'Mantención Rack de Comunicaciones', 3),
  ('2026-11-23', 'luis.jimenez', 'DMV 17 · Mantención Cámaras de Seguridad', 'Mantención Cámaras de Seguridad', 1),
  ('2026-11-24', 'luis.jimenez', 'DMV 17 · Mantención Cámaras de Seguridad', 'Mantención Cámaras de Seguridad', 1),
  ('2026-11-25', 'luis.jimenez', 'DMV 17 · Mantención Cámaras de Seguridad', 'Mantención Cámaras de Seguridad', 1),
  ('2026-11-26', 'luis.jimenez', 'DMV 17 · Mantención Cámaras de Seguridad', 'Mantención Cámaras de Seguridad', 1),
  ('2026-11-27', 'luis.jimenez', 'DMV 17 · Mantención Cámaras de Seguridad', 'Mantención Cámaras de Seguridad', 1),
  ('2026-11-23', 'ricardo.diaz', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 3),
  ('2026-11-24', 'ricardo.diaz', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 3),
  ('2026-11-25', 'ricardo.diaz', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 3),
  ('2026-11-26', 'ricardo.diaz', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 2),
  ('2026-11-27', 'ricardo.diaz', 'DMV 21 · Mantención de Citófonos de Emergencia (Postes SOS)', 'Mantención de Citófonos de Emergencia (Postes SOS)', 2),
  ('2026-11-24', 'luis.jimenez', 'DMV 22 · Mantención de Letreros Dinámicos', 'Mantención de Letreros Dinámicos', 1)
  ) as v(fecha, usuario, actividad, titulo, cantidad)
  join public.usuarios u on u.usuario = v.usuario
on conflict (fecha, trabajador_id, actividad) do nothing;
