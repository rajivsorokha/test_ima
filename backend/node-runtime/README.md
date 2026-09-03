# Portable Node.js runtime (build-time only, not committed to git)

This folder must contain a portable Node.js executable before you run
`cargo tauri build`. It lets the installed app run the backend WITHOUT
requiring end users to install Node.js themselves.

This folder is gitignored on purpose — everyone who builds the installer
sets it up locally, once.

## Windows

1. Go to https://nodejs.org/en/download and download the
   "Windows Binary (.zip)" for a Node **22.x LTS** version specifically
   (e.g. `node-v22.20.0-win-x64.zip`) — NOT the newest "Current" release.
   Using a brand-new non-LTS version increases the odds that native
   modules like `better-sqlite3` don't have a prebuilt binary for it yet,
   forcing a from-source compile that needs Visual Studio Build Tools.
2. Extract it anywhere temporarily.
3. Copy just `node.exe` from inside that extracted folder into this
   folder, so you end up with:
   `backend/node-runtime/node.exe`
4. IMPORTANT — use that exact same `node.exe` (or a same-Node-version
   `npm`) to install backend dependencies, so the native `better-sqlite3`
   binary matches this Node's ABI (its `NODE_MODULE_VERSION`). Mixing
   versions is the #1 cause of a backend that logs "running" then
   immediately crashes with an `ERR_DLOPEN_FAILED` /
   `NODE_MODULE_VERSION` mismatch error:

   ```
   cd backend
   <path-to-extracted-folder>\npm.cmd install --omit=dev
   ```

   If you ever bump the bundled Node version later, delete
   `backend/node_modules` first and reinstall with the new version's
   `npm` — don't mix an old `node_modules` with a new `node.exe` (or
   vice versa).

5. From `src-tauri/`, run:

   ```
   cargo tauri build
   ```

   `backend/` (now containing `node_modules/` AND `node-runtime/node.exe`)
   gets bundled as a resource automatically per `tauri.conf.json`.

## macOS / Linux

Same idea: download the matching platform tarball from nodejs.org,
extract, and place the `node` binary (no extension) at
`backend/node-runtime/node`. Make sure it's executable:
`chmod +x backend/node-runtime/node`. Then `npm install --omit=dev` in
`backend/` using that same Node binary before building.

## Verifying it worked

After building, check the installer/output size — it should now be much
larger than ~7MB (node_modules + the Node runtime add real weight, likely
60-100MB+). You can also unzip/inspect the bundled resources folder in
the build output and confirm `backend/node_modules/` and
`backend/node-runtime/node.exe` are both present.
