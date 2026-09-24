// El arrecife: tres cardúmenes, tres nodos.
//
// Es la escena donde la malla dinámica hace lo que mejor hace: **cosas que se
// mueven todas, todo el tiempo, y a las que nadie mira de a una**. Cada
// cardumen son 140 peces —tres triángulos cada uno— y **un** nodo cuyo buffer
// de posiciones se reescribe entero por frame.
//
// El movimiento no es boids de verdad y a propósito. Boids completo es O(n²):
// 140 peces son 19 600 distancias por cardumen y por frame, y se nota. Acá cada
// pez tiene un **puesto** dentro del banco —una posición relativa fija, en
// esfera— y el banco entero recorre una curva de Lissajous. El pez persigue su
// puesto con un resorte flojo y le suma un vaivén propio. Sale ordenado como un
// cardumen y cuesta O(n).
//
// Lo que se pierde: no hay separación real, así que dos peces pueden cruzarse.
// A tamaño de pez y a la velocidad a la que van, no se ve.
const CFG = globalThis.ARRECIFE || {};
const BANCOS = CFG.bancos || [];
const N_BURBUJAS = CFG.burbujas || 260;
const CORALES = CFG.corales || 26;
const SEMILLA = CFG.semilla || 3;
const CAUSTICA = CFG.caustica || 40;
const root = hiperspace.dimention;

function hash(a, b, sal) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(sal | 0, 2246822519);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ el fondo
/** La arena: una grilla con dunas de ruido. El color baja con la profundidad y
 *  sube en las crestas, que es todo el sombreado que hay. */
function arena(lado, paso) {
  const P = [];
  const C = [];
  const n = Math.round(lado / paso);
  const alturaEn = (x, z) =>
    Math.sin(x * 0.11) * 0.55 + Math.cos(z * 0.09) * 0.5 +
    Math.sin((x + z) * 0.21) * 0.22 - 1.4;
  const col = (x, z, y) => {
    const k = 0.55 + (y + 1.9) * 0.28;
    const t = 0.5 + hash(Math.round(x), Math.round(z), 5) * 0.16;
    return [Math.min(1, 0.78 * k * t + 0.12), Math.min(1, 0.72 * k * t + 0.13),
            Math.min(1, 0.55 * k * t + 0.18)];
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -lado / 2 + i * paso, z0 = -lado / 2 + j * paso;
      const x1 = x0 + paso, z1 = z0 + paso;
      const p = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(
        ([x, z]) => [x, alturaEn(x, z), z]);
      const c = col(x0, z0, p[0][1]);
      // Orden inverso: el abanico directo en XZ mira para abajo.
      P.push(p[0][0], p[0][1], p[0][2], p[2][0], p[2][1], p[2][2], p[1][0], p[1][1], p[1][2]);
      P.push(p[0][0], p[0][1], p[0][2], p[3][0], p[3][1], p[3][2], p[2][0], p[2][1], p[2][2]);
      for (let k = 0; k < 6; k++) C.push(c[0], c[1], c[2], 1);
    }
  }
  return { positions: new Float32Array(P), colors: new Float32Array(C),
           tris: P.length / 9, alturaEn: alturaEn };
}

// ------------------------------------------------------------------- corales
const CORAL = [
  [0.85, 0.42, 0.38], [0.92, 0.62, 0.28], [0.72, 0.35, 0.62],
  [0.35, 0.62, 0.58], [0.90, 0.78, 0.42], [0.52, 0.40, 0.72],
];

/** Un coral: una rama que se bifurca. Cada tramo es un prisma de cuatro caras
 *  —no vale la pena más, a este tamaño— y las ramas hijas salen con un ángulo y
 *  un largo que se achican en cada nivel.
 *
 *  El color se aclara hacia las puntas. Es el detalle que lo separa de un
 *  arbusto marrón: en un coral de verdad la punta es lo que crece. */
