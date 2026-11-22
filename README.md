# privacy-shield-firefox

Firefox (WebExtensions) adapter and extension for Privacy Shield — an advanced
privacy & adblock engine. Depends on `privacy-shield-core`
(`core-engine`, `shared`).

## Status

- Phase 0 — Foundation: complete (skeleton + core dependency wiring)
- Phase 1 — Core Adblock: complete
- Phase 2 — Control & Privacy: complete (v0.3.0 adapter update)
- Phase 3 — Advanced Protection & Polish: in progress
  - v0.6.0: uBO-style cosmetic tiers (specific / generic / cached generic),
    blocked-placeholder collapse, and cosmetic hides counted separately from
    blocked requests (tracked internally, not shown in the popup)
  - v0.7.0: remove tracking query parameters on navigations and fetch/XHR,
    including scoped and regex rules, while preserving authentication parameters
  - v0.8.0: block single elements from the browser context menu
    ("Privacy Shield → Block element"), with a uniqueness-checked selector
    generator, an undo toast and a "Blocked elements" list in the settings
    page

See `../privacy-shield-core/ROADMAP.md`.

## Structure

```
apps/extension/   # WebExtensions extension (background, options, popup, content scripts)
packages/         # Firefox-specific adapter packages
docs/             # Adapter notes
```

## AMO submission

The manifest declares `data_collection_permissions.required: ["none"]` and
`strict_min_version: 140.0` (Android: `142.0`), as required for new add-ons on
addons.mozilla.org. Permission justifications and the exact upload steps are in
[`AMO_SUBMISSION.md`](AMO_SUBMISSION.md). Validate before uploading:

```bash
npm run lint:amo
```

## Development

```bash
pnpm install
# build not yet configured (Phase 3)
```

Depends on `../privacy-shield-core` (file: dependencies). Build core first:

```bash
pnpm -C ../privacy-shield-core build
```

## AdGuard Extra compatibility

AdGuard Extra is a separate companion userscript/extension; it does not use this
extension's filter engine, so both can be installed together. To avoid clashes
we keep MAIN-world globals `configurable` (another blocker may install its own
scriptlet on the same property), and we deliberately avoid broad
`[class*="adblock"]` CSS rules because companion blockers keep small "bait" ad
elements visible on purpose. If a page misbehaves with both installed, turn off
**Defuse anti-adblock notices** in Advanced settings and reload.

## Acknowledgements

- **privacy-shield-core** — shared filtering engine and packages.
- **adblock-rust** — underlying Rust filtering engine (via core).
- **EasyList / EasyPrivacy** — default filter lists (https://easylist.to).
- **AdGuard** — language filters (https://adguard.com).
- **Peter Lowe's Blocklist** — additional blocklist.
- **Helium filter service** (`services.helium.imput.net`) — hosts the
  `privacy-removeparam` and Peter Lowe filter feeds used by default.
- Firefox **WebExtensions** APIs (`webRequest`, etc.) — request blocking foundation.

## License

This project is licensed under the GNU General Public License v3.0. See `LICENSE`.
