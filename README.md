# ROOM

> Turn a portfolio into a world people can walk through.

ROOM is an agent-driven system that converts an existing personal website or résumé into a traceable two-floor Mardou museum. The Agent pipeline preserves source evidence, while the museum turns the compiled profile into clickable project islands, semantic information objects, a source archive, and a private upper gallery.

## Demo

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, click **配置解析服务**, paste an API key, and choose either the MAAS or Zhizengzeng provider preset. Each dropdown option supplies its compatible Base URL, request mode, and recommended model. The primary provider handles both the résumé and personal website by default.

Advanced settings can enable an independent concurrent Website Agent with a second key and its own provider dropdown. Once the résumé identity pass discovers a personal homepage, that Agent starts immediately while the remaining résumé extraction continues.

Browser-provided keys are kept in the current tab's `sessionStorage` and sent only to ROOM's server-side parsing proxy. They are cleared when that tab session ends and are never written to the repository or `localStorage`.

For shared or deployed instances, server-side environment variables remain supported. Copy the tracked template and configure the deployment environment:

```bash
cp .env.example .env.local
```

The relevant settings are:

```dotenv
WEBSITE_AGENT_API_KEY=your-independent-website-agent-key
WEBSITE_AGENT_API_KEY_FALLBACK=
WEBSITE_AGENT_BASE_URL=https://your-provider.example/v1
WEBSITE_AGENT_MODEL=claude-sonnet-5
MAAS_API_KEY=your-primary-key
MAAS_API_KEY_FALLBACK=your-secondary-key
MAAS_BASE_URL=https://maas.devops.rednote.life/hackson
MAAS_MODEL=vertex-claude-sonnet-5/claude-sonnet-5
```

Only one valid API key is required. `MAAS_BASE_URL`, `MAAS_MODEL`, `WEBSITE_AGENT_BASE_URL`, and `WEBSITE_AGENT_MODEL` have working defaults, while a dedicated Website Agent key is optional.

The entrance checks `/api/config` for deployment-level readiness and opens the in-browser configuration form when neither a session key nor a server key is available. A browser session configuration overrides server providers for that user's parse requests without exposing any server-side secret.

Local secrets are loaded only by the development server. Production builds expect the same names as deployment-platform secrets and do not embed `.env.local` values. Configure those values in the deployment platform rather than committing an environment file.

Open `http://localhost:3000` at the public entrance. Choose the precompiled Han Chen demo to enter its world immediately without reparsing or configuring an API, or configure the Agent service and import another résumé or public portfolio.

The demo supports:

- Pasted résumé text plus PDF, image, and common text/web data uploads.
- Hybrid PDF parsing: a fast page-aware text/link evidence pass plus Claude document vision and semantic extraction.
- Guarded public-page extraction and automatic personal-website enrichment when the résumé names a homepage. The website Agent starts as soon as the identity shard finds that homepage and runs concurrently with the remaining résumé extraction.
- A Mardou GLB museum rendered with React Three Fiber, including a long-corridor entrance, first-person WASD movement, collision handling, and a clickable staircase.
- A public ground-floor gallery with project islands, semantic profile objects, a visitor book, and a source archive.
- A password-gated upper gallery for the local private diary and personal scene.
- Clickable exhibits with line-level source evidence.
- Deterministic checks for omissions, overlap, dead click targets, room connectivity, and mobile budgets.
- A license-aware reference catalog plus a syncable local RAG corpus.

This version deliberately does not include racing navigation, generative Blender assets, accounts, or persistent visitor comments. Those remain follow-up iterations.

## Phase 1: Agent-powered Mardou museum

ROOM deliberately starts with one experience model:

- Visitors enter from the museum's long corridor and arrive in the public ground-floor gallery.
- Projects, achievements, experience, skills, and personal background become interactive museum objects rather than uniform rectangular boards.
- Project details, editing controls, and source evidence remain available in the focused information panel.
- The staircase opens a password-gated private upper gallery with a browser-local diary.
- Racing and other game modes are deferred until the museum pipeline is stable.

Implemented first world:

| Space | Purpose |
| --- | --- |
| Entrance corridor | Slow guided arrival into the museum, then first-person control |
| Ground-floor gallery | Identity, timeline, skills, achievements, contact details, and visitor book |
| Project islands | Editable project covers and Agent-generated project details |
| Source archive | Complete source links and evidence provenance |
| Upper private gallery | Identity-gated local diary and personal scene |

## Core principle

Agents read and understand the original résumé and personal website rather than relying on a fixed field extractor. Their evidence-backed result is normalized only at the boundary so a deterministic runtime can compile it into a stable, testable 3D world.

```text
Résumé / PDF ──→ page evidence + identity Agent ──→ personal homepage ──→ website Agent
      └────────→ page evidence + inventory Agent ───────────────────────────────┘
                                           ↓ concurrent join
                                  evidence-backed profile.json
        ↓
Creative Director + World Orchestrator
        ↓
Validated world.json
        ↓
Three.js room runtime
        ↓
QA Agent
        ↓
Published personal world
```

## Demo agents

- **Parser Agent** — extracts identity, projects, experience, education, skills, and achievements while retaining source locators.
- **Creative Director** — retrieves room patterns from the license-aware reference catalog and creates a spatial brief.
- **World Orchestrator** — maps each source item exactly once into the two-floor Mardou museum without reintroducing coordinates from the former villa scene.
- **World Checker** — checks content parity, collisions, click targets, room connectivity, and mobile rendering budgets.

The renderer, database, authentication, deployment, and comment persistence remain deterministic services rather than agents.

## Stack

- React 19 + TypeScript + vinext
- Three.js + React Three Fiber
- JSON Schema contracts plus deterministic validators
- Node test runner for the pipeline and server-rendered shell

## Repository map

```text
docs/
  ARCHITECTURE.md
  PRODUCT.md
  ROADMAP.md
  TEMPLATE_RESEARCH.md
.github/
  ISSUE_TEMPLATE/
  pull_request_template.md
```

Key implementation paths:

```text
lib/agents/        Four-agent pipeline
lib/rag/           Curated reference patterns
research/rag/      Synced repository metadata and README excerpts
schemas/           Profile, world, and checker contracts
components/        3D world and product workbench
tests/             Pipeline and rendered output checks
```

Refresh the compact reference corpus with `npm run rag:sync`. Only repositories explicitly classified for reuse may contribute implementation patterns; research-only and visual-only references remain quarantined.

## Status

Runnable demo. Run `npm test` for pipeline tests, a production build, and server-render checks. See [ROADMAP](docs/ROADMAP.md) and [CONTRIBUTING](CONTRIBUTING.md) for follow-up work.

## License

To be selected before external code or assets are accepted. Reference projects and assets must not be copied until their licenses are verified.
