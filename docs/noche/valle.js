// Terreno, montañas y nubes, todo generado con malla dinámica.
//
// La idea del terreno es la de cualquier motor: **la resolución baja con la
// distancia**. Un solo mallado fino que llegue al horizonte es imposible —a 0,6 m
// de celda, un radio de 160 m son 220.000 celdas—, y uno grueso de cerca se ve
// como un origami. Así que se generan cuatro anillos concéntricos, cada uno con
// su paso, y cada anillo es **un nodo**:
//
//   anillo 0   0 – 12 m     celda 0.6 m    el suelo que uno pisa
//   anillo 1   12 – 34 m    celda 1.8 m
//   anillo 2   34 – 80 m    celda 5 m
//   anillo 3   80 – 170 m   celda 14 m     ya es silueta
//
// La altura sale de la misma función en los cuatro, así que los bordes entre
// anillos coinciden: no hay costura que tapar. Es la misma propiedad que hacía
// encajar los chunks de las backrooms — muestrear una función de las
// coordenadas, no acumular estado.
const CFG = globalThis.VALLE || {};
const root = hiperspace.dimention;

const ANILLOS = [
  { desde: 0, hasta: 12, paso: 0.6 },
  { desde: 12, hasta: 34, paso: 1.8 },
  { desde: 34, hasta: 80, paso: 5 },
  { desde: 80, hasta: 170, paso: 14 },
];

const PASTO = [
  [0.16, 0.23, 0.16],
  [0.14, 0.21, 0.15],
  [0.18, 0.25, 0.17],
  [0.13, 0.19, 0.14],
];
const PIEDRA_ALTA = [0.28, 0.29, 0.30];
const MONTE = [
  [0.13, 0.15, 0.20],
  [0.11, 0.13, 0.18],
  [0.16, 0.18, 0.23],
];
const NUBE = [
  [0.20, 0.23, 0.31],
  [0.24, 0.27, 0.35],
  [0.17, 0.20, 0.27],
];

// ------------------------------------------------------------------- ruido
function hv(x, z, sal) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(sal | 0, 2246822519);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruido de valor con interpolación suave. Es lo más barato que da una
 *  superficie continua, y continua es lo único que importa acá: si el ruido
 *  saltara, los anillos no coincidirían en sus bordes. */
