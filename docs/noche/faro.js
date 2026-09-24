// El faro: el haz.
//
// Es el script más corto que hace algo: gira un solo nodo. Pero el nodo es un
// prisma de 180 m, y eso trae una consecuencia que no tiene ninguna otra escena
// — el haz **sale del área de la isla**, así que hay que asegurarse de que el
// mar llegue más lejos que él o se ve el haz flotando sobre la nada.
//
// La velocidad es la de un faro de verdad: una vuelta cada seis segundos. Más
// rápido se lee como una baliza de policía, más lento no se percibe que gira.
const CFG = globalThis.FARO || {};
const T = CFG.torre || {};
const root = hiperspace.dimention;

const VUELTA = 6;   // segundos por vuelta
let girando = true;
let theta = 0;
let lampara = null;
const panel = {};
let listo = false;
let previo = 0;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!previo) previo = ahora;

  if (!listo) {
    lampara = root.getElementById("lampara");
    const boton = root.getElementById("girar");
    if (!lampara || !boton) return;
    for (const id of ["fa_dato", "fa_modo"]) {
      const el = root.getElementById(id);
      if (!el) return;
      panel[id] = el;
    }
    boton.addEventListener("toque", function () {
      girando = !girando;
      texto("fa_modo", girando ? "parar el haz" : "girar el haz");
    });
    listo = true;
    console.log("[faro] " + T.alto + " m, " + T.escalones + " escalones");
    return;
  }

  const dt = Math.min(0.05, (ahora - previo) / 1000);
  previo = ahora;
  if (!girando) return;
  theta += (dt / VUELTA) * Math.PI * 2;
  // La lámpara está adentro del grupo de la linterna, a 1,6 m de su origen: la
  // posición va completa porque el batch escribe la transformación entera.
  root.setTransformBatch([lampara.nodeId, 0, 1.6, 0, 0, theta, 0]);
}

requestAnimationFrame(frame);
