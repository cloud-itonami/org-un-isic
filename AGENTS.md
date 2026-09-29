# etzhayyim-project-open-isic

Industrial classification runtime for UN ISIC Rev.4.

## Active Runtime

- Orchestration: Pure LangGraph (`open_isic_classify_entity` and `open_isic_hierarchical_classify`) replacing BPMN for entity classification.
- Worker implementation: Explicit 428 class-level Python primitives (`40-engine/kotoba/crates/kotoba-kotodama/py/src/kotodama/primitives/open_isic_{4digit}.py`) + core `open_isic.py`.
- SQL helpers: `40-engine/kotoba/crates/kotoba-kotodama/py/src/kotodama/handlers/open_isic.py`
- Static taxonomy: `data/classes/{4digit}.json`
- Runtime pattern: LangServer + LangGraph (Pregel) + Explicit MCP Tools

Standalone component runtime (WASM) and legacy Zeebe BPMN orchestration for `classifyEntity` are retired. The system now uses a fine-grained, LLM-implemented MCP tool for every single ISIC Rev.4 class. The retired Cloudflare Worker source is archived under `_archive/retired-cf-workers/adr-2604282300/60-apps/etzhayyim-project-open-isic/worker`.

## Coverage

| Surface | Coverage |
|---|---:|
| Taxonomy class JSON | 428/428 |
| LangGraph StateGraphs | 2/2 |
| Explicit MCP Primitives | 428/428 |
| LangServer generic handlers | 4/4 |
| UDF helpers | 2/2 |

## Orchestration (LangGraph)

The open-isic classification now operates via native LangGraph (Pregel) flows rather than BPMN:

- `open_isic_classify_entity`: Direct routing to explicit 4-digit class tools.
- `open_isic_hierarchical_classify`: Dynamic LLM drill-down from Section -> Division -> Group -> Class using the `com.etzhayyim.apps.openIsic.getTaxonomy` tool.

Other non-classification tasks (e.g., `recordConcordance`) remain as generic tools.

## LangServer Tasks

`kotodama.primitives.open_isic` and its 428 explicit class extensions own deterministic validation and graph writes:

| Task | Responsibility |
|---|---|
| `openIsic[CODE].classify` | (x428) Explicitly validate and classify an entity to a specific 4-digit ISIC class. |
| `openIsic.getTaxonomy` | Dynamically fetch ISIC hierarchy layers for LLM traversal. |
| `openIsic.recordConcordance` | Record exact/broader/narrower/related mappings to another taxonomy. |
| `openIsic.flagDualUseIndustry` | Classify a subject as dual-use industry, defaulting to ISIC 2520 when no code is supplied. |
| `openIsic.classifyArmsManufacturing` | Specialized arms manufacturing classification using ISIC 2520. |

LangGraph is used as a checkpointable deterministic guard. The hot-path decision rule is:

| Confidence | Verification |
|---:|---|
| `>= 0.9` | `authoritative` |
| `>= 0.5` | `community` |
| `< 0.5` | `candidate` |

## UDF Helpers

`kotodama.handlers.open_isic` exposes:

```text
com.etzhayyim.apps.openIsic.verificationForConfidence
com.etzhayyim.apps.openIsic.classificationVertexId
```

These helpers are for RisingWave SQL paths that need deterministic verification gates or stable classification vertex IDs without invoking the full LangServer workflow.

## Data Model

Primary graph writes:

| Table | Writer |
|---|---|
| `vertex_open_isic_classification` | `openIsic.classifyEntity` |
| `edge_open_isic_classification_class` | `openIsic.classifyEntity` |
| `vertex_open_isic_concordance` | `openIsic.recordConcordance` |

## Cross-Project Links

| Link | Use |
|---|---|
| `etzhayyim-project-open-isco` | Occupation/labor mapping |
| `etzhayyim-project-apqc` | Process classification alignment |
| `etzhayyim-project-cpc` | Product/material concordance |
| `etzhayyim-project-states` | Public administration and regulated entities |

## Local Checks

```bash
cd 40-engine/kotoba/crates/kotoba-kotodama/py
pytest -q tests/test_open_isic_apqc_primitives.py

cd ../../..
npm run lint:bpmn:manifest
npm run lint:bpmn:coverage
npm run lint:bpmn:worker-tasks
```
