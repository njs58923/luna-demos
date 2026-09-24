// Vida de la sala: el cielo estrellado y el revoloteo de las piezas.
//
// Dos cosas que el motor pasó a soportar hace poco y que esta sala usa a
// propósito, cada una para lo que sirve:
//
//   Animación en el .glb — el aleteo. Va adentro del archivo, se reproduce
//   sola, y el JS no la toca. Es la que tiene que ir por ahí: son muchos nodos
//   moviéndose en fase, y hacerlo desde acá sería cruzar el borde JS↔Rust una
//   vez por ala y por frame.
//
//   Malla dinámica (MeshResource) — las estrellas. Son ~200 triángulos que
//   cambian de color y no tienen por qué ser 200 nodos del DOM: una sola malla,
//   un solo nodo, y el titileo es un update de buffer.
//
// Lo que sí hace el script es el bamboleo de cada criatura, que son seis nodos
// y un setTransformBatch por frame.
const CFG = globalThis.NOCHE || {};
const BASE = CFG.base || "";
const N_ESTRELLAS = CFG.estrellas || 200;
const PIEZAS = CFG.piezas || [];
const N_FAROLES = CFG.faroles || 0;

const root = hiperspace.dimention;

// ------------------------------------------------------------------ estrellas
/** Hash determinista → [0,1). Mismo cielo en cada visita, que es lo que uno
 *  espera de un cielo. */
