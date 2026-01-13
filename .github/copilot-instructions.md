# GitHub Copilot Instructions for NoCode Excel DB

## 1. Project Architecture & Stack

This is a **monorepo** for a "NoCode" database application that runs as a desktop app (via Electron) or a web server.
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS (`client/`).
- **Backend**: Node.js + Express + SQLite (better-sqlite3) (`server/`).
- **Desktop**: Electron wrapper that forks the backend process (`electron/`).

### Critical Paths
- **Entry Points**: 
  - Electron: `electron/main.cjs` (manages backend lifecycle).
  - Server: `server/index.js` (API & static file serving).
  - Client: `client/src/main.tsx`.
- **Data Persistence**: 
  - SQLite database (`app.db`).
  - Storage location: `server/data` (dev) or defined by `APP_DATA_DIR` (prod).
  - **Dynamic Tables**: User "Excel" sheets are created as real SQLite tables with sanitized names (e.g., `t_UUID`), tracked in the `_app_tables` meta-table.

## 2. Coding Conventions

### Backend (Node/Express/SQLite)
- **Database Access**:
  - Use `better-sqlite3` (synchronous API).
  - **Transactions**: Wrap multi-step writes in `db.transaction(() => { ... })()`.
  - **Dynamic SQL**: Since table names are dynamic (`t_...`), you often cannot use prepared statements for identifiers. Validate/escape table/column names carefully using white-lists or the `sanitizeColumnName` helper in `tableService.js`.
  - **Meta-Data**: Always update `_app_tables` when creating/deleting user tables.
- **Service Layer**:
  - Encapsulate DB logic in `server/services/*.js`.
  - Return plain objects; throw Errors for exceptions.
- **API**:
  - Use `express`.
  - Auth: JWT Bearer token via `authenticateToken` middleware.

### Frontend (React/Vite)
- **State Management**: React Hooks.
- **Styling**: Tailwind CSS (utility-first).
- **API Calls**:
  - Use the centralized `api` object in `client/src/api.js`.
  - **Auth Interceptor**: 401 errors trigger a token clear + page reload.
- **Components**:
  - Place reusable UI in `client/src/components/`.
  - Prefer functional components with strict TypeScript types (interfaces for Props).

## 3. Deployment & Build

- **Start (Dev)**:
  - Client: `npm run dev` (in `client/`).
  - Server: `node index.js` (in `server/`).
- **Build (Prod)**:
  - `npm run build:client` -> Output to `server/public`.
  - `electron-builder` packages the `server/` folder (excluding `node_modules` test files) and the electron main script.
- **Environment Variables**:
  - Backend: `PORT` (default 0 for Electron), `APP_DATA_DIR`.
  - Frontend: `import.meta.env.VITE_API_URL`.

## 4. Key Patterns & Gotchas

- **Dynamic Tables**:
  - **Do NOT** assume fixed schema for user data tables.
  - Columns are stored as a JSON string in `_app_tables.columns`.
  - When altering table structure, you must update the SQLite schema `AND` the `_app_tables` definition.
- **Electron vs Web**:
  - The server checks `if (app.isPackaged)` in Electron logic to determine paths.
  - The frontend is agnostic; it just hits the API URL.
- **File Uploads**:
  - Stored in `data/documents` (or `APP_DATA_DIR/documents`).
  - Metadata in `_app_tables` with `type='document'`.

## 5. Testing & Debugging

- **Manual Testing**:
  - Run the full stack via `start.bat` (Windows) or `npm start` (root).
- **Logs**:
  - Electron apps pipe server stdout/stderr. Check Electron console for backend errors.
