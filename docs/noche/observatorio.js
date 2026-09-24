// El observatorio: dos ángulos, y ninguno es el que uno querría.
//
// Apuntar el telescopio parece que debería ser fácil: la estrella está en tal
// lado, girá para allá. No lo es, porque la montura no gira para allá. Es
// **ecuatorial**: su primer eje está inclinado el ángulo de la latitud y apunta a
// la estrella polar, de modo que un solo motor compense la rotación de la Tierra.
// Los dos ángulos que la montura sabe mover son:
//
//   hora  cuánto giró alrededor del eje polar
//   dec   cuánto se separó del ecuador celeste
//
// y ninguno de los dos es «izquierda» ni «arriba». Convertir de lo que uno
// quiere a lo que la montura puede es todo el trabajo de esta escena, y es el
// mismo tipo de trabajo que la biela de la sala de máquinas: la jerarquía de
// nodos aporta la geometría, el script aporta la trigonometría, y ninguno de los
// dos puede hacer el trabajo del otro.
//
// La parte linda es que casi no hay que convertir nada. Como los grupos están
// anidados en el orden de la montura real —pilar, eje polar, eje horario, eje de
// declinación— la ascensión recta y la declinación del catálogo **son** los dos
// ángulos, corridos por la hora sidérea. La conversión que sí hace falta es la de
// vuelta, para poder mostrar a qué altura sobre el horizonte quedó apuntado, que
// es lo que un humano entiende.
const CFG = globalThis.OBSERVATORIO || {};
const OBJETOS = CFG.objetos || [];
const LAT = (CFG.latitud || 40) * Math.PI / 180;
const root = hiperspace.dimention;

const GRADO = Math.PI / 180;
const VEL = 0.9;        // radianes por segundo de los motores

let ejeHora = null, ejeDec = null;
const panel = {};
let listo = false;
let previo = 0;
let tic = -1;

/** Dónde está y a dónde va cada eje. Los motores no saltan: van al objetivo a
 *  velocidad fija, que es lo que hace que apuntar se vea como una operación y no
 *  como un corte. */
let hora = 0, dec = 0;
let horaObj = 0, decObj = 0;
let elegido = -1;
let siguiendo = false;
/** La ronda de demostracion. Un telescopio parado no muestra que es un
 *  telescopio: hasta que alguien toca algo, la escena se apunta sola de objeto en
 *  objeto. El primer toque la apaga y no vuelve. */
let ronda = 0;
let proxima = 0;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

/** La hora sidérea, fingida: avanza sola y da una vuelta cada cuatro minutos en
 *  vez de cada veintitrés horas y pico. A escala real el seguimiento sería
 *  invisible, y el seguimiento es justo lo que la escena quiere mostrar. */
function sidereo(ahora) {
  return ((ahora / 1000) / 240) * Math.PI * 2;
}

/** El camino corto entre dos ángulos. Sin esto, ir de 359° a 1° da la vuelta
 *  entera y el telescopio hace un gesto absurdo. */
function acortar(desde, hasta) {
  let d = (hasta - desde) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return desde + d;
}

/** De los dos ángulos de la montura a lo que ve un humano: altura sobre el
 *  horizonte y azimut. Es la conversión clásica, y va en este sentido porque el
 *  otro no hace falta: la montura ya piensa en hora y declinación. */
function aHorizonte(h, d) {
  const sinAlt = Math.sin(d) * Math.sin(LAT) + Math.cos(d) * Math.cos(LAT) * Math.cos(h);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(
    -Math.cos(d) * Math.sin(h),
    Math.sin(d) * Math.cos(LAT) - Math.cos(d) * Math.sin(LAT) * Math.cos(h),
  );
  return { alt: alt / GRADO, az: ((az / GRADO) + 360) % 360 };
}

function apuntar(i, ahora) {
  elegido = i;
  const o = OBJETOS[i];
  decObj = o.dec * GRADO;
  // El ángulo horario es la hora sidérea menos la ascensión recta. Es la única
  // línea de la escena donde entra la rotación de la Tierra.
  horaObj = sidereo(ahora) - (o.ar / 24) * Math.PI * 2;
  hora = acortar(hora, horaObj);
  texto("ob_objeto", "apuntando a " + o.nombre);
}

