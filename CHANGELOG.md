# Packing App Change Log

This file records important behavioral and architectural decisions. It is not a replacement for Git history.

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

## Prior decisions preserved

- Mega Zygarde uses the 16-series family.
- Random Booster Pack aliases combine for inventory usage.
- Ascended Heroes Mega Emboar aliases combine for inventory usage.
- Lumiose tin aliases combine for inventory usage.
- Packing batches retain stable manifests and require explicit inventory confirmation.
- Google Sheets remains the editable operational source of truth; Supabase may mirror structured records.
