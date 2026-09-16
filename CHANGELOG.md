# Packing App Change Log

This file records important behavioral and architectural decisions. It is not a replacement for Git history.

## 2026-09-16

- Corrected the manager's `1 poster // eliminate` instruction: `11x11x3` is not stocked, and a single poster now uses `11x11x5`.
- Kept the retired `11x11x3` inventory mapping only to block stale batches safely; affected PDFs must be reprocessed before confirmation.

## 2026-09-15

- Prepared the first box-only inventory rollout without enabling permanent writes.
- Added a shared `Box Inventory` tab schema and an idempotent catalog seeder using the owner-provided vendor sizes, item numbers, reference order quantities, and unit costs.
- Kept starting quantities blank so vendor purchase quantities cannot be mistaken for physical warehouse counts.
- Made packing confirmation select only box deductions in the current rollout while preserving complete product and box usage in every batch audit manifest.
- Added an explicit physical-count-required state.
- Added the approved long-product rule: 24-series product alone uses 24x12x4; adding one or more ETBs uses 24x12x6. Both remain in the existing worker-facing `24_Box.pdf`. ETB-only 5+ orders remain unresolved for exact inventory sizing.
- Simplified `Box Inventory` to item, quantity, low-stock level, reorder amount, unit cost, and notes. Removed redundant dimensions, vendor item, reference order quantity, and starting-count status columns.
- Added optional Gmail low-stock alerts after a confirmed box deduction crosses its configured threshold. Email failures are returned as warnings and never change the completed inventory transaction.
- Added the manager-provided initial box quantities, including packing-supply unit conversions for 1,500 bubble mailers and 1,750 bubble-wrap pieces.
- Added one bubble-mailer deduction per verified Packs Only order and bubble-wrap usage of 2 per ETB, 1 per tin, 3 per SPC, 4 per UPC, and 4 per approved Blooming Waters-sized long product.
- Stopped read-only batch, worker, and inventory screens from recreating optional Google Sheet tabs that the owner removed.
- Applied the manager's revised physical-box chart: Japanese Booster Box `8x8x4`, poster sizes from `11x11x3` through `11x11x9`, four/five ETBs `12x12x12`, six ETBs `16x12x8`, quantity-aware UPC/collection rules, and the two-Victini `13x10x4` exception.
- Preserved named oversized collection exceptions and routed unsupported collection/ETB/UPC quantities to `Needs Review`.
- Added exact inventory deductions for `11x11x3`, `12x12x12`, and `16x12x12`, while consolidating `12x12x12` into the existing `11_Box.pdf` worker workflow.
- Expanded Pokémon Day-sized behavior to First Partner Series 2 and Series 3, including multi-quantity orders, and classified Legendary Warriors plus Unova Heavy Hitters in the Blooming Waters-sized 24-inch family.
- Recorded owner approval for the live box-only inventory rollout and changed the safe environment template to enable deductions only after explicit batch confirmation.

## 2026-08-27

- Added permanent `PROJECT_CONTEXT.md` and `PACKING_RULES.md` documentation so future Codex tasks do not depend on old chat history.
- Added repository instructions requiring future agents to read the context and rules before changing packing behavior.
- Documented that exact physical box estimates must not create additional worker-facing PDFs.
- Documented the pending `7x5x5` slab box without guessing its product or capacity rules.
- Documented that the current implementation recognizes standard Booster Bundles generically, including Pitch Black.
- Kept Booster Boxes in `Needs Review` until an exact physical-box capacity rule is approved.
- Kept permanent inventory writes disabled pending a verified warehouse starting count.
- Recorded the future requirement for box-supply forecasting and a Monday low-stock report without activating it.
- Recorded that each order receives one box classification rather than multiple shipping boxes.
- Recorded that corrected or regenerated PDFs are new packing events while exact duplicate-batch confirmation protection remains.
- Defined the first supply forecast as an estimate; exact worker box substitutions do not need to be recorded.
- Added First Partner Illustration/Series 3 Collection to the Pokemon Day-sized 8x8x4 behavior.
- Added a temporary 7x5x5 rule for one standard Booster Box while keeping mixed/multiple Booster Box and Booster Display orders in Needs Review.
- Consolidated 7x5x5 orders into the existing small-box worker PDF while retaining the exact box internally for supply estimates.
- Added Ascended Heroes Focused Fighters Premium Collection to the 24 Box family.
- Removed unused root-level sample/output files and legacy one-off scripts before the warehouse deployment.
- Removed the obsolete inventory-usage fallback that read root JSON; inventory usage now comes only from the selected batch manifest.
- Added ignore rules preventing sample PDFs, local Excel inventory copies, root JSON exports, temporary files, and the unrelated rent portal from entering packing-app commits.
- Changed the downloadable worker ZIP to contain printable grouped PDFs only while preserving batch audit JSON internally.
- Added regression coverage proving internal JSON is excluded from worker ZIPs and physical item totals create unchecked Google Sheets checklist rows.
- Canonicalized TikTok spelling variants before writing the packing checklist and inventory usage, including First Partner Series 3, Random Chinese/CN booster packs, and Pitch Black booster packs.
- Documented a safe learning model where AI proposes new aliases but managers approve them before inventory rows are merged.

## Prior decisions preserved

- Mega Zygarde uses the 16-series family.
- Random Booster Pack aliases combine for inventory usage.
- Ascended Heroes Mega Emboar aliases combine for inventory usage.
- Lumiose tin aliases combine for inventory usage.
- Packing batches retain stable manifests and require explicit inventory confirmation.
- Google Sheets remains the editable operational source of truth; Supabase may mirror structured records.