function rama(P, C, x, y, z, dx, dy, dz, largo, grosor, nivel, col, sal) {
  const ex = x + dx * largo, ey = y + dy * largo, ez = z + dz * largo;
  // Base ortonormal para el prisma, con vector auxiliar elegido.
  //
  // El primer intento fue `u = (-dz, 0, dx)`, que es la perpendicular fácil en
  // el plano XZ. Para una rama **vertical** —que es justo el tronco de todos
  // los corales— eso da (0,0,0): el prisma colapsa sobre su eje, sale con
  // triángulos de área cero y no se dibuja **nada**. No hay error: la malla se
  // crea, tiene sus miles de triángulos, y el arrecife aparece sin corales.
  const auxx = Math.abs(dy) > 0.9 ? 1 : 0;
  const auxy = Math.abs(dy) > 0.9 ? 0 : 1;
  let ux = dy * 0 - dz * auxy, uy = dz * auxx - dx * 0, uz = dx * auxy - dy * auxx;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  const k = 0.55 + nivel * 0.16;
  const c = [Math.min(1, col[0] * k), Math.min(1, col[1] * k), Math.min(1, col[2] * k)];
  const g2 = grosor * 0.68;
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2, a1 = ((i + 1) / 4) * Math.PI * 2;
    const p = (ang, cx, cy, cz, g) => [
      cx + (Math.cos(ang) * ux + Math.sin(ang) * vx) * g,
      cy + (Math.cos(ang) * uy + Math.sin(ang) * vy) * g,
      cz + (Math.cos(ang) * uz + Math.sin(ang) * vz) * g,
    ];
    const a = p(a0, x, y, z, grosor), b = p(a1, x, y, z, grosor);
    const d = p(a1, ex, ey, ez, g2), e = p(a0, ex, ey, ez, g2);
    P.push(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]);
    P.push(a[0], a[1], a[2], d[0], d[1], d[2], e[0], e[1], e[2]);
    for (let q = 0; q < 6; q++) C.push(c[0], c[1], c[2], 1);
  }
  // Cuatro niveles y tres o cuatro hijas por nudo. Con dos hijas y tres
  // niveles —que fue el primer intento— el resultado se lee como un arbolito
  // seco, no como un coral: lo que hace al coral es que se ramifique mucho y
  // corto, no poco y largo.
  if (nivel >= 4 || largo < 0.09) return;
  const hijas = 3 + (hash(sal, nivel, 71) < 0.4 ? 1 : 0);
  for (let h = 0; h < hijas; h++) {
    const giro = hash(sal + h, nivel, 73) * Math.PI * 2;
    const abre = 0.55 + hash(sal + h, nivel, 79) * 0.6;
    const nx = dx * Math.cos(abre) + (Math.cos(giro) * ux + Math.sin(giro) * vx) * Math.sin(abre);
    const ny = dy * Math.cos(abre) + (Math.cos(giro) * uy + Math.sin(giro) * vy) * Math.sin(abre);
    const nz = dz * Math.cos(abre) + (Math.cos(giro) * uz + Math.sin(giro) * vz) * Math.sin(abre);
    const l = Math.hypot(nx, ny, nz) || 1;
    rama(P, C, ex, ey, ez, nx / l, ny / l, nz / l,
         largo * (0.56 + hash(sal + h, nivel, 83) * 0.16), g2, nivel + 1, col, sal * 7 + h);
  }
}

/** Los corales de `desde` a `hasta`. Van en tandas porque todos juntos se
 *  pasan del tope de vértices de una malla (MAX_VERTICES, 262 144). */
function corales(desde, hasta, alturaEn) {
  const P = [];
  const C = [];
  for (let i = desde; i < hasta; i++) {
    const a = hash(i, 1, 91) * Math.PI * 2;
    const r = 3 + Math.sqrt(hash(i, 2, 93)) * 22;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const col = CORAL[Math.floor(hash(i, 3, 97) * CORAL.length) % CORAL.length];
    rama(P, C, x, alturaEn(x, z) - 0.1, z, 0, 1, 0,
         0.34 + hash(i, 4, 101) * 0.42, 0.085 + hash(i, 5, 103) * 0.075, 0, col,
         i * 13 + SEMILLA);
  }
  return { positions: new Float32Array(P), colors: new Float32Array(C), tris: P.length / 9 };
}

