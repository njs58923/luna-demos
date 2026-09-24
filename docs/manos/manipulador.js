// El manipulador: mover, girar y escalar un documento con los mandos de VR.
//
// Parte del agarre de la demo de física de server_hsml (fisicas.js): el grip con
// histéresis, el cuerpo pegado a la mano como unión rígida —el offset vive en
// el marco local del mando, así que al girar la muñeca el objeto orbita el
// punto de agarre en vez de girar sobre su centro—. Lo que agrega es un marco
// al estilo de los "bounds control" de las interfaces de VR:
//
//   grip sobre el cuerpo        mover y girar, pegado a la mano
//   grip en una esquina         escalar (uniforme, alrededor del centro)
//   grip en una arista          girar alrededor del eje de esa arista
//                               (rojo = X, verde = Y, azul = Z, del objeto)
//   grip con las dos manos      mover, girar y escalar a la vez: la distancia
//                               entre las manos es la escala
//   gatillo mientras tanto      encaje: giro de a 15°, escala de a 0.1,
//                               y mover sólo traslada, en una grilla de 5 cm
//
// No hay "hover" en el motor, pero sí algo mejor para esto: el posezone manda
// la pose de cada mano en cada cuadro, apriete o no. De ahí sale la cercanía
// —las manijas aparecen cuando la mano se acerca y crecen bajo ella— sin que el
// motor tenga que saber nada.
//
// La pose se guarda en localStorage al soltar, bajo "manipulador:<clave>". Cada
// origen tiene su propio almacén, así que la clave sólo tiene que distinguir
// entre los manipuladores de este servidor.
const root = hiperspace.dimention;
const byId = (id) => root.getElementById(id);
const P = (typeof component !== "undefined" && component.props) || {};

// ── Parámetros ──────────────────────────────────────────────────────────────
const GRIP_ON = 0.6, GRIP_OFF = 0.35;       // histéresis del grip (como la física)
const GATILLO_ON = 0.55, GATILLO_OFF = 0.3;
const RADIO_MANIJA = 0.09;   // m: a esta distancia de una manija, la mano la toma
const MARGEN_CUERPO = 0.06;  // m: el cuerpo se toma un poco por fuera de la caja
const RADIO_VISTA = 0.5;     // m: más cerca que esto de la caja, aparecen las manijas
const MARGEN_MARCO = 0.012;  // m: el marco se separa del objeto para no taparlo
const ESCALA_MIN = 0.1, ESCALA_MAX = 10;
const PASO_GIRO = Math.PI / 12;  // 15°
const PASO_ESCALA = 0.1;
const PASO_GRILLA = 0.05;
const MANO_VIEJA_MS = 400;   // sin noticias de una mano por este tiempo, se la da por ida

const C = {
  arista: "#5A5A70", aristaCerca: "#40E0D0", activo: "#FFD60A",
  esquina: "#FFFFFF", esquinaCerca: "#FF9F0A",
  x: "#FF3B30", y: "#30D158", z: "#0A84FF",
};

// ── Álgebra (cuaterniones de Hamilton {x,y,z,w}) ────────────────────────────
const v3 = (x, y, z) => ({ x, y, z });
const suma = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const resta = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const por = (a, k) => v3(a.x * k, a.y * k, a.z * k);
const punto = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cruz = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const largo = (a) => Math.hypot(a.x, a.y, a.z);
const unitario = (a) => { const l = largo(a) || 1; return por(a, 1 / l); };

function qMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
const qConj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
function qNorm(q) {
  const m = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / m, y: q.y / m, z: q.z / m, w: q.w / m };
}
function qEje(eje, ang) {
  const s = Math.sin(ang / 2);
  return { x: eje.x * s, y: eje.y * s, z: eje.z * s, w: Math.cos(ang / 2) };
}
function rotar(q, v) {
  const r = qMul(qMul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), qConj(q));
  return v3(r.x, r.y, r.z);
}
/** El giro más corto que lleva la dirección a a la b (ambas unitarias). */
function qDesde(a, b) {
  const d = punto(a, b);
  if (d < -0.999999) {
    // opuestas: cualquier eje perpendicular sirve
    const orto = Math.abs(a.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
    return qEje(unitario(cruz(a, orto)), Math.PI);
  }
  const c = cruz(a, b);
  return qNorm({ x: c.x, y: c.y, z: c.z, w: 1 + d });
}
/** Euler XYZ intrínseco → cuaternión: el motor arma la rotación con
 *  Quat::from_euler(EulerRot::XYZ, x, y, z), que es Rx·Ry·Rz. */
function qDeEuler(x, y, z) {
  return qMul(qMul(qEje(v3(1, 0, 0), x), qEje(v3(0, 1, 0), y)), qEje(v3(0, 0, 1), z));
}
/** La inversa exacta de lo anterior (misma derivación que fisicas.js). */
function eulerDeQ(q) {
  const { x, y, z, w } = q;
  const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - w * z), m02 = 2 * (x * z + w * y);
  const m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - w * x);
  const m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.max(-1, Math.min(1, m02)));
  if (Math.abs(m02) < 0.9999999) return v3(Math.atan2(-m12, m22), ey, Math.atan2(-m01, m00));
  return v3(Math.atan2(m21, m11), ey, 0);
}
const encajar = (v, paso) => Math.round(v / paso) * paso;
const acotar = (v, a, b) => Math.max(a, Math.min(b, v));

// ── Configuración ───────────────────────────────────────────────────────────
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function leerCaja(c) {
  c = c || {};
  return {
    sx: Math.max(0.01, num(c.sx, 0.5)), sy: Math.max(0.01, num(c.sy, 0.5)), sz: Math.max(0.01, num(c.sz, 0.5)),
    cx: num(c.cx, 0), cy: num(c.cy, 0), cz: num(c.cz, 0),
  };
}
function leerPose(p) {
  p = p || {};
  return {
    p: v3(num(p.x, 0), num(p.y, 1), num(p.z, -1)),
    q: qDeEuler(num(p.rx, 0), num(p.ry, 0), num(p.rz, 0)),
    s: acotar(num(p.s, 1), ESCALA_MIN, ESCALA_MAX),
  };
}
const copiar = (pose) => ({ p: { ...pose.p }, q: { ...pose.q }, s: pose.s });

let caja = leerCaja(P.caja);
let inicial = leerPose(P.pose);
const CLAVE = "manipulador:" + String(P.clave || P.src || "muestra");

// ── Persistencia ────────────────────────────────────────────────────────────
// localStorage puede no estar (documento sin origen http) o fallar (cuota):
// en los dos casos el manipulador sigue andando, sólo que sin memoria.
function cargar() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const ok = [d.p.x, d.p.y, d.p.z, d.q.x, d.q.y, d.q.z, d.q.w, d.s].every((v) => typeof v === "number" && Number.isFinite(v));
    if (!ok) return null;
    return { p: v3(d.p.x, d.p.y, d.p.z), q: qNorm(d.q), s: acotar(d.s, ESCALA_MIN, ESCALA_MAX) };
  } catch (e) {
    return null;
  }
}
function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ v: 1, p: pose.p, q: pose.q, s: pose.s }));
  } catch (e) {
    console.error("[manipulador] no se pudo guardar:", e && e.message || e);
  }
}
function avisar() {
  if (typeof component === "undefined") return;
  component.emit("pose", { p: pose.p, q: pose.q, s: pose.s }).catch(() => {});
}

let pose = cargar() || copiar(inicial);

// ── Nodos ───────────────────────────────────────────────────────────────────
const zona = byId("zona");
const objetivo = byId("objetivo");
const centrado = byId("centrado");
const marco = byId("marco");
const grupoAristas = byId("aristas");
const grupoManijas = byId("manijas");
const lectura = byId("lectura");
const pie = byId("pie");
const botonRestaurar = byId("restaurar");

