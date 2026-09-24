// El estado de la partida: un Redux chiquito, pensado para que la red entre
// después sin dar vuelta nada.
//
// Tres reglas, y las tres existen por la sincronización que viene:
//
//   1. **El reductor es puro.** Mismo estado + misma acción = mismo estado
//      nuevo. Nada de Math.random, Date.now ni leer el DOM adentro.
//   2. **Nada cambia sin una acción.** El juego no escribe en el estado: manda
//      acciones. Lo que se vea en pantalla sale de lo que el reductor dejó.
//   3. **Las acciones pasan por el transporte.** `despachar` no aplica nada:
//      se lo da al transporte, y el transporte las devuelve en el orden que
//      decidió. Hoy el transporte es local y las devuelve en el acto; mañana
//      va a ser una sala tipo Photon y el orden lo va a poner el servidor.
//
// De ahí que el azar sea un generador con semilla guardada en el estado: dos
// clientes con la misma semilla reparten las mismas tareas sin hablar. Cuando
// haya red, la semilla la manda el que abre la sala y es lo único que hace
// falta para que todos vean la misma partida.
//
// Lo que todavía NO está, para no confundir esto con un juego en red:
// predicción local con reconciliación, instantánea para el que llega tarde,
// autoridad sobre quién mató a quién, y el reparto de roles. El reductor ya
// tiene el lugar de todo eso.

/** Un azar con semilla: mulberry32. Determinista y barato. */
function azarDe(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mezcla una lista con ese azar (Fisher-Yates), sin tocar la original. */
function mezclar(lista, azar) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}


/** Los sabotajes. Es tabla, no código: qué se rompe, en cuánto mata, y dónde
 *  se arregla. Los puntos son los ids de los paneles de emergencia del
 *  documento (`src/sabotajes.ts`), y `limite` en segundos es lo único que
 *  separa a un crítico de una molestia.
 *
 *  Hoy los dispara el reloj, porque todavía no hay impostor. La acción es la
 *  misma que va a despachar él, así que cuando lo haya no cambia el reductor:
 *  cambia quién manda SABOTAJE. */
const SABOTAJES = {
  luces: {
    nombre: "LUCES CORTADAS", critico: false, limite: 0, puntos: ["luces"],
    aviso: "se cortó la luz: eléctrica",
  },
  comunicaciones: {
    nombre: "COMUNICACIONES CAIDAS", critico: false, limite: 0, puntos: ["comunicaciones"],
    aviso: "sin comunicaciones: no se ven las tareas",
  },
  reactor: {
    nombre: "FUSION DEL REACTOR", critico: true, limite: 45, puntos: ["reactor_norte", "reactor_sur"],
    aviso: "el reactor se funde: los dos paneles",
  },
  o2: {
    nombre: "FALLA DE OXIGENO", critico: true, limite: 45, puntos: ["o2", "o2_admin"],
    aviso: "se va el oxígeno: O2 y administración",
  },
};

/** Cuánto tarda el primer sabotaje y cuánto se descansa entre uno y el
 *  siguiente, en segundos. En el juego real lo decide el impostor; acá el
 *  reloj, para que la partida de un jugador tenga algo que la apure. */
const PRIMERO = 75, DESCANSO = 60;

/** Lo que dura una reunión antes de contar los votos que haya, en segundos. */
const REUNION_SEG = 30;

// ── La tripulación que camina ───────────────────────────────────────────────
//
// Los otros cinco no son estatuas: caminan de consola en consola haciendo sus
// tareas, y uno de ellos —el impostor— hace como que las hace hasta que le
// toca matar. Todo esto vive **adentro del reductor**: dónde está cada uno es
// estado, y avanza con el TIC como cualquier otro reloj. Así dos pantallas de
// la misma partida ven a Verde doblar la misma esquina en el mismo tic, que es
// lo que va a hacer falta cuando haya red.
//
// Los caminos salen de `NAVE_NAV` (navegacion.js), una biblioteca pura, sobre
// la grilla que viene en `estado.mundo`: la arma el cliente leyendo el
// documento y la manda en PARTIDA_NUEVA. Sin mundo no hay tripulación que
// camine, y el reductor sigue andando igual (las pruebas del reductor solo).
//
// El impostor mata **cuando nadie lo ve**: se acerca a alguien que quedó solo
// —en el juego real, el que se queda haciendo una tarea en una sala vacía— y
// mira alrededor. De los demás tripulantes se cuida siempre; del jugador, sólo
// si lo tiene cerca, porque de espaldas no se ve a nadie. Eso es lo que te deja
// verlo matar, o meterse en un conducto, desde la otra punta de la sala.
//
// Los demás no son tontos: ven lo que pasa a su alrededor —las paredes tapan,
// el apagón les achica la vista— y lo recuerdan. Al encontrar un cuerpo lo
// reportan, y en la reunión dicen lo que vieron y votan con eso.

/** Lo que camina un tripulante, en m/s. */
const VEL = 2.3;
/** Lo que ve, en metros: con luz y en el apagón. */
const VISTA = 7, VISTA_APAGON = 2.6;
/** De qué distancia se cuida el impostor del jugador: más lejos, no lo ve. */
const CUIDADO_JUGADOR = 5;
/** De acá mata. */
const ALCANCE = 1.15;
/** Segundos entre muerte y muerte; la primera espera un poco menos. */
const RECARGA_PRIMERA = 30, RECARGA = 40;
/** Si en este tiempo no encontró a nadie solo, cambia de presa. */
const CAZA_MAX = 28;
/** Cuántas tareas hace cada uno antes de ponerse a pasear. */
const TAREAS_BOT = 6;
/** A esta distancia dos andan juntos. */
const JUNTOS = 3.5;
/** Y a ésta, uno viene siguiendo a otro. */
const SIGUE = 4.5;
/** Desde cuánto de sospecha alguien acusa y vota. */
const UMBRAL = 0.4;
/** Lo que tarda un tripulante en darse cuenta de que algo se rompió y salir
 *  corriendo, y lo que tarda en arreglarlo una vez que llega. */
const REACCION = 4, ARREGLO = 4;

const NAV = () => globalThis.NAVE_NAV;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Dónde está cada uno que se puede ver: los tripulantes que caminan y el
 *  jugador, si mandó su posición. Los que están en un conducto no están. */
function presentes(e) {
  const out = [];
  for (const id of Object.keys(e.jugadores)) {
    const j = e.jugadores[id];
    if (!j.vivo) continue;
    const b = e.bots[id];
    if (b) { if (!(b.oculto > 0)) out.push({ id, x: b.x, z: b.z }); }
    else if (j.pos) out.push({ id, x: j.pos.x, z: j.pos.z });
  }
  return out;
}

/** ¿`quien` ve el punto `p`? Un tripulante con su vista (el apagón se la
 *  achica); el jugador, con la que le supone el impostor. */
function ve(e, quien, p) {
  const G = e.mundo.grilla;
  const apagon = e.sabotaje && e.sabotaje.tipo === "luces";
  const alcance = quien.id === e.yo ? CUIDADO_JUGADOR : apagon ? VISTA_APAGON : VISTA;
  return dist(quien, p) < alcance && NAV().seVe(G, quien, p);
}

/** En qué sala cae un punto, por nombre; null en un pasillo. */
function salaEn(e, p) {
  const s = (e.mundo.salas || []).find((s) => p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1);
  return s ? s.nombre : null;
}

