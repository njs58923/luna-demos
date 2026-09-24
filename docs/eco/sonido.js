// sonido.js — el sintetizador, sin nada del motor.
//
// Genera muestras y las procesa. No sabe que existe `AudioStream` ni
// `hiperspace`: recibe números y devuelve `Float32Array`. Igual que `partida.js`
// con las reglas, y por la misma razón — así se puede oír con los ojos, o sea
// medir, en vez de abrir Luna y escuchar a ver si parece.
(function (global) {
  "use strict";

  const MUESTREO = 24000;

  /** Una nota.
   *
   *  La forma de onda no es una senoidal pelada: se le suman el doble y el
   *  triple de la frecuencia, cada uno más flojo. Una senoidal sola suena a
   *  prueba de audiómetro; con dos armónicos ya suena a **algo**, que es lo
   *  mínimo para que seis tonos se distingan de oído.
   *
   *  La envolvente importa más que el timbre. Sin ella, empezar y cortar de
   *  golpe produce un chasquido en los dos extremos —la onda salta de 0 a su
   *  amplitud en una muestra— y con seis notas seguidas el chasquido es lo único
   *  que se escucha. */
  function nota(frecuencia, segundos) {
    const total = Math.round(segundos * MUESTREO);
    const pcm = new Float32Array(total);
    const ataque = Math.round(0.012 * MUESTREO);
    const caida = Math.round(0.18 * MUESTREO);

    for (let i = 0; i < total; i++) {
      const fase = (i / MUESTREO) * frecuencia * Math.PI * 2;
      const onda = Math.sin(fase)
                 + Math.sin(fase * 2) * 0.28
                 + Math.sin(fase * 3) * 0.12;

      let sobre = 1;
      if (i < ataque) sobre = i / ataque;
      else if (i > total - caida) sobre = Math.max(0, (total - i) / caida);
      // La caída al cuadrado se oye más natural que la recta: el oído percibe la
      // amplitud en escala logarítmica, así que una rampa lineal suena a corte.
      pcm[i] = onda * 0.34 * sobre * sobre;
    }
    return pcm;
  }

  function silencio(segundos) {
    return new Float32Array(Math.round(segundos * MUESTREO));
  }

  /** Sumar dos buffers del mismo largo, con ganancia. */
  function mezclar(a, b, ganancia) {
    const g = ganancia === undefined ? 0.6 : ganancia;
    const out = new Float32Array(Math.max(a.length, b.length));
    for (let i = 0; i < out.length; i++) {
      out[i] = ((a[i] || 0) + (b[i] || 0)) * g;
    }
    return out;
  }

  // ── El eco ────────────────────────────────────────────────────────────────
  //
  // Una línea de retardo con realimentación: cada muestra que sale se guarda, y
  // 260 ms después vuelve a entrar más floja. Cinco líneas de aritmética que
  // convierten seis pitidos en una sala.
  //
  // **Lo que lo hace posible es que los silencios se escriben.** La cola vive
  // entre llamadas, así que el eco de una nota se derrama sobre el silencio que
  // viene después — pero sólo si ese silencio *pasa por acá*. Si el hueco entre
  // notas fuera «no escribir nada y dejar que el anillo se vacíe», el eco se
  // cortaría de golpe al terminar la nota. La decisión de escribir ceros, que
  // parecía un detalle de precisión, es lo que sostiene esto.

  function crearEco(op) {
    const o = op || {};
    const retardo = Math.round((o.retardo || 0.26) * MUESTREO);
    /** Cuánto vuelve. Por encima de 0,5 la cola se hace interminable y las notas
     *  se pisan entre rondas; por debajo de 0,2 no se oye que haya sala. */
    const realimenta = o.realimenta === undefined ? 0.34 : o.realimenta;
    const cola = new Float32Array(retardo);
    let i = 0;

    return {
      retardo: retardo,
      /** Aplicar el eco **en el lugar**. Devuelve el mismo arreglo. */
      procesar: function (pcm) {
        for (let k = 0; k < pcm.length; k++) {
          const salida = pcm[k] + cola[i] * realimenta;
          // Lo que se guarda es la salida, no la entrada: por eso la cola se
          // realimenta y el eco tiene más de un rebote en vez de uno solo.
          cola[i] = salida;
          i = (i + 1) % retardo;
          // El recorte evita que la realimentación se escape si dos notas caen
          // justo encima de su propio eco. Sin esto, una racha larga satura y
          // suena a distorsión, que no es el efecto buscado.
          pcm[k] = salida > 1 ? 1 : salida < -1 ? -1 : salida;
        }
        return pcm;
      },
      /** Vaciar la cola. Al empezar una partida el eco de la anterior no tiene
       *  por qué seguir sonando: sería el fantasma de la que perdiste. */
      limpiar: function () { cola.fill(0); i = 0; },
    };
  }

  global.Sonido = {
    MUESTREO: MUESTREO,
    nota: nota,
    silencio: silencio,
    mezclar: mezclar,
    crearEco: crearEco,
  };
})(globalThis);
