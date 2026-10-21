// Lo que queda de un corte: las dos mitades del cubo que se separan por el
// plano del sable y caen girando, las chispas, y el cartel con los puntos.
(globalThis.__modulos ||= []).push(["sables/efectos", ["comun/algebra", "sables/config", "sables/escena"], (A, C, E) => {
  const { v3, suma, por, unitario, cruz, qEjeY, qMul, qNormal, qEnX, qEnZ } = A;
  const R = C.reservas;
  // Las mitades van de a pares (m3a, m3b): se reservan juntas.
  const pares = [];
  for (let i = 0; i < R.mitades; i++) pares.push({ i, a: E.byId("m" + i + "a"), b: E.byId("m" + i + "b"), ca: E.byId("m" + i + "a_c"), cb: E.byId("m" + i + "b_c"), libre: true });
  for (const p of pares) { E.ver(p.a, false); E.ver(p.b, false); }
  const chispas = E.reserva("c", R.chispas);
  const carteles = E.reserva("p", R.carteles);
  const vivas = [];   // { tipo, pieza, t0, vida, ... }

  /** Cortar el cubo en `centro` por el plano que barrió la hoja:
   *  `normal` es perpendicular a ese plano. `vel` es la del cubo. */
  function partir(centro, normal, color, velCubo, ahora) {
    const par = pares.find((p) => p.libre);
    if (par) {
      par.libre = false;
      const n = unitario(normal);
      // Cada mitad mira con su +Y hacia su lado del corte.
      const qa = qEjeY(n), qb = qEjeY(por(n, -1));
      E.attr(par.ca, "color", color); E.attr(par.cb, "color", color);
      E.ver(par.a, true); E.ver(par.b, true);
      const giro = unitario(cruz(n, v3(0, 0, 1)));
      vivas.push({ tipo: "mitad", par, el: par.a, p: suma(centro, por(n, 0.02)), v: suma(por(velCubo, 0.12), por(n, 1.3)), q: qa, giro, w: 6, t0: ahora, vida: 0.7 });
      vivas.push({ tipo: "mitad", par, el: par.b, p: suma(centro, por(n, -0.02)), v: suma(por(velCubo, 0.12), por(n, -1.3)), q: qb, giro: por(giro, -1), w: 6, t0: ahora, vida: 0.7, segunda: true });
    }
  }

  function chispazo(p, dir, color, ahora, cuantas = 8) {
    for (let k = 0; k < cuantas; k++) {
      const c = chispas.tomar();
      if (!c) return;
      const a = (k / cuantas) * Math.PI * 2 + Math.random() * 0.6;
      const lado = unitario(cruz(dir, v3(0, 0, 1)));
      const v = suma(suma(por(dir, 1.5 + Math.random() * 2), por(lado, Math.cos(a) * 1.8)), v3(0, Math.sin(a) * 1.8 + 0.6, (Math.random() - 0.3) * 1.5));
      E.attr(c.el, "color", k % 2 ? "#FFFFFF" : color);
      E.ver(c.el, true);
      vivas.push({ tipo: "chispa", pieza: c, el: c.el, p, v, t0: ahora, vida: 0.25 + Math.random() * 0.2 });
    }
  }

  function cartel(p, texto, color, ahora, size = 0.09) {
    const c = carteles.tomar();
    if (!c) return;
    E.attr(c.el, "value", texto); E.attr(c.el, "color", color); E.attr(c.el, "size", size);
    E.ver(c.el, true);
    vivas.push({ tipo: "cartel", pieza: c, el: c.el, p: v3(p.x, p.y + 0.3, p.z), v: v3(0, 0.5, 0.6), t0: ahora, vida: 0.8 });
  }

  function animar(ahora, dt) {
    for (let i = vivas.length - 1; i >= 0; i--) {
      const x = vivas[i], u = (ahora - x.t0) / x.vida;
      if (u >= 1) {
        if (x.tipo === "mitad") { E.ver(x.el, false); if (x.segunda) x.par.libre = true; }
        else if (x.tipo === "chispa") chispas.soltar(x.pieza);
        else carteles.soltar(x.pieza);
        vivas.splice(i, 1);
        continue;
      }
      x.p = suma(x.p, por(x.v, dt));
      if (x.tipo === "mitad") {
        x.v = suma(x.v, v3(0, -9 * dt, 0));
        x.q = qNormal(qMul(qMul(qEnX(x.giro.x * x.w * dt), qEnZ(x.giro.z * x.w * dt)), x.q));
        E.poner(x.el, x.p, x.q);
        const k = 1 - u * u;
        x.el.scale = { x: k, y: k, z: k };
      } else if (x.tipo === "chispa") {
        x.v = suma(x.v, v3(0, -6 * dt, 0));
        E.poner(x.el, x.p, qEjeY(x.v));
      } else {
        E.poner(x.el, x.p);
      }
    }
  }
  function limpiar() {
    for (const x of vivas) { E.ver(x.el, false); if (x.par) x.par.libre = true; }
    vivas.length = 0;
    chispas.soltarTodo(); carteles.soltarTodo();
  }

  return { partir, chispazo, cartel, animar, limpiar, vivas };
}]);
