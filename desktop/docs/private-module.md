# Private module coordination

Open desktop lives in `desktop/` and loads an optional proprietary overlay.

## Contract

See [`src/shared/private-api.ts`](../src/shared/private-api.ts).

| Channel | Purpose |
|---------|---------|
| `private:capabilities` | `{ supportsAuth, productName }` |
| `private:account:getSession` / `login` / `logout` | Auth |
| `private:subscription:fetch` / `sync` | Subscription URL + import managed profile |

## Open stub

Default module (`supportsAuth: false`) — Clash URL/YAML import only; no Cheezy API calls.

## Proprietary overlay

Load order (first hit wins):

1. `CHEEZY_PRIVATE_ENTRY` env (absolute path to JS)
2. Packaged: `resources/private/index.js`
3. Dev: `private-overlay/index.js` or sibling `CheezyVPN/proprietary/desktop/dist/index.js`

Module must export `createModule(): PrivateModule`.

Private implementation lives in the CheezyVPN repo under `proprietary/desktop/`.
