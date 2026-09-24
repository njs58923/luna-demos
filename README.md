# luna-demos

Los demos del taller de [Luna](https://github.com/njs58923/LunaRust), volcados a
archivos estáticos y servidos por GitHub Pages.

Abrir en Luna: **https://njs58923.github.io/luna-demos/index.hsml**. Es una
plaza con una puerta a cada demo.

## Qué hay

| Demo | Entrada | De dónde sale |
|---|---|---|
| El atrio de noche | `noche/index.hsml` | `server_noche` |
| La nave | `nave/index.hsml` | `server_nave` |
| La calle de los objetos | `expo/calle.hsml` | `server_expo` |
| La sala de los ecos | `eco/index.hsml` | `server_eco` |
| El framework de UI | `ui/index.hsml` | `server_ui` |
| El taller de las manos | `manos/index.hsml` | `server_manipulador` |

Estos servidores generan sus documentos, pero no guardan estado ni hablan por
WebSocket. Lo que devuelven se puede pedir una vez y guardar.

## Qué no entra, y por qué

| Servidor | Por qué no |
|---|---|
| `server_arcada` | Las ocho salas listas son de física en red: los cuerpos los crea y los mueve el servicio de física (WebSocket, 8081). Sin él las salas quedan vacías. |
| `server_backrooms` | Infinito: el cliente pide `chunks.hsml?c=…` a medida que se camina, y el servidor genera cada tanda. |
| `server_corre` | La persecución corre en el servidor Go (WebSocket, 8083). |
| `server_hsml` | La sala de física habla con el servidor (8080). Además pesa 375 MB y trae modelos de terceros. |
| `server_jugadores` | La multitud llega por WebSocket (8082), y los resultados se guardan en el servidor. |
| `server_mosca` | El conectoma y MuJoCo corren en Python del lado del servidor. |
| `server_stress` | Cada prueba se arma por query (`pieza.hsml?m=…&tipo=…`) y los puntajes se guardan en el servidor. |
| `server_puente` | Es el directorio de servidores vivos. Acá lo reemplaza la portada. |

## Regenerar

Hace falta el taller al lado: esta carpeta vive junto a los `server_*`, y cada
uno con sus dependencias instaladas (`bun install`).

```
bun run tools/volcar.ts          # todo, desde cero
bun run tools/volcar.ts nave eco # sólo esos
```

`tools/volcar.ts` levanta cada servidor, le pide cada archivo de su `public/` y
cada URL que aparece en lo que devuelve, y lo escribe en `docs/<id>/`. Después:

- `http://localhost:<puerto>` pasa a `https://njs58923.github.io/luna-demos/<id>`.
  Los enlaces al puente y a la arcada van a la portada.
- Una URL con query que el servidor responde distinto que sin query se guarda
  aparte (`cueva__volver-….hsml`) y se reescribe quien la nombra. Si responde
  igual, la query la lee el cliente y queda como está: Pages la ignora y el
  script la sigue viendo en `location.search`.
- A los PNG se les sacan los chunks de texto, porque los renders de Blender
  guardan ahí la ruta del `.blend`.
- `docs/.nojekyll`, porque Jekyll ignora los archivos que empiezan con `_`.

`volcado.json` anota lo que no se pudo pedir. Casi todo son falsos positivos:
nombres sueltos en un script (`"silla.glb"`) que el código arma con otro
prefijo.
