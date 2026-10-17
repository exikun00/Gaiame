# Gaiame

Plataforma full-stack moderna para la exploración de catálogo, streaming híbrido de video y gestor de descargas locales de anime en el servidor, utilizando JKAnime como fuente de datos en tiempo real.

---

## Capturas de Pantalla

### 1. Catálogo Principal y Explorador de Estrenos
Búsqueda instantánea de títulos, navegación de estrenos y catálogo sincronizado.

![Catálogo Principal](assets/screenshots/screen1.png)

---

### 2. Ficha Técnica, Portadas Locales y Selector de Episodios
Metadatos completos (estado, tipo, estudios, temporada, géneros), carátula almacenada localmente, miniaturas 16:9 por episodio y opciones de reproducción y descarga.

![Ficha Técnica de Anime](assets/screenshots/screen2.png)

---

## Características Principales

* **Streaming Híbrido:**
  * Reproducción online fluida integrando los 9 servidores autorizados y verificados (`Desu`, `Magi`, `Mediafire`, `Mp4upload`, `Mixdrop`, `Vidhide`, `Filemoon`, `VOE`, `Streamtape`).
  * Fallback automático a los espejos disponibles si un servidor externo está caído.
* **Gestor de Descargas Blindado:**
  * Descarga concurrente controlada de episodios individuales, temporadas completas o animes enteros directamente al disco del servidor.
  * **Blindaje en 4 niveles contra archivos corruptos:**
    1. Pre-flight Content-Type Guard (`video/*`, `application/octet-stream`).
    2. Sniffing de Magic-Bytes iniciales (detección inmediata de páginas HTML o errores de mirror).
    3. Validación de tamaño mínimo (> 5 MB).
    4. **Verificación obligatoria post-descarga con `ffprobe`** antes de registrar el episodio como completado.
* **Reproducción Local HTTP 206 (Partial Content):**
  * Streaming directo de videos `.mp4` descargados en el servidor con soporte para saltos instantáneos en la línea de tiempo (*range requests*).
* **Almacenamiento Local de Carátulas y Miniaturas:**
  * Descarga física y persistencia de carátulas (`data/covers/`) y miniaturas de episodios (`data/thumbnails/`) al agregar animes a la biblioteca para disponibilidad 100% offline.
  * Endpoint local optimizado con cabeceras de caché inmutable (`Cache-Control: public, max-age=2592000`).
* **Biblioteca Personal y Borrado Diferido (Grace Period):**
  * Vista `/library` exclusiva para tu lista de seguimiento (Watchlist).
  * **Margen de seguridad:** al desmarcar un anime de la biblioteca, no se borra de inmediato; una tarea programada horaria se encarga de purgar definitivamente los archivos y registros solo si no se vuelve a marcar.
* **Tareas Programadas Automáticas (`SchedulerService`):**
  * **Cada hora (`0 * * * *`):** Purga por lotes diferida de animes y archivos que quedaron fuera de la Watchlist.
  * **Cada día a las 03:00 A.M. (`0 3 * * *`):** Sincronización automática de metadatos (cambio de estado a "Concluido", nuevos episodios emitidos y descarga de sus miniaturas).
* **Logging Diario Segregado con Retención de 7 Días:**
  * Canales dedicados con `pino-roll`: `server.log`, `errors.log` y `users.log`.
  * Rotación diaria por fecha y purga automática de logs con más de 7 días de antigüedad.

---

## Estructura del Proyecto

```text
Gaiame/
├── assets/
│   └── screenshots/            # Capturas de pantalla de la interfaz
│       ├── screen1.png         # Catálogo principal
│       └── screen2.png         # Ficha técnica y episodios
├── client/                     # Frontend SPA en React + Vite + Tailwind
│   ├── src/
│   │   ├── components/         # Componentes UI (Player, Badges, Botones, Cards)
│   │   ├── pages/              # Páginas (HomePage, AnimeDetailPage, WatchlistPage, DownloadsPage)
│   │   └── hooks/              # Custom hooks (useDownloads, useWatchlist)
├── server/                     # Backend API en Express + TypeScript
│   ├── prisma/
│   │   └── schema.prisma       # Modelos Prisma (Anime, Season, Episode, DownloadTask)
│   ├── logs/                   # Directorio de logs rotativos diarios (server, errors, users)
│   └── src/
│       ├── controllers/        # Controladores REST (anime, stream, download)
│       ├── routes/             # Enrutadores Express (incluyendo /api/storage)
│       ├── services/           # Lógica core (scraper, downloader, extractor, storage, scheduler)
│       └── utils/              # Configuración de logging estructurado
├── data/                       # Almacenamiento local persistente
│   ├── downloads/              # Archivos de video MP4 descargados
│   ├── covers/                 # Carátulas locales de animes
│   └── thumbnails/             # Miniaturas locales de episodios por slug
├── docker-compose.yml          # Orquestación con PostgreSQL 18 y Gaiame App
└── package.json                # Monorepo workspaces (npm)
```

