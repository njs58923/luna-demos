// El kit de consola: las piezas físicas con las que se arman los minijuegos.
//
// Antes cada minijuego era una pantalla de interfaz de metro y medio pegada a
// la consola. Se leía bien y se jugaba con el dedo del rayo, pero era una
// pantalla: nada se agarraba, nada se tiraba, y ocupaba media pared. Acá los
// juegos se arman con piezas —botones que se hunden, palancas que se bajan,
// correderas que se empujan y cables que se estiran— a escala x3 de las de
// verdad, sobre una caja de 68 x 52 cm.
//
// Cuatro piezas alcanzan para los diecinueve juegos:
//
//   Boton       se aprieta y se suelta. Redondo o tecla cuadrada.
//   Palanca     gira en un eje entre dos topes. Chica o grande.
//   Empujable   una perilla que corre por un riel, o por un área.
//   Estirable   un cable con un enchufe que se lleva hasta una toma.
//
// más cuatro para mostrar: led, texto, barra y pantalla.
//
// ── Las dos manos del motor ─────────────────────────────────────────────────
//
// **En VR** las piezas se agarran de verdad. Un `<posezone>` manda en cada
// cuadro la posición de cada mando, el grip y el gatillo; el panel lo pasa a
// sus coordenadas y se lo da a la pieza más cercana cuando se aprieta. Una
// palanca sigue a la mano, un cable se estira hasta donde está el mando.
//
// **En escritorio** no hay nada de eso: el motor sólo manda `toque` al hacer
// clic, con el punto de impacto. Así que cada pieza tiene también su versión
// de un clic, pensada para que se vea lo mismo: la palanca se baja sola, la
// perilla corre hasta donde se tocó el riel, y el cable se elige con un clic y
// se lleva estirándose hasta la toma que se toque después.
//
// Las dos vías terminan en los mismos avisos (`alApretar`, `alLlegar`,
// `alSoltar`, `alConectar`), así que un juego no sabe con qué se lo jugó.
//
// ── Coordenadas ─────────────────────────────────────────────────────────────
//
// Todo va en metros del panel: x a la derecha, y para arriba, z saliendo hacia
// el jugador, con el origen en el centro de la cara. Los modelos del kit están
// hechos así (ver ASSETS.md, tanda 4) y se ponen sin girar.

