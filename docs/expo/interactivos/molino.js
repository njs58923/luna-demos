// Molino. Dos nodos animados: las aspas giran y la cabeza busca la dirección
// del viento. El viento no es constante: es una suma de senos con periodos
// que no son múltiplos entre sí, así que las ráfagas nunca se repiten igual.
//
// Configurable por instancia: el server inyecta globalThis.CONFIG cuando el
// <include> pide el documento con query params, p. ej.
//     molino.hsml?vel=1.6&rumbo=2.2&rafagas=0.5
const root = hiperspace.dimention;
const cfg = globalThis.CONFIG || {};

const VELOCIDAD = cfg.vel ?? 1.0;     // multiplicador del giro de las aspas
const RUMBO = cfg.rumbo ?? 0;         // hacia dónde sopla el viento, en radianes
const RAFAGAS = cfg.rafagas ?? 1.0;   // cuánto varían fuerza y dirección
const FASE = cfg.fase ?? 0;           // para que dos molinos no vayan sincronizados

let aspas = null;
let cabeza = null;

function bindear() {
  aspas = aspas || root.getElementById('aspas');
  cabeza = cabeza || root.getElementById('cabeza');
  return !!(aspas && cabeza);
}

let t = FASE;
let giro = 0;
let rumboActual = RUMBO;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!bindear()) return;

  const dt = frame.previo ? Math.min((ahora - frame.previo) / 1000, 0.1) : 0.016;
  frame.previo = ahora;
  t += dt;

  // Fuerza del viento: nunca se apaga del todo, y las ráfagas la empujan.
  const fuerza = 1 + RAFAGAS * (0.45 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.91 + 1.3));
  giro += dt * 2.2 * VELOCIDAD * Math.max(0.15, fuerza);

  // La dirección también se mueve, y la cabeza la sigue con retardo: eso es lo
  // que da la sensación de que el timón está haciendo fuerza.
  const rumboObjetivo = RUMBO + RAFAGAS * (0.5 * Math.sin(t * 0.23) + 0.22 * Math.sin(t * 0.61 + 2.1));
  rumboActual += (rumboObjetivo - rumboActual) * Math.min(1, dt * 0.9);

  root.setTransformBatch([
    cabeza.nodeId, 0, 1.9, 0, 0, rumboActual, 0,
    aspas.nodeId, 0, 0, -0.34, 0, 0, giro,
  ]);
}

requestAnimationFrame(frame);
console.log('[molino] girando');
