// El taller de bloques: el cableado.
//
// Cada banco une un evento de su bloque de entrada con un mensaje de su
// bloque de salida (include.send). Casi siempre el detalle pasa tal cual,
// porque todos hablan de `valor`; para los que no, una traducción chica. Cada
// vez que pasa algo, una chispa corre por el cable del banco.
//
// El panel de mantenimiento junta tres condiciones: la bomba completa, los
// cables conectados y el nivel en 7. Con las tres, la luz grande se prende.
const raiz = hiperspace.dimention;
const $ = (id) => raiz.getElementById(id);
const C = globalThis.BLOQUES || { bancos: [] };

// Las traducciones: de lo que emite la entrada a lo que entiende la salida.
const TRADUCIR = {
  b5: (d) => ({ texto: d.fraccion <= 0.02 ? "ARRIBA" : d.fraccion >= 0.98 ? "ABAJO" : Math.round(d.fraccion * 100) + "%" }),
  b6: (d) => ({ texto: "X " + d.x.toFixed(2) + String.fromCharCode(10) + "Y " + d.y.toFixed(2) }),
  b7: (d) => ({ texto: d.correcto ? "ABIERTO" : "ERROR" }),
  b8: () => ({ valor: 1 }),
  b11: (d) => ({ texto: d.valor ? "BIENVENIDO" : "RECHAZADA" }),
};

// La chispa: una esfera que corre por el cable en un cuarto de segundo.
const chispas = {};
function chispa(id) {
  const el = $("chispa_" + id);
  if (!el) return;
  chispas[id] = { el, t0: performance.now() };
  el.setAttribute("visible", "inherit");
  if (!corriendo) { corriendo = true; requestAnimationFrame(correr); }
}
let corriendo = false;
function correr() {
  const ahora = performance.now();
  let alguna = false;
  for (const id of Object.keys(chispas)) {
    const c = chispas[id];
    const k = (ahora - c.t0) / 250;
    if (k >= 1) { c.el.setAttribute("visible", "false"); delete chispas[id]; continue; }
    c.el.position = { x: -0.06 + 0.12 * k, y: 0, z: 0.018 };
    alguna = true;
  }
  corriendo = alguna;
  if (alguna) requestAnimationFrame(correr);
}

for (const b of C.bancos) {
  const ent = $("ent_" + b.id), sal = $("sal_" + b.id);
  if (!ent || !sal) continue;
  ent.addEventListener("component:" + b.evento, (e) => {
    const d = e && e.detail != null ? e.detail : {};
    const t = TRADUCIR[b.id];
    try { sal.send(b.mensaje, t ? t(d) : d); } catch (err) { console.warn("[bloques]", b.id, (err && err.message) || err); }
    chispa(b.id);
  });
}

// ── El panel de mantenimiento ──────────────────────────────────────────────
const tarea = { bomba: false, cables: false, nivel: false, hecha: false };
function revisar() {
  const faltan = [];
  if (!tarea.bomba) faltan.push("BOMBA");
  if (!tarea.cables) faltan.push("CABLES");
  if (!tarea.nivel) faltan.push("NIVEL");
  const estado = $("tarea_estado");
  if (!faltan.length) {
    if (!tarea.hecha) {
      tarea.hecha = true;
      try { $("tarea_luz").send("valor", { valor: 1 }); $("tarea_meta").send("texto", { texto: "TAREA HECHA" }); } catch (e) { /* sin include */ }
    }
    if (estado) estado.setAttribute("value", "¡listo! todo en orden");
  } else {
    tarea.hecha = false;
    try { $("tarea_luz").send("valor", { valor: 0 }); } catch (e) { /* sin include */ }
    if (estado) estado.setAttribute("value", "falta: " + faltan.join(", ").toLowerCase());
  }
}
const oir = (id, ev, f) => { const el = $(id); if (el) el.addEventListener("component:" + ev, (e) => { f(e && e.detail != null ? e.detail : {}); revisar(); }); };
oir("tarea_rueda", "completo", () => { tarea.bomba = true; });
oir("tarea_cables", "completo", () => { tarea.cables = true; });
oir("tarea_nivel", "valor", (d) => {
  tarea.nivel = Math.abs((d.fraccion || 0) - 0.7) < 0.01;
  try { $("tarea_meta").send("texto", { texto: tarea.nivel ? "NIVEL OK" : "NIVEL " + Math.round((d.fraccion || 0) * 10) + " -> 7" }); } catch (e) { /* sin include */ }
});
revisar();
