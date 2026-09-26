// Los números de la galería de tiro: entrada, puntería, la mesa y los blancos.
// Lo de cada arma (cargador, cadencia, dispersión) está en armas.js.
(globalThis.__modulos ||= []).push(["tiro/config", [], () => ({
  APRETAR: 0.6, AFLOJAR: 0.35,   // histéresis de grip y gatillo
  RADIO_TOMAR: 0.2,              // m: distancia de la mano a un arma para tomarla
  ALCANCE: 90,                   // m: más allá, el tiro se pierde
  /** Una mano que no manda poses hace esto no dispara ráfagas: salió de
   *  seguimiento con el gatillo apretado. Lo que tiene, lo sigue teniendo. */
  MANO_VIEJA_MS: 400,
  /** Apretar el gatillo tira del mando: uno o dos grados hacia abajo, que a 7 m
   *  son más que el ancho de una botella. El primer tiro sale con la puntería
   *  de antes de empezar a apretar (el gatillo todavía bajo REPOSO), si fue hace
   *  menos de APUNTE_MS: más viejo es un apretón lento, y ahí manda la actual. */
  REPOSO: 0.12,
  APUNTE_MS: 300,
  /** El temblor de la mano: la dirección se promedia sobre este tramo, con las
   *  muestras a menos de 0,75° (una mano quieta tiembla 0,1 a 0,3°; más que
   *  eso ya es moverla). */
  PROMEDIO_MS: 45,
  COS_TEMBLOR: Math.cos((0.75 * Math.PI) / 180),
  /** La parte de arriba del mando, en su marco. Luna apunta el rayo por el −Y
   *  del mando (controller_aim_direction en touch.rs); con el grip de OpenXR
   *  girado para eso, la cara de arriba queda en −Z. Si un arma sale boca abajo
   *  en la mano, es este signo. */
  ARRIBA_MANDO: { x: 0, y: 0, z: -1 },
  G: 9.8,
  CLAVE_RECORD: "tiro:record",
  /** Una ronda dura esto desde el primer tiro. Por tiempo y no por cantidad de
   *  tiros: con una MAC-10, 24 tiros son dos segundos. */
  RONDA_S: 60,

  /** La mesa de las armas, a la derecha de la llegada. `y` es su cara de arriba. */
  MESA: { x: 0.6, y: 0.9, z: -0.55, ancho: 1.3, fondo: 0.6 },
  /** La de los rifles, a la izquierda: no entran a lo hondo de la otra, así
   *  que se apoyan a lo ancho, con el cañón hacia −X. */
  MESA_RIFLES: { x: -0.85, y: 0.9, z: -0.55, ancho: 1.3, fondo: 1.0 },

  BOTELLAS: { z: -7, y: 1.0, xs: [-1.75, -1.05, -0.35, 0.35, 1.05, 1.75], r: 0.042, alto: 0.3, puntos: 5 },
  COLORES_VIDRIO: ["#2E8B57", "#8B5A2B", "#4A90C2", "#3FA36B", "#A0522D", "#6FB7D8"],
  LATAS: { z: -4.2, y: 0.5, xs: [-1.6, -0.8, 0, 0.8, 1.6], r: 0.048, alto: 0.13, puntos: 3, aire: 8 },
  COLORES_LATA: ["#D0342C", "#2F6FD0", "#C8CCD8", "#E0A21B", "#3FA34D"],
  PLACAS: [
    { x: -1.6, z: -11, r: 0.3, puntos: 4 },
    { x: 1.4, z: -15, r: 0.26, puntos: 6 },
    { x: -0.3, z: -21, r: 0.22, puntos: 10 },
  ],
  PIVOTE_Y: 2.1,
  CADENA: 0.55,
})]);
