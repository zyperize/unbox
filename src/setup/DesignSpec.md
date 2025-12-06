# Setup Suite - Design Spec

Setup is a unified launcher that bundles three lightweight desktop utilities with a shared neobrutalist system.

## Product Pillars
- **Specs**: Realtime system telemetry (CPU, memory, disks, temperatures, GPU signals when available).
- **Unbox**: Modern archive manager + file explorer (existing app surfaced through the launcher).
- **Space**: Disk usage visualiser with an interactive treemap and quick-drill hierarchy.
- **Setup Launcher**: Warm beige dashboard, lazy-loads each tool, keeps look-and-feel consistent.

## Visual Language
- Palette: beige `#F3EDDF`, soft surface `#E9E1CF`, text `#2B2A28`, accent orange `#D97A2B`, muted accents `#E7A56E`.
- Typography: monospace / utilitarian stack `ui-monospace, SFMono-Regular, Menlo, Consolas`.
- Layout: bold borders, shallow shadows, strong grid rhythm, no gradients.
- Iconography: flat emoji or outlined glyphs, minimal skeuomorphism.

## Code Architecture
- `src/setup/Setup.tsx` - launcher shell, app tiles, in-app navigation bar.
- `src/setup/theme.ts` - central colour and spacing tokens.
- `src/apps/unbox/UnboxHost.tsx` - wraps legacy Unbox React app for embedding.
- `src/apps/specs/Specs.tsx` - hardware dashboard querying Tauri command `specs_snapshot`.
- `src/apps/space/Space.tsx` - treemap explorer backed by `space_scan` and `space_drives` commands.
- `src-tauri/src/lib.rs` - exposes:
  - `specs_snapshot` -> returns CPU, memory, disks, temps, inferred GPU components.
  - `space_scan` -> trims the jwalk directory tree for UI consumption.
  - `space_drives` -> enumerates available roots.

## User Flow
1. Open Setup -> read the hero blurb, pick a tool card.
2. Launcher lazy-loads the requested module and swaps the nav to pill buttons (`Specs`, `Unbox`, `Space`).
3. In-tools retain theme, provide back button to the launcher.

## Delivery Checklist
- Shared theme + typography tokens.
- Specs telemetry wiring with `sysinfo` + cached disk/component lists.
- Space treemap with drill-down stack, top-folder digest, drive picker.
- Documentation (this file) describing palette, architecture, commands, flow.
- Ready for optional updater packaging once needed.