(function () {
  // ── Álgebra ───────────────────────────────────────────────────────────────
  const v3 = (x, y, z) => ({ x, y, z });
  const suma = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
  const resta = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const por = (a, k) => v3(a.x * k, a.y * k, a.z * k);
  const punto = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cruz = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const largo = (a) => Math.hypot(a.x, a.y, a.z);
  const unitario = (a) => { const l = largo(a) || 1; return por(a, 1 / l); };
  const acotar = (v, a, b) => Math.max(a, Math.min(b, v));
  const acercar = (v, meta, dt, k) => v + (meta - v) * (1 - Math.exp(-dt * k));

  function qMul(a, b) {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
  }
  const qConj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
  function qNorm(q) {
    const m = Math.hypot(q.x, q.y, q.z, q.w) || 1;
    return { x: q.x / m, y: q.y / m, z: q.z / m, w: q.w / m };
  }
  function qEje(eje, ang) {
    const s = Math.sin(ang / 2);
    return { x: eje.x * s, y: eje.y * s, z: eje.z * s, w: Math.cos(ang / 2) };
  }
  function rotar(q, v) {
    const r = qMul(qMul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), qConj(q));
    return v3(r.x, r.y, r.z);
  }
  /** El giro más corto que lleva la dirección a a la b (unitarias). */
  function qDesde(a, b) {
    const d = punto(a, b);
    if (d < -0.999999) {
      const orto = Math.abs(a.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
      return qEje(unitario(cruz(a, orto)), Math.PI);
    }
    const c = cruz(a, b);
    return qNorm({ x: c.x, y: c.y, z: c.z, w: 1 + d });
  }
  /** El motor arma la rotación con Quat::from_euler(EulerRot::XYZ, x, y, z),
   *  que es Rx·Ry·Rz. Estas dos son la ida y la vuelta de eso. */
  function qDeEuler(x, y, z) {
    return qMul(qMul(qEje(v3(1, 0, 0), x), qEje(v3(0, 1, 0), y)), qEje(v3(0, 0, 1), z));
  }
  function eulerDeQ(q) {
    const { x, y, z, w } = q;
    const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - w * z), m02 = 2 * (x * z + w * y);
    const m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - w * x);
    const m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y);
    const ey = Math.asin(acotar(m02, -1, 1));
    if (Math.abs(m02) < 0.9999999) return v3(Math.atan2(-m12, m22), ey, Math.atan2(-m01, m00));
    return v3(Math.atan2(m21, m11), ey, 0);
  }

  const ahora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  // ── El marco de un nodo en el mundo ───────────────────────────────────────
  // Las manos llegan en coordenadas del mundo y las piezas viven en las del
  // panel, que cuelga de la consola, que cuelga de la nave. Se compone la
  // cadena de padres una vez al abrir: mientras un juego está abierto la nave
  // no se mueve (viajar por un conducto lo cierra).
  function marcoDe(el) {
    const cadena = [];
    for (let n = el; n; n = n.parent) cadena.push(n);
    let p = v3(0, 0, 0), q = { x: 0, y: 0, z: 0, w: 1 }, s = 1;
    for (let i = cadena.length - 1; i >= 0; i--) {
      const n = cadena[i];
      const lp = n.position || v3(0, 0, 0), lr = n.rotation || v3(0, 0, 0), ls = n.scale || v3(1, 1, 1);
      p = suma(p, rotar(q, por(v3(lp.x || 0, lp.y || 0, lp.z || 0), s)));
      q = qMul(q, qDeEuler(lr.x || 0, lr.y || 0, lr.z || 0));
      s *= Number.isFinite(ls.x) && ls.x ? ls.x : 1;
    }
    const qi = qConj(q);
    return {
      p, q, s,
      aLocal: (w) => por(rotar(qi, resta(w, p)), 1 / s),
      aMundo: (l) => suma(p, rotar(q, por(l, s))),
    };
  }

  // ── Colores ───────────────────────────────────────────────────────────────
  /** Un color al k por uno: el estado apagado de un led o de una tapa. */
  function atenuar(hex, k) {
    const v = parseInt(String(hex).slice(1, 7), 16);
    if (!Number.isFinite(v)) return hex;
    const c = (d) => Math.round(((v >> d) & 255) * k).toString(16).padStart(2, "0");
    return "#" + c(16) + c(8) + c(0);
  }

  // ── Constantes de entrada ─────────────────────────────────────────────────
  const APRETAR = 0.6, AFLOJAR = 0.35;   // histéresis de grip y gatillo
  const MANO_VIEJA_MS = 250;             // una mano que no manda más se da por soltada

  // ══════════════════════════════════════════════════════════════════════════
  // El panel
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Un panel es un grupo del documento cuyo marco es la cara de una caja: ahí
   * se crean las piezas y ahí llegan las manos.
   *
   *   raiz      hiperspace.dimention
   *   grupo     el nodo `<group>` del panel
   *   o.base    la URL de donde salen los modelos
   *   o.version la firma de versión de los modelos (el motor cachea por URL)
   */
  function Panel(raiz, grupo, o) {
    o = o || {};
    this.raiz = raiz;
    this.grupo = grupo;
    this.base = o.base || "";
    this.version = o.version || "";
    this.piezas = [];
    this.nodos = [];
    this.manos = { left: nuevaMano(), right: nuevaMano() };
    this.marco = marcoDe(grupo);
    this.vivo = true;
  }
  const nuevaMano = () => ({ pos: null, grip: false, gatillo: false, t: 0, pieza: null });

  /** Vuelve a leer dónde está el panel en el mundo. */
  Panel.prototype.recalcular = function () { this.marco = marcoDe(this.grupo); };

  /** Crea un nodo. `padre` por omisión es el grupo del panel. */
  Panel.prototype.crear = function (tag, attrs, padre) {
    const el = this.raiz.createElement(tag);
    for (const k in attrs) {
      if (attrs[k] === undefined || attrs[k] === null) continue;
      el.setAttribute(k, typeof attrs[k] === "number" ? num(attrs[k]) : String(attrs[k]));
    }
    (padre || this.grupo).appendChild(el);
    if (!padre || padre === this.grupo) this.nodos.push(el);
    return el;
  };
  const num = (v) => (Math.abs(v) < 1e-6 ? "0" : String(Math.round(v * 100000) / 100000));

  Panel.prototype.modelo = function (nombre, attrs, padre) {
    const src = this.base + "/modelos/" + nombre + ".glb" + (this.version ? "?v=" + this.version : "");
    return this.crear("model", Object.assign({ src, touchable: "false" }, attrs || {}), padre);
  };

  Panel.prototype.grupoEn = function (x, y, z, padre) {
    return this.crear("group", { x, y, z: z || 0 }, padre);
  };

  Panel.prototype.agregar = function (pieza) {
    this.piezas.push(pieza);
    return pieza;
  };

  /** Un evento posemove del motor, tal cual llega. */
  Panel.prototype.mano = function (evt) {
    if (!this.vivo || !evt) return;
    const m = this.manos[evt.hand === "left" ? "left" : "right"];
    m.pos = this.marco.aLocal(v3(evt.px, evt.py, evt.pz));
    m.t = ahora();
    const g = evt.grip || 0, tr = evt.trigger || 0;
    const antes = m.grip || m.gatillo;
    if (!m.grip && g > APRETAR) m.grip = true;
    else if (m.grip && g < AFLOJAR) m.grip = false;
    if (!m.gatillo && tr > APRETAR) m.gatillo = true;
    else if (m.gatillo && tr < AFLOJAR) m.gatillo = false;
    const despues = m.grip || m.gatillo;

    if (!antes && despues) this._tomar(m);
    else if (antes && !despues) this._soltar(m);
    else if (m.pieza) m.pieza.arrastrar(m, m.pos);

    // Lo que se aprieta sin agarrar: un botón se hunde con el mando encima.
    for (const p of this.piezas) if (p.rozar && p !== m.pieza) p.rozar(m, m.pos);
  };

  Panel.prototype._tomar = function (m) {
    let mejor = null, dist = Infinity;
    for (const p of this.piezas) {
      if (!p.agarrable || p.habilitada === false) continue;
      const d = p.agarrable(m.pos);
      if (d < dist) { dist = d; mejor = p; }
    }
    if (!mejor) return;
    m.pieza = mejor;
    mejor.tomar(m, m.pos);
  };

  Panel.prototype._soltar = function (m) {
    const p = m.pieza;
    m.pieza = null;
    if (p) p.soltar(m, m.pos);
  };

  /** Por cuadro: animaciones de las piezas y manos que dejaron de llegar. */
  Panel.prototype.cuadro = function (dt) {
    if (!this.vivo) return;
    const t = ahora();
    for (const lado of ["left", "right"]) {
      const m = this.manos[lado];
      if (m.pos && t - m.t > MANO_VIEJA_MS) {
        if (m.pieza) this._soltar(m);
        m.grip = m.gatillo = false;
        m.pos = null;
      }
    }
    for (const p of this.piezas) if (p.cuadro) p.cuadro(dt);
  };

  Panel.prototype.destruir = function () {
    if (!this.vivo) return;
    this.vivo = false;
    for (const el of this.nodos) {
      try { el.remove(); } catch (e) { /* ya no estaba */ }
    }
    this.nodos = [];
    this.piezas = [];
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Boton
  // ══════════════════════════════════════════════════════════════════════════

  const BOTON = {
    redondo: { base: "boton_base", ancho: 0.056, radio: 0.028, alto: 0.02, reposo: 0.018, recorrido: 0.012 },
    tecla: { base: "tecla_base", ancho: 0.064, radio: 0.034, alto: 0.02, reposo: 0.016, recorrido: 0.01 },
  };

  /**
   * o.x, o.y       dónde
   * o.forma        "redondo" | "tecla"
   * o.color        la tapa
   * o.etiqueta     texto sobre la tapa (opcional)
   * o.alApretar()  o.alSoltar()
   */
  Panel.prototype.boton = function (o) {
    const self = this;
    let f = BOTON[o.forma] || BOTON.redondo;
    // Una tecla de medida libre (la palma del reactor): sin aro del kit, porque
    // el aro mide lo que mide; el juego le pone su marco.
    const libre = o.forma === "tecla" && (o.ancho || o.alto);
    if (libre) {
      const an = o.ancho || f.ancho, al = o.alto || f.ancho;
      f = Object.assign({}, f, { base: null, ancho: an, altoTapa: al, radio: Math.max(an, al) / 2 });
    }
    const g = this.grupoEn(o.x, o.y, 0);
    if (f.base) this.modelo(f.base, {}, g);
    const movil = this.crear("group", { z: f.reposo }, g);
    const tapa = o.forma === "tecla"
      ? this.crear("box", { sx: f.ancho, sy: f.altoTapa || f.ancho, sz: f.alto, color: o.color || "#4A5464", touchable: "true" }, movil)
      : this.crear("cylinder", { rx: Math.PI / 2, sx: f.ancho, sy: f.alto, sz: f.ancho, color: o.color || "#4A5464", touchable: "true" }, movil);
    let rotulo = null;
    if (o.etiqueta !== undefined) {
      rotulo = this.crear("text", {
        z: f.alto / 2 + 0.0015, value: String(o.etiqueta), size: o.tamEtiqueta || 0.03,
        color: o.colorEtiqueta || "#0B0E14", touchable: "false",
      }, movil);
    }

    const b = {
      tipo: "boton", nodo: g, tapa, x: o.x, y: o.y,
      apretado: false, hundido: 0, habilitada: true,
      porMano: null, clicHasta: 0,
      color(c) { tapa.setAttribute("color", c); },
      etiqueta(t) { if (rotulo) rotulo.setAttribute("value", String(t)); },
      habilitar(si) { this.habilitada = !!si; },

      _apretar() {
        if (this.apretado || !this.habilitada) return;
        this.apretado = true;
        if (o.alApretar) o.alApretar(this);
      },
      _soltar() {
        if (!this.apretado) return;
        this.apretado = false;
        if (o.alSoltar) o.alSoltar(this);
      },

      /** Lo mismo que un clic: aprieta y suelta sola. */
      clic() {
        if (!this.habilitada || this.apretado) return;
        this._apretar();
        this.clicHasta = ahora() + (o.clic || 160);
      },

      // VR, con grip o gatillo: la mano sobre la tapa.
      agarrable(p) {
        const d = Math.hypot(p.x - this.x, p.y - this.y);
        if (d > f.radio + 0.03 || p.z > 0.09 || p.z < -0.04) return Infinity;
        return d + Math.max(0, p.z - 0.03);
      },
      tomar() { this.porMano = "grip"; this._apretar(); },
      arrastrar() {},
      soltar() { this.porMano = null; this._soltar(); },

      // VR, empujando: el mando hunde la tapa aunque no apriete nada.
      rozar(m, p) {
        if (!p || this.porMano === "grip") return;
        const encima = libre
          ? Math.abs(p.x - this.x) < f.ancho / 2 + 0.01 && Math.abs(p.y - this.y) < f.altoTapa / 2 + 0.01
          : Math.hypot(p.x - this.x, p.y - this.y) < f.radio + 0.01;
        const tope = f.reposo + f.alto / 2;
        const hondo = encima ? acotar((tope - p.z) / f.recorrido, 0, 1.4) : 0;
        if (!this.apretado && encima && hondo > 0.6) { this.porMano = "empuje"; this._apretar(); }
        else if (this.apretado && this.porMano === "empuje" && hondo < 0.25) { this.porMano = null; this._soltar(); }
      },

      cuadro(dt) {
        if (this.clicHasta && ahora() > this.clicHasta) { this.clicHasta = 0; this._soltar(); }
        const meta = this.apretado ? 1 : 0;
        const antes = this.hundido;
        this.hundido = acercar(this.hundido, meta, dt, 28);
        if (Math.abs(this.hundido - antes) > 1e-4) movil.position = { x: 0, y: 0, z: f.reposo - this.hundido * f.recorrido };
      },
    };
    // Escritorio: el clic aprieta y suelta solo. Un botón que hay que mantener
    // lo resuelve el juego (ver `mantener` en la palma del reactor).
    tapa.addEventListener("toque", () => b.clic());
    return this.agregar(b);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Palanca
  // ══════════════════════════════════════════════════════════════════════════

  const PALANCA = {
    chica: { base: "palanca_base", mango: "palanca_mango", eje: 0.014, largo: 0.094, radio: 0.05, max: 0.62 },
    grande: { base: "palanca_grande_base", mango: "palanca_grande_mango", eje: 0.02, largo: 0.21, radio: 0.085, max: 0.9 },
  };

  /**
   * La palanca gira en el eje X del panel: arriba es 0, abajo es 1.
   *
   * o.x, o.y         dónde está el eje
   * o.tam            "chica" | "grande"
   * o.modo           "dos"      queda arriba o abajo (un interruptor)
   *                  "retorno"  vuelve arriba al soltarla (la de la basura)
   *                  "libre"    queda donde se suelta (una válvula)
   * o.inicial        0..1
   * o.alCambiar(f)   mientras se mueve
   * o.alLlegar(lado) "arriba" | "abajo", al tocar un tope
   * o.alSoltar(f)
   * o.clicMantener   segundos que se sostiene abajo con un clic (modo retorno)
   */
  Panel.prototype.palanca = function (o) {
    const f = PALANCA[o.tam] || PALANCA.chica;
    const g = this.grupoEn(o.x, o.y, 0);
    this.modelo(f.base, {}, g);
    const eje = this.crear("group", { z: f.eje }, g);
    this.modelo(f.mango, {}, eje);
    // El blanco del clic: una esfera invisible sobre la bocha, más grande que
    // ella. La bocha es un modelo, y los modelos no reciben toques finos.
    const blanco = this.crear("sphere", {
      sx: f.radio * 1.4, sy: f.radio * 1.4, sz: f.radio * 1.4,
      color: "transparent", "material-alpha": "blend", touchable: "true",
    }, eje);
    const modo = o.modo || "dos";
    const angulo = (fr) => -f.max + fr * 2 * f.max;

    const pal = {
      tipo: "palanca", nodo: g, x: o.x, y: o.y,
      fraccion: acotar(o.inicial || 0, 0, 1), meta: null, habilitada: true,
      tomada: false, lado: null, sostenerHasta: 0,

      /** Dónde está la bocha ahora, en coordenadas del panel. */
      bocha() {
        const a = angulo(this.fraccion);
        return v3(this.x, this.y - Math.sin(a) * f.largo, f.eje + Math.cos(a) * f.largo);
      },
      poner(fr) {
        fr = acotar(fr, 0, 1);
        const cambio = Math.abs(fr - this.fraccion) > 1e-4;
        this.fraccion = fr;
        const a = angulo(fr);
        eje.rotation = { x: a, y: 0, z: 0 };
        blanco.position = { x: 0, y: 0, z: f.largo };
        if (cambio && o.alCambiar) o.alCambiar(fr, this);
        const lado = fr <= 0.02 ? "arriba" : fr >= 0.98 ? "abajo" : null;
        const antes = this.lado;
        // Primero se actualiza y después se avisa: el que escucha suele
        // preguntarle a todas las palancas dónde están, ésta incluida.
        this.lado = lado || (fr > 0.1 && fr < 0.9 ? null : this.lado);
        if (lado && lado !== antes && o.alLlegar) o.alLlegar(lado, this);
      },
      habilitar(si) { this.habilitada = !!si; },

      agarrable(p) {
        const d = largo(resta(p, this.bocha()));
        return d < f.radio ? d : Infinity;
      },
      tomar(m, p) { this.tomada = true; this.meta = null; this.arrastrar(m, p); },
      arrastrar(m, p) {
        if (!this.tomada || !p) return;
        // El ángulo sale de la mano proyectada en el plano del giro (YZ): la
        // palanca apunta a donde está la mano, sin importar cuánto se aleje.
        const vy = p.y - this.y, vz = p.z - f.eje;
        if (Math.hypot(vy, vz) < 0.01) return;
        const a = acotar(Math.atan2(-vy, vz), -f.max, f.max);
        this.poner((a + f.max) / (2 * f.max));
      },
      soltar() {
        this.tomada = false;
        if (modo === "dos") this.meta = this.fraccion < 0.5 ? 0 : 1;
        else if (modo === "retorno") this.meta = 0;
        if (o.alSoltar) o.alSoltar(this.fraccion, this);
      },

      cuadro(dt) {
        if (this.tomada) return;
        if (this.sostenerHasta) {
          if (ahora() < this.sostenerHasta) return;
          this.sostenerHasta = 0;
          this.meta = 0;
        }
        if (this.meta === null) return;
        const k = modo === "retorno" && this.meta === 0 ? 7 : 12;
        let fr = acercar(this.fraccion, this.meta, dt, k);
        if (Math.abs(fr - this.meta) < 0.004) fr = this.meta;
        this.poner(fr);
        if (fr === this.meta) {
          const llegada = this.meta;
          this.meta = null;
          // Un clic en modo retorno baja, se sostiene y sube sola.
          if (modo === "retorno" && llegada === 1 && this.porClic) {
            this.porClic = false;
            this.sostenerHasta = ahora() + (o.clicMantener || 0.8) * 1000;
          }
        }
      },
    };
    pal.lado = pal.fraccion <= 0.02 ? "arriba" : pal.fraccion >= 0.98 ? "abajo" : null;
    pal.poner(pal.fraccion);

    // Escritorio: un clic la lleva al otro tope. En retorno la baja, la
    // sostiene un rato y la deja volver.
    /** Un clic: al otro tope; en retorno, baja, se sostiene y sube. */
    pal.clic = function () {
      if (!this.habilitada || this.tomada) return;
      if (modo === "retorno") { this.porClic = true; this.meta = 1; }
      else this.meta = this.fraccion < 0.5 ? 1 : 0;
    };
    blanco.addEventListener("toque", () => pal.clic());
    return this.agregar(pal);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Empujable
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Una perilla que corre por un riel (de `desde` a `hasta`) o por un área
   * rectangular (`area`: x0, y0, x1, y1).
   *
   * o.inicial         0..1 en un riel; {x, y} en un área
   * o.perilla(g)      arma la perilla adentro del grupo g; por omisión, la
   *                   corredera del kit
   * o.alMover(v)      mientras se mueve: t en un riel, {x, y} en un área
   * o.alSoltar(v)
   * o.velocidad       m/s con que corre sola en escritorio (0,6)
   * o.sinRiel         no dibujar el riel (el juego pone su propio fondo)
   */
  Panel.prototype.empujable = function (o) {
    const self = this;
    const esArea = !!o.area;
    const a = o.desde || { x: 0, y: 0 }, b = o.hasta || { x: 0, y: 0 };
    const eje = v3(b.x - a.x, b.y - a.y, 0);
    const L = largo(eje) || 1;
    const dir = por(eje, 1 / L);
    const Z = 0.012;

    if (!esArea && !o.sinRiel) {
      const rz = Math.atan2(dir.y, dir.x);
      this.crear("box", {
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0.004, rz,
        sx: L + 0.02, sy: 0.014, sz: 0.008, color: o.colorRiel || "#232A34", touchable: "false",
      });
      for (const q of [a, b]) this.modelo("riel_tope", { x: q.x, y: q.y, rz }, null);
    }

    // El blanco del clic: el riel entero (o el área), apenas delante de la cara.
    const zona = esArea ? o.area : null;
    const blanco = esArea
      ? this.crear("plane", {
        x: (zona.x0 + zona.x1) / 2, y: (zona.y0 + zona.y1) / 2, z: 0.006,
        sx: Math.abs(zona.x1 - zona.x0), sy: Math.abs(zona.y1 - zona.y0),
        color: "transparent", "material-alpha": "blend", touchable: "true",
      })
      : this.crear("plane", {
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0.006, rz: Math.atan2(dir.y, dir.x),
        sx: L + 0.04, sy: 0.07, color: "transparent", "material-alpha": "blend", touchable: "true",
      });

    const g = this.grupoEn(0, 0, 0);
    if (o.perilla) o.perilla(g, self);
    else this.modelo("corredera", { rz: Math.atan2(dir.y, dir.x) + (o.girarPerilla || 0) }, g);

    const e = {
      tipo: "empujable", nodo: g, habilitada: true, tomada: false,
      t: 0, p: { x: a.x, y: a.y }, meta: null, offset: null,

      valor() { return esArea ? { x: this.p.x, y: this.p.y } : this.t; },
      _ubicar(x, y) {
        if (esArea) {
          x = acotar(x, Math.min(zona.x0, zona.x1), Math.max(zona.x0, zona.x1));
          y = acotar(y, Math.min(zona.y0, zona.y1), Math.max(zona.y0, zona.y1));
          this.p = { x, y };
        } else {
          this.t = acotar(((x - a.x) * dir.x + (y - a.y) * dir.y) / L, 0, 1);
          this.p = { x: a.x + dir.x * L * this.t, y: a.y + dir.y * L * this.t };
        }
        g.position = { x: this.p.x, y: this.p.y, z: Z };
        if (o.alMover && !this.callado) o.alMover(this.valor(), this);
      },
      poner(v) {
        if (esArea) this._ubicar(v.x, v.y);
        else this._ubicar(a.x + dir.x * L * acotar(v, 0, 1), a.y + dir.y * L * acotar(v, 0, 1));
      },
      habilitar(si) { this.habilitada = !!si; },

      agarrable(p) {
        const d = Math.hypot(p.x - this.p.x, p.y - this.p.y);
        return d < 0.055 && p.z < 0.1 && p.z > -0.04 ? d : Infinity;
      },
      tomar(m, p) {
        this.tomada = true;
        this.meta = null;
        // Se guarda dónde se agarró respecto del centro, para que la perilla
        // no salte a la mano.
        this.offset = { x: this.p.x - p.x, y: this.p.y - p.y };
        this.tomadaEn = ahora();
        this.desdeT = this.t;
      },
      arrastrar(m, p) {
        if (!this.tomada || !p) return;
        this._ubicar(p.x + this.offset.x, p.y + this.offset.y);
      },
      soltar() {
        this.tomada = false;
        if (o.alSoltar) o.alSoltar(this.valor(), this);
      },

      cuadro(dt) {
        if (this.tomada || !this.meta) return;
        const vel = (o.velocidad || 0.6) * dt;
        const dx = this.meta.x - this.p.x, dy = this.meta.y - this.p.y;
        const d = Math.hypot(dx, dy);
        if (d <= vel) {
          this._ubicar(this.meta.x, this.meta.y);
          this.meta = null;
          if (o.alSoltar) o.alSoltar(this.valor(), this);
        } else {
          this._ubicar(this.p.x + (dx / d) * vel, this.p.y + (dy / d) * vel);
        }
      },
    };

    /** Un clic en (x, y) del panel: la perilla corre hasta ahí. */
    e.clicEn = function (x, y) {
      if (!this.habilitada || this.tomada) return;
      if (esArea) this.meta = { x, y };
      else {
        const t = acotar(((x - a.x) * dir.x + (y - a.y) * dir.y) / L, 0, 1);
        this.meta = { x: a.x + dir.x * L * t, y: a.y + dir.y * L * t };
      }
      if (o.alClic) o.alClic(this);
    };
    // Escritorio: tocar el riel manda la perilla hasta ahí, corriendo.
    blanco.addEventListener("toque", (ev) => {
      const lp = puntoLocal(self, blanco, ev);
      if (lp) e.clicEn(lp.x, lp.y);
    });

    e.callado = true;
    if (esArea) e.poner(o.inicial || { x: (zona.x0 + zona.x1) / 2, y: (zona.y0 + zona.y1) / 2 });
    else e.poner(o.inicial || 0);
    e.callado = false;
    return this.agregar(e);
  };

  /** El punto de un toque sobre un plano, en coordenadas del panel. El evento
   *  trae `localX/localY` normalizados al plano (de -0,5 a 0,5); si no están,
   *  se usa el punto del mundo. */
  function puntoLocal(panel, plano, ev) {
    if (!ev) return null;
    if (Number.isFinite(ev.localX) && Number.isFinite(ev.localY)) {
      const s = plano.scale, pos = plano.position, r = plano.rotation || v3(0, 0, 0);
      const lx = ev.localX * s.x, ly = ev.localY * s.y;
      const c = Math.cos(r.z || 0), sn = Math.sin(r.z || 0);
      return { x: pos.x + lx * c - ly * sn, y: pos.y + lx * sn + ly * c };
    }
    if (Number.isFinite(ev.x)) {
      const l = panel.marco.aLocal(v3(ev.x, ev.y, ev.z));
      return { x: l.x, y: l.y };
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Estirable y Toma
  // ══════════════════════════════════════════════════════════════════════════

  const Z_CABLE = 0.02;
  const LARGO_ENCHUFE = 0.056;

  /** Una toma: donde se enchufa un cable. `o.id` es lo que recibe el juego. */
  Panel.prototype.toma = function (o) {
    const panel = this;
    const g = this.grupoEn(o.x, o.y, 0);
    this.modelo("toma", {}, g);
    // Un rombo de color al lado, para que se lea a qué va la toma.
    let marca = null;
    if (o.color) {
      marca = this.crear("box", { x: 0.042, z: 0.006, rz: Math.PI / 4, sx: 0.018, sy: 0.018, sz: 0.008, color: o.color, touchable: "false" }, g);
    }
    const blanco = this.crear("box", {
      z: 0.012, sx: 0.07, sy: 0.07, sz: 0.03, color: "transparent", "material-alpha": "blend", touchable: "true",
    }, g);
    const t = {
      tipo: "toma", id: o.id, x: o.x, y: o.y, nodo: g, ocupada: null,
      /** Dónde queda el enchufe cuando entra: el enchufe llega desde la
       *  izquierda y sus patas se meten en la toma. */
      boca(z) { return v3(this.x - 0.03 - LARGO_ENCHUFE + 0.016, this.y, z === undefined ? Z_CABLE : z); },
      color(c) { if (marca) marca.setAttribute("color", c); },
    };
    /** Un clic en la toma: el cable elegido viene hasta acá. */
    t.clic = function () { if (panel.elegido) panel.elegido.llevarA(this); };
    blanco.addEventListener("toque", () => t.clic());
    return t;
  };

  /**
   * Un cable fijo en `ancla` con un enchufe en la otra punta.
   *
   * o.ancla        {x, y}: dónde sale el cable
   * o.color        el color del cable y del cuello del enchufe
   * o.tomas        las tomas a las que puede ir
   * o.alConectar(toma, cable) -> true para quedarse, false para rebotar
   * o.largoMax     cuánto se estira (0,6 m)
   */
  Panel.prototype.estirable = function (o) {
    const self = this;
    // Cada cable va un poco más adelante que el anterior: tres cables que se
    // cruzan en el mismo plano se cortan a mordiscos donde se tocan.
    this._capas = (this._capas || 0) + 1;
    const zc = Z_CABLE + (this._capas - 1) * 0.005;
    const ancla = v3(o.ancla.x, o.ancla.y, zc);
    const reposo = v3(o.ancla.x + 0.045, o.ancla.y, zc);
    this.modelo("borne", { x: o.ancla.x, y: o.ancla.y }, null);

    const cuerda = this.crear("cylinder", { sx: 0.012, sy: 0.01, sz: 0.012, color: o.color || "#E74C3C", touchable: "false" });
    const punta = this.grupoEn(reposo.x, reposo.y, reposo.z);
    const cuerpo = this.crear("group", {}, punta);
    this.modelo("enchufe", {}, cuerpo);
    this.crear("box", { x: 0.004, z: -0.014 + 0.002, sx: 0.012, sy: 0.034, sz: 0.034, color: o.color || "#E74C3C", touchable: "false" }, cuerpo);
    const blanco = this.crear("sphere", {
      x: 0.026, sx: 0.07, sy: 0.07, sz: 0.07, color: "transparent", "material-alpha": "blend", touchable: "true",
    }, cuerpo);
    const brillo = this.crear("sphere", {
      x: 0.026, sx: 0.075, sy: 0.075, sz: 0.075, color: "#FFFFFF40", "material-alpha": "blend",
      visible: "false", touchable: "false",
    }, cuerpo);

    const c = {
      tipo: "estirable", nodo: punta, color: o.color, habilitada: true,
      pos: v3(reposo.x, reposo.y, reposo.z), meta: null, tomada: false,
      conectada: null, llevando: null,

      _dibujar() {
        punta.position = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
        const d = resta(this.pos, ancla);
        const L = largo(d);
        const u = L > 1e-5 ? por(d, 1 / L) : v3(1, 0, 0);
        const medio = por(suma(this.pos, ancla), 0.5);
        cuerda.position = { x: medio.x, y: medio.y, z: medio.z };
        cuerda.scale = { x: 0.012, y: Math.max(0.001, L), z: 0.012 };
        cuerda.rotation = eulerDeQ(qDesde(v3(0, 1, 0), u));
        // El enchufe sigue la dirección del cable, así se lo ve tirado. Ya
        // enchufado queda derecho, como entra en la toma.
        const derecho = this.conectada && !this.meta;
        const r = eulerDeQ(qDesde(v3(1, 0, 0), L > 0.02 && !derecho ? u : v3(1, 0, 0)));
        cuerpo.rotation = r;
      },
      habilitar(si) { this.habilitada = !!si; },
      largo() { return largo(resta(this.pos, ancla)); },
      /** Suelta la toma y vuelve el enchufe a su lugar, estirándose al revés. */
      desconectar() {
        if (this.conectada) this.conectada.ocupada = null;
        this.conectada = null;
        this.llevando = null;
        this.meta = reposo;
      },

      agarrable(p) {
        if (this.conectada) return Infinity;
        const centro = suma(this.pos, rotar(qDeEuler(cuerpo.rotation.x, cuerpo.rotation.y, cuerpo.rotation.z), v3(0.026, 0, 0)));
        const d = largo(resta(p, centro));
        return d < 0.06 ? d : Infinity;
      },
      tomar() { this.tomada = true; this.meta = null; this._elegir(false); },
      arrastrar(m, p) {
        if (!this.tomada || !p) return;
        let hacia = resta(v3(p.x, p.y, Math.max(zc - 0.008, p.z)), ancla);
        const max = o.largoMax || 0.6;
        if (largo(hacia) > max) hacia = por(unitario(hacia), max);
        this.pos = suma(ancla, hacia);
        this._dibujar();
      },
      soltar() {
        this.tomada = false;
        // ¿Quedó cerca de una toma libre? Se enchufa ahí.
        let mejor = null, dist = 0.07;
        for (const t of o.tomas || []) {
          if (t.ocupada) continue;
          const d = largo(resta(this.pos, t.boca(zc)));
          if (d < dist) { dist = d; mejor = t; }
        }
        if (mejor) this._enchufar(mejor);
        else this.meta = reposo;
      },

      /** Escritorio: el enchufe elegido va solo hasta la toma, estirándose. */
      llevarA(t) {
        if (this.conectada || t.ocupada) return;
        this._elegir(false);
        this.llevando = t;
        this.meta = t.boca(zc);
      },
      _elegir(si) {
        if (si) {
          if (self.elegido && self.elegido !== this) self.elegido._elegir(false);
          self.elegido = this;
        } else if (self.elegido === this) self.elegido = null;
        brillo.setAttribute("visible", si ? "true" : "false");
      },
      _enchufar(t) {
        const acepta = o.alConectar ? o.alConectar(t, this) !== false : true;
        if (acepta) {
          this.conectada = t;
          t.ocupada = this;
          this.meta = t.boca(zc);
        } else {
          this.meta = reposo;
        }
      },

      cuadro(dt) {
        if (this.tomada || !this.meta) return;
        const d = resta(this.meta, this.pos);
        const L = largo(d);
        const paso = 0.9 * dt;
        if (L <= paso) {
          this.pos = v3(this.meta.x, this.meta.y, this.meta.z);
          this.meta = null;
          const t = this.llevando;
          this.llevando = null;
          if (t && !this.conectada) this._enchufar(t);
          this._dibujar();
          return;
        }
        this.pos = suma(this.pos, por(d, paso / L));
        this._dibujar();
      },
    };
    c._dibujar();

    /** Un clic en el enchufe: se elige (o se deja de elegir). */
    c.clic = function () {
      if (!this.habilitada || this.conectada || this.tomada) return;
      this._elegir(self.elegido !== this);
    };
    blanco.addEventListener("toque", () => c.clic());
    return this.agregar(c);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Lo que sólo se mira
  // ══════════════════════════════════════════════════════════════════════════

  Panel.prototype.led = function (o) {
    const g = this.grupoEn(o.x, o.y, 0);
    this.modelo("led_base", {}, g);
    const luz = this.crear("sphere", { z: 0.004, sx: 0.02, sy: 0.02, sz: 0.02, color: o.color || "#3D4654", touchable: "false" }, g);
    return { nodo: g, color(c) { luz.setAttribute("color", c); } };
  };

  Panel.prototype.texto = function (o) {
    const t = this.crear("text", {
      x: o.x, y: o.y, z: o.z || 0.004, value: String(o.valor || ""), size: o.tam || 0.03,
      color: o.color || "#C8CCD8", touchable: "false",
    });
    return { nodo: t, valor(v) { t.setAttribute("value", String(v)); }, color(c) { t.setAttribute("color", c); } };
  };

  /** Una barra que se llena de izquierda a derecha, o de abajo para arriba
   *  con `o.vertical`. */
  Panel.prototype.barra = function (o) {
    if (o.vertical) return barraVertical(this, o);
    const x0 = o.x - o.ancho / 2;
    this.crear("box", { x: o.x, y: o.y, z: 0.003, sx: o.ancho, sy: o.alto, sz: 0.004, color: o.fondo || "#1B2028", touchable: "false" });
    const relleno = this.crear("box", { x: x0, y: o.y, z: 0.006, sx: 0.0001, sy: o.alto * 0.8, sz: 0.004, color: o.color || "#2ECC71", touchable: "false" });
    const barra = {
      nodo: relleno, v: 0,
      valor(f) {
        f = acotar(f, 0, 1);
        this.v = f;
        const w = Math.max(0.0001, (o.ancho - o.alto * 0.2) * f);
        relleno.scale = { x: w, y: o.alto * 0.8, z: 0.004 };
        relleno.position = { x: x0 + o.alto * 0.1 + w / 2, y: o.y, z: 0.006 };
      },
      color(c) { relleno.setAttribute("color", c); },
    };
    barra.valor(o.valor || 0);
    return barra;
  };

  function barraVertical(panel, o) {
    const y0 = o.y - o.alto / 2;
    panel.crear("box", { x: o.x, y: o.y, z: 0.003, sx: o.ancho, sy: o.alto, sz: 0.004, color: o.fondo || "#1B2028", touchable: "false" });
    const relleno = panel.crear("box", { x: o.x, y: y0, z: 0.006, sx: o.ancho * 0.8, sy: 0.0001, sz: 0.004, color: o.color || "#2ECC71", touchable: "false" });
    const barra = {
      nodo: relleno, v: 0,
      valor(f) {
        f = acotar(f, 0, 1);
        this.v = f;
        const h = Math.max(0.0001, (o.alto - o.ancho * 0.2) * f);
        relleno.scale = { x: o.ancho * 0.8, y: h, z: 0.004 };
        relleno.position = { x: o.x, y: y0 + o.ancho * 0.1 + h / 2, z: 0.006 };
      },
      color(c) { relleno.setAttribute("color", c); },
    };
    barra.valor(o.valor || 0);
    return barra;
  }

  /** Un vidrio oscuro con marco: el fondo de un radar o de un display. */
  Panel.prototype.pantalla = function (o) {
    const g = this.grupoEn(o.x, o.y, 0);
    this.crear("plane", { z: 0.003, sx: o.ancho, sy: o.alto, color: o.color || "#06090E", touchable: "false" }, g);
    const m = 0.008;
    for (const [x, y, sx, sy] of [[0, o.alto / 2, o.ancho + m * 2, m], [0, -o.alto / 2, o.ancho + m * 2, m],
      [o.ancho / 2, 0, m, o.alto], [-o.ancho / 2, 0, m, o.alto]]) {
      this.crear("box", { x, y, z: 0.006, sx, sy, sz: 0.01, color: o.marco || "#4A5464", touchable: "false" }, g);
    }
    return g;
  };

  globalThis.KIT = {
    Panel, marcoDe, atenuar,
    mate: { v3, suma, resta, por, largo, unitario, acotar, qDeEuler, eulerDeQ, qDesde, rotar },
  };
})();
