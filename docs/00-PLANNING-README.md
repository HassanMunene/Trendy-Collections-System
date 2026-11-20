# Trendy Collections — system planning pack

Prepared 18 October 2026 for a Kenyan curtain and home textiles business. The planning documents remain a working draft to review with the owner and staff.

## Build status

PHP and Composer are installed. Composer cannot reach Packagist from this Codex session, so the [working PHP + SQLite pilot](app/README.md) uses no external packages. It covers individual staff logins, fabric variants, roll balances, production attribution and simple sales. It now uses Trendy Collections' pink theme and has a separate superadmin Control center. It is a local pilot; the planned Laravel/PostgreSQL production architecture remains a later step. The `app-node-draft/` folder is an incomplete earlier draft and is not the app to launch.

**Product direction update:** the pilot proves stock arithmetic and now has the first order-workspace slice: multiple openings, item specifications, manual quoted prices and a printable workroom card. It does not yet carry that order through linked cutting, sewing, payment and collection. Read [the order-centred redesign](07-ORDER-CENTRED-REDESIGN.md) before adding more isolated features.

## Start here

1. [Product blueprint](01-PRODUCT-BLUEPRINT.md): what the system does, scope, business rules, and examples.
2. [Workflows](02-WORKFLOWS.md): diagrams and step-by-step stock, sewing, sale, and payment flows.
3. [Data model](03-DATA-MODEL.md): the main records, fields, and inventory calculations.
4. [Screens and mockup](04-SCREENS.md) and [interactive screen draft](screen-draft.html): what staff would use.
5. [Build plan](05-BUILD-PLAN.md): recommended stack, phases, timeline, and launch checklist.
6. [Questions for Mum](06-DISCOVERY-QUESTIONS.md): short decisions to validate before development.
7. [Order-centred redesign](07-ORDER-CENTRED-REDESIGN.md): comparison with specialist systems, the missing workflow, screens, data changes and acceptance example.

## The central idea

Every roll has its own identity, including colour, material type and texture. Every change in material or finished stock creates a traceable movement under the staff member's own login. A cut from a roll is allocated to a customer order, production job, direct fabric sale, or recorded waste/offcut. Production consumes material and creates a finished item. Selling that finished item reduces finished stock, without deducting the same fabric again.

## Terms to confirm

Confirmed with the business: **curtains are often custom-measured sets**, but a customer may buy **one curtain piece**, **shia separately**, or **a requested number of fabric metres**. A shia may accompany a curtain order but is not mandatory. **Cases** are pillow cases, and their fabric is stocked separately. We use “shia” as the shop term; confirm its exact fabric/finished form from a real sample. “Square lumper” remains an unconfirmed product name. The sample names, prices, stock counts and customers in the mockup are fictional.

## Sources checked

- [Safaricom M-PESA Express / STK Push](https://developer.safaricom.co.ke/apis/MpesaExpressSimulate)
- [Safaricom C2B Paybill/Till notifications](https://developer.safaricom.co.ke/apis/CustomerToBusiness)
- [Safaricom transaction status](https://developer.safaricom.co.ke/apis/TransactionStatus)
- [ODPC guidance for MSMEs](https://www.odpc.go.ke/wp-content/uploads/2025/11/ODPC-%E2%80%93-Guidance-Note-on-Processing-by-MSMEs.pdf)

These links support the integration and privacy notes in this pack. Safaricom onboarding requirements and commercial terms should be checked again when the business applies for production access.
