// Animación de ambiente mínima: k cajas orbitando, un setTransformBatch por
// frame. Es la forma más barata que se puede escribir, a propósito — lo que se
// mide en el caso `animados` es cuántos isolates aguanta el motor, no cuánto
// cuesta un script pesado. Si el script hiciera algo interesante, el número
// mediría el script.
//
// animado.hsml es un archivo fijo con 8 cajas; lo único que cambia entre un
// include y otro es la fase, que llega en su propia query (?fase=): cada
// include tiene su isolate y su location.
const K = 8;
const FASE = Number(new URLSearchParams(location.search).get("fase")) || 0;
const RADIO = 1.5; // 3 lados de caja

const root = hiperspace.dimention;

const nodos = [];
let listo = false;

function preparar() {
  for (let i = 0; i < K; i++) {
    const el = root.getElementById("a" + i);
    if (!el) return false; // todavía no se sincronizó el DOM
    nodos.push({ el: el, fase: FASE + (i * 6.283) / K, vel: 0.8 + (i % 5) * 0.2 });
  }
  return true;
}

let t = FASE;
let anterior = 0;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!listo) {
    listo = preparar();
    if (!listo) return;
  }

  const dt = anterior ? Math.min((ahora - anterior) / 1000, 0.1) : 0.016;
  anterior = ahora;
  t += dt;

  const batch = [];
  for (const nd of nodos) {
    const a = nd.fase + t * nd.vel;
    batch.push(nd.el.nodeId, Math.cos(a) * RADIO, Math.sin(a * 0.7) * RADIO * 0.4, Math.sin(a) * RADIO, 0, a, 0);
  }
  if (batch.length) root.setTransformBatch(batch);
}

requestAnimationFrame(frame);
