// eco.js — la sala de los ecos: todo lo que toca el motor.
//
// Las reglas no están acá: están en `partida.js`, que no sabe que existe Luna.
// Este archivo hace lo otro —encender placas, escribir muestras, mover textos—
// y le pasa el reloj. El corte es lo que permite probar el juego entero sin
// abrirlo (ver `src/pruebas.ts`).
//
// ── Por qué un stream y no un clip por nota ─────────────────────────────────
//
// `new Audio(blob)` también servía: se arma un WAV en memoria y se reproduce.
// Pero cada uno es **una voz**, hay dieciséis por isolate, y hay que acordarse
// de `dispose()`. Un `AudioStream` es una sola voz para toda la partida: se
// abre al empezar y se le van escribiendo muestras.
//
// Tiene un precio y conviene saberlo: **quedarse sin datos no es terminar**. Un
// stream vacío emite silencio y sigue esperando; `ended` sólo llega después de
// `end()`. Acá eso es justo lo que se quiere —el silencio entre notas es
// silencio de verdad— pero significa que un generador que se atrase produce un
// hueco mudo, no un error.
const CFG = globalThis.ECO || {};
const ECOS = CFG.ecos || [];
const raiz = hiperspace.dimention;

/** El eco de la sala. Vive entre notas: la cola de una se derrama sobre el
 *  silencio de la siguiente, que por eso se escribe en vez de dejarse vacio.
 *
 *  Se crea en `armar()` y no acá. **Los <script src> llegan asincronicos y el
 *  motor no garantiza el orden**: este archivo puede evaluarse antes que
 *  sonido.js, y un `Sonido.crearEco()` de nivel superior mata el script entero
 *  con un ReferenceError. Paso, y lo que se ve es una sala que responde al
 *  toque —el host reporta el impacto igual— pero no hace nada. */
let eco = null;

// ── El sintetizador ─────────────────────────────────────────────────────────

/** La frecuencia de muestreo. Sale de `Sonido` para que no haya dos verdades:
 *  generar a 24 kHz y abrir el stream a 48 haria sonar todo una octava abajo.
 *  Se lee tarde —dentro de abrirVoz— por lo mismo que el eco. */
/** Medio segundo de anillo. Alcanza para dos notas en vuelo y no hace que una
 *  pulsación tarde en oírse: lo que se escribe se escucha cuando se vacía lo
 *  anterior, así que un buffer grande es latencia. */
const SEGUNDOS_BUFFER = 0.5;

let voz = null;
let vozLista = false;
let abriendo = null;

function abrirVoz() {
  if (abriendo) return abriendo;
  abriendo = (async function () {
    try {
      voz = new AudioStream({ sampleRate: Sonido.MUESTREO, channels: 1, bufferSeconds: SEGUNDOS_BUFFER });
      voz.volume = 0.45;
      await voz.ready;
      await voz.play();
      vozLista = true;
      console.log("[eco] voz abierta a " + Sonido.MUESTREO + " Hz");
    } catch (e) {
      // Sin permiso `audio`, o sin dispositivo: el juego sigue, mudo. Un juego
      // de memoria sonora sin sonido no sirve de mucho, pero peor sería una
      // sala que no responde y no explica nada.
      voz = null;
      console.error("[eco] sin audio: " + String(e));
    }
    return voz;
  })();
  return abriendo;
}

/** Escribir muestras. No espera a que terminen de sonar: espera a que entren en
 *  el anillo, que es otra cosa. Encadenar dos notas es escribir una después de
 *  la otra y dejar que el mezclador las vaya consumiendo. */
async function escribir(pcm) {
  if (!voz || !vozLista) return;
  try { await voz.writeAll(eco.procesar(pcm)); } catch (e) { console.error("[eco] " + String(e)); }
}

function sonar(frecuencia, segundos) {
  return escribir(Sonido.nota(frecuencia, segundos || 0.42));
}

