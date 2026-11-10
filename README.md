# CobaltSequenceLabUi

Vue 3 + TypeScript + Vite front end for Cobalt Sequence Lab.

## Setup

```bash
npm install
```

## Development server

```bash
npm run dev
```

Opens on `http://localhost:8000/` with hot reload.

The app calls the API with relative URLs (for example `/stats`). The dev server proxies the API paths
(`/inspect`, `/validate`, `/stats`, `/normalize`, `/foldrna`, `/run`, `/runs/*`) to the backend, so no CORS
setup is needed. `GET /` is not proxied, because it serves the app.

| Variable         | Default                 | Meaning                                                        |
|------------------|-------------------------|----------------------------------------------------------------|
| `COBALT_API_URL` | `http://127.0.0.1:8001` | Backend the API paths are forwarded to (the mock server by default) |
| `COBALT_API_KEY` | unset                   | Sent as `X-API-Key` by the proxy, for a backend running `--auth api-key` |

Set them in the shell or in `.env.local`. They have no `VITE_` prefix, so they stay in the dev server and
never reach the browser bundle:

```bash
COBALT_API_URL=http://127.0.0.1:9000 COBALT_API_KEY=key1 npm run dev
```

The API itself is described in [`api_description.md`](api_description.md).

## Mock API server

```bash
npm run mock          # http://127.0.0.1:8001
npm run mock:watch    # restarts when the mock's own files change
```

A dependency-free Node.js mock of the `cobalt serve` API lives in [`mock-server/`](mock-server/). It parses
uploaded files and returns computed results, so you can develop the UI without the Python backend. Run it
next to `npm run dev`; the default `COBALT_API_URL` already points at it. It accepts `MOCK_PORT`,
`MOCK_HOST`, `MOCK_API_KEYS` (require `X-API-Key`) and `MOCK_DELAY_MS` (slow responses down). See
[`mock-server/README.md`](mock-server/README.md) for details.

## Building

```bash
npm run build
```

Type-checks with `vue-tsc` and writes the production bundle to `dist/`. Preview it with `npm run preview`.

## Running unit tests

```bash
npm test
```

Runs [Vitest](https://vitest.dev/) with `@vue/test-utils` in jsdom. Tests live in `src/**/__tests__/`.
The mock server's specs in `mock-server/__tests__/` run in the same suite (in the Node environment).

## Formatting

```bash
npm run format
```
