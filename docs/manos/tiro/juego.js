// La ronda, el tablero y el récord.
//
// Una ronda dura RONDA_S segundos desde el primer tiro, con el arma que sea (o
// con varias). Por tiempo y no por cantidad de tiros: con una MAC-10, 24 tiros
// son dos segundos. El primer tiro después de terminada arranca una nueva.
(globalThis.__modulos ||= []).push(["tiro/juego", ["tiro/config", "tiro/escena", "tiro/sonidos", "tiro/blancos", "tiro/efectos"], (C, E, S, B, F) => {
  const { RONDA_S, CLAVE_RECORD } = C;
  const { byId } = E;

  const tPuntos = byId("tablero_puntos");
  const tTiros = byId("tablero_tiros");
  const tRecord = byId("tablero_record");
  const tUltimo = byId("tablero_ultimo");
  const juego = { puntos: 0, tiros: 0, aciertos: 0, record: 0, activa: false, fin: 0, quedan: RONDA_S };
  try { juego.record = Math.max(0, Number(localStorage.getItem(CLAVE_RECORD)) || 0); } catch (e) { /* sin almacén */ }

  function tablero() {
    if (tPuntos) tPuntos.setAttribute("value", String(juego.puntos));
    if (tTiros) {
      const tiempo = juego.activa ? "quedan " + juego.quedan + " s" : "ronda de " + RONDA_S + " s";
      const punteria = juego.tiros
        ? "  ·  " + juego.tiros + (juego.tiros === 1 ? " tiro" : " tiros") + "  ·  " + Math.round((juego.aciertos / juego.tiros) * 100) + "% al blanco"
        : "";
      tTiros.setAttribute("value", tiempo + punteria);
    }
    if (tRecord) tRecord.setAttribute("value", "récord " + juego.record);
  }
  function ultimo(texto) {
    if (tUltimo) tUltimo.setAttribute("value", texto);
  }

  function nuevaRonda(ahora) {
    juego.puntos = 0;
    juego.tiros = 0;
    juego.aciertos = 0;
    juego.activa = true;
    juego.fin = ahora + RONDA_S * 1000;
    juego.quedan = RONDA_S;
    tablero();
  }
  function cerrarRonda() {
    juego.activa = false;
    if (juego.puntos > juego.record) {
      juego.record = juego.puntos;
      try { localStorage.setItem(CLAVE_RECORD, String(juego.record)); } catch (e) { /* sin almacén */ }
      ultimo("¡récord nuevo! " + juego.puntos + " puntos");
      S.sonar("ronda", 1);
    } else {
      ultimo("ronda: " + juego.puntos + " puntos");
      S.sonar("ronda", 0.7);
    }
    tablero();
  }

  /** Cada tiro que sale. El primero después de una ronda terminada arranca otra. */
  function contarTiro(ahora) {
    if (!juego.activa) nuevaRonda(ahora);
    juego.tiros++;
    tablero();
  }
  function sumar(puntos) {
    juego.puntos += puntos;
    juego.aciertos++;
    tablero();
  }

  const botonReiniciar = byId("reiniciar");
  if (botonReiniciar) {
    botonReiniciar.addEventListener("toque", () => {
      S.sonar("vacio");
      juego.puntos = 0;
      juego.tiros = 0;
      juego.aciertos = 0;
      juego.activa = false;
      B.reponerTodo();
      F.borrarMarcas();
      tablero();
      ultimo("ronda nueva");
    });
  }

  function animar(t) {
    if (!juego.activa) return;
    if (t >= juego.fin) { juego.quedan = 0; cerrarRonda(); return; }
    const quedan = Math.ceil((juego.fin - t) / 1000);
    if (quedan !== juego.quedan) { juego.quedan = quedan; tablero(); }
  }

  tablero();
  ultimo("tomá un arma de la mesa");

  return { juego, tablero, ultimo, contarTiro, sumar, animar };
}]);
