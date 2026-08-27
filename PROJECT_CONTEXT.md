# Ace Collectibles Packing App — Project Context

Read this document and `PACKING_RULES.md` before modifying the project.

## Purpose

This is the Ace Collectibles warehouse packing application. It processes large batches of Pokémon/e-commerce order PDFs and reduces manual sorting and packing mistakes.

The core workflow is:

1. Upload one or more source PDFs.
2. Parse each order and preserve its shipping-label/packing-slip pair.
3. Parse product names, PDF quantities, and physical quantity multipliers.
4. Classify products and choose an exact physical shipping box.
5. Consolidate exact boxes into the existing worker-facing PDF groups.
6. Sort orders by Buyer Nickname within each group, falling back to Buyer ID.
7. Generate grouped PDFs and verify that pages are neither lost nor duplicated.
8. Generate physical item totals and update the Google Sheets picking checklist only after verification succeeds.
9. Save an auditable packing batch and provide a downloadable worker ZIP containing only printable grouped PDFs.
10. Review proposed inventory usage separately from PDF processing.

Reliability is more important than forcing every unfamiliar combination into a box. Unsupported combinations belong in `Needs Review`.

## Current worker-facing PDF workflow

Do not create extra PDFs simply because the application learns more exact physical box sizes. The consolidated output reduces printing and handling mistakes for warehouse workers.

Current mapping:

| Exact internal result | Worker PDF |
| --- | --- |
| `6x6x6` | `6_Box.pdf` |
| `8x8x4` | `8x8x4.pdf` |
| `8x8x8` | `8x8x8.pdf` |
| Any approved `11x...` box | `11_Box.pdf` |
| Any approved `13x...` box | `13_Box.pdf` |
| Any approved `16x...` box | `16_Box.pdf` |
| 24-series | `24_Box.pdf` |
| Packs Only | `Packs_Only.pdf` |
| Sleeved Packs | `Sleeved_Packs.pdf` |
| Needs Review | `Needs_Review.pdf` |

Exact box decisions should remain available internally for auditing and future supply estimation.

## Quantity rules

The packing slip's line quantity is not always the physical quantity. For example, a line named `2x Booster Pack` with PDF quantity `3` represents six physical packs.

- `pdfQty` is the quantity printed on the slip.
- `physicalQty` is the real number of units the warehouse must pick.
- Google Sheets picking totals and inventory usage must use physical quantities.

Do not casually replace the current parser. It supports multiple packing-slip formats and price placement patterns.

## Verification boundary

Every input order normally contains two pages: one shipping label and one packing slip. They must always move together.

A batch is not successful until page verification confirms expected input/output counts and no missing or duplicate pages. If verification fails:

- throw a clear error;
- do not update the Google Sheets picking list;
- do not present the run as completed.

## Packing batches and inventory review

Each successful processing run creates a stable packing batch and stores audit manifests in that run's output directory. The downloadable worker ZIP contains only grouped PDFs that need to be printed. Internal JSON files remain in the private run directory for review, duplicate protection, and auditing, and do not belong in the worker ZIP.

Uploading PDFs does not automatically deduct inventory. The manager reviews the batch's products, exact boxes, and proposed deductions before confirmation. Confirmation must prevent duplicate deductions and must not mark a batch completed if the authoritative Google Sheets transaction fails.

The application currently defaults to packing-only safety mode:

```env
INVENTORY_WRITES_ENABLED=false
```

Keep it disabled until Ace has verified the warehouse's starting inventory and the owner explicitly requests a controlled activation test.

## Current shared data

Google Sheets is the editable operational source of truth for:

- `Inventory`
- `Warehouse Supplies`
- `packing List`
- `Packing Batches`
- `Packing Activity`
- `Inventory History`
- `Inventory Locks`

The manager interface does not rename catalog items or set the initial baseline. Those values are maintained directly in the appropriate Google Sheet. The application validates item names before a future confirmed receipt or deduction.

Supabase is optional and currently serves as a mirror for structured operational records. Google Sheets is written first. Supabase file-storage mirroring is intentionally disabled when only records are needed. Do not expose or commit credentials.

## Active application areas

- **Packing:** PDF upload, parsing, verification, box selection, batch review, grouped PDFs, ZIP download, and proposed inventory usage.
- **Inventory:** read current products and supplies; receipt and reconciliation endpoints exist but permanent writes are blocked while packing-only mode is active.
- **Worker screen:** shows batch orders and records worker start/done/issue activity. It does not generate files or change inventory.

Livestream analytics, TikTok synchronization, set building, forecasting, and AI tools are not active. Do not restore or expand them unless the owner starts a separate requested phase.

