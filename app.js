(function(){
"use strict";
const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids){
  const e = document.createElement(tag);
  for (const k in (attrs||{})){
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

const CLAVE_TOKEN = "ot_r66_token";
const S = {
  feriados:[], huellaFer:"", sb:null, token:null, yo:null, admin:false, control:false, fuera:false, huellaInc:"", ordenes:[], trabajadores:[], plan:[], huellaPlan:"", importar:null,
  huella:"", huellaEquipo:"", filtro:"todas", abiertos:{}, borradores:{}, notas:{}, ocupado:{},
  confirmar:{}, errores:{}, fotos:{}, pidiendoFoto:{}, temporal:"", reloj:null
};
// Códigos de actividad de la bitácora de trabajos diarios (Control diario trabajos mantención).
const ACTIVIDADES = [
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
].map(([c, d]) => c ? c + " · " + d : d);
function opcionesActividad(sel, valor){
  sel.replaceChildren(h("option", {value:""}, "Elige el código de actividad"));
  const lista = (valor && !ACTIVIDADES.includes(valor)) ? [valor].concat(ACTIVIDADES) : ACTIVIDADES;
  for (const a of lista) sel.append(h("option", {value:a}, a));
  sel.value = valor || "";
}
const ESTADOS = {asignada:"Asignada", ejecucion:"En ejecución", devuelta:"Devuelta para corregir", revision:"Por revisar", cerrada:"Cerrada"};

function aviso(texto, bien){
  const a = $("aviso");
  if (!texto){ a.hidden = true; return; }
  a.textContent = texto; a.hidden = false; a.className = "mensaje" + (bien ? " bien" : "");
}
function vista(nombre){
  for (const v of ["v-activar","v-login","v-cambiar","v-app"]) $(v).hidden = v !== nombre;
  $("salir").hidden = !(nombre === "v-app" || nombre === "v-cambiar");
  if (nombre !== "v-app" && S.reloj){ clearInterval(S.reloj); S.reloj = null; }
}
function guardarToken(t){
  S.token = t;
  try { if (t) localStorage.setItem(CLAVE_TOKEN, t); else localStorage.removeItem(CLAVE_TOKEN); } catch(e){}
}
function leerToken(){ try { return localStorage.getItem(CLAVE_TOKEN); } catch(e){ return null; } }

async function rpc(fn, args){
  let res;
  try { res = await S.sb.rpc(fn, args || {}); }
  catch (e){ throw new Error("No hay conexión. Revisa tu internet e intenta otra vez."); }
  if (res.error){
    const e = res.error;
    if (e.code === "OT401"){ cerrarLocal("Tu sesión venció. Vuelve a ingresar."); throw new Error("Tu sesión venció."); }
    if (e.code === "OT402"){ mostrarCambio(); throw new Error(e.message); }
    if (/fetch|network/i.test(e.message || "")) throw new Error("No hay conexión. Revisa tu internet e intenta otra vez.");
    if (e.code && /^(PGRST|42)/.test(e.code)) throw new Error("La base de datos no está al día. Ejecuta de nuevo el archivo supabase.sql en el SQL Editor de Supabase.");
    throw new Error(e.message || "No se pudo completar la operación.");
  }
  return res.data;
}

/* ---------- acceso ---------- */
function cerrarLocal(msg){
  guardarToken(null); S.yo = null; S.ordenes = []; S.trabajadores = []; S.plan = []; S.huella = ""; S.huellaEquipo = ""; S.huellaPlan = ""; S.huellaRep = null; S.huellaInc = ""; S.huellaFer = ""; S.importar = null;
  S.fotos = {}; S.borradores = {}; S.temporal = "";
  $("rol").textContent = "";
  vista("v-login");
  if (msg) $("l-estado").textContent = msg;
}
function mostrarCambio(){
  $("rol").textContent = S.yo ? S.yo.nombre : "";
  $("c-actual").value = S.temporal || "";
  vista("v-cambiar");
  ($("c-actual").value ? $("c-nueva") : $("c-actual")).focus();
}
function entrar(sesion){
  guardarToken(sesion.token); S.yo = sesion.usuario;
  if (S.yo.debe_cambiar){ mostrarCambio(); return; }
  abrirApp();
}
function abrirApp(){
  S.admin = S.yo.rol === "admin"; S.control = S.yo.rol === "control"; S.temporal = "";
  $("rol").textContent = S.yo.nombre + (S.admin ? " · Administrador" : S.control ? " · Centro de control" : " · Técnico");
  $("nueva").hidden = !S.admin; $("equipo").hidden = !S.admin; $("plan").hidden = !S.admin;
  $("incidencia").hidden = !S.control; $("feriados").hidden = !S.admin; $("reportes").hidden = !S.admin;
  $("nav").hidden = !S.admin;
  for (const id of ["filtros","lista","cuenta"]) $(id).hidden = false;
  if (S.admin) mostrarVista(S.vista || "ordenes");
  aviso("");
  vista("v-app"); render(); cargar();
  S.reloj = setInterval(cargar, 30000);
}

$("form-activar").addEventListener("submit", async ev => {
  ev.preventDefault();
  const c = $("a-clave").value, est = $("a-estado");
  if (c !== $("a-clave2").value){ est.textContent = "Las dos contraseñas no coinciden."; return; }
  $("a-enviar").disabled = true; est.textContent = "Guardando…";
  try { const s = await rpc("ot_activar_admin", {p_clave:c}); $("a-clave").value = $("a-clave2").value = ""; est.textContent = ""; entrar(s); }
  catch (e){ est.textContent = e.message; }
  $("a-enviar").disabled = false;
});
$("form-login").addEventListener("submit", async ev => {
  ev.preventDefault();
  const est = $("l-estado"), clave = $("l-clave").value;
  $("l-enviar").disabled = true; est.textContent = "Ingresando…";
  try {
    const r = await rpc("ot_login", {p_usuario:$("l-usuario").value, p_clave:clave});
    if (!r.ok) est.textContent = r.error;
    else { est.textContent = ""; $("l-clave").value = ""; S.temporal = r.usuario.debe_cambiar ? clave : ""; entrar(r); }
  } catch (e){ est.textContent = e.message; }
  $("l-enviar").disabled = false;
});
$("form-cambiar").addEventListener("submit", async ev => {
  ev.preventDefault();
  const est = $("c-estado"), n = $("c-nueva").value;
  if (n !== $("c-nueva2").value){ est.textContent = "Las dos contraseñas nuevas no coinciden."; return; }
  $("c-enviar").disabled = true; est.textContent = "Guardando…";
  try {
    await rpc("ot_cambiar_mi_clave", {p_token:S.token, p_actual:$("c-actual").value, p_nueva:n});
    $("c-actual").value = $("c-nueva").value = $("c-nueva2").value = ""; est.textContent = "";
    S.yo.debe_cambiar = false; abrirApp();
  } catch (e){ est.textContent = e.message; }
  $("c-enviar").disabled = false;
});
$("form-clave").addEventListener("submit", async ev => {
  ev.preventDefault();
  const est = $("m-estado");
  $("m-enviar").disabled = true; est.textContent = "Guardando…";
  try {
    await rpc("ot_cambiar_mi_clave", {p_token:S.token, p_actual:$("m-actual").value, p_nueva:$("m-nueva").value});
    $("m-actual").value = $("m-nueva").value = ""; est.textContent = "Contraseña cambiada.";
  } catch (e){ est.textContent = e.message; }
  $("m-enviar").disabled = false;
});
$("salir").addEventListener("click", async () => {
  const t = S.token; cerrarLocal("");
  try { await S.sb.rpc("ot_salir", {p_token:t}); } catch(e){}
});

/* ---------- datos ---------- */
let cargando = false;
async function cargar(){
  if (cargando || !S.token || $("v-app").hidden) return;
  cargando = true;
  try {
    const d = await rpc("ot_listar", {p_token:S.token});
    const hu = JSON.stringify(d.ordenes), he = JSON.stringify([d.trabajadores, d.turnos || []]);
    S.turnos = d.turnos || [];
    const hp = JSON.stringify(d.plan || []);
    S.ordenes = d.ordenes; S.trabajadores = d.trabajadores; S.plan = d.plan || [];
    if (he !== S.huellaEquipo){ S.huellaEquipo = he; renderEquipo(); }
    if (hp !== S.huellaPlan){ S.huellaPlan = hp; renderPlan(); }
    const hf = JSON.stringify(d.feriados || []);
    if (hf !== S.huellaFer){ S.huellaFer = hf; S.feriados = d.feriados || []; renderFeriados(); }
    S.fuera = !!d.fuera_horario; S.sinHorario = !!d.sin_horario;
    const hi = he + "|" + S.fuera + "|" + S.sinHorario;
    if (S.control && hi !== S.huellaInc){ S.huellaInc = hi; renderIncidencia(); }
    const cambioRep = hu !== S.huella || hp !== S.huellaRep;
    if (hu !== S.huella){ S.huella = hu; render(); }
    if (cambioRep){ S.huellaRep = hp; renderReportes(); }
    if ($("aviso").textContent.startsWith("No hay conexión")) aviso("");
  } catch (e){ if (S.token && !$("v-app").hidden) aviso(e.message); }
  cargando = false;
}

function fecha(iso){
  if (!iso) return "";
  const d = new Date(iso), p = n => String(n).padStart(2,"0");
  return p(d.getDate())+"-"+p(d.getMonth()+1)+"-"+d.getFullYear()+" "+p(d.getHours())+":"+p(d.getMinutes());
}
function fechaCorta(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso||"");
  return m ? m[3]+"-"+m[2]+"-"+m[1] : "";
}
function hoyIso(){
  const d = new Date(), p = n => String(n).padStart(2,"0");
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
}
function numTxt(n){ return "OT-" + String(n||0).padStart(4,"0"); }
function enFiltro(e){
  if (S.filtro === "todas") return true;
  if (S.filtro === "pendientes") return e === "asignada";
  if (S.filtro === "ejecucion") return e === "ejecucion" || e === "devuelta";   // una OT devuelta vuelve a manos del técnico
  return e === S.filtro;
}

/* ---------- aviso por WhatsApp ---------- */
function enlaceWhatsApp(o){
  const num = String(o.telefono || "").replace(/\D/g, "");
  if (num.length < 8) return null;
  const lineas = [
    "*Incidencia INC-" + String(o.numero || 0).padStart(4,"0") + " · Ruta de la Fruta*",
    "Informada: " + fecha(o.creada) + (o.creada_por ? " por " + o.creada_por : ""),
    o.ubicacion ? "Ubicación: " + o.ubicacion : null,
    "Qué pasa: " + o.detalle,
    "Plazo: cerrarla antes del " + fecha(plazoInc(o)),
    "Ciérrala aquí: " + location.origin + location.pathname
  ].filter(Boolean);
  return "https://wa.me/" + num + "?text=" + encodeURIComponent(lineas.join("\n"));
}

/* ---------- plazo de las incidencias ---------- */
// Cada incidencia tiene 24 horas de plazo desde que se informa. A las 12 horas sin cerrar pasa a alerta.
const PLAZO_INC_H = 24, ALERTA_INC_H = 12;
function horasInc(o){ return (Date.now() - new Date(o.creada)) / 3600000; }
function nivelInc(o){
  if (o.tipo !== "incidencia" || o.estado === "cerrada") return 0;
  const hs = horasInc(o);
  return hs >= PLAZO_INC_H ? 2 : hs >= ALERTA_INC_H ? 1 : 0;
}
function plazoInc(o){ return new Date(new Date(o.creada).getTime() + PLAZO_INC_H * 3600000); }
function firmaAlertas(){ return S.ordenes.map(o => nivelInc(o)).join(""); }
let ultimaFirma = "";
setInterval(() => {            // el paso del tiempo cambia las alertas aunque no cambien los datos
  if ($("v-app").hidden) return;
  const f = firmaAlertas();
  if (f !== ultimaFirma){ render(); renderReportes(); }
}, 60000);

/* ---------- render ---------- */
function render(){
  const act = document.activeElement, actId = act && act.id;
  let sel = null;
  try { if (actId && act.selectionStart != null) sel = [act.selectionStart, act.selectionEnd]; } catch(e){}

  const jefe = S.admin || S.control;
  const peso = jefe ? {revision:0, devuelta:1, ejecucion:2, asignada:3, cerrada:4} : {devuelta:0, ejecucion:1, asignada:2, revision:3, cerrada:4};
  ultimaFirma = firmaAlertas();
  const items = S.ordenes.slice().sort((a,b) => (jefe ? nivelInc(b) - nivelInc(a) : 0) || (peso[a.estado]-peso[b.estado]) || (new Date(b.creada) - new Date(a.creada)));
  const enAlerta = jefe ? items.filter(o => nivelInc(o) > 0) : [];
  const ban = $("alerta-inc");
  ban.hidden = !enAlerta.length;
  if (enAlerta.length){
    const venc = enAlerta.filter(o => nivelInc(o) === 2).length;
    ban.textContent = (enAlerta.length === 1 ? "1 incidencia lleva" : enAlerta.length + " incidencias llevan") + " más de " + ALERTA_INC_H + " horas sin cerrar" +
      (venc ? "; " + (venc === 1 ? "1 ya superó" : venc + " ya superaron") + " el plazo de " + PLAZO_INC_H + " horas." : ".");
  }
  const cuenta = {todas:items.length, pendientes:0, ejecucion:0, revision:0, cerrada:0};
  for (const o of items){
    if (o.estado === "asignada") cuenta.pendientes++; else if (o.estado === "devuelta") cuenta.ejecucion++; else cuenta[o.estado]++;
  }
  const f = $("filtros"); f.replaceChildren();
  const rotulos = [["todas","Todas"],["pendientes", jefe ? "Sin aceptar" : "Por aceptar"],["ejecucion","En ejecución"],
                   ["revision", jefe ? "Por revisar" : "Enviadas"],["cerrada","Cerradas"]];
  for (const [k, t] of rotulos){
    f.append(h("button", {class:"filtro", type:"button", id:"f-"+k, "aria-pressed": String(S.filtro===k),
      onclick: () => { S.filtro = k; render(); }}, h("b", null, cuenta[k]), h("span", null, t)));
  }
  const lista = $("lista"); lista.replaceChildren();
  const vis = items.filter(o => enFiltro(o.estado));
  if (!vis.length){
    lista.append(h("p", {class:"nota"},
      items.length ? "No hay órdenes en este estado."
      : S.control ? "No hay incidencias registradas."
      : S.admin ? "Todavía no has asignado órdenes de trabajo."
      : "No tienes órdenes de trabajo asignadas por ahora."));
  }
  for (const o of vis) lista.append(tarjeta(o));
  if (actId){
    const el = $(actId);
    if (el && el !== document.activeElement){ el.focus({preventScroll:true}); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch(e){} }
  }
}

function bloque(rot, ...kids){ return h("div", {class:"bloque"}, h("span", {class:"rot"}, rot), ...kids); }

function claveFoto(o, n){ return o.id + "|" + (o.enviado || "") + (n === 2 ? "|2" : ""); }
function imagen(o, n){
  if (!(n === 2 ? o.tiene_foto2 : o.tiene_foto)) return h("p", {class:"nota"}, "Sin foto.");
  const k = claveFoto(o, n);
  if (S.fotos[k]) return h("img", {class:"foto", alt:(n === 2 ? "Segunda foto" : "Foto") + " del trabajo realizado", src:S.fotos[k]});
  if (S.fotos[k] === "") return h("p", {class:"nota"}, "La foto no se pudo cargar.");
  if (!S.pidiendoFoto[k]){
    S.pidiendoFoto[k] = true;
    rpc("ot_foto", {p_token:S.token, p_ot:o.id, p_n:n === 2 ? 2 : 1})
      .then(d => { S.fotos[k] = (typeof d === "string" && d.startsWith("data:image/")) ? d : ""; })
      .catch(() => { S.fotos[k] = ""; })
      .then(() => { delete S.pidiendoFoto[k]; if (!$("v-app").hidden) render(); });
  }
  return h("p", {class:"nota"}, "Cargando foto…");
}

function tarjeta(o){
  const estado = o.estado, id = o.id, inc = o.tipo === "incidencia", jefe = S.admin || S.control;
  const necesitaAccion = (jefe && inc && estado !== "cerrada") || (S.admin ? estado === "revision" : S.control ? false : (estado === "asignada" || estado === "ejecucion" || estado === "devuelta"));
  const nivel = nivelInc(o), roja = jefe && nivel > 0;
  const rotEstado = roja ? (nivel === 2 ? "Plazo vencido" : "Sin cerrar hace " + Math.floor(horasInc(o)) + " h")
    : inc && estado === "asignada" ? "Abierta" : inc && estado === "devuelta" ? "Reabierta" : ESTADOS[estado];
  const abierto = (id in S.abiertos) ? S.abiertos[id] : necesitaAccion;
  const vencida = estado !== "cerrada" && o.fecha_limite && o.fecha_limite < hoyIso();
  const meta = h("div", {class:"meta"},
    jefe ? h("span", null, o.trabajador) : null,
    inc ? h("span", null, "Incidencia fuera de horario") : null,
    o.ubicacion ? h("span", null, o.ubicacion) : null,
    o.origen === "plan" ? h("span", null, "Preventivo") : null,
    o.origen === "ronda" ? h("span", null, "Ronda automática de turno") : null,
    !inc && o.prioridad && o.prioridad !== "Normal" ? h("span", null, "Prioridad " + o.prioridad.toLowerCase()) : null,
    o.fecha_limite ? h("span", {class: vencida ? "vencida" : null}, (vencida ? "Vencida el " : "Límite ") + fechaCorta(o.fecha_limite)) : null);
  const cab = h("button", {class:"ot-cab", type:"button", id:"cab-"+id, "aria-expanded": String(abierto),
    onclick: () => { S.abiertos[id] = !abierto; render(); }},
    h("div", {class:"ot-linea"}, h("span", {class:"num"}, (inc ? "INC-" : "OT-") + String(o.numero||0).padStart(4,"0")), h("span", {class:"pill " + (roja ? "e-devuelta" : "e-"+estado)}, rotEstado)),
    h("h3", null, o.titulo), meta);
  const card = h("article", {class:"ot e-"+estado + (roja ? " alerta" : "")}, cab);
  if (!abierto) return card;

  const cuerpo = h("div", {class:"ot-cuerpo"});
  if (o.actividad) cuerpo.append(bloque("Código de actividad", h("p", {class:"cod"}, o.actividad)));
  if (o.cantidad != null) cuerpo.append(bloque("Cantidad programada", h("p", {class:"cod"}, cantTxt(o.cantidad) + " " + (o.unidad || "UN"))));
  cuerpo.append(bloque(inc ? "Qué está pasando" : "Detalle del trabajo", h("p", null, o.detalle)));
  cuerpo.append(h("p", {class:"nota"}, inc ? "Informada el " + fecha(o.creada) + (o.creada_por ? " por " + o.creada_por : "") : "Asignada el " + fecha(o.creada)));
  if (o.aceptada) cuerpo.append(h("p", {class:"nota"}, "Aceptada el " + fecha(o.aceptada) + ", " + horasTxt(horasEntre(o.creada, o.aceptada)) + " después de " + (inc ? "informada" : "asignada") + "."));
  if (inc && estado !== "cerrada")
    cuerpo.append(h("p", {class: nivel ? "devol" : "nota"}, (nivel === 2 ? "Plazo vencido: había que cerrarla antes del " : "Plazo de " + PLAZO_INC_H + " horas: hay que cerrarla antes del ") + fecha(plazoInc(o)) + "."));
  if (inc && estado === "cerrada" && o.cerrada)
    cuerpo.append(h("p", {class:"nota"}, new Date(o.cerrada) <= plazoInc(o) ? "Cerrada dentro del plazo de " + PLAZO_INC_H + " horas." : "Cerrada fuera del plazo de " + PLAZO_INC_H + " horas."));
  if (estado === "devuelta" && o.nota_devolucion)
    cuerpo.append(h("div", {class:"devol"}, h("b", null, "Devuelta por el administrador: "), o.nota_devolucion));

  const editable = !jefe && (estado === "ejecucion" || estado === "devuelta");
  if (o.enviado && !editable){
    cuerpo.append(h("div", {class:"lista"},
      inc ? null : bloque("Código de actividad informado por el técnico", h("p", {class:"cod"}, o.codigo_actividad || "—")),
      bloque(inc ? "Cómo se resolvió" : "Trabajo realizado", h("p", null, o.descripcion_realizada || "—")),
      bloque(o.tiene_foto2 ? "Fotos" : "Foto", h("div", {class:"fotos"}, imagen(o, 1), o.tiene_foto2 ? imagen(o, 2) : null)),
      h("p", {class:"nota"}, (inc ? "Cierre informado el " : "Reporte enviado el ") + fecha(o.enviado))));
  }
  if (jefe && estado === "devuelta") cuerpo.append(h("p", {class:"nota"}, inc ? "Reabierta. Esperando que el técnico la cierre otra vez." : "Esperando que el técnico corrija y reenvíe."));
  if (jefe && estado === "asignada") cuerpo.append(h("p", {class:"nota"}, inc ? "El técnico de turno aún no la acepta." : "El técnico aún no acepta la OT."));
  if (jefe && estado === "ejecucion") cuerpo.append(h("p", {class:"nota"}, inc ? "En ejecución: el técnico de turno la aceptó y aún no la cierra." : "En ejecución: el técnico la aceptó y aún no envía su reporte."));
  if (!jefe && estado === "asignada"){
    cuerpo.append(h("div", {class:"acciones"},
      h("button", {class:"btn principal", type:"button", id:"ace-"+id, disabled:!!S.ocupado[id],
        onclick: () => accion(id, "ot_aceptar", {p_ot:id}, () => { S.abiertos[id] = true; })}, S.ocupado[id] ? "Aceptando…" : inc ? "Aceptar incidencia" : "Aceptar OT"),
      h("span", {class:"nota"}, "Al aceptarla queda en ejecución y podrás " + (inc ? "cerrarla." : "enviar tu reporte."))));
  }
  if (editable) cuerpo.append(formReporte(o));
  if (!jefe && estado === "revision") cuerpo.append(h("p", {class:"nota"}, "Reporte enviado. Falta que el administrador cierre la OT."));
  if (estado === "cerrada")
    cuerpo.append(bloque("Cierre", h("p", null, "Cerrada el " + fecha(o.cerrada) + (inc ? " por " + o.trabajador : "") + (o.nota_cierre ? "\n" + o.nota_cierre : ""))));
  if (inc && jefe && estado !== "cerrada"){
    const enlace = enlaceWhatsApp(o);
    cuerpo.append(enlace
      ? h("div", {class:"acciones"}, h("a", {class:"btn wa", id:"wa-"+id, href:enlace, target:"_blank", rel:"noopener"}, "Avisar por WhatsApp a " + o.trabajador),
          h("span", {class:"nota"}, "Se abre WhatsApp con el mensaje escrito; solo falta enviarlo."))
      : h("p", {class:"nota"}, "No se puede avisar por WhatsApp: falta el teléfono de " + o.trabajador + ". El administrador lo agrega en Equipo."));
  }
  if (S.errores[id]) cuerpo.append(h("p", {class:"mensaje"}, S.errores[id]));
  if (S.admin) cuerpo.append(accionesAdmin(o));
  card.append(cuerpo);
  return card;
}

function formReporte(o){
  const id = o.id, inc = o.tipo === "incidencia";
  const b = S.borradores[id] || (S.borradores[id] = {codigo:o.codigo_actividad||o.actividad||"", descripcion:o.descripcion_realizada||"", file:null, vista:null, file2:null, vista2:null});
  const ocupado = !!S.ocupado[id];
  const prev = b.vista ? h("img", {class:"foto", alt:"Foto seleccionada", src:b.vista}) : o.tiene_foto ? imagen(o, 1) : null;
  const prev2 = b.vista2 ? h("img", {class:"foto", alt:"Segunda foto seleccionada", src:b.vista2}) : o.tiene_foto2 ? imagen(o, 2) : null;
  const selCod = h("select", {id:"cod-"+id, required:true, onchange: ev => { b.codigo = ev.target.value; }});
  opcionesActividad(selCod, b.codigo);
  return h("form", {class:"lista", onsubmit: ev => { ev.preventDefault(); enviarReporte(o); }},
    h("span", {class:"bloque"}, h("span", {class:"rot"}, inc ? "Cierre de la incidencia" : "Tu reporte")),
    inc ? null : h("label", {for:"cod-"+id}, "Código de actividad realizado", selCod),
    h("label", {for:"des-"+id}, inc ? "Cómo se resolvió" : "Descripción del trabajo realizado",
      h("textarea", {id:"des-"+id, required:true, maxlength:"4000", value:b.descripcion,
        oninput: ev => { b.descripcion = ev.target.value; }})),
    h("label", {for:"fot-"+id}, prev ? "Cambiar foto" : inc ? "Foto (opcional)" : "Foto del trabajo",
      h("input", {id:"fot-"+id, type:"file", accept:"image/*",
        onchange: ev => {
          const file = ev.target.files && ev.target.files[0];
          if (!file) return;
          if (b.vista) URL.revokeObjectURL(b.vista);
          b.file = file; b.vista = URL.createObjectURL(file); render();
        }})),
    prev,
    h("label", {for:"fo2-"+id}, prev2 ? "Cambiar segunda foto" : "Segunda foto (opcional)",
      h("input", {id:"fo2-"+id, type:"file", accept:"image/*",
        onchange: ev => {
          const file = ev.target.files && ev.target.files[0];
          if (!file) return;
          if (b.vista2) URL.revokeObjectURL(b.vista2);
          b.file2 = file; b.vista2 = URL.createObjectURL(file); render();
        }})),
    prev2,
    h("div", {class:"acciones"},
      h("button", {class:"btn principal", type:"submit", id:"env-"+id, disabled:ocupado},
        ocupado ? "Enviando…" : inc ? "Cerrar incidencia" : o.enviado ? "Reenviar reporte" : "Enviar reporte")));
}

function accionesAdmin(o){
  const id = o.id, estado = o.estado, ocupado = !!S.ocupado[id];
  const caja = h("div", {class:"lista"});
  if (estado === "revision"){
    caja.append(h("label", {for:"nota-"+id}, "Nota (obligatoria si devuelves la OT)",
      h("textarea", {id:"nota-"+id, maxlength:"1000", value:S.notas[id]||"", style:"min-height:60px",
        oninput: ev => { S.notas[id] = ev.target.value; }})));
  }
  const fila = h("div", {class:"acciones"});
  if (estado === "revision"){
    fila.append(h("button", {class:"btn principal", type:"button", id:"cer-"+id, disabled:ocupado,
      onclick: () => accion(id, "ot_cerrar", {p_ot:id, p_nota:S.notas[id]||""}, () => { delete S.notas[id]; delete S.abiertos[id]; })}, "Cerrar OT"));
    fila.append(h("button", {class:"btn", type:"button", id:"dev-"+id, disabled:ocupado,
      onclick: () => {
        if (!(S.notas[id]||"").trim()){ S.errores[id] = "Escribe en la nota qué debe corregir el técnico."; render(); return; }
        accion(id, "ot_devolver", {p_ot:id, p_nota:S.notas[id]}, () => { delete S.notas[id]; });
      }}, "Devolver al técnico"));
  }
  if (estado === "cerrada"){
    fila.append(h("button", {class:"btn", type:"button", id:"rea-"+id, disabled:ocupado,
      onclick: () => accion(id, "ot_reabrir", {p_ot:id})}, "Reabrir OT"));
  }
  if (S.confirmar[id]){
    fila.append(h("button", {class:"btn peligro", type:"button", id:"eli2-"+id, disabled:ocupado,
      onclick: () => accion(id, "ot_eliminar", {p_ot:id}, () => { delete S.confirmar[id]; })}, "Sí, eliminar esta OT"),
      h("button", {class:"btn", type:"button", id:"can-"+id, onclick: () => { delete S.confirmar[id]; render(); }}, "Cancelar"));
  } else {
    fila.append(h("button", {class:"btn peligro", type:"button", id:"eli-"+id,
      onclick: () => { S.confirmar[id] = true; render(); }}, "Eliminar"));
  }
  caja.append(fila);
  return caja;
}

async function accion(id, fn, args, alTerminar){
  if (S.ocupado[id]) return;
  S.ocupado[id] = true; delete S.errores[id]; render();
  try { await rpc(fn, Object.assign({p_token:S.token}, args)); if (alTerminar) alTerminar(); }
  catch (e){ S.errores[id] = e.message; }
  delete S.ocupado[id];
  await cargar(); render();
}

/* ---------- fotos ---------- */
async function aJpegDataUrl(file, lado, calidad){
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const s = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth*s)); c.height = Math.max(1, Math.round(img.naturalHeight*s));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", calidad);
  } finally { URL.revokeObjectURL(url); }
}
async function prepararFoto(file){
  for (const [lado, q] of [[1280,.72],[1100,.64],[900,.56],[720,.5],[560,.45]]){
    const d = await aJpegDataUrl(file, lado, q);
    if (d.startsWith("data:image/jpeg;base64,") && d.length <= 420000) return d;
  }
  throw new Error("foto");
}
async function enviarReporte(o){
  const id = o.id, b = S.borradores[id], inc = o.tipo === "incidencia";
  if (!b || S.ocupado[id]) return;
  if (inc && !b.descripcion.trim()){ S.errores[id] = "Describe cómo se resolvió la incidencia."; render(); return; }
  if (!inc && (!b.codigo.trim() || !b.descripcion.trim())){ S.errores[id] = "Completa el código de actividad y la descripción."; render(); return; }
  if (!inc && !b.file && !o.tiene_foto){ S.errores[id] = "Agrega una foto del trabajo antes de enviar."; render(); return; }
  S.ocupado[id] = true; delete S.errores[id]; render();
  try {
    let foto = null, foto2 = null;
    try {
      if (b.file) foto = await prepararFoto(b.file);
      if (b.file2) foto2 = await prepararFoto(b.file2);
    } catch (e){ throw new Error("No se pudo procesar la foto. Prueba con otra imagen en JPG o PNG."); }
    await rpc("ot_reportar", {p_token:S.token, p_ot:id, p_codigo:inc ? null : b.codigo, p_descripcion:b.descripcion, p_foto:foto, p_foto2:foto2});
    if (b.vista) URL.revokeObjectURL(b.vista);
    if (b.vista2) URL.revokeObjectURL(b.vista2);
    delete S.borradores[id]; delete S.abiertos[id];
  } catch (e){ S.errores[id] = e.message; }
  delete S.ocupado[id];
  await cargar(); render();
}

