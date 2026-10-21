// Un tiro: sale de la boca del arma, es un rayo (hitscan) y se lo lleva lo
// primero que corta: un enemigo, una de sus esferas, un sólido de las áreas
// montadas (paredes, contenedores, máquinas, las puertas cerradas) o el piso.
// Lo que se ve volar es la trazadora (efectos.js).
(globalThis.__modulos ||= []).push(["juego/disparo", [
  "comun/algebra", "juego/config", "juego/escena", "juego/sonidos", "juego/efectos", "juego/juego", "juego/armas", "juego/enemigos",
], (A, C, E, S, F, J, W, N) => {
  const { v3, suma, resta, por, punto, largo, unitario, rotar, ARRIBA } = A;
  const { ALCANCE } = C;
  const { escenario, solidos } = E;

  function rayoEsfera(o, d, c, r) {
    const f = resta(o, c);
    const bb = 2 * punto(f, d), cc = punto(f, f) - r * r;
    const disc = bb * bb - 4 * cc;
    if (disc < 0) return null;
    const t = (-bb - Math.sqrt(disc)) / 2;
    return t >= 0 ? t : null;
  }
  /** El rayo contra una caja alineada a los ejes (slabs): la distancia y la
   *  normal de la cara por donde entra. */
  function rayoCaja(o, d, b) {
    let t0 = 0, t1 = Infinity, normal = null;
    for (const k of ["x", "y", "z"]) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < b.min[k] || o[k] > b.max[k]) return null;
        continue;
      }
      let a = (b.min[k] - o[k]) / d[k], c = (b.max[k] - o[k]) / d[k];
      let n = -1;
      if (a > c) { const x = a; a = c; c = x; n = 1; }
      if (a > t0) { t0 = a; normal = v3(0, 0, 0); normal[k] = n; }
      t1 = Math.min(t1, c);
      if (t0 > t1) return null;
    }
    return normal ? { t: t0, normal } : null;
  }

  /** Lo primero que corta el rayo. */
  function impacto(o, d) {
    let mejor = { t: ALCANCE, que: null };
    for (const e of N.vivos) {
      const t = rayoEsfera(o, d, e.p, e.m.radio);
      if (t != null && t < mejor.t) mejor = { t, que: "enemigo", e };
    }
    for (const b of N.balas) {
      const t = rayoEsfera(o, d, b.p, 0.12);
      if (t != null && t < mejor.t) mejor = { t, que: "bala", b };
    }
    for (const b of solidos) {
      const c = rayoCaja(o, d, b);
      if (c && c.t < mejor.t) mejor = { t: c.t, que: "solido", b, normal: c.normal };
    }
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t < mejor.t) mejor = { t, que: "suelo" };
    }
    return mejor;
  }

  /** Tirar con el arma `a` apuntada en `pose` ({ p, q }). */
  function disparar(a, pose, ahora) {
    if (!W.puedeTirar(a)) {
      W.gatilloEnVacio(a);
      return false;
    }
    const o = suma(pose.p, rotar(pose.q, a.tipo.boca));
    const d = W.direccion(a, pose.q);
    W.gastar(a);
    J.contarTiro(ahora);
    S.sonar(a.tipo.sonido, 1);

    const mejor = impacto(o, d);
    const h = suma(o, por(d, mejor.t));
    const vol = S.lejos(largo(h));
    let normal = null;

    if (mejor.que === "enemigo") {
      normal = unitario(resta(h, mejor.e.p));
      N.herir(mejor.e, a.tipo.danio || 1, h, ahora);
    } else if (mejor.que === "bala") {
      N.derribarBala(mejor.b, ahora);
    } else if (mejor.que === "solido") {
      F.marcar(escenario, h, mejor.normal, 0.03, "#1A1410");
      normal = mejor.normal;
      S.sonar(mejor.b.material === "madera" ? "polvo" : "metal", vol * 0.6);
    } else if (mejor.que === "suelo") {
      F.marcar(escenario, v3(h.x, 0.005, h.z), ARRIBA, 0.05, "#2A2118");
      normal = ARRIBA;
      F.levantarPolvo(h, ahora);
      S.sonar("polvo", vol * 0.8);
    }

    F.fogonear(o, d, ahora);
    F.lanzarTrazo(o, d, mejor.t, ahora);
    if (normal) F.chispear(h, normal, F.llegada(mejor.t, ahora), mejor.que === "suelo" ? 5 : 8);
    if (!W.puedeTirar(a)) J.ultimo(a.cargador && a.cargador.balas ? "tirá de la corredera" : "sin balas: cambiá el cargador");
    return true;
  }

  return { disparar, impacto };
}]);
