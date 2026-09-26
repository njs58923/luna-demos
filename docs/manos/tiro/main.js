// La galería de tiro: tomar un arma de la mesa y romper botellas, voltear latas
// y hacer sonar placas de acero. Este módulo sólo conecta: escucha los mandos y
// mueve el cuadro. Lo demás está repartido así:
//
//   comun/modulos.js    espera a que lleguen todos los <script src>, en cualquier orden
//   comun/algebra.js    vectores, cuaterniones, azar estable
//   comun/sintesis.js   sonidos sintetizados como WAV en memoria
//   tiro/config.js      los números: puntería, mesa, blancos
//   tiro/sonidos.js     los clips de la galería
//   tiro/escena.js      nodos, sólidos (lo que frena un tiro), la mesa
//   tiro/blancos.js     botellas, latas y placas, y cómo reaccionan
//   tiro/efectos.js     fogonazo, trazadora, chispas, polvo, marcas, avisos
//   tiro/juego.js       la ronda, el tablero y el récord
//   comun/interaccion.js  riel, suelto, guía y agarre: las piezas que se tocan
//   tiro/cargadores.js  los cargadores sueltos y los repuestos de la mesa
//   tiro/cajas.js       una caja de balas por arma, con tapa; vacías, para guardar algo
//   tiro/ajustes.js     ajustar arma: las zonas y los puntos de cada arma, a la vista y editables
//   tiro/panel_ajustes.js  el panel (framework de interfaz) para ajustarlos
//   tiro/armas.js       pistola, MP5, MAC-10, AK-47 y M14: modelo, mecanismos, cadencia, dispersión
//   tiro/disparo.js     el rayo de cada tiro y lo que se lleva
//   tiro/manos.js       tomar lo que haya al alcance, apuntar, gatillo y ráfaga
(globalThis.__modulos ||= []).push(["tiro/main", [
  "tiro/escena", "tiro/blancos", "tiro/efectos", "tiro/juego", "tiro/armas", "tiro/cargadores", "tiro/cajas", "tiro/ajustes", "tiro/manos",
], (E, B, F, J, W, K, X, Z, M) => {
  if (E.zona) E.zona.addEventListener("posemove", M.onPose);

  let antes = null;
  function cuadro(tRaf) {
    // Dos relojes: el de requestAnimationFrame es el del host (millones de ms
    // desde que arrancó Luna) y performance.now() el del isolate (desde que
    // cargó el script). Los plazos —la botella que vuelve, la trazadora, las
    // esquirlas— se anotan con performance.now() desde los eventos, así que se
    // comparan con él. Con el del cuadro vencían todos en el primer cuadro.
    const t = performance.now();
    const dt = antes == null ? 0 : Math.min(0.05, (tRaf - antes) / 1000);
    antes = tRaf;

    M.animar(t);
    W.animar(t, dt);
    K.animar(t, dt);     // después de las armas: los puestos siguen su pose de este cuadro
    X.animar(dt);
    Z.animar();          // después de las armas: las figuras siguen sus piezas
    B.animar(t, dt);
    F.animar(t, dt);
    J.animar(t);
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);
}]);