/* ---------- equipo ---------- */
function claveAzar(){
  const abc = "abcdefghjkmnpqrstuvwxyz23456789", v = new Uint32Array(10);
  crypto.getRandomValues(v);
  return Array.from(v, n => abc[n % abc.length]).join("");
}
function renderEquipo(){
  if (!S.admin) return;
  const activos = S.trabajadores.filter(t => t.activo && t.rol !== "control");
  $("equipo-titulo").textContent = "Equipo (" + S.trabajadores.length + ")";
  const sel = $("n-trab"), previo = sel.value;
  sel.replaceChildren(h("option", {value:""}, "Elige un técnico"));
  for (const t of activos) sel.append(h("option", {value:t.id}, t.nombre));
  if (previo && activos.some(t => t.id === previo)) sel.value = previo;

  const tur = $("turnos-lista"); tur.replaceChildren();
  const conTec = (S.turnos || []).filter(x => x.tecnico);
  if (!conTec.length) tur.append(h("p", {class:"nota"}, "Ningún técnico está en la rotación de turnos. Incluye al menos a uno."));
  else tur.append(h("div", {class:"tabla-caja"}, h("table", {class:"rep"},
    h("thead", null, h("tr", null, h("th", {scope:"col"}, "Turno de emergencia"), h("th", {scope:"col"}, "Técnico"))),
    h("tbody", null, conTec.map((x, i) => h("tr", null,
      h("td", null, "Viernes " + fechaCorta(x.desde) + " 14:30 al viernes " + fechaCorta(x.hasta) + " 8:29" + (i === 0 ? " (vigente)" : "")),
      h("td", null, x.tecnico)))))));

  const lista = $("equipo-lista"); lista.replaceChildren();
  for (const t of S.trabajadores){
    const estado = !t.activo ? "Desactivado" : t.sin_clave ? "Sin contraseña: entrégale una clave temporal"
                 : t.debe_cambiar ? "Tiene clave temporal; falta que cree la suya" : "Activo";
    const inp = h("input", {id:"tc-"+t.id, maxlength:"60", placeholder:"Clave temporal nueva"});
    const tel = h("input", {id:"tf-"+t.id, type:"tel", maxlength:"20", value:t.telefono || "", placeholder:"+56912345678"});
    const est = h("span", {class:"nota"});
    const hacer = async (btn, fn, args, ok) => {
      btn.disabled = true; est.textContent = "Guardando…";
      try { await rpc(fn, Object.assign({p_token:S.token, p_id:t.id}, args)); est.textContent = ok; await cargar(); }
      catch (e){ est.textContent = e.message; }
      btn.disabled = false;
    };
    lista.append(h("div", {class:"trab"},
      h("div", {class:"trab-cab"}, h("b", null, t.nombre), h("span", {class:"usr"}, "Usuario: " + t.usuario + (t.rol === "control" ? " · Centro de control" + (t.sin_horario ? " · Sin límite de horario" : "") : t.de_turno ? " · De turno ahora" : t.en_turnos ? " · Hace turnos" : ""))),
      h("span", {class:"nota"}, estado),
      h("label", {for:"tf-"+t.id}, "Teléfono para WhatsApp (con código de país)", tel),
      h("div", {class:"acciones"},
        h("button", {class:"btn chico", type:"button", id:"tfg-"+t.id, onclick: ev => hacer(ev.target, "ot_telefono", {p_telefono:tel.value}, "Teléfono guardado.")}, "Guardar teléfono")),
      h("label", {for:"tc-"+t.id}, "Clave temporal (mínimo 8 caracteres)", inp),
      h("div", {class:"acciones"},
        h("button", {class:"btn chico", type:"button", id:"tg-"+t.id, onclick: () => { inp.value = claveAzar(); est.textContent = "Anótala antes de guardar: después no se puede ver."; }}, "Generar"),
        h("button", {class:"btn chico", type:"button", id:"ts-"+t.id, onclick: ev => {
          const c = inp.value;
          if (c.length < 8){ est.textContent = "La clave temporal debe tener al menos 8 caracteres."; return; }
          hacer(ev.target, "ot_clave_trabajador", {p_clave:c}, "Clave temporal guardada: " + c);
        }}, "Guardar clave temporal"),
        t.rol === "control" ? h("button", {class:"btn chico", type:"button", id:"th-"+t.id,
          onclick: ev => hacer(ev.target, "ot_sin_horario", {p_valor:!t.sin_horario}, "")}, t.sin_horario ? "Limitar al horario" : "Permitir a cualquier hora")
        : h("button", {class:"btn chico", type:"button", id:"tt-"+t.id,
          onclick: ev => hacer(ev.target, "ot_turno", {p_turno:!t.en_turnos}, "")}, t.en_turnos ? "Sacar de los turnos" : "Incluir en los turnos"),
        t.rol !== "control" && t.en_turnos && t.activo && !t.de_turno ? h("button", {class:"btn chico", type:"button", id:"tn-"+t.id,
          onclick: ev => hacer(ev.target, "ot_turno_fijar", {}, "")}, "Dejar de turno ahora") : null,
        h("button", {class:"btn chico" + (t.activo ? " peligro" : ""), type:"button", id:"ta-"+t.id,
          onclick: ev => hacer(ev.target, "ot_activar_trabajador", {p_activo:!t.activo}, "")}, t.activo ? "Desactivar" : "Activar")),
      est));
  }
}
$("form-trab").addEventListener("submit", async ev => {
  ev.preventDefault();
  const est = $("t-estado"), u = $("t-usuario").value, c = $("t-clave").value;
  $("t-enviar").disabled = true; est.textContent = "Guardando…";
  try {
    await rpc("ot_crear_trabajador", {p_token:S.token, p_usuario:u, p_nombre:$("t-nombre").value, p_clave:c, p_rol:$("t-rol").value});
    est.textContent = "Usuario agregado. Usuario: " + u.trim().toLowerCase() + " · Clave temporal: " + c;
    $("t-nombre").value = $("t-usuario").value = $("t-clave").value = "";
    await cargar();
  } catch (e){ est.textContent = e.message; }
  $("t-enviar").disabled = false;
});