function preparar() {
  for (const id of ["ob_objeto", "ob_coord", "ob_ejes"]) {
    const el = root.getElementById(id);
    if (!el) return false;
    panel[id] = el;
  }
  ejeHora = root.getElementById("hora");
  ejeDec = root.getElementById("dec");
  if (!ejeHora || !ejeDec) return false;
  for (let i = 0; i < OBJETOS.length; i++) {
    const b = root.getElementById("obj_" + i);
    if (!b) return false;
    b.addEventListener("toque", (function (j) {
      return function () { ronda = -1; apuntar(j, performance.now()); siguiendo = true; };
    })(i));
  }
  const s = root.getElementById("seguir");
  const p = root.getElementById("parquear");
  if (!s || !p) return false;
  s.addEventListener("toque", function () {
    ronda = -1;
    siguiendo = !siguiendo;
    texto("ob_objeto", siguiendo
          ? (elegido >= 0 ? "siguiendo a " + OBJETOS[elegido].nombre : "seguimiento encendido")
          : "seguimiento apagado — mirá cómo se le escapa");
  });
  p.addEventListener("toque", function () {
    ronda = -1;
    // La posición de reposo de un telescopio real: tubo vertical, contrapeso
    // abajo. Es donde se lo deja para que no le entre polvo por la boca.
    elegido = -1;
    siguiendo = false;
    horaObj = 0;
    decObj = 0;
    hora = acortar(hora, 0);
    texto("ob_objeto", "a reposo");
  });
  console.log("[observatorio] latitud " + (LAT / GRADO).toFixed(1) + " grados, " +
              OBJETOS.length + " objetos");
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

  // La ronda sola, mientras nadie haya tocado nada.
  if (ronda >= 0) {
    if (!proxima) proxima = ahora + 900;
    if (ahora >= proxima) {
      proxima = ahora + 7000;
      apuntar(ronda % OBJETOS.length, ahora);
      siguiendo = true;
      ronda++;
    }
  }

  // El seguimiento: el único motor que corrige la rotación de la Tierra es el
  // horario, y ésa es toda la gracia de la montura ecuatorial. Apagarlo deja la
  // estrella escapándose del campo, que es exactamente lo que pasa de verdad.
  if (siguiendo && elegido >= 0) {
    horaObj = sidereo(ahora) - (OBJETOS[elegido].ar / 24) * Math.PI * 2;
  }

  // Los motores. Van a velocidad fija hasta llegar: no hay rampa porque un
  // telescopio tampoco la tiene de forma visible, y sí hay tope para que el
  // gesto de apuntar dure lo suficiente como para verse.
  const objH = acortar(hora, horaObj);
  const dh = objH - hora;
  const paso = VEL * dt;
  hora += Math.abs(dh) < paso ? dh : Math.sign(dh) * paso;
  const dd = decObj - dec;
  dec += Math.abs(dd) < paso ? dd : Math.sign(dd) * paso;

  // Y acá está el pago de haber armado bien la jerarquía: dos escrituras. Toda
  // la geometría de la montura —la inclinación del eje polar, el brazo del
  // contrapeso, el corrimiento del tubo— la resuelven los grupos anidados.
  root.setTransformBatch([
    ejeHora.nodeId, 0, 0.85, 0, 0, hora, 0,
    ejeDec.nodeId, 0, 0.35, 0, dec, 0, 0,
  ]);

  const t = Math.floor(ahora / 200);
  if (t === tic) return;
  tic = t;
  const h = aHorizonte(hora, dec);
  texto("ob_coord", elegido >= 0
        ? OBJETOS[elegido].nombre + ": AR " + OBJETOS[elegido].ar.toFixed(2) + " h · dec " + OBJETOS[elegido].dec.toFixed(1) + "°"
        : "sin objeto");
  texto("ob_ejes",
        "eje horario " + ((hora / GRADO) % 360).toFixed(1) + "° · declinacion " + (dec / GRADO).toFixed(1) + "°" +
        "   →   altura " + h.alt.toFixed(1) + "° azimut " + h.az.toFixed(0) + "°" +
        (h.alt < 0 ? "  (bajo el horizonte)" : ""));
}

requestAnimationFrame(frame);
