// La nevada: una malla dinámica que cae.
//
// Es el caso que mejor le sienta a `MeshResource`: mil copos que se mueven
// todos, todos los frames, y que no le importan a nadie individualmente. Como
// nodos del DOM serían mil entidades y mil transformaciones por frame; acá son
// **un** nodo y un `update` de buffer.
//
// Y a diferencia de las estrellas del bestiario —donde lo que cambia por frame
// es el color y las posiciones se calculan una vez—, acá lo que cambia son las
// **posiciones**. Es el mismo mecanismo usado al revés, y sirve para ver que el
// costo está en reconstruir el buffer, no en qué buffer se reconstruye.
const CFG = globalThis.INVIERNO || {};
const N = CFG.copos || 900;
const root = hiperspace.dimention;

// La caja donde vive la nevada. Sigue al visitante en X y Z —el copo que se
// escapa se recicla del otro lado—, así que 60 m de lado alcanzan para que
// parezca que nieva en todo el valle.
const LADO = 60;
const ALTO = 26;
const PISO = -2;

function hash(i, sal) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(sal | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const px = new Float32Array(N);
const py = new Float32Array(N);
const pz = new Float32Array(N);
const vel = new Float32Array(N);
const bam = new Float32Array(N);   // amplitud del vaivén
const fase = new Float32Array(N);
const tam = new Float32Array(N);

const posiciones = new Float32Array(N * 9);
const colores = new Float32Array(N * 12);

function sembrar() {
  for (let i = 0; i < N; i++) {
    px[i] = (hash(i, 1) - 0.5) * LADO;
    py[i] = PISO + hash(i, 2) * ALTO;
    pz[i] = (hash(i, 3) - 0.5) * LADO;
    vel[i] = 1.1 + hash(i, 4) * 1.9;
    bam[i] = 0.25 + hash(i, 5) * 0.7;
    fase[i] = hash(i, 6) * 6.28;
    // Los de adelante más grandes. No hay perspectiva que valga a esta escala:
    // el tamaño es lo único que da profundidad a una nevada.
    tam[i] = 0.045 + hash(i, 7) * 0.075;
    const b = 0.86 + hash(i, 8) * 0.14;
    for (let v = 0; v < 3; v++) {
      const o = i * 12 + v * 4;
      colores[o] = b; colores[o + 1] = b; colores[o + 2] = b * 1.02 > 1 ? 1 : b * 1.02;
      colores[o + 3] = 1;
    }
  }
}

/** Cada copo es un triángulo encarado al eje Z. No se orienta a la cámara —no
 *  hace falta: a este tamaño, un copo de perfil es un píxel que desaparece un
 *  frame, y billboardear mil triángulos por frame cuesta más que perderlos. */
function mover(t, dt) {
  for (let i = 0; i < N; i++) {
    py[i] -= vel[i] * dt;
    if (py[i] < PISO) {
      py[i] = PISO + ALTO;
      px[i] = (hash(i * 31 + Math.floor(t), 11) - 0.5) * LADO;
      pz[i] = (hash(i * 31 + Math.floor(t), 12) - 0.5) * LADO;
    }
    const x = px[i] + Math.sin(t * 0.9 + fase[i]) * bam[i];
    const z = pz[i] + Math.cos(t * 0.7 + fase[i]) * bam[i] * 0.6;
    const y = py[i];
    const r = tam[i];
    const o = i * 9;
    posiciones[o] = x;         posiciones[o + 1] = y + r;     posiciones[o + 2] = z;
    posiciones[o + 3] = x - r; posiciones[o + 4] = y - r * 0.8; posiciones[o + 5] = z;
    posiciones[o + 6] = x + r; posiciones[o + 7] = y - r * 0.8; posiciones[o + 8] = z;
  }
}

let nodo = null;
let malla = null;
let listo = false;
let t0 = 0;
let previo = 0;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) { t0 = ahora; previo = ahora; }
  const t = (ahora - t0) / 1000;

  if (!listo) {
    nodo = root.getElementById("nieve");
    if (!nodo) return;
    sembrar();
    mover(0, 0);
    try {
      malla = MeshResource.create({ positions: posiciones, colors: colores });
      nodo.src = malla.src;
    } catch (e) {
      listo = true;
      console.log("[invierno] no se pudo crear la nevada: " + e);
      return;
    }
    listo = true;
    console.log("[invierno] " + N + " copos en un nodo");
    return;
  }

  // dt real y acotado: si el motor se cuelga un segundo, la nevada no debe
  // pegar un salto de un metro y medio.
  const dt = Math.min(0.05, (ahora - previo) / 1000);
  previo = ahora;
  mover(t, dt);
  // Con los colores aunque no cambien: update() reemplaza la malla entera, y
  // sin ellos los copos pierden su tono. El arreglo es el mismo de siempre, no
  // se reconstruye nada.
  malla.update({ positions: posiciones, colors: colores });
}

requestAnimationFrame(frame);
