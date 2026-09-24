// La ciudad: doscientos setenta metros de edificios generados por código.
//
// No hay un solo `.glb` en esta escena. Todo —edificios, ventanas, cornisas,
// calles, faroles— sale de este archivo como mallas dinámicas, y el documento
// que la sirve tiene sesenta y pico de nodos vacíos esperándolas.
//
// La decisión que la ordena es **una malla por manzana**. Cada manzana tiene
// entre seis y diez edificios con sus doscientas ventanas, y todo eso entra en
// un solo `MeshResource`: son ~1 800 triángulos y **una** entidad. Como nodos
// del DOM, la misma ciudad serían más de veinte mil cajas.
//
// Y una malla por manzana —y no una para toda la ciudad— porque:
//
//   1. el frustum puede tirar la mitad de la ciudad cuando mirás para un lado;
//   2. las ventanas se prenden y apagan **repintando una manzana por tick**, no
//      la ciudad entera. Reconstruir un buffer de 1 800 triángulos cuesta poco;
//      reconstruir el de 115 000 costaría todo.
//
// La niebla también está horneada acá: no hay niebla en el motor, así que el
// color de cada vértice se mezcla con el del cielo según su distancia al centro.
// Es lo que hace que la ciudad tenga fondo en vez de terminar en un borde.
const CFG = globalThis.CIUDAD || {};
const LADO = CFG.lado || 8;             // manzanas por lado
const PASO = CFG.paso || 34;            // metros entre centros de manzana
const MANZANA = CFG.manzana || 24;      // lado edificable
const SEMILLA = CFG.semilla || 7;
const CIELO = CFG.cielo || [0.03, 0.04, 0.07];
const N_AUTOS = CFG.autos || 0;

const root = hiperspace.dimention;

function hash(a, b, sal) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(sal | 0, 2246822519);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const RADIO = (LADO * PASO) / 2;

/** Mezcla con el color del cielo según la distancia. Sin esto la ciudad termina
 *  en un borde nítido y se ve la maqueta; con esto, los edificios del fondo se
 *  desvanecen y el borde deja de existir. */
function nieblar(c, d) {
  const k = Math.min(1, Math.max(0, (d - RADIO * 0.25) / (RADIO * 1.15)));
  const f = k * k;
  return [
    c[0] * (1 - f) + CIELO[0] * f,
    c[1] * (1 - f) + CIELO[1] * f,
    c[2] * (1 - f) + CIELO[2] * f,
  ];
}

// ------------------------------------------------------------------ geometría
/** Una cara rectangular, como dos triángulos. `eje` dice hacia dónde mira, y de
 *  eso salen los cuatro vértices y el sombreado: sin normales por vértice, el
 *  único modo de que una caja no se vea como una silueta plana es pintar cada
 *  cara con un brillo distinto. */
const BRILLO = { "+x": 0.86, "-x": 0.62, "+z": 1.0, "-z": 0.52, "+y": 1.12 };

function cara(P, C, eje, x0, y0, z0, ancho, alto, color, dist) {
  let a, b, c, d;
  if (eje === "+z") {
    a = [x0, y0, z0]; b = [x0 + ancho, y0, z0]; c = [x0 + ancho, y0 + alto, z0]; d = [x0, y0 + alto, z0];
  } else if (eje === "-z") {
    a = [x0 + ancho, y0, z0]; b = [x0, y0, z0]; c = [x0, y0 + alto, z0]; d = [x0 + ancho, y0 + alto, z0];
  } else if (eje === "+x") {
    a = [x0, y0, z0 + ancho]; b = [x0, y0, z0]; c = [x0, y0 + alto, z0]; d = [x0, y0 + alto, z0 + ancho];
  } else if (eje === "-x") {
    a = [x0, y0, z0]; b = [x0, y0, z0 + ancho]; c = [x0, y0 + alto, z0 + ancho]; d = [x0, y0 + alto, z0];
  } else { // +y, tapa: `alto` es el fondo en z
    a = [x0, y0, z0]; b = [x0 + ancho, y0, z0]; c = [x0 + ancho, y0, z0 + alto]; d = [x0, y0, z0 + alto];
  }
  const k = BRILLO[eje];
  // Recortado a [0, 1]: el motor valida el buffer de color y `create` tira
  // "Vertex colors must be in [0, 1]". La tapa brilla 1,12 y la cornisa suma
  // otro 25%, así que un hormigón claro se pasaba sin que se notara al leer el
  // código — y lo que falla no es el vértice, es la manzana entera.
  const col = nieblar([
    Math.min(1, color[0] * k), Math.min(1, color[1] * k), Math.min(1, color[2] * k),
  ], dist);
  P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  P.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  for (let i = 0; i < 6; i++) C.push(col[0], col[1], col[2], 1);
}

