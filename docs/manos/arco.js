// El arco: tomarlo, cargar una flecha, tensar, soltar, y darle a algo.
//
// Todo con los mandos de VR, por el mismo canal que el manipulador: el posezone
// manda en cada cuadro la posición y el giro de cada mano, el grip y el
// gatillo.
//
//   grip cerca del arco            tomarlo (queda en esa mano)
//   la otra mano, grip o gatillo   cargar la flecha, si está cerca de la cuerda
//   alejar esa mano                tensar: la cuerda se abre y la flecha retrocede
//   soltar                         disparar; más tensión, más velocidad
//   soltar el grip del arco        el arco vuelve a su soporte
//
// El arco va pegado a la mano que lo sostiene, con el giro que tenía al
// tomarlo: si la muñeca rota, el arco rota con ella, rolido incluido. Es la
// misma unión rígida del manipulador, y no un "arco siempre derecho", que
// facilita el tiro pero se siente como un arco de feria colgado del control.
//
// Al tensar, la dirección del tiro sale de las dos manos: la flecha va de la
// mano que tensa hacia la mano del arco, como en uno de verdad. Lo que sigue
// mandando la muñeca es hacia dónde queda el "arriba" del arco: se puede tirar
// con el arco ladeado.
//
// Las flechas vuelan en este script, no en un motor de física: posición,
// velocidad y gravedad, con el tramo recorrido en cada paso probado contra las
// dianas (planos con radio), los globos (esferas) y el piso. Clavada, una
// flecha se queda donde pegó; en el blanco que se mueve, se mueve con él.
//
// Rondas de doce flechas. El mejor puntaje queda en localStorage.
//
// Suena todo lo que pasa (tomar, cargar, tensar, soltar, cada impacto, el fin
// de la ronda), con clips sintetizados en el propio script: ver "Sonido".
const root = hiperspace.dimention;
const byId = (id) => root.getElementById(id);

// ── Parámetros ──────────────────────────────────────────────────────────────
const APRETAR = 0.6, AFLOJAR = 0.35;   // histéresis de grip y gatillo
const RADIO_TOMAR = 0.2;     // m: distancia de la mano al arco para tomarlo
const RADIO_CARGAR = 0.25;   // m: distancia de la mano a la cuerda para cargar
const BRAZO = 0.72;          // m: media altura del arco (de la empuñadura a la punta)
const REPOSO = 0.16;         // m: la cuerda floja, detrás de la empuñadura
const TENSION_MAX = 0.62;    // m: hasta dónde se abre la cuerda
const TENSION_MIN = 0.06;    // m: menos que esto al soltar es arrepentirse, no tirar
const V_MIN = 9, V_MAX = 56; // m/s según la tensión
const LARGO = 0.8;           // m: la flecha, del culatín a la punta
const CLAVA = 0.12;          // m: cuánto se entierra la punta
const G = 9.8;
const POOL = 18;             // flechas a la vez; la más vieja se recicla
const POR_RONDA = 12;
const MANO_VIEJA_MS = 400;
const CLAVE_RECORD = "arco:record";

/** Donde descansa el arco: a la derecha y adelante de la llegada. */
const SOPORTE = { x: 0.6, y: 1.05, z: -0.55 };

/** Las dianas. Miran al origen, que es la línea de tiro. `mueve`: va y viene
 *  en X colgada de un riel. */
const DIANAS = [
  { id: "cerca", x: -2.4, y: 1.3, z: -9, r: 0.55 },
  { id: "medio", x: 2.2, y: 1.5, z: -16, r: 0.75 },
  { id: "lejos", x: -0.6, y: 1.9, z: -26, r: 1.0 },
  { id: "movil", x: 0, y: 2.3, z: -13, r: 0.42, mueve: { amp: 3.2, vel: 0.55 }, extra: 2 },
];
/** Anillos de afuera hacia adentro: color y puntos. */
const ANILLOS = [
  { k: 1.0, color: "#F4F4F4", puntos: 2 },
  { k: 0.8, color: "#1C1C1C", puntos: 4 },
  { k: 0.6, color: "#0A84FF", puntos: 6 },
  { k: 0.4, color: "#FF3B30", puntos: 8 },
  { k: 0.2, color: "#FFD60A", puntos: 10 },
];
const COLORES_GLOBO = ["#FF3B30", "#FFD60A", "#30D158", "#0A84FF", "#BF5AF2", "#FF9F0A"];
const GLOBOS = 6;
const RADIO_GLOBO = 0.24;

// ── Álgebra ─────────────────────────────────────────────────────────────────
// La misma del manipulador. Repetida a propósito: dos <script src> llegan en
// cualquier orden, y compartir un archivo obliga a esperar al otro.
const v3 = (x, y, z) => ({ x, y, z });
const suma = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const resta = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const por = (a, k) => v3(a.x * k, a.y * k, a.z * k);
const punto = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cruz = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const largo = (a) => Math.hypot(a.x, a.y, a.z);
const unitario = (a) => { const l = largo(a) || 1; return por(a, 1 / l); };
const ARRIBA = v3(0, 1, 0);

function qMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
const qConj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
function qNormal(q) {
  const m = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / m, y: q.y / m, z: q.z / m, w: q.w / m };
}
function rotar(q, v) {
  const r = qMul(qMul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), qConj(q));
  return v3(r.x, r.y, r.z);
}
/** El cuaternión de una base ortonormal (las columnas X, Y, Z). */
function qDeBase(X, Y, Z) {
  const t = X.x + Y.y + Z.z;
  let q;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    q = { w: s / 4, x: (Y.z - Z.y) / s, y: (Z.x - X.z) / s, z: (X.y - Y.x) / s };
  } else if (X.x > Y.y && X.x > Z.z) {
    const s = Math.sqrt(1 + X.x - Y.y - Z.z) * 2;
    q = { w: (Y.z - Z.y) / s, x: s / 4, y: (Y.x + X.y) / s, z: (Z.x + X.z) / s };
  } else if (Y.y > Z.z) {
    const s = Math.sqrt(1 + Y.y - X.x - Z.z) * 2;
    q = { w: (Z.x - X.z) / s, x: (Y.x + X.y) / s, y: s / 4, z: (Z.y + Y.z) / s };
  } else {
    const s = Math.sqrt(1 + Z.z - X.x - Y.y) * 2;
    q = { w: (X.y - Y.x) / s, x: (Z.x + X.z) / s, y: (Z.y + Y.z) / s, z: s / 4 };
  }
  const m = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / m, y: q.y / m, z: q.z / m, w: q.w / m };
}
/** Una orientación cuyo -Z local apunta a `frente`, con el +Y lo más cerca
 *  posible de `arriba` (por defecto, el del mundo). */