## Important files

- `server.js` — HTTP routes, upload lifecycle, batch review, inventory safety gates, and worker activity.
- `pdfProcessor.js` — parsing, quantities, order pairing, grouping, sorting, verification, output PDFs, picking-list update, and ZIP creation.
- `boxEngine.js` — product classification and exact box selection.
- `batchService.js` — stable batch manifests and batch files.
- `buildInventoryUsage.js` — product alias normalization and per-batch product/box usage.
- `pickingChecklist.js` — Google Sheets picking checklist update.
- `googleInventoryManager.js` — inventory reads, shared locks, history, and confirmed mutations.
- `googleBatchRegistry.js` — shared batch duplicate protection.
- `googleWorkerTracker.js` / `workerTracker.js` — worker activity.
- `googleSheetsSchema.js` / `setupGoogleSheets.js` — required shared tab schemas.
- `public/index.html` — manager interface.
- `public/worker.html` — worker activity interface.
- `test/` — automated regression coverage.

## Current packing-rule status

`PACKING_RULES.md` is the authoritative rule specification, but not every desired rule in it is necessarily implemented. Always compare it with `boxEngine.js`, `pdfProcessor.js`, and tests before changing behavior.

Known current facts as of 2026-08-27:

- Standard names ending in `Booster Bundle` are recognized through a generalized rule and use the current small-item category. This includes Pitch Black and future normal set names.
- One standard Booster Box is temporarily assigned `7x5x5` because the preferred `7x4x3` supply is unavailable. Multiple Booster Boxes, mixed Booster Box orders, and Booster Display products remain in `Needs Review` until capacity rules are approved. The exact `7x5x5` result is consolidated into the existing small-box worker PDF rather than creating another PDF.
- First Partner Illustration Collection / First Partner Series 3 Collection uses the approved Pokemon Day-sized box behavior: one collection uses `8x8x4`.
- Ascended Heroes Focused Fighters Premium Collection uses the same `24 Box` family as Blooming Waters 151 and Paldean Fates Great Tusk.
- Mega Zygarde is currently in the 16-series large-premium family by explicit owner direction.
- Product aliases for Random Booster Packs, Ascended Heroes Mega Emboar boxes, and Lumiose tins are normalized for inventory usage.
- Slab capacity and mixed-order rules remain unresolved. Do not assign slabs to `7x5x5` merely because that box is now approved for one standard Booster Box.
- The owner is currently testing real `Needs Review` orders and will provide the correct physical box for each approved example.

## Future supply forecasting requirement

Future exact-box rules are also intended to estimate packing-supply consumption without changing worker PDF grouping. After verified starting quantities are available, a later phase may:

- subtract confirmed estimated box usage;
- compare remaining quantities with manager-defined minimums;
- calculate average usage and estimated days remaining;
- generate a Monday packing-supply report;
- use AI only to explain deterministic calculations and risks.

This automation is not active and should not be implemented until starting counts, thresholds, recipient, schedule, and remaining box rules are provided.

### Owner clarifications for future estimates

- A corrected or regenerated order PDF is considered a new packing event. Preserve protection against accidentally confirming the exact same packing batch twice, but do not assume that a later corrected event is invalid merely because it refers to a previous order.
- A single order does not require multiple shipping boxes for the purposes of this packing engine. The engine should continue assigning one exact physical box classification per order.
- Worker substitutions do not need to be captured with exact accounting for the first forecasting version. Estimated box consumption is sufficient because the goal is to warn the manager early enough to reorder supplies, not to provide a perfect perpetual count.
- Periodic physical counts can reset estimation drift caused by damaged boxes, substitutions, or other real-world differences.
- No new partial-overlap behavior is requested for PDFs containing a mixture of previously seen and new orders. Preserve the current batch safeguards unless the owner later defines a different workflow.

## Safe development workflow

Before changing packing logic:

1. Read `PACKING_RULES.md`, `boxEngine.js`, and the relevant parts of `pdfProcessor.js` completely.
2. Compare the requested real-world rule with existing rule precedence.
3. Preserve all approved combinations and the worker-facing PDF mapping.
4. Prefer generalized product-format recognition over Pokémon set-specific names.
5. Use `Needs Review` when an exact combination is not approved.
6. Add regression tests.
7. Run `npm run check` and `npm test`.
8. Explain every meaningful behavior change and unresolved ambiguity.

Development is performed on the Mac and the production warehouse computer runs Windows. GitHub distributes code; Google Sheets shares operational data. Machine-local secrets must be installed separately and never committed.
