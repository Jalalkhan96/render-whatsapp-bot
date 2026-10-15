# NADD Owner + Secondary Owner Update

All commands exported by `plugins2/nadd/nadd-commands.js` are now restricted to the configured owner set.

## Allowed

- Primary owner
- Secondary owner(s)

## Denied

- Ordinary users
- Group admins who are not configured owners
- Bot admins who are not configured owners

The existing ABIX owner resolver treats primary and secondary owners as `isOwner=true`, so `permission: OWNER` is the correct mode.