/** Silencio escrito, para separar dos notas.
 *
 *  Podría no escribirse nada y dejar que el stream se vacíe —eso también suena
 *  a silencio—, pero entonces la duración del hueco dependería de cuánto tarde
 *  el generador, no de cuánto se quiso. Escribir ceros lo hace medible. */
function callar(segundos) {
  return escribir(Sonido.silencio(segundos));
}

/** Dos tonos juntos a distancia de tritono. No hay nada que suene más a error
 *  sin ser un ruido: es el intervalo que la música lleva ochocientos años
 *  usando exactamente para eso. */
function sonarError() {
  const dur = 0.55;
  return escribir(Sonido.mezclar(Sonido.nota(138.59, dur), Sonido.nota(196.0, dur)));
}

/** Tres notas para arriba, cortas. Lo justo para que se note que algo salió
 *  bien sin demorar la ronda siguiente. */
async function sonarRonda() {
  for (const f of [523.25, 659.25, 783.99]) {
    await sonar(f, 0.12);
    await callar(0.01);
  }
}

// ── Los glifos ──────────────────────────────────────────────────────────────
// Una malla para los seis simbolos. Se tesela una vez; encender una runa
// reescribe su tramo del buffer de color y manda la malla de nuevo.

let glifos = null;
let mallaGlifos = null;

/** Los puntos de progreso: uno por nota de la ronda. Se rehacen cuando la
 *  secuencia crece —son otra cantidad de circulos, asi que otra malla— y se
 *  repintan cuando avanzas. */
let puntos = null;
let mallaPuntos = null;
let nodoPuntos = null;
let cuantosPuntos = 0;

function repintarGlifos() {
  if (!glifos || !mallaGlifos) return;
  // `update` manda los cinco buffers SIEMPRE. Los que no se pasan viajan
  // vacios, no "sin cambios", y con indices vacio el motor los regenera
  // implicitos: la malla se vuelve una tira de puas. Por eso se manda el objeto
  // entero aunque solo hayan cambiado los colores.
  try { mallaGlifos.update(glifos.buffers); }
  catch (e) { console.error("[glifos] " + String(e)); }
}

/** Rehacer la fila de puntos si cambio la cantidad, y pintar cuantos van.
 *
 *  `hechos` es cuantas notas acerto el visitante; `total`, cuantas tiene la
 *  ronda. Durante la demostracion se pintan todos apagados: los puntos cuentan
 *  **tu** progreso, no el de la maquina, y encenderlos mientras suena la
 *  secuencia seria decir la respuesta. */
function marcarProgreso(hechos, total) {
  if (!nodoPuntos || typeof Glifos === "undefined") return;

  if (total !== cuantosPuntos) {
    cuantosPuntos = total;
    puntos = total > 0 ? Glifos.teselaPuntos(total) : null;
    mallaPuntos = null;
    if (!puntos) { nodoPuntos.setAttribute("visible", "false"); return; }
    nodoPuntos.setAttribute("visible", "inherit");
  }
  if (!puntos) return;

  for (let i = 0; i < cuantosPuntos; i++) {
    puntos.pintar(i, i < hechos ? "#EDF2FA" : "#2A3444");
  }
  try {
    if (!mallaPuntos) {
      mallaPuntos = MeshResource.create(puntos.buffers);
      nodoPuntos.src = mallaPuntos.src;
    } else {
      mallaPuntos.update(puntos.buffers);
    }
  } catch (e) {
    console.error("[puntos] " + String(e));
    puntos = null;
  }
}

// ── Las runas ───────────────────────────────────────────────────────────────

const runas = [];

/** Aclarar u oscurecer un color. Lo que hace que algo se lea como la versión
 *  encendida de otra cosa no son los colores sino la relación entre ellos. */
