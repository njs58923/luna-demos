// Banco de pruebas. Mide el motor pelado, sin framework encima, porque lo que
// salga de acá decide la arquitectura del framework:
//
//   1. ¿Cuántos rectángulos entran en UNA malla?
//   2. ¿Se puede **rearmar la malla entera por cuadro**? De eso depende si el
//      layout puede recalcularse en vivo o hay que hacer diffing.
//   3. ¿Cuántos `<text>` aguanta? El texto no puede ser malla y es el techo
//      real de una interfaz.
//   4. ¿Cuánto cuesta un blanco táctil? Todo lo que se toca necesita su nodo.
//
// Se maneja por URL:
//   /banco.hsml?cuadros=2000&porframe=1&textos=200&blancos=100
const CFG = globalThis.UI_CFG;
const A = globalThis.APP;
const C = CFG.C;
const root = hiperspace.dimention;

const PALETA = [C.azul, C.rojo, C.verde, C.amarillo, C.violeta, C.naranja, C.cian];

function rgba(hex) {
  const v = parseInt(String(hex).replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1];
}

// ── Geometría ───────────────────────────────────────────────────────────────
// Un rectángulo son dos triángulos. Se emite a arrays planos porque es lo que
// `MeshResource` acepta; pasarle arrays de ternas da NaN sin decir por qué.
//
// **Ojo con el futuro**: si la malla llega a soportar curvas, lo único que
// cambia es esta función. Todo lo de arriba habla de rectángulos y esquinas, no
// de triángulos. Por eso el emisor está aislado.
function Constructor() {
  this.pos = [];
  this.col = [];
  this.nor = [];
  this.idx = [];
  this.v = 0;
}
Constructor.prototype.cuad = function (x, y, w, h, z, color) {
  const c = rgba(color);
  const p = this.pos, k = this.col, n = this.nor, i = this.idx;
  const x1 = x + w, y1 = y + h;
  p.push(x, y, z, x1, y, z, x1, y1, z, x, y1, z);
  for (let t = 0; t < 4; t++) { n.push(0, 0, 1); k.push(c[0], c[1], c[2], 1); }
  const b = this.v;
  i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  this.v += 4;
};
Constructor.prototype.malla = function () {
  return {
    positions: new Float32Array(this.pos),
    indices: new Uint32Array(this.idx),
    normals: new Float32Array(this.nor),
    colors: new Float32Array(this.col),
  };
};

// ── Escena de prueba ────────────────────────────────────────────────────────
const R = CFG.distancia;
const ANCHO = 1.6;
const ALTO = 1.0;
const Y0 = 1.7 - ALTO / 2;

/** Una grilla de `n` cuadraditos que llena el panel. Con fase para que al
 *  rearmar por cuadro se vea que efectivamente cambió algo. */
function armar(n, fase) {
  const g = new Constructor();
  g.cuad(-ANCHO / 2, -ALTO / 2, ANCHO, ALTO, -0.004, C.superficie);
  if (n > 0) {
    const cols = Math.ceil(Math.sqrt(n * (ANCHO / ALTO)));
    const filas = Math.ceil(n / cols);
    const cw = ANCHO / cols, ch = ALTO / filas;
    for (let i = 0; i < n; i++) {
      const cx = i % cols, cy = Math.floor(i / cols);
      const d = 0.12 + 0.38 * (1 + Math.sin(fase + i * 0.15)) / 2;
      g.cuad(-ANCHO / 2 + cx * cw + cw * 0.12,
             -ALTO / 2 + cy * ch + ch * 0.12,
             cw * 0.76 * d * 2, ch * 0.76,
             0, PALETA[i % PALETA.length]);
    }
  }
  return g.malla();
}

const nodoMalla = root.getElementById("ui_malla");
const nodos = root.getElementById("ui_nodos");

let malla = null;
function pintar(fase) {
  const d = armar(A.cuadros, fase);
  if (!malla) {
    malla = MeshResource.create(d);
    nodoMalla.src = malla.src;
  } else {
    malla.update(d);
  }
  return d.indices.length / 3;
}

// El panel entero se lleva al frente del visitante con el nodo del modelo: la
// malla se arma en coordenadas locales del panel y el nodo la ubica. Es más
// barato que sumar el offset a cada vértice y deja el layout en 2D puro.
nodoMalla.setAttribute("z", String(-R));
nodoMalla.setAttribute("y", String(Y0 + ALTO / 2));
nodos.setAttribute("z", String(-R));
nodos.setAttribute("y", String(Y0 + ALTO / 2));

// Textos: uno por celda de una grilla aparte, arriba del panel.
for (let i = 0; i < A.textos; i++) {
  const cols = 12;
  const t = root.createElement("text");
  t.setAttribute("value", "Ab" + i);
  t.setAttribute("size", "0.022");
  t.setAttribute("color", C.texto);
  t.setAttribute("x", String(-ANCHO / 2 + 0.06 + (i % cols) * (ANCHO / cols)));
  t.setAttribute("y", String(ALTO / 2 - 0.05 - Math.floor(i / cols) * 0.045));
  t.setAttribute("z", "0.01");
  nodos.appendChild(t);
}

// Blancos táctiles: planos del color del panel, para ver si un nodo tocable
// cuesta distinto que uno que no lo es.
let toques = 0;
for (let i = 0; i < A.blancos; i++) {
  const cols = 10;
  const b = root.createElement("plane");
  b.setAttribute("sx", "0.1");
  b.setAttribute("sy", "0.06");
  b.setAttribute("color", C.superficieAlta);
  b.setAttribute("touchable", "true");
  b.setAttribute("x", String(-ANCHO / 2 + 0.09 + (i % cols) * 0.15));
  b.setAttribute("y", String(-ALTO / 2 + 0.06 + Math.floor(i / cols) * 0.09));
  b.setAttribute("z", "0.006");
  b.addEventListener("toque", function () { toques++; });
  nodos.appendChild(b);
}

// ── Medición ────────────────────────────────────────────────────────────────
const t0 = Date.now();
const tris = pintar(0);
console.log("[banco] primera malla: " + tris + " triangulos, " +
            (Date.now() - t0) + " ms");
console.log("[banco] " + A.cuadros + " cuadros, " + A.textos + " textos, " +
            A.blancos + " blancos, rearmado " + (A.porFrame ? "por cuadro" : "una vez"));

let cuadros = 0;
let acum = 0;
let ultimo = 0;
let reportado = 0;

function latir(ts) {
  requestAnimationFrame(latir);
  if (ultimo) acum += ts - ultimo;
  ultimo = ts;
  cuadros++;
  if (A.porFrame) pintar(ts / 500);
  // Un informe cada dos segundos: el fps del HUD del navegador incluye todo, y
  // acá interesa el del propio bucle.
  if (acum - reportado > 2000) {
    console.log("[banco] " + (cuadros / (acum / 1000)).toFixed(1) + " fps de bucle" +
                (toques ? ", " + toques + " toques" : ""));
    reportado = acum;
    cuadros = 0;
    acum = 0;
    reportado = 0;
  }
}
requestAnimationFrame(latir);