function hash(i, sal) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(sal | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const RADIO_CIELO = 180;
const posiciones = new Float32Array(N_ESTRELLAS * 9);
const colores = new Float32Array(N_ESTRELLAS * 12);
/** Brillo base y ritmo de titileo de cada estrella. Fijos: lo que cambia por
 *  frame es sólo la fase, así el cielo no "hierve". */
const brillo = new Float32Array(N_ESTRELLAS);
const ritmo = new Float32Array(N_ESTRELLAS);

function sembrarCielo() {
  for (let i = 0; i < N_ESTRELLAS; i++) {
    // Reparto sobre la media esfera de arriba, con más densidad cerca del
    // horizonte, que es donde el ojo espera encontrarlas.
    const az = hash(i, 1) * Math.PI * 2;
    const alt = Math.asin(0.06 + hash(i, 2) * 0.92);
    const cx = Math.cos(alt) * Math.cos(az) * RADIO_CIELO;
    const cy = Math.sin(alt) * RADIO_CIELO;
    const cz = Math.cos(alt) * Math.sin(az) * RADIO_CIELO;

    // Cada estrella es un triángulo suelto encarado hacia adentro. A 180 m no
    // se le ve la forma: lo único que importa es que ocupe unos pocos píxeles.
    // Tamaño aparente, no realismo: a 180 m, 1 m es aproximadamente 0,3° y
    // cae en unos 6 px. Más grande que esto y dejan de ser estrellas para
    // pasar a ser papelitos — con 1,6 a 4,2 m se veían triángulos francos.
    const r = 0.35 + hash(i, 3) * 0.75;
    const giro = hash(i, 4) * Math.PI * 2;
    // Base ortonormal tangente a la esfera, para que el triángulo quede
    // apoyado sobre la bóveda y no de canto.
    const nx = cx / RADIO_CIELO, ny = cy / RADIO_CIELO, nz = cz / RADIO_CIELO;
    let ux = -nz, uy = 0, uz = nx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;

    // Los vértices salen en orden inverso a propósito. La base tangente de
    // arriba deja la normal apuntando hacia afuera de la bóveda, y al cielo se
    // lo mira desde adentro: con el orden directo las estrellas quedaban todas
    // de espaldas y el cielo se veía vacío.
    for (let k = 2; k >= 0; k--) {
      const a = giro + (k * Math.PI * 2) / 3;
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      const o = i * 9 + (2 - k) * 3;
      posiciones[o] = cx + ux * ca + vx * sa;
      posiciones[o + 1] = cy + uy * ca + vy * sa;
      posiciones[o + 2] = cz + uz * ca + vz * sa;
    }

    brillo[i] = 0.45 + hash(i, 5) * 0.55;
    ritmo[i] = 0.4 + hash(i, 6) * 2.2;
  }
}

function pintarCielo(t) {
  for (let i = 0; i < N_ESTRELLAS; i++) {
    // Titileo suave: nunca baja del 78% del brillo propio, si no parece ruido.
    const p = brillo[i] * (0.78 + 0.22 * Math.sin(t * ritmo[i] + i));
    // Un pelo más frías las tenues, más cálidas las brillantes.
    const r = p * (0.72 + brillo[i] * 0.28);
    const g = p * 0.92;
    const b = p * (1.05 - brillo[i] * 0.15);
    // El buffer es **rgba**: tres vértices de cuatro componentes cada uno.
    // Recorrerlo de a tres —un color por vértice, olvidando el alfa— corre
    // todo un lugar y deja el alfa pisado con un valor de rojo: el cielo
    // quedaba invisible y los colores mezclados entre estrellas vecinas.
    for (let v = 0; v < 3; v++) {
      const o = i * 12 + v * 4;
      colores[o] = r;
      colores[o + 1] = g;
      colores[o + 2] = b;
      colores[o + 3] = 1;
    }
  }
}

// ------------------------------------------------------------------- piezas
const vuelan = [];

function prepararPiezas() {
  for (const p of PIEZAS) {
    if (!p.vuela) continue;
    const el = root.getElementById("modelo_" + p.id);
    if (!el) return false;
    // Fases distintas por pieza: si bambolean todas juntas se ve mecánico.
    vuelan.push({ el: el, fase: hash(p.id.length * 7 + p.id.charCodeAt(0), 11) * 6.28 });
  }
  return true;
}

function bambolear(t) {
  const lote = [];
  for (const v of vuelan) {
    const a = t * 0.9 + v.fase;
    lote.push(
      v.el.nodeId,
      Math.sin(a * 0.7) * 0.05,
      Math.sin(a) * 0.045,
      Math.cos(a * 0.6) * 0.04,
      0,
      Math.sin(a * 0.45) * 0.35,
      Math.sin(a * 0.8) * 0.08,
    );
  }
  if (lote.length) root.setTransformBatch(lote);
}

// ------------------------------------------------------------------- faroles
const faroles = [];
let pulso = 0;

/** Dimensiones con las que el server declaró la caja de luz. Hacen falta acá
 *  porque `el.scale` **reemplaza** el tamaño del nodo, no lo multiplica: al
 *  asignarle 0.94 la caja de 19x24x19 cm se volvió un cubo de casi un metro,
 *  y los faroles quedaron del tamaño de un ropero. */
const LUZ_BASE = { x: 0.19, y: 0.24, z: 0.19 };

function prepararFaroles() {
  for (let i = 0; i < N_FAROLES; i++) {
    const el = root.getElementById("luz_" + i);
    if (el) faroles.push({ el: el, fase: hash(i, 21) * 6.28 });
  }
}

// ---------------------------------------------------------------------- bucle
let estrellas = null;
let malla = null;
let listo = false;
let t0 = 0;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) t0 = ahora;
  const t = (ahora - t0) / 1000;

  if (!listo) {
    estrellas = root.getElementById("estrellas");
    if (!estrellas || !prepararPiezas()) return;
    sembrarCielo();
    pintarCielo(0);
    malla = MeshResource.create({ positions: posiciones, colors: colores });
    estrellas.src = malla.src;
    prepararFaroles();
    listo = true;
    console.log("[noche] cielo de " + N_ESTRELLAS + " estrellas, " + vuelan.length + " criaturas en vuelo");
    return;
  }

  if (CFG.bamboleo !== false) bambolear(t);

  // El cielo se repinta a ~12 Hz. Titilar por frame no se ve mejor y es
  // reconstruir el buffer entero cada vez.
  if (Math.floor(t * 12) !== pulso) {
    pulso = Math.floor(t * 12);
    pintarCielo(t);
    malla.update({ positions: posiciones, colors: colores });
    // Los faroles laten con la misma cadencia, por el proxy de escala: son
    // cuatro nodos, no vale armar un batch.
    for (const f of faroles) {
      const s = 0.94 + Math.sin(t * 1.7 + f.fase) * 0.06;
      f.el.scale = { x: LUZ_BASE.x * s, y: LUZ_BASE.y * s, z: LUZ_BASE.z * s };
    }
  }
}

requestAnimationFrame(frame);
console.log("[noche] listo, base:", BASE);
