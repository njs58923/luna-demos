// La música y el reloj del juego.
//
// Los cubos se ubican por el tiempo de la canción, no por el del cuadro: si la
// música se traba o arranca tarde, los cubos la esperan. El reloj avanza con
// cada cuadro y se corrige con `currentTime` del audio (que llega a saltos):
// si se aleja más de 80 ms salta, si no se acerca de a poco. Sin audio (sin el
// permiso, o en las pruebas) el reloj corre solo y el juego anda igual, mudo.
(globalThis.__modulos ||= []).push(["sables/musica", ["sables/config"], (C) => {
  const hay = typeof Audio === "function";
  let audio = null, src = "", listo = false;
  const reloj = { t: 0, corriendo: false, sinAudio: !hay };

  /** Bajar y decodificar una canción (se puede llamar al elegirla, antes de jugar). */
  function cargar(url) {
    if (url === src && audio) return listo ? Promise.resolve(true) : audio.__carga;
    soltar();
    src = url; listo = false;
    if (!hay) return Promise.resolve(false);
    try {
      audio = new Audio(url);
      audio.volume = 0.85;
      const p = audio.load().then(() => { listo = true; return true; }, (e) => { console.warn("[sables] la música no cargó:", (e && e.message) || e); reloj.sinAudio = true; return false; });
      audio.__carga = p;
      return p;
    } catch (e) {
      reloj.sinAudio = true;
      return Promise.resolve(false);
    }
  }
  function soltar() {
    if (audio) { try { audio.pause(); audio.dispose && audio.dispose(); } catch (e) { /* ya estaba */ } }
    audio = null; src = ""; listo = false;
  }

  /** Empezar desde `desde` segundos. */
  async function empezar(desde = 0) {
    reloj.t = desde; reloj.corriendo = true;
    reloj.sinAudio = !audio;
    if (!audio) return;
    try {
      if (!listo) await audio.__carga;
      audio.currentTime = desde;
      await audio.play();
    } catch (e) {
      if (!/cancel/i.test((e && e.message) || "")) { console.warn("[sables] sin música:", (e && e.message) || e); reloj.sinAudio = true; }
    }
  }
  function pausar() {
    reloj.corriendo = false;
    if (audio) try { audio.pause(); } catch (e) { /* nada */ }
  }
  async function seguir() {
    reloj.corriendo = true;
    if (!audio) return;
    try { audio.currentTime = reloj.t; await audio.play(); } catch (e) { /* sigue el reloj solo */ }
  }
  function parar() {
    reloj.corriendo = false;
    if (audio) try { audio.stop(); } catch (e) { /* nada */ }
  }
  /** Una vista previa en el menú: desde `desde`, más bajo. */
  async function previa(url, desde) {
    await cargar(url);
    if (!audio || !listo) return;
    try { audio.volume = 0.45; audio.currentTime = desde; await audio.play(); } catch (e) { /* nada */ }
  }
  function callar() {
    if (audio) try { audio.pause(); audio.volume = 0.85; } catch (e) { /* nada */ }
  }

  /** Avanzar el reloj `dt` segundos y corregirlo con el audio. */
  function avanzar(dt) {
    if (!reloj.corriendo) return reloj.t;
    reloj.t += dt;
    if (audio && !reloj.sinAudio) {
      let a = NaN;
      try { if (!audio.paused) a = audio.currentTime; } catch (e) { /* nada */ }
      if (Number.isFinite(a) && a > 0) {
        const err = a - reloj.t;
        if (Math.abs(err) > 0.08) reloj.t = a;
        else reloj.t += err * 0.12;
      }
    }
    return reloj.t + C.LATENCIA;
  }

  return { reloj, cargar, soltar, empezar, pausar, seguir, parar, previa, callar, avanzar, get audio() { return audio; } };
}]);