function qMirando(frente, arriba = ARRIBA) {
  const Z = por(unitario(frente), -1);
  let Y = resta(arriba, por(Z, punto(arriba, Z)));
  if (largo(Y) < 1e-3) Y = resta(ARRIBA, por(Z, punto(ARRIBA, Z)));
  if (largo(Y) < 1e-3) Y = resta(v3(0, 0, -1), por(Z, punto(v3(0, 0, -1), Z)));
  Y = unitario(Y);
  return qDeBase(cruz(Y, Z), Y, Z);
}
/** Euler XYZ intrínseco, que es lo que el motor arma con Quat::from_euler. */
function eulerDeQ(q) {
  const { x, y, z, w } = q;
  const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - w * z), m02 = 2 * (x * z + w * y);
  const m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - w * x);
  const m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.max(-1, Math.min(1, m02)));
  if (Math.abs(m02) < 0.9999999) return v3(Math.atan2(-m12, m22), ey, Math.atan2(-m01, m00));
  return v3(Math.atan2(m21, m11), ey, 0);
}
const acotar = (v, a, b) => Math.max(a, Math.min(b, v));
/** Un azar estable: los globos reaparecen siempre en la misma secuencia. */
function azar(i) {
  let h = Math.imul(i + 977, 374761393);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ── Sonido ──────────────────────────────────────────────────────────────────
// Sintetizado acá, como en server_nave: cada clip se arma una vez como WAV en
// memoria y se le pasa al `Audio` del motor, que acepta bytes. No hay archivos
// de audio que versionar, y afinar un sonido es cambiar un número.
//
// El audio de Luna no es espacial, así que la distancia se hace con volumen:
// un impacto a 26 m suena más flojo que uno a 9.
//
// Sin el permiso `audio` —o en el arnés de pruebas, donde no hay mezclador—
// `Audio` no existe y `sonar()` no hace nada.
const sonido = (() => {
  const HZ = 22050;
  const VOL = 0.3;

  /** Un WAV mono de 16 bits a partir de muestras en -1..1. */
  function wav(pcm) {
    const n = pcm.length;
    const b = new Uint8Array(44 + n * 2);
    const v = new DataView(b.buffer);
    const txt = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
    txt(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); txt(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, HZ, true); v.setUint32(28, HZ * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, acotar(pcm[i], -1, 1) * 32767, true);
    return b;
  }

  /** `fn(t, u)` con t en segundos y u de 0 a 1. Los primeros 2 ms entran en
   *  rampa: sin eso cada clip arranca con un chasquido. */
  function armar(dur, fn) {
    const n = Math.floor(HZ * dur);
    const a = new Float32Array(n);
    const ataque = HZ * 0.002;
    for (let i = 0; i < n; i++) a[i] = fn(i / HZ, i / n) * VOL * Math.min(1, i / ataque);
    return a;
  }

  const seno = (t, f) => Math.sin(2 * Math.PI * f * t);
  const caida = (u, k) => Math.exp(-u * k);
  /** Ruido con semilla fija, pasado por un filtro de un polo: `k` cerca de 0
   *  es un golpe sordo, cerca de 1 un siseo. */
  function ruido(k, semilla) {
    let x = semilla || 0x2545f491, y = 0;
    return () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      y += k * (((x >>> 0) / 2147483648 - 1) - y);
      return y;
    };
  }
  /** La cuerda: una fundamental que cae un poco de tono con sus armónicos, y
   *  los agudos muriendo antes que el grave, que es lo que la hace sonar a
   *  cuerda y no a pito. */
  function cuerda(t, u, f) {
    const g = f * (1 - 0.06 * u);
    return seno(t, g) * caida(u, 4) + 0.5 * seno(t, g * 2) * caida(u, 7) + 0.25 * seno(t, g * 3) * caida(u, 11);
  }
  function notas(frecuencias, dur) {
    return armar(dur * frecuencias.length, (t) => {
      const i = Math.min(frecuencias.length - 1, Math.floor(t / dur));
      const tl = t - i * dur, u = tl / dur;
      return (seno(tl, frecuencias[i]) + 0.3 * seno(tl, frecuencias[i] * 2)) * 0.7 * caida(u, 3);
    });
  }

  const CLIPS = {
    // Tomar el arco del soporte: la mano contra la madera.
    tomar: () => { const r = ruido(0.25, 11); return armar(0.09, (t, u) => (r() * 1.6 + seno(t, 170) * 0.6) * caida(u, 7)); },
    // Colgarlo de nuevo: un golpe de madera más seco.
    dejar: () => { const r = ruido(0.35, 12); return armar(0.12, (t, u) => (r() * 1.2 + seno(t, 240) * 0.7) * caida(u, 9)); },
    // Encajar la flecha en la cuerda: un clic corto.
    cargar: () => { const r = ruido(0.9, 13); return armar(0.045, (t, u) => (r() * 0.6 + seno(t, 2300) * 0.5) * caida(u, 10)); },
    // La madera que cruje al tensar. Suena por tramos de tensión.
    cruje: () => { const r = ruido(0.5, 14); return armar(0.13, (t, u) => r() * (0.5 + 0.5 * seno(t, 38)) * Math.sin(Math.PI * u) * 1.4); },
    // Soltar: la cuerda vibra y la flecha sale silbando.
    disparo: () => { const r = ruido(0.6, 15); return armar(0.4, (t, u) => cuerda(t, u, 118) * 0.8 + r() * caida(u, 14) * 0.9); },
    // Clavarse en el fardo de paja: un golpe sordo.
    diana: () => { const r = ruido(0.12, 16); return armar(0.2, (t, u) => (r() * 3 + seno(t, 85) * 0.8) * caida(u, 8)); },
    // Al centro: una campanita, además del golpe.
    centro: () => armar(0.7, (t, u) => (seno(t, 1318) + 0.6 * seno(t, 1976) + 0.3 * seno(t, 2637)) * 0.55 * caida(u, 4)),
    // Un globo que revienta: ruido abierto y cortísimo.
    globo: () => { const r = ruido(0.95, 17); return armar(0.08, (t, u) => r() * 1.5 * caida(u, 16)); },
    // Al pasto: más flojo y más apagado que la paja.
    pasto: () => { const r = ruido(0.07, 18); return armar(0.14, (t, u) => r() * 3 * caida(u, 9)); },
    // Botón de ronda nueva.
    boton: () => armar(0.06, (t, u) => seno(t, 1250) * caida(u, 9)),
    // Fin de ronda, y fin de ronda con récord.
    ronda: () => notas([523, 659, 784], 0.14),
    record: () => notas([523, 659, 784, 1047, 1319], 0.12),
  };

  const voces = {};
  let hay = typeof Audio === "function";

  function voz(nombre) {
    let v = voces[nombre];
    if (!v) {
      v = new Audio(wav(CLIPS[nombre]()));
      v.nombre = nombre;
      voces[nombre] = v;
    }
    return v;
  }

  function fallo(e) {
    const msg = (e && e.message) || String(e);
    // Volver a tocar un clip antes de que arranque cancela el play anterior
    // ("Audio play cancelled"): es el uso normal, no un fallo. Apagar el
    // sonido por eso lo dejaba mudo el resto de la sesión.
    if (/cancel/i.test(msg)) return;
    hay = false;
    console.warn("[arco] sin sonido:", msg);
  }

  /** `volumen` de 0 a 1. */
  function sonar(nombre, volumen = 1) {
    if (!hay || !CLIPS[nombre]) return;
    try {
      const v = voz(nombre);
      v.volume = acotar(volumen, 0, 1);
      // Volver a empezar: sin el stop, un clip que ya terminó no vuelve a sonar.
      try { v.stop(); } catch (e) { /* todavía no cargó: play lo arranca igual */ }
      const p = v.play();
      if (p && p.catch) p.catch(fallo);
    } catch (e) {
      fallo(e);
    }
  }

  /** Decodificar todo al entrar: el primer play de cada clip, si no, llega
   *  tarde, y un disparo que suena 100 ms después de soltar no es un disparo.
   *  Son 12 voces de las 16 que tiene el espacio. */
  if (hay) {
    try {
      for (const nombre in CLIPS) {
        const p = voz(nombre).load();
        if (p && p.catch) p.catch(fallo);
      }
    } catch (e) {
      fallo(e);
    }
  }

  /** Volumen de algo que pasa a `d` metros de la línea de tiro. */
  const lejos = (d) => acotar(1.15 - d / 35, 0.35, 1);

  return { sonar, lejos };
})();
const { sonar } = sonido;

