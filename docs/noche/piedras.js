// Rocas y pavimento, generados con malla dinámica.
//
// Dos piezas que comparten idea con la cabaña —geometría de código en un solo
// nodo— pero que resuelven el sombreado mejor: en vez de asignarle un brillo
// fijo a cada cara según su orientación en el modelo, acá se **calcula la
// normal de cada triángulo** y el brillo sale de cuánto mira hacia arriba. Es
// tres líneas más y funciona para caras en cualquier ángulo, que es lo que
// hace falta cuando la forma es irregular.
//
//   Rocas    ocho piedras facetadas, un icosaedro deformado cada una.
//   Sendero  el adoquinado del centro y el camino a la entrada.
//
// Los dos son un nodo cada uno. Como nodos del DOM serían ~180 entidades.
const PIEDRAS = {
  /** plazoleta central */
  radioPlaza: 2.35,
  /** camino desde la plazoleta hasta el cartel de entrada */
  senda: { ancho: 1.5, desde: 0, hasta: 3.6 },
  /** paso de la grilla de adoquines */
  paso: 0.36,
  /** cuánto se separa un adoquín de su celda: es la junta */
  junta: 0.055,
};

const PIEDRA = [
  [0.30, 0.32, 0.31],
  [0.26, 0.28, 0.27],
  [0.34, 0.35, 0.33],
  [0.23, 0.25, 0.25],
];
const ADOQUIN = [
  [0.27, 0.28, 0.27],
  [0.31, 0.32, 0.30],
  [0.24, 0.26, 0.26],
  [0.34, 0.34, 0.32],
  [0.29, 0.30, 0.31],
];

function hp(i, sal) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(sal | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Empuja un triángulo calculando su brillo a partir de la normal.
 *
 *  Sin luces en la escena, el volumen lo tiene que dar el color. Con formas
 *  irregulares no sirve la tabla de brillos por cara que usa la cabaña —no hay
 *  "cara de arriba"—, así que el brillo sale de la normal: 1.0 mirando al
 *  cielo, 0.38 mirando al piso. El término en X desempata las caras verticales,
 *  que si no quedan todas del mismo tono y la silueta se aplana. */
function normal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const largo = Math.hypot(nx, ny, nz) || 1;
  return [nx / largo, ny / largo, nz / largo];
}

function brillo(n) {
  return 0.38 + 0.52 * Math.max(0, n[1]) + 0.10 * (n[0] * 0.7 + n[2] * 0.3 + 1) / 2;
}

function emitir(P, C, a, b, c, color, luz) {
  for (const v of [a, b, c]) {
    P.push(v[0], v[1], v[2]);
    C.push(color[0] * luz, color[1] * luz, color[2] * luz, 1);
  }
}

function tri(P, C, a, b, c, color) {
  emitir(P, C, a, b, c, color, brillo(normal(a, b, c)));
}

/** El mismo triángulo por los dos lados, con el brillo de la cara de afuera.
 *
 *  El reverso lleva el brillo de la cara original a propósito: calculado con su
 *  propia normal daría el valor de una cara mirando al piso, y la roca se vería
 *  con manchones oscuros justo donde el reverso es lo visible. */
function triDoble(P, C, a, b, c, color) {
  const luz = brillo(normal(a, b, c));
  emitir(P, C, a, b, c, color, luz);
  emitir(P, C, a, c, b, color, luz);
}

// ------------------------------------------------------------------- rocas
/** Icosaedro: doce vértices y veinte caras, ya con el orden antihorario visto
 *  desde afuera. Deformando los vértices queda una roca facetada por veinte
 *  triángulos, que es todo lo que hace falta a esta escala. */
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

function roca(P, C, cx, cz, escala, semilla) {
  const color = PIEDRA[Math.floor(hp(semilla, 1) * PIEDRA.length) % PIEDRA.length];
  // Achatada y con una proporción propia: una roca esférica parece una pelota.
  const ex = escala * (0.85 + hp(semilla, 2) * 0.5);
  const ey = escala * (0.5 + hp(semilla, 3) * 0.35);
  const ez = escala * (0.85 + hp(semilla, 4) * 0.5);
  const giro = hp(semilla, 5) * Math.PI * 2;
  const co = Math.cos(giro), si = Math.sin(giro);

  const vs = ICO_V.map((v, i) => {
    const largo = Math.hypot(v[0], v[1], v[2]);
    // Cada vértice con su propio radio: es lo que rompe la simetría del sólido.
    const r = 0.78 + hp(semilla * 31 + i, 6) * 0.44;
    let x = (v[0] / largo) * ex * r;
    const y = (v[1] / largo) * ey * r;
    let z = (v[2] / largo) * ez * r;
    const x2 = x * co - z * si;
    z = x * si + z * co;
    x = x2;
    // Se hunde un poco: apoyada justo sobre el pasto flota, y enterrada se ve
    // asentada. El 0.62 sale de mirarlas, no de ninguna cuenta.
    return [cx + x, y + ey * 0.62, cz + z];
  });
  for (const [a, b, c] of ICO_F) tri(P, C, vs[a], vs[b], vs[c], color);
}

// ----------------------------------------------------------------- sendero
/** ¿Este punto es parte del pavimento? Plazoleta central más el camino a la
 *  entrada. Todo lo demás queda de pasto: el pedido era sendero, no piso. */
