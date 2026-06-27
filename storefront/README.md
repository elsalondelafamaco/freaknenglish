# Freakn Storefront — Vite + TanStack Start (SSR)

Public landing + authenticated portals (student, teacher, admin).

## Dev

```bash
cd storefront
cp .env.example .env.local
bun install
bun run dev   # http://localhost:5173
```

When the backend is running, set `VITE_API_URL=http://localhost:3000/api/v1`
in `.env.local`. The current code uses an in-memory mock repository — see
`docs/migration.md` for the contract each `MockXxxService` must implement
when wiring real fetch calls to the Nest API.
