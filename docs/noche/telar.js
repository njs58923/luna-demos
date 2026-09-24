// El telar: una tabla de verdad que sale tela.
//
// Un telar se programa con un **atado**: una matriz de bits que dice qué lizos
// levanta cada pedal. Pisar el pedal p sube los lizos que tengan un 1 en su fila;
// los hilos de urdimbre enganchados a esos lizos quedan arriba, la lanzadera pasa
// por debajo, y en cada columna se decide una sola cosa: si se ve el hilo de
// urdimbre o el de trama.
//
//     atado[pedal][lizo] = 1   ->  ese pedal levanta ese lizo
//     lizo del hilo i          =  i % 4
//     el hilo i queda arriba   <=> atado[pedal][i % 4] === 1
//
// Y eso es todo. La tela entera —el tafetán, la sarga del jean, la espiga, el
// raso— sale de esas tres líneas con cuatro matrices distintas. Nadie dibujó
// nunca una sarga: la diagonal aparece porque la matriz está corrida un lugar en
// cada fila. Es lo más parecido a un programa que hay en el servidor sin ser
// código, y tiene mil años.
//
// La parte de motor es el **pozo**: el HSML declara mil novecientas veinte celdas
// escondidas y el script las va sacando, porque no hay forma de crear nodos desde
// acá. Es la técnica del jardín, en el tamaño donde empieza a doler.
//
// ADVERTENCIA, y es una correccion: este archivo dice mas abajo que el pozo hace
// falta porque el motor no puede crear nodos desde el script. **Eso es falso.**
// `root.createElement(tag)` existe, esta documentado en la guia, y se midio: 800
// nodos creados y agregados cuestan 0 ms de script y quedan resueltos 15 ms
// despues. El pozo se construyo sobre una suposicion que nunca verifique.
//
// Peor: el pozo es lo que **causo** el otro problema de esta escena. Declarar los
// nodos en el HSML obliga a buscarlos despues por getElementById, y ahi esta el
// techo de los ~2 000 ids que hubo que sortear repartiendo la resolucion en
// varios frames. Con createElement uno se queda con la referencia y no busca
// nada: el problema no se resuelve, no existe.
//
// Se deja como esta porque anda y esta medido, pero la version correcta de esta
// escena crea sus nodos.
const CFG = globalThis.TELAR || {};
const ANCHO = CFG.ancho || 48;
const ALTO = CFG.alto || 40;
const CELDA = CFG.celda || 0.055;
const LIG = CFG.ligamentos || [];
const TRAMAS = CFG.tramas || ["#888888"];
const COLOR_URDIMBRE = CFG.urdimbre || "#C8BCA0";
const root = hiperspace.dimention;

const celdas = [];      // celdas[j][i]
const hilos = [];       // los nodos de urdimbre
const nLizo = [];
const panel = {};
let nLanzadera = null, nPeine = null;

let listo = false;
let previo = 0;
let tic = -1;

let ligamento = 0;
let pedal = 0;
let fila = 0;            // la próxima fila de tejido
let pasadas = 0;
/** La pasada en curso: 0 = quieta, sube hasta 1 mientras la lanzadera cruza. */
let cruzando = 0;
let sentido = 1;
let ronda = 0;
let proxima = 0;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** ¿Queda arriba el hilo i con el pedal p? Ésta es la escena entera. */
function arriba(p, i) {
  const at = LIG[ligamento].atado;
  return at[p][i % 4] === 1;
}

/** Tejer una fila. Se escribe una vez y no se toca nunca más: es lo que hace
 *  que la escena deje algo hecho en vez de volver a su lugar. */
function tejer() {
  if (fila >= ALTO) {
    texto("te_estado", "la tela esta terminada");
    return false;
  }
  const trama = TRAMAS[Math.floor(pasadas / 4) % TRAMAS.length];
  const lote = [];
  for (let i = 0; i < ANCHO; i++) {
    const c = celdas[fila][i];
    // Si el hilo de urdimbre está arriba, la trama pasó por debajo y lo que se ve
    // desde arriba es la urdimbre. Si está abajo, se ve la trama. Un cruce, un
    // bit, un color.
    c.setAttribute("color", arriba(pedal, i) ? COLOR_URDIMBRE : trama);
    lote.push(c.nodeId,
      (i - (ANCHO - 1) / 2) * CELDA,
      0,
      (fila - (ALTO - 1) / 2) * CELDA,
      0, 0, 0);
  }
  root.setTransformBatch(lote);
  fila++;
  pasadas++;
  return true;
}

function pisar(p) {
  pedal = p;
  cruzando = 0.0001;   // arranca la pasada
  sentido = -sentido;
}

/** La resolución de nodos, **repartida en varios frames**.
 *
 *  Buscar los 1 920 nodos del pozo por id en un solo frame anda; buscar 6 400
 *  —`?ancho=80&alto=80`— no, y no avisa: el espacio monta, el telar se ve, y el
 *  script simplemente no arranca. Sin error y sin log. El techo medido en este
 *  motor está entre 2 016 (anda) y 2 560 (no) ids por tanda.
 *
 *  Repartiendo de a `POR_FRAME` el problema desaparece a cualquier tamaño, y
 *  cuesta medio segundo de arranque que nadie ve. Es la misma cura que en
 *  `circuito.js`. */
const POR_FRAME = 400;
let cursor = 0;
let fase = 0;