$("form-nueva").addEventListener("submit", async ev => {
  ev.preventDefault();
  const wid = $("n-trab").value, btn = $("n-enviar"), est = $("n-estado");
  if (!wid){ est.textContent = "Elige un técnico."; return; }
  let act = $("n-act").value;
  if (!act){ est.textContent = "Elige el código de actividad."; return; }
  if (act === OTROS){
    const nuevo = $("n-act-otro").value.trim().replace(/\s+/g, " ");
    if (!nuevo){ est.textContent = "Escribe el código nuevo de actividad."; $("n-act-otro").focus(); return; }
    act = "Otros · " + nuevo;
  }
  btn.disabled = true; est.textContent = "Guardando…";
  try {
    const n = await rpc("ot_crear", {p_token:S.token, p_trabajador:wid, p_actividad:act, p_titulo:$("n-titulo").value, p_detalle:$("n-detalle").value,
      p_ubicacion:$("n-lugar").value, p_prioridad:$("n-prio").value, p_fecha:$("n-fecha").value || null});
    const t = S.trabajadores.find(x => x.id === wid);
    est.textContent = numTxt(n) + " asignada" + (t ? " a " + t.nombre : "") + ".";
    for (const k of ["n-titulo","n-detalle","n-lugar","n-fecha"]) $(k).value = "";
    $("n-prio").value = "Normal"; $("n-act").value = ""; $("n-act-otro").value = ""; $("n-act-otro-caja").hidden = true;
    await cargar();
  } catch (e){ est.textContent = e.message; }
  btn.disabled = false;
});

