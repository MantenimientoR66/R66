# Órdenes de Trabajo · Ruta de la Fruta

Página para asignar órdenes de trabajo (OT) a los técnicos de terreno. Cada persona ingresa con usuario y contraseña.

- El administrador crea la OT y la asigna a un técnico.
- El técnico ve solo sus OT y las acepta con el botón **Aceptar OT**: desde ese momento la OT queda **En ejecución**.
- Al terminar, escribe el código de actividad y la descripción del trabajo realizado, y sube una foto (puede agregar una segunda).
- El administrador revisa el reporte y cierra la OT, o la devuelve con una nota.

## Buscador

- Arriba de la lista de órdenes está **Buscar trabajos**: busca por palabras en todo el historial de OT, incidencias y autohallazgos.
- Revisa el código (OT-0024, INC-0003, AH-0001; también "ot24" o "inc-3"), título, detalle, código de actividad, ubicación, técnico, quién la creó, lo que informó el técnico, notas, estado y fechas (dd-mm-aaaa).
- Con varias palabras muestra los trabajos que tienen todas. No distingue mayúsculas ni tildes. Los filtros de estado siguen funcionando sobre los resultados.

## OT de a una

- Cada técnico hace sus OT de a una: solo puede aceptar una nueva cuando envió el reporte de la que tiene en ejecución (o corrigió la que le devolvieron).
- Las OT asignadas forman una cola por técnico y solo puede aceptar la primera. El administrador cambia el orden en **Órdenes > Cola de trabajo por técnico** con las flechas o el botón **Primero**.
- Mientras un técnico no acepte una OT, el administrador puede pasarla a otro técnico desde la misma OT (**Mover OT**). Entra al final de la cola del nuevo técnico.
- Las OT nuevas entran al final de la cola. La ronda de luminarias y el flujómetro, que son diarios, entran al principio.
- Cada OT tiene 4 horas como máximo desde que se acepta hasta que se envía el reporte. Pasado ese tiempo aparece en rojo para el técnico y el administrador, y como alerta en el Panel.
- Las incidencias fuera de horario no entran en la cola: se aceptan en cualquier momento.

## Autohallazgos

- El técnico informa lo que encuentra en terreno desde **Informar un autohallazgo**: qué encontró, dónde, descripción, foto (obligatoria, más una segunda opcional), y opcionalmente el código de actividad y lo que hizo.
- No lleva número de OT ni de incidencia: tiene su propia numeración, **AH-0001**, AH-0002…
- Llega al administrador como **Por revisar**. El administrador lo marca como revisado (con una nota opcional) o lo elimina. No se devuelve al técnico.
- El filtro **Autohallazgos** de la lista los muestra todos. El Panel muestra cuántos hubo en el mes y cuántos informó cada técnico.
- El informe con fotos se puede generar por **mes completo o por semana** (lunes a domingo) e incluye una sección de autohallazgos. No entran en la bitácora diaria.

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
- El técnico de turno la acepta (queda En ejecución) y luego la cierra describiendo cómo se resolvió (hasta dos fotos, opcionales). El centro de control y el administrador ven ese cierre.

## Ronda de luminarias

- El técnico de turno de emergencia recibe sola una OT llamada **Ronda de luminarias**, una por día: de lunes a jueves a las 18:30 y el viernes a las 14:30 (hora de salida), y los sábados, domingos y feriados a las 8:30.
- Se asigna a quien está de turno a esa hora según la rotación, con fecha límite ese mismo día. El técnico la informa como cualquier OT (código de actividad, descripción y foto) y el administrador la cierra.
- Si el proyecto de Supabase permite `pg_cron`, se genera a la hora exacta; si no, la primera vez que alguien abre la página después de esa hora.
- Si el administrador elimina la ronda de un día, no se vuelve a crear ese día.

## Flujómetro