// ── Nodos ───────────────────────────────────────────────────────────────────
function crear(tag, attrs, padre) {
  const el = root.createElement(tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  padre.appendChild(el);
  return el;
}
const zona = byId("zona");
const escenario = byId("escenario") || root;
function poner(el, p, q) {
  el.position = p;
  if (q) el.rotation = eulerDeQ(q);
}

// El soporte: un poste con un travesaño donde cuelga el arco.
crear("cylinder", { x: SOPORTE.x, y: 0.48, z: SOPORTE.z - 0.1, sx: 0.06, sy: 0.96, sz: 0.06, color: "#5A3E2A", touchable: "false" }, escenario);
crear("box", { x: SOPORTE.x, y: 0.97, z: SOPORTE.z - 0.1, sx: 0.05, sy: 0.05, sz: 0.24, color: "#5A3E2A", touchable: "false" }, escenario);

// ── El arco ─────────────────────────────────────────────────────────────────
// Marco local: empuñadura en el origen, la flecha sale hacia -Z, los brazos
// en Y. Armado es una D: la empuñadura adelante y las puntas atrás, a la
// altura de la cuerda floja.
const arco = crear("group", { id: "arco" }, escenario);
const curva = (y) => REPOSO * Math.pow(Math.abs(y) / BRAZO, 1.7);
const TRAMOS = 6;
for (const s of [-1, 1]) {
  for (let i = 0; i < TRAMOS; i++) {
    const y0 = s * 0.07 + s * (BRAZO - 0.07) * (i / TRAMOS);
    const y1 = s * 0.07 + s * (BRAZO - 0.07) * ((i + 1) / TRAMOS);
    const z0 = curva(y0), z1 = curva(y1);
    const dy = y1 - y0, dz = z1 - z0;
    // Una caja larga en Y, girada en X hasta seguir la curva: (0, cos θ, sen θ).
    crear("box", {
      y: (y0 + y1) / 2, z: (z0 + z1) / 2, rx: Math.atan2(dz, dy),
      sx: 0.034 - i * 0.003, sy: Math.hypot(dy, dz) + 0.004, sz: 0.024 - i * 0.002,
      color: i === TRAMOS - 1 ? "#1C1C1C" : "#7A4A2A", touchable: "false",
    }, arco);
  }
}
crear("box", { sx: 0.042, sy: 0.15, sz: 0.042, color: "#FF3B30", touchable: "false" }, arco);   // empuñadura
crear("box", { x: -0.024, y: 0.06, sx: 0.012, sy: 0.02, sz: 0.03, color: "#1C1C1C", touchable: "false" }, arco); // apoyo
const PUNTA_ARRIBA = v3(0, BRAZO, REPOSO), PUNTA_ABAJO = v3(0, -BRAZO, REPOSO);
const cuerdaA = crear("box", { color: "#F4F4F4", touchable: "false" }, arco);
const cuerdaB = crear("box", { color: "#F4F4F4", touchable: "false" }, arco);

/** Una cuerda de a a b, en el plano YZ del arco. */
function tramoCuerda(el, a, b) {
  const d = resta(b, a);
  el.position = por(suma(a, b), 0.5);
  el.rotation = v3(Math.atan2(d.z, d.y), 0, 0);
  el.scale = v3(0.004, largo(d), 0.004);
}
let tensionDibujada = -1;
function dibujarCuerda(t) {
  if (t === tensionDibujada) return;
  tensionDibujada = t;
  const culatin = v3(0, 0, REPOSO + t);
  tramoCuerda(cuerdaA, PUNTA_ARRIBA, culatin);
  tramoCuerda(cuerdaB, culatin, PUNTA_ABAJO);
}
dibujarCuerda(0);

// ── Flechas ─────────────────────────────────────────────────────────────────
// Marco local: el culatín en el origen, la punta en -Z.
const flechas = [];
for (let i = 0; i < POOL; i++) {
  const g = crear("group", { id: "flecha_" + i, visible: "false" }, escenario);
  crear("cylinder", { z: -LARGO / 2, rx: Math.PI / 2, sx: 0.009, sy: LARGO, sz: 0.009, color: "#D8B98A", touchable: "false" }, g);
  crear("box", { z: -LARGO - 0.02, sx: 0.016, sy: 0.016, sz: 0.05, color: "#C8CCD8", touchable: "false" }, g);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    crear("box", {
      x: Math.cos(a) * 0.014, y: Math.sin(a) * 0.014, z: -0.08, rz: a,
      sx: 0.028, sy: 0.002, sz: 0.1, color: k === 0 ? "#FF3B30" : "#F4F4F4", touchable: "false",
    }, g);
  }
  crear("box", { z: 0.005, sx: 0.014, sy: 0.014, sz: 0.012, color: "#FFD60A", touchable: "false" }, g);
  flechas.push({ el: g, estado: "libre", p: null, v: null, dir: null, t: 0, ancla: null, off: null, orden: 0 });
}
let ordenFlechas = 0;
function tomarFlecha() {
  let f = flechas.find((x) => x.estado === "libre");
  if (!f) {
    // La más vieja de las clavadas. Una en vuelo no se recicla.
    f = flechas.filter((x) => x.estado === "clavada").sort((a, b) => a.orden - b.orden)[0];
  }
  if (!f) return null;
  f.orden = ++ordenFlechas;
  f.ancla = null;
  f.el.setAttribute("visible", "true");
  return f;
}
function soltarFlecha(f) {
  f.estado = "libre";
  f.ancla = null;
  f.el.setAttribute("visible", "false");
}

