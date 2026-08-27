# Ace Collectibles Packing App Instructions

Before changing this repository, read these files completely:

1. `PROJECT_CONTEXT.md`
2. `PACKING_RULES.md`
3. `CHANGELOG.md`

`PACKING_RULES.md` is the authoritative functional specification for packing behavior. `PROJECT_CONTEXT.md` describes the current implementation and its operational safety boundaries. The specification may describe approved behavior that has not been implemented yet; inspect the code and tests before claiming a rule is active.

## Non-negotiable safeguards

- Preserve multiple-PDF upload, parsing of old and new slip formats, physical quantity multipliers, label/slip pairing, Buyer Nickname sorting, grouped PDF generation, verification, Google Sheets picking-list updates, ZIP generation, batch review, duplicate protection, worker tracking, and inventory confirmation safeguards.
- Do not change worker-facing PDF grouping merely to track exact physical box consumption. Exact box usage can be retained internally while the existing consolidated PDFs remain unchanged.
- Do not guess unsupported product combinations. Use `Needs Review` until the owner supplies an approved real-world rule.
- Prefer product-type rules over Pokémon set-name rules. Add narrowly scoped named exceptions only for products with a genuinely different physical size.
- Explain conflicts before replacing an existing approved rule.
- Do not enable permanent inventory writes until the warehouse starting quantities have been verified and the owner explicitly requests activation.
- Never commit `.env`, Google service-account credentials, Supabase secrets, uploaded PDFs, generated packing output, or other private operational data.
- Preserve unrelated user files and changes. Do not stage the entire repository blindly.

## Required verification for packing changes

Run:

```bash
npm run check
npm test
```

Add focused regression tests for each newly approved product classification or box combination. Report the files changed, the behavior added, any unresolved ambiguity, and the test results.
