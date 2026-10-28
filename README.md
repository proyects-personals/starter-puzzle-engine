# 🧩 PuzzleStudio

Crea y resuelve rompecabezas en la web. Versión Node.js (sin Python, sin dependencias externas).

## Requisitos

- Node.js 22.13 o superior (usa `node:sqlite` integrado — no necesita `npm install`)

## Uso

```bash
npm start          # abre http://127.0.0.1:3000
```

o con recarga automática durante desarrollo:

```bash
npm run dev
```

Variables opcionales: `PORT` (por defecto 3000) y `HOST` (por defecto 127.0.0.1).

## Funciones

- **Biblioteca** con tarjetas, miniaturas, búsqueda en vivo, progreso y tiempo jugado.
- **Creación** desde cualquier imagen (PNG, JPG, WEBP, GIF, BMP) con vista previa y cuadrícula calculada en vivo.
- **Tablero interactivo** en canvas: arrastra piezas con ratón o táctil, encaje magnético, cuadrícula guía.
- **Cronómetro** por sesión y tiempo acumulado guardado.
- **Pista (F1)**: resalta la celda de la pieza más a la izquierda sin colocar.
- **Vista fantasma (F2)**: muestra la imagen translúcida sobre el tablero.
- **Autoguardado**: progreso y posiciones de piezas se restauran al volver.
- **Renombrar, reconfigurar, exportar imagen y eliminar** partidas.
- **Límite global de piezas** configurable (2–1000).

## Estructura

```
server.js                  Servidor HTTP + API REST
src/
  database.js              Persistencia SQLite (node:sqlite)
  puzzle-engine.js         Cuadrícula y dispersión de piezas
public/
  index.html               Interfaz única con vistas
  css/styles.css           Tema oscuro moderno
  js/
    app.js                 Núcleo, navegación, atajos, toasts
    library.js             Biblioteca
    settings.js            Configuración general
    puzzle-modal.js        Crear / configurar
    puzzle.js              Tablero interactivo
    puzzle-engine.js       Motor compartido (navegador)
data/                      Base de datos e imágenes (se crea sola)
```

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/config` | Límite de piezas |
| GET | `/api/puzzles` | Lista |
| POST | `/api/puzzles` | Crear (imagen en base64) |
| GET | `/api/puzzles/:id` | Detalle |
| DELETE | `/api/puzzles/:id` | Eliminar |
| POST | `/api/puzzles/:id/progress` | Guardar progreso |
| POST | `/api/puzzles/:id/elapsed` | Sumar tiempo |
| POST | `/api/puzzles/:id/rename` | Renombrar |
| POST | `/api/puzzles/:id/config` | Reconfigurar |
| POST | `/api/settings/max-pieces` | Límite global |

## Atajos

- `F1` — pista · `F2` — vista fantasma · `Esc` — volver a la biblioteca