function crear(tag, attrs, padre) {
  const el = root.createElement(tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  padre.appendChild(el);
  return el;
}

// El documento envuelto. La ruta se hace absoluta acá: relativa, la
// resolvería el motor contra quién sabe qué documento.
if (centrado) {
  const hijo = root.createElement("include");
  hijo.setAttribute("src", new URL(String(P.src || "./muestra.hsml"), location.href).href);
  if (P.propsMuestra && typeof P.propsMuestra === "object") {
    hijo.setAttribute("props", JSON.stringify(P.propsMuestra));
  }
  // Lo que el objeto necesita para andar entero (audio, navigate_world…).
  // Rige la intersección: sólo llega lo que este documento recibió, y éste
  // sólo recibe lo que quien lo monta le delegó.
  if (Array.isArray(P.recursos) && P.recursos.length) {
    const permitidos = P.recursos.filter((r) => typeof r === "string" && /^[a-z_]+$/.test(r));
    if (permitidos.length) hijo.setAttribute("resources", permitidos.join(","));
  }
  centrado.appendChild(hijo);
}

// Esquinas (escala) y aristas (giro). Cada arista corre a lo largo de un eje y
// su manija gira alrededor de ese mismo eje: tomar la arista vertical y
// arrastrarla de costado es girar en Y, que es lo que la mano espera.
const EJES = ["x", "y", "z"];
const esquinas = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  esquinas.push({ tipo: "escala", d: v3(sx, sy, sz), el: null, estado: "" });
}
const aristas = [];
for (const eje of EJES) {
  const [a, b] = EJES.filter((e) => e !== eje);
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const d = v3(0, 0, 0); d[a] = sa; d[b] = sb;
    const ejeLocal = v3(0, 0, 0); ejeLocal[eje] = 1;
    aristas.push({ tipo: "giro", eje, ejeLocal, d, barra: null, el: null, estado: "" });
  }
}
for (const m of esquinas) {
  m.el = crear("box", { sx: 0.035, sy: 0.035, sz: 0.035, color: C.esquina, touchable: "false" }, grupoManijas);
}
for (const m of aristas) {
  m.barra = crear("box", { color: C.arista, touchable: "false" }, grupoAristas);
  m.el = crear("sphere", { sx: 0.04, sy: 0.04, sz: 0.04, color: C[m.eje], touchable: "false" }, grupoManijas);
}

// ── Aplicar la pose ─────────────────────────────────────────────────────────
/** Media caja del marco, en metros de mundo. */
const mitad = () => v3(caja.sx * pose.s / 2 + MARGEN_MARCO, caja.sy * pose.s / 2 + MARGEN_MARCO, caja.sz * pose.s / 2 + MARGEN_MARCO);
const hadamard = (a, b) => v3(a.x * b.x, a.y * b.y, a.z * b.z);

let escalaDibujada = null;
function dibujarMarco() {
  const h = mitad();
  for (const m of esquinas) m.el.position = hadamard(m.d, h);
  for (const m of aristas) {
    const pos = hadamard(m.d, h);
    m.el.position = pos;
    m.barra.position = pos;
    const grosor = m.estado === "activo" ? 0.01 : m.estado === "cuerpo" ? 0.008 : 0.005;
    const tam = v3(grosor, grosor, grosor);
    tam[m.eje] = 2 * h[m.eje];
    m.barra.scale = tam;
  }
  escalaDibujada = pose.s;
}

/** Si la lectura está a la vista. Antes de aplicarPose, que la usa. */
let lecturaVisible = null;

