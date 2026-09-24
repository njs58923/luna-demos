// El billar: restricciones, no fuerzas.
//
// La bandada simula con **empujes**: nadie choca con nadie, las aves se esquivan
// porque una fuerza las separa antes de llegar. Es fácil de escribir y perdona
// todo, porque si dos se acercan demasiado la fuerza crece y las devuelve.
//
// El billar no perdona nada. Dos bolas no se pueden acercar más de un diámetro, y
// eso no es una fuerza sino una **condición dura**. Hacen falta tres cosas
// distintas, y saltearse cualquiera de ellas rompe la escena de una forma que se
// ve enseguida:
//
//   1. detectar    encontrar los pares que se solapan
//   2. responder   cambiar las velocidades por el choque elástico
//   3. separar     empujar las posiciones hasta que dejen de solaparse
//
// La tercera es la que todo el mundo olvida. Sin ella, dos bolas que se tocan
// quedan solapadas al frame siguiente, vuelven a chocar, y se quedan pegadas
// vibrando en el lugar. El choque no termina hasta que se sacan de encima.
//
// La cuenta del choque en sí es corta. Sobre la línea que une los centros —la
// normal— las dos bolas intercambian su componente de velocidad; en la dirección
// perpendicular no pasa nada. Con masas iguales el intercambio es literal, y por
// eso una bola que le pega de lleno a otra parada queda clavada y la otra se va
// con toda la velocidad. Eso no es una licencia: es lo que pasa en una mesa.
const CFG = globalThis.BILLAR || {};
const LARGO = CFG.largo || 5, ANCHO = CFG.ancho || 2.5;
const ALTO = CFG.alto || 0.95, RB = CFG.radio || 0.075;
const BUCHACAS = CFG.buchacas || [];
const N = (CFG.bolas || []).length;
const root = hiperspace.dimention;

const ROCE = 0.42;        // frenado por segundo, proporcional a la velocidad
const QUIETA = 0.035;     // por debajo de esto se considera parada
const REBOTE = 0.92;      // lo que devuelve la banda
const RBUCHACA = 0.15;

const px = new Float64Array(N), pz = new Float64Array(N);
const vx = new Float64Array(N), vz = new Float64Array(N);
const dentro = new Uint8Array(N);   // 1 = embocada
const nodos = [];
const panel = {};

let listo = false;
let previo = 0;
let tic = -1;
let choques = 0;
let embocadas = 0;
let tiros = 0;
let ronda = 0;
let proxima = 0;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** El triángulo de las quince, y la blanca en su punto. El armado es el de
 *  verdad: filas de 1, 2, 3, 4 y 5, con la separación justa para que no se
 *  solapen — si arrancan solapadas, el paso de separación las escupe y el saque
 *  parece una explosión. */
function armar() {
  const sep = RB * 2.02;
  px[0] = -LARGO * 0.28; pz[0] = 0;
  vx[0] = 0; vz[0] = 0; dentro[0] = 0;
  let k = 1;
  const x0 = LARGO * 0.18;
  for (let fila = 0; fila < 5 && k < N; fila++) {
    for (let j = 0; j <= fila && k < N; j++) {
      px[k] = x0 + fila * sep * 0.87;
      pz[k] = (j - fila / 2) * sep;
      vx[k] = 0; vz[k] = 0; dentro[k] = 0;
      k++;
    }
  }
  choques = 0; embocadas = 0;
}

function tirar() {
  // Si la blanca está embocada vuelve a su punto: es lo que hace la mesa.
  if (dentro[0]) {
    dentro[0] = 0;
    px[0] = -LARGO * 0.28; pz[0] = 0;
  }
  // Un poco de ángulo al azar en cada saque. Con el tiro siempre igual el
  // triángulo se abre siempre igual, y lo que la escena quiere mostrar es
  // justamente que no hay dos aperturas iguales.
  const ang = (Math.random() - 0.5) * 0.09;
  const fuerza = 7.5 + Math.random() * 2.5;
  vx[0] = Math.cos(ang) * fuerza;
  vz[0] = Math.sin(ang) * fuerza;
  tiros++;
  texto("bi_estado", "tiro " + tiros);
}

