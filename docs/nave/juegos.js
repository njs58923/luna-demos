// Los minijuegos, armados con el kit de consola (kit.js).
//
// Cada juego es una caja de 68 x 52 cm con piezas que se tocan: la cara útil
// va de -0,27 a 0,27 en x y de -0,19 a 0,20 en y, con el origen en el centro.
// El título va arriba de la caja y el mensaje abajo, afuera de la cara: los
// pone el documento, así la cara queda entera para el juego.
//
// Un juego declara:
//
//   armar(api) -> ctx     arma las piezas y devuelve lo que la demo y las
//                         pruebas necesitan tocar
//   demo(ctx, api)        opcional: pasos [espera, hacer] que lo juegan solo
//
// y recibe:
//
//   api.panel             el KIT.Panel sobre la cara de la caja
//   api.azar()            azar con semilla de esta consola y esta partida
//   api.mensaje(txt)      el renglón debajo de la caja
//   api.completar()       listo
//   api.cada(fn)          fn(dt) en cada cuadro
//
// Los juegos no saben si se los juega con las manos o con clics: las piezas
// avisan igual por las dos vías (ver kit.js).

(function () {
  const COL = {
    ok: "#2ECC71", mal: "#E74C3C", aviso: "#F1C40F", frio: "#4A90D9", rosa: "#E91E8C",
    apagado: "#3D4654", tecla: "#C8CCD8", blanco: "#DCE0E8", texto: "#FFFFFF", tenue: "#8E9CB4",
    metal: "#6B7688",
  };

  function mezclar(lista, azar) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  const nada = () => {};

  const J = {};

  // ══════════════════════════════════════════════════════════════════════════
  // Tareas
  // ══════════════════════════════════════════════════════════════════════════

  // ── Cables ────────────────────────────────────────────────────────────────
  // Cuatro cables a la izquierda y cuatro tomas a la derecha, desordenadas:
  // cada enchufe entra sólo en la toma de su color. Arriba, un led por cable.
  J.cables = {
    armar(api) {
      const p = api.panel;
      const COLORES = [COL.mal, COL.aviso, COL.frio, COL.rosa];
      const ys = [0.12, 0.04, -0.04, -0.12].map((y) => y - 0.03);
      const izq = mezclar(COLORES, api.azar), der = mezclar(COLORES, api.azar);
      const leds = COLORES.map((_, i) => p.led({ x: -0.075 + i * 0.05, y: 0.18 }));
      const tomas = der.map((color, i) => p.toma({ id: color, x: 0.215, y: ys[i], color }));
      let hechos = 0;
      api.mensaje("uní cada cable con su color");
      const cables = izq.map((color, i) => p.estirable({
        ancla: { x: -0.265, y: ys[i] }, color, tomas,
        alConectar: (toma) => {
          if (toma.id !== color) { api.mensaje("ese no es el mismo color"); return false; }
          leds[hechos++].color(COL.ok);
          api.mensaje(hechos + " de 4");
          if (hechos === 4) api.completar();
          return true;
        },
      }));
      return { cables, tomas, izq };
    },
    demo(ctx) {
      const pasos = [];
      ctx.izq.forEach((color, i) => {
        pasos.push([0.7, () => ctx.cables[i].clic()]);
        pasos.push([0.5, () => ctx.tomas.find((t) => t.id === color).clic()]);
      });
      return pasos;
    },
  };

  // ── Colectores ────────────────────────────────────────────────────────────
  // Diez teclas numeradas y desordenadas: del 1 al 10. Una fuera de orden
  // apaga todo y vuelve al 1.
  J.manifolds = {
    armar(api) {
      const p = api.panel;
      const numeros = mezclar([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], api.azar);
      let siguiente = 1;
      api.mensaje("del 1 al 10, en orden");
      const teclas = numeros.map((num, i) => p.boton({
        forma: "tecla", x: -0.24 + (i % 5) * 0.12, y: i < 5 ? 0.06 : -0.08,
        color: COL.tecla, etiqueta: num, tamEtiqueta: 0.034,
        alApretar: (b) => {
          if (num !== siguiente) {
            siguiente = 1;
            for (const t of teclas) t.color(COL.tecla);
            return api.mensaje("mal: volvé al 1");
          }
          b.color(COL.ok);
          siguiente++;
          api.mensaje(siguiente > 10 ? "listo" : "va el " + siguiente);
          if (siguiente > 10) api.completar();
        },
      }));
      p.pantalla({ x: 0, y: 0.175, ancho: 0.54, alto: 0.03, color: "#101820" });
      return { teclas, numeros };
    },
    demo(ctx) {
      const pasos = [];
      for (let n = 1; n <= 10; n++) pasos.push([0.35, () => ctx.teclas[ctx.numeros.indexOf(n)].clic()]);
      return pasos;
    },
  };

  // ── Teclado con código: la clave de los tanques y el oxígeno ─────────────
  function teclado(largo, colorCodigo, textoOk) {
    return {
      armar(api) {
        const p = api.panel;
        const codigo = Array.from({ length: largo }, () => Math.floor(api.azar() * 10)).join("");
        p.pantalla({ x: 0, y: 0.15, ancho: 0.52, alto: 0.1 });
        p.texto({ x: 0, y: 0.172, valor: codigo.split("").join(" "), tam: 0.038, color: colorCodigo, z: 0.014 });
        const escrito = p.texto({ x: 0, y: 0.127, valor: "_ ".repeat(largo).trim(), tam: 0.038, color: COL.texto, z: 0.014 });
        let tipeado = "";
        api.mensaje("marcá el código");
        const pintar = () => escrito.valor((tipeado + "_".repeat(largo - tipeado.length)).split("").join(" "));
        const teclas = [];
        for (let d = 0; d < 10; d++) {
          teclas.push(p.boton({
            forma: "tecla", x: -0.24 + (d % 5) * 0.12, y: d < 5 ? 0.0 : -0.13,
            color: COL.tecla, etiqueta: d, tamEtiqueta: 0.036,
            alApretar: () => {
              if (tipeado.length >= largo) return;
              tipeado += String(d);
              pintar();
              if (tipeado.length < largo) return;
              if (tipeado === codigo) { api.mensaje(textoOk); return api.completar(); }
              api.mensaje("código equivocado");
              tipeado = "";
              pintar();
            },
          }));
        }
        return { teclas, codigo };
      },
      demo(ctx) {
        return ctx.codigo.split("").map((d) => [0.4, () => ctx.teclas[Number(d)].clic()]);
      },
    };
  }
  J.clave = teclado(5, COL.aviso, "tanques llenos");

  // ── Basura ────────────────────────────────────────────────────────────────
  // La palanca grande abre la compuerta mientras está abajo, y la basura cae.
  // Se suelta y la compuerta se cierra: lo que ya cayó, cayó.
  J.palanca = {
    armar(api) {
      const p = api.panel;
      p.pantalla({ x: 0.1, y: 0.02, ancho: 0.3, alto: 0.34 });
      const compuerta = p.crear("box", { x: 0.1, y: -0.12, z: 0.012, sx: 0.28, sy: 0.02, sz: 0.012, color: COL.metal, touchable: "false" });
      const colores = ["#8E7F74", "#6B8E4E", "#B87333", "#7F8C8D", "#A0522D", "#556B2F", "#8E7F74"];
      const bolsas = colores.map((c, i) => {
        const x = 0.0 + ((i * 37) % 7) * 0.03, y = -0.09 + (i % 3) * 0.04 + (i % 2) * 0.012;
        const t = 0.03 + (i % 3) * 0.007;
        return { el: p.crear("box", { x, y, z: 0.018, rz: i * 0.5, sx: t, sy: t, sz: t, color: c, touchable: "false" }), x, y, vy: 0, fuera: false };
      });
      let abierta = false, fuera = 0;
      api.mensaje("bajá la palanca y sostenela");
      const pal = p.palanca({
        x: -0.17, y: 0.0, tam: "grande", modo: "retorno", clicMantener: 2.2,
        alCambiar: (f) => {
          const antes = abierta;
          abierta = f > 0.85;
          if (abierta !== antes) {
            compuerta.setAttribute("visible", abierta ? "false" : "true");
            api.mensaje(abierta ? "vaciando…" : fuera === bolsas.length ? "" : "sostenela más");
          }
        },
      });
      api.cada((dt) => {
        if (!abierta) return;
        for (const b of bolsas) {
          if (b.fuera) continue;
          b.vy -= 1.4 * dt;
          b.y += b.vy * dt;
          if (b.y < -0.17) {
            b.fuera = true;
            b.el.setAttribute("visible", "false");
            if (++fuera === bolsas.length) { api.mensaje("basura al espacio"); api.completar(); }
          } else b.el.position = { x: b.x, y: b.y, z: 0.018 };
        }
      });
      return { palanca: pal, bolsas };
    },
    demo(ctx) { return [[0.8, () => ctx.palanca.clic()]]; },
  };

  // ── Combustible ───────────────────────────────────────────────────────────
  // Una válvula —la palanca grande, que queda donde se la deja— y un tanque que
  // se llena según cuánto esté abierta.
  J.llenar = {
    armar(api) {
      const p = api.panel;
      p.pantalla({ x: 0.13, y: 0.01, ancho: 0.16, alto: 0.36 });
      const tanque = p.barra({ vertical: true, x: 0.13, y: 0.01, ancho: 0.13, alto: 0.34, color: COL.aviso, fondo: "#0B0E14" });
      const pct = p.texto({ x: 0.13, y: 0.01, valor: "0 %", tam: 0.034, color: COL.texto, z: 0.014 });
      p.crear("box", { x: -0.03, y: -0.155, z: 0.01, sx: 0.2, sy: 0.018, sz: 0.018, color: COL.metal, touchable: "false" });
      const led = p.led({ x: 0.25, y: 0.17 });
      let nivel = 0;
      api.mensaje("abrí la válvula");
      const valvula = p.palanca({ x: -0.17, y: 0.0, tam: "grande", modo: "libre" });
      api.cada((dt) => {
        if (nivel >= 1) return;
        nivel = Math.min(1, nivel + valvula.fraccion * dt / 3.2);
        tanque.valor(nivel);
        pct.valor(Math.round(nivel * 100) + " %");
        if (nivel >= 1) { led.color(COL.ok); api.mensaje("lleno"); api.completar(); }
      });
      return { valvula };
    },
    demo(ctx) { return [[0.8, () => ctx.valvula.clic()]]; },
  };

  // ── Descargar / subir datos ───────────────────────────────────────────────
  J.descargar = {
    armar(api) {
      const p = api.panel;
      const carpeta = (x) => {
        p.crear("box", { x, y: 0.1, z: 0.01, sx: 0.1, sy: 0.07, sz: 0.012, color: COL.aviso, touchable: "false" });
        p.crear("box", { x: x - 0.025, y: 0.14, z: 0.01, sx: 0.045, sy: 0.02, sz: 0.012, color: COL.aviso, touchable: "false" });
      };
      carpeta(-0.19);
      carpeta(0.19);
      const hoja = p.crear("box", { x: -0.19, y: 0.1, z: 0.02, sx: 0.035, sy: 0.045, sz: 0.004, color: COL.blanco, visible: "false", touchable: "false" });
      const barra = p.barra({ x: 0, y: -0.02, ancho: 0.5, alto: 0.045, color: COL.frio });
      const pct = p.texto({ x: 0, y: -0.075, valor: "0 %", tam: 0.034, color: COL.texto });
      let corriendo = false, avance = 0, vuelo = 0;
      api.mensaje("apretá el botón y esperá");
      const boton = p.boton({
        x: 0, y: -0.15, color: COL.frio, etiqueta: "IR", tamEtiqueta: 0.022,
        alApretar: (b) => {
          if (corriendo || avance >= 1) return;
          corriendo = true;
          b.habilitar(false);
          b.color(COL.apagado);
          hoja.setAttribute("visible", "true");
          api.mensaje("transfiriendo…");
        },
      });
      api.cada((dt) => {
        if (!corriendo) return;
        avance = Math.min(1, avance + dt / 5.5);
        barra.valor(avance);
        pct.valor(Math.round(avance * 100) + " %");
        vuelo = (vuelo + dt * 1.6) % 1;
        hoja.position = { x: -0.19 + 0.38 * vuelo, y: 0.1 + Math.sin(vuelo * Math.PI) * 0.05, z: 0.02 };
        if (avance >= 1) {
          corriendo = false;
          hoja.setAttribute("visible", "false");
          api.mensaje("listo");
          api.completar();
        }
      });
      return { boton };
    },
    demo(ctx) { return [[0.8, () => ctx.boton.clic()]]; },
  };

  // ── Escudos ───────────────────────────────────────────────────────────────
  // Siete botones en panal: cinco en rojo. Se aprietan hasta que no quede
  // ninguno.
  J.escudos = {
    armar(api) {
      const p = api.panel;
      const lugares = [{ x: 0, y: 0.005 }];
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 2 + k * Math.PI / 3;
        lugares.push({ x: Math.cos(a) * 0.125, y: 0.005 + Math.sin(a) * 0.125 });
      }
      const rojos = new Set(mezclar([0, 1, 2, 3, 4, 5, 6], api.azar).slice(0, 5));
      let faltan = rojos.size;
      api.mensaje("apagá los escudos en rojo");
      const botones = lugares.map((l, i) => p.boton({
        x: l.x, y: l.y, color: rojos.has(i) ? COL.mal : COL.blanco,
        alApretar: (b) => {
          if (!rojos.has(i)) return;
          rojos.delete(i);
          b.color(COL.blanco);
          faltan--;
          api.mensaje(faltan ? "faltan " + faltan : "escudos al máximo");
          if (!faltan) api.completar();
        },
      }));
      return { botones, rojos: [...rojos] };
    },
    demo(ctx) { return ctx.rojos.map((i) => [0.5, () => ctx.botones[i].clic()]); },
  };

  // ── Arrancar el reactor ───────────────────────────────────────────────────
  // A la izquierda nueve leds muestran una secuencia; a la derecha nueve teclas
  // la repiten. Cuatro rondas, cada una un paso más larga.
  J.secuencia = {
    armar(api) {
      const p = api.panel;
      p.pantalla({ x: -0.135, y: 0.0, ancho: 0.23, alto: 0.23 });
      const leds = [];
      for (let i = 0; i < 9; i++) leds.push(p.led({ x: -0.205 + (i % 3) * 0.07, y: 0.07 - Math.floor(i / 3) * 0.07 }));
      const rondas = [0, 1, 2, 3].map((i) => p.led({ x: -0.09 + i * 0.06, y: 0.175 }));
      const secuencia = Array.from({ length: 4 }, () => Math.floor(api.azar() * 9));
      const ctx = { fase: "mostrar", ronda: 1, secuencia, teclas: [] };
      let paso = 0, reloj = 0, prendido = -1;
      const prender = (i) => {
        if (prendido >= 0) leds[prendido].color(COL.apagado);
        prendido = i;
        if (i >= 0) leds[i].color(COL.frio);
      };
      api.mensaje("mirá la secuencia");
      for (let i = 0; i < 9; i++) {
        ctx.teclas.push(p.boton({
          forma: "tecla", x: 0.07 + (i % 3) * 0.09, y: 0.09 - Math.floor(i / 3) * 0.09, color: COL.tecla,
          alApretar: (b) => {
            if (ctx.fase !== "entrada") return;
            if (secuencia[paso] !== i) {
              api.mensaje("no era ese: de nuevo");
              for (const r of rondas) r.color(COL.apagado);
              ctx.ronda = 1; ctx.fase = "mostrar"; reloj = -0.6; paso = 0;
              return;
            }
            b.color(COL.frio);
            setTimeout(() => b.color(COL.tecla), 180);
            paso++;
            if (paso < ctx.ronda) return;
            rondas[ctx.ronda - 1].color(COL.ok);
            if (ctx.ronda === 4) { ctx.fase = "hecho"; api.mensaje("reactor en marcha"); return api.completar(); }
            ctx.ronda++; ctx.fase = "mostrar"; reloj = -0.5; paso = 0;
            api.mensaje("bien: mirá la que sigue");
          },
        }));
      }
      api.cada((dt) => {
        if (ctx.fase !== "mostrar") return;
        reloj += dt;
        if (reloj < 0) return;
        // Cada paso: 0,45 s prendido y 0,15 s apagado.
        const i = Math.floor(reloj / 0.6), dentro = reloj % 0.6 < 0.45;
        if (i >= ctx.ronda) { prender(-1); ctx.fase = "entrada"; paso = 0; api.mensaje("repetila"); return; }
        prender(dentro ? secuencia[i] : -1);
      });
      return ctx;
    },
    demo(ctx) {
      const pasos = [];
      for (let r = 1; r <= 4; r++) {
        pasos.push([0.2, () => ctx.fase === "entrada" && ctx.ronda === r ? undefined : false]);
        for (let k = 0; k < r; k++) pasos.push([0.35, () => ctx.teclas[ctx.secuencia[k]].clic()]);
      }
      return pasos;
    },
  };

  // ── Calibrar el distribuidor ──────────────────────────────────────────────
  // Tres medidores con su marca yendo y viniendo, cada uno a su ritmo. Hay que
  // frenarlos en el verde, de izquierda a derecha, con el botón de abajo.
  J.calibrar = {
    armar(api) {
      const p = api.panel;
      const ctx = { medidores: [], actual: 0 };
      api.mensaje("frená el primero en el verde");
      [-0.16, 0, 0.16].forEach((x, i) => {
        p.pantalla({ x, y: 0.05, ancho: 0.08, alto: 0.28 });
        p.crear("box", { x, y: 0.05, z: 0.006, sx: 0.08, sy: 0.05, sz: 0.004, color: "#1E4030", touchable: "false" });
        const marca = p.crear("box", { x, y: -0.07, z: 0.012, sx: 0.09, sy: 0.012, sz: 0.008, color: COL.aviso, touchable: "false" });
        const m = { marca, y: -0.07 + i * 0.05, dir: 1, vel: 0.16 + i * 0.07, listo: false, x };
        ctx.medidores.push(m);
        m.boton = p.boton({
          x, y: -0.15, color: COL.metal,
          alApretar: () => {
            if (m.listo) return;
            if (ctx.actual !== i) return api.mensaje("esa no: va la " + (ctx.actual + 1));
            if (Math.abs(m.y - 0.05) > 0.025) return api.mensaje("fuera de rango");
            m.listo = true;
            marca.setAttribute("color", COL.ok);
            m.boton.color(COL.ok);
            ctx.actual++;
            if (ctx.actual === 3) { api.mensaje("calibrado"); return api.completar(); }
            api.mensaje("ahora el " + (ctx.actual + 1));
          },
        });
      });
      api.cada((dt) => {
        for (const m of ctx.medidores) {
          if (m.listo) continue;
          m.y += m.dir * m.vel * dt;
          if (m.y > 0.175) { m.y = 0.175; m.dir = -1; }
          if (m.y < -0.075) { m.y = -0.075; m.dir = 1; }
          m.marca.position = { x: m.x, y: m.y, z: 0.012 };
        }
      });
      return ctx;
    },
    demo(ctx) {
      return [0, 1, 2].map((i) => [0.3, () => {
        const m = ctx.medidores[i];
        if (Math.abs(m.y - 0.05) > 0.012) return false;
        m.boton.clic();
      }]);
    },
  };

  // ── Alinear la salida del motor / estabilizar el timón ────────────────────
  // Una corredera vertical que deriva sola. Hay que llevarla a la franja verde
  // y sostenerla ahí hasta que se llene la barra.
  J.alinear = {
    armar(api) {
      const p = api.panel;
      p.pantalla({ x: -0.1, y: 0.0, ancho: 0.14, alto: 0.4 });
      p.crear("box", { x: -0.1, y: 0.0, z: 0.006, sx: 0.14, sy: 0.04, sz: 0.004, color: "#1E4030", touchable: "false" });
      const sostiene = p.barra({ vertical: true, x: 0.16, y: 0.0, ancho: 0.06, alto: 0.36, color: COL.ok });
      p.texto({ x: 0.16, y: 0.205, valor: "SALIDA", tam: 0.026, color: COL.tenue });
      const deriva = (api.azar() < 0.5 ? -1 : 1) * 0.03;
      const inicio = api.azar() < 0.5 ? 0.1 : 0.9;
      let dentro = 0, hecho = false;
      api.mensaje("llevala al verde y sostenela");
      const riel = p.empujable({ desde: { x: -0.1, y: -0.18 }, hasta: { x: -0.1, y: 0.18 }, inicial: inicio, sinRiel: false });
      api.cada((dt) => {
        if (hecho) return;
        if (!riel.tomada && !riel.meta) riel.poner(riel.t + deriva * dt);
        const ok = Math.abs(riel.t - 0.5) < 0.06;
        dentro = ok ? dentro + dt : Math.max(0, dentro - dt * 2);
        sostiene.valor(dentro / 1.6);
        if (dentro >= 1.6) { hecho = true; api.mensaje("alineado"); api.completar(); }
      });
      return { riel };
    },
    demo(ctx) { return [[0.8, () => ctx.riel.clicEn(-0.1, 0)]]; },
  };

  // ── Pasar la tarjeta ──────────────────────────────────────────────────────
  // La tarjeta corre por la ranura del lector. Tiene que cruzarla entera, ni muy
  // rápido ni muy lento: entre 0,35 y 1,2 segundos.
  J.tarjeta = {
    armar(api) {
      const p = api.panel;
      p.pantalla({ x: 0, y: 0.155, ancho: 0.4, alto: 0.07 });
      const lector = p.texto({ x: 0, y: 0.155, valor: "PASE LA TARJETA", tam: 0.028, color: COL.ok, z: 0.014 });
      p.crear("box", { x: 0, y: -0.02, z: 0.004, sx: 0.54, sy: 0.02, sz: 0.006, color: "#06090E", touchable: "false" });
      p.crear("box", { x: 0.08, y: 0.03, z: 0.02, sx: 0.06, sy: 0.08, sz: 0.04, color: COL.metal, touchable: "false" });
      p.crear("box", { x: 0.08, y: 0.03, z: 0.041, sx: 0.04, sy: 0.012, sz: 0.002, color: COL.frio, touchable: "false" });
      let salida = 0, listo = false, ultimoT = 0;
      api.mensaje("pasá la tarjeta por el lector");
      const carta = p.empujable({
        desde: { x: -0.2, y: -0.02 }, hasta: { x: 0.2, y: -0.02 }, sinRiel: true, velocidad: 0.55,
        perilla: (g, panel) => {
          panel.crear("box", { y: -0.02, z: 0.012, sx: 0.11, sy: 0.07, sz: 0.004, color: COL.blanco, touchable: "false" }, g);
          panel.crear("box", { y: -0.0, z: 0.015, sx: 0.11, sy: 0.012, sz: 0.002, color: "#14181E", touchable: "false" }, g);
          panel.crear("box", { x: -0.03, y: -0.035, z: 0.015, sx: 0.025, sy: 0.02, sz: 0.002, color: COL.aviso, touchable: "false" }, g);
        },
        alMover: (t) => {
          if (listo) return;
          const ahora = performance.now();
          // La pasada empieza cuando la tarjeta deja el principio, no cuando se
          // la agarra: tenerla quieta en la mano no es lentitud.
          if (ultimoT < 0.05 && t >= 0.05) salida = ahora;
          ultimoT = t;
          if (t > 0.97 && salida) {
            const dur = (ahora - salida) / 1000;
            salida = 0;
            if (dur < 0.35) { lector.valor("MUY RAPIDO"); lector.color(COL.mal); return; }
            if (dur > 1.2) { lector.valor("MUY LENTO"); lector.color(COL.mal); return; }
            listo = true;
            lector.valor("ACEPTADA"); lector.color(COL.ok);
            api.mensaje("tarjeta aceptada");
            api.completar();
          }
        },
        alSoltar: (t) => {
          // Una pasada que no sirvió —a medias, apurada o lenta— vuelve al
          // principio sola.
          if (!listo && t > 0.05) carta.clicEn(-0.2, -0.02);
        },
      });
      return { carta };
    },
    demo(ctx) { return [[0.8, () => ctx.carta.clicEn(0.2, -0.02)]]; },
  };

  // ── Trazar el rumbo ───────────────────────────────────────────────────────
  // Una pantalla con cinco puntos: la nave se lleva de uno al siguiente, y cada
  // tramo recorrido queda dibujado.
  J.rumbo = {
    armar(api) {
      const p = api.panel;
      p.pantalla({ x: 0, y: 0.02, ancho: 0.54, alto: 0.36, color: "#050A12" });
      const pts = [0, 1, 2, 3, 4].map((i) => ({ x: -0.22 + i * 0.11, y: -0.11 + api.azar() * 0.26 }));
      const marcas = pts.map((q, i) => p.crear("sphere", {
        x: q.x, y: q.y, z: 0.006, sx: 0.022, sy: 0.022, sz: 0.008,
        color: i === 0 ? COL.ok : i === 1 ? COL.aviso : COL.apagado, touchable: "false",
      }));
      let siguiente = 1, listo = false;
      api.mensaje("llevá la nave por los puntos");
      const nave = p.empujable({
        area: { x0: -0.25, y0: -0.14, x1: 0.25, y1: 0.18 }, inicial: pts[0], velocidad: 0.3,
        perilla: (g, panel) => {
          panel.crear("sphere", { z: 0.006, sx: 0.028, sy: 0.028, sz: 0.012, color: COL.blanco, touchable: "false" }, g);
          panel.crear("box", { x: -0.018, z: 0.006, sx: 0.02, sy: 0.006, sz: 0.006, color: COL.frio, touchable: "false" }, g);
        },
        alMover: (v) => {
          if (listo) return;
          const q = pts[siguiente];
          if (Math.hypot(v.x - q.x, v.y - q.y) > 0.02) return;
          const a = pts[siguiente - 1];
          const largo = Math.hypot(q.x - a.x, q.y - a.y);
          p.crear("box", {
            x: (a.x + q.x) / 2, y: (a.y + q.y) / 2, z: 0.005, rz: Math.atan2(q.y - a.y, q.x - a.x),
            sx: largo, sy: 0.005, sz: 0.004, color: COL.frio, touchable: "false",
          });
          marcas[siguiente].setAttribute("color", COL.ok);
          siguiente++;
          if (siguiente === pts.length) { listo = true; api.mensaje("rumbo trazado"); return api.completar(); }
          marcas[siguiente].setAttribute("color", COL.aviso);
        },
      });
      return { nave, pts };
    },
    demo(ctx) { return [1, 2, 3, 4].map((i) => [1.0, () => ctx.nave.clicEn(ctx.pts[i].x, ctx.pts[i].y)]); },
  };

  // ── Despejar asteroides ───────────────────────────────────────────────────
  // Rocas cruzando el radar. Se apunta con la mira y se dispara con el botón
  // rojo, o se tira directo a una roca con el rayo.
  J.asteroides = {
    armar(api) {
      const p = api.panel;
      const OBJETIVO = 12;
      p.pantalla({ x: -0.055, y: 0.02, ancho: 0.42, alto: 0.36, color: "#050A12" });
      const cuenta = p.texto({ x: 0.225, y: 0.12, valor: "0/" + OBJETIVO, tam: 0.034, color: COL.texto });
      let hechos = 0;
      const X0 = -0.26, X1 = 0.15, Y0 = -0.14, Y1 = 0.18;
      const rocas = [];
      const romper = (r) => {
        if (hechos >= OBJETIVO) return;
        hechos++;
        cuenta.valor(hechos + "/" + OBJETIVO);
        reponer(r);
        if (hechos >= OBJETIVO) { api.mensaje("despejado"); api.completar(); }
      };
      const reponer = (r) => {
        r.x = X1 + 0.02 + api.azar() * 0.1;
        r.y = Y0 + 0.02 + api.azar() * (Y1 - Y0 - 0.04);
        r.vx = -(0.06 + api.azar() * 0.08);
        r.vy = (api.azar() - 0.5) * 0.03;
      };
      for (let i = 0; i < 5; i++) {
        const el = p.crear("sphere", { z: 0.012, sx: 0.03, sy: 0.03, sz: 0.018, color: "#8E7F74", touchable: "true" });
        const r = { el, x: 0, y: 0, vx: 0, vy: 0, clic: () => romper(r) };
        reponer(r);
        r.x -= api.azar() * 0.4;
        el.addEventListener("toque", () => r.clic());
        rocas.push(r);
      }
      api.mensaje("apuntá y dispará");
      const mira = p.empujable({
        area: { x0: X0 + 0.01, y0: Y0, x1: X1 - 0.01, y1: Y1 }, velocidad: 0.5,
        perilla: (g, panel) => {
          panel.crear("box", { z: 0.004, sx: 0.05, sy: 0.003, sz: 0.004, color: COL.ok, touchable: "false" }, g);
          panel.crear("box", { z: 0.004, sx: 0.003, sy: 0.05, sz: 0.004, color: COL.ok, touchable: "false" }, g);
        },
      });
      const fuego = p.boton({
        x: 0.225, y: -0.1, color: COL.mal,
        alApretar: () => {
          const v = mira.valor();
          for (const r of rocas) if (Math.hypot(r.x - v.x, r.y - v.y) < 0.035) romper(r);
        },
      });
      api.cada((dt) => {
        for (const r of rocas) {
          r.x += r.vx * dt;
          r.y += r.vy * dt;
          if (r.x < X0 + 0.015 || r.y < Y0 || r.y > Y1) reponer(r);
          const adentro = r.x < X1 - 0.015;
          r.el.setAttribute("visible", adentro ? "true" : "false");
          r.el.position = { x: r.x, y: r.y, z: 0.012 };
        }
      });
      return { rocas, mira, fuego };
    },
    demo(ctx) {
      const pasos = [];
      for (let i = 0; i < 12; i++) {
        pasos.push([0.45, () => {
          const r = ctx.rocas.filter((q) => q.x < 0.13 && q.x > -0.24).sort((a, b) => a.x - b.x)[0];
          if (!r) return false;
          r.clic();
        }]);
      }
      return pasos;
    },
  };

  // ── Analizar la muestra ───────────────────────────────────────────────────
  J.muestra = {
    armar(api) {
      const p = api.panel;
      const mala = Math.floor(api.azar() * 5);
      p.crear("box", { x: 0, y: 0.0, z: 0.012, sx: 0.5, sy: 0.02, sz: 0.024, color: COL.metal, touchable: "false" });
      const tubos = [0, 1, 2, 3, 4].map((i) => {
        const x = -0.2 + i * 0.1;
        p.crear("cylinder", { x, y: 0.1, z: 0.02, sx: 0.04, sy: 0.17, sz: 0.04, color: "#C8D6E0", touchable: "false" });
        return p.crear("cylinder", { x, y: 0.07, z: 0.021, sx: 0.034, sy: 0.1, sz: 0.034, color: "#2B6C8A", touchable: "false" });
      });
      let fase = "esperando", t = 0;
      const ctx = { mala, fase: () => fase, teclas: [] };
      const barra = p.barra({ x: 0.08, y: -0.17, ancho: 0.32, alto: 0.035, color: COL.frio });
      api.mensaje("apretá ANALIZAR");
      ctx.analizar = p.boton({
        x: -0.19, y: -0.17, color: COL.frio,
        alApretar: (b) => {
          if (fase !== "esperando") return;
          fase = "analizando";
          b.habilitar(false);
          b.color(COL.apagado);
          api.mensaje("analizando…");
        },
      });
      for (let i = 0; i < 5; i++) {
        ctx.teclas.push(p.boton({
          forma: "tecla", x: -0.2 + i * 0.1, y: -0.07, color: COL.tecla, etiqueta: i + 1, tamEtiqueta: 0.03,
          alApretar: () => {
            if (fase !== "revelada") return api.mensaje("primero hay que analizarlas");
            if (i !== mala) return api.mensaje("esa está limpia");
            fase = "hecho";
            api.mensaje("muestra aislada");
            api.completar();
          },
        }));
      }
      api.cada((dt) => {
        if (fase !== "analizando") return;
        t += dt;
        barra.valor(t / 4);
        if (t < 4) return;
        fase = "revelada";
        tubos[mala].setAttribute("color", COL.mal);
        api.mensaje("apretá la muestra contaminada");
      });
      return ctx;
    },
    demo(ctx) {
      return [
        [0.8, () => ctx.analizar.clic()],
        [0.3, () => (ctx.fase() === "revelada" ? undefined : false)],
        [0.6, () => ctx.teclas[ctx.mala].clic()],
      ];
    },
  };

  // ── Escaneo médico ────────────────────────────────────────────────────────
  J.escaneo = {
    armar(api) {
      const p = api.panel;
      p.pantalla({ x: 0, y: 0.07, ancho: 0.3, alto: 0.26, color: "#06140E" });
      p.crear("sphere", { x: 0, y: 0.12, z: 0.01, sx: 0.07, sy: 0.08, sz: 0.01, color: COL.mal, touchable: "false" });
      p.crear("box", { x: 0, y: 0.045, z: 0.01, sx: 0.08, sy: 0.09, sz: 0.01, color: COL.mal, touchable: "false" });
      const linea = p.crear("box", { x: 0, y: -0.04, z: 0.016, sx: 0.28, sy: 0.006, sz: 0.004, color: COL.ok, visible: "false", touchable: "false" });
      const barra = p.barra({ x: 0.07, y: -0.15, ancho: 0.36, alto: 0.04, color: COL.ok });
      let corriendo = false, t = 0;
      api.mensaje("apretá y quedate quieto");
      const boton = p.boton({
        x: -0.19, y: -0.15, color: COL.ok,
        alApretar: (b) => {
          if (corriendo || t >= 8) return;
          corriendo = true;
          b.habilitar(false);
          linea.setAttribute("visible", "true");
          api.mensaje("escaneando…");
        },
      });
      api.cada((dt) => {
        if (!corriendo) return;
        t += dt;
        barra.valor(t / 8);
        linea.position = { x: 0, y: 0.07 + Math.sin(t * 2.4) * 0.11, z: 0.016 };
        if (t >= 8) {
          corriendo = false;
          linea.setAttribute("visible", "false");
          api.mensaje("escaneo completo");
          api.completar();
        }
      });
      return { boton };
    },
    demo(ctx) { return [[0.8, () => ctx.boton.clic()]]; },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Sabotajes
  // ══════════════════════════════════════════════════════════════════════════

  // ── Luces: cinco interruptores, todos arriba ─────────────────────────────
  J.interruptores = {
    armar(api) {
      const p = api.panel;
      const abajo = [0, 1, 2, 3, 4].map(() => api.azar() < 0.6);
      if (!abajo.some(Boolean)) abajo[2] = true;
      const leds = [], palancas = [];
      const revisar = () => {
        const faltan = palancas.filter((q) => q.lado !== "arriba").length;
        api.mensaje(faltan ? faltan + " abajo" : "luz");
        if (!faltan) api.completar();
      };
      for (let i = 0; i < 5; i++) {
        const x = -0.22 + i * 0.11;
        leds.push(p.led({ x, y: 0.15, color: abajo[i] ? COL.mal : COL.ok }));
        palancas.push(p.palanca({
          x, y: -0.03, modo: "dos", inicial: abajo[i] ? 1 : 0,
          alLlegar: (lado) => { leds[i].color(lado === "arriba" ? COL.ok : COL.mal); revisar(); },
        }));
      }
      api.mensaje("todas para arriba");
      return { palancas, abajo };
    },
    demo(ctx) {
      return ctx.abajo.map((a, i) => (a ? [0.7, () => ctx.palancas[i].clic()] : [0.05, nada]));
    },
  };

  // ── Reactor: la palma apoyada ─────────────────────────────────────────────
  // Con la mano: apoyarla y sostener tres segundos. Con clics: tocar seguido,
  // contra una barra que baja.
  J.mano = {
    armar(api) {
      const p = api.panel;
      p.pantalla({ x: -0.07, y: 0.01, ancho: 0.28, alto: 0.34, color: "#1A0C0C", marco: COL.mal });
      p.texto({ x: -0.07, y: 0.205, valor: "MANTENER CONTACTO", tam: 0.024, color: COL.mal });
      const barra = p.barra({ vertical: true, x: 0.2, y: 0.01, ancho: 0.06, alto: 0.34, color: COL.mal });
      let carga = 0, listo = false;
      api.mensaje("apoyá la mano y sostenela");
      const palma = p.boton({
        forma: "tecla", ancho: 0.22, alto: 0.28, x: -0.07, y: 0.01, color: "#5A2020",
        etiqueta: "PALMA", tamEtiqueta: 0.034, colorEtiqueta: "#E8B0A8", clic: 300,
        alApretar: () => { carga = Math.min(1, carga + 0.08); },
      });
      api.cada((dt) => {
        if (listo) return;
        carga = palma.apretado ? Math.min(1, carga + dt / 3) : Math.max(0, carga - dt * 0.18);
        barra.valor(carga);
        if (carga >= 1) { listo = true; api.mensaje("reactor estable"); api.completar(); }
      });
      return { palma };
    },
    demo(ctx) {
      const pasos = [];
      for (let i = 0; i < 20; i++) pasos.push([0.32, () => ctx.palma.clic()]);
      return pasos;
    },
  };

  // ── Oxígeno: el código, más largo ─────────────────────────────────────────
  J.oxigeno = teclado(6, COL.ok, "oxígeno restablecido");

  // ── Comunicaciones: sintonizar la frecuencia ──────────────────────────────
  // Una corredera y una onda: lejos de la frecuencia la onda es ruido; cerca se
  // ordena. Hay que dejarla en la frecuencia un segundo.
  J.sintonia = {
    armar(api) {
      const p = api.panel;
      p.pantalla({ x: 0, y: 0.06, ancho: 0.52, alto: 0.24, color: "#050A12" });
      const N = 26;
      const barras = [];
      for (let i = 0; i < N; i++) {
        barras.push(p.crear("box", { x: -0.24 + i * (0.48 / (N - 1)), y: 0.06, z: 0.008, sx: 0.01, sy: 0.02, sz: 0.004, color: COL.frio, touchable: "false" }));
      }
      const meta = 0.15 + api.azar() * 0.7;
      let dentro = 0, t = 0, listo = false, ruido = 0x9e3779b9;
      const azarRuido = () => { ruido ^= ruido << 13; ruido ^= ruido >>> 17; ruido ^= ruido << 5; return ((ruido >>> 0) % 1000) / 1000; };
      api.mensaje("buscá la frecuencia");
      const dial = p.empujable({ desde: { x: -0.24, y: -0.14 }, hasta: { x: 0.24, y: -0.14 }, inicial: meta > 0.5 ? 0.05 : 0.95, velocidad: 0.4 });
      api.cada((dt) => {
        t += dt;
        const cerca = Math.max(0, 1 - Math.abs(dial.t - meta) / 0.3);
        for (let i = 0; i < N; i++) {
          const limpio = Math.abs(Math.sin(i * 0.5 + t * 4)) * 0.16;
          const sucio = azarRuido() * 0.16;
          const h = 0.01 + limpio * cerca + sucio * (1 - cerca);
          barras[i].scale = { x: 0.01, y: h, z: 0.004 };
        }
        if (listo) return;
        const ok = Math.abs(dial.t - meta) < 0.035;
        dentro = ok ? dentro + dt : 0;
        if (dentro >= 1) {
          listo = true;
          for (const b of barras) b.setAttribute("color", COL.ok);
          api.mensaje("comunicaciones restablecidas");
          api.completar();
        }
      });
      return { dial, meta };
    },
    demo(ctx) { return [[0.8, () => ctx.dial.clicEn(-0.24 + 0.48 * ctx.meta, -0.14)]]; },
  };

  // ══════════════════════════════════════════════════════════════════════════
  // El montaje
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Arma un juego sobre el grupo de la cara de una caja.
   *
   *   o.base, o.version     de dónde salen los modelos
   *   o.azar                el azar con semilla
   *   o.alMensaje(txt)      el renglón debajo de la caja
   *   o.alCompletar()
   *
   * Devuelve el control: mano(evt), cuadro(dt), cerrar(), demo(), y `ctx`.
   */
  function montar(raiz, grupo, nombre, o) {
    o = o || {};
    const def = J[nombre];
    if (!def) throw new Error("sin juego: " + nombre);
    const panel = new KIT.Panel(raiz, grupo, { base: o.base, version: o.version });
    const cadas = [];
    const ctl = {
      nombre, panel, hecho: false, ctx: null,
      mano(evt) { panel.mano(evt); },
      cuadro(dt) {
        if (!panel.vivo) return;
        panel.cuadro(dt);
        for (const f of cadas.slice()) f(dt);
      },
      cerrar() { panel.destruir(); cadas.length = 0; },
      /** Lo juega solo, con clics: para mirarlo desde afuera del visor. */
      demo() {
        const pasos = def.demo ? def.demo(ctl.ctx, api) : [];
        let i = 0, espera = pasos.length ? pasos[0][0] : 0;
        cadas.push((dt) => {
          if (i >= pasos.length) return;
          espera -= dt;
          if (espera > 0) return;
          const r = pasos[i][1] ? pasos[i][1]() : undefined;
          if (r === false) return;
          i++;
          if (i < pasos.length) espera = pasos[i][0];
        });
      },
    };
    const api = {
      panel,
      azar: o.azar || Math.random,
      mensaje: (t) => { if (o.alMensaje) o.alMensaje(t || ""); },
      completar: () => {
        if (ctl.hecho) return;
        ctl.hecho = true;
        for (const pz of panel.piezas) if (pz.habilitar) pz.habilitar(false);
        if (o.alCompletar) o.alCompletar();
      },
      cada: (fn) => cadas.push(fn),
    };
    ctl.ctx = def.armar(api) || {};
    return ctl;
  }

  globalThis.JUEGOS_KIT = Object.assign(J, {
    _montar: montar,
    _nombres: () => Object.keys(J).filter((k) => !k.startsWith("_")),
  });
})();