// "Otros": el administrador escribe a mano un código de actividad que no está en la lista.
const OTROS = "__otros__";
opcionesActividad($("n-act"), "");
$("n-act").append(h("option", {value:OTROS}, "Otros (escribir un código nuevo)"));
$("n-act").addEventListener("change", () => {
  const otro = $("n-act").value === OTROS;
  $("n-act-otro-caja").hidden = !otro;
  if (otro) $("n-act-otro").focus();
});

/* ---------- incidencias (centro de control) ---------- */
function renderIncidencia(){
  const sel = $("i-trab"), previo = sel.value;
  const deTurno = S.trabajadores.find(t => t.de_turno);
  sel.replaceChildren(h("option", {value:""}, "Elige al técnico de turno"));
  for (const t of S.trabajadores) sel.append(h("option", {value:t.id}, t.nombre + (t.de_turno ? " (de turno)" : "")));
  if (previo && previo !== S.turnoAuto && S.trabajadores.some(t => t.id === previo)) sel.value = previo;   // respeta un cambio hecho a mano
  else sel.value = deTurno ? deTurno.id : "";
  S.turnoAuto = deTurno ? deTurno.id : "";
  $("i-turno").textContent = deTurno ? "De turno esta semana: " + deTurno.nombre + ". Queda elegido automáticamente." : "No hay un técnico de turno definido. Avisa al administrador.";
  $("i-enviar").disabled = !S.fuera;
  $("i-horario").textContent = S.sinHorario
    ? "Esta cuenta puede crear incidencias a cualquier hora."
    : S.fuera
    ? "Estás fuera del horario laboral: puedes crear incidencias para el personal de turno."
    : "Ahora es horario laboral (lunes a jueves de 8:30 a 18:30, viernes de 8:30 a 14:30). Las incidencias solo se pueden crear fuera de ese horario, o en fin de semana y feriados.";
}
$("form-inc").addEventListener("submit", async ev => {
  ev.preventDefault();
  const est = $("i-estado"), wid = $("i-trab").value;
  if (!wid){ est.textContent = "Elige al técnico de turno."; return; }
  $("i-enviar").disabled = true; est.textContent = "Enviando…";
  try {
    const n = await rpc("ot_incidencia_crear", {p_token:S.token, p_trabajador:wid, p_descripcion:$("i-desc").value, p_ubicacion:$("i-lugar").value});
    const t = S.trabajadores.find(x => x.id === wid);
    est.textContent = "INC-" + String(n).padStart(4,"0") + " enviada" + (t ? " a " + t.nombre : "") + ". Avísale por WhatsApp con el botón de la incidencia.";
    $("i-desc").value = $("i-lugar").value = "";
    await cargar();
    const nueva = S.ordenes.find(o => o.tipo === "incidencia" && o.numero === n);
    if (nueva){ S.abiertos[nueva.id] = true; render(); }
  } catch (e){ est.textContent = e.message; }
  $("i-enviar").disabled = !S.fuera;
});

