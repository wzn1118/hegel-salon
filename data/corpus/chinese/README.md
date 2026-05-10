# Chinese Corpus Placement

Use this folder for Chinese Hegel translations or Chinese OCR/text assets that
the repository operator has cleared for public GitHub redistribution.

Recommended layout when the material is public-release safe:

```text
data/corpus/chinese/
  texts/        Clean `.txt` or `.md` translation text.
  pdfs/         Redistributable PDF scans or born-digital PDFs.
  ocr/          OCR output derived from redistributable scans.
  metadata/     Source, edition, license, translator, and provenance notes.
```

If future material is private, licensed, purchased, classroom-only, or otherwise
not clearly redistributable, do not commit it here. Put it in:

```text
local-resources/chinese/
```

Then mount or copy it into a private deployment after cloning the repository.

Large binary source files such as PDF, EPUB, MOBI, and AZW3 are stored with Git
LFS. Text and metadata files are stored directly in Git.
