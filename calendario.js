// Lee el calendario semanal de mantenimiento (Excel) y lo convierte en filas del plan preventivo.
// Cada celda de día con el nombre de un técnico es una asignación; la cantidad programada de la fila
// se reparte en partes enteras entre esos días (lo que sobra va a los primeros días).
(function(raiz){
"use strict";
function norm(t){ return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
const DIAS = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];
function aIso(v){
  if (v == null || v === "") return null;
  let d;
  if (typeof v === "number") d = new Date(Math.round((v - 25569) * 86400000));          // número de serie de Excel
  else if (v instanceof Date) d = new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12));
  else return null;
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
function sumarDias(iso, n){ const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function codigoNormal(c){
  const m = /^([a-z]+)\s*0*(\d+)$/i.exec(String(c || "").trim());
  return m ? m[1].toUpperCase() + " " + m[2].padStart(2, "0") : String(c || "").trim();
}
function repartir(total, n){
  const base = Math.floor(total / n), resto = Math.round(total - base * n);
  return Array.from({length:n}, (_, i) => base + (i < resto ? 1 : 0));
}
// filas: matriz de la hoja (arreglo de arreglos). actividades: lista "DMV 01 · Nombre". tecnicos: [{id, nombre}]
function leerCalendario(filas, actividades, tecnicos){
  const plan = [], avisos = [];
  const porNombre = {};
  for (const t of tecnicos || []) porNombre[norm(t.nombre)] = t;
  for (let r = 0; r < filas.length; r++){
    const cab = (filas[r] || []).map(norm);
    const cCod = cab.indexOf("codigo");
    if (cCod < 0) continue;
    const cItem = cab.indexOf("item"), cCant = cab.indexOf("cantidad programada"), cUni = cab.indexOf("unidad");
    const cDias = DIAS.map(d => cab.indexOf(d));
    if (cCant < 0 || cDias[0] < 0){ avisos.push("Fila " + (r + 1) + ": faltan las columnas Cantidad programada o Lunes."); continue; }
    // Fechas: la fila de arriba trae la fecha de cada día; las que falten se calculan desde la primera.
    const arriba = filas[r - 1] || [];
    let lunes = null;
    cDias.forEach((c, i) => { if (!lunes && c >= 0){ const f = aIso(arriba[c]); if (f) lunes = sumarDias(f, -i); } });
    if (!lunes){ avisos.push("Fila " + (r + 1) + ": no encontré las fechas sobre los días de la semana."); continue; }
    for (let k = r + 1; k < filas.length; k++){
      const f = filas[k] || [];
      if (norm(f[cCod]) === "codigo") break;
      if (!norm(f[cCod])){ if (f.every(x => x == null || x === "")) break; else continue; }
      const cod = codigoNormal(f[cCod]), item = String(f[cItem] == null ? "" : f[cItem]).trim();
      const actividad = (actividades || []).find(a => a.startsWith(cod + " ·")) || (cod + " · " + item);
      const total = Number(f[cCant]);
      const dias = [];
      cDias.forEach((c, i) => { if (c >= 0 && norm(f[c])) dias.push({i, nombre:String(f[c]).trim()}); });
      if (!dias.length) continue;
      if (!(total > 0)){ avisos.push(cod + ": la cantidad programada no es un número mayor que cero."); continue; }
      const partes = repartir(total, dias.length);
      dias.forEach((d, j) => {
        if (partes[j] <= 0) return;
        const t = porNombre[norm(d.nombre)];
        if (!t) avisos.push(cod + ", " + DIAS[d.i] + ": no hay un técnico activo llamado \"" + d.nombre + "\".");
        plan.push({fecha:sumarDias(lunes, d.i), trabajador_id:t ? t.id : null, tecnico:t ? t.nombre : d.nombre,
          actividad, titulo:item || actividad, cantidad:partes[j], unidad:String(f[cUni] == null ? "UN" : f[cUni]).trim() || "UN"});
      });
    }
  }
  return {plan, avisos:[...new Set(avisos)]};
}
raiz.leerCalendario = leerCalendario;
if (typeof module !== "undefined") module.exports = {leerCalendario};
})(typeof window !== "undefined" ? window : globalThis);
