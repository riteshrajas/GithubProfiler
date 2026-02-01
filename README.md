# Git-Shift

Git identity manager with a Tauri (desktop) frontend and a standalone egui binary. This doc covers Linux builds for both targets.

## Prerequisites (Linux)
- Rust toolchain >= 1.77.2 (`rustup default stable`)
- Node.js + npm
- Git available on PATH
- System libs for Tauri WebView: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev` (Debian/Ubuntu names)
- Build essentials: `build-essential curl file pkg-config patchelf`

## Build the Tauri app (AppImage)
1. Install deps: `sudo apt install build-essential curl file pkg-config patchelf libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
2. Install JS deps: `npm install`
3. Build: `npm run tauri build`
   - Produces an AppImage under `src-tauri/target/release/bundle/appimage/`.
4. Run locally: `npm run tauri dev`

## Build the egui binary
1. From repo root: `cargo build --release`
2. Binary output: `target/release/github_profiler` (name from `Cargo.toml`).

## Notes
- Tauri bundles now target AppImage explicitly on Linux; add higher-res PNG icons (256/512) under `src-tauri/icons/` for best launcher appearance.
- Credential helper detection now logs common Linux helpers (store/cache/libsecret) and flags manager/manager-core as potential conflicts.
- If Git is missing from PATH, commands will emit errors in the app log.
