// Los blancos: botellas en un estante a 7 m, latas en un banco a 4 m y placas
// de acero colgadas a 11, 15 y 21 m. Cómo son, cómo reaccionan a un tiro y cómo
// vuelven; qué cuenta como tiro y cuántos puntos da lo decide disparo.js.
(globalThis.__modulos ||= []).push(["tiro/blancos", ["comun/algebra", "tiro/config", "tiro/escena", "tiro/sonidos"], (A, C, E, S) => {
  const { v3, suma, por, largo } = A;
  const { G, BOTELLAS, COLORES_VIDRIO, LATAS, COLORES_LATA, PLACAS, PIVOTE_Y, CADENA } = C;
  const { crear, poner, escenario, solido, GUARDADO, azar, otroAzar } = E;

  // ── Botellas ──────────────────────────────────────────────────────────────
  // El estante: tablón sobre dos caballetes.
  solido({ y: BOTELLAS.y - 0.02, z: BOTELLAS.z, sx: 4.4, sy: 0.04, sz: 0.3, color: "#8A6546" }, "madera");
  for (const s of [-1, 1]) {
    solido({ x: s * 1.9, y: (BOTELLAS.y - 0.04) / 2, z: BOTELLAS.z, sx: 0.08, sy: BOTELLAS.y - 0.04, sz: 0.3, color: "#5A3E2A" }, "madera");
  }
  const botellas = BOTELLAS.xs.map((x, i) => {
    const color = COLORES_VIDRIO[i % COLORES_VIDRIO.length];
    const g = crear("group", { id: "botella_" + i, x, y: BOTELLAS.y, z: BOTELLAS.z }, escenario);
    crear("cylinder", { y: 0.1, sx: BOTELLAS.r * 2, sy: 0.2, sz: BOTELLAS.r * 2, color, touchable: "false" }, g);
    crear("sphere", { y: 0.2, sx: BOTELLAS.r * 2, sy: 0.06, sz: BOTELLAS.r * 2, color, touchable: "false" }, g);
    crear("cylinder", { y: 0.25, sx: 0.028, sy: 0.08, sz: 0.028, color, touchable: "false" }, g);
    crear("cylinder", { y: 0.295, sx: 0.032, sy: 0.012, sz: 0.032, color: "#C9A34A", touchable: "false" }, g);
    // Lo que queda en el estante: el fondo con el borde en picos. Oculto hasta
    // que se rompa; es lo que dice "esta se rompió" y no "esta desapareció".
    const resto = crear("group", { id: "resto_" + i, x, y: BOTELLAS.y, z: BOTELLAS.z, visible: "false" }, escenario);
    crear("cylinder", { y: 0.025, sx: BOTELLAS.r * 2, sy: 0.05, sz: BOTELLAS.r * 2, color, touchable: "false" }, resto);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + i;
      const alto = 0.025 + azar(i * 7 + k) * 0.04;
      crear("box", {
        x: Math.cos(a) * BOTELLAS.r * 0.8, y: 0.05 + alto / 2, z: Math.sin(a) * BOTELLAS.r * 0.8, ry: -a, rz: (azar(i * 7 + k + 50) - 0.5) * 0.5,
        sx: 0.006, sy: alto, sz: 0.028, color, touchable: "false",
      }, resto);
    }
    // El cuello con la tapa: sale volando entero y queda en el pasto.
    const cuello = crear("group", { id: "cuello_" + i, visible: "false" }, escenario);
    crear("cylinder", { sx: 0.028, sy: 0.09, sz: 0.028, color, touchable: "false" }, cuello);
    crear("cylinder", { y: 0.05, sx: 0.032, sy: 0.012, sz: 0.032, color: "#C9A34A", touchable: "false" }, cuello);
    return {
      i, el: g, resto, color, base: v3(x, BOTELLAS.y, BOTELLAS.z), viva: true, vuelve: 0,
      cuello: { el: cuello, vuela: false, p: null, v: null, ang: null, giro: null },
    };
  });
  /** El estallido: una nube del color del vidrio que se abre y se va. */
  const estallidos = BOTELLAS.xs.map(() => ({ el: crear("sphere", { color: "#FFFFFF00", touchable: "false", visible: "false" }, escenario), desde: 0, color: "", paso: -1 }));
  const esquirlas = [];
  for (let i = 0; i < 70; i++) {
    const el = crear("box", { sx: 0.03, sy: 0.004, sz: 0.024, color: "#2E8B57", touchable: "false", visible: "false" }, escenario);
    esquirlas.push({ el, viva: false, p: null, v: null, ang: null, giro: null, hasta: 0 });
  }
  let esquirlaSig = 0;

  function romper(b, dir, ahora) {
    b.viva = false;
    b.vuelve = ahora + 3500;
    b.el.setAttribute("visible", "false");
    const centro = suma(b.base, v3(0, 0.14, 0));
    b.resto.setAttribute("visible", "inherit");

    const x = estallidos[b.i];
    x.desde = ahora;
    x.color = b.color;
    // Con color desde el tiro: esperar al cuadro lo dejaba uno transparente.
    x.paso = 0;
    x.el.setAttribute("color", b.color + "C8");
    x.el.scale = v3(0.08, 0.08, 0.08);
    x.el.position = centro;
    x.el.setAttribute("visible", "inherit");

    const c = b.cuello;
    c.vuela = true;
    c.p = suma(b.base, v3(0, 0.25, 0));
    c.v = suma(por(dir, 1.5), v3((otroAzar() - 0.5) * 1.5, 2.2 + otroAzar(), (otroAzar() - 0.5) * 1.5));
    c.ang = v3(0, 0, 0);
    c.giro = v3(9 + otroAzar() * 6, 3, 5 + otroAzar() * 4);
    c.el.position = c.p;
    c.el.rotation = c.ang;
    c.el.setAttribute("visible", "inherit");

    for (let k = 0; k < 14; k++) {
      const e = esquirlas[esquirlaSig++ % esquirlas.length];
      const a = otroAzar() * Math.PI * 2;
      e.viva = true;
      e.p = suma(centro, v3(0, (otroAzar() - 0.5) * 0.2, 0));
      e.v = suma(por(dir, 1 + otroAzar() * 2), v3(Math.cos(a) * 2.2, 1 + otroAzar() * 2, Math.sin(a) * 2.2));
      e.ang = v3(otroAzar() * 6, otroAzar() * 6, otroAzar() * 6);
      e.giro = v3(8 + otroAzar() * 10, 6 + otroAzar() * 8, 4);
      e.hasta = ahora + 2200 + otroAzar() * 800;
      // De 3 a 7 cm: a 7 m, una esquirla de 3 cm casi no se ve.
      const tam = 0.03 + otroAzar() * 0.04;
      e.el.scale = v3(tam, 0.005, tam * (0.6 + otroAzar() * 0.6));
      e.el.setAttribute("color", b.color);
      e.el.setAttribute("visible", "true");
      e.el.position = e.p;
    }
  }
  function reponerBotella(b) {
    b.viva = true;
    b.el.setAttribute("visible", "inherit");
    b.resto.setAttribute("visible", "false");
    b.cuello.vuela = false;
    b.cuello.el.setAttribute("visible", "false");
    b.cuello.el.position = GUARDADO;
  }

  // ── Latas ─────────────────────────────────────────────────────────────────
  // El banco, más cerca y más bajo que el estante.
  solido({ y: LATAS.y - 0.02, z: LATAS.z, sx: 4.0, sy: 0.04, sz: 0.3, color: "#8A6546" }, "madera");
  for (const s of [-1, 1]) {
    solido({ x: s * 1.8, y: (LATAS.y - 0.04) / 2, z: LATAS.z, sx: 0.08, sy: LATAS.y - 0.04, sz: 0.3, color: "#5A3E2A" }, "madera");
  }
  const latas = LATAS.xs.map((x, i) => {
    const color = COLORES_LATA[i % COLORES_LATA.length];
    const g = crear("group", { id: "lata_" + i }, escenario);
    crear("cylinder", { sx: LATAS.r * 2, sy: LATAS.alto, sz: LATAS.r * 2, color, touchable: "false" }, g);
    crear("cylinder", { sx: LATAS.r * 2 + 0.002, sy: 0.04, sz: LATAS.r * 2 + 0.002, color: "#F4F4F4", touchable: "false" }, g);
    crear("cylinder", { y: LATAS.alto / 2, sx: LATAS.r * 1.8, sy: 0.004, sz: LATAS.r * 1.8, color: "#B8BCC6", touchable: "false" }, g);
    const parada = v3(x, LATAS.y + LATAS.alto / 2, LATAS.z);
    const l = { i, el: g, parada, estado: "parada", p: parada, v: null, giro: v3(0, 0, 0), ang: v3(0, 0, 0), vuelve: 0, piques: 0 };
    poner(g, parada);
    return l;
  });
  function patearLata(l, d) {
    const a = (otroAzar() - 0.5) * 1.4;
    l.estado = "vuela";
    l.piques = 0;
    // Hacia donde iba el tiro, para arriba, y un poco de costado.
    l.v = v3(d.x * 3.2 + a, 2.6 + otroAzar() * 1.4, d.z * 3.2);
    l.giro = v3(-6 - otroAzar() * 8, (otroAzar() - 0.5) * 6, (otroAzar() - 0.5) * 10);
  }
  function reponerLata(l) {
    l.estado = "parada";
    l.p = l.parada;
    l.ang = v3(0, 0, 0);
    poner(l.el, l.p);
    l.el.rotation = l.ang;
  }

  // ── Placas ────────────────────────────────────────────────────────────────
  // Cada una colgada de su pórtico, de dos cadenas: un péndulo alrededor del
  // eje X del pivote.
  const placas = PLACAS.map((d, i) => {
    const piv = v3(d.x, PIVOTE_Y, d.z);
    for (const s of [-1, 1]) {
      solido({ x: d.x + s * (d.r + 0.35), y: PIVOTE_Y / 2, z: d.z, sx: 0.08, sy: PIVOTE_Y + 0.08, sz: 0.08, color: "#4A4F55" }, "metal");
    }
    solido({ x: d.x, y: PIVOTE_Y + 0.04, z: d.z, sx: 2 * (d.r + 0.35) + 0.08, sy: 0.07, sz: 0.07, color: "#4A4F55" }, "metal");
    const g = crear("group", { id: "placa_" + i, x: piv.x, y: piv.y, z: piv.z }, escenario);
    const col = crear("group", { id: "placa_col_" + i }, g);
    for (const s of [-1, 1]) {
      crear("cylinder", { x: s * d.r * 0.55, y: -(CADENA - d.r * 0.8) / 2, sx: 0.012, sy: CADENA - d.r * 0.8, sz: 0.012, color: "#8A8F96", touchable: "false" }, col);
    }
    crear("cylinder", { y: -CADENA, rx: Math.PI / 2, sx: d.r * 2, sy: 0.02, sz: d.r * 2, color: "#9AA3AD", touchable: "false" }, col);
    crear("cylinder", { y: -CADENA, z: 0.012, rx: Math.PI / 2, sx: d.r * 0.7, sy: 0.004, sz: d.r * 0.7, color: "#FF3B30", touchable: "false" }, col);
    return { ...d, i, el: g, col, piv, th: 0, w: 0 };
  });
  /** El centro y la normal de una placa, con su hamaca. Girar θ en X lleva el
   *  centro (0, -L, 0) a (0, -L cos θ, -L sen θ) y la cara (0, 0, 1) a
   *  (0, -sen θ, cos θ): θ positivo es alejarse del tirador. */
  function carasPlaca(pl) {
    const c = Math.cos(pl.th), s = Math.sin(pl.th);
    return { centro: suma(pl.piv, v3(0, -CADENA * c, -CADENA * s)), normal: v3(0, -s, c) };
  }
  /** Un tiro empuja la placa hacia atrás. */
  function empujarPlaca(pl) { pl.w += 2.6; }

  function reponerTodo() {
    for (const b of botellas) reponerBotella(b);
    for (const l of latas) reponerLata(l);
  }

  // ── El cuadro ─────────────────────────────────────────────────────────────
  function animar(t, dt) {
    // Las botellas rotas vuelven.
    for (const b of botellas) if (!b.viva && t >= b.vuelve) reponerBotella(b);

    // Las latas vuelan, pican y vuelven al banco.
    for (const l of latas) {
      if (l.estado === "vuela" && dt > 0) {
        l.v = v3(l.v.x, l.v.y - G * dt, l.v.z);
        l.p = suma(l.p, por(l.v, dt));
        l.ang = suma(l.ang, por(l.giro, dt));
        if (l.p.y <= LATAS.r && l.v.y < 0) {
          // Pica, cada vez menos, y se queda acostada.
          l.p = v3(l.p.x, LATAS.r, l.p.z);
          l.piques++;
          if (l.piques === 1) S.sonar("lata", S.lejos(largo(l.p)) * 0.35);
          if (l.piques >= 3 || Math.abs(l.v.y) < 1) {
            l.estado = "caida";
            l.vuelve = t + 2500;
            l.ang = v3(Math.PI / 2, l.ang.y, 0);
          } else {
            l.v = v3(l.v.x * 0.5, -l.v.y * 0.35, l.v.z * 0.5);
            l.giro = por(l.giro, 0.5);
          }
        }
        l.el.position = l.p;
        l.el.rotation = l.ang;
      } else if (l.estado === "caida" && t >= l.vuelve) {
        reponerLata(l);
      }
    }

    // Las placas se hamacan.
    if (dt > 0) {
      for (const pl of placas) {
        if (!pl.w && !pl.th) continue;
        pl.w += (-(G / CADENA) * Math.sin(pl.th) - 1.1 * pl.w) * dt;
        pl.th += pl.w * dt;
        if (Math.abs(pl.w) < 1e-3 && Math.abs(pl.th) < 1e-3) { pl.w = 0; pl.th = 0; }
        pl.col.rotation = v3(pl.th, 0, 0);
      }
    }

    // El estallido de cada botella: se abre y se desvanece en 300 ms.
    for (const x of estallidos) {
      if (!x.desde) continue;
      const k = (t - x.desde) / 300;
      if (k >= 1) { x.desde = 0; x.el.setAttribute("visible", "false"); x.el.position = GUARDADO; continue; }
      const tam = 0.08 + 0.4 * k;
      x.el.scale = v3(tam, tam, tam);
      const paso = Math.floor(k * 6);
      if (paso !== x.paso) {
        x.paso = paso;
        x.el.setAttribute("color", x.color + Math.round(200 * (1 - paso / 6)).toString(16).padStart(2, "0"));
      }
    }

    // Los cuellos: vuelan, pican una vez y quedan acostados hasta que vuelve la botella.
    if (dt > 0) {
      for (const b of botellas) {
        const c = b.cuello;
        if (!c.vuela) continue;
        c.v = v3(c.v.x, c.v.y - G * dt, c.v.z);
        c.p = suma(c.p, por(c.v, dt));
        c.ang = suma(c.ang, por(c.giro, dt));
        if (c.p.y <= 0.016 && c.v.y < 0) {
          c.p = v3(c.p.x, 0.016, c.p.z);
          if (Math.abs(c.v.y) < 1.5) {
            c.vuela = false;
            c.ang = v3(0, c.ang.y, Math.PI / 2);
          } else {
            c.v = v3(c.v.x * 0.4, -c.v.y * 0.3, c.v.z * 0.4);
            c.giro = por(c.giro, 0.4);
          }
        }
        c.el.position = c.p;
        c.el.rotation = c.ang;
      }
    }

    // Esquirlas: vuelan, caen y se quedan en el pasto hasta desaparecer.
    for (const e of esquirlas) {
      if (!e.viva) continue;
      if (t >= e.hasta) { e.viva = false; e.el.setAttribute("visible", "false"); e.el.position = GUARDADO; continue; }
      if (dt > 0 && e.p.y > 0.01) {
        e.v = v3(e.v.x, e.v.y - G * dt, e.v.z);
        e.p = suma(e.p, por(e.v, dt));
        e.ang = suma(e.ang, por(e.giro, dt));
        if (e.p.y <= 0.01) e.p = v3(e.p.x, 0.01, e.p.z);
        e.el.position = e.p;
        e.el.rotation = e.ang;
      }
    }
  }

  return { botellas, latas, placas, romper, patearLata, carasPlaca, empujarPlaca, reponerTodo, animar };
}]);
