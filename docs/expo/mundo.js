// Mi mundo, del lado del visor: leer la lista, montar cada objeto y dejar
// agregar más pegando una URL.
//
// La lista vive en localStorage["mundo:objetos"] de este origen: la llena el
// botón LLEVAR de la calle y el buzón de acá. Cada objeto se monta adentro del
// manipulador (server_manipulador), que con los mandos lo mueve, lo gira y lo
// escala, y guarda la pose en su propio almacén bajo la `clave` del objeto.
//
// Hay un modo "fijo" que monta los objetos sueltos, sin manipulador: sirve si
// ese servidor no está corriendo, y para ver cómo queda un objeto tal cual.
const root = hiperspace.dimention;
const M = globalThis.MUNDO;
const $ = (id) => root.getElementById(id);

const CLAVE = "mundo:objetos";
const CLAVE_MODO = "mundo:modo";
const MAX = 24;

const grupo = $("objetos");
const cuenta = $("cuenta");
const pegarTexto = $("pegar_texto");
const modoTexto = $("modo_texto");

function leer() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || "[]");
    return Array.isArray(v) ? v.filter((o) => o && typeof o.url === "string" && typeof o.uid === "string") : [];
  } catch (e) { return []; }
}
function guardar(lista) {
  try { localStorage.setItem(CLAVE, JSON.stringify(lista)); return true; } catch (e) { return false; }
}
let modo = "manipulador";
try { if (localStorage.getItem(CLAVE_MODO) === "fijo") modo = "fijo"; } catch (e) { /* default */ }

// ── Lugares ─────────────────────────────────────────────────────────────────
/** Le da a cada objeto sin lugar el primero libre de su montaje. Si se acaban,
 *  van en un anillo alrededor del deck. */
function asignarLugares(lista) {
  const usados = { pared: new Set(), mesa: new Set(), piso: new Set() };
  for (const o of lista) if (o.lugar && usados[o.lugar.tipo]) usados[o.lugar.tipo].add(o.lugar.i);
  let cambio = false;
  lista.forEach((o, k) => {
    if (o.lugar) return;
    const tipo = M.lugares[o.montaje] ? o.montaje : "mesa";
    const libres = M.lugares[tipo].map((_, i) => i).filter((i) => !usados[tipo].has(i));
    if (libres.length) { o.lugar = { tipo, i: libres[0] }; usados[tipo].add(libres[0]); }
    else o.lugar = { tipo: "anillo", i: k };
    cambio = true;
  });
  return cambio;
}
function pose(o) {
  const l = o.lugar || { tipo: "anillo", i: 0 };
  if (l.tipo !== "anillo" && M.lugares[l.tipo] && M.lugares[l.tipo][l.i]) return M.lugares[l.tipo][l.i];
  const a = (l.i * 0.7) % (Math.PI * 2);
  return { x: Math.sin(a) * 5.2, y: o.montaje === "pared" ? 1.4 : 0.06, z: -Math.cos(a) * 5.2, ry: -a };
}

/** En modo fijo, la pose es la del lugar más el ajuste hecho con el mando. */
function ubicarFijo(raiz, o) {
  const p = pose(o), a = o.ajuste || {};
  raiz.position = { x: p.x + (a.dx || 0), y: p.y + (a.dy || 0), z: p.z + (a.dz || 0) };
  raiz.rotation = { x: 0, y: p.ry + (a.dry || 0), z: 0 };
  const s = a.s || 1;
  raiz.scale = { x: s, y: s, z: s };
}

// ── Montar ──────────────────────────────────────────────────────────────────
const montados = new Map();   // uid → nodo raíz

function montar(o) {
  if (montados.has(o.uid)) return;
  const p = pose(o);
  const recursos = Array.isArray(o.recursos) ? o.recursos.filter((r) => /^[a-z_]+$/.test(r)) : [];
  let raiz;
  if (modo === "manipulador") {
    // El manipulador va sin transformar: es dueño de la pose del objeto y
    // trabaja en coordenadas de mundo, que es como llegan los mandos.
    raiz = root.createElement("include");
    raiz.setAttribute("src", M.manipulador);
    raiz.setAttribute("resources", ["read_pose_stream"].concat(recursos).join(","));
    raiz.setAttribute("props", JSON.stringify({
      src: o.url,
      propsMuestra: o.props || {},
      clave: "mundo-" + o.uid,
      caja: o.caja || { sx: 0.5, sy: 0.5, sz: 0.5, cy: 0.25 },
      pose: { x: p.x, y: p.y, z: p.z, ry: p.ry, s: 1 },
      recursos,
    }));
  } else {
    raiz = root.createElement("group");
    ubicarFijo(raiz, o);
    const inc = root.createElement("include");
    inc.setAttribute("src", o.url);
    if (recursos.length) inc.setAttribute("resources", recursos.join(","));
    inc.setAttribute("props", JSON.stringify(o.props || {}));
    raiz.appendChild(inc);
  }
  grupo.appendChild(raiz);
  montados.set(o.uid, raiz);
}
function desmontar(uid) {
  const r = montados.get(uid);
  if (r) r.remove();
  montados.delete(uid);
}

