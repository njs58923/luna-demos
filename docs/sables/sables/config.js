// Los números del juego: corte, puntaje, energía. La geometría (carriles,
// filas, largo de la hoja) la manda el servidor en sables/datos.js.
(globalThis.__modulos ||= []).push(["sables/config", ["sables/datos"], (D) => ({
  ...D.geometria,
  /** Media caja de un cubo para el corte: más generosa que lo que se ve. */
  CAJA: { x: 0.33, y: 0.33, z: 0.42 },
  BOMBA: 0.24,
  /** Velocidad mínima de la hoja en el punto del corte, en m/s. */
  VEL_CORTE: 1.6,
  /** Desvío máximo entre el corte y la flecha: 60° a cada lado. */
  COS_DESVIO: 0.5,
  /** Cuánto se levanta la hoja respecto del rayo del mando, en grados. */
  INCLINACION: 75,
  /** Muestras a lo largo de la hoja para el barrido. */
  MUESTRAS: 10,

  // Puntaje (como Beat Saber: 70 por el envión, 30 por el remate, 15 por el centro).
  ENVION_GRADOS: 100,
  REMATE_GRADOS: 60,
  CENTRO_M: 0.3,
  /** Hasta cuánto antes del corte cuenta el envión, y cuánto después el remate. */
  ENVION_S: 0.3,
  REMATE_S: 0.2,
  /** Cortes para pasar de un multiplicador al siguiente: x1→x2, x2→x4, x4→x8. */
  MULTIPLICADORES: [1, 2, 4, 8],
  PARA_SUBIR: [2, 4, 8],

  // Energía.
  VIDA_INICIO: 0.5,
  VIDA_CORTE: 0.01,
  VIDA_FALLO: 0.15,
  VIDA_MAL: 0.1,
  VIDA_BOMBA: 0.15,
  VIDA_PARED_S: 1.3,

  /** Un cubo que pasó de acá sin cortar es un fallo; de acá en más, se apaga. */
  Z_FALLO: 0.45,
  Z_FIN: 1.6,
  /** Altura de cabeza si no se sabe (escritorio sin pose). */
  ALTURA: 1.7,
  /** Corrección de latencia del audio, en segundos (positivo: los cubos llegan antes). */
  LATENCIA: 0,
  RANGOS: [[0.9, "SS"], [0.8, "S"], [0.65, "A"], [0.5, "B"], [0.35, "C"], [0.2, "D"], [0, "E"]],
})]);
