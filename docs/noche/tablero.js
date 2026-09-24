// El tablero: las reglas.
//
// Acá está lo que distingue esta escena de las otras interactivas del servidor.
// En el planetario, tocar muestra datos: el estado es "qué planeta miro". Acá el
// estado **decide qué se puede tocar después**, y hay que pintarlo: sesenta y
// cuatro casillas que vuelven a su color, las legales que se marcan, la comida
// que se marca distinto.
//
// Lo que se implementa: los movimientos de las seis piezas, con bloqueo por el
// camino, captura, y el peón con su avance doble desde la fila de salida.
// Lo que **no**: jaque, enroque, al paso y coronación. Es una demo del motor, no
// un motor de ajedrez, y todo eso agrega reglas sin agregar nada que probar.
const CFG = globalThis.TABLERO || {};
const CASILLA = CFG.casilla || 1.25;
const COL = CFG.colores || {};
const root = hiperspace.dimention;

const N = 8;
const claroDe = (c, f) => ((c + f) % 2 === 1 ? COL.claro : COL.oscuro);

// --------------------------------------------------------------------- estado
/** `piezas` son los datos; `nodos` son los nodos del DOM. Se guardan aparte
 *  porque el DOM no se puede consultar: `getAttribute` devuelve lo que decía el
 *  HSML, no lo último que se escribió. */
let piezas = [];
let nodos = [];
let casillas = [];      // 64 nodos
let tablero = [];       // 64 índices de pieza, o -1
let turnoBlancas = true;
let elegida = -1;
let legales = [];
let jugadas = 0;
let comidasB = 0;
let comidasN = 0;
let panel = {};

const LETRA = "abcdefgh";
const NOMBRE = { peon: "P", torre: "T", caballo: "C", alfil: "A", dama: "D", rey: "R" };

const idx = (c, f) => f * N + c;
const dentro = (c, f) => c >= 0 && c < N && f >= 0 && f < N;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

function posicionDe(c, f, y) {
  return { x: (c - 3.5) * CASILLA, y: y, z: (f - 3.5) * CASILLA };
}

// ------------------------------------------------------------------- reglas
function deslizar(c, f, dirs, mias, salida) {
  for (const [dc, df] of dirs) {
    let x = c + dc, y = f + df;
    while (dentro(x, y)) {
      const o = tablero[idx(x, y)];
      if (o < 0) {
        salida.push(idx(x, y));
      } else {
        if (piezas[o].blanca !== mias) salida.push(idx(x, y));
        break;
      }
      x += dc; y += df;
    }
  }
}

function saltar(c, f, saltos, mias, salida) {
  for (const [dc, df] of saltos) {
    const x = c + dc, y = f + df;
    if (!dentro(x, y)) continue;
    const o = tablero[idx(x, y)];
    if (o < 0 || piezas[o].blanca !== mias) salida.push(idx(x, y));
  }
}

const RECTAS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const CABALLO = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

function movimientos(i) {
  const p = piezas[i];
  const c = p.col, f = p.fila, m = p.blanca;
  const s = [];
  if (p.tipo === "peon") {
    const dir = m ? 1 : -1;
    const salida = m ? 1 : 6;
    // Avance: sólo si está vacío. El peón es la única pieza que come distinto
    // de como anda, y por eso es la única que necesita su propio bloque.
    if (dentro(c, f + dir) && tablero[idx(c, f + dir)] < 0) {
      s.push(idx(c, f + dir));
      if (f === salida && tablero[idx(c, f + 2 * dir)] < 0) s.push(idx(c, f + 2 * dir));
    }
    for (const dc of [-1, 1]) {
      const x = c + dc, y = f + dir;
      if (!dentro(x, y)) continue;
      const o = tablero[idx(x, y)];
      if (o >= 0 && piezas[o].blanca !== m) s.push(idx(x, y));
    }
  } else if (p.tipo === "torre") {
    deslizar(c, f, RECTAS, m, s);
  } else if (p.tipo === "alfil") {
    deslizar(c, f, DIAGS, m, s);
  } else if (p.tipo === "dama") {
    deslizar(c, f, RECTAS.concat(DIAGS), m, s);
  } else if (p.tipo === "caballo") {
    saltar(c, f, CABALLO, m, s);
  } else {
    saltar(c, f, RECTAS.concat(DIAGS), m, s);
  }
  return s;
}

// ------------------------------------------------------------------- pintura
function repintar() {
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      casillas[idx(c, f)].setAttribute("color", claroDe(c, f));
    }
  }
  if (elegida < 0) return;
  const p = piezas[elegida];
  casillas[idx(p.col, p.fila)].setAttribute("color", COL.marca);
  for (const k of legales) {
    // La casilla con pieza enemiga se marca distinto: es la única señal de que
    // ahí se come, y sin ella hay que adivinar.
    casillas[k].setAttribute("color", tablero[k] >= 0 ? COL.come : COL.marca);
  }
}

/** Levanta o baja la pieza elegida. Es toda la animación que tiene la escena, y
 *  alcanza: el objeto que se mueve tiene que verse distinto del que no. */
