# Trendy Collections — working local app (version 0.1)

This first working build uses PHP 8.5, PDO SQLite and browser JavaScript. No Composer or npm install is required. It runs on the shop laptop at `http://127.0.0.1:8000` and stores data in `data/trendy.sqlite`.

## Start

From a terminal:

```bash
cd "$HOME/Desktop/Trendy Collections System/app"
php setup.php
./start.sh
```

Create the owner's account with `setup.php` once on a new database. The current local test database already has owner, manager, cashier, cutter and tailor accounts, so you can skip setup and run `./start.sh`. Open the printed address in a browser and sign in. The owner creates separate staff accounts under **Staff**. Stop the server with Ctrl+C. The local server binds only to this computer; do not use PHP's built-in server as an internet-facing production server.

The local pilot now also has a separate **superadmin** account. Its login is stored in `data/SUPERADMIN-CREDENTIALS.md` with owner-only file permissions. On a fresh database, run `php setup-superadmin.php` once to create it. The superadmin inherits owner operations and opens a distinct **Control center** dashboard; an ordinary owner cannot access its oversight API. Change the generated password before using real customer data.

## Working now

- Individual sign-in and roles: superadmin, owner, manager, cashier, cutter, tailor. Superadmin is a separate account marker and cannot be assigned from the normal Staff form.
- Customer order drafts with multiple room/window measurements, mixed made-to-measure items, selected fabrics, manual quoted prices and a printable workroom specification. Owner or manager confirmation locks the specification.
- Fabric catalogue: category, material type, texture, colour, design and width.
- Mobile roll receiving in one form: choose an existing fabric design or record a new one, then enter its physical roll and purchase details. Fabric details include category, material, texture, colour/shade, pattern, fixed width, light filtering, weight, care and a suggested retail rate. Roll details include dye lot, supplier/shop, Eastleigh building and stall, phone, receipt reference, purchase date, stated and measured metres, total cost, included services, location and an optional small-remnant alert. The form shows the length difference and cost per measured metre. The fabric and first roll save in one database transaction. Automatically generated short codes (such as `R00012`) can be searched or printed on a 70 × 45 mm label through the browser; handwriting the code remains an option.
- Custom production jobs for sets, single curtain pieces, shia and pillow cases, with window dimensions and optional shia on sets. Finishing checks the required base material and optional shia.
- Cut entries with used, offcut and waste reconciliation; reusable offcuts remain tracked.
- Sewing entries stamped with the worker's signed-in account; team output report.
- Finished stock and sales of finished items, fabric metres or offcuts. Cash or unpaid sale states.
- Owner/manager stock corrections for rolls, offcuts and finished items. Enter the counted balance and a reason; the previous balance and actor remain in the correction history.
- Pink themed, responsive dashboards: an operations view for ordinary staff and owners, and a separate superadmin Control center for money, orders, staff and stock corrections. The mobile layout has a top header, breadcrumb, navigation drawer, bottom navigation and stacked table records; desktop uses a sidebar. Roll changes and finished stock posting use SQLite transactions.

## Not implemented yet

The new order workspace is a first slice. It does not yet reserve rolls, generate linked cutting/sewing jobs, calculate required metres, track quote revisions, take deposits or hand over items. Existing Production and Counter sales remain separate from these orders. M-Pesa STK Push/C2B matching, returns, formal stocktake approvals, supplier purchases, multiple shop locations, photo uploads and online hosting are also pending. Do not enter a live M-Pesa payment as cash in this build.

## Safety and backups

- Each staff member uses their own account. Do not share logins.
- Back up `data/trendy.sqlite` daily while the app is stopped, or use SQLite's online backup facility. Keep the backup in a separate location.
- The database file contains customer names and staff password hashes; restrict who can read it.
- This is a local pilot. Before regular business use, add password reset/deactivation, backup automation, returns, receipts and payment reconciliation.

## Check the core rules

```bash
php tests/smoke.php
php tests/adjustments.php
php tests/orders.php
php tests/superadmin.php
php tests/roll_receiving.php
```

The smoke test uses a temporary database and checks roll arithmetic, offcuts, worker attribution and stock deduction behaviour. The server could not be browser-tested inside the Codex sandbox because local port binding is blocked there; open it from your normal terminal and browser.
