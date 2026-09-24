// El ascensor: mover al visitante en vez de cargar una sala.
//
// El script es corto a propósito. Toda la escena está en una sola decisión de
// estructura —seis salas apiladas en un documento, y una cabina que es el padre
// de todo lo que va adentro— y lo único que hace el script es mover ese nodo.
//
// Vale la pena mirar lo que **no** hay acá: no hay carga, no hay descarga, no hay
// una lista de qué mostrar y qué esconder, no hay estado que guardar y restaurar
// al volver a un piso. Las seis salas existen todo el tiempo; lo que cambia es
// dónde está uno. Es la diferencia entre un mundo y un menú de escenas, y es
// exactamente el problema que el atrio resuelve del otro modo — llevando al
// visitante de un `.hsml` a otro, con lo que eso cuesta.
//
// La cola de llamadas está porque un ascensor sin cola no es un ascensor: se
// pueden pedir varios pisos y los atiende en el orden en que le quedan de paso,
// que es lo que hace que la máquina se sienta una máquina y no un teletransporte
// con animación.
const CFG = globalThis.ASCENSOR || {};
const PISOS = CFG.pisos || [];
const H = CFG.altura || 6;
const root = hiperspace.dimention;

const VEL = 3.4;          // metros por segundo
const ESPERA = 1.6;       // segundos con las puertas abiertas

let nCabina = null;
const panel = {};
let listo = false;
let previo = 0;
let tic = -1;

let y = 0;                // altura actual de la cabina
let piso = 0;             // el último piso alcanzado
let destino = 0;
let pendientes = [];      // la cola
let parada = 0;           // segundos que le quedan de espera
let viajes = 0;
let ronda = 0;
let proxima = 0;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** Poner un piso en la cola. Repetirlo no lo agrega dos veces, que es lo que
 *  hace cualquier ascensor y lo que la gente espera al apretar dos veces. */
function pedir(p) {
  if (p === destino && Math.abs(y - p * H) < 0.05) return;
  if (pendientes.indexOf(p) >= 0) return;
  pendientes.push(p);
  texto("as_estado", "pedido el piso " + p + " · " + pendientes.length + " en cola");
}

/** El próximo destino: de los pedidos, el que quede en el sentido en que ya va;
 *  si no hay ninguno para ese lado, el más cercano. Es la regla real de un
 *  ascensor y por eso se siente como uno. */
function elegir() {
  if (!pendientes.length) return -1;
  const subiendo = destino >= piso;
  const mismoLado = pendientes.filter((p) => (subiendo ? p >= piso : p <= piso));
  const lista = mismoLado.length ? mismoLado : pendientes;
  let mejor = lista[0];
  for (const p of lista) if (Math.abs(p - piso) < Math.abs(mejor - piso)) mejor = p;
  return mejor;
}

function preparar() {
  for (const id of ["as_piso", "as_estado", "as_dato"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  nCabina = root.getElementById("cabina");
  if (!nCabina) return false;
  for (let i = 0; i < PISOS.length; i++) {
    const b = root.getElementById("ir_" + i);
    const l = root.getElementById("llamar_" + i);
    if (!b || !l) return false;
    const mano = (function (j) {
      return function () { ronda = -1; pedir(j); };
    })(i);
    b.addEventListener("toque", mano);
    l.addEventListener("toque", mano);
  }
  console.log("[ascensor] " + PISOS.length + " salas en un documento, hueco de " +
              ((PISOS.length - 1) * H) + " m");
  return true;
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

  const objetivo = destino * H;
  const d = objetivo - y;

  if (Math.abs(d) > 0.02) {
    // Viajando. Frena al acercarse: un ascensor que llega a velocidad plena y se
    // clava se siente como un corte, no como una máquina.
    const freno = Math.min(1, Math.abs(d) / 1.6);
    const v = VEL * Math.max(0.18, freno);
    y += Math.sign(d) * Math.min(Math.abs(d), v * dt);
    texto("as_estado", (d > 0 ? "subiendo a " : "bajando a ") + PISOS[destino].nombre);
  } else {
    y = objetivo;
    if (piso !== destino) {
      piso = destino;
      viajes++;
      parada = ESPERA;
      texto("as_piso", String(piso));
      texto("as_estado", PISOS[piso].nombre + " · " + PISOS[piso].detalle);
      // Llegar saca ese piso de la cola. Se hace acá y no al pedirlo porque un
      // piso se puede pedir mientras el ascensor ya está yendo hacia él.
      pendientes = pendientes.filter((p) => p !== piso);
    }
    if (parada > 0) parada -= dt;
    else {
      const p = elegir();
      if (p >= 0) {
        destino = p;
        pendientes = pendientes.filter((q) => q !== p);
      }
    }
  }

  // La escena entera, en una escritura. Todo lo que está adentro de la cabina
  // —la botonera, los carteles, el visitante— es hijo de este nodo y sube con
  // él; eso es toda la técnica.
  root.setTransformBatch([nCabina.nodeId, 0, y, 0, 0, 0, 0]);

  // La ronda sola: recorre el edificio de punta a punta y vuelve.
  if (ronda >= 0 && !pendientes.length && parada <= 0 && Math.abs(d) <= 0.02) {
    // En planta baja espera más: es donde aparece el visitante, y con 2,2 s la
    // cabina ya se había ido antes de que terminara de cargar la sala.
    if (!proxima) proxima = ahora + (piso === 0 ? 9000 : 2200);
    if (ahora >= proxima) {
      proxima = 0;
      const n = PISOS.length;
      // Sube uno por uno y después baja de una: mostrar las salas primero y el
      // hueco entero después.
      const paso = ronda % (n + 1);
      pedir(paso < n ? paso : 0);
      ronda++;
    }
  }

  const t = Math.floor(ahora / 250);
  if (t === tic) return;
  tic = t;
  texto("as_dato", "altura " + y.toFixed(1) + " m · " + viajes + " viajes · " +
        "las seis salas estan cargadas todo el tiempo");
}

requestAnimationFrame(frame);
