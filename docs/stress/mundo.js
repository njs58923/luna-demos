// El mundo de referencia, del lado del visor: mide el decorado quieto, sube la
// bandada hasta que se pasa del presupuesto, y mide 100 boids fijos.
//
// La bandada es el mismo algoritmo que vrchat/BoidsBench.cs, con las mismas
// constantes: para comparar con Udon, lo que tiene que coincidir es el trabajo,
// no el lenguaje.
//
// Cada frame hace dos cosas, y se miden por separado:
//
//   pensar   n² comparaciones: cohesión, alineación y separación con los
//            vecinos a menos de R_VECINO, más volver hacia el centro
//   mover    escribir la posición y el giro de cada nodo
//
// En VRChat las dos cuestan: Udon es lento pensando, y cada transform.set
// cruza de la VM al motor. Acá también la segunda cruza: cada escritura es una
// op hacia Rust.
//
// Cómo decide si un paso aguanta es lo mismo que stress.js: la fracción de
// frames por encima de presupuesto·1,2 tiene que quedar bajo la tolerancia.
// El presupuesto es max(piso, 8,33 ms); el piso, la mediana del mundo quieto.
const root = hiperspace.dimention;
const byId = (id) => root.getElementById(id);

// ── Las constantes de la bandada (iguales en BoidsBench.cs) ────────────────
const R_VECINO = 2.0;
const R_SEP = 0.6;
const K_COH = 0.8, K_ALI = 1.5, K_SEP = 4.0, K_BORDE = 2.0;
const V_MIN = 1.5, V_MAX = 3.0;
const CENTRO = [0, 3.2, 0];
const RADIO = 4.5;

// ── Estado ──────────────────────────────────────────────────────────────────
/** Lo que se ajusta por query (mundo.hsml?fijos=50&medir=6). El decorado
 *  no: está escrito en mundo.hsml, 120 modelos y 300 primitivas. */
const Q = new URLSearchParams(location.search);
function param(k, def, min, max) {
  const v = Q.get(k);
  const x = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : def;
}
const CFG = {
  modelos: 120,
  props: 300,
  /** boids del primer paso de la rampa */
  desde: Math.trunc(param("desde", 50, 1, 5000)),
  /** boids fijos del caso comparable con VRChat */
  fijos: Math.trunc(param("fijos", 100, 1, 5000)),
  medir: param("medir", 4, 0.5, 60),
  tolerancia: param("tolerancia", 10, 0, 100),
  presupuesto: param("presupuesto", 8.33, 1, 100),
};
let listo = false;
let px = new Float64Array(0), py = px, pz = px, vx = px, vy = px, vz = px;
let nodos = [];
let bandada = null;