// ── Dianas ──────────────────────────────────────────────────────────────────
const dianas = DIANAS.map((d) => {
  const ry = Math.atan2(-d.x, -d.z);
  const g = crear("group", { id: "diana_" + d.id, x: d.x, y: d.y, z: d.z, ry }, escenario);
  // El fardo de paja detrás, y los anillos de afuera hacia adentro, cada uno
  // un pelo más adelante para que no peleen por el mismo plano.
  crear("cylinder", { rx: Math.PI / 2, sx: d.r * 2.25, sy: 0.12, sz: d.r * 2.25, color: "#C9A86A", touchable: "false" }, g);
  ANILLOS.forEach((a, i) => {
    crear("cylinder", {
      z: 0.062 + i * 0.004, rx: Math.PI / 2,
      sx: d.r * 2 * a.k, sy: 0.004, sz: d.r * 2 * a.k, color: a.color, touchable: "false",
    }, g);
  });
  if (d.mueve) {
    // Colgada: dos sogas hasta el riel.
    for (const s of [-1, 1]) crear("cylinder", { x: s * d.r * 0.7, y: d.r * 1.1 + 0.3, sx: 0.015, sy: 0.6, sz: 0.015, color: "#8A6546", touchable: "false" }, g);
  } else {
    // El caballete: dos patas abiertas y una tercera más atrás, todas detrás
    // del fardo. Adelante tapaban la cara de la diana, y como suben un poco
    // más arriba del centro, le cruzaban los anillos.
    const alto = d.y;
    for (const s of [-1, 1]) {
      crear("box", { x: s * d.r * 0.6, y: -alto / 2, z: -0.1, rz: s * 0.18, sx: 0.06, sy: alto + 0.3, sz: 0.06, color: "#6B4A30", touchable: "false" }, g);
    }
    crear("box", { y: -alto / 2, z: -0.45, rx: -0.4, sx: 0.06, sy: alto + 0.3, sz: 0.06, color: "#6B4A30", touchable: "false" }, g);
  }
  const normal = v3(Math.sin(ry), 0, Math.cos(ry));
  return { ...d, el: g, normal, centro: v3(d.x, d.y, d.z) };
});
// El riel del blanco móvil.
for (const d of dianas.filter((x) => x.mueve)) {
  const yRiel = d.y + d.r * 1.1 + 0.6;
  for (const s of [-1, 1]) {
    crear("box", { x: d.x + s * (d.mueve.amp + 0.8), y: yRiel / 2, z: d.z, sx: 0.12, sy: yRiel, sz: 0.12, color: "#5A3E2A", touchable: "false" }, escenario);
  }
  crear("box", { x: d.x, y: yRiel, z: d.z, sx: 2 * (d.mueve.amp + 0.8) + 0.12, sy: 0.08, sz: 0.08, color: "#5A3E2A", touchable: "false" }, escenario);
}

// ── Globos ──────────────────────────────────────────────────────────────────
let azarGlobo = 0;
function lugarGlobo() {
  const i = azarGlobo++;
  return v3(-5 + azar(i * 3) * 10, 1.9 + azar(i * 3 + 1) * 2.2, -7 - azar(i * 3 + 2) * 8);
}
const globos = [];
for (let i = 0; i < GLOBOS; i++) {
  const g = crear("group", { id: "globo_" + i }, escenario);
  const cuerpo = crear("sphere", { sx: RADIO_GLOBO * 2, sy: RADIO_GLOBO * 2.3, sz: RADIO_GLOBO * 2, color: COLORES_GLOBO[i % COLORES_GLOBO.length], touchable: "false" }, g);
  crear("sphere", { y: -RADIO_GLOBO * 1.15, sx: 0.05, sy: 0.05, sz: 0.05, color: COLORES_GLOBO[i % COLORES_GLOBO.length], touchable: "false" }, g);
  crear("cylinder", { y: -RADIO_GLOBO * 1.15 - 0.35, sx: 0.006, sy: 0.7, sz: 0.006, color: "#F4F4F4", touchable: "false" }, g);
  const base = lugarGlobo();
  globos.push({ el: g, cuerpo, base, fase: i * 1.7, vivo: true, reaparece: 0, pos: base });
}

// ── Avisos flotantes ("+10") ────────────────────────────────────────────────
const avisos = [];
for (let i = 0; i < 6; i++) {
  avisos.push({ el: crear("text", { value: "", size: 0.2, color: "#FFD60A", visible: "false" }, escenario), hasta: 0, desde: null, t0: 0 });
}
let avisoSig = 0;
/** Donde se guarda un aviso apagado: bajo el piso. Ocultar un <text> con
 *  visible="false" no andaba —el motor no aplicaba `visible` a un texto ya
 *  creado (arreglado en dom.rs)— y los "+10" quedaban flotando para siempre.
 *  Mandarlo lejos lo apaga también en un Luna sin ese arreglo. */
