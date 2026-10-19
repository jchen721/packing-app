# Ace Collectibles Packing & Inventory Platform

[![CI](https://github.com/jchen721/packing-app/actions/workflows/ci.yml/badge.svg)](https://github.com/jchen721/packing-app/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)
![Tests](https://img.shields.io/badge/tests-133%20passing-brightgreen)

A production-oriented warehouse operations application that converts large order-PDF batches into verified, worker-ready packing files and auditable inventory transactions.

This project began as a PDF sorter and evolved into a shared packing and inventory platform used across a macOS development machine and a Windows warehouse computer. It demonstrates workflow automation, PDF parsing, deterministic business rules, distributed duplicate protection, transactional Google Sheets updates, audit history, and failure-safe recovery.

> Customer PDFs, generated outputs, service-account credentials, environment files, and live operational data are intentionally excluded from this repository.

## What the system does

```mermaid
flowchart LR
    A[Upload order PDFs] --> B[Parse labels, slips, products, and quantities]
    B --> C[Select exact physical box]
    C --> D[Group and sort worker PDFs]
    D --> E[Verify every input and output page]
    E --> F[Create audited packing batch]
    F --> G[Manager reviews proposed deductions]
    G --> H[Explicit confirmation]
    H --> I[Google Sheets inventory and history]
```

### Packing automation

- Processes multiple order PDFs in one run.
- Supports multiple packing-slip formats and physical quantity multipliers.
- Preserves shipping-label and packing-slip pairing.
- Selects exact physical boxes through deterministic product-type and quantity rules.
- Consolidates exact sizes into a smaller worker-friendly PDF set.
- Sorts orders by Buyer Nickname, falling back to Buyer ID.
- Generates a printable ZIP containing PDFs only—never private audit JSON.
- Routes unsupported combinations to `Needs Review` rather than guessing.

### Verification and auditability

- Verifies expected page counts and detects missing or duplicate output pages.
- Refuses to update the picking checklist when verification fails.
- Creates a stable packing batch ID and immutable run manifests.
- Stores the exact order, grouping, verification, summary, and inventory-usage data required to audit a run.
- Removes temporary uploaded PDFs after processing.

### Inventory operations

- Uses Google Sheets as the editable operational source of truth.
- Shows current quantity, proposed change, and resulting quantity before confirmation.
- Deducts packing supplies only after explicit manager confirmation.
- Receives existing inventory items through a preview-and-confirm workflow.
- Records every movement with timestamp, transaction ID, before/after quantities, reason, and user.
- Supports audited manager reversal of complete deduction or receipt transactions.
- Detects direct spreadsheet quantity edits and records reconciliation history.
- Optionally sends Gmail low-stock alerts when a confirmed deduction crosses a threshold.

### Multi-computer safety

- Shared `Packing Batches` records prevent repeated deductions across computers.
- Shared inventory locks serialize deductions, receipts, reversals, and corrections.
- Local audit records provide a fallback without replacing shared protection.
- A controlled corrected-rerun workflow handles rule corrections after inventory has been manually restored.
- Google Sheets must succeed before a batch is marked confirmed.

### Worker tools

- A separate worker screen displays batch orders.
- Workers can record start, completion, and issue events.
- Activity includes worker, order, buyer, packing group, and timestamp.
- Worker actions never mutate inventory.

## Engineering highlights

| Area | Implementation |
| --- | --- |
| PDF pipeline | `pdf-parse` extraction, `pdf-lib` assembly, label/slip pairing, page verification |
| Box engine | Deterministic product classification and quantity-aware packing rules |
| Backend | Node.js 24+, Express 5, Multer uploads |
| Shared operations | Google Sheets API with schema validation and shared locks |
| Audit model | Stable batch IDs, per-run manifests, immutable inventory history |
| Duplicate protection | Batch-level and order-level protection across computers |
| Optional persistence | Supabase structured-record mirror with Google Sheets remaining primary |
| Notifications | Nodemailer/Gmail low-stock alerts |
| Quality | 133 automated tests plus syntax and unsafe-interface checks |
| Security | Server-only credentials, ignored private data, safe DOM rendering, upload cleanup |

See [System Architecture](docs/ARCHITECTURE.md) for component boundaries, transaction guarantees, and design tradeoffs.

## Worker-facing output

The rules engine preserves exact physical box decisions internally while consolidating output into a manageable set of files:

- `6_Box.pdf`
- `8x8x4.pdf`
- `8x8x8.pdf`
- `11_Box.pdf`
- `13_Box.pdf`
- `16_Box.pdf`
- `24_Box.pdf`
- `Packs_Only.pdf`
- `Sleeved_Packs.pdf`
- `Needs_Review.pdf`

This separates operational precision from worker simplicity: the inventory system retains exact box usage while warehouse staff handle fewer print groups.

## Shared Google Sheets model

| Tab | Responsibility |
| --- | --- |
| `Inventory` | Pokémon product catalog and current quantities |
| `Box Inventory` | Packing supplies, thresholds, reorder amounts, and unit costs |
| `packing List` | Physical picking totals and worker checklist |
| `Packing Batches` | Cross-computer duplicate protection and batch state |
| `Packing Activity` | Worker start, completion, and issue events |
| `Inventory History` | Immutable deductions, receipts, corrections, and reversals |
| `Inventory Locks` | Shared serialization of inventory mutations |

The current controlled rollout automatically deducts packing supplies. Pokémon product quantities remain visible for picking and audit but are not automatically deducted.

## Local setup

### Requirements

- Node.js 24 or newer
- A Google Cloud service account with access to a dedicated operations spreadsheet
- Optional Supabase project for structured-record mirroring
- Optional Gmail app password for low-stock notifications

### Install

```bash
git clone git@github.com:jchen721/packing-app.git
cd packing-app
npm install
cp .env.example .env
```

Populate `.env` locally. Never commit `.env`, Google credentials, or Supabase secrets.

Validate or create the required spreadsheet schema:

```bash
npm run setup:sheets
```

Start the application:

```bash
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Quality checks

```bash
npm run check
npm test
```

The test suite covers box selection, PDF grouping, verification, inventory usage, receipts, reconciliation, transaction reversal, duplicate confirmation prevention, recovery behavior, worker tracking, Google Sheets schema compatibility, Supabase compatibility, storage safety, and unsafe DOM-sink prevention.

GitHub Actions runs the same checks on every push and pull request.

## Operational deployment

Application code is distributed through GitHub. Shared warehouse state lives in Google Sheets.

```text
macOS development machine ── git push ──> GitHub
                                              │
                                              └── git pull ──> Windows warehouse computer

Both computers ───────────── shared operations ─────────────> Google Sheets
```

Machine-local `.env` and Google credential files are installed separately and never travel through Git.

## Safety boundaries

- Uploading PDFs never deducts inventory automatically.
- Unknown product combinations remain in `Needs Review`.
- Exact duplicate confirmations are blocked.
- Inventory history is append-only; undo creates a new reversal record.
- Failed history writes trigger quantity rollback.
- Uncertain shared operations are left for manual review instead of being silently retried.
- Supabase is an optional mirror; Google Sheets is updated first.
- Product aliases are manager-approved before they affect operational totals.

## Current scope

Active areas are packing automation, packing-supply inventory, receiving, transaction history and undo, worker tracking, low-stock notification support, and optional Supabase mirroring.

Livestream analytics, TikTok API integration, AI set building, and inventory forecasting were intentionally postponed so the warehouse could deploy a smaller and safer operational core first.

## Project documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Packing rules](PACKING_RULES.md)
- [Project context](PROJECT_CONTEXT.md)
- [Change log](CHANGELOG.md)
- [Repository safeguards](AGENTS.md)
