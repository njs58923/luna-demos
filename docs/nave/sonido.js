// El sonido de la nave, sintetizado en el cliente.
//
// No hay ni un archivo de audio en el proyecto. Los clips se arman acá como
// WAV en memoria y se le pasan al `Audio` del motor, que acepta bytes además
// de una URL. Son ocho sonidos cortos: un pito de tarea lista, un zumbido de
// error, la alarma de los sabotajes, el barrido del apagón, el soplido del
// conducto y poco más.
//
// Se hace así por tres razones, en este orden:
//
//   1. **No hay que versionar binarios.** Un .wav de medio segundo en el repo
//      es medio segundo que nadie va a poder editar ni revisar en un diff.
//   2. **Se afina leyendo.** "660 a 990 Hz en 90 ms" dice más que un archivo
//      llamado listo.wav, y cambiarlo es cambiar un número.
//   3. **El motor ya los cachea igual**: se arman una vez al entrar.
//
// Si el permiso `audio` no está concedido —o si el documento se abre en el
// arnés de las pruebas, donde no hay mezclador—, `Audio` no existe y todo esto
// queda en nada sin romper: `tocar()` no hace ruido y nadie se entera.

(function () {
  const HZ = 22050;
  const VOL = 0.22;

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
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44 + i * 2, s * 32767, true);
    }
    return b;
  }

  /** `fn(t, u)` con t en segundos y u de 0 a 1: la forma de onda. */
  function armar(dur, fn) {
    const n = Math.floor(HZ * dur);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = fn(i / HZ, i / n) * VOL;
    return a;
  }

  const seno = (t, f) => Math.sin(2 * Math.PI * f * t);
  /** Una caída exponencial: es lo que hace que un pito suene a pito y no a
   *  sirena cortada. */
  const caida = (u, k) => Math.exp(-u * (k || 5));
  /** Un barrido de f0 a f1. La fase se integra, si no el tono salta. */
  function barrido(t, dur, f0, f1) {
    const k = (f1 - f0) / dur;
    return Math.sin(2 * Math.PI * (f0 * t + (k * t * t) / 2));
  }

  /** Ruido con semilla fija. Math.random anda igual, pero en este proyecto el
   *  azar sin semilla es la excepción y no vale la pena hacerla por un soplido. */
  function ruido() {
    let x = 0x2545f491;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) / 2147483648) - 1; };
  }

  const CLIPS = {
    // Tarea lista: dos notas para arriba.
    listo: () => armar(0.2, (t, u) => seno(t, t < 0.09 ? 660 : 990) * caida(u, 4)),
    // Algo no se puede: un zumbido grave y corto.
    error: () => armar(0.18, (t, u) => (seno(t, 150) + seno(t, 151.5)) * 0.5 * caida(u, 6)),
    // Abrir un panel: un clic.
    panel: () => armar(0.05, (t, u) => seno(t, 1250) * caida(u, 9)),
    // Sabotaje crítico: dos tonos alternados, como una alarma de verdad.
    alarma: () => armar(0.7, (t, u) => seno(t, Math.floor(t / 0.14) % 2 ? 560 : 760) * caida(u, 1.2)),
    // Se cortó la luz: todo se viene abajo.
    apagon: () => armar(0.6, (t, u) => barrido(t, 0.6, 700, 90) * caida(u, 2)),
    // Conducto: un soplido. Ruido con la energía cayendo.
    conducto: () => { const r = ruido(); return armar(0.34, (t, u) => r() * caida(u, 7) * (1 - u * 0.5)); },
    // Votar: una gota.
    voto: () => armar(0.1, (t, u) => seno(t, 520 + 200 * u) * caida(u, 8)),
    // Expulsión, y también la derrota: para abajo y largo.
    expulsion: () => armar(0.85, (t, u) => barrido(t, 0.85, 420, 110) * caida(u, 1.6)),
  };

  const voces = {};
  let hay = typeof Audio === "function";

  function tocar(nombre) {
    if (!hay || !CLIPS[nombre]) return;
    try {
      let voz = voces[nombre];
      if (!voz) {
        voz = new Audio(wav(CLIPS[nombre]()));
        voces[nombre] = voz;
      }
      // Volver a empezar: sin el stop, tocar dos veces seguidas no suena la
      // segunda porque el clip ya terminó y sigue parado en el final.
      try { voz.stop(); } catch (e) { /* todavía no cargó: play lo arranca igual */ }
      const p = voz.play();
      if (p && p.catch) p.catch((e) => { hay = false; console.error("[nave] audio:", e && e.message || e); });
    } catch (e) {
      hay = false;
      console.error("[nave] audio:", e && e.message || e);
    }
  }

  globalThis.SONIDO = { tocar, get disponible() { return hay; } };
})();
