// La calle de los objetos, del lado del visor.
//
// Tres trabajos:
//
//   1. Montar los objetos de cada local cuando uno se acerca, y desmontarlos al
//      alejarse. Cada objeto es un <include> con su isolate; con todos
//      montados la calle entera serían decenas de documentos vivos a la vez.
//      Se montan de a uno cada 90 ms, porque montar de golpe es lo que más le
//      cuesta al motor.
//   2. COPIAR: el motor sólo deja escribir el portapapeles en respuesta a un
//      Ctrl+C del usuario sobre el documento que tocó. El botón elige qué URL
//      y toma el foco; el Ctrl+C la copia.
//   3. LLEVAR: agrega el objeto a la lista de "mi mundo", en localStorage. El
//      mundo es de este mismo origen, así que lo lee de ahí.
const root = hiperspace.dimention;
const C = globalThis.CALLE;
const $ = (id) => root.getElementById(id);

const MONTAR = 26;       // m: más cerca que esto del centro de un local, se monta
const DESMONTAR = 36;    // m: más lejos, se desmonta (la diferencia evita titilar)
const CLAVE_MUNDO = "mundo:objetos";
const MAX_MUNDO = 24;

// ── Estado por objeto ───────────────────────────────────────────────────────
const objetos = {};
for (const l of C.locales) {
  for (const id of l.objetos) {
    objetos[id] = { id, local: l.id, lugar: null, include: null, estado: null, borrar: null };
  }
}

function estado(id, texto, ms) {
  const o = objetos[id];
  if (!o) return;
  if (!o.estado) o.estado = $("estado_" + id);
  if (!o.estado) return;
  o.estado.setAttribute("value", texto);
  clearTimeout(o.borrar);
  if (ms) o.borrar = setTimeout(() => o.estado.setAttribute("value", ""), ms);
}

/** Lo que dice un evento de un objeto, en una línea. */
function resumir(tipo, detalle) {
  if (detalle == null) return tipo;
  if (typeof detalle !== "object") return tipo + ": " + String(detalle);
  const partes = Object.entries(detalle).slice(0, 3).map(([k, v]) =>
    k + " " + (typeof v === "number" ? Math.round(v * 100) / 100 : typeof v === "object" ? "…" : String(v).slice(0, 18)));
  return tipo + ": " + partes.join(", ");
}

// ── Montar y desmontar ──────────────────────────────────────────────────────
function montar(id) {
  const o = objetos[id], d = C.objetos[id];
  if (!o || !d || o.include) return;
  if (!o.lugar) o.lugar = $("lugar_" + id);
  if (!o.lugar) return;
  const inc = root.createElement("include");
  inc.setAttribute("id", "obj_" + id);
  inc.setAttribute("src", d.url);
  if (d.recursos.length) inc.setAttribute("resources", d.recursos.join(","));
  if (d.eventos.length) inc.setAttribute("events", d.eventos.join(","));
  // La clave "calle" separa lo que se guarda acá de lo que se guarde en los
  // mundos de cada uno: el almacén es del origen del objeto, compartido.
  inc.setAttribute("props", JSON.stringify(Object.assign({}, d.props, { clave: "calle" })));
  for (const ev of d.eventos) {
    inc.addEventListener("component:" + ev, (e) => estado(id, resumir(ev, e.detail), 4000));
  }
  o.lugar.appendChild(inc);
  o.include = inc;
}

function desmontar(id) {
  const o = objetos[id];
  if (!o || !o.include) return;
  o.include.remove();
  o.include = null;
}

const cola = [];
function pedir(accion, id) {
  const i = cola.findIndex((c) => c.id === id);
  if (i >= 0) cola.splice(i, 1);
  const o = objetos[id];
  // Pedir lo que ya es: nada que hacer.
  if ((accion === "montar") === !!(o && o.include)) return;
  cola.push({ accion, id });
}
setInterval(() => {
  const c = cola.shift();
  if (!c) return;
  if (c.accion === "montar") montar(c.id);
  else desmontar(c.id);
}, 90);

function dondeEstoy() {
  if (typeof root.readViewerPose !== "function") return null;
  try {
    const p = root.readViewerPose();
    return p && Number.isFinite(p.px) ? { x: p.px, z: p.pz } : null;
  } catch (e) { return null; }
}

let sinPose = false;
function revisar() {
  const p = dondeEstoy();
  if (!p) {
    // Sin la posición del visitante no hay cercanía: se monta todo, de a uno.
    if (!sinPose) {
      sinPose = true;
      console.warn("[calle] sin read_camera_pose: se montan todos los objetos");
      for (const l of C.locales) for (const id of l.objetos) pedir("montar", id);
    }
    return;
  }
  // Los locales más cercanos primero: es lo que uno está mirando.
  const orden = C.locales
    .map((l) => ({ l, d: Math.hypot(l.centro.x - p.x, l.centro.z - p.z) }))
    .sort((a, b) => a.d - b.d);
  for (const { l, d } of orden) {
    for (const id of l.objetos) {
      if (d < MONTAR) pedir("montar", id);
      else if (d > DESMONTAR) pedir("desmontar", id);
    }
  }
}
setInterval(revisar, 300);
revisar();

