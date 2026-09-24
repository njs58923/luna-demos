// El circuito: Wireworld, y el estado del mundo vive en el script.
//
// El Juego de la Vida es el autómata que todos conocen y es una mala elección
// para una escena: se ve lindo y no se entiende nada. **Wireworld** es mejor acá
// porque cada celda tiene un papel y lo que uno ve correr son electrones.
//
//     vacio     -> vacio
//     cabeza    -> cola
//     cola      -> conductor
//     conductor -> cabeza  si tiene 1 o 2 cabezas entre sus 8 vecinas
//                  conductor  en cualquier otro caso
//
// Las cuatro líneas de arriba son literalmente el autómata completo. Todo lo
// demás —los relojes que laten a distinto ritmo, la señal que se bifurca, las dos
// que se juntan— **no está programado en ningún lado**: sale del cableado.
//
// La regla del "1 o 2" es la que hace que Wireworld sirva para algo. Con "1 o
// más", dos señales que llegan juntas a un cruce se refuerzan y todo se enciende;
// con "1 o 2", tres cabezas vecinas *apagan* el conductor, y de ahí salen las
// compuertas. Es una condición rarísima que resultó ser exactamente la que hacía
// falta, y sacarla convierte el tablero en una mancha en cuatro generaciones.
//
// Y una del motor, que costó una corrida: **las celdas no son tocables**. La
// primera versión les puso `touchable` y un listener a las 2 560, para poder
// cablear a mano. El espacio monta igual —2 642 entidades— pero el script no
// arranca nunca: `preparar()` se queda en el intento y no sale ni un log ni un
// error. Dos mil quinientos listeners son demasiados; el tablero es de mirar, y
// lo que se toca son los cinco botones del borde.
//
// Del resto del motor no hay nada nuevo: el pozo de nodos del telar, y la
// disciplina de la cueva para no repintar lo que no cambió. Lo que la escena muestra en limpio es
// el patrón al que llegaron casi todas: **el estado es del script, el motor sólo
// lo muestra**.
const CFG = globalThis.CIRCUITO || {};
const W = CFG.ancho || 64;
const H = CFG.alto || 40;
const COL = CFG.colores || {};
const root = hiperspace.dimention;

const VACIO = 0, COND = 1, CABEZA = 2, COLA = 3;
const COLORES = [COL.vacio, COL.conductor, COL.cabeza, COL.cola];

let malla = new Uint8Array(W * H);
let siguiente = new Uint8Array(W * H);
const pintado = new Int8Array(W * H);
const nodos = new Array(W * H);
const panel = {};

let listo = false;
let tic = -1;
let generacion = 0;
let periodo = 130;        // ms por generación
let corriendo = true;
let ultima = 0;
let unPaso = false;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

const idx = (i, j) => j * W + i;

/** Un tramo recto de cable. Sólo horizontal o vertical: las diagonales en
 *  Wireworld funcionan pero son más difíciles de leer, y acá el cableado tiene
 *  que poder seguirse con el ojo. */
function cable(i0, j0, i1, j1) {
  const di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0);
  let i = i0, j = j0;
  for (;;) {
    if (i >= 0 && i < W && j >= 0 && j < H) malla[idx(i, j)] = COND;
    if (i === i1 && j === j1) break;
    i += di; j += dj;
  }
}

/** Un anillo: el reloj más simple que hay. Un electrón que da vueltas para
 *  siempre, y su período es el largo del anillo. Cuatro anillos de distinto
 *  tamaño laten a cuatro ritmos y nadie tuvo que escribir ninguna frecuencia. */
function anillo(i0, j0, i1, j1) {
  cable(i0, j0, i1, j0);
  cable(i1, j0, i1, j1);
  cable(i1, j1, i0, j1);
  cable(i0, j1, i0, j0);
  // El electrón: una cabeza y su cola detrás. La cola es lo que le impide ir
  // para atrás — sin ella la señal sale para los dos lados y se cancela sola.
  malla[idx(i0 + 2, j0)] = CABEZA;
  malla[idx(i0 + 1, j0)] = COLA;
  return 2 * ((i1 - i0) + (j1 - j0));
}

const periodos = [];

function tender() {
  malla = new Uint8Array(W * H);

  // Cuatro relojes de distinto largo, a la izquierda.
  const relojes = [
    [2, 2, 15, 8],
    [2, 12, 13, 17],
    [2, 21, 11, 25],
    [2, 29, 17, 36],
  ];
  periodos.length = 0;
  for (const r of relojes) periodos.push(anillo(r[0], r[1], r[2], r[3]));

  // De cada reloj sale una derivación hacia la derecha. Que se pueda derivar sin
  // hacer nada especial es una propiedad de Wireworld, no una decisión: el
  // conductor de al lado ve una cabeza vecina y se enciende, y listo.
  const salidas = [5, 14, 23, 32];
  const desde = [16, 14, 12, 18];
  for (let k = 0; k < 4; k++) cable(desde[k], salidas[k], 40, salidas[k]);

  // Una bifurcación: la tercera línea se abre en dos a mitad de camino. Es la
  // misma propiedad de recién, usada a propósito.
  cable(40, 23, 46, 23);
  cable(46, 23, 46, 19);
  cable(46, 19, 60, 19);
  cable(46, 23, 46, 27);
  cable(46, 27, 60, 27);

  // Una unión: las dos primeras líneas se juntan en una. Cualquiera de las dos
  // enciende la salida — es un OR, y tampoco hubo que programarlo.
  cable(40, 5, 52, 5);
  cable(52, 5, 52, 9);
  cable(40, 14, 52, 14);
  cable(52, 14, 52, 10);
  cable(52, 9, 60, 9);

  // Y una línea larga y sola, para tener con qué comparar: la señal tarda lo que
  // mide el cable, ni más ni menos. Es un metro de tiempo.
  cable(40, 32, 60, 32);
  cable(60, 32, 60, 36);
  cable(60, 36, 44, 36);

  generacion = 0;
  for (let k = 0; k < pintado.length; k++) pintado[k] = -1;
}

