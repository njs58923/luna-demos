// El jardín: de una cadena de texto a cuatrocientos segmentos.
//
// Una L-system son dos cosas: un axioma —una cadena corta— y reglas que dicen por
// qué se reemplaza cada símbolo. Se aplica la sustitución unas cuantas veces y la
// cadena crece sola:
//
//     F                       ->  el axioma
//     F[+F]F[-F]F             ->  una pasada
//     F[+F]F[-F]F[+F[+F]...]  ->  dos pasadas, y así
//
// Después una tortuga recorre la cadena: F avanza, + y - giran, [ y ] guardan y
// recuperan la posición. Lo que va dejando atrás es la planta.
//
// **El punto de la escena es que la geometría no existe hasta que corre esto.**
// El HSML manda un pozo de nodos escondidos y seis reglas de veinte caracteres; la
// planta la arma el script. Es lo más lejos que llega el servidor de mandar
// geometría: la ciudad manda manzanas, la biblioteca manda libros, el jardín manda
// una gramática.
//
// La tortuga es de tres dimensiones, así que no alcanza con un ángulo: lleva una
// **base ortonormal** de tres vectores —adelante, izquierda, arriba— y girar es
// rotar dos de ellos alrededor del tercero. Es la misma cuenta que hizo falta para
// los corales del arrecife, pero acá se arrastra a lo largo de un recorrido y hay
// que apilarla y desapilarla en cada bifurcación.
const CFG = globalThis.JARDIN || {};
const PLANTAS = CFG.plantas || [];
const TOPE = CFG.tope || 400;
const COL = CFG.colores || {};
const RADIO = CFG.radio || 9.5;
const root = hiperspace.dimention;

const GRADO = Math.PI / 180;

const nodos = [];
const panel = {};
let listo = false;
let tic = -1;

/** Lo que está creciendo ahora: los segmentos calculados, cuántos ya se
 *  mostraron, y el reloj del crecimiento. */
let segmentos = [];
let mostrados = 0;
let t0 = 0;
let cantero = -1;
let ronda = 0;
let proxima = 0;
let escalaActual = 1;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** Aplicar las reglas `pasos` veces. Se corta si la cadena se desmadra: una regla
 *  que triplica en cada pasada llega a un millón de caracteres en trece, y no hay
 *  ninguna razón para descubrirlo colgando el runtime. */
function expandir(axioma, reglas, pasos) {
  let s = axioma;
  for (let k = 0; k < pasos; k++) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      out += reglas[c] !== undefined ? reglas[c] : c;
    }
    if (out.length > 40000) return s;
    s = out;
  }
  return s;
}

/** Rotar `a` y `b` alrededor del eje que forman entre sí. Es lo único que hace
 *  falta para girar la tortuga: cada símbolo de giro toca dos de los tres
 *  vectores y deja el tercero quieto, y con eso la base se mantiene ortonormal
 *  sin tener que renormalizar nunca. */
function rotar(a, b, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const ax = a[0] * c + b[0] * s, ay = a[1] * c + b[1] * s, az = a[2] * c + b[2] * s;
  const bx = b[0] * c - a[0] * s, by = b[1] * c - a[1] * s, bz = b[2] * c - a[2] * s;
  a[0] = ax; a[1] = ay; a[2] = az;
  b[0] = bx; b[1] = by; b[2] = bz;
}

/** La tortuga. Devuelve la lista de segmentos: punto medio, dirección, largo y
 *  nivel de profundidad, que es lo que decide el color y el grosor. */
