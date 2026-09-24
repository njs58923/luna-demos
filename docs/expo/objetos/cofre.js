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

;
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

;
// El cofre: una tapa curva que se abre y un tesoro que brilla.
//
// La tapa es un medio cilindro hecho de tablas: seis cajas en arco alrededor
// del eje de la bisagra, más las dos tapas de los costados. El tesoro son
// monedas (cilindros chatos) y piedras (esferas sin iluminación) apiladas con
// un azar fijo, así se ve igual cada vez que se abre.
const P = Obj.props({ madera: "#6B3F22", herrajes: "#8A7A55", clave: "" });

const memo = Obj.memoria("abierto");
const tapa = Obj.$("tapa");
const bisagra = Obj.$("bisagra");
const brillo = Obj.$("brillo");
const tesoro = Obj.$("tesoro");
const W = 0.7, D = 0.45;

// El lomo: centro del arco en (y=0, z=D/2) respecto de la bisagra.
const R = D / 2;
const tablas = [];
for (let i = 0; i < 6; i++) {
  const a = ((i + 0.5) / 6) * Math.PI;       // de atrás (0) a adelante (π)
  const y = Math.sin(a) * R, z = R - Math.cos(a) * R;
  tablas.push(Obj.crear("box", { y, z, rx: -(a - Math.PI / 2), sx: W, sy: 0.02, sz: (Math.PI * R) / 6 + 0.01, color: "#6B3F22" }, tapa));
}
const lados = [];
for (const s of [-1, 1]) {
  // Las tapas de los costados: medios discos hechos con un cilindro echado.
  lados.push(Obj.crear("cylinder", { x: s * (W / 2 - 0.01), z: R, rz: Math.PI / 2, sx: D, sy: 0.02, sz: D, color: "#5A3520" }, tapa));
}
const herrajesTapa = [];
for (const x of [-0.25, 0.25]) {
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI;
    herrajesTapa.push(Obj.crear("box", { x, y: Math.sin(a) * (R + 0.012), z: R - Math.cos(a) * (R + 0.012), rx: -(a - Math.PI / 2), sx: 0.04, sy: 0.006, sz: (Math.PI * R) / 6 + 0.012, color: "#8A7A55" }, tapa));
  }
}
// Los medios discos se ven enteros: se los tapa abajo con una tabla de la
// caja; la mitad de abajo queda adentro de la caja cuando está cerrada.

const azar = Obj.azar(42);
const ORO = ["#FFD700", "#F5C542", "#E6B422"];
const PIEDRAS = ["#E0115F", "#50C878", "#0F52BA", "#9966CC"];
for (let i = 0; i < 40; i++) {
  const x = (azar() - 0.5) * 0.6, z = (azar() - 0.5) * 0.36, y = 0.02 + azar() * 0.14 * (1 - Math.abs(x) * 1.5);
  Obj.crear("cylinder", { x, y, z, rx: (azar() - 0.5) * 0.8, rz: (azar() - 0.5) * 0.8, sx: 0.045, sy: 0.008, sz: 0.045, color: ORO[i % 3], "material-unlit": i % 4 === 0 ? "true" : "false" }, tesoro);
}
for (let i = 0; i < 7; i++) {
  const x = (azar() - 0.5) * 0.5, z = (azar() - 0.5) * 0.3;
  Obj.crear("sphere", { x, y: 0.13 + azar() * 0.05, z, sx: 0.05, sy: 0.04, sz: 0.05, color: PIEDRAS[i % PIEDRAS.length], "material-unlit": "true" }, tesoro);
}

let abierto = !!memo.leer(false);
let k = abierto ? 1 : 0;
let enMano = null;   // el ángulo de la tapa mientras la sostienen
function dibujar() {
  // Abre hacia atrás: -110° alrededor de X.
  const a = enMano !== null ? enMano : 1.92 * Obj.suave(k);
  bisagra.rotation = { x: -a, y: 0, z: 0 };
  brillo.setAttribute("visible", a > 0.96 ? "inherit" : "false");
}
const anim = Obj.animador((t, dt) => {
  const meta = abierto ? 1 : 0;
  if (enMano !== null) { dibujar(); return true; }
  if (meta > k) k = Math.min(1, k + dt / 0.8);
  else if (meta < k) k = Math.max(0, k - dt / 0.5);
  dibujar();
  return k !== meta;
});
function poner(v) {
  if (v === abierto) return;
  abierto = v;
  memo.guardar(abierto);
  anim.iniciar();
  Obj.emitir("cambio", { abierto });
}
Obj.boton(Obj.$("toque"), () => poner(!abierto));

// En VR: la tapa se levanta con la mano, de cualquier punto (la puerta de las
// manos, _vr.js); al soltarla termina de abrirse o se cierra.
Obj.manos().puerta({
  pivote: { x: 0, y: 0.34, z: -0.225 }, eje: { x: -1, y: 0, z: 0 }, brazo: { x: 0, y: 0, z: 1 },
  largo: 0.45, alto: 0.72, max: 1.92,
  angulo: () => (enMano !== null ? enMano : 1.92 * Obj.suave(k)),
  alTomar() { enMano = 1.92 * Obj.suave(k); anim.iniciar(); },
  mover(a) { enMano = a; dibujar(); },
  soltar(v, a) {
    enMano = null;
    k = Obj.suaveInversa(Math.min(1, a / 1.92));
    if (v !== abierto) poner(v); else anim.iniciar();
  },
});
Obj.mensaje("abrir", () => poner(true));
Obj.mensaje("cerrar", () => poner(false));

function pintar() {
  const m = Obj.color(P.madera, "#6B3F22"), h = Obj.color(P.herrajes, "#8A7A55");
  for (const el of Obj.root.getElementsByClass("madera")) el.setAttribute("color", m);
  for (const el of tablas) el.setAttribute("color", m);
  for (const el of lados) el.setAttribute("color", Obj.tono(m, -0.15));
  for (const el of Obj.root.getElementsByClass("herraje")) el.setAttribute("color", h);
  for (const el of herrajesTapa) el.setAttribute("color", h);
}
Obj.alCambiar(pintar);
pintar();
dibujar();