// ── COPIAR ──────────────────────────────────────────────────────────────────
let seleccion = null;   // { id, url }
const copiado = $("copiado");

function elegir(id, el) {
  const d = C.objetos[id];
  if (!d) return;
  seleccion = { id, url: d.url };
  let vr = false;
  try { vr = !!(keyboard.state && keyboard.state.vr); } catch (e) { /* sin teclado */ }
  // En VR el foco editable abre el teclado virtual, que tiene la tecla de
  // copiar. En escritorio no hace falta, y además frena el WASD mientras dure.
  try { keyboard.focus(el, { editable: vr }); } catch (e) { /* el motor decide */ }
  estado(id, vr ? "tocá COPIAR en el teclado" : "apretá Ctrl+C para copiar", 8000);
}

root.addEventListener("keydown", (e) => {
  const k = String(e.key || "").toLowerCase();
  if (!(e.ctrlKey || e.metaKey) || k !== "c" || !seleccion) return;
  try {
    keyboard.copy(seleccion.url);
    estado(seleccion.id, "¡copiada! pegala en tu mundo con Ctrl+V", 6000);
    if (copiado) copiado.setAttribute("value", "copiado: " + C.objetos[seleccion.id].nombre);
  } catch (err) {
    estado(seleccion.id, "no se pudo copiar", 4000);
  }
  try { keyboard.blur(); } catch (err) { /* ya no tenía foco */ }
});

// ── LLEVAR ──────────────────────────────────────────────────────────────────
function leerMundo() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_MUNDO) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

function llevar(id) {
  const d = C.objetos[id];
  if (!d) return;
  const lista = leerMundo();
  if (lista.length >= MAX_MUNDO) { estado(id, "tu mundo está lleno (" + MAX_MUNDO + ")", 4000); return; }
  // La hora sola no alcanza: dos toques en el mismo milisegundo darían la
  // misma clave, y los dos objetos compartirían lo que guardan.
  const uid = id + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  lista.push({
    uid, id, nombre: d.nombre, url: d.url, montaje: d.montaje, caja: d.caja,
    recursos: d.recursos, eventos: d.eventos,
    props: Object.assign({}, d.props, { clave: uid }),
  });
  try {
    localStorage.setItem(CLAVE_MUNDO, JSON.stringify(lista));
    estado(id, "llevado: ya son " + lista.length + " en tu mundo", 5000);
  } catch (e) {
    estado(id, "no entró: " + ((e && e.name) || "error"), 4000);
  }
}

// Los botones de los atriles. Se buscan de a pocos por cuadro: con muchos
// locales son muchos ids, y resolverlos de una frena el arranque del script.
const ids = Object.keys(objetos);
let cursor = 0;
function enganchar() {
  for (let k = 0; k < 12 && cursor < ids.length; k++, cursor++) {
    const id = ids[cursor];
    const cop = $("copiar_" + id), lle = $("llevar_" + id);
    if (cop) {
      cop.addEventListener("toque", () => elegir(id, cop));
      cop.addEventListener("pointerenter", () => cop.setAttribute("color", "#5AB0FF"));
      cop.addEventListener("pointerleave", () => cop.setAttribute("color", "#0A84FF"));
    }
    if (lle) {
      lle.addEventListener("toque", () => llevar(id));
      lle.addEventListener("pointerenter", () => lle.setAttribute("color", "#7EE69A"));
      lle.addEventListener("pointerleave", () => lle.setAttribute("color", "#30D158"));
    }
  }
  if (cursor < ids.length) requestAnimationFrame(enganchar);
}
enganchar();

// ── El panel de calidad ─────────────────────────────────────────────────────
// Tres botones que vuelven a abrir la calle con otro detalle. Es el mismo
// documento con otra query: se navega el mundo, como un portal, pero sin uno.
(function panelDeCalidad() {
  const modos = C.modos || [];
  const listos = modos.map((m) => ({ m, el: $("modo_" + m.id) }));
  if (listos.some((b) => !b.el)) return void requestAnimationFrame(panelDeCalidad);
  for (const { m, el } of listos) {
    if (m.id === C.detalle) continue;
    el.addEventListener("pointerenter", () => el.setAttribute("color", "#44506A"));
    el.addEventListener("pointerleave", () => el.setAttribute("color", "#2E3444"));
    el.addEventListener("toque", () => {
      el.setAttribute("color", "#FFD60A");
      try { hiperspace.world.navigate(m.url); }
      catch (e) { console.error("[calle] no pude cambiar de calidad: " + e); }
    });
  }
})();
