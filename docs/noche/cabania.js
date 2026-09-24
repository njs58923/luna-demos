// Una cabaña de tablas, generada tabla por tabla en una malla dinámica.
//
// Éste es el caso que justifica MeshResource. La cabaña son ~130 tablas, cada
// una con su largo, su junta y su tono: como nodos del DOM serían 130 entidades
// con sus 130 transformaciones y sus 130 materiales. Acá es **un solo nodo** y
// un buffer que se arma una vez.
//
// La contra es que se pierde todo lo que da el DOM: no hay ids, no hay toque
// por tabla, no se puede mover una sola. Para geometría que nace y muere junta
// —un edificio, un terreno, una constelación— es el intercambio correcto; para
// cosas que se tocan de a una, no.
//
// Sin luces en la escena, el sombreado lo pone el color: cada cara lleva su
// propio factor de brillo (arriba clara, laterales medias, abajo oscura). Sin
// eso una caja de color plano se ve como una silueta sin volumen.
const CABANIA = {
  ancho: 3.4,
  fondo: 2.8,
  alto: 2.3,
  /** grosor de una tabla, y su alto de hilada */
  espesor: 0.07,
  hilada: 0.19,
  /** junta entre hiladas: sin esto no se leen como tablas separadas */
  junta: 0.012,
  puerta: { x: 0.0, ancho: 0.95, alto: 1.95 },
  ventana: { x: -1.05, y: 1.35, ancho: 0.75, alto: 0.6 },
};

const MADERA = [
  [0.32, 0.24, 0.17],
  [0.29, 0.21, 0.15],
  [0.35, 0.27, 0.19],
  [0.26, 0.19, 0.14],
  [0.31, 0.23, 0.16],
];
const TECHO = [
  [0.22, 0.21, 0.20],
  [0.19, 0.18, 0.18],
  [0.25, 0.24, 0.22],
];

/** Las seis caras de una caja, cada una con sus cuatro esquinas en orden
 *  antihorario **vista desde afuera**, y su factor de brillo.
 *
 *  El orden importa: los triángulos son de una sola cara y con el winding al
 *  revés la caja se ve desde adentro, o sea invisible. Es el mismo error que
 *  dejó el cielo estrellado vacío. */
const CARAS = [
  { v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], luz: 0.80 }, // +x
  { v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], luz: 0.66 }, // -x
  { v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], luz: 1.00 }, // +y (arriba)
  { v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], luz: 0.45 }, // -y (abajo)
  { v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], luz: 0.88 }, // +z
  { v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], luz: 0.58 }, // -z
];

function hashCab(i, sal) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(sal | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Empuja una caja al buffer. `giro` es una rotación sobre X (para el techo);
 *  se aplica alrededor del centro de la caja. */
function tabla(P, C, cx, cy, cz, sx, sy, sz, color, giro) {
  const co = giro ? Math.cos(giro) : 1;
  const si = giro ? Math.sin(giro) : 0;
  for (const cara of CARAS) {
    const p = [];
    for (const [ux, uy, uz] of cara.v) {
      let x = (ux - 0.5) * sx;
      let y = (uy - 0.5) * sy;
      let z = (uz - 0.5) * sz;
      if (giro) {
        const y2 = y * co - z * si;
        const z2 = y * si + z * co;
        y = y2;
        z = z2;
      }
      p.push([cx + x, cy + y, cz + z]);
    }
    // Dos triángulos por cara, compartiendo la diagonal 0-2.
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
      for (const v of [p[a], p[b], p[c]]) {
        P.push(v[0], v[1], v[2]);
        C.push(color[0] * cara.luz, color[1] * cara.luz, color[2] * cara.luz, 1);
      }
    }
  }
}

/** ¿El tramo [a,b] de una hilada choca con un hueco? Devuelve los pedazos que
 *  quedan a los costados. Es lo que abre la puerta y la ventana sin tener que
 *  modelar el marco a mano. */
function recortar(a, b, hueco) {
  if (!hueco || b <= hueco.a || a >= hueco.b) return [[a, b]];
  const out = [];
  if (a < hueco.a) out.push([a, hueco.a]);
  if (b > hueco.b) out.push([hueco.b, b]);
  return out;
}

/** Lo mismo contra varios huecos: cada uno parte los tramos que dejó el
 *  anterior. Hace falta porque puerta y ventana se superponen en altura, y
 *  aplicando sólo el primero la ventana no se abría nunca. */
function recortarTodos(a, b, huecos) {
  let tramos = [[a, b]];
  for (const h of huecos) {
    const out = [];
    for (const [ta, tb] of tramos) out.push(...recortar(ta, tb, h));
    tramos = out;
  }
  return tramos;
}