---

## Requisitos Previos

* **Node.js** $\ge$ 20 LTS
* **npm** $\ge$ 10
* **Docker** y **Docker Compose**
* **FFmpeg / FFprobe** instalado en el sistema operativo:
  ```bash
  # En Ubuntu / Debian:
  sudo apt update && sudo apt install -y ffmpeg
  ```

---

## Configuración de Variables de Entorno

Copia el archivo de ejemplo para configurar el entorno:

```bash
cp .env.example .env
cp .env.example server/.env
```

Contenido por defecto de `.env`:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/anime_db?schema=public"
DATA_DIR=./data
MAX_CONCURRENT_DOWNLOADS=2
JKANIME_BASE_URL=https://jkanime.net
```

---

## Puesta en Marcha en Desarrollo

### 1. Instalar dependencias
```bash
npm install
```

### 2. Iniciar la base de datos PostgreSQL con Docker
```bash
npm run db:up
```

### 3. Aplicar migraciones y generar cliente de Prisma
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Iniciar cliente y servidor simultáneamente
```bash
npm run dev
```

La aplicación estará disponible en:
* **Frontend:** `http://localhost:5173`
* **Backend API:** `http://localhost:3000`

---

## Despliegue con Docker Compose

Para ejecutar toda la plataforma (Base de datos PostgreSQL 18 + Aplicación Gaiame empaquetada) en contenedores Docker:

```bash
docker compose up -d --build
```

Los volúmenes persistentes garantizarán que no pierdas tus descargas ni los datos de PostgreSQL:
* `./data:/app/data` (Videos, carátulas y miniaturas)
* `gaiame_pgdata` (Base de datos PostgreSQL)

---

## Pruebas Automatizadas

Ejecutar la suite completa de tests unitarios y de integración con Vitest:

```bash
# Correr tests del backend
npm test --workspace=server
```

Suite de pruebas incluidas:
* `storage_images.test.ts`: Validación de endpoints de carátulas y miniaturas locales con cabeceras de caché.
* `scheduler.test.ts`: Verificación de purga diferida y conservación de animes en Watchlist.
* `downloader.test.ts`: Blindaje multinivel y validación `ffprobe`.
* `extractor.test.ts`: Resolución de servidores y detección de errores/archivos caídos.
* `api.test.ts`: Endpoints REST, búsquedas y catálogo.

---

## Referencia de la API

### Catálogo y Biblioteca
* `GET /api/anime/search?q=:query` - Búsqueda de animes (con fallback offline en Watchlist).
* `GET /api/anime/latest` - Últimos animes y episodios estrenados.
* `GET /api/anime/watchlist` - Lista de animes guardados en la biblioteca.
* `POST /api/anime/watchlist/:slug` - Alternar inclusión en la biblioteca (con descarga de carátula y miniaturas).
* `GET /api/anime/:slug` - Ficha técnica y lista de episodios (sin persistencia en BD si solo se explora).

### Streaming y Servidores
* `GET /api/stream/servers/:episodeId` - Lista de servidores disponibles ordenados por prioridad.
* `GET /api/stream/remote/:episodeId?server=:name` - Resolución de stream óptimo o servidor específico.
* `GET /api/stream/local/:episodeId` - Streaming local HTTP 206 de video descargado en disco.

### Gestor de Descargas
* `POST /api/downloads/queue/:episodeId` - Encolar descarga de un episodio.
* `POST /api/downloads/queue-season/:seasonId` - Encolar temporada completa.
* `POST /api/downloads/queue-anime/:animeId` - Encolar todas las temporadas de un anime.
* `GET /api/downloads/tasks` - Tareas activas y encoladas.
* `DELETE /api/downloads/tasks/:taskId` - Cancelar tarea de descarga.
* `GET /api/downloads/storage` - Espacio utilizado en disco y cantidad de episodios almacenados.

### Almacenamiento Local de Imágenes
* `GET /api/storage/covers/:filename` - Servir carátula local con fallback bajo demanda.
* `GET /api/storage/thumbnails/:slug/:number` - Servir miniatura de episodio con fallback bajo demanda.

---

## Licencia

Este proyecto es de código abierto bajo la licencia MIT.