/** Una generación. Ésta es la escena entera. */
function paso() {
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = idx(i, j);
      const c = malla[k];
      if (c === VACIO) { siguiente[k] = VACIO; continue; }
      if (c === CABEZA) { siguiente[k] = COLA; continue; }
      if (c === COLA) { siguiente[k] = COND; continue; }
      // conductor: contar cabezas entre las ocho vecinas.
      let cabezas = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= H) continue;
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ii = i + di;
          if (ii < 0 || ii >= W) continue;
          if (malla[idx(ii, jj)] === CABEZA) cabezas++;
        }
      }
      siguiente[k] = (cabezas === 1 || cabezas === 2) ? CABEZA : COND;
    }
  }
  const t = malla; malla = siguiente; siguiente = t;
  generacion++;
}

/** Pintar sólo lo que cambió. Con 2 560 celdas y un `setAttribute` por celda,
 *  repintar todo cada generación serían 2 560 llamadas ocho veces por segundo.
 *  Lo que cambia de verdad son unas cuarenta. */
function mostrar() {
  let cambios = 0;
  for (let k = 0; k < malla.length; k++) {
    const e = malla[k];
    if (e === pintado[k]) continue;
    nodos[k].setAttribute("color", COLORES[e]);
    pintado[k] = e;
    cambios++;
    // El primer repintado toca las 2 560 celdas de una, que es exactamente la
    // tanda que no hay que hacer. Se corta y sigue en el frame que viene: el
    // tablero aparece en dos o tres frames y nadie lo nota.
    if (cambios >= POR_FRAME) break;
  }
  return cambios;
}

/** La resolución de nodos, **repartida en varios frames**.
 *
 *  Ésta es la parte que costó la corrida. La versión anterior buscaba los 2 560
 *  nodos por id en un solo frame, como hacen todas las demás escenas, y el script
 *  no arrancaba nunca: sin error, sin log, sin nada. El espacio monta, el tablero
 *  se ve, y el script simplemente no existe. Medido en este motor: 2 016 ids en
 *  una tanda andan; 2 560 no.
 *
 *  Reparte de a `POR_FRAME` y el problema desaparece. Vale para cualquier escena
 *  con un pozo grande — el telar tiene el mismo techo y por las mismas razones.
 */
const POR_FRAME = 400;
let cursor = 0;
let fase = 0;   // 0 = panel y mandos, 1 = celdas, 2 = listo

function preparar() {
  if (fase === 0) {
    for (const id of ["ci_estado", "ci_regla", "ci_dato", "ci_dato2"]) {
      const el = root.getElementById(id);
      if (!el) return false;
      panel[id] = el;
    }
    const mandos = {
      mas_lento: function () { periodo = Math.min(900, periodo * 1.5); },
      mas_rapido: function () { periodo = Math.max(40, periodo / 1.5); },
      pausa: function () { corriendo = !corriendo; },
      paso: function () { corriendo = false; unPaso = true; },
      reiniciar: function () { tender(); },
    };
    for (const id in mandos) {
      const el = root.getElementById(id);
      if (!el) return false;
      el.addEventListener("toque", mandos[id]);
    }
    fase = 1;
    return false;
  }
  if (fase === 1) {
    const hasta = Math.min(nodos.length, cursor + POR_FRAME);
    for (let k = cursor; k < hasta; k++) {
      const i = k % W, j = (k - i) / W;
      const el = root.getElementById("q_" + i + "_" + j);
      if (!el) return false;
      nodos[k] = el;
    }
    cursor = hasta;
    texto("ci_estado", "resolviendo nodos: " + cursor + " de " + nodos.length);
    if (cursor < nodos.length) return false;
    fase = 2;
  }
  tender();
  console.log("[circuito] " + W + "x" + H + " = " + (W * H) + " celdas, periodos de reloj " +
              periodos.join(", "));
  return true;
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!listo) {
    if (preparar()) listo = true;
    return;
  }
  // El autómata corre a su propio ritmo, no al del render. Es la separación que
  // hace falta en cuanto una simulación tiene un tiempo propio: a 120 fps el
  // tablero pasaría en dos segundos y no se vería nada.
  if (unPaso) { paso(); unPaso = false; ultima = ahora; }
  else if (corriendo && ahora - ultima >= periodo) {
    paso();
    ultima = ahora;
  }
  const cambios = mostrar();

  const t = Math.floor(ahora / 250);
  if (t === tic) return;
  tic = t;
  texto("ci_estado", corriendo ? "corriendo a " + (1000 / periodo).toFixed(1) + " generaciones por segundo"
                               : "en pausa · usá un paso");
  texto("ci_dato", "generacion " + generacion + " · " + cambios + " celdas repintadas de " + (W * H) +
        " · relojes de periodo " + periodos.join(", "));
}

requestAnimationFrame(frame);
