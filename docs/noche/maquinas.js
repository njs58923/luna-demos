// La sala de máquinas: la cinemática.
//
// Un solo grado de libertad —el ángulo del cigüeñal— y todo lo demás sale de ahí.
//
//   El codo del pistón `i` está en (x_i, e + r·sin θ_i, r·cos θ_i), donde θ_i
//   lleva su propio desfase: en un motor de cuatro tiempos los codos van a 0°,
//   180°, 180° y 0°, y eso es lo que hace que los pistones suban y bajen de a
//   pares en vez de todos juntos.
//
//   El pistón está sobre el eje del cilindro, a la altura que deja la biela:
//
//       y = e + r·sin θ + sqrt( L² − (r·cos θ)² )
//
//   que es la ecuación de biela-manivela de siempre. La raíz es la parte que
//   importa: es lo que hace que la subida y la bajada **no sean simétricas**, y
//   por eso un pistón no se mueve como un seno.
//
// Y la biela, que es el caso interesante: no se puede animar con una rotación.
// Hay que ponerla **en el punto medio** de sus dos extremos y girarla el ángulo
// que los une. El largo es fijo — si la biela se estira, deja de ser una biela.
const CFG = globalThis.MAQUINAS || {};
const M = CFG.M || {};
const X0 = CFG.x0 || 0;
const root = hiperspace.dimention;

/** Las marchas: vueltas por segundo del cigüeñal. */
const MARCHAS = [0, 0.35, 0.9, 1.8];
const NOMBRE = ["parada", "al ralentí", "en marcha", "a todo vapor"];
// `?marcha=2` arranca la máquina ya andando. Está para poder verla en marcha en
// una captura —que no puede tocar la palanca— y de paso sirve como demo.
let marcha = Math.max(0, Math.min(MARCHAS.length - 1, CFG.marcha | 0));
let theta = 0;          // ángulo del cigüeñal, en radianes
let vueltas = 0;

const pistones = [];
const bielas = [];
let cigue = null;
let volante = null;
let brazoA = null;
let brazoB = null;
let palanca = null;
const panel = {};
let listo = false;
let previo = 0;
let tic = -1;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** Desfase del codo `i`. Cuatro tiempos: 0, 180, 180, 0. Con todos en fase la
 *  máquina se ve como un juguete; desfasados, se ve como un motor. */
function desfase(i) {
  return (i === 1 || i === 2) ? Math.PI : 0;
}

function preparar() {
  cigue = root.getElementById("cigue");
  volante = root.getElementById("volante");
  brazoA = root.getElementById("brazo_a");
  brazoB = root.getElementById("brazo_b");
  palanca = root.getElementById("palanca");
  if (!cigue || !volante || !brazoA || !brazoB || !palanca) return false;
  for (const id of ["m_titulo", "m_estado", "m_dato", "m_vueltas"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  for (let i = 0; i < M.pistones; i++) {
    const p = root.getElementById("piston_" + i);
    const b = root.getElementById("biela_" + i);
    if (!p || !b) return false;
    pistones.push(p);
    bielas.push(b);
  }
  palanca.addEventListener("toque", function () {
    marcha = (marcha + 1) % MARCHAS.length;
    texto("m_estado", NOMBRE[marcha]);
    texto("m_dato", marcha === 0 ? "tocá la palanca"
          : (MARCHAS[marcha] * 60).toFixed(0) + " vueltas por minuto");
  });
  texto("m_estado", NOMBRE[marcha]);
  texto("m_dato", marcha === 0 ? "tocá la palanca"
        : (MARCHAS[marcha] * 60).toFixed(0) + " vueltas por minuto");
  console.log("[maquinas] " + M.pistones + " pistones, un grado de libertad, marcha " + marcha);
  return true;
}

function mover(dt) {
  const w = MARCHAS[marcha] * Math.PI * 2;
  theta += w * dt;
  if (theta > Math.PI * 2) {
    theta -= Math.PI * 2;
    vueltas++;
  }

  const lote = [];
  lote.push(cigue.nodeId, 0, M.eje, 0, theta, 0, 0);
  // El volante gira con el eje pero está corrido en X: su posición va completa
  // en el lote, porque el batch escribe la transformación entera.
  lote.push(volante.nodeId, X0 - M.paso * 1.15, M.eje, 0, theta, 0, 0);

  for (let i = 0; i < M.pistones; i++) {
    const th = theta + desfase(i);
    const x = X0 + i * M.paso;
    // Codo: el muñón donde se engancha la biela, en el plano YZ.
    const cy = M.eje + M.manivela * Math.sin(th);
    const cz = M.manivela * Math.cos(th);
    // Pistón: sobre el eje del cilindro (z = 0), a la altura que deja la biela.
    const raiz = Math.sqrt(Math.max(0, M.biela * M.biela - cz * cz));
    const py = cy + raiz;
    lote.push(pistones[i].nodeId, x, py, 0, 0, 0, 0);

    // La biela: punto medio de los dos extremos, y el ángulo que los une.
    // Se gira en **X** porque el plano de trabajo es YZ, y la barra se dibuja a
    // lo largo de Y, así que el ángulo se mide desde el eje Y.
    const mx = x;
    const my = (cy + py) / 2;
    const mz = cz / 2;
    const ang = Math.atan2(cz, cy - py);
    lote.push(bielas[i].nodeId, mx, my, mz, ang, 0, 0);
  }

  // El regulador: los brazos abren con el cuadrado de la velocidad, que es lo
  // que hace de verdad un regulador centrífugo.
  const abre = Math.min(1, (MARCHAS[marcha] / MARCHAS[MARCHAS.length - 1]) ** 2);
  const gr = theta * 1.6;
  const ex = X0 + M.pistones * M.paso + 0.4;
  lote.push(brazoA.nodeId, 0, 0, 0, 0, gr, -abre * 0.55);
  lote.push(brazoB.nodeId, 0, 0, 0, 0, gr, abre * 0.55);
  void ex;

  // La palanca acompaña la marcha: es la única señal de estado que se ve desde
  // el otro lado de la sala.
  lote.push(palanca.nodeId, 0, 1.28, 0, 0, 0, 0.35 - marcha * 0.23);

  root.setTransformBatch(lote);
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
  mover(dt);

  const paso = Math.floor(ahora / 500);
  if (paso === tic) return;
  tic = paso;
  texto("m_vueltas", vueltas === 0 ? "" : vueltas + " vueltas desde que arrancó");
}

requestAnimationFrame(frame);
