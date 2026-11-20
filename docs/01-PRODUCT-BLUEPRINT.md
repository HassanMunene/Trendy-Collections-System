# 01 — Product blueprint

## Goal

Give Trendy Collections one reliable view of **what was bought, what remains, what is being sewn, what is ready to sell, what was sold, and what has been paid**. The system should work well at a shop counter on a laptop and on a phone for checking status.

## People and permissions

| Role | Can do | Important restriction |
|---|---|---|
| Superadmin | Business oversight dashboard, all owner operations, staff accounts and correction review | Created through a separate setup step; ordinary owners cannot open its oversight dashboard |
| Owner | Shop operations, pricing, adjustments, reports and user accounts | Sensitive corrections require a reason and appear in audit history |
| Manager | Purchases, stock counts, production, sales, approved discounts | No deletion of posted stock or payment history |
| Sales/cashier | Quotes, orders, sales, receipts, payment requests | Cannot change cost or approve own refund/stock adjustment |
| Cutter/tailor | View assigned jobs, record cuts, usage, offcuts, output | Cannot alter sale prices or mark a payment as confirmed |
| Stock clerk | Receive and count stock, propose corrections | Corrections above tolerance need approval |

Start with owner, cashier, cutter and tailor if the team is small. One person may hold multiple roles, but **each person gets their own login**. No shared shop account. The screen shows who is signed in; staff sign out when handing over the device. Credentials are stored securely as password hashes, and the owner/manager controls account creation and resets.

## Catalogue and identifiers

- **Raw material:** curtain fabric, shia fabric, lining, pillow-case fabric and optional accessories (rings, tape, hooks, zips). Track fabric in metres and accessories in their own units.
- **Fabric design/SKU:** product category, material type (for example linen, velvet or voile), texture/finish (for example smooth, embossed or woven), supplier/design code, colour, pattern, width, unit, photo and reorder threshold. Colour, type and texture are searchable controlled values; avoid duplicate entries such as “cream” and “Cream ”. A different combination can have a different SKU and price.
- **Roll:** a physical roll with a unique barcode/ID, linked to the exact fabric SKU (and therefore its colour, material type and texture) and receiving batch. Store supplier-stated metres and measured metres separately, purchase cost, receipt date, location and status. Two rolls of the same fabric still have separate IDs.
- **Finished product:** curtain set, single curtain piece, shia, pillow case, or other item; design, colour, dimensions, style, unit and selling price. A standard catalogue SKU can be stocked; custom-measured output links to that customer's measurements.
- **Curtain set:** one saleable bundle containing the curtain pieces the customer chose. Shia is an optional line or bundle component, never assumed. Each included item has its own material/roll, colour, measurements, cut and sewing record. The precise number of curtain pieces per set is recorded on the order.
- **Customer order:** quote, customer, one or more window/opening measurements, flexible lines (set, piece, shia, metres, cases), selected materials, promised date, deposit, balance, production and delivery status.
- **Supplier purchase:** supplier, delivery/invoice reference, items, costs and received quantities.

Categories are editable. The shop calls the companion product **shia**; inspect a real sample to settle its exact catalogue description. “Square lumper” still needs identification.

## Core functions

| Area | Required for first release | Later extension |
|---|---|---|
| Inventory | Receive rolls and products; per-roll balance; search by colour/design; transfer between locations; stocktake and adjustment log | Barcode scanner, low-stock purchase suggestions |
| Cutting/sewing | Job per custom order/opening; add curtain, shia and case work only as ordered; assign people; record who actually cut, sewed and inspected, with metres and finished quantity for each operation | Labour time and detailed costing |
| Sales | Quote and sell measured sets, single curtain pieces, shia, fabric by metre and pillow cases; discount approval, receipt and returns with reason | Online customer catalogue |
| Payments | Cash/manual M-Pesa entry initially; STK Push and C2B Paybill matching; partial payments and reconciliation | Other payment providers |
| Reports | Roll balance by colour/type/texture, stock valuation, production work in progress, orders due, staff cutting/sewing output, sales, money received, debtors, gross margin estimate | Forecasting |
| Control | Individual staff logins, permissions, actor-stamped activity history, backups, export | Multiple branches with approvals |