function preparar() {
  for (const id of ["bi_estado", "bi_dato", "bi_dato2"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  for (let i = 0; i < N; i++) {
    const el = root.getElementById("bola_" + i);
    if (!el) return false;
    nodos.push(el);
  }
  const t = root.getElementById("tirar");
  const r = root.getElementById("rearmar");
  if (!t || !r) return false;
  t.addEventListener("toque", function () { ronda = -1; tirar(); });
  r.addEventListener("toque", function () { ronda = -1; armar(); tiros = 0; texto("bi_estado", "rearmada"); });
  armar();
  console.log("[billar] " + N + " bolas, " + (N * (N - 1) / 2) + " pares por frame, mesa " +
              LARGO + "x" + ANCHO);
  return true;
}

/** ¿Se movió algo? Sirve para saber cuándo terminó el tiro. */
function enMovimiento() {
  for (let i = 0; i < N; i++) {
    if (!dentro[i] && (vx[i] * vx[i] + vz[i] * vz[i]) > QUIETA * QUIETA) return true;
  }
  return false;
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!previo) previo = ahora;
  if (!listo) {
    if (preparar()) listo = true;
    return;
  }
  // El paso fijo no es un lujo: con dt variable, un frame largo deja que dos
  // bolas se atraviesen sin llegar a solaparse nunca y el choque no se detecta.
  // A 1/120 y con bolas de 15 cm haría falta que una fuera a 18 m/s para saltear
  // el contacto, y el saque más fuerte va a diez.
  const paso = 1 / 120;
  let resto = Math.min(0.05, (ahora - previo) / 1000);
  previo = ahora;

  while (resto > 0) {
    const dt = Math.min(paso, resto);
    resto -= dt;

    for (let i = 0; i < N; i++) {
      if (dentro[i]) continue;
      // El roce del paño: proporcional a la velocidad, que es lo que da la
      // frenada larga y suave del billar. Un roce constante frena parejo y las
      // bolas se detienen todas juntas, que se ve mal.
      const k = Math.max(0, 1 - ROCE * dt);
      vx[i] *= k; vz[i] *= k;
      const v2 = vx[i] * vx[i] + vz[i] * vz[i];
      if (v2 < QUIETA * QUIETA) { vx[i] = 0; vz[i] = 0; }
      px[i] += vx[i] * dt;
      pz[i] += vz[i] * dt;
    }

    // --- las bandas -----------------------------------------------------
    // Reflejar es invertir la componente normal y devolver la posición al lado
    // de adentro. Lo segundo es tan necesario como lo primero: sin corregir la
    // posición, la bola queda pasada de la banda y rebota otra vez en el frame
    // siguiente, quedándose atrapada en el borde.
    const lx = LARGO / 2 - RB, lz = ANCHO / 2 - RB;
    for (let i = 0; i < N; i++) {
      if (dentro[i]) continue;
      if (px[i] < -lx) { px[i] = -lx; vx[i] = Math.abs(vx[i]) * REBOTE; }
      else if (px[i] > lx) { px[i] = lx; vx[i] = -Math.abs(vx[i]) * REBOTE; }
      if (pz[i] < -lz) { pz[i] = -lz; vz[i] = Math.abs(vz[i]) * REBOTE; }
      else if (pz[i] > lz) { pz[i] = lz; vz[i] = -Math.abs(vz[i]) * REBOTE; }
    }

    // --- las bolas entre sí ---------------------------------------------
    for (let i = 0; i < N; i++) {
      if (dentro[i]) continue;
      for (let j = i + 1; j < N; j++) {
        if (dentro[j]) continue;
        const dx = px[j] - px[i], dz = pz[j] - pz[i];
        const d2 = dx * dx + dz * dz;
        const min = RB * 2;
        if (d2 >= min * min || d2 < 1e-12) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;

        // (3) SEPARAR. Va primero porque si no se hace, el choque de este frame
        // se repite en el siguiente y las bolas se quedan pegadas vibrando.
        // Cada una se corre la mitad del solapamiento.
        const solape = (min - d) / 2;
        px[i] -= nx * solape; pz[i] -= nz * solape;
        px[j] += nx * solape; pz[j] += nz * solape;

        // (2) RESPONDER. Sobre la normal, las dos intercambian su componente de
        // velocidad; en la tangente no pasa nada. Con masas iguales el
        // intercambio es literal — por eso una bola de lleno queda clavada.
        const vi = vx[i] * nx + vz[i] * nz;
        const vj = vx[j] * nx + vz[j] * nz;
        if (vi - vj <= 0) continue;   // ya se están separando: no hay choque
        const cambio = vi - vj;
        vx[i] -= cambio * nx; vz[i] -= cambio * nz;
        vx[j] += cambio * nx; vz[j] += cambio * nz;
        choques++;
      }
    }

    // --- las buchacas ---------------------------------------------------
    for (let i = 0; i < N; i++) {
      if (dentro[i]) continue;
      for (let b = 0; b < BUCHACAS.length; b++) {
        const dx = px[i] - BUCHACAS[b][0], dz = pz[i] - BUCHACAS[b][1];
        if (dx * dx + dz * dz < RBUCHACA * RBUCHACA) {
          dentro[i] = 1;
          vx[i] = 0; vz[i] = 0;
          embocadas++;
          break;
        }
      }
    }
  }

  // Todo el estado en un lote. Las embocadas se mandan abajo de la mesa, que es
  // donde irían: esconder es mover, no hay atributo para dejar de ver un nodo.
  const lote = [];
  for (let i = 0; i < N; i++) {
    lote.push(nodos[i].nodeId,
      dentro[i] ? BUCHACAS[0][0] : px[i],
      dentro[i] ? ALTO - 0.6 : ALTO + RB,
      dentro[i] ? BUCHACAS[0][1] + i * 0.17 - 1.3 : pz[i],
      0, 0, 0);
  }
  root.setTransformBatch(lote);

  // La ronda sola: una mesa quieta no muestra nada. Tira sola hasta que alguien
  // toque el taco, y espera a que se detenga todo antes del tiro siguiente.
  if (ronda >= 0 && !enMovimiento()) {
    if (!proxima) proxima = ahora + 1400;
    if (ahora >= proxima) {
      proxima = 0;
      if (embocadas >= 8 || tiros >= 6) { armar(); tiros = 0; }
      else tirar();
      ronda++;
    }
  }

  const t = Math.floor(ahora / 250);
  if (t === tic) return;
  tic = t;
  const andando = enMovimiento();
  texto("bi_dato", choques + " choques resueltos · " + embocadas +
        (embocadas === 1 ? " embocada" : " embocadas"));
  texto("bi_dato2", andando ? "la mesa esta viva" : "todo quieto — el roce del paño la paró");
}

requestAnimationFrame(frame);
