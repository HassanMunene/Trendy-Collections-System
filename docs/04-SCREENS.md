# 04 — Screen drafts

Open `screen-draft.html` in a browser for a clickable visual draft. It uses fictional data and does not save anything.

## Navigation

Dashboard · Rolls & materials · Production · Orders · Sales · Payments · Reports · Settings

## Dashboard

The app uses a pink based Trendy Collections theme. The superadmin opens a separate **Control center** with sales posted, cash received, unpaid sale balances, active accounts, due/draft orders and stock corrections. Other accounts open the shop operations overview. Both layouts begin with phone sized screens, a clear page header and breadcrumb, and navigation reachable with a thumb.

Show today's sales, collected payments, orders due soon, low stock, jobs waiting for cutting/sewing, and unmatched M-Pesa transactions. Show **fabric cut today (m)**, **fabric sewn today (m)**, and **finished output today (sets/pieces)** as separate metrics. A live staff table shows each worker's accepted sewing metres and completed items, with drill-down to job, curtain type, colour, material type and texture. Update this view automatically as a work entry is accepted, so the owner can see the new total without reloading. Staff see their own tasks; owner/manager sees the whole team. The most important quick actions are **Receive roll**, **New order**, **Cut material**, and **New sale**.

## Rolls & materials

List rows: roll ID, category, material type, texture, design, colour swatch/name, width, original and available metres, reserved metres, location, supplier, age. Search/filter by roll ID, colour, material type, texture, category, supplier, or design. A roll detail page shows the chronological movement trail and linked orders/jobs. Receiving asks for supplier-stated and measured metres separately.

## Production

Job card: customer/order, measurements per window, chosen outputs (set, single piece, shia, pillow cases), fabric and selected roll for each, suggested metres, trims, assigned cutter/tailor, due date. Cutter records cut, actual use, reusable offcut and waste for each material. Tailor records sewn fabric metres and finished quantity; inspector checks quality. Every posted step displays the actual signed-in person's name and time. A prominent difference warning blocks completion if cut accounting does not add up.

## Orders and sales

New order wizard: customer → window measurements → choose set, single piece, shia, cases or fabric metres → choose materials and optional shia → availability → price/due date → deposit/payment → confirmation. A set asks for the number of curtain pieces; shia is a separate yes/no choice. POS sale: pick finished SKU or roll; enter quantity/metres; show remaining stock and total; request M-Pesa prompt, record cash, or leave balance due. Printed/PDF receipt lists each sold item and clear payment status.

## Payments

Payment panel: Paybill number (configured), account reference, amount, phone, **Send M-Pesa prompt**, status timeline. Separate tabs for confirmed, pending verification, and unmatched. Show M-Pesa receipt and source without displaying credentials. Cashier can retry only after verification of prior pending requests; manager can match unmatched payments with a reason.

## Reports

Start with filters for day/week/month, category, colour, material type, texture, supplier, cashier and worker. Essential reports: roll balance and ageing, low-stock list, stock movements, work in progress, sewing output by worker/job/material, orders due, sales by category, payment reconciliation, customer balances, and estimated gross profit. Export CSV/PDF.

## Accessibility and shop use

Large touch targets, keyboard search, clear contrast, visible units beside every quantity, simple English with familiar shop terms, and readable receipt printouts. If connectivity is unreliable, the first release should warn clearly and queue only draft notes locally; stock and payment posting require the server to avoid double-selling. Offline posting can be a later, separately designed feature.