function aplicarPose() {
  const e = eulerDeQ(pose.q);
  objetivo.position = pose.p;
  objetivo.rotation = e;
  objetivo.scale = v3(pose.s, pose.s, pose.s);
  marco.position = pose.p;
  marco.rotation = e;
  if (zona) zona.position = pose.p;
  if (escalaDibujada !== pose.s) dibujarMarco();

  // Alto del objeto ya girado: la mitad de su caja envolvente alineada al
  // mundo. Con eso la lectura y el botón nunca quedan adentro del objeto.
  const h = mitad();
  const ex = rotar(pose.q, v3(1, 0, 0)), ey = rotar(pose.q, v3(0, 1, 0)), ez = rotar(pose.q, v3(0, 0, 1));
  const alto = Math.abs(ex.y) * h.x + Math.abs(ey.y) * h.y + Math.abs(ez.y) * h.z;
  if (pie) pie.position = v3(pose.p.x, pose.p.y - alto - 0.08, pose.p.z);
  // Apagada, la lectura va bajo el piso: el motor no aplicaba `visible` a un
  // <text> ya creado (arreglado en dom.rs) y el texto de la última operación
  // se quedaba flotando sobre el objeto.
  if (lectura) lectura.position = lecturaVisible ? v3(pose.p.x, pose.p.y + alto + 0.08, pose.p.z) : v3(0, -50, 0);
}

if (centrado) centrado.position = v3(-caja.cx, -caja.cy, -caja.cz);
dibujarMarco();
aplicarPose();

// ── Manos ───────────────────────────────────────────────────────────────────
function nuevaMano() {
  return { pos: null, q: null, grip: false, gatillo: false, t: 0, blanco: null };
}
const manos = { left: nuevaMano(), right: nuevaMano() };
const otra = (mano) => (mano === "left" ? "right" : "left");

/** El blanco "cuerpo": no es un nodo, es todo lo que está adentro de la caja. */
const CUERPO = { tipo: "mover" };

/** Punto de mundo → coordenadas del marco (sin escala). */
const aLocal = (w) => rotar(qConj(pose.q), resta(w, pose.p));

/** Distancia de un punto de mundo a la caja (0 adentro). */
function distanciaACaja(w) {
  const l = aLocal(w), h = mitad();
  return largo(v3(Math.max(0, Math.abs(l.x) - h.x), Math.max(0, Math.abs(l.y) - h.y), Math.max(0, Math.abs(l.z) - h.z)));
}

/** Qué tomaría la mano si apretara ahora. Las manijas le ganan al cuerpo:
 *  están sobre él, y si no, nunca se podría agarrar una arista desde adentro. */
function blancoEn(w) {
  const l = aLocal(w), h = mitad();
  let mejor = null, mejorD = RADIO_MANIJA;
  for (const m of esquinas.concat(aristas)) {
    const d = largo(resta(l, hadamard(m.d, h)));
    if (d < mejorD) { mejorD = d; mejor = m; }
  }
  if (mejor) return mejor;
  if (distanciaACaja(w) <= MARGEN_CUERPO) return CUERPO;
  return null;
}

// ── Operaciones ─────────────────────────────────────────────────────────────
// `op` es lo que se está haciendo, con todo lo que hace falta para calcularlo
// desde el principio en cada cuadro: la pose y la mano al empezar. Se calcula
// siempre desde el inicio y no por deltas, para que no se acumule error.
let op = null;

const encajando = () => op && (op.tipo === "dos"
  ? manos.left.gatillo || manos.right.gatillo
  : manos[op.mano].gatillo);

function iniciar(blanco, mano) {
  const m = manos[mano];
  const o = { tipo: blanco.tipo, blanco, mano, pose0: copiar(pose), h0: { ...m.pos }, encaje: m.gatillo };
  if (o.tipo === "mover" && m.q && !m.gatillo) {
    // Unión rígida, como en la física: offset y giro en el marco del mando.
    const inv = qConj(m.q);
    o.offLocal = rotar(inv, resta(pose.p, m.pos));
    o.qOff = qMul(inv, pose.q);
  } else if (o.tipo === "escala") {
    o.d0 = Math.max(0.02, largo(resta(m.pos, pose.p)));
  } else if (o.tipo === "giro") {
    o.ejeW = unitario(rotar(pose.q, blanco.ejeLocal));
    o.u0 = proyectar(resta(m.pos, pose.p), o.ejeW);
  }
  return o;
}

