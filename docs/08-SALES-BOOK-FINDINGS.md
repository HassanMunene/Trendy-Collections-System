# 08 — What the shop's sales book tells us

Prepared 22 November 2026 from 7 photographed pages of the shop's handwritten sales book (20 April – 12 May 2026, `Trendy Docs/trendy-business-doc.pdf`). Individual customers' names are left out here; business and stall names are kept because they identify trade accounts.

## 1. How the book works today

One line per item sold, under a date header (often with the weekday). Five columns:

| Name | Item | Quantity | Mode of payment | Amount |
|---|---|---|---|---|
| "customer" or a regular's name / shop / stall code | curtain, sheer, cases, pillow, kitchen curtain, rods… | "1 set grey", "6 pcs", "2 m", "1 set & half" | Cash, Send money, Paybill, M-Pesa, To pay, Returned | line total in KES |

Things staff do in the margins because the columns can't hold them:

- **Braces group lines into one customer basket** with a written total (e.g. curtain 13,200 + kitchen curtain 1,500 → 14,700).
- **Deposits and balances** are squeezed into the payment cell: "Paybill — Deposit 15,000 — Bal 5,300" (total 20,300).
- **Credit** is "To pay"; when settled it is crossed out and "Paid" written in. Asterisks mark ones still owed.
- **Returns** are a line with "Returned" and no amount; nothing links them to the original issue.
- **Trade prices** are noted in brackets: "1 set cream (2000)".
- **Cash count** appears once: "CASH: 6660" at the end of a day. There is no regular daily total by payment method.

## 2. What the business actually is (the big finding)

**About 95% of lines are ready-made goods sold over the counter**, not made-to-measure jobs. Across ~150 lines only 2–3 look like custom orders (curtain and sheer by the metre with a deposit and balance).

Docs 02/03/07 built the plan around the made-to-measure flow: openings → quote → workroom → cut → sew → collect. That flow is real but rare. Day to day, the shop is a **fast counter sale of finished stock**, plus **supplying other shops in the same building on credit or sale-or-return**.

### Product range seen in the book (with observed prices)

| Product | How it is sold | Prices seen (KES) | Variants that matter |
|---|---|---|---|
| Curtain | set, single piece, "set & half", "1.5" | set 2,000–3,800 (2,200 and 3,500 most common); piece 1,000–1,500 | colour (grey, beige, cream, off-white, black, navy, royal blue, maroon, orange, pink, peach, sky blue, turquoise, emerald, chocolate brown), type (blackout, "leaf", "mizimizi" pattern) |
| Sheer (shia) | piece, metre | piece 450–800; ~400–450/m | with rings / without rings |
| Kitchen curtain | set | 1,500 / 1,800 / 2,500 | colour |
| Pillow cases ("cases") | pieces, often 2–12 at a time | 220 each (trade); 250 walk-in; 350 "big size" | size, colour, "striped B/H" |
| Pillow | piece | 200 | |
| "Complete" pillow | piece | — | probably pillow + case together |
| Knot pillow / bowtie pillow | piece | 450–500 | colour |
| Bed pillow | pair / piece | 400 / pair | |
| Curtain rod | piece | 2 m ≈ 1,000; 3 m ≈ 1,300; "double" 1,000 | length, single/double, colour (gold) |
| Curtain holders (tie-backs) | pair | 400–450 / pair | colour |
| Adjustment (alteration) | service | 250 | — |
| Fabric by the metre (custom) | metres | 14 m curtain + 9 m sheer + kitchen set = 20,300 | needs deposit / balance |

### Customers

- **About half the lines are "customer"** — anonymous walk-ins. The system must not force a name or phone.
- **Repeat trade accounts**: Lily Collection, City Charm, Gee Collection, Babyboss, Uprop, plus stall codes like **BS 60 (3rd floor), BM 19, G34**. Several individuals also buy cases and pillows in bulk every few days. These appear to be **other shops in the same building** that buy at trade price, take goods on credit, and return what they don't sell.
- **Bulk orders** happen: 35 sheers in one line (28,000); one business took curtains, rods and kitchen sets totalling about 21,000 on Paybill.

### Payment methods

| Book term | Likely meaning | System treatment |
|---|---|---|
| Cash | cash drawer | counts toward the daily cash total |
| Send money | M-Pesa person-to-person to a personal line | M-Pesa — needs which number + M-Pesa code |
| M-Pesa / mpesa | probably Buy Goods till, or the same as Send money | **confirm with Mum** |
| Paybill / P. Bill | business Paybill | M-Pesa — the only one Daraja can match automatically |
| To pay | credit, settle later | goes on the customer's account balance |
| Deposit / Bal | part payment of an order | payments against an order, balance tracked |

"Send money" is the most common, Paybill second, cash third. Several baskets mix methods.

## 3. What the book cannot do (where the system must be better)

