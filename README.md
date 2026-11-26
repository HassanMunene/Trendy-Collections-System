# Trendy Collections — shop system

Stock, orders, workroom and payments for a Kenyan curtain shop. Phone-first web app that also works on laptops.

| Folder | What it is |
|---|---|
| `backend/` | Laravel 13 API (PHP 8.5, PostgreSQL 16). All business rules live here. |
| `frontend/` | React 19 + TypeScript + Vite + Tailwind. Talks to the API at `/api`. |
| `docs/` | Planning pack: blueprint, workflows, data model, screens, questions for Mum. |
| `legacy/` | The old SQLite pilot, kept for reference only. Do not run it for real work. |

## Run it on your laptop

You need PHP 8.5, Composer, Node 22+ and Docker.

```bash
# 1. Database (PostgreSQL on port 5433, so it doesn't clash with other projects)
docker compose up -d db

# 2. API on http://127.0.0.1:8010
cd backend
composer install
cp .env.example .env          # first time only; then set DB_PASSWORD=trendy_local_dev
php artisan key:generate      # first time only
php artisan migrate --seed    # tables + starting lists of colours, materials, etc.
php artisan trendy:create-owner              # your account (asks questions)
php artisan serve --host=127.0.0.1 --port=8010

# 3. App on http://localhost:5180 (new terminal)
cd frontend
npm install
npm run dev
```

**On a phone (same Wi-Fi):** open `http://<laptop-ip>:5180`. Find the IP with `hostname -I`.
In Chrome choose *Add to Home screen* so it opens like an app.

The superadmin (oversight) account is created with `php artisan trendy:create-owner --superadmin`.

## Tests

```bash
cd backend && php artisan test        # uses the trendy_test database
cd frontend && npm test && npm run lint && npm run build
```

## Rules the code enforces

- Lengths are whole **centimetres**, money is whole **cents** (KES). Never floats.
- A roll's balance only changes through `App\Services\StockLedger`, inside a transaction, with the roll row locked.
  The database rejects negative balances and refuses any edit or delete of stock movements, corrections or audit events.
- Every staff member has their own login; every change records who made it. Temporary passwords must be changed on first sign-in.
- Purchase costs and suppliers are visible to owner/manager only.

Who can do what is defined in `backend/app/Providers/AppServiceProvider.php` (gates) and mirrored in the `permissions` the API sends to the app.

## Roadmap

Re-ordered on 22 Nov 2026 after reading the shop's sales book (`docs/08-SALES-BOOK-FINDINGS.md`): about 95% of sales are ready-made goods over the counter.

1. ✅ Foundation + stock: logins and roles, staff, fabric catalogue, receiving rolls, balances, history, count corrections, dashboard.
2. ✅ The sales book replacement: products (window curtain = set, door curtain = the "half", sheers, cases, rods...), sewing into stock, counter sales with bargained prices, payments (cash / Send money / Paybill / to pay) with M-Pesa codes, customers, day book with totals per method, voiding.
3. ✅ Trade accounts: paying off "to pay" debts, goods on approval (one week), returns with refunds or account credit, expenses, day-end cash count.
4. ✅ Custom orders: fabric by the metre from rolls, products and priced work; deposit and part-payments; taken → in work (fabric cut) → ready → collected with the balance (or on "to pay"); cancelling with a refund.
5. ✅ Reports: sales over any dates with a daily or monthly chart, best sellers, sales by kind, money in and out by method, expenses, custom orders, staff sales, rough profit (for those who see costs) and who owes the shop.
6. M-Pesa matching for Paybill 492438 (I&M) via the bank's notifications or statement import; hosting with HTTPS and backups before real use. Full workroom later if needed.
