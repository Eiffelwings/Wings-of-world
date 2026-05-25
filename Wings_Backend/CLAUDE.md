# Wings Of World Backend Guide

This directory is the compatibility backend runtime for Wings Of World.

## Quick Reference

- Package: `wings-of-world-backend`
- Primary CLI: `wings-of-world-backend`
- Primary env prefix: `WINGS_OF_WORLD_BACKEND_`
- Compatibility CLI: `mechanical-wings`
- Local config/data should live outside the source tree.

## Notes

- Keep existing internal import paths unless a focused migration proves they are safe to change.
- New user-facing documentation should use `Wings Of World`.
- Compatibility names may remain in command aliases, protocol identifiers, tests, and legacy integration surfaces.