1. **No stock picture.** Nothing tells Mum how many grey sets or big cases are left, or which colours sell fastest.
2. **No unit price or discount.** The same set sells for 2,200, 2,500 or 2,600. Did a discount happen or are they different products? We can't tell.
3. **No M-Pesa codes.** Lines can't be reconciled with the M-Pesa statement, so missing money can't be traced.
4. **Debts are scattered.** To find what Lily Collection owes you have to read every page for asterisks.
5. **Goods out on approval are invisible.** "BS 60 — 9 cases — Returned" tells us they came back, not how many went out or what is still out there.
6. **No daily total by method.** One cash count in three weeks; no day-end check of cash + Send money + Paybill against what was written.
7. **No record of who served.**
8. **Corrections overwrite the record** (crossings out), so you can't see what changed and why.
9. **No cost, so no profit.**

## 4. Gap analysis: system today vs what the book needs

| Need from the book | System today (M1) | Gap |
|---|---|---|
| Sell finished goods (sets, pieces, cases, pillows, rods, holders) | `stock_items`: name, unit, integer qty, cost, ledger. Described as "hangers, trims, lining". No selling price, category or colour | **Big.** Need a **product catalogue** with category, colour/variant, unit (set/piece/pair/metre), asking price and stock |
| Sell fabric by the metre | Rolls with cm ledger; `sale` movement kind exists | No sale document posts it yet |
| Record a sale fast at the counter | — | **Missing.** Counter sale: basket of lines, customer optional |
| Payment methods incl. split and credit | — | **Missing.** Payments table: method, amount, M-Pesa code, phone; "on account" for credit |
| Customers / trade accounts | — | **Missing.** Walk-in default; named accounts with price tier, phone, stall/location, credit balance |
| Credit and settling later | — | **Missing.** Customer account ledger: charges, payments, balance; debtor list |
| Returns | Ledger kind `return` exists | **Missing** return document linked to the original sale or approval issue |
| Goods out on approval / consignment | — | **Missing.** Issue goods to an account → they come back or become a sale |
| Deposits and balances on custom orders | Planned (doc 07) | **Missing.** Needed, but simpler than the full workroom flow first |
| Services (adjustment) | — | Non-stock product type |
| Day-end close | — | **Missing.** Expected totals per method vs counted cash |
| Staff attribution / audit | Users, roles, permissions, audit events | Done. Reuse for "served by" on every sale |
| Workroom (cut/sew/inspect) | Planned | Keep it planned. The book shows it is not the daily pressure point |

## 5. Recommended changes to the plan

### Re-order the milestones

The current order is *customers/orders → workroom → counter sales/payments → M-Pesa*. The book points to:

1. **M2 — Products + Counter sale + Payments + Customers** (the book replacement)
   - Product catalogue for finished goods: category → item → colour/variant, unit, asking price, stock. Curtains come as **window set** and **door curtain**. Extend `stock_items` rather than building a parallel table.
   - **Sew into stock**: a tailor records roll metres used and the finished sets, doors and cases produced. The roll goes down, the shelf stock goes up, and the tailor is credited. The curtains and cases are sewn in the shop, so without this the stock figures would be wrong from day one.
   - Counter sale screen on the phone: pick category → colour → qty, asking price pre-filled; staff type the agreed price, with a hint showing what this customer paid last time → customer (default *Walk-in*) → payment(s) → done. Target: faster than writing a book line.
   - Payments: Cash / Send money (0712 403 671) / Paybill 492438 / On account. M-Pesa code captured for both M-Pesa methods. Split tender allowed.
   - **Day book view** that looks like Mum's page: Name · Item · Qty · Mode · Amount, grouped by basket, with **totals per payment method** at the bottom. She keeps the format she knows and gets the sums for free.
2. **M3 — Trade accounts, credit, returns and approvals**
   - Customer accounts with stall code, phone and optional credit limit. There are no price tiers, because every price is bargained.
   - "To pay" becomes **On account**; settle later with a payment (any method) against the account. Debtors list with oldest debt first.
   - **Goods on approval**: issue items to an account, then return them or convert them to a sale. A screen shows "out with BS 60: 9 cases, 4 days".
   - Returns linked to the original sale or issue, back into stock, with a refund or account credit.
   - Day-end close: expected cash vs counted, M-Pesa totals, notes; corrections only by reversal.