function azar(i) {
  let h = Math.imul(i + 977, 374761393);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Llevar la bandada a `n` pájaros: los que ya están siguen donde están. */
function tamanio(n) {
  const viejos = nodos.length;
  const crecer = (a) => { const b = new Float64Array(n); b.set(a.subarray(0, Math.min(a.length, n))); return b; };
  px = crecer(px); py = crecer(py); pz = crecer(pz); vx = crecer(vx); vy = crecer(vy); vz = crecer(vz);
  for (let i = viejos; i < n; i++) {
    px[i] = CENTRO[0] + (azar(i * 6) - 0.5) * RADIO;
    py[i] = CENTRO[1] + (azar(i * 6 + 1) - 0.5) * RADIO * 0.6;
    pz[i] = CENTRO[2] + (azar(i * 6 + 2) - 0.5) * RADIO;
    vx[i] = azar(i * 6 + 3) - 0.5; vy[i] = (azar(i * 6 + 4) - 0.5) * 0.3; vz[i] = azar(i * 6 + 5) - 0.5;
    const el = root.createElement("box");
    el.setAttribute("sx", "0.08"); el.setAttribute("sy", "0.06"); el.setAttribute("sz", "0.22");
    el.setAttribute("color", ["#FF3B30", "#FFD60A", "#0A84FF", "#30D158"][i % 4]);
    el.setAttribute("touchable", "false");
    bandada.appendChild(el);
    nodos.push(el);
  }
  for (let i = viejos - 1; i >= n; i--) nodos.pop().remove();
}

/** Pensar: un paso de la bandada. n² a propósito —es el caso de manual—. */
function pensar(dt) {
  const n = nodos.length;
  const r2 = R_VECINO * R_VECINO, s2 = R_SEP * R_SEP;
  for (let i = 0; i < n; i++) {
    let cx = 0, cy = 0, cz = 0, ax = 0, ay = 0, az = 0, sx = 0, sy = 0, sz = 0, cuantos = 0;
    const xi = px[i], yi = py[i], zi = pz[i];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = px[j] - xi, dy = py[j] - yi, dz = pz[j] - zi;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      cuantos++;
      cx += px[j]; cy += py[j]; cz += pz[j];
      ax += vx[j]; ay += vy[j]; az += vz[j];
      if (d2 < s2 && d2 > 1e-6) { sx -= dx / d2; sy -= dy / d2; sz -= dz / d2; }
    }
    let fx = 0, fy = 0, fz = 0;
    if (cuantos) {
      fx += (cx / cuantos - xi) * K_COH + (ax / cuantos - vx[i]) * K_ALI;
      fy += (cy / cuantos - yi) * K_COH + (ay / cuantos - vy[i]) * K_ALI;
      fz += (cz / cuantos - zi) * K_COH + (az / cuantos - vz[i]) * K_ALI;
    }
    fx += sx * K_SEP; fy += sy * K_SEP; fz += sz * K_SEP;
    // Volver hacia el centro cuando se aleja del volumen.
    const ox = xi - CENTRO[0], oy = yi - CENTRO[1], oz = zi - CENTRO[2];
    const od = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (od > RADIO) { fx -= (ox / od) * K_BORDE; fy -= (oy / od) * K_BORDE; fz -= (oz / od) * K_BORDE; }
    vx[i] += fx * dt; vy[i] += fy * dt; vz[i] += fz * dt;
  }
  for (let i = 0; i < n; i++) {
    const v = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]) || 1;
    const k = v < V_MIN ? V_MIN / v : v > V_MAX ? V_MAX / v : 1;
    vx[i] *= k; vy[i] *= k; vz[i] *= k;
    px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
  }
}

/** Mover: escribir cada nodo. El frente de un nodo es su +z local y ry lo lleva
 *  a (sin ry, 0, cos ry): mirar hacia la velocidad es atan2(vx, vz). */
function mover() {
  for (let i = 0; i < nodos.length; i++) {
    const el = nodos[i];
    el.position = { x: px[i], y: py[i], z: pz[i] };
    el.rotation = { x: 0, y: Math.atan2(vx[i], vz[i]), z: 0 };
  }
}

// ── Medición ────────────────────────────────────────────────────────────────
function cuantil(a, p) {
  if (!a.length) return 0;
  const o = a.slice().sort((x, y) => x - y);
  return o[Math.min(o.length - 1, Math.round((o.length - 1) * p))];
}
const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function resumen(m, presupuesto) {
  const corte = presupuesto * 1.2;
  let lentos = 0;
  for (const d of m.dts) if (d > corte) lentos++;
  return {
    frames: m.dts.length,
    p50: cuantil(m.dts, 0.5), p95: cuantil(m.dts, 0.95), peor: cuantil(m.dts, 1),
    tirones: m.dts.length ? (lentos / m.dts.length) * 100 : 100,
    js: media(m.js), js95: cuantil(m.js, 0.95), tf: media(m.tf),
  };
}

function texto(id, v) { const el = byId(id); if (el) el.setAttribute("value", String(v)); }
function decir(s) { texto("estado", s); console.log("[mundo] " + s); }

/** Una línea por caso en la consola. El cartel muestra lo mismo. */
function reportar(caso, n, r) {
  console.log(
    "[puntaje] " + caso + ": " + n + " — frames " + r.frames +
      " piso " + piso.toFixed(2) + " presupuesto " + presupuesto.toFixed(2) +
      " p50 " + r.p50.toFixed(2) + " p95 " + r.p95.toFixed(2) + " peor " + r.peor.toFixed(2) +
      " tirones " + r.tirones.toFixed(1) + "% pensar " + r.js.toFixed(3) + " mover " + r.tf.toFixed(3),
  );
}

// ── La máquina ──────────────────────────────────────────────────────────────
// cargar → quieto → (rampa: asentar → medir)* → fijo: asentar → medir → fin
// 10 s de carga: con 4 los 120 .glb seguían llegando y el "mundo quieto" salía
// con un pico de 250 ms y 27% de tirones que eran la descarga, no el mundo.
const CARGAR_MS = 10000, ASENTAR_MS = 1200;
let fase = "esperar", t0 = 0, anterior = 0;
let piso = 16, presupuesto = 8.33;
let med = null;
let paso = { n: 0, reintento: false, mejor: 0, mejorR: null };