function iniciarDos() {
  const a = manos.left.pos, b = manos.right.pos;
  const v0 = resta(b, a);
  const d0 = largo(v0);
  if (d0 < 0.03) return null;
  return {
    tipo: "dos", pose0: copiar(pose), m0: por(suma(a, b), 0.5), v0: unitario(v0), d0,
    encaje: manos.left.gatillo || manos.right.gatillo,
  };
}

/** La componente de v perpendicular al eje. */
const proyectar = (v, eje) => resta(v, por(eje, punto(v, eje)));

function actualizar() {
  const p0 = op.pose0;
  const snap = encajando();

  if (op.tipo === "mover") {
    const m = manos[op.mano];
    if (op.qOff && m.q) {
      pose.q = qNorm(qMul(m.q, op.qOff));
      pose.p = suma(m.pos, rotar(m.q, op.offLocal));
    } else {
      pose.q = p0.q;
      pose.p = suma(p0.p, resta(m.pos, op.h0));
      if (snap) pose.p = v3(encajar(pose.p.x, PASO_GRILLA), encajar(pose.p.y, PASO_GRILLA), encajar(pose.p.z, PASO_GRILLA));
    }
  } else if (op.tipo === "escala") {
    const d = largo(resta(manos[op.mano].pos, p0.p));
    let s = p0.s * d / op.d0;
    if (snap) s = encajar(s, PASO_ESCALA);
    pose.s = acotar(s, ESCALA_MIN, ESCALA_MAX);
  } else if (op.tipo === "giro") {
    const u1 = proyectar(resta(manos[op.mano].pos, p0.p), op.ejeW);
    // Cerca del eje el ángulo no significa nada: se espera a que la mano salga.
    if (largo(op.u0) > 0.01 && largo(u1) > 0.01) {
      let ang = Math.atan2(punto(op.ejeW, cruz(op.u0, u1)), punto(op.u0, u1));
      if (snap) ang = encajar(ang, PASO_GIRO);
      op.angulo = ang;
      pose.q = qNorm(qMul(qEje(op.ejeW, ang), p0.q));
    }
  } else if (op.tipo === "dos") {
    const a = manos.left.pos, b = manos.right.pos;
    const v1 = resta(b, a);
    const d1 = Math.max(0.03, largo(v1));
    let s = p0.s * d1 / op.d0;
    if (snap) s = encajar(s, PASO_ESCALA);
    s = acotar(s, ESCALA_MIN, ESCALA_MAX);
    const k = s / p0.s;
    const r = qDesde(op.v0, unitario(v1));
    const m1 = por(suma(a, b), 0.5);
    // Escala y giro alrededor del punto medio entre las manos: lo que está
    // entre ellas se queda entre ellas.
    pose.p = suma(m1, por(rotar(r, resta(p0.p, op.m0)), k));
    pose.q = qNorm(qMul(r, p0.q));
    pose.s = s;
  }
}

/** Grip que sube: tomar lo que haya bajo la mano. */
function apretar(mano) {
  const b = blancoEn(manos[mano].pos);
  if (op && op.tipo === "mover" && op.mano !== mano) {
    // La segunda mano: vale cualquier cosa cerca del objeto, no hace falta
    // acertarle a una manija con la otra mano ocupada.
    if (b || distanciaACaja(manos[mano].pos) < 0.25) {
      const dos = iniciarDos();
      if (dos) op = dos;
    }
    return;
  }
  if (!op && b) op = iniciar(b, mano);
}

/** Grip que baja. */
function soltar(mano) {
  if (!op) return;
  if (op.tipo === "dos") {
    // Queda una mano: sigue moviendo desde donde está, sin saltos.
    const queda = otra(mano);
    op = manos[queda].grip && manos[queda].pos ? iniciar(CUERPO, queda) : null;
    if (op) return;
  } else if (op.mano !== mano) {
    return;
  }
  op = null;
  guardar();
  avisar();
}

