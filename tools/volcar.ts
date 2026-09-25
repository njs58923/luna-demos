// Vuelca los demos del taller a archivos estáticos para GitHub Pages.
//
//   bun run tools/volcar.ts
//
// Levanta cada servidor en su puerto, le pide todo lo que sirve —cada archivo de
// su public/ y cada URL que aparece en lo que devuelve— y lo escribe en docs/<id>/.
// Pedir también los archivos de public/ por HTTP, y no copiarlos, importa: algunos
// servidores los transforman al servirlos (server_expo pega _base.js adelante de
// cada objeto).
//
// Las URLs con query se piden dos veces, con y sin. Si el servidor devuelve lo
// mismo, la query la lee el cliente (location.search) y la referencia queda como
// está: Pages ignora la query y el script la sigue viendo. Si cambia, el
// documento se genera por query: se guarda aparte y se reescribe quien lo nombra.
//
// Al final, cada http://localhost:<puerto> de un demo incluido pasa a su URL en
// Pages. Los que apuntan a servidores que no se pueden volcar quedan como están.
import fs from "fs";
import path from "path";
import { spawn, type Subprocess } from "bun";
import { DEMOS, A_LA_PORTADA, PAGES, TALLER, urlDe } from "./demos.ts";

const DOCS = path.resolve(import.meta.dir, "..", "docs");
const TEXTO = /\.(hsml|js|mjs|json|html|css|txt|xml|md|svg)$/i;
const EXT = "hsml|js|mjs|json|glb|gltf|bin|png|jpe?g|webp|ktx2|hdr|wav|mp3|ogg|txt|svg|css|html";

function recorrer(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base + "/" + e.name;
    if (e.isDirectory()) out.push(...recorrer(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

/** Lo que no se publica: pruebas sueltas, respaldos y capturas de trabajo. */
function descartar(p: string) {
  return /\/_prueba[^/]*$|\.bak$|\.log$|\.blend1?$/i.test(p);
}

/** Las rutas literales que el servidor registra, además de lo que hay en public/. */
function rutasDe(dir: string): string[] {
  const src = fs.readFileSync(path.join(TALLER, dir, "src", "index.ts"), "utf8");
  return [...src.matchAll(/app\.get\(\s*"(\/[^"]*\.(?:hsml|json|js))"/g)].map((m) => m[1]);
}

/** Referencias dentro de un texto: absolutas a este puerto, o relativas con una
 *  extensión conocida. Lo que tiene `${` o se arma con + es código, no una URL. */
function referencias(texto: string, puerto: number, desde: string): string[] {
  const out = new Set<string>();
  const abs = new RegExp(`https?://(?:localhost|127\\.0\\.0\\.1):${puerto}(/[^"'\`\\s<>)\\\\]*)`, "g");
  for (const m of texto.matchAll(abs)) out.add(m[1].replace(/&amp;/g, "&").split("#")[0]);
  const rel = new RegExp(`["'\`]((?:\\.{0,2}/)?[\\w./-]+\\.(?:${EXT})(?:\\?[^"'\`\\s<>]*)?)["'\`]`, "gi");
  for (const m of texto.matchAll(rel)) {
    const r = m[1].replace(/&amp;/g, "&");
    if (r.includes("${") || r.startsWith("//")) continue;
    const u = new URL(r, `http://x${desde}`);
    out.add(u.pathname + u.search);
  }
  return [...out];
}

/** Nombre de archivo para una URL generada por query: cueva.hsml?volver=… → cueva__volver-….hsml */
function nombreConQuery(p: string, q: string): string {
  const ext = path.extname(p);
  const slug = decodeURIComponent(q.slice(1))
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?/g, "")
    .replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return p.slice(0, -ext.length) + "__" + slug + ext;
}

/** Un PNG sin sus chunks de texto: los renders de Blender guardan ahí la ruta
 *  del .blend, que en esta máquina lleva el usuario de Windows. */
function limpiarPng(b: Buffer): Buffer {
  if (b.length < 8 || b.readUInt32BE(0) !== 0x89504e47) return b;
  const partes = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const largo = b.readUInt32BE(i);
    const tipo = b.toString("latin1", i + 4, i + 8);
    const fin = i + 12 + largo;
    if (!["tEXt", "zTXt", "iTXt"].includes(tipo)) partes.push(b.subarray(i, fin));
    i = fin;
  }
  return Buffer.concat(partes);
}

async function esperar(puerto: number) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://localhost:${puerto}/index.hsml`);
      if (r.status < 500) return;
    } catch {}
    await Bun.sleep(500);
  }
  throw new Error(`el puerto ${puerto} no respondió`);
}