function tinte(hex, k) {
  const v = parseInt(String(hex).replace("#", ""), 16);
  if (!isFinite(v)) return hex;
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(function (x) {
    return Math.max(0, Math.min(255, Math.round(x * k)));
  });
  return "#" + c.map(function (x) {
    const s = x.toString(16);
    return s.length < 2 ? "0" + s : s;
  }).join("");
}

function apagada(runa) {
  // Vuelve al realce del hover si el puntero sigue encima: apagar del todo una
  // runa señalada la haría parpadear al soltar cada nota.
  return runa.encima ? tinte(runa.eco.color, 1.5) : runa.eco.color;
}

function encender(runa, encendida) {
  runa.placa.setAttribute("color", encendida ? runa.eco.brillo : apagada(runa));
  if (glifos) {
    // El simbolo va al reves que su placa: claro sobre oscuro cuando esta
    // apagada, oscuro sobre claro cuando se enciende. Si acompanara el brillo
    // se perderia justo cuando mas hace falta verlo.
    glifos.pintar(runa.indice, encendida ? runa.eco.color : "#EDF2FA");
    repintarGlifos();
  }
}

/** Encender, sonar, apagar. El apagado va por temporizador y no encadenado al
 *  audio: si el audio no está disponible el destello tiene que ocurrir igual. */
function pulsar(runa, segundos) {
  const dur = segundos || 0.42;
  encender(runa, true);
  sonar(runa.eco.tono, dur);
  if (runa.apagar) clearTimeout(runa.apagar);
  runa.apagar = setTimeout(function () {
    runa.apagar = 0;
    encender(runa, false);
  }, dur * 1000);
}

function decir(texto) {
  const nodo = raiz.getElementById("estado");
  if (nodo) nodo.setAttribute("value", texto);
}

// ── Armado ──────────────────────────────────────────────────────────────────

let listo = false;
let partida = null;
let reloj = 0;

/** El reloj del juego, en segundos. Sale del timestamp del cuadro y no de
 *  `Date.now()`: es el mismo que usa el motor para animar, así que si un cuadro
 *  se atrasa las dos cosas se atrasan juntas. */
function ahora() { return reloj; }