// De a uno cada 120 ms: montar muchos includes de golpe es lo que más le
// cuesta al motor.
const cola = [];
setInterval(() => { const o = cola.shift(); if (o) montar(o); }, 120);

let lista = [];
function sincronizar() {
  lista = leer();
  if (asignarLugares(lista)) guardar(lista);
  const vivos = new Set(lista.map((o) => o.uid));
  for (const uid of [...montados.keys()]) if (!vivos.has(uid)) desmontar(uid);
  for (const o of lista) if (!montados.has(o.uid) && !cola.includes(o)) cola.push(o);
  dibujarLista();
}

// ── La lista del buzón ──────────────────────────────────────────────────────
const filas = [];
for (let i = 0; i < M.filas; i++) {
  filas.push({ g: $("fila_" + i), nombre: $("fila_nombre_" + i), quitar: $("quitar_" + i) });
}
function dibujarLista() {
  if (cuenta) {
    cuenta.setAttribute("value", lista.length
      ? lista.length + " objeto" + (lista.length === 1 ? "" : "s") + (lista.length > M.filas ? " (se ven " + M.filas + ")" : "")
      : "vacío: traé cosas de la calle");
  }
  filas.forEach((f, i) => {
    if (!f.g) return;
    const o = lista[i];
    f.g.setAttribute("visible", o ? "inherit" : "false");
    if (o && f.nombre) f.nombre.setAttribute("value", (i + 1) + ". " + String(o.nombre || o.id || "objeto").slice(0, 26));
  });
  if (typeof marcarElegido === "function") marcarElegido();
}
filas.forEach((f, i) => {
  if (!f.quitar) return;
  f.quitar.addEventListener("toque", () => {
    const o = lista[i];
    if (!o) return;
    lista.splice(i, 1);
    guardar(lista);
    desmontar(o.uid);
    if (elegido === o.uid) elegido = null;
    dibujarLista();
  });
});

// ── Acomodar sin mandos ─────────────────────────────────────────────────────
// Se elige un objeto tocando su nombre en la lista, y el mando lo mueve. Con
// el manipulador, se le manda "mover" (él guarda la pose); en modo fijo se
// acumula un ajuste en la lista y se reubica el grupo.
let elegido = null;
const textoElegido = $("elegido");
function marcarElegido() {
  filas.forEach((f, i) => {
    const m = $("marca_" + i);
    if (m) m.setAttribute("visible", lista[i] && lista[i].uid === elegido ? "inherit" : "false");
  });
  const o = lista.find((x) => x.uid === elegido);
  if (textoElegido) textoElegido.setAttribute("value", o ? "moviendo: " + String(o.nombre || o.id).slice(0, 24) : "elegí un objeto en la lista");
}
filas.forEach((f, i) => {
  const b = $("elegir_" + i);
  if (!b) return;
  b.addEventListener("toque", () => {
    const o = lista[i];
    if (!o) return;
    elegido = elegido === o.uid ? null : o.uid;
    marcarElegido();
  });
});
function accionar(d) {
  const o = lista.find((x) => x.uid === elegido);
  const raiz = o && montados.get(o.uid);
  if (!o || !raiz) return;
  if (modo === "manipulador") {
    const envio = d.restaurar ? raiz.send("restaurar", null) : raiz.send("mover", d);
    Promise.resolve(envio).catch(() => { if (textoElegido) textoElegido.setAttribute("value", "todavía cargando…"); });
    return;
  }
  const a = o.ajuste || {};
  if (d.restaurar) o.ajuste = {};
  else {
    o.ajuste = {
      dx: (a.dx || 0) + (d.dx || 0), dy: (a.dy || 0) + (d.dy || 0), dz: (a.dz || 0) + (d.dz || 0),
      dry: (a.dry || 0) + (d.dry || 0),
      s: Math.max(0.1, Math.min(10, (a.s || 1) * (d.escala || 1))),
    };
  }
  guardar(lista);
  ubicarFijo(raiz, o);
}
for (const b of M.mando || []) {
  const el = $("mando_" + b.id);
  if (!el) continue;
  el.addEventListener("toque", () => accionar(b.d));
  el.addEventListener("pointerenter", () => el.setAttribute("color", "#5A6072"));
  el.addEventListener("pointerleave", () => el.setAttribute("color", "#3A3F4B"));
}

