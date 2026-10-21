// Los cubos, las bombas y las paredes de una canción: cuándo aparecen, cómo
// vienen, y qué pasa cuando un sable los toca.
//
// Un cubo tiene su pulso: en ese segundo de la canción su centro está en
// zGolpe (casi un metro adelante). Aparece `anticipo` segundos antes, lejos,
// saltando desde el piso hasta su fila, y viene a la velocidad de la
// dificultad (njs). Si pasa de largo sin cortar, es un fallo.
//
// El corte se busca en el barrido de la hoja entre el cuadro anterior y este:
// varias muestras a lo largo de la hoja, cada una un segmento de dónde estaba
// a dónde está, contra la caja del cubo (que también se movió). En el punto de
// contacto se mira la velocidad de la hoja: su dirección en el plano XY tiene
// que coincidir con la flecha (60° a cada lado), y el sable tiene que ser el
// del color del cubo. Si no, es un corte malo.
(globalThis.__modulos ||= []).push(["sables/notas", [
  "comun/algebra", "sables/config", "sables/escena", "sables/sables", "sables/marcador", "sables/efectos", "sables/sonidos", "sables/luces",
], (A, C, E, S, M, F, SN, L) => {
  const { v3, suma, resta, por, punto, cruz, unitario, largo } = A;
  const DIRS = [[0, 1], [0, -1], [-1, 0], [1, 0], [-0.7071, 0.7071], [0.7071, 0.7071], [-0.7071, -0.7071], [0.7071, -0.7071], [0, 0]];
  const R = C.reservas;
  const cubos = E.reserva("n", R.cubos, (i) => ({ c: E.byId("n" + i + "_c"), a: E.byId("n" + i + "_a"), p: E.byId("n" + i + "_p") }));
  const bombas = E.reserva("b", R.bombas);
  const paredes = E.reserva("w", R.paredes, (i) => ({ c: E.byId("w" + i + "_c"), b: E.byId("w" + i + "_b") }));

  let notas = [], muros = [], sig = 0, sigMuro = 0;
  let njs = 10, anticipo = 1.2, altura = C.ALTURA, spb = 0.5, fin = 0;
  const pendientes = [];   // cortes buenos esperando el remate
  let alternar = 0, sonidoPared = 0;

  const xCol = (col) => (col - 1.5) * C.carril;
  const yFila = (fila) => altura * C.filas[Math.max(0, Math.min(2, fila))];

  /** Preparar una canción: el mapa (formato v2) y la altura del jugador. */
  function cargar(mapa, cancion, alturaCabeza) {
    limpiar();
    njs = mapa.njs; anticipo = mapa.anticipo; spb = 60 / mapa.bpm;
    altura = Math.max(1.2, Math.min(2.1, alturaCabeza || C.ALTURA));
    notas = mapa._notes.map((n, i) => {
      const d = DIRS[n._cutDirection] || DIRS[8];
      return {
        i, t: n._time * spb, col: n._lineIndex, fila: n._lineLayer, tipo: n._type, corte: n._cutDirection,
        x: xCol(n._lineIndex), y: yFila(n._lineLayer), d: v3(d[0], d[1], 0), rz: n._cutDirection === 8 ? 0 : Math.atan2(d[0], -d[1]),
        estado: "espera", pieza: null, pos: null, posAntes: null,
      };
    });
    muros = mapa._obstacles.map((o) => {
      const x0 = (o._lineIndex - 2) * C.carril, x1 = x0 + o._width * C.carril;
      return { t: o._time * spb, dur: o._duration * spb, x0, x1, y0: o._type === 1 ? altura * 0.74 : 0, y1: 3.2, baja: o._type === 1, estado: "espera", pieza: null };
    });
    sig = 0; sigMuro = 0;
    fin = Math.max(cancion.duracion, ...notas.map((n) => n.t + 1));
    return notas.filter((n) => n.tipo !== 3).length;
  }

  function aparecer(n) {
    const bomba = n.tipo === 3;
    const p = bomba ? bombas.tomar() : cubos.tomar();
    if (!p) { n.estado = "fuera"; return; }   // sin piezas libres: no debería pasar
    n.pieza = p; n.estado = "activa";
    if (!bomba) {
      E.attr(p.c, "color", n.tipo === 0 ? C.colores.izquierda : C.colores.derecha);
      E.ver(p.a, n.corte !== 8);
      E.ver(p.p, n.corte === 8);
    }
    E.ver(p.el, true);
  }

  /** Dónde está el cubo `n` en el segundo `t`: salta desde abajo en el primer
   *  tercio del viaje y gira hasta mostrar su flecha. */
  function ubicar(n, t) {
    const z = C.zGolpe - (n.t - t) * njs;
    const u = 1 - (n.t - t) / anticipo;
    const e = u >= 0.32 ? 1 : (() => { const k = Math.max(0, u / 0.32); return k * k * (3 - 2 * k); })();
    n.posAntes = n.pos;
    n.pos = v3(n.x, 0.15 + (n.y - 0.15) * e, z);
    E.poner(n.pieza.el, n.pos);
    E.rot(n.pieza.el, 0, 0, n.tipo === 3 ? t * 2 : n.rz * e + (1 - e) * Math.PI);
    if (!n.posAntes) n.posAntes = n.pos;
  }

  function soltar(n) {
    if (!n.pieza) return;
    (n.tipo === 3 ? bombas : cubos).soltar(n.pieza);
    n.pieza = null;
  }

  // ── El barrido ────────────────────────────────────────────────────────────
  /** Segmento a→b contra una caja centrada en el origen de medias medidas h:
   *  devuelve el parámetro de entrada (0..1) o null. */
  function segmentoCaja(a, b, h) {
    let t0 = 0, t1 = 1;
    for (const k of ["x", "y", "z"]) {
      const d = b[k] - a[k];
      if (Math.abs(d) < 1e-9) { if (a[k] < -h[k] || a[k] > h[k]) return null; continue; }
      let ta = (-h[k] - a[k]) / d, tb = (h[k] - a[k]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return t0;
  }
  /** El primer contacto de la hoja de `s` con lo que está en `n`. */
  function* contactos(s, n, h) {
    if (!s.tramos || !s.tramos.length) {
      const c = contactoTramo(s, n, h);
      if (c) yield c;
      return;
    }
    if (!n.pos || !n.posAntes) return;
    const t0 = s.tramos[0].tAntes, t1 = s.tramos[s.tramos.length - 1].t;
    const centro = t => suma(n.posAntes, por(resta(n.pos, n.posAntes), (t - t0) / Math.max(1e-6, t1 - t0)));
    for (const tramo of s.tramos) {
      const c = contactoTramo(tramo, { posAntes: centro(tramo.tAntes), pos: centro(tramo.t) }, h);
      if (c) yield { ...c, dt: tramo.t - tramo.tAntes, dir: tramo.dir, t: tramo.tAntes + c.e * (tramo.t - tramo.tAntes) };
    }
  }
  function contactoTramo(s, n, h) {
    if (!s.base || !s.baseAntes || !n.pos) return null;
    let mejor = null;
    for (let k = 0; k <= C.MUESTRAS; k++) {
      const f = 0.08 + 0.92 * (k / C.MUESTRAS);
      const p0 = suma(s.baseAntes, por(resta(s.puntaAntes, s.baseAntes), f));
      const p1 = suma(s.base, por(resta(s.punta, s.base), f));
      const e = segmentoCaja(resta(p0, n.posAntes), resta(p1, n.pos), h);
      // El cubo también se movió en el cuadro: su centro en el momento del contacto.
      if (e != null && (!mejor || e < mejor.e)) mejor = { e, p0, p1, punto: suma(p0, por(resta(p1, p0), e)), centro: suma(n.posAntes, por(resta(n.pos, n.posAntes), e)) };
    }
    return mejor;
  }

  function cortar(n, s, c, ahora) {
    const dt = Math.max(1 / 240, c.dt == null ? s.t - s.tAntes : c.dt);
    const v = por(resta(c.p1, c.p0), 1 / dt);
    const vel = largo(v);
    if (vel < 0.6) return false;            // la hoja quieta en el camino no corta
    const vxy = Math.hypot(v.x, v.y);
    const manoOk = (n.tipo === 0) === (s.mano === "left");
    const dirOk = n.corte === 8 ? vel >= C.VEL_CORTE * 0.6 : vxy > 0.5 && (v.x * n.d.x + v.y * n.d.y) / vxy >= C.COS_DESVIO;
    const dirHoja = c.dir || s.dir;
    let normal = cruz(dirHoja, v);
    if (largo(normal) < 1e-6) normal = cruz(dirHoja, v3(0, 0, 1));
    normal = unitario(normal);
    const color = n.tipo === 0 ? C.colores.izquierda : C.colores.derecha;
    n.estado = "cortada";
    F.partir(n.pos, normal, color, v3(0, 0, njs), ahora);
    F.chispazo(c.punto, unitario(v3(v.x, v.y, 0.0001)), color, ahora, manoOk && dirOk ? 8 : 4);
    soltar(n);
    if (manoOk && dirOk) {
      const multiplicador = M.corte();
      const distancia = Math.abs(punto(resta(c.centro, c.punto), normal));
      const centro = 15 * (1 - Math.min(1, distancia / C.CENTRO_M));
      const sentido = unitario(v);
      const instante = c.t == null ? ahora : c.t;
      const envion = S.barrido(s, instante - C.ENVION_S, instante, sentido);
      pendientes.push({ s, t0: instante, multiplicador, centro, envion, sentido, pos: n.pos });
      SN.sonar(alternar++ % 2 ? "corte2" : "corte", 0.9);
      L.destellar(s.mano === "left" ? 0 : 1);
    } else {
      M.error("malo");
      SN.sonar("mal");
      F.cartel(n.pos, manoOk ? "DIRECCIÓN" : "COLOR", "#FF6B5E", ahora, 0.07);
    }
    return true;
  }

  function tocarBomba(n, ahora) {
    n.estado = "cortada";
    F.chispazo(n.pos, v3(0, 1, 0), "#FF9F0A", ahora, 12);
    soltar(n);
    M.error("bomba");
    SN.sonar("bomba");
    F.cartel(n.pos, "¡BOMBA!", "#FF9F0A", ahora, 0.09);
  }

  /** Los cortes que ya pueden cerrar su remate. */
  function cerrarPendientes(ahora) {
    for (let i = pendientes.length - 1; i >= 0; i--) {
      const p = pendientes[i];
      if (ahora - p.t0 < C.REMATE_S) continue;
      pendientes.splice(i, 1);
      const remate = S.barrido(p.s, p.t0, p.t0 + C.REMATE_S, p.sentido);
      const puntos = Math.round(70 * Math.min(1, p.envion / C.ENVION_GRADOS) + 30 * Math.min(1, remate / C.REMATE_GRADOS) + p.centro);
      M.sumar(puntos, p.multiplicador);
      F.cartel(p.pos, String(puntos), puntos >= 110 ? "#FFFFFF" : puntos >= 100 ? "#E8E8F0" : puntos >= 85 ? "#FFD60A" : "#FF9F0A", ahora, puntos >= 110 ? 0.11 : 0.09);
    }
  }

  // ── Las paredes ───────────────────────────────────────────────────────────
  function ubicarMuro(w, t) {
    const zf = C.zGolpe + (t - w.t) * njs, zb = zf - w.dur * njs;
    w.zf = zf; w.zb = zb;
    const p = w.pieza;
    E.poner(p.el, v3((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, (zf + zb) / 2));
  }
  function aparecerMuro(w) {
    const p = paredes.tomar();
    if (!p) { w.estado = "fuera"; return; }
    w.pieza = p; w.estado = "activa";
    const sx = w.x1 - w.x0, sy = w.y1 - w.y0, sz = w.dur * njs;
    E.attr(p.c, "sx", sx.toFixed(3)); E.attr(p.c, "sy", sy.toFixed(3)); E.attr(p.c, "sz", sz.toFixed(3));
    E.attr(p.b, "sx", sx.toFixed(3)); E.attr(p.b, "sz", sz.toFixed(3));
    E.attr(p.b, "y", (w.baja ? -sy / 2 : sy / 2).toFixed(3));
    E.ver(p.el, true);
  }

  /** Un cuadro de juego. `t`: segundo de la canción; `ahora`: reloj de pared. */
  function actualizar(t, ahora, dt, cabeza) {
    while (sig < notas.length && notas[sig].t - anticipo <= t) {
      const n = notas[sig++];
      if (n.t - t > -0.2) aparecer(n); else n.estado = "fuera";
    }
    while (sigMuro < muros.length && muros[sigMuro].t - anticipo <= t) aparecerMuro(muros[sigMuro++]);

    const manos = [S.sables.left, S.sables.right];
    for (let i = Math.max(0, sig - R.cubos - R.bombas); i < sig; i++) {
      const n = notas[i];
      if (n.estado !== "activa") continue;
      ubicar(n, t);
      if (n.pos.z > C.Z_FIN) { soltar(n); n.estado = "fuera"; continue; }
      // Sólo cerca de la plataforma se puede tocar algo.
      if (n.pos.z > C.zGolpe - 2.2 && n.pos.z < C.Z_FALLO + 0.3) {
        const bomba = n.tipo === 3;
        const h = bomba ? { x: C.BOMBA, y: C.BOMBA, z: C.BOMBA } : C.CAJA;
        let hecho = false;
        for (const s of manos) {
          for (const c of contactos(s, n, h)) {
            if (bomba) { tocarBomba(n, ahora); hecho = true; break; }
            if (cortar(n, s, c, ahora)) { hecho = true; break; }
          }
          if (hecho) break;
        }
        if (hecho) continue;
      }
      if (n.tipo !== 3 && n.estado === "activa" && n.pos.z > C.Z_FALLO) {
        n.estado = "fallada";
        M.error("fallo");
        SN.sonar("fallo", 0.6);
        F.cartel(v3(n.pos.x, n.pos.y, C.zGolpe), "FALLO", "#8A90A4", ahora, 0.07);
      }
    }
    // Las falladas siguen de largo hasta perderse atrás.
    for (let i = Math.max(0, sig - R.cubos - R.bombas); i < sig; i++) {
      const n = notas[i];
      if (n.estado !== "fallada" || !n.pieza) continue;
      ubicar(n, t);
      if (n.pos.z > C.Z_FIN) soltar(n);
    }
    cerrarPendientes(ahora);

    for (const w of muros) {
      if (w.estado !== "activa") continue;
      ubicarMuro(w, t);
      if (w.zb > C.Z_FIN + 1) { paredes.soltar(w.pieza); w.pieza = null; w.estado = "fuera"; continue; }
      if (cabeza && cabeza.px > w.x0 + 0.05 && cabeza.px < w.x1 - 0.05 && cabeza.py > w.y0 && cabeza.py < w.y1 && cabeza.pz > w.zb && cabeza.pz < w.zf) {
        M.pared(dt);
        M.avisar("¡PARED!", ahora, 0.3);
        if (ahora - sonidoPared > 0.3) { sonidoPared = ahora; SN.sonar("pared", 0.8); }
      }
    }
  }

  const terminada = (t) => t > fin;
  function limpiar() {
    for (const n of notas) soltar(n);
    for (const w of muros) if (w.pieza) { paredes.soltar(w.pieza); w.pieza = null; }
    cubos.soltarTodo(); bombas.soltarTodo(); paredes.soltarTodo();
    pendientes.length = 0;
    notas = []; muros = []; sig = 0; sigMuro = 0;
  }

  return {
    cargar, actualizar, terminada, limpiar, segmentoCaja,
    get notas() { return notas; }, get muros() { return muros; }, get altura() { return altura; }, get njs() { return njs; },
    get fin() { return fin; }, xCol, yFila,
  };
}]);
