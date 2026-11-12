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
  sb:null, token:null, yo:null, admin:false, ordenes:[], trabajadores:[],
  huella:"", huellaEquipo:"", filtro:"todas", abiertos:{}, borradores:{}, notas:{}, ocupado:{},
  confirmar:{}, errores:{}, fotos:{}, pidiendoFoto:{}, temporal:"", reloj:null
};
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
    if (e.code && /^(PGRST|42)/.test(e.code)) throw new Error("La base de datos no está preparada. Falta ejecutar el archivo supabase.sql en Supabase.");
    throw new Error(e.message || "No se pudo completar la operación.");
  }
  return res.data;
}

/* ---------- acceso ---------- */
function cerrarLocal(msg){
  guardarToken(null); S.yo = null; S.ordenes = []; S.trabajadores = []; S.huella = ""; S.huellaEquipo = "";
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
  S.admin = S.yo.rol === "admin"; S.temporal = "";
  $("rol").textContent = S.yo.nombre + (S.admin ? " · Administrador" : " · Técnico");
  $("nueva").hidden = !S.admin; $("equipo").hidden = !S.admin;
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
    S.ordenes = d.ordenes; S.trabajadores = d.trabajadores;
    if (he !== S.huellaEquipo){ S.huellaEquipo = he; renderEquipo(); }
    if (hu !== S.huella){ S.huella = hu; render(); }
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

  const peso = S.admin ? {revision:0, devuelta:1, asignada:2, cerrada:3} : {devuelta:0, asignada:1, revision:2, cerrada:3};
  const items = S.ordenes.slice().sort((a,b) => (peso[a.estado]-peso[b.estado]) || (new Date(b.creada) - new Date(a.creada)));
  const cuenta = {todas:items.length, pendientes:0, revision:0, cerrada:0};
  for (const o of items){
    if (o.estado === "asignada" || o.estado === "devuelta") cuenta.pendientes++; else cuenta[o.estado]++;
  }
  const f = $("filtros"); f.replaceChildren();
  const rotulos = [["todas","Todas"],["pendientes", S.admin ? "En terreno" : "Por hacer"],
                   ["revision", S.admin ? "Por revisar" : "Enviadas"],["cerrada","Cerradas"]];
  for (const [k, t] of rotulos){
    f.append(h("button", {class:"filtro", type:"button", id:"f-"+k, "aria-pressed": String(S.filtro===k),
      onclick: () => { S.filtro = k; render(); }}, h("b", null, cuenta[k]), h("span", null, t)));
  }
  const lista = $("lista"); lista.replaceChildren();
  const vis = items.filter(o => enFiltro(o.estado));
  if (!vis.length){
    lista.append(h("p", {class:"nota"},
      items.length ? "No hay órdenes en este estado."
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
  const estado = o.estado, id = o.id;
  const necesitaAccion = S.admin ? estado === "revision" : (estado === "asignada" || estado === "devuelta");
  const abierto = (id in S.abiertos) ? S.abiertos[id] : necesitaAccion;
  const vencida = estado !== "cerrada" && o.fecha_limite && o.fecha_limite < hoyIso();
  const meta = h("div", {class:"meta"},
    S.admin ? h("span", null, o.trabajador) : null,
    o.ubicacion ? h("span", null, o.ubicacion) : null,
    o.prioridad && o.prioridad !== "Normal" ? h("span", null, "Prioridad " + o.prioridad.toLowerCase()) : null,
    o.fecha_limite ? h("span", {class: vencida ? "vencida" : null}, (vencida ? "Vencida el " : "Límite ") + fechaCorta(o.fecha_limite)) : null);
  const cab = h("button", {class:"ot-cab", type:"button", id:"cab-"+id, "aria-expanded": String(abierto),
    onclick: () => { S.abiertos[id] = !abierto; render(); }},
    h("div", {class:"ot-linea"}, h("span", {class:"num"}, numTxt(o.numero)), h("span", {class:"pill e-"+estado}, ESTADOS[estado])),
    h("h3", null, o.titulo), meta);
  const card = h("article", {class:"ot e-"+estado}, cab);
  if (!abierto) return card;

  const cuerpo = h("div", {class:"ot-cuerpo"});
  cuerpo.append(bloque("Detalle del trabajo", h("p", null, o.detalle)));
  cuerpo.append(h("p", {class:"nota"}, "Asignada el " + fecha(o.creada)));
  if (estado === "devuelta" && o.nota_devolucion)
    cuerpo.append(h("div", {class:"devol"}, h("b", null, "Devuelta por el administrador: "), o.nota_devolucion));

  const editable = !S.admin && (estado === "asignada" || estado === "devuelta");
  if (o.enviado && !editable){
    cuerpo.append(h("div", {class:"lista"},
      bloque("Código de actividad", h("p", {class:"cod"}, o.codigo_actividad || "—")),
      bloque("Trabajo realizado", h("p", null, o.descripcion_realizada || "—")),
      bloque("Foto", imagen(o)),
      h("p", {class:"nota"}, "Reporte enviado el " + fecha(o.enviado))));
  }
  if (S.admin && estado === "devuelta") cuerpo.append(h("p", {class:"nota"}, "Esperando que el técnico corrija y reenvíe."));
  if (S.admin && estado === "asignada") cuerpo.append(h("p", {class:"nota"}, "El técnico aún no envía su reporte."));
  if (editable) cuerpo.append(formReporte(o));
  if (!S.admin && estado === "revision") cuerpo.append(h("p", {class:"nota"}, "Reporte enviado. Falta que el administrador cierre la OT."));
  if (estado === "cerrada")
    cuerpo.append(bloque("Cierre", h("p", null, "Cerrada el " + fecha(o.cerrada) + (o.nota_cierre ? "\n" + o.nota_cierre : ""))));
  if (S.errores[id]) cuerpo.append(h("p", {class:"mensaje"}, S.errores[id]));
  if (S.admin) cuerpo.append(accionesAdmin(o));
  card.append(cuerpo);
  return card;
}

function formReporte(o){
  const id = o.id;
  const b = S.borradores[id] || (S.borradores[id] = {codigo:o.codigo_actividad||"", descripcion:o.descripcion_realizada||"", file:null, vista:null});
  const ocupado = !!S.ocupado[id];
  const prev = b.vista ? h("img", {class:"foto", alt:"Foto seleccionada", src:b.vista}) : o.tiene_foto ? imagen(o) : null;
  return h("form", {class:"lista", onsubmit: ev => { ev.preventDefault(); enviarReporte(o); }},
    h("span", {class:"bloque"}, h("span", {class:"rot"}, "Tu reporte")),
    h("label", {for:"cod-"+id}, "Código de actividad",
      h("input", {id:"cod-"+id, required:true, maxlength:"40", value:b.codigo, placeholder:"Ej.: M-204",
        oninput: ev => { b.codigo = ev.target.value; }})),
    h("label", {for:"des-"+id}, "Descripción del trabajo realizado",
      h("textarea", {id:"des-"+id, required:true, maxlength:"4000", value:b.descripcion,
        oninput: ev => { b.descripcion = ev.target.value; }})),
    h("label", {for:"fot-"+id}, prev ? "Cambiar foto" : "Foto del trabajo",
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
        ocupado ? "Enviando…" : o.enviado ? "Reenviar reporte" : "Enviar reporte")));
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
  const id = o.id, b = S.borradores[id];
  if (!b || S.ocupado[id]) return;
  if (!b.codigo.trim() || !b.descripcion.trim()){ S.errores[id] = "Completa el código de actividad y la descripción."; render(); return; }
  if (!b.file && !o.tiene_foto){ S.errores[id] = "Agrega una foto del trabajo antes de enviar."; render(); return; }
  S.ocupado[id] = true; delete S.errores[id]; render();
  try {
    let foto = null;
    if (b.file){
      try { foto = await prepararFoto(b.file); }
      catch (e){ throw new Error("No se pudo procesar la foto. Prueba con otra imagen en JPG o PNG."); }
    }
    await rpc("ot_reportar", {p_token:S.token, p_ot:id, p_codigo:b.codigo, p_descripcion:b.descripcion, p_foto:foto});
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
  const activos = S.trabajadores.filter(t => t.activo);
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
      h("div", {class:"trab-cab"}, h("b", null, t.nombre), h("span", {class:"usr"}, "Usuario: " + t.usuario)),
      h("span", {class:"nota"}, estado),
      h("label", {for:"tc-"+t.id}, "Clave temporal (mínimo 8 caracteres)", inp),
      h("div", {class:"acciones"},
        h("button", {class:"btn chico", type:"button", id:"tg-"+t.id, onclick: () => { inp.value = claveAzar(); est.textContent = "Anótala antes de guardar: después no se puede ver."; }}, "Generar"),
        h("button", {class:"btn chico", type:"button", id:"ts-"+t.id, onclick: ev => {
          const c = inp.value;
          if (c.length < 8){ est.textContent = "La clave temporal debe tener al menos 8 caracteres."; return; }
          hacer(ev.target, "ot_clave_trabajador", {p_clave:c}, "Clave temporal guardada: " + c);
        }}, "Guardar clave temporal"),
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
    await rpc("ot_crear_trabajador", {p_token:S.token, p_usuario:u, p_nombre:$("t-nombre").value, p_clave:c});
    est.textContent = "Técnico agregado. Usuario: " + u.trim().toLowerCase() + " · Clave temporal: " + c;
    $("t-nombre").value = $("t-usuario").value = $("t-clave").value = "";
    await cargar();
  } catch (e){ est.textContent = e.message; }
  $("t-enviar").disabled = false;
});

$("form-nueva").addEventListener("submit", async ev => {
  ev.preventDefault();
  const wid = $("n-trab").value, btn = $("n-enviar"), est = $("n-estado");
  if (!wid){ est.textContent = "Elige un técnico."; return; }
  btn.disabled = true; est.textContent = "Guardando…";
  try {
    const n = await rpc("ot_crear", {p_token:S.token, p_trabajador:wid, p_titulo:$("n-titulo").value, p_detalle:$("n-detalle").value,
      p_ubicacion:$("n-lugar").value, p_prioridad:$("n-prio").value, p_fecha:$("n-fecha").value || null});
    const t = S.trabajadores.find(x => x.id === wid);
    est.textContent = numTxt(n) + " asignada" + (t ? " a " + t.nombre : "") + ".";
    for (const k of ["n-titulo","n-detalle","n-lugar","n-fecha"]) $(k).value = "";
    $("n-prio").value = "Normal";
    await cargar();
  } catch (e){ est.textContent = e.message; }
  btn.disabled = false;
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
