// El patio: la iluminación, a mano.
//
// Dos cuentas, y las dos son de las que se escriben una vez y se entienden para
// siempre.
//
// **1. Cuánto ilumina el sol a una cara.** Es el producto punto entre la normal
// de la cara y la dirección hacia el sol, recortado en cero. Una cara que mira al
// sol da 1; una de perfil, 0; una de espaldas, negativo, y ahí se recorta. Sobre
// eso va un piso de luz ambiente, que es lo que impide que la cara de atrás quede
// negra — en la realidad la ilumina el rebote de todo lo demás, y acá la ilumina
// una constante.
//
//     luz = ambiente + (1 - ambiente) * max(0, n . s)
//
// **2. Dónde cae la sombra.** El sol está en la dirección `s`; un punto a altura
// `h` proyecta sobre el plano del suelo corriéndose `-h * s.horizontal / s.y`.
// Eso es todo: la sombra de una columna de 4,2 m es una losa que va desde su base
// hasta ese punto, y su largo es la distancia entre los dos.
//
// La consecuencia que no se ve venir es que cuando `s.y` tiende a cero —el sol en
// el horizonte— el largo tiende a infinito. Hay que recortarlo o el patio se llena
// de losas de doscientos metros al amanecer.
//
// Nada de esto es caro. Lo caro sigue siendo escribir: las posiciones de las
// sombras van todas en un `setTransformBatch`, y los colores de las caras sólo
// cuando cambian de tramo, con la misma disciplina de la cueva.
const CFG = globalThis.PATIO || {};
const PUESTOS = CFG.puestos || [];
const CARAS = CFG.caras || [];
const ALTO = CFG.alto || 4.2;
const GRUESO = CFG.grueso || 0.52;
const N = PUESTOS.length;
const root = hiperspace.dimention;

const AMBIENTE = 0.34;      // el piso de luz: el rebote que el motor no simula
const LARGO_MAX = 26;       // recorte de la sombra rasante
const TRAMOS = 12;          // cuántos escalones de brillo se distinguen

/** El color base de la piedra, en RGB, para poder multiplicarlo por la luz. */
const BASE = [0x7A, 0x70, 0x5C];

const caras = [];           // caras[i][k]
const sombras = [];
const pintado = [];         // el tramo de brillo que tiene puesto cada cara
const panel = {};
let nSol = null;

let listo = false;
let previo = 0;
let tic = -1;
let hora = 0.28;            // 0 = amanece, 1 = anochece
let velocidad = 1 / 90;     // vueltas por segundo: un día cada noventa segundos
let conSombras = true;
let repintes = 0;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

function hex(v) {
  const s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
  return s.length < 2 ? "0" + s : s;
}

/** El color de la piedra a un nivel de luz dado. Se calcula por tramo y no por
 *  valor continuo: doce escalones se ven como un degradé y permiten comparar
 *  "¿cambió?" con un entero, que es lo que evita repintar cada frame. */
const paleta = [];
for (let t = 0; t <= TRAMOS; t++) {
  const k = t / TRAMOS;
  paleta.push("#" + hex(BASE[0] * k) + hex(BASE[1] * k) + hex(BASE[2] * k));
}

