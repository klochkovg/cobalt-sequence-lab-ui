# Cobalt mock server

A dependency-free Node.js mock of the `cobalt serve` HTTP API 0.2.0 described in
[`../api_description.md`](../api_description.md). Use it to develop the UI without the Python backend.

Like the real server with its default prefix, the mock serves every endpoint under `/api`
(`POST /api/stats`, `GET /api`); anything outside `/api` is a JSON `404`.

```bash
npm run mock          # http://127.0.0.1:8001
npm run mock:watch    # restart on changes to the mock itself
```

| Env var              | Default     | Meaning                                                                                        |
| -------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `MOCK_PORT`          | `8001`      | Port                                                                                           |
| `MOCK_HOST`          | `127.0.0.1` | Bind address                                                                                   |
| `MOCK_API_KEYS`      | unset       | Comma-separated keys; when set, `X-API-Key` is required (not on `GET /api`, `GET /api/health`) |
| `MOCK_DELAY_MS`      | `0`         | Delay every response, e.g. to see loading states                                               |
| `MOCK_MAX_UPLOAD_MB` | `100`       | Request body limit in MiB (`0`: no limit); gzip may expand to 10× it                           |
| `MOCK_STORAGE_DIR`   | unset       | Serve the runs stored in `<dir>/runs/*/manifest.json` instead of the seed runs                 |

CORS is always enabled for any origin, and the `/normalize` result headers are exposed to the browser.

## Endpoints

| Method | Path                       | Behaviour                                                                                                     |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/api`, `/api/`            | `{ title, version }`                                                                                          |
| GET    | `/api/health`              | `{ status: "ok" }`                                                                                            |
| POST   | `/api/inspect`             | Report computed from the upload, with `offset`/`output_seq_number` paging, `include_sequence`, `max_warnings` |
| POST   | `/api/validate`            | QC report (duplicate IDs, empty/undefined sequences, invalid characters with `details`), `max_warnings`       |
| POST   | `/api/stats`               | Rows from `file` uploads or a `sequence`, with `sort`/`desc`; field errors for neither/both                   |
| POST   | `/api/normalize`           | Plain-text `fasta`, `fastq` or `genbank` with `Content-Disposition` and `X-Records-*` headers                 |
| GET    | `/api/runs`                | Run summaries, newest first                                                                                   |
| GET    | `/api/runs/{run_id}`       | One run with its tasks; `404 "run not found: <id>"`                                                           |
| POST   | `/api/run`, `/api/foldrna` | Validate the JSON body (`422` field errors), then `501` stubs                                                 |

Uploads are actually parsed: FASTA, FASTQ, a basic GenBank subset, and PDB/mmCIF (CA atoms of
the first model, one protein record per chain). gzip input is decompressed. bzip2 is rejected
with a `422` (the real server reads it). Errors follow the API: a string `detail` for input
problems, a FastAPI-style array `detail` for form and JSON validation failures, `413` over the
upload limit and a JSON `500` for unexpected errors.

### Pipeline runs

Nothing executes runs, as on the real server: the mock only serves stored runs.

- By default it serves the seed runs in [`runs.js`](runs.js), which cover every run and task
  status. Unlike the real server, it keeps `pending` and `running` seed runs as they are, so the
  UI can show them.
- With `MOCK_STORAGE_DIR` it loads the manifests from a real server's storage directory
  (`.cobalt-server` by default there) the way the server does at startup: broken or mismatched
  manifests are skipped with a warning, and `pending`/`running` runs become `failed` with
  `"interrupted: server stopped"`. The mock never writes the manifests back.

Specs live in `__tests__/` and run with the main `npm test`.

## Using it from the UI

`npm run dev` (port 8000) proxies `/api/*` unchanged to `COBALT_API_URL`, which defaults to this
mock at `http://127.0.0.1:8001`. Run `npm run mock` and `npm run dev` side by side, and call the API
with relative URLs such as `fetch('/api/stats', …)`.

To point the UI at a real `cobalt serve`, set the URL (and the key, if it runs with `--auth api-key`)
in the shell or in `.env.local`. The server uses the same `/api` prefix by default, so paths pass
through unchanged:

```bash
COBALT_API_URL=http://127.0.0.1:9000 COBALT_API_KEY=key1 npm run dev
```

`COBALT_API_STRIP_PREFIX=1` drops `/api`. It is only needed for a server started with
`--api-prefix ""`.

The proxy adds `X-API-Key` on the server side, so the key never reaches the browser.
