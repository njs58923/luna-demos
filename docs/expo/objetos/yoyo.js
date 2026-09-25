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

  function pared(op) {
    op = op || {};
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
      if (!n) continue;
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
      if (!n) continue;
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

  const fundible = (n) => (n.t === "box" || n.t === "cylinder" || n.t === "sphere") && !n.h && !n.a.id &&
    !n.a["material-alpha"] && !n.a["border-radius"] && /^#[0-9a-f]{6}$/i.test(String(n.a.color || ""));

  /** Cuántos vértices daría fundir estos nodos (para repartir en mallas). */
  function verticesDe(nodos) {
    let v = 0;
    for (const n of nodos) {
      if (!n) continue;
      if (fundible(n)) v += n.t === "box" ? 8 : formaDe(n).P.length;
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
      if (fundible(n)) v += n.t === "box" ? 36 : formaDe(n).I.length;
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
        const m = componer(base, matriz(n.a));
        const [r, g, b] = rgb(n.a.color).map((c) => lineal(c / 255));
        const F = formaDe(n);
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
  /** Lo que una malla le cuenta al cupo del motor (mesh.rs): los bytes que viajan. */
  const bytesDe = (b) => b.positions.byteLength + b.colors.byteLength + b.indices.byteLength;

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
// El yoyó: un carretel que baja por su hilo con una fracción de la gravedad.
//
// Al bajar, parte de la energía se va en hacerlo girar, así que cae con
// a ≈ g/3 y gira a ω = v/r (r, el eje donde se enrolla). Abajo el hilo se
// termina: si en ese momento hay un tirón hacia arriba, vuelve a subir con
// casi la misma velocidad (el hilo se enrolla de nuevo); si no, se queda
// "durmiendo", girando sobre la punta del hilo hasta que se frena. El punto
// de donde cuelga es el gancho del soporte o, en VR, la mano.
const P = Obj.props({ color: "#E63946", hilo: 0.7 });

const sinte = Obj.sinte({ volumen: 0.6 });
const donde = Obj.marco();
const yoyo = Obj.$("yoyo"), rueda = Obj.$("rueda"), hilo = Obj.$("hilo");
const GANCHO = { x: 0.1, y: 0.432, z: 0 };
const R_EJE = 0.004;
const A = 9.8 / 3;

let cuelga = { ...GANCHO };   // de dónde cuelga ahora
let enMano = false;
let largo = 0.015, vel = 0;   // hilo desenrollado y su velocidad (+ = bajando)
let giro = 0, omega = 0;
let estado = "arriba";        // arriba | baja | sube | duerme
let tironHasta = 0;           // un tirón reciente cuenta un ratito
const maximo = () => (enMano ? Math.max(0.2, Math.min(1.2, Number(P.hilo) || 0.7)) : 0.32);

function poner() {
  const c = { x: cuelga.x, y: cuelga.y - largo - R_EJE, z: cuelga.z };
  yoyo.position = c;
  rueda.rotation = { x: 0, y: 0, z: giro };
  const l = Obj.tender(hilo, cuelga, { x: c.x, y: c.y + R_EJE, z: c.z });
  hilo.scale = { x: 0.0015, y: Math.max(0.001, l), z: 0.0015 };
}

const anim = Obj.animador((t, dt) => {
  const ahora = performance.now();
  if (estado === "baja" || estado === "sube") {
    vel += A * dt;
    largo += vel * dt;
    if (estado === "sube" && vel >= 0) estado = "baja";   // no llegó: vuelve a caer
    if (largo <= 0.015 && vel < 0) {
      largo = 0.015; vel = 0; estado = "arriba";
      sinte.nota(900, 0.05, { tipo: "madera", vol: 0.4 });
      Obj.emitir("vuelve", {});
    }
    if (largo >= maximo()) {
      largo = maximo();
      // En el soporte siempre hay "tirón": vuelve solo (si le queda con qué).
      if ((!enMano || ahora < tironHasta) && Math.abs(vel) > 0.3) { vel = -Math.abs(vel) * 0.92; estado = "sube"; sinte.nota(220, 0.06, { tipo: "madera", vol: 0.25 }); }
      else { estado = "duerme"; Obj.emitir("duerme", {}); }
    }
    omega = vel / R_EJE;
  } else if (estado === "duerme") {
    // Gira abajo; si todavía gira rápido, un tirón lo trae: el hilo muerde el
    // eje y el giro guardado lo sube hasta la mano.
    omega *= Math.exp(-dt * 0.5);
    if (ahora < tironHasta && Math.abs(omega) > 60) {
      estado = "sube";
      vel = -Math.sqrt(2 * A * largo) * 1.08;
    }
    if (Math.abs(omega) < 5) omega = 0;
    // En el soporte, ya quieto, se enrolla solo.
    if (!enMano && omega === 0) { largo = 0.015; vel = 0; estado = "arriba"; }
  } else omega = 0;
  giro -= omega * dt;
  poner();
  return estado !== "arriba" || enMano;
});

function tirar(v) {
  if (estado !== "arriba") return;
  estado = "baja";
  vel = Math.max(0.3, v || 0.8);
  Obj.emitir("baja", {});
  anim.iniciar();
}

Obj.boton(Obj.$("toque"), () => tirar(0.8));
Obj.mensaje("tirar", () => tirar(0.8));

// En VR: la mano es el gancho.
let antes = null;
Obj.agarre({
  zona: Obj.$("zona"), donde,
  cerca(p) {
    // El piolín por arriba o el yoyó mismo.
    const c = { x: cuelga.x, y: cuelga.y - largo, z: cuelga.z };
    return Math.hypot(p.x - cuelga.x, p.y - cuelga.y, p.z - cuelga.z) < 0.07 || Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) < 0.07;
  },
  tomar(p) {
    enMano = true;
    if (estado === "duerme") estado = "baja";
    cuelga = { x: p.x, y: p.y, z: p.z };
    antes = { p, t: performance.now() };
    anim.iniciar();
  },
  mover(p) {
    const ahora = performance.now();
    const dt = Math.max(0.001, (ahora - antes.t) / 1000);
    const vy = (p.y - antes.p.y) / dt;
    antes = { p, t: ahora };
    cuelga = { x: p.x, y: p.y, z: p.z };
    // Lanzarlo: arriba en la mano y un movimiento rápido hacia abajo.
    if (estado === "arriba" && vy < -1) tirar(-vy * 0.8);
    // El tironcito: hacia arriba, rápido.
    if (vy > 0.5) tironHasta = ahora + 150;
  },
  soltar() {
    enMano = false;
    cuelga = { ...GANCHO };
    largo = 0.015; vel = 0; estado = "arriba";
    poner();
  },
});

function pintar() { for (const el of Obj.root.getElementsByClass("tapa")) el.setAttribute("color", Obj.color(P.color, "#E63946")); }
Obj.alCambiar(pintar);
pintar();
poner();
