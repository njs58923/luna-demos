// El marcador: puntos, combo, multiplicador, energía y rango, y lo que se ve
// de ellos a los costados de la pista.
//
//   corte bueno     hasta 115 puntos (70 envión + 30 remate + 15 centro) × el
//                   multiplicador; suma combo y energía
//   corte malo      (color o dirección equivocados) corta el combo, baja un
//                   multiplicador y resta energía
//   fallo / bomba   lo mismo, más energía
//   pared           mientras la cabeza está adentro, la energía baja
//
// El multiplicador sube x1→x2→x4→x8 con 2, 4 y 8 cortes seguidos; un error lo
// baja un escalón (de x8 a x4, no a x1). El máximo posible de la canción se
// calcula con la misma regla, para el porcentaje y el rango.
(globalThis.__modulos ||= []).push(["sables/marcador", ["sables/config", "sables/escena"], (C, E) => {
  const el = {
    hud: E.byId("hud"), combo: E.byId("hud_combo"), fallos: E.byId("hud_fallos"), puntos: E.byId("hud_puntos"), mult: E.byId("hud_mult"),
    mbar: E.byId("hud_mbar"), rango: E.byId("hud_rango"), vida: E.byId("hud_vida"), avance: E.byId("hud_avance"), aviso: E.byId("hud_aviso"),
  };
  const nuevo = () => ({
    puntos: 0, combo: 0, comboMax: 0, nivel: 0, progreso: 0, vida: C.VIDA_INICIO, cortes: 0, fallos: 0, malos: 0, bombas: 0,
    total: 0, maximoHasta: 0, maximo: 0, sinFallar: false, fallado: false, aviso: "", avisoHasta: 0,
  });
  let m = nuevo();

  /** El máximo de una canción con `cuantos` cubos, multiplicador incluido. */
  function maximo(cuantos) {
    let nivel = 0, prog = 0, total = 0;
    for (let i = 0; i < cuantos; i++) {
      total += 115 * C.MULTIPLICADORES[nivel];
      if (nivel < 3 && ++prog >= C.PARA_SUBIR[nivel]) { nivel++; prog = 0; }
    }
    return total;
  }

  function empezar(cuantos, sinFallar) {
    m = nuevo();
    m.maximo = maximo(cuantos);
    m.sinFallar = !!sinFallar;
    E.ver(el.hud, true);
    pintar(0);
  }
  const mult = () => C.MULTIPLICADORES[m.nivel];

  /** Un corte bueno: el combo ya; los puntos cuando se sabe el remate. */
  function corte() {
    m.combo++; m.cortes++;
    m.comboMax = Math.max(m.comboMax, m.combo);
    const multiplicador = mult();
    if (m.nivel < 3 && ++m.progreso >= C.PARA_SUBIR[m.nivel]) { m.nivel++; m.progreso = 0; }
    m.vida = Math.min(1, m.vida + C.VIDA_CORTE);
    return multiplicador;
  }
  /** Los puntos de un corte, cuando se cierra su ventana. */
  function sumar(puntos, multiplicador) {
    m.puntos += puntos * multiplicador;
    m.total++;
    m.maximoHasta += 115 * multiplicador;
  }
  function error(tipo) {
    m.combo = 0;
    if (m.nivel > 0) m.nivel--;
    m.progreso = 0;
    if (tipo === "fallo") { m.fallos++; quitar(C.VIDA_FALLO); m.total++; }
    else if (tipo === "malo") { m.malos++; quitar(C.VIDA_MAL); m.total++; }
    else if (tipo === "bomba") { m.bombas++; quitar(C.VIDA_BOMBA); }
  }
  function quitar(k) {
    m.vida = Math.max(0, m.vida - k);
    if (m.vida <= 0 && !m.sinFallar) m.fallado = true;
  }
  function pared(dt) {
    quitar(C.VIDA_PARED_S * dt);
  }
  function avisar(texto, ahora, dur = 1.2) { m.aviso = texto; m.avisoHasta = ahora + dur; }

  const porcentaje = () => (m.maximoHasta ? m.puntos / m.maximoHasta : 1);
  const rango = (p) => C.RANGOS.find(([lim]) => p >= lim)[1];
  const fmt = (x) => Math.round(x).toLocaleString("es");

  /** `avance` de 0 a 1 (cuánto va de la canción). */
  function pintar(avance, ahora = 0) {
    E.attr(el.combo, "value", String(m.combo));
    E.attr(el.fallos, "value", m.fallos + m.malos ? `fallos ${m.fallos + m.malos}` : "");
    E.attr(el.puntos, "value", fmt(m.puntos));
    E.attr(el.mult, "value", "x" + mult());
    const pm = m.nivel >= 3 ? 1 : m.progreso / C.PARA_SUBIR[m.nivel];
    E.attr(el.mbar, "sx", Math.max(0.001, 0.5 * pm).toFixed(3));
    E.attr(el.mbar, "x", (-0.25 + 0.25 * pm).toFixed(3));
    const p = porcentaje();
    E.attr(el.rango, "value", m.total ? `${rango(p)} · ${(p * 100).toFixed(1)} %` : "");
    E.attr(el.vida, "sx", Math.max(0.001, 1.6 * m.vida).toFixed(3));
    E.attr(el.vida, "x", (-0.8 + 0.8 * m.vida).toFixed(3));
    E.attr(el.vida, "color", m.vida < 0.25 ? "#FF375F" : m.vida > 0.8 ? "#30D158" : "#F2F2F7");
    E.attr(el.avance, "sx", Math.max(0.001, 1.6 * avance).toFixed(3));
    E.attr(el.avance, "x", (-0.8 + 0.8 * avance).toFixed(3));
    E.attr(el.aviso, "value", ahora < m.avisoHasta ? m.aviso : "");
  }
  function ocultar() { E.ver(el.hud, false); }

  /** El resumen para la pantalla de resultados. */
  function resumen() {
    const p = m.maximo ? m.puntos / m.maximo : 0;
    return {
      puntos: m.puntos, maximo: m.maximo, porcentaje: p, rango: m.fallado ? "F" : rango(p), comboMax: m.comboMax,
      cortes: m.cortes, fallos: m.fallos, malos: m.malos, bombas: m.bombas, fallado: m.fallado, sinFallar: m.sinFallar,
    };
  }

  return { empezar, corte, sumar, error, pared, avisar, pintar, ocultar, resumen, maximo, get estado() { return m; } };
}]);
