// El recorrido: las áreas en fila, cargadas de a tres (comun/areas.js), cada
// una con su portón al fondo que se abre cuando caen todos sus enemigos.
//
// Un área montada trae su escenografía en su propio include (el servidor la
// arma en /area/<id>.hsml); de este lado quedan lo que se juega:
//
//   - sus sólidos (las cajas de sus modelos y paredes, en mundo), para el tiro;
//   - su portón, cerrado hasta despejarla (y sólido mientras esté cerrado);
//   - sus enemigos, que nacen quietos y se activan cuando el jugador entra.
//
// Al desmontarse se va todo eso con ella. Lo que no se olvida es si ya se
// despejó: volver atrás no la repuebla, y su portón vuelve abierto.
//
// Cada área avisa (evento "lista") cuando terminó de cargar sus modelos: el
// marcador muestra cuántos y en cuánto tiempo, que para eso es una prueba de
// carga.
(globalThis.__modulos ||= []).push(["juego/progreso", [
  "comun/algebra", "comun/areas", "juego/escena", "juego/sonidos", "juego/juego", "juego/enemigos", "juego/cuerpo", "juego/datos",
], (A, AR, E, S, J, N, P, D) => {
  const { v3 } = A;
  const { crear, escenario, byId } = E;

  N.conModelos(D.modelosEnemigos);
  const estado = {};   // por área: { despejada, puerta, abriendo, carga }
  for (const a of D.areas) estado[a.id] = { despejada: false, puerta: null, abierta: 0, carga: null };
  const mundo = byId("mundo") || escenario;

  // ── Los portones ──────────────────────────────────────────────────────────
  /** Dos hojas de chapa amarilla con franjas, que se corren a los costados. */
  function crearPuerta(a) {
    const p = a.puerta, ancho = p.x1 - p.x0, medio = (p.x0 + p.x1) / 2;
    const g = crear("group", { id: "puerta_" + a.id, x: medio, z: p.z }, escenario);
    const hojas = [-1, 1].map((lado) => {
      const h = crear("group", { x: (lado * ancho) / 4 }, g);
      crear("box", { y: p.alto / 2, sx: ancho / 2 - 0.02, sy: p.alto, sz: 0.25, color: "#C9A227", touchable: "false" }, h);
      for (let k = 0; k < 5; k++) {
        crear("box", { y: 0.4 + k * (p.alto - 0.6) / 4, z: 0.13, sx: ancho / 2 - 0.1, sy: 0.18, sz: 0.01, color: "#1C1C1C", touchable: "false", rz: lado * 0.35 }, h);
      }
      return { h, lado };
    });
    const luz = crear("sphere", { y: p.alto + 0.25, sx: 0.3, sy: 0.3, sz: 0.3, color: "#FF2D2D", "material-unlit": "true", touchable: "false" }, g);
    return { g, hojas, luz, ancho, medio };
  }
  function solidosPuerta(a) {
    const p = a.puerta;
    return [{ min: v3(p.x0, 0, p.z - 0.13), max: v3(p.x1, p.alto, p.z + 0.13), material: "metal" }];
  }
  function ponerPuerta(a, k) {
    const st = estado[a.id], pu = st.puerta;
    if (!pu) return;
    for (const { h, lado } of pu.hojas) h.setAttribute("x", String((lado * pu.ancho) / 4 + lado * (pu.ancho / 2) * k));
    pu.luz.setAttribute("color", k > 0 ? "#30D158" : "#FF2D2D");
  }

  // ── La carga ──────────────────────────────────────────────────────────────
  const carga = AR.crearCarga({
    padre: mundo,
    areas: D.areas.map((a) => ({ id: a.id, src: a.src, origen: a.origen, caja: a.caja, props: { id: a.id } })),
    alcance: 1,
    retencionMs: 4000,
    eventos: "lista",
    alMontar(area) {
      const a = D.areas[area.indice], st = estado[a.id];
      st.carga = { desde: performance.now(), modelos: 0, ms: 0 };
      E.ponerSolidos(a.id, a.solidos);
      if (a.puerta) {
        st.puerta = crearPuerta(a);
        ponerPuerta(a, st.despejada ? 1 : 0);
        if (!st.despejada) E.ponerSolidos("puerta_" + a.id, solidosPuerta(a));
      }
      if (!st.despejada) for (const def of a.enemigos) N.nacer(a.id, def);
      if (carga && carga.actual && carga.actual.id === a.id) N.activarArea(a.id);
    },
    alLista(area, detalle) {
      const st = estado[area.id];
      if (!st.carga) return;
      st.carga.modelos = (detalle && detalle.modelos) || 0;
      st.carga.ms = (detalle && detalle.ms) || performance.now() - st.carga.desde;
      J.ultimo(D.areas[area.indice].titulo + ": " + st.carga.modelos + " modelos en " + (st.carga.ms / 1000).toFixed(1) + " s");
    },
    alDesmontar(area) {
      const a = D.areas[area.indice], st = estado[a.id];
      E.quitarSolidos(a.id);
      E.quitarSolidos("puerta_" + a.id);
      if (st.puerta) { st.puerta.g.remove(); st.puerta = null; }
      N.quitarArea(a.id);
    },
    alEntrar(area, anterior) {
      const a = D.areas[area.indice];
      N.activarArea(a.id);
      if (anterior) J.empezar();
      J.anunciar(a.titulo, a.sub || "", 2400);
    },
  });

  function animar(t, dt) {
    const actual = carga.actualizar(P.cabeza, t);
    const a = D.areas[actual.indice], st = estado[a.id];
    const quedan = N.quedan(a.id);
    J.enArea((actual.indice + 1) + "/" + D.areas.length + "  " + a.titulo.toUpperCase(), quedan);
    // Montada, con sus enemigos ya nacidos y todos abajo: despejada.
    if (!st.despejada && actual.grupo && quedan === 0 && a.enemigos.length && st.carga) {
      st.despejada = true;
      E.quitarSolidos("puerta_" + a.id);
      if (a.puerta) {
        st.abriendo = t;
        S.sonar("puerta", 1);
        J.anunciar("ÁREA DESPEJADA", "el portón se abre", 2200);
      } else J.terminar();
    }
    // El portón que se abre, en 1,4 s.
    if (st.abriendo && st.puerta) {
      const k = Math.min(1, (t - st.abriendo) / 1400);
      ponerPuerta(a, k * k * (3 - 2 * k));
      if (k >= 1) st.abriendo = 0;
    }
  }

  return { carga, estado, animar };
}]);
