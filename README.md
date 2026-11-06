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

Opens on `http://localhost:5173/` with hot reload. The form sends `PUT /stats` to the same origin; if the
backend runs elsewhere during development, add a `server.proxy` entry in `vite.config.ts`.

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

## Formatting

```bash
npm run format
```
