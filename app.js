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
const ESTADOS = {asignada:"Asignada", devuelta:"Devuelta para corregir", revision:"Por revisar", cerrada:"Cerrada"};

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
    const hu = JSON.stringify(d.ordenes), he = JSON.stringify(d.trabajadores);
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
  if (S.filtro === "pendientes") return e === "asignada" || e === "devuelta";
  return e === S.filtro;
}

/* ---------- render ---------- */
function render(){
  const act = document.activeElement, actId = act && act.id;
  let sel = null;
  try { if (actId && act.selectionStart != null) sel = [act.selectionStart, act.selectionEnd]; } catch(e){}

  const jefe = S.admin || S.control;
  const peso = jefe ? {revision:0, devuelta:1, asignada:2, cerrada:3} : {devuelta:0, asignada:1, revision:2, cerrada:3};
  const items = S.ordenes.slice().sort((a,b) => (peso[a.estado]-peso[b.estado]) || (new Date(b.creada) - new Date(a.creada)));
  const cuenta = {todas:items.length, pendientes:0, revision:0, cerrada:0};
  for (const o of items){
    if (o.estado === "asignada" || o.estado === "devuelta") cuenta.pendientes++; else cuenta[o.estado]++;
  }
  const f = $("filtros"); f.replaceChildren();
  const rotulos = [["todas","Todas"],["pendientes", jefe ? "En terreno" : "Por hacer"],
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

function imagen(o){
  if (!o.tiene_foto) return h("p", {class:"nota"}, "Sin foto.");
  const k = o.id + "|" + (o.enviado || "");
  if (S.fotos[k]) return h("img", {class:"foto", alt:"Foto del trabajo realizado", src:S.fotos[k]});
  if (S.fotos[k] === "") return h("p", {class:"nota"}, "La foto no se pudo cargar.");
  if (!S.pidiendoFoto[k]){
    S.pidiendoFoto[k] = true;
    rpc("ot_foto", {p_token:S.token, p_ot:o.id})
      .then(d => { S.fotos[k] = (typeof d === "string" && d.startsWith("data:image/")) ? d : ""; })
      .catch(() => { S.fotos[k] = ""; })
      .then(() => { delete S.pidiendoFoto[k]; if (!$("v-app").hidden) render(); });
  }
  return h("p", {class:"nota"}, "Cargando foto…");
}

function tarjeta(o){
  const estado = o.estado, id = o.id, inc = o.tipo === "incidencia", jefe = S.admin || S.control;
  const necesitaAccion = S.admin ? estado === "revision" : S.control ? false : (estado === "asignada" || estado === "devuelta");
  const rotEstado = inc && estado === "asignada" ? "Abierta" : inc && estado === "devuelta" ? "Reabierta" : ESTADOS[estado];
  const abierto = (id in S.abiertos) ? S.abiertos[id] : necesitaAccion;
  const vencida = estado !== "cerrada" && o.fecha_limite && o.fecha_limite < hoyIso();
  const meta = h("div", {class:"meta"},
    jefe ? h("span", null, o.trabajador) : null,
    inc ? h("span", null, "Incidencia fuera de horario") : null,
    o.ubicacion ? h("span", null, o.ubicacion) : null,
    o.origen === "plan" ? h("span", null, "Preventivo") : null,
    !inc && o.prioridad && o.prioridad !== "Normal" ? h("span", null, "Prioridad " + o.prioridad.toLowerCase()) : null,
    o.fecha_limite ? h("span", {class: vencida ? "vencida" : null}, (vencida ? "Vencida el " : "Límite ") + fechaCorta(o.fecha_limite)) : null);
  const cab = h("button", {class:"ot-cab", type:"button", id:"cab-"+id, "aria-expanded": String(abierto),
    onclick: () => { S.abiertos[id] = !abierto; render(); }},
    h("div", {class:"ot-linea"}, h("span", {class:"num"}, (inc ? "INC-" : "OT-") + String(o.numero||0).padStart(4,"0")), h("span", {class:"pill e-"+estado}, rotEstado)),
    h("h3", null, o.titulo), meta);
  const card = h("article", {class:"ot e-"+estado}, cab);
  if (!abierto) return card;

  const cuerpo = h("div", {class:"ot-cuerpo"});
  if (o.actividad) cuerpo.append(bloque("Código de actividad", h("p", {class:"cod"}, o.actividad)));
  if (o.cantidad != null) cuerpo.append(bloque("Cantidad programada", h("p", {class:"cod"}, cantTxt(o.cantidad) + " " + (o.unidad || "UN"))));
  cuerpo.append(bloque(inc ? "Qué está pasando" : "Detalle del trabajo", h("p", null, o.detalle)));
  cuerpo.append(h("p", {class:"nota"}, inc ? "Informada el " + fecha(o.creada) + (o.creada_por ? " por " + o.creada_por : "") : "Asignada el " + fecha(o.creada)));
  if (estado === "devuelta" && o.nota_devolucion)
    cuerpo.append(h("div", {class:"devol"}, h("b", null, "Devuelta por el administrador: "), o.nota_devolucion));

  const editable = !jefe && (estado === "asignada" || estado === "devuelta");
  if (o.enviado && !editable){
    cuerpo.append(h("div", {class:"lista"},
      inc ? null : bloque("Código de actividad informado por el técnico", h("p", {class:"cod"}, o.codigo_actividad || "—")),
      bloque(inc ? "Cómo se resolvió" : "Trabajo realizado", h("p", null, o.descripcion_realizada || "—")),
      bloque("Foto", imagen(o)),
      h("p", {class:"nota"}, (inc ? "Cierre informado el " : "Reporte enviado el ") + fecha(o.enviado))));
  }
  if (jefe && estado === "devuelta") cuerpo.append(h("p", {class:"nota"}, inc ? "Reabierta. Esperando que el técnico la cierre otra vez." : "Esperando que el técnico corrija y reenvíe."));
  if (jefe && estado === "asignada") cuerpo.append(h("p", {class:"nota"}, inc ? "El técnico de turno aún no la cierra." : "El técnico aún no envía su reporte."));
  if (editable) cuerpo.append(formReporte(o));
  if (!jefe && estado === "revision") cuerpo.append(h("p", {class:"nota"}, "Reporte enviado. Falta que el administrador cierre la OT."));
  if (estado === "cerrada")
    cuerpo.append(bloque("Cierre", h("p", null, "Cerrada el " + fecha(o.cerrada) + (inc ? " por " + o.trabajador : "") + (o.nota_cierre ? "\n" + o.nota_cierre : ""))));
  if (S.errores[id]) cuerpo.append(h("p", {class:"mensaje"}, S.errores[id]));
  if (S.admin) cuerpo.append(accionesAdmin(o));
  card.append(cuerpo);
  return card;
}

function formReporte(o){
  const id = o.id, inc = o.tipo === "incidencia";
  const b = S.borradores[id] || (S.borradores[id] = {codigo:o.codigo_actividad||o.actividad||"", descripcion:o.descripcion_realizada||"", file:null, vista:null});
  const ocupado = !!S.ocupado[id];
  const prev = b.vista ? h("img", {class:"foto", alt:"Foto seleccionada", src:b.vista}) : o.tiene_foto ? imagen(o) : null;
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
    let foto = null;
    if (b.file){
      try { foto = await prepararFoto(b.file); }
      catch (e){ throw new Error("No se pudo procesar la foto. Prueba con otra imagen en JPG o PNG."); }
    }
    await rpc("ot_reportar", {p_token:S.token, p_ot:id, p_codigo:inc ? null : b.codigo, p_descripcion:b.descripcion, p_foto:foto});
    if (b.vista) URL.revokeObjectURL(b.vista);
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

  const lista = $("equipo-lista"); lista.replaceChildren();
  for (const t of S.trabajadores){
    const estado = !t.activo ? "Desactivado" : t.sin_clave ? "Sin contraseña: entrégale una clave temporal"
                 : t.debe_cambiar ? "Tiene clave temporal; falta que cree la suya" : "Activo";
    const inp = h("input", {id:"tc-"+t.id, maxlength:"60", placeholder:"Clave temporal nueva"});
    const est = h("span", {class:"nota"});
    const hacer = async (btn, fn, args, ok) => {
      btn.disabled = true; est.textContent = "Guardando…";
      try { await rpc(fn, Object.assign({p_token:S.token, p_id:t.id}, args)); est.textContent = ok; await cargar(); }
      catch (e){ est.textContent = e.message; }
      btn.disabled = false;
    };
    lista.append(h("div", {class:"trab"},
      h("div", {class:"trab-cab"}, h("b", null, t.nombre), h("span", {class:"usr"}, "Usuario: " + t.usuario + (t.rol === "control" ? " · Centro de control" + (t.sin_horario ? " · Sin límite de horario" : "") : t.de_turno ? " · De turno" : ""))),
      h("span", {class:"nota"}, estado),
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
          onclick: ev => hacer(ev.target, "ot_turno", {p_turno:!t.de_turno}, "")}, t.de_turno ? "Quitar de turno" : "Marcar de turno"),
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
  const act = $("n-act").value;
  if (!act){ est.textContent = "Elige el código de actividad."; return; }
  btn.disabled = true; est.textContent = "Guardando…";
  try {
    const n = await rpc("ot_crear", {p_token:S.token, p_trabajador:wid, p_actividad:act, p_titulo:$("n-titulo").value, p_detalle:$("n-detalle").value,
      p_ubicacion:$("n-lugar").value, p_prioridad:$("n-prio").value, p_fecha:$("n-fecha").value || null});
    const t = S.trabajadores.find(x => x.id === wid);
    est.textContent = numTxt(n) + " asignada" + (t ? " a " + t.nombre : "") + ".";
    for (const k of ["n-titulo","n-detalle","n-lugar","n-fecha"]) $(k).value = "";
    $("n-prio").value = "Normal"; $("n-act").value = "";
    await cargar();
  } catch (e){ est.textContent = e.message; }
  btn.disabled = false;
});

opcionesActividad($("n-act"), "");

/* ---------- incidencias (centro de control) ---------- */
function renderIncidencia(){
  const sel = $("i-trab"), previo = sel.value;
  const deTurno = S.trabajadores.filter(t => t.de_turno), lista = deTurno.length ? deTurno : S.trabajadores;
  sel.replaceChildren(h("option", {value:""}, "Elige al técnico de turno"));
  for (const t of lista) sel.append(h("option", {value:t.id}, t.nombre));
  if (previo && lista.some(t => t.id === previo)) sel.value = previo;
  else if (lista.length === 1) sel.value = lista[0].id;
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
    est.textContent = "INC-" + String(n).padStart(4,"0") + " enviada" + (t ? " a " + t.nombre : "") + ".";
    $("i-desc").value = $("i-lugar").value = "";
    await cargar();
  } catch (e){ est.textContent = e.message; }
  $("i-enviar").disabled = !S.fuera;
});

