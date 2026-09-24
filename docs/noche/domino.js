// El dominó: la onda.
//
// Doscientas cuarenta fichas y **un** `setTransformBatch` por frame. Es la
// escena más simple del servidor y por eso la que mejor mide una sola cosa:
// cuánto cuesta mover muchos nodos a la vez.
//
// Lo que se manda por frame no son 240 transformaciones: son las de las fichas
// **que están cayendo**, que a esta velocidad son unas veinte. El resto está
// quieto y no hace falta volver a mandarlo — una transformación que no cambia
// es trabajo tirado en los dos lados del borde JS↔Rust. Por eso el lote se arma
// con una ventana móvil y no con el arreglo entero.
//
// La caída no está simulada. Cada ficha empieza cuando el frente pasa por ella y
// tarda lo mismo en llegar al piso; la curva es un `easeIn` que arranca lento y
// termina rápido, que es como cae algo que gira sobre su base.
const CFG = globalThis.DOMINO || {};
const PUESTOS = CFG.puestos || [];
const N = PUESTOS.length;
const root = hiperspace.dimention;

/** Cuánto tarda el frente en pasar de una ficha a la siguiente, y cuánto tarda
 *  cada ficha en caer. La segunda es más grande que la primera a propósito: por
 *  eso hay siempre una veintena de fichas a mitad de camino, y eso es lo que se
 *  ve como una onda y no como una fila de interruptores. */
const PASO = 0.028;
const CAIDA = 0.42;
const ANGULO = 1.42;   // 81°, un poco menos que acostada: se apoya en la vecina

// `?auto=1` arranca la caída sola a los dos segundos y medio. Está para poder
// verificarla sin manos —una captura no puede tocar nada— y de paso sirve para
// dejar la escena corriendo como demo.
const AUTO = !!CFG.auto;

const nodos = [];
let panel = {};
let cayendo = false;
let t0Caida = 0;
let frenteVisto = -1;
let listo = false;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** Ángulo de la ficha `i` en el tiempo `t` desde que empezó la caída. */
function anguloDe(i, t) {
  const inicio = i * PASO;
  if (t <= inicio) return 0;
  const u = Math.min(1, (t - inicio) / CAIDA);
  // easeIn cúbico: la ficha se despega despacio y se acelera.
  return ANGULO * u * u * (3 - 2 * u) * (0.35 + 0.65 * u);
}

function empujar() {
  if (cayendo) return;
  cayendo = true;
  t0Caida = -1;
  frenteVisto = -1;
  texto("d_ayuda", "");
  texto("d_titulo", "allá va");
}

function levantar() {
  cayendo = false;
  const lote = [];
  for (let i = 0; i < N; i++) {
    const p = PUESTOS[i];
    lote.push(nodos[i].nodeId, p.x, p.y, p.z, 0, p.g, 0);
  }
  root.setTransformBatch(lote);
  texto("d_titulo", "El dominó");
  texto("d_estado", N + " fichas en pie");
  texto("d_ayuda", "tocá el empujador rojo del principio");
  texto("d_fin", "");
}

function preparar() {
  for (const id of ["d_titulo", "d_estado", "d_ayuda", "d_fin"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  const emp = root.getElementById("empujar");
  const lev = root.getElementById("levantar");
  if (!emp || !lev) return false;
  for (let i = 0; i < N; i++) {
    const el = root.getElementById("f_" + i);
    if (!el) return false;
    nodos.push(el);
  }
  emp.addEventListener("toque", empujar);
  lev.addEventListener("toque", levantar);
  if (AUTO) setTimeout(empujar, 2500);
  console.log("[domino] " + N + " fichas, sin mallas dinamicas");
  return true;
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!listo) {
    if (preparar()) listo = true;
    return;
  }
  if (!cayendo) return;
  if (t0Caida < 0) t0Caida = ahora;
  const t = (ahora - t0Caida) / 1000;

  // La ventana: de la primera que todavía se mueve a la última que ya arrancó.
  const frente = Math.min(N - 1, Math.floor(t / PASO));
  const cola = Math.max(0, Math.ceil((t - CAIDA) / PASO));
  const lote = [];
  for (let i = cola; i <= frente; i++) {
    // **La posición va completa en cada entrada.** `setTransformBatch` escribe
    // la transformación local entera, no la parchea: mandar 0,0,0 en la
    // posición —que es lo que se hizo la primera vez— no deja la ficha donde
    // estaba, la teletransporta al origen. Toda la cadena se amontonó en el
    // centro de la mesa y desde arriba parecía que las fichas desaparecían.
    const p = PUESTOS[i];
    lote.push(nodos[i].nodeId, p.x, p.y, p.z, anguloDe(i, t), p.g, 0);
  }
  if (lote.length) root.setTransformBatch(lote);

  if (frente !== frenteVisto) {
    frenteVisto = frente;
    // El contador se escribe cada 8 fichas: `setAttribute` sobre un texto
    // rehace su malla, y hacerlo 240 veces en siete segundos se nota.
    if (frente % 8 === 0 || frente === N - 1) {
      texto("d_estado", (N - frente - 1) + " en pie · " + (frente + 1) + " caídas");
    }
  }
  if (t > (N - 1) * PASO + CAIDA + 0.2) {
    cayendo = false;
    texto("d_titulo", "El dominó");
    texto("d_estado", N + " caídas en " + ((N - 1) * PASO + CAIDA).toFixed(1) + " s");
    texto("d_ayuda", "tocá «levantar todo» para volver a empezar");
    texto("d_fin", "llegó hasta acá");
  }
}

requestAnimationFrame(frame);
