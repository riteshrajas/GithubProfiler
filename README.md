# Git-Shift

Git identity manager with a Tauri (desktop) frontend and a standalone egui binary.

## Prerequisites
- Rust toolchain >= 1.77.2 (`rustup default stable`)
- Node.js + npm
- Git available on PATH

### Linux Dependencies
- System libs for Tauri WebView: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev` (Debian/Ubuntu names)
- Build essentials: `build-essential curl file pkg-config patchelf`

## Build the Tauri app
1. Install dependencies: `npm install`
   - This installs both root and frontend dependencies.
2. Build: `npm run tauri build`
   - On Linux, this produces an AppImage and Deb package in `src-tauri/target/release/bundle/`.
   - On Windows, this produces an MSI or NSIS installer.
3. Run locally: `npm run tauri dev`

## Build the egui binary (CLI/Standalone)
1. From repo root: `cargo build --release`
2. Binary output: `target/release/github_profiler` (name from `Cargo.toml`).

## Notes
- Credential helper detection logs common helpers (store/cache/libsecret/manager) and flags potential conflicts.
- If Git is missing from PATH, commands will emit errors in the app log.
