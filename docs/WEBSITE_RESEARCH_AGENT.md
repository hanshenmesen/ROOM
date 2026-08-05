# Website Research Tool Agent

## Boundary

ROOM's Website Research Agent is a hybrid Tool Agent: deterministic code owns tool selection policy, URL authorization, budgets, stopping, and evidence validation; the existing Profile LLM owns semantic extraction from the inspected corpus. This prevents untrusted page text from naming tools, expanding scope, or changing the stopping policy.

The implementation deliberately does not describe link ranking, HTML inspection, or Claim validation as LLM Agents. They are atomic tools controlled by one bounded research loop.

## Plan → Tool → Observe loop

```text
compare current Profile with missing-field rules
  → fetch_page(root)
  → list_links(root)
  → inspect_page(root)
  → extract_media(root)
  → rank same-host candidates for missing fields
  → repeat bounded page tools
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

- Root URLs and every redirect pass the existing public URL validator.
- Literal loopback, private, link-local, reserved, credential-bearing, and nonstandard-port URLs are rejected.
- Additional navigation is restricted to the root hostname and its canonical `www` counterpart unless a server-side caller explicitly approves another hostname. The product route does not currently approve any other host.
- External, local-network, login, admin, account, private, feed, archive, and binary candidates are excluded from the plan.
- Page instructions are untrusted data. They never reach the tool dispatcher or policy configuration.
- Failed tools expose a generic error code in Trace; sibling candidates may still be inspected.

Cloudflare's Edge `fetch` API does not expose the resolved peer IP before a request. Hostname validation therefore cannot fully prove DNS-rebinding safety. Production deployment for arbitrary public domains still requires a controlled fetch proxy or platform capability that validates resolved addresses and pins the authorized destination. This limitation must not be presented as solved by string-level URL checks.

## Eval boundary

`compareWebsiteResearch()` compares single-page and multi-page expected-title Recall plus pages, bytes, Tool calls, Tool latency, model calls, and Provider token usage when available. Missing Provider usage remains `null`; ROOM does not estimate it and present the estimate as measured data.

The committed offline test uses a fictional website graph. It verifies improved Recall, deterministic stopping, same-host enforcement, redirect authorization, Claim URL/locator/excerpt evidence, and immunity of the tool plan to Prompt Injection text. Real-model accuracy and real-network cost remain future controlled experiments.