function recorrer(p) {
  const cadena = expandir(p.axioma, p.reglas, p.pasos);
  const g = p.giro * GRADO;
  // adelante, izquierda, arriba. Arranca mirando al cielo.
  let H = [0, 1, 0], L = [-1, 0, 0], U = [0, 0, 1];
  let x = 0, y = 0, z = 0;
  let nivel = 0;
  const pila = [];
  const out = [];
  for (let i = 0; i < cadena.length && out.length < TOPE; i++) {
    const c = cadena[i];
    if (c === "F") {
      const largo = p.largo * Math.pow(p.merma, nivel);
      const nx = x + H[0] * largo, ny = y + H[1] * largo, nz = z + H[2] * largo;
      out.push({
        x: (x + nx) / 2, y: (y + ny) / 2, z: (z + nz) / 2,
        dx: H[0], dy: H[1], dz: H[2],
        largo, nivel,
      });
      x = nx; y = ny; z = nz;
    } else if (c === "+") rotar(H, L, g);
    else if (c === "-") rotar(H, L, -g);
    else if (c === "&") rotar(H, U, g);
    else if (c === "^") rotar(H, U, -g);
    else if (c === "/") rotar(L, U, g);
    else if (c === "\\") rotar(L, U, -g);
    else if (c === "[") {
      pila.push([x, y, z, H.slice(), L.slice(), U.slice(), nivel]);
      nivel++;
    } else if (c === "]") {
      const e = pila.pop();
      if (e) {
        x = e[0]; y = e[1]; z = e[2];
        H = e[3]; L = e[4]; U = e[5];
        nivel = e[6];
      }
    }
  }
  // Cada regla crece a la escala que le sale, y las escalas no se parecen en
  // nada: el alga duplica su eje en cada pasada y a los cinco pasos mide veinte
  // metros, mientras el cardo no llega a dos. Ajustar los largos a mano regla por
  // regla es pelearse con el sintoma; lo que corresponde es **medir lo que salio y
  // llevarlo al tamaño del cantero**. Una L-system dice la forma, nunca el tamaño.
  let altura = 0.001, ancho = 0.001;
  for (const s of out) {
    if (s.y > altura) altura = s.y;
    const r = Math.hypot(s.x, s.z);
    if (r > ancho) ancho = r;
  }
  const k = Math.min(3.0 / altura, 1.55 / ancho);
  for (const s of out) {
    s.x *= k; s.y *= k; s.z *= k; s.largo *= k;
  }
  return { segmentos: out, cadena: cadena.length, escala: k, altura: altura * k };
}

function sembrar(i, ahora) {
  cantero = i;
  const p = PLANTAS[i];
  const r = recorrer(p);
  segmentos = r.segmentos;
  escalaActual = r.escala;
  // El cantero al que le toca: la planta se planta en su centro.
  const a = (i / PLANTAS.length) * Math.PI * 2;
  const cx = Math.sin(a) * RADIO;
  const cz = Math.cos(a) * RADIO;
  for (const s of segmentos) {
    s.x += cx;
    s.z += cz;
    s.y += 0.36;
  }
  // Todo lo que estaba plantado antes se guarda. Como no hay `visible`, esconder
  // es **mandarlo lejos**, y eso es una transformación, así que va en un solo
  // lote. Encogerlo con setAttribute serían mil doscientas llamadas —tres por
  // nodo— para no mostrar nada.
  const guardar = [];
  for (let k = 0; k < nodos.length; k++) guardar.push(nodos[k].nodeId, 0, -99, 0, 0, 0, 0);
  root.setTransformBatch(guardar);
  mostrados = 0;
  t0 = ahora;
  texto("jd_estado", "creciendo: " + p.nombre);
  texto("jd_regla", p.axioma + " → " + Object.keys(p.reglas).map((k) => k + ": " + p.reglas[k]).join("   ") +
        "   ·  giro " + p.giro + "°  ·  escala x" + r.escala.toFixed(2));
}

