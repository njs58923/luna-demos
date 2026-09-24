// Vuelo y aleteo de la mariposa. Corre dentro del isolate del <include>, con
// permisos vacíos: sólo toca su propio DOM.
//
// El recorrido es una lemniscata (ocho) en el plano XZ más un cabeceo vertical.
// El nodo raíz de la pieza queda donde lo puso el documento que la incluye, así
// que todo esto es local: sirve igual sobre un pedestal que colgando en el aire.
//
// Configurable por instancia: el server inyecta globalThis.CONFIG cuando el
// <include> pide el documento con query params, p. ej.
//     mariposa.hsml?vel=2.1&radio=0.3&fase=1.4
const root = hiperspace.dimention;
const cfg = globalThis.CONFIG || {};

const RADIO = cfg.radio ?? 0.22;      // ancho del ocho, en metros
const ALTO = cfg.alto ?? 0.09;        // amplitud del cabeceo
const BASE = cfg.base ?? 0.22;        // altura de crucero sobre el origen
const VELOCIDAD = cfg.vel ?? 1.7;     // vueltas al ocho: nerviosa, como el bicho real
const ALETEO = cfg.aleteo ?? 26.0;    // rad/s del aleteo (~4 Hz, legible a 60 fps)
const APERTURA = cfg.apertura ?? 0.85; // cuánto sube el ala, en radianes
const FASE = cfg.fase ?? 0;           // para que dos mariposas no vayan iguales

let mariposa = null;
let alaIzq = null;
let alaDer = null;

function bindear() {
  // getElementById devuelve null hasta que el nodo se sincroniza con el host.
  mariposa = mariposa || root.getElementById('mariposa');
  alaIzq = alaIzq || root.getElementById('ala_izq');
  alaDer = alaDer || root.getElementById('ala_der');
  return !!(mariposa && alaIzq && alaDer);
}

let t = FASE;
let anterior = 0;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!bindear()) return;

  const dt = anterior ? Math.min((ahora - anterior) / 1000, 0.1) : 0.016;
  anterior = ahora;
  t += dt;

  const a = t * VELOCIDAD;
  const den = 1 + Math.sin(a) * Math.sin(a);
  // Lemniscata de Gerono: da un ocho sin nudos y sin dividir por cero.
  const x = (RADIO * Math.cos(a)) / den;
  const z = (RADIO * Math.sin(a) * Math.cos(a)) / den;
  const y = BASE + Math.sin(t * 2.6) * ALTO;

  // Derivada aproximada para que mire hacia donde va (el frente es -z).
  const paso = 0.02;
  const a2 = a + paso;
  const den2 = 1 + Math.sin(a2) * Math.sin(a2);
  const dx = (RADIO * Math.cos(a2)) / den2 - x;
  const dz = (RADIO * Math.sin(a2) * Math.cos(a2)) / den2 - z;
  const ry = Math.atan2(-dx, -dz);

  // Aleteo: rápido hacia arriba, un poco más suelto hacia abajo.
  const flap = APERTURA * (0.35 + 0.65 * Math.sin(t * ALETEO));
  const alabeo = Math.sin(t * VELOCIDAD * 2) * 0.18;

  // Una sola op por frame para los tres nodos.
  root.setTransformBatch([
    mariposa.nodeId, x, y, z, 0, ry, alabeo,
    alaIzq.nodeId, 0, 0, 0, 0, 0, -flap,
    alaDer.nodeId, 0, 0, 0, 0, 0, flap,
  ]);
}

requestAnimationFrame(frame);
console.log('[mariposa] volando');
