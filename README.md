# cheer-render

Thin HTTP rendering service that connects to a local Browserless (Chrome CDP) instance, loads the frontend render host page (`render.html`), and invokes `window.__wuyanRender(cardInput)` to return a rendered PNG image (`1080x1440`).

## Requirements

- Node.js >= 20
- A running Browserless / headless Chrome WebSocket endpoint

## Configuration

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

Key environment variables:

- `PORT` / `HOST`: Listen port and address (defaults to `13000` / `127.0.0.1`)
- `RENDER_TOKEN`: Bearer token required for `POST /render` (fail-closed: returns `503` if unset)
- `BROWSERLESS_WS`: WebSocket URL of the Browserless service (default `ws://127.0.0.1:11300`)
- `BROWSERLESS_TOKEN`: Token for Browserless authentication
- `RENDER_HOST_URL`: URL of the frontend render host page
- `FONTS_DIR`: Optional directory containing `fonts.json` and `.ttf` / `.otf` font files for runtime `@font-face` injection

## Usage

Install dependencies:

```bash
npm ci
```

Run tests:

```bash
npm test
```

Start the server:

```bash
npm start
```

## API

- `GET /health`: Health check (`200 OK`, `{"ok":true}`)
- `POST /render`: Renders a card into `image/png` binary. Requires header `Authorization: Bearer <RENDER_TOKEN>` and JSON body with `line` and optional card configuration fields (`mood`, `refs`, `templateId`, `background`, `appearance`, `fonts`).