/** Los tripulantes que caminan, parados alrededor de la mesa: al empezar y
 *  en cada reunión. El primer asiento es del jugador. */
function enLaMesa(e, bots) {
  const m = e.mundo;
  const cx = m.asientos.reduce((a, s) => a + s.x, 0) / m.asientos.length;
  const cz = m.asientos.reduce((a, s) => a + s.z, 0) / m.asientos.length;
  const out = {};
  let k = 0;
  for (const id of Object.keys(bots)) {
    const vivo = e.jugadores[id] && e.jugadores[id].vivo;
    const a = m.asientos[1 + (k++ % (m.asientos.length - 1))];
    out[id] = !vivo ? bots[id] : {
      ...bots[id], x: a.x, z: a.z, yaw: Math.atan2(cx - a.x, cz - a.z),
      ruta: null, paso: 0, meta: null, oculto: 0, sale: null, espera: 1.5 + k * 0.6,
      // Dónde estaba antes de venir a la mesa: es su coartada en la reunión.
      antes: { x: bots[id].x, z: bots[id].z },
    };
  }
  return out;
}

/** El punto al que va un tripulante para hacer una consola: su pie, corrido
 *  un poco al costado según quién sea, para que dos en la misma consola no
 *  queden uno adentro del otro. */
function destino(e, id, consola) {
  const k = Object.keys(e.bots).indexOf(id);
  const lado = ((k % 3) - 1) * 0.45;
  const p = { x: consola.x + Math.cos(consola.mira) * lado, z: consola.z - Math.sin(consola.mira) * lado };
  return NAV().libre(e.mundo.grilla, p.x, p.z) ? p : { x: consola.x, z: consola.z };
}

/** Avanza `b` por su ruta `metros`. La ruta no se toca —es de un estado
 *  anterior, y el reductor no escribe en lo viejo—: se avanza el índice
 *  `paso`. Devuelve si llegó. */
function caminar(b, metros) {
  const ruta = b.ruta;
  while (metros > 1e-6 && ruta && b.paso < ruta.length) {
    const tx = ruta[b.paso][0], tz = ruta[b.paso][1];
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) b.yaw = Math.atan2(dx, dz);
    if (d <= metros) { b.x = tx; b.z = tz; metros -= d; b.paso++; }
    else { b.x += dx / d * metros; b.z += dz / d * metros; metros = 0; }
  }
  return !ruta || b.paso >= ruta.length;
}

function rutaA(e, b, p) {
  const r = NAV().camino(e.mundo.grilla, b, p);
  return r && r.length ? r : null;
}

/** La próxima presa del impostor: el tripulante vivo más cercano que camina.
 *  Al jugador no lo mata nunca (ver MUERTE). */
function elegirPresa(e, id, b, sin) {
  let mejor = null, dm = Infinity;
  for (const otro of Object.keys(e.bots)) {
    if (otro === id || otro === sin || !e.jugadores[otro].vivo || e.bots[otro].oculto > 0) continue;
    const d = dist(b, e.bots[otro]);
    if (d < dm) { dm = d; mejor = otro; }
  }
  return mejor;
}

/** Un tic de un tripulante: esperar, caminar, elegir adónde ir. */
function pasoBot(e, id, b0, dt, azar) {
  const b = { ...b0 };
  const m = e.mundo;
  // En un conducto: sale por la otra boca cuando pasa su rato.
  if (b.oculto > 0) {
    b.oculto -= dt;
    if (b.oculto <= 0) {
      b.oculto = 0; b.x = b.sale.x; b.z = b.sale.z; b.sale = null;
      b.ruta = null; b.paso = 0; b.meta = null; b.espera = 0.6 + azar() * 1.2;
    }
    return b;
  }
  const impostor = e.jugadores[id].rol === "impostor";
  const fantasma = !e.jugadores[id].vivo;
  // Un fantasma no arregla nada: sólo termina sus tareas.
  if (fantasma && b.meta && b.meta.tipo !== "tarea") { b.meta = null; b.ruta = null; b.espera = 0; }

  // Mandado a arreglar un sabotaje: va, se queda el rato que lleva, y avisa.
  // Si ya lo arregló otro, vuelve a lo suyo.
  if (b.meta && b.meta.tipo === "arreglo") {
    const sab = e.sabotaje;
    if (!sab || sab.puntos[b.meta.punto] !== false) { b.meta = null; b.ruta = null; b.espera = 0; return b; }
    if (b.espera > 0) {
      b.espera -= dt;
      if (b.espera <= 0) { b.espera = 0; b.arreglado = b.meta.punto; b.meta = null; b.ruta = null; }
      return b;
    }
    if (caminar(b, VEL * dt)) {
      const pnl = (m.paneles || []).find((x) => x.punto === b.meta.punto);
      if (pnl) b.yaw = pnl.mira;
      b.espera = ARREGLO;
    }
    return b;
  }

  // Al impostor le llegó la hora: deja lo que estaba haciendo y sale a buscar.
  if (impostor && e.recarga <= 0 && (!b.meta || b.meta.tipo !== "cazar")) {
    const presa = elegirPresa(e, id, b);
    if (presa) { b.meta = { tipo: "cazar", presa, desde: e.t }; b.ruta = null; b.espera = 0; b.replan = 0; }
  }

  if (b.meta && b.meta.tipo === "cazar") {
    const presa = e.bots[b.meta.presa];
    if (!presa || !e.jugadores[b.meta.presa].vivo || presa.oculto > 0 || e.t - b.meta.desde > CAZA_MAX) {
      const otra = elegirPresa(e, id, b, b.meta.presa);
      b.meta = otra ? { tipo: "cazar", presa: otra, desde: e.t } : null;
      b.ruta = null;
      return b;
    }
    // Pegado a la presa no se mueve: espera a que no mire nadie.
    if (dist(b, presa) < ALCANCE * 0.85) { b.yaw = Math.atan2(presa.x - b.x, presa.z - b.z); return b; }
    b.replan = (b.replan || 0) - dt;
    if (!b.ruta || b.replan <= 0) { b.ruta = rutaA(e, b, presa); b.paso = 0; b.replan = 0.75; }
    caminar(b, VEL * dt);
    return b;
  }

  if (b.espera > 0) { b.espera -= dt; return b; }

  if (!b.ruta) {
    // Adónde ahora: la próxima de sus tareas y, cuando se le acaban, a pasear
    // de consola en consola —que es lo que hace cualquiera que ya terminó—.
    const lista = m.consolas;
    let consola = null;
    if (b.siguiente < b.tareas.length) consola = lista.find((c) => c.id === b.tareas[b.siguiente]);
    if (!consola) consola = lista[Math.floor(azar() * lista.length)];
    b.meta = { tipo: "tarea", id: consola.id };
    b.ruta = rutaA(e, b, destino(e, id, consola));
    b.paso = 0;
    if (!b.ruta) { b.meta = null; b.espera = 1; b.siguiente++; return b; }
  }

  if (caminar(b, VEL * dt)) {
    // Llegó: de frente a la consola, un rato. El impostor también se queda:
    // hacer como que hace la tarea es la mitad de su trabajo, pero no suma.
    const c = m.consolas.find((c) => c.id === (b.meta && b.meta.id));
    if (c) b.yaw = c.mira;
    b.espera = 3 + azar() * 5;
    if (!impostor && b.siguiente < b.tareas.length) b.hechas = (b.hechas || 0) + 1;
    b.siguiente++;
    b.ruta = null; b.paso = 0; b.meta = null;
    // Un fantasma que terminó lo suyo ya no tiene nada que hacer acá.
    if (fantasma && b.siguiente >= b.tareas.length) b.espera = Infinity;
  }
  return b;
}

