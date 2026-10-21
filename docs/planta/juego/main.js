// La planta: una incursión lineal por una fábrica tomada por drones y robots,
// con dos pistolas. Este módulo sólo conecta: escucha los mandos y mueve el
// cuadro. Lo demás:
//
//   comun/modulos.js    espera a que lleguen todos los <script src>, en cualquier orden
//   comun/algebra.js    vectores, cuaterniones, azar estable
//   comun/sintesis.js   sonidos sintetizados como WAV en memoria
//   comun/interaccion.js  riel, suelto, guía y agarre: las piezas que se tocan
//   comun/areas.js      la carga diferida: el área del jugador y sus vecinas, en includes
//   juego/datos.js      el nivel (lo arma el servidor): áreas, sólidos, enemigos, portones
//   juego/config.js     los números: puntería, cuerpo, vida
//   juego/sonidos.js    los clips
//   juego/escena.js     nodos y sólidos (lo que frena un tiro), por dueño
//   juego/cuerpo.js     dónde está el jugador: cabeza, frente, fundas y bolsillos
//   juego/efectos.js    fogonazo, trazadora, chispas, polvo, marcas, explosiones
//   juego/juego.js      puntos, vida, reloj, el marcador de la muñeca y los anuncios
//   juego/cargadores.js los cargadores sueltos y los repuestos del cinturón
//   juego/armas.js      G17 y Desert Eagle: modelo, mecanismos, fundas
//   juego/enemigos.js   drones y robots: cómo se mueven, disparan y caen
//   juego/disparo.js    el rayo de cada tiro y lo que se lleva
//   juego/manos.js      tomar, apuntar, gatillo y retén
//   juego/progreso.js   las áreas, sus portones y el final
(globalThis.__modulos ||= []).push(["juego/main", [
  "juego/escena", "juego/cuerpo", "juego/efectos", "juego/juego", "juego/armas", "juego/cargadores", "juego/enemigos", "juego/manos", "juego/progreso",
], (E, P, F, J, W, K, N, M, R) => {
  if (E.zona) E.zona.addEventListener("posemove", M.onPose);
  // Para las pruebas y para mirar desde la consola.
  globalThis.PLANTA = { E, P, F, J, W, K, N, M, R };

  let antes = null;
  function cuadro(tRaf) {
    // Los plazos se anotan con performance.now() (el reloj del isolate); el
    // del cuadro es el del host: sólo sirve para el dt.
    const t = performance.now();
    const dt = antes == null ? 0 : Math.min(0.05, (tRaf - antes) / 1000);
    antes = tRaf;

    P.animar(dt);
    M.animar(t);
    W.animar(t, dt);
    K.animar(t, dt);     // después de las armas: los puestos siguen su pose de este cuadro
    N.animar(t, dt);
    R.animar(t, dt);
    F.animar(t, dt);
    J.animar(t, M.manos.left.pos);
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);
}]);
