# Álbum del Camino Francés · De Burgos a Muxía

Fotolibro editable con formato de libro físico, hecho con tus propias fotos del Camino.
Es una app local: se ejecuta en tu portátil y las fotos no salen de él.
El plan técnico completo está en [`../plan-album.md`](../plan-album.md).

## Requisitos

- Node 22 o superior (probado con Node 26) y npm.
- Chromium para Playwright (pruebas e2e y exportación a PDF): `npx playwright install chromium`.

## Uso

```bash
npm install
npm run dev        # app en http://localhost:5173 y servidor local en 127.0.0.1:5174
```

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
config/    configuración editable (lugares, valores por defecto)    · desde la F2
pipeline/  procesado de tus fotos (solo lee los originales)          · desde la F1
server/    servidor local Fastify (fotos, proyecto, exportación PDF)
shared/    tipos compartidos por la app y el servidor
src/       app web (React + TypeScript)
tests/e2e/ pruebas de extremo a extremo
data/      generado: manifiesto y proyecto (fuera de git)
media/     generado: miniaturas y versiones para pantalla (fuera de git)
```

Las carpetas `../Canon` y `../Telefono` con los originales **solo se leen, nunca se modifican**.
