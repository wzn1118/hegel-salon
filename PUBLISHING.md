# GitHub Publishing Notes

This folder is prepared as a public-source snapshot of Hegel Salon.

## What has been removed

- real API keys
- real SMTP credentials
- user databases and sessions
- email verification records
- uploaded files
- browser-agent profile/state
- local Android machine config
- local corpus bundles and private PDFs

## Before pushing

1. Create a new GitHub repository.
2. Copy the contents of this folder into that repository.
3. Run `npm install`.
4. Configure your own local files:
   - `config/api.local.json`
   - `config/mail.local.json`
5. Keep runtime state untracked as defined in `.gitignore`.

## Recommended first-run flow

```bash
npm install
npm run start
```

Then open:

```text
http://127.0.0.1:3087/
```

## Notes

- `config/api.json` is intentionally blank.
- `config/mail.json` is an example template, not a live credential.
- `local-resources/` is a placeholder only.
- `data/` is a runtime-only directory and should remain uncommitted.
