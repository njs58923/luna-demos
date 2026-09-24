// El reloj: la hora, no la acumulación.
//
// Todas las otras escenas del servidor acumulan: `angulo += velocidad * dt`.
// Está bien para un planeta o un cardumen, donde nadie sabe dónde tendrían que
// estar. Un reloj no: el visitante ya sabe cómo se mueve un segundero, y medio
// segundo de deriva se ve.
//
// Así que acá **el ángulo se calcula desde la hora, cada vez**. Si el motor se
// cuelga un segundo, el reloj salta y queda en hora; con acumulación quedaría
// atrasado para siempre. Es la diferencia entre un reloj de cuarzo y uno al que
// hay que darle cuerda.
const CFG = globalThis.RELOJ || {};
const root = hiperspace.dimention;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun",
               "jul", "ago", "sep", "oct", "nov", "dic"];

const ag = {};
const panel = {};
const maquina = {};
let cronometro = false;
let t0 = 0;
let listo = false;
let ticSegundo = -1;
let ticFecha = -1;

function texto(id, v) {
  if (panel[id]) panel[id].setAttribute("value", v);
}

function dosDigitos(x) {
  return String(Math.floor(x)).padStart(2, "0");
}

/** Las tres fracciones de vuelta (hora, minuto, segundo), de 0 a 1. */
function fracciones(ahora) {
  if (cronometro) {
    const s = (ahora - t0) / 1000;
    return [(s / 43200) % 1, (s / 3600) % 1, (s / 60) % 1];
  }
  const d = new Date();
  const seg = d.getSeconds() + d.getMilliseconds() / 1000;
  const min = d.getMinutes() + seg / 60;
  const hor = (d.getHours() % 12) + min / 60;
  return [hor / 12, min / 60, seg / 60];
}

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) t0 = ahora;

  if (!listo) {
    for (const id of ["ag_hora", "ag_minuto", "ag_segundo"]) {
      const el = root.getElementById(id);
      if (!el) return;
      ag[id] = el;
    }
    for (const id of ["r_hora", "r_modo", "r_titulo", "r_fecha"]) {
      const el = root.getElementById(id);
      if (!el) return;
      panel[id] = el;
    }
    for (const id of ["eng_grande", "eng_medio", "eng_chico", "pendulo"]) {
      const el = root.getElementById(id);
      if (!el) return;
      maquina[id] = el;
    }
    const boton = root.getElementById("modo");
    if (!boton) return;
    boton.addEventListener("toque", function () {
      cronometro = !cronometro;
      t0 = 0;
      ticSegundo = -1;
      texto("r_modo", cronometro ? "ver la hora" : "ver cronómetro");
      texto("r_titulo", cronometro ? "Cronómetro" : "El reloj");
      if (cronometro) texto("r_fecha", "");
    });
    listo = true;
    console.log("[reloj] en hora, sin mallas dinamicas");
    return;
  }

  const f = fracciones(ahora);
  const lote = [];
  // Las agujas giran en **-Z**: en el plano de la esfera, el sentido horario
  // visto desde adelante es el negativo. Y la posición va completa en cada
  // entrada, porque el batch escribe la transformación local entera.
  lote.push(ag.ag_hora.nodeId, 0, 0, 0.64, 0, 0, -f[0] * Math.PI * 2);
  lote.push(ag.ag_minuto.nodeId, 0, 0, 0.68, 0, 0, -f[1] * Math.PI * 2);
  lote.push(ag.ag_segundo.nodeId, 0, 0, 0.72, 0, 0, -f[2] * Math.PI * 2);

  // La máquina: el engranaje grande da una vuelta por minuto, el mediano una
  // cada quince segundos y el chico una cada diez. No es la relación de un reloj
  // de verdad —para eso habría que dibujar el escape— pero es la que hace que se
  // lea como una máquina y no como tres discos sueltos.
  const seg = cronometro ? (ahora - t0) / 1000 : (Date.now() % 3600000) / 1000;
  lote.push(maquina.eng_grande.nodeId, 0, 0, 0, 0, 0, (seg / 60) * Math.PI * 2);
  lote.push(maquina.eng_medio.nodeId, 2.15, 0.85, 0, 0, 0, -(seg / 15) * Math.PI * 2);
  lote.push(maquina.eng_chico.nodeId, -1.95, 0.6, 0, 0, 0, (seg / 10) * Math.PI * 2);
  // El péndulo: dos segundos de ida y vuelta, que es el compás de un reloj de pie.
  lote.push(maquina.pendulo.nodeId, 0, 6.4, 0.28, 0, 0, Math.sin(seg * Math.PI) * 0.16);
  root.setTransformBatch(lote);

  // El texto sólo cuando cambia el segundo: `setAttribute` sobre un texto rehace
  // su malla, y a 60 Hz son sesenta mallas por segundo para nada.
  const s = Math.floor(cronometro ? (ahora - t0) / 1000 : Date.now() / 1000);
  if (s === ticSegundo) return;
  ticSegundo = s;
  if (cronometro) {
    const x = (ahora - t0) / 1000;
    texto("r_hora", dosDigitos(x / 60) + ":" + dosDigitos(x % 60));
    return;
  }
  const d = new Date();
  texto("r_hora", dosDigitos(d.getHours()) + ":" + dosDigitos(d.getMinutes()) +
        ":" + dosDigitos(d.getSeconds()));
  if (d.getDate() !== ticFecha) {
    ticFecha = d.getDate();
    texto("r_fecha", d.getDate() + " " + MESES[d.getMonth()]);
  }
}

requestAnimationFrame(frame);
