// La biblioteca: catorce estanterías, ocho mil libros, catorce nodos.
//
// Cada estantería es **una** malla dinámica con todos sus libros adentro: los
// lomos, las tapas, las baldas y los montantes. Seiscientos libros por
// estantería son ~7 000 triángulos y una sola entidad.
//
// Poner un nodo por libro sería el camino corto y sería un desastre: ocho mil
// entidades para objetos que nadie va a mover nunca. La regla que viene saliendo
// en todo el servidor es la misma — **si no se mueve por separado, no merece un
// nodo**; y al revés, los autos de la ciudad sí son nodos porque cada uno anda
// por su lado.
//
// Los títulos también se generan acá. Son deterministas: el libro 412 de la
// estantería 3 se llama siempre igual, porque el nombre sale de un hash de sus
// índices y no de un sorteo. Sin eso, tocar dos veces la misma estantería daría
// dos bibliotecas distintas.
const CFG = globalThis.BIBLIOTECA || {};
const ESTANTES = CFG.estantes || [];
const N_POLVO = CFG.polvo || 500;
const root = hiperspace.dimention;

function hash(a, b, sal) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(sal | 0, 2246822519);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ geometría
const BRILLO = { "+x": 0.9, "-x": 0.66, "+z": 1.0, "-z": 0.55, "+y": 1.0, "-y": 0.42 };

/** Una caja, como seis caras con brillo distinto por cara. Sin normales por
 *  vértice es la única forma de que un lomo de libro no sea una mancha. */
function caja(P, C, x0, y0, z0, sx, sy, sz, color) {
  const x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz;
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const caras = [
    ["-z", 0, 2, 1], ["-z", 0, 3, 2],
    ["+z", 4, 5, 6], ["+z", 4, 6, 7],
    ["-x", 0, 4, 7], ["-x", 0, 7, 3],
    ["+x", 1, 2, 6], ["+x", 1, 6, 5],
    ["+y", 3, 7, 6], ["+y", 3, 6, 2],
    ["-y", 0, 1, 5], ["-y", 0, 5, 4],
  ];
  for (const [eje, a, b, c] of caras) {
    const k = BRILLO[eje];
    const col = [
      Math.min(1, color[0] * k), Math.min(1, color[1] * k), Math.min(1, color[2] * k),
    ];
    P.push(v[a][0], v[a][1], v[a][2], v[b][0], v[b][1], v[b][2], v[c][0], v[c][1], v[c][2]);
    for (let i = 0; i < 3; i++) C.push(col[0], col[1], col[2], 1);
  }
}

// --------------------------------------------------------------------- libros
const CUEROS = [
  [0.32, 0.13, 0.11], [0.20, 0.10, 0.08], [0.14, 0.20, 0.14], [0.11, 0.15, 0.24],
  [0.35, 0.26, 0.13], [0.24, 0.18, 0.26], [0.10, 0.10, 0.11], [0.40, 0.32, 0.20],
  [0.28, 0.22, 0.14], [0.16, 0.24, 0.26],
];
const ORO = [0.72, 0.58, 0.26];

const MADERA = [0.19, 0.12, 0.075];
const MADERA_CLARA = [0.26, 0.17, 0.10];

/** Una estantería entera. `e` trae su posición, su tamaño y su orientación.
 *
 *  Los libros se apoyan de izquierda a derecha hasta llenar la balda, con un
 *  hueco de vez en cuando y algún tomo inclinado apoyado sobre el vecino. El
 *  hueco es lo que la vuelve creíble: una balda perfectamente llena se lee como
 *  textura, no como libros. */
