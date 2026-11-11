# Cobalt mock server

A dependency-free Node.js mock of the `cobalt serve` HTTP API described in
[`../api_description.md`](../api_description.md). Use it to develop the UI without the Python backend.

Unlike the real server, the mock serves every endpoint under `/api` (`POST /api/stats`, `GET /api`);
anything outside `/api` is `404`.

```bash
npm run mock          # http://127.0.0.1:8001
npm run mock:watch    # restart on changes to the mock itself
```

| Env var         | Default     | Meaning                                                                     |
| --------------- | ----------- | --------------------------------------------------------------------------- |
| `MOCK_PORT`     | `8001`      | Port                                                                        |
| `MOCK_HOST`     | `127.0.0.1` | Bind address                                                                |
| `MOCK_API_KEYS` | unset       | Comma-separated keys; when set, `X-API-Key` is required (not on `GET /api`) |
| `MOCK_DELAY_MS` | `0`         | Delay every response, e.g. to see loading states                            |

CORS is always enabled for any origin.

## Endpoints

| Method | Path                                                           | Behaviour                                                                 |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api`                                                         | `{ title, version }`                                                      |
| POST   | `/api/inspect`                                                 | `InspectReport` computed from the uploaded file                           |
| POST   | `/api/validate`                                                | `QCReport` (duplicate IDs, empty/undefined sequences, invalid characters) |
| POST   | `/api/stats`                                                   | `StatsRow[]` from `file` uploads or a `sequence`, with `sort`/`desc`      |
| POST   | `/api/normalize`                                               | Plain-text `fasta`, `fastq` or `genbank`                                  |
| POST   | `/api/foldrna`, `/api/run` · GET `/api/runs`, `/api/runs/{id}` | `501` stubs                                                               |

Uploads are actually parsed: FASTA, FASTQ, a basic GenBank subset, and PDB/mmCIF (CA atoms of
the first model, one protein record per chain). gzip input is decompressed. bzip2 is rejected
with a `422`. Errors follow the API: a string `detail` for input problems and a FastAPI-style
array `detail` for form validation failures.

Specs live in `__tests__/` and run with the main `npm test`.

## Using it from the UI

`npm run dev` (port 8000) proxies `/api/*` unchanged to `COBALT_API_URL`, which defaults to this
mock at `http://127.0.0.1:8001`. Run `npm run mock` and `npm run dev` side by side, and call the API
with relative URLs such as `fetch('/api/stats', …)`.

To point the UI at a real `cobalt serve`, set the URL (and the key, if it runs with `--auth api-key`)
in the shell or in `.env.local`. `COBALT_API_STRIP_PREFIX=1` drops `/api`, since the real server has
no prefix:

```bash
COBALT_API_URL=http://127.0.0.1:9000 COBALT_API_KEY=key1 COBALT_API_STRIP_PREFIX=1 npm run dev
```

The proxy adds `X-API-Key` on the server side, so the key never reaches the browser.
