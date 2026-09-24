// Fogata. Las llamas están declaradas en el HSML; las chispas las crea este
// script y se reciclan (nunca se borran: se reubican abajo cuando se apagan).
//
// Configurable por instancia: el server inyecta globalThis.CONFIG cuando el
// <include> pide el documento con query params, p. ej.
//     fogata.hsml?escala=1.3&chispas=16&viento=0.4
const root = hiperspace.dimention;
const cfg = globalThis.CONFIG || {};

const ESCALA = cfg.escala ?? 1.0;      // tamaño general de la llamarada
const CHISPAS = Math.max(0, Math.min(40, cfg.chispas ?? 10));
const VIENTO = cfg.viento ?? 0.25;     // deriva lateral de la chispa, m/s
const VELOCIDAD = cfg.vel ?? 1.0;      // ritmo del titileo
const SUBIDA = cfg.subida ?? 0.55;     // cuánto sube una chispa por segundo
const ALTURA_CHISPA = cfg.alturaChispa ?? 1.5;

const llamas = [];
const chispas = [];
let listo = false;

function azar(min, max) {
  return min + Math.random() * (max - min);
}

function nacer(chispa) {
  chispa.x = azar(-0.09, 0.09);
  chispa.y = azar(0.15, 0.3);
  chispa.z = azar(-0.09, 0.09);
  chispa.vx = azar(-0.05, 0.05);
  chispa.vz = azar(-0.05, 0.05);
  chispa.vy = SUBIDA * azar(0.7, 1.4);
  chispa.giro = azar(0, 6.28);
}

// Tal como están declaradas en el HSML: ancho, alto y la y de su centro. Las
// de más arriba titilan más, que es lo que hace la punta de una llama.
const CAPAS = [
  { id: 'llama_0', x: 0.36, y: 0.3, cy: 0.15, nervio: 0.6, giro: 0 },
  { id: 'llama_1', x: 0.25, y: 0.26, cy: 0.39, nervio: 0.9, giro: 0 },
  { id: 'llama_2', x: 0.12, y: 0.2, cy: 0.58, nervio: 1.3, giro: 0 },
  { id: 'llama_3', x: 0.3, y: 0.26, cy: 0.13, nervio: 0.7, giro: 1.5707963 },
  { id: 'llama_4', x: 0.2, y: 0.22, cy: 0.35, nervio: 1.0, giro: 1.5707963 },
  { id: 'llama_5', x: 0.1, y: 0.17, cy: 0.51, nervio: 1.4, giro: 1.5707963 },
  { id: 'llama_n', x: 0.3, y: 0.36, cy: 0.17, nervio: 0.5, giro: 0, esfera: true },
];

function preparar() {
  for (const capa of CAPAS) {
    const el = root.getElementById(capa.id);
    if (!el) return false; // todavía no se sincronizó
    llamas.push({ el, base: capa, fase: llamas.length * 1.7 });
  }

  for (let i = 0; i < CHISPAS; i++) {
    // createElement devuelve un nodo pendiente (nodeId < 0): se resuelve solo
    // unos ticks después, por eso más abajo se saltea hasta que tenga id.
    const el = root.createElement('box');
    el.setAttribute('color', i % 3 === 0 ? '#F6CE63' : '#EE8C22');
    const lado = azar(0.018, 0.032) * ESCALA;
    el.scale = { x: lado, y: lado, z: lado };
    root.appendChild(el);
    const chispa = { el, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, giro: 0 };
    nacer(chispa);
    chispa.y = azar(0.2, ALTURA_CHISPA); // arrancan repartidas, no todas juntas
    chispas.push(chispa);
  }
  return true;
}

let t = 0;
let anterior = 0;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!listo) {
    listo = preparar();
    if (!listo) return;
  }

  const dt = anterior ? Math.min((ahora - anterior) / 1000, 0.1) : 0.016;
  anterior = ahora;
  t += dt * VELOCIDAD;

  const batch = [];

  // Titileo: dos senos de distinta frecuencia para que no se note el ciclo, y
  // más nervio cuanto más arriba está la capa.
  llamas.forEach((l, i) => {
    const b = l.base;
    const pulso = 1 + b.nervio * (0.2 * Math.sin(t * (7.5 + i * 1.9) + l.fase)
      + 0.09 * Math.sin(t * (3.1 + i * 0.7)));
    const alto = b.y * pulso * ESCALA;
    const ancho = b.x * (2 - pulso) * ESCALA;
    // La escala no entra en setTransformBatch: va por el proxy vivo.
    l.el.scale = b.esfera
      ? { x: ancho, y: alto, z: ancho }
      : { x: ancho, y: alto, z: 1 };
    // Cada capa se apoya en su base, así que sube la mitad de lo que creció.
    batch.push(
      l.el.nodeId,
      Math.sin(t * 2.3 + l.fase) * 0.025 * b.nervio * ESCALA,
      (b.cy + (alto - b.y * ESCALA) / 2) * ESCALA,
      Math.cos(t * 1.9 + l.fase) * 0.02 * b.nervio * ESCALA,
      0, b.giro + Math.sin(t * 1.7 + l.fase) * 0.1, 0,
    );
  });

  for (const c of chispas) {
    if (c.el.nodeId < 0) continue; // nodo pendiente: todavía no existe en el host

    c.vy -= dt * 0.12;             // pierde empuje a medida que se enfría
    c.x += (c.vx + VIENTO * 0.4) * dt;
    c.z += c.vz * dt;
    c.y += c.vy * dt;
    c.giro += dt * 3.4;
    if (c.y > ALTURA_CHISPA * ESCALA || c.vy < -0.15) nacer(c);

    batch.push(
      c.el.nodeId,
      c.x * ESCALA + Math.sin(c.giro) * 0.03,
      c.y * ESCALA,
      c.z * ESCALA + Math.cos(c.giro * 0.8) * 0.03,
      c.giro, c.giro * 0.7, 0,
    );
  }

  if (batch.length) root.setTransformBatch(batch);
}

requestAnimationFrame(frame);
console.log('[fogata] encendida, chispas:', CHISPAS);
