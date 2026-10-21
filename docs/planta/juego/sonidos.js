// Los clips de la planta, sintetizados. Cada uno ocupa una voz y un espacio
// tiene 16: son 16 justos. Dejar un arma en la funda es "tomar" más suave.
(globalThis.__modulos ||= []).push(["juego/sonidos", ["comun/sintesis"], (S) => {
  const { crearSonido, armar, seno, caida, ruido, clic, notas } = S;

  return crearSonido({
    tomar: () => { const r = ruido(0.25, 11); return armar(0.09, (t, u) => (r() * 1.6 + seno(t, 170) * 0.6) * caida(u, 7)); },
    // La G17: el estampido, el golpe grave del cuerpo y la cola.
    disparo: () => {
      const r = ruido(0.95, 21), cola = ruido(0.06, 22);
      return armar(0.45, (t, u) => r() * 1.8 * caida(u, 22) + seno(t, 62) * 1.1 * caida(u, 12) + cola() * 4 * caida(u, 5));
    },
    // La Desert Eagle: .50, un trueno: más grave, más largo, más cola.
    disparo_deagle: () => {
      const r = ruido(0.97, 41), cola = ruido(0.04, 42);
      return armar(0.7, (t, u) => r() * 2.2 * caida(u, 16) + seno(t, 44) * 1.6 * caida(u, 8) + cola() * 5 * caida(u, 3.5));
    },
    vacio: () => armar(0.05, (t) => clic(t, 0, 2900) * 1.2),
    cargador: () => {
      const r = ruido(0.4, 23);
      return armar(0.14, (t, u) => r() * 1.4 * caida(u, 14) + clic(t, 0.035, 2100) * 1.3);
    },
    corredera: () => {
      const r = ruido(0.6, 32);
      return armar(0.12, (t, u) => clic(t, 0, 1500) * 1.5 + clic(t, 0.008, 3000) * 0.6 + r() * 0.6 * caida(u, 25));
    },
    roce: () => {
      const r = ruido(0.75, 35);
      return armar(0.09, (t, u) => r() * 0.9 * Math.sin(Math.PI * u) + seno(t, 2400) * 0.05 * Math.sin(Math.PI * u));
    },
    tope: () => {
      const r = ruido(0.9, 36);
      return armar(0.08, (t, u) => clic(t, 0, 2100) * 1.4 + clic(t, 0.003, 4200) * 0.7 + r() * 0.5 * caida(u, 40));
    },
    // Un tiro que le pega a un enemigo: chapa que suena, aguda y corta.
    impacto: () => {
      const r = ruido(0.85, 43);
      return armar(0.22, (t, u) => (seno(t, 1840) * 0.5 + seno(t, 2930) * 0.35 + seno(t, 4470) * 0.2) * caida(u, 10) + r() * 1.1 * caida(u, 35));
    },
    // Un enemigo que cae: el estallido y el retumbe.
    explosion: () => {
      const r = ruido(0.6, 44), grave = ruido(0.03, 45);
      return armar(1.1, (t, u) => r() * 1.9 * caida(u, 6) + grave() * 6 * caida(u, 2.2) + seno(t, 38) * 1.2 * caida(u, 4));
    },
    // Un enemigo que dispara: una descarga que sube.
    carga: () => armar(0.32, (t, u) => (seno(t, 300 + 900 * u) * 0.6 + seno(t, 612 + 1800 * u) * 0.25) * Math.sin(Math.PI * u)),
    // Una esfera que te da: golpe sordo y un zumbido.
    golpe: () => {
      const r = ruido(0.2, 46);
      return armar(0.4, (t, u) => r() * 2 * caida(u, 12) + seno(t, 90) * 1.2 * caida(u, 6) + seno(t, 220) * 0.4 * caida(u, 3));
    },
    // Al piso: tierra y cemento.
    polvo: () => { const r = ruido(0.08, 26); return armar(0.13, (t, u) => r() * 3 * caida(u, 10)); },
    // Contra metal (contenedores, máquinas, paredes): un rebote que silba.
    metal: () => {
      const r = ruido(0.9, 47);
      return armar(0.35, (t, u) => r() * 0.8 * caida(u, 30) + seno(t, 2400 - 1400 * u) * 0.35 * caida(u, 5));
    },
    // La puerta que se abre: el motor y el golpe al final del recorrido.
    puerta: () => {
      const r = ruido(0.3, 48);
      return armar(1.6, (t, u) => (seno(t, 55) * 0.5 + seno(t, 110) * 0.25 + r() * 0.35) * (u < 0.85 ? Math.min(1, u * 8) : 0.2) + clic(t, 1.36, 900) * 1.2);
    },
    victoria: () => notas([523, 659, 784, 1047, 1319, 1568], 0.13),
  }, "planta");
}]);
