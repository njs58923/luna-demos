// Sonido sintetizado: clips armados como WAV en memoria y tocados con el
// `Audio` del motor, que acepta bytes. Como en server_nave: no hay archivos de
// audio que versionar, y afinar un sonido es cambiar un número.
//
// El audio de Luna no es espacial, así que la distancia se hace con volumen.
// Sin el permiso `audio` —o en el arnés de pruebas sin mezclador— `Audio` no
// existe y `sonar()` no hace nada.
(globalThis.__modulos ||= []).push(["comun/sintesis", [], () => {
  const HZ = 22050;
  const VOL = 0.3;
  const acotar = (v, a, b) => Math.max(a, Math.min(b, v));

  /** Un WAV mono de 16 bits a partir de muestras en -1..1. */
  function wav(pcm) {
    const n = pcm.length;
    const b = new Uint8Array(44 + n * 2);
    const v = new DataView(b.buffer);
    const txt = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
    txt(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); txt(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, HZ, true); v.setUint32(28, HZ * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, acotar(pcm[i], -1, 1) * 32767, true);
    return b;
  }

  /** `fn(t, u)` con t en segundos y u de 0 a 1. Los primeros 2 ms entran en
   *  rampa: sin eso cada clip arranca con un chasquido. */
  function armar(dur, fn) {
    const n = Math.floor(HZ * dur);
    const a = new Float32Array(n);
    const ataque = HZ * 0.002;
    for (let i = 0; i < n; i++) a[i] = fn(i / HZ, i / n) * VOL * Math.min(1, i / ataque);
    return a;
  }

  const seno = (t, f) => Math.sin(2 * Math.PI * f * t);
  const caida = (u, k) => Math.exp(-u * k);
  /** Ruido con semilla fija, pasado por un filtro de un polo: `k` cerca de 0
   *  es un golpe sordo, cerca de 1 un siseo. */
  function ruido(k, semilla) {
    let x = semilla || 0x2545f491, y = 0;
    return () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      y += k * (((x >>> 0) / 2147483648 - 1) - y);
      return y;
    };
  }
  /** Un clic seco a partir de `t0`: lo que hace una pieza de metal al calzar. */
  function clic(t, t0, f) {
    const d = t - t0;
    return d < 0 ? 0 : seno(d, f) * Math.exp(-d * 90);
  }
  function notas(frecuencias, dur) {
    return armar(dur * frecuencias.length, (t) => {
      const i = Math.min(frecuencias.length - 1, Math.floor(t / dur));
      const tl = t - i * dur, u = tl / dur;
      return (seno(tl, frecuencias[i]) + 0.3 * seno(tl, frecuencias[i] * 2)) * 0.7 * caida(u, 3);
    });
  }

  /** Un juego de clips listo para tocar. `clips` es { nombre: () => Float32Array };
   *  cada uno ocupa una voz, y un espacio tiene 16. `etiqueta` va en los avisos. */
  function crearSonido(clips, etiqueta) {
    const voces = {};
    let hay = typeof Audio === "function";

    function voz(nombre) {
      let v = voces[nombre];
      if (!v) {
        v = new Audio(wav(clips[nombre]()));
        v.nombre = nombre;
        voces[nombre] = v;
      }
      return v;
    }

    function fallo(e) {
      const msg = (e && e.message) || String(e);
      // Volver a tocar un clip antes de que arranque cancela el play anterior
      // ("Audio play cancelled"): es el uso normal de un tiro tras otro, no un
      // fallo. Apagar el sonido por eso lo dejaba mudo el resto de la sesión.
      if (/cancel/i.test(msg)) return;
      hay = false;
      console.warn("[" + etiqueta + "] sin sonido:", msg);
    }

    /** `volumen` de 0 a 1. */
    function sonar(nombre, volumen = 1) {
      if (!hay || !clips[nombre]) return;
      try {
        const v = voz(nombre);
        v.volume = acotar(volumen, 0, 1);
        // Volver a empezar: sin el stop, un clip que ya terminó no vuelve a sonar.
        try { v.stop(); } catch (e) { /* todavía no cargó: play lo arranca igual */ }
        const p = v.play();
        if (p && p.catch) p.catch(fallo);
      } catch (e) {
        fallo(e);
      }
    }

    // Decodificar todo al entrar: un tiro que suena 100 ms tarde no es un tiro.
    if (hay) {
      try {
        for (const nombre in clips) {
          const p = voz(nombre).load();
          if (p && p.catch) p.catch(fallo);
        }
      } catch (e) {
        fallo(e);
      }
    }

    /** Volumen de algo que pasa a `d` metros de quien escucha. */
    const lejos = (d) => acotar(1.15 - d / 35, 0.35, 1);

    return { sonar, lejos };
  }

  return { crearSonido, armar, seno, caida, ruido, clic, notas };
}]);