function estanteria(e) {
  const P = [];
  const C = [];
  const ANCHO = e.ancho, ALTO = e.alto, FONDO = 0.32;
  const BALDAS = e.baldas;
  const hb = (ALTO - 0.12) / BALDAS;

  // Montantes y baldas.
  caja(P, C, -ANCHO / 2, 0, 0, 0.06, ALTO, FONDO, MADERA_CLARA);
  caja(P, C, ANCHO / 2 - 0.06, 0, 0, 0.06, ALTO, FONDO, MADERA_CLARA);
  caja(P, C, -ANCHO / 2, ALTO - 0.07, 0, ANCHO, 0.07, FONDO, MADERA_CLARA);
  caja(P, C, -ANCHO / 2, 0, -0.02, ANCHO, 0.06, FONDO + 0.02, MADERA_CLARA);
  // Fondo de la estantería: sin esto se ve la pared entre libro y libro.
  caja(P, C, -ANCHO / 2, 0, -0.015, ANCHO, ALTO, 0.02, MADERA);

  let n = 0;
  for (let b = 0; b < BALDAS; b++) {
    const y = 0.06 + b * hb;
    caja(P, C, -ANCHO / 2 + 0.02, y, 0, ANCHO - 0.04, 0.035, FONDO, MADERA);
    const yl = y + 0.035;
    const hueco = hb - 0.06;
    let x = -ANCHO / 2 + 0.09;
    let inclinado = false;
    while (x < ANCHO / 2 - 0.12) {
      const d = hash(e.i * 733 + b, n, 11);
      // Un hueco cada tanto: la balda a medio llenar es lo que la hace leer.
      if (d < 0.055) {
        x += 0.05 + hash(e.i, n, 13) * 0.12;
        inclinado = true;
        n++;
        continue;
      }
      const grosor = 0.022 + hash(e.i + b, n, 17) * 0.05;
      const altoL = hueco * (0.55 + hash(e.i, n * 3 + b, 19) * 0.4);
      const fondoL = FONDO * (0.62 + hash(e.i, n * 5, 23) * 0.28);
      const col = CUEROS[Math.floor(hash(e.i * 91 + b, n, 29) * CUEROS.length) % CUEROS.length];
      if (x + grosor > ANCHO / 2 - 0.09) break;
      caja(P, C, x, yl, FONDO - fondoL - 0.01, grosor, altoL, fondoL, col);
      // Nervios dorados en el lomo: dos rayitas. Es lo que hace que a dos
      // metros la balda se lea como libros y no como una tira de colores.
      if (grosor > 0.03 && hash(e.i, n, 31) < 0.55) {
        caja(P, C, x + 0.004, yl + altoL * 0.72, FONDO - fondoL - 0.012,
             grosor - 0.008, 0.012, 0.004, ORO);
        caja(P, C, x + 0.004, yl + altoL * 0.24, FONDO - fondoL - 0.012,
             grosor - 0.008, 0.012, 0.004, ORO);
      }
      x += grosor + 0.004;
      n++;
      inclinado = false;
    }
    void inclinado;
  }
  return { positions: new Float32Array(P), colors: new Float32Array(C),
           tris: P.length / 9, libros: n };
}

// --------------------------------------------------------------------- títulos
const ADJ = ["Breve", "Nuevo", "Último", "Primer", "Segundo", "Falso", "Verdadero",
  "Pequeño", "Gran", "Íntimo", "Póstumo", "Anotado", "Perdido", "Único"];
const SUST = ["tratado", "catálogo", "diario", "atlas", "manual", "inventario",
  "cuaderno", "compendio", "informe", "registro", "elogio", "método", "censo"];
const DE = ["de las sombras", "de la sal", "del vidrio soplado", "de los ríos secos",
  "de la memoria", "de las ruinas", "del sueño ajeno", "de las mareas",
  "de los relojes", "del invierno", "de las aves que no vuelan", "del silencio",
  "de las ciudades enterradas", "de la luz artificial", "de los nombres propios",
  "del hierro", "de las cosas perdidas", "de la niebla"];
const NOMBRES = ["A.", "M.", "J.", "R.", "L.", "C.", "E.", "V.", "T.", "S."];
const APELLIDOS = ["Ferrán", "Otálora", "Kessler", "Nagy", "Brandt", "Solano",
  "Yamada", "Riquelme", "Vondrák", "Ibarra", "Neumann", "Salas", "Hartmann",
  "Escalante", "Prieto", "Vives", "Ostrovski", "Bermúdez"];

function titulo(ie, n) {
  const a = ADJ[Math.floor(hash(ie, n, 101) * ADJ.length) % ADJ.length];
  const s = SUST[Math.floor(hash(ie, n, 103) * SUST.length) % SUST.length];
  const d = DE[Math.floor(hash(ie, n, 107) * DE.length) % DE.length];
  const nom = NOMBRES[Math.floor(hash(ie, n, 109) * NOMBRES.length) % NOMBRES.length];
  const ape = APELLIDOS[Math.floor(hash(ie, n, 113) * APELLIDOS.length) % APELLIDOS.length];
  const anio = 1780 + Math.floor(hash(ie, n, 127) * 210);
  const pags = 60 + Math.floor(hash(ie, n, 131) * 900);
  return { titulo: a + " " + s + " " + d, autor: nom + " " + ape,
           pie: anio + " · " + pags + " páginas" };
}

// ---------------------------------------------------------------------- polvo
/** Motas en el aire. Doscientas partículas que suben despacio en el cono de las
 *  lámparas; es lo único que se mueve en toda la sala, y por eso vale un nodo. */
