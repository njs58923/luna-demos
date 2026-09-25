// _obra.js — piezas de construcción: paredes, pisos, aberturas, techos,
// escaleras, árboles y cercos.
//
// No dibuja nada: cada función devuelve una lista de nodos como datos,
// { t: "box", a: { x, y, sx, color, … }, h: [hijos] }. Así la misma pared sale
// de dos lados:
//
//   - en un objeto de la calle (/objetos/pared.js), que la arma con
//     Obra.construir(nodos, padre, Obj.crear) y la rehace cuando cambian las
//     props;
//   - en el servidor (src/calle.ts), que la escribe como HSML con Obra.aHsml()
//     para las fachadas, las veredas y la plaza, sin un isolate por pieza.
//
// El servidor lo antepone a los scripts de objeto igual que _base.js
// (/objetos/x.js = _base.js + _vr.js + _obra.js + x.js). No usa `Obj`: tiene
// que correr también en bun, sin motor.
//
// Convenciones: metros; y arriba; el frente de cada pieza mira a +Z; el origen
// está en el piso, en el medio del frente (las escaleras suben hacia -Z).
const Obra = (() => {
  const PI = Math.PI;

  // ── Utilidades ──────────────────────────────────────────────────────────
  const nodo = (t, a, h) => (h && h.length ? { t, a, h } : { t, a });
  const caja = (a) => nodo("box", Object.assign({ touchable: "false" }, a));
  const cil = (a) => nodo("cylinder", Object.assign({ touchable: "false" }, a));
  const esfera = (a) => nodo("sphere", Object.assign({ touchable: "false" }, a));
  const grupo = (a, h) => nodo("group", a || {}, h);

  /** Azar con semilla (mulberry32): la misma semilla, el mismo árbol. */
  function azar(semilla) {
    let s = (Math.floor(Number(semilla) || 1) * 2654435761) >>> 0 || 1;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const entre = (r, a, b) => a + (b - a) * r();

  function rgb(hex) {
    let h = String(hex || "#000000").replace("#", "");
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const v = parseInt(h.slice(0, 6), 16) || 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  /** k > 0 aclara hacia el blanco, k < 0 oscurece hacia el negro (como Obj.tono). */
  function tono(color, k) {
    const [r, g, b] = rgb(color);
    if (k >= 0) return "#" + hex2(r + (255 - r) * k) + hex2(g + (255 - g) * k) + hex2(b + (255 - b) * k);
    return "#" + hex2(r * (1 + k)) + hex2(g * (1 + k)) + hex2(b * (1 + k));
  }
  function mezcla(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return "#" + hex2(x[0] + (y[0] - x[0]) * t) + hex2(x[1] + (y[1] - x[1]) * t) + hex2(x[2] + (y[2] - x[2]) * t);
  }
  const color = (c, d) => (typeof c === "string" && /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c) ? c : d);
  const num = (v, d, min, max) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : d;
  };
  const elegir = (v, opciones, d) => (opciones.includes(v) ? v : d);

  /** Un triángulo de base `base` (sobre el eje del plano) y alto `alto`. No hay
   *  primitiva de triángulo: es un cuadrado girado 45° adentro de un grupo
   *  escalado, o sea un rombo, con la mitad de abajo enterrada en lo que lo
   *  sostiene (la pared de un hastial, el cordón de una reja). `plano` "xy" lo
   *  para de frente; "zy", de costado. */
  function triangulo(o) {
    const L = Math.SQRT1_2;
    const rombo = o.plano === "zy"
      ? caja({ rx: PI / 4, sx: 1, sy: L, sz: L, color: o.color })
      : caja({ rz: PI / 4, sx: L, sy: L, sz: 1, color: o.color });
    const esc = o.plano === "zy" ? { sx: o.espesor, sy: 2 * o.alto, sz: o.base } : { sx: o.base, sy: 2 * o.alto, sz: o.espesor };
    return grupo(Object.assign({ x: o.x || 0, y: o.y || 0, z: o.z || 0 }, esc), [rombo]);
  }

  /** Un triángulo rectángulo parado de costado (plano zy): el cateto vertical
   *  de `alto` en z=`desde` y la punta en z=`hasta`, apoyado en y=0. Es la
   *  mitad de arriba de un paralelogramo (la de abajo queda enterrada), y un
   *  paralelogramo es un cuadrado deformado: rotación · escala · rotación, que
   *  es la descomposición en valores singulares de la deformación. */
  function cuna(o) {
    const d = o.hasta - o.desde, A = o.alto;
    // La deformación en (y, z), aplicada al cuadrado unidad (v, u).
    const a = A, b = d >= 0 ? -A : A, c = 0, e = Math.abs(d);
    const E = (a + e) / 2, F = (a - e) / 2, G = (c + b) / 2, H = (c - b) / 2;
    const Q = Math.hypot(E, H), R = Math.hypot(F, G);
    const a1 = Math.atan2(G, F), a2 = Math.atan2(H, E);
    const giro1 = (a2 + a1) / 2, giro2 = (a2 - a1) / 2;
    const cuadrado = caja({ rx: giro2, sx: 1, sy: 1, sz: 1, color: o.color });
    const escala = grupo({ sx: o.espesor, sy: Q + R, sz: Q - R }, [cuadrado]);
    return grupo({ x: o.x || 0, y: o.y || 0, z: (o.desde + o.hasta) / 2, rx: giro1 }, [escala]);
  }

  // ── Paredes ─────────────────────────────────────────────────────────────
  //
  // Una pared es su cuerpo —cajas que rodean los huecos— y un dibujo sobre la
  // cara de adelante (y la de atrás si `caras` es 2): ladrillos, piedras,
  // tablas, azulejos o placas de hormigón, recortados contra los huecos. Los
  // huecos se dan en coordenadas de la pared: x del centro, y del borde de abajo.
  const MATERIALES = {
    ladrillo: { base: "#A5553A", junta: "#CFC5B4" },
    revoque: { base: "#E6D8C0", junta: "#C9B99E" },
    piedra: { base: "#9C958B", junta: "#6E6961" },
    madera: { base: "#9A6A40", junta: "#6B4A2C" },
    azulejo: { base: "#E4ECF0", junta: "#B5C0C8" },
    hormigon: { base: "#A8A7A1", junta: "#8C8B85" },
  };

  /** Los rectángulos macizos de un rectángulo con huecos: se corta en franjas
   *  verticales por los bordes de los huecos, y cada franja se parte en y. */
  function macizos(x0, x1, y0, y1, huecos) {
    const cortes = [x0, x1];
    for (const h of huecos) cortes.push(Math.max(x0, Math.min(x1, h.x0)), Math.max(x0, Math.min(x1, h.x1)));
    const xs = [...new Set(cortes)].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = xs[i], b = xs[i + 1];
      if (b - a < 1e-4) continue;
      const m = (a + b) / 2;
      const tapan = huecos.filter((h) => h.x0 < m && h.x1 > m).map((h) => [Math.max(y0, h.y0), Math.min(y1, h.y1)]).sort((p, q) => p[0] - q[0]);
      let y = y0;
      for (const [ha, hb] of tapan) {
        if (ha - y > 1e-4) out.push({ x0: a, x1: b, y0: y, y1: ha });
        y = Math.max(y, hb);
      }
      if (y1 - y > 1e-4) out.push({ x0: a, x1: b, y0: y, y1 });
    }
    return out;
  }

  /** Un rectángulo recortado contra los macizos: los pedazos que quedan. */
  function recortar(r, solidos) {
    const out = [];
    for (const s of solidos) {
      const x0 = Math.max(r.x0, s.x0), x1 = Math.min(r.x1, s.x1);
      const y0 = Math.max(r.y0, s.y0), y1 = Math.min(r.y1, s.y1);
      if (x1 - x0 > 0.015 && y1 - y0 > 0.015) out.push({ x0, x1, y0, y1 });
    }
    return out;
  }

  /** Marca una pieza como pegada a la cara `lado` (1 adelante, -1 atrás) de
   *  una pared: al fundirla, la cara que da contra la pared se ahorra. Va
   *  fuera de los atributos (no es HSML) y sólo la pone pared(): una pieza
   *  fina cualquiera, como un postigo abierto, puede mostrar esa cara. */
  const pegada = (n, lado) => Object.assign(n, { r: lado });

  /** Las piezas del dibujo, como rectángulos con color y relieve. */
  function dibujo(material, o, W, H, r) {
    const piezas = [];
    const { base, junta } = o;
    const alto = o.detalle === "alto";
    if (o.detalle === "linea") {
      // Lo más barato: sólo las hiladas (y las juntas verticales donde el
      // material es una grilla), del color de la junta, sin tonos al azar.
      const paso = { ladrillo: 0.3, piedra: 0.42, madera: 0.3, azulejo: 0.4, hormigon: 0.6, revoque: 0.9 }[material];
      for (let y = paso; y < H - 0.05; y += paso) piezas.push({ linea: true, y, color: junta });
      const vpaso = { azulejo: 0.4, hormigon: 1.2 }[material];
      if (vpaso) for (let x = -W / 2 + vpaso; x < W / 2 - 0.05; x += vpaso) piezas.push({ vlinea: true, x, color: junta });
      return piezas;
    }
    if (material === "ladrillo") {
      const L = alto ? 0.25 : 0.5, h = alto ? 0.075 : 0.3, g = alto ? 0.011 : 0.02;
      for (let fila = 0, y = 0; y < H; fila++, y += h) {
        const off = fila % 2 ? L / 2 : 0;
        for (let x = -W / 2 - off; x < W / 2; x += L) {
          piezas.push({ x0: Math.max(-W / 2, x + g / 2), x1: Math.min(W / 2, x + L - g / 2), y0: y + g / 2, y1: Math.min(H, y + h - g / 2),
                        color: tono(base, entre(r, -0.12, 0.08)), relieve: 0.006 });
        }
      }
    } else if (material === "piedra") {
      for (let y = 0; y < H;) {
        const h = entre(r, alto ? 0.14 : 0.3, alto ? 0.28 : 0.5);
        for (let x = -W / 2 - entre(r, 0, 0.3); x < W / 2;) {
          const L = entre(r, alto ? 0.22 : 0.45, alto ? 0.55 : 0.9);
          piezas.push({ x0: Math.max(-W / 2, x + 0.012), x1: Math.min(W / 2, x + L - 0.012), y0: y + 0.012, y1: Math.min(H, y + h - 0.012),
                        color: tono(base, entre(r, -0.18, 0.14)), relieve: entre(r, 0.008, 0.022) });
          x += L;
        }
        y += h;
      }
    } else if (material === "azulejo") {
      const L = alto ? 0.2 : 0.4, g = 0.006;
      for (let y = 0, i = 0; y < H; y += L, i++) {
        for (let x = -W / 2, j = 0; x < W / 2; x += L, j++) {
          piezas.push({ x0: x + g, x1: Math.min(W / 2, x + L - g), y0: y + g, y1: Math.min(H, y + L - g),
                        color: (i + j) % 2 ? base : tono(base, -0.05), relieve: 0.004 });
        }
      }
    } else if (material === "madera") {
      const h = alto ? 0.16 : 0.32;
      for (let y = 0; y < H; y += h) {
        // Tablas solapadas: cada una apenas inclinada, el borde de abajo afuera.
        piezas.push({ x0: -W / 2, x1: W / 2, y0: y, y1: Math.min(H, y + h - 0.008), color: tono(base, entre(r, -0.1, 0.08)), relieve: 0.012, rx: -0.06 });
      }
    } else if (material === "hormigon") {
      const Lx = 1.2, Ly = 0.6;
      for (let y = 0; y < H; y += Ly) {
        for (let x = -W / 2; x < W / 2; x += Lx) {
          piezas.push({ x0: x + 0.006, x1: Math.min(W / 2, x + Lx - 0.006), y0: y + 0.006, y1: Math.min(H, y + Ly - 0.006), color: tono(base, entre(r, -0.05, 0.05)), relieve: 0.004 });
          if (alto) {
            for (const [px, py] of [[0.25, 0.3], [0.75, 0.3]]) {
              if (x + Lx * px < W / 2 && y + Ly * py < H) piezas.push({ punto: true, x: x + Lx * px, y: y + Ly * py, color: tono(junta, -0.35) });
            }
          }
        }
      }
    } else {
      // Revoque: liso, con buñas horizontales cada tanto.
      const paso = alto ? 0.45 : 0.9;
      for (let y = paso; y < H - 0.05; y += paso) piezas.push({ linea: true, y, color: junta });
    }
    return piezas;
  }

  // ── Contornos ───────────────────────────────────────────────────────────
  //
  // Una pared no tiene por qué ser un rectángulo: con `contorno` (un
  // polígono en el plano de la pared, x centrado, y desde el piso) se arma
  // sobre el rectángulo que lo encierra y después cada pieza se recorta
  // contra él. Lo que queda adentro sigue igual; lo que queda afuera se va;
  // lo que el borde corta depende de cómo se va a dibujar:
  //
  //   con `prismas` (para fundir en malla) el pedazo exacto, como un prisma
  //     de la forma recortada: el borde queda limpio;
  //   como nodos, el cuerpo en fajas horizontales de 6 cm (un <box> no puede
  //     ser un trapecio) y las piezas chicas cortadas, afuera.
  //
  // El recorte exacto necesita un contorno convexo (un hastial, un trapecio,
  // un arco de pocos lados). Con uno cóncavo (una L) todo va por fajas.

  /** "x,y x,y …" o "x,y;x,y;…" o [[x,y], …] → [[x,y], …], antihorario. */
  function leerContorno(c) {
    let pts = Array.isArray(c) ? c : String(c || "").trim().split(/[;\s]+/).filter(Boolean).map((p) => p.split(",").map(Number));
    pts = pts.filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1])).map((p) => [+p[0], +p[1]]);
    if (pts.length < 3) return null;
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const [a, b] = pts[i], [c2, d] = pts[(i + 1) % pts.length]; area += a * d - c2 * b; }
    if (Math.abs(area) < 1e-6) return null;
    return area < 0 ? pts.reverse() : pts;
  }
  function esConvexo(pts) {
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], [cx, cy] = pts[(i + 2) % pts.length];
      if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) < -1e-9) return false;
    }
    return true;
  }
  function adentro(pts, x, y) {
    let si = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
    }
    return si;
  }
  /** Sutherland–Hodgman: el polígono `sujeto` recortado por el convexo `borde`. */
  function recortarConvexo(sujeto, borde) {
    let out = sujeto;
    for (let i = 0; i < borde.length && out.length; i++) {
      const [ax, ay] = borde[i], [bx, by] = borde[(i + 1) % borde.length];
      const lado = (p) => (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
      const entrada = out;
      out = [];
      for (let k = 0; k < entrada.length; k++) {
        const P = entrada[k], Q = entrada[(k + 1) % entrada.length];
        const lp = lado(P), lq = lado(Q);
        if (lp >= 0) out.push(P);
        if ((lp >= 0) !== (lq >= 0)) {
          const t = lp / (lp - lq);
          out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
        }
      }
    }
    return out;
  }
  const areaDe = (pts) => Math.abs(pts.reduce((s, [a, b], i) => { const [c, d] = pts[(i + 1) % pts.length]; return s + a * d - c * b; }, 0)) / 2;
  /** Dónde corta la horizontal `y` al polígono, de a pares [x0, x1]. */
  function tramos(pts, y) {
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    const out = [];
    for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
    return out;
  }

  /** Las piezas de una pared recortadas contra su contorno (ver arriba). */
  function alContorno(nodos, pts, prismas) {
    const convexo = esConvexo(pts);
    const out = [];
    for (const n of nodos) {
      const a = n.a;
      if (n.t !== "box") { if (adentro(pts, a.x || 0, a.y || 0)) out.push(n); continue; }
      const x0 = (a.x || 0) - a.sx / 2, x1 = (a.x || 0) + a.sx / 2, y0 = (a.y || 0) - a.sy / 2, y1 = (a.y || 0) + a.sy / 2;
      const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const esquinas = rect.filter(([x, y]) => adentro(pts, x, y)).length;
      const verticeAdentro = pts.some(([x, y]) => x > x0 + 1e-9 && x < x1 - 1e-9 && y > y0 + 1e-9 && y < y1 - 1e-9);
      if (esquinas === 4 && !verticeAdentro) { out.push(n); continue; }
      if (convexo) {
        const q = recortarConvexo(rect, pts);
        if (q.length < 3 || areaDe(q) < 1e-5) continue;
        if (prismas) {
          out.push(Object.assign({ t: "prisma", a: { pts: q, z: a.z || 0, sz: a.sz, color: a.color } }, n.r ? { r: n.r } : {}));
          continue;
        }
      } else if (!esquinas && !verticeAdentro) continue;
      // Como nodos: las piezas finas cortadas se van; el cuerpo, en fajas.
      if (a.sz <= 0.03) continue;
      const paso = 0.06;
      for (let y = y0; y < y1 - 1e-6; y += paso) {
        const ya = y, yb = Math.min(y1, y + paso);
        for (const [ta, tb] of tramos(pts, (ya + yb) / 2)) {
          const xa = Math.max(x0, ta), xb = Math.min(x1, tb);
          if (xb - xa > 0.005) out.push(Object.assign(caja({ x: (xa + xb) / 2, y: (ya + yb) / 2, z: a.z, sx: xb - xa, sy: yb - ya, sz: a.sz, color: a.color }), n.r ? { r: n.r } : {}));
        }
      }
    }
    return out;
  }

  function pared(op) {
    op = op || {};
    const contorno = op.contorno ? leerContorno(op.contorno) : null;
    if (contorno) {
      // Se arma sobre el rectángulo que encierra el contorno, centrado en x.
      const xs = contorno.map((p) => p[0]), ys = contorno.map((p) => p[1]);
      const nodos = pared(Object.assign({}, op, {
        contorno: null, remate: null,
        ancho: 2 * Math.max(Math.abs(Math.min(...xs)), Math.abs(Math.max(...xs))) + 0.02,
        alto: Math.max(...ys) + 0.01,
      }));
      return alContorno(nodos, contorno, !!op.prismas);
    }
    const W = num(op.ancho, 2.4, 0.2, 60), H = num(op.alto, 2.4, 0.2, 40), E = num(op.espesor, 0.2, 0.02, 1.5);
    const material = elegir(op.material, Object.keys(MATERIALES), "ladrillo");
    const M = MATERIALES[material];
    const base = color(op.color, M.base), junta = color(op.junta, M.junta);
    const detalle = op.detalle === "bajo" || op.detalle === "linea" ? op.detalle : "alto";
    const r = azar(op.semilla || 7);
    const huecos = (op.huecos || []).map((h) => ({ x0: h.x - h.ancho / 2, x1: h.x + h.ancho / 2, y0: h.y, y1: h.y + h.alto }));
    const solidos = macizos(-W / 2, W / 2, 0, H, huecos);
    // El cuerpo: del color de la junta cuando lo de adelante son piezas sueltas
    // (entre ladrillo y ladrillo se ve la mezcla), del material si no.
    const cuerpo = detalle !== "linea" && ["ladrillo", "piedra", "azulejo", "hormigon"].includes(material) ? junta : base;
    const out = solidos.map((s) => caja({ x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2, sx: s.x1 - s.x0, sy: s.y1 - s.y0, sz: E, color: cuerpo }));
    const piezas = dibujo(material, { base, junta, detalle }, W, H, r);
    const caras = op.caras === 2 ? [1, -1] : [1];
    for (const lado of caras) {
      const z = lado * E / 2;
      for (const p of piezas) {
        if (p.linea) {
          for (const s of solidos) {
            if (p.y > s.y0 && p.y < s.y1) out.push(pegada(caja({ x: (s.x0 + s.x1) / 2, y: p.y, z: z + lado * 0.002, sx: s.x1 - s.x0, sy: 0.018, sz: 0.006, color: p.color }), lado));
          }
          continue;
        }
        if (p.vlinea) {
          for (const s of solidos) {
            if (p.x > s.x0 && p.x < s.x1) out.push(pegada(caja({ x: p.x, y: (s.y0 + s.y1) / 2, z: z + lado * 0.002, sx: 0.018, sy: s.y1 - s.y0, sz: 0.006, color: p.color }), lado));
          }
          continue;
        }
        if (p.punto) {
          if (solidos.some((s) => p.x > s.x0 + 0.03 && p.x < s.x1 - 0.03 && p.y > s.y0 + 0.03 && p.y < s.y1 - 0.03)) {
            out.push(cil({ x: p.x, y: p.y, z: z, rx: PI / 2, sx: 0.025, sy: 0.01, sz: 0.025, color: p.color }));
          }
          continue;
        }
        for (const q of recortar(p, solidos)) {
          const a = { x: (q.x0 + q.x1) / 2, y: (q.y0 + q.y1) / 2, z: z + lado * p.relieve / 2, sx: q.x1 - q.x0, sy: q.y1 - q.y0, sz: p.relieve, color: p.color };
          if (p.rx) a.rx = p.rx * lado;
          out.push(pegada(caja(a), lado));
        }
      }
    }
    // Zócalo y remate: una faja abajo y una tapa arriba, apenas más anchas.
    if (op.zocalo !== false && material !== "azulejo") {
      const zc = color(op.colorZocalo, tono(base, -0.35));
      for (const s of solidos) {
        if (s.y0 > 0.001) continue;
        out.push(caja({ x: (s.x0 + s.x1) / 2, y: 0.16, sx: s.x1 - s.x0, sy: 0.32, sz: E + (op.caras === 2 ? 0.03 : 0.015), z: op.caras === 2 ? 0 : 0.0075, color: zc }));
      }
    }
    if (op.remate) out.push(caja({ y: H + 0.03, sx: W + 0.04, sy: 0.06, sz: E + 0.06, color: color(op.remate, tono(base, 0.2)) }));
    return out;
  }

  // ── Pisos ───────────────────────────────────────────────────────────────
  const PISOS = {
    baldosa: ["#E9E3D6", "#3C3C44"],
    parquet: ["#B07A45", "#8A5A30"],
    adoquin: ["#8C8780", "#5E5A54"],
    pasto: ["#5E8C3A", "#3F6B26"],
    deck: ["#9C6B42", "#5C3E26"],
    granito: ["#C9C4BA", "#8F8A82"],
  };
  function piso(op) {
    op = op || {};
    const W = num(op.ancho, 2, 0.2, 60), D = num(op.largo, 2, 0.2, 60);
    const patron = elegir(op.patron, Object.keys(PISOS), "baldosa");
    const c1 = color(op.color, PISOS[patron][0]), c2 = color(op.color2, PISOS[patron][1]);
    const r = azar(op.semilla || 3);
    const E = 0.04;
    const out = [caja({ y: E / 2, z: -D / 2, sx: W, sy: E, sz: D, color: patron === "adoquin" || patron === "deck" ? c2 : patron === "pasto" ? c2 : tono(c1, -0.15) })];
    const tapa = (x0, x1, z0, z1, c, alto) => {
      const a = Math.max(-W / 2, x0), b = Math.min(W / 2, x1), p = Math.max(-D, z0), q = Math.min(0, z1);
      if (b - a > 0.01 && q - p > 0.01) out.push(caja({ x: (a + b) / 2, y: E + (alto || 0.004) / 2, z: (p + q) / 2, sx: b - a, sy: alto || 0.004, sz: q - p, color: c }));
    };
    if (patron === "baldosa") {
      const L = num(op.lado, 0.33, 0.1, 2);
      for (let i = 0, z = -D; z < 0; z += L, i++) for (let j = 0, x = -W / 2; x < W / 2; x += L, j++) tapa(x + 0.004, x + L - 0.004, z + 0.004, z + L - 0.004, (i + j) % 2 ? c2 : c1);
    } else if (patron === "granito") {
      const L = 0.6;
      for (let z = -D; z < 0; z += L) for (let x = -W / 2; x < W / 2; x += L) tapa(x + 0.003, x + L - 0.003, z + 0.003, z + L - 0.003, mezcla(c1, c2, entre(r, 0, 0.35)));
    } else if (patron === "parquet") {
      const A = 0.09;
      for (let x = -W / 2; x < W / 2; x += A) {
        for (let z = -D - entre(r, 0, 0.6); z < 0;) {
          const L = entre(r, 0.4, 0.9);
          tapa(x + 0.002, x + A - 0.002, z + 0.002, z + L - 0.002, mezcla(c1, c2, entre(r, 0, 0.7)));
          z += L;
        }
      }
    } else if (patron === "adoquin") {
      const A = 0.11, L = 0.22;
      for (let i = 0, z = -D; z < 0; z += A, i++) for (let x = -W / 2 - (i % 2 ? L / 2 : 0); x < W / 2; x += L) tapa(x + 0.008, x + L - 0.008, z + 0.008, z + A - 0.008, tono(c1, entre(r, -0.12, 0.1)), 0.012);
    } else if (patron === "deck") {
      const A = 0.14;
      for (let x = -W / 2; x < W / 2; x += A) tapa(x + 0.006, x + A - 0.006, -D, 0, tono(c1, entre(r, -0.1, 0.08)), 0.02);
    } else if (patron === "pasto") {
      const n = Math.round(Math.min(400, W * D * 30));
      for (let i = 0; i < n; i++) {
        const h = entre(r, 0.04, 0.12);
        out.push(caja({ x: entre(r, -W / 2 + 0.02, W / 2 - 0.02), y: E + h / 2, z: entre(r, -D + 0.02, -0.02), ry: entre(r, 0, PI), rz: entre(r, -0.3, 0.3),
                        sx: 0.012, sy: h, sz: 0.004, color: mezcla(c1, "#9BC25A", entre(r, 0, 0.5)) }));
      }
    }
    return out;
  }

  // ── Columnas, escaleras y barandas ──────────────────────────────────────
  function columna(op) {
    op = op || {};
    const H = num(op.alto, 2.6, 0.5, 20), Dm = num(op.diametro, 0.34, 0.08, 3);
    const tipo = elegir(op.tipo, ["clasica", "cuadrada", "moderna", "salomonica"], "clasica");
    const c = color(op.color, tipo === "moderna" ? "#9AA0A6" : "#E8E1D3");
    const out = [];
    if (tipo === "cuadrada") {
      out.push(caja({ y: 0.08, sx: Dm + 0.12, sy: 0.16, sz: Dm + 0.12, color: tono(c, -0.1) }));
      out.push(caja({ y: H / 2, sx: Dm, sy: H - 0.3, sz: Dm, color: c }));
      for (const y of [0.35, H - 0.35]) out.push(caja({ y, sx: Dm + 0.03, sy: 0.04, sz: Dm + 0.03, color: tono(c, -0.08) }));
      out.push(caja({ y: H - 0.07, sx: Dm + 0.14, sy: 0.14, sz: Dm + 0.14, color: tono(c, 0.05) }));
    } else if (tipo === "moderna") {
      out.push(caja({ y: 0.01, sx: Dm * 1.6, sy: 0.02, sz: Dm * 1.6, color: tono(c, -0.3) }));
      out.push(cil({ y: H / 2, sx: Dm * 0.55, sy: H, sz: Dm * 0.55, color: c }));
      out.push(caja({ y: H - 0.01, sx: Dm * 1.6, sy: 0.02, sz: Dm * 1.6, color: tono(c, -0.3) }));
    } else {
      // Clásica: plinto, basa de dos toros, fuste con estrías, equino y ábaco.
      out.push(caja({ y: 0.06, sx: Dm * 1.45, sy: 0.12, sz: Dm * 1.45, color: tono(c, -0.06) }));
      out.push(cil({ y: 0.16, sx: Dm * 1.28, sy: 0.08, sz: Dm * 1.28, color: c }));
      out.push(cil({ y: 0.23, sx: Dm * 1.15, sy: 0.06, sz: Dm * 1.15, color: tono(c, -0.04) }));
      const f0 = 0.26, f1 = H - 0.3;
      if (tipo === "salomonica") {
        // Fuste torcido: rodajas que giran y se corren sobre una hélice.
        const n = 28;
        for (let i = 0; i < n; i++) {
          const k = (i + 0.5) / n, a = k * PI * 6;
          out.push(cil({ x: Math.cos(a) * Dm * 0.08, y: f0 + k * (f1 - f0), z: Math.sin(a) * Dm * 0.08, sx: Dm * 0.86, sy: (f1 - f0) / n + 0.01, sz: Dm * 0.86, color: tono(c, i % 2 ? 0 : -0.05) }));
        }
      } else {
        out.push(cil({ y: (f0 + f1) / 2, sx: Dm, sy: f1 - f0, sz: Dm, color: c }));
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * PI * 2;
          out.push(caja({ x: Math.sin(a) * Dm * 0.49, y: (f0 + f1) / 2, z: Math.cos(a) * Dm * 0.49, ry: a, sx: Dm * 0.07, sy: f1 - f0 - 0.08, sz: 0.006, color: tono(c, -0.14) }));
        }
      }
      out.push(cil({ y: H - 0.25, sx: Dm * 1.08, sy: 0.05, sz: Dm * 1.08, color: tono(c, -0.04) }));
      out.push(cil({ y: H - 0.18, sx: Dm * 1.3, sy: 0.1, sz: Dm * 1.3, color: c }));
      out.push(caja({ y: H - 0.065, sx: Dm * 1.5, sy: 0.13, sz: Dm * 1.5, color: tono(c, 0.04) }));
    }
    return out;
  }

  function baranda(op) {
    op = op || {};
    const L = num(op.largo, 1.6, 0.3, 40), H = num(op.alto, 0.95, 0.4, 2);
    const tipo = elegir(op.tipo, ["balaustres", "barrotes", "vidrio", "cables"], "balaustres");
    const c = color(op.color, tipo === "balaustres" ? "#E8E1D3" : "#2F3238");
    const out = [];
    const postes = Math.max(2, Math.ceil(L / 1.4) + 1);
    const P = tipo === "balaustres" ? 0.14 : 0.05;
    for (let i = 0; i < postes; i++) {
      const x = -L / 2 + (L * i) / (postes - 1);
      out.push(caja({ x, y: H / 2, sx: P, sy: H, sz: P, color: tono(c, -0.05) }));
    }
    const pasamanos = tipo === "balaustres" ? caja({ y: H - 0.04, sx: L + 0.1, sy: 0.08, sz: 0.16, color: c }) : cil({ y: H, rz: PI / 2, sx: 0.045, sy: L + 0.04, sz: 0.045, color: tipo === "vidrio" ? "#B8BEC6" : c });
    out.push(pasamanos);
    if (tipo !== "cables") out.push(caja({ y: tipo === "balaustres" ? 0.06 : 0.08, sx: L, sy: tipo === "balaustres" ? 0.12 : 0.03, sz: tipo === "balaustres" ? 0.16 : 0.03, color: tono(c, -0.08) }));
    if (tipo === "balaustres") {
      // Balaustres: pie, panza y cuello, como torneados.
      const n = Math.max(2, Math.round(L / 0.16));
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (L * (i + 0.5)) / n;
        if (Math.abs(x) > L / 2 - 0.1) continue;
        const h = H - 0.2;
        out.push(cil({ x, y: 0.12 + h * 0.12, sx: 0.07, sy: h * 0.24, sz: 0.07, color: c }));
        out.push(esfera({ x, y: 0.12 + h * 0.42, sx: 0.1, sy: h * 0.38, sz: 0.1, color: c }));
        out.push(cil({ x, y: 0.12 + h * 0.8, sx: 0.05, sy: h * 0.4, sz: 0.05, color: c }));
      }
    } else if (tipo === "barrotes") {
      const n = Math.max(2, Math.round(L / 0.11));
      for (let i = 1; i < n; i++) out.push(cil({ x: -L / 2 + (L * i) / n, y: H / 2, sx: 0.018, sy: H - 0.1, sz: 0.018, color: c }));
    } else if (tipo === "vidrio") {
      out.push(caja({ y: H / 2, sx: L - 0.08, sy: H - 0.16, sz: 0.012, color: "#BFE3F055", "material-alpha": "blend" }));
    } else {
      for (let k = 1; k <= 6; k++) out.push(cil({ y: (H * k) / 7, rz: PI / 2, sx: 0.006, sy: L, sz: 0.006, color: "#C9CDD2" }));
    }
    return out;
  }

  function escalera(op) {
    op = op || {};
    const W = num(op.ancho, 1, 0.4, 6), n = Math.round(num(op.escalones, 7, 2, 30)), H = num(op.alto, 1.2, 0.2, 8);
    const huella = num(op.huella, 0.28, 0.18, 0.5);
    const material = elegir(op.material, ["hormigon", "madera", "metal"], "madera");
    const c = color(op.color, material === "madera" ? "#9C6B42" : material === "metal" ? "#3A3F46" : "#B9B6AE");
    const alzada = H / n, D = n * huella;
    const out = [];
    for (let i = 0; i < n; i++) {
      const y = (i + 1) * alzada, z = -(i + 0.5) * huella;
      if (material === "hormigon") {
        out.push(caja({ y: y / 2, z, sx: W, sy: y, sz: huella, color: tono(c, i % 2 ? 0 : -0.04) }));
        out.push(caja({ y: y - 0.01, z: z + huella / 2 - 0.03, sx: W, sy: 0.02, sz: 0.06, color: tono(c, -0.25) }));
      } else {
        out.push(caja({ y: y - 0.025, z, sx: W - 0.12, sy: 0.05, sz: huella + 0.02, color: tono(c, material === "madera" ? (i % 2 ? 0.04 : -0.04) : 0) }));
      }
    }
    if (material !== "hormigon") {
      // Las zancas: dos vigas inclinadas a los costados.
      const largo = Math.hypot(D, H), a = Math.atan2(H, D);
      for (const s of [-1, 1]) out.push(caja({ x: s * (W / 2 - 0.03), y: H / 2 - 0.04, z: -D / 2, rx: a, sx: 0.06, sy: 0.22, sz: largo + 0.1, color: tono(c, -0.2) }));
    }
    if (op.baranda !== false) {
      const largo = Math.hypot(D, H), a = Math.atan2(H, D);
      const bc = material === "metal" ? tono(c, 0.2) : "#2F3238";
      for (let i = 0; i < n; i += 2) {
        const y = (i + 1) * alzada, z = -(i + 0.5) * huella;
        out.push(cil({ x: W / 2 - 0.06, y: y + 0.45, z, sx: 0.025, sy: 0.9, sz: 0.025, color: bc }));
      }
      // El cilindro está parado en Y; girado -(90° - a) en X queda subiendo hacia -Z.
      out.push(cil({ x: W / 2 - 0.06, y: H / 2 + 0.9, z: -D / 2, rx: -(PI / 2 - a), sx: 0.045, sy: largo + 0.1, sz: 0.045, color: material === "madera" ? tono(c, -0.1) : bc }));
    }
    return out;
  }

  // ── Aberturas ───────────────────────────────────────────────────────────
  //
  // Devuelven el marco (fijo) y las hojas por separado: cada hoja en las
  // coordenadas de su bisagra, para que el objeto la gire y la calle la deje
  // quieta (o entreabierta).
  const VIDRIO = "#BFE3F066";
  function puerta(op) {
    op = op || {};
    const W = num(op.ancho, 0.9, 0.5, 3), H = num(op.alto, 2.05, 1.5, 4);
    const estilo = elegir(op.estilo, ["tableros", "tablas", "vidriada", "lisa"], "tableros");
    const c = color(op.color, "#7A4B2A"), cm = color(op.marco, "#F2EEE6"), cp = color(op.picaporte, "#C9A45C");
    const M = 0.08, T = 0.045;
    const marco = [
      caja({ x: -W / 2 - M / 2, y: (H + M) / 2, sx: M, sy: H + M, sz: 0.14, color: cm }),
      caja({ x: W / 2 + M / 2, y: (H + M) / 2, sx: M, sy: H + M, sz: 0.14, color: cm }),
      caja({ y: H + M / 2, sx: W + 2 * M, sy: M, sz: 0.14, color: cm }),
      caja({ y: 0.01, sx: W, sy: 0.02, sz: 0.14, color: tono(cm, -0.3) }),
    ];
    // La hoja, con el eje de la bisagra en x=0 y la hoja hacia +x.
    const hw = W - 0.01, hh = H - 0.015;
    const hoja = [];
    const cx = hw / 2, cy = hh / 2 + 0.008;
    if (estilo === "tablas") {
      const n = Math.max(3, Math.round(hw / 0.13));
      for (let i = 0; i < n; i++) hoja.push(caja({ x: (hw * (i + 0.5)) / n, y: cy, sx: hw / n - 0.006, sy: hh, sz: T, color: tono(c, ((i * 37) % 7) / 60 - 0.05) }));
      for (const y of [0.3, hh - 0.3]) hoja.push(caja({ x: cx, y, z: T / 2 + 0.012, sx: hw - 0.1, sy: 0.12, sz: 0.024, color: tono(c, -0.12) }));
      hoja.push(caja({ x: cx, y: hh / 2, z: T / 2 + 0.012, rz: Math.atan2(hh - 0.6, hw - 0.14), sx: Math.hypot(hh - 0.6, hw - 0.14), sy: 0.1, sz: 0.022, color: tono(c, -0.12) }));
    } else {
      hoja.push(caja({ x: cx, y: cy, sx: hw, sy: hh, sz: T, color: c }));
      if (estilo === "tableros") {
        for (const [y, h] of [[hh * 0.72, hh * 0.38], [hh * 0.27, hh * 0.36]]) {
          for (const s of [1, -1]) hoja.push(caja({ x: cx, y, z: s * (T / 2 + 0.006), sx: hw - 0.2, sy: h, sz: 0.012, color: tono(c, 0.08) }));
        }
      } else if (estilo === "vidriada") {
        const vw = hw - 0.22, vh = hh * 0.58;
        hoja.push(caja({ x: cx, y: hh * 0.66, sx: vw, sy: vh, sz: T + 0.004, color: VIDRIO, "material-alpha": "blend" }));
        hoja.push(caja({ x: cx, y: hh * 0.66, sx: 0.03, sy: vh, sz: T + 0.01, color: c }));
        hoja.push(caja({ x: cx, y: hh * 0.66, sx: vw, sy: 0.03, sz: T + 0.01, color: c }));
      }
    }
    // Picaporte de los dos lados: roseta y manija.
    for (const s of [1, -1]) {
      hoja.push(cil({ x: hw - 0.08, y: 1.0, z: s * (T / 2 + 0.01), rx: PI / 2, sx: 0.05, sy: 0.02, sz: 0.05, color: cp }));
      hoja.push(caja({ x: hw - 0.14, y: 1.0, z: s * (T / 2 + 0.05), sx: 0.13, sy: 0.02, sz: 0.02, color: cp }));
      hoja.push(cil({ x: hw - 0.08, y: 1.0, z: s * (T / 2 + 0.03), rx: PI / 2, sx: 0.018, sy: 0.04, sz: 0.018, color: cp }));
    }
    return { marco, hoja, bisagra: { x: -W / 2 + 0.005, y: 0, z: 0 }, ancho: W, alto: H };
  }

  function ventana(op) {
    op = op || {};
    const W = num(op.ancho, 1.1, 0.3, 4), H = num(op.alto, 1.2, 0.3, 4);
    const n = Math.round(num(op.hojas, 2, 1, 4));
    const c = color(op.color, "#F4F1EA");
    const M = 0.06;
    const marco = [
      caja({ x: -W / 2 - M / 2, y: H / 2, sx: M, sy: H + 2 * M, sz: 0.1, color: c }),
      caja({ x: W / 2 + M / 2, y: H / 2, sx: M, sy: H + 2 * M, sz: 0.1, color: c }),
      caja({ y: H + M / 2, sx: W + 2 * M, sy: M, sz: 0.1, color: c }),
      caja({ y: -M / 2, sx: W + 2 * M, sy: M, sz: 0.1, color: c }),
    ];
    if (op.alfeizar !== false) marco.push(caja({ y: -M - 0.025, z: 0.06, sx: W + 0.24, sy: 0.05, sz: 0.2, color: color(op.colorAlfeizar, "#D8D2C4") }));
    // Hojas batientes: cada una con su bisagra en el borde de afuera.
    const hojas = [];
    const hw = W / n;
    for (let i = 0; i < n; i++) {
      const izquierda = n === 1 || i < n / 2;
      const px = izquierda ? -W / 2 + hw * i : -W / 2 + hw * (i + 1);
      const dir = izquierda ? 1 : -1;
      const nodos = [
        caja({ x: dir * hw / 2, y: H / 2, sx: hw - 0.01, sy: H - 0.01, sz: 0.012, color: VIDRIO, "material-alpha": "blend" }),
      ];
      for (const [x, y, sx, sy] of [[0.025, H / 2, 0.05, H], [hw - 0.025, H / 2, 0.05, H], [hw / 2, 0.025, hw, 0.05], [hw / 2, H - 0.025, hw, 0.05], [hw / 2, H / 2, hw, 0.03]]) {
        nodos.push(caja({ x: dir * x, y, sx, sy, sz: 0.04, color: c }));
      }
      hojas.push({ bisagra: { x: px, y: 0, z: 0.02 }, dir, nodos });
    }
    // Postigos: dos hojas de tablillas afuera, abisagradas en los costados.
    const postigos = [];
    if (op.postigos) {
      const pc = color(op.colorPostigos, "#2E5E4E");
      for (const s of [-1, 1]) {
        const nodos = [];
        const pw = W / 2 + M;
        for (const y of [0.04, H - 0.04]) nodos.push(caja({ x: -s * pw / 2, y, sx: pw, sy: 0.08, sz: 0.03, color: pc }));
        for (const x of [0.03, pw - 0.03]) nodos.push(caja({ x: -s * x, y: H / 2, sx: 0.06, sy: H, sz: 0.03, color: pc }));
        if (op.lisos) {
          // Para lejos (la calle): un tablero con tres travesaños, sin tablillas.
          nodos.push(caja({ x: -s * pw / 2, y: H / 2, sx: pw - 0.1, sy: H - 0.16, sz: 0.012, color: tono(pc, 0.08) }));
          for (const y of [H * 0.3, H * 0.7]) nodos.push(caja({ x: -s * pw / 2, y, z: 0.01, sx: pw - 0.1, sy: 0.05, sz: 0.012, color: pc }));
        } else {
          for (let y = 0.1; y < H - 0.08; y += 0.06) nodos.push(caja({ x: -s * pw / 2, y, rx: -0.5, sx: pw - 0.1, sy: 0.055, sz: 0.008, color: tono(pc, 0.08) }));
        }
        // Los postigos van por afuera de la pared: con `frente` (dónde queda
        // la cara de la pared, contando lo que sobresalen los ladrillos,
        // medido desde el marco) la bisagra se apoya ahí, y cerrados o
        // abiertos contra la fachada no se meten en ella.
        const zb = op.frente != null ? Number(op.frente) + 0.016 : 0.06;
        postigos.push({ bisagra: { x: s * (W / 2 + M), y: 0, z: zb }, dir: -s, nodos });
      }
    }
    return { marco, hojas, postigos, ancho: W, alto: H };
  }

  function porton(op) {
    op = op || {};
    const W = num(op.ancho, 2.4, 1, 8), H = num(op.alto, 2.1, 1, 6);
    const n = Math.round(num(op.tablillas, 5, 2, 12));
    const c = color(op.color, "#D9D4CC"), cm = color(op.marco, "#4A4E55");
    const marco = [
      caja({ x: -W / 2 - 0.06, y: H / 2 + 0.06, sx: 0.12, sy: H + 0.12, sz: 0.16, color: cm }),
      caja({ x: W / 2 + 0.06, y: H / 2 + 0.06, sx: 0.12, sy: H + 0.12, sz: 0.16, color: cm }),
      caja({ y: H + 0.06, sx: W + 0.24, sy: 0.12, sz: 0.16, color: cm }),
    ];
    // Cada tablilla, con el origen en su borde de abajo: el objeto las sube de a una.
    const h = H / n;
    const tablillas = [];
    for (let i = 0; i < n; i++) {
      const nodos = [caja({ y: h / 2, sx: W - 0.01, sy: h - 0.012, sz: 0.04, color: c })];
      for (const y of [h * 0.3, h * 0.7]) nodos.push(caja({ y, z: 0.022, sx: W - 0.1, sy: 0.012, sz: 0.006, color: tono(c, -0.12) }));
      if (op.ventanitas !== false && i === n - 2) {
        for (let k = 0; k < 4; k++) nodos.push(caja({ x: -W * 0.3 + (k * W * 0.6) / 3, y: h / 2, z: 0.02, sx: W * 0.14, sy: h * 0.5, sz: 0.01, color: "#2A3440" }));
      }
      if (i === 0) nodos.push(caja({ y: h * 0.5, z: 0.04, sx: 0.3, sy: 0.04, sz: 0.04, color: "#5A5E66" }));
      tablillas.push({ y: i * h, nodos });
    }
    return { marco, tablillas, alto: H, ancho: W, paso: h };
  }

  // ── Techos y toldos ─────────────────────────────────────────────────────
  //
  // El origen es el de la planta que cubre, a la altura del alero: `ancho` en
  // x, `fondo` en z, centrado. Un techo a dos aguas tiene la cumbrera a lo
  // ancho; los hastiales se tapan con triángulos (ver triangulo()).
  function techo(op) {
    op = op || {};
    const W = num(op.ancho, 2.4, 0.5, 60), D = num(op.fondo, 2, 0.5, 60);
    const tipo = elegir(op.tipo, ["dos_aguas", "una_agua", "plano", "mansarda"], "dos_aguas");
    const pend = num(op.pendiente, 0.6, 0.1, 2);
    const alero = num(op.alero, 0.3, 0, 1.5);
    const teja = color(op.color, tipo === "plano" ? "#8E8A84" : "#A4472F");
    const hastial = color(op.hastial, "#E6D8C0");
    const out = [];
    /** Un faldón: una losa inclinada con sus hileras de tejas. Va de la
     *  cumbrera (y0, z0) hacia +z bajando, `largo` sobre la pendiente. */
    const faldon = (y0, z0, largo, ancho, a, girar) => {
      const h = [caja({ y: -0.03, z: largo / 2, sx: ancho, sy: 0.06, sz: largo, color: tono(teja, -0.2) })];
      for (let s = 0.12; s < largo; s += 0.24) h.push(caja({ y: 0.012, z: s, rx: 0.12, sx: ancho, sy: 0.03, sz: 0.25, color: tono(teja, ((s * 13) % 1) * 0.12 - 0.06) }));
      const g = grupo({ rx: a }, h);
      return grupo({ y: y0, z: z0, ry: girar ? PI : 0 }, [g]);
    };
    if (tipo === "dos_aguas") {
      const run = D / 2 + alero, a = Math.atan(pend), cum = (D / 2) * pend;
      const largo = run / Math.cos(a);
      for (const g of [false, true]) out.push(faldon(cum, 0, largo, W + 2 * alero, a, g));
      out.push(cil({ y: cum + 0.03, rz: PI / 2, sx: 0.12, sy: W + 2 * alero, sz: 0.12, color: tono(teja, -0.1) }));
      for (const s of [-1, 1]) out.push(triangulo({ plano: "zy", x: s * (W / 2 - 0.1), base: D, alto: cum - 0.02, espesor: 0.2, color: hastial }));
      if (op.chimenea !== false) {
        // A escala del techo: en uno de 1 m una chimenea de 40 cm es un edificio.
        const k = Math.min(1, Math.min(W, D) / 4);
        const cx = W * 0.28, cz = -D * 0.2, cy = cum - Math.abs(cz) * pend;
        out.push(caja({ x: cx, y: cy + 0.45 * k, z: cz, sx: 0.4 * k, sy: 1.1 * k, sz: 0.4 * k, color: color(op.colorChimenea, "#8C4B35") }));
        out.push(caja({ x: cx, y: cy + 1.02 * k, z: cz, sx: 0.5 * k, sy: 0.06 * k, sz: 0.5 * k, color: "#5A5A5A" }));
      }
    } else if (tipo === "una_agua") {
      const a = Math.atan(pend), cum = D * pend;
      const run = D + 2 * alero, largo = run / Math.cos(a);
      out.push(faldon(cum + alero * pend, -D / 2 - alero, largo, W + 2 * alero, a, false));
      for (const s of [-1, 1]) out.push(cuna({ x: s * (W / 2 - 0.1), desde: -D / 2, hasta: D / 2, alto: cum - 0.02, espesor: 0.2, color: hastial }));
      out.push(caja({ y: cum / 2, z: -D / 2 - 0.1, sx: W, sy: cum, sz: 0.2, color: hastial }));
    } else if (tipo === "mansarda") {
      // Mansarda: un faldón empinado abajo y uno casi plano arriba, a cada lado.
      const a1 = 1.2, h1 = Math.min(D * 0.45, 1.4), r1 = h1 / Math.tan(a1);
      const topD = D - 2 * r1, a2 = 0.25, h2 = (topD / 2) * Math.tan(a2);
      for (const g of [false, true]) {
        out.push(faldon(h1, topD / 2, h1 / Math.sin(a1) + 0.05, W + 0.1, a1, g));
        out.push(faldon(h1 + h2, 0, topD / 2 / Math.cos(a2) + 0.05, W + 0.1, a2, g));
      }
      out.push(caja({ y: h1 / 2, sx: W - 0.02, sy: h1, sz: D - 2 * r1 + 0.02, color: hastial }));
      for (const s of [-1, 1]) out.push(caja({ x: s * (W / 2 - 0.05), y: h1 / 2, sx: 0.1, sy: h1, sz: D - 0.2, color: tono(teja, -0.2) }));
      for (const s of [-1, 1]) out.push(triangulo({ plano: "zy", x: s * (W / 2 - 0.05), y: h1, base: topD, alto: h2, espesor: 0.1, color: tono(teja, -0.2) }));
      // Buhardillas: ventanitas que salen del faldón empinado.
      if (op.buhardillas !== false) {
        const nb = Math.max(1, Math.floor(W / 1.8));
        for (let i = 0; i < nb; i++) {
          const x = -W / 2 + (W * (i + 0.5)) / nb;
          out.push(caja({ x, y: h1 * 0.55, z: D / 2 - r1 * 0.35, sx: 0.7, sy: 0.8, sz: 0.5, color: hastial }));
          out.push(caja({ x, y: h1 * 0.55, z: D / 2 - r1 * 0.35 + 0.26, sx: 0.46, sy: 0.56, sz: 0.02, color: "#2A3440" }));
          out.push(caja({ x, y: h1 * 0.55 + 0.46, z: D / 2 - r1 * 0.35, sx: 0.8, sy: 0.1, sz: 0.6, color: tono(teja, -0.2) }));
        }
      }
    } else {
      // Plano: la losa, la membrana, un parapeto y lo que suele haber arriba.
      out.push(caja({ y: 0.1, sx: W, sy: 0.2, sz: D, color: "#B7B3AB" }));
      out.push(caja({ y: 0.205, sx: W - 0.3, sy: 0.01, sz: D - 0.3, color: teja }));
      const P = 0.55;
      for (const [x, z, sx, sz] of [[0, D / 2 - 0.07, W, 0.14], [0, -D / 2 + 0.07, W, 0.14], [W / 2 - 0.07, 0, 0.14, D], [-W / 2 + 0.07, 0, 0.14, D]]) {
        out.push(caja({ x, y: P / 2, z, sx, sy: P, sz, color: hastial }));
        out.push(caja({ x, y: P + 0.02, z, sx: sx + 0.04, sy: 0.04, sz: sz + 0.04, color: tono(hastial, 0.15) }));
      }
      if (op.tanque !== false) {
        const tx = W * 0.25, tz = -D * 0.15;
        for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) out.push(caja({ x: tx + dx, y: 0.6, z: tz + dz, sx: 0.06, sy: 0.8, sz: 0.06, color: "#6B6F76" }));
        out.push(caja({ x: tx, y: 1.0, z: tz, sx: 0.9, sy: 0.04, sz: 0.9, color: "#6B6F76" }));
        out.push(cil({ x: tx, y: 1.45, z: tz, sx: 0.85, sy: 0.85, sz: 0.85, color: color(op.colorTanque, "#2B5FA8") }));
        out.push(cil({ x: tx, y: 1.9, z: tz, sx: 0.4, sy: 0.06, sz: 0.4, color: tono(color(op.colorTanque, "#2B5FA8"), -0.2) }));
      }
      if (op.chimenea !== false) {
        out.push(cil({ x: -W * 0.3, y: 0.6, z: D * 0.1, sx: 0.14, sy: 0.9, sz: 0.14, color: "#9AA0A6" }));
        out.push(cil({ x: -W * 0.3, y: 1.08, z: D * 0.1, sx: 0.28, sy: 0.08, sz: 0.28, color: "#6B6F76" }));
      }
    }
    return out;
  }

  /** Un toldo de brazos. `k` de 0 (recogido) a 1 (extendido). El origen es la
   *  barra de arriba, contra la pared; sale hacia +Z bajando. */
  function toldo(op, k) {
    op = op || {};
    const W = num(op.ancho, 2, 0.5, 20), S = num(op.salida, 1.3, 0.3, 5);
    const colores = [color(op.color, "#C8102E"), color(op.color2, "#F4F1EA")];
    const n = Math.max(2, Math.round(num(op.franjas, 8, 2, 40)));
    const caida = num(op.caida, 0.35, 0, 2);
    k = k == null ? 1 : Math.max(0.02, Math.min(1, k));
    const a = Math.atan2(caida, S);
    const L = Math.hypot(S, caida) * k;
    const out = [
      cil({ rz: PI / 2, sx: 0.1, sy: W + 0.1, sz: 0.1, color: "#6B6F76" }),
      caja({ y: 0.02, z: -0.06, sx: W + 0.2, sy: 0.16, sz: 0.04, color: "#4A4E55" }),
    ];
    const lona = [];
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W * (i + 0.5)) / n;
      lona.push(caja({ x, z: L / 2, sx: W / n + 0.002, sy: 0.012, sz: L, color: colores[i % 2] }));
      if (op.faldon !== false) lona.push(caja({ x, y: -0.11, z: L, rx: -a, sx: W / n + 0.002, sy: 0.22, sz: 0.01, color: colores[i % 2] }));
    }
    lona.push(cil({ z: L, rz: PI / 2, sx: 0.05, sy: W, sz: 0.05, color: "#4A4E55" }));
    out.push(grupo({ rx: a }, lona));
    // Los brazos: dos tramos articulados que van de la pared a la barra de adelante.
    const fy = -Math.sin(a) * L, fz = Math.cos(a) * L;
    for (const s of [-1, 1]) {
      const px = s * (W / 2 - 0.15), py = -0.35;
      const mz = fz * 0.5 + 0.04 * (1 - k), my = (py + fy) / 2 - 0.12 * Math.sin(PI * (1 - k)) * 0.5;
      for (const [y0, z0, y1, z1] of [[py, 0, my, mz], [my, mz, fy, fz]]) {
        const l = Math.hypot(y1 - y0, z1 - z0);
        if (l < 0.01) continue;
        out.push(caja({ x: px, y: (y0 + y1) / 2, z: (z0 + z1) / 2, rx: -Math.atan2(y1 - y0, z1 - z0), sx: 0.04, sy: 0.03, sz: l, color: "#8A8F96" }));
      }
      out.push(caja({ x: px, y: py, z: -0.03, sx: 0.08, sy: 0.12, sz: 0.06, color: "#4A4E55" }));
    }
    return out;
  }

  // ── Árboles, arbustos, setos, cercos y canteros ─────────────────────────
  const ESPECIES = ["copa", "pino", "palmera", "abedul", "cipres", "cerezo", "sauce"];

  /** Un árbol. La copa va en un grupo aparte con el origen arriba del tronco,
   *  para que un objeto la haga mecerse sin tocar el tronco. */
  function arbol(op) {
    op = op || {};
    const especie = elegir(op.especie, ESPECIES, "copa");
    const H = num(op.alto, 4, 0.5, 30);
    const r = azar(op.semilla || 1);
    const hojaDef = { copa: "#4E8A3A", pino: "#2F5E3A", palmera: "#5C9A3C", abedul: "#8FB84A", cipres: "#2E5A34", cerezo: "#F4A7C0", sauce: "#7FA84A" }[especie];
    const hoja = color(op.hoja, hojaDef);
    const tr = color(op.tronco, especie === "abedul" ? "#E8E4DA" : "#6B4A30");
    const tronco = [], copa = [];
    let yCopa = H * 0.45;
    const verde = (k) => tono(hoja, entre(r, -0.15, 0.12) + (k || 0));
    if (especie === "copa" || especie === "cerezo") {
      const ht = H * 0.42, rt = H * 0.035;
      tronco.push(cil({ y: ht / 2, sx: rt * 2, sy: ht, sz: rt * 2, color: tr }));
      tronco.push(cil({ y: 0.06, sx: rt * 3, sy: 0.12, sz: rt * 3, color: tono(tr, -0.1) }));
      yCopa = ht;
      // Ramas que abren desde la horqueta.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + entre(r, 0, 1), inc = entre(r, 0.5, 0.9), l = H * 0.28;
        copa.push(grupo({ ry: a }, [cil({ x: Math.sin(inc) * l / 2, y: Math.cos(inc) * l / 2, rz: -inc, sx: rt * 1.1, sy: l, sz: rt * 1.1, color: tr })]));
      }
      const R = H * 0.3, n = 9;
      for (let i = 0; i < n; i++) {
        const a = entre(r, 0, PI * 2), d = entre(r, 0.2, 0.75) * R, s = entre(r, 0.55, 0.95) * R * 1.3;
        copa.push(esfera({ x: Math.cos(a) * d, y: R * 0.75 + entre(r, -0.35, 0.55) * R, z: Math.sin(a) * d, sx: s, sy: s * 0.85, sz: s, color: verde() }));
      }
      if (especie === "cerezo") {
        for (let i = 0; i < 26; i++) {
          const a = entre(r, 0, PI * 2), d = entre(r, 0.4, 1.05) * R;
          copa.push(esfera({ x: Math.cos(a) * d, y: R * 0.75 + entre(r, -0.4, 0.7) * R, z: Math.sin(a) * d, sx: 0.08, sy: 0.08, sz: 0.08, color: tono("#FFFFFF", -entre(r, 0, 0.1)) }));
        }
      }
    } else if (especie === "pino") {
      const rt = H * 0.03;
      tronco.push(cil({ y: H * 0.45, sx: rt * 2, sy: H * 0.9, sz: rt * 2, color: tr }));
      yCopa = H * 0.18;
      const pisos = 6, alto = H - yCopa;
      for (let i = 0; i < pisos; i++) {
        const k = i / pisos;
        const R = H * 0.3 * (1 - k * 0.85);
        const y = alto * k;
        // Cada piso: un disco ancho y uno más angosto encima, que escalonan el cono.
        copa.push(cil({ y: y + alto * 0.05, ry: entre(r, 0, PI), sx: R * 2, sy: alto / pisos * 0.55, sz: R * 2, color: verde(-0.05) }));
        copa.push(cil({ y: y + alto * 0.12, ry: entre(r, 0, PI), sx: R * 1.4, sy: alto / pisos * 0.5, sz: R * 1.4, color: verde(0.02) }));
      }
      copa.push(esfera({ y: alto * 0.98, sx: H * 0.05, sy: H * 0.12, sz: H * 0.05, color: verde() }));
    } else if (especie === "palmera") {
      // Tronco curvo: segmentos que se van torciendo, con anillos.
      const n = 10, seg = H / n, doblez = entre(r, 0.02, 0.06), dir = entre(r, 0, PI * 2);
      let x = 0, y = 0, a = 0;
      for (let i = 0; i < n; i++) {
        const cx = x + Math.sin(a) * seg / 2, cy = y + Math.cos(a) * seg / 2;
        const rad = H * (0.045 - i * 0.0018);
        tronco.push(grupo({ ry: dir }, [cil({ x: cx, y: cy, rz: -a, sx: rad * 2, sy: seg * 1.04, sz: rad * 2, color: tono(tr, i % 2 ? 0.05 : -0.05) })]));
        x += Math.sin(a) * seg; y += Math.cos(a) * seg; a += doblez;
      }
      yCopa = y;
      copa.push(esfera({ sx: H * 0.08, sy: H * 0.06, sz: H * 0.08, color: tono(tr, -0.2) }));
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * PI * 2 + entre(r, 0, 0.3);
        const hojas = [];
        let py = 0, pz = 0, inc = entre(r, -0.5, -0.2);
        for (let k = 0; k < 4; k++) {
          const l = H * 0.12;
          hojas.push(caja({ y: py + Math.sin(-inc) * l / 2, z: pz + Math.cos(inc) * l / 2, rx: inc, sx: H * 0.07 * (1 - k * 0.2), sy: 0.015, sz: l, color: verde(k * 0.04) }));
          py += Math.sin(-inc) * l; pz += Math.cos(inc) * l; inc += 0.35;
        }
        copa.push(grupo({ ry: ang }, hojas));
      }
      for (let i = 0; i < 3; i++) copa.push(esfera({ x: Math.cos(i * 2.1) * H * 0.04, y: -H * 0.04, z: Math.sin(i * 2.1) * H * 0.04, sx: H * 0.035, sy: H * 0.035, sz: H * 0.035, color: "#5C3D1E" }));
      // Los grupos del tronco están girados en Y: la copa va al mismo lado.
      // (x, 0) girado `dir` queda en (x cos, -x sin).
      const cx = Math.cos(dir) * x, cz = -Math.sin(dir) * x;
      return [...tronco, grupo({ id: op.id, x: cx, y: yCopa, z: cz }, copa)];
    } else if (especie === "abedul") {
      for (let t = 0; t < 2; t++) {
        const inc = t ? 0.12 : -0.06, ht = H * (t ? 0.8 : 0.95), rt = H * 0.022;
        const ox = t ? 0.12 : -0.05;
        const troncoT = [cil({ y: ht / 2, sx: rt * 2, sy: ht, sz: rt * 2, color: tr })];
        for (let i = 0; i < 9; i++) troncoT.push(caja({ y: entre(r, 0.2, ht - 0.2), z: rt * 0.95, ry: entre(r, -0.6, 0.6), sx: rt * entre(r, 0.8, 1.6), sy: 0.03, sz: 0.01, color: "#2A2A2A" }));
        tronco.push(grupo({ x: ox, rz: inc }, troncoT));
      }
      yCopa = H * 0.4;
      const R = H * 0.2;
      for (let i = 0; i < 8; i++) {
        const a = entre(r, 0, PI * 2), d = entre(r, 0.1, 0.6) * R;
        copa.push(esfera({ x: Math.cos(a) * d, y: entre(r, 0.3, 1.3) * R * 1.6, z: Math.sin(a) * d, sx: R * 0.9, sy: R * 1.4, sz: R * 0.9, color: verde() }));
      }
    } else if (especie === "cipres") {
      tronco.push(cil({ y: H * 0.08, sx: H * 0.05, sy: H * 0.16, sz: H * 0.05, color: tr }));
      yCopa = H * 0.1;
      const alto = H * 0.9;
      for (let i = 0; i < 5; i++) {
        const k = i / 5;
        copa.push(esfera({ y: alto * (0.2 + k * 0.62), sx: H * 0.2 * (1 - k * 0.6), sy: alto * 0.34, sz: H * 0.2 * (1 - k * 0.6), color: verde() }));
      }
    } else {
      // Sauce: tronco y copa redonda de la que cuelgan tiras.
      const ht = H * 0.5, rt = H * 0.04;
      tronco.push(cil({ y: ht / 2, sx: rt * 2, sy: ht, sz: rt * 2, color: tr }));
      yCopa = ht;
      const R = H * 0.3;
      copa.push(esfera({ y: R * 0.5, sx: R * 2, sy: R * 1.1, sz: R * 2, color: verde(-0.05) }));
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * PI * 2 + entre(r, 0, 0.2), l = entre(r, 0.5, 0.85) * H * 0.5;
        copa.push(caja({ x: Math.cos(a) * R * 0.92, y: R * 0.4 - l / 2, z: Math.sin(a) * R * 0.92, ry: -a, rz: 0.05, sx: 0.03, sy: l, sz: R * 0.35, color: verde(0.05) }));
      }
    }
    return [...tronco, grupo({ id: op.id, y: yCopa }, copa)];
  }

  function arbusto(op) {
    op = op || {};
    const W = num(op.ancho, 1, 0.2, 5), H = num(op.alto, 0.8, 0.2, 4);
    const r = azar(op.semilla || 5);
    const c = color(op.color, "#4F7F3A");
    const out = [];
    for (let i = 0; i < 9; i++) {
      const a = entre(r, 0, PI * 2), d = entre(r, 0, W * 0.3), s = entre(r, 0.45, 0.7);
      out.push(esfera({ x: Math.cos(a) * d, y: H * entre(r, 0.35, 0.6), z: Math.sin(a) * d, sx: W * s, sy: H * s * 1.1, sz: W * s, color: tono(c, entre(r, -0.15, 0.12)) }));
    }
    const flor = color(op.flores, "");
    if (flor) {
      for (let i = 0; i < 24; i++) {
        const a = entre(r, 0, PI * 2), el = entre(r, 0.1, 1.3);
        out.push(esfera({ x: Math.cos(a) * Math.cos(el) * W * 0.46, y: H * 0.5 + Math.sin(el) * H * 0.45, z: Math.sin(a) * Math.cos(el) * W * 0.46, sx: 0.06, sy: 0.06, sz: 0.06, color: tono(flor, entre(r, -0.1, 0.15)) }));
      }
    }
    return out;
  }

  function seto(op) {
    op = op || {};
    const L = num(op.largo, 1.6, 0.3, 40), H = num(op.alto, 0.9, 0.2, 4), E = num(op.espesor, 0.6, 0.2, 3);
    const c = color(op.color, "#3E6B34");
    const r = azar(op.semilla || 9);
    const out = [caja({ y: H / 2, sx: L, sy: H, sz: E, color: c, "border-radius": Math.min(0.15, E * 0.25) })];
    // Bultos de hojas que rompen la caja: arriba y en las dos caras.
    const n = Math.round(L * 7);
    for (let i = 0; i < n; i++) {
      const x = entre(r, -L / 2 + 0.1, L / 2 - 0.1), s = entre(r, 0.14, 0.26);
      const cara = r();
      if (cara < 0.4) out.push(esfera({ x, y: H - 0.02, z: entre(r, -E / 2 + 0.1, E / 2 - 0.1), sx: s, sy: s * 0.6, sz: s, color: tono(c, entre(r, -0.1, 0.14)) }));
      else out.push(esfera({ x, y: entre(r, 0.15, H - 0.12), z: (cara < 0.7 ? 1 : -1) * E / 2, sx: s, sy: s, sz: s * 0.5, color: tono(c, entre(r, -0.1, 0.14)) }));
    }
    return out;
  }

  function cerco(op) {
    op = op || {};
    const L = num(op.largo, 2, 0.3, 60), H = num(op.alto, 1, 0.3, 3);
    const tipo = elegir(op.tipo, ["estacas", "tablas", "reja", "alambrado"], "estacas");
    const c = color(op.color, tipo === "reja" ? "#1E2226" : tipo === "estacas" ? "#F4F1EA" : "#8A6B4A");
    const out = [];
    const nPostes = Math.max(2, Math.ceil(L / 2) + 1);
    const P = tipo === "reja" ? 0.06 : 0.09;
    for (let i = 0; i < nPostes; i++) {
      const x = -L / 2 + (L * i) / (nPostes - 1);
      out.push(caja({ x, y: (H + 0.08) / 2, sx: P, sy: H + 0.08, sz: P, color: tono(c, -0.08) }));
      if (tipo === "reja") out.push(esfera({ x, y: H + 0.12, sx: 0.09, sy: 0.09, sz: 0.09, color: c }));
      else out.push(triangulo({ x, y: H + 0.08, base: P, alto: 0.06, espesor: P, color: tono(c, -0.08) }));
    }
    if (tipo === "estacas") {
      for (const y of [0.25, H - 0.25]) out.push(caja({ y, z: -0.04, sx: L, sy: 0.07, sz: 0.025, color: tono(c, -0.1) }));
      const n = Math.round(L / 0.12);
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (L * (i + 0.5)) / n;
        out.push(caja({ x, y: (H - 0.08) / 2 + 0.04, sx: 0.07, sy: H - 0.08, sz: 0.02, color: c }));
        out.push(triangulo({ x, y: H - 0.04, base: 0.07, alto: 0.07, espesor: 0.02, color: c }));
      }
    } else if (tipo === "tablas") {
      for (let y = 0.1; y < H - 0.05; y += 0.2) out.push(caja({ y: y + 0.08, z: 0.05, sx: L, sy: 0.16, sz: 0.025, color: tono(c, ((y * 17) % 1) * 0.1 - 0.05) }));
    } else if (tipo === "reja") {
      for (const y of [0.12, H - 0.1]) out.push(caja({ y, sx: L, sy: 0.04, sz: 0.03, color: c }));
      const n = Math.round(L / 0.12);
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (L * (i + 0.5)) / n;
        out.push(cil({ x, y: H / 2 + 0.02, sx: 0.018, sy: H + 0.04, sz: 0.018, color: c }));
        out.push(triangulo({ x, y: H + 0.04, base: 0.05, alto: 0.09, espesor: 0.012, color: color(op.puntas, "#C9A45C") }));
      }
    } else {
      out.push(caja({ y: H - 0.02, sx: L, sy: 0.03, sz: 0.03, color: tono(c, -0.1) }));
      const a = "#9AA0A6";
      for (let y = 0.1; y < H; y += 0.1) out.push(caja({ y, sx: L, sy: 0.006, sz: 0.006, color: a }));
      for (let x = -L / 2 + 0.1; x < L / 2; x += 0.1) out.push(caja({ x, y: H / 2, sx: 0.006, sy: H - 0.04, sz: 0.006, color: a }));
    }
    return out;
  }

  function cantero(op) {
    op = op || {};
    const W = num(op.ancho, 1.2, 0.3, 20), D = num(op.largo, 0.6, 0.3, 20);
    const r = azar(op.semilla || 11);
    const borde = color(op.borde, "#A5553A");
    const flores = (Array.isArray(op.flores) ? op.flores : String(op.flores || "#E63946,#FFD60A,#F4A7C0,#9B5DE5").split(",")).map((c) => color(c.trim(), "#E63946"));
    const out = [];
    for (const [x, z, sx, sz] of [[0, D / 2, W, 0.1], [0, -D / 2, W, 0.1], [W / 2 - 0.05, 0, 0.1, D], [-W / 2 + 0.05, 0, 0.1, D]]) out.push(caja({ x, y: 0.14, z, sx, sy: 0.28, sz, color: tono(borde, entre(r, -0.06, 0.06)) }));
    out.push(caja({ y: 0.23, sx: W - 0.2, sy: 0.04, sz: D - 0.2, color: "#4A3322" }));
    const n = Math.round((W - 0.2) * (D - 0.2) * 40);
    for (let i = 0; i < n; i++) {
      const x = entre(r, -W / 2 + 0.16, W / 2 - 0.16), z = entre(r, -D / 2 + 0.16, D / 2 - 0.16), h = entre(r, 0.12, 0.3);
      const c = flores[Math.floor(r() * flores.length)];
      out.push(cil({ x, y: 0.25 + h / 2, z, sx: 0.01, sy: h, sz: 0.01, color: "#3A7D44" }));
      out.push(caja({ x: x + 0.025, y: 0.25 + h * 0.4, z, ry: entre(r, 0, PI), rz: 0.4, sx: 0.06, sy: 0.006, sz: 0.025, color: "#4C9A55" }));
      out.push(esfera({ x, y: 0.25 + h, z, sx: 0.06, sy: 0.04, sz: 0.06, color: c }));
      out.push(esfera({ x, y: 0.26 + h, z, sx: 0.022, sy: 0.022, sz: 0.022, color: "#FFD60A" }));
    }
    return out;
  }

  // ── Salida ──────────────────────────────────────────────────────────────
  const fmt = (v) => (typeof v === "number" ? (Math.abs(v) < 1e-4 ? "0" : v.toFixed(3).replace(/\.?0+$/, "")) : String(v));
  const escXml = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  /** Los nodos como HSML, con la sangría dada. */
  function aHsml(nodos, sangria) {
    sangria = sangria || "";
    const out = [];
    for (const n of nodos) {
      if (!n || n.t === "prisma") continue; // los prismas sólo existen para fundirse
      const attrs = Object.entries(n.a || {}).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}="${escXml(fmt(v))}"`).join(" ");
      if (n.h && n.h.length) {
        out.push(`${sangria}<${n.t}${attrs ? " " + attrs : ""}>`);
        out.push(aHsml(n.h, sangria + "  "));
        out.push(`${sangria}</${n.t}>`);
      } else out.push(`${sangria}<${n.t}${attrs ? " " + attrs : ""}/>`);
    }
    return out.join("\n");
  }

  /** Los nodos como elementos de verdad, con la función de crear del objeto
   *  (Obj.crear). Devuelve los elementos de primer nivel. */
  function construir(nodos, padre, crear) {
    const out = [];
    for (const n of nodos) {
      if (!n || n.t === "prisma") continue;
      const a = {};
      for (const k in n.a || {}) if (n.a[k] != null && n.a[k] !== "") a[k] = typeof n.a[k] === "number" ? fmt(n.a[k]) : n.a[k];
      const el = crear(n.t, a, padre);
      if (n.h) construir(n.h, el, crear);
      out.push(el);
    }
    return out;
  }

  /** Para un objeto que se rehace entero cuando cambian sus props: devuelve
   *  una función que borra lo que armó la vez anterior y arma lo nuevo. */
  function montar(padre, crear) {
    let hechos = [];
    return (nodos) => {
      for (const el of hechos) el.remove();
      hechos = construir(nodos, padre, crear);
      return hechos;
    };
  }

  /** El siguiente de una lista, dando la vuelta. */
  const siguiente = (lista, actual) => lista[(lista.indexOf(actual) + 1) % lista.length];

  // ── Fundir en una malla ─────────────────────────────────────────────────
  //
  // Miles de <box> son miles de entidades, cada una con su transform, su
  // malla y su material. Para dibujar lo mismo con una entidad, las cajas se
  // pasan a triángulos en un solo buffer (MeshResource, en el cliente): 24
  // vértices y 36 índices por caja, con la normal de cada cara y el color de
  // la caja en cada vértice.
  //
  // Se funden sólo las cajas opacas sin redondeo ni id; lo demás (cilindros,
  // esferas, vidrios, lo que un script busca por id) queda como nodos, en el
  // árbol que se devuelve en `resto`, con los grupos intactos.

  /** Matriz afín 3×4 (fila mayor) de un nodo: T · Rx · Ry · Rz · S, el orden
   *  del motor (Quat::from_euler(EulerRot::XYZ, …)). */
  function matriz(a) {
    const cx = Math.cos(a.rx || 0), sx = Math.sin(a.rx || 0);
    const cy = Math.cos(a.ry || 0), sy = Math.sin(a.ry || 0);
    const cz = Math.cos(a.rz || 0), sz = Math.sin(a.rz || 0);
    // Rx · Ry · Rz
    const r00 = cy * cz, r01 = -cy * sz, r02 = sy;
    const r10 = sx * sy * cz + cx * sz, r11 = -sx * sy * sz + cx * cz, r12 = -sx * cy;
    const r20 = -cx * sy * cz + sx * sz, r21 = cx * sy * sz + sx * cz, r22 = cx * cy;
    const ex = a.sx == null ? 1 : Number(a.sx), ey = a.sy == null ? 1 : Number(a.sy), ez = a.sz == null ? 1 : Number(a.sz);
    return [r00 * ex, r01 * ey, r02 * ez, a.x || 0, r10 * ex, r11 * ey, r12 * ez, a.y || 0, r20 * ex, r21 * ey, r22 * ez, a.z || 0];
  }
  function componer(p, h) {
    const m = new Array(12);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        m[i * 4 + j] = p[i * 4] * h[j] + p[i * 4 + 1] * h[4 + j] + p[i * 4 + 2] * h[8 + j] + (j === 3 ? p[i * 4 + 3] : 0);
      }
    }
    return m;
  }
  const IDENTIDAD = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

  /** sRGB → lineal: el motor espera los colores de vértice en lineal. */
  const lineal = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  // Las seis caras del cubo unidad, cada una con sus cuatro esquinas en
  // sentido antihorario vistas desde afuera, y la normal.
  const CARAS = [
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  ];

  /** Cilindro y esfera unidad como los del motor (main.rs: Cylinder::new(0.5,
   *  1.0) parado en Y, Sphere::new(0.5)), en pocas caras: se ven de lejos y
   *  son cientos. Cada triángulo se orienta hacia afuera mirando su normal
   *  contra el centro, así que no importa en qué orden se armó. */
  //
  // Los vértices se comparten entre triángulos y no llevan normal: las
  // mallas van sin luz, así que un vértice es posición y color y nada más.
  // Con los vértices repetidos por cara una esfera eran 300; así, 70.
  function formaUnidad(v, tris) {
    const I = [];
    for (const [a, b, c] of tris) {
      const A = v[a], B = v[b], C = v[c];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
      const wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (Math.hypot(nx, ny, nz) < 1e-12) continue; // los del polo, degenerados
      const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3, cz = (A[2] + B[2] + C[2]) / 3;
      if (nx * cx + ny * cy + nz * cz >= 0) I.push(a, b, c);
      else I.push(a, c, b);
    }
    return { P: v, I };
  }
  function cilindroUnidad(seg) {
    const v = [], t = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * PI * 2;
      v.push([Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5], [Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5]);
    }
    const abajo = v.push([0, -0.5, 0]) - 1, arriba = v.push([0, 0.5, 0]) - 1;
    for (let j = 0; j < seg; j++) {
      const k = (j + 1) % seg;
      t.push([2 * j, 2 * k, 2 * k + 1], [2 * j, 2 * k + 1, 2 * j + 1]);
      t.push([abajo, 2 * j, 2 * k], [arriba, 2 * j + 1, 2 * k + 1]);
    }
    return formaUnidad(v, t);
  }
  function esferaUnidad(LAT, LON) {
    const v = [], t = [];
    v.push([0, 0.5, 0]);
    for (let i = 1; i < LAT; i++) {
      const th = (i / LAT) * PI;
      for (let j = 0; j < LON; j++) {
        const ph = (j / LON) * PI * 2;
        v.push([Math.sin(th) * Math.cos(ph) * 0.5, Math.cos(th) * 0.5, Math.sin(th) * Math.sin(ph) * 0.5]);
      }
    }
    const sur = v.push([0, -0.5, 0]) - 1;
    const at = (i, j) => 1 + (i - 1) * LON + (j % LON);
    for (let j = 0; j < LON; j++) {
      t.push([0, at(1, j), at(1, j + 1)]);
      t.push([sur, at(LAT - 1, j + 1), at(LAT - 1, j)]);
      for (let i = 1; i < LAT - 1; i++) t.push([at(i, j), at(i + 1, j), at(i, j + 1)], [at(i, j + 1), at(i + 1, j), at(i + 1, j + 1)]);
    }
    return formaUnidad(v, t);
  }
  // Dos detalles: lo que mide menos de 15 cm (una flor, un taco) va con
  // menos caras; de lejos no se nota y son la mayoría.
  const FORMAS = {
    cylinder: [cilindroUnidad(10), cilindroUnidad(5)],
    sphere: [esferaUnidad(6, 10), esferaUnidad(3, 5)],
  };
  const formaDe = (n) => {
    const s = Math.max(Math.abs(Number(n.a.sx ?? 1)), Math.abs(Number(n.a.sy ?? 1)), Math.abs(Number(n.a.sz ?? 1)));
    return FORMAS[n.t][s < 0.15 ? 1 : 0];
  };

  /** Un prisma (el pedazo de una pared recortado por su contorno): el
   *  polígono convexo `pts` en el plano xy, extruido de z - sz/2 a z + sz/2.
   *  Sólo existe para fundirse: no es HSML. */
  function prismaUnidad(n) {
    const k = n.a.pts.length, z = n.a.z || 0, h = n.a.sz / 2;
    const v = [...n.a.pts.map(([x, y]) => [x, y, z + h]), ...n.a.pts.map(([x, y]) => [x, y, z - h])];
    const cx = n.a.pts.reduce((s, p) => s + p[0], 0) / k, cy = n.a.pts.reduce((s, p) => s + p[1], 0) / k;
    const t = [];
    const enterrada = n.r === 1 ? "atras" : n.r === -1 ? "adelante" : "";
    for (let i = 1; i + 1 < k; i++) {
      if (enterrada !== "adelante") t.push([0, i, i + 1]);
      if (enterrada !== "atras") t.push([k, k + i + 1, k + i]);
    }
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k;
      t.push([i, j, k + j], [i, k + j, k + i]);
    }
    // Orientación hacia afuera respecto del centro del prisma (es convexo).
    const I = [];
    for (const [a, b, c] of t) {
      const A = v[a], B = v[b], C = v[c];
      const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      const nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      const mx = (A[0] + B[0] + C[0]) / 3 - cx, my = (A[1] + B[1] + C[1]) / 3 - cy, mz = (A[2] + B[2] + C[2]) / 3 - z;
      if (nx * mx + ny * my + nz * mz >= 0) I.push(a, b, c); else I.push(a, c, b);
    }
    return { P: v, I };
  }

  const fundible = (n) => (n.t === "prisma" ? Array.isArray(n.a.pts) && n.a.pts.length >= 3 : n.t === "box" || n.t === "cylinder" || n.t === "sphere") && !n.h && !n.a.id &&
    !n.a["material-alpha"] && !n.a["border-radius"] && /^#[0-9a-f]{6}$/i.test(String(n.a.color || ""));

  /** Cuántos vértices daría fundir estos nodos (para repartir en mallas). */
  function verticesDe(nodos) {
    let v = 0;
    for (const n of nodos) {
      if (!n) continue;
      if (fundible(n)) v += n.t === "box" ? 8 : n.t === "prisma" ? 2 * n.a.pts.length : formaDe(n).P.length;
      else if (n.h) v += verticesDe(n.h);
    }
    return v;
  }

  /** Cuántos índices daría fundirlos: el motor tiene tope para los dos, y
   *  con las esquinas compartidas se llega antes al de índices (una caja son
   *  8 vértices y 36 índices). */
  function indicesDe(nodos) {
    let v = 0;
    for (const n of nodos) {
      if (!n) continue;
      if (fundible(n)) v += n.t === "box" ? 36 : n.t === "prisma" ? 12 * n.a.pts.length : formaDe(n).I.length;
      else if (n.h) v += indicesDe(n.h);
    }
    return v;
  }
  /** Topes del motor por malla (mesh.rs), con un margen. */
  const TOPE_VERTICES = 250000, TOPE_INDICES = 760000;
  /** Si fundir `nodos` en `acc` pasaría algún tope: hay que entregar antes. */
  const noEntra = (acc, nodos) => acc.P.length / 3 + verticesDe(nodos) > TOPE_VERTICES || acc.I.length + indicesDe(nodos) > TOPE_INDICES;

  /** Funde las cajas de `nodos` (con la transformación `base` encima) en un
   *  acumulador { P, N, C, I } de arrays planos. Devuelve el árbol sin ellas. */
  function fundir(nodos, acc, base) {
    base = base || IDENTIDAD;
    const resto = [];
    for (const n of nodos) {
      if (!n) continue;
      if (fundible(n) && n.t !== "box") {
        // El prisma trae sus puntos en coordenadas de la pared: no tiene
        // transformación propia (y su `sz` es el espesor, no una escala).
        const m = n.t === "prisma" ? base : componer(base, matriz(n.a));
        const [r, g, b] = rgb(n.a.color).map((c) => lineal(c / 255));
        const F = n.t === "prisma" ? prismaUnidad(n) : formaDe(n);
        const i0 = acc.P.length / 3;
        for (const [x, y, z] of F.P) {
          acc.P.push(m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]);
          acc.C.push(r, g, b, 1);
        }
        for (const i of F.I) acc.I.push(i0 + i);
        acc.cajas++;
      } else if (fundible(n)) {
        const m = componer(base, matriz(n.a));
        const [r, g, b] = rgb(n.a.color).map((c) => lineal(c / 255));
        // Una pieza de relieve (un ladrillo, una tabla) está pegada a la
        // pared: la cara que da contra ella no se ve nunca y se ahorra. En
        // las de adelante es la de -z; en las de atrás (caras: 2), la de +z.
        const enterrada = n.r === 1 ? 1 : n.r === -1 ? 0 : -1;
        // Sin luz no hace falta una normal por cara: las ocho esquinas se
        // comparten entre las caras que las tocan.
        const i0 = acc.P.length / 3;
        for (let k = 0; k < 8; k++) {
          const x = k & 4 ? 0.5 : -0.5, y = k & 2 ? 0.5 : -0.5, z = k & 1 ? 0.5 : -0.5;
          acc.P.push(m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]);
          acc.C.push(r, g, b, 1);
        }
        for (let k = 0; k < 6; k++) {
          if (k === enterrada) continue;
          const [a, b2, c, d] = CARAS[k].v.map(([x, y, z]) => i0 + ((x > 0 ? 4 : 0) | (y > 0 ? 2 : 0) | (z > 0 ? 1 : 0)));
          acc.I.push(a, b2, c, a, c, d);
        }
        acc.cajas++;
      } else if (n.h) {
        const h = fundir(n.h, acc, componer(base, matriz(n.a)));
        // Un grupo que quedó vacío no hace falta; uno con id sí (lo buscan).
        if (h.length || n.a.id) resto.push(Object.assign({}, n, { h }));
      } else {
        resto.push(n);
      }
    }
    return resto;
  }
  /** Lo contrario de lo que devuelve fundir: el árbol con sólo lo que se
   *  funde. Es lo que hay que armar como nodos si la malla no se pudo crear. */
  function soloFundibles(nodos) {
    const out = [];
    for (const n of nodos) {
      if (!n) continue;
      if (fundible(n)) out.push(n);
      else if (n.h) {
        const h = soloFundibles(n.h);
        if (h.length) out.push(Object.assign({}, n, { a: Object.assign({}, n.a, { id: undefined }), h }));
      }
    }
    return out;
  }
  const acumulador = () => ({ P: [], C: [], I: [], cajas: 0 });
  /** El acumulador como buffers tipados, listos para MeshResource.create.
   *  Sin normales: las mallas van sin luz, y si faltan el motor las calcula
   *  (dynamic_mesh.rs) sin que viajen ni cuenten para el cupo. */
  const buffers = (acc) => ({
    positions: new Float32Array(acc.P), colors: new Float32Array(acc.C), indices: new Uint32Array(acc.I),
  });
  /** Lo que una malla le cuenta al cupo del motor (mesh.rs): los bytes que
   *  viajan más las normales que genera él cuando no vienen (tantas como
   *  posiciones). */
  const bytesDe = (b) => 2 * b.positions.byteLength + b.colors.byteLength + b.indices.byteLength;

  /** Cuántos nodos hay, contando los de adentro. */
  const contar = (nodos) => nodos.reduce((s, n) => s + 1 + (n && n.h ? contar(n.h) : 0), 0);

  return {
    azar, tono, mezcla, color, num, triangulo, cuna, grupo, caja, cil, esfera,
    MATERIALES, PISOS, ESPECIES,
    pared, piso, columna, baranda, escalera,
    puerta, ventana, porton, techo, toldo,
    arbol, arbusto, seto, cerco, cantero,
    aHsml, construir, montar, siguiente, contar,
    matriz, componer, fundir, soloFundibles, verticesDe, indicesDe, noEntra, acumulador, buffers, bytesDe,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Obra;
// Un `const` de un <script> no se ve desde los otros del documento: se deja
// también en globalThis para quien lo cargue aparte (obra_calle.js, una sonda).
else globalThis.Obra = Obra;

;
// Lo pesado de la calle, en mallas.
//
// El servidor lo sirve con _obra.js adelante (/obra_calle.js = _obra.js +
// este archivo). La calle no trae como nodos lo que tiene muchas piezas:
//
//   CALLE.fachadas  (?detalle=alto_mesh) la receta de cada fachada de
//                   ladrillo. Cada una se monta como un <include> de
//                   /objetos/pared.hsml en modo mesh: la pared arma sus miles
//                   de ladrillos y los funde en su propio isolate, con su
//                   propio cupo de mallas. Se montan de a una, las más
//                   cercanas primero, porque montar documentos es lo que más
//                   le cuesta al motor (bevy_oxr/docs/costo_de_montaje.md).
//   CALLE.piezas    (todos los modos salvo alto) edificios, árboles,
//                   canteros y setos ya armados, como datos, en coordenadas
//                   del mundo. Son livianos: se funden acá, en una o dos
//                   mallas del documento de la calle.
//
// Topes del motor por isolate (crates/js_runtime/src/mesh.rs): 262.144
// vértices y 786.432 índices por malla, 64 MB y 128 mallas entre todas. Si
// una malla de acá no se puede crear, esa tanda se arma como nodos.
//
// Las mallas van sin luz (material-unlit), como los <box> del DOM (render.rs
// los crea unlit).
(function arranque() {
  const C = globalThis.CALLE;
  const Obra = globalThis.Obra;
  if (!C || !Obra || typeof MeshResource === "undefined") return void requestAnimationFrame(arranque);
  const raiz = hiperspace.dimention;
  const crear = (tag, attrs, padre) => {
    const el = raiz.createElement(tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    (padre || raiz).appendChild(el);
    return el;
  };
  const estado = (a, b) => {
    const e1 = raiz.getElementById("obra_estado"), e2 = raiz.getElementById("obra_estado2");
    if (e1 && a != null) e1.setAttribute("value", a);
    if (e2 && b != null) e2.setAttribute("value", b);
  };
  const n = (x) => Math.round(x).toLocaleString("es");

  // ── Las fachadas: una pared en malla por include ─────────────────────────
  const fachadas = (C.fachadas || []).slice();
  const paredes = { montadas: 0, armadas: 0, piezas: 0, vertices: 0, ms: 0, conNodos: 0 };
  function dondeEstoy() {
    try {
      const p = typeof raiz.readViewerPose === "function" ? raiz.readViewerPose() : null;
      return p && Number.isFinite(p.px) ? { x: p.px, z: p.pz } : null;
    } catch (e) { return null; }
  }
  function montarPared(f) {
    const lugar = crear("group", { x: f.x, z: f.z, ry: f.ry });
    const frente = crear("group", { z: 0.1 }, lugar);
    const inc = raiz.createElement("include");
    inc.setAttribute("src", C.base + "/objetos/pared.hsml");
    inc.setAttribute("events", "armada");
    inc.setAttribute("props", JSON.stringify(Object.assign({}, f.pared, { modo: "mesh", caras: 1 })));
    const pared = { inc, avisada: false, pedidos: 0 };
    todas.push(pared);
    inc.addEventListener("component:armada", (e) => {
      const d = e.detail || {};
      if (pared.avisada) return;
      pared.avisada = true;
      paredes.armadas++;
      if (d.modo === "mesh") { paredes.piezas += d.piezas || 0; paredes.vertices += d.vertices || 0; }
      else paredes.conNodos++;
      paredes.ms += d.ms || 0;
      informar();
    });
    frente.appendChild(inc);
    paredes.montadas++;
  }
  // El primer aviso de una pared puede salir antes de que su canal esté
  // conectado (se pierde): a las que no avisaron se les pide cada segundo,
  // hasta diez veces.
  const todas = [];
  const preguntar = setInterval(() => {
    let faltan = 0;
    for (const p of todas) {
      if (p.avisada || p.pedidos >= 10) continue;
      faltan++;
      p.pedidos++;
      try { p.inc.send("informar"); } catch (e) { /* todavía sin canal */ }
    }
    if (!faltan && !fachadas.length) clearInterval(preguntar);
  }, 1000);
  function siguientePared() {
    if (!fachadas.length) return;
    const p = dondeEstoy() || { x: 0, z: 7 };
    fachadas.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    montarPared(fachadas.shift());
    informar();
    if (fachadas.length) setTimeout(siguientePared, 90);
  }

  // ── Las piezas: fundidas acá ─────────────────────────────────────────────
  const cola = (C.piezas || []).map((p) => [p]);
  const propias = { mallas: 0, nodos: 0, vertices: 0, sueltos: 0, comoNodos: 0, ms: 0, listo: !cola.length };
  let acc = Obra.acumulador(), tanda = [], i = 0, fallo = null;
  function entregar() {
    if (!acc.I.length) return;
    const b = Obra.buffers(acc);
    try {
      if (fallo) throw new Error(fallo);
      const m = MeshResource.create(b);
      const el = crear("model", { id: "obra_malla_" + propias.mallas, touchable: "false", "material-unlit": "true" });
      el.src = m.src;
      propias.mallas++;
      propias.nodos += acc.cajas;
      propias.vertices += b.positions.length / 3;
    } catch (e) {
      if (!fallo) console.error("[obra] MeshResource: " + (e && e.message || e) + " — sigo con nodos");
      fallo = String(e && e.message || e);
      for (const nodos of tanda) {
        const f = Obra.soloFundibles(nodos);
        Obra.construir(f, raiz, crear);
        propias.comoNodos += Obra.contar(f);
      }
    }
    acc = Obra.acumulador();
    tanda = [];
  }
  function paso() {
    const antes = performance.now();
    while (i < cola.length && performance.now() - antes < 12) {
      const nodos = cola[i++];
      if (Obra.noEntra(acc, nodos)) entregar();
      const resto = Obra.fundir(nodos, acc);
      tanda.push(nodos);
      propias.sueltos += Obra.contar(resto);
      Obra.construir(resto, raiz, crear);
    }
    propias.ms += performance.now() - antes;
    if (i < cola.length) { informar(); return void requestAnimationFrame(paso); }
    entregar();
    propias.listo = true;
    informar();
    console.log("[obra] piezas: " + cola.length + " en " + propias.mallas + " mallas, " + n(propias.vertices) + " vértices, " + Math.round(propias.ms) + " ms" +
      (propias.comoNodos ? ", " + n(propias.comoNodos) + " como nodos (sin cupo)" : ""));
  }

  function informar() {
    const partes = [];
    if (C.fachadas && C.fachadas.length) {
      partes.push(paredes.armadas + "/" + C.fachadas.length + " fachadas: " + n(paredes.piezas) + " ladrillos, una malla por pared");
    }
    if (cola.length) partes.push(propias.listo ? cola.length + " piezas en " + propias.mallas + (propias.mallas === 1 ? " malla" : " mallas") : "fundiendo " + i + "/" + cola.length);
    const detalle = [];
    if (paredes.armadas) detalle.push(n(paredes.vertices) + " vértices en las paredes, " + Math.round(paredes.ms / paredes.armadas) + " ms cada una");
    if (propias.listo && cola.length) detalle.push(n(propias.vertices) + " acá");
    if (paredes.conNodos) detalle.push(paredes.conNodos + " paredes sin cupo, con nodos");
    if (propias.comoNodos) detalle.push(n(propias.comoNodos) + " nodos sin cupo");
    estado(partes.join(" · "), detalle.join(" · "));
    if (paredes.armadas === (C.fachadas || []).length && propias.listo && paredes.armadas) {
      console.log("[obra] fachadas: " + paredes.armadas + " paredes en su propio isolate, " + n(paredes.piezas) + " ladrillos, " + n(paredes.vertices) + " vértices");
    }
  }

  if (cola.length) requestAnimationFrame(paso);
  if (fachadas.length) siguientePared();
  informar();
})();