// ── Agregar por URL ─────────────────────────────────────────────────────────
/** Lo que se sabe de una URL: si es de este catálogo, todo; si no, lo justo. */
function describir(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const limpia = u.origin + u.pathname;
  const cat = M.catalogo[limpia];
  if (cat) {
    // La query de la URL copiada también configura: se suma a las props.
    const props = Object.assign({}, cat.props);
    for (const [k, v] of u.searchParams) props[k] = v;
    return { id: cat.id, nombre: cat.nombre, url: limpia, montaje: cat.montaje, caja: cat.caja, recursos: cat.recursos, eventos: cat.eventos, props };
  }
  // De otro lado: no se le delega nada. Un documento desconocido no recibe
  // audio ni navegación por haber sido pegado.
  const nombre = decodeURIComponent((u.pathname.split("/").pop() || u.host).replace(/\.hsml$/, ""));
  return { id: nombre, nombre, url: u.href, montaje: "mesa", caja: { sx: 0.6, sy: 0.6, sz: 0.6, cy: 0.3 }, recursos: [], eventos: [], props: {} };
}

function agregar(url) {
  const d = describir(url.trim());
  if (!d) return "no es una URL http";
  lista = leer();
  if (lista.length >= MAX) return "tu mundo está lleno (" + MAX + ")";
  const uid = String(d.id).replace(/[^\w-]/g, "").slice(0, 20) + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  lista.push(Object.assign({ uid }, d, { props: Object.assign({}, d.props, { clave: uid }) }));
  guardar(lista);
  sincronizar();
  return "agregado: " + d.nombre;
}

let escrito = "";
let escribiendo = false;
function avisoPegar(t, ms) {
  if (!pegarTexto) return;
  pegarTexto.setAttribute("value", t);
  clearTimeout(avisoPegar.t);
  if (ms) avisoPegar.t = setTimeout(() => pegarTexto.setAttribute("value", "tocá acá y Ctrl+V para pegar una URL"), ms);
}
const pegar = $("pegar");
if (pegar) {
  pegar.addEventListener("toque", () => {
    try { keyboard.focus(pegar, { editable: true }); } catch (e) { /* el motor decide */ }
    escribiendo = true;
    escrito = "";
    avisoPegar("pegá (Ctrl+V) o escribí la URL y Enter");
  });
  pegar.insertText = (t) => {
    if (!escribiendo) return;
    escrito = (escrito + t).slice(0, 2048);
    avisoPegar(escrito.length > 44 ? "…" + escrito.slice(-44) : escrito);
  };
  pegar.defaultKeyDown = (e) => {
    if (!escribiendo) return;
    const k = String(e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "v" && e.clipboardText) {
      if (e.preventDefault) e.preventDefault();
      const urls = String(e.clipboardText).match(/https?:\/\/\S+/g) || [];
      if (!urls.length) { avisoPegar("en el portapapeles no hay una URL", 3500); return; }
      const res = urls.slice(0, 4).map(agregar);
      avisoPegar(res[res.length - 1], 4000);
      terminar();
    } else if (e.key === "Backspace") {
      escrito = escrito.slice(0, -1);
      avisoPegar(escrito || "pegá (Ctrl+V) o escribí la URL y Enter");
    } else if (e.key === "Enter") {
      avisoPegar(escrito ? agregar(escrito) : "no escribiste nada", 4000);
      terminar();
    } else if (e.key === "Escape") {
      avisoPegar("cancelado", 1500);
      terminar();
    }
  };
  pegar.addEventListener("blur", () => { escribiendo = false; });
}
function terminar() {
  escribiendo = false;
  escrito = "";
  try { keyboard.blur(); } catch (e) { /* ya no tenía foco */ }
}

// ── Vaciar y modo ───────────────────────────────────────────────────────────
let confirmar = 0;
const vaciar = $("vaciar");
if (vaciar) {
  vaciar.addEventListener("toque", () => {
    const ahora = Date.now();
    if (ahora - confirmar > 3000) { confirmar = ahora; avisoPegar("tocá de nuevo para vaciar todo", 3000); return; }
    confirmar = 0;
    for (const uid of [...montados.keys()]) desmontar(uid);
    cola.length = 0;
    guardar([]);
    sincronizar();
    avisoPegar("vacío", 2000);
  });
}
function dibujarModo() {
  if (modoTexto) modoTexto.setAttribute("value", modo === "fijo" ? "modo: fijo" : "modo: acomodar");
}
const botonModo = $("modo");
if (botonModo) {
  botonModo.addEventListener("toque", () => {
    modo = modo === "fijo" ? "manipulador" : "fijo";
    try { localStorage.setItem(CLAVE_MODO, modo); } catch (e) { /* sin memoria */ }
    for (const uid of [...montados.keys()]) desmontar(uid);
    cola.length = 0;
    dibujarModo();
    sincronizar();
  });
}

// Si la calle está abierta en otra ventana y llevan algo, aparece acá.
try { addEventListener("storage", (e) => { if (e.key === CLAVE) sincronizar(); }); } catch (e) { /* sin eventos */ }

dibujarModo();
sincronizar();