/** Cuando se rompe algo, al rato sale corriendo a cada punto el tripulante
 *  vivo que lo tiene más cerca. El impostor no: está en otra cosa, y es cuando
 *  la tripulación se desparrama que más fácil le queda. */
function mandarAArreglar(e) {
  const sab = e.sabotaje;
  if (!sab || e.t - (sab.desde || 0) < REACCION) return e;
  const m = e.mundo;
  let bots = e.bots;
  const ocupados = new Set(Object.keys(bots).filter((id) => bots[id].meta && bots[id].meta.tipo === "arreglo").map((id) => bots[id].meta.punto));
  for (const punto of Object.keys(sab.puntos)) {
    if (sab.puntos[punto] || ocupados.has(punto)) continue;
    const pnl = (m.paneles || []).find((x) => x.punto === punto);
    if (!pnl) continue;
    let mejor = null, dm = Infinity;
    for (const id of Object.keys(bots)) {
      const j = e.jugadores[id], b = bots[id];
      if (!j.vivo || j.rol === "impostor" || b.oculto > 0 || (b.meta && b.meta.tipo === "arreglo")) continue;
      const d = dist(b, pnl);
      if (d < dm) { dm = d; mejor = id; }
    }
    if (!mejor) continue;
    const ruta = rutaA(e, bots[mejor], pnl);
    if (!ruta) continue;
    if (bots === e.bots) bots = { ...e.bots };
    bots[mejor] = { ...bots[mejor], meta: { tipo: "arreglo", punto }, ruta, paso: 0, espera: 0 };
    ocupados.add(punto);
  }
  return bots === e.bots ? e : { ...e, bots };
}

/** Los que terminaron de arreglar algo en este tic: su punto pasa a estar
 *  arreglado, con la misma acción que manda el jugador. */
function arreglosHechos(e) {
  let out = e;
  for (const id of Object.keys(e.bots)) {
    const punto = e.bots[id].arreglado;
    if (!punto) continue;
    out = { ...out, bots: { ...out.bots, [id]: { ...out.bots[id], arreglado: null } } };
    out = acciones.SABOTAJE_ARREGLADO(out, { punto });
  }
  return out;
}

/** La barra de tareas de toda la tripulación: las del jugador y las de los que
 *  caminan, fantasmas incluidos. Las del impostor no cuentan: las hace de
 *  mentira. */
function tareasDeEquipo(e) {
  const mias = Object.keys(e.tareas);
  let total = mias.length, hechas = mias.filter((id) => e.tareas[id].hecha).length;
  for (const id of Object.keys(e.bots || {})) {
    const j = e.jugadores[id];
    if (!j || j.rol === "impostor") continue;
    total += e.bots[id].tareas.length;
    hechas += Math.min(e.bots[id].tareas.length, e.bots[id].hechas || 0);
  }
  return { hechas, total };
}

/** Lo que cada tripulante ve en este tic: a quién (y dónde) y qué cuerpos.
 *  Devuelve el estado con los recuerdos puestos y, si alguien vio un cuerpo,
 *  con la reunión ya llamada. */
function mirar(e) {
  const quienes = presentes(e);
  let bots = e.bots;
  let reporte = null;
  for (const id of Object.keys(e.bots)) {
    const j = e.jugadores[id];
    const b = e.bots[id];
    if (!j.vivo || j.rol === "impostor" || b.oculto > 0) continue;
    const yo = { id, x: b.x, z: b.z };
    const visibles = quienes.filter((q) => q.id !== id && ve(e, yo, q));
    let vistos = null;
    for (const q of visibles) {
      vistos = vistos || { ...b.vistos };
      // Con quién andaba: si había uno solo al lado. "La vi por última vez
      // con Negro" es la pista que más pesa en el juego real, y el impostor
      // que espera a que su presa quede sola la deja sin querer. En un grupo
      // no dice nada: cualquiera podía ser.
      const al = visibles.filter((q2) => q2.id !== q.id && dist(q, q2) < JUNTOS);
      vistos[q.id] = { t: e.t, x: q.x, z: q.z, con: al.length === 1 ? al[0].id : null };
    }
    // El que caza se nota: camina pegado atrás de alguien, doblando donde
    // dobla. Quien lo ve lo anota, y si esa presa aparece muerta, sabe.
    let siguiendo = null;
    for (const q of visibles) {
      const bq = e.bots[q.id];
      if (!bq || !bq.meta || bq.meta.tipo !== "cazar") continue;
      const presa = visibles.find((v) => v.id === bq.meta.presa);
      if (!presa || dist(q, presa) > SIGUE) continue;
      siguiendo = siguiendo || { ...b.siguiendo };
      siguiendo[q.id] = { presa: presa.id, t: e.t };
    }
    if (siguiendo) vistos = vistos || b.vistos;
    if (vistos) {
      if (bots === e.bots) bots = { ...e.bots };
      bots[id] = siguiendo ? { ...b, vistos, siguiendo } : { ...b, vistos };
    }
    if (!reporte) {
      for (const quien of Object.keys(e.cuerpos)) {
        const c = e.cuerpos[quien];
        if (!c.reportado && c.x != null && ve(e, yo, c)) { reporte = { por: id, quien }; break; }
      }
    }
  }
  const out = bots === e.bots ? e : { ...e, bots };
  return reporte ? acciones.REPORTE(out, reporte) : out;
}

/** Lo que cada tripulante sabe de una muerte, en el momento en que pasa: a
 *  quién vio hace poco cerca de donde cayó el cuerpo. Se anota ahora y no en
 *  la reunión porque después lo va a seguir viendo pasar por otros lados, y
 *  eso no dice nada de esta muerte. */
function sospechasDe(e, cuerpo) {
  const out = {};
  for (const id of Object.keys(e.bots)) {
    const j = e.jugadores[id];
    if (!j.vivo || j.rol === "impostor") continue;
    const vistos = e.bots[id].vistos || {};
    const puntos = {};
    for (const q of Object.keys(vistos)) {
      if (q === cuerpo.quien) continue;
      const v = vistos[q];
      const cerca = 1 - Math.min(1, dist(v, cuerpo) / 12);
      const reciente = 1 - Math.min(1, (e.t - v.t) / 25);
      // Estar cerca del cuerpo, solo, es una pista floja: casi siempre hay
      // un inocente cerca. Pesa la mitad, y hace falta mucha para acusar.
      if (cerca > 0 && reciente > 0) puntos[q] = 0.5 * cerca * reciente;
    }
    // ¿A alguien lo vio siguiendo a la víctima?
    const sig = e.bots[id].siguiendo || {};
    for (const q of Object.keys(sig)) {
      const hace = e.t - sig[q].t;
      if (sig[q].presa === cuerpo.quien && hace < 45) {
        puntos[q] = (puntos[q] || 0) + 0.9 * (1 - hace / 45);
        puntos.__sigue = q;
      }
    }
    // A la víctima, ¿con quién la vio por última vez?
    const ultima = vistos[cuerpo.quien];
    if (ultima && ultima.con && ultima.con !== id) {
      const hace = e.t - ultima.t;
      if (hace < 35) puntos[ultima.con] = (puntos[ultima.con] || 0) + 0.8 * (1 - hace / 35);
      puntos.__con = ultima.con;
    }
    out[id] = puntos;
  }
  return out;
}