function preparar() {
  for (const id of ["pa_estado", "pa_dato", "pa_dato2"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  nSol = root.getElementById("sol");
  if (!nSol) return false;
  for (let i = 0; i < N; i++) {
    const cs = [], ps = [];
    for (let k = 0; k < CARAS.length; k++) {
      const el = root.getElementById("cara_" + i + "_" + CARAS[k].id);
      if (!el) return false;
      cs.push(el);
      ps.push(-1);
    }
    caras.push(cs);
    pintado.push(ps);
    const s = root.getElementById("sombra_" + i);
    if (!s) return false;
    sombras.push(s);
  }
  const mandos = {
    pa_lento: function () { velocidad = Math.max(1 / 600, velocidad / 2); },
    pa_rapido: function () { velocidad = Math.min(1 / 8, velocidad * 2); },
    pa_sombras: function () { conSombras = !conSombras; },
  };
  for (const id in mandos) {
    const el = root.getElementById(id);
    if (!el) return false;
    el.addEventListener("toque", mandos[id]);
  }
  console.log("[patio] " + N + " columnas, " + (N * CARAS.length) + " caras, " +
              N + " sombras");
  return true;
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!previo) previo = ahora;
  if (!listo) {
    if (preparar()) listo = true;
    return;
  }
  const dt = Math.min(0.05, (ahora - previo) / 1000);
  previo = ahora;

  hora = (hora + velocidad * dt) % 1;

  // El sol recorre un arco de este a oeste. La altura máxima está fijada a mano
  // porque lo que importa acá no es la astronomía —de eso se ocupa el
  // observatorio— sino tener sombras cortas al mediodía y larguísimas en los
  // bordes.
  const t = hora * Math.PI;              // 0 a pi: de un horizonte al otro
  const sy = Math.sin(t) * 0.92 + 0.02;  // altura del sol, nunca exactamente cero
  const sx = -Math.cos(t);               // sale por un lado y se pone por el otro
  const sz = -0.35 * Math.sin(t);        // un poco de inclinación, o el arco es plano
  const len = Math.hypot(sx, sy, sz);
  const ux = sx / len, uy = sy / len, uz = sz / len;

  const lote = [];
  // El sol, lejos, en la dirección que dice el vector.
  lote.push(nSol.nodeId, ux * 60, uy * 60, uz * 60, 0, 0, 0);

  let cambios = 0;
  for (let i = 0; i < N; i++) {
    // --- las caras -----------------------------------------------------
    for (let k = 0; k < CARAS.length; k++) {
      const c = CARAS[k];
      // El producto punto. La normal de una cara vertical no tiene componente Y,
      // así que la altura del sol no la ilumina de frente nunca — que es
      // exactamente lo que pasa con una pared.
      const d = Math.max(0, c.nx * ux + c.nz * uz);
      const luz = AMBIENTE + (1 - AMBIENTE) * d * (0.35 + 0.65 * uy);
      const tramo = Math.round(Math.max(0, Math.min(1, luz)) * TRAMOS);
      if (tramo !== pintado[i][k]) {
        caras[i][k].setAttribute("color", paleta[tramo]);
        pintado[i][k] = tramo;
        cambios++;
      }
    }

    // --- la sombra -----------------------------------------------------
    const p = PUESTOS[i];
    if (!conSombras || uy <= 0.03) {
      // Sin sol útil no hay sombra. Esconder es encoger, que es lo de siempre.
      lote.push(sombras[i].nodeId, p.x, -1, p.z, 0, 0, 0);
      continue;
    }
    // La proyección: la punta de la columna cae a esta distancia de la base.
    const dx = -ALTO * ux / uy;
    const dz = -ALTO * uz / uy;
    let largo = Math.hypot(dx, dz);
    const recorte = Math.min(1, LARGO_MAX / Math.max(0.001, largo));
    largo *= recorte;
    // La losa va desde la base hasta la punta proyectada: su centro está a mitad
    // de camino, y su rotación es el rumbo de esa dirección.
    const mx = p.x + dx * recorte / 2;
    const mz = p.z + dz * recorte / 2;
    const ry = Math.atan2(dx, dz);
    lote.push(sombras[i].nodeId, mx, 0.015, mz, 0, ry, 0);
    // El largo se escribe con setAttribute, redondeado a cinco centímetros por
    // el mismo motivo que el grosor de la fragua: sin redondear cambia siempre.
    const sl = Math.round(largo * 20) / 20;
    if (sl !== sombras[i].__largo) {
      sombras[i].setAttribute("sz", String(Math.max(0.05, sl)));
      sombras[i].__largo = sl;
      cambios++;
    }
  }
  root.setTransformBatch(lote);
  repintes += cambios;

  const tk = Math.floor(ahora / 250);
  if (tk === tic) return;
  tic = tk;
  const grados = Math.asin(Math.max(-1, Math.min(1, uy))) * 180 / Math.PI;
  texto("pa_dato", "sol a " + grados.toFixed(0) + " grados sobre el horizonte · " +
        "un dia cada " + (1 / velocidad).toFixed(0) + " s" + (conSombras ? "" : " · sombras apagadas"));
  texto("pa_dato2", cambios + " escrituras este frame de " + (N * CARAS.length + N) +
        " posibles · " + repintes + " en total");
}

requestAnimationFrame(frame);
