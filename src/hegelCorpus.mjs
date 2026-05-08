import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { corpusDir, dataDir } from "./projectPaths.mjs";
import {
  buildConceptPlan,
  hasUnsuppressedPattern,
  loadHegelConceptLedger,
  resolveConceptTerms,
  scoreTextWithConceptPlan
} from "./hegelConcepts.mjs";

const cacheDir = join(corpusDir, "cache");
const textsDir = join(corpusDir, "texts");
const generatedDir = join(corpusDir, "generated");
const CORPUS_SCHEMA_VERSION = 2;
const PRIMARY_SOURCE_KIND = "primary-text";
const METADATA_SOURCE_KIND = "metadata";

const sourceIndex = [
  {
    id: "mia-library",
    title: "Hegel at Marxists Internet Archive",
    url: "https://www.marxists.org/reference/archive/hegel/li_hegel.htm",
    type: "index",
    authority: "mirror"
  },
  {
    id: "hnet-etexts",
    title: "Hegel.net E-texts",
    url: "https://hegel.net/en/etexts.htm",
    type: "index",
    authority: "guide"
  },
  {
    id: "gw-works-overview",
    title: "Gesammelte Werke Overview",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    type: "metadata",
    authority: "official"
  },
  {
    id: "gw-lectures-overview",
    title: "Hegel Lectures Overview",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/lectures/index.html.de",
    type: "metadata",
    authority: "official"
  }
];

const indexedWorkSeeds = [
  {
    id: "phenomenology",
    title: "Phenomenology of Mind",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/phindex.htm",
    authority: "A/D"
  },
  {
    id: "science-of-logic",
    title: "Science of Logic",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/hl/",
    authority: "A",
    manualPageUrls: [
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlconten.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hl000.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlprefac.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlintro.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlbegin.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlbeing.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlessenc.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlnotion.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlsubjec.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlobject.htm",
      "https://www.marxists.org/reference/archive/hegel/works/hl/hlidea.htm"
    ]
  },
  {
    id: "encyclopaedia",
    title: "Encyclopaedia of the Philosophical Sciences",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/encindex.htm",
    authority: "A"
  },
  {
    id: "shorter-logic",
    title: "Shorter Logic",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/sl/slconten.htm",
    authority: "A/D",
    manualPageUrls: [
      "https://www.marxists.org/reference/archive/hegel/works/sl/slintro.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/sl_ii.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/sl_iii.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/sl_ivpi.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/sl_iv.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/sl_v.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/sl_vi.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/sl_divis.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/slbeing.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/slquant.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/slessenc.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/slappear.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/slactual.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/slsubjec.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/sljudge.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/slsyllog.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/slobject.htm",
      "https://www.marxists.org/reference/archive/hegel/works/sl/slidea.htm"
    ]
  },
  {
    id: "philosophy-of-right",
    title: "Philosophy of Right",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/prindex.htm",
    authority: "A/D"
  },
  {
    id: "subjective-spirit",
    title: "Subjective Spirit",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/ssindex.htm",
    authority: "A/D"
  },
  {
    id: "subjective-spirit-shorter",
    title: "Subjective Spirit Shorter Selection",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/suindex.htm",
    authority: "A/D"
  },
  {
    id: "objective-spirit",
    title: "Objective Spirit",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/osindex.htm",
    authority: "A/D"
  },
  {
    id: "philosophy-of-nature",
    title: "Philosophy of Nature",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/natindex.htm",
    authority: "A/D"
  },
  {
    id: "philosophy-of-history",
    title: "Philosophy of History",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/hisindex.htm",
    authority: "D/E"
  },
  {
    id: "aesthetics",
    title: "Aesthetics",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/aeindex.htm",
    authority: "D/E"
  },
  {
    id: "philosophy-of-religion",
    title: "Philosophy of Religion",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/reindex.htm",
    authority: "D/E"
  },
  {
    id: "history-of-philosophy",
    title: "History of Philosophy",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/hpindex.htm",
    authority: "D/E"
  },
  {
    id: "difference-essay",
    title: "Difference between Fichte's and Schelling's System of Philosophy",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/fs/index.htm",
    authority: "A"
  },
  {
    id: "system-of-ethical-life",
    title: "System of Ethical Life",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/seindex.htm",
    authority: "B/D"
  },
  {
    id: "first-philosophy-of-spirit",
    title: "First Philosophy of Spirit",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/fkindex.htm",
    authority: "B/D"
  },
  {
    id: "natural-law",
    title: "Natural Law",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/nl/index.htm",
    authority: "A"
  },
  {
    id: "jena-lectures",
    title: "Jena Lectures",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/jlindex.htm",
    authority: "B/C/D"
  },
  {
    id: "proofs-of-god",
    title: "Proofs of the Existence of God",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/ppindex.htm",
    authority: "D/E"
  },
  {
    id: "early-theological-writings",
    title: "Early Theological Writings",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/love/index.htm",
    authority: "B/D",
    includeIndexPage: true
  },
  {
    id: "fate-and-christianity",
    title: "The Spirit of Christianity and its Fate",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/fate/index.htm",
    authority: "B/D"
  },
  {
    id: "fragments",
    title: "Fragments of a System",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/fragment/index.htm",
    authority: "B/D",
    includeIndexPage: true
  },
  {
    id: "positivity-of-christian-religion",
    title: "The Positivity of the Christian Religion",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/pc/index.htm",
    authority: "B/D"
  },
  {
    id: "german-constitution",
    title: "The German Constitution",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/gc/index.htm",
    authority: "B/D"
  },
  {
    id: "classical-studies",
    title: "On Classical Studies",
    indexUrl: "https://www.marxists.org/reference/archive/hegel/works/cs/index.htm",
    authority: "A",
    includeIndexPage: true
  },
  {
    id: "philosophical-propaedeutic-german",
    title: "Philosophische Propaedeutik",
    indexUrl: "https://www.marxists.org/deutsch/philosophie/hegel/propaed/index.htm",
    authority: "B/D",
    manualPageUrls: [
      "https://www.marxists.org/deutsch/philosophie/hegel/propaed/k1-einleit.htm",
      "https://www.marxists.org/deutsch/philosophie/hegel/propaed/k1-erlaeut.htm",
      "https://www.marxists.org/deutsch/philosophie/hegel/propaed/k1-1-rechts.htm",
      "https://www.marxists.org/deutsch/philosophie/hegel/propaed/k1-2-pflicht.htm",
      "https://www.marxists.org/deutsch/philosophie/hegel/propaed/k1-3-religion.htm",
      "https://www.marxists.org/deutsch/philosophie/hegel/propaed/k2-1-ab.htm",
      "https://www.marxists.org/deutsch/philosophie/hegel/propaed/k2-2-logik.htm",
      "https://www.marxists.org/deutsch/philosophie/hegel/propaed/k3-1-begriff.htm",
      "https://www.marxists.org/deutsch/philosophie/hegel/propaed/k3-2-enzy.htm"
    ]
  }
];

