// Los números de la planta: entrada, puntería, el cuerpo del jugador y los
// enemigos. Lo de cada arma está en armas.js; el nivel, en datos.js (lo arma
// el servidor).
(globalThis.__modulos ||= []).push(["juego/config", [], () => ({
  APRETAR: 0.6, AFLOJAR: 0.35,   // histéresis de grip y gatillo
  RADIO_TOMAR: 0.16,             // m: distancia de la mano a un arma enfundada para tomarla
  ALCANCE: 80,                   // m: más allá, el tiro se pierde
  MANO_VIEJA_MS: 400,
  REPOSO: 0.12,
  APUNTE_MS: 300,
  PROMEDIO_MS: 45,
  COS_TEMBLOR: Math.cos((0.75 * Math.PI) / 180),
  /** La cara de arriba del mando, en su marco (ver el tiro). */
  ARRIBA_MANDO: { x: 0, y: 0, z: -1 },
  G: 9.8,

  /** El cuerpo del jugador, a partir de la cabeza (readViewerPose) y de las
   *  manos: la cintura queda CINTURA más abajo que los ojos, y el frente es
   *  hacia donde están las manos. */
  CUERPO: {
    CINTURA: 0.51,            // m bajo los ojos
    FUNDA: { lado: 0.21, adelante: 0.02, bajo: 0.02 },   // cada funda, a un costado
    BOLSILLO: { lado: 0.1, adelante: 0.17, bajo: -0.02 }, // los cargadores, adelante
    SUAVIZADO: 5,             // 1/s: qué tan rápido sigue el cuerpo al giro de las manos
  },

  /** Vida del jugador: cada disparo enemigo que llega a la cabeza resta uno. */
  VIDA: 5,
  CLAVE_RECORD: "planta:record",
})]);
