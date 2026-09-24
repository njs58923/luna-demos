// partida.js — las reglas, sin nada del motor.
//
// Acá no hay nodos, ni audio, ni `hiperspace`. Es una máquina de estados que
// recibe un reloj y avisa por callbacks qué hay que hacer. Eso no es purismo:
// es lo que permite probar el juego entero **sin abrir Luna**, que es la
// diferencia entre verificar una regla en dos segundos y verificarla mirando
// una captura y adivinando.
//
// Quien la usa —`eco.js`— se encarga de lo otro: encender una placa, escribir
// muestras en el stream, mover un texto.
//
//     const p = crearPartida({
//       cuantas: 6,
//       alPulsar: (i, dur) => ...,   // hacé sonar y brillar la runa i
//       alEstado: (texto) => ...,    // mostrá esto
//       alRonda:  (n) => ...,        // se completó la ronda n
//       alFallar: (esperada, fue) => ...,
//     });
//     p.empezar(ahora);
//     p.tocar(3, ahora);   // el visitante tocó la runa 3
//     p.tick(ahora);       // una vez por cuadro
(function (global) {
  "use strict";

  /** Cuánto dura cada nota de la demostración, y el silencio que la sigue.
   *  Sumados dan el paso: 520 ms es lo bastante lento para seguirlo y lo
   *  bastante rápido para que una secuencia de ocho no aburra. */
  const NOTA = 0.42;
  const HUECO = 0.1;
  const PASO = NOTA + HUECO;

  /** Lo más rápido que llega a ir, como fracción del paso original.
   *
   *  El juego tiene que ponerse difícil, pero la dificultad no puede venir de
   *  que la secuencia sea **imposible de oír**: por debajo de la mitad las
   *  notas se empastan y dejás de distinguir dos iguales seguidas de una larga.
   *  La memoria ya es la parte difícil; acelerar de más cambia el juego por uno
   *  de reflejos. */
  const MAS_RAPIDO = 0.55;

  /** Cuántas rondas tarda en llegar ahí. Doce es una partida buena: el que
   *  llega a doce ya sabe jugar, y el que llega a tres no notó que cambió nada,
   *  que es como tiene que ser. */
  const RONDAS_HASTA_TOPE = 12;

  /** El factor de velocidad de una ronda. Baja de 1 a MAS_RAPIDO en forma de
   *  curva y no de recta: las primeras rondas casi no cambian y el apretón se
   *  siente recién cuando ya entendiste el juego. */
  function ritmo(ronda) {
    const t = Math.min(1, Math.max(0, (ronda - 1) / RONDAS_HASTA_TOPE));
    return 1 - (1 - MAS_RAPIDO) * (t * t);
  }

  /** Antes de empezar a mostrar. Sin esta pausa, la primera nota pisa el sonido
   *  del toque que arrancó la ronda y parece parte de él. */
  const ANTES = 0.6;

  /** Después de la última respuesta correcta, antes de la ronda siguiente.
   *  Es el momento en que el jugador se entera de que acertó; sin pausa, la
   *  demostración nueva le sale encima. */
  const DESPUES = 0.85;

  /** Lo que dura el castigo antes de volver al principio. */
  const CASTIGO = 1.4;

  function crearPartida(op) {
    const o = op || {};
    const cuantas = o.cuantas || 6;
    const nada = function () {};
    const alPulsar = o.alPulsar || nada;
    const alEstado = o.alEstado || nada;
    const alRonda = o.alRonda || nada;
    const alFallar = o.alFallar || nada;
    const alGanarRonda = o.alGanarRonda || nada;
    /** (acertadas, total) cada vez que cambia una de las dos. */
    const alProgreso = o.alProgreso || nada;
    /** Inyectable para que las pruebas no dependan de la suerte. */
    const azar = o.azar || Math.random;

    /** La marca se guarda afuera. Se inyecta en vez de llamar a `localStorage`
     *  desde acá por lo de siempre: este archivo no conoce el entorno. Y de paso
     *  una marca que no se pudo leer no es una marca de cero — es una marca que
     *  no se sabe, y el cartel tiene que decir otra cosa. */
    const leerMarca = o.leerMarca || function () { return 0; };
    const guardarMarca = o.guardarMarca || nada;

    const p = {
      /** 'espera' | 'mostrando' | 'turno' | 'festejo' | 'castigo' */
      estado: "espera",
      secuencia: [],
      /** en 'mostrando', qué nota va; en 'turno', cuántas acertó */
      paso: 0,
      ronda: 0,
      mejor: 0,
      /** cuándo toca el próximo evento del reloj */
      proximo: 0,
    };

    // La marca de partidas anteriores. Se lee una vez al crear: releerla en cada
    // ronda sería pedirle al disco algo que no cambia salvo que lo cambiemos
    // nosotros.
    (function () {
      const guardada = Number(leerMarca());
      p.mejor = Number.isFinite(guardada) && guardada > 0 ? Math.floor(guardada) : 0;
    })();

    function decir(texto) { alEstado(texto); }

    function agregarNota() {
      // Nunca dos iguales seguidas: repetir la misma runa dos veces se ve como
      // un parpadeo raro y se oye como una nota larga, no como dos.
      let i = Math.floor(azar() * cuantas) % cuantas;
      const ultima = p.secuencia[p.secuencia.length - 1];
      if (p.secuencia.length && i === ultima) i = (i + 1 + Math.floor(azar() * (cuantas - 1))) % cuantas;
      p.secuencia.push(i);
    }

    function mostrar(ahora) {
      p.estado = "mostrando";
      p.paso = 0;
      p.proximo = ahora + ANTES;
      decir("escuchá — ronda " + p.ronda);
      // Todos apagados: los puntos cuentan lo que acertó el visitante, no lo que
      // va mostrando la máquina. Encenderlos acá sería cantarle la respuesta.
      alProgreso(0, p.secuencia.length);
    }

    /** Cuánto dura una nota en la ronda actual, y cuánto el paso entero. Los dos
     *  salen del mismo factor: si sólo se acortara el hueco, las notas se
     *  pegarían sin sonar más rápido. */
    p.duracionNota = function () { return NOTA * ritmo(p.ronda); };
    p.duracionPaso = function () { return PASO * ritmo(p.ronda); };

    p.empezar = function (ahora) {
      p.secuencia = [];
      p.ronda = 1;
      agregarNota();
      mostrar(ahora);
    };

    /** El visitante tocó una runa. Devuelve 'ignorado' | 'bien' | 'mal', que es
     *  lo que necesita saber quien dibuja para decidir el destello. */
    p.tocar = function (indice, ahora) {
      // Durante la demostración los toques **no cuentan**. Si contaran, tocar
      // al mismo tiempo que suena la secuencia sería jugar a ciegas y perder
      // sin entender por qué.
      if (p.estado !== "turno") return "ignorado";

      const esperada = p.secuencia[p.paso];
      if (indice !== esperada) {
        p.estado = "castigo";
        p.proximo = ahora + CASTIGO;
        alFallar(esperada, indice);
        alProgreso(p.paso, p.secuencia.length);
        decir("no era esa — llegaste a la ronda " + p.ronda);
        return "mal";
      }

      p.paso++;
      alProgreso(p.paso, p.secuencia.length);
      if (p.paso < p.secuencia.length) return "bien";

      // Ronda completa.
      if (p.ronda > p.mejor) {
        p.mejor = p.ronda;
        // Se guarda al superarla y no al terminar la partida: si el visitante se
        // va —o se cae el mundo— en la ronda doce, esa doce fue suya.
        guardarMarca(p.mejor);
      }
      p.estado = "festejo";
      p.proximo = ahora + DESPUES;
      alGanarRonda(p.ronda);
      decir("bien — ronda " + p.ronda + " completa");
      return "bien";
    };

    p.tick = function (ahora) {
      if (p.estado === "mostrando") {
        if (ahora < p.proximo) return;
        if (p.paso < p.secuencia.length) {
          alPulsar(p.secuencia[p.paso], p.duracionNota());
          p.paso++;
          p.proximo = ahora + p.duracionPaso();
          return;
        }
        p.estado = "turno";
        p.paso = 0;
        decir("tu turno — " + p.secuencia.length + " " +
              (p.secuencia.length === 1 ? "nota" : "notas"));
        return;
      }

      if (p.estado === "festejo") {
        if (ahora < p.proximo) return;
        p.ronda++;
        alRonda(p.ronda);
        agregarNota();
        mostrar(ahora);
        return;
      }

      if (p.estado === "castigo") {
        if (ahora < p.proximo) return;
        p.estado = "espera";
        decir(p.mejor > 0 ? "tocá el altar — tu mejor: ronda " + p.mejor
                          : "tocá el altar para empezar");
        return;
      }
    };

    return p;
  }

  global.crearPartida = crearPartida;
  global.ritmoDeRonda = ritmo;
  // Los tiempos se exportan para que las pruebas no los repitan a mano: una
  // constante copiada es una constante que se desincroniza.
  global.TIEMPOS = { NOTA: NOTA, HUECO: HUECO, PASO: PASO, ANTES: ANTES,
                     DESPUES: DESPUES, CASTIGO: CASTIGO,
                     MAS_RAPIDO: MAS_RAPIDO, RONDAS_HASTA_TOPE: RONDAS_HASTA_TOPE };
})(globalThis);