/* ---------- panel del administrador ---------- */
function isoLocal(v){
  if (!v) return "";
  const d = new Date(v), p = n => String(n).padStart(2,"0");
  return isNaN(d) ? "" : d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
}
function sumarIso(iso, n){ const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }
function lunesDe(iso){ const d = new Date(iso + "T12:00:00Z"); return sumarIso(iso, -((d.getUTCDay() + 6) % 7)); }
function semanaIso(iso){
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);            // jueves de esa semana
  const ene4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4, 12));
  return 1 + Math.round(((d - ene4) / 86400000 - 3 + ((ene4.getUTCDay() + 6) % 7)) / 7);
}
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
function mesTxt(clave){ return MESES[Number(clave.slice(5,7)) - 1] + " " + clave.slice(0,4); }
function hecha(o){ return o.tipo === "incidencia" ? o.estado === "cerrada" : (o.estado === "revision" || o.estado === "cerrada"); }
function fechaHecha(o){ return isoLocal(o.tipo === "incidencia" ? o.cerrada : o.enviado); }
function diaRef(o){ return o.fecha_limite || isoLocal(o.creada); }      // día al que pertenece el trabajo
function pct(h, p){ return p ? Math.round(100 * h / p) + " %" : "—"; }
function horasEntre(a, b){ return (new Date(b) - new Date(a)) / 3600000; }
function prom(lista){ return lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : null; }
function horasTxt(x){
  if (x == null) return "—";
  const d = n => String(Math.round(n * 10) / 10).replace(".", ",");
  return x < 1 ? Math.round(x * 60) + " min" : x < 48 ? d(x) + " h" : d(x / 24) + " días";
}
function tabla(cabeceras, filas, vacio){
  if (!filas.length) return h("p", {class:"nota"}, vacio);
  return h("div", {class:"tabla-caja"}, h("table", {class:"rep"},
    h("thead", null, h("tr", null, cabeceras.map((c, i) => h("th", {class: i ? "num-cel" : null, scope:"col"}, c)))),
    h("tbody", null, filas.map(f => h("tr", null, f.map((c, i) => h("td", {class: i ? "num-cel" : null}, c)))))));
}
// Preventivos programados: las OT que ya generó el plan más lo que aún falta por generar.
function preventivos(){
  const out = S.ordenes.filter(o => o.origen === "plan" && o.fecha_limite)
    .map(o => ({fecha:o.fecha_limite, tecnico:o.trabajador, hecha:hecha(o)}));
  for (const p of S.plan) out.push({fecha:p.fecha, tecnico:p.tecnico, hecha:false});
  return out;
}

// Etiqueta flotante de los gráficos: el valor va primero y en negrita.
function conTip(el, titulo, lineas){
  const tip = $("tip");
  const mostrar = (x, y) => {
    tip.replaceChildren(h("span", {class:"tip-t"}, titulo), ...lineas.map(l => h("span", null, h("b", null, l[1]), " " + l[0])));
    tip.hidden = false;
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + "px";
    tip.style.top = Math.max(8, y - hh - 12) + "px";
  };
  el.addEventListener("pointermove", ev => mostrar(ev.clientX, ev.clientY));
  el.addEventListener("pointerleave", () => { tip.hidden = true; });
  el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); mostrar(r.left + r.width / 2, r.top); });
  el.addEventListener("blur", () => { tip.hidden = true; });
}
function techo(max){
  if (max <= 4) return 4;
  if (max <= 10) return 2 * Math.ceil(max / 2);
  const paso = Math.pow(10, Math.floor(Math.log10(max))) / (max / Math.pow(10, Math.floor(Math.log10(max))) < 3 ? 5 : 1);
  return 2 * paso * Math.ceil(max / (2 * paso));
}
// Columnas sobre una sola línea base. bandas: [{rotulo, titulo, valores:[...]}]; series: [{nombre, clase}]
function graficoColumnas(bandas, series, cadaRotulo){
  const tope = techo(Math.max(0, ...bandas.flatMap(b => b.valores)));
  const plot = h("div", {class:"g-plot"});
  for (const f of [1, .5, 0]) plot.append(h("div", {class:"g-grid" + (f ? "" : " g-base"), style:"bottom:" + (f * 100) + "%"}, h("span", null, String(Math.round(tope * f)))));
  const fila = h("div", {class:"g-bandas"});
  bandas.forEach(b => {
    const lineas = series.map((s, j) => [s.nombre, String(b.valores[j])]);
    const grupo = h("div", {class:"g-banda", tabindex:"0", role:"img", "aria-label": b.titulo + ": " + lineas.map(l => l[1] + " " + l[0]).join(", ")},
      b.valores.map((v, k) => h("div", {class:"g-bar " + series[k].clase, style:"height:" + (v / tope * 100) + "%"})));
    conTip(grupo, b.titulo, lineas);
    fila.append(grupo);
  });
  plot.append(fila);
  return h("div", {class:"grafico"},
    series.length > 1 ? h("div", {class:"g-ley"}, series.map(s => h("span", null, h("i", {class:s.clase}), s.nombre))) : null,
    plot,
    h("div", {class:"g-x"}, bandas.map((b, i) => h("span", null, i % cadaRotulo === 0 ? b.rotulo : ""))));
}
function tile(rotulo, valor, detalle, principal){
  return h("div", {class:"tile" + (principal ? " hero" : "")}, h("span", {class:"tile-r"}, rotulo), h("span", {class:"tile-v"}, valor), h("span", {class:"tile-d"}, detalle));
}

