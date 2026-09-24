// Las nubes de la pradera: tres capas, un nodo cada una.
//
// Cada capa es **una** malla dinámica con todas sus nubes adentro, y la
// animación mueve el nodo, no las nubes. Son tres transformaciones por frame
// contra una por nube si cada una fuera un nodo del DOM — y son unas cuarenta
// nubes. Es la misma decisión que las estrellas del bestiario, al derecho: allá
// la malla cambia y el nodo no se mueve; acá la malla es fija y lo que cambia
// es el nodo.
//
// Las nubes son heptágonos irregulares y no rectángulos: con cuadriláteros se
// leen como carteles colgados del cielo. Van planas, mirando para abajo, que es
// desde donde se las ve.
const CFG = globalThis.PRADERA || {};
const root = hiperspace.dimention;

function hash(i, sal) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(sal | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Las tres capas: alto, cuántas, extensión, velocidad de deriva y color.
 *
 *  Las de abajo van más rápido. Ese desfasaje es todo el parallax que tiene la
 *  escena, y alcanza: con las tres a la misma velocidad el cielo se ve como una
 *  calcomanía que se desliza. */
//  Los colores van **dentro de [0, 1]**: el motor valida el buffer y tira
//  "Vertex colors must be in [0, 1]". Se intentó pasarse de 1 para compensar
//  que las nubes se leían grises contra el celeste, y lo que se consigue es que
//  MeshResource.create falle y el cielo quede vacío. La saturación se arregla
//  del otro lado: el cielo va un tono más oscuro para que el blanco resalte.
const CAPAS = [
  { id: "nubes_0", y: 58, cuantas: 26, ancho: 620, escala: 20, vel: 1.9, color: [1, 0.99, 0.97] },
  { id: "nubes_1", y: 92, cuantas: 20, ancho: 820, escala: 30, vel: 1.2, color: [0.98, 0.97, 0.96] },
  { id: "nubes_2", y: 136, cuantas: 15, ancho: 1100, escala: 46, vel: 0.7, color: [0.95, 0.94, 0.95] },
];

/** Una nube: tres a cinco heptágonos solapados, cada uno un abanico de
 *  triángulos. El abanico va **al revés** que en el suelo: en el plano XZ con Y
 *  arriba, recorrer (cos a, sin a) va en sentido horario visto desde arriba, y
 *  una nube se mira desde abajo. */
function nube(P, C, cx, cy, cz, escala, color, sal) {
  const bultos = 3 + Math.floor(hash(sal, 1) * 3);
  for (let b = 0; b < bultos; b++) {
    const ox = (hash(sal * 8 + b, 2) - 0.5) * escala * 1.5;
    const oz = (hash(sal * 8 + b, 3) - 0.5) * escala * 0.8;
    const oy = (hash(sal * 8 + b, 4) - 0.5) * escala * 0.16;
    const rx = escala * (0.35 + hash(sal * 8 + b, 5) * 0.5);
    const rz = rx * (0.5 + hash(sal * 8 + b, 6) * 0.4);
    const giro = hash(sal * 8 + b, 7) * Math.PI * 2;
    const N = 7;
    // Sombreado por bulto: un valor por polígono, no por vértice. Sin esto la
    // nube es una mancha blanca sin volumen; con degradé por vértice se ve
    // como plástico.
    const k = 0.9 + hash(sal * 8 + b, 8) * 0.1;
    const borde = [];
    for (let i = 0; i < N; i++) {
      const a = giro + (i / N) * Math.PI * 2;
      const rr = 0.78 + hash(sal * 8 + b, 9 + i) * 0.36;
      borde.push([cx + ox + Math.cos(a) * rx * rr, cy + oy, cz + oz + Math.sin(a) * rz * rr]);
    }
    for (let i = 0; i < N; i++) {
      const p1 = borde[i];
      const p2 = borde[(i + 1) % N];
      // Centro, p1, p2 — el orden **directo**. En el plano XZ con Y arriba,
      // recorrer (cos a, sin a) va horario visto desde arriba, así que el
      // abanico directo deja la cara mirando hacia **abajo**, que es de donde
      // se mira una nube. Con el orden invertido —que es el que necesitan las
      // tapas del suelo— el cielo queda vacío y no avisa nada.
      P.push(cx + ox, cy + oy, cz + oz, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      for (let v = 0; v < 3; v++) {
        C.push(color[0] * k, color[1] * k, color[2] * k, 1);
      }
    }
  }
}

/** Arma una capa **con el campo repetido dos veces** a lo largo de X.
 *
 *  Es lo que hace que la deriva no se termine. La primera version movia el nodo
 *  de -ancho/2 a +ancho/2 sobre un campo de un solo ancho: a los pocos segundos
 *  las nubes se habian ido de la vista y el cielo quedaba pelado. Con el campo
 *  duplicado y el nodo corriendo de 0 a -ancho, la copia de atras entra justo
 *  cuando la de adelante se va, y el ciclo cierra sin salto. */
function armarCapa(capa, sal) {
  const P = [];
  const C = [];
  for (let i = 0; i < capa.cuantas; i++) {
    const x = (hash(i, sal) - 0.5) * capa.ancho;
    const z = (hash(i, sal + 1) - 0.5) * capa.ancho;
    const escala = capa.escala * (0.7 + hash(i, sal + 2) * 0.7);
    for (const copia of [0, capa.ancho]) {
      nube(P, C, x + copia, 0, z, escala, capa.color, i * 31 + sal);
    }
  }
  return {
    positions: new Float32Array(P),
    colors: new Float32Array(C),
    tris: P.length / 9,
  };
}

const capas = [];
let listo = false;
let t0 = 0;
let tic = 0;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) t0 = ahora;
  const t = (ahora - t0) / 1000;

  if (!listo) {
    let faltan = false;
    for (let i = 0; i < CAPAS.length; i++) {
      const el = root.getElementById(CAPAS[i].id);
      if (!el) { faltan = true; break; }
    }
    if (faltan) return;
    let tris = 0;
    for (let i = 0; i < CAPAS.length; i++) {
      const capa = CAPAS[i];
      const el = root.getElementById(capa.id);
      const datos = armarCapa(capa, 7 + i * 13);
      // El buffer de colores es **rgba**: cuatro componentes por vértice, y
      // todas dentro de [0, 1]. Si algo falla se avisa UNA vez y se corta: sin
      // el try, el bucle vuelve a intentar en cada frame y el log se llena de
      // miles de líneas iguales.
      try {
        const malla = MeshResource.create({ positions: datos.positions, colors: datos.colors });
        el.src = malla.src;
        capas.push({ el: el, capa: capa });
        tris += datos.tris;
      } catch (e) {
        listo = true;
        console.log("[pradera] no se pudo armar " + capa.id + ": " + e);
        return;
      }
    }
    listo = true;
    console.log("[pradera] " + CAPAS.length + " capas de nubes, " + tris + " triangulos en " + CAPAS.length + " nodos");
    return;
  }

  // A 20 Hz alcanza: son nubes, no se les ve el paso.
  const paso = Math.floor(t * 20);
  if (paso === tic) return;
  tic = paso;
  for (const c of capas) {
    // El nodo corre de 0 a -ancho y vuelve a 0. Como el campo está duplicado a
    // +ancho, el salto cae sobre una copia idéntica y no se ve.
    const ancho = c.capa.ancho;
    c.el.position = { x: -((t * c.capa.vel) % ancho), y: c.capa.y, z: 0 };
  }
}

requestAnimationFrame(frame);