function enElCamino(x, z) {
  const cfg = PIEDRAS;
  if (Math.hypot(x, z) < cfg.radioPlaza) return true;
  return Math.abs(x) < cfg.ancho2 && z > cfg.senda.desde && z < cfg.senda.hasta;
}

/** Un adoquín: prisma irregular de 5 a 7 lados. Sólo tapa y costados; el fondo
 *  no se ve nunca y son 5 triángulos menos por piedra. */
function adoquin(P, C, cx, cz, radio, semilla) {
  const color = ADOQUIN[Math.floor(hp(semilla, 11) * ADOQUIN.length) % ADOQUIN.length];
  const lados = 5 + Math.floor(hp(semilla, 12) * 3);
  const giro = hp(semilla, 13) * Math.PI * 2;
  const alto = 0.035 + hp(semilla, 14) * 0.03;
  const arriba = [];
  const abajo = [];
  for (let i = 0; i < lados; i++) {
    const a = giro + (i / lados) * Math.PI * 2;
    const r = radio * (0.82 + hp(semilla * 17 + i, 15) * 0.3);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    arriba.push([x, alto, z]);
    abajo.push([x, -0.04, z]);
  }
  // Tapa, en abanico desde el primer vértice, con los vértices **al revés**.
  // En el plano XZ con Y hacia arriba, recorrer (cos a, sin a) va en sentido
  // horario visto desde arriba: con el abanico directo la normal apunta al
  // piso y la tapa queda invisible. Se veían sólo los costados, como
  // medialunas sueltas sobre el pasto.
  for (let i = 1; i < lados - 1; i++) tri(P, C, arriba[0], arriba[i + 1], arriba[i], color);
  // Costados a **doble cara**, la tapa no.
  //
  // Son los pocos milímetros que el adoquín sobresale del pasto, y al mirarlos
  // casi de canto el borde más cercano al visitante es justo el que queda
  // culleado: la piedra se ve hundida o directamente sin canto. Emitiendo el
  // reverso se ve siempre, y son cinco triángulos por piedra.
  //
  // La tapa se emite una sola vez: siempre se la mira desde arriba, y
  // duplicarla sería agregar triángulos que nadie va a ver.
  for (let i = 0; i < lados; i++) {
    const j = (i + 1) % lados;
    triDoble(P, C, abajo[i], abajo[j], arriba[j], color);
    triDoble(P, C, abajo[i], arriba[j], arriba[i], color);
  }
}

function construirPiedras() {
  const cfg = PIEDRAS;
  cfg.ancho2 = cfg.senda.ancho / 2;

  const Pr = [], Cr = [];
  // Rocas repartidas a mano: pocas y ubicadas, que esparcidas por hash siempre
  // caen donde molestan.
  const donde = [
    [-8.2, -2.4, 0.62], [-7.1, 3.9, 0.44], [-4.6, 5.6, 0.35],
    [5.9, 4.4, 0.55], [7.4, 0.6, 0.40], [6.2, -3.8, 0.48],
    [1.8, 6.4, 0.32], [-2.6, 7.2, 0.5],
  ];
  donde.forEach(([x, z, s], i) => roca(Pr, Cr, x, z, s, i + 1));

  const Pa = [], Ca = [];
  // Grilla con corrimiento por fila y jitter: en grilla perfecta se ve el
  // damero y deja de parecer empedrado.
  const alcance = Math.max(cfg.radioPlaza, cfg.senda.hasta) + cfg.paso;
  let n = 0;
  for (let iz = -Math.ceil(alcance / cfg.paso); iz <= Math.ceil(alcance / cfg.paso); iz++) {
    for (let ix = -Math.ceil(alcance / cfg.paso); ix <= Math.ceil(alcance / cfg.paso); ix++) {
      const semilla = (ix + 100) * 977 + (iz + 100);
      const cx = ix * cfg.paso + (iz % 2 ? cfg.paso / 2 : 0) + (hp(semilla, 21) - 0.5) * cfg.paso * 0.3;
      const cz = iz * cfg.paso + (hp(semilla, 22) - 0.5) * cfg.paso * 0.3;
      if (!enElCamino(cx, cz)) continue;
      adoquin(Pa, Ca, cx, cz, cfg.paso / 2 - cfg.junta, semilla);
      n++;
    }
  }

  return {
    rocas: { positions: new Float32Array(Pr), colors: new Float32Array(Cr), n: donde.length },
    sendero: { positions: new Float32Array(Pa), colors: new Float32Array(Ca), n: n },
  };
}

// ------------------------------------------------------------------- montaje
let piedrasListas = false;

function framePiedras() {
  requestAnimationFrame(framePiedras);
  if (piedrasListas) return;
  const root = hiperspace.dimention;
  const nRocas = root.getElementById("rocas");
  const nSendero = root.getElementById("sendero");
  if (!nRocas || !nSendero) return;

  const m = construirPiedras();
  nRocas.src = MeshResource.create({ positions: m.rocas.positions, colors: m.rocas.colors }).src;
  nSendero.src = MeshResource.create({ positions: m.sendero.positions, colors: m.sendero.colors }).src;
  piedrasListas = true;
  console.log(
    "[piedras] " + m.rocas.n + " rocas (" + m.rocas.positions.length / 9 + " tris) y " +
      m.sendero.n + " adoquines (" + m.sendero.positions.length / 9 + " tris), 2 nodos",
  );
}

requestAnimationFrame(framePiedras);
