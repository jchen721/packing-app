# Security Policy

## Protected data

This repository must never contain:

- customer order PDFs or shipping labels;
- generated packing outputs or batch manifests;
- Google service-account credentials;
- `.env` files or Gmail app passwords;
- Supabase server secrets;
- live spreadsheet exports or other private operational data.

The application keeps credentials server-side, removes temporary uploads after processing, avoids unsafe HTML insertion, and excludes private runtime files through `.gitignore`.

## Reporting a vulnerability

Please report security issues privately to the repository owner instead of opening a public issue. Include the affected component, reproduction steps, potential impact, and any suggested mitigation.

Do not include customer data, credentials, or live operational records in a report.

## Supported version

The current `main` branch is the supported version. Security fixes should preserve packing verification, explicit inventory confirmation, shared locking, duplicate protection, and append-only inventory history.
