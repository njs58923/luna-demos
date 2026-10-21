// Los enemigos: drones y robots que se mueven, disparan esferas lentas al
// jugador y caen a tiros.
//
// Cada área trae su lista (datos.js): el tipo y cómo se mueve. Nacen cuando el
// área se monta (quietos y sin disparar) y se activan cuando el jugador entra;
// al desmontarse el área se van con ella. El modelo de cada tipo lo mide el
// servidor: `escala` lo lleva a su tamaño y `centro` pone el medio de su caja
// en el origen del nodo, que es el que se mueve; `radio` es el de la esfera
// contra la que pega el tiro.
//
// Movimientos (`mov.tipo`):
//   ronda    va y viene entre `a` y `b`
//   orbita   da vueltas alrededor de `c`, a radio `r`
//   ocho     un ocho acostado alrededor de `c`, de ancho `r`
//   asoma    detrás de una cobertura: sale de `a` a `b`, se queda y vuelve
//   acecha   se acerca al jugador hasta `dist` y lo rodea (el jefe)
//
// Todos miran hacia donde van, o al jugador si están disparando.
(globalThis.__modulos ||= []).push(["juego/enemigos", [
  "comun/algebra", "juego/config", "juego/escena", "juego/sonidos", "juego/efectos", "juego/juego", "juego/cuerpo",
], (A, C, E, S, F, J, P) => {
  const { v3, suma, resta, por, largo, unitario, qMirando, ARRIBA } = A;
  const { crear, poner, escenario, BASE, otroAzar } = E;

  /** Cada tipo: vida (en golpes de G17), puntos, velocidad (m/s), cada
   *  cuánto dispara (s) y a qué velocidad va su esfera (m/s). */
  const TIPOS = {
    dron: { vida: 2, puntos: 100, vel: 1.6, cadencia: 3.2, bala: 4.0, color: "#FF5A36" },
    dron_k07: { vida: 3, puntos: 150, vel: 2.2, cadencia: 2.6, bala: 4.5, color: "#FF3B6B" },
    arana: { vida: 2, puntos: 120, vel: 1.2, cadencia: 3.8, bala: 3.5, color: "#FFB020" },
    robot: { vida: 4, puntos: 200, vel: 0.8, cadencia: 3.0, bala: 3.8, color: "#FF8A1E" },
    centinela: { vida: 6, puntos: 300, vel: 0.6, cadencia: 2.2, bala: 4.2, color: "#FF2D2D" },
    jefe: { vida: 30, puntos: 2000, vel: 1.0, cadencia: 1.1, bala: 5.0, color: "#FF1E56" },
  };
  /** Los modelos, medidos por el servidor: { archivo, escala, centro, radio, clip }. */
  let MODELOS = {};
  const conModelos = (m) => { MODELOS = m; };

  const vivos = [];
  const balas = [];
  let cuenta = 0;

  /** Nace un enemigo del área `area` (su id) en `mundo` ({ x, y, z }, ya en
   *  mundo). `def` = { tipo, mov: { tipo, ... en mundo } }. */
  function nacer(area, def) {
    const t = TIPOS[def.tipo], m = MODELOS[def.tipo];
    if (!t || !m) return null;
    const id = "enemigo_" + ++cuenta;
    const el = crear("group", { id }, escenario);
    // El modelo, centrado y a escala: el nodo de arriba es el que se mueve.
    const cuerpo = crear("group", { s: m.escala }, el);
    crear("model", {
      src: BASE + "/modelos/" + m.archivo, touchable: "false",
      x: -m.centro.x, y: -m.centro.y, z: -m.centro.z,
      ...(m.clip != null ? { "animation-clip": String(m.clip), "animation-loop": "true" } : {}),
    }, cuerpo);
    // El ojo: una luz que parpadea al cargar un disparo.
    const ojo = crear("sphere", { sx: 0.07, sy: 0.07, sz: 0.07, y: m.radio * 0.2, z: -m.radio * 0.7, color: t.color, "material-unlit": "true", touchable: "false" }, el);
    const p0 = inicio(def.mov);
    const e = {
      id, area, def, tipo: def.tipo, t, m, el, ojo, cuerpo,
      p: p0, frente: v3(0, 0, -1), vida: t.vida, activo: false,
      fase: otroAzar() * Math.PI * 2, reloj: 0, proximoTiro: 1.5 + otroAzar() * t.cadencia,
      golpeado: 0,
    };
    poner(el, e.p);
    vivos.push(e);
    return e;
  }

  function inicio(mov) {
    switch (mov.tipo) {
      case "ronda": case "asoma": return { ...mov.a };
      case "orbita": case "ocho": return v3(mov.c.x + mov.r, mov.c.y, mov.c.z);
      default: return { ...(mov.p || mov.c) };
    }
  }

  /** Dónde tiene que estar `e` en el instante `s` (s desde que se activó). */
  function trayecto(e, s, dt) {
    const mov = e.def.mov, v = e.t.vel;
    switch (mov.tipo) {
      case "ronda": {
        const L = largo(resta(mov.b, mov.a)) || 1;
        const u = ((s * v) / L + e.fase / Math.PI) % 2;
        const k = u < 1 ? u : 2 - u;
        const suave = k * k * (3 - 2 * k);
        return suma(mov.a, por(resta(mov.b, mov.a), suave));
      }
      case "orbita": {
        const w = v / mov.r, a = e.fase + s * w;
        return v3(mov.c.x + Math.cos(a) * mov.r, mov.c.y + Math.sin(s * 1.3) * 0.25, mov.c.z + Math.sin(a) * mov.r);
      }
      case "ocho": {
        const w = v / mov.r, a = e.fase + s * w;
        return v3(mov.c.x + Math.sin(a) * mov.r, mov.c.y + Math.sin(a * 2) * 0.35, mov.c.z + Math.sin(a * 2) * mov.r * 0.4);
      }
      case "asoma": {
        // 2 s escondido, sale, 2,5 s afuera, vuelve.
        const L = largo(resta(mov.b, mov.a)) || 1, ida = L / v;
        const ciclo = 4.5 + 2 * ida, u = (s + e.fase) % ciclo;
        let k = 0;
        if (u < 2) k = 0; else if (u < 2 + ida) k = (u - 2) / ida; else if (u < 4.5 + ida) k = 1; else k = 1 - (u - 4.5 - ida) / ida;
        return suma(mov.a, por(resta(mov.b, mov.a), k));
      }
      case "acecha": {
        // Hacia el jugador hasta `dist`, y ahí de costado.
        const j = v3(P.cabeza.x, mov.c.y, P.cabeza.z);
        const d = resta(j, e.p), l = Math.hypot(d.x, d.z) || 1;
        const hacia = v3(d.x / l, 0, d.z / l);
        const costado = v3(-hacia.z, 0, hacia.x);
        let paso = por(costado, Math.sin(s * 0.7 + e.fase) * v);
        if (l > mov.dist) paso = suma(paso, por(hacia, v));
        else if (l < mov.dist - 1.5) paso = suma(paso, por(hacia, -v));
        const p = suma(e.p, por(paso, dt));
        // Sin salir de su área.
        p.x = Math.max(mov.min.x, Math.min(mov.max.x, p.x));
        p.z = Math.max(mov.min.z, Math.min(mov.max.z, p.z));
        p.y = mov.c.y + Math.sin(s * 1.1) * 0.4;
        return p;
      }
    }
    return e.p;
  }

  /** Un golpe de `danio` a `e`, en el punto `h`. Devuelve true si cayó. */
  function herir(e, danio, h, ahora) {
    if (e.vida <= 0) return false;
    e.vida -= danio;
    e.golpeado = 0.12;
    S.sonar("impacto", S.lejos(largo(resta(h, P.cabeza))));
    if (e.vida > 0) return false;
    morir(e, ahora);
    return true;
  }

  function morir(e, ahora) {
    const i = vivos.indexOf(e);
    if (i >= 0) vivos.splice(i, 1);
    F.explotar(e.p, e.m.radio, ahora);
    S.sonar("explosion", S.lejos(largo(resta(e.p, P.cabeza))));
    J.sumar(e.t.puntos);
    J.ultimo(nombres[e.tipo] + " abajo  +" + e.t.puntos);
    e.el.remove();
  }
  const nombres = { dron: "dron", dron_k07: "dron K07", arana: "araña", robot: "robot", centinela: "centinela", jefe: "¡EL MECH!" };

  /** Sacar los de un área (se desmontó): sin explosión ni puntos. */
  function quitarArea(area) {
    for (const e of vivos.slice()) if (e.area === area) { vivos.splice(vivos.indexOf(e), 1); e.el.remove(); }
    for (const b of balas.slice()) if (b.area === area) quitarBala(b);
  }
  function activarArea(area) { for (const e of vivos) if (e.area === area) e.activo = true; }
  const quedan = (area) => vivos.filter((e) => e.area === area).length;

  // ── Las balas enemigas ────────────────────────────────────────────────────
  /** Una esfera que brilla y va derecho a donde estaba la cabeza al salir. Se
   *  puede esquivar, y se puede derribar de un tiro (+10). */
  function disparar(e) {
    const o = suma(e.p, por(e.frente, e.m.radio * 0.8));
    const d = unitario(resta(P.cabeza, o));
    const el = crear("sphere", { class: "bala_enemiga", sx: 0.14, sy: 0.14, sz: 0.14, color: e.t.color, "material-unlit": "true", touchable: "false" }, escenario);
    const b = { el, p: o, v: por(d, e.t.bala), area: e.area, vida: 8 };
    poner(el, o);
    balas.push(b);
    S.sonar("carga", S.lejos(largo(resta(o, P.cabeza))) * 0.8);
  }
  function quitarBala(b) { const i = balas.indexOf(b); if (i >= 0) balas.splice(i, 1); b.el.remove(); }
  /** Un tiro que le pega a una bala enemiga. */
  function derribarBala(b, ahora) {
    F.explotar(b.p, 0.12, ahora);
    J.sumar(10);
    J.ultimo("¡esfera derribada! +10");
    quitarBala(b);
  }

  function animar(t, dt) {
    for (const e of vivos) {
      if (!e.activo) continue;
      e.reloj += dt;
      const antes = e.p;
      e.p = trayecto(e, e.reloj, dt);
      const mov = resta(e.p, antes);
      const hacia = resta(P.cabeza, e.p);
      const cerca = largo(hacia) < 22;
      // Mira al jugador cuando está por disparar; si no, hacia donde va.
      const cargando = e.proximoTiro - e.reloj < 0.7;
      if (cargando && cerca) e.frente = unitario(v3(hacia.x, 0, hacia.z));
      else if (Math.hypot(mov.x, mov.z) > 1e-4) e.frente = unitario(v3(mov.x, 0, mov.z));
      poner(e.el, e.p, qMirando(e.frente, ARRIBA));
      e.ojo.setAttribute("color", e.golpeado > 0 ? "#FFFFFF" : cargando && cerca && Math.floor(e.reloj * 12) % 2 ? "#FFFFFF" : e.t.color);
      e.golpeado = Math.max(0, e.golpeado - dt);
      if (e.reloj >= e.proximoTiro) {
        e.proximoTiro = e.reloj + e.t.cadencia * (0.8 + otroAzar() * 0.4);
        if (cerca) disparar(e);
      }
    }
    for (const b of balas.slice()) {
      b.vida -= dt;
      b.p = suma(b.p, por(b.v, dt));
      poner(b.el, b.p);
      if (largo(resta(b.p, P.cabeza)) < 0.22) { quitarBala(b); J.golpe(); continue; }
      if (b.vida <= 0 || b.p.y < 0) quitarBala(b);
    }
  }

  return { TIPOS, conModelos, vivos, balas, nacer, herir, quitarArea, activarArea, quedan, derribarBala, animar };
}]);
