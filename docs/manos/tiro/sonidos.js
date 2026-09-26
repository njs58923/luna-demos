// Los clips de la galería. Cada uno ocupa una voz y un espacio tiene 16: son 16,
// así que los dos rifles comparten el suyo.
// RONDA NUEVA usa el de "vacio": un clic seco sirve de botón, y no hay voces de sobra.
(globalThis.__modulos ||= []).push(["tiro/sonidos", ["comun/sintesis"], (S) => {
  const { crearSonido, armar, seno, caida, ruido, clic, notas } = S;

  return crearSonido({
    tomar: () => { const r = ruido(0.25, 11); return armar(0.09, (t, u) => (r() * 1.6 + seno(t, 170) * 0.6) * caida(u, 7)); },
    dejar: () => { const r = ruido(0.35, 12); return armar(0.12, (t, u) => (r() * 1.2 + seno(t, 240) * 0.7) * caida(u, 9)); },
    // La pistola: el estampido (ruido abierto que muere enseguida), el golpe
    // grave del cuerpo y una cola apagada, que es lo que hace el campo.
    disparo: () => {
      const r = ruido(0.95, 21), cola = ruido(0.06, 22);
      return armar(0.45, (t, u) => r() * 1.8 * caida(u, 22) + seno(t, 62) * 1.1 * caida(u, 12) + cola() * 4 * caida(u, 5));
    },
    // Las automáticas: cortas, porque el clip vuelve a empezar en cada tiro y
    // una cola larga se cortaría a la mitad. La MP5 más seca y aguda; la
    // MAC-10, más grave y con más cuerpo.
    disparo_mp5: () => {
      const r = ruido(0.97, 28), cola = ruido(0.1, 29);
      return armar(0.075, (t, u) => r() * 1.7 * caida(u, 9) + seno(t, 95) * 0.8 * caida(u, 7) + cola() * 2.5 * caida(u, 4));
    },
    disparo_mac10: () => {
      const r = ruido(0.9, 30), cola = ruido(0.07, 31);
      return armar(0.06, (t, u) => r() * 1.6 * caida(u, 8) + seno(t, 70) * 1.1 * caida(u, 5) + cola() * 3 * caida(u, 3));
    },
    // Los rifles: 7,62, más estampido y más cuerpo que las de 9 mm. Corto
    // igual (la AK tira a 600: un tiro cada 100 ms), con el golpe grave largo.
    disparo_rifle: () => {
      const r = ruido(0.97, 33), cola = ruido(0.05, 34);
      return armar(0.1, (t, u) => r() * 2 * caida(u, 7) + seno(t, 55) * 1.3 * caida(u, 4) + cola() * 3.5 * caida(u, 2.5));
    },
    // Gatillo sin balas: un clic y nada más.
    vacio: () => armar(0.05, (t) => clic(t, 0, 2900) * 1.2),
    // El cargador que calza en el pozo: un golpe de plástico y el clic del retén.
    cargador: () => {
      const r = ruido(0.4, 23);
      return armar(0.14, (t, u) => r() * 1.4 * caida(u, 14) + clic(t, 0.035, 2100) * 1.3);
    },
    // La corredera (o la manija, o el cerrojo): metal que roza y el golpe del tope.
    corredera: () => {
      const r = ruido(0.85, 32);
      return armar(0.2, (t) => (t < 0.09 ? r() * 0.8 * (t / 0.09) : 0) + clic(t, 0.09, 1600) * 1.4 + clic(t, 0.1, 3100) * 0.6);
    },
    // Vidrio: un golpe de ruido agudo y parciales altos que no son armónicos.
    vidrio: () => {
      const r = ruido(0.9, 24);
      return armar(0.5, (t, u) => r() * 0.9 * caida(u, 7)
        + (seno(t, 3130) * caida(u, 10) + seno(t, 4270) * caida(u, 14) + seno(t, 5230) * caida(u, 8) + seno(t, 6650) * caida(u, 16)) * 0.3);
    },
    // Una lata: metal fino, parciales inarmónicos y cortos.
    lata: () => {
      const r = ruido(0.8, 25);
      return armar(0.3, (t, u) => (seno(t, 1210) * 0.6 + seno(t, 2870) * 0.4 + seno(t, 4410) * 0.2) * caida(u, 9) + r() * caida(u, 30));
    },
    // Una placa de acero: el "gong" largo que es la gracia de estas galerías.
    placa: () => armar(1.4, (t, u) => (seno(t, 523) * 0.7 + seno(t, 1347) * 0.45 + seno(t, 2411) * 0.25 * caida(u, 4)) * caida(u, 3.2)),
    // En la madera: un golpe seco, más agudo que la tierra.
    madera: () => { const r = ruido(0.3, 27); return armar(0.1, (t, u) => (r() * 2 + seno(t, 310) * 0.8) * caida(u, 12)); },
    // El tiro que da en la tierra.
    polvo: () => { const r = ruido(0.08, 26); return armar(0.13, (t, u) => r() * 3 * caida(u, 10)); },
    ronda: () => notas([523, 659, 784], 0.14),
    record: () => notas([523, 659, 784, 1047, 1319], 0.12),
  }, "tiro");
}]);
