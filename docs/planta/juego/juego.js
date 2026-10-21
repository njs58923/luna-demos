// El estado de la partida y cómo se ve: puntos, tiros, vida, el reloj, el
// marcador de la muñeca y los anuncios grandes.
//
// El marcador va sobre la mano izquierda (se mira la muñeca, como un reloj),
// girado hacia la cabeza. Los anuncios aparecen delante de los ojos un par de
// segundos: una puerta que se abre, un golpe, el final.
//
// El reloj arranca con el primer paso fuera del área de entrada y se para al
// terminar. Caer (quedarse sin vida) no hace volver atrás: suma 15 s y la vida
// vuelve entera.
(globalThis.__modulos ||= []).push(["juego/juego", ["comun/algebra", "juego/config", "juego/escena", "juego/sonidos", "juego/cuerpo"], (A, C, E, S, P) => {
  const { v3, suma, por, resta, qMirando, ARRIBA } = A;
  const { crear, poner, escenario } = E;
  const { VIDA, CLAVE_RECORD } = C;

  const j = {
    puntos: 0, tiros: 0, aciertos: 0, vida: VIDA, caidas: 0,
    inicio: 0, fin: 0, area: "", enemigos: 0, record: 0,
  };
  try { j.record = Number(localStorage.getItem(CLAVE_RECORD)) || 0; } catch (e) { /* sin almacén */ }

  // ── El marcador de la muñeca ──────────────────────────────────────────────
  const hud = crear("group", { id: "hud" }, escenario);
  crear("box", { y: 0, z: -0.004, sx: 0.2, sy: 0.12, sz: 0.004, color: "#101218", "border-radius": "0.01", touchable: "false" }, hud);
  const lin = (y, size, color, id) => crear("text", { id, y, value: "", size, color }, hud);
  const tArea = lin(0.042, 0.017, "#FFD60A", "hud_area");
  const tEstado = lin(0.014, 0.015, "#FFFFFF", "hud_estado");
  const tReloj = lin(-0.014, 0.015, "#40E0D0", "hud_reloj");
  const tUltimo = lin(-0.042, 0.012, "#C8CCD8", "hud_ultimo");
  let ultimoHasta = 0;

  // ── Anuncios y el golpe ───────────────────────────────────────────────────
  const anuncio = crear("group", { id: "anuncio", visible: "false" }, escenario);
  crear("box", { z: -0.01, sx: 1.4, sy: 0.26, sz: 0.01, color: "#101218", "border-radius": "0.04", touchable: "false" }, anuncio);
  const tAnuncio = crear("text", { id: "anuncio_texto", value: "", size: 0.09, color: "#FFFFFF" }, anuncio);
  const tAnuncioSub = crear("text", { id: "anuncio_sub", y: -0.08, value: "", size: 0.04, color: "#C8CCD8" }, anuncio);
  let anuncioHasta = 0;
  const rojo = crear("sphere", { id: "golpe", sx: 0.5, sy: 0.5, sz: 0.5, color: "#FF1E1E", "material-alpha": "blend", "material-unlit": "true", touchable: "false", visible: "false" }, escenario);
  let rojoHasta = 0;

  const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  const corazones = () => "♥".repeat(Math.max(0, j.vida)) + "·".repeat(Math.max(0, VIDA - j.vida));

  j.ultimo = (texto) => { tUltimo.setAttribute("value", texto); ultimoHasta = performance.now() + 3500; };
  j.anunciar = (texto, sub = "", ms = 2600) => {
    tAnuncio.setAttribute("value", texto);
    tAnuncioSub.setAttribute("value", sub);
    anuncio.setAttribute("visible", "inherit");
    anuncioHasta = performance.now() + ms;
  };
  j.sumar = (n) => { j.puntos += n; j.aciertos++; };
  j.contarTiro = () => { j.tiros++; if (!j.inicio) j.empezar(); };
  j.empezar = () => { if (!j.inicio) j.inicio = performance.now(); };
  j.enArea = (titulo, enemigos) => { j.area = titulo; j.enemigos = enemigos; };

  /** Una esfera enemiga llegó a la cabeza. */
  j.golpe = () => {
    if (j.fin) return;
    j.vida--;
    rojo.setAttribute("visible", "inherit");
    rojoHasta = performance.now() + 220;
    S.sonar("golpe", 1);
    if (j.vida <= 0) {
      j.caidas++;
      j.vida = VIDA;
      j.inicio -= 15000;   // 15 s de castigo
      j.anunciar("¡CAÍSTE!", "+15 s · la vida vuelve entera");
    } else j.ultimo("¡te dieron! vida " + j.vida);
  };

  j.terminar = () => {
    if (j.fin) return;
    j.fin = performance.now();
    const ms = j.fin - (j.inicio || j.fin);
    const punteria = j.tiros ? Math.round((100 * j.aciertos) / j.tiros) : 0;
    const nuevo = !j.record || ms < j.record;
    if (nuevo) { j.record = ms; try { localStorage.setItem(CLAVE_RECORD, String(Math.round(ms))); } catch (e) { /* sin almacén */ } }
    S.sonar("victoria", 1);
    j.anunciar(nuevo ? "¡MISIÓN CUMPLIDA! récord" : "¡MISIÓN CUMPLIDA!",
      mmss(ms) + " · " + j.puntos + " puntos · puntería " + punteria + "%" + (j.caidas ? " · " + j.caidas + " caídas" : ""), 12000);
  };

  j.animar = (t, manoIzq) => {
    // El marcador sobre la muñeca izquierda, mirando a la cabeza.
    if (manoIzq) {
      const p = suma(manoIzq, v3(0, 0.1, 0));
      const hacia = resta(P.cabeza, p);
      poner(hud, p, qMirando(v3(-hacia.x, 0, -hacia.z), ARRIBA));
    }
    const ms = j.inicio ? (j.fin || t) - j.inicio : 0;
    tArea.setAttribute("value", j.area);
    tEstado.setAttribute("value", (j.enemigos ? "enemigos " + j.enemigos : "área despejada") + "   " + corazones());
    tReloj.setAttribute("value", mmss(ms) + "  ·  " + j.puntos + " pts" + (j.record ? "  ·  mejor " + mmss(j.record) : ""));
    if (ultimoHasta && t > ultimoHasta) { tUltimo.setAttribute("value", ""); ultimoHasta = 0; }
    // El anuncio, delante de los ojos.
    if (anuncioHasta) {
      if (t > anuncioHasta) { anuncio.setAttribute("visible", "false"); anuncioHasta = 0; }
      else poner(anuncio, suma(suma(P.cabeza, por(P.frente, 1.6)), v3(0, 0.15, 0)), qMirando(P.frente, ARRIBA));
    }
    if (rojoHasta) {
      if (t > rojoHasta) { rojo.setAttribute("visible", "false"); rojoHasta = 0; }
      else poner(rojo, P.cabeza);
    }
  };

  return j;
}]);
