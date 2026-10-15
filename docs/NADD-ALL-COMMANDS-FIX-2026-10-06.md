# NADD All Commands Fix — 2026-10-06

This patch fixes the previous deployment failure where `-naddmenu` could exist without its engine files or could be skipped by a top-level-only plugin loader.

Changes:

1. Added `plugins2/nadd.js` as a universal top-level command entrypoint.
2. Moved the real command registry to `plugins2/nadd/nadd-registry.cjs` so engine internals are not loaded as command plugins.
3. Kept the previous `plugins2/nadd/nadd-commands.js` path as an inert compatibility placeholder to prevent duplicate registration.
4. Included the complete NADD engine tree from the supplied source packages.
5. All registered NADD commands use `permission: OWNER`, `ownerOnly: true`, `strictOwnerOnly: false`.
6. `-naddmenu` is generated from the actual registry at execution time, so a newly registered NADD command cannot silently disappear from the menu.
7. Added `docs/NADD-VERIFY.cjs` to check command/alias duplication, owner policy, and menu coverage.
