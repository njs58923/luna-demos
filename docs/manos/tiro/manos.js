// Las manos: tomar lo que haya al alcance, llevarlo, apretar el gatillo.
//
//   grip cerca de algo             tomarlo: un arma de la mesa, su corredera,
//                                  su cargador, un cargador suelto, el
//                                  guardamanos de la MP5 o la tapa de una
//                                  caja, que se abre o se cierra (el más cercano)
//   gatillo con un arma            tirar: un tiro por apretón, o ráfaga
//                                  mientras se sostenga si es automática
//   A (o X) con un arma            el retén: suelta el cargador, que cae
//   soltar el grip                 lo suelta: el arma vuelve a la mesa, un
//                                  cargador cae, la corredera vuelve sola
//
// Qué pasa al tomar, mover y soltar lo decide cada pieza (comun/interaccion.js,
// armas.js, cargadores.js); acá sólo se decide cuál toma cada mano y se le
// pasa la mano mientras la tenga.
//
// Una mano que deja de mandar poses no suelta nada: al alejarse del centro, o
// si el mando pierde el seguimiento un momento, el arma sigue en la mano.
(globalThis.__modulos ||= []).push(["tiro/manos", [
  "comun/algebra", "tiro/config", "tiro/armas", "tiro/cargadores", "tiro/cajas", "tiro/ajustes", "tiro/disparo",
], (A, C, W, K, X, Z, D) => {
  const { v3, suma, resta, por, punto, unitario, qNormal, qMirando, ADELANTE } = A;
  const { APRETAR, AFLOJAR, MANO_VIEJA_MS, REPOSO, APUNTE_MS, PROMEDIO_MS, COS_TEMBLOR } = C;

  const nuevaMano = () => ({ pos: null, q: null, d: null, grip: false, gatillo: false, boton: false, t: 0, historia: [], reposo: 0, tomado: null });
  const manos = { left: nuevaMano(), right: nuevaMano() };
  const agarrables = () => [...Z.agarrables(), ...W.agarrables(), ...K.agarrables(), ...X.agarrables()];

  /** La mano con la que se apunta: la de antes de empezar a apretar si
   *  `antesDeApretar` (el tirón del gatillo), la de ahora si no. En los dos
   *  casos, la dirección promediada sobre PROMEDIO_MS con las muestras que son
   *  temblor y no movimiento. */
  function apunte(m, ahora, antesDeApretar) {
    const h = m.historia;
    let fin = h.length - 1;
    if (antesDeApretar && m.reposo && ahora - m.reposo <= APUNTE_MS) {
      while (fin > 0 && h[fin].t > m.reposo) fin--;
    }
    const base = h[fin];
    if (!base || !base.d) return m;
    let d = v3(0, 0, 0);
    for (let i = fin; i >= 0 && base.t - h[i].t <= PROMEDIO_MS; i--) {
      if (h[i].d && punto(h[i].d, base.d) >= COS_TEMBLOR) d = suma(d, h[i].d);
    }
    return { pos: base.pos, q: base.q, d: unitario(d) };
  }

  /** La mano para las piezas: dónde está, cómo está girada y a qué velocidad
   *  va (la de los últimos ~60 ms, que es la que lleva lo que se suelta). */
  function contexto(m) {
    const h = m.historia;
    let vel = v3(0, 0, 0);
    for (let i = h.length - 2; i >= 0; i--) {
      const dt = (m.t - h[i].t) / 1000;
      if (dt >= 0.06 || i === 0) { if (dt > 0) vel = por(resta(m.pos, h[i].pos), 1 / dt); break; }
    }
    return { pos: m.pos, q: m.q || qMirando(m.d || ADELANTE), d: m.d, vel };
  }

  /** Hacia dónde venía moviéndose la mano en los últimos ~150 ms, o null si
   *  estaba quieta (menos de 1,5 cm). Las zonas con dirección la usan para
   *  decidir entre dos que se pisan. */
  function llegada(m) {
    const h = m.historia;
    let viejo = null;
    for (let i = h.length - 1; i >= 0 && m.t - h[i].t <= 150; i--) viejo = h[i];
    if (!viejo) return null;
    const d = resta(m.pos, viejo.pos);
    const l = Math.hypot(d.x, d.y, d.z);
    return l >= 0.015 ? por(d, 1 / l) : null;
  }

  /** Lo más cercano al alcance de la mano, de todo lo que se puede tomar. */
  function masCercano(m) {
    const pos = m.pos, vino = llegada(m);
    let mejor = null, dist = Infinity;
    for (const ag of agarrables()) {
      const d = ag.distancia(pos, vino);
      if (d != null && d < dist) { mejor = ag; dist = d; }
    }
    return mejor;
  }

  function soltar(mano) {
    const m = manos[mano];
    const ag = m.tomado;
    if (!ag) return;
    m.tomado = null;
    ag.soltar(mano, contexto(m));
  }

  function onPose(evt) {
    const mano = evt.hand === "left" ? "left" : "right";
    const m = manos[mano];
    const ahora = performance.now();
    m.pos = v3(evt.px, evt.py, evt.pz);
    m.q = evt.qw != null ? qNormal({ x: evt.qx, y: evt.qy, z: evt.qz, w: evt.qw }) : null;
    m.d = evt.dx != null ? unitario(v3(evt.dx, evt.dy, evt.dz)) : null;
    m.t = ahora;
    m.historia.push({ t: ahora, pos: m.pos, q: m.q, d: m.d });
    while (m.historia.length && ahora - m.historia[0].t > APUNTE_MS + PROMEDIO_MS) m.historia.shift();

    const g = evt.grip || 0, gt = evt.trigger || 0;
    if (gt < REPOSO) m.reposo = ahora;
    const antesGrip = m.grip, antesGatillo = m.gatillo, antesBoton = m.boton;
    // `primary` es A en la derecha y X en la izquierda: el botón de abajo, el
    // que queda bajo el pulgar de la mano que sostiene el arma.
    m.boton = !!evt.primary;
    if (!m.grip && g > APRETAR) m.grip = true;
    else if (m.grip && g < AFLOJAR) m.grip = false;
    if (!m.gatillo && gt > APRETAR) m.gatillo = true;
    else if (m.gatillo && gt < AFLOJAR) m.gatillo = false;

    if (m.tomado) {
      if (antesGrip && !m.grip) { soltar(mano); return; }
      if (m.tomado.mover(mano, contexto(m)) === "soltar") { m.tomado = null; return; }
      const a = m.tomado.arma;
      // En modo ajuste el arma no tira ni suelta el cargador: el gatillo queda
      // libre para tocar el panel.
      if (a && a.ajustando) return;
      if (a && !antesBoton && m.boton) W.soltarCargador(a);
      if (a && !antesGatillo && m.gatillo) {
        D.disparar(a, W.poseEnMano(a, apunte(m, ahora, true)), ahora);
        if (a.tipo.automatica) a.proximo = ahora + W.intervalo(a);
      }
    } else if (!antesGrip && m.grip) {
      const ag = masCercano(m);
      if (ag) {
        m.tomado = ag;
        ag.tomar(mano, contexto(m));
      }
    }
  }

  /** La ráfaga de las automáticas. */
  function animar(t) {
    for (const mano of ["left", "right"]) {
      const m = manos[mano];
      const a = m.tomado && m.tomado.arma;
      if (!a || !a.tipo.automatica || !m.gatillo || a.ajustando) continue;
      // Sin poses, el gatillo que se vio apretado puede no estarlo: no se tira.
      if (t - m.t >= MANO_VIEJA_MS) continue;
      // Si el cuadro llegó tarde, no se recuperan los tiros perdidos de golpe.
      if (t - a.proximo > 200) a.proximo = t;
      while (t >= a.proximo) {
        if (!W.puedeTirar(a)) break;   // en vacío, un solo clic: el del apretón
        // En la ráfaga se apunta con la mano de ahora: se puede barrer.
        D.disparar(a, W.poseEnMano(a, apunte(m, t, false)), t);
        a.proximo += W.intervalo(a);
      }
    }
  }

  return { manos, onPose, animar };
}]);
