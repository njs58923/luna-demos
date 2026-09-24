// El planetario: giro, toques y panel.
//
// Tres cosas que ninguna otra escena del servidor hace juntas:
//
//   1. **Un `setTransformBatch` por frame** para los ocho brazos y las lunas.
//      Trece grupos girando, una sola llamada.
//   2. **`setAttribute` en caliente** para el panel y para pintar el planeta
//      elegido. Funciona para `value`, `color` y `size`; lo que NO funciona es
//      leer de vuelta con `getAttribute`, que sigue contestando lo que decía el
//      HSML. Por eso todo el estado vive acá.
//   3. **Toques con estado**: el Sol cicla la velocidad, la peana prende y apaga
//      las órbitas, cada planeta se selecciona. Nada de eso se puede hacer sin
//      guardar en qué estaba antes.
const CFG = globalThis.PLANETARIO || {};
const PLANETAS = CFG.planetas || [];
const N_ESTRELLAS = CFG.estrellas || 700;
const root = hiperspace.dimention;

function hash(i, sal) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(sal | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ estrellas
const RADIO = 50;

function armarEstrellas() {
  const P = new Float32Array(N_ESTRELLAS * 9);
  const C = new Float32Array(N_ESTRELLAS * 12);
  for (let i = 0; i < N_ESTRELLAS; i++) {
    const az = hash(i, 1) * Math.PI * 2;
    const alt = Math.asin(hash(i, 2) * 2 - 1);
    const cx = Math.cos(alt) * Math.cos(az) * RADIO;
    const cy = Math.sin(alt) * RADIO;
    const cz = Math.cos(alt) * Math.sin(az) * RADIO;
    const r = 0.06 + hash(i, 3) * 0.16;
    const giro = hash(i, 4) * Math.PI * 2;
    const nx = cx / RADIO, ny = cy / RADIO, nz = cz / RADIO;
    let ux = -nz, uy = 0, uz = nx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    // Orden inverso: la bóveda se mira desde adentro.
    for (let k = 2; k >= 0; k--) {
      const a = giro + (k * Math.PI * 2) / 3;
      const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      const o = i * 9 + (2 - k) * 3;
      P[o] = cx + ux * ca + vx * sa;
      P[o + 1] = cy + uy * ca + vy * sa;
      P[o + 2] = cz + uz * ca + vz * sa;
    }
    const b = 0.35 + hash(i, 5) * 0.65;
    for (let v = 0; v < 3; v++) {
      const o = i * 12 + v * 4;
      C[o] = b * 0.92; C[o + 1] = b * 0.95; C[o + 2] = b; C[o + 3] = 1;
    }
  }
  return { positions: P, colors: C };
}

// ------------------------------------------------------------------- órbitas
/** Los ocho anillos, en una sola malla. Cada uno es una cinta de dos triángulos
 *  por segmento, de dos centímetros de ancho, tirada en el plano XZ.
 *
 *  Va doble cara —cada segmento se emite dos veces, con el orden dado vuelta—
 *  porque el aparato se mira tanto desde arriba como desde abajo, y una cinta de
 *  una cara desaparece de golpe al agacharse. Cuesta el doble de triángulos de
 *  algo que ya es barato. */
function armarOrbitas(inclinaciones) {
  const SEG = 96;
  const ANCHO = 0.011;
  const P = [];
  const C = [];
  const empujar = (a, b, c, br) => {
    P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let v = 0; v < 3; v++) C.push(br * 0.62, br * 0.55, br * 0.4, 1);
  };
  PLANETAS.forEach((p, idx) => {
    const inc = (inclinaciones[idx] || 0);
    const ci = Math.cos(inc), si = Math.sin(inc);
    const br = 0.5 + (idx % 2) * 0.14;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const pt = (ang, rad) => {
        const x = Math.cos(ang) * rad;
        const z = Math.sin(ang) * rad;
        // La inclinación del plano orbital, la misma que lleva el grupo del
        // brazo: si el anillo no se inclina igual, el planeta lo cruza.
        return [x, -z * si, z * ci];
      };
      const a = pt(a0, p.orbita - ANCHO), b = pt(a0, p.orbita + ANCHO);
      const c = pt(a1, p.orbita + ANCHO), d = pt(a1, p.orbita - ANCHO);
      empujar(a, b, c, br); empujar(a, c, d, br);
      empujar(a, c, b, br); empujar(a, d, c, br);
    }
  });
  return { positions: new Float32Array(P), colors: new Float32Array(C),
           tris: P.length / 9 };
}

// --------------------------------------------------------------------- estado
const VELOCIDADES = [0, 1, 12, 120];
const NOMBRE_VEL = ["pausa", "1x", "12x", "120x"];
let iVel = 1;
let dias = 0;
let elegido = -1;
let orbitasVisibles = true;

const brazos = [];
const lunas = [];
let nodoOrbitas = null;
let panel = {};

function texto(id, valor) {
  const el = panel[id];
  if (el) el.setAttribute("value", valor);
}