type Volcado = { id: string; archivos: number; generados: string[]; porQuery: number; fallidos: string[] };

async function volcar(d: (typeof DEMOS)[number]): Promise<Volcado> {
  const salida = path.join(DOCS, d.id);
  fs.rmSync(salida, { recursive: true, force: true });
  const proc: Subprocess = spawn(["bun", "run", "src/index.ts"], {
    cwd: path.join(TALLER, d.dir),
    env: { ...process.env, PORT: String(d.puerto) },
    stdout: "ignore",
    stderr: "ignore",
  });
  const res: Volcado = { id: d.id, archivos: 0, generados: [], porQuery: 0, fallidos: [] };
  try {
    await esperar(d.puerto);
    const origen = `http://localhost:${d.puerto}`;
    const publicos = new Set(recorrer(path.join(TALLER, d.dir, "public")).filter((p) => !descartar(p)));
    const cola = [...new Set(["/index.hsml", ...rutasDe(d.dir), ...publicos])];
    const visto = new Set<string>();
    /** "cueva.hsml?volver=…" → "cueva__volver-….hsml", sólo para las que el servidor genera. */
    const renombres = new Map<string, string>();
    const cuerpos = new Map<string, Buffer>();

    const traer = async (u: string) => {
      if (cuerpos.has(u)) return cuerpos.get(u)!;
      // Algún pedido se corta con ECONNRESET cuando el servidor viene cargado:
      // se reintenta en vez de tirar abajo todo el volcado.
      let r: Response | null = null;
      for (let i = 0; i < 4 && !r; i++) {
        try { r = await fetch(origen + u); } catch (e) { if (i === 3) throw e; await Bun.sleep(300 * (i + 1)); }
      }
      if (!r) return null;
      const b = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      if (b) cuerpos.set(u, b);
      return b;
    };

    while (cola.length) {
      const u = cola.shift()!;
      if (visto.has(u) || u === "/" || descartar(u.split("?")[0])) continue;
      visto.add(u);
      const [p, q = ""] = u.split(/(?=\?)/);
      const cuerpo = await traer(u);
      if (!cuerpo) { res.fallidos.push(u); continue; }

      let destino = p;
      if (q) {
        const sin = await traer(p);
        if (sin && sin.equals(cuerpo)) {
          if (!visto.has(p)) cola.push(p);
          continue;
        }
        destino = nombreConQuery(p, q);
        renombres.set(path.posix.basename(p) + q, path.posix.basename(destino));
        res.porQuery++;
      }
      const archivo = path.join(salida, destino);
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, /\.png$/i.test(p) ? limpiarPng(cuerpo) : cuerpo);
      res.archivos++;
      if (!publicos.has(p)) res.generados.push(destino);

      if (TEXTO.test(p)) {
        for (const r of referencias(cuerpo.toString("utf8"), d.puerto, p)) if (!visto.has(r)) cola.push(r);
      }
    }

    // Las referencias a documentos generados por query apuntan ahora a su archivo.
    if (renombres.size) {
      for (const f of recorrer(salida)) {
        if (!TEXTO.test(f)) continue;
        const archivo = path.join(salida, f);
        let t = fs.readFileSync(archivo, "utf8");
        const antes = t;
        // Las más largas primero, y sólo si la query termina ahí: con
        // "calle.hsml?detalle=alto" antes que "…=alto_mesh", el segundo enlace
        // quedaba "calle__detalle-alto.hsml_mesh" y no llevaba a ningún lado.
        const orden = [...renombres].sort((a, b) => b[0].length - a[0].length);
        for (const [viejo, nuevo] of orden) {
          for (const forma of [viejo, viejo.replace(/&/g, "&amp;")]) {
            const re = new RegExp(forma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w&=%.-])", "g");
            t = t.replace(re, nuevo);
          }
        }
        if (t !== antes) fs.writeFileSync(archivo, t);
      }
    }
  } finally {
    proc.kill();
    await proc.exited;
  }
  return res;
}

