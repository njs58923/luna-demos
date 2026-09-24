// La fragua: el color como dato, y el volumen que hay que sostener a mano.
//
// Dos cosas pasan acá que no pasaron en ninguna otra escena.
//
// **Primera: el color es el estado.** El motor no sabe qué es la temperatura, así
// que la barra guarda un número por eslabón y se pinta con la escala del herrero
// —negro, rojo oscuro, cereza, naranja, amarillo, blanco— que es la misma que se
// usa en un taller para saber si el metal está listo. No hay ningún medidor: el
// color *es* el medidor, igual que en la realidad.
//
// **Segunda: martillar tiene que conservar el volumen.** Aplastar un eslabón es
// bajarle el grosor, y si eso es todo lo que pasa, la barra se adelgaza y se ve
// como si se encogiera. Un herrero no saca material: lo mueve. Así que cada golpe
// le baja el grosor al eslabón y les pasa a los vecinos exactamente lo que le
// sacó, en la forma que puedan aceptarlo. La barra se afina donde se pega y se
// engorda al lado, que es lo que hace que aplastar se lea como **forjar**.
//
// Y la regla del herrero, que es lo que hace que la escena tenga algo que perder:
// el hierro frío no se deforma. Se puede martillar todo lo que uno quiera; si no
// está al rojo, no pasa nada.
const CFG = globalThis.FRAGUA || {};
const N = CFG.eslabones || 16;
const PASO = CFG.paso || 0.14;
const FUEGO = CFG.fuego || [{ t: 0, color: "#888888", nombre: "?" }];
const BR = CFG.brasas || { filas: 7, cols: 5 };
const root = hiperspace.dimention;

const GRUESO0 = 0.13;
const ENFRIA = 0.055;     // por segundo, cuando está fuera del fuego
const CALIENTA = 0.42;    // por segundo, con el fuelle soplando
const REPARTE = 0.9;      // cuánto se difunde el calor entre vecinos, por segundo
const FORJABLE = 0.3;     // por debajo de esto el hierro no cede

const temp = new Float64Array(N);
const grueso = new Float64Array(N);
const pintado = new Int8Array(N);   // el tramo de la escala que tiene puesto
const anchoPintado = new Float64Array(N);

const esl = [];
const brasas = [];
const panel = {};
let nMartillo = null, nTapa = null, nBarra = null;

let listo = false;
let previo = 0;
let tic = -1;

let enFuego = false;
let soplando = 0;         // segundos que queda soplando
let golpe = -1;           // eslabón golpeado, para la animación del martillo
let golpeT = 0;
let golpes = 0;
let ronda = 0;
let proxima = 0;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** De temperatura a color. Devuelve el índice del tramo, no el color: el índice
 *  es lo que se compara para no repintar de gusto. Es la misma disciplina de la
 *  cueva — cada frame se calcula el estado entero, y sólo se escribe el delta. */
function tramo(t) {
  let k = 0;
  for (let i = 0; i < FUEGO.length; i++) if (t >= FUEGO[i].t) k = i;
  return k;
}

function reiniciar() {
  for (let i = 0; i < N; i++) {
    temp[i] = 0;
    grueso[i] = GRUESO0;
    pintado[i] = -1;
    anchoPintado[i] = -1;
  }
  golpes = 0;
  enFuego = false;
  texto("fr_estado", "hierro frio, sin forma");
}

