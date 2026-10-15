# ABIX-AE NADD — All New Commands

Primary command: `-naddmenu`
Alias: `-naddhelp`

All NADD primary commands and aliases are namespaced with `nadd` and are restricted to configured owners (`OWNER` permission), which includes the primary and secondary owners resolved by ABIX's permission layer.

## Loading

The top-level `plugins2/nadd.js` is the only ABIX command-plugin entrypoint. It loads `plugins2/nadd/nadd-registry.cjs`.

The legacy `plugins2/nadd/nadd-commands.js` file is intentionally inert so recursive command loaders do not register NADD twice. Raw engine internals remain under `plugins2/nadd/engines/`.

## Verification

Run:

```bash
node docs/NADD-VERIFY.cjs
```

The verifier checks command validity, duplicate command/alias names, owner policy, and that every registered NADD command appears in `-naddmenu`.

No root `node_modules` are included in this update. The engines use the bot's existing dependencies.
