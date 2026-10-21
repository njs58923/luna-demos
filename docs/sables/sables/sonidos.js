// Los clips: el corte, el fallo, la bomba, los botones y el final. La música
// ocupa una voz más; quedan voces de sobra de las 16 de un espacio.
(globalThis.__modulos ||= []).push(["sables/sonidos", ["comun/sintesis"], (S) => {
  const { crearSonido, armar, seno, caida, ruido, notas } = S;
  return crearSonido({
    // El corte: un siseo brillante con un golpe seco abajo.
    corte: () => {
      const r = ruido(0.92, 61), g = ruido(0.2, 62);
      return armar(0.16, (t, u) => r() * 1.3 * caida(u, 14) + g() * 2.2 * caida(u, 30) + seno(t, 1900 - 900 * u) * 0.25 * caida(u, 10));
    },
    // Otro corte (para alternar y que no suene a ametralladora).
    corte2: () => {
      const r = ruido(0.88, 63), g = ruido(0.25, 64);
      return armar(0.15, (t, u) => r() * 1.2 * caida(u, 15) + g() * 2 * caida(u, 32) + seno(t, 2300 - 1100 * u) * 0.22 * caida(u, 11));
    },
    mal: () => armar(0.22, (t, u) => (seno(t, 180) + seno(t, 191) * 0.8) * 0.6 * caida(u, 6)),
    fallo: () => { const r = ruido(0.3, 65); return armar(0.18, (t, u) => r() * 1.1 * caida(u, 9) + seno(t, 120) * 0.4 * caida(u, 8)); },
    bomba: () => {
      const r = ruido(0.55, 66), grave = ruido(0.04, 67);
      return armar(0.9, (t, u) => r() * 1.8 * caida(u, 7) + grave() * 5 * caida(u, 2.5) + seno(t, 48) * 1.1 * caida(u, 4));
    },
    pared: () => armar(0.12, (t, u) => seno(t, 95) * 0.8 * Math.sin(Math.PI * u)),
    boton: () => armar(0.08, (t, u) => (seno(t, 880) * 0.6 + seno(t, 1760) * 0.25) * caida(u, 9)),
    elegir: () => armar(0.14, (t, u) => (seno(t, 660 + 440 * u) * 0.6) * caida(u, 5)),
    exito: () => notas([523, 659, 784, 1047, 1319], 0.12),
    derrota: () => notas([392, 330, 262, 196], 0.18),
  }, "sables");
}]);