function renderReportes(){
  if (!S.admin) return;
  const hoy = hoyIso();
  if (!$("r-mes").value) $("r-mes").value = hoy.slice(0,7);
  const mes = $("r-mes").value || hoy.slice(0,7), caja = $("r-cuerpo"); caja.replaceChildren();

  // Alertas: lo que venció sin que el técnico lo realizara (no dependen del mes elegido).
  const alertas = [];
  for (const o of S.ordenes){
    if (o.tipo === "incidencia"){
      const nv = nivelInc(o);
      if (nv) alertas.push([isoLocal(o.creada), o.trabajador + " no ha cerrado la incidencia INC-" + String(o.numero).padStart(4,"0") + ", informada el " + fecha(o.creada) +
        (nv === 2 ? ". Superó el plazo de " + PLAZO_INC_H + " horas." : ". Lleva más de " + ALERTA_INC_H + " horas; el plazo vence el " + fecha(plazoInc(o)) + ".")]);
    } else if (o.fecha_limite && o.fecha_limite < hoy && !hecha(o)){
      alertas.push([o.fecha_limite, o.trabajador + " no realizó " + numTxt(o.numero) + " (" + (o.actividad || o.titulo) + "), programada para el " + diaTxt(o.fecha_limite).toLowerCase() +
        (o.estado === "devuelta" ? ". Está devuelta para corregir." : ".")]);
    }
  }
  alertas.sort((x, y) => x[0] < y[0] ? 1 : -1);
  $("nav-panel").textContent = "Panel" + (alertas.length ? " (" + alertas.length + ")" : "");

  // Datos del mes elegido.
  const ots = S.ordenes.filter(o => o.tipo !== "incidencia" && diaRef(o).slice(0,7) === mes);
  const porGenerar = S.plan.filter(p => p.fecha.slice(0,7) === mes);
  const hechas = ots.filter(hecha);
  const prev = preventivos(), prevMes = prev.filter(p => p.fecha.slice(0,7) === mes), prevHechos = prevMes.filter(p => p.hecha).length;
  const abiertas = S.ordenes.filter(o => o.tipo !== "incidencia" && !hecha(o));
  const incs = S.ordenes.filter(o => o.tipo === "incidencia" && isoLocal(o.creada).slice(0,7) === mes), incHechas = incs.filter(hecha);
  const horasOt = lista => prom(lista.filter(o => o.enviado).map(o => horasEntre(o.creada, o.enviado)));
  // Tiempos por etapa: solo cuentan las OT que el técnico aceptó con el botón (las anteriores no tienen esa hora).
  const tAceptar = lista => prom(lista.filter(o => o.aceptada).map(o => horasEntre(o.creada, o.aceptada)));
  const tEjecutar = lista => prom(lista.filter(o => o.aceptada && o.enviado && hecha(o)).map(o => horasEntre(o.aceptada, o.enviado)));
  const tCerrar = lista => prom(lista.filter(o => o.enviado && o.cerrada && o.estado === "cerrada").map(o => horasEntre(o.enviado, o.cerrada)));
  const tTotal = lista => prom(lista.filter(o => o.cerrada && o.estado === "cerrada").map(o => horasEntre(o.creada, o.cerrada)));
  const enEjec = S.ordenes.filter(o => o.estado === "ejecucion");

  caja.append(h("div", {class:"tiles"},
    tile("Cumplimiento preventivo, " + mesTxt(mes).toLowerCase(), pct(prevHechos, prevMes.length), prevHechos + " de " + prevMes.length + " preventivos realizados", true),
    tile("OT realizadas", String(hechas.length), "de " + (ots.length + porGenerar.length) + " asignadas en el mes"),
    tile("Horas promedio abiertas", horasTxt(horasOt(hechas)), "desde que se asigna hasta el reporte"),
    tile("OT abiertas ahora", String(abiertas.length), abiertas.length ? "antigüedad promedio " + horasTxt(prom(abiertas.map(o => horasEntre(o.creada, Date.now())))) : "nada pendiente"),
    tile("Incidencias atendidas", incHechas.length + " de " + incs.length, incHechas.length ? "cierre promedio en " + horasTxt(prom(incHechas.map(o => horasEntre(o.creada, o.cerrada)))) : "sin cierres en el mes"),
    tile("Alertas", String(alertas.length), alertas.length ? "revísalas más abajo" : "sin trabajos vencidos")));

  caja.append(h("h3", null, "Tiempos de las OT, " + mesTxt(mes).toLowerCase()));
  caja.append(h("div", {class:"tiles"},
    tile("Espera hasta aceptar", horasTxt(tAceptar(ots)), "desde que se crea la OT hasta que el técnico la acepta"),
    tile("Tiempo en ejecución", horasTxt(tEjecutar(ots)), "desde que la acepta hasta que envía su reporte"),
    tile("Espera hasta el cierre", horasTxt(tCerrar(ots)), "desde el reporte hasta que la cierras"),
    tile("Total, de creada a cerrada", horasTxt(tTotal(ots)), "promedio de las OT cerradas del mes"),
    tile("En ejecución ahora", String(enEjec.length), enEjec.length ? "aceptadas y sin reporte todavía" : "ninguna en este momento"),
    tile("Incidencias: espera hasta aceptar", horasTxt(tAceptar(incs)), "desde que se informa hasta que el técnico de turno la acepta")));

  caja.append(h("h3", null, "Alertas"));
  if (!alertas.length) caja.append(h("p", {class:"nota"}, "Sin alertas: no hay trabajos vencidos sin realizar ni incidencias abiertas hace más de 12 horas."));
  else {
    caja.append(h("div", {class:"lista"}, alertas.slice(0, 5).map(al => h("p", {class:"mensaje"}, al[1]))));
    if (alertas.length > 5) caja.append(h("details", null, h("summary", {class:"mas"}, "Ver las otras " + (alertas.length - 5) + " alertas"),
      h("div", {class:"lista"}, alertas.slice(5).map(al => h("p", {class:"mensaje"}, al[1])))));
  }

  // Trabajos realizados por día del mes (OT e incidencias, según el día en que el técnico los informó).
  const diasMes = new Date(Number(mes.slice(0,4)), Number(mes.slice(5,7)), 0).getDate();
  const porDia = Array.from({length:diasMes}, (_, i) => {
    const dia = mes + "-" + String(i + 1).padStart(2,"0");
    return {rotulo:String(i + 1), titulo:diaTxt(dia), valores:[S.ordenes.filter(o => hecha(o) && fechaHecha(o) === dia).length]};
  });
  caja.append(h("h3", null, "Trabajos realizados por día, " + mesTxt(mes).toLowerCase()));
  caja.append(graficoColumnas(porDia, [{nombre:"trabajos realizados", clase:"s-real"}], 5));

  // Preventivos por semana (hasta hoy).
  const grupos = (clave) => {
    const g = {};
    for (const p of prev){ const k = clave(p.fecha); (g[k] = g[k] || {p:0, h:0}); g[k].p++; if (p.hecha) g[k].h++; }
    return Object.keys(g).filter(k => k <= clave(hoy)).sort().reverse().slice(0, 8).map(k => [k, g[k]]);
  };
  const sem = grupos(lunesDe), meses = grupos(f => f.slice(0,7));
  caja.append(h("h3", null, "Preventivos programados y realizados por semana"));
  if (!sem.length) caja.append(h("p", {class:"nota"}, "Todavía no hay trabajos preventivos programados hasta esta semana."));
  else caja.append(graficoColumnas(sem.slice().reverse().map(([k, v]) => ({rotulo:"Sem. " + semanaIso(k), titulo:"Semana " + semanaIso(k) + " (" + fechaCorta(k) + " al " + fechaCorta(sumarIso(k, 6)) + ")", valores:[v.p, v.h]})),
    [{nombre:"programados", clase:"s-prog"}, {nombre:"realizados", clase:"s-real"}], 1));

  // Rendimiento por técnico en el mes.
  const tecnicos = [...new Set(S.trabajadores.filter(t => t.rol !== "control").map(t => t.nombre).concat(S.ordenes.map(o => o.trabajador)))].sort();
  const rend = tecnicos.map(t => {
    const mias = ots.filter(o => o.trabajador === t), mh = mias.filter(hecha), conPlazo = mh.filter(o => o.fecha_limite && o.enviado);
    const mInc = incs.filter(o => o.trabajador === t), mIncH = mInc.filter(hecha);
    return {t, asignadas:mias.length + porGenerar.filter(p => p.tecnico === t).length, hechas:mh.length,
      aTiempo:conPlazo.length ? pct(conPlazo.filter(o => isoLocal(o.enviado) <= o.fecha_limite).length, conPlazo.length) : "—",
      horas:horasTxt(horasOt(mh)), acepta:horasTxt(tAceptar(mias)), ejecuta:horasTxt(tEjecutar(mias)), devueltas:mias.filter(o => o.nota_devolucion).length,
      inc:mIncH.length + " de " + mInc.length, horasInc:horasTxt(prom(mIncH.map(o => horasEntre(o.creada, o.cerrada))))};
  });
  caja.append(h("h3", null, "Rendimiento por técnico, " + mesTxt(mes).toLowerCase()));
  if (!rend.length) caja.append(h("p", {class:"nota"}, "Todavía no hay técnicos."));
  else {
    caja.append(h("div", {class:"medidores"}, rend.map(r => h("div", {class:"medidor"},
      h("span", {class:"med-n"}, r.t),
      h("div", {class:"meter", role:"img", "aria-label": r.t + ": " + r.hechas + " de " + r.asignadas + " OT realizadas"}, h("i", {style:"width:" + (r.asignadas ? Math.min(100, 100 * r.hechas / r.asignadas) : 0) + "%"})),
      h("span", {class:"med-v"}, r.asignadas ? r.hechas + " de " + r.asignadas + " (" + pct(r.hechas, r.asignadas) + ")" : "sin OT")))));
    caja.append(tabla(["Técnico", "OT asignadas", "Realizadas", "Cumplimiento", "A tiempo", "Espera hasta aceptar", "Tiempo en ejecución", "Horas promedio abiertas", "Devueltas", "Incidencias atendidas", "Cierre promedio de incidencia"],
      rend.map(r => [r.t, r.asignadas, r.hechas, pct(r.hechas, r.asignadas), r.aTiempo, r.acepta, r.ejecuta, r.horas, r.devueltas, r.inc, r.horasInc]), ""));
  }

  // Incidencias por centro de control en el mes.
  const centros = [...new Set(incs.map(o => o.creada_por || "Sin nombre"))].sort();
  caja.append(h("h3", null, "Incidencias por centro de control, " + mesTxt(mes).toLowerCase()));
  caja.append(tabla(["Centro de control", "Informadas", "Atendidas", "Abiertas", "Dentro del plazo de 24 h"], centros.map(c => {
    const m = incs.filter(o => (o.creada_por || "Sin nombre") === c), at = m.filter(hecha);
    return [c, m.length, at.length, m.length - at.length, at.length ? pct(at.filter(o => new Date(o.cerrada) <= plazoInc(o)).length, at.length) : "—"];
  }), "No hay incidencias en este mes."));

  // Cumplimiento del plan preventivo en tablas.
  const filasCump = (lista, rotulo) => lista.map(([k, v]) => [rotulo(k), v.p, v.h, v.p - v.h, pct(v.h, v.p)]);
  caja.append(h("h3", null, "Cumplimiento preventivo semanal"));
  caja.append(tabla(["Semana", "Programados", "Realizados", "Pendientes", "Cumplimiento"],
    filasCump(sem, k => "Semana " + semanaIso(k) + " (" + fechaCorta(k) + " al " + fechaCorta(sumarIso(k, 6)) + ")"), "Todavía no hay trabajos preventivos programados hasta esta semana."));
  caja.append(h("h3", null, "Cumplimiento preventivo mensual"));
  caja.append(tabla(["Mes", "Programados", "Realizados", "Pendientes", "Cumplimiento"], filasCump(meses, mesTxt), "Todavía no hay trabajos preventivos programados hasta este mes."));
  caja.append(h("p", {class:"nota"}, "Un trabajo cuenta como realizado cuando el técnico envió su reporte, aunque todavía no lo hayas cerrado. Las horas abiertas van desde que la OT se asigna hasta ese reporte. Los tiempos por etapa solo cuentan las OT aceptadas con el botón Aceptar. Cada OT pertenece al mes de su fecha límite, o al de su creación si no tiene. El mes en curso incluye lo programado para los días que faltan."));
}
$("r-mes").addEventListener("change", () => { $("inf-enlaces").replaceChildren(); $("inf-estado").textContent = ""; renderReportes(); });

