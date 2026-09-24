// La bandada: tres reglas y ninguna trayectoria.
//
// Boids, el de siempre. Cada ave mira a las que tiene cerca y suma tres empujes:
//
//   separación  alejarse de las que están demasiado cerca
//   alineación  parecerse al rumbo promedio de las vecinas
//   cohesión    ir hacia el centro del grupo
//
// Lo que importa acá no es el algoritmo, que tiene cincuenta años, sino cómo se
// paga. Comparar todos contra todos es O(n²): con ciento cuarenta aves son 19 600
// pares por frame, que en este runtime se banca sin problema y por eso la escena
// no tiene grilla espacial — meterla sería complicar el archivo por un costo que
// no aparece. **Con mil aves habría que ponerla**, y el lugar exacto donde
// empieza a doler está anotado abajo en `vecinos()`.
//
// Lo que sí se cuidó es el otro extremo, el de siempre: las tres transformaciones
// por ave —cuerpo y dos alas— salen en una sola `setTransformBatch`. La
// simulación es JavaScript puro y no cruza el puente; el puente se cruza una vez
// por frame con 420 entradas.
const CFG = globalThis.BANDADA || {};
const N = CFG.aves || 0;
const FOGATA = CFG.fogata || { x: 0, y: 5, z: 0 };
const root = hiperspace.dimention;

// --- los números de la bandada -------------------------------------------
// Están todos juntos a propósito: son lo único que hay que tocar para que la
// bandada cambie de carácter, y ninguno significa nada por separado.
const VEL_MIN = 5.0;
const VEL_MAX = 11.0;
const VISTA = 7.0;      // a qué distancia una es vecina
const CERCA = 2.2;      // a qué distancia molesta
const F_SEP = 26.0;
const F_ALI = 3.2;
const F_COH = 1.6;
const F_CENTRO = 2.4;   // el empuje que las devuelve al cuenco
const RADIO = 34;       // el cuenco
// El techo y el piso de la banda de vuelo. Estaban en 34 y la bandada quedaba
// arriba del campo de vision de alguien parado en la orilla: se entraba a la
// escena y no se veia lo unico que la escena tiene. Bajarla a 19 la deja entre
// veinte y treinta grados sobre el horizonte desde el punto de aparicion, que es
// donde uno mira sin pensarlo.
const TECHO = 19;
const PISO = 3.5;

const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N);
const cuerpos = [], alaI = [], alaD = [];

let listo = false;
let previo = 0;
let tic = -1;
const panel = {};

/** El estado de ánimo. `modo` cambia a dónde apunta el empuje global; el susto
 *  se apaga solo. */
let modo = "libre";
let susto = 0;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

function sembrar() {
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 14;
    px[i] = Math.sin(a) * r;
    py[i] = 12 + Math.random() * 10;
    pz[i] = Math.cos(a) * r;
    const b = Math.random() * Math.PI * 2;
    vx[i] = Math.sin(b) * 7;
    vy[i] = (Math.random() - 0.5) * 2;
    vz[i] = Math.cos(b) * 7;
  }
}

