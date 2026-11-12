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

-- Cuentas iniciales, sin contraseña. El administrador crea la suya al entrar por primera vez
-- y entrega a cada técnico una clave temporal desde su panel.
insert into public.usuarios(usuario, nombre, rol, debe_cambiar) values
  ('admin', 'Administrador', 'admin', true),
  ('ricardo.diaz', 'Ricardo Díaz', 'trabajador', true),
  ('luis.jimenez', 'Luis Jiménez', 'trabajador', true),
  ('manuel.pacheco', 'Manuel Pacheco', 'trabajador', true)
on conflict (usuario) do nothing;

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

create or replace function public.ot_crear_trabajador(p_token text, p_usuario text, p_nombre text, p_clave text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  perform public.ot_admin(p_token);
  v := public.ot_validar(p_usuario, p_nombre, p_clave);
  if exists (select 1 from public.usuarios where usuario = v) then
    raise exception 'El usuario "%" ya existe. Elige otro.', v;
  end if;
  insert into public.usuarios(usuario, nombre, clave, rol, debe_cambiar)
    values (v, trim(p_nombre), crypt(p_clave, gen_salt('bf')), 'trabajador', true);
end $$;

create or replace function public.ot_clave_trabajador(p_token text, p_id uuid, p_clave text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  if length(coalesce(p_clave,'')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres.'; end if;
  update public.usuarios set clave = crypt(p_clave, gen_salt('bf')), fallos = 0, bloqueado_hasta = null, debe_cambiar = true
    where id = p_id and rol = 'trabajador';
  if not found then raise exception 'No se encontró al trabajador.'; end if;
  delete from public.sesiones where usuario_id = p_id;
end $$;

create or replace function public.ot_activar_trabajador(p_token text, p_id uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.ot_admin(p_token);
  update public.usuarios set activo = p_activo where id = p_id and rol = 'trabajador';
  if not found then raise exception 'No se encontró al trabajador.'; end if;
  if not p_activo then delete from public.sesiones where usuario_id = p_id; end if;
end $$;

-- ---------- órdenes ----------

create or replace function public.ot_listar(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios; ords jsonb; trabs jsonb := '[]'::jsonb;
begin
  u := public.ot_quien(p_token);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'numero', o.numero, 'trabajador_id', o.trabajador_id, 'trabajador', t.nombre,
      'titulo', o.titulo, 'detalle', o.detalle, 'ubicacion', o.ubicacion, 'prioridad', o.prioridad,
      'fecha_limite', o.fecha_limite, 'estado', o.estado, 'creada', o.creada,
      'codigo_actividad', o.codigo_actividad, 'descripcion_realizada', o.descripcion_realizada,
      'tiene_foto', o.foto is not null, 'enviado', o.enviado,
      'nota_devolucion', o.nota_devolucion, 'nota_cierre', o.nota_cierre, 'cerrada', o.cerrada)
    order by o.creada desc), '[]'::jsonb)
    into ords
    from public.ordenes o join public.usuarios t on t.id = o.trabajador_id
   where u.rol = 'admin' or o.trabajador_id = u.id;
  if u.rol = 'admin' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'usuario', usuario, 'nombre', nombre, 'activo', activo,
      'sin_clave', clave is null, 'debe_cambiar', debe_cambiar)
      order by nombre), '[]'::jsonb) into trabs from public.usuarios where rol = 'trabajador';
  end if;
  return jsonb_build_object('ordenes', ords, 'trabajadores', trabs);
end $$;

create or replace function public.ot_foto(p_token text, p_ot uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios; f text;
begin
  u := public.ot_quien(p_token);
  select foto into f from public.ordenes where id = p_ot and (u.rol = 'admin' or trabajador_id = u.id);
  return f;
end $$;

create or replace function public.ot_crear(p_token text, p_trabajador uuid, p_titulo text, p_detalle text,
  p_ubicacion text, p_prioridad text, p_fecha date) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  perform public.ot_admin(p_token);
  if not exists (select 1 from public.usuarios where id = p_trabajador and rol = 'trabajador' and activo) then
    raise exception 'Elige un trabajador activo.';
  end if;
  if length(trim(coalesce(p_titulo,''))) = 0 or length(trim(coalesce(p_detalle,''))) = 0 then
    raise exception 'Completa el título y el detalle del trabajo.';
  end if;
  insert into public.ordenes(trabajador_id, titulo, detalle, ubicacion, prioridad, fecha_limite)
    values (p_trabajador, trim(p_titulo), trim(p_detalle), trim(coalesce(p_ubicacion,'')),
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
  update public.ordenes set estado = 'revision', cerrada = null, nota_cierre = null
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
declare f record; internas text[] := array['ot_sesion','ot_quien','ot_admin','ot_abrir_sesion','ot_validar'];
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
