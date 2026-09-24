// _base.js — lo común a todos los objetos de la calle.
//
// El servidor lo antepone a cada script de objeto: /objetos/reloj.js se sirve
// como _base.js + reloj.js, en un solo archivo. Dos <script src> separados
// llegan en cualquier orden (ver guides/trampas.md), y un objeto que se copia a
// otro mundo tiene que arrancar solo, sin depender de que llegue primero la
// biblioteca. Concatenar en el servidor es la forma de no repetirla.
//
// Todo cuelga de `Obj`. Lo que ofrece:
//
//   Obj.props(defaults)     las props: defaults < query de la URL < component.props
//   Obj.alCambiar(fn)       cuando el padre cambia las props
//   Obj.crear(tag, attrs, padre)
//   Obj.boton(el, fn, op)   toque + realce al pasar el puntero
//   Obj.memoria(nombre)     localStorage con el nombre del objeto y su `clave`
//   Obj.animador(fn)        un bucle de cuadros que se apaga solo
//   Obj.emitir / Obj.mensaje   el canal de componentes, sin romperse si no hay
//   Obj.sinte()             un sintetizador sobre AudioStream (pide `audio`)
//   Obj.teclado(el, op)     edición de texto con el teclado del sistema
//   Obj.v3, Obj.q*          vectores y cuaterniones
const Obj = (() => {
  const root = hiperspace.dimention;
  const comp = typeof component !== "undefined" ? component : null;
  /** El nombre del objeto sale de su URL: /objetos/reloj.hsml → "reloj". */
  const nombre = (() => {
    try {
      const m = /([\w-]+)\.hsml$/.exec(location.pathname || "");
      return m ? m[1] : "objeto";
    } catch (e) { return "objeto"; }
  })();

  // ── Props ───────────────────────────────────────────────────────────────
  /** La query de la URL, con números y booleanos convertidos. Sirve para
   *  configurar un objeto con sólo copiar su URL: .../lampara.hsml?luz=%23FFD60A */
  function deQuery() {
    const out = {};
    try {
      for (const [k, v] of new URLSearchParams(location.search || "")) {
        if (v === "true" || v === "false") out[k] = v === "true";
        else if (v !== "" && Number.isFinite(Number(v))) out[k] = Number(v);
        else out[k] = v;
      }
    } catch (e) { /* sin query */ }
    return out;
  }
  let defaults = {};
  /** Un solo objeto, que se actualiza en el lugar: quien guardó la referencia
   *  que devolvió props() ve siempre lo vigente. */
  const actuales = {};
  const oyentes = [];
  function mezclar() {
    const deComp = (comp && comp.props) || {};
    for (const k of Object.keys(actuales)) delete actuales[k];
    Object.assign(actuales, defaults, deQuery(), deComp);
    return actuales;
  }
  function props(d) {
    defaults = d || {};
    return mezclar();
  }
  function alCambiar(fn) { oyentes.push(fn); }
  if (comp) {
    comp.addEventListener("propschange", (e) => {
      const antes = Object.assign({}, actuales);
      mezclar();
      const cambios = (e.detail && e.detail.changedKeys) || [];
      for (const fn of oyentes) {
        try { fn(actuales, antes, cambios); } catch (err) { console.error("[" + nombre + "] propschange:", err); }
      }
    });
  }

  // ── Nodos ───────────────────────────────────────────────────────────────
  function crear(tag, attrs, padre) {
    const el = root.createElement(tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, String(attrs[k]));
    (padre || root).appendChild(el);
    if (tag === "posezone" && (!padre || padre === root)) calibrarCon(el);
    return el;
  }
  const $ = (id) => root.getElementById(id);
  /** El punto de un toque en coordenadas del nodo tocado ([x, y, z], en
   *  unidades del nodo: en un plano, de -0.5 a 0.5), o null. El motor lo
   *  manda como localX..localZ. */
  function toqueLocal(e) {
    if (e && Number.isFinite(e.localX) && Number.isFinite(e.localY)) return [e.localX, e.localY, Number(e.localZ) || 0];
    if (e && Array.isArray(e.local)) return e.local;
    return null;
  }

  // ── Color ───────────────────────────────────────────────────────────────
  function rgb(hex) {
    let h = String(hex || "#000000").replace("#", "");
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    const v = parseInt(h.slice(0, 6), 16) || 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  const hex = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);
  /** k > 0 aclara hacia el blanco, k < 0 oscurece hacia el negro. */
  function tono(color, k) {
    const [r, g, b] = rgb(color);
    if (k >= 0) return hex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
    return hex(r * (1 + k), g * (1 + k), b * (1 + k));
  }
  function mezcla(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }
  /** Un color válido o el de respaldo: las props vienen de afuera. */
  const color = (c, d) => (typeof c === "string" && /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c) ? c : d);

  // ── Botones ─────────────────────────────────────────────────────────────
  /** Hace tocable un nodo: `fn` al toque, y un realce mientras el puntero está
   *  encima. `op.color` es el color base (getAttribute no ve los cambios hechos
   *  desde el script, así que el base hay que decirlo); `op.realce` el de
   *  encima. Devuelve un objeto para cambiarle el color base después. */
  function boton(el, fn, op) {
    op = op || {};
    let base = op.color || null;
    let encima = false;
    el.setAttribute("touchable", "true");
    const pintar = () => {
      if (!base) return;
      el.setAttribute("color", encima ? (op.realce || tono(base, 0.25)) : base);
    };
    el.addEventListener("pointerenter", () => { encima = true; pintar(); });
    el.addEventListener("pointerleave", () => { encima = false; pintar(); });
    el.addEventListener("toque", (e) => {
      try { fn(e); } catch (err) { console.error("[" + nombre + "] toque:", err); }
    });
    return {
      set color(c) { base = c; pintar(); },
      get color() { return base; },
      get encima() { return encima; },
    };
  }

  // ── Memoria ─────────────────────────────────────────────────────────────
  /** localStorage por objeto y por `clave`. El almacén es del origen del
   *  objeto, no del mundo que lo incluye: dos copias del mismo objeto en dos
   *  mundos comparten lo guardado salvo que tengan claves distintas. */
  function memoria(que) {
    const k = () => "obj:" + nombre + ":" + String(actuales.clave || "") + ":" + que;
    return {
      leer(d) {
        try {
          const v = localStorage.getItem(k());
          return v == null ? d : JSON.parse(v);
        } catch (e) { return d; }
      },
      guardar(v) {
        try { localStorage.setItem(k(), JSON.stringify(v)); return true; } catch (e) { return false; }
      },
      borrar() { try { localStorage.removeItem(k()); } catch (e) { /* nada */ } },
    };
  }

  // ── Animación ───────────────────────────────────────────────────────────
  /** Un bucle de cuadros que corre mientras `fn(t, dt)` devuelva true. Un
   *  objeto quieto no pide cuadros: con cuarenta objetos en una calle, eso es
   *  la diferencia entre un isolate dormido y uno despierto. */
  function animador(fn) {
    let activo = false, antes = 0;
    function cuadro(ms) {
      const t = ms / 1000;
      const dt = antes ? Math.min(0.1, t - antes) : 0;
      antes = t;
      let seguir = false;
      try { seguir = fn(t, dt); } catch (err) { console.error("[" + nombre + "] cuadro:", err); }
      if (seguir) requestAnimationFrame(cuadro);
      else { activo = false; antes = 0; }
    }
    return {
      iniciar() { if (!activo) { activo = true; requestAnimationFrame(cuadro); } },
      get activo() { return activo; },
    };
  }
  const suave = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  /** La inversa de suave: qué t da ese valor (para seguir una animación
   *  desde donde la dejó una mano). */
  const suaveInversa = (y) => (y <= 0 ? 0 : y >= 1 ? 1 : 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3));
  const salida = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));

  // ── Canal de componentes ────────────────────────────────────────────────
  /** Emitir sin romperse: fuera de un include, o si el padre no declaró el
   *  evento en `events`, la promesa rechaza y acá se ignora. */
  function emitir(tipo, datos) {
    if (!comp || !comp.connected) return;
    try { comp.emit(tipo, datos == null ? null : datos).catch(() => {}); } catch (e) { /* no declarado */ }
  }
  function mensaje(tipo, fn) {
    if (!comp) return;
    comp.addEventListener("message:" + tipo, (e) => {
      try { fn(e.detail); } catch (err) { console.error("[" + nombre + "] mensaje " + tipo + ":", err); }
    });
  }

  // ── Sonido ──────────────────────────────────────────────────────────────
  /** Un sintetizador chico: las notas se mezclan en un anillo de muestras y
   *  una bomba lo vuelca al AudioStream de a pedazos. La bomba se apaga sola
   *  después de un rato de silencio, así un objeto callado no escribe ceros
   *  para siempre.
   *
   *  Sin el permiso `audio`, AudioStream se construye igual y falla recién en
   *  play(): se avisa una vez y el objeto sigue andando mudo. */
  function sinte(op) {
    op = op || {};
    const RATE = op.rate || 22050;
    const LARGO = RATE * 4;
    const anillo = new Float32Array(LARGO);
    let lectura = 0;          // próximo frame a escribir al stream
    let ultimoSonido = 0;     // hasta qué frame hay algo en el anillo
    let voz = null, fallo = false, bomba = null, silencio = 0, arrancando = null;
    let flujoFn = null, flujoPos = 0, flujoT = 0;

    function arrancar() {
      if (voz || fallo) return arrancando;
      if (typeof AudioStream === "undefined") { fallo = true; return null; }
      try {
        voz = new AudioStream({ sampleRate: RATE, channels: 1, bufferSeconds: 0.3 });
        voz.volume = Math.max(0, Math.min(1, op.volumen == null ? 0.8 : op.volumen));
        arrancando = Promise.resolve(voz.ready).then(() => voz.play()).catch((e) => {
          fallo = true;
          console.warn("[" + nombre + "] sin sonido:", (e && e.message) || e, "(¿falta delegar resources=audio?)");
        });
      } catch (e) {
        fallo = true;
        console.warn("[" + nombre + "] sin sonido:", (e && e.message) || e);
      }
      return arrancando;
    }
    function bombear() {
      if (!voz || fallo) return;
      // Un flujo continuo (una radio, un ambiente) se escribe en el anillo
      // hasta medio segundo por delante de lo que ya se mandó.
      if (flujoFn) {
        const hasta = lectura + Math.floor(RATE * 0.5);
        if (flujoPos < lectura) flujoPos = lectura;
        for (; flujoPos < hasta; flujoPos++) {
          let v = 0;
          try { v = flujoFn(flujoT++ / RATE); } catch (e) { v = 0; }
          anillo[flujoPos % LARGO] += Number.isFinite(v) ? v : 0;
        }
        ultimoSonido = Math.max(ultimoSonido, flujoPos);
      }
      let libres = 0;
      try { libres = Math.min(voz.writableFrames | 0, RATE >> 2); } catch (e) { libres = 0; }
      if (libres > 0) {
        const trozo = new Float32Array(libres);
        for (let i = 0; i < libres; i++) {
          const j = (lectura + i) % LARGO;
          trozo[i] = Math.max(-1, Math.min(1, anillo[j]));
          anillo[j] = 0;
        }
        let tomados = libres;
        try { tomados = voz.write(trozo); } catch (e) { tomados = 0; }
        // Lo que no entró vuelve al anillo para el próximo turno.
        for (let i = tomados; i < libres; i++) anillo[(lectura + i) % LARGO] = trozo[i];
        lectura += tomados;
      }
      if (lectura >= ultimoSonido) {
        silencio += 1;
        if (silencio > 60) { clearInterval(bomba); bomba = null; }
      } else silencio = 0;
    }
    /** Suma una forma de onda al anillo, a partir de `retraso` segundos. */
    function sumar(generar, dur, retraso) {
      arrancar();
      if (fallo) return false;
      const n = Math.min(LARGO - RATE, Math.floor(dur * RATE));
      const inicio = lectura + Math.floor(RATE * 0.03) + Math.floor((retraso || 0) * RATE);
      for (let i = 0; i < n; i++) anillo[(inicio + i) % LARGO] += generar(i / RATE);
      ultimoSonido = Math.max(ultimoSonido, inicio + n);
      silencio = 0;
      if (!bomba) bomba = setInterval(bombear, 30);
      return true;
    }
    const DOS_PI = Math.PI * 2;
    /** Una nota. `tipo`: "campana" (seno con parcial alto), "seno",
     *  "cuadrada", "pulso" (clic), "ruido", "madera" (golpe seco). */
    function nota(f, dur, o) {
      o = o || {};
      const vol = o.vol == null ? 0.35 : o.vol;
      const tipo = o.tipo || "campana";
      const caida = o.caida || (tipo === "campana" ? 3.2 : 6);
      const ataque = o.ataque || 0.004;
      let semilla = 12345;
      return sumar((t) => {
        const env = (t < ataque ? t / ataque : 1) * Math.exp(-caida * t);
        let s;
        if (tipo === "campana") s = Math.sin(DOS_PI * f * t) + 0.35 * Math.sin(DOS_PI * f * 4.02 * t) * Math.exp(-8 * t);
        else if (tipo === "madera") s = Math.sin(DOS_PI * f * t) * 0.8 + 0.4 * Math.sin(DOS_PI * f * 3.9 * t) * Math.exp(-30 * t);
        else if (tipo === "cuadrada") s = Math.sin(DOS_PI * f * t) > 0 ? 0.6 : -0.6;
        else if (tipo === "ruido") { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; s = semilla / 0x3fffffff - 1; }
        else if (tipo === "pulso") s = Math.sin(DOS_PI * f * t) * Math.exp(-40 * t);
        else s = Math.sin(DOS_PI * f * t);
        return s * env * vol;
      }, dur, o.retraso);
    }
    /** Un sonido sin fin: `fn(t)` da la muestra del segundo t desde que
     *  arrancó. `flujo(null)` lo corta. Uno solo a la vez. */
    function flujo(fn) {
      flujoFn = typeof fn === "function" ? fn : null;
      flujoT = 0;
      if (flujoFn) {
        arrancar();
        if (fallo) { flujoFn = null; return false; }
        flujoPos = lectura + Math.floor(RATE * 0.03);
        silencio = 0;
        if (!bomba) bomba = setInterval(bombear, 30);
      }
      return true;
    }
    return { nota, sumar, flujo, get mudo() { return fallo; }, RATE };
  }
  /** La frecuencia de una nota por semitonos desde el La 440. */
  const frecuencia = (semitonos) => 440 * Math.pow(2, semitonos / 12);

  // ── Teclado ─────────────────────────────────────────────────────────────
  /** Edición de texto con el teclado del sistema (físico o el virtual de VR).
   *  Al tocar `el` se le pide el foco editable; el motor lo concede sólo si
   *  el toque vino del usuario. Ctrl+V trae el portapapeles en el propio
   *  evento. `op.cambio(texto)` en cada edición, `op.foco(bool)` al entrar y
   *  salir. */
  function teclado(el, op) {
    op = op || {};
    let texto = String(op.texto || "");
    const max = op.max || 400;
    let enfocado = false;
    const avisar = () => { try { op.cambio && op.cambio(texto); } catch (e) { console.error(e); } };
    const poner = (t) => { texto = String(t).slice(0, max); avisar(); };
    el.insertText = (t) => { if (enfocado) poner(texto + t); };
    el.defaultKeyDown = (e) => {
      if (!enfocado) return;
      const k = String(e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "v" && e.clipboardText) {
        if (e.preventDefault) e.preventDefault();
        poner(texto + e.clipboardText);
      } else if ((e.ctrlKey || e.metaKey) && (k === "c" || k === "x")) {
        try { keyboard.copy(texto); } catch (err) { /* sin portapapeles */ }
        if (k === "x") poner("");
      } else if (e.key === "Backspace") poner(Array.from(texto).slice(0, -1).join(""));
      else if (e.key === "Enter" && !op.unaLinea) poner(texto + String.fromCharCode(10));
      else if (e.key === "Enter" || e.key === "Escape") soltar();
    };
    function soltar() {
      if (!enfocado) return;
      enfocado = false;
      try { el.blur(); } catch (e) { /* ya no tenía foco */ }
      try { op.foco && op.foco(false); } catch (e) { console.error(e); }
    }
    el.addEventListener("blur", () => {
      if (!enfocado) return;
      enfocado = false;
      try { op.foco && op.foco(false); } catch (e) { console.error(e); }
    });
    function tomar() {
      if (typeof keyboard === "undefined") return;
      try { keyboard.focus(el, { editable: true }); } catch (e) { return; }
      enfocado = true;
      try { op.foco && op.foco(true); } catch (e) { console.error(e); }
    }
    return {
      tomar, soltar,
      get texto() { return texto; },
      set texto(t) { texto = String(t).slice(0, max); },
      get enfocado() { return enfocado; },
    };
  }

  // ── Vectores y cuaterniones ─────────────────────────────────────────────
  const v3 = (x, y, z) => ({ x, y, z });
  function qMul(a, b) {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    };
  }
  /** El vector v girado por q. */
  function rotarV(q, v) {
    const r = qMul(qMul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), { x: -q.x, y: -q.y, z: -q.z, w: q.w });
    return v3(r.x, r.y, r.z);
  }
  function qEje(eje, ang) {
    const s = Math.sin(ang / 2);
    return { x: eje.x * s, y: eje.y * s, z: eje.z * s, w: Math.cos(ang / 2) };
  }
  function qSlerp(a, b, t) {
    let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    if (d < 0) { b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }; d = -d; }
    if (d > 0.9995) {
      const r = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t };
      const m = Math.hypot(r.x, r.y, r.z, r.w) || 1;
      return { x: r.x / m, y: r.y / m, z: r.z / m, w: r.w / m };
    }
    const th = Math.acos(d), s = Math.sin(th);
    const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
    return { x: a.x * ka + b.x * kb, y: a.y * ka + b.y * kb, z: a.z * ka + b.z * kb, w: a.w * ka + b.w * kb };
  }
  /** Euler XYZ intrínseco, que es lo que el motor arma con Quat::from_euler. */
  function euler(q) {
    const { x, y, z, w } = q;
    const m00 = 1 - 2 * (y * y + z * z), m01 = 2 * (x * y - w * z), m02 = 2 * (x * z + w * y);
    const m11 = 1 - 2 * (x * x + z * z), m12 = 2 * (y * z - w * x);
    const m21 = 2 * (y * z + w * x), m22 = 1 - 2 * (x * x + y * y);
    const ey = Math.asin(Math.max(-1, Math.min(1, m02)));
    if (Math.abs(m02) < 0.9999999) return v3(Math.atan2(-m12, m22), ey, Math.atan2(-m01, m00));
    return v3(Math.atan2(m21, m11), ey, 0);
  }
  const X = v3(1, 0, 0), Y = v3(0, 1, 0), Z = v3(0, 0, 1);
  /** El giro (en Euler, listo para `el.rotation`) que lleva +Y a la
   *  dirección d: para palos, hilos y cilindros tendidos entre dos puntos. */
  function apuntarY(d) {
    const m = Math.hypot(d.x, d.y, d.z) || 1;
    const c = d.y / m;
    if (c > 0.9999999) return v3(0, 0, 0);
    if (c < -0.9999999) return v3(Math.PI, 0, 0);
    const l = Math.hypot(d.x, d.z);
    return euler(qEje(v3(d.z / l, 0, -d.x / l), Math.acos(c)));
  }
  /** El giro (Euler) cuyas columnas son los ejes x, y, z dados: el local +X
   *  queda en x, +Y en y, +Z en z (una base ortonormal derecha). */
  function deEjes(x, y, z) {
    const m02 = z.x, m12 = z.y, m22 = z.z, m01 = y.x, m00 = x.x, m21 = y.z, m11 = y.y;
    const ey = Math.asin(Math.max(-1, Math.min(1, m02)));
    if (Math.abs(m02) < 0.9999999) return v3(Math.atan2(-m12, m22), ey, Math.atan2(-m01, m00));
    return v3(Math.atan2(m21, m11), ey, 0);
  }
  /** Un cilindro tendido de a hasta b (sus sx/sz quedan como estén). */
  function tender(el, a, b) {
    const d = v3(b.x - a.x, b.y - a.y, b.z - a.z);
    const largo = Math.hypot(d.x, d.y, d.z);
    el.position = v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    el.rotation = apuntarY(d);
    return largo;
  }

  // ── Dónde quedó el objeto ───────────────────────────────────────────────
  /** El marco del objeto en el mundo: origen y ejes (con su escala).
   *
   *  Las poses de los mandos llegan en coordenadas de mundo, y un include no
   *  puede leer la transformación de quien lo aloja: sólo `globalPosition` de
   *  sus propios nodos. Con cuatro puntos —el origen y uno a un metro sobre
   *  cada eje— sale el marco entero, giro y escala incluidos. Se relee cada
   *  100 ms: el objeto puede estar en manos de un manipulador. */
  /** La posición global de un nodo, leída ahora. `el.globalPosition` devuelve
   *  un proxy que se guarda el primer valor que leyó y no lo vuelve a pedir
   *  (ProxyVec3 en runtime.js): para algo que se mueve hay que ir a la op. */
  function globalFresca(el) {
    const op = typeof Deno !== "undefined" && Deno.core && Deno.core.ops && Deno.core.ops.op_hsml_get_global_position;
    if (op && el.nodeId != null && el.nodeId >= 0) {
      const a = op(el.nodeId);
      if (a && a.length >= 3) return { x: a[0], y: a[1], z: a[2] };
    }
    const g = el.globalPosition;
    return { x: g.x, y: g.y, z: g.z };
  }

  // ── La calibración con las manos ────────────────────────────────────────
  // Cada posemove trae la pose del mando dos veces: en el mundo (px, qx..) y
  // en el marco del padre del posezone (localX.., lqx.., ldx..). Todos los
  // posezones de los objetos cuelgan directo del <space>, así que ese marco
  // es el del objeto, y de un solo evento sale entero: el giro es q·lq⁻¹, la
  // escala 1/|ld| y el origen lo que sobra. Es exacto en el mismo cuadro en
  // que llega la mano, aunque alguien esté llevando el objeto con un
  // manipulador: por eso esto corre antes que cualquier otro oyente.
  let calib = null;
  function calibrar(e) {
    if (!e || !Number.isFinite(e.localX) || !Number.isFinite(e.lqw) || !Number.isFinite(e.qw)) return;
    const ql = { x: -e.lqx, y: -e.lqy, z: -e.lqz, w: e.lqw };
    const R = qMul({ x: e.qx, y: e.qy, z: e.qz, w: e.qw }, ql);
    const ld = Math.hypot(e.ldx || 0, e.ldy || 0, e.ldz || 0);
    const k = Number.isFinite(ld) && ld > 1e-6 ? 1 / ld : 1;
    const ex = rotarV(R, v3(k, 0, 0)), ey = rotarV(R, v3(0, k, 0)), ez = rotarV(R, v3(0, 0, k));
    const L = { x: e.localX, y: e.localY, z: e.localZ };
    const o = {
      x: e.px - (ex.x * L.x + ey.x * L.y + ez.x * L.z),
      y: e.py - (ex.y * L.x + ey.y * L.y + ez.y * L.z),
      z: e.pz - (ex.z * L.x + ey.z * L.y + ez.z * L.z),
    };
    if ([o.x, o.y, o.z, ex.x, ey.y, ez.z].every(Number.isFinite)) calib = { o, ex, ey, ez };
  }
  const calibrados = new Set();
  calibrar.__deLaBase = true;
  function calibrarCon(zona) {
    if (!zona || calibrados.has(zona)) return;
    calibrados.add(zona);
    zona.addEventListener("posemove", calibrar);
  }
  try {
    for (const h of root.children || []) if (String(h.tagName || "").toLowerCase() === "posezone") calibrarCon(h);
  } catch (e) { /* sin hijos todavía */ }

  function marco() {
    let refs = null, cache = null, cuando = -1e9;
    function leer() {
      if (calib) return calib;
      if (!refs) {
        refs = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]].map(([x, y, z]) =>
          crear("group", { x, y, z, visible: "false" }));
      }
      const ahora = performance.now();
      if (cache && ahora - cuando < 100) return cache;
      const g = refs.map(globalFresca);
      const o = { x: g[0].x, y: g[0].y, z: g[0].z };
      const eje = (p) => ({ x: p.x - o.x, y: p.y - o.y, z: p.z - o.z });
      cache = { o, ex: eje(g[1]), ey: eje(g[2]), ez: eje(g[3]) };
      cuando = ahora;
      return cache;
    }
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    return {
      /** Mundo → coordenadas del objeto. */
      aLocal(p) {
        const m = leer();
        const d = { x: p.x - m.o.x, y: p.y - m.o.y, z: p.z - m.o.z };
        const k = (e) => { const l2 = dot(e, e); return l2 > 1e-12 ? dot(d, e) / l2 : 0; };
        return { x: k(m.ex), y: k(m.ey), z: k(m.ez) };
      },
      /** Coordenadas del objeto → mundo. */
      aMundo(p) {
        const m = leer();
        return {
          x: m.o.x + m.ex.x * p.x + m.ey.x * p.y + m.ez.x * p.z,
          y: m.o.y + m.ex.y * p.x + m.ey.y * p.y + m.ez.y * p.z,
          z: m.o.z + m.ex.z * p.x + m.ey.z * p.y + m.ez.z * p.z,
        };
      },
      /** Una dirección del mundo → del objeto (sin trasladar). */
      dirLocal(v) {
        const m = leer();
        const k = (e) => { const l2 = dot(e, e); return l2 > 1e-12 ? dot(v, e) / Math.sqrt(l2) : 0; };
        return { x: k(m.ex), y: k(m.ey), z: k(m.ez) };
      },
      /** Cuántos metros de mundo mide un metro del objeto. */
      get escala() { const m = leer(); return Math.sqrt(dot(m.ey, m.ey)) || 1; },
    };
  }

  /** Dónde está el visitante (su cabeza o la cámara), en coordenadas del
   *  objeto. Pide el recurso read_camera_pose; sin él, o antes del primer
   *  cuadro, da null. `donde` es un Obj.marco(). */
  function visitante(donde) {
    try {
      const f = root.readViewerPose;
      const p = typeof f === "function" ? f.call(root) : null;
      if (!p || !Number.isFinite(p.px)) return null;
      return donde.aLocal({ x: p.px, y: p.py, z: p.pz });
    } catch (e) { return null; }
  }

  // ── Agarrar y tirar ─────────────────────────────────────────────────────
  /** Tomar algo con el grip, llevarlo con la mano y soltarlo con la
   *  velocidad que traía la mano: lo de la demo de física, en chico.
   *
   *  Todo en coordenadas del objeto (se pasan con marco()). `op`:
   *    zona       el posezone que manda las manos
   *    donde      un Obj.marco()
   *    cerca(p)   ¿la mano en p puede tomarlo? (p en coordenadas del objeto)
   *    tomar(p, mano, e)   arrancó el agarre
   *    mover(p, mano, e)   la mano se movió llevándolo
   *  (`e` es el posemove crudo, por si hace falta hacia dónde apunta el
   *  mando: e.dx..e.dz, o su giro: e.qx..e.qw, ambos del mundo)
   *    soltar(p, v, mano)  lo soltó, con la velocidad v (m/s)
   *    gatillo    true: el gatillo también agarra, no sólo el grip
   *  Una mano que deja de mandar poses se da por soltada a los 400 ms. */
  function agarre(op) {
    const manos = { left: null, right: null };
    let quien = null;
    const vel = (h) => {
      if (h.length < 2) return { x: 0, y: 0, z: 0 };
      const a = h[0], b = h[h.length - 1];
      const dt = Math.max(0.001, (b.t - a.t) / 1000);
      return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt, z: (b.z - a.z) / dt };
    };
    function soltar(mano) {
      const m = manos[mano];
      quien = null;
      if (!m) return;
      const h = m.hist.filter((x) => m.hist[m.hist.length - 1].t - x.t <= 90);
      try { op.soltar && op.soltar(m.p, vel(h), mano); } catch (e) { console.error(e); }
    }
    if (op.zona) {
      op.zona.addEventListener("posemove", (e) => {
        const mano = e.hand === "left" ? "left" : "right";
        const p = op.donde.aLocal({ x: e.px, y: e.py, z: e.pz });
        const ahora = performance.now();
        const m = manos[mano] || (manos[mano] = { grip: false, hist: [], p, t: 0 });
        m.p = p; m.t = ahora;
        m.hist.push({ x: p.x, y: p.y, z: p.z, t: ahora });
        while (m.hist.length > 8) m.hist.shift();
        // Con `op.gatillo`, también se agarra con el gatillo (como los
        // controles de un panel: se aprietan con el dedo que esté más a mano).
        const g = op.gatillo ? Math.max(e.grip || 0, e.trigger || 0) : e.grip || 0;
        const antes = m.grip;
        if (!m.grip && g > 0.6) m.grip = true;
        else if (m.grip && g < 0.35) m.grip = false;
        if (!antes && m.grip && !quien && op.cerca(p)) {
          quien = mano;
          try { op.tomar && op.tomar(p, mano, e); } catch (err) { console.error(err); }
        } else if (antes && !m.grip && quien === mano) {
          soltar(mano);
        } else if (quien === mano) {
          try { op.mover && op.mover(p, mano, e); } catch (err) { console.error(err); }
        }
      });
    }
    setInterval(() => {
      const ahora = performance.now();
      for (const mano of ["left", "right"]) {
        const m = manos[mano];
        if (m && ahora - m.t > 400) {
          if (quien === mano) soltar(mano);
          manos[mano] = null;
        }
      }
    }, 200);
    return { get tomado() { return !!quien; }, get mano() { return quien; } };
  }

  /** Cuánto está girada la muñeca mirando de frente el plano XY del objeto
   *  (el de un control de pared): el ángulo, en el sentido del reloj desde
   *  arriba, del "arriba" del mando proyectado en ese plano. Para perillas.
   *  null si el mando apunta casi derecho al plano y no hay giro que leer. */
  function giroMuneca(e, donde) {
    const q = { x: e.qx || 0, y: e.qy || 0, z: e.qz || 0, w: e.qw == null ? 1 : e.qw };
    // El motor apunta el mando por su -Y: la muñeca gira alrededor de Y, y lo
    // que da vueltas con ella es el costado, el X.
    const a = donde.dirLocal(rotarV(q, v3(1, 0, 0)));
    if (Math.hypot(a.x, a.y) < 0.25) return null;
    return Math.atan2(a.x, a.y);
  }
  /** La diferencia más corta entre dos ángulos, en (-π, π]. */
  const difAngulo = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  /** Un azar con semilla, para lo que tiene que salir igual en cada recarga. */
  function azar(semilla) {
    let a = (semilla >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    root, nombre, $, toqueLocal, props, alCambiar, crear, boton, memoria, animador, suave, suaveInversa, salida,
    emitir, mensaje, sinte, frecuencia, teclado, marco, agarre, visitante, giroMuneca, difAngulo,
    tono, mezcla, color, rgb, hex,
    v3, qMul, qEje, qSlerp, rotarV, euler, deEjes, apuntarY, tender, X, Y, Z, azar,
    get componente() { return comp; },
  };
})();
