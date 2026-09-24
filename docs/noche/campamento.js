// Vida del campamento: cielo estrellado, fuego y antorchas.
//
// Es el mismo reparto de trabajo que el bestiario. Las estrellas son **una**
// malla dinámica —un nodo, un update de buffer por tick— y no doscientos nodos
// del DOM. El fuego, en cambio, son tres nodos y punto: las tres llamas del
// pack (roja, naranja, amarilla) apiladas y latiendo en desfase. No hay
// partículas en el motor, y tampoco hacen falta para esto.
//
// Todo lo que toca `el.scale` guarda su escala base acá arriba: **`scale`
// reemplaza el tamaño declarado, no lo multiplica**. Es el error que ya se
// comió una vez a los faroles del bestiario, cuando una caja de 19 cm se
// volvió un cubo de un metro.
const CFG = globalThis.CAMPAMENTO || {};
const N_ANTORCHAS = CFG.antorchas || 0;
const N_ESTRELLAS = 260;

const root = hiperspace.dimention;

function hash(i, sal) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(sal | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ estrellas
const RADIO_CIELO = 200;
const posiciones = new Float32Array(N_ESTRELLAS * 9);
const colores = new Float32Array(N_ESTRELLAS * 12);
const brillo = new Float32Array(N_ESTRELLAS);
const ritmo = new Float32Array(N_ESTRELLAS);

function sembrarCielo() {
  for (let i = 0; i < N_ESTRELLAS; i++) {
    const az = hash(i, 1) * Math.PI * 2;
    const alt = Math.asin(0.08 + hash(i, 2) * 0.9);
    const cx = Math.cos(alt) * Math.cos(az) * RADIO_CIELO;
    const cy = Math.sin(alt) * RADIO_CIELO;
    const cz = Math.cos(alt) * Math.sin(az) * RADIO_CIELO;
    const r = 0.4 + hash(i, 3) * 0.8;
    const giro = hash(i, 4) * Math.PI * 2;
    const nx = cx / RADIO_CIELO, ny = cy / RADIO_CIELO, nz = cz / RADIO_CIELO;
    let ux = -nz, uy = 0, uz = nx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;
    // Orden inverso: la bóveda se mira desde adentro y con el orden directo
    // las estrellas quedan todas de espaldas.
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
    const p = brillo[i] * (0.78 + 0.22 * Math.sin(t * ritmo[i] + i));
    const r = p * (0.72 + brillo[i] * 0.28);
    const g = p * 0.92;
    const b = p * (1.05 - brillo[i] * 0.15);
    // El buffer es **rgba**: cuatro componentes por vértice.
    for (let v = 0; v < 3; v++) {
      const o = i * 12 + v * 4;
      colores[o] = r;
      colores[o + 1] = g;
      colores[o + 2] = b;
      colores[o + 3] = 1;
    }
  }
}

// ---------------------------------------------------------------------- fuego
/** Escalas con las que el server declaró cada llama. Sin esto, asignar
 *  `scale` las lleva a 1 y el fuego pega un salto. */
const LLAMAS = [
  { id: "llama_0", base: 4.2, ritmo: 5.1, amp: 0.1, fase: 0 },
  { id: "llama_1", base: 3.6, ritmo: 6.7, amp: 0.14, fase: 1.9 },
  { id: "llama_2", base: 3.4, ritmo: 8.3, amp: 0.18, fase: 3.7 },
];
const LUZ_BASE = 0.5;

const llamas = [];
const antorchas = [];
let pato = null;

function prepararFuego() {
  for (const l of LLAMAS) {
    const el = root.getElementById(l.id);
    if (el) llamas.push({ el: el, cfg: l });
  }
  for (let i = 0; i < N_ANTORCHAS; i++) {
    const el = root.getElementById("fuego_" + i);
    if (el) antorchas.push({ el: el, fase: hash(i, 21) * 6.28, ritmo: 3.2 + hash(i, 22) * 2.4 });
  }
  pato = root.getElementById("pato");
}

/** El fuego late a ~20 Hz y no por frame: más rápido no se lee como fuego, se
 *  lee como parpadeo, y son seis asignaciones de escala cada vez. */
function avivar(t) {
  for (const l of llamas) {
    const c = l.cfg;
    const s = c.base * (1 + Math.sin(t * c.ritmo + c.fase) * c.amp);
    // El alto se estira más que el ancho: una llama que sólo infla es una
    // pelota.
    l.el.scale = { x: s, y: c.base * (1 + Math.sin(t * c.ritmo * 0.7 + c.fase) * c.amp * 2.1), z: s };
  }
  for (const a of antorchas) {
    const s = LUZ_BASE * (0.86 + Math.sin(t * a.ritmo + a.fase) * 0.14);
    a.el.scale = { x: s, y: s, z: s };
  }
}

// ---------------------------------------------------------------------- bucle
let estrellas = null;
let malla = null;
let listo = false;
let t0 = 0;
let tic = 0;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) t0 = ahora;
  const t = (ahora - t0) / 1000;

  if (!listo) {
    estrellas = root.getElementById("estrellas");
    if (!estrellas) return;
    sembrarCielo();
    pintarCielo(0);
    malla = MeshResource.create({ positions: posiciones, colors: colores });
    estrellas.src = malla.src;
    prepararFuego();
    listo = true;
    console.log("[campamento] " + N_ESTRELLAS + " estrellas, " + llamas.length + " llamas, " + antorchas.length + " antorchas");
    return;
  }

  const paso = Math.floor(t * 20);
  if (paso === tic) return;
  tic = paso;
  avivar(t);
  // El pato flota: un solo nodo, así que va con transform directo y no batch.
  if (pato) pato.position = { x: 14.6, y: 0.12 + Math.sin(t * 1.4) * 0.04, z: -17.6 };
  // El cielo titila a ~12 Hz; el fuego va al doble, así que no se repinta en
  // todos los tics.
  if (paso % 2 === 0) {
    pintarCielo(t);
    malla.update({ positions: posiciones, colors: colores });
  }
}

requestAnimationFrame(frame);
