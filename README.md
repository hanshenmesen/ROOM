# ROOM

> Turn a portfolio into a world people can walk through.

ROOM is an agent-driven system that converts an existing personal website or résumé into a traceable multi-room Three.js portfolio. The first demo compiles source text into a five-room 3D world, maps every item to an exhibit, and checks the result before it is shown.

## Demo

```bash
npm install
npm run dev
```

Configure the server-side Profile Agent in an ignored `.env.local` file:

```dotenv
WEBSITE_AGENT_API_KEY=your-independent-website-agent-key
WEBSITE_AGENT_BASE_URL=https://your-provider.example/v1
WEBSITE_AGENT_MODEL=claude-sonnet-5
MAAS_API_KEY=your-primary-key
MAAS_API_KEY_FALLBACK=your-secondary-key
MAAS_BASE_URL=https://maas.devops.rednote.life/hackson
MAAS_MODEL=vertex-claude-sonnet-5/claude-sonnet-5
```

Local secrets are loaded only by the development server. Production builds expect the same names as deployment-platform secrets and do not embed `.env.local` values.

Open `http://localhost:3000` at the public entrance. Choose the precompiled Han Chen demo to enter its world immediately without reparsing, or import another résumé or public portfolio.

The demo supports:

- Pasted résumé text plus PDF, image, and common text/web data uploads.
- Hybrid PDF parsing: a fast page-aware text/link evidence pass plus Claude document vision and semantic extraction.
- Guarded public-page extraction and automatic personal-website enrichment when the résumé names a homepage. The website Agent starts as soon as the identity shard finds that homepage and runs concurrently with the remaining résumé extraction.
- Five connected rooms rendered with React Three Fiber.
- Clickable exhibits with line-level source evidence.
- Deterministic checks for omissions, overlap, dead click targets, room connectivity, and mobile budgets.
- A license-aware reference catalog plus a syncable local RAG corpus.

This version deliberately does not include racing navigation, generative Blender assets, accounts, or persistent visitor comments. Those remain follow-up iterations.

## Phase 1: Multi-room portfolio

ROOM deliberately starts with one experience model:

- A central lobby connects several rooms.
- Each room has one semantic purpose.
- Projects, achievements, experience, skills, and personal background become interactive exhibits.
- Visitors can leave comments on a room, exhibit, or project.
- Racing and other game modes are deferred until the room pipeline is stable.

Implemented first world:

| Space | Purpose |
| --- | --- |
| Lobby | Name, identity, navigation, short introduction |
| Project Gallery | Selected projects and demos |
| Experience Corridor | Work and education timeline |
| Skills Lab | Skills, tools, and capabilities |
| Achievement Room | Awards, milestones, publications |

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
- **World Orchestrator** — maps each source item exactly once into the central lobby or one of four connected rooms.
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
