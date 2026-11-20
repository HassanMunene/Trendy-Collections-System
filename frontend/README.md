# Trendy Collections — frontend

React + TypeScript + Vite + Tailwind. See the main [README](../README.md) to run it.

- `src/api/` — axios client (Sanctum cookie + CSRF), typed endpoints and response types
- `src/lib/units.ts` — metres ⇄ centimetres and shillings ⇄ cents without floating-point errors (tested in `units.test.ts`)
- `src/auth/` — who is signed in and what they may do
- `src/components/` — app shell (bottom tabs on phones, sidebar on laptops) and form building blocks
- `src/pages/` — one file per screen