/* ---------- reportes (administrador) ---------- */
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
function pct(h, p){ return p ? Math.round(100 * h / p) + " %" : "—"; }
function rangoPeriodo(){
  const hoy = hoyIso(), v = $("r-periodo").value;
  if (v === "semana"){ const l = lunesDe(hoy); return [l, sumarIso(l, 6)]; }
  if (v === "mes") return [hoy.slice(0,8) + "01", hoy.slice(0,8) + "31"];
  if (v === "anterior"){ const f = sumarIso(hoy.slice(0,8) + "01", -1); return [f.slice(0,8) + "01", f.slice(0,8) + "31"]; }
  return ["0000-00-00", "9999-99-99"];
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
function renderReportes(){
  if (!S.admin) return;
  const hoy = hoyIso(), caja = $("r-cuerpo"); caja.replaceChildren();

  // 1. Alertas: lo que venció sin que el técnico lo realizara.
  const alertas = [];
  for (const o of S.ordenes){
    if (o.tipo === "incidencia"){
      if (o.estado !== "cerrada" && Date.now() - new Date(o.creada) > 24 * 3600 * 1000)
        alertas.push([isoLocal(o.creada), o.trabajador + " no ha cerrado la incidencia INC-" + String(o.numero).padStart(4,"0") + ", informada el " + fecha(o.creada) + "."]);
    } else if (o.fecha_limite && o.fecha_limite < hoy && !hecha(o)){
      alertas.push([o.fecha_limite, o.trabajador + " no realizó " + numTxt(o.numero) + " (" + (o.actividad || o.titulo) + "), programada para el " + diaTxt(o.fecha_limite).toLowerCase() +
        (o.estado === "devuelta" ? ". Está devuelta para corregir." : ".")]);
    }
  }
  alertas.sort((x, y) => x[0] < y[0] ? 1 : -1);
  $("rep-titulo").textContent = "Reportes" + (alertas.length ? " (" + alertas.length + (alertas.length === 1 ? " alerta)" : " alertas)") : "");
  caja.append(h("h3", null, "Alertas"));
  if (!alertas.length) caja.append(h("p", {class:"nota"}, "Sin alertas: no hay trabajos vencidos sin realizar ni incidencias abiertas hace más de 24 horas."));
  else caja.append(h("div", {class:"lista"}, alertas.map(al => h("p", {class:"mensaje"}, al[1]))));

  // 2. Trabajos e incidencias por técnico en el período elegido.
  const [desde, hasta] = rangoPeriodo();
  const enPeriodo = o => { const f = fechaHecha(o); return hecha(o) && f >= desde && f <= hasta; };
  const tecnicos = [...new Set(S.trabajadores.filter(t => t.rol !== "control").map(t => t.nombre).concat(S.ordenes.map(o => o.trabajador)))].sort();
  caja.append(h("h3", null, "Trabajos realizados por técnico"));
  caja.append(tabla(["Técnico", "OT realizadas", "De ellas, preventivas", "Incidencias atendidas"], tecnicos.map(t => {
    const mias = S.ordenes.filter(o => o.trabajador === t && enPeriodo(o));
    return [t, mias.filter(o => o.tipo !== "incidencia").length, mias.filter(o => o.origen === "plan").length, mias.filter(o => o.tipo === "incidencia").length];
  }), "Todavía no hay técnicos."));

  // 3. Incidencias por centro de control (según la fecha en que se informaron).
  const incs = S.ordenes.filter(o => o.tipo === "incidencia" && isoLocal(o.creada) >= desde && isoLocal(o.creada) <= hasta);
  const centros = [...new Set(incs.map(o => o.creada_por || "Sin nombre"))].sort();
  caja.append(h("h3", null, "Incidencias por centro de control"));
  caja.append(tabla(["Centro de control", "Informadas", "Atendidas", "Abiertas"], centros.map(c => {
    const m = incs.filter(o => (o.creada_por || "Sin nombre") === c), at = m.filter(hecha).length;
    return [c, m.length, at, m.length - at];
  }), "No hay incidencias en este período."));

  // 4. Cumplimiento del plan preventivo, por semana y por mes (hasta hoy).
  const prev = preventivos();
  const agrupar = (clave, rotulo) => {
    const g = {};
    for (const p of prev){ const k = clave(p.fecha); (g[k] = g[k] || {p:0, h:0}); g[k].p++; if (p.hecha) g[k].h++; }
    return Object.keys(g).filter(k => k <= clave(hoy)).sort().reverse().slice(0, 8)
      .map(k => [rotulo(k), g[k].p, g[k].h, g[k].p - g[k].h, pct(g[k].h, g[k].p)]);
  };
  caja.append(h("h3", null, "Cumplimiento preventivo semanal"));
  caja.append(tabla(["Semana", "Programados", "Realizados", "Pendientes", "Cumplimiento"],
    agrupar(lunesDe, k => "Semana " + semanaIso(k) + " (" + fechaCorta(k) + " al " + fechaCorta(sumarIso(k, 6)) + ")"),
    "Todavía no hay trabajos preventivos programados hasta esta semana."));
  caja.append(h("h3", null, "Cumplimiento preventivo mensual"));
  caja.append(tabla(["Mes", "Programados", "Realizados", "Pendientes", "Cumplimiento"],
    agrupar(f => f.slice(0,7), mesTxt), "Todavía no hay trabajos preventivos programados hasta este mes."));

  // 5. Cumplimiento por técnico: semana y mes en curso.
  const lun = lunesDe(hoy), mes = hoy.slice(0,7);
  const cuenta = (t, f) => { const m = prev.filter(p => p.tecnico === t && f(p.fecha)); const hh = m.filter(p => p.hecha).length; return m.length ? hh + " de " + m.length + " (" + pct(hh, m.length) + ")" : "—"; };
  const conPrev = tecnicos.filter(t => prev.some(p => p.tecnico === t));
  caja.append(h("h3", null, "Cumplimiento preventivo por técnico"));
  caja.append(tabla(["Técnico", "Semana " + semanaIso(hoy), mesTxt(mes)],
    conPrev.map(t => [t, cuenta(t, f => lunesDe(f) === lun), cuenta(t, f => f.slice(0,7) === mes)]),
    "Ningún técnico tiene trabajos preventivos programados."));
  caja.append(h("p", {class:"nota"}, "Un trabajo cuenta como realizado cuando el técnico envió su reporte, aunque todavía no lo hayas cerrado. La semana y el mes en curso incluyen lo programado para los días que faltan."));
}
$("r-periodo").addEventListener("change", renderReportes);

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