function alzar(i, arriba) {
  const p = piezas[i];
  nodos[i].position = posicionDe(p.col, p.fila, arriba ? 0.62 : 0.12);
}

// -------------------------------------------------------------------- jugar
function soltar() {
  if (elegida >= 0) alzar(elegida, false);
  elegida = -1;
  legales = [];
  repintar();
}

function elegir(i) {
  if (elegida === i) { soltar(); return; }
  if (elegida >= 0) alzar(elegida, false);
  elegida = i;
  legales = movimientos(i);
  alzar(i, true);
  repintar();
  const p = piezas[i];
  texto("t_ayuda", NOMBRE[p.tipo] + " en " + LETRA[p.col] + (p.fila + 1) +
        " · " + legales.length + (legales.length === 1 ? " jugada" : " jugadas"));
}

function mover(destino) {
  const i = elegida;
  const p = piezas[i];
  const desde = LETRA[p.col] + (p.fila + 1);
  const comido = tablero[destino];
  if (comido >= 0) {
    const q = piezas[comido];
    q.viva = false;
    tablero[idx(q.col, q.fila)] = -1;
    // La comida se va del tablero, no se esconde: se apila a un costado, que
    // además deja ver de un vistazo cómo va la partida.
    const fila = q.blanca ? comidasB++ : comidasN++;
    nodos[comido].position = {
      x: (q.blanca ? -1 : 1) * (CASILLA * 4 + 1.5 + Math.floor(fila / 8) * 0.9),
      y: 0.12,
      z: (fila % 8) * 0.85 - 3,
    };
  }
  tablero[idx(p.col, p.fila)] = -1;
  const c = destino % N, f = Math.floor(destino / N);
  p.col = c; p.fila = f;
  tablero[destino] = i;
  nodos[i].position = posicionDe(c, f, 0.12);

  jugadas++;
  turnoBlancas = !turnoBlancas;
  elegida = -1;
  legales = [];
  repintar();
  texto("t_turno", turnoBlancas ? "Juegan las blancas" : "Juegan las negras");
  texto("t_jugada", jugadas + ". " + NOMBRE[p.tipo] + desde +
        (comido >= 0 ? "x" : "-") + LETRA[c] + (f + 1));
  texto("t_ayuda", "tocá una pieza y después su destino");
  texto("t_comidas", comidasB + " blancas y " + comidasN + " negras fuera");
}

function tocarCasilla(k) {
  const hay = tablero[k];
  if (elegida >= 0 && legales.indexOf(k) >= 0) { mover(k); return; }
  if (hay >= 0 && piezas[hay].blanca === turnoBlancas) { elegir(hay); return; }
  if (hay >= 0) {
    texto("t_ayuda", "esa no: juegan las " + (turnoBlancas ? "blancas" : "negras"));
    return;
  }
  soltar();
  texto("t_ayuda", "tocá una pieza y después su destino");
}

function reiniciar() {
  const arranque = CFG.piezas || [];
  tablero = new Array(N * N).fill(-1);
  for (let i = 0; i < piezas.length; i++) {
    const a = arranque[i];
    piezas[i].col = a.col;
    piezas[i].fila = a.fila;
    piezas[i].viva = true;
    tablero[idx(a.col, a.fila)] = i;
    nodos[i].position = posicionDe(a.col, a.fila, 0.12);
  }
  turnoBlancas = true;
  elegida = -1;
  legales = [];
  jugadas = 0;
  comidasB = 0;
  comidasN = 0;
  repintar();
  texto("t_turno", "Juegan las blancas");
  texto("t_ayuda", "tocá una pieza y después su destino");
  texto("t_jugada", "");
  texto("t_comidas", "");
}

// -------------------------------------------------------------------- arranque
let listo = false;

function preparar() {
  for (const id of ["t_turno", "t_ayuda", "t_jugada", "t_comidas"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  const rein = root.getElementById("reiniciar");
  if (!rein) return false;

  const arranque = CFG.piezas || [];
  tablero = new Array(N * N).fill(-1);
  for (let i = 0; i < arranque.length; i++) {
    const el = root.getElementById("p_" + i);
    if (!el) return false;
    nodos.push(el);
    piezas.push({ tipo: arranque[i].tipo, blanca: arranque[i].blanca,
                  col: arranque[i].col, fila: arranque[i].fila, viva: true });
    tablero[idx(arranque[i].col, arranque[i].fila)] = i;
  }
  for (let f = 0; f < N; f++) {
    for (let c = 0; c < N; c++) {
      const el = root.getElementById("c_" + c + "_" + f);
      if (!el) return false;
      casillas[idx(c, f)] = el;
      el.addEventListener("toque", (function (k) {
        return function () { tocarCasilla(k); };
      })(idx(c, f)));
    }
  }
  rein.addEventListener("toque", reiniciar);
  console.log("[tablero] " + piezas.length + " piezas, " + casillas.length +
              " casillas, sin ninguna malla dinamica");
  return true;
}

function frame() {
  requestAnimationFrame(frame);
  if (listo) return;
  if (preparar()) listo = true;
}

requestAnimationFrame(frame);