// ---------------------------------------------------------------- cardúmenes
function crearBanco(cfg, idx) {
  const N = cfg.peces;
  const b = {
    cfg: cfg,
    n: N,
    px: new Float32Array(N), py: new Float32Array(N), pz: new Float32Array(N),
    ox: new Float32Array(N), oy: new Float32Array(N), oz: new Float32Array(N),
    fase: new Float32Array(N),
    largo: new Float32Array(N),
    pos: new Float32Array(N * 9),
    col: new Float32Array(N * 12),
  };
  const c = cfg.color;
  for (let i = 0; i < N; i++) {
    // El puesto de cada pez dentro del banco: un punto en una esfera achatada.
    const u = hash(i, idx, 111) * 2 - 1;
    const t = hash(i, idx, 113) * Math.PI * 2;
    const rr = Math.cbrt(hash(i, idx, 117));
    const s = Math.sqrt(1 - u * u);
    b.ox[i] = Math.cos(t) * s * rr * cfg.radio;
    b.oy[i] = u * rr * cfg.radio * 0.45;
    b.oz[i] = Math.sin(t) * s * rr * cfg.radio;
    b.px[i] = b.ox[i]; b.py[i] = cfg.alto + b.oy[i]; b.pz[i] = b.oz[i];
    b.fase[i] = hash(i, idx, 119) * 6.28;
    b.largo[i] = cfg.tam * (0.75 + hash(i, idx, 127) * 0.5);
    const k = 0.75 + hash(i, idx, 131) * 0.35;
    for (let v = 0; v < 3; v++) {
      const o = i * 12 + v * 4;
      // El vértice de la cola va más oscuro: da la ilusión de cuerpo.
      const kk = v === 0 ? k : k * 0.62;
      b.col[o] = Math.min(1, c[0] * kk);
      b.col[o + 1] = Math.min(1, c[1] * kk);
      b.col[o + 2] = Math.min(1, c[2] * kk);
      b.col[o + 3] = 1;
    }
  }
  return b;
}

/** Mueve un banco. El centro recorre una Lissajous, cada pez persigue su puesto
 *  con un resorte flojo, y el triángulo se orienta según hacia dónde va: sin
 *  eso los peces se ven como confeti. */
function moverBanco(b, t, dt) {
  const c = b.cfg;
  const cx = Math.sin(t * c.vel) * c.paseo;
  const cy = c.alto + Math.sin(t * c.vel * 1.7 + 1.1) * 1.1;
  const cz = Math.cos(t * c.vel * 0.73) * c.paseo;
  // Dirección del banco: la derivada de la Lissajous, normalizada.
  let dx = Math.cos(t * c.vel) * c.vel * c.paseo;
  let dz = -Math.sin(t * c.vel * 0.73) * c.vel * 0.73 * c.paseo;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl; dz /= dl;
  const giro = Math.atan2(dx, dz);
  const cg = Math.cos(giro), sg = Math.sin(giro);

  for (let i = 0; i < b.n; i++) {
    // Puesto en coordenadas del mundo: el banco entero rota con su rumbo.
    const tx = cx + b.ox[i] * cg + b.oz[i] * sg;
    const tz = cz - b.ox[i] * sg + b.oz[i] * cg;
    const ty = cy + b.oy[i] + Math.sin(t * 1.6 + b.fase[i]) * 0.22;
    // Resorte flojo: 4 por segundo, acotado por dt para que no explote.
    const k = Math.min(1, dt * 4);
    b.px[i] += (tx - b.px[i]) * k;
    b.py[i] += (ty - b.py[i]) * k;
    b.pz[i] += (tz - b.pz[i]) * k;

    const L = b.largo[i];
    const cola = Math.sin(t * 9 + b.fase[i]) * 0.35;
    const o = i * 9;
    // Morro, y dos puntas de cola abiertas y batiendo.
    b.pos[o] = b.px[i] + dx * L; b.pos[o + 1] = b.py[i]; b.pos[o + 2] = b.pz[i] + dz * L;
    b.pos[o + 3] = b.px[i] - dx * L * 0.6 - dz * L * (0.34 + cola * 0.2);
    b.pos[o + 4] = b.py[i] + L * 0.16;
    b.pos[o + 5] = b.pz[i] - dz * L * 0.6 + dx * L * (0.34 + cola * 0.2);
    b.pos[o + 6] = b.px[i] - dx * L * 0.6 + dz * L * (0.34 - cola * 0.2);
    b.pos[o + 7] = b.py[i] - L * 0.16;
    b.pos[o + 8] = b.pz[i] - dz * L * 0.6 - dx * L * (0.34 - cola * 0.2);
  }
}

// ------------------------------------------------------------------ burbujas
const bx = new Float32Array(N_BURBUJAS);
const by = new Float32Array(N_BURBUJAS);
const bz = new Float32Array(N_BURBUJAS);
const bv = new Float32Array(N_BURBUJAS);
const bf = new Float32Array(N_BURBUJAS);
const bpos = new Float32Array(N_BURBUJAS * 9);
const bcol = new Float32Array(N_BURBUJAS * 12);