function miles(x) {
  return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Pinta la ficha del planeta y lo marca. Marcar es cambiarle el color y
 *  agrandarlo: `scale` **reemplaza** el tamaño declarado, así que el diámetro
 *  base se guarda en `brazos[i].tam` y se multiplica desde acá. */
function elegir(i) {
  if (elegido >= 0 && elegido !== i) {
    const v = brazos[elegido];
    v.bola.setAttribute("color", v.color);
    v.bola.scale = { x: v.tam, y: v.tam, z: v.tam };
  }
  if (elegido === i) {
    // Segundo toque sobre el mismo: se deselecciona.
    const v = brazos[i];
    v.bola.setAttribute("color", v.color);
    v.bola.scale = { x: v.tam, y: v.tam, z: v.tam };
    elegido = -1;
    texto("p_nombre", "El planetario");
    texto("p_dato1", "tocá un planeta");
    texto("p_dato2", "tocá el Sol para cambiar la velocidad");
    texto("p_dato3", "tocá la peana para las órbitas");
    texto("p_nota", "");
    return;
  }
  elegido = i;
  const p = PLANETAS[i];
  const v = brazos[i];
  v.bola.setAttribute("color", "#FFF1C4");
  const g = v.tam * 1.5;
  v.bola.scale = { x: g, y: g, z: g };
  texto("p_nombre", p.nombre);
  texto("p_dato1", "año: " + miles(p.periodo) + " días terrestres");
  texto("p_dato2", "diámetro: " + miles(p.diametro) + " km");
  texto("p_dato3", p.lunas === 0 ? "sin lunas conocidas"
        : p.lunas === 1 ? "1 luna" : miles(p.lunas) + " lunas");
  texto("p_nota", p.nota);
}

function cambiarVelocidad() {
  iVel = (iVel + 1) % VELOCIDADES.length;
  texto("p_vel", "velocidad " + NOMBRE_VEL[iVel]);
  // El Sol se apaga cuando el aparato está en pausa: es la única señal de
  // estado que se ve desde cualquier lado del planetario.
  const sol = panel.sol;
  if (sol) sol.setAttribute("color", iVel === 0 ? "#6E5A34" : "#FFD98A");
}

function alternarOrbitas() {
  orbitasVisibles = !orbitasVisibles;
  if (!nodoOrbitas) return;
  // No hay `visible` en el DOM del motor. Se esconde con escala: a 0 exacto
  // algunas pipelines se quejan de la matriz singular, así que va un valor
  // chico pero distinto de cero.
  const s = orbitasVisibles ? 1 : 0.0001;
  nodoOrbitas.scale = { x: s, y: s, z: s };
}

// ---------------------------------------------------------------------- bucle
let listo = false;
let t0 = 0;
let previo = 0;
let tic = 0;

function preparar() {
  const est = root.getElementById("estrellas");
  const orb = root.getElementById("orbitas");
  const sol = root.getElementById("sol");
  const peana = root.getElementById("peana");
  if (!est || !orb || !sol || !peana) return false;
  for (const id of ["p_nombre", "p_dato1", "p_dato2", "p_dato3", "p_nota", "p_reloj", "p_vel"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  panel.sol = sol;

  for (let i = 0; i < PLANETAS.length; i++) {
    const p = PLANETAS[i];
    const grupo = root.getElementById("brazo_" + p.id);
    const bola = root.getElementById("pl_" + p.id);
    if (!grupo || !bola) return false;
    const luna = root.getElementById("luna_" + p.id);
    brazos.push({ grupo: grupo, bola: bola, color: p.color, tam: p.bola * 2,
                  // Velocidad angular: una vuelta por período. El 360/365 deja
                  // la Tierra en una vuelta por año de simulación.
                  w: (Math.PI * 2) / p.periodo,
                  fase: hash(i, 21) * Math.PI * 2 });
    if (luna) lunas.push({ grupo: luna, w: (Math.PI * 2) / (p.periodo / 12 + 8),
                           fase: hash(i, 22) * Math.PI * 2 });
    bola.addEventListener("toque", (function (k) {
      return function () { elegir(k); };
    })(i));
  }
  sol.addEventListener("toque", cambiarVelocidad);
  peana.addEventListener("toque", alternarOrbitas);

  const e = armarEstrellas();
  est.src = MeshResource.create(e).src;
  const o = armarOrbitas(PLANETAS.map((p, i) => 0));
  orb.src = MeshResource.create({ positions: o.positions, colors: o.colors }).src;
  nodoOrbitas = orb;
  console.log("[planetario] " + PLANETAS.length + " planetas, " + o.tris +
              " triangulos de orbita, " + N_ESTRELLAS + " estrellas");
  return true;
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) { t0 = ahora; previo = ahora; }

  if (!listo) {
    if (!preparar()) return;
    listo = true;
    return;
  }

  const dt = Math.min(0.05, (ahora - previo) / 1000);
  previo = ahora;
  // Un segundo real = un día por unidad de velocidad. A 120x, Júpiter tarda
  // treinta y seis segundos en dar la vuelta y Mercurio menos de uno.
  dias += dt * VELOCIDADES[iVel];

  const lote = [];
  for (const b of brazos) {
    lote.push(b.grupo.nodeId, 0, 0, 0, 0, b.fase + dias * b.w, 0);
  }
  for (const l of lunas) {
    lote.push(l.grupo.nodeId, 0, 0, 0, 0, l.fase + dias * l.w, 0);
  }
  root.setTransformBatch(lote);

  // El reloj se reescribe cuatro veces por segundo: `setAttribute` sobre un
  // texto rehace la malla del texto, y hacerlo por frame es tirar trabajo.
  const paso = Math.floor((ahora - t0) / 250);
  if (paso !== tic) {
    tic = paso;
    const anios = dias / 365.25;
    texto("p_reloj", anios >= 2 ? "año " + anios.toFixed(1) : "día " + miles(dias));
  }
}

requestAnimationFrame(frame);
