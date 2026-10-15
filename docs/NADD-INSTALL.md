# NADD update installation

Copy the update contents into the existing ABIX bot, preserving the paths in the ZIP.

The important files are:

- `plugins2/nadd.js` — top-level entrypoint for both old and recursive plugin loaders.
- `plugins2/nadd/nadd-registry.cjs` — complete NADD registry and handlers.
- `plugins2/nadd/engines/` — all source engine files required by the commands.
- `plugins2/nadd/nadd-commands.js` — inert compatibility placeholder to prevent duplicate registration.

All exposed NADD commands are `OWNER` permission and therefore available to the primary + configured secondary owners only.

Recommended verification after extraction:

```bash
node docs/NADD-VERIFY.cjs
```

If your existing command handler recursively scans `plugins2`, also apply the supplied loader guard once to keep raw engine `.js` files out of the command-plugin scan:

```bash
node docs/APPLY-NADD-LOADER-PATCH.js
```

Do not install a second NADD copy elsewhere in `plugins2`.
