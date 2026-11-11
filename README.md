# privacy-shield-firefox

Firefox (WebExtensions) adapter and extension for Privacy Shield — an advanced
privacy & adblock engine. Depends on `privacy-shield-core`
(`core-engine`, `shared`).

## Status

- Phase 0 — Foundation: complete (skeleton + core dependency wiring)
- Phase 1 — Core Adblock: complete
- Phase 2 — Control & Privacy: complete (v0.3.0 adapter update)
- Phase 3 — Advanced Protection & Polish: in progress

See `../privacy-shield-core/ROADMAP.md`.

## Structure

```
apps/extension/   # WebExtensions extension (background, options, popup, content scripts)
packages/         # Firefox-specific adapter packages
docs/             # Adapter notes
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

## Acknowledgements

- **privacy-shield-core** — shared filtering engine and packages.
- **adblock-rust** — underlying Rust filtering engine (via core).
- **EasyList / EasyPrivacy** — default filter lists (https://easylist.to).
- **AdGuard** — language filters (https://adguard.com).
- **Peter Lowe's Blocklist** — additional blocklist.
- **Helium filter service** (`services.helium.imput.net`) — hosts the
  `privacy-removeparam` and Peter Lowe filter feeds used by default.
- Firefox **WebExtensions** APIs (`webRequest`, etc.) — request blocking foundation.
