# ROOM

> Turn a portfolio into a world people can walk through.

ROOM is an agent-driven system that converts an existing personal website or résumé into a multi-room Three.js portfolio. Visitors walk through connected rooms, explore projects and achievements as spatial exhibits, and leave comments on specific items.

## Phase 1: Multi-room portfolio

ROOM deliberately starts with one experience model:

- A central lobby connects several rooms.
- Each room has one semantic purpose.
- Projects, achievements, experience, skills, and personal background become interactive exhibits.
- Visitors can leave comments on a room, exhibit, or project.
- Racing and other game modes are deferred until the room pipeline is stable.

Suggested first world:

| Space | Purpose |
| --- | --- |
| Lobby | Name, identity, navigation, short introduction |
| Project Gallery | Selected projects and demos |
| Experience Corridor | Work and education timeline |
| Skills Lab | Skills, tools, and capabilities |
| Achievement Room | Awards, milestones, publications |
| Guest Lounge | Global comments and contact links |

## Core principle

Agents do not generate arbitrary Three.js applications. Agents produce validated structured data. A deterministic runtime compiles that data into a stable, testable 3D world.

```text
Portfolio URL / résumé
        ↓
Profile Agent
        ↓
Structured profile.json
        ↓
Room Planner + Asset Curator + Exhibit Agent
        ↓
Validated world.json
        ↓
Three.js room runtime
        ↓
QA Agent
        ↓
Published personal world
```

## Agent modules

- **Template Scout Agent** — discovers existing Three.js room portfolios, records interaction patterns, technical approaches, and licensing.
- **Profile Agent** — extracts and normalizes facts from websites, PDFs, and user input.
- **Room Planner Agent** — turns a structured profile into a connected room graph.
- **Asset Curator Agent** — selects approved reusable assets from the catalog.
- **Exhibit Agent** — maps projects and achievements to interactive spatial objects.
- **QA Agent** — checks content fidelity, navigation, accessibility, performance budgets, and broken interactions.
- **Comment Guardian Agent** — optional online agent for moderation and comment summarization.

The renderer, database, authentication, deployment, and comment persistence remain deterministic services rather than agents.

## Proposed stack

- React + TypeScript + Vite
- Three.js + React Three Fiber + Drei
- Rapier for collision and movement
- GSAP for guided camera transitions
- JSON Schema for all agent contracts
- Supabase for auth, comments, and realtime updates
- Playwright for end-to-end verification

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

Implementation packages will be added after the first architecture review so contributors do not prematurely couple agents to the renderer.

## Status

Early architecture and research phase. See [ROADMAP](docs/ROADMAP.md) and [CONTRIBUTING](CONTRIBUTING.md).

## License

To be selected before external code or assets are accepted. Reference projects and assets must not be copied until their licenses are verified.
