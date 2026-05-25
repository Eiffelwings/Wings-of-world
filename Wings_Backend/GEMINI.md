# Wings Of World Backend Map

`Wings_Backend` contains the broader agent gateway, channel integrations, mobile/desktop support code, skills, tests, and extension runtime used by Wings Of World.

## Main Areas

- `src/`: gateway/runtime source
- `extensions/`: bundled extension packages
- `skills/`: runtime skill catalog
- `apps/`: native app support code
- `test/` and `test-fixtures/`: backend test coverage

## Rebrand Rules

- User-facing text, metadata, and release docs should say `Wings Of World`.
- Legacy names stay only where changing them would break imports, protocol compatibility, package history, or existing command aliases.
