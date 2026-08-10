# Creative Retrieval

## Current boundary

ROOM's Creative Retrieval is a deterministic, license-aware reference service. It is not an LLM Agent and it is not currently vector RAG. The catalog contains 13 curated patterns, so adding an embedding model, vector database, or semantic reranker would increase infrastructure and evaluation complexity without satisfying the upgrade condition in the Agent System Upgrade Plan.

The production path is explicit:

```text
Profile fields and Items
  → bilingual lexical expansion
  → Metadata Filter by reference category
  → License Guard by intended purpose
  → weighted tag/pattern ranker
  → deterministic tie-breaker
  → CreativeBrief.references
```

## License Guard

Retrieval purpose is part of the policy, not a score boost:

| Purpose | Allowed reuse states |
| --- | --- |
| `implementation` | `approved` only |
| `inspiration` | `approved`, `visual-only` |

`quarantined` and `research-only` entries may remain in the catalog for audit and research, but they cannot enter an implementation Creative Brief. A higher lexical score cannot override this guard. Runtime world compilation uses `implementation` and restricts candidates to room, world, and template metadata.

## Ranking

The query includes the validated Profile headline, summary, skills, hobbies, and bounded Item titles, summaries, tags, and tech stacks. English tags and pattern text receive weighted overlap scores. A small reviewed Chinese-to-catalog expansion layer covers spatial, interaction, game, navigation, recovery, low-poly, and narrative concepts. Catalog similarity and room-first metadata are priors; stable reference ID is the final tie-breaker.

Each returned reference carries its score, matched reason, reuse state, and at most two catalog-authored patterns. The service does not copy source code or external assets.

## Eval

Run:

```bash
npm run eval:creative
```

The committed `creative-retrieval-v1` dataset has 10 English, Chinese, metadata, inspiration, and License Guard cases. Current offline results are:

| Metric | Result |
| --- | ---: |
| Recall@3 | 100% |
| Precision@3 | 60% |
| nDCG | 100% |
| License violation rate | 0% |
| Creative Brief citation integrity | 100% |

Precision@3 uses the returned list length as its denominator because metadata and licensing can leave fewer than three eligible references. Creative Brief citation integrity verifies that every emitted reference ID, name, pattern, and reuse permission resolves to the catalog; it is not presented as evidence that a reference causally improved the 3D design.

The Gold labels are currently prelabeled rather than human-verified. They are sufficient for deterministic regression and License Guard enforcement, not for claiming broad aesthetic relevance across users.

## Vector retrieval gate

Embedding retrieval is enabled only when both conditions hold:

1. The curated catalog reaches at least 200 references.
2. A reviewed Eval shows lexical Recall@K below its required threshold, currently 85% or the dataset-specific stricter threshold.

At 13 references and 100% Recall@3, the current decision is `vectorRetrievalRecommended=false`. Future adoption must compare lexical-only and lexical-plus-vector candidates on the same Gold dataset, preserve metadata and license filtering before results become usable, and report latency and cost in addition to retrieval quality.