function sembrarBurbujas() {
  for (let i = 0; i < N_BURBUJAS; i++) {
    const a = hash(i, 1, 141) * Math.PI * 2;
    const r = 2 + Math.sqrt(hash(i, 2, 143)) * 20;
    bx[i] = Math.cos(a) * r; bz[i] = Math.sin(a) * r;
    by[i] = hash(i, 3, 147) * 16 - 1.5;
    bv[i] = 0.6 + hash(i, 4, 149) * 1.1;
    bf[i] = hash(i, 5, 151) * 6.28;
    const b = 0.72 + hash(i, 6, 153) * 0.28;
    for (let v = 0; v < 3; v++) {
      const o = i * 12 + v * 4;
      bcol[o] = b * 0.8; bcol[o + 1] = b * 0.95; bcol[o + 2] = b; bcol[o + 3] = 1;
    }
  }
}

function moverBurbujas(t, dt) {
  for (let i = 0; i < N_BURBUJAS; i++) {
    by[i] += bv[i] * dt;
    if (by[i] > 15) by[i] = -1.6;
    const x = bx[i] + Math.sin(t * 1.3 + bf[i]) * 0.16;
    const z = bz[i] + Math.cos(t * 1.1 + bf[i]) * 0.16;
    const r = 0.035 + (i % 5) * 0.012;
    const o = i * 9;
    bpos[o] = x; bpos[o + 1] = by[i] + r; bpos[o + 2] = z;
    bpos[o + 3] = x - r; bpos[o + 4] = by[i] - r; bpos[o + 5] = z;
    bpos[o + 6] = x + r; bpos[o + 7] = by[i] - r; bpos[o + 8] = z;
  }
}

// ------------------------------------------------------------------ cáusticas
/** Las manchas de luz del fondo. Es una grilla plana justo encima de la arena a
 *  la que se le repinta **sólo el color**, con una suma de tres ondas. Nunca se
 *  tocan las posiciones: es el caso opuesto al de las burbujas, y sirve para
 *  ver que `update` acepta un buffer o el otro sin arrastrar el que no cambió. */
let caPos = null;
let caCol = null;
let caN = 0;
const CA_LADO = 46;

function armarCausticas(alturaEn) {
  const n = CAUSTICA;
  const paso = CA_LADO / n;
  const P = [];
  caN = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -CA_LADO / 2 + i * paso, z0 = -CA_LADO / 2 + j * paso;
      const x1 = x0 + paso, z1 = z0 + paso;
      const p = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(
        ([x, z]) => [x, alturaEn(x, z) + 0.05, z]);
      P.push(p[0][0], p[0][1], p[0][2], p[2][0], p[2][1], p[2][2], p[1][0], p[1][1], p[1][2]);
      P.push(p[0][0], p[0][1], p[0][2], p[3][0], p[3][1], p[3][2], p[2][0], p[2][1], p[2][2]);
      caN += 2;
    }
  }
  caPos = new Float32Array(P);
  caCol = new Float32Array(caN * 3 * 4);
  return caN;
}

function pintarCausticas(t) {
  for (let k = 0; k < caN; k++) {
    const o = k * 9;
    const x = caPos[o], z = caPos[o + 2];
    const v = Math.sin(x * 0.55 + t * 0.9) * Math.sin(z * 0.62 - t * 0.7) +
              Math.sin((x + z) * 0.31 + t * 1.3) * 0.6;
    const b = Math.max(0, v) * 0.42;
    for (let q = 0; q < 3; q++) {
      const c = k * 12 + q * 4;
      caCol[c] = Math.min(1, 0.30 + b);
      caCol[c + 1] = Math.min(1, 0.44 + b * 1.05);
      caCol[c + 2] = Math.min(1, 0.46 + b * 0.9);
      caCol[c + 3] = 1;
    }
  }
}

// ---------------------------------------------------------------------- bucle
const bancos = [];
let mArena = null, mCoral = null, mCaus = null, mBur = null;
let alturaEn = null;
let mantaEl = null;
let panelEl = null;
let listo = false;
let roto = false;
let t0 = 0, previo = 0, tic = 0;

const ESPECIES = ["Acropora ramosa", "Montipora placa", "Porites cabeza",
  "Seriatopora aguja", "Pocillopora coliflor", "Stylophora dedo"];