function nuevaMedicion() { return { dts: [], js: [], tf: [] }; }

function empezarPaso(n) {
  tamanio(n);
  fase = "asentar";
  t0 = 0;
  med = nuevaMedicion();
  decir("boids: " + n + " ...");
}

function cerrarRampa() {
  const r = paso.mejorR;
  reportar("boids", paso.mejor, r || { frames: 0, p50: 0, p95: 0, peor: 0, tirones: 100, js: 0, tf: 0 });
  texto("linea2", "rampa: aguanta " + paso.mejor + " boids" + (r ? "  (pensar " + r.js.toFixed(2) + " ms, mover " + r.tf.toFixed(2) + " ms)" : ""));
  // El caso comparable: 100 boids fijos.
  setTimeout(() => {
    tamanio(CFG.fijos);
    fase = "asentar_fijo";
    t0 = 0;
    med = nuevaMedicion();
    decir(CFG.fijos + " boids fijos ...");
  }, 300);
  fase = "pausa";
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!listo) {
    bandada = byId("bandada");
    if (!bandada) return;
    listo = true;
    fase = "cargar";
    t0 = ahora;
    decir("cargando el decorado ...");
  }
  const dt = anterior ? ahora - anterior : 0;
  anterior = ahora;
  if (dt <= 0) return;

  // La bandada vive en todas las fases que la tienen; se mide lo que cuesta.
  if (nodos.length) {
    const h = Math.min(dt / 1000, 0.05);
    const a = performance.now();
    pensar(h);
    const b = performance.now();
    mover();
    const c = performance.now();
    if (med && (fase === "medir" || fase === "medir_fijo")) { med.js.push(b - a); med.tf.push(c - b); }
  }

  if (fase === "cargar") {
    if (ahora - t0 < CARGAR_MS) return;
    fase = "quieto"; t0 = ahora; med = nuevaMedicion();
    decir("midiendo el mundo quieto ...");
    return;
  }
  if (fase === "quieto") {
    med.dts.push(dt);
    if (ahora - t0 < CFG.medir * 1000) return;
    piso = cuantil(med.dts, 0.5);
    presupuesto = Math.max(piso, CFG.presupuesto);
    const r = resumen(med, presupuesto);
    reportar("mundo_quieto", CFG.modelos + CFG.props, r);
    texto("linea1", "quieto: p50 " + r.p50.toFixed(2) + " ms, p95 " + r.p95.toFixed(2) + " ms  (presupuesto " + presupuesto.toFixed(2) + ")");
    paso = { n: CFG.desde, reintento: false, mejor: 0, mejorR: null };
    empezarPaso(paso.n);
    return;
  }
  if (fase === "asentar" || fase === "asentar_fijo") {
    if (!t0) t0 = ahora;
    if (ahora - t0 < ASENTAR_MS) return;
    fase = fase === "asentar" ? "medir" : "medir_fijo";
    t0 = ahora;
    return;
  }
  if (fase === "medir" || fase === "medir_fijo") {
    med.dts.push(dt);
    if (ahora - t0 < CFG.medir * 1000) return;
    const r = resumen(med, presupuesto);
    if (fase === "medir_fijo") {
      reportar("boids" + CFG.fijos, CFG.fijos, r);
      texto("linea3", CFG.fijos + " boids: pensar " + r.js.toFixed(3) + " ms (p95 " + r.js95.toFixed(3) + "), mover " + r.tf.toFixed(3) + " ms, frame p50 " + r.p50.toFixed(2));
      decir("listo");
      fase = "fin";
      return;
    }
    const aguanta = r.tirones <= CFG.tolerancia;
    if (aguanta) {
      paso.mejor = paso.n; paso.mejorR = r; paso.reintento = false;
      paso.n = Math.ceil(paso.n * 1.5);
      if (paso.n > 20000) return cerrarRampa();
      empezarPaso(paso.n);
    } else if (!paso.reintento) {
      // Un pico suelto no corta la rampa: se repite una vez.
      paso.reintento = true;
      empezarPaso(paso.n);
    } else {
      cerrarRampa();
    }
  }
}

requestAnimationFrame(frame);