const participa = (mano) => op && (op.tipo === "dos" || op.mano === mano);

// ── Estados visuales ────────────────────────────────────────────────────────
function marcar(m, estado) {
  if (m.estado === estado) return false;
  m.estado = estado;
  if (m.tipo === "escala") {
    const t = estado === "activo" ? 0.06 : estado === "cerca" ? 0.055 : 0.035;
    m.el.scale = v3(t, t, t);
    m.el.setAttribute("color", estado === "activo" ? C.activo : estado === "cerca" ? C.esquinaCerca : C.esquina);
  } else {
    const t = estado === "activo" ? 0.07 : estado === "cerca" ? 0.065 : 0.04;
    m.el.scale = v3(t, t, t);
    m.el.setAttribute("color", estado === "activo" ? C.activo : estado === "cerca" ? "#FFFFFF" : C[m.eje]);
    m.barra.setAttribute("color", estado === "activo" ? C.activo : estado === "cuerpo" ? C.aristaCerca : C.arista);
  }
  return true;
}

let manijasVisibles = null;
function refrescar() {
  const blancos = new Set();
  for (const mano of ["left", "right"]) if (manos[mano].blanco) blancos.add(manos[mano].blanco);
  const cuerpoActivo = op && (op.tipo === "mover" || op.tipo === "dos");
  const cuerpoCerca = blancos.has(CUERPO);

  let cambioGrosor = false;
  for (const m of esquinas) {
    marcar(m, op && op.blanco === m ? "activo" : blancos.has(m) ? "cerca" : "");
  }
  for (const m of aristas) {
    const e = op && op.blanco === m ? "activo"
      : cuerpoActivo ? "activo"
      : blancos.has(m) ? "cerca"
      : cuerpoCerca ? "cuerpo" : "";
    if (marcar(m, e)) cambioGrosor = true;
  }
  if (cambioGrosor) dibujarMarco();

  // Las manijas sólo cuando una mano anda cerca: de lejos el objeto se ve
  // limpio, con el marco apenas insinuado.
  let cerca = !!op;
  for (const mano of ["left", "right"]) {
    const m = manos[mano];
    if (m.pos && distanciaACaja(m.pos) < RADIO_VISTA) cerca = true;
  }
  if (cerca !== manijasVisibles) {
    manijasVisibles = cerca;
    grupoManijas.setAttribute("visible", cerca ? "true" : "false");
  }

  const texto = op ? textoLectura() : "";
  if (lectura) {
    if (!!texto !== lecturaVisible) {
      lecturaVisible = !!texto;
      lectura.setAttribute("visible", texto ? "inherit" : "false");
      aplicarPose();
    }
    if (texto) lectura.setAttribute("value", texto);
  }
}

const f2 = (v) => v.toFixed(2);
function textoLectura() {
  const encaje = encajando() ? "  [encaje]" : "";
  if (op.tipo === "escala") return "escala " + f2(pose.s) + "x" + encaje;
  if (op.tipo === "giro") return "giro " + op.blanco.eje.toUpperCase() + " " + Math.round((op.angulo || 0) * 180 / Math.PI) + " grados" + encaje;
  if (op.tipo === "dos") return "escala " + f2(pose.s) + "x  -  dos manos" + encaje;
  return "x " + f2(pose.p.x) + "  y " + f2(pose.p.y) + "  z " + f2(pose.p.z) + encaje;
}