const singlePageSeeds = [
  {
    id: "elect-magistrates",
    title: "The Magistrates Should Be Elected by the People",
    url: "https://www.marxists.org/reference/archive/hegel/works/1798/elect-magistrates.htm",
    authority: "B/D"
  },
  {
    id: "theses-1801",
    title: "Hegel's Theses 1801",
    url: "https://www.marxists.org/reference/archive/hegel/works/1801/theses.htm",
    authority: "A"
  },
  {
    id: "critical-journal-introduction",
    title: "The Critical Journal of Philosophy Introduction",
    url: "https://www.marxists.org/reference/archive/hegel/works/cj/introduction.htm",
    authority: "A"
  },
  {
    id: "who-thinks-abstractly",
    title: "Who Thinks Abstractly?",
    url: "https://www.marxists.org/reference/archive/hegel/works/se/abstract.htm",
    authority: "A"
  },
  {
    id: "absolute-spirit-selection",
    title: "Absolute Spirit",
    url: "https://www.marxists.org/reference/archive/hegel/works/sp/abspirit.htm",
    authority: "A/D"
  },
  {
    id: "inaugural-address",
    title: "Inaugural Address",
    url: "https://www.marxists.org/reference/archive/hegel/works/1818/inaugural.htm",
    authority: "A"
  },
  {
    id: "tercentenary-speech",
    title: "Address on the Tercentenary of the Augsburg Confession",
    url: "https://www.marxists.org/reference/archive/hegel/works/1830/tercentenary.htm",
    authority: "A"
  }
];

const artifactSeeds = [
  {
    id: "english-reform-bill",
    title: "The English Reform Bill",
    url: "https://www.marxists.org/reference/archive/hegel/works/er/english-reform.pdf",
    authority: "A",
    type: "pdf"
  }
];