## Non-negotiable business rules

1. **No silent stock edits.** A posted receipt, cut, sale, return or correction creates a dated ledger movement with actor and reason. Mistakes are reversed and reposted.
2. **One stock event, one effect.** Cutting ordered material deducts each source roll once. Completing sewing creates exactly the saleable output ordered: a set, a single curtain piece, shia or cases. Internal components of a set are tracked on its job, not also counted as separate saleable stock. Selling the finished output deducts it once and never deducts its source roll again. Selling fabric by metre deducts its source roll, with no sewing job.
3. **Do not cut more than available.** Reserve a planned amount for an order; actual cut cannot exceed available physical stock unless an authorized correction is entered. Record measurements in metres to three decimal places, with UI showing cm where useful.
4. **Account for each cut.** `cut metres = used in item + reusable offcut + waste`, within a configured tolerance. A reusable offcut becomes a separately tracked remnant if it can be sold or reused.
5. **Stock is not the same as money.** An order can have a deposit and still be in production; a payment can arrive before an order is completed. Do not mark an order paid from an STK request acknowledgement.
6. **State transitions are explicit.** Draft → confirmed → cutting → sewing → ready → collected/delivered; cancelled and returned are separate paths. A set is ready when every component actually ordered passes inspection. Partial fulfilment is allowed and shown clearly.
7. **Use the right unit.** A roll is metres; a set, single curtain piece, shia and pillow case each have their own counted unit. Never mix those balances in one quantity field without a unit.
8. **Store each opening's measurements.** A customer may bring several window sizes. Preserve width, drop, fullness and selected style per opening, with the agreed finished dimensions on the quote and job card.
9. **Keep source costs.** Record landed material cost and any labour/trim costs for margin estimates. Do not overwrite historic sale prices when catalogue prices change.
10. **Credit the actual worker.** Job assignment and work completion are different facts. A named, signed-in worker records each cut or sewing completion; the system stores who submitted it, when, for which job, which roll/material and how much. A manager may correct attribution with a visible reason, never by silently editing history.
11. **Label metre metrics precisely.** “Fabric cut (m)”, “fabric sewn/used (m)” and “finished curtain width (m)” are different figures. Dashboard totals use accepted work entries and show their unit; pending work is displayed separately. A worker's 20 m of completed sewing can be opened to see the jobs, curtain types, colours and texture behind it.

## Worked stock example

Receive curtain roll `RL-2026-0041`, **50.000 m**, and shia roll `RL-2026-0043`, **40.000 m**. Customer A orders one measured curtain set **with shia**; reserve 8.000 m and 5.000 m respectively. Cutting reduces the rolls to **42.000 m** and **35.000 m**. After inspection, record **1 finished set** with its component details. Selling that set makes set stock zero; neither roll is deducted again. Customer B buys **one curtain piece without shia**: only curtain material is cut and the finished piece is tracked/sold. Customer C buys **3.000 m of curtain fabric**: deduct those metres directly from the curtain roll, with no sewing job.

## Practical Kenyan details

- Currency: KES; phone number display in local format, store a normalized `254...` form for Daraja requests.
- Use Africa/Nairobi timestamps in the UI; keep server timestamps in UTC.
- Receipts should show Trendy Collections details, order/receipt number, item dimensions, payment breakdown and balance. Confirm tax treatment, invoice requirements and eTIMS obligations with the business accountant before building tax-specific automation.
- Keep only customer information needed to serve orders: name, phone, measurements and optional delivery address. Restrict access and decide retention rules. See [ODPC MSME guidance](https://www.odpc.go.ke/wp-content/uploads/2025/11/ODPC-%E2%80%93-Guidance-Note-on-Processing-by-MSMEs.pdf).