- El técnico de turno de emergencia recibe sola, todos los días a las 8:30 (también fines de semana y feriados), una OT de actividad **Flujómetro**. El administrador también puede crear una a mano eligiendo esa actividad.
- Su reporte solo pide la foto del medidor y los metros cúbicos.
- Hay dos flujómetros: **Flujómetro 1 (planta de tratamiento)** y **Flujómetro 2 (sala de servidores)**. Cada día a las 8:30 el técnico de turno recibe una lectura de cada uno. Las lecturas anteriores al 20-11-2026 son del flujómetro 1. Al crear una OT de Flujómetro a mano se elige el medidor.
- **Cargar lecturas anteriores** (en la pestaña Flujómetro) permite agregar a mano las lecturas de días anteriores al sistema: una por una o pegando varias líneas de fecha y m³ (por ejemplo, dos columnas copiadas de Excel). Se usan en el reporte igual que las de los técnicos y se pueden corregir (volviendo a cargar el mismo día) o eliminar. Si un día ya tiene la lectura de una OT, vale la de la OT.
- La pestaña **Flujómetro** del administrador tiene un selector para elegir el medidor y muestra el rango de fechas elegido en **Desde** y **Hasta** (con atajos para esta semana, este mes y el mes anterior; hasta 366 días): consumo promedio por día, consumo del período, mayor y menor consumo, días con lectura, gráfico y tabla. El técnico anota lo que marca el medidor y el consumo de cada día es su lectura menos la anterior. **Generar reporte para imprimir** arma una versión para imprimir o guardar como PDF.

## Horas extras

- Los períodos van del día 11 de cada mes al día 10 del mes siguiente.
- Quien está de turno de emergencia recibe solas 2 horas por cada día de semana y 6 horas por cada sábado, domingo o feriado. Cuenta quien está de turno a las 18:30 de ese día, así que el viernes es de quien entra a turno.
- Cada técnico agrega en su panel las horas de otros trabajos fuera del horario hábil, con fecha, horas y descripción, dentro del período en curso. Puede quitar las que agregó mientras el período siga abierto.
- El administrador ve todo en la pestaña **Horas extras**, puede agregar o quitar registros de cualquier técnico y período, y descarga el período en Excel (hoja Resumen y hoja Detalle).

## Turnos asignados a mano

- En **Equipo y turnos** el administrador elige en el calendario cualquier día de un turno y el técnico que lo cubrirá. Esa asignación manda sobre la rotación automática; **Volver a la rotación** la quita.
- Se puede asignar a cualquier técnico activo, aunque no esté en la rotación.

## Panel del administrador

- El administrador navega por pestañas: Órdenes, Panel, Plan preventivo, Equipo y turnos, y Ajustes.
- El **Panel** muestra los tiempos de las OT por etapa (espera hasta aceptar, tiempo en ejecución, espera hasta el cierre y total). Solo cuentan las OT aceptadas con el botón.
- El **Panel** muestra, para el mes elegido: cumplimiento preventivo, OT realizadas, horas promedio que las OT pasan abiertas, OT abiertas, incidencias atendidas, alertas, gráficos por día y por semana, y el rendimiento de cada técnico.
- **Generar informe del mes con fotos** arma un documento con todos los trabajos del mes y sus fotos. Se abre en el navegador, desde donde se imprime o se guarda como PDF, y también se puede descargar como archivo.

## Plan preventivo

- El administrador carga el calendario semanal (Excel) en la sección **Plan preventivo**. Cada celda de día con el nombre de un técnico es una asignación.
- La cantidad programada de cada actividad se reparte en partes enteras entre los días asignados; lo que sobra va a los primeros días (12 en 5 días queda 3, 3, 2, 2, 2).
- Cada actividad se convierte sola en una OT para su técnico el día que corresponde, la primera vez que alguien abre la página ese día.
- `supabase.sql` ya trae cargadas las semanas 47 y 48 (16 al 27 de noviembre de 2026).

## Archivos

- `index.html`, `app.js`, `calendario.js`, `logo.png`: la página.
- `config.js`: dirección y clave pública del proyecto de Supabase.
- `supabase.sql`: tablas y funciones de la base de datos, todo en un solo archivo. Se puede volver a ejecutar sin perder datos. No lo reemplaces por archivos parciales: debe contener siempre la base completa.

## Notas

- Las fotos se guardan reducidas dentro de la base de datos. El plan gratuito de Supabase alcanza para unas 1.500 fotos (cada OT puede llevar dos); después hay que eliminar OT antiguas o pasar a un plan pagado.
- La página se actualiza sola cada 30 segundos. No envía avisos por correo ni al teléfono.
- Nunca pongas en `config.js` la clave `secret` o `service_role` de Supabase: solo la `publishable`.
