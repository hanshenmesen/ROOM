# Website Research Tool Agent

## Boundary

ROOM's Website Research Agent is a hybrid Tool Agent: a model planner chooses the next page from an exact allowlisted candidate set or decides to submit, while deterministic code owns URL authorization, tool dispatch, budgets, evidence validation, and fallback. The existing Profile LLM owns semantic extraction from the inspected corpus. This prevents untrusted page text from naming tools, expanding scope, or changing hard stopping policy.

The implementation deliberately does not describe link ranking, HTML inspection, or Claim validation as LLM Agents. They are atomic tools controlled by one bounded research loop. If planning fails or selects a URL outside the supplied candidates, the loop records `deterministic-fallback` and uses missing-field ranking.

## Plan → Tool → Observe loop

```text
compare current Profile with missing-field rules
  → fetch_page(root)
  → list_links(root)
  → inspect_page(root)
  → extract_media(root)
  → build bounded Observation from same-host candidates
  → model chooses continue(exact candidate) or submit
  → execute bounded page tools and replan from the new Observation
  → submit_profile(inspected corpus)
  → validate_claim(Profile evidence)
  → return Profile + redacted Research snapshot
```

For résumé imports, the Identity shard may discover the homepage before other shards complete. ROOM immediately prefetches only the root page, preserving the existing concurrency benefit. The complete résumé Profile then determines whether project, research, experience, education, achievement, contact, skill, or media pages are worth visiting. For website-only imports, the server runs the same Tool Agent directly instead of requiring the browser to call the old single-page extractor first.

## Atomic tools

| Tool | Responsibility | Trace input summary | Trace output summary |
| --- | --- | --- | --- |
| `fetch_page` | Fetch one authorized HTML/text page with redirect checks | URL, depth | final URL, content type, bytes |
| `list_links` | Parse and rank relevant same-host anchors | page URL, depth | candidate count |
| `inspect_page` | Convert HTML into canonical Profile evidence text | page URL, depth | title, line count |
| `extract_media` | Keep bounded non-decorative media metadata | page URL | media count |
| `submit_profile` | Submit the combined inspected corpus to the Profile Agent | page count, character count | Profile ID, item count |
| `validate_claim` | Resolve Claim locators and exact excerpts back to a page | field, page URL, locator, evidence count | supported boolean |

Tool inputs and outputs have fixed schemas and runtime validation. Trace never contains HTML/text bodies, Claim values, evidence excerpts, prompts, API keys, cookies, or Authorization headers.

## Default budgets

- At most 5 pages.
- Link depth at most 2.
- At most 80 atomic Tool calls, including Claim validation.
- At most 1 MB per page and 3 MB total downloaded text.
- At most 140,000 characters submitted to the Profile Agent.
- Research navigation deadline of 24 seconds.
- HTTP redirects remain capped at 4 by the shared public-web fetcher.

Callers may lower these limits for an experiment but cannot raise them above the repository defaults. When a page, byte, step, time, or input budget is reached, navigation stops and the pages already inspected are submitted as a partial research result.

## Security policy

- Root URLs and every redirect pass the public URL validator and a fresh DNS A/AAAA safety check.
- Literal or DNS-resolved loopback, private, link-local, reserved, credential-bearing, and nonstandard-port URLs are rejected before the page request.
- Additional navigation is restricted to the root hostname and its canonical `www` counterpart unless a server-side caller explicitly approves another hostname. The product route does not currently approve any other host.
- External, local-network, login, admin, account, private, feed, archive, and binary candidates are excluded from the plan.
- Page instructions are untrusted data. They never reach the tool dispatcher or policy configuration.
- Model planning receives no page body or arbitrary tool list. It sees bounded page metadata and can return only `continue` with an exact candidate URL or `submit`.
- Failed tools expose a generic error code in Trace; sibling candidates may still be inspected.

DNS-over-HTTPS preflight closes deterministic DNS-to-private cases, but Cloudflare's Edge `fetch` API does not expose or pin the resolved peer IP. A target can still change DNS answers between preflight and connection. High-assurance deployment for arbitrary domains therefore still requires a controlled fetch proxy or platform capability that validates and pins the destination.

## Eval boundary

`compareWebsiteResearch()` compares single-page and multi-page expected-title Recall plus pages, bytes, Tool calls, Tool latency, model calls, and Provider token usage when available. Missing Provider usage remains `null`; ROOM does not estimate it and present the estimate as measured data.

The committed offline test uses a fictional website graph. It verifies improved Recall, deterministic stopping, same-host enforcement, redirect authorization, Claim URL/locator/excerpt evidence, and immunity of the tool plan to Prompt Injection text. Real-model accuracy and real-network cost remain future controlled experiments.
