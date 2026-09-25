// El banco de pruebas: corre un test, sube la carga por pasos y da un puntaje.
//
// Cómo puntúa
// -----------
// Cada test arranca con una carga chica y la multiplica hasta que el motor se
// cae. El puntaje es **el último valor que aguantó**, no un promedio: la
// pregunta que interesa es "cuántos entran", no "qué tan rápido va con pocos".
//
// Un paso "aguanta" si la fracción de frames que se pasan del **presupuesto**
// queda por debajo de la tolerancia.
//
//   piso         el frame típico con la escena quieta. En VR es el vsync.
//   presupuesto  max(piso, PRESUPUESTO_MIN). En VR manda el vsync: cualquier
//                frame por encima es un frame perdido, que es la definición
//                que importa ahí. En escritorio el motor corre suelto y no hay
//                vsync que ponga la vara, así que la pone PRESUPUESTO_MIN.
//
// La referencia tiene que ser el presupuesto y no el piso. Comparando contra el
// piso, cualquier carga real "falla": subir el frame de 2,5 a 5 ms no es
// caerse, es estar cargado. Con esa cuenta todos los tests daban "cae ya" en el
// primer paso.
//
// El piso, además, es la *mediana* del ocioso y no el mínimo: los tiempos de
// frame tienen jitter y el mínimo cae por debajo del frame corriente.
//
// Por qué no se puntúa con FPS: en escritorio el motor corre suelto y el tiempo
// de frame significa algo, pero en VR está clavado al vsync del visor (11,1 ms
// a 90 Hz) aunque la GPU esté durmiendo. Un promedio de FPS no se mueve hasta
// que ya es tarde — es exactamente el error que hizo que el streaming de las
// backrooms no montara nada en VR y pareciera estar bien. La fracción de frames
// perdidos sí se mueve en los dos modos.
//
// Los puntajes quedan en el panel y en la consola ("[puntaje] ..."). No se
// mandan a ningún lado: el banco es estático y corre igual desde cualquier
// servidor de archivos.

/** Los tests del panel, en el orden de CORRER TODO. El id es el de los botones
 *  (btn_<id>) y los puntajes (res_<id>) de index.hsml. */
const TESTS_CFG = [
  { id: "figuras", unidad: "figuras" },
  { id: "includes", unidad: "includes" },
  { id: "animados", unidad: "isolates" },
  { id: "modelos", unidad: "modelos" },
  { id: "montaje", unidad: "inc/s" },
  { id: "montaje_animado", unidad: "inc/s" },
  { id: "scroll", unidad: "inc/s" },
];

// ---------------------------------------------------------------- parámetros
// Por query: index.hsml?auto=todo&tolerancia=5. Se pregunta por
// Number.isFinite y no por || porque 0 es válido en varios (quietas=0).
const Q = new URLSearchParams(location.search);
function param(k, def, min, max) {
  const v = Q.get(k);
  const x = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : def;
}
/** Entidades quietas de fondo en el test de scroll. */
const QUIETAS = Math.trunc(param("quietas", 4000, 0, 100000));
/** Centro y radio de la nube de carga, en metros. */
const CENTRO = [0, 10, -26];
const RADIO = param("radio", 14, 1, 200);
/** Lado de cada figura suelta y escala de los modelos. Las piezas y los
 *  animados son archivos fijos: 8 cajas de 0,5 m cada uno. */
const LADO = param("lado", 0.5, 0.01, 20);
/** % de frames lentos que se tolera antes de dar por caído un paso. Es la
 *  perilla que decide si el puntaje mide "no se nota nada" o "se banca a los
 *  tirones". */
const TOLERANCIA = param("tolerancia", 10, 0, 100);
/** Vara de escritorio, en ms: 8,33 = 120 Hz. Sin vsync que la ponga, hay que
 *  elegirla; con ?presupuesto= se mueve. */
const PRESUPUESTO_MIN = param("presupuesto", 8.33, 1, 100);
const ASENTAR = param("asentar", 0.8, 0.1, 30) * 1000;
const MEDIR = param("medir", 2.5, 0.3, 60) * 1000;
/** Test que arranca solo al cargar, o "todo". Existe para poder correr el
 *  banco desde afuera: por MCP se puede navegar y capturar, pero no tocar un
 *  botón. */
const AUTO = Q.get("auto") || "";

// Relativas a este documento, así el banco anda servido desde cualquier lado.
const PIEZA = new URL("./pieza.hsml", location.href).href;
const ANIMADO = new URL("./animado.hsml", location.href).href;
const MODELOS = new URL("./models/", location.href).href;

/** Pasos de rampa como mucho. Con factor 1.7 son casi tres órdenes de magnitud:
 *  de sobra para encontrar el techo, y pone un tope al tiempo de una corrida. */