const supplementalMetadataSeeds = [
  {
    id: "gw3-early-excerpts-metadata",
    title: "GW 3 Fruehe Exzerpte Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 3 metadata. This is official edition metadata, not Hegel's own prose.
Band 3 of the Gesammelte Werke is titled "Fruehe Exzerpte (1785-1800)".
The official Hegel edition page lists it as edited by Friedhelm Nicolin with Gisela Schueler, published 1991, VII and 316 pages.
This volume matters because it covers Hegel's early excerpt culture and reading notes before the mature system.
If a user asks for early excerpts, reading habits, or the genesis of concepts before Bern, Frankfurt, and Jena system formation, GW 3 is a primary target.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw6-8-jena-system-drafts-metadata",
    title: "GW 6-8 Jenaer Systementwuerfe Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 6 to GW 8 metadata. This is official edition metadata, not Hegel's own prose.
GW 6 is "Jenaer Systementwuerfe I", edited by Klaus Duesing and Heinz Kimmerle, published 1975, VI and 386 pages.
GW 7 is "Jenaer Systementwuerfe II", edited by Rolf Peter Horstmann and Johann Heinrich Trede, published 1971, VI and 376 pages.
GW 8 is "Jenaer Systementwuerfe III", edited by Rolf Peter Horstmann with Johann Heinrich Trede and a chronology study by Heinz Kimmerle, published 1976, VI and 362 pages.
These volumes are indispensable for tracing the formation of logic, metaphysics, nature, and spirit before the Phenomenology.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw10-nuremberg-courses-metadata",
    title: "GW 10 Nuremberg Courses Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 10 metadata. This is official edition metadata, not Hegel's own prose.
GW 10,1 and GW 10,2 are "Nuernberger Gymnasialkurse und Gymnasialreden (1808-1816)".
The official page says Band 10,1 unites all texts from Hegel's teaching activity at the Nuremberg Gymnasium, including speeches held at the end of the school year and for the jubilee of his predecessor.
The official description stresses that these Nuremberg materials illuminate the genesis of the Wissenschaft der Logik and the Encyclopaedia and that they had long been neglected in research.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw14-right-supplements-metadata",
    title: "GW 14.2-14.3 Right Supplements Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 14.2 and 14.3 metadata. This is official edition metadata, not Hegel's own prose.
GW 14,2 is "Grundlinien der Philosophie des Rechts. Beilagen". The official page says it contains Hegel's reply to Gustav Hugo's critical review, the fragments "Die erbliche festbestimmte Thronfolge" and "Was Recht ist", and above all Hegel's handwritten notes in his personal copy for sections 1 to 180 of the Grundlinien.
The edition states that scans of the original are set opposite these notes and that they reveal Hegel's further work on the philosophy of right and his preparation for later lectures.
GW 14,3 is "Grundlinien der Philosophie des Rechts. Anhang" and contains the editorial report and contextual annotation base for the whole three-part edition.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw15-18-late-berlin-metadata",
    title: "GW 15-18 Berlin Writings and Manuscripts Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 15 to GW 18 metadata. This is official edition metadata, not Hegel's own prose.
GW 15 is "Schriften und Entwuerfe I (1817-1825)".
GW 16 is "Schriften und Entwuerfe II (1826-1831)". The official page notes that it contains writings and fragments from the second half of the Berlin years, including "Ueber die Bekehrten", reviews and replies from the Jahrbuecher fuer wissenschaftliche Kritik, the Latin speech for the 300th anniversary of the Confessio Augustana, and the essay on the English Reform Bill, plus preparatory fragments.
GW 17 and GW 18 are "Vorlesungsmanuskripte I" and "Vorlesungsmanuskripte II". The official page stresses that the impact history of Hegel's philosophy was deeply shaped by the lectures, while the surviving lecture manuscripts are mostly fragmentary, with the manuscript of the philosophy of religion being a major exception.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw22-excerpts-notes-metadata",
    title: "GW 22 Exzerpte und Notizen Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 22 metadata. This is official edition metadata, not Hegel's own prose.
GW 22 is titled "Exzerpte und Notizen (1809-1831)".
The official Hegel edition page states that the volume contains all surviving notes and excerpts by Hegel from books, journals, and newspapers from 1809 to 1831, chiefly from the Berlin period.
It therefore matters for reconstructing what Hegel was reading, excerpting, and preserving in the later years.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw23-logic-lectures-metadata",
    title: "GW 23 Logic Lectures Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 23 metadata. This is official edition metadata, not Hegel's own prose.
GW 23 covers "Vorlesungen ueber die Wissenschaft der Logik".
The official page states that Band 23,1 includes the Jena lecture of 1801/02 and the lectures held on the basis of the first Encyclopaedia edition: Heidelberg 1817 and Berlin 1823, 1824, 1825, and 1826 witness texts.
Band 23,3 is the appendix volume of secondary transmission.
This is the critical lecture layer that goes beyond the currently ingested mirror texts of logic.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw24-nature-lectures-metadata",
    title: "GW 24 Nature Lectures Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 24 metadata. This is official edition metadata, not Hegel's own prose.
GW 24 covers "Vorlesungen ueber Naturphilosophie".
The official works page notes that a lecture of 1828 is the first and only surviving lecture held on the basis of the revised second Encyclopaedia edition of 1827 and that witness texts for this course had remained unpublished before the edition.
GW 24 therefore extends the nature corpus beyond the current mirror-level philosophy-of-nature pages.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw25-spirit-lectures-metadata",
    title: "GW 25 Subjective Spirit Lectures Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 25 metadata. This is official edition metadata, not Hegel's own prose.
GW 25 covers the lecture materials for the first part of the philosophy of spirit.
The official works page notes that the secondary transmission and the older Zusätze tied to Band 7 of the old Saemtliche Werke are included as an independent source layer.
This corpus matters because it provides the fuller witness base for subjective spirit beyond the currently ingested mirror selections.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw26-right-lectures-metadata",
    title: "GW 26 Right Lectures Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 26 metadata. This is official edition metadata, not Hegel's own prose.
GW 26 is the critical lecture corpus on the philosophy of right.
The official page says GW 26,2 documents the courses of 1821/22 and 1822/23 after the publication of the Grundlinien and states that Hegel lectured on the basis of the printed compendium while relying heavily on his handwritten notes in GW 14,2 and often going beyond them.
GW 26,3 documents the final complete course of 1824/25 and the few surviving hours of the planned 1831/32 right lectures.
GW 26,4 is the appendix volume.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw27-world-history-lectures-metadata",
    title: "GW 27 World History Lectures Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 27 metadata. This is official edition metadata, not Hegel's own prose.
GW 27 covers "Vorlesungen ueber die Philosophie der Weltgeschichte".
The official works page lists volumes that document course witnesses from 1822/23, 1826/27, and related years.
This is the fuller critical lecture form of world-history beyond the mirror-level philosophy-of-history texts currently in the corpus.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw28-art-lectures-metadata",
    title: "GW 28 Art Lectures Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 28 metadata. This is official edition metadata, not Hegel's own prose.
GW 28 covers "Vorlesungen ueber die Philosophie der Kunst".
The official page states that Hegel's philosophy of art in its extensive worked-out form survives only through lecture transcripts and that the Berlin lecture series were held four times.
The edition's later part-volumes document specific courses such as 1826 and 1828/29.
This is the critical lecture layer needed for a stronger art corpus than the current mirror selections.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "gw29-religion-lectures-metadata",
    title: "GW 29 Religion Lectures Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/lectures/index.html.de",
    content: `GW 29 and lecture-edition metadata. This is official edition metadata, not Hegel's own prose.
The official lecture edition page lists the religion lectures in several parts: philosophy of religion II,1 and II,2 on determinate religion, and III on the fulfilled or completed religion.
The official page also notes that the manuscript of the philosophy of religion is a special case among the surviving lecture manuscripts.
This lecture corpus is essential for a fuller religion layer beyond the current introductory and absolute-religion mirror texts.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/lectures/index.html.de`
  },
  {
    id: "gw30-history-of-philosophy-lectures-metadata",
    title: "GW 30 History of Philosophy Lectures Metadata",
    authority: "official-metadata",
    url: "https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de",
    content: `GW 30 metadata. This is official edition metadata, not Hegel's own prose.
GW 30 is the critical edition of the lectures on the history of philosophy.
The official works page states that Band 30,3 documents the Berlin course of winter semester 1825/26 through six witness texts and that Band 30,4 documents the course of 1827/28.
The official page also explains that the planned six-part edition covers 1819, 1820/21, 1823/24, 1825/26, 1827/28, 1829/30, the beginning of 1831/32, and an appendix volume.
Official source: https://www.pe.ruhr-uni-bochum.de/philosophie/i/hegel_edition/works/works.html.de`
  },
  {
    id: "briefe-correspondence-metadata",
    title: "Briefe und Amtliche Korrespondenz Metadata",
    authority: "official-metadata",
    url: "https://www.meiner.de/fmv_de/briefe-von-und-an-hegel-band-1",
    content: `Briefe and correspondence metadata. This is edition metadata, not Hegel's own prose.
The Meiner page for "Briefe von und an Hegel. Band 1" confirms the volume 1785 to 1812, edited by Johannes Hoffmeister, in the Philosophische Bibliothek series.
The preview pages state that Band II contains the letters from 1813 to 1822, Band III the letters from 1823 to 1831, and Band IV supplements, documents, and indexes.
The preview further stresses that the edition gathers printed and previously unpublished letters from and to Hegel in chronological order and that together with documentary publications it provides a more detailed picture of Hegel's life and work.
This is the main route for adding letters and official correspondence to a stronger Hegel corpus.
Official sources: https://www.meiner.de/fmv_de/briefe-von-und-an-hegel-band-1 and https://assets.meiner.de/Medien-Dateien/9783787303038.pdf`
  }
];