const GUARDADO = v3(0, -50, 0);
function apagarAviso(a) {
  a.desde = null;
  a.el.setAttribute("visible", "false");
  a.el.position = GUARDADO;
}
function avisar(p, texto, color, ahora) {
  const a = avisos[avisoSig++ % avisos.length];
  const dist = largo(p);
  a.el.setAttribute("value", texto);
  a.el.setAttribute("color", color);
  a.el.setAttribute("size", String(0.14 + dist * 0.018));
  // "inherit" y no "true": "true" fija el nodo visible aunque su padre se oculte.
  a.el.setAttribute("visible", "inherit");
  a.desde = suma(p, v3(0, 0.25, 0));
  a.t0 = ahora;
  a.hasta = ahora + 1300;
  a.el.position = a.desde;
}

// ── Tablero y récord ────────────────────────────────────────────────────────
const tPuntos = byId("tablero_puntos");
const tFlechas = byId("tablero_flechas");
const tRecord = byId("tablero_record");
const tUltimo = byId("tablero_ultimo");
const juego = { puntos: 0, flechas: 0, record: 0, terminada: false };
try { juego.record = Math.max(0, Number(localStorage.getItem(CLAVE_RECORD)) || 0); } catch (e) { /* sin almacén */ }

function tablero() {
  if (tPuntos) tPuntos.setAttribute("value", String(juego.puntos));
  if (tFlechas) tFlechas.setAttribute("value", "flecha " + Math.min(juego.flechas, POR_RONDA) + " de " + POR_RONDA);
  if (tRecord) tRecord.setAttribute("value", "récord " + juego.record);
}
function ultimo(texto) {
  if (tUltimo) tUltimo.setAttribute("value", texto);
}
function nuevaRonda() {
  juego.puntos = 0;
  juego.flechas = 0;
  juego.terminada = false;
  tablero();
}
function cerrarRonda() {
  juego.terminada = true;
  if (juego.puntos > juego.record) {
    juego.record = juego.puntos;
    try { localStorage.setItem(CLAVE_RECORD, String(juego.record)); } catch (e) { /* sin almacén */ }
    ultimo("¡récord nuevo! " + juego.puntos + " puntos");
    sonar("record", 0.8);
  } else {
    ultimo("ronda: " + juego.puntos + " puntos");
    sonar("ronda", 0.7);
  }
  tablero();
}
function sumar(puntos) {
  juego.puntos += puntos;
  tablero();
}
tablero();
ultimo("tomá el arco del soporte");

const botonReiniciar = byId("reiniciar");
if (botonReiniciar) {
  botonReiniciar.addEventListener("toque", () => {
    for (const f of flechas) if (f.estado !== "cargada") soltarFlecha(f);
    sonar("boton");
    nuevaRonda();
    ultimo("ronda nueva");
  });
}

// ── Manos ───────────────────────────────────────────────────────────────────
const nuevaMano = () => ({ pos: null, q: null, grip: false, tira: false, t: 0 });
const IDENTIDAD = { x: 0, y: 0, z: 0, w: 1 };
const manos = { left: nuevaMano(), right: nuevaMano() };
const otra = (m) => (m === "left" ? "right" : "left");

/** Quién tiene el arco, y la flecha cargada si hay una. */
let manoArco = null;
let carga = null;   // { mano, flecha }
/** El giro del arco en el marco de la mano, fijado al tomarlo:
 *  giroArco = giroMano · qAgarre. */
let qAgarre = IDENTIDAD;
const Q_SOPORTE = qMirando(v3(0, 0, -1));

/** La pose del arco: en el soporte, o en la mano. */
function poseArco() {
  if (!manoArco) return { p: v3(SOPORTE.x, SOPORTE.y, SOPORTE.z), q: Q_SOPORTE, frente: v3(0, 0, -1) };
  const m = manos[manoArco];
  // Pegado a la mano, con todo su giro.
  const rigido = qMul(m.q || IDENTIDAD, qAgarre);
  if (carga && manos[carga.mano].pos) {
    const frente = resta(m.pos, manos[carga.mano].pos);
    if (largo(frente) > 1e-3) {
      // Tensado: el frente lo ponen las dos manos, el arriba la muñeca.
      const f = unitario(frente);
      return { p: m.pos, q: qMirando(f, rotar(rigido, ARRIBA)), frente: f };
    }
  }
  return { p: m.pos, q: rigido, frente: rotar(rigido, v3(0, 0, -1)) };
}

/** Distancia de un punto al eje del arco (de punta a punta). */
function distanciaAlArco(w) {
  const { p, q } = poseArco();
  const l = rotar(qConj(q), resta(w, p));
  const y = acotar(l.y, -BRAZO, BRAZO);
  return largo(v3(l.x, l.y - y, l.z - curva(y)));
}

function tension() {
  if (!carga || !manoArco) return 0;
  const d = largo(resta(manos[manoArco].pos, manos[carga.mano].pos));
  return acotar(d - REPOSO, 0, TENSION_MAX);
}

function dibujarArco() {
  const { p, q, frente } = poseArco();
  poner(arco, p, q);
  const t = tension();
  dibujarCuerda(Math.round(t * 200) / 200);
  if (carga) {
    // La flecha cargada: el culatín en la cuerda, la punta hacia adelante.
    const culatin = suma(p, rotar(q, v3(0, 0, REPOSO + t)));
    // La flecha rola con el arco: sus plumas no se quedan derechas si el
    // arco está ladeado.
    poner(carga.flecha.el, culatin, qMirando(frente, rotar(q, ARRIBA)));
  }
}