/** El impostor: si está pegado a su presa y no lo ve nadie, mata. Después se
 *  escapa por un conducto si tiene uno a mano. */
function cazar(e, azar) {
  const id = Object.keys(e.bots).find((k) => e.jugadores[k].rol === "impostor" && e.jugadores[k].vivo);
  if (!id || e.recarga > 0) return e;
  const b = e.bots[id];
  if (!b.meta || b.meta.tipo !== "cazar" || b.oculto > 0) return e;
  const presa = e.bots[b.meta.presa];
  if (!presa || dist(b, presa) > ALCANCE) return e;
  const yo = { id, x: b.x, z: b.z };
  const testigo = presentes(e).some((q) => q.id !== id && q.id !== b.meta.presa && ve(e, q, yo));
  if (testigo) return e;

  const quien = b.meta.presa;
  const out = acciones.MUERTE(e, { quien, x: presa.x, z: presa.z });
  if (out === e) return e;
  // Cada uno anota lo que sabía en el momento.
  const pistas = sospechasDe(out, { quien, x: presa.x, z: presa.z });
  const bots = { ...out.bots };
  for (const t of Object.keys(pistas)) {
    bots[t] = { ...bots[t], sospechas: { ...bots[t].sospechas, [quien]: pistas[t] } };
  }
  // Y se va. Un conducto cerca es la salida limpia; si no, a hacer como que
  // hace una tarea en la otra punta del barco.
  const yoAhora = { ...bots[id], meta: null, ruta: null, paso: 0 };
  const cerca = out.mundo.conductos.filter((v) => dist(v, yoAhora) < 5).sort((a, c) => dist(a, yoAhora) - dist(c, yoAhora));
  const boca = cerca[0];
  if (boca) {
    const otras = out.mundo.conductos.filter((v) => v.anillo === boca.anillo && v.id !== boca.id);
    const sale = otras[Math.floor(azar() * otras.length)];
    Object.assign(yoAhora, { x: boca.x, z: boca.z, oculto: 1.2 + azar(), sale: { x: sale.x, z: sale.z }, conducto: boca.id });
    // Quien lo vea meterse, lo recuerda: es la prueba más fuerte que hay.
    for (const t of Object.keys(bots)) {
      const jt = out.jugadores[t];
      if (t === id || !jt.vivo || jt.rol === "impostor" || bots[t].oculto > 0) continue;
      if (ve(out, { id: t, x: bots[t].x, z: bots[t].z }, boca)) {
        bots[t] = { ...bots[t], conductos: { ...bots[t].conductos, [id]: out.t } };
      }
    }
  } else {
    yoAhora.espera = 0.4;
  }
  bots[id] = yoAhora;
  return { ...out, bots, recarga: RECARGA };
}

/** Los tripulantes vivos que en este momento ven el punto `p`, sin contar a
 *  `menos`. Con la vista de cada uno: el apagón se la achica. */
function testigosDe(e, p, menos) {
  const out = [];
  for (const id of Object.keys(e.bots)) {
    const j = e.jugadores[id], b = e.bots[id];
    if (id === menos || !j.vivo || j.rol === "impostor" || b.oculto > 0) continue;
    if (ve(e, { id, x: b.x, z: b.z }, p)) out.push(id);
  }
  return out;
}

/** Un tic de la tripulación entera. */
function correrTripulacion(e, dt) {
  if (!e.mundo || !globalThis.NAVE_NAV) return e;
  const azar = azarDe((e.semilla ^ Math.imul(e.tic, 374761393)) >>> 0);
  const conArreglos = mandarAArreglar(e);
  const bots = {};
  for (const id of Object.keys(conArreglos.bots)) {
    const j = conArreglos.jugadores[id];
    // Los muertos que no eran impostores siguen con sus tareas, como en el
    // juego real: fantasmas que nadie ve.
    const anda = j && (j.vivo || j.rol !== "impostor");
    bots[id] = anda ? pasoBot(conArreglos, id, conArreglos.bots[id], dt, azar) : conArreglos.bots[id];
  }
  let out = arreglosHechos({ ...conArreglos, bots, recarga: Math.max(0, e.recarga - dt) });
  const equipo = tareasDeEquipo(out);
  if (equipo.total && equipo.hechas >= equipo.total) {
    return { ...out, fin: "tripulantes", abierta: null, aviso: "TAREAS COMPLETAS" };
  }
  out = cazar(out, azar);
  if (out.fin) return out;
  return mirar(out);
}

// ── La reunión, dicha por ellos ─────────────────────────────────────────────

const nombreDe = (e, id) => id === e.yo ? "vos" : ((e.jugadores[id] || {}).nombre || id);

/** Lo que tiene cada uno contra cada otro, de 0 para arriba. Verlo meterse en
 *  un conducto pesa más que cualquier cercanía. */
function cargos(e, id) {
  const b = e.bots[id] || {};
  const r = e.reunion || {};
  const out = {};
  for (const q of Object.keys(b.conductos || {})) out[q] = (out[q] || 0) + 2;
  if (b.mato) out[b.mato.quien] = (out[b.mato.quien] || 0) + 3;
  const pistas = r.cuerpo && b.sospechas ? b.sospechas[r.cuerpo] : null;
  if (pistas) for (const q of Object.keys(pistas)) if (q.slice(0, 2) !== "__") out[q] = (out[q] || 0) + pistas[q];
  for (const q of Object.keys(out)) if (!e.jugadores[q] || !e.jugadores[q].vivo || q === id) delete out[q];
  return out;
}

function peorDe(c) {
  let mejor = null, max = 0;
  for (const q of Object.keys(c)) if (c[q] > max) { max = c[q]; mejor = q; }
  return { quien: mejor, peso: max };
}

/** Lo que dice cada uno al abrirse la reunión, y en qué segundo lo dice. Sale
 *  todo junto, de una vez, del estado y de la semilla: la pantalla muestra
 *  los que ya llegaron a su segundo. */
