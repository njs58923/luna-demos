// La cueva: pintar muchos nodos cuando no hay batch para pintar.
//
// El dominó movió doscientos cuarenta nodos por frame y no le costó nada, porque
// `setTransformBatch` manda todo en una llamada. El color no tiene eso: hay que
// hacer `setAttribute('color', …)` nodo por nodo, y cada uno cruza el puente al
// runtime. Trescientos sesenta cilindros repintados por frame es una escena que
// se arrastra.
//
// El arreglo no es pintar menos cristales, es pintar menos **veces**. La onda es
// una función del tiempo y de la distancia:
//
//     tramo_i(t) = floor( (t·v − d_i) / ancho )   si t·v > d_i
//
// y `tramo_i` es un entero que cambia pocas veces por segundo. Cada frame se
// calcula el tramo de los ciento veinte —eso es aritmética, es gratis— y sólo se
// repintan los que **cambiaron de entero** desde el frame anterior. Con la onda a
// nueve metros por segundo y tramos de dos metros, cambian unos ocho por frame.
//
// Es la misma idea que la ventana móvil del dominó, dicha de otra forma: el
// estado se calcula entero y barato, y se escribe sólo el delta.
const CFG = globalThis.CUEVA || {};
const CRIS = CFG.cristales || [];
const ONDA = CFG.onda || ["#FFFFFF"];
const root = hiperspace.dimention;

const VEL = 9.0;    // metros por segundo que avanza el frente
const ANCHO = 2.2;  // metros de cada banda de color
const APAGADO = "#2E4A6E";
/** El largo total de la onda: una vuelta entera de la paleta. */
const LARGO = ONDA.length * ANCHO;


/** Los tres cilindros de cada cristal, y el tramo que tienen pintado ahora. */
const piezas = [];   // piezas[i] = [nodo, nodo, nodo]
const pintado = [];  // pintado[i] = índice de color actual, o -1
let listo = false;
let panel = {};

/** La onda en curso. `origen` es el cristal que se tocó; `t0` el momento. */
let origen = -1;
let t0 = 0;
let distancias = [];
let dmax = 1;
let tic = -1;
let repintes = 0;
let espera = 0;   // cuando sale la proxima onda sola

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** Las distancias del origen a todos, una sola vez por toque. Calcularlas por
 *  frame serían catorce mil raíces por segundo para nada: no cambian. */
function medir(o) {
  const a = CRIS[o];
  distancias = new Array(CRIS.length);
  dmax = 1;
  for (let i = 0; i < CRIS.length; i++) {
    const b = CRIS[i];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    distancias[i] = d;
    if (d > dmax) dmax = d;
  }
}

function tocar(i, sola) {
  origen = i;
  t0 = 0;             // el primer frame lo fija
  medir(i);
  repintes = 0;
  texto("cv_estado", sola ? "una onda sola, desde el cristal " + i
                          : "tu onda, desde el cristal " + i);
}

function preparar() {
  for (const id of ["cv_estado", "cv_dato"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  for (let i = 0; i < CRIS.length; i++) {
    const tres = [];
    for (let k = 0; k < 3; k++) {
      const el = root.getElementById("cr_" + i + "_" + k);
      if (!el) return false;
      tres.push(el);
    }
    piezas.push(tres);
    pintado.push(-1);
    const t = root.getElementById("toque_" + i);
    if (!t) return false;
    t.addEventListener("toque", (function (j) {
      return function () { tocar(j); };
    })(i));
  }
  console.log("[cueva] " + CRIS.length + " cristales, " + (CRIS.length * 3) + " nodos de color");
  return true;
}

/** Pintar un cristal entero. Tres llamadas; es la operación cara de la escena y
 *  todo lo demás está armado para llamarla poco. */
function pintar(i, idx) {
  const c = ONDA[((idx % ONDA.length) + ONDA.length) % ONDA.length];
  const p = piezas[i];
  p[0].setAttribute("color", c);
  p[1].setAttribute("color", c);
  p[2].setAttribute("color", c);
  pintado[i] = idx;
  repintes++;
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!listo) {
    if (preparar()) listo = true;
    return;
  }
  // Una cueva quieta que dice "tocá un cristal" está apagada, y una escena
  // apagada no invita a tocar nada. Cuando no hay onda en curso sale una sola
  // cada tanto desde un cristal cualquiera: el lugar respira, y el toque pasa a
  // ser tomar el control de algo que ya se mueve, que es una invitación mucho
  // mejor que un cartel.
  if (origen < 0) {
    if (!espera) espera = ahora + 1200;
    if (ahora >= espera) {
      espera = 0;
      tocar(Math.floor(Math.random() * CRIS.length), true);
    }
    return;
  }
  if (!t0) t0 = ahora;

  const frente = ((ahora - t0) / 1000) * VEL;

  // El estado completo, cada frame, en aritmética. Ciento veinte restas y un
  // floor: no se nota. Lo que se nota es el setAttribute, y ése va abajo.
  let cambios = 0;
  for (let i = 0; i < CRIS.length; i++) {
    const avance = frente - distancias[i];
    // La onda tiene dos bordes. Antes de que le llegue el frente el cristal
    // está apagado; después de que le pasa la cola, también.
    //
    // El borde de atrás no es decoración: sin él, cuando la onda termina cada
    // cristal se queda en el tramo que le tocó último, y como la paleta da la
    // vuelta eso deja un mosaico congelado de nueve colores. Apagar los ciento
    // veinte de golpe al final sería un pico de 360 setAttribute en un frame,
    // justo lo que la escena evita — así que la cola apaga de a poco, igual que
    // el frente enciende de a poco.
    const idx = avance <= 0 || avance >= LARGO ? -1 : Math.floor(avance / ANCHO);
    if (idx === pintado[i]) continue;
    if (idx < 0) {
      if (pintado[i] !== -1) {
        piezas[i][0].setAttribute("color", APAGADO);
        piezas[i][1].setAttribute("color", APAGADO);
        piezas[i][2].setAttribute("color", APAGADO);
        pintado[i] = -1;
        repintes++;
      }
      continue;
    }
    pintar(i, idx);
    cambios++;
  }

  // Para cuando el frente pasó al más lejano más el largo de la onda, la cola
  // ya apagó a todos: la cueva vuelve sola al reposo.
  if (frente > dmax + LARGO) {
    origen = -1;
    espera = 0;
    texto("cv_estado", "tocá un cristal");
  }

  const paso = Math.floor(ahora / 250);
  if (paso === tic) return;
  tic = paso;
  texto("cv_dato", origen < 0
        ? CRIS.length + " cristales · la onda sale de donde tocás"
        : "frente a " + frente.toFixed(1) + " m · " + cambios + " cristales repintados este frame");
}

requestAnimationFrame(frame);