const supplementalOcrSeeds = [
  {
    id: "hegel-werke-1-philosophische-abhandlungen-1832",
    title: "Georg Wilhelm Friedrich Hegel's Werke 1 Philosophische Abhandlungen (1832)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb11916789/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/XMMHFMAAMOOQKR7QGTUXIUJKFS3TDUB2"
  },
  {
    id: "hegel-werke-2-phaenomenologie-1832",
    title: "Georg Wilhelm Friedrich Hegel's Werke 2 Phaenomenologie des Geistes (1832)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb10045978/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/UIEKRO7NUG7WT72EDFXYN65GH4YT7U4O"
  },
  {
    id: "briefe-von-und-an-hegel-1887-band19-2",
    title: "Briefe von und an Hegel (1887), Band 19.2",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb11902075/manifest",
    sourceUrl: "https://www.digitale-sammlungen.de/view/bsb11902075"
  },
  {
    id: "briefe-von-und-an-hegel-1887-band19-1",
    title: "Briefe von und an Hegel (1887), Band 19.1",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb11879364/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/SUOQVE3EVGVQKR27RPFR5UN6ZYWDYCLQ"
  },
  {
    id: "hegel-werke-10-2-aesthetik-1837",
    title: "Georg Wilhelm Friedrich Hegel's Werke 10,2 Aesthetik (1837)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb10045987/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/NU2W6TMM45EHBPFPXZW5OAQULNSUHXEN"
  },
  {
    id: "hegel-werke-10-3-aesthetik-1838",
    title: "Georg Wilhelm Friedrich Hegel's Werke 10,3 Aesthetik (1838)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb10045988/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/ZRQUSTNHDJP7V6S25EPXK2KV3FUQJGNR"
  },
  {
    id: "hegel-werke-11-religion-1840",
    title: "Georg Wilhelm Friedrich Hegel's Werke 11 Religion (1840)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb11273166/manifest",
    sourceUrl: "https://www.digitale-sammlungen.de/de/view/bsb11273166"
  },
  {
    id: "hegel-werke-12-religion-1832",
    title: "Georg Wilhelm Friedrich Hegel's Werke 12 Religion (1832)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb10045990/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/LZKLMRPAU6HBFTFC5TPGMRCUWP6XSU3J"
  },
  {
    id: "hegel-werke-13-history-of-philosophy-1833",
    title: "Georg Wilhelm Friedrich Hegel's Werke 13 History of Philosophy (1833)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb11760708/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/WKYQX2VXY6U46BDQYFIEIPHSI76L2GOL"
  },
  {
    id: "hegel-werke-14-history-of-philosophy-1833",
    title: "Georg Wilhelm Friedrich Hegel's Werke 14 History of Philosophy (1833)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb10045992/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/75RFM75IOQB6LLPH3IVFHMEU7AQ3AWOX"
  },
  {
    id: "hegel-werke-15-history-of-philosophy-1836",
    title: "Georg Wilhelm Friedrich Hegel's Werke 15 History of Philosophy (1836)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb11760710/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/G7DAUCKUJMZCKEKT7JTIP55QV6VJNHDU"
  },
  {
    id: "hegel-werke-16-vermischte-schriften-1834",
    title: "Georg Wilhelm Friedrich Hegel's Werke 16 Vermischte Schriften (1834)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb11916806/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/AOJ22DGWKBICFAFI6SGKIBETGZOR5RXM"
  },
  {
    id: "hegel-werke-17-vermischte-schriften-1835",
    title: "Georg Wilhelm Friedrich Hegel's Werke 17 Vermischte Schriften (1835)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb10045995/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/67HY3LPJVLRTYAZ2V5CD45SWGHLH6HZS"
  },
  {
    id: "hegel-werke-18-philosophische-propaedeutik-1840",
    title: "Georg Wilhelm Friedrich Hegel's Werke 18 Philosophische Propaedeutik (1840)",
    authority: "public-domain-edition",
    manifestUrl: "https://api.digitale-sammlungen.de/iiif/presentation/v2/bsb11760713/manifest",
    sourceUrl: "https://www.deutsche-digitale-bibliothek.de/item/3ZC3YPZKIJAI3I6KMLXBSX54MNYONV7F"
  }
];

const supplementalMetadataIds = new Set(
  supplementalMetadataSeeds.map((seed) => seed.id)
);

function sha1(text) {
  return createHash("sha1").update(text).digest("hex");
}

function safeSlug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function absoluteUrl(url, href) {
  return new URL(href, url).toString();
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h\d>/gi, "\n\n")
    .replace(/<li>/gi, "\n")
    .replace(/<\/li>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-")
    .replace(/&#8220;|&#8221;/g, "\"")
    .replace(/&#8230;/g, "...")
    .replace(/&#167;/g, "§")
    .replace(/&#934;/g, "Φ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractTitle(html, fallback) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return fallback;
  return stripHtml(titleMatch[1]) || fallback;
}

function extractLinks(baseUrl, html) {
  const links = [];
  const seen = new Set();
  const regex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html))) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
      continue;
    }

    let url;
    try {
      url = absoluteUrl(baseUrl, href);
    } catch {
      continue;
    }

    if (
      !url.includes("marxists.org/reference/archive/hegel") &&
      !url.includes("marxists.org/deutsch/philosophie/hegel")
    ) {
      continue;
    }

    if (!url.endsWith(".htm") && !url.endsWith(".html")) {
      continue;
    }

    if (seen.has(url)) {
      continue;
    }
    seen.add(url);

    links.push({
      url,
      text: stripHtml(match[2]).trim()
    });
  }

  return links;
}

