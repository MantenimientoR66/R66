/* Bitácoras diarias · Ruta de la Fruta
   Agrega el menú "Bitácoras" al panel del administrador. Rellena la plantilla
   plantilla_bitacora.xlsx sin tocar su formato: solo escribe los datos en sus celdas.
   Se carga con <script src="bitacoras.js"></script> justo después de app.js. */
(function(){
"use strict";

const CLAVE_TOKEN = "ot_r66_token";
const PLANTILLA = "plantilla_bitacora.xlsx";
const SUPERVISOR = "Alan Muñoz";
const TEXTO_OK = "Realizado con éxito";
const HOJA = "xl/worksheets/sheet1.xml";
const XLSX_TIPO = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

// Filas de la plantilla: la posición 0 es la fila 25 del Excel y la última es la fila 48.
const FILAS = [
  ["", "Segregación de Obra"],
  ["DMV 01", "Mantención Plantas de Tratamiento de Aguas Servidas"],
  ["DMV 02", "Mantención de sistemas de abastecimiento de agua potable"],
  ["DMV 03", "Mantención Grupos Generadores"],
  ["DMV 04", "Mantención de Subestaciones y Empalmes"],
  ["DMV 05", "Mantención Sistema Hidropack Edificios y Regadío"],
  ["DMV 06", "Mantención de Iluminación Interior Edificios"],
  ["DMV 07", "Mantención Termos Eléctricos"],
  ["DMV 08", "Mantención de Aires Acondicionado Edificios"],
  ["DMV 09", "Revisión Seguridad Salas Técnicas FF"],
  ["DMV 10", "Mantención Equipamiento de Pórticos FF"],
  ["DMV 11", "Mantención de Equipos de Salas Técnicas FF"],
  ["DMV 12", "Mantención de Estaciones y Servidores de Datos"],
  ["DMV 13", "Mantención de Respaldo a Bases de Datos"],
  ["DMV 14", "Mantención de UPS de Respaldo"],
  ["DMV 15", "Mantención Transmisión de Voz, Datos y Video"],
  ["DMV 16", "Mantención Rack de Comunicaciones"],
  ["DMV 17", "Mantención Cámaras de Seguridad"],
  ["DMV 18", "Mantención de Estaciones y Servidores de Video"],
  ["DMV 19", "Mantención de Estaciones de Conteo Vehicular"],
  ["DMV 20", "Mantención de Iluminación Exterior de Calzadas"],
  ["DMV 21", "Mantención de Citófonos de Emergencia (Postes SOS)"],
  ["DMV 22", "Mantención de Letreros Dinámicos"],
  ["DSI 01", "Mantención Sistema Alarmas SICAS"]
];
function etiquetaFila(fila){ const f = FILAS[fila - 25]; return f[0] ? f[0] + " · " + f[1] : f[1]; }

/* ---------- lógica (no depende de la página) ---------- */
function esc(t){ return String(t == null ? "" : t).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function p2(n){ return String(n).padStart(2, "0"); }
function isoLocal(v){
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? "" : d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}
function hoyIso(){ return isoLocal(new Date()); }
function fechaCorta(iso){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; }
function hecha(o){ return o.estado === "revision" || o.estado === "cerrada"; }

// Fila de la bitácora que corresponde al código de actividad de una OT (o null si no tiene fila).
function filaDe(o){
  const s = String(o.codigo_actividad || o.actividad || "");
  const m = /^(DMV|DSI)\s*0*(\d{1,2})\b/i.exec(s);
  if (m){
    const tipo = m[1].toUpperCase(), n = Number(m[2]);
    if (tipo === "DMV" && n >= 1 && n <= 22) return 25 + n;
    if (tipo === "DSI" && n === 1) return 48;
    return null;
  }
  return /^Segregaci[oó]n de obra/i.test(s) ? 25 : null;
}

// OT realizadas ese día, agrupadas por técnico y por fila de la bitácora (se suman las cantidades).
// criterio "reporte": el día en que el técnico envió su reporte. "programada": el día de la fecha límite de la OT.
function agrupar(ordenes, dia, criterio, quien){
  const por = {}; let sinFila = 0;
  for (const o of ordenes){
    if (o.tipo === "incidencia" || o.tipo === "hallazgo" || !hecha(o)) continue;   // las incidencias y los autohallazgos no van en la bitácora
    const diaOt = criterio === "programada" ? (o.fecha_limite || isoLocal(o.creada)) : isoLocal(o.enviado);
    if (diaOt !== dia) continue;
    if (quien && o.trabajador_id !== quien) continue;
    const fila = filaDe(o);
    if (!fila){ sinFila++; continue; }
    const t = por[o.trabajador_id] || (por[o.trabajador_id] = {id:o.trabajador_id, nombre:o.trabajador, filas:{}});
    t.filas[fila] = (t.filas[fila] || 0) + (o.cantidad != null ? Number(o.cantidad) : 1);
  }
  const tecnicos = Object.values(por).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  for (const t of tecnicos) for (const f in t.filas) t.filas[f] = Math.round(t.filas[f] * 1000) / 1000;
  return {tecnicos, sinFila};
}

// Escribe un valor en una celda del XML de la hoja, conservando el estilo que ya tenía.
function ponerCelda(xml, ref, valor){
  const re = new RegExp('<c r="' + ref + '"((?:\\s+[a-zA-Z:]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)');
  const m = re.exec(xml);
  if (!m) throw new Error("La plantilla no tiene la celda " + ref + ". ¿Subiste la plantilla original?");
  const s = /\ss="(\d+)"/.exec(m[1]);
  const attr = ' r="' + ref + '"' + (s ? ' s="' + s[1] + '"' : "");
  const nuevo = typeof valor === "number"
    ? "<c" + attr + "><v>" + valor + "</v></c>"
    : "<c" + attr + ' t="inlineStr"><is><t xml:space="preserve">' + esc(valor) + "</t></is></c>";
  return xml.slice(0, m.index) + nuevo + xml.slice(m.index + m[0].length);
}

// Aplica los datos de un técnico a la hoja. Las filas 26 a 48 no tienen celdas combinadas en Cant. ni en
// Observaciones, así que el dato va en la celda del medio (S y AF) para que quede centrado en su casilla.
function llenarHoja(xml, tecnico, dia){
  const f = fechaCorta(dia).replace(/-/g, "/");
  xml = ponerCelda(xml, "R5", tecnico.nombre);       // Capataz
  xml = ponerCelda(xml, "E8", f);                    // Fecha
  xml = ponerCelda(xml, "J21", SUPERVISOR);          // Responsable de la Inspección
  xml = ponerCelda(xml, "W21", f);                   // Fecha de la inspección
  for (const k of Object.keys(tecnico.filas).map(Number).sort((a, b) => a - b)){
    xml = ponerCelda(xml, k === 25 ? "R25" : "S" + k, tecnico.filas[k]);        // Cant.
    xml = ponerCelda(xml, k === 25 ? "AC25" : "AF" + k, TEXTO_OK);              // Observaciones
  }
  return xml;
}

if (typeof document === "undefined"){          // para las pruebas fuera del navegador
  module.exports = {filaDe, agrupar, ponerCelda, llenarHoja, isoLocal};
  return;
}

/* ---------- página ---------- */
const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids){
  const e = document.createElement(tag);
  for (const k in (attrs || {})){
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()){
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
function tabla(cab, filas){
  const ult = cab.length - 1;
  return h("div", {class:"tabla-caja"}, h("table", {class:"rep"},
    h("thead", null, h("tr", null, cab.map((c, i) => h("th", {class: i === ult ? "num-cel" : null, scope:"col"}, c)))),
    h("tbody", null, filas.map(f => h("tr", null, f.map((c, i) => h("td", {class: i === ult ? "num-cel" : null}, c)))))));
}

let sb = null, datos = null, actual = null, ui = null, cargandoDatos = false;

function leerToken(){ try { return localStorage.getItem(CLAVE_TOKEN); } catch(e){ return null; } }
async function traerDatos(){
  const cfg = window.OT_CONFIG || {}, token = leerToken();
  if (!token) throw new Error("Tu sesión venció. Vuelve a ingresar.");
  if (!cfg.url || !cfg.key || !window.supabase) throw new Error("No se pudo conectar con la base de datos.");
  if (!sb) sb = window.supabase.createClient(cfg.url, cfg.key, {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}});
  let res;
  try { res = await sb.rpc("ot_listar", {p_token:token}); }
  catch (e){ throw new Error("No hay conexión. Revisa tu internet e intenta otra vez."); }
  if (res.error){
    if (res.error.code === "OT401") throw new Error("Tu sesión venció. Vuelve a ingresar.");
    throw new Error(res.error.message || "No se pudieron cargar las órdenes.");
  }
  return res.data;
}
function cargarJSZip(){
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = JSZIP_URL;
    s.onload = () => window.JSZip ? ok(window.JSZip) : mal(new Error("No se pudo cargar el generador de archivos. Recarga la página."));
    s.onerror = () => mal(new Error("No se pudo cargar el generador de archivos. Revisa tu conexión y recarga la página."));
    document.head.append(s);
  });
}
async function armarBitacora(JSZip, plantilla, tecnico, dia){
  const zip = await JSZip.loadAsync(plantilla);
  const archivo = zip.file(HOJA);
  if (!archivo) throw new Error("La plantilla no tiene el formato esperado. ¿Subiste la plantilla original?");
  zip.file(HOJA, llenarHoja(await archivo.async("string"), tecnico, dia));
  return zip.generateAsync({type:"uint8array", compression:"DEFLATE"});
}
function nombreArchivo(dia, nombre){
  const n = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return "Bitacora_" + dia + "_" + n + ".xlsx";
}
function bajarBlob(blob, nombre){
  const url = URL.createObjectURL(blob), a = h("a", {href:url, download:nombre});
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function llenarTecnicos(){
  const sel = ui.trab, previo = sel.value;
  sel.replaceChildren(h("option", {value:""}, "Todos los técnicos"));
  for (const t of (datos && datos.trabajadores || []).filter(t => t.rol === "trabajador")) sel.append(h("option", {value:t.id}, t.nombre));
  if (previo && [...sel.options].some(o => o.value === previo)) sel.value = previo;
}
function render(){
  const cuerpo = ui.cuerpo; cuerpo.replaceChildren();
  if (!datos){ ui.bajar.disabled = true; cuerpo.append(h("p", {class:"nota"}, "Cargando…")); return; }
  const dia = ui.fecha.value;
  if (!dia){ actual = null; ui.bajar.disabled = true; cuerpo.append(h("p", {class:"nota"}, "Elige el día de la bitácora.")); return; }
  const r = actual = agrupar(datos.ordenes || [], dia, ui.crit.value, ui.trab.value);
  ui.bajar.disabled = !r.tecnicos.length;
  ui.bajar.textContent = r.tecnicos.length > 1 ? "Descargar " + r.tecnicos.length + " bitácoras (ZIP)" : "Descargar bitácora";
  if (!r.tecnicos.length)
    cuerpo.append(h("p", {class:"nota"}, "No hay trabajos realizados el " + fechaCorta(dia) + (ui.trab.value ? " por ese técnico" : "") +
      ". Prueba con otro día, o cambia el criterio de fecha."));
  for (const t of r.tecnicos){
    cuerpo.append(h("h3", null, t.nombre + " · " + fechaCorta(dia)));
    cuerpo.append(tabla(["Actividad", "Cant. en la bitácora"],
      Object.keys(t.filas).map(Number).sort((a, b) => a - b).map(k => [etiquetaFila(k), String(t.filas[k]).replace(".", ",")])));
  }
  if (r.sinFila)
    cuerpo.append(h("p", {class:"nota"}, r.sinFila + (r.sinFila === 1 ? " trabajo de ese día no tiene" : " trabajos de ese día no tienen") +
      " fila en la bitácora (rondas de luminarias, flujómetro u otros códigos) y no se incluyen."));
}
async function actualizar(){
  if (cargandoDatos) return;
  cargandoDatos = true; ui.est.textContent = "";
  try { datos = await traerDatos(); llenarTecnicos(); }
  catch (e){ ui.est.textContent = e.message; }
  cargandoDatos = false;
  render();
}
async function descargar(){
  const r = actual, dia = ui.fecha.value;
  if (!r || !r.tecnicos.length) return;
  ui.bajar.disabled = true; ui.est.textContent = "Preparando…";
  try {
    const JSZip = await cargarJSZip();
    let resp;
    try { resp = await fetch(PLANTILLA, {cache:"no-cache"}); }
    catch (e){ throw new Error("No hay conexión. Revisa tu internet e intenta otra vez."); }
    if (!resp.ok) throw new Error("No se encontró " + PLANTILLA + " en el repositorio. Súbelo a la misma carpeta que index.html.");
    const plantilla = await resp.arrayBuffer(), archivos = [];
    for (const t of r.tecnicos) archivos.push({nombre:nombreArchivo(dia, t.nombre), datos:await armarBitacora(JSZip, plantilla, t, dia)});
    if (archivos.length === 1) bajarBlob(new Blob([archivos[0].datos], {type:XLSX_TIPO}), archivos[0].nombre);
    else {
      const z = new JSZip();
      for (const a of archivos) z.file(a.nombre, a.datos);
      bajarBlob(await z.generateAsync({type:"blob", compression:"DEFLATE"}), "Bitacoras_" + dia + ".zip");
    }
    ui.est.textContent = archivos.length === 1 ? "Listo: bitácora descargada." : "Listo: " + archivos.length + " bitácoras descargadas en un ZIP.";
  } catch (e){ ui.est.textContent = e.message || "No se pudo armar la bitácora."; }
  ui.bajar.disabled = !(actual && actual.tecnicos.length);
}

function iniciar(){
  const nav = $("nav"), base = $("flujo");
  const modelo = nav && nav.querySelector("button");
  if (!nav || !base || !modelo) return;

  ui = {
    fecha: h("input", {id:"bit-fecha", type:"date", value:hoyIso(), max:hoyIso(), onchange: render}),
    trab: h("select", {id:"bit-trab", onchange: render}, h("option", {value:""}, "Todos los técnicos")),
    crit: h("select", {id:"bit-crit", onchange: render},
      h("option", {value:"reporte"}, "Día en que el técnico envió su reporte"),
      h("option", {value:"programada"}, "Día programado de la OT")),
    bajar: h("button", {class:"btn principal", type:"button", id:"bit-bajar", disabled:true, onclick: descargar}, "Descargar bitácora"),
    est: h("span", {class:"nota", role:"status"}),
    cuerpo: h("div", {class:"lista"})
  };
  const form = h("div", {class:"lista"},
    h("label", {for:"bit-fecha"}, "Día de la bitácora", ui.fecha),
    h("label", {for:"bit-trab"}, "Técnico", ui.trab),
    h("label", {for:"bit-crit"}, "Contar los trabajos según", ui.crit),
    h("div", {class:"acciones"}, ui.bajar,
      h("button", {class:"btn", type:"button", id:"bit-act", onclick: actualizar}, "Actualizar datos"), ui.est),
    h("p", {class:"nota"}, "La bitácora lleva el nombre del técnico como capataz, a " + SUPERVISOR + " como responsable de la inspección, la fecha, " +
      "la cantidad de cada actividad realizada y «" + TEXTO_OK + "» en Observaciones. Correcto, INC N° y firmas quedan en blanco. " +
      "Cuenta las OT con reporte enviado o cerradas."));

  // La sección copia las clases de las demás secciones del administrador para que se vea igual.
  const det0 = base.querySelector("details"), sum0 = det0 && det0.querySelector("summary");
  const sec = base.cloneNode(false); sec.id = "bitacoras"; sec.hidden = true;
  const det = det0 ? det0.cloneNode(false) : document.createElement("details"); det.removeAttribute("id"); det.open = true;
  const sum = sum0 ? sum0.cloneNode(false) : document.createElement("summary"); sum.removeAttribute("id"); sum.textContent = "Bitácoras diarias";
  det.append(sum, form, ui.cuerpo); sec.append(det);
  base.after(sec);

  const btn = modelo.cloneNode(false);
  btn.removeAttribute("id"); btn.dataset.v = "bitacoras"; btn.type = "button"; btn.textContent = "Bitácoras";
  btn.setAttribute("aria-pressed", "false");
  const otros = [...nav.querySelectorAll("button")];
  const ref = nav.querySelector('button[data-v="horas"]') || otros[otros.length - 1];
  ref.after(btn);

  const OTRAS = ["filtros", "nueva", "lista", "reportes", "flujo", "horas", "plan", "equipo", "feriados", "cuenta"];
  btn.addEventListener("click", () => {
    for (const id of OTRAS){ const el = $(id); if (el) el.hidden = true; }
    sec.hidden = false;
    for (const b of nav.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === btn));
    actualizar();
  });
  for (const b of otros) b.addEventListener("click", () => { sec.hidden = true; });   // la app muestra su propia vista
  const app = $("v-app");
  if (app) new MutationObserver(() => { if (app.hidden){ sec.hidden = true; datos = null; } }).observe(app, {attributes:true, attributeFilter:["hidden"]});
}
iniciar();
})();
