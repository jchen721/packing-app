# Ace Collectibles Packing & Inventory

This application now has two active manager areas:

1. **Packing** — upload order PDFs, extract and verify orders, select box sizes, generate grouped PDFs and a ZIP, update the packing list, review the exact inventory usage, and explicitly confirm deductions.
2. **Inventory** — read current Pokémon products and warehouse supplies from Google Sheets, receive existing catalog items with confirmation, and view recent inventory changes.

The worker packing screen remains available at `/worker.html` and continues to record shared packing activity.

By default the application starts in **packing-only mode**. PDF processing, grouped packing files, ZIP generation, packing-list updates, batch manifests, and worker tracking remain active, while permanent inventory additions, deductions, receipts, and reconciliations are blocked at the server.

Keep this setting until the verified warehouse starting count is complete:

```env
INVENTORY_WRITES_ENABLED=false
```

After the starting count and a controlled confirmation test, set it to `true` and restart the server.

Livestream analytics, TikTok synchronization, set planning, forecasting, product research, and AI tools are not active. Their pre-simplification source is recoverable from the dated checkpoint in `.checkpoints/` if Ace chooses to revisit them.

## Source of truth

Google Sheets remains the editable source of truth for current inventory:

- `Inventory`
- `Warehouse Supplies`
- `packing List`
- `Packing Batches`
- `Packing Activity`
- `Inventory History`
- `Inventory Locks`

The manager interface intentionally does not edit catalog names or starting quantities. Add or correct those directly in the appropriate Google Sheet tab. Confirmed packing deductions and confirmed receipts create Inventory History records automatically.

Supabase can retain a shared mirror of inventory, inventory history, packing batches, orders, and worker activity. Google Sheets is still updated first. Supabase PDF/ZIP storage should remain disabled when Supabase is used for records only.

## Configuration

Copy `.env.example` to `.env` and configure the existing values without committing credentials.

Important settings:

| Setting | Purpose |
| --- | --- |
| `GOOGLE_SPREADSHEET_ID` | Operations spreadsheet |
| `GOOGLE_CREDENTIALS_FILE` | Server-only Google service-account file |
| `PORT` / `HOST` | Local server address |
| `MAX_UPLOAD_FILES` | Maximum PDFs in one processing request |
| `SUPABASE_*` | Optional shared record mirror |

Keep these values for record-only Supabase use:

```env
SUPABASE_DATABASE_MIRROR_ENABLED=true
SUPABASE_STORAGE_MIRROR_ENABLED=false
SUPABASE_AUTH_ENABLED=false
```

Never place a Google private key or Supabase secret in browser JavaScript or commit it to Git.

## Run

```bash
npm install
npm run check
npm test
npm start
```

Open `http://127.0.0.1:3000/`.

Validate or safely create only the required packing/inventory Sheet tabs:

```bash
npm run setup:sheets
```

Verify and synchronize the optional Supabase record mirror:

```bash
npm run check:supabase
npm run sync:supabase
```

## Packing safety

- Uploaded temporary PDFs are removed after processing.
- Downloaded worker ZIPs contain only the grouped PDFs that need to be printed; audit JSON remains in the private batch run directory.
- Every run saves batch manifests inside its output directory.
- Inventory is never deducted automatically after upload.
- Confirmation validates current Google Sheets quantities.
- Stable batch and order records prevent repeated deductions across computers.
- Google Sheets must succeed before a batch is marked confirmed.
- Supabase mirror failures do not undo a successful Google Sheets transaction; the mirror can be synchronized again.