// ── Entrada ─────────────────────────────────────────────────────────────────
function onPose(evt) {
  const mano = evt.hand === "left" ? "left" : "right";
  const m = manos[mano];
  m.pos = v3(evt.px, evt.py, evt.pz);
  m.q = evt.qw != null ? qNorm({ x: evt.qx, y: evt.qy, z: evt.qz, w: evt.qw }) : null;
  m.t = performance.now();

  const g = evt.grip || 0, tr = evt.trigger || 0;
  const antesGrip = m.grip, antesGatillo = m.gatillo;
  if (!m.grip && g > GRIP_ON) m.grip = true;
  else if (m.grip && g < GRIP_OFF) m.grip = false;
  if (!m.gatillo && tr > GATILLO_ON) m.gatillo = true;
  else if (m.gatillo && tr < GATILLO_OFF) m.gatillo = false;

  if (!antesGrip && m.grip) apretar(mano);
  else if (antesGrip && !m.grip) soltar(mano);

  // Cambiar el encaje a mitad de camino re-ancla la operación en la pose
  // actual: si no, el objeto saltaría a donde "debería" estar con la otra regla.
  if (op && participa(mano) && m.gatillo !== antesGatillo) {
    if (op.tipo === "dos") op = iniciarDos() || op;
    else op = iniciar(op.blanco, op.mano);
  }

  if (op && participa(mano)) {
    actualizar();
    aplicarPose();
  }
  m.blanco = op ? null : blancoEn(m.pos);
  refrescar();
}

if (zona) zona.addEventListener("posemove", onPose);

// Una mano que sale del volumen, o un mando que se apaga, no manda el grip
// soltado: deja de mandar. Pasado un rato se la da por soltada.
function vigilar() {
  const ahora = performance.now();
  let cambio = false;
  for (const mano of ["left", "right"]) {
    const m = manos[mano];
    if (m.pos && ahora - m.t > MANO_VIEJA_MS) {
      if (m.grip) { m.grip = false; soltar(mano); }
      m.gatillo = false;
      m.pos = null;
      m.blanco = null;
      cambio = true;
    }
  }
  if (cambio) refrescar();
  requestAnimationFrame(vigilar);
}
requestAnimationFrame(vigilar);

// ── Restaurar ───────────────────────────────────────────────────────────────
function restaurar() {
  op = null;
  pose = copiar(inicial);
  try { localStorage.removeItem(CLAVE); } catch (e) { /* sin almacén */ }
  dibujarMarco();
  aplicarPose();
  refrescar();
  avisar();
}
if (botonRestaurar) botonRestaurar.addEventListener("toque", restaurar);

// Mover sin mandos: un corrimiento en metros (mundo), un giro en Y y un
// factor de escala. Es lo que usa "mi mundo" de server_expo para acomodar
// objetos desde el escritorio, donde no hay grip.
function mover(d) {
  if (!d || typeof d !== "object") return;
  const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  pose.p = v3(pose.p.x + n(d.dx), Math.max(-5, pose.p.y + n(d.dy)), pose.p.z + n(d.dz));
  if (n(d.dry)) pose.q = qNorm(qMul(qEje(v3(0, 1, 0), n(d.dry)), pose.q));
  if (n(d.escala) > 0) pose.s = acotar(pose.s * n(d.escala), ESCALA_MIN, ESCALA_MAX);
  dibujarMarco();
  aplicarPose();
  refrescar();
  guardar();
  avisar();
}

if (typeof component !== "undefined") {
  // Los mensajes del padre (include.send) llegan como "message:<nombre>".
  // Escuchar "restaurar" a secas no recibía nada en el motor: sólo andaba en
  // el arnés de pruebas, que los despachaba con el nombre pelado.
  component.addEventListener("message:restaurar", restaurar);
  component.addEventListener("message:mover", (e) => mover(e.detail));
  component.addEventListener("propschange", (e) => {
    const k = e.detail.changedKeys || [];
    if (k.includes("caja")) {
      caja = leerCaja(e.detail.props.caja);
      if (centrado) centrado.position = v3(-caja.cx, -caja.cy, -caja.cz);
      dibujarMarco();
      aplicarPose();
    }
    if (k.includes("pose")) inicial = leerPose(e.detail.props.pose);
  });
}

refrescar();
