# ADR 0004: Gate vector retrieval on catalog scale and measured Recall

- Status: Accepted
- Date: 2026-08-05

## Context

ROOM has a 13-entry curated reference catalog. The earlier Creative Director used keyword overlap, a hand-authored similarity prior, room-first preference, and a license score boost. This made ranking deterministic but allowed an ineligible reference to outrank an approved one, had no retrieval metrics, and gave no evidence that vector infrastructure was necessary.

## Decision

Keep Creative Retrieval framework-neutral and deterministic. Split it into bilingual lexical expansion, Metadata Filter, a purpose-specific License Guard, weighted lexical reranking, and stable tie-breaking. Add a versioned offline dataset with Recall@K, Precision@K, nDCG, license-violation, and Creative Brief citation-integrity metrics.

Do not add embeddings or a vector database until the catalog has at least 200 curated entries and reviewed lexical Recall@K is below the accepted threshold. Both conditions are required.

## Consequences

- Runtime implementation references are always license-approved; license status is a hard policy rather than a soft boost.
- Visual-only material remains available only through an explicit inspiration query.
- Chinese Profile concepts can match the English catalog without a model call.
- Retrieval behavior, relevance labels, and the future vector decision are reproducible offline.
- The current Eval recommends no vector retrieval: catalog size 13, Recall@3 100%.
- Semantic similarity outside the reviewed expansion vocabulary remains limited; this is accepted until scale and Eval demonstrate a real Recall problem.
