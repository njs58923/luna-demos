// El tren: el reciclado.
//
// Afuera hay 326 objetos y ninguno se crea ni se destruye. Cada uno tiene una
// posición dentro de un corredor de 120 m; cuando el corredor lo pasa, vuelve al
// principio con otra forma —otro alto, otra separación de la vía— y nadie lo
// nota. Es el mismo truco que el campo de nubes del amanecer, pero en un solo
// eje y con nodos del DOM en vez de una malla.
//
// Todo se mueve en **un** `setTransformBatch` por frame, y cada entrada lleva la
// transformación completa: el batch escribe, no parchea.
//
// El vagón no se mueve. Cabecea: dos grados en Z, uno en X, desfasados y con
// períodos que no son múltiplos entre sí. Ese detalle es el que convierte "el
// paisaje se desliza" en "voy en un tren"; sin él, la escena se lee como una
// cinta transportadora.
const CFG = globalThis.TREN || {};
const CORREDOR = CFG.corredor || 120;
const root = hiperspace.dimention;

function hash(i, sal) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(sal | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Las velocidades del botón, en metros por segundo. La primera es un tren de
 *  maniobras y la última un rápido; más que eso, los durmientes se vuelven un
 *  borrón y el reciclado empieza a verse. */
const VELOCIDADES = [8, 18, 34, 0];
const NOMBRE = ["lento", "de paseo", "rápido", "parado"];
let iVel = 1;
let recorrido = 0;

const cosas = [];       // { el, z, x, y, tipo, sem }
let vagon = null;
let panel = {};
let lamparas = [];
let listo = false;
let t0 = 0;
let previo = 0;
let ticTexto = -1;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** Le da a una cosa su posición lateral y su tamaño según el tipo. Se llama al
 *  crearla y **cada vez que se recicla**: es lo que evita que el paisaje se
 *  repita, porque la fila de árboles que vuelve no es la que se fue. */
function resembrar(c, k) {
  const s = hash(c.sem * 7919 + k, 13);
  const s2 = hash(c.sem * 7919 + k, 17);
  if (c.tipo === "poste") {
    c.x = (s < 0.5 ? -1 : 1) * (5.2 + s2 * 0.6);
    c.y = 0;
  } else if (c.tipo === "arbol") {
    const lado = s < 0.5 ? -1 : 1;
    c.x = lado * (9 + s2 * 46);
    c.y = -0.3 - s2 * 0.4;
    c.esc = 0.7 + hash(c.sem + k, 19) * 1.5;
  } else if (c.tipo === "loma") {
    const lado = s < 0.5 ? -1 : 1;
    c.x = lado * (60 + s2 * 90);
    c.y = -6 - s2 * 3;
    c.esc = 0.8 + hash(c.sem + k, 23) * 1.8;
  }
}

function preparar() {
  vagon = root.getElementById("vagon");
  if (!vagon) return false;
  for (const id of ["t_titulo", "t_dato", "t_vel"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  const boton = root.getElementById("acelerar");
  if (!boton) return false;

  const familias = [
    ["poste_", CFG.postes || 0, "poste"],
    ["arbol_", CFG.arboles || 0, "arbol"],
    ["durm_", CFG.durmientes || 0, "durmiente"],
    ["loma_", CFG.lomas || 0, "loma"],
  ];
  for (const [pre, cuantos, tipo] of familias) {
    for (let i = 0; i < cuantos; i++) {
      const el = root.getElementById(pre + i);
      if (!el) return false;
      const c = { el: el, tipo: tipo, sem: i + 1, esc: 1, x: 0, y: 0,
                  // Repartidas parejo por el corredor: si se sortean, quedan
                  // grumos y huecos, y un hueco en la fila de durmientes se ve.
                  z: -CORREDOR / 2 + (CORREDOR * i) / cuantos };
      resembrar(c, 0);
      cosas.push(c);
    }
  }
  for (let i = 0; i < (CFG.lamparas || 0); i++) {
    const el = root.getElementById("luz_" + i);
    if (el) lamparas.push({ el: el, fase: hash(i, 31) * 6.28 });
  }

  boton.addEventListener("toque", function () {
    iVel = (iVel + 1) % VELOCIDADES.length;
    texto("t_vel", "velocidad: " + NOMBRE[iVel]);
  });
  console.log("[tren] " + cosas.length + " cosas afuera, recicladas en un corredor de " +
              CORREDOR + " m");
  return true;
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) { t0 = ahora; previo = ahora; }
  if (!listo) {
    if (preparar()) listo = true;
    return;
  }
  const dt = Math.min(0.05, (ahora - previo) / 1000);
  previo = ahora;
  const t = (ahora - t0) / 1000;
  const v = VELOCIDADES[iVel];
  recorrido += v * dt;

  const lote = [];
  for (const c of cosas) {
    c.z += v * dt;
    if (c.z > CORREDOR / 2) {
      c.z -= CORREDOR;
      // Vuelve distinta: el paisaje no se repite aunque los nodos sí.
      resembrar(c, Math.floor(recorrido));
    }
    if (c.tipo === "durmiente") {
      lote.push(c.el.nodeId, 0, 0.03, c.z, 0, 0, 0);
    } else if (c.tipo === "loma") {
      lote.push(c.el.nodeId, c.x, c.y, c.z, 0, 0, 0);
    } else {
      lote.push(c.el.nodeId, c.x, c.y, c.z, 0, 0, 0);
    }
  }

  // El cabeceo. Dos períodos que no son múltiplos entre sí, y la amplitud sube
  // con la velocidad: parado, el vagón se queda quieto.
  const k = v / 34;
  lote.push(
    vagon.nodeId, 0, 0.9 + Math.sin(t * 3.7) * 0.012 * k, 0,
    Math.sin(t * 1.9) * 0.012 * k, 0, Math.sin(t * 2.6) * 0.035 * k,
  );
  root.setTransformBatch(lote);

  // Las lámparas titilan apenas, y sólo cuando el tren anda: es la señal más
  // barata de que el vagón está en movimiento aunque uno mire para adentro.
  const paso = Math.floor(t * 10);
  if (paso === ticTexto) return;
  ticTexto = paso;
  for (const l of lamparas) {
    const p = v > 0 ? 0.94 + Math.sin(t * 9 + l.fase) * 0.06 : 1;
    l.el.scale = { x: 0.76 * p, y: 0.1, z: 0.26 * p };
  }
  if (paso % 5 === 0) {
    texto("t_dato", Math.round(recorrido) + " m · " + Math.round(v * 3.6) + " km/h");
  }
}

requestAnimationFrame(frame);