/* ---------- informe mensual con fotos ---------- */
function esc(t){ return String(t == null ? "" : t).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function aDataUrl(blob){ return new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(blob); }); }
async function fotoDe(o, n){
  const k = claveFoto(o, n);
  if (S.fotos[k]) return S.fotos[k];
  try { const d = await rpc("ot_foto", {p_token:S.token, p_ot:o.id, p_n:n === 2 ? 2 : 1}); if (typeof d === "string" && d.startsWith("data:image/")) return d; } catch (e){}
  return "";
}
let urlInforme = null;
async function generarInforme(){
  const mes = $("r-mes").value || hoyIso().slice(0,7), est = $("inf-estado"), btn = $("inf-generar"), enl = $("inf-enlaces");
  const trabajos = S.ordenes.filter(o => diaRef(o).slice(0,7) === mes || (hecha(o) && fechaHecha(o).slice(0,7) === mes))
    .sort((a, b) => diaRef(a) < diaRef(b) ? -1 : diaRef(a) > diaRef(b) ? 1 : (a.numero - b.numero));
  enl.replaceChildren();
  if (!trabajos.length){ est.textContent = "No hay trabajos en " + mesTxt(mes).toLowerCase() + "."; return; }
  btn.disabled = true;
  try {
    // Fotos: de a cuatro a la vez, mostrando el avance.
    const conFoto = trabajos.flatMap(o => [o.tiene_foto ? [o, 1] : null, o.tiene_foto2 ? [o, 2] : null].filter(Boolean)), fotos = {};
    let listas = 0, sig = 0;
    const obrero = async () => { while (sig < conFoto.length){ const [o, n] = conFoto[sig++]; fotos[o.id + "|" + n] = await fotoDe(o, n); listas++; est.textContent = "Cargando fotos: " + listas + " de " + conFoto.length + "…"; } };
    est.textContent = conFoto.length ? "Cargando fotos: 0 de " + conFoto.length + "…" : "Armando el informe…";
    await Promise.all([obrero(), obrero(), obrero(), obrero()]);
    let logo = "";
    try { logo = await aDataUrl(await (await fetch("logo.png")).blob()); } catch (e){}

    const ots = trabajos.filter(o => o.tipo !== "incidencia"), incs = trabajos.filter(o => o.tipo === "incidencia");
    const tecnicos = [...new Set(trabajos.map(o => o.trabajador))].sort();
    const numero = o => (o.tipo === "incidencia" ? "INC-" : "OT-") + String(o.numero || 0).padStart(4,"0");
    const estadoTxt = o => hecha(o) ? (o.estado === "cerrada" ? "Cerrada" : "Realizada, por revisar") : o.estado === "ejecucion" ? "En ejecución" : (o.tipo === "incidencia" ? "Abierta" : "No realizada");
    const fila = (r, v) => v ? "<tr><th>" + esc(r) + "</th><td>" + esc(v) + "</td></tr>" : "";
    const bloques = trabajos.map(o => {
      const inc = o.tipo === "incidencia", f = fotos[o.id + "|1"], f2 = fotos[o.id + "|2"];
      return '<section class="trabajo"><h3>' + esc(numero(o)) + " · " + esc(inc ? "Incidencia fuera de horario" : (o.actividad || o.titulo)) + ' <span class="est' + (hecha(o) ? "" : " no") + '">' + esc(estadoTxt(o)) + "</span></h3><table>" +
        fila("Técnico", o.trabajador) + fila(inc ? "Informada por" : "", inc ? o.creada_por : "") + fila("Trabajo", inc ? "" : o.titulo) +
        fila(inc ? "Informada el" : "Asignada el", fecha(o.creada)) + fila("Aceptada el", o.aceptada ? fecha(o.aceptada) : "") + fila("Fecha programada", o.fecha_limite ? fechaCorta(o.fecha_limite) : "") +
        fila("Origen", o.origen === "plan" ? "Plan preventivo" : o.origen === "ronda" ? "Ronda automática del turno de emergencia" : "") + fila("Cantidad programada", o.cantidad != null ? cantTxt(o.cantidad) + " " + (o.unidad || "UN") : "") +
        fila("Ubicación", o.ubicacion) + fila(inc ? "Qué pasó" : "Detalle", o.detalle) +
        fila("Código informado", inc ? "" : o.codigo_actividad) + fila(inc ? "Cómo se resolvió" : "Trabajo realizado", o.descripcion_realizada) +
        fila(inc ? "Cerrada el" : "Reporte enviado el", o.enviado ? fecha(o.enviado) : "") + fila(inc ? "" : "Cerrada el", !inc && o.cerrada ? fecha(o.cerrada) : "") + fila("Nota de cierre", o.nota_cierre) +
        "</table>" + (f ? '<img src="' + f + '" alt="Foto del trabajo ' + esc(numero(o)) + '">' : '<p class="sin">' + (o.tiene_foto ? "La foto no se pudo cargar." : "Sin foto.") + "</p>") +
        (f2 ? '<img src="' + f2 + '" alt="Segunda foto del trabajo ' + esc(numero(o)) + '">' : o.tiene_foto2 ? '<p class="sin">La segunda foto no se pudo cargar.</p>' : "") + "</section>";
    }).join("");
    const resumen = tecnicos.map(t => {
      const m = ots.filter(o => o.trabajador === t), mi = incs.filter(o => o.trabajador === t);
      return "<tr><td>" + esc(t) + "</td><td>" + m.length + "</td><td>" + m.filter(hecha).length + "</td><td>" + esc(pct(m.filter(hecha).length, m.length)) + "</td><td>" + mi.filter(hecha).length + " de " + mi.length + "</td></tr>";
    }).join("");
    const doc = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Informe de trabajos ' + esc(mesTxt(mes)) + "</title><style>" +
      "body{font:14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#002d57;margin:0;background:#fff}main{max-width:820px;margin:0 auto;padding:24px 20px 60px}" +
      "header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:4px solid #01add3;padding-bottom:12px}header img{height:64px}h1{font-size:22px;margin:0}h2{font-size:17px;margin:26px 0 8px}" +
      "h3{font-size:15px;margin:0 0 8px}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:4px 10px 4px 0;border-top:1px solid #cfdde6}" +
      ".trabajo{border:1px solid #cfdde6;border-left:5px solid #01add3;border-radius:6px;padding:12px 14px;margin:14px 0;break-inside:avoid}.trabajo th{width:170px;font-weight:600;color:#4f6478}.trabajo td{white-space:pre-wrap;overflow-wrap:anywhere}" +
      ".trabajo img{display:block;max-width:100%;max-height:420px;margin-top:10px;border:1px solid #cfdde6;border-radius:4px}.est{font-size:12px;font-weight:600;border:1px solid #1f7a4d;color:#1f7a4d;border-radius:99px;padding:1px 9px;margin-left:6px;white-space:nowrap}.est.no{border-color:#b3261e;color:#b3261e}" +
      ".sin,.pie{color:#4f6478}.barra{margin:14px 0}.barra button{font:600 14px system-ui,sans-serif;padding:9px 16px;border-radius:4px;border:1px solid #002d57;background:#002d57;color:#fff;cursor:pointer}" +
      "@media print{.barra{display:none}main{padding:0}.trabajo{border-color:#999}}</style></head><body><main>" +
      "<header><div><h1>Informe de trabajos</h1><p>" + esc(mesTxt(mes)) + " · Mantenimiento</p></div>" + (logo ? '<img src="' + logo + '" alt="Ruta de la Fruta">' : "") + "</header>" +
      '<div class="barra"><button type="button" onclick="window.print()">Imprimir o guardar como PDF</button></div>' +
      "<h2>Resumen</h2><table><tr><th>OT del mes</th><td>" + ots.length + "</td></tr><tr><th>OT realizadas</th><td>" + ots.filter(hecha).length + " (" + esc(pct(ots.filter(hecha).length, ots.length)) + ")</td></tr>" +
      "<tr><th>Preventivas realizadas</th><td>" + ots.filter(o => o.origen === "plan" && hecha(o)).length + " de " + ots.filter(o => o.origen === "plan").length + "</td></tr>" +
      "<tr><th>Incidencias atendidas</th><td>" + incs.filter(hecha).length + " de " + incs.length + "</td></tr></table>" +
      "<h2>Por técnico</h2><table><tr><th>Técnico</th><th>OT asignadas</th><th>Realizadas</th><th>Cumplimiento</th><th>Incidencias atendidas</th></tr>" + resumen + "</table>" +
      "<h2>Detalle de los trabajos</h2>" + bloques +
      '<p class="pie">Informe generado el ' + esc(fecha(new Date())) + " por " + esc(S.yo.nombre) + ". Incluye las OT e incidencias programadas o realizadas en " + esc(mesTxt(mes).toLowerCase()) + ".</p></main></body></html>";
    if (urlInforme) URL.revokeObjectURL(urlInforme);
    urlInforme = URL.createObjectURL(new Blob([doc], {type:"text/html"}));
    const sinFoto = conFoto.filter(([o, n]) => !fotos[o.id + "|" + n]).length;
    est.textContent = "Informe listo: " + trabajos.length + " trabajos, " + (conFoto.length - sinFoto) + " fotos." + (sinFoto ? " " + sinFoto + " fotos no se pudieron cargar." : "");
    enl.append(h("a", {class:"btn wa", href:urlInforme, target:"_blank", rel:"noopener"}, "Abrir informe"),
      h("a", {class:"btn", href:urlInforme, download:"Informe_trabajos_" + mes + ".html"}, "Descargar archivo"));
  } catch (e){ est.textContent = "No se pudo armar el informe. " + (e && e.message ? e.message : ""); }
  btn.disabled = false;
}
$("inf-generar").addEventListener("click", generarInforme);