/** localhost:<puerto> → la URL en Pages, para cada demo incluido y el puente. */
function reubicar() {
  const mapa: [number, string][] = [
    ...A_LA_PORTADA.map((p) => [p, PAGES] as [number, string]),
    ...DEMOS.map((d) => [d.puerto, urlDe(d.id)] as [number, string]),
  ];
  const vivos = new Set(mapa.map(([p]) => p));
  const muertos = new Map<string, number>();
  for (const f of recorrer(DOCS)) {
    if (!TEXTO.test(f)) continue;
    const archivo = path.join(DOCS, f);
    let t = fs.readFileSync(archivo, "utf8");
    const antes = t;
    for (const [puerto, url] of mapa) {
      for (const host of ["localhost", "127.0.0.1"]) {
        // Una puerta a la raíz ("http://localhost:2064/") en Pages daría index.html:
        // se la manda a index.hsml.
        t = t.replace(new RegExp(`https?://${host.replace(/\./g, "\\.")}:${puerto}/(?=["'\`&\\s<)])`, "g"), url + "/index.hsml");
        t = t.split(`http://${host}:${puerto}`).join(url);
        t = t.split(`http%3A%2F%2F${host}%3A${puerto}`).join(encodeURIComponent(url));
      }
    }
    for (const m of t.matchAll(/(?:localhost|127\.0\.0\.1):(\d{4})/g)) {
      if (!vivos.has(Number(m[1]))) muertos.set(`${f} → :${m[1]}`, (muertos.get(`${f} → :${m[1]}`) || 0) + 1);
    }
    if (t !== antes) fs.writeFileSync(archivo, t);
  }
  return muertos;
}

const soloEstos = process.argv.slice(2);
// Completo, se arranca de cero: un demo que salió de la lista no queda publicado.
if (!soloEstos.length) fs.rmSync(DOCS, { recursive: true, force: true });
fs.mkdirSync(DOCS, { recursive: true });
const resumen: Volcado[] = [];
for (const d of DEMOS) {
  if (soloEstos.length && !soloEstos.includes(d.id)) continue;
  process.stdout.write(`${d.id}… `);
  const r = await volcar(d);
  resumen.push(r);
  console.log(`${r.archivos} archivos, ${r.generados.length} generados, ${r.porQuery} por query${r.fallidos.length ? `, ${r.fallidos.length} fallidos` : ""}`);
}
const muertos = reubicar();
// Sin esto Jekyll se come los archivos que empiezan con _ (expo/objetos/_base.js).
fs.writeFileSync(path.join(DOCS, ".nojekyll"), "");
const portada = await import("./portada.ts");
fs.writeFileSync(path.join(DOCS, "index.hsml"), portada.hsml());
fs.writeFileSync(path.join(DOCS, "index.html"), portada.html());

const informe = { resumen, fallidos: resumen.flatMap((r) => r.fallidos.map((f) => `${r.id}${f}`)), aOtrosServidores: [...muertos.keys()] };
fs.writeFileSync(path.resolve(import.meta.dir, "..", "volcado.json"), JSON.stringify(informe, null, 2) + "\n");
console.log(`referencias a servidores no volcados: ${muertos.size} (ver volcado.json)`);
