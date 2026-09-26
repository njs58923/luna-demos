// Un tiro: sale de la boca del arma, es un rayo (hitscan) y se lo lleva lo
// primero que corta. A esta distancia una bala de verdad llega en menos de un
// cuadro, así que no vuela; lo que se ve volar es la trazadora (efectos.js).
(globalThis.__modulos ||= []).push(["tiro/disparo", [
  "comun/algebra", "tiro/config", "tiro/escena", "tiro/sonidos", "tiro/blancos", "tiro/efectos", "tiro/juego", "tiro/armas",
], (A, C, E, S, B, F, J, W) => {
  const { v3, suma, resta, por, punto, largo, unitario, rotar, ARRIBA } = A;
  const { ALCANCE, BOTELLAS, LATAS } = C;
  const { escenario, solidos } = E;

  // ── Rayos ─────────────────────────────────────────────────────────────────
  /** El rayo o + t·d contra un cilindro vertical de base `b`. */
  function rayoCilindro(o, d, b, r, alto) {
    const fx = o.x - b.x, fz = o.z - b.z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return null;
    const bb = 2 * (fx * d.x + fz * d.z), c = fx * fx + fz * fz - r * r;
    const disc = bb * bb - 4 * a * c;
    if (disc < 0) return null;
    const t = (-bb - Math.sqrt(disc)) / (2 * a);
    if (t < 0) return null;
    const y = o.y + d.y * t;
    return y >= b.y && y <= b.y + alto ? t : null;
  }
  function rayoEsfera(o, d, c, r) {
    const f = resta(o, c);
    const bb = 2 * punto(f, d), cc = punto(f, f) - r * r;
    const disc = bb * bb - 4 * cc;
    if (disc < 0) return null;
    const t = (-bb - Math.sqrt(disc)) / 2;
    return t >= 0 ? t : null;
  }
  function rayoPlaca(o, d, pl) {
    const { centro, normal } = B.carasPlaca(pl);
    const den = punto(normal, d);
    if (Math.abs(den) < 1e-6) return null;
    const t = punto(normal, resta(centro, o)) / den;
    if (t < 0) return null;
    return largo(resta(suma(o, por(d, t)), centro)) <= pl.r ? t : null;
  }
  /** El rayo contra una caja alineada a los ejes (slabs). Devuelve la
   *  distancia y la normal de la cara por donde entra. */
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
    return normal ? { t: t0, normal } : null;   // sin normal: la boca está adentro
  }

  /** Lo primero que corta el rayo. */
  function impacto(o, d) {
    let mejor = { t: ALCANCE, que: null };
    for (const b of B.botellas) {
      if (!b.viva) continue;
      const t = rayoCilindro(o, d, b.base, BOTELLAS.r + 0.008, BOTELLAS.alto);
      if (t != null && t < mejor.t) mejor = { t, que: "botella", b };
    }
    for (const l of B.latas) {
      let t = null;
      if (l.estado === "parada") t = rayoCilindro(o, d, v3(l.p.x, l.p.y - LATAS.alto / 2, l.p.z), LATAS.r + 0.008, LATAS.alto);
      else if (l.estado === "vuela") t = rayoEsfera(o, d, l.p, 0.09);
      if (t != null && t < mejor.t) mejor = { t, que: "lata", l };
    }
    for (const pl of B.placas) {
      const t = rayoPlaca(o, d, pl);
      if (t != null && t < mejor.t) mejor = { t, que: "placa", pl };
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

  /** Tirar con el arma `a` apuntada en `pose` ({ p, q }). Devuelve false si no
   *  salió nada: sin bala en la recámara, o con el cerrojo sin montar. */
  function disparar(a, pose, ahora) {
    if (!W.puedeTirar(a)) {
      W.gatilloEnVacio(a);
      return false;
    }
    const o = suma(pose.p, rotar(pose.q, a.tipo.boca));
    // La dirección antes de gastar: el tiro que abre la ráfaga sale exacto.
    const d = W.direccion(a, pose.q);
    W.gastar(a);
    J.contarTiro(ahora);
    S.sonar(a.tipo.sonido, 1);

    const mejor = impacto(o, d);
    const h = suma(o, por(d, mejor.t));
    const vol = S.lejos(largo(h));
    let normal = null;

    if (mejor.que === "botella") {
      B.romper(mejor.b, d, ahora);
      S.sonar("vidrio", vol);
      J.sumar(BOTELLAS.puntos);
      F.avisar(h, "+" + BOTELLAS.puntos, "#40E0D0", ahora);
      J.ultimo("¡botella! +" + BOTELLAS.puntos);
    } else if (mejor.que === "lata") {
      const l = mejor.l;
      const enElAire = l.estado === "vuela";
      const pts = enElAire ? LATAS.aire : LATAS.puntos;
      // Parada no está girada: el punto en su marco es la resta. En el aire se
      // la deja sin marca: gira, y el agujero importa poco a esa altura.
      if (!enElAire) {
        const local = resta(h, l.p);
        F.marcar(l.el, local, unitario(v3(local.x, 0, local.z)), 0.018, "#141414");
      }
      normal = unitario(v3(h.x - l.p.x, 0, h.z - l.p.z));
      B.patearLata(l, d);
      S.sonar("lata", vol);
      J.sumar(pts);
      F.avisar(h, "+" + pts, enElAire ? "#FFD60A" : "#FFFFFF", ahora);
      J.ultimo(enElAire ? "¡en el aire! +" + pts : "lata +" + pts);
    } else if (mejor.que === "placa") {
      const pl = mejor.pl;
      // En el marco de la columna que se hamaca: deshacer el giro θ en X. La
      // cara de la placa está en z = 0,01; la marca, apenas delante del punto rojo.
      const r = resta(h, pl.piv), c = Math.cos(pl.th), sn = Math.sin(pl.th);
      F.marcar(pl.col, v3(r.x, r.y * c + r.z * sn, 0.0145), v3(0, 0, 1), 0.026, "#26262B");
      normal = B.carasPlaca(pl).normal;
      if (punto(normal, d) > 0) normal = por(normal, -1);
      B.empujarPlaca(pl);
      S.sonar("placa", vol);
      J.sumar(pl.puntos);
      F.avisar(h, "+" + pl.puntos, pl.puntos >= 10 ? "#FFD60A" : "#FFFFFF", ahora);
      J.ultimo("placa a " + Math.round(-pl.z) + " m +" + pl.puntos);
    } else if (mejor.que === "solido") {
      const metal = mejor.b.material === "metal";
      F.marcar(escenario, h, mejor.normal, 0.024, "#1A1410");
      normal = mejor.normal;
      S.sonar(metal ? "placa" : "madera", vol * (metal ? 0.35 : 0.9));
      J.ultimo(metal ? "al pórtico" : "a la madera");
    } else if (mejor.que === "suelo") {
      // La tarima está 4 cm arriba del suelo; el pasto, 2 cm abajo.
      const piso = Math.hypot(h.x, h.z) < 3.5 ? 0.04 : -0.02;
      F.marcar(escenario, v3(h.x, piso, h.z), ARRIBA, 0.05, "#2A2118");
      normal = ARRIBA;
      F.levantarPolvo(h, ahora);
      S.sonar("polvo", vol * 0.8);
      J.ultimo("al piso");
    } else {
      J.ultimo("al aire");
    }

    // El fogonazo, un instante; la trazadora, hasta donde pegó; las chispas,
    // cuando llega.
    F.fogonear(o, d, ahora);
    F.lanzarTrazo(o, d, mejor.t, ahora);
    if (normal) F.chispear(h, normal, F.llegada(mejor.t, ahora), mejor.que === "suelo" ? 5 : 8);

    if (!W.puedeTirar(a)) J.ultimo(a.cargador && a.cargador.balas ? "tirá de la corredera" : "sin balas: cambiá el cargador");
    return true;
  }

  return { disparar, impacto };
}]);