/** El martillazo. Todo lo interesante de la escena está en estas quince líneas. */
function martillar(i) {
  golpe = i;
  golpeT = 0;
  // El hierro frío no cede. Es la regla que le da sentido al fuelle: sin esto,
  // la fragua sobra y la escena es un botón que achata cosas.
  if (temp[i] < FORJABLE) {
    texto("fr_estado", "el hierro esta frio — no cede");
    return;
  }
  golpes++;
  // Cuanto más caliente, más cede. A punto de quemarse cede casi todo.
  const cede = 0.1 + (temp[i] - FORJABLE) / (1 - FORJABLE) * 0.22;
  const antes = grueso[i];
  grueso[i] = Math.max(0.03, grueso[i] * (1 - cede));
  const sacado = antes - grueso[i];

  // Y acá está el punto: lo que se le saca **no desaparece**, se reparte entre
  // los vecinos. Sin esto la barra adelgaza y parece que se encoge; con esto se
  // afina donde se pega y se engorda al lado, que es lo que hace un herrero.
  const izq = i - 1, der = i + 1;
  const vecinos = [];
  if (izq >= 0) vecinos.push(izq);
  if (der < N) vecinos.push(der);
  if (vecinos.length) {
    const cada = sacado / vecinos.length;
    for (const v of vecinos) grueso[v] = Math.min(GRUESO0 * 2.2, grueso[v] + cada);
  }
  // Golpear enfría: el yunque se lleva calor, y por eso hay que volver al fuego.
  temp[i] = Math.max(0, temp[i] - 0.07);
  texto("fr_estado", "golpe " + golpes + " en el eslabon " + i);
}

