# open-isic

Machine-readable ISIC Rev.4 (UN Statistics Division, International Standard
Industrial Classification of All Economic Activities, Revision 4) published as
JSON and served through the shared LangServer + LangGraph + UDF runtime.

- **Rev.4** (`data/classes/`): 21 Sections -> 88 Divisions -> **272 Groups** -> 428 Classes
- **Rev.5** (`data/rev5/`): 22 Sections -> 87 Divisions -> 258 Groups -> **463 Classes**
- Source taxonomy: https://unstats.un.org/unsd/classifications/Econ/isic (public domain)
- License: Apache-2.0 (code) / public domain (UN data)

## Two revisions, and the asymmetry between them

Rev.4 is mirrored from per-class JSON that carries `description` and `includes`
— the actual activities the UN lists for each class. Rev.5 is mirrored from the
official `ISIC_Rev_5_english_structure.csv`, which carries **code and title
only**: the Rev.5 explanatory notes are published as PDF and XLSX, so there is
no machine-readable `includes` for Rev.5 here. Anything derived from `includes`
is Rev.4-only, and that is a property of what the UN publishes rather than a
gap in this mirror. `data/rev5/upstream.edn` records the pin, the sha256, the
encoding (the CSV is latin-1, not UTF-8 — its only non-ASCII byte is a
non-breaking space) and the one normalisation applied to the generated JSON.

⚠ **The Rev.4 half of this mirror is unpinned, and measurably disputed.**
`data/classes/*.json` carries no source URL, sha256 or fetch date, and the UN's
legacy `ISIC_Rev_4_english_structure.txt` (still 200, not linked from the
landing page) disagrees with it on **33 of 414** overlapping class titles and on
the level counts. The differences read as Rev.5 wording. Which one is Rev.4
cannot be settled here, so that file was deliberately NOT ingested — giving a
disputed table an authoritative-looking pin is worse than the gap it appears to
close. See `data/PROVENANCE.edn`; resolving it needs an owner decision and a
pinned re-ingest.

**There is no Rev.4 <-> Rev.5 correspondence table here** because none is
linked from the UN landing page. Resolve a code against the revision it was
declared in; do not map Rev.5 codes onto Rev.4 and call them resolved.

## Goal

Give downstream projects — classifiers, dashboards, LLM tools, AT Protocol
actors — a stable, versioned, JSON-first ISIC dataset that can be consumed
without scraping the UN PDF.

## Layout

```
data/classes/{code}.json    one file per 4-digit Class (authoritative data)
```

Each class JSON carries `code`, `nameEn`, `group`, `description`, `includes[]`,
`excludes[]`, and `implementedAt`. The group → division → section ancestry is
resolved from the code itself (`groupOf` / `divisionOf` / `sectionOf`).

## Runtime

The Cloudflare Worker implementation has been retired to
`_archive/retired-cf-workers/adr-2604282300/60-apps/etzhayyim-project-open-isic/worker`.
Active writes and classification workflows are owned by:

- `00-contracts/bpmn/com/etzhayyim/open-isic`
- `40-engine/kotoba/crates/kotoba-kotodama/py/src/kotodama/primitives/open_isic.py`
- `40-engine/kotoba/crates/kotoba-kotodama/py/src/kotodama/handlers/open_isic.py`

Current coverage: **428 / 428 classes**, **4 / 4 BPMN processes**,
**4 / 4 LangServer tasks**, **2 / 2 UDF helpers**.

| Group | Title | Classes |
|-------|-------|---------|
| 011 | Growing of non-perennial crops | 0111, 0112, 0113, 0114, 0115, 0116, 0119 |
| 012 | Growing of perennial crops | 0121, 0122, 0123, 0124, 0125, 0126, 0127, 0128, 0129 |
| 013 | Plant propagation | 0130 |
| 014 | Animal production | 0141, 0142, 0143, 0144, 0145, 0146, 0149 |
| 015 | Mixed farming | 0150 |
| 016 | Support activities to agriculture and post-harvest crop activities | 0161, 0162, 0163, 0164 |
| 017 | Hunting, trapping and related service activities | 0170 |
| 021 | Silviculture and other forestry activities | 0210 |
| 022 | Logging | 0220 |
| 023 | Gathering of non-wood forest products | 0230 |
| 024 | Support services to forestry | 0240 |
| 031 | Fishing | 0311, 0312 |
| 032 | Aquaculture | 0321, 0322 |
| 051 | Mining of hard coal | 0510 |
| 052 | Mining of lignite | 0520 |
| 061 | Extraction of crude petroleum | 0610 |
| 062 | Extraction of natural gas | 0620 |
| 071 | Mining of iron ores | 0710 |
| 072 | Mining of non-ferrous metal ores | 0721, 0729 |
| 081 | Quarrying of stone, sand and clay | 0810 |
| 089 | Other mining and quarrying n.e.c. | 0891, 0892, 0893, 0899 |
| 091 | Support activities for petroleum and natural gas extraction | 0910 |
| 099 | Support activities for other mining and quarrying | 0990 |
| 101 | Processing and preserving of meat and meat products | 1010 |
| 102 | Processing and preserving of fish, crustaceans and molluscs | 1020 |

## Contributing a group

1. Pick the next unimplemented ISIC group (see the UN source).
2. Add one JSON file per class under `data/classes/` (`{4-digit-code}.json`)
   with `code`, `nameEn`, `group`, `description`, `includes`, `excludes`,
   `implementedAt`.
3. Run `pytest -q tests/test_open_isic_apqc_primitives.py` from
   `40-engine/kotoba/crates/kotoba-kotodama/py`.

No runtime code changes are required to publish a new group — the data files
are the interface.

## Attribution

ISIC Rev.4 © United Nations Statistics Division, public domain.
Code © etzhayyim.com, Apache-2.0.
