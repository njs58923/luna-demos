// La feria: girar, y desgirar.
//
// El punto de la escena está en la vuelta al mundo. La góndola cuelga del brazo,
// así que **hereda el giro del brazo**, y una góndola que gira con la rueda
// vuelca a los pasajeros a la mitad de la vuelta. En la realidad lo arregla la
// gravedad; acá lo tiene que arreglar el script:
//
//     brazo_i.rz    =  a_i + θ
//     gondola_i.rz  = −(a_i + θ)
//
// La suma de las dos rotaciones locales es cero, así que la góndola queda
// derecha en el mundo mientras el brazo la pasea. Es el caso inverso al de la
// sala de máquinas: allá la jerarquía no alcanzaba y había que calcular
// posiciones a mano, acá hace de más y hay que restarle.
//
// Las otras dos máquinas están para contraste. La calesita usa la jerarquía tal
// cual —los caballos giran con el techo, que es lo que se quiere— y sólo les
// mueve la altura. Las sillas abren con el **cuadrado** de la velocidad, igual
// que el regulador de la sala de máquinas.
const CFG = globalThis.FERIA || {};
const R = CFG.rueda || {};
const C = CFG.calesita || {};
const S = CFG.sillas || {};
const root = hiperspace.dimention;

/** Cada juego arranca parado y acelera al tocarlo. La rampa importa: una rueda
 *  de once metros que arranca a velocidad plena se lee como un error. */
const juegos = {
  rueda: { v: 0, objetivo: 0, max: 0.16, th: 0 },
  calesita: { v: 0, objetivo: 0, max: 0.55, th: 0 },
  sillas: { v: 0, objetivo: 0, max: 0.85, th: 0 },
};

const brazos = [];
const gondolas = [];
const caballos = [];
const cadenas = [];
let nCalesita = null;
let nSillas = null;
const panel = {};
let listo = false;
let previo = 0;
let tic = -1;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

function alternar(nombre) {
  const j = juegos[nombre];
  j.objetivo = j.objetivo > 0 ? 0 : j.max;
  const andando = Object.keys(juegos).filter((k) => juegos[k].objetivo > 0);
  texto("f_estado", andando.length === 0 ? "todo parado"
        : andando.length === 3 ? "los tres andando" : andando.join(" y ") + " andando");
}

function preparar() {
  for (const id of ["f_titulo", "f_estado", "f_dato"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  for (let i = 0; i < R.gondolas; i++) {
    const b = root.getElementById("brazo_" + i);
    const g = root.getElementById("gondola_" + i);
    if (!b || !g) return false;
    brazos.push(b);
    gondolas.push(g);
  }
  for (let i = 0; i < C.caballos; i++) {
    const el = root.getElementById("caballo_" + i);
    if (!el) return false;
    caballos.push(el);
  }
  for (let i = 0; i < S.sillas; i++) {
    const el = root.getElementById("cadena_" + i);
    if (!el) return false;
    cadenas.push(el);
  }
  nCalesita = root.getElementById("calesita");
  nSillas = root.getElementById("sillas");
  if (!nCalesita || !nSillas) return false;
  for (const [id, nombre] of [["boton_rueda", "rueda"], ["boton_calesita", "calesita"], ["boton_sillas", "sillas"]]) {
    const el = root.getElementById(id);
    if (!el) return false;
    el.addEventListener("toque", (function (k) {
      return function () { alternar(k); };
    })(nombre));
  }
  console.log("[feria] " + R.gondolas + " gondolas, " + C.caballos + " caballos, " +
              S.sillas + " sillas");
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

  // Rampa de arranque y frenado: se acerca al objetivo a un ritmo fijo.
  for (const k in juegos) {
    const j = juegos[k];
    const paso = j.max * dt * 0.5;
    if (j.v < j.objetivo) j.v = Math.min(j.objetivo, j.v + paso);
    else if (j.v > j.objetivo) j.v = Math.max(j.objetivo, j.v - paso);
    j.th += j.v * Math.PI * 2 * dt;
  }

  const lote = [];

  // --- la rueda: girar y desgirar ---------------------------------------
  const th = juegos.rueda.th;
  for (let i = 0; i < brazos.length; i++) {
    const a = (i / brazos.length) * Math.PI * 2;
    lote.push(brazos[i].nodeId, 0, 0, 0, 0, 0, a + th);
    // La contrarrotación. Su posición local es (0, radio, 0) y no cambia: lo
    // único que se le toca es el giro.
    lote.push(gondolas[i].nodeId, 0, R.radio, 0, 0, 0, -(a + th));
  }

  // --- la calesita: la jerarquía tal cual, y sólo la altura --------------
  lote.push(nCalesita.nodeId, 0, 0, 0, 0, juegos.calesita.th, 0);
  for (let i = 0; i < caballos.length; i++) {
    const a = (i / caballos.length) * Math.PI * 2;
    const x = Math.sin(a) * C.radio;
    const z = Math.cos(a) * C.radio;
    // Cada caballo sube y baja desfasado: si suben todos juntos, la calesita
    // parece una plataforma que rebota.
    const y = Math.sin(juegos.calesita.th * 2.6 + i * 1.1) * 0.42;
    lote.push(caballos[i].nodeId, x, y, z, 0, a + Math.PI / 2, 0);
  }

  // --- las sillas: abren con el cuadrado de la velocidad -----------------
  lote.push(nSillas.nodeId, 0, S.eje, 0, 0, juegos.sillas.th, 0);
  const abre = Math.min(1, (juegos.sillas.v / juegos.sillas.max) ** 2);
  for (let i = 0; i < cadenas.length; i++) {
    // La cadena se inclina hacia afuera; el asiento cuelga de ella y acompaña,
    // que acá sí es lo que se quiere.
    lote.push(cadenas[i].nodeId, 0, 0, S.radio, -abre * 0.75, 0, 0);
  }

  root.setTransformBatch(lote);

  const paso = Math.floor(ahora / 400);
  if (paso === tic) return;
  tic = paso;
  const v = juegos.rueda.v / juegos.rueda.max;
  texto("f_dato", v > 0.01
        ? "la rueda va a " + (juegos.rueda.v * 60).toFixed(1) + " vueltas por minuto"
        : "");
}

requestAnimationFrame(frame);