function preparar() {
  const nA = root.getElementById("arena");
  const nC = root.getElementById("coral");
  const nK = root.getElementById("causticas");
  const nB = root.getElementById("burbujas");
  const manta = root.getElementById("manta");
  const panel = root.getElementById("a_texto");
  if (!nA || !nC || !nK || !nB || !manta || !panel) return false;
  for (let i = 0; i < BANCOS.length; i++) {
    if (!root.getElementById("banco_" + i)) return false;
  }
  const jardin = root.getElementById("jardin");
  if (!jardin) return false;

  const a = arena(60, 1.6);
  alturaEn = a.alturaEn;
  nA.src = MeshResource.create({ positions: a.positions, colors: a.colors }).src;

  // Tres tandas, un nodo cada una.
  const nodosCoral = [nC, root.getElementById("coral_1"), root.getElementById("coral_2")].filter(Boolean);
  const c = { tris: 0 };
  for (let k = 0; k < nodosCoral.length; k++) {
    const desde = Math.floor(CORALES * k / nodosCoral.length);
    const hasta = Math.floor(CORALES * (k + 1) / nodosCoral.length);
    const tanda = corales(desde, hasta, alturaEn);
    nodosCoral[k].src = MeshResource.create({ positions: tanda.positions, colors: tanda.colors }).src;
    c.tris += tanda.tris;
  }

  armarCausticas(alturaEn);
  pintarCausticas(0);
  mCaus = MeshResource.create({ positions: caPos, colors: caCol });
  nK.src = mCaus.src;

  sembrarBurbujas();
  moverBurbujas(0, 0);
  mBur = MeshResource.create({ positions: bpos, colors: bcol });
  nB.src = mBur.src;

  let peces = 0;
  for (let i = 0; i < BANCOS.length; i++) {
    const b = crearBanco(BANCOS[i], i);
    moverBanco(b, 0, 1);
    b.malla = MeshResource.create({ positions: b.pos, colors: b.col });
    root.getElementById("banco_" + i).src = b.malla.src;
    bancos.push(b);
    peces += b.n;
  }

  mantaEl = manta;
  panelEl = panel;
  jardin.addEventListener("toque", function () {
    const i = Math.floor((Date.now() / 1000) % ESPECIES.length);
    panelEl.setAttribute("value", ESPECIES[i]);
  });

  console.log("[arrecife] " + peces + " peces en " + bancos.length + " nodos, " +
              c.tris + " triangulos de coral, " + a.tris + " de arena, " +
              caN + " de caustica");
  return true;
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) { t0 = ahora; previo = ahora; }
  if (!listo) {
    // Si preparar falla a mitad de camino no se reintenta: cada intento vuelve
    // a crear las mallas que ya había creado, y en pocos cuadros se agota el
    // cupo de 128 por isolate. Pasó: una malla de coral de más de 262 144
    // vértices tiraba y la sala terminaba con cientos de errores y nada visible.
    let ok;
    try { ok = preparar(); } catch (e) {
      console.error("[arrecife] no se pudo armar: " + String(e));
      listo = true; roto = true;
      return;
    }
    if (!ok) return;
    listo = true;
    return;
  }
  if (roto) return;
  const dt = Math.min(0.05, (ahora - previo) / 1000);
  previo = ahora;
  const t = (ahora - t0) / 1000;

  for (const b of bancos) {
    moverBanco(b, t, dt);
    // Sólo posiciones: el color de un pez no cambia.
    // update() reemplaza la malla entera: sin los colores, los peces salen blancos.
    b.malla.update({ positions: b.pos, colors: b.col });
  }
  moverBurbujas(t, dt);
  mBur.update({ positions: bpos, colors: bcol });

  // La manta: un nodo del DOM, porque es una sola y se mueve por su cuenta.
  if (mantaEl) {
    const r = 19;
    const a = t * 0.09;
    mantaEl.position = { x: Math.cos(a) * r, y: 7.5 + Math.sin(t * 0.3) * 1.4, z: Math.sin(a) * r };
    mantaEl.rotation = { x: 0, y: -a + 1.5708, z: Math.sin(t * 0.6) * 0.22 };
  }

  // Las cáusticas a 8 Hz y sólo el color: es lo contrario de las burbujas, que
  // sólo mandan posiciones.
  const paso = Math.floor(t * 8);
  if (paso !== tic) {
    tic = paso;
    pintarCausticas(t);
    // Con las posiciones aunque no cambien: update() sin posiciones falla.
    mCaus.update({ positions: caPos, colors: caCol });
  }
}

requestAnimationFrame(frame);
