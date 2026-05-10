# Chinese Corpus Sources

The Chinese corpus materials in this folder are整理自互联网上可公开访问的资料,
and are organized here as source-corpus materials for Hegel Salon.

Corpus scope:

- `texts/`: curated Chinese text整理 from public internet sources.
- `generated-texts/`: generated Chinese companion text for source-corpus use.
- `originals/`: source PDFs and ebook files collected from public internet
  sources, stored with Git LFS.
- `manifest.json`, `generated-manifest.json`, `concept-ledger.json`: corpus
  metadata used by Hegel Salon.

Maintenance rules:

- Add new public Chinese corpus files only when the source and provenance are
  clear enough for public release.
- Put private or uncertain materials under `data/corpus/chinese/private/` or
  `local-resources/chinese/`; both are outside the public release path.
- Keep source URL, translator, edition, license/status, and provenance notes
  with future additions whenever that information is available.