function preparar() {
  for (const id of ["bd_estado", "bd_dato", "bd_dato2"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  for (let i = 0; i < N; i++) {
    const c = root.getElementById("ave_" + i);
    const ai = root.getElementById("ala_i_" + i);
    const ad = root.getElementById("ala_d_" + i);
    if (!c || !ai || !ad) return false;
    cuerpos.push(c); alaI.push(ai); alaD.push(ad);
  }
  const f = root.getElementById("fuego");
  const c = root.getElementById("campana");
  if (!f || !c) return false;
  f.addEventListener("toque", function () {
    modo = modo === "fogata" ? "libre" : "fogata";
    texto("bd_estado", modo === "fogata" ? "rondando la fogata" : "tres reglas, ninguna trayectoria");
  });
  c.addEventListener("toque", function () {
    // El susto no es un modo sino un impulso: se le mete velocidad hacia afuera
    // a cada una y las reglas se encargan del resto. Que la bandada se rearme
    // sola después de dispersarse es la mejor demostración de que nadie está
    // dibujando la formación.
    susto = 1.4;
    for (let i = 0; i < N; i++) {
      const dx = px[i] - CFG.campana.x, dz = pz[i] - CFG.campana.z;
      const d = Math.hypot(dx, dz) || 1;
      vx[i] += (dx / d) * 16;
      vz[i] += (dz / d) * 16;
      vy[i] += 5;
    }
    texto("bd_estado", "dispersadas — mirá cómo se rearman solas");
  });
  sembrar();
  console.log("[bandada] " + N + " aves, " + (N * 3) + " nodos por lote, " +
              (N * (N - 1) / 2) + " pares por frame");
  return true;
}

/** Las tres reglas, para un ave. Devuelve el empuje en `ax, ay, az`.
 *
 *  Éste es el bucle O(n²) y el único lugar de la escena que escala mal. Si
 *  alguna vez hay que subir de unas trescientas aves, lo que va acá es una
 *  grilla de celdas del tamaño de VISTA y recorrer sólo las nueve vecinas; el
 *  resto del archivo no se entera. */
let ax = 0, ay = 0, az = 0;
function vecinos(i) {
  ax = 0; ay = 0; az = 0;
  let sx = 0, sy = 0, sz = 0;   // separación
  let mx = 0, my = 0, mz = 0;   // rumbo medio
  let cx = 0, cy = 0, cz = 0;   // centro
  let cuenta = 0;
  const vista2 = VISTA * VISTA, cerca2 = CERCA * CERCA;
  for (let j = 0; j < N; j++) {
    if (j === i) continue;
    const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > vista2) continue;
    cuenta++;
    mx += vx[j]; my += vy[j]; mz += vz[j];
    cx += px[j]; cy += py[j]; cz += pz[j];
    if (d2 < cerca2 && d2 > 0.0001) {
      // El empuje de separación va con 1/d: de cerca es fuerte y de lejos no
      // existe. Con 1/d² las aves se disparan al tocarse.
      const d = Math.sqrt(d2);
      sx -= dx / d / d; sy -= dy / d / d; sz -= dz / d / d;
    }
  }
  ax += sx * F_SEP; ay += sy * F_SEP; az += sz * F_SEP;
  if (cuenta > 0) {
    ax += (mx / cuenta - vx[i]) * F_ALI;
    ay += (my / cuenta - vy[i]) * F_ALI;
    az += (mz / cuenta - vz[i]) * F_ALI;
    ax += (cx / cuenta - px[i]) * F_COH * 0.1;
    ay += (cy / cuenta - py[i]) * F_COH * 0.1;
    az += (cz / cuenta - pz[i]) * F_COH * 0.1;
  }
  return cuenta;
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
  if (susto > 0) susto = Math.max(0, susto - dt);

  // El blanco: el centro del cuenco, o la fogata si está encendida.
  const bx = modo === "fogata" ? FOGATA.x : 0;
  const by = modo === "fogata" ? FOGATA.y : 10;
  const bz = modo === "fogata" ? FOGATA.z : 0;
  const fuerzaBlanco = modo === "fogata" ? F_CENTRO * 2.2 : F_CENTRO;

  let vecinosTotal = 0;
  let rapidez = 0;
  const lote = [];

  for (let i = 0; i < N; i++) {
    vecinosTotal += vecinos(i);

    // El empuje hacia el blanco. Fuera del cuenco crece rápido: es lo que hace
    // que la bandada tenga un lugar sin necesidad de paredes.
    const dx = bx - px[i], dy = by - py[i], dz = bz - pz[i];
    const dh = Math.hypot(dx, dz);
    const fuera = Math.max(0, dh - RADIO) * 0.6 + 1;
    ax += (dx / (dh || 1)) * fuerzaBlanco * fuera;
    az += (dz / (dh || 1)) * fuerzaBlanco * fuera;
    ay += dy * 0.35;
    if (py[i] < PISO) ay += (PISO - py[i]) * 9;
    if (py[i] > TECHO) ay -= (py[i] - TECHO) * 9;

    vx[i] += ax * dt; vy[i] += ay * dt; vz[i] += az * dt;

    // El techo y el piso de velocidad. Sin el piso, un ave que queda sin
    // vecinos se frena y se queda flotando como un globo, que rompe todo.
    let v = Math.hypot(vx[i], vy[i], vz[i]);
    const tope = susto > 0 ? VEL_MAX * 1.9 : VEL_MAX;
    if (v > tope) { const k = tope / v; vx[i] *= k; vy[i] *= k; vz[i] *= k; v = tope; }
    else if (v < VEL_MIN) { const k = VEL_MIN / (v || 1); vx[i] *= k; vy[i] *= k; vz[i] *= k; v = VEL_MIN; }
    rapidez += v;

    px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;

    // El rumbo sale de la velocidad, no al revés. `ry` es el rumbo horizontal y
    // `rz` la cabeceada: un ave que sube tiene que apuntar hacia arriba o la
    // bandada entera parece un banco de peces de cartón.
    const ry = Math.atan2(vx[i], vz[i]);
    const rz = Math.atan2(vy[i], Math.hypot(vx[i], vz[i]));
    lote.push(cuerpos[i].nodeId, px[i], py[i], pz[i], 0, ry, rz);

    // El aleteo va desfasado por ave y más rápido cuanto más rápido va. Con
    // todas aleteando al mismo tiempo la bandada late como una sola cosa, que
    // es justo lo contrario de lo que la escena quiere mostrar.
    const bat = Math.sin(ahora * 0.012 * (v / VEL_MIN) + i * 1.7) * 0.85;
    lote.push(alaI[i].nodeId, -0.05, 0, -0.34, bat, 0, 0);
    lote.push(alaD[i].nodeId, -0.05, 0, 0.34, -bat, 0, 0);
  }

  root.setTransformBatch(lote);

  const paso = Math.floor(ahora / 400);
  if (paso === tic) return;
  tic = paso;
  texto("bd_dato", N + " aves · " + (vecinosTotal / N).toFixed(1) + " vecinas en promedio");
  texto("bd_dato2", (rapidez / N).toFixed(1) + " m/s · " + (N * (N - 1)) + " pares evaluados por frame");
}

requestAnimationFrame(frame);