const HORMIGON = [
  [0.16, 0.16, 0.19], [0.19, 0.17, 0.17], [0.14, 0.15, 0.18], [0.21, 0.20, 0.19],
];
const LUCES = [
  [1.0, 0.86, 0.55], [1.0, 0.93, 0.75], [0.72, 0.83, 1.0], [1.0, 0.72, 0.42],
];
const APAGADA = [0.07, 0.07, 0.09];

/** Un edificio: la caja, la cornisa y la retícula de ventanas.
 *
 *  Las ventanas van 3 cm por delante de la fachada. Coplanares con ella, el
 *  z-fighting las hace titilar al mover la cabeza — y titilan mal, no como una
 *  ventana sino como un error. */
function edificio(P, C, cx, cz, ancho, fondo, alto, sal, encendidas) {
  const col = HORMIGON[Math.floor(hash(sal, 1, 11) * HORMIGON.length) % HORMIGON.length];
  const x0 = cx - ancho / 2, z0 = cz - fondo / 2;
  const dist = Math.hypot(cx, cz);

  cara(P, C, "+z", x0, 0, z0 + fondo, ancho, alto, col, dist);
  cara(P, C, "-z", x0, 0, z0, ancho, alto, col, dist);
  cara(P, C, "+x", x0 + ancho, 0, z0, fondo, alto, col, dist);
  cara(P, C, "-x", x0, 0, z0, fondo, alto, col, dist);
  cara(P, C, "+y", x0, alto, z0, ancho, fondo, col, dist);

  // Cornisa: un reborde de 20 cm que sobresale. Es el detalle más barato que
  // separa "caja" de "edificio".
  const s = 0.25;
  const cor = [col[0] * 1.25, col[1] * 1.25, col[2] * 1.25];
  cara(P, C, "+y", x0 - s, alto, z0 - s, ancho + 2 * s, fondo + 2 * s, cor, dist);
  cara(P, C, "+z", x0 - s, alto, z0 + fondo + s, ancho + 2 * s, 0.35, cor, dist);
  cara(P, C, "-z", x0 - s, alto, z0 - s, ancho + 2 * s, 0.35, cor, dist);
  cara(P, C, "+x", x0 + ancho + s, alto, z0 - s, fondo + 2 * s, 0.35, cor, dist);
  cara(P, C, "-x", x0 - s, alto, z0 - s, fondo + 2 * s, 0.35, cor, dist);

  // Ventanas. El paso es fijo (3,2 m de piso, 2,6 m de columna) para que dos
  // edificios vecinos tengan los pisos alineados: si cada uno usa su propio
  // paso, la manzana se ve como un collage.
  const PISO = 3.2, COL = 2.6, VW = 1.25, VH = 1.7;
  const pisos = Math.max(1, Math.floor((alto - 2.2) / PISO));
  const nx = Math.max(1, Math.floor(ancho / COL));
  const nz = Math.max(1, Math.floor(fondo / COL));
  const margenX = (ancho - nx * COL) / 2 + (COL - VW) / 2;
  const margenZ = (fondo - nz * COL) / 2 + (COL - VW) / 2;

  for (let p = 0; p < pisos; p++) {
    const y = 2.0 + p * PISO;
    for (let i = 0; i < nx; i++) {
      const x = x0 + margenX + i * COL;
      for (const [eje, zz] of [["+z", z0 + fondo + 0.03], ["-z", z0 - 0.03]]) {
        const dado = hash(sal * 131 + p * 17 + i, eje === "+z" ? 3 : 5, 21);
        const luz = dado < encendidas
          ? LUCES[Math.floor(hash(sal + p, i, 31) * LUCES.length) % LUCES.length]
          : APAGADA;
        cara(P, C, eje, x, y, zz, VW, VH, luz, dist);
      }
    }
    for (let i = 0; i < nz; i++) {
      const z = z0 + margenZ + i * COL;
      for (const [eje, xx] of [["+x", x0 + ancho + 0.03], ["-x", x0 - 0.03]]) {
        const dado = hash(sal * 131 + p * 17 + i, eje === "+x" ? 7 : 9, 23);
        const luz = dado < encendidas
          ? LUCES[Math.floor(hash(sal + p, i, 37) * LUCES.length) % LUCES.length]
          : APAGADA;
        cara(P, C, eje, xx, y, z, VW, VH, luz, dist);
      }
    }
  }
}