3. **M4 — Custom orders (light)**: customer + lines (fabric metres, sets, sheer, services) + due date + deposit/balance + status (taken → in work → ready → collected). Connect to the doc-07 workroom later.
4. **M5 — M-Pesa Daraja** (auto-match Paybill 492438 payments through I&M's payment notifications or a statement import, depending on what I&M offers; Send money stays manual with the M-Pesa code), then **workroom** depth if Mum wants it.

### Design rules that come from the book

- **A customer is optional.** Walk-in is the default; never block a sale for a name or phone.
- **Price is a suggestion, not a lock.** Every sale is bargained (confirmed by Mum). Store the asking price and the agreed price, and report the difference.
- **Units are words staff already use:** set, piece, pair, metre, complete. A curtain **set = one window**; the **"half" = the door curtain** (see section 6). "1 set & half" is entered as two lines: 1 window set + 1 door curtain.
- **Colour is first-class** for curtains, kitchen curtains, holders and rods. It drives stock checks and "what sells" reports.
- **Every line belongs to a basket** (sale), so braces and hand-written sums disappear.
- **Mixed payment in one basket** must be one tap, not a workaround.

### Reports Mum gets that the book can't give

- Today / this week: takings by method, by staff, by category.
- Best-selling items **by colour** (grey, beige, cream and off-white already look dominant).
- Low stock by item + colour.
- Who owes what, and goods out on approval.
- Below-list-price sales.
- Gross margin, once costs are entered.

## 6. Answers from Mum (22 November 2026)

| Question | Answer | What it changes |
|---|---|---|
| What do "set" and "half" mean? | **1 set = 1 window**, 2 sets = 2 windows, and so on. **The "half" is always the door.** "1 set & half" = one window + one door. | Curtains have two saleable forms: **window set** and **door curtain**. The counter screen offers both as separate buttons, so "& half" becomes a line of its own. Reports can count windows and doors separately. |
| Sewn in the shop or bought ready? | **Curtains and cases are sewn in the shop.** | Rolls matter every day, not only for custom orders. Most sewing is **making stock for the shelf** (a roll becomes N grey window sets + doors + cases), not one customer's job. We need a simple **"sew into stock"** flow: roll metres out, finished products in, credited to the tailor. This comes before the full custom-order workroom. |
| Is the trade price fixed? | **No. There is always bargaining.** | No price tiers. Each product has one **asking price**; staff type the agreed price. The system shows **what this customer paid last time** as a hint, and reports how far sales go below the asking price. |
| Payment numbers | **Send money → 0712 403 671. Paybill → 492438.** | Payment methods become *Cash*, *M-Pesa — Send money (0712 403 671)*, *M-Pesa — Paybill 492438*, *On account (to pay)*. Send money to a phone line cannot be matched automatically through Daraja; staff type the M-Pesa code. Paybill can be matched automatically later **if** the shop controls it (see Q5 below). |

### Answers from Mum (25 November 2026)

| Question | Answer | What it changes |
|---|---|---|
| How long may shops keep goods on approval? | **One week at most.** | Each approval gets a due date 7 days out; anything still out after that is flagged overdue on the approvals list and the dashboard. |
| Are expenses paid from the drawer? | **Yes, there are expenses.** | Expenses (transport, tailor pay, food…) are recorded with how they were paid; cash ones come off the cash the drawer should hold at closing. |

## 7. Still open

1. **Plain "M-Pesa" lines in the book**: is that the same as Send money to 0712 403 671, or a different number or till?
2. **Paybill 492438 is issued through I&M Bank** (answered 22 Nov). It is not I&M's main 542542, so it looks like a dedicated collection short code that settles into the shop's I&M account. Ask the I&M relationship manager:
   - Can **instant payment notifications** for 492438 be sent to our server (a webhook/callback URL)? What fields come with them (M-Pesa code, amount, payer phone and name, account reference, time), and is there a test environment?
   - If not, can we **download a statement** of 492438 collections (CSV/Excel) daily, or get API access to it?
   - Does the shop get **M-Pesa org portal** access for 492438? Can it be registered on Safaricom Daraja for C2B or STK Push (prompting the customer's phone), or does I&M keep control of it?
3. Do BS 60, BM 19, Lily Collection and others take goods **on sale-or-return**? How long can they keep them, and when do they pay?
4. Does she **count cash** at closing every day? Are expenses (transport, tailor pay, lunch) paid from the drawer?
5. Cases at **220 vs 250 vs 350**: is 350 a bigger size, or just bargaining?
6. **"Complete"** pillow, **bowtie**, **knot pillow**: what exactly is each, and is "complete" pillow + case?
7. Sheer **with rings vs without rings**: does the price differ? Is a sheer for a door also a "half"?
8. What was **"invent" (250)**?
9. Do business buyers (e.g. Uprop, G34) need a **receipt or invoice**? With KRA PIN / eTIMS?
10. How often do **custom metre orders** with deposits happen, and how long until collection?
11. Is a door curtain always a **single piece**? Are window sets always the **same standard size**, or sewn to different drops?
12. Who sews, and are they **paid per piece**? If so, the "sew into stock" record can also give the tailor's pay sheet.
15. **Custom orders:** is a deposit taken on every order, and how much (half, or whatever the customer gives)? The system currently accepts any deposit, or none.
16. How long does a custom order usually take? New orders default to ready in one week.
17. Does the shop deliver and fit curtains at the customer's home, and how is that charged? For now it is a priced "work" line on the order.