function declaraciones(e) {
  const r = e.reunion;
  const azar = azarDe((e.semilla ^ Math.imul(e.tic + 7, 2246822519)) >>> 0);
  const out = [];
  const cuerpo = r.cuerpo ? e.cuerpos[r.cuerpo] : null;
  const dondeCuerpo = cuerpo && cuerpo.x != null ? salaEn(e, cuerpo) || "un pasillo" : null;
  let en = 1.5;
  // `acusa` y `fuerte` no se muestran: son lo que los demás escuchan. Un
  // conducto visto es fuerte; "andaba raro", no.
  const decir = (quien, texto, acusa, fuerte) => {
    out.push({ quien, texto, en: Math.round(en * 10) / 10, acusa: acusa == null ? null : acusa, fuerte: !!fuerte });
    en += 1.2 + azar() * 1.6;
  };
  if (r.llamo && r.llamo !== e.yo && dondeCuerpo) {
    decir(r.llamo, "encontré a " + nombreDe(e, r.cuerpo) + " en " + dondeCuerpo);
  }
  for (const id of Object.keys(e.bots)) {
    const j = e.jugadores[id];
    if (!j.vivo) continue;
    const b = e.bots[id];
    const aca = salaEn(e, b.antes || b) || "un pasillo";
    if (j.rol === "impostor") {
      // Miente, pero con cuidado: dice dónde estaba o acusa al voleo.
      const otros = Object.keys(e.jugadores).filter((q) => q !== id && e.jugadores[q].vivo);
      if (otros.length && azar() < 0.35) {
        const q = otros[Math.floor(azar() * otros.length)];
        decir(id, q === e.yo ? "vos andabas raro" : nombreDe(e, q) + " andaba raro", q, false);
      } else decir(id, "yo estaba en " + aca);
      continue;
    }
    if (b.mato && e.jugadores[b.mato.quien] && e.jugadores[b.mato.quien].vivo) {
      const quien = b.mato.quien === e.yo ? "vos" : nombreDe(e, b.mato.quien);
      decir(id, "¡vi a " + quien + " matar a " + nombreDe(e, b.mato.a) + "!", b.mato.quien, true);
      continue;
    }
    const peor = peorDe(cargos(e, id));
    const pistas = r.cuerpo && b.sospechas ? b.sospechas[r.cuerpo] : null;
    const conQuien = pistas && pistas.__con;
    const sigue = pistas && pistas.__sigue;
    if (peor.quien && b.conductos && b.conductos[peor.quien] != null) {
      decir(id, peor.quien === e.yo ? "¡te vi meterte en un conducto!" : "¡vi a " + nombreDe(e, peor.quien) + " meterse en un conducto!", peor.quien, true);
    } else if (peor.quien && peor.quien === sigue && peor.peso >= UMBRAL) {
      decir(id, nombreDe(e, peor.quien) + " venía siguiendo a " + nombreDe(e, r.cuerpo), peor.quien, true);
    } else if (peor.quien && peor.quien === conQuien && peor.peso >= UMBRAL) {
      decir(id, "la última vez vi a " + nombreDe(e, r.cuerpo) + " con " + (peor.quien === e.yo ? "vos" : nombreDe(e, peor.quien)), peor.quien, peor.peso >= 0.7);
    } else if (peor.quien && peor.peso >= UMBRAL) {
      decir(id, peor.quien === e.yo ? "te vi cerca de " + (dondeCuerpo || "ahí")
                                    : "vi a " + nombreDe(e, peor.quien) + " cerca de " + (dondeCuerpo || "ahí"), peor.quien, false);
    } else if (id !== r.llamo) {
      decir(id, azar() < 0.5 ? "yo estaba en " + aca : "no vi nada");
    }
  }
  return out;
}

/** El voto de un tripulante que camina, cuando le llega el momento. */
function votoDeBot(e, id, azar) {
  const r = e.reunion;
  const vivos = Object.keys(e.jugadores).filter((q) => e.jugadores[q].vivo);
  // Lo que ya se votó, sin contar "nadie": arrastra a los que no saben.
  const cuenta = {};
  for (const q of Object.keys(r.votos)) if (r.votos[q] !== "nadie") cuenta[r.votos[q]] = (cuenta[r.votos[q]] || 0) + 1;
  const puntero = peorDe(cuenta).quien;
  if (e.jugadores[id].rol === "impostor") {
    if (puntero && puntero !== id) return puntero;
    const otros = vivos.filter((q) => q !== id);
    return azar() < 0.5 && otros.length ? otros[Math.floor(azar() * otros.length)] : "nadie";
  }
  const peor = peorDe(cargos(e, id));
  if (peor.quien && peor.peso >= UMBRAL) return peor.quien;
  // Lo que se dijo en voz alta también pesa: un conducto visto por otro
  // convence a casi todos.
  const pasado = REUNION_SEG - r.restante;
  for (const d of r.dichos || []) {
    if (d.en > pasado || d.acusa == null || d.quien === id) continue;
    if (d.fuerte && vivos.includes(d.acusa) && d.acusa !== id && azar() < 0.8) return d.acusa;
  }
  // Sin nada propio, sigue a la mayoría sólo si ya son dos o más: uno solo
  // acusando no alcanza para echar a nadie.
  if (puntero && puntero !== id && cuenta[puntero] >= 2 && azar() < 0.5) return puntero;
  return "nadie";
}

/** Los votos de los que caminan que ya llegaron a su segundo. */
function votanLosBots(e) {
  const r = e.reunion;
  if (!r || r.resultado || !r.votaEn) return e;
  let out = e;
  const pasado = REUNION_SEG - r.restante;
  for (const id of Object.keys(r.votaEn)) {
    if (out.reunion.resultado) break;
    if (out.reunion.votos[id] !== undefined || r.votaEn[id] > pasado) continue;
    if (!out.jugadores[id] || !out.jugadores[id].vivo) continue;
    const azar = azarDe((e.semilla ^ Math.imul(e.tic + 1, 1597334677) ^ Math.imul(id.length + 3, 668265263)) >>> 0);
    out = acciones.VOTO(out, { por: id, a: votoDeBot(out, id, azar) });
  }
  return out;
}

const INICIAL = {
  /** "jugando" | "reunion" */
  fase: "jugando",
  semilla: 1,
  /** quién soy yo en esta pantalla */
  yo: "local",
  jugadores: {},
  /** consolaId -> { juego, titulo, sala, hecha, paso } */
  tareas: {},
  /** consolaId de la tarea abierta, o null */
  abierta: null,
  aviso: "",
  /** el conducto por el que se entró la última vez, para el sabor */
  ultimoConducto: null,
  /** el sabotaje suelto: { tipo, restante, puntos: {punto: arreglado} } */
  sabotaje: null,
  /** segundos hasta el que viene */
  proximo: PRIMERO,
  /** cuántos tics lleva la partida: es lo que hace puro el sorteo del sabotaje */
  tic: 0,
  /** null mientras se juega; "tripulantes" o "impostores" cuando terminó */
  fin: null,
  /** la reunión en curso: { por, restante, votos, resultado } */
  reunion: null,
  /** los cuerpos sin levantar: { quien: { reportado } } */
  cuerpos: {},
  /** segundos de juego (sin contar reuniones): el reloj de los recuerdos */
  t: 0,
  /** la grilla y los puntos de la nave (ver la tripulación que camina) */
  mundo: null,
  /** los tripulantes que caminan: id -> { x, z, yaw, ruta, ... } */
  bots: {},
  /** segundos hasta que el impostor pueda volver a matar */
  recarga: RECARGA_PRIMERA,
};