/** Una manzana: entre cuatro y nueve edificios repartidos sobre su parcela, más
 *  la vereda. La parcela se parte en dos o tres franjas y cada franja en dos o
 *  tres lotes; es lo mínimo que hace que la manzana no sea una grilla. */
function manzana(mi, mj, encendidas) {
  const P = [];
  const C = [];
  const cx = (mi - (LADO - 1) / 2) * PASO;
  const cz = (mj - (LADO - 1) / 2) * PASO;
  const sal = mi * 977 + mj * 31 + SEMILLA;
  const dist = Math.hypot(cx, cz);

  // Vereda: una losa de 20 cm, un pelo más grande que la parcela.
  const acera = [0.135, 0.135, 0.15];
  cara(P, C, "+y", cx - MANZANA / 2 - 1.6, 0.2, cz - MANZANA / 2 - 1.6,
       MANZANA + 3.2, MANZANA + 3.2, acera, dist);

  const franjas = 2 + Math.floor(hash(mi, mj, 41) * 2);
  let z = cz - MANZANA / 2;
  for (let f = 0; f < franjas; f++) {
    const hf = (MANZANA / franjas) * (0.8 + hash(mi + f, mj, 43) * 0.4);
    const lotes = 2 + Math.floor(hash(mi, mj + f, 47) * 2);
    let x = cx - MANZANA / 2;
    for (let l = 0; l < lotes; l++) {
      const wl = (MANZANA / lotes) * (0.8 + hash(mi, mj + l * 7 + f, 53) * 0.4);
      // Altura: el centro de la ciudad es más alto. Es una regla y no un azar,
      // porque una ciudad sin centro se ve como un suburbio infinito.
      const centrado = 1 - Math.min(1, dist / (RADIO * 1.1));
      const base = 7 + centrado * centrado * 46;
      const alto = base * (0.45 + hash(mi + l, mj + f, 59) * 1.1);
      if (hash(mi + l * 3, mj + f * 5, 61) > 0.12) {
        edificio(P, C, x + wl / 2, z + hf / 2,
                 wl * 0.86, hf * 0.86, Math.max(5, alto),
                 sal + l * 13 + f * 7, encendidas);
      }
      x += wl;
    }
    z += hf;
  }
  return { positions: new Float32Array(P), colors: new Float32Array(C), tris: P.length / 9 };
}

/** El asfalto y los faroles, en una sola malla: la calle es un plano por
 *  corredor y el farol un poste con su lámpara, todo aplanado a triángulos. */
function calles() {
  const P = [];
  const C = [];
  const asfalto = [0.075, 0.075, 0.088];
  const linea = [0.42, 0.40, 0.28];
  const poste = [0.08, 0.08, 0.09];
  const lampara = [1.0, 0.80, 0.45];
  const medio = (LADO * PASO) / 2;

  for (let k = 0; k <= LADO; k++) {
    const c = (k - LADO / 2) * PASO;
    const d = Math.abs(c);
    // Corredor en X y corredor en Z.
    cara(P, C, "+y", -medio, 0.02, c - 5, LADO * PASO, 10, asfalto, d);
    cara(P, C, "+y", c - 5, 0.02, -medio, 10, LADO * PASO, asfalto, d);
    // Línea central, a rayas.
    for (let i = 0; i < LADO * 6; i++) {
      const t = -medio + (i + 0.25) * (PASO / 6);
      cara(P, C, "+y", t, 0.035, c - 0.14, PASO / 12, 0.28, linea, Math.hypot(t, c));
      cara(P, C, "+y", c - 0.14, 0.035, t, 0.28, PASO / 12, linea, Math.hypot(c, t));
    }
    // Faroles cada media manzana.
    for (let i = 0; i < LADO * 2; i++) {
      const t = -medio + (i + 0.5) * (PASO / 2);
      for (const [px, pz] of [[t, c - 5.4], [c - 5.4, t]]) {
        const dd = Math.hypot(px, pz);
        for (const eje of ["+x", "-x", "+z", "-z"]) {
          cara(P, C, eje, px - 0.06, 0, pz - 0.06, 0.12, 4.2, poste, dd);
        }
        cara(P, C, "+y", px - 0.22, 4.2, pz - 0.22, 0.44, 0.44, lampara, dd * 0.35);
        for (const eje of ["+x", "-x", "+z", "-z"]) {
          cara(P, C, eje, px - 0.22, 3.95, pz - 0.22, 0.44, 0.25, lampara, dd * 0.35);
        }
      }
    }
  }
  return { positions: new Float32Array(P), colors: new Float32Array(C), tris: P.length / 9 };
}

