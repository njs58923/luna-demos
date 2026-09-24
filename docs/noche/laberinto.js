// El laberinto: las migas de pan.
//
// Es el script más corto del servidor y hace lo justo: prender faroles y llevar
// la cuenta. No hay animación ni malla dinámica — en un laberinto no hay nada
// que se mueva salvo el visitante, y el motor ya se ocupa de eso.
//
// Lo único que vale la pena mirar acá es que el estado es **del script**: qué
// faroles están prendidos no se le puede preguntar al DOM, porque
// `getAttribute` devuelve lo que decía el HSML y no lo último que se escribió.
// Es la misma lección del planetario, en el caso más chico posible.
const CFG = globalThis.LABERINTO || {};
const N = CFG.faroles || 0;
const root = hiperspace.dimention;

const prendidos = [];
let cuantos = 0;
let panel = {};
let listo = false;
let inicio = 0;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

function reloj() {
  const s = Math.floor((Date.now() - inicio) / 1000);
  const m = Math.floor(s / 60);
  return m + ":" + String(s % 60).padStart(2, "0");
}

function prender(i, el) {
  if (prendidos[i]) return;
  prendidos[i] = true;
  cuantos++;
  el.setAttribute("color", CFG.prendido || "#FFC978");
  texto("l_estado", cuantos + " de " + N + " faroles prendidos · " + reloj());
}

function preparar() {
  for (const id of ["l_estado", "l_meta", "l_semilla"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  const meta = root.getElementById("meta");
  if (!meta) return false;
  for (let i = 0; i < N; i++) {
    const el = root.getElementById("farol_" + i);
    if (!el) return false;
    prendidos.push(false);
    el.addEventListener("toque", (function (k, nodo) {
      return function () { prender(k, nodo); };
    })(i, el));
  }
  meta.addEventListener("toque", function () {
    texto("l_meta", "llegaste en " + reloj() + " con " + cuantos + " de " + N);
  });
  inicio = Date.now();
  console.log("[laberinto] " + CFG.lado + "x" + CFG.lado + ", " + N +
              " faroles, semilla " + CFG.semilla);
  return true;
}

function frame() {
  requestAnimationFrame(frame);
  if (listo) return;
  if (preparar()) listo = true;
}

requestAnimationFrame(frame);
