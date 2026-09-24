// _vr.js — las manos: piezas que se aprietan, se giran, se tiran y se llevan.
//
// El servidor lo sirve después de _base.js y antes del script del objeto
// (/objetos/x.js = _base.js + _vr.js + x.js). Es el Panel del kit de la nave
// (server_nave/public/kit.js) llevado a los objetos de la calle: una sola capa
// recibe los `posemove`, pasa cada mano a coordenadas del objeto y se la da a
// la pieza más cercana cuando se aprieta el grip o el gatillo. Lo que se
// empuja sin agarrar (un botón con la punta del mando) se revisa en cada pose.
//
// Las piezas no dibujan nada: se enganchan a la geometría que el objeto ya
// tiene y le avisan con callbacks en su idioma (se apretó, giró tanto, quedó
// a tal fracción). Así una manivela es la misma en la rueda de los bloques,
// en la caja sorpresa y en la caja de música, y un botón es el mismo en el
// pulsador, el timbre y la tostadora.
//
//   const M = Obj.manos();                       // la capa (una por objeto)
//   M.boton({ centro, normal, radio, alApretar, alSoltar, nodo })
//   M.manivela({ centro, eje, arriba, radio, angulo: () => a, alGirar(d) })
//   M.perilla({ centro, eje, arriba, radio, alGirar(d) })
//   M.palanca({ pivote, eje, brazo, largo, min, max, angulo: () => a, alMover(a), alSoltar(a) })
//   M.puerta({ pivote, eje, brazo, largo, alto, max, angulo: () => a, mover(a), soltar(abierta, a) })
//   M.corredera({ desde, hasta, t: () => t, alMover(t), alSoltar(t) })
//   M.agarrable({ cerca(p), tomar(p, lado, m), mover(p, lado, m), soltar(p, v, lado) })
//
// Todo en coordenadas del objeto (las de su <space>): metros, x a la derecha,
// y arriba, z hacia afuera. Los giros son positivos en el sentido del reloj
// mirando la pieza desde la punta de su `eje` (desde donde está el visitante
// si el eje apunta hacia él).
//
// La zona: si el objeto tiene un <posezone id="zona">, se usa ésa (y las que
// se pasen con M.zona(el)). Si no tiene, la capa arma una que cubre todas sus
// piezas con 25 cm de margen. Para recibir las manos el objeto necesita el
// recurso `read_pose_stream`.
(() => {
  const root = Obj.root;
  const APRETAR = 0.6, AFLOJAR = 0.35;   // histéresis de grip y gatillo
  const VIEJA_MS = 400;                  // una mano que no manda más se da por soltada
  const PUNTA = 0.05;                    // de la empuñadura a la punta del mando

  // ── Vectores ────────────────────────────────────────────────────────────
  const v3 = (x, y, z) => ({ x, y, z });
  const V = (a) => v3(Number(a && a.x) || 0, Number(a && a.y) || 0, Number(a && a.z) || 0);
  const suma = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
  const resta = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const por = (a, k) => v3(a.x * k, a.y * k, a.z * k);
  const punto = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cruz = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const largo = (a) => Math.hypot(a.x, a.y, a.z);
  const unit = (a, def) => { const l = largo(a); return l > 1e-9 ? por(a, 1 / l) : (def || v3(0, 0, 1)); };
  const acotar = (v, a, b) => Math.max(a, Math.min(b, v));
  const dif = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const ahora = () => performance.now();

  /** Una base del plano de giro: w el eje, u "arriba" y r "derecha" mirando
   *  desde la punta del eje. Un ángulo es atan2(·r, ·u): 0 arriba, positivo
   *  hacia la derecha (el sentido del reloj). */
  function base(eje, arriba) {
    const w = unit(V(eje || v3(0, 0, 1)));
    let a = arriba ? V(arriba) : (Math.abs(w.y) > 0.9 ? v3(0, 0, -1) : v3(0, 1, 0));
    a = resta(a, por(w, punto(a, w)));
    const u = unit(a, Math.abs(w.y) > 0.9 ? v3(0, 0, -1) : v3(0, 1, 0));
    const r = cruz(u, w);
    return { w, u, r };
  }
  /** Rx·Ry·Rz, como Quat::from_euler(XYZ) del motor. */
  function qDeEuler(r) {
    const q = (e, a) => Obj.qEje(e, a);
    return Obj.qMul(Obj.qMul(q(v3(1, 0, 0), r.x || 0), q(v3(0, 1, 0), r.y || 0)), q(v3(0, 0, 1), r.z || 0));
  }
  /** Posición, giro o escala local de un nodo, leídos ahora (los proxies de
   *  position/rotation/scale guardan el primer valor que leyeron). */
  function vec(el, op, prop, def) {
    try {
      const f = typeof Deno !== "undefined" && Deno.core && Deno.core.ops && Deno.core.ops[op];
      if (f && el.nodeId != null && el.nodeId >= 0) {
        const a = f(el.nodeId);
        if (a && a.length >= 3 && Number.isFinite(a[0])) return v3(a[0], a[1], a[2]);
      }
      const p = el[prop];
      if (p && Number.isFinite(p.x)) return v3(p.x, p.y, p.z);
    } catch (e) { /* nodo sin resolver */ }
    return def;
  }
  // Un objeto que escucha sus propios posemove maneja sus manos: sus blancos
  // de toque no se aprietan solos (sería apretar dos veces).
  let manual = false;
  let oyenteCapa = null;
  try {
    let due = null;
    for (let p = Object.getPrototypeOf(root); p; p = Object.getPrototypeOf(p)) {
      if (Object.prototype.hasOwnProperty.call(p, "addEventListener")) { due = p; break; }
    }
    if (due) {
      const original = due.addEventListener;
      due.addEventListener = function (tipo, fn) {
        if (String(tipo).toLowerCase() === "posemove" && fn !== oyenteCapa && !(fn && fn.__deLaBase) && String(this.tagName || "").toLowerCase() === "posezone") manual = true;
        return original.apply(this, arguments);
      };
    }
  } catch (e) { /* sin prototipo */ }
  const anguloEn = (b, v) => Math.atan2(punto(v, b.r), punto(v, b.u));
  const radialEn = (b, v) => Math.hypot(punto(v, b.r), punto(v, b.u));
  const enPlano = (b, a, radio) => suma(por(b.u, Math.cos(a) * radio), por(b.r, Math.sin(a) * radio));

  // ── La capa ─────────────────────────────────────────────────────────────
  let capa = null;
  function manos() {
    if (capa) return capa;
    const piezas = [];
    const zonas = new Set();
    const estado = { left: null, right: null };
    let donde = null;
    let zonaPropia = null, zonaPendiente = false;

    const esHijaDeRaiz = (z) => { try { return !!z.parent && z.parent.nodeId === root.nodeId; } catch (e) { return false; } };

    /** La pose de la mano en coordenadas del objeto: dónde está, hacia dónde
     *  apunta y un vector de costado que gira con la muñeca.
     *
     *  El motor apunta el mando por el -Y de su giro (touch.rs,
     *  controller_aim_direction), así que girar la muñeca es girar alrededor
     *  de Y: el Y no cambia. Lo que gira es lo de costado, el X. */
    function pose(e, zona) {
      let p, d, arriba;
      if (Number.isFinite(e.localX) && esHijaDeRaiz(zona)) {
        p = v3(e.localX, e.localY, e.localZ);
        d = Number.isFinite(e.ldx) ? unit(v3(e.ldx, e.ldy, e.ldz), v3(0, 0, -1)) : null;
        if (Number.isFinite(e.lqw)) arriba = Obj.rotarV({ x: e.lqx, y: e.lqy, z: e.lqz, w: e.lqw }, v3(1, 0, 0));
      }
      if (!p) {
        donde = donde || Obj.marco();
        p = donde.aLocal(v3(e.px, e.py, e.pz));
      }
      if (!d && Number.isFinite(e.dx)) { donde = donde || Obj.marco(); d = unit(donde.dirLocal(v3(e.dx, e.dy, e.dz)), v3(0, 0, -1)); }
      if (!arriba && Number.isFinite(e.qw)) {
        donde = donde || Obj.marco();
        arriba = donde.dirLocal(Obj.rotarV({ x: e.qx, y: e.qy, z: e.qz, w: e.qw }, v3(1, 0, 0)));
      }
      return { p, d: d || v3(0, 0, -1), muneca: arriba ? unit(arriba, v3(1, 0, 0)) : v3(1, 0, 0) };
    }

    function nueva(lado) {
      return {
        lado, pos: null, punta: null, dir: v3(0, 0, -1), muneca: v3(1, 0, 0), evento: null,
        grip: false, gatillo: false, t: 0, pieza: null, hist: [],
        /** m/s en coordenadas del objeto, de los últimos 90 ms. */
        vel() {
          const h = this.hist;
          if (h.length < 2) return v3(0, 0, 0);
          const b = h[h.length - 1];
          let a = h[0];
          for (const x of h) if (b.t - x.t <= 90) { a = x; break; }
          const dt = Math.max(0.001, (b.t - a.t) / 1000);
          return v3((b.x - a.x) / dt, (b.y - a.y) / dt, (b.z - a.z) / dt);
        },
        get apretada() { return this.grip || this.gatillo; },
      };
    }

    function tomar(m, porGatillo) {
      let mejor = null, dist = Infinity;
      for (const p of piezas) {
        if (p.habilitada === false || !p.agarrable) continue;
        if (p.tomadaPor && p.tomadaPor !== m.lado) continue;
        if (porGatillo && p.gatillo === false) continue;
        let d = Infinity;
        try { d = p.agarrable(m); } catch (err) { console.error(err); }
        // Un blanco táctil sólo si no hay ninguna pieza de verdad al alcance.
        if (p.tipo === "tactil" && d < Infinity) d += 1000;
        if (d < dist) { dist = d; mejor = p; }
      }
      if (!mejor) return;
      m.pieza = mejor;
      mejor.tomadaPor = m.lado;
      try { mejor.tomar(m); } catch (err) { console.error(err); }
    }
    function soltar(m) {
      const p = m.pieza;
      m.pieza = null;
      if (!p) return;
      p.tomadaPor = null;
      try { p.soltar && p.soltar(m); } catch (err) { console.error(err); }
    }

    function recibir(e, zona) {
      if (!e) return;
      const lado = e.hand === "left" ? "left" : "right";
      const m = estado[lado] || (estado[lado] = nueva(lado));
      const t = ahora();
      const ps = pose(e, zona);
      // La misma mano puede estar en dos zonas: una sola pose por cuadro.
      if (m.t === t && m.pos && Math.abs(m.pos.x - ps.p.x) < 1e-6) return;
      m.pos = ps.p; m.dir = ps.d; m.muneca = ps.muneca; m.evento = e; m.t = t;
      m.punta = suma(ps.p, por(ps.d, PUNTA));
      m.hist.push({ x: ps.p.x, y: ps.p.y, z: ps.p.z, t });
      while (m.hist.length > 10) m.hist.shift();
      const g = e.grip || 0, tr = e.trigger || 0;
      const antes = m.apretada;
      if (!m.grip && g > APRETAR) m.grip = true; else if (m.grip && g < AFLOJAR) m.grip = false;
      if (!m.gatillo && tr > APRETAR) m.gatillo = true; else if (m.gatillo && tr < AFLOJAR) m.gatillo = false;
      const despues = m.apretada;
      if (!antes && despues) tomar(m, m.gatillo && !m.grip);
      else if (antes && !despues) soltar(m);
      else if (m.pieza) { try { m.pieza.arrastrar(m); } catch (err) { console.error(err); } }
      for (const p of piezas) {
        if (p.rozar && p !== m.pieza && p.habilitada !== false) { try { p.rozar(m); } catch (err) { console.error(err); } }
      }
    }

    function zona(el) {
      if (!el || zonas.has(el)) return;
      zonas.add(el);
      const f = (e) => recibir(e, el);
      oyenteCapa = f;
      el.addEventListener("posemove", f);
      oyenteCapa = null;
    }

    // Las manos que dejan de llegar: se sueltan y dejan de empujar.
    setInterval(() => {
      const t = ahora();
      for (const lado of ["left", "right"]) {
        const m = estado[lado];
        if (!m || t - m.t <= VIEJA_MS) continue;
        soltar(m);
        m.pos = m.punta = null;
        m.grip = m.gatillo = false;
        for (const p of piezas) if (p.rozar) { try { p.rozar(m); } catch (err) { console.error(err); } }
        estado[lado] = null;
      }
    }, 150);

    /** Sin zona propia: una que cubra todas las piezas, con margen. */
    function armarZona() {
      zonaPendiente = false;
      if (zonas.size) return;
      let lo = null, hi = null;
      for (const p of piezas) {
        const c = p.caja && p.caja();
        if (!c) continue;
        lo = lo ? v3(Math.min(lo.x, c.lo.x), Math.min(lo.y, c.lo.y), Math.min(lo.z, c.lo.z)) : V(c.lo);
        hi = hi ? v3(Math.max(hi.x, c.hi.x), Math.max(hi.y, c.hi.y), Math.max(hi.z, c.hi.z)) : V(c.hi);
      }
      if (!lo) return;
      const M = 0.25;
      zonaPropia = Obj.crear("posezone", {
        id: "zona_manos",
        x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2,
        sx: hi.x - lo.x + 2 * M, sy: hi.y - lo.y + 2 * M, sz: hi.z - lo.z + 2 * M, visible: "false",
      });
      zona(zonaPropia);
    }

    function agregar(p) {
      piezas.push(p);
      if (!zonas.size && !zonaPendiente) { zonaPendiente = true; setTimeout(armarZona, 0); }
      return p;
    }
    const cajaDe = (c, r) => ({ lo: v3(c.x - r, c.y - r, c.z - r), hi: v3(c.x + r, c.y + r, c.z + r) });

    // ── Botón ─────────────────────────────────────────────────────────────
    /** Se aprieta empujando con el mando (la punta o la empuñadura) o con el
     *  grip o el gatillo con la mano encima; se suelta al sacar la mano.
     *  o.centro   la cara de la tapa, en reposo
     *  o.normal   hacia dónde mira la tapa (0, 0, 1)
     *  o.radio    redondo; o.ancho y o.alto con o.arriba, rectangular
     *  o.recorrido cuánto se hunde (1 cm)
     *  o.margen   cuánto más allá del borde cuenta (1.2 cm; menos en un
     *             teclado, donde las teclas están pegadas)
     *  o.nodo     un nodo que se hunde con el botón (opcional)
     *  o.alApretar(lado), o.alSoltar(lado)
     *  o.alHundir(k)  mientras lo empujan: cuánto (0 arriba, 1 el recorrido
     *                 entero; null cuando ninguna mano lo toca). Para que la
     *                 tapa siga al dedo antes de disparar. */
    function boton(o) {
      const c = V(o.centro), n = unit(V(o.normal || v3(0, 0, 1)));
      const b = base(n, o.arriba);
      const rec = o.recorrido || 0.01;
      const radio = o.radio || 0.03;
      const rect = o.ancho || o.alto;
      const an = o.ancho || radio * 2, al = o.alto || radio * 2;
      const nodoBase = o.nodo ? V(o.nodo.position) : null;
      const mg = o.margen == null ? 0.012 : o.margen;
      const encima = (q) => {
        const rel = resta(q, c);
        const h = punto(rel, n);
        const lat = resta(rel, por(n, h));
        const ok = rect
          ? Math.abs(punto(lat, b.r)) < an / 2 + mg && Math.abs(punto(lat, b.u)) < al / 2 + mg
          : largo(lat) < radio + mg;
        return { ok, h, lat: largo(lat) };
      };
      const hondos = { left: 0, right: 0 };
      let hundAntes = null;
      const p = {
        tipo: "boton", apretado: false, porMano: null, habilitada: true, tomadaPor: null,
        caja: () => cajaDe(c, Math.max(an, al) / 2 + 0.02),
        _apretar(lado) {
          if (this.apretado) return;
          this.apretado = true;
          if (o.nodo && nodoBase) o.nodo.position = suma(nodoBase, por(n, -rec));
          if (o.alApretar) o.alApretar(lado);
        },
        _soltar(lado) {
          if (!this.apretado) return;
          this.apretado = false;
          if (o.nodo && nodoBase) o.nodo.position = nodoBase;
          if (o.alSoltar) o.alSoltar(lado);
        },
        agarrable(m) {
          const e = encima(m.pos);
          const et = encima(m.punta);
          const mejor = [e, et].filter((x) => x.lat < Math.max(an, al) / 2 + 0.04 && x.h < 0.1 && x.h > -0.05);
          if (!mejor.length) return Infinity;
          return Math.min(...mejor.map((x) => x.lat + Math.max(0, x.h - 0.03)));
        },
        tomar(m) { this.porMano = "agarre"; this._apretar(m.lado); },
        arrastrar() {},
        soltar(m) { if (this.porMano === "agarre") { this.porMano = null; this._soltar(m.lado); } },
        rozar(m) {
          if (this.porMano === "agarre") return;
          let hondo = 0;
          if (m.pos) {
            for (const q of [m.pos, m.punta]) {
              const e = encima(q);
              // Por delante hasta 6 cm atrás: la mano que llega de atrás de la
              // pared no aprieta nada.
              if (e.ok && e.h > -0.06) hondo = Math.max(hondo, -e.h / rec);
            }
          }
          hondos[m.lado] = hondo;
          if (o.alHundir) {
            const k = Math.max(hondos.left, hondos.right);
            const v = k > 0 ? Math.min(1, k) : null;
            if (v !== hundAntes) { hundAntes = v; o.alHundir(v); }
          }
          if (!this.apretado && hondo > 0.6) { this.porMano = m.lado; this._apretar(m.lado); }
          else if (this.apretado && this.porMano === m.lado && hondo < 0.25) { this.porMano = null; this._soltar(m.lado); }
        },
      };
      return agregar(p);
    }

    // ── Manivela ──────────────────────────────────────────────────────────
    /** Algo que da vueltas: se agarra la manija (o el aro) y la mano, al girar
     *  alrededor del centro, lo lleva. La muñeca también sirve cuando la mano
     *  está casi en el centro.
     *  o.centro, o.eje, o.arriba    el plano del giro
     *  o.radio      a qué distancia del centro está la manija
     *  o.salida     cuánto sobresale la manija sobre el eje (0)
     *  o.angulo()   dónde está ahora (para saber dónde está la manija)
     *  o.aro        true: también se agarra por el borde
     *  o.alcance    a qué distancia de la manija se la toma (7 cm)
     *  o.alTomar(), o.alGirar(d, lado), o.alSoltar() */
    function manivela(o) {
      const c = V(o.centro), b = base(o.eje, o.arriba);
      const R = o.radio || 0.05, sal = o.salida || 0;
      const alc = o.alcance || 0.07;
      const ang = () => (o.angulo ? Number(o.angulo()) || 0 : 0);
      const manija = () => suma(suma(c, enPlano(b, ang(), R)), por(b.w, sal));
      let antes = null, giroAntes = null;
      const p = {
        tipo: "manivela", habilitada: true, tomadaPor: null,
        caja: () => cajaDe(c, R + 0.04 + Math.abs(sal)),
        manija,
        agarrable(m) {
          const d = largo(resta(m.pos, manija()));
          if (d < alc) return d;
          if (o.aro) {
            const rel = resta(m.pos, c);
            const ax = punto(rel, b.w), ra = radialEn(b, rel);
            if (Math.abs(ra - R) < 0.045 && Math.abs(ax - sal) < 0.07) return 0.03 + Math.abs(ra - R);
          }
          return Infinity;
        },
        tomar(m) {
          const rel = resta(m.pos, c);
          antes = radialEn(b, rel) > 0.015 ? anguloEn(b, rel) : null;
          giroAntes = anguloEn(b, m.muneca);
          if (o.alTomar) o.alTomar(m.lado);
        },
        arrastrar(m) {
          const rel = resta(m.pos, c);
          const r = radialEn(b, rel);
          const a = r > 0.015 ? anguloEn(b, rel) : null;
          const g = radialEn(b, m.muneca) > 0.25 ? anguloEn(b, m.muneca) : null;
          let d = 0;
          if (a !== null && antes !== null && r > 0.025) d = dif(a, antes);
          else if (g !== null && giroAntes !== null) d = dif(g, giroAntes);
          antes = a; giroAntes = g;
          if (d && o.alGirar) o.alGirar(d, m.lado);
        },
        soltar(m) { antes = giroAntes = null; if (o.alSoltar) o.alSoltar(m.lado); },
      };
      return agregar(p);
    }

    // ── Perilla ───────────────────────────────────────────────────────────
    /** Se agarra entera y se gira con la muñeca (como una perilla de verdad).
     *  Si el mando apunta de lado y no hay giro que leer, vale la vuelta de la
     *  mano alrededor del centro.
     *  o.centro, o.eje, o.arriba, o.radio, o.alTomar(), o.alGirar(d), o.alSoltar() */
    function perilla(o) {
      const c = V(o.centro), b = base(o.eje, o.arriba);
      const R = o.radio || 0.03;
      let giroAntes = null, antes = null;
      const p = {
        tipo: "perilla", habilitada: true, tomadaPor: null,
        caja: () => cajaDe(c, R + 0.03),
        agarrable(m) {
          const rel = resta(m.pos, c);
          const ax = punto(rel, b.w), ra = radialEn(b, rel);
          const relT = resta(m.punta, c);
          const axT = punto(relT, b.w), raT = radialEn(b, relT);
          const ok = (ra < R + 0.035 && ax > -0.03 && ax < 0.1) || (raT < R + 0.025 && axT > -0.03 && axT < 0.06);
          return ok ? Math.min(ra, raT) + Math.max(0, ax - 0.03) : Infinity;
        },
        tomar(m) {
          giroAntes = radialEn(b, m.muneca) > 0.25 ? anguloEn(b, m.muneca) : null;
          const rel = resta(m.pos, c);
          antes = radialEn(b, rel) > 0.02 ? anguloEn(b, rel) : null;
          if (o.alTomar) o.alTomar(m.lado);
        },
        arrastrar(m) {
          const g = radialEn(b, m.muneca) > 0.25 ? anguloEn(b, m.muneca) : null;
          const rel = resta(m.pos, c);
          const a = radialEn(b, rel) > 0.02 ? anguloEn(b, rel) : null;
          let d = 0;
          if (g !== null && giroAntes !== null) d = dif(g, giroAntes);
          else if (a !== null && antes !== null && radialEn(b, rel) > 0.03) d = dif(a, antes);
          giroAntes = g; antes = a;
          if (d && o.alGirar) o.alGirar(d, m.lado);
        },
        soltar(m) { giroAntes = antes = null; if (o.alSoltar) o.alSoltar(m.lado); },
      };
      return agregar(p);
    }

    // ── Palanca / bisagra ─────────────────────────────────────────────────
    /** Algo que gira en un eje entre dos topes y sigue a la mano: una palanca,
     *  una puerta, una tapa, un cajón que se abre como tapa.
     *  o.pivote, o.eje        el eje (positivo según la mano derecha)
     *  o.brazo                hacia dónde apunta en el ángulo 0 (⊥ al eje)
     *  o.largo                dónde está el mango, desde el pivote
     *  o.min, o.max           los topes (radianes)
     *  o.angulo()             dónde está ahora
     *  o.todo                 true: se agarra por cualquier punto del brazo
     *  o.alto, o.centroAlto   con todo: el brazo es una hoja de ese alto a lo
     *                         largo del eje (una puerta), centrada en centroAlto
     *  o.alcance              a qué distancia del mango (8 cm)
     *  o.alTomar(), o.alMover(a, lado), o.alSoltar(a, v) (v: rad/s al soltar) */
    function palanca(o) {
      const pv = V(o.pivote), w = unit(V(o.eje || v3(1, 0, 0)));
      let br = V(o.brazo || v3(0, 1, 0));
      br = unit(resta(br, por(w, punto(br, w))), v3(0, 1, 0));
      const lateral = cruz(w, br);
      const L = o.largo || 0.1, alc = o.alcance || 0.08;
      const lo = o.min == null ? -Infinity : o.min, hi = o.max == null ? Infinity : o.max;
      const ang = () => (o.angulo ? Number(o.angulo()) || 0 : 0);
      const dirEn = (a) => suma(por(br, Math.cos(a)), por(lateral, Math.sin(a)));
      const mango = () => suma(pv, por(dirEn(ang()), L));
      const anguloMano = (q) => { const v = resta(q, pv); return Math.atan2(punto(v, lateral), punto(v, br)); };
      let offset = 0, ultimo = 0, hist = [];
      const p = {
        tipo: "palanca", habilitada: true, tomadaPor: null,
        caja: () => cajaDe(o.alto ? suma(pv, por(w, o.centroAlto || 0)) : pv, Math.max(L, (o.alto || 0) / 2) + 0.05),
        mango,
        agarrable(m) {
          const dm = largo(resta(m.pos, mango()));
          if (dm < alc) return dm;
          if (o.todo) {
            // La distancia al segmento pivote→mango (o a la hoja, con alto).
            const d = dirEn(ang());
            let rel = resta(m.pos, pv);
            if (o.alto) {
              const ax = punto(rel, w);
              if (Math.abs(ax - (o.centroAlto || 0)) > o.alto / 2 + 0.03) return Infinity;
              rel = resta(rel, por(w, ax));
            }
            const t = acotar(punto(rel, d), 0, L);
            const e = largo(resta(rel, por(d, t)));
            if (e < alc * 0.75 && t > L * 0.3) return e + 0.02;
          }
          return Infinity;
        },
        tomar(m) {
          offset = dif(ang(), anguloMano(m.pos));
          ultimo = ang();
          hist = [{ a: ultimo, t: ahora() }];
          if (o.alTomar) o.alTomar(m.lado);
        },
        arrastrar(m) {
          const rel = resta(m.pos, pv);
          if (Math.hypot(punto(rel, lateral), punto(rel, br)) < 0.012) return;
          // Seguir la vuelta, no el ángulo pelado: una puerta que pasa de 180°
          // no salta al otro lado.
          let a = anguloMano(m.pos) + offset;
          a = ultimo + dif(a, ultimo);
          a = acotar(a, lo, hi);
          if (Math.abs(a - ultimo) < 1e-5) return;
          ultimo = a;
          hist.push({ a, t: ahora() });
          while (hist.length > 6) hist.shift();
          if (o.alMover) o.alMover(a, m.lado);
        },
        soltar(m) {
          let v = 0;
          if (hist.length > 1) { const x = hist[0], y = hist[hist.length - 1]; v = (y.a - x.a) / Math.max(0.001, (y.t - x.t) / 1000); }
          if (o.alSoltar) o.alSoltar(ultimo, v, m.lado);
        },
      };
      return agregar(p);
    }

    // ── Puerta ────────────────────────────────────────────────────────────
    /** Una puerta o una tapa con bisagra que el objeto ya anima solo (con su
     *  k de 0 a 1): la mano la toma de cualquier punto de la hoja y la lleva;
     *  al soltarla termina de abrirse o de cerrarse según dónde quedó y cómo
     *  venía (un empujón la cierra aunque esté abierta de más).
     *  o.pivote, o.eje, o.brazo, o.largo, o.alto, o.centroAlto   la hoja
     *  o.max        el ángulo abierta (con signo, según la mano derecha en eje)
     *  o.angulo()   el ángulo que se ve ahora
     *  o.mover(a)   mientras la llevan: la puerta en a (el objeto la dibuja)
     *  o.soltar(abierta, a)  la soltaron en a: que siga sola hacia abierta
     *  o.alTomar() */
    function puerta(o) {
      const max = Number(o.max) || 1.5, sg = Math.sign(max) || 1;
      return palanca({
        pivote: o.pivote, eje: o.eje, brazo: o.brazo, largo: o.largo, alto: o.alto, centroAlto: o.centroAlto,
        todo: true, alcance: o.alcance || 0.1,
        min: Math.min(0, max), max: Math.max(0, max),
        angulo: o.angulo,
        alTomar(lado) { if (o.alTomar) o.alTomar(lado); },
        alMover(a, lado) { o.mover(a, lado); },
        alSoltar(a, v, lado) {
          const f = a / max, vv = v * sg;
          const abierta = vv > 1.5 ? true : vv < -1.5 ? false : f > 0.5;
          o.soltar(abierta, a, lado);
        },
      });
    }

    // ── Corredera ─────────────────────────────────────────────────────────
    /** Algo que corre por un riel recto: un deslizador, un cajón, un pestillo.
     *  o.desde, o.hasta   el riel (t = 0 y t = 1)
     *  o.t()              dónde está ahora
     *  o.alcance          a qué distancia se lo toma (6 cm)
     *  o.alTomar(), o.alMover(t, lado), o.alSoltar(t, v) (v: fracción/s) */
    function corredera(o) {
      const alc = o.alcance || 0.06;
      // `desde` y `hasta` pueden ser funciones: un riel que cambia (un
      // deslizador que pasa de horizontal a vertical).
      const riel = () => {
        const a = V(typeof o.desde === "function" ? o.desde() : o.desde);
        const bb = V(typeof o.hasta === "function" ? o.hasta() : o.hasta);
        const eje = resta(bb, a), L = largo(eje) || 1;
        return { a, bb, eje, L, d: por(eje, 1 / L) };
      };
      const tAhora = () => acotar(o.t ? Number(o.t()) || 0 : 0, 0, 1);
      const dondeT = (r, t) => suma(r.a, por(r.eje, t));
      const tDe = (r, q) => punto(resta(q, r.a), r.d) / r.L;
      let offset = 0, ultimo = 0, hist = [];
      const p = {
        tipo: "corredera", habilitada: true, tomadaPor: null,
        caja() {
          const { a, bb } = riel();
          return { lo: v3(Math.min(a.x, bb.x) - 0.04, Math.min(a.y, bb.y) - 0.04, Math.min(a.z, bb.z) - 0.04), hi: v3(Math.max(a.x, bb.x) + 0.04, Math.max(a.y, bb.y) + 0.04, Math.max(a.z, bb.z) + 0.04) };
        },
        agarrable(m) {
          const dd = largo(resta(m.pos, dondeT(riel(), tAhora())));
          return dd < alc ? dd : Infinity;
        },
        tomar(m) {
          ultimo = tAhora();
          offset = ultimo - tDe(riel(), m.pos);
          hist = [{ t: ultimo, s: ahora() }];
          if (o.alTomar) o.alTomar(m.lado);
        },
        arrastrar(m) {
          const t = acotar(tDe(riel(), m.pos) + offset, 0, 1);
          if (Math.abs(t - ultimo) < 1e-5) return;
          ultimo = t;
          hist.push({ t, s: ahora() });
          while (hist.length > 6) hist.shift();
          if (o.alMover) o.alMover(t, m.lado);
        },
        soltar(m) {
          let v = 0;
          if (hist.length > 1) { const x = hist[0], y = hist[hist.length - 1]; v = (y.t - x.t) / Math.max(0.001, (y.s - x.s) / 1000); }
          if (o.alSoltar) o.alSoltar(ultimo, v, m.lado);
        },
      };
      return agregar(p);
    }

    // ── Táctil ────────────────────────────────────────────────────────────
    /** Un blanco de toque que también se aprieta con la mano: la punta del
     *  mando que entra en él (o el grip o el gatillo con la mano adentro) hace
     *  lo mismo que un clic, con un evento armado como el del motor (x..z del
     *  mundo, localX..Z del nodo). Lo arma solo Obj.boton para cada blanco.
     *  Se calla si la mano está al alcance de otra pieza (ir a tomar una
     *  manivela no aprieta su blanco de clic) o si el objeto maneja sus
     *  propios posemove. */
    function tactil(el, fn) {
      const forma = String(el.tagName || "").toLowerCase();
      if (!["box", "cylinder", "sphere", "plane"].includes(forma)) return null;
      let cache = null, cuando = -1e9;
      function leer() {
        const t = ahora();
        if (cache && t - cuando < 250) return cache;
        const cad = [];
        let S = v3(1, 1, 1);
        for (let n = el; n && n.nodeId !== root.nodeId && cad.length < 64; n = n.parent) {
          const pos = vec(n, "op_hsml_get_position", "position", v3(0, 0, 0));
          const rot = vec(n, "op_hsml_get_rotation", "rotation", v3(0, 0, 0));
          const sc = vec(n, "op_hsml_get_scale", "scale", v3(1, 1, 1));
          cad.push({ p: pos, q: qDeEuler(rot), s: sc });
          S = n === el ? sc : v3(S.x * sc.x, S.y * sc.y, S.z * sc.z);
        }
        cache = { cad, S: v3(Math.abs(S.x) || 1, Math.abs(S.y) || 1, Math.abs(S.z) || 1) };
        cuando = t;
        return cache;
      }
      /** Un punto del objeto en coordenadas del nodo (el nodo mide 1 de lado). */
      function aNodo(q) {
        const { cad } = leer();
        let l = q;
        for (let i = cad.length - 1; i >= 0; i--) {
          const c = cad[i];
          const r = Obj.rotarV({ x: -c.q.x, y: -c.q.y, z: -c.q.z, w: c.q.w }, resta(l, c.p));
          l = v3(r.x / (c.s.x || 1), r.y / (c.s.y || 1), r.z / (c.s.z || 1));
        }
        return l;
      }
      /** ¿Está adentro, con un margen en metros? */
      function adentro(q, margen) {
        if (!q) return false;
        const { S } = leer();
        const l = aNodo(q);
        const mx = 0.5 + margen / S.x, my = 0.5 + margen / S.y, mz = 0.5 + margen / S.z;
        if (forma === "box") return Math.abs(l.x) < mx && Math.abs(l.y) < my && Math.abs(l.z) < mz;
        if (forma === "cylinder") return Math.hypot(l.x / mx, l.z / mz) < 1 && Math.abs(l.y) < my;
        if (forma === "sphere") return Math.hypot(l.x / mx, l.y / my, l.z / mz) < 1;
        const hondo = l.z * S.z;
        return Math.abs(l.x) < mx && Math.abs(l.y) < my && hondo > -0.02 - margen && hondo < 0.03 + margen;
      }
      const adentroMano = (m, margen) => adentro(m.punta, margen) || adentro(m.pos, margen);
      let ultimo = -1e9;
      const dentro = { left: false, right: false };
      function disparar(m) {
        const t = ahora();
        if (t - ultimo < 250) return;
        ultimo = t;
        const q = adentro(m.punta, 0.01) ? m.punta : m.pos;
        donde = donde || Obj.marco();
        const w = donde.aMundo(q), l = aNodo(q);
        try {
          fn({ type: "toque", x: w.x, y: w.y, z: w.z, localX: l.x, localY: l.y, localZ: l.z, hand: m.lado, porMano: true });
        } catch (err) { console.error(err); }
      }
      /** ¿Hay otra pieza (no táctil) al alcance de esta mano? */
      function otraCerca(m) {
        for (const p of piezas) {
          if (p.tipo === "tactil" || p.habilitada === false || !p.agarrable) continue;
          let d = Infinity;
          try { d = p.agarrable(m); } catch (e) { /* nada */ }
          if (d < Infinity) return true;
        }
        return false;
      }
      const p = {
        tipo: "tactil", el, habilitada: true, tomadaPor: null,
        get callada() { return manual || el.getAttribute("touchable") === "false"; },
        caja() {
          const { cad, S } = leer();
          // El centro del nodo en el objeto y su tamaño aproximado.
          let c = v3(0, 0, 0);
          for (const k of cad) c = suma(Obj.rotarV(k.q, v3(c.x * k.s.x, c.y * k.s.y, c.z * k.s.z)), k.p);
          return cajaDe(c, Math.max(S.x, S.y, S.z) / 2 + 0.03);
        },
        agarrable(m) {
          if (this.callada || !adentroMano(m, 0.02)) return Infinity;
          const l = aNodo(m.pos);
          return 0.04 + Math.min(1, Math.hypot(l.x, l.y, l.z)) * 0.01;
        },
        tomar(m) { if (!this.callada) disparar(m); },
        arrastrar() {},
        soltar() {},
        rozar(m) {
          const lado = m.lado;
          if (!m.pos || this.callada) { dentro[lado] = false; return; }
          // Sólo cuenta entrar desde afuera: la mano que llega sosteniendo algo
          // (y lo suelta adentro) o que entra yendo a tomar otra pieza ya está
          // "adentro" y tiene que salir para volver a apretar.
          if (!dentro[lado]) {
            if (adentroMano(m, 0.006)) {
              dentro[lado] = true;
              if (!m.pieza && !otraCerca(m)) disparar(m);
            }
          } else if (!adentroMano(m, 0.02)) dentro[lado] = false;
        },
      };
      return agregar(p);
    }

    // ── Agarrable ─────────────────────────────────────────────────────────
    /** Lo general: tomar algo y llevarlo con la mano. `cerca(p)` dice si la
     *  mano en p lo alcanza (true, o una distancia; false o Infinity si no).
     *  o.tomar(p, lado, m), o.mover(p, lado, m), o.soltar(p, v, lado)
     *  (m.evento es el posemove crudo; m.dir hacia dónde apunta y m.muneca
     *  el costado del mando, que gira con la muñeca). */
    function agarrable(o) {
      const p = {
        tipo: "agarrable", habilitada: true, tomadaPor: null,
        caja: o.caja || null,
        agarrable(m) {
          const r = o.cerca ? o.cerca(m.pos, m) : false;
          if (r === true) return 0.05;
          return typeof r === "number" && Number.isFinite(r) ? r : Infinity;
        },
        tomar(m) { if (o.tomar) o.tomar(m.pos, m.lado, m.evento, m); },
        arrastrar(m) { if (o.mover) o.mover(m.pos, m.lado, m.evento, m); },
        soltar(m) { if (o.soltar) o.soltar(m.pos, m.vel(), m.lado); },
      };
      return agregar(p);
    }

    /** ¿Hay una mano tocando el objeto? (sosteniendo una pieza o al alcance
     *  de alguna). Mientras tanto, el clic del rayo no cuenta: en VR el mismo
     *  gatillo que agarra dispara el `toque`, y haría todo dos veces. */
    function ocupada() {
      const t = ahora();
      for (const lado of ["left", "right"]) {
        const m = estado[lado];
        if (!m || !m.pos || t - m.t > 250) continue;
        if (m.pieza) return true;
        for (const p of piezas) {
          if (p.habilitada === false || !p.agarrable) continue;
          let d = Infinity;
          try { d = p.agarrable(m); } catch (e) { /* nada */ }
          if (d < Infinity) return true;
        }
      }
      return false;
    }

    capa = {
      zona, agregar, boton, manivela, perilla, palanca, puerta, corredera, agarrable, tactil, ocupada,
      get piezas() { return piezas.slice(); },
      get zonaPropia() { return zonaPropia; },
      /** La mano ("left" | "right") si está en alguna zona, o null. */
      mano(lado) { return estado[lado] || null; },
    };
    // Las zonas del documento que cuelgan del <space>: todas mandan manos.
    try {
      for (const h of root.children || []) if (String(h.tagName || "").toLowerCase() === "posezone") zona(h);
    } catch (e) { /* sin hijos */ }
    return capa;
  }

  Obj.manos = manos;

  // El clic del rayo, callado mientras una mano está sobre el objeto.
  // Y cada blanco de toque, apretable con la mano (salvo { vr: false }).
  const botonBase = Obj.boton;
  Obj.boton = function (el, fn, op) {
    const r = botonBase(el, function (e) {
      if (capa && capa.ocupada()) return;
      return fn.apply(this, arguments);
    }, op);
    // Sin mano: { vr: false }, o manos="false" en el nodo (un blanco de clic
    // que tapa una pieza que ya se toma con la mano, como la cara de una rueda).
    if (!(op && op.vr === false) && el.getAttribute("manos") !== "false") {
      try { manos().tactil(el, (e) => fn(e)); } catch (err) { console.error(err); }
    }
    return r;
  };

  // Obj.agarre, sobre la capa: todas las piezas se reparten las manos con el
  // mismo criterio (la más cercana), en vez de pelearse cada una con su oyente.
  Obj.agarre = function (op) {
    const M = manos();
    if (op.zona) M.zona(op.zona);
    let quien = null;
    const pieza = M.agarrable({
      cerca: (p, m) => op.cerca(p, m),
      tomar(p, lado, e) { quien = lado; op.tomar && op.tomar(p, lado, e); },
      mover(p, lado, e) { op.mover && op.mover(p, lado, e); },
      soltar(p, v, lado) { quien = null; op.soltar && op.soltar(p, v, lado); },
    });
    // Como antes: con el grip, y con el gatillo sólo si se pide.
    pieza.gatillo = !!op.gatillo;
    return { get tomado() { return !!quien; }, get mano() { return quien; } };
  };
})();