function getAllowedPrefixes(indexUrl) {
  const { pathname } = new URL(indexUrl);
  const parts = pathname.split("/").filter(Boolean);
  const hegelIndex = parts.indexOf("hegel");
  const hegelRoot = `/${parts.slice(0, hegelIndex + 1).join("/")}`;
  const tail = parts.slice(hegelIndex + 1, -1);

  if (!tail.length) {
    return [pathname.replace(/[^/]+$/, "")];
  }

  if (tail[0] === "works" && tail.length >= 2) {
    return [`${hegelRoot}/works/${tail[1]}/`];
  }

  return [
    `${hegelRoot}/${tail[0] === undefined ? "" : `${tail[0]}`}`,
    `${hegelRoot}/${tail[0] === undefined ? "" : `${tail[0]}/`}`
  ];
}

function isAllowedWorkLink(indexUrl, candidateUrl) {
  const pathname = new URL(candidateUrl).pathname;

  if (
    pathname.includes("/help/") ||
    pathname.endsWith("/li_other.htm") ||
    pathname.endsWith("/pg_other.htm")
  ) {
    return false;
  }

  const allowedPrefixes = getAllowedPrefixes(indexUrl);
  return allowedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function chunkText(text, chunkSize = 1400, overlap = 220) {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(clean.length, start + chunkSize);
    if (end < clean.length) {
      const breakAt = clean.lastIndexOf("\n", end);
      if (breakAt > start + 500) {
        end = breakAt;
      }
    }

    const content = clean.slice(start, end).trim();
    if (content) {
      chunks.push(content);
    }

    if (end >= clean.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function isSuppressedMention(text, index) {
  const prefix = String(text || "").slice(Math.max(0, index - 12), index);
  return /不要|别|勿|不该|不必|无需|不用|避免|不要再|别再/u.test(prefix);
}

function hasUnsuppressedMatch(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);

  for (const match of String(text || "").matchAll(regex)) {
    if (!isSuppressedMention(text, match.index ?? 0)) {
      return true;
    }
  }

  return false;
}

function collectConceptQueryTerms(query, conceptPlan, ledger) {
  const terms = [];
  const seen = new Set();

  function add(text) {
    const value = String(text || "").trim().toLowerCase();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    terms.push(value);
  }

  for (const target of conceptPlan?.conceptTargets || []) {
    const westernTerms = resolveConceptTerms(
      target.conceptId,
      "",
      ledger,
      "western-only"
    );
    westernTerms.forEach(add);
  }

  if (/\u6cd5\u54f2\u5b66|\u6cd5\u54f2\u5b66\u539f\u7406/u.test(query)) {
    add("philosophy of right");
    add("recht");
  }

  if (/\u7cbe\u795e\u73b0\u8c61\u5b66/u.test(query)) {
    add("phenomenology");
  }

  if (/\u5c0f\u903b\u8f91|\u903b\u8f91\u5b66/u.test(query)) {
    add("logic");
    add("science of logic");
  }

  return terms;
}

function expandQuery(query, conceptPlan, ledger) {
  const raw = String(query || "");
  const expansions = [];
  const seen = new Set();

  function add(text) {
    const value = String(text || "").trim().toLowerCase();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    expansions.push(value);
  }

  add(raw);
  collectConceptQueryTerms(raw, conceptPlan, ledger).forEach(add);

  const mappings = [
    [/自由|liberty|freedom/i, "freedom liberty freie freiheit"],
    [/意志|will|wille/i, "will willing volition wille"],
    [/任意|任性|任意选择|arbitrariness|caprice|willkür|willkur/i, "arbitrariness caprice willkur willkür choice choosing elective"],
    [/精神|geist|spirit|mind/i, "spirit mind geist consciousness self-consciousness intelligence"],
    [/法哲学|法哲学原理|right|recht/i, "philosophy of right right law recht grundlinien"],
    [/百科|百科全书|encyclopaedia|encyclopedia/i, "encyclopaedia encyclopedia philosophy of spirit subjective spirit objective spirit"],
    [/伦理生活|伦理|sittlichkeit|ethical life/i, "ethical life sittlichkeit ethics ethical order family civil society state"],
    [/国家|state|staat/i, "state constitutional law international law world history staat"],
    [/道德|morality|moral/i, "morality conscience good evil intention purpose"],
    [/家庭|family/i, "family marriage household"],
    [/市民社会|civil society/i, "civil society estate corporation police needs labour"],
    [/财产|property|eigentum/i, "property possession ownership eigentum besitz"],
    [/契约|合同|contract/i, "contract agreement stipulation"],
    [/历史|history/i, "history world history historical philosophic history"],
    [/宗教|religion/i, "religion god worship revealed religion"],
    [/艺术|审美|aesthetic|art/i, "art beauty aesthetic work of art"],
    [/逻辑|logic/i, "logic being essence notion concept idea"],
    [/自然|nature/i, "nature natural externality philosophy of nature"],
    [/现象学|phenomenology/i, "phenomenology spirit consciousness self-consciousness reason"],
    [/概念|begriff|concept|notion/i, "concept notion begriff universality determination"],
    [/对象|object/i, "object objectivity otherness thing"],
    [/现实|现实性|actuality/i, "actuality actual realisation realization existence"]
  ];

  for (const [pattern, value] of mappings) {
    if (
      !(conceptPlan?.conceptTargets?.length) &&
      hasUnsuppressedMatch(raw, pattern)
    ) {
      add(value);
    }
  }

  for (const match of raw.matchAll(/(?:§|&sect;|搂)\s*(\d+[a-z]?)/gi)) {
    add(match[1]);
    add(`section ${match[1]}`);
  }

  return expansions.join(" ");
}

function scoreChunk(query, chunk, conceptPlan, ledger) {
  const q = expandQuery(query, conceptPlan, ledger).toLowerCase();
  const c = chunk.toLowerCase();
  let score = 0;
  const hasFreedomTopic = hasUnsuppressedMatch(query, /\u81ea\u7531/u);
  const hasWillTopic = hasUnsuppressedMatch(query, /\u610f\u5fd7|will|wille/i);

  for (const token of q.split(/\s+/).filter(Boolean)) {
    if (token.length < 2) continue;
    if (c.includes(token)) {
      score += token.length;
    }
  }

  if (hasFreedomTopic && /freedom|freiheit|liberty/.test(c)) score += 12;
  if (hasWillTopic && /will|wille|volition/.test(c)) score += 12;
  if (/\u56fd\u5bb6|\u6cd5|\u6743\u5229/.test(query) && /state|right|property|civil society/.test(c)) score += 12;
  if (/\u5b97\u6559/.test(query) && /religion|god|worship/.test(c)) score += 12;
  if (/\u827a\u672f/.test(query) && /art|beauty|aesthetic/.test(c)) score += 12;
  if (/\u5386\u53f2/.test(query) && /history|world history|philosophy/.test(c)) score += 12;
  if (/\u7cbe\u795e/.test(query) && /spirit|mind|consciousness/.test(c)) score += 12;
  if (/\u903b\u8f91/.test(query) && /logic|concept|being|essence/.test(c)) score += 12;
  if (/法哲学|法哲学原理/i.test(query) && /philosophy of right|right|recht/.test(c)) score += 24;
  if (/百科|百科全书|精神哲学/i.test(query) && /encyclopaedia|encyclopedia|spirit|mind/.test(c)) score += 24;
  if (/精神现象学/i.test(query) && /phenomenology/.test(c)) score += 24;
  if (/伦理生活/i.test(query) && /ethical life|ethics|sittlichkeit/.test(c)) score += 18;
  if (/国家/i.test(query) && /state|constitutional law|world history/.test(c)) score += 18;
  if (/市民社会/i.test(query) && /civil society/.test(c)) score += 18;
  if (/家庭/i.test(query) && /family|marriage/.test(c)) score += 18;

  if (conceptPlan?.conceptTargets?.length) {
    score += scoreTextWithConceptPlan(c, conceptPlan, ledger, {
      mode: "western-only"
    });
  }

  return score;
}

function scorePrimaryChunk(query, chunk, conceptPlan, ledger) {
  const baseScore = scoreChunk(query, String(chunk?.content || ""), conceptPlan, ledger);
  const content = String(chunk?.content || "").toLowerCase();
  const workId = String(chunk?.workId || "");
  const meta = [
    workId,
    chunk?.workTitle || "",
    chunk?.pageTitle || ""
  ]
    .join(" ")
    .toLowerCase();
  let score = baseScore;

  const familyBoosts = {
    "philosophy-of-right": ["philosophy-of-right"],
    phenomenology: ["phenomenology"],
    "science-of-logic": ["science-of-logic", "shorter-logic"],
    "encyclopaedia-spirit": [
      "encyclopaedia",
      "subjective-spirit",
      "objective-spirit",
      "subjective-spirit-shorter"
    ],
    "encyclopaedia-nature": ["philosophy-of-nature"],
    "philosophy-of-history": ["philosophy-of-history"],
    "history-of-philosophy": ["history-of-philosophy"],
    "philosophy-of-religion": ["philosophy-of-religion"],
    aesthetics: ["aesthetics"],
    "early-writings": [
      "early-theological-writings",
      "fate-and-christianity",
      "positivity-of-christian-religion",
      "fragments",
      "german-constitution",
      "system-of-ethical-life",
      "first-philosophy-of-spirit",
      "classical-studies"
    ]
  };

  for (const family of conceptPlan?.families || []) {
    if ((familyBoosts[family] || []).includes(workId)) {
      score += 120;
    }
  }

  for (const token of String(query || "").toLowerCase().split(/\s+/).filter(Boolean)) {
    if (token.length < 3) continue;
    if (meta.includes(token)) {
      score += token.length * 4;
    }
  }

  const metaBoosts = [
    { pattern: /phenomenology/i, needle: /phenomenology/ },
    { pattern: /preface/i, needle: /preface/ },
    { pattern: /introduction/i, needle: /introduction/ },
    { pattern: /philosophy of right|recht/i, needle: /philosophy of right|right/ },
    { pattern: /science of logic|shorter logic|logic/i, needle: /logic/ },
    { pattern: /encyclopaedia|encyclopedia|philosophy of spirit|subjective spirit|objective spirit/i, needle: /encyclopaedia|encyclopedia|spirit|mind/ },
    { pattern: /philosophy of history|world history/i, needle: /history/ },
    { pattern: /history of philosophy/i, needle: /history of philosophy/ },
    { pattern: /philosophy of religion|religion/i, needle: /religion/ },
    { pattern: /aesthetics|art/i, needle: /aesthetics/ }
  ];

  for (const { pattern, needle } of metaBoosts) {
    if (pattern.test(query) && needle.test(meta)) {
      score += 28;
    }
  }

  const phraseBoosts = [
    { pattern: /truth as the whole/i, needles: ["the truth is the whole"] },
    {
      pattern: /substance and subject/i,
      needles: ["not as substance but as subject as well"]
    },
    {
      pattern: /path of despair/i,
      needles: ["highway of despair", "path of doubt"]
    },
    {
      pattern: /own criterion|setting its own criterion/i,
      needles: [
        "consciousness furnishes its own criterion in itself",
        "the standard which itself sets up"
      ]
    },
    { pattern: /determinate negation/i, needles: ["determinate negation"] },
    {
      pattern: /method not being borrowed from outside/i,
      needles: [
        "begin with the subject matter itself",
        "cannot presuppose any of these forms of reflection"
      ]
    },
    {
      pattern: /pure science|objective thinking/i,
      needles: ["objective thinking", "pure science"]
    },
    {
      pattern: /idea in its otherness/i,
      needles: ["the science of the idea in its otherness"]
    },
    {
      pattern: /idea of right and freedom/i,
      needles: ["the idea of right is freedom", "the idea of right"]
    },
    {
      pattern: /property and personality/i,
      needles: ["in his property a person exists for the first time as reason"]
    },
    {
      pattern: /actuality of the ethical idea/i,
      needles: ["the state is the actuality of the ethical idea"]
    },
    {
      pattern: /reduction of the state to civil society/i,
      needles: [
        "a mere civil society and from regarding its final end as only the security of individual life and property"
      ]
    },
    {
      pattern: /history of free thought/i,
      needles: ["history of free, concrete thought"]
    },
    {
      pattern: /overstepping its own time/i,
      needles: ["no philosophy oversteps its own time"]
    },
    {
      pattern: /reason governing the world/i,
      needles: ["reason governs the world and has consequently governed its history"]
    },
    {
      pattern: /consciousness of freedom/i,
      needles: ["world history is the progress of the consciousness of freedom"]
    },
    {
      pattern: /sharing one content/i,
      needles: ["the content is the same in both cases"]
    },
    {
      pattern: /responsive heart/i,
      needles: ["an address to the responsive heart"]
    },
    {
      pattern: /spirit of actuality/i,
      needles: ["the state is the spirit of actuality"]
    },
    {
      pattern: /organic principle being freedom/i,
      needles: ["the organic principle is freedom"]
    }
  ];

  for (const { pattern, needles } of phraseBoosts) {
    if (!pattern.test(query)) {
      continue;
    }

    for (const needle of needles) {
      if (content.includes(needle) || meta.includes(needle)) {
        score += 160;
      }
    }
  }

  return score;
}

async function ensureCorpusDirs() {
  await mkdir(cacheDir, { recursive: true });
  await mkdir(textsDir, { recursive: true });
  await mkdir(generatedDir, { recursive: true });
}

async function fetchText(url) {
  const cachePath = join(cacheDir, `${sha1(url)}.html`);
  if (existsSync(cachePath)) {
    return readFile(cachePath, "utf8");
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "hegel-salon/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`fetch failed ${response.status} ${response.statusText} for ${url}`);
  }

  const html = await response.text();
  await writeFile(cachePath, html, "utf8");
  return html;
}

async function fetchBinary(url, extension) {
  const cachePath = join(cacheDir, `${sha1(url)}.${extension}`);
  if (existsSync(cachePath)) {
    return cachePath;
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "hegel-salon/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`fetch failed ${response.status} ${response.statusText} for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(cachePath, buffer);
  return cachePath;
}

async function fetchJson(url) {
  const cachePath = join(cacheDir, `${sha1(url)}.json`);
  if (existsSync(cachePath)) {
    return JSON.parse(await readFile(cachePath, "utf8"));
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "hegel-salon/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`fetch failed ${response.status} ${response.statusText} for ${url}`);
  }

  const json = await response.json();
  await writeFile(cachePath, JSON.stringify(json), "utf8");
  return json;
}

function extractPdfText(pdfPath) {
  const script = [
    "import sys",
    "from pypdf import PdfReader",
    "reader = PdfReader(sys.argv[1])",
    "parts = []",
    "for page in reader.pages:",
    "    text = page.extract_text() or ''",
    "    parts.append(text)",
    "print('\\n\\n'.join(parts))"
  ].join("\n");

  return execFileSync("python", ["-c", script, pdfPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8"
    },
    maxBuffer: 80 * 1024 * 1024
  });
}

async function crawlIndexedWork(work) {
  const indexHtml = await fetchText(work.indexUrl);
  const seen = new Set();
  const links = extractLinks(work.indexUrl, indexHtml).filter((item) =>
    isAllowedWorkLink(work.indexUrl, item.url)
  );
  const manualLinks = Array.isArray(work.manualPageUrls)
    ? work.manualPageUrls.map((url) => ({ url, text: "" }))
    : [];
  const pages = [];

  async function tryAddPage(url, fallbackTitle = work.title) {
    if (seen.has(url)) {
      return;
    }
    seen.add(url);

    try {
      const html = await fetchText(url);
      const text = stripHtml(html);
      const title = extractTitle(html, fallbackTitle || work.title);
      if (/hypertext home page/i.test(title)) return;
      if (text.length < 500) return;
      pages.push({
        title,
        url,
        text
      });
    } catch {
      // Keep crawl resilient.
    }
  }

  if (work.includeIndexPage) {
    await tryAddPage(work.indexUrl, work.title);
  }

  for (const link of [...links, ...manualLinks]) {
    await tryAddPage(link.url, link.text || work.title);
  }

  return {
    ...work,
    pageCount: pages.length,
    pages
  };
}

async function crawlSinglePage(seed) {
  try {
    const html = await fetchText(seed.url);
    const text = stripHtml(html);
    const title = extractTitle(html, seed.title);
    const pages = text.length > 300 ? [{ title, url: seed.url, text }] : [];

    return {
      id: seed.id,
      title: seed.title,
      authority: seed.authority,
      indexUrl: seed.url,
      pageCount: pages.length,
      pages
    };
  } catch {
    return {
      id: seed.id,
      title: seed.title,
      authority: seed.authority,
      indexUrl: seed.url,
      pageCount: 0,
      pages: []
    };
  }
}

async function crawlArtifact(seed) {
  if (seed.type !== "pdf") {
    return {
      id: seed.id,
      title: seed.title,
      authority: seed.authority,
      indexUrl: seed.url,
      pageCount: 0,
      pages: []
    };
  }

  try {
    const pdfPath = await fetchBinary(seed.url, "pdf");
    const text = stripHtml(extractPdfText(pdfPath));
    const pages = text.length > 300 ? [{ title: seed.title, url: seed.url, text }] : [];

    return {
      id: seed.id,
      title: seed.title,
      authority: seed.authority,
      indexUrl: seed.url,
      pageCount: pages.length,
      pages
    };
  } catch {
    return {
      id: seed.id,
      title: seed.title,
      authority: seed.authority,
      indexUrl: seed.url,
      pageCount: 0,
      pages: []
    };
  }
}

async function crawlIiifHocrSeed(seed) {
  try {
    const manifest = await fetchJson(seed.manifestUrl);
    const canvases = manifest?.sequences?.[0]?.canvases || [];
    const parts = [];

    for (const [index, canvas] of canvases.entries()) {
      const ocrUrl = canvas?.seeAlso?.["@id"];
      if (!ocrUrl) {
        continue;
      }

      try {
        const html = await fetchText(ocrUrl);
        const text = stripHtml(html);
        if (!text || text.length < 40) {
          continue;
        }
        const label = canvas?.label || `page ${index + 1}`;
        parts.push(`[${label}]\n${text}`);
      } catch {
        // Keep OCR import resilient page by page.
      }
    }

    const text = parts.join("\n\n");
    const pages = text.length > 300 ? [{ title: seed.title, url: seed.sourceUrl, text }] : [];

    return {
      id: seed.id,
      title: seed.title,
      authority: seed.authority,
      indexUrl: seed.sourceUrl,
      pageCount: pages.length,
      pages
    };
  } catch {
    return {
      id: seed.id,
      title: seed.title,
      authority: seed.authority,
      indexUrl: seed.sourceUrl,
      pageCount: 0,
      pages: []
    };
  }
}

async function materializeWork(work, allChunks, sourceKind = PRIMARY_SOURCE_KIND) {
  await mkdir(textsDir, { recursive: true });

  for (const page of work.pages) {
    const pageSlug = safeSlug(page.title || page.url);
    const textPath = join(textsDir, `${work.id}--${pageSlug}.txt`);
    await writeFile(textPath, page.text, "utf8");

    const chunks = chunkText(page.text);
    chunks.forEach((content, index) => {
      allChunks.push({
        id: `${work.id}:${pageSlug}:${index}`,
        workId: work.id,
        workTitle: work.title,
        sourceKind,
        authority: work.authority,
        pageTitle: page.title,
        url: page.url,
        content
      });
    });
  }
}

async function materializeSupplementalSeed(seed, allChunks) {
  await mkdir(textsDir, { recursive: true });

  const pageSlug = safeSlug(seed.title || seed.id);
  const textPath = join(textsDir, `${seed.id}--${pageSlug}.txt`);
  await writeFile(textPath, seed.content, "utf8");

  const chunks = chunkText(seed.content);
  chunks.forEach((content, index) => {
    allChunks.push({
      id: `${seed.id}:${pageSlug}:${index}`,
      workId: seed.id,
      workTitle: seed.title,
      sourceKind: METADATA_SOURCE_KIND,
      authority: seed.authority,
      pageTitle: seed.title,
      url: seed.url,
      content
    });
  });
}

export async function ensureHegelCorpus() {
  await ensureCorpusDirs();

  const manifestPath = join(generatedDir, "manifest.json");
  const chunksPath = join(generatedDir, "chunks.json");

  if (existsSync(manifestPath) && existsSync(chunksPath)) {
    const [manifestRaw, chunksRaw] = await Promise.all([
      readFile(manifestPath, "utf8"),
      readFile(chunksPath, "utf8")
    ]);
    const manifest = JSON.parse(manifestRaw);
    const chunks = JSON.parse(chunksRaw);

    if (manifest?.schemaVersion === CORPUS_SCHEMA_VERSION) {
      return { manifest, chunks };
    }
  }

  const works = [];
  const allChunks = [];

  for (const seed of indexedWorkSeeds) {
    const work = await crawlIndexedWork(seed);
    works.push({
      id: work.id,
      title: work.title,
      sourceKind: PRIMARY_SOURCE_KIND,
      authority: work.authority,
      indexUrl: work.indexUrl,
      pageCount: work.pageCount
    });
    await materializeWork(work, allChunks, PRIMARY_SOURCE_KIND);
  }

  for (const seed of singlePageSeeds) {
    const work = await crawlSinglePage(seed);
    works.push({
      id: work.id,
      title: work.title,
      sourceKind: PRIMARY_SOURCE_KIND,
      authority: work.authority,
      indexUrl: work.indexUrl,
      pageCount: work.pageCount
    });
    await materializeWork(work, allChunks, PRIMARY_SOURCE_KIND);
  }

  for (const seed of artifactSeeds) {
    const work = await crawlArtifact(seed);
    works.push({
      id: work.id,
      title: work.title,
      sourceKind: PRIMARY_SOURCE_KIND,
      authority: work.authority,
      indexUrl: work.indexUrl,
      pageCount: work.pageCount
    });
    await materializeWork(work, allChunks, PRIMARY_SOURCE_KIND);
  }

  for (const seed of supplementalMetadataSeeds) {
    works.push({
      id: seed.id,
      title: seed.title,
      sourceKind: METADATA_SOURCE_KIND,
      authority: seed.authority,
      indexUrl: seed.url,
      pageCount: 1
    });
    await materializeSupplementalSeed(seed, allChunks);
  }

  for (const seed of supplementalOcrSeeds) {
    const work = await crawlIiifHocrSeed(seed);
    works.push({
      id: work.id,
      title: work.title,
      authority: work.authority,
      indexUrl: work.indexUrl,
      pageCount: work.pageCount
    });
    await materializeWork(work, allChunks);
  }

  const manifest = {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceIndex,
    artifacts: artifactSeeds,
    works,
    totalChunks: allChunks.length
  };

  await Promise.all([
    writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8"),
    writeFile(chunksPath, JSON.stringify(allChunks, null, 2), "utf8")
  ]);

  return { manifest, chunks: allChunks };
}

export async function searchHegelCorpus(
  query,
  limit = 8,
  conceptPlan = null,
  ledger = null
) {
  const { manifest, chunks } = await ensureHegelCorpus();
  const effectiveLedger = ledger || (await loadHegelConceptLedger());
  const effectiveConceptPlan =
    conceptPlan || buildConceptPlan(String(query || ""), [], effectiveLedger);
  const ranked = chunks
    .filter(
      (chunk) =>
        chunk?.sourceKind === PRIMARY_SOURCE_KIND &&
        !supplementalMetadataIds.has(chunk.workId)
    )
    .map((chunk) => ({
      ...chunk,
      score: scorePrimaryChunk(query, chunk, effectiveConceptPlan, effectiveLedger)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    manifest,
    results: ranked
  };
}