const acciones = {
  PARTIDA_NUEVA(estado, { semilla, jugador, tareas, tripulacion, mundo, rolJugador }) {
    const mapa = {};
    for (const t of tareas) mapa[t.id] = { juego: t.juego, titulo: t.titulo, sala: t.sala, hecha: false };
    // La tripulación la trae el que empieza la partida —hoy, leyendo los
    // tripulantes del documento—. Cuando haya red va a venir de la sala, y ésta
    // es la única línea que cambia.
    const gente = { [jugador]: { nombre: "vos", color: "#E74C3C", rol: "tripulante", vivo: true, sala: null } };
    for (const t of tripulacion || []) {
      gente[t.id] = { nombre: t.nombre, color: t.color, rol: "tripulante", vivo: true, sala: null };
    }
    // El impostor sale de la semilla, como todo lo demás: dos pantallas de la
    // misma partida sospechan del mismo. Puede tocarte a vos —uno de cada seis,
    // como en una partida de seis—, salvo que `rolJugador` lo fije.
    const otros = Object.keys(gente).filter((id) => id !== jugador);
    if (rolJugador === "impostor") gente[jugador].rol = "impostor";
    else if (otros.length) {
      const bolsa = rolJugador === "tripulante" ? otros : [jugador, ...otros];
      const azar = azarDe((semilla ^ 0x9e3779b9) >>> 0);
      gente[bolsa[Math.floor(azar() * bolsa.length)]].rol = "impostor";
    }
    // El impostor no tiene tareas de verdad: las que le tocan no suman.
    if (gente[jugador].rol === "impostor") for (const id of Object.keys(mapa)) delete mapa[id];
    const nueva = {
      ...estado,
      semilla,
      yo: jugador,
      fase: "jugando",
      jugadores: gente,
      tareas: mapa,
      abierta: null,
      aviso: "",
      sabotaje: null,
      proximo: PRIMERO,
      tic: 0,
      fin: null,
      reunion: null,
      cuerpos: {},
      t: 0,
      mundo: mundo || null,
      bots: {},
      recarga: RECARGA_PRIMERA,
    };
    if (!mundo || !mundo.consolas || !mundo.consolas.length) return nueva;
    // Los que caminan arrancan alrededor de la mesa, como en el juego real,
    // cada uno con sus tareas sorteadas.
    const azar = azarDe((semilla ^ 0x51ed270b) >>> 0);
    const ids = mundo.consolas.map((c) => c.id);
    const bots = {};
    for (const id of otros) {
      bots[id] = { x: 0, z: 0, yaw: 0, ruta: null, paso: 0, meta: null, espera: 0, oculto: 0, sale: null,
                   tareas: mezclar(ids, azar).slice(0, TAREAS_BOT), siguiente: 0, hechas: 0, arreglado: null,
                   vistos: {}, sospechas: {}, conductos: {}, siguiendo: {} };
    }
    return { ...nueva, bots: enLaMesa(nueva, bots) };
  },

  /** Dónde está el jugador, en metros de nave. Lo manda su pantalla un par de
   *  veces por segundo: los que caminan lo ven —y lo recuerdan— y el impostor
   *  se cuida de él. Con red, cada uno manda el suyo. */
  POSICION(estado, { jugador, x, z }) {
    const j = estado.jugadores[jugador];
    if (!j || !Number.isFinite(x) || !Number.isFinite(z)) return estado;
    if (j.pos && j.pos.x === x && j.pos.z === z) return estado;
    return { ...estado, jugadores: { ...estado.jugadores, [jugador]: { ...j, pos: { x, z } } } };
  },

  TAREA_ABIERTA(estado, { consola }) {
    if (!estado.tareas[consola] || estado.tareas[consola].hecha) return estado;
    return { ...estado, abierta: consola };
  },

  TAREA_CERRADA(estado) {
    return estado.abierta === null ? estado : { ...estado, abierta: null };
  },

  TAREA_HECHA(estado, { consola }) {
    const tarea = estado.tareas[consola];
    if (!tarea || tarea.hecha) return estado;
    const tareas = { ...estado.tareas, [consola]: { ...tarea, hecha: true } };
    // Las tareas terminadas ganan la partida: las de toda la tripulación, la
    // barra verde del juego real. Sin tripulación que camine, las del jugador.
    const equipo = tareasDeEquipo({ ...estado, tareas });
    const todas = equipo.hechas >= equipo.total;
    return {
      ...estado,
      tareas,
      abierta: estado.abierta === consola ? null : estado.abierta,
      fin: todas ? "tripulantes" : estado.fin,
      aviso: todas ? "TAREAS COMPLETAS" : estado.aviso,
    };
  },

  // ── Sabotajes ─────────────────────────────────────────────────────────────

  /** El reloj de la partida. El cliente manda el `dt` que pasó: el reductor no
   *  lee la hora, porque entonces dos clientes con la misma semilla no verían
   *  lo mismo. Con red, los tics los va a mandar el dueño de la sala y todos
   *  van a ver el mismo reactor fundirse al mismo tiempo. */
  TIC(estado, { dt }) {
    if (estado.fin || !(dt > 0)) return estado;
    if (estado.fase === "reunion") {
      const r = estado.reunion;
      if (!r || r.resultado) return estado;
      const restante = r.restante - dt;
      const conReloj = { ...estado, reunion: { ...r, restante: Math.max(0, restante) } };
      // Los que caminan votan cuando les llega su segundo.
      const votado = votanLosBots(conReloj);
      if (votado.reunion.resultado || restante > 0) return votado;
      // Se acabó el tiempo: vale lo que se haya votado.
      return acciones.REUNION_RESUELTA(votado, {});
    }
    if (estado.fase !== "jugando") return estado;
    let e = { ...estado, tic: estado.tic + 1, t: (estado.t || 0) + dt };

    // Un crítico corriendo: la cuenta baja, y si llega a cero se pierde.
    if (e.sabotaje) {
      const s = SABOTAJES[e.sabotaje.tipo];
      if (s.limite) {
        const restante = e.sabotaje.restante - dt;
        if (restante <= 0) {
          return { ...e, sabotaje: null, fin: "impostores", abierta: null, aviso: "LA NAVE SE PERDIO: " + s.nombre };
        }
        e = { ...e, sabotaje: { ...e.sabotaje, restante } };
      }
    }

    // La tripulación camina, el impostor caza y alguno encuentra un cuerpo.
    e = correrTripulacion(e, dt);
    if (e.fin || e.fase !== "jugando" || e.sabotaje) return e;

    // Si el impostor sos vos, el reloj no rompe nada: `proximo` es lo que
    // falta para que puedas volver a sabotear, y sabotear lo decidís vos.
    if (e.jugadores[e.yo] && e.jugadores[e.yo].rol === "impostor") {
      return e.proximo > 0 ? { ...e, proximo: Math.max(0, e.proximo - dt) } : e;
    }
    const proximo = e.proximo - dt;
    if (proximo > 0) return { ...e, proximo };
    // Sale uno. El sorteo tiene que ser puro: la semilla de la partida y el
    // número de tic alcanzan, y son lo mismo en todas las pantallas.
    const azar = azarDe((e.semilla ^ Math.imul(e.tic, 2654435761)) >>> 0);
    const tipos = Object.keys(SABOTAJES);
    return acciones.SABOTAJE({ ...e, proximo: 0 }, { tipo: tipos[Math.floor(azar() * tipos.length)] });
  },

  SABOTAJE(estado, { tipo }) {
    const s = SABOTAJES[tipo];
    if (!s || estado.sabotaje || estado.fin) return estado;
    const puntos = {};
    for (const p of s.puntos) puntos[p] = false;
    // Un sabotaje interrumpe lo que se esté haciendo: es la mitad de la gracia.
    return { ...estado, sabotaje: { tipo, restante: s.limite, puntos, desde: estado.t || 0 }, abierta: null, aviso: s.aviso };
  },

  SABOTAJE_ARREGLADO(estado, { punto }) {
    const sab = estado.sabotaje;
    if (!sab || !(punto in sab.puntos) || sab.puntos[punto]) return estado;
    const puntos = { ...sab.puntos, [punto]: true };
    const faltan = Object.keys(puntos).filter((p) => !puntos[p]);
    // La tarea que el jugador tenga abierta no se toca: el que arregla puede
    // ser otro, en la otra punta de la nave.
    if (faltan.length) {
      return { ...estado, sabotaje: { ...sab, puntos }, aviso: "falta el otro punto: " + faltan[0] };
    }
    return { ...estado, sabotaje: null, proximo: DESCANSO, aviso: "" };
  },

  SALA_CAMBIADA(estado, { jugador, sala }) {
    const j = estado.jugadores[jugador];
    if (!j || j.sala === sala) return estado;
    return { ...estado, jugadores: { ...estado.jugadores, [jugador]: { ...j, sala } } };
  },

  VENTEO(estado, { jugador, desde, hasta }) {
    const j = estado.jugadores[jugador];
    if (!j) return estado;
    // Quien lo vea meterse lo recuerda, sea quien sea: en el juego real sólo
    // el impostor usa los conductos, así que es lo más sospechoso que hay.
    let bots = estado.bots;
    if (estado.mundo && j.pos && globalThis.NAVE_NAV) {
      for (const w of testigosDe(estado, j.pos, jugador)) {
        if (bots === estado.bots) bots = { ...estado.bots };
        bots[w] = { ...bots[w], conductos: { ...bots[w].conductos, [jugador]: estado.t } };
      }
    }
    return { ...estado, bots, ultimoConducto: hasta, jugadores: { ...estado.jugadores, [jugador]: { ...j, sala: null } } };
  },

  /** El jugador impostor mata. Lo que se chequea acá es lo que no depende de
   *  la pantalla —que le toque, que tenga el cuchillo cargado, que la víctima
   *  esté viva—; la distancia la mide el cliente, que es el que sabe dónde
   *  está la mano. Si alguien lo ve, lo recuerda y lo reporta en el acto. */
  MATAR(estado, { por, quien, x, z }) {
    const asesino = estado.jugadores[por], v = estado.jugadores[quien];
    if (!asesino || asesino.rol !== "impostor" || !asesino.vivo) return estado;
    if (estado.fase !== "jugando" || estado.fin || estado.recarga > 0) return estado;
    if (!v || !v.vivo || v.rol === "impostor" || quien === por) return estado;
    const b = estado.bots[quien];
    if (b && b.oculto > 0) return estado;
    const donde = Number.isFinite(x) && Number.isFinite(z) ? { x, z } : asesino.pos || null;
    const conPos = donde ? { ...estado, jugadores: { ...estado.jugadores, [por]: { ...asesino, pos: donde } } } : estado;
    let e = acciones.MUERTE(conPos, { quien, x: b ? b.x : undefined, z: b ? b.z : undefined, por });
    if (e === conPos) return estado;
    if (!e.mundo || !globalThis.NAVE_NAV) return e;
    const cuerpo = e.cuerpos[quien];
    const pistas = sospechasDe(e, { quien, x: cuerpo.x, z: cuerpo.z });
    const bots = { ...e.bots };
    for (const t of Object.keys(pistas)) bots[t] = { ...bots[t], sospechas: { ...bots[t].sospechas, [quien]: pistas[t] } };
    const testigos = donde ? testigosDe(e, donde, por) : [];
    for (const w of testigos) bots[w] = { ...bots[w], mato: { quien: por, a: quien, t: e.t } };
    e = { ...e, bots };
    if (e.fin || !testigos.length) return e;
    // El que lo vio más de cerca grita.
    const primero = testigos.slice().sort((a, c) => dist(bots[a], donde) - dist(bots[c], donde))[0];
    return acciones.REPORTE(e, { por: primero, quien });
  },

  // ── El impostor ───────────────────────────────────────────────────────────

  /** Alguien murió. El cuerpo queda donde cayó: `x`, `z` si vienen, y si no,
   *  donde estaba parado el que caminaba. Al jugador no lo mata nadie: no hay
   *  todavía forma de jugar de fantasma. */
  MUERTE(estado, { quien, x, z }) {
    const v = estado.jugadores[quien];
    if (!v || !v.vivo || v.rol === "impostor" || quien === estado.yo || estado.fin || estado.fase !== "jugando") return estado;
    const jugadores = { ...estado.jugadores, [quien]: { ...v, vivo: false } };
    const b = estado.bots && estado.bots[quien];
    const px = Number.isFinite(x) ? x : b ? b.x : null;
    const pz = Number.isFinite(z) ? z : b ? b.z : null;
    return conFinal({
      ...estado,
      jugadores,
      cuerpos: { ...estado.cuerpos, [quien]: { reportado: false, x: px, z: pz, t: estado.t || 0 } },
      recarga: RECARGA,
      aviso: "",
    });
  },

  /** Encontrar un cuerpo abre la reunión: es la otra forma de llamarla, y la
   *  única que no gasta el botón. */
  REPORTE(estado, { por, quien }) {
    const c = estado.cuerpos[quien];
    if (!c || c.reportado || estado.fase !== "jugando" || estado.fin) return estado;
    // Un muerto no reporta. `por` es el id de quien lo encontró: el jugador o
    // uno de los que caminan.
    const reporta = estado.jugadores[por];
    if (reporta && !reporta.vivo) return estado;
    const nombre = (estado.jugadores[quien] || {}).nombre || quien;
    const conCuerpo = { ...estado, cuerpos: { ...estado.cuerpos, [quien]: { ...c, reportado: true } } };
    const quienLlama = reporta ? por : null;
    const lo = quienLlama && quienLlama !== estado.yo ? ", lo encontró " + nombreDe(estado, quienLlama) : "";
    return acciones.REUNION_LLAMADA(conCuerpo, { por: "cuerpo de " + nombre + lo, cuerpo: quien, llamo: quienLlama });
  },

  // ── La reunión ────────────────────────────────────────────────────────────
  //
  // Es la parte del juego que más se parece a lo que viene: nadie decide nada
  // solo, se junta lo que dijo cada uno y recién ahí sale un resultado. Por eso
  // el voto es una acción como cualquier otra y el recuento vive en el
  // reductor: con red, los votos van a llegar del servidor en el orden que él
  // diga y esto no se entera.

  REUNION_LLAMADA(estado, { por, cuerpo, llamo }) {
    if (estado.fase === "reunion" || estado.fin) return estado;
    const e = {
      ...estado, fase: "reunion", abierta: null,
      reunion: { por, cuerpo: cuerpo || null, llamo: llamo || null,
                 restante: REUNION_SEG, votos: {}, resultado: null, dichos: [], votaEn: {} },
      aviso: "REUNION DE EMERGENCIA (" + por + ")",
    };
    if (!e.mundo || !Object.keys(e.bots || {}).length) return e;
    // Todos a la mesa, como en el juego real. Y cada uno dice lo suyo y vota
    // en su segundo, sorteado.
    const conMesa = { ...e, bots: enLaMesa(e, e.bots) };
    const dichos = declaraciones(conMesa);
    const azar = azarDe((e.semilla ^ Math.imul(e.tic + 3, 3266489917)) >>> 0);
    const votaEn = {};
    const ultimo = dichos.length ? dichos[dichos.length - 1].en : 0;
    for (const id of Object.keys(e.bots)) {
      if (e.jugadores[id] && e.jugadores[id].vivo) votaEn[id] = Math.round((ultimo + 2 + azar() * 10) * 10) / 10;
    }
    return { ...conMesa, reunion: { ...conMesa.reunion, dichos, votaEn } };
  },

  VOTO(estado, { por, a }) {
    const r = estado.reunion;
    if (!r || r.resultado) return estado;
    const vivos = Object.keys(estado.jugadores).filter((id) => estado.jugadores[id].vivo);
    if (!vivos.includes(por)) return estado;
    // Un voto por cabeza, y no se vota a un muerto. Las dos reglas van acá y no
    // en la pantalla: la pantalla es de uno solo, el reductor es de todos.
    if (r.votos[por] !== undefined) return estado;
    if (a !== "nadie" && !vivos.includes(a)) return estado;
    const votos = { ...r.votos, [por]: a };
    const conVotos = { ...estado, reunion: { ...r, votos } };
    if (Object.keys(votos).length < vivos.length) return conVotos;
    return acciones.REUNION_RESUELTA(conVotos, {});
  },

  /** El recuento. Empate o mayoría de "nadie": no se echa a nadie, como en el
   *  juego real. */
  REUNION_RESUELTA(estado) {
    const r = estado.reunion;
    if (!r || r.resultado) return estado;
    const cuenta = {};
    for (const id of Object.keys(r.votos)) {
      const v = r.votos[id];
      cuenta[v] = (cuenta[v] || 0) + 1;
    }
    let mejor = null, max = 0, empate = false;
    for (const quien of Object.keys(cuenta)) {
      if (cuenta[quien] > max) { mejor = quien; max = cuenta[quien]; empate = false; }
      else if (cuenta[quien] === max) empate = true;
    }
    const echado = !mejor || mejor === "nadie" || empate ? null : mejor;
    const nombre = echado ? (estado.jugadores[echado] || {}).nombre || echado : null;
    return {
      ...estado,
      reunion: { ...r, resultado: echado || "nadie" },
      aviso: echado ? nombre + " fue expulsado" : empate ? "empate: nadie fue expulsado" : "nadie fue expulsado",
    };
  },

  REUNION_CERRADA(estado) {
    if (estado.fase !== "reunion") return estado;
    const r = estado.reunion;
    const echado = r && r.resultado && r.resultado !== "nadie" ? r.resultado : null;
    const jugadores = echado
      ? { ...estado.jugadores, [echado]: { ...estado.jugadores[echado], vivo: false } }
      : estado.jugadores;
    // Volver a jugar da aire antes del próximo sabotaje y de la próxima muerte:
    // si no, la reunión termina y la nave se rompe en la cara.
    const eraImpostor = echado && estado.jugadores[echado].rol === "impostor";
    return conFinal({
      ...estado,
      fase: "jugando",
      reunion: null,
      jugadores,
      // Los cuerpos se levantan: después de la reunión ya no hay nada que
      // reportar, y si quedara uno tirado se podría llamar dos veces por lo mismo.
      cuerpos: {},
      aviso: eraImpostor ? "era el impostor" : echado ? "no era el impostor" : "",
      proximo: Math.max(estado.proximo, 20),
      recarga: Math.max(estado.recarga || 0, 20),
    });
  },

  AVISO(estado, { texto }) {
    return estado.aviso === texto ? estado : { ...estado, aviso: texto };
  },
};