/* ---------- menú del administrador ---------- */
const VISTAS = {ordenes:["filtros","nueva","lista"], panel:["reportes"], plan:["plan"], equipo:["equipo"], ajustes:["feriados","cuenta"]};
function mostrarVista(v){
  S.vista = VISTAS[v] ? v : "ordenes";
  for (const k in VISTAS) for (const id of VISTAS[k]){
    const el = $(id); el.hidden = k !== S.vista;
    const d = el.querySelector("details"); if (d && k === S.vista) d.open = true;
  }
  for (const b of $("nav").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === S.vista));
  $("tip").hidden = true;
}
for (const b of $("nav").querySelectorAll("button")) b.addEventListener("click", () => mostrarVista(b.dataset.v));

/* ---------- feriados ---------- */
function renderFeriados(){
  if (!S.admin) return;
  $("fer-titulo").textContent = "Feriados (" + S.feriados.length + " próximos)";
  const lista = $("fer-lista"); lista.replaceChildren();
  if (!S.feriados.length) lista.append(h("p", {class:"nota"}, "No hay feriados cargados de hoy en adelante."));
  for (const f of S.feriados){
    lista.append(h("div", {class:"acciones"},
      h("b", null, diaTxt(f.fecha)), h("span", null, f.nombre || ""),
      h("button", {class:"btn chico", type:"button", id:"fq-"+f.fecha, onclick: async ev => {
        ev.target.disabled = true;
        try { await rpc("ot_feriado_quitar", {p_token:S.token, p_fecha:f.fecha}); await cargar(); }
        catch (e){ $("fer-estado").textContent = e.message; ev.target.disabled = false; }
      }}, "Quitar")));
  }
}
$("form-fer").addEventListener("submit", async ev => {
  ev.preventDefault();
  const est = $("fer-estado");
  $("fer-enviar").disabled = true; est.textContent = "Guardando…";
  try {
    await rpc("ot_feriado_agregar", {p_token:S.token, p_fecha:$("fer-fecha").value, p_nombre:$("fer-nombre").value});
    est.textContent = "Feriado agregado."; $("fer-fecha").value = $("fer-nombre").value = "";
    await cargar();
  } catch (e){ est.textContent = e.message; }
  $("fer-enviar").disabled = false;
});

/* ---------- plan preventivo ---------- */
function cantTxt(n){ return String(Number(n)).replace(".", ","); }
function diaTxt(iso){
  const d = new Date(iso + "T12:00:00"), dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  return dias[d.getDay()] + " " + fechaCorta(iso);
}
function tablaPlan(filas, conQuitar){
  const caja = h("div", {class:"lista"});
  let dia = null, cuerpo = null;
  for (const p of filas){
    if (p.fecha !== dia){
      dia = p.fecha;
      cuerpo = h("tbody");
      caja.append(h("div", {class:"bloque"}, h("span", {class:"rot"}, diaTxt(dia)),
        h("div", {class:"tabla-caja"}, h("table", {class:"plan"}, cuerpo))));
    }
    cuerpo.append(h("tr", null,
      h("td", null, p.tecnico), h("td", null, p.actividad), h("td", {class:"num-cel"}, cantTxt(p.cantidad) + " " + (p.unidad || "UN")),
      conQuitar ? h("td", null, h("button", {class:"btn chico", type:"button", id:"pq-"+p.id, onclick: async ev => {
        ev.target.disabled = true;
        try { await rpc("ot_plan_eliminar", {p_token:S.token, p_id:p.id}); await cargar(); }
        catch (e){ $("p-estado").textContent = e.message; ev.target.disabled = false; }
      }}, "Quitar")) : null));
  }
  return caja;
}
function renderPlan(){
  if (!S.admin) return;
  $("plan-titulo").textContent = "Plan preventivo (" + S.plan.length + " por generar)";
  const lista = $("plan-lista"); lista.replaceChildren();
  if (!S.plan.length) lista.append(h("p", {class:"nota"}, "No hay actividades programadas pendientes. Carga un calendario semanal para programarlas."));
  else lista.append(tablaPlan(S.plan, true));
}
function renderImportar(){
  const v = $("p-vista"); v.replaceChildren();
  const imp = S.importar;
  $("p-cargar").hidden = !(imp && imp.plan.length && !imp.avisos.length);
  if (!imp) return;
  for (const a of imp.avisos) v.append(h("p", {class:"mensaje"}, a));
  if (!imp.plan.length){ v.append(h("p", {class:"nota"}, "No encontré actividades con técnico asignado en este archivo.")); return; }
  const total = imp.plan.reduce((s, p) => s + p.cantidad, 0);
  v.append(h("p", {class:"nota"}, imp.plan.length + " órdenes de trabajo, " + cantTxt(total) + " unidades en total. Revisa el reparto antes de cargar."));
  v.append(tablaPlan(imp.plan, false));
}
$("p-archivo").addEventListener("change", async ev => {
  const file = ev.target.files && ev.target.files[0], est = $("p-estado");
  S.importar = null; est.textContent = ""; renderImportar();
  if (!file) return;
  if (!window.XLSX || !window.leerCalendario){ est.textContent = "No se pudo cargar el lector de Excel. Revisa tu conexión y recarga la página."; return; }
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    let plan = [], avisos = [];
    for (const nombre of wb.SheetNames){
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], {header:1, raw:true, defval:null});
      const r = leerCalendario(filas, ACTIVIDADES, S.trabajadores.filter(t => t.activo && t.rol !== "control"));
      plan = plan.concat(r.plan); avisos = avisos.concat(r.avisos);
    }
    plan.sort((x, y) => x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : x.tecnico.localeCompare(y.tecnico));
    S.importar = {plan, avisos};
    if (avisos.length) est.textContent = "Corrige el archivo o el nombre del técnico en Equipo y vuelve a elegirlo.";
  } catch (e){ est.textContent = "No se pudo leer el archivo. Tiene que ser un Excel (.xlsx) con el formato del calendario semanal."; }
  renderImportar();
});
$("p-cargar").addEventListener("click", async ev => {
  const est = $("p-estado");
  if (!S.importar) return;
  ev.target.disabled = true; est.textContent = "Cargando…";
  try {
    const n = await rpc("ot_plan_cargar", {p_token:S.token, p_filas:S.importar.plan.map(p => ({fecha:p.fecha, trabajador_id:p.trabajador_id,
      actividad:p.actividad, titulo:p.titulo, cantidad:p.cantidad, unidad:p.unidad}))});
    est.textContent = n + " actividades programadas. Cada una se convertirá en OT el día que corresponde.";
    S.importar = null; $("p-archivo").value = ""; renderImportar(); await cargar();
  } catch (e){ est.textContent = e.message; }
  ev.target.disabled = false;
});

/* ---------- inicio ---------- */
async function iniciar(){
  const cfg = window.OT_CONFIG || {};
  if (!cfg.url || !cfg.key || !window.supabase){
    aviso(!window.supabase ? "No se pudo cargar la página completa. Revisa tu conexión y recarga."
      : "Falta conectar la base de datos: completa la dirección y la clave del proyecto de Supabase en el archivo config.js.");
    return;
  }
  S.sb = window.supabase.createClient(cfg.url, cfg.key, {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}});
  const t = leerToken();
  if (t){
    S.token = t;
    try {
      S.yo = await rpc("ot_yo", {p_token:t});
      if (S.yo.debe_cambiar) mostrarCambio(); else abrirApp();
      return;
    } catch (e){
      if (S.token){ aviso(e.message); return; }   // sin conexión: no se borra la sesión
    }
  }
  try {
    const e = await rpc("ot_estado");
    vista(e.admin_pendiente ? "v-activar" : "v-login");
  } catch (e){ aviso(e.message); }
}
iniciar();
})();
