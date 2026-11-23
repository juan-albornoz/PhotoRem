# Álbum del Camino Francés · De Burgos a Muxía

Fotolibro editable con formato de libro físico, hecho con tus propias fotos del Camino.
Es una app local: se ejecuta en tu portátil y las fotos no salen de él.
El plan técnico completo está en [`../plan-album.md`](../plan-album.md).

## Requisitos

- Node 22 o superior (probado con Node 26) y npm.
- Chromium para Playwright (pruebas e2e y exportación a PDF): `npx playwright install chromium`.
- ffmpeg en el `PATH`, solo para las pocas fotos HEIC del iPhone.

## Uso

```bash
npm install
npm run photos     # procesa tus fotos (la primera vez ~3 min; después, segundos)
npm run dev        # app en http://127.0.0.1:5173 y servidor local en 127.0.0.1:5174
```

## Procesado de las fotos (`npm run photos`)

Lee los originales de `../Canon` y `../Telefono` (**solo lectura**) y genera:

1. **Hora real de cada foto.** El iPhone guarda su zona horaria. La Canon tiene puesta la zona
   «Santiago de Chile», pero su reloj marca la hora española con 48 s de retraso. Se calibró
   comparando con el iPhone y se corrige con `canonClockCorrectionSeconds` en `config/album.config.json`.
2. **Posición.** El iPhone trae GPS. Las fotos de la Canon toman la posición de la foto del iPhone
   más cercana en el tiempo (o interpolada, marcada como aproximada).
3. **Lugar.** Cada lugar de `config/places.json` es el tramo que va desde que llegas a él hasta que
   llegas al siguiente. La llegada se calcula con el recorrido del iPhone y la velocidad a pie.
4. **Calidad.** Nitidez, exposición y huella perceptual (pHash) para agrupar ráfagas.
5. **Preselección.** 20 candidatas por lugar y una sugerencia de 10, con fotos del propio pueblo o
   monumento, verticales, variedad a lo largo del tramo y **las dos cámaras en proporción** a las
   fotos que hiciste con cada una en ese lugar (la Canon llega hasta Ponferrada). Los ajustes
   manuales tras revisar las hojas de contacto van en `config/curation.json`.

Resultado: `data/manifest.json`, `data/candidates.json`, miniaturas y vistas previas en `media/`, y
hojas de contacto por lugar en `media/review/`. **`data/selection.json` (tu selección) solo se crea
la primera vez y nunca se sobrescribe.**

## La app

- **Libro** (`#/libro`, la pantalla por defecto): el fotolibro en modo lectura, con doble página en
  escritorio y página suelta en móvil. Se pasa página con las flechas de pantalla o del teclado
  (← →, Inicio, Fin) y con el menú «Ir a» se salta a un capítulo. Se genera al momento con tu selección.
- **Selección de fotos** (`#/seleccion`): tus 10 fotos por lugar, con filtro por cámara (Canon /
  iPhone). Se guarda sola.

En el libro:

- **Pantalla completa** (icono de las cuatro esquinas, arriba a la derecha del libro): solo el libro,
  sobre fondo oscuro. Cada foto se pide a la resolución con la que se ve (`srcset` hasta 3840 px,
  generada desde los originales y guardada en `media/sized/`), así que no pierde calidad.
- **Flechas** a los lados del libro (y ← → en el teclado).
- **Sonido de hoja** al pasar página (también a pantalla completa). Se sintetiza en el navegador
  (Web Audio, sin archivos): crujido al levantar la hoja, roce del papel y asentado, con
  movimiento de derecha a izquierda y variaciones en cada página. Saltar a un capítulo suena
  como hojear varias. El icono del altavoz lo silencia y la preferencia se recuerda. Para medirlo:
  `npx tsx tests/analyze-sound.ts <carpeta>` (duración, nivel, frecuencias y WAV de muestra).
- **Reordenar fotos**: dentro de cada página, arrastra una foto sobre otra (o pulsa una y después
  la otra) para intercambiarlas. Tu orden se guarda en `data/layout.json` (en git, como tu
  selección); cada página puede volver a su orden original.
- **Descargar PDF**: ligero (150 ppp) o de imprenta (300 ppp). Chromium imprime la misma maqueta
  que ves (página `#/imprimir`): texto real con las fuentes incrustadas, cada foto recortada a su
  hueco sin ampliar nunca por encima del original (`media/crops/`). Incluye portada y
  contraportada (101 páginas, unos 37 MB el ligero y 126 MB el de imprenta).

El libro tiene formato horizontal (A4 apaisado, 297 × 210 mm), títulos en Oswald y texto en Inter.
Sus textos, el formato y las fotos de portada y separadores están en `config/book.json`: los
resúmenes de cada capítulo son un borrador para que los reescribas.

Para revisar el libro con capturas: `npx tsx tests/capture-book.ts <carpeta> 0,1,2` (vistas 0, 1 y 2,
con la app en marcha).

## Comprobaciones

| Comando             | Qué hace                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run check`     | Tipos, lint, formato y pruebas unitarias, todo de una vez                                            |
| `npm run typecheck` | Comprobación de tipos con TypeScript en modo estricto                                                |
| `npm run lint`      | ESLint con reglas de TypeScript, hooks de React y accesibilidad (jsx-a11y)                           |
| `npm run format`    | Formatea el código con Prettier                                                                      |
| `npm test`          | Pruebas unitarias y de componentes (Vitest)                                                          |
| `npm run test:e2e`  | Pruebas de extremo a extremo en escritorio y móvil, con análisis de accesibilidad (Playwright + axe) |
| `npm run build`     | Compilación de producción                                                                            |

## Estructura

```
config/    configuración editable: lugares, valores por defecto, ajustes manuales
pipeline/  procesado de tus fotos (solo lee los originales)
server/    servidor local Fastify (miniaturas, selección; exportación PDF en la F5)
shared/    tipos y esquemas compartidos por la app, el servidor y el procesado
src/       app web (React + TypeScript)
tests/e2e/ pruebas de extremo a extremo
data/      generado (fuera de git), salvo data/selection.json: tu selección
media/     generado (fuera de git): miniaturas, vistas previas, hojas de contacto
```

Las carpetas `../Canon` y `../Telefono` con los originales **solo se leen, nunca se modifican**.
