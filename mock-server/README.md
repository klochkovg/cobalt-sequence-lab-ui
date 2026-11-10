# Cobalt mock server

A dependency-free Node.js mock of the `cobalt serve` HTTP API described in
[`../api_description.md`](../api_description.md). Use it to develop the UI without the Python backend.

```bash
npm run mock          # http://127.0.0.1:8000
npm run mock:watch    # restart on changes to the mock itself
```

| Env var         | Default     | Meaning                                                                  |
| --------------- | ----------- | ------------------------------------------------------------------------ |
| `MOCK_PORT`     | `8000`      | Port                                                                     |
| `MOCK_HOST`     | `127.0.0.1` | Bind address                                                             |
| `MOCK_API_KEYS` | unset       | Comma-separated keys; when set, `X-API-Key` is required (not on `GET /`) |
| `MOCK_DELAY_MS` | `0`         | Delay every response, e.g. to see loading states                         |

CORS is always enabled for any origin.

## Endpoints

| Method | Path                                           | Behaviour                                                                 |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/`                                            | `{ title, version }`                                                      |
| POST   | `/inspect`                                     | `InspectReport` computed from the uploaded file                           |
| POST   | `/validate`                                    | `QCReport` (duplicate IDs, empty/undefined sequences, invalid characters) |
| POST   | `/stats`                                       | `StatsRow[]` from `file` uploads or a `sequence`, with `sort`/`desc`      |
| POST   | `/normalize`                                   | Plain-text `fasta`, `fastq` or `genbank`                                  |
| POST   | `/foldrna`, `/run` · GET `/runs`, `/runs/{id}` | `501` stubs                                                               |

Uploads are actually parsed: FASTA, FASTQ, a basic GenBank subset, and PDB/mmCIF (CA atoms of
the first model, one protein record per chain). gzip input is decompressed. bzip2 is rejected
with a `422`. Errors follow the API: a string `detail` for input problems and a FastAPI-style
array `detail` for form validation failures.

Specs live in `__tests__/` and run with the main `npm test`.