function preparar() {
  for (const id of ["jd_estado", "jd_regla", "jd_dato"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  for (let i = 0; i < TOPE; i++) {
    const el = root.getElementById("seg_" + i);
    if (!el) return false;
    nodos.push(el);
  }
  for (let i = 0; i < PLANTAS.length; i++) {
    const b = root.getElementById("sembrar_" + i);
    if (!b) return false;
    b.addEventListener("toque", (function (j) {
      return function () { ronda = -1; sembrar(j, performance.now()); };
    })(i));
  }
  console.log("[jardin] " + PLANTAS.length + " reglas, pozo de " + TOPE + " segmentos");
  return true;
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!listo) {
    if (preparar()) listo = true;
    return;
  }

  // La ronda sola: un jardín vacío no muestra que es un jardín. El primer toque
  // la apaga, igual que en el observatorio.
  if (ronda >= 0) {
    if (!proxima) proxima = ahora + 600;
    if (ahora >= proxima) {
      proxima = ahora + 9000;
      sembrar(ronda % PLANTAS.length, ahora);
      ronda++;
    }
  }
  if (cantero < 0) return;

  // El crecimiento: los segmentos aparecen en el orden en que los generó la
  // tortuga, que es el orden en que crecería la planta de verdad — del tronco a
  // las puntas, ramita por ramita.
  const objetivo = Math.min(segmentos.length, Math.floor(((ahora - t0) / 1000) * 140));
  if (objetivo <= mostrados) return;

  const lote = [];
  for (let i = mostrados; i < objetivo; i++) {
    const s = segmentos[i];
    const nodo = nodos[i];
    if (!nodo) break;
    // De la dirección a dos ángulos. El nodo es una caja cuyo eje largo es su Y
    // local, así que hay que llevar (0,1,0) hasta la dirección del segmento:
    //   rx = acos(dy)        cuánto se aparta de la vertical
    //   ry = atan2(dx, dz)   hacia dónde se aparta
    const rx = Math.acos(Math.max(-1, Math.min(1, s.dy)));
    const ry = Math.atan2(s.dx, s.dz);
    lote.push(nodo.nodeId, s.x, s.y, s.z, rx, ry, 0);
  }
  if (lote.length) root.setTransformBatch(lote);

  // El grosor y el color van por `setAttribute`, que no tiene batch — pero se
  // escriben **una sola vez por segmento**, cuando aparece, y no por frame. Es la
  // misma disciplina de la cueva: escribir el delta, nunca el estado.
  for (let i = mostrados; i < objetivo; i++) {
    const s = segmentos[i];
    const nodo = nodos[i];
    if (!nodo) break;
    // El grosor sale del **largo del propio segmento**, no de una constante. Es
    // la unica forma que sobrevive a la normalizacion de tamaño: una constante en
    // metros deja al helecho —cuatrocientos segmentos de cuatro centimetros— con
    // ramas mas gruesas que largas, o directamente invisible si se la escala.
    const grueso = Math.max(0.032, s.largo * 0.3 * Math.pow(0.74, s.nivel));
    nodo.setAttribute("sx", String(grueso));
    nodo.setAttribute("sy", String(s.largo));
    nodo.setAttribute("sz", String(grueso));
    // El color por nivel: el tronco oscuro, las puntas claras. Es lo que hace que
    // una maraña de palitos se lea como una planta.
    nodo.setAttribute("color",
      s.nivel === 0 ? COL.tallo : s.nivel === 1 ? COL.tallo2 : s.nivel >= 4 ? COL.flor : COL.hoja);
  }
  if (mostrados === 0 && objetivo > 0) {
    const s0 = segmentos[0];
    console.log("[jardin] " + PLANTAS[cantero].nombre + " (cantero " + cantero + "): " +
                segmentos.length + " seg, escala x" + escalaActual.toFixed(2) +
                ", base " + s0.x.toFixed(1) + "," + s0.z.toFixed(1) +
                ", largo0 " + s0.largo.toFixed(2));
  }
  mostrados = objetivo;

  const t = Math.floor(ahora / 200);
  if (t === tic) return;
  tic = t;
  texto("jd_dato", mostrados + " de " + segmentos.length + " segmentos" +
        (mostrados >= segmentos.length ? " · lista" : " · creciendo"));
}

requestAnimationFrame(frame);