/** Una pared de tablas horizontales sobre el plano XY, a una z fija. */
function pared(P, C, ancho, alto, z, semilla, huecos) {
  const cfg = CABANIA;
  let y = cfg.hilada / 2;
  let fila = 0;
  while (y < alto) {
    const aplican = huecos.filter((h) => y + cfg.hilada / 2 > h.y0 && y - cfg.hilada / 2 < h.y1);
    for (const [a, b] of recortarTodos(-ancho / 2, ancho / 2, aplican)) {
      const largo = b - a;
      if (largo < 0.04) continue;
      // Cada tabla con su tono y un pelo de espesor distinto: la variación es
      // lo único que separa "tablas" de "una pared rayada".
      const t = hashCab(semilla * 131 + fila * 17 + Math.round(a * 50), 3);
      const color = MADERA[Math.floor(t * MADERA.length) % MADERA.length];
      tabla(P, C, (a + b) / 2, y, z, largo, cfg.hilada - cfg.junta,
            cfg.espesor * (0.9 + t * 0.35), color, 0);
    }
    y += cfg.hilada;
    fila++;
  }
}

function construirCabania() {
  const cfg = CABANIA;
  const P = [];
  const C = [];
  const mitadA = cfg.ancho / 2;
  const mitadF = cfg.fondo / 2;

  const puerta = {
    a: cfg.puerta.x - cfg.puerta.ancho / 2,
    b: cfg.puerta.x + cfg.puerta.ancho / 2,
    y0: 0,
    y1: cfg.puerta.alto,
  };
  const ventana = {
    a: cfg.ventana.x - cfg.ventana.ancho / 2,
    b: cfg.ventana.x + cfg.ventana.ancho / 2,
    y0: cfg.ventana.y,
    y1: cfg.ventana.y + cfg.ventana.alto,
  };

  // Frente (con puerta y ventana) y fondo.
  pared(P, C, cfg.ancho, cfg.alto, mitadF, 1, [puerta, ventana]);
  pared(P, C, cfg.ancho, cfg.alto, -mitadF, 2, []);

  // Laterales: la misma rutina girada 90°, o sea intercambiando ejes al
  // emitir. Se hace acá y no con una matriz porque son dos casos y no vale
  // armar transformaciones para eso.
  for (const lado of [-1, 1]) {
    let y = cfg.hilada / 2;
    let fila = 0;
    while (y < cfg.alto) {
      const t = hashCab(fila * 29 + (lado + 1) * 7, 5);
      const color = MADERA[Math.floor(t * MADERA.length) % MADERA.length];
      tabla(P, C, lado * mitadA, y, 0, cfg.espesor * (0.9 + t * 0.35),
            cfg.hilada - cfg.junta, cfg.fondo, color, 0);
      y += cfg.hilada;
      fila++;
    }
  }

  // Postes en las esquinas: rematan los cantos, que si no se ven abiertos.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      tabla(P, C, sx * mitadA, cfg.alto / 2, sz * mitadF, 0.11, cfg.alto, 0.11,
            MADERA[3], 0);
    }
  }

  // Techo a dos aguas: tablas inclinadas que corren de la cumbrera al alero.
  const pendiente = 0.62; // radianes
  const largoAgua = mitadF / Math.cos(pendiente) + 0.28;
  const nTablas = Math.round(cfg.ancho / 0.24);
  for (const lado of [-1, 1]) {
    for (let i = 0; i < nTablas; i++) {
      const t = hashCab(i * 13 + (lado + 1) * 101, 7);
      const color = TECHO[Math.floor(t * TECHO.length) % TECHO.length];
      const x = -cfg.ancho / 2 + (i + 0.5) * (cfg.ancho / nTablas);
      // Centro del agua: a media pendiente entre cumbrera y alero.
      const cz = lado * (mitadF / 2);
      const cy = cfg.alto + (mitadF / 2) * Math.tan(pendiente) - 0.02;
      tabla(P, C, x, cy, cz, cfg.ancho / nTablas - 0.02, 0.06, largoAgua,
            color, lado * pendiente);
    }
  }
  // Cumbrera.
  tabla(P, C, 0, cfg.alto + mitadF * Math.tan(pendiente) + 0.03, 0,
        cfg.ancho + 0.1, 0.09, 0.16, TECHO[2], 0);

  return {
    positions: new Float32Array(P),
    colors: new Float32Array(C),
    tablas: P.length / (36 * 3),
  };
}

// ------------------------------------------------------------------- montaje
let cabaniaLista = false;

function frameCabania() {
  requestAnimationFrame(frameCabania);
  if (cabaniaLista) return;
  const nodo = hiperspace.dimention.getElementById("cabania");
  if (!nodo) return;
  const malla = construirCabania();
  const recurso = MeshResource.create({ positions: malla.positions, colors: malla.colors });
  nodo.src = recurso.src;
  cabaniaLista = true;
  console.log(
    "[cabaña] " + malla.tablas + " tablas, " +
      malla.positions.length / 9 + " triángulos, 1 nodo",
  );
}

requestAnimationFrame(frameCabania);
