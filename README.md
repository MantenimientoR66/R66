# Órdenes de Trabajo · Ruta de la Fruta

Página para asignar órdenes de trabajo (OT) a los técnicos de terreno. Cada persona ingresa con usuario y contraseña.

- El administrador crea la OT y la asigna a un técnico.
- El técnico ve solo sus OT, escribe el código de actividad y la descripción del trabajo realizado, y sube una foto.
- El administrador revisa el reporte y cierra la OT, o la devuelve con una nota.

## Cuentas iniciales

| Persona | Usuario | Rol |
| --- | --- | --- |
| Administrador | `admin` | Administrador |
| Ricardo Díaz | `ricardo.diaz` | Técnico |
| Luis Jiménez | `luis.jimenez` | Técnico |
| Manuel Pacheco | `manuel.pacheco` | Técnico |

Ninguna cuenta trae contraseña. El administrador crea la suya la primera vez que abre la página. Después, en la sección Equipo, entrega a cada técnico una clave temporal; al ingresar con ella, el técnico tiene que crear su propia contraseña.

## Puesta en marcha

1. Crea un proyecto gratuito en https://supabase.com.
2. En el proyecto, abre **SQL Editor**, pega el contenido completo de `supabase.sql` y ejecútalo.
3. En **Settings > API Keys** copia la dirección del proyecto (Project URL) y la clave **publishable**, y pégalas en `config.js`.
4. En GitHub, abre **Settings > Pages** de este repositorio y publica desde la rama `main`, carpeta `/ (root)`.
5. Abre la dirección que entrega GitHub Pages y crea la contraseña del administrador de inmediato: mientras no exista, cualquiera que abra la página podría crearla.

## Incidencias fuera de horario

- El administrador crea en **Equipo** un usuario de tipo **Centro de control**.
- Turnos de emergencia: cada turno parte el viernes a las 14:30 y termina el viernes siguiente a las 8:29. Los técnicos incluidos en la rotación se alternan cada semana y el que está de turno queda elegido automáticamente al crear una incidencia.
- Cada incidencia abierta tiene un botón **Avisar por WhatsApp** que abre WhatsApp con los datos de la incidencia ya escritos para el técnico. Los teléfonos se guardan desde **Equipo**, no en este repositorio.
- El centro de control solo puede crear incidencias fuera del horario laboral (lunes a jueves de 8:30 a 18:30, viernes de 8:30 a 14:30, hora de Chile). Los feriados cuentan completos como fuera de horario: vienen cargados los que quedan de 2026 y el administrador agrega los siguientes en la sección **Feriados**.
- Una incidencia no lleva código de actividad: solo la descripción de lo que pasa y, si se quiere, la ubicación.
- Cada incidencia tiene 24 horas de plazo desde que se informa. A las 12 horas sin cerrar aparece en rojo para el centro de control y el administrador, y como alerta en Reportes.
- El técnico de turno la cierra describiendo cómo se resolvió (foto opcional). El centro de control y el administrador ven ese cierre.

## Plan preventivo

- El administrador carga el calendario semanal (Excel) en la sección **Plan preventivo**. Cada celda de día con el nombre de un técnico es una asignación.
- La cantidad programada de cada actividad se reparte en partes enteras entre los días asignados; lo que sobra va a los primeros días (12 en 5 días queda 3, 3, 2, 2, 2).
- Cada actividad se convierte sola en una OT para su técnico el día que corresponde, la primera vez que alguien abre la página ese día.
- `supabase.sql` ya trae cargadas las semanas 47 y 48 (16 al 27 de noviembre de 2026).

## Archivos

- `index.html`, `app.js`, `calendario.js`, `logo.png`: la página.
- `config.js`: dirección y clave pública del proyecto de Supabase.
- `supabase.sql`: tablas y funciones de la base de datos. Se puede volver a ejecutar sin perder datos.

## Notas

- Las fotos se guardan reducidas dentro de la base de datos. El plan gratuito de Supabase alcanza para unas 1.500 fotos; después hay que eliminar OT antiguas o pasar a un plan pagado.
- La página se actualiza sola cada 30 segundos. No envía avisos por correo ni al teléfono.
- Nunca pongas en `config.js` la clave `secret` o `service_role` de Supabase: solo la `publishable`.