function preparar() {
  for (const id of ["fr_estado", "fr_temp", "fr_dato"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  for (let i = 0; i < N; i++) {
    const el = root.getElementById("esl_" + i);
    if (!el) return false;
    esl.push(el);
    el.addEventListener("toque", (function (j) {
      return function () { ronda = -1; martillar(j); };
    })(i));
  }
  for (let i = 0; i < BR.filas; i++) {
    for (let j = 0; j < BR.cols; j++) {
      const el = root.getElementById("brasa_" + i + "_" + j);
      if (!el) return false;
      brasas.push({ el, fase: (i * 7 + j * 13) % 100 / 100, pintado: -1 });
    }
  }
  nMartillo = root.getElementById("martillo");
  nTapa = root.getElementById("tapa");
  nBarra = root.getElementById("barra");
  if (!nMartillo || !nTapa || !nBarra) return false;

  const s = root.getElementById("soplar");
  const f = root.getElementById("alfuego");
  const t = root.getElementById("templar");
  if (!s || !f || !t) return false;
  s.addEventListener("toque", function () { ronda = -1; soplando = 2.2; });
  f.addEventListener("toque", function () {
    ronda = -1;
    enFuego = !enFuego;
    texto("fr_estado", enFuego ? "la barra esta en el fuego" : "la barra volvio al yunque");
  });
  t.addEventListener("toque", function () { ronda = -1; reiniciar(); });
  reiniciar();
  console.log("[fragua] " + N + " eslabones, " + brasas.length + " brasas");
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
  if (soplando > 0) soplando = Math.max(0, soplando - dt);

  // --- el calor ---------------------------------------------------------
  // Calienta el fuego, enfría el aire, y el calor se reparte a lo largo de la
  // barra. Lo tercero es lo que hace que una punta caliente no quede como un
  // escalón: el hierro conduce, y sin conducción la barra parece pintada a
  // manchas en vez de calentada.
  const soplo = soplando > 0 ? 1 : 0.28;
  for (let i = 0; i < N; i++) {
    if (enFuego) temp[i] += CALIENTA * soplo * dt;
    else temp[i] -= ENFRIA * dt;
    temp[i] = Math.max(0, Math.min(1, temp[i]));
  }
  const copia = Float64Array.from(temp);
  for (let i = 0; i < N; i++) {
    const a = copia[i - 1] !== undefined ? copia[i - 1] : copia[i];
    const b = copia[i + 1] !== undefined ? copia[i + 1] : copia[i];
    temp[i] += ((a + b) / 2 - copia[i]) * Math.min(1, REPARTE * dt);
  }

  // --- lo que se escribe ------------------------------------------------
  // Un `setAttribute` por eslabón y por atributo, y sólo si cambió. Con dieciséis
  // eslabones se podría escribir todo cada frame sin que se note, pero la regla
  // ya está probada en la cueva y no hay motivo para romperla acá.
  for (let i = 0; i < N; i++) {
    const k = tramo(temp[i]);
    if (k !== pintado[i]) {
      esl[i].setAttribute("color", FUEGO[k].color);
      pintado[i] = k;
    }
    // El grosor se escribe redondeado a medio milímetro: sin eso, la difusión de
    // calor genera cambios de la séptima cifra y se repinta todo, todo el tiempo.
    const g = Math.round(grueso[i] * 2000) / 2000;
    if (g !== anchoPintado[i]) {
      esl[i].setAttribute("sy", String(g));
      esl[i].setAttribute("sz", String(g));
      anchoPintado[i] = g;
    }
  }

  // Las brasas: laten con una fase por brasa, y suben cuando se sopla.
  const vida = soplando > 0 ? 1 : 0.45;
  for (let b = 0; b < brasas.length; b++) {
    const br = brasas[b];
    const v = vida * (0.55 + 0.45 * Math.sin(ahora * 0.004 + br.fase * 6.283));
    const k = tramo(Math.min(1, v));
    if (k !== br.pintado) {
      br.el.setAttribute("color", FUEGO[k].color);
      br.pintado = k;
    }
  }

  // --- lo que se mueve --------------------------------------------------
  const lote = [];
  // El martillo: sube y baja de golpe. Va a la posición del eslabón golpeado.
  if (golpe >= 0) {
    golpeT += dt;
    const u = Math.min(1, golpeT / 0.28);
    // Sube rápido y baja más rápido: la curva del golpe no es simétrica.
    const alto = u < 0.45 ? 1 - u / 0.45 : (u - 0.45) / 0.55;
    const x = (golpe - (N - 1) / 2) * PASO;
    lote.push(nMartillo.nodeId, x, 1.02 + alto * 0.62, 0.35 + alto * 0.2, 0, 0, 0);
    if (u >= 1) golpe = -1;
  } else {
    lote.push(nMartillo.nodeId, 0, 1.6, 0.55, 0, 0, 0);
  }
  // La tapa del fuelle baja mientras se sopla.
  lote.push(nTapa.nodeId, 0, soplando > 0 ? 0.02 + (2.2 - soplando) * 0.06 : 0.16, 0, 0, 0, 0);
  // La barra: al fuego o en el yunque. Es el mismo grupo, movido.
  lote.push(nBarra.nodeId,
    enFuego ? -3.6 : 0,
    enFuego ? 0.18 : 0.84,
    enFuego ? -0.55 : 0,
    0, enFuego ? 0.35 : 0, 0);
  root.setTransformBatch(lote);

  // --- la ronda sola ----------------------------------------------------
  if (ronda >= 0) {
    if (!proxima) proxima = ahora + 900;
    if (ahora >= proxima) {
      // Un ciclo de herrero: al fuego, soplar, sacar, y martillar por el medio.
      const fase = ronda % 10;
      if (fase === 0) { enFuego = true; texto("fr_estado", "la barra esta en el fuego"); proxima = ahora + 1200; }
      else if (fase === 1) { soplando = 2.4; texto("fr_estado", "soplando el fuelle"); proxima = ahora + 2600; }
      else if (fase === 2) { enFuego = false; texto("fr_estado", "al yunque"); proxima = ahora + 700; }
      else { martillar(3 + (ronda * 5) % Math.max(1, N - 6)); proxima = ahora + 520; }
      ronda++;
    }
  }

  const t = Math.floor(ahora / 250);
  if (t === tic) return;
  tic = t;
  let media = 0, maxG = 0, minG = 9;
  for (let i = 0; i < N; i++) {
    media += temp[i];
    if (grueso[i] > maxG) maxG = grueso[i];
    if (grueso[i] < minG) minG = grueso[i];
  }
  media /= N;
  texto("fr_temp", "la barra esta " + FUEGO[tramo(media)].nombre +
        (enFuego ? " · en el fuego" : "") + (soplando > 0 ? " · soplando" : ""));
  texto("fr_dato", golpes + " golpes · grosor de " + (minG * 100).toFixed(1) +
        " a " + (maxG * 100).toFixed(1) + " cm");
}

requestAnimationFrame(frame);