function armar() {
  // Se junta en un arreglo aparte y sólo se acepta entero: `armar` se reintenta
  // cuadro a cuadro hasta que el documento termine de montarse, y a medias
  // dejaría runas duplicadas.
  const juntadas = [];
  for (let i = 0; i < ECOS.length; i++) {
    const eco = ECOS[i];
    const placa = raiz.getElementById(eco.id);
    const blanco = raiz.getElementById(eco.id + "_toque");
    if (!placa || !blanco) return false;
    juntadas.push({ eco: eco, placa: placa, blanco: blanco, apagar: 0, encima: false, indice: i });
  }
  const altar = raiz.getElementById("altar_toque");
  if (!altar) return false;

  // Los otros tres scripts pueden no haber llegado: los <script src> se cargan
  // en asincrono y el motor NO garantiza el orden. Esperar es mas barato que
  // ordenarlos, pero hay que esperar a los tres y **desde adentro del cuadro**,
  // no en el nivel superior del archivo.
  if (typeof Sonido === "undefined" || typeof crearPartida !== "function") return false;

  if (!eco) eco = Sonido.crearEco();

  for (const r of juntadas) runas.push(r);

  // Los simbolos. Si el motor no tiene PathGeometry el juego sigue, sin ellos:
  // es una build vieja, no un error del documento.
  nodoPuntos = raiz.getElementById("pasos");
  const nodoGlifos = raiz.getElementById("glifos");
  glifos = (typeof Glifos !== "undefined") ? Glifos.tesela(ECOS.map(function (e) { return e.pose; })) : null;
  if (glifos && nodoGlifos) {
    for (let i = 0; i < runas.length; i++) glifos.pintar(i, "#EDF2FA");
    try {
      mallaGlifos = MeshResource.create(glifos.buffers);
      nodoGlifos.src = mallaGlifos.src;
    } catch (e) {
      console.error("[glifos] no se pudo crear la malla: " + String(e));
      glifos = null;
    }
  }

  partida = crearPartida({
    cuantas: runas.length,

    // La marca, en el almacen del origen. No pide permiso y se separa por
    // protocolo + host + puerto, asi que la de esta sala es solo de esta sala.
    // Envuelto en try porque `localStorage` tira SecurityError en los origenes
    // que no lo tienen —data:, file:— y perder la marca no puede tumbar el juego.
    leerMarca: function () {
      try { return Number(localStorage.getItem("eco.mejor")) || 0; }
      catch (e) { console.warn("[eco] sin almacen: " + String(e)); return 0; }
    },
    guardarMarca: function (n) {
      try { localStorage.setItem("eco.mejor", String(n)); }
      catch (e) { console.warn("[eco] no se pudo guardar la marca: " + String(e)); }
    },

    alPulsar: function (i, dur) { pulsar(runas[i], dur); },
    alEstado: decir,
    alProgreso: marcarProgreso,
    alFallar: function (esperada) {
      sonarError();
      // Mostrar cuál era. Perder sin enterarse de qué había que tocar no enseña
      // nada, y este juego es todo aprender la secuencia.
      const runa = runas[esperada];
      encender(runa, true);
      if (runa.apagar) clearTimeout(runa.apagar);
      runa.apagar = setTimeout(function () {
        runa.apagar = 0;
        encender(runa, false);
      }, 900);
    },
    alGanarRonda: function () { sonarRonda(); },
  });

  for (let i = 0; i < runas.length; i++) {
    (function (runa, indice) {
      runa.blanco.addEventListener("toque", function () {
        // La primera vez abre la voz: no se abre en la carga porque sería
        // reservar una voz para alguien que quizá sólo pasa por la sala.
        const actuar = function () {
          const que = partida.tocar(indice, ahora());
          // Un toque ignorado también suena. Durante la demostración el
          // visitante tiene que poder probar las runas sin perder, y el silencio
          // se leería como que el juego se colgó.
          if (que !== "mal") pulsar(runa);
        };
        if (!voz) abrirVoz().then(actuar); else actuar();
      });

      // Hover: el motor lo manda desde `feat(input): add HTML-like hover`. Acá
      // hace lo de siempre —decir qué se puede tocar— y de paso es la única
      // señal que hay antes de comprometerse, que en un juego de memoria
      // importa: tocar la runa equivocada es perder.
      runa.blanco.addEventListener("pointerenter", function () {
        runa.encima = true;
        if (!runa.apagar) encender(runa, false);
      });
      runa.blanco.addEventListener("pointerleave", function () {
        runa.encima = false;
        if (!runa.apagar) encender(runa, false);
      });
    })(runas[i], i);
  }

  altar.addEventListener("toque", function () {
    abrirVoz().then(function () {
      if (!voz) { decir("no hay audio: mirá los logs"); return; }
      // Empezar en medio de una partida la reinicia. Es lo que espera cualquiera
      // que toque el altar otra vez, y ahorra un botón de rendirse.
      eco.limpiar();
      partida.empezar(ahora());
    });
  });

  console.log("[eco] " + runas.length + " runas");
  return true;
}

let avisado = false;

function frame(ts) {
  requestAnimationFrame(frame);
  reloj = (ts || 0) / 1000;
  if (!listo) {
    listo = armar();
    // Si a los tres segundos todavia no armo, algo falta de verdad y callarse
    // seria dejar una sala que responde al toque y no hace nada.
    if (!listo && !avisado && reloj > 3) {
      avisado = true;
      console.error("[eco] no pude armar: Sonido=" + (typeof Sonido) +
                    " crearPartida=" + (typeof crearPartida) +
                    " Glifos=" + (typeof Glifos));
    }
    return;
  }
  partida.tick(reloj);
}

requestAnimationFrame(frame);
