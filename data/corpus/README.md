# Corpus Packaging

This public release bundles the German and English text files in `data/corpus/texts`.
They are intended to be public-domain or openly mirrored Hegel primary-text material
that can be shipped with the GitHub repository.

Hegel Salon builds `data/corpus/generated/manifest.json` and
`data/corpus/generated/chunks.json` from these bundled files at runtime. The generated
index is ignored by Git so deployments can rebuild it without committing runtime
artifacts.

Chinese translations cleared for public redistribution use
`data/corpus/chinese/` with source and authorization metadata.

Do not commit licensed translations, private PDFs, ebooks, OCR exports, or personal
notes into this directory. If you have rights to process additional materials but
not to redistribute them, keep them in a private deployment or place them under
`local-resources/` after cloning.