function ruido(x, z, escala, sal) {
  const px = x / escala;
  const pz = z / escala;
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = px - ix;
  const fz = pz - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hv(ix, iz, sal);
  const b = hv(ix + 1, iz, sal);
  const c = hv(ix, iz + 1, sal);
  const d = hv(ix + 1, iz + 1, sal);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/** Altura del terreno. Tres octavas alcanzan: la primera da los lomos, la
 *  segunda los accidentes y la tercera el grano. Una cuarta no se ve y cuesta
 *  lo mismo en cada vértice de cada anillo. */
function altura(x, z) {
  let h = 0;
  h += (ruido(x, z, 46, 1) - 0.5) * 7.0;
  h += (ruido(x, z, 15, 2) - 0.5) * 2.2;
  h += (ruido(x, z, 4.5, 3) - 0.5) * 0.55;
  // Cuenco suave alrededor del origen: el visitante aparece en un claro y no
  // adentro de una loma.
  const d = Math.hypot(x, z);
  h *= Math.min(1, d / 14) * 0.85 + 0.15;
  return h;
}

// ---------------------------------------------------------------- emisión
function normalDe(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function triangulo(P, C, a, b, c, color, extra) {
  const n = normalDe(a, b, c);
  // Sin luces, el volumen lo da la normal. La pendiente además decide el color:
  // lo empinado se vuelve piedra, que es lo que hace que un terreno de un solo
  // material se lea como paisaje.
  const luz = 0.42 + 0.58 * Math.max(0, n[1]);
  const roca = Math.min(1, Math.max(0, (1 - n[1] - 0.18) * 3.4));
  for (const v of [a, b, c]) {
    P.push(v[0], v[1], v[2]);
    C.push(
      (color[0] * (1 - roca) + PIEDRA_ALTA[0] * roca) * luz * (extra || 1),
      (color[1] * (1 - roca) + PIEDRA_ALTA[1] * roca) * luz * (extra || 1),
      (color[2] * (1 - roca) + PIEDRA_ALTA[2] * roca) * luz * (extra || 1),
      1,
    );
  }
}

/** Un anillo cuadrado hueco de terreno: la grilla completa menos el agujero
 *  del centro, que lo cubre el anillo anterior con más detalle. */
function anillo(desde, hasta, paso) {
  const P = [];
  const C = [];
  const n = Math.ceil(hasta / paso);
  const dentro = Math.floor(desde / paso);
  for (let iz = -n; iz < n; iz++) {
    for (let ix = -n; ix < n; ix++) {
      // El hueco se mide en celdas, no en metros: así el borde del anillo
      // interior cae exactamente sobre una línea de la grilla del exterior y
      // no quedan grietas.
      if (Math.max(Math.abs(ix), Math.abs(iz)) < dentro) continue;
      if (Math.max(Math.abs(ix), Math.abs(iz)) > n) continue;
      const x0 = ix * paso;
      const z0 = iz * paso;
      const x1 = x0 + paso;
      const z1 = z0 + paso;
      const v00 = [x0, altura(x0, z0), z0];
      const v10 = [x1, altura(x1, z0), z0];
      const v11 = [x1, altura(x1, z1), z1];
      const v01 = [x0, altura(x0, z1), z1];
      const color = PASTO[Math.floor(hv(ix, iz, 9) * PASTO.length) % PASTO.length];
      triangulo(P, C, v00, v01, v11, color);
      triangulo(P, C, v00, v11, v10, color);
    }
  }
  return { positions: new Float32Array(P), colors: new Float32Array(C), tris: P.length / 9 };
}

// --------------------------------------------------------------- montañas
/** Altura de la cordillera: el **mismo generador** que el terreno, con las
 *  escalas y las amplitudes llevadas a tamaño de montaña.
 *
 *  Es la misma `ruido()` de arriba; lo único que cambia son los números. Eso
 *  importa para la escala: los cerros del valle y los picos del horizonte
 *  comparten la forma del ruido, así que se leen como el mismo mundo visto de
 *  cerca y de lejos, no como dos decorados distintos. */
/** Ruido de valor **con sus derivadas analíticas**, en celdas de lado 1.
 *
 *  Devuelve [valor, d/dx, d/dz]. Las derivadas no son un lujo: son el
 *  ingrediente del fbm de abajo. Salen exactas de la misma interpolación, así
 *  que cuestan tres multiplicaciones más que el ruido pelado — mucho menos que
 *  estimarlas por diferencias finitas, que pediría tres muestras por punto.
 *
 *  Interpolación quíntica (6t⁵-15t⁴+10t³) en vez de la cúbica que usa el
 *  terreno: su derivada segunda también es continua, y sin eso las laderas
 *  muestran bandas en los bordes de celda. */
function ruidoD(px, pz, sal) {
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = px - ix;
  const fz = pz - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duz = 30 * fz * fz * (fz * (fz - 2) + 1);
  const a = hv(ix, iz, sal);
  const b = hv(ix + 1, iz, sal);
  const c = hv(ix, iz + 1, sal);
  const d = hv(ix + 1, iz + 1, sal);
  const k1 = b - a;
  const k2 = c - a;
  const k3 = a - b - c + d;
  return [
    a + k1 * ux + k2 * uz + k3 * ux * uz,
    dux * (k1 + k3 * uz),
    duz * (k2 + k3 * ux),
  ];
}

/** Altura de la cordillera.
 *
 *  Es la receta de Inigo Quilez (iquilezles.org/articles/morenoise), que es
 *  bastante más corta de lo que parece y da mucho más que un fbm común:
 *
 *      a += b * n / (1 + dot(d, d))
 *
 *  `d` son las derivadas **acumuladas** de todas las octavas anteriores. Donde
 *  la pendiente ya viene alta, el denominador crece y las octavas siguientes se
 *  apagan; donde el terreno viene plano, el detalle entra entero. Eso reparte
 *  el grano como lo reparte la erosión de verdad —crestas trabajadas, laderas y
 *  valles lisos— sin simular nada: es una división por octava.
 *
 *  Encima va el ruido de cresta (1-|2n-1|), que da los filos, y la rotación del
 *  dominio entre octavas (la matriz de iq, 0.8/0.6), que evita que el detalle
 *  se alinee con los ejes y se vea la grilla.
 *
 *  Antes esto era un fbm de crestas a secas: los picos salían todos iguales y
 *  con el mismo grano de arriba abajo, que es justo lo que esto arregla. */
const ROT = [0.8, -0.6, 0.6, 0.8];

function alturaMonte(x, z) {
  const ESCALA = 900;
  let px = x / ESCALA;
  let pz = z / ESCALA;
  let suma = 0;
  let amplitud = 1;
  let norma = 0;
  let dx = 0;
  let dz = 0;

  for (let i = 0; i < 8; i++) {
    const n = ruidoD(px, pz, 51 + i);
    dx += n[1];
    dz += n[2];
    const filo = 1 - Math.abs(n[0] * 2 - 1);
    suma += (amplitud * filo) / (1 + 0.9 * (dx * dx + dz * dz));
    norma += amplitud;
    amplitud *= 0.5;
    // Rotar y duplicar frecuencia. El 2.02 en vez de 2 corre las octavas para
    // que no se repitan sobre sí mismas.
    const nx = (ROT[0] * px + ROT[1] * pz) * 2.02;
    const nz = (ROT[2] * px + ROT[3] * pz) * 2.02;
    px = nx;
    pz = nz;
  }
  return (suma / norma) * 900;
}

const CORDILLERA = {
  /** de dónde a dónde, en metros desde el visitante.
   *
   *  A 900 m con picos de 820 la cordillera subía 40° y se comía el cielo
   *  entero, incluida la luna. Lejos y alta da la misma escala y deja aire:
   *  a 1400 m, 520 de pico son unos 20° sobre el horizonte. */
  cerca: 1400,
  lejos: 3000,
  /** centro del sector y su medio ancho, en radianes: **un solo lado** */
  rumbo: -Math.PI / 2,
  abanico: 1.15,
  /** Divisiones de la malla.
   *
   *  16 x 46 daba celdas de 100 m de profundidad: de abajo hacia arriba se
   *  contaban cinco polígonos y la cordillera se veía como un origami. Con
   *  48 x 140 la celda baja a ~33 m, que es donde las octavas finas del ruido
   *  empiezan a verse. Son 13.440 triángulos, en **un** nodo. */
  pasosR: 48,
  pasosA: 140,
};

/** La cordillera, como terreno.
 *
 *  Antes eran prismas de tres triángulos: barato, pero se leía como recortes de
 *  cartón y no daba escala. Ahora es una malla generada con la misma función de
 *  altura, en una franja **polar** —de 900 a 2100 m y sólo sobre un sector del
 *  horizonte—, que es la forma de gastar los vértices donde se ven: una grilla
 *  cuadrada de ese alcance sería quince veces más triángulos, casi todos
 *  detrás del visitante o fuera del rango.
 *
 *  La envolvente la hunde en los bordes del sector y en el borde cercano, para
 *  que nazca del horizonte en vez de aparecer como una pared cortada. */
function montanias() {
  const P = [];
  const C = [];
  const cfg = CORDILLERA;

  const punto = (ir, ia) => {
    const tr = ir / cfg.pasosR;
    const ta = ia / cfg.pasosA;
    const r = cfg.cerca + (cfg.lejos - cfg.cerca) * tr;
    const ang = cfg.rumbo - cfg.abanico + 2 * cfg.abanico * ta;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    // Suaviza a cero en los dos extremos del abanico y en el borde de adelante.
    const suave = (v) => v * v * (3 - 2 * v);
    const bordeA = suave(Math.min(1, Math.min(ta, 1 - ta) * 3.4));
    const bordeR = suave(Math.min(1, tr * 2.6));
    // Las de atrás pisan más alto: la cordillera se escalona hacia el fondo en
    // vez de terminar en una hilera pareja.
    const fondo = 0.72 + tr * 0.55;
    const y = alturaMonte(x, z) * bordeA * bordeR * fondo - 30;
    return [x, y, z];
  };

  for (let ir = 0; ir < cfg.pasosR; ir++) {
    for (let ia = 0; ia < cfg.pasosA; ia++) {
      const v00 = punto(ir, ia);
      const v10 = punto(ir + 1, ia);
      const v11 = punto(ir + 1, ia + 1);
      const v01 = punto(ir, ia + 1);
      const color = MONTE[Math.floor(hv(ir, ia, 15) * MONTE.length) % MONTE.length];
      triangulo(P, C, v00, v01, v11, color);
      triangulo(P, C, v00, v11, v10, color);
    }
  }
  return { positions: new Float32Array(P), colors: new Float32Array(C), tris: P.length / 9 };
}

// ------------------------------------------------------------------ nubes
/** Una capa de nubes: manchones planos a una altura, cada uno hecho de varios
 *  cuadriláteros solapados. Van en una sola malla por capa y la animación mueve
 *  el nodo entero, que es una transformación por capa y por frame en vez de una
 *  por nube. */
function capaNubes(semilla, altura, cuantas, tamanio) {
  const P = [];
  const C = [];
  for (let i = 0; i < cuantas; i++) {
    const cx = (hv(i, semilla, 21) - 0.5) * 520;
    const cz = (hv(i, semilla, 22) - 0.5) * 520;
    const color = NUBE[Math.floor(hv(i, semilla, 23) * NUBE.length) % NUBE.length];
    const bultos = 3 + Math.floor(hv(i, semilla, 24) * 4);
    for (let k = 0; k < bultos; k++) {
      const ox = (hv(i * 31 + k, semilla, 25) - 0.5) * tamanio * 1.6;
      const oz = (hv(i * 31 + k, semilla, 26) - 0.5) * tamanio * 0.9;
      const r = tamanio * (0.45 + hv(i * 31 + k, semilla, 27) * 0.55);
      const x = cx + ox;
      const z = cz + oz;
      const y = altura + (hv(i * 31 + k, semilla, 28) - 0.5) * 6;
      // Heptágono irregular, no un cuadrado: en cuadriláteros las nubes se
      // leen como carteles rectangulares colgados del cielo, que es
      // exactamente como se veían.
      const lados = 7;
      const giro = hv(i * 31 + k, semilla, 29) * 6.283;
      const borde = [];
      for (let s = 0; s < lados; s++) {
        const ang = giro + (s / lados) * 6.283;
        const rr = r * (0.62 + hv(i * 131 + k * 7 + s, semilla, 30) * 0.55);
        borde.push([x + Math.cos(ang) * rr, y + (hv(s, k + semilla, 31) - 0.5) * 1.2, z + Math.sin(ang) * rr]);
      }
      // Abanico, mirando hacia abajo: al cielo se lo ve desde el piso.
      for (let s = 1; s < lados - 1; s++) {
        for (const v of [borde[0], borde[s], borde[s + 1]]) {
          P.push(v[0], v[1], v[2]);
          C.push(color[0], color[1], color[2], 1);
        }
      }
    }
  }
  return { positions: new Float32Array(P), colors: new Float32Array(C), tris: P.length / 9 };
}

// ---------------------------------------------------------------- montaje
let listo = false;
const capas = [];
let t0 = 0;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) t0 = ahora;

  if (!listo) {
    const suelo = ANILLOS.map((_, i) => root.getElementById("suelo_" + i));
    const montes = root.getElementById("montanias");
    const nubes = [0, 1, 2].map((i) => root.getElementById("nubes_" + i));
    if (suelo.some((n) => !n) || !montes || nubes.some((n) => !n)) return;

    let tris = 0;
    ANILLOS.forEach((a, i) => {
      const m = anillo(a.desde, a.hasta, a.paso);
      suelo[i].src = MeshResource.create({ positions: m.positions, colors: m.colors }).src;
      tris += m.tris;
    });
    const mm = montanias();
    montes.src = MeshResource.create({ positions: mm.positions, colors: mm.colors }).src;

    // Tres capas a distinta altura y velocidad: el desfasaje es lo que da
    // sensación de profundidad sin ningún truco de render.
    // Altas y ralas. La primera versión las puso a 58 m y con cobertura casi
    // total: tapaban la luna y el cielo entero, y de tan cerca se les veía la
    // forma. A esta altura son fondo, que es lo que tienen que ser.
    const ajustes = [
      { alt: 96, n: 14, tam: 30, vel: 0.55 },
      { alt: 128, n: 11, tam: 46, vel: 0.9 },
      { alt: 168, n: 8, tam: 72, vel: 1.5 },
    ];
    ajustes.forEach((c, i) => {
      const m = capaNubes(i + 1, c.alt, c.n, c.tam);
      nubes[i].src = MeshResource.create({ positions: m.positions, colors: m.colors }).src;
      capas.push({ el: nubes[i], vel: c.vel });
      tris += m.tris;
    });

    listo = true;
    console.log(
      "[valle] terreno " + tris + " triángulos en " + (ANILLOS.length + 4) + " nodos, " +
        mm.tris + " de montañas",
    );
    return;
  }

  // Deriva de las nubes. Se mueve el nodo, no los vértices: una transformación
  // por capa contra 26 nubes de vértices por capa. Cuando una capa se corrió
  // media vuelta del mundo, vuelve al principio — como son manchones repetidos,
  // el salto no se ve.
  const t = (ahora - t0) / 1000;
  const lote = [];
  for (const c of capas) {
    const x = ((t * c.vel) % 520) - 260;
    lote.push(c.el.nodeId, x, 0, 0, 0, 0, 0);
  }
  if (lote.length) root.setTransformBatch(lote);
}

requestAnimationFrame(frame);
console.log("[valle] listo");