function tomarArco(mano) {
  manoArco = mano;
  // Se toma como está: el giro relativo a la mano en ese momento es el que
  // se conserva. Tomarlo con la muñeca girada no lo endereza de golpe.
  qAgarre = qMul(qConj(manos[mano].q || IDENTIDAD), Q_SOPORTE);
  sonar("tomar", 0.8);
  ultimo("cargá una flecha con la otra mano");
}
function dejarArco() {
  if (carga) { soltarFlecha(carga.flecha); carga = null; }
  manoArco = null;
  sonar("dejar", 0.7);
  dibujarArco();
}

function cargar(mano) {
  const f = tomarFlecha();
  if (!f) return;
  f.estado = "cargada";
  carga = { mano, flecha: f };
  cruje = CRUJE;
  sonar("cargar", 0.8);
}

/** La madera cruje cada CRUJE metros de cuerda abierta, más fuerte cuanto más
 *  tensa. Sólo al abrir: aflojar sin tirar no cruje. `cruje` es el próximo
 *  tramo que suena. */
const CRUJE = 0.14;
let cruje = CRUJE;
function crujir() {
  const t = tension();
  if (t >= cruje) {
    sonar("cruje", 0.35 + 0.65 * (t / TENSION_MAX));
    cruje = (Math.floor(t / CRUJE) + 1) * CRUJE;
  }
}

function disparar() {
  const t = tension();
  const f = carga.flecha;
  const { p, q, frente } = poseArco();
  carga = null;
  if (t < TENSION_MIN) {
    soltarFlecha(f);
    dibujarArco();
    return;
  }
  if (juego.terminada) nuevaRonda();
  sonar("disparo", 0.45 + 0.55 * (t / TENSION_MAX));
  const velocidad = V_MIN + (V_MAX - V_MIN) * (t / TENSION_MAX);
  f.estado = "vuela";
  f.p = suma(p, rotar(q, v3(0, 0, REPOSO + t)));
  f.v = por(frente, velocidad);
  f.dir = frente;
  f.t = 0;
  juego.flechas++;
  tablero();
  dibujarArco();
}

function onPose(evt) {
  const mano = evt.hand === "left" ? "left" : "right";
  const m = manos[mano];
  m.pos = v3(evt.px, evt.py, evt.pz);
  m.q = evt.qw != null ? qNormal({ x: evt.qx, y: evt.qy, z: evt.qz, w: evt.qw }) : null;
  m.t = performance.now();

  const g = evt.grip || 0;
  const tira = Math.max(g, evt.trigger || 0);
  const antesGrip = m.grip, antesTira = m.tira;
  if (!m.grip && g > APRETAR) m.grip = true;
  else if (m.grip && g < AFLOJAR) m.grip = false;
  if (!m.tira && tira > APRETAR) m.tira = true;
  else if (m.tira && tira < AFLOJAR) m.tira = false;

  if (mano === manoArco) {
    if (antesGrip && !m.grip) dejarArco();
  } else if (manoArco) {
    // La mano libre: cargar cerca de la cuerda, disparar al soltar.
    if (!antesTira && m.tira && !carga) {
      const { p, q } = poseArco();
      const cuerda = suma(p, rotar(q, v3(0, 0, REPOSO)));
      if (largo(resta(m.pos, cuerda)) < RADIO_CARGAR) cargar(mano);
    } else if (antesTira && !m.tira && carga && carga.mano === mano) {
      disparar();
    }
  } else if (!antesGrip && m.grip && distanciaAlArco(m.pos) < RADIO_TOMAR) {
    tomarArco(mano);
  }

  if (carga) crujir();
  if (manoArco) dibujarArco();
}
if (zona) zona.addEventListener("posemove", onPose);

// ── El cuadro ───────────────────────────────────────────────────────────────
/** El tramo a→b contra una diana. Devuelve el punto y la distancia al centro. */
function cortaDiana(a, b, d) {
  const cara = suma(d.centro, por(d.normal, 0.07));
  const den = punto(d.normal, resta(b, a));
  if (den >= -1e-9) return null;                 // de espaldas o paralelo
  const s = punto(d.normal, resta(cara, a)) / den;
  if (s < 0 || s > 1) return null;
  const h = suma(a, por(resta(b, a), s));
  const r = largo(resta(h, cara));
  return r <= d.r * 1.12 ? { h, r, s } : null;   // el fardo es un poco más grande
}
/** El tramo a→b contra una esfera. */
function cortaEsfera(a, b, c, radio) {
  const d = resta(b, a), f = resta(a, c);
  const A = punto(d, d), B = 2 * punto(f, d), C = punto(f, f) - radio * radio;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A < 1e-12) return null;
  const s = (-B - Math.sqrt(disc)) / (2 * A);
  return s >= 0 && s <= 1 ? s : null;
}

function clavar(f, punta, dir, ancla) {
  f.estado = "clavada";
  f.dir = dir;
  f.p = suma(punta, por(dir, -(LARGO - CLAVA)));
  f.ancla = ancla || null;
  if (ancla) f.off = resta(f.p, ancla.centro);
  poner(f.el, f.p, qMirando(dir));
}

function puntosDe(d, r) {
  let pts = 0;
  for (const a of ANILLOS) if (r <= d.r * a.k) pts = a.puntos;
  return pts * (d.extra || 1);
}