// ---------------------------------------------------------------------- autos
const autos = [];

function prepararAutos() {
  for (let i = 0; i < N_AUTOS; i++) {
    const el = root.getElementById("auto_" + i);
    if (!el) return false;
    const eje = hash(i, 1, 71) < 0.5;               // true: corre en X
    const carril = Math.floor(hash(i, 2, 73) * (LADO + 1)) - LADO / 2;
    const sentido = hash(i, 3, 77) < 0.5 ? 1 : -1;
    autos.push({
      el: el, eje: eje, c: carril * PASO + sentido * 2.2, sentido: sentido,
      t: hash(i, 4, 79) * LADO * PASO,
      v: 7 + hash(i, 5, 83) * 9,
    });
  }
  return true;
}

function moverAutos(dt) {
  const medio = (LADO * PASO) / 2 + 8;
  const lote = [];
  for (const a of autos) {
    a.t += a.v * dt;
    if (a.t > medio * 2) a.t -= medio * 2;
    const p = -medio + a.t;
    const x = a.eje ? p * a.sentido : a.c;
    const z = a.eje ? a.c : p * a.sentido;
    lote.push(a.el.nodeId, x, 0.55, z, 0, a.eje ? (a.sentido > 0 ? 1.5708 : -1.5708) : (a.sentido > 0 ? 0 : 3.14159), 0);
  }
  if (lote.length) root.setTransformBatch(lote);
}

// ---------------------------------------------------------------------- bucle
const mallas = [];
let listo = false;
let t0 = 0;
let previo = 0;
let tic = 0;
let cursor = 0;

function preparar() {
  const cal = root.getElementById("calles");
  if (!cal) return false;
  for (let j = 0; j < LADO; j++) {
    for (let i = 0; i < LADO; i++) {
      if (!root.getElementById("m_" + i + "_" + j)) return false;
    }
  }
  if (!prepararAutos()) return false;

  const c = calles();
  cal.src = MeshResource.create({ positions: c.positions, colors: c.colors }).src;

  let tris = c.tris;
  for (let j = 0; j < LADO; j++) {
    for (let i = 0; i < LADO; i++) {
      const el = root.getElementById("m_" + i + "_" + j);
      const d = manzana(i, j, 0.45);
      const m = MeshResource.create({ positions: d.positions, colors: d.colors });
      el.src = m.src;
      mallas.push({ el: el, malla: m, i: i, j: j, datos: d });
      tris += d.tris;
    }
  }
  console.log("[ciudad] " + mallas.length + " manzanas, " + autos.length +
              " autos, " + tris + " triangulos en " + (mallas.length + 1) + " nodos");
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
  moverAutos(dt);

  // Una manzana por tick cambia sus luces. A 12 Hz y 64 manzanas, cada una se
  // repinta cada cinco segundos y medio: nadie ve la ciudad entera parpadear,
  // pero si te quedás mirando una ventana, en algún momento se apaga.
  const paso = Math.floor((ahora - t0) / 84);
  if (paso === tic) return;
  tic = paso;
  const m = mallas[cursor % mallas.length];
  cursor++;
  const d = manzana(m.i, m.j, 0.4 + Math.sin(paso * 0.013 + m.i) * 0.12);
  m.malla.update({ positions: d.positions, colors: d.colors });
}

requestAnimationFrame(frame);
