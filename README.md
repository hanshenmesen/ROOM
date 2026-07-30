# ROOM

> Turn a portfolio into a world people can walk through.

ROOM is an agent-driven system that converts an existing personal website or résumé into a traceable multi-room Three.js portfolio. The first demo compiles source text into a five-room 3D world, maps every item to an exhibit, and checks the result before it is shown.

## Demo

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, keep the included Chinese sample résumé or paste your own, then run the four-agent pipeline.

The demo supports:

- Pasted résumé text and `.txt`, `.md`, or `.html` uploads.
- Extraction of public HTML pages through a guarded server route.
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

Agents do not generate arbitrary Three.js applications. Agents produce validated structured data. A deterministic runtime compiles that data into a stable, testable 3D world.

```text
Portfolio URL / résumé
        ↓
Parser Agent
        ↓
Structured profile.json
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