function volar(f, dt, ahora) {
  const PASOS = 3;
  for (let i = 0; i < PASOS; i++) {
    const h = dt / PASOS;
    const a = suma(f.p, por(f.dir, LARGO));   // la punta
    f.v = v3(f.v.x, f.v.y - G * h, f.v.z);
    const p1 = suma(f.p, por(f.v, h));
    const dir = unitario(f.v);
    const b = suma(p1, por(dir, LARGO));

    // Lo primero que corta el tramo es lo que se lleva la flecha.
    let mejor = null;
    for (const d of dianas) {
      const c = cortaDiana(a, b, d);
      if (c && (!mejor || c.s < mejor.s)) mejor = { s: c.s, diana: d, h: c.h, r: c.r };
    }
    for (const g of globos) {
      if (!g.vivo) continue;
      const s = cortaEsfera(a, b, g.pos, RADIO_GLOBO);
      if (s != null && (!mejor || s < mejor.s)) mejor = { s, globo: g };
    }
    if (mejor && mejor.diana) {
      clavar(f, mejor.h, dir, mejor.diana.mueve ? mejor.diana : null);
      const pts = puntosDe(mejor.diana, mejor.r);
      const vol = sonido.lejos(largo(mejor.h));
      sonar("diana", vol);
      if (pts >= 10) sonar("centro", vol);
      sumar(pts);
      avisar(mejor.h, pts ? "+" + pts : "0", pts >= 10 ? "#FFD60A" : "#FFFFFF", ahora);
      ultimo(pts ? (pts >= 10 ? "¡al centro! +" : "+") + pts + (mejor.diana.extra ? "  (blanco móvil x" + mejor.diana.extra + ")" : "") : "en el fardo");
      return terminarVuelo();
    }
    if (mejor && mejor.globo) {
      // Un globo no frena la flecha: revienta y ella sigue.
      reventar(mejor.globo, ahora);
      sonar("globo", sonido.lejos(largo(mejor.globo.pos)));
      sumar(5);
      avisar(mejor.globo.pos, "+5", "#40E0D0", ahora);
      ultimo("¡globo! +5");
    }
    if (b.y <= 0.02) {
      const s = (a.y - 0.02) / Math.max(1e-6, a.y - b.y);
      const punta = suma(a, por(resta(b, a), acotar(s, 0, 1)));
      clavar(f, punta, dir, null);
      sonar("pasto", sonido.lejos(largo(punta)) * 0.8);
      ultimo("al pasto");
      return terminarVuelo();
    }
    f.p = p1;
    f.dir = dir;
  }
  f.t += dt;
  if (f.t > 8 || largo(f.p) > 120) { soltarFlecha(f); terminarVuelo(); return; }
  poner(f.el, f.p, qMirando(f.dir));
}

function terminarVuelo() {
  if (juego.flechas >= POR_RONDA && !juego.terminada && !flechas.some((x) => x.estado === "vuela")) cerrarRonda();
}

function reventar(g, ahora) {
  g.vivo = false;
  g.reaparece = ahora + 2500;
  g.el.setAttribute("visible", "false");
}

let antes = null;
function cuadro(t) {
  const dt = antes == null ? 0 : Math.min(0.05, (t - antes) / 1000);
  antes = t;
  const s = t / 1000;

  // El blanco móvil, y lo que tiene clavado.
  for (const d of dianas) {
    if (!d.mueve) continue;
    d.centro = v3(d.x + d.mueve.amp * Math.sin(s * d.mueve.vel), d.y, d.z);
    d.el.position = d.centro;
  }
  for (const f of flechas) {
    if (f.estado === "clavada" && f.ancla) {
      f.p = suma(f.ancla.centro, f.off);
      f.el.position = f.p;
    }
  }
  // Los globos flotan; los reventados vuelven en otro lado.
  for (const g of globos) {
    if (!g.vivo && t >= g.reaparece) {
      g.vivo = true;
      g.base = lugarGlobo();
      g.el.setAttribute("visible", "true");
    }
    g.pos = v3(g.base.x, g.base.y + 0.25 * Math.sin(s * 0.9 + g.fase), g.base.z);
    if (g.vivo) g.el.position = g.pos;
  }
  if (dt > 0) for (const f of flechas) if (f.estado === "vuela") volar(f, dt, t);

  for (const a of avisos) {
    if (!a.desde) continue;
    if (t >= a.hasta) { apagarAviso(a); continue; }
    a.el.position = suma(a.desde, v3(0, 0.5 * (t - a.t0) / 1300, 0));
  }

  // Una mano que deja de mandar poses (salió del volumen, mando apagado) no
  // manda el grip soltado: se la da por ida.
  const ahora = performance.now();
  for (const mano of ["left", "right"]) {
    const m = manos[mano];
    if (!m.pos || ahora - m.t < MANO_VIEJA_MS) continue;
    if (mano === manoArco) dejarArco();
    else if (carga && carga.mano === mano) { soltarFlecha(carga.flecha); carga = null; dibujarArco(); }
    manos[mano] = nuevaMano();
  }
  requestAnimationFrame(cuadro);
}
dibujarArco();
requestAnimationFrame(cuadro);
