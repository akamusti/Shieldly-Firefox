# privacy-shield-firefox

Firefox (WebExtensions, Manifest V3) adapter and extension for **Privacy
Shield** — an advanced privacy & adblock engine. Current version: **0.10.3**.

## Status

- Phase 0 — Foundation: complete
- Phase 1 — Core Adblock: complete
- Phase 2 — Control & Privacy: complete
- Phase 3 — Advanced Protection & Polish: complete
- Ongoing work: AMO submission readiness and compatibility

See `../privacy-shield-core/ROADMAP.md` for the overall plan.

## Features

- Network and cosmetic filtering via blocking `webRequest` (Firefox keeps
  blocking webRequest in MV3), EasyList/EasyPrivacy/AdGuard/Peter Lowe lists
- `@@` allow rules and a user whitelist, `$removeparam` (including regex
  patterns), `$csp` / `$removeheader` header modification
- Unsupported-rule reporting in the advanced options page
- Per-site dynamic filtering firewall (Allow / Block / Noop)
- WebRTC relay mode, third-party cookie/script controls, `$document`
  strict blocking
- Anti-blocker defusing with local MAIN-world scriptlets and procedural
  notice/backdrop removal (uBO/AdGuard style)
- Element picker with site-specific and global rules, context-menu blocking
- Request log with reason and rule attribution, settings backup, rule manager
- Tabbed, compact advanced settings page
- Rule prioritization and a bounded domain set for predictable memory use

## Structure

```
apps/extension/
  manifest.json   # MV3 manifest, gecko id + AMO data declarations
  background.js   # webRequest filtering, list compilation, statistics
  content.js      # isolated-world cosmetic filtering and notice removal
  defusers.js     # MAIN-world local scriptlets (document_start)
  popup.html/js   # toolbar panel with per-site controls and firewall
  options.html/js # advanced settings (5 tabs)
  icons/          # toolbar icons
packages/firefox-adapter/  # adapter skeleton
tests/          # node --test suites
AMO_SUBMISSION.md  # permission justifications and upload steps
```

Extension JavaScript mirrors core logic; it does not import core packages at
runtime. Keep both in sync when changing a contract.

## AMO submission

The manifest declares `data_collection_permissions.required: ["none"]`,
`strict_min_version: 140.0` and `gecko_android.strict_min_version: 142.0`, as
required for new add-ons on addons.mozilla.org. Permission justifications and
upload steps are in [`AMO_SUBMISSION.md`](AMO_SUBMISSION.md); ready-to-paste
listing fields are in [`AMO_FORM.md`](AMO_FORM.md). Validate locally:

```bash
npm run lint:amo
```

`web-ext lint` reports 0 errors, 0 notices and 0 warnings.

## Development

```bash
npm test                 # node --test
node --check apps/extension/background.js
node --check apps/extension/content.js
npm run lint:amo
```

`npm run build` is currently a stub — the extension ships plain JavaScript.
Core can be built separately with `pnpm -C ../privacy-shield-core build`.

## AdGuard Extra compatibility

AdGuard Extra is a separate companion userscript/extension and does not use
this filter engine, so both can be installed together. MAIN-world globals are
`configurable` so another blocker may install its own scriptlet, and broad
`[class*="adblock"]` CSS rules are avoided because companion blockers keep
small "bait" ad elements visible on purpose. If a page misbehaves, disable
**Defuse anti-adblock notices** in Advanced settings and reload.

## Acknowledgements

- **privacy-shield-core** — shared filtering engine and packages
- **adblock-rust** — underlying Rust engine
- **EasyList / EasyPrivacy**, **AdGuard**, **Peter Lowe's Blocklist** — filter lists
- **Helium filter service** — hosts default tracking-parameter feeds
- Firefox **WebExtensions** APIs (`webRequest`, `privacy`, `menus`) — filtering
  and privacy controls
- **uBlock Origin / AdGuard** — filter syntax and scriptlet techniques

## License

GNU General Public License v3.0. See `LICENSE`.
