# Contributing to ROOM

ROOM is in its architecture phase. Contributions should keep agent responsibilities narrow and preserve deterministic, schema-validated boundaries.

## Before starting

1. Check existing issues.
2. Comment on the issue you want to own.
3. For large changes, open a short design issue before implementation.
4. Do not add code or assets copied from reference portfolios without a completed license audit.

## Development workflow

- Create a branch from `main`.
- Use a descriptive branch name such as `feat/world-schema` or `research/room-templates`.
- Keep one pull request focused on one module.
- Add tests or validation fixtures for contract changes.
- Update documentation when changing an agent input or output.
- Request review from the module owner.

## Pull request requirements

- Explain the user-facing outcome.
- Identify the module boundary being changed.
- List schema changes.
- Record external sources and licenses.
- Include performance impact for runtime changes.
- Include screenshots or a short recording for visual changes.
- Confirm keyboard and mobile behavior where relevant.

## Reference and asset policy

Reference repositories may be studied for ideas. Copying code, models, textures, fonts, music, or shaders is prohibited until the relevant license and provenance are documented.

## Commit style

Use concise Conventional Commit messages:

- `feat:`
- `fix:`
- `docs:`
- `research:`
- `refactor:`
- `test:`
- `chore:`