const pxx = new Float32Array(N_POLVO);
const pyy = new Float32Array(N_POLVO);
const pzz = new Float32Array(N_POLVO);
const pv = new Float32Array(N_POLVO);
const pf = new Float32Array(N_POLVO);
const pos = new Float32Array(N_POLVO * 9);
const colp = new Float32Array(N_POLVO * 12);

function sembrarPolvo(cajaSala) {
  for (let i = 0; i < N_POLVO; i++) {
    pxx[i] = (hash(i, 1, 41) - 0.5) * cajaSala[0];
    pyy[i] = hash(i, 2, 43) * cajaSala[1];
    pzz[i] = (hash(i, 3, 45) - 0.5) * cajaSala[2];
    pv[i] = 0.04 + hash(i, 4, 47) * 0.13;
    pf[i] = hash(i, 5, 49) * 6.28;
    const b = 0.5 + hash(i, 6, 51) * 0.5;
    for (let v = 0; v < 3; v++) {
      const o = i * 12 + v * 4;
      colp[o] = b; colp[o + 1] = b * 0.94; colp[o + 2] = b * 0.78; colp[o + 3] = 1;
    }
  }
}

function moverPolvo(t, dt, cajaSala) {
  for (let i = 0; i < N_POLVO; i++) {
    pyy[i] += pv[i] * dt;
    if (pyy[i] > cajaSala[1]) pyy[i] = 0.1;
    const x = pxx[i] + Math.sin(t * 0.35 + pf[i]) * 0.22;
    const z = pzz[i] + Math.cos(t * 0.28 + pf[i]) * 0.22;
    const y = pyy[i];
    const r = 0.013;
    const o = i * 9;
    pos[o] = x; pos[o + 1] = y + r; pos[o + 2] = z;
    pos[o + 3] = x - r; pos[o + 4] = y - r; pos[o + 5] = z;
    pos[o + 6] = x + r; pos[o + 7] = y - r; pos[o + 8] = z;
  }
}

// ---------------------------------------------------------------------- estado
let elegido = -1;
const nodos = [];
let panel = {};
let nodoPolvo = null;
let listo = false;
let t0 = 0;
let previo = 0;
const SALA = [22, 6.4, 15];

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

function consultar(i) {
  const e = ESTANTES[i];
  const d = nodos[i];
  // Un libro cualquiera de esa estantería, pero **siempre el mismo**: el índice
  // sale de un hash de la estantería y no de un sorteo, así que volver a
  // tocarla contesta lo mismo.
  const n = Math.floor(hash(i, 7, 61) * Math.max(1, d.libros));
  const f = titulo(i, n);
  texto("b_titulo", f.titulo);
  texto("b_autor", f.autor);
  texto("b_pie", f.pie);
  texto("b_donde", "estante " + (i + 1) + " de " + ESTANTES.length +
        " · " + d.libros + " volúmenes");
  if (elegido >= 0 && elegido !== i) {
    const v = nodos[elegido];
    v.marca.setAttribute("color", "#241809");
  }
  d.marca.setAttribute("color", "#8A6A2E");
  elegido = i;
}

function preparar() {
  for (const id of ["b_titulo", "b_autor", "b_pie", "b_donde"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  const pol = root.getElementById("polvo");
  if (!pol) return false;
  for (let i = 0; i < ESTANTES.length; i++) {
    if (!root.getElementById("est_" + i) || !root.getElementById("marca_" + i)) return false;
  }

  let tris = 0, libros = 0;
  for (let i = 0; i < ESTANTES.length; i++) {
    const e = ESTANTES[i];
    e.i = i;
    const el = root.getElementById("est_" + i);
    const marca = root.getElementById("marca_" + i);
    const d = estanteria(e);
    el.src = MeshResource.create({ positions: d.positions, colors: d.colors }).src;
    nodos.push({ el: el, marca: marca, libros: d.libros });
    tris += d.tris;
    libros += d.libros;
    marca.addEventListener("toque", (function (k) {
      return function () { consultar(k); };
    })(i));
  }

  sembrarPolvo(SALA);
  moverPolvo(0, 0, SALA);
  nodoPolvo = { el: pol, malla: null };
  nodoPolvo.malla = MeshResource.create({ positions: pos, colors: colp });
  pol.src = nodoPolvo.malla.src;

  console.log("[biblioteca] " + ESTANTES.length + " estanterias, " + libros +
              " libros, " + tris + " triangulos en " + ESTANTES.length + " nodos");
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
  const t = (ahora - t0) / 1000;
  moverPolvo(t, dt, SALA);
  // update() reemplaza la malla entera: sin los colores, salen blancos.
  nodoPolvo.malla.update({ positions: pos, colors: colp });
}

requestAnimationFrame(frame);
