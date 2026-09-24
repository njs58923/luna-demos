// La portada: docs/index.hsml para Luna y docs/index.html para el navegador.
//
// Es el directorio de server_puente sin lo que necesita un servidor vivo (el
// estado de cada sitio, el arranque, el filtro por etiquetas): una plaza con una
// puerta por demo y su cartel al lado. La plaza, el cielo y las puertas son los
// de server_arcada/src/entorno.ts, apuntando a los componentes de noche en Pages.
import { DEMOS, PAGES, urlDe } from "./demos.ts";

process.env.NOCHE_BASE = urlDe("noche");
const { cielo, escenografia, puerta, tonos } = await import("../../server_arcada/src/entorno.ts");

const n = (v: number) => (Math.abs(v) < 1e-4 ? "0" : v.toFixed(3).replace(/\.?0+$/, ""));
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const SALTO = String.fromCharCode(10);

const R_PUERTA = 6.4;
const LLEGADA = { x: 0, z: 1.7 };
const CIELO = "dia" as const;

function partir(t: string, ancho: number, max: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const p of t.split(/\s+/)) {
    if ((actual + " " + p).trim().length > ancho) { lineas.push(actual.trim()); actual = p; }
    else actual += " " + p;
  }
  if (actual.trim()) lineas.push(actual.trim());
  if (lineas.length > max) { lineas.length = max; lineas[max - 1] = lineas[max - 1].replace(/\s*\S*$/, " …"); }
  return lineas;
}

function cartel(d: (typeof DEMOS)[number]): string {
  const ancho = 1.26, alto = 1.5, centro = 1.2, top = alto / 2;
  const lin: string[] = [];
  let y = top - 0.13;
  for (const l of partir(d.nombre, 18, 2)) { lin.push(`        <text y="${n(y)}" z="0.035" value="${esc(l)}" size="0.082" color="#F4F1EA"/>`); y -= 0.1; }
  y -= 0.06;
  for (const l of partir(d.descripcion, 27, 6)) { lin.push(`        <text y="${n(y)}" z="0.035" value="${esc(l)}" size="0.05" color="#C9D2DE"/>`); y -= 0.068; }
  const cordon = tonos(CIELO).cordon;
  return `      <group x="2.3" y="${n(centro)}">
        <box x="-0.46" y="${n(-centro / 2 - top / 2 + 0.02)}" sx="0.08" sy="${n(centro - top + 0.04)}" sz="0.08" color="${cordon}" touchable="false"/>
        <box x="0.46" y="${n(-centro / 2 - top / 2 + 0.02)}" sx="0.08" sy="${n(centro - top + 0.04)}" sz="0.08" color="${cordon}" touchable="false"/>
        <box sx="${ancho}" sy="${alto}" sz="0.05" color="#1E2735" border-radius="0.05" touchable="false"/>
        <box y="${n(top - 0.02)}" z="0.005" sx="${ancho}" sy="0.04" sz="0.052" color="${d.color}" touchable="false"/>
${lin.join(SALTO)}
      </group>`;
}

export function hsml(): string {
  const sitios = DEMOS.map((d, i) => {
    const a = Math.PI + (i + 0.5) * ((Math.PI * 2) / DEMOS.length);
    const x = Math.sin(a) * -R_PUERTA, z = Math.cos(a) * R_PUERTA;
    const laPuerta = puerta({ id: "p_" + d.id, x: 0, z: 0, ry: 0, titulo: d.nombre, sub: d.sub,
                              roca: tonos(CIELO).cordon, color: d.color, destino: urlDe(d.id) + d.entrada });
    return `    <group id="s_${d.id}" x="${n(x)}" y="0" z="${n(z)}" ry="${n(Math.atan2(-x, -z))}">
${laPuerta}
${cartel(d)}
    </group>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- generado por luna-demos/tools/portada.ts - no editar a mano -->
<hsml>
  <head><name>Demos de Luna</name></head>
  <space resources="navigate_self,navigate_world,read_camera_pose,spawn,skybox,desktop_camera_control,vr_locomotion">
    <spawn id="entrada" default="true" x="${n(LLEGADA.x)}" y="0" z="${n(LLEGADA.z)}" ry="0"/>

${cielo(CIELO)}
${escenografia({ cielo: CIELO, radio: R_PUERTA + 1.4, llegada: LLEGADA, despejado: 0.1 })}

${sitios.join(SALTO + SALTO)}

    <group x="0" y="0" z="0.3">
      <cylinder y="0.4" sx="0.14" sy="0.8" sz="0.14" color="${tonos(CIELO).cordon}" touchable="false"/>
      <group y="0.88" rx="-0.75">
        <box sx="1.46" sy="0.5" sz="0.05" color="#1E2735" border-radius="0.05" touchable="false"/>
        <text y="0.1" z="0.03" value="Demos de Luna" size="0.065" color="#F4F1EA"/>
        <text y="-0.02" z="0.03" value="${DEMOS.length} sitios · cada puerta lleva a uno" size="0.034" color="#9FB0C4"/>
        <text y="-0.1" z="0.03" value="github.com/njs58923/LunaRust" size="0.03" color="#E0B35A"/>
      </group>
    </group>
  </space>
</hsml>
`;
}

export function html(): string {
  const filas = DEMOS.map((d) => `      <li><a href="${urlDe(d.id)}${d.entrada}"><b>${esc(d.nombre)}</b></a> <span>${esc(d.sub)}</span><p>${esc(d.descripcion)}</p><code>${urlDe(d.id)}${d.entrada}</code></li>`);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Demos de Luna</title>
<style>
  :root { --fondo: #F6F4EF; --texto: #1E2735; --suave: #5B6878; --acento: #9A6B12; --borde: #DDD8CC; }
  @media (prefers-color-scheme: dark) { :root { --fondo: #141A23; --texto: #E8ECF1; --suave: #9FB0C4; --acento: #E0B35A; --borde: #2A3444; } }
  body { margin: 0; background: var(--fondo); color: var(--texto); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { margin: 0 0 4px; font-size: 1.8rem; }
  .intro { color: var(--suave); }
  code { font-size: 0.85rem; color: var(--acento); overflow-wrap: anywhere; }
  ul { list-style: none; padding: 0; }
  li { border-top: 1px solid var(--borde); padding: 14px 0; }
  li a { color: inherit; text-decoration: none; font-size: 1.1rem; }
  li span { color: var(--suave); }
  li p { margin: 4px 0; }
</style>
</head>
<body>
<main>
  <h1>Demos de Luna</h1>
  <p class="intro">Mundos en HSML para <a href="https://github.com/njs58923/LunaRust/releases/latest">Luna</a>, el navegador espacial.
  Estas páginas no se ven en un navegador web: abrí la dirección en Luna. La portada, con una puerta a cada demo, es
  <code>${PAGES}/index.hsml</code>.</p>
  <ul>
${filas.join(SALTO)}
  </ul>
</main>
</body>
</html>
`;
}
