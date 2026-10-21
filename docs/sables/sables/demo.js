// La demo: los sables se mueven solos y cortan. Sirve para mirar el juego en
// el escritorio (sin mandos) y para probarlo.
//
// Cada sable busca el próximo cubo de su color. Un poco antes de su pulso se
// lleva la punta "atrás" de la flecha (para un corte hacia abajo, arriba del
// cubo) y en el pulso barre hasta pasarlo. El corte lo detecta notas.js como
// cualquier otro: la demo no hace trampa, sólo mueve las manos.
(globalThis.__modulos ||= []).push(["sables/demo", ["comun/algebra", "sables/config", "sables/sables", "sables/notas"], (A, C, S, N) => {
  const { v3, suma, resta, por, unitario } = A;
  const PREVIO = 0.24;     // cuánto dura el envión hasta el pulso, en segundos
  const DESPUES = 0.15;    // y el remate después
  const ATRAS = 1.15;      // cuánto se lleva la punta antes del cubo, en metros
  const REMATE = 1.4;      // hasta dónde sigue después (en remates)
  let activa = false;
  const apunte = { left: null, right: null };

  function activar(si) {
    activa = !!si;
    S.activarDemo(activa);
    apunte.left = apunte.right = null;
  }

  function animar(t, ahora, dt) {
    if (!activa) return;
    const altura = N.altura;
    for (const mano of ["left", "right"]) {
      const s = S.sables[mano], tipo = mano === "left" ? 0 : 1, lado = mano === "left" ? -1 : 1;
      const hombro = v3(lado * 0.2, altura - 0.32, -0.1);
      const reposo = v3(lado * 0.45, altura * 0.62, C.zGolpe - 0.2);
      // El cubo de este color en curso: el que está en su envión o su remate.
      // Uno ya cortado se sigue hasta terminar el remate (soltarlo apenas se
      // corta deja el golpe a medias), salvo que el siguiente ya tenga que
      // empezar su envión.
      const mios = N.notas.filter((x) => x.tipo === tipo && x.estado !== "fallada" && x.estado !== "fuera" && t < x.t + DESPUES * REMATE);
      let n = mios[0] || null;
      if (n && mios[1] && t > mios[1].t - PREVIO && t > n.t) n = mios[1];
      let objetivo = reposo, directo = false, esquiva = false;
      if (n && n.t - t < 0.6) {
        const d = n.corte === 8 ? v3(0, -1, 0) : n.d;
        // Al cubo donde está (el corte llega un poco antes del pulso, con el cubo
        // más lejos), sin ir a buscarlo más allá de lo que alcanza el brazo.
        const zCubo = C.zGolpe - (n.t - t) * N.njs;
        const centro = v3(n.x, n.y, Math.max(C.zGolpe - 0.7, Math.min(C.zGolpe + 0.2, zCubo)));
        const u = t < n.t ? Math.max(-1, (t - n.t) / PREVIO) : Math.min(REMATE, (t - n.t) / DESPUES);
        // Si hay una bomba cerca del golpe, el envión viene desde afuera y más
        // corto, para no pasarle por encima.
        const bomba = N.notas.some((b) => b.tipo === 3 && b.estado === "activa" && Math.abs(b.t - n.t) < 0.4 && Math.abs(b.x - n.x) < 0.7);
        const atras = bomba ? ATRAS * 0.55 : ATRAS;
        const desvio = bomba ? v3(lado * 0.45, 0, 0) : v3(0, 0, 0);
        // Si pasa una bomba por este lado, se baja a reposo: esperando (aunque
        // ya tocara prepararse) o en el remate (se corta el remate). Sólo el
        // instante del corte no se interrumpe.
        // En el envión sólo cuenta una bomba que llegue antes que el cubo:
        // cortar el envión por una que viene después deja un golpe a medias.
        const preparando = t >= n.t - PREVIO && t <= n.t;
        const limite = preparando ? n.t - 0.05 : t > n.t ? t + 0.45 : Math.min(n.t, t + 0.45);
        const pasa = N.notas.some((b) => b.tipo === 3 && b.estado === "activa" && b.t > t - 0.12 && b.t < limite && Math.abs(b.x - n.x) < 0.9);
        const enCorte = t > n.t - 0.1 && t < n.t + 0.04;
        if (pasa && !enCorte) { objetivo = reposo; esquiva = true; }
        // Esperando: en reposo hasta poco antes, y recién ahí atrás de la flecha.
        // Ir a prepararse con mucha anticipación cruza los cubos del otro color
        // que todavía no pasaron.
        else if (n.t - t > PREVIO + 0.16) objetivo = reposo;
        else if (n.t - t > PREVIO) objetivo = suma(suma(centro, por(d, -atras)), desvio);
        else { objetivo = suma(suma(centro, por(d, atras * u)), por(desvio, Math.max(0, -u))); directo = true; }
      }
      const a = apunte[mano] || objetivo;
      apunte[mano] = directo ? objetivo : suma(a, por(resta(objetivo, a), Math.min(1, dt * (esquiva ? 22 : 16))));
      // La mano va hacia lo que apunta (el brazo entero barre); la hoja, de la mano al apunte.
      const manoPos = suma(hombro, por(resta(apunte[mano], hombro), 0.42));
      S.ubicar(s, manoPos, unitario(resta(apunte[mano], manoPos)), ahora);
    }
  }

  return { activar, animar, get activa() { return activa; } };
}]);