/** Quién ganó, si ya ganó alguien. Las dos condiciones son las del juego real:
 *  sin impostores vivos ganan los tripulantes, y cuando quedan tantos
 *  impostores como tripulantes ya no hay forma de votarlos.
 *
 *  Va en una función y no adentro de cada acción porque son tres las que pueden
 *  terminar la partida —una muerte, una expulsión y una tarea— y la condición
 *  tiene que ser la misma en las tres. */
function conFinal(estado) {
  if (estado.fin) return estado;
  const vivos = Object.keys(estado.jugadores).filter((id) => estado.jugadores[id].vivo);
  const malos = vivos.filter((id) => estado.jugadores[id].rol === "impostor").length;
  // El aviso que ya venía puesto gana: "era el impostor" dice más que "no
  // quedan impostores", y es el que explica por qué se terminó.
  if (!malos) return { ...estado, fin: "tripulantes", aviso: estado.aviso || "no quedan impostores" };
  if (vivos.length - malos <= malos) {
    return { ...estado, fin: "impostores", aviso: estado.aviso || "los impostores ganaron" };
  }
  return estado;
}

/** El reductor. Una acción que no conoce no es un error: la ignora, porque con
 *  red va a haber clientes de versiones distintas en la misma sala. */
function reductor(estado = INICIAL, accion) {
  const fn = acciones[accion && accion.tipo];
  return fn ? fn(estado, accion.datos || {}) : estado;
}

