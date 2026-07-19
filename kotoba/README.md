# open-isic — kotoba reference implementation

kotoba port of the UN ISIC Rev.4 industrial classification under the
substrate rules of [ADR-2605172000](../../../90-docs/adr/2605172000-etzhayyim-kotoba-substrate.md):
no RisingWave, no centralized DB, no fiat payment processor. All
taxonomy state lives on AT Protocol MST + IPFS; the substrate pipeline
(mst-projector → ipfs-pinner → anchor-cron) anchors the MST root to
Base L2 so any third party can verify the taxonomy without trusting
this operator.

Mirrors the [`open-isco/kotoba/`](../../etzhayyim-project-open-isco/kotoba/)
reference. The sibling [`../appview/`](../appview/) directory is the
legacy classification runtime (entity → ISIC code), kept while this
kotoba taxonomy publisher rolls out; the two are complementary, not
redundant.

## What this proves (next step after open-isco)

ISIC Rev.4 is the second-smallest "open-* app" cohort after ISCO-08:
428 4-digit classes, 21 sections (A–U), updated every ~10 years. It
extends the substrate-replication proof from ISCO's 525 occupations to
a hierarchy with letter-prefixed sections — the section field is
derived from the division code via a pure function (no LLM, no
database lookup).

| Property | Why ISIC fits the substrate model |
|---|---|
| Cardinality = 428 | In-memory MST traversal works comfortably in any client |
| Write rate ≈ 0 | Seed once per ISIC revision (~10 yr cadence) |
| Public source (UN) | No PII, no consent surface |
| Hierarchy = MST-natural | 4-digit code is the MST key; section (1 char) / division (2) / group (3) all derivable |
| Existing data on disk | 428 class JSONs already live at `../data/classes/` from the LangServer runtime — seed just reads them |

## Layout

```
kotoba/
├── README.md            # this file
├── package.json         # depends on @etzhayyim/sdk
├── tsconfig.json
└── src/
    ├── types.ts         # IsicClass type + hierarchyOf / sectionForDivision helpers
    ├── types.test.ts    # vitest — 39 section-boundary assertions + hierarchy
    ├── seed.ts          # one-shot seeder — reads ../data/classes/*.json → SDK.write() per class
    ├── seed.test.ts     # vitest — toIsicClass converter shape (no network)
    ├── query.ts         # read API — SDK.read() with key-prefix MST traversal
    ├── verify.ts        # verification example — SDK.verify() returns Merkle proof
    └── index.ts         # public exports (queryByPrefix, getByCode, helpers)
```

## SDK usage map (ADR-2605172000 § "Per-app-pattern migration guide")

Old (RW-backed `appview/` / `kotodama` handlers):

```typescript
const rows = await kysely
  .selectFrom("vertex_open_isic_class")
  .where("division", "=", "25")
  .selectAll()
  .execute();
```

New (kotoba):

```typescript
import { queryByPrefix } from "@etzhayyim/open-isic-kotoba";

// Prefix scan = MST traversal — same semantics as the old SQL filter.
const division25 = await queryByPrefix("25");

// Exact lookup by rkey = 4-digit code.
import { getByCode } from "@etzhayyim/open-isic-kotoba";
const weaponsClass = await getByCode("2520");
```

## Lexicon

The new record lexicon is
[`00-contracts/lexicons/com/etzhayyim/apps/openIsic/class.json`](../../../00-contracts/lexicons/com/etzhayyim/apps/openIsic/class.json)
(NSID `com.etzhayyim.apps.openIsic.class`). The classification path
(`classifyEntity`, `recordConcordance`, etc.) continues to use the
existing query / procedure lexicons under the same namespace — this PR
adds only the `class` record type for taxonomy publication.

`rkey` policy: `literal:{code}` — the 4-digit ISIC code is the MST key
verbatim. Idempotent re-seeds produce no new records.

## Seed

```bash
# Full seed (428 classes) from ../data/classes/
pnpm tsx src/seed.ts

# Subset
pnpm tsx src/seed.ts --only=2520
pnpm tsx src/seed.ts --since=2500
```

Required env: `ETZ_PDS_URL` (default `https://pds.etzhayyim.com`) +
either an authenticated SDK session OR an SDK builder that resolves
credentials from the host (deploy-time concern; not in scope here).

## Query

```bash
pnpm tsx src/query.ts --code=2520
pnpm tsx src/query.ts --prefix=25 --limit=20
pnpm tsx src/query.ts --prefix=011        # group 011 (non-perennial crops)
pnpm tsx src/query.ts --prefix=01         # division 01 (crop production)
```

Section-level scans (`section=A`) require either two prefix scans
(divisions 01–03) or a getTaxonomy lookup — the CLI keeps the surface
prefix-only for substrate-purity.

## Verify

```bash
pnpm tsx src/verify.ts at://did:web:etzhayyim.com/com.etzhayyim.apps.openIsic.class/2520
```

Returns the Merkle path from the record to the MST root that was
anchored to Base L2 via the substrate pipeline. Any client (no
credentials) can re-check the proof.

## Tests

```bash
pnpm test
# 47/47 (vitest):
#   - 39 section-boundary cases covering all 21 ISIC sections (A–U)
#   - 5 hierarchyOf decomposition + edge cases (4-digit length guard)
#   - 3 toIsicClass converter (publishedAt defaulting, section derivation, optional-field absence)
```

## Status

| Surface | State |
|---|---|
| Record lexicon | ✅ `00-contracts/lexicons/com/etzhayyim/apps/openIsic/class.json` |
| Seeder + helpers | ✅ |
| Pure-helper tests | ✅ 47/47 |
| Live PDS seed run | ⏳ pending `ETZ_SEEDER_DID` + PDS auth credentials |
| Anchor verify against deployed contract | ⏳ pending `ETZ_ANCHOR_CONTRACT` deploy on target chain |

## See also

- [`60-apps/etzhayyim-project-open-isco/kotoba/`](../../etzhayyim-project-open-isco/kotoba/) — pattern reference (ISCO-08 occupations)
- [`20-actors/etzhayyim-sdk/`](../../../20-actors/etzhayyim-sdk/) — the substrate-purity SDK
- [`50-infra/mst-projector/`](../../../50-infra/mst-projector/) — Stage 3 of the trust-less verification chain
- [ADR-2605172000](../../../90-docs/adr/2605172000-etzhayyim-kotoba-substrate.md) — substrate rules
- [`40-engine/kotoba/crates/kotoba-kotodama/py/src/kotodama/primitives/open_isic_*.py`](../../../40-engine/kotoba/crates/kotoba-kotodama/py/src/kotodama/primitives/) — 428 classification primitives (LangServer runtime; complementary to this taxonomy publisher)