function preparar() {
  if (fase === 0) {
    for (const id of ["te_estado", "te_lig", "te_dato", "te_aviso"]) {
      const el = root.getElementById(id);
      if (!el) return false;
      panel[id] = el;
    }
    for (let i = 0; i < ANCHO; i++) {
      const el = root.getElementById("u_" + i);
      if (!el) return false;
      hilos.push(el);
    }
    for (let l = 0; l < 4; l++) {
      const el = root.getElementById("lizo_" + l);
      if (!el) return false;
      nLizo.push(el);
    }
    nLanzadera = root.getElementById("lanzadera");
    nPeine = root.getElementById("peine");
    if (!nLanzadera || !nPeine) return false;
    for (let p = 0; p < 4; p++) {
      const el = root.getElementById("pedal_" + p);
      if (!el) return false;
      el.addEventListener("toque", (function (q) {
        return function () { ronda = -1; pisar(q); };
      })(p));
    }
    for (let i = 0; i < LIG.length; i++) {
      const el = root.getElementById("lig_" + i);
      if (!el) return false;
      el.addEventListener("toque", (function (j) {
        return function () {
          ronda = -1;
          ligamento = j;
          texto("te_estado", "ligamento: " + LIG[j].nombre);
          // El ligamento se cambia **sin borrar nada**. La tela queda con la
          // frontera visible entre los dos, que es lo que pasa de verdad cuando
          // un tejedor cambia el atado a mitad de una pieza.
        };
      })(i));
    }
    for (let j = 0; j < ALTO; j++) celdas.push(new Array(ANCHO));
    fase = 1;
    return false;
  }
  if (fase === 1) {
    const total = ANCHO * ALTO;
    const hasta = Math.min(total, cursor + POR_FRAME);
    for (let k = cursor; k < hasta; k++) {
      const i = k % ANCHO, j = (k - i) / ANCHO;
      const el = root.getElementById("c_" + i + "_" + j);
      if (!el) return false;
      celdas[j][i] = el;
    }
    cursor = hasta;
    texto("te_estado", "enhebrando: " + cursor + " de " + total);
    if (cursor < total) return false;
    fase = 2;
  }
  console.log("[telar] " + (ANCHO * ALTO) + " celdas en el pozo, " + ANCHO + "x" + ALTO +
              ", " + LIG.length + " ligamentos");
  texto("te_estado", "pisá un pedal");
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

  const lote = [];

  // --- los lizos: suben los que el pedal levante ------------------------
  // Es la única parte que se mueve por jerarquía, y es también la que explica
  // el mecanismo: se ve qué marcos suben y con eso se entiende de dónde sale el
  // dibujo.
  for (let l = 0; l < 4; l++) {
    const sube = LIG[ligamento].atado[pedal][l] === 1 && cruzando > 0;
    lote.push(nLizo[l].nodeId, 0, sube ? 0.13 : 0, -0.55 - l * 0.22, 0, 0, 0);
  }

  // --- la urdimbre: los hilos siguen a su lizo --------------------------
  // Un hilo por columna, y su altura la decide el mismo bit que decide el color
  // de la celda. Que el mecanismo y el resultado salgan del **mismo** bit es lo
  // que hace que la escena se entienda mirándola.
  for (let i = 0; i < ANCHO; i++) {
    const sube = arriba(pedal, i) && cruzando > 0;
    lote.push(hilos[i].nodeId, (i - (ANCHO - 1) / 2) * CELDA, sube ? 0.11 : 0, 0, 0, 0, 0);
  }

  // --- la pasada: cruzar, apretar con el peine, y dejar la fila ---------
  if (cruzando > 0) {
    cruzando += dt / 0.55;
    const u = Math.min(1, cruzando);
    const lado = sentido > 0 ? 1 : -1;
    const x = lado * (1 - 2 * u) * (ANCHO * CELDA / 2 + 0.25);
    lote.push(nLanzadera.nodeId, x, 0, -0.35, 0, 0, 0);
    // El peine avanza en el último tercio: primero pasa el hilo, después se
    // aprieta. Hacer las dos cosas juntas se ve como un golpe sin causa.
    const golpe = u < 0.66 ? 0 : (u - 0.66) / 0.34;
    lote.push(nPeine.nodeId, 0, 0, -0.35 + golpe * 0.42 - (golpe > 0.5 ? (golpe - 0.5) * 0.84 : 0), 0, 0, 0);
    if (u >= 1) {
      cruzando = 0;
      tejer();
    }
  } else {
    lote.push(nLanzadera.nodeId, -(ANCHO * CELDA / 2 + 0.25) * sentido, 0, -0.35, 0, 0, 0);
    lote.push(nPeine.nodeId, 0, 0, -0.35, 0, 0, 0);
  }

  root.setTransformBatch(lote);

  // --- la ronda sola ----------------------------------------------------
  // Teje sola con la secuencia 1-2-3-4, que es la que da el dibujo del ligamento
  // tal como está pensado. Un telar quieto no muestra nada, y un tejido que
  // aparece de golpe tampoco: hay que ver la pasada.
  if (ronda >= 0 && cruzando === 0) {
    if (!proxima) proxima = ahora + 700;
    if (ahora >= proxima) {
      proxima = 0;
      if (fila >= ALTO) {
        // Cuando la tela se llena, cambia de ligamento y sigue: el pozo ya está
        // gastado, pero el dibujo nuevo se ve igual al recorrer la tela.
        ligamento = (ligamento + 1) % LIG.length;
        fila = 0;
        texto("te_estado", "tela nueva · ligamento " + LIG[ligamento].nombre);
      } else {
        pisar((pasadas % 4));
      }
      ronda++;
    }
  }

  const t = Math.floor(ahora / 250);
  if (t === tic) return;
  tic = t;
  const at = LIG[ligamento].atado[pedal];
  texto("te_lig", LIG[ligamento].nombre + " · pedal " + (pedal + 1) +
        " levanta [" + at.join(" ") + "]");
  texto("te_dato", fila + " de " + ALTO + " filas · " + pasadas + " pasadas · " +
        (ANCHO * ALTO) + " celdas en el pozo");
}

requestAnimationFrame(frame);