/** El transporte local: devuelve cada acción en el acto y en orden de llegada.
 *  La sala en red va a tener esta misma forma —`enviar` y `alRecibir`— así que
 *  cambiarlo no toca el juego. */
function transporteLocal() {
  let recibir = null;
  return {
    nombre: "local",
    alRecibir(fn) { recibir = fn; },
    enviar(accion) { if (recibir) recibir(accion); },
  };
}

function crearTienda(transporte = transporteLocal()) {
  let estado = reductor(undefined, { tipo: "@@init" });
  const oyentes = new Set();
  let secuencia = 0;

  transporte.alRecibir((accion) => {
    const antes = estado;
    estado = reductor(estado, accion);
    if (estado !== antes) for (const fn of [...oyentes]) {
      try { fn(estado, accion, antes); } catch (e) { console.error("[nave] oyente:", e && e.message || e); }
    }
  });

  return {
    estado: () => estado,
    /** No aplica: manda. Lo que vuelve del transporte es lo que vale. */
    despachar(tipo, datos) {
      transporte.enviar({ tipo, datos: datos || {}, por: estado.yo, seq: ++secuencia });
    },
    suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
    transporte,
  };
}

/** Reparte tareas con la semilla de la partida: sin red, dos pantallas con la
 *  misma semilla piden lo mismo. `catalogo` son las consolas que el documento
 *  declaró; las de varios pasos entran con su paso previo. */
function repartirTareas(catalogo, semilla, cuantas) {
  const azar = azarDe(semilla);
  const sueltas = catalogo.filter((c) => !c.despuesDe);
  const elegidas = mezclar(sueltas, azar).slice(0, cuantas);
  const conPasos = [];
  for (const c of elegidas) {
    conPasos.push(c);
    // Las tareas de dos pasos arrastran el paso que las habilita.
    for (const otra of catalogo) if (otra.despuesDe === c.id) conPasos.push(otra);
  }
  return conPasos;
}

globalThis.NAVE_ESTADO = { crearTienda, reductor, transporteLocal, repartirTareas, azarDe, mezclar,
                           INICIAL, SABOTAJES, PRIMERO, DESCANSO, REUNION_SEG,
                           VEL, VISTA, VISTA_APAGON, CUIDADO_JUGADOR, ALCANCE, RECARGA, RECARGA_PRIMERA,
                           REACCION, ARREGLO, tareasDeEquipo, testigosDe };