const PASOS_MAX = 9;
const FACTOR = 1.7;

const root = hiperspace.dimention;
const COLORES = ["#C2AE5E", "#7EA6C2", "#C27E9B", "#8FC27E", "#C29A7E"];
const GLBS = ["caja.glb", "bidon.glb", "tuberia.glb"];

let carga = null;
let estado = null;
let listo = false;

// ---------------------------------------------------------------- geometría
/** Espiral de Fibonacci: reparte los nodos parejo
 *  sobre una esfera para que todos queden a la misma distancia de la cámara.
 *  Si se apilaran en una grilla plana, el costo de dibujarlos dependería de
 *  hacia dónde se mira y dos corridas no serían comparables. */
function puntoEsfera(i, n, r) {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(1, n));
  const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
  return [
    CENTRO[0] + r * Math.sin(phi) * Math.cos(theta),
    CENTRO[1] + r * Math.cos(phi),
    CENTRO[2] + r * Math.sin(phi) * Math.sin(theta),
  ];
}

/** Todo lo que creó el test en curso, para poder desarmarlo entero. */
let creados = [];

function crear(tag, attrs) {
  const el = root.createElement(tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  carga.appendChild(el);
  creados.push(el);
  return el;
}

function limpiar() {
  for (const el of creados) el.remove();
  creados = [];
}

function ponerFigura(i, n) {
  const p = puntoEsfera(i, n, RADIO);
  return crear("box", {
    x: p[0].toFixed(3),
    y: p[1].toFixed(3),
    z: p[2].toFixed(3),
    sx: LADO,
    sy: LADO,
    sz: LADO,
    color: COLORES[i % COLORES.length],
    touchable: "false",
  });
}

function ponerPieza(i, n) {
  const p = puntoEsfera(i, n, RADIO);
  return crear("include", {
    // Una URL por pieza, como los chunks de verdad. El contenido es el mismo.
    src: PIEZA + "?sem=" + i,
    x: p[0].toFixed(3),
    y: p[1].toFixed(3),
    z: p[2].toFixed(3),
  });
}

// -------------------------------------------------------------------- tests
//
// `cantidad`: el número que se barre es cuántos hay a la vez.
// `tasa`:     el número que se barre es cuántos por segundo se montan.
//             Sostener y montar son costos distintos, y en las backrooms el que
//             dolía era el segundo, así que se miden aparte.
const TESTS = {
  figuras: {
    tipo: "cantidad",
    n0: 1000,
    armar(n) {
      for (let i = 0; i < n; i++) ponerFigura(i, n);
    },
  },

  includes: {
    tipo: "cantidad",
    n0: 60,
    armar(n) {
      for (let i = 0; i < n; i++) ponerPieza(i, n);
    },
  },

  animados: {
    tipo: "cantidad",
    n0: 30,
    armar(n) {
      for (let i = 0; i < n; i++) {
        const p = puntoEsfera(i, n, RADIO);
        crear("include", {
          src: ANIMADO + "?fase=" + ((i * 2.399) % 6.283).toFixed(3),
          x: p[0].toFixed(3),
          y: p[1].toFixed(3),
          z: p[2].toFixed(3),
        });
      }
    },
  },

  modelos: {
    tipo: "cantidad",
    n0: 500,
    armar(n) {
      for (let i = 0; i < n; i++) {
        const p = puntoEsfera(i, n, RADIO);
        crear("model", {
          src: MODELOS + GLBS[0],
          x: p[0].toFixed(3),
          y: p[1].toFixed(3),
          z: p[2].toFixed(3),
          ry: ((i * 0.7) % 6.283).toFixed(3),
          s: LADO,
        });
      }
    },
  },

  // Montar de golpe: desde vacío, r includes por segundo mientras dura la
  // medición. Mide el tirón de montar, no el de sostener.
  montaje: {
    tipo: "tasa",
    n0: 3,
    armar() {
      this.puestos = 0;
      this.deuda = 0;
    },
    tick(dtSeg, r) {
      this.deuda += dtSeg * r;
      while (this.deuda >= 1) {
        ponerPieza(this.puestos++, 512);
        this.deuda -= 1;
      }
    },
  },

  // Same rate ramp and placement as montaje, with an animated document.
  montaje_animado: {
    tipo: "tasa",
    n0: 3,
    armar() { this.puestos = 0; this.deuda = 0; },
    tick(dtSeg, r) {
      this.deuda += dtSeg * r;
      while (this.deuda >= 1) {
        const i = this.puestos++;
        const p = puntoEsfera(i, 512, RADIO);
        crear("include", {
          src: ANIMADO + "?fase=" + ((i * 2.399) % 6.283).toFixed(3),
          x: p[0].toFixed(3), y: p[1].toFixed(3), z: p[2].toFixed(3),
        });
        this.deuda -= 1;
      }
    },
  },

  // Scroll tipo backrooms: un fondo grande de entidades quietas más un anillo
  // de includes que entra y sale sin parar, que es exactamente la forma del
  // streaming por chunks. Lo que se busca es cuánto recambio aguanta *sin*
  // que se note, teniendo ya mucho montado y quieto.
  scroll: {
    tipo: "tasa",
    n0: 1,
    // El fondo quieto tarda en armarse: si se midiera enseguida, se estaría
    // midiendo la construcción del fondo y no el recambio.
    asentar: 2500,
    armar() {
      for (let i = 0; i < QUIETAS; i++) ponerFigura(i, QUIETAS);
      // El anillo arranca lleno: si no, los primeros segundos serían montaje
      // puro y no recambio.
      this.anillo = [];
      this.sem = 0;
      for (let i = 0; i < this.tamAnillo; i++) this.anillo.push(ponerPieza(this.sem++, this.tamAnillo));
      this.deuda = 0;
    },
    /** Chunks vivos a la vez. Fijo a propósito: lo que se barre es el recambio,
     *  no cuántos hay — eso ya lo mide el test de includes. */
    tamAnillo: 48,
    tick(dtSeg, r) {
      this.deuda += dtSeg * r;
      while (this.deuda >= 1) {
        const viejo = this.anillo.shift();
        if (viejo) {
          viejo.remove();
          const i = creados.indexOf(viejo);
          if (i >= 0) creados.splice(i, 1);
        }
        this.anillo.push(ponerPieza(this.sem++, this.tamAnillo));
        this.deuda -= 1;
      }
    },
  },
};

// ------------------------------------------------------------------ medición
/** Tiempo de frame típico con la escena vacía. En VR es el período de vsync. */
let piso = 0;
/** Lo que se considera un frame entregado a tiempo. */
let presupuesto = PRESUPUESTO_MIN;
let dts = [];
/** Muestras del arranque, para sacar el piso. */
let dtsPiso = [];

function resumen() {
  const orden = dts.slice().sort((a, b) => a - b);
  const q = (p) => (orden.length ? orden[Math.min(orden.length - 1, Math.round((orden.length - 1) * p))] : 0);
  // Un poco de holgura sobre el presupuesto: medido desde JS, el frame llega
  // con jitter propio del bucle y un corte exacto contaría perdidos de más.
  const corte = presupuesto * 1.2;
  let lentos = 0;
  for (const d of dts) if (d > corte) lentos++;
  return {
    frames: dts.length,
    p50: q(0.5),
    p95: q(0.95),
    peor: q(1),
    tirones: dts.length ? (lentos / dts.length) * 100 : 100,
  };
}

// ------------------------------------------------------------------ display
function texto(id, valor) {
  const el = root.getElementById(id);
  if (el) el.setAttribute("value", String(valor));
}

function decir(s) {
  texto("estado", s);
  console.log("[stress] " + s);
}

/** Una línea por test en la consola, con los números del paso que aguantó. */
function reportar(id, puntaje, r) {
  console.log(
    "[puntaje] " + id + ": " + puntaje + " " + unidad(id) +
      " — frames " + r.frames +
      " piso " + piso.toFixed(2) +
      " presupuesto " + presupuesto.toFixed(2) +
      " p50 " + r.p50.toFixed(2) +
      " p95 " + r.p95.toFixed(2) +
      " peor " + r.peor.toFixed(2) +
      " tirones " + r.tirones.toFixed(1) + "%",
  );
}

// -------------------------------------------------------------- máquina de estados
let fase = "piso"; // piso -> libre -> asentar -> medir
let t0 = 0;
let cola = [];
let actual = null; // { id, test, n, paso, mejor, mejorR }

function unidad(id) {
  for (const t of TESTS_CFG) if (t.id === id) return t.unidad;
  return "";
}

function arrancarTest(id) {
  if (actual) return;
  actual = { id: id, test: TESTS[id], n: TESTS[id].n0, paso: 0, mejor: 0, mejorR: null, reintento: false };
  texto("res_" + id, "...");
  arrancarPaso();
}

function arrancarPaso() {
  limpiar();
  dts = [];
  actual.test.armar(actual.n);
  fase = "asentar";
  t0 = 0;
  decir(actual.id + ": probando " + actual.n + " " + unidad(actual.id));
}

function terminarPaso() {
  const r = resumen();
  const paso = r.tirones <= TOLERANCIA;
  if (paso) {
    actual.mejor = actual.n;
    actual.mejorR = r;
    actual.reintento = false;
  }
  actual.paso++;
  if (paso && actual.paso < PASOS_MAX) {
    actual.n = Math.max(actual.n + 1, Math.round(actual.n * FACTOR));
    arrancarPaso();
    return;
  }
  // Un paso que falla se repite una vez antes de darlo por perdido. Sin esto un
  // pico suelto —otra ventana del sistema, una pausa del recolector— corta el
  // test antes de tiempo: el mismo eje daba 1700 en una corrida y 2890 en la
  // siguiente.
  if (!paso && !actual.reintento && actual.paso < PASOS_MAX) {
    actual.reintento = true;
    arrancarPaso();
    return;
  }

  // Se acabó: el puntaje es el último que aguantó.
  const id = actual.id;
  const mejor = actual.mejor;
  texto("res_" + id, mejor > 0 ? mejor + " " + unidad(id) : "cae ya");
  if (actual.mejorR) reportar(id, mejor, actual.mejorR);
  // Los números del último paso van al cartel: sin consola accesible desde
  // afuera, es la única forma de ver por qué un test no pasa.
  decir(
    id +
      ": " +
      (mejor > 0 ? mejor + " " + unidad(id) : "cae en " + actual.n) +
      "  [piso " + piso.toFixed(2) +
      " corte " + (presupuesto * 1.2).toFixed(2) +
      " p50 " + r.p50.toFixed(2) +
      " p95 " + r.p95.toFixed(2) +
      " tirones " + r.tirones.toFixed(0) + "%]",
  );
  limpiar();
  actual = null;
  fase = "libre";

  if (cola.length) arrancarTest(cola.shift());
}

// ----------------------------------------------------------------- entrada
function conectarBotones() {
  for (const t of TESTS_CFG) {
    const b = root.getElementById("btn_" + t.id);
    if (!b) return false;
    b.addEventListener("toque", () => {
      if (actual) {
        decir("hay un test corriendo");
        return;
      }
      cola = [];
      arrancarTest(t.id);
    });
  }
  const todo = root.getElementById("btn_todo");
  if (!todo) return false;
  todo.addEventListener("toque", () => {
    if (actual) {
      decir("hay un test corriendo");
      return;
    }
    cola = TESTS_CFG.map((t) => t.id);
    arrancarTest(cola.shift());
  });
  return true;
}

// -------------------------------------------------------------------- bucle
let anterior = 0;

function frame(ahora) {
  requestAnimationFrame(frame);

  if (!listo) {
    carga = root.getElementById("carga");
    estado = root.getElementById("estado");
    if (!carga || !estado) return;
    if (!conectarBotones()) return;
    listo = true;
    t0 = ahora;
    decir("midiendo el piso...");
  }

  const dt = anterior ? ahora - anterior : 0;
  anterior = ahora;
  if (dt <= 0) return;

  // El piso se mide con la escena vacía y una sola vez: es el techo del equipo
  // (o el vsync del visor), no algo que dependa del test.
  if (fase === "piso") {
    // Los primeros segundos traen el armado de la escena y la carga de los
    // assets; el piso sale del tramo final, cuando el lobby ya está quieto. Si
    // se mide antes, sale un piso más alto que el p50 con carga — pasó.
    if (ahora - t0 > 3000) dtsPiso.push(dt);
    if (ahora - t0 > 6000) {
      const orden = dtsPiso.slice().sort((a, b) => a - b);
      piso = orden[Math.floor(orden.length / 2)] || 16;
      presupuesto = Math.max(piso, PRESUPUESTO_MIN);
      fase = "libre";
      decir("piso " + piso.toFixed(2) + " ms, presupuesto " + presupuesto.toFixed(2) + " ms — tocá un test");
      if (AUTO === "todo") {
        cola = TESTS_CFG.map((t) => t.id);
        arrancarTest(cola.shift());
      } else if (AUTO && TESTS[AUTO]) {
        arrancarTest(AUTO);
      }
    }
    return;
  }

  if (fase === "libre") return;

  const test = actual.test;
  if (test.tick) test.tick(dt / 1000, actual.n);

  if (fase === "asentar") {
    // t0 se pone acá y no en arrancarPaso porque ahí no hay reloj de frame: el
    // paso empieza a contar desde el primer frame después de armar la carga.
    if (!t0) t0 = ahora;
    if (ahora - t0 < (test.asentar || ASENTAR)) return;
    fase = "medir";
    t0 = ahora;
    return;
  }

  dts.push(dt);
  if (ahora - t0 > MEDIR) terminarPaso();
}

requestAnimationFrame(frame);
console.log("[stress] listo:", location.href);
