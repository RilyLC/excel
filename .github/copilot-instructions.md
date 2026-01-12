# Copilot Instructions for NoCode Excel DB

## Architectural Overview
This application is a hybrid Desktop/Web application that serves as a database for Excel files. It uses a **Client-Server** architecture even within the Electron environment.

- **Electron Bundle:** The main process (`electron/main.cjs`) spawns the Node.js server (`server/index.js`) as a child process using `fork`.
- **Communication:** The Frontend communicates with the Backend exclusively via HTTP REST API (`/api/...`), **not** Electron IPC.
- **Frontend:** React + Vite + Tailwind CSS.
- **Backend:** Express.js + Better-SQLite3.
- **Data Model:** Dynamic Schema. User-uploaded Excel files generate real SQLite tables. Metadata is stored in `_app_tables`.

## Developer Workflows

### Running in Development
The preferred workflow depends on what you are editing:

1.  **Web Mode (Recommended for most tasks):**
    *   Run Server: `node server/index.js` (starts on port 3001).
    *   Run Client (HMR): `cd client && npm run dev`.
    *   *Note:* Allows hot-reload for frontend and backend changes (if using nodemon for server, though standard script is just node).

2.  **Desktop Mode (Electron):**
    *   Build Client: `npm run build:client` (Required! Electron loads the built `server/public` assets).
    *   Start: `npm start`.
    *   *Warning:* No HMR in this mode. You must rebuild the client to see changes.

### Building
- **Command:** `npm run dist`
- **Process:** Builds client -> Moves assets to `server/public` -> Packages Electron app.
- **Output:** `release/`

## Project Conventions & Patterns

### 1. Database & Meta-Schema
The application creates tables dynamically based on Excel uploads.
- **Meta Table:** `_app_tables` stores definitions (`table_name`, `columns` JSON).
- **Dynamic Tables:** Actual data lives in tables named `table_${id}` or similar (check `tableService.js` for naming convention).
- **Connection:** `server/db.js` handles the connection.
- **Path:** Controlled by `APP_DATA_DIR` env var. Defaults to `server/data/app.db` in dev.

### 2. API & File Handling
- **Encoding Fix:** When handling file uploads in `server/index.js`, notice the specific fix for filename encoding: `Buffer.from(req.file.originalname, 'latin1').toString('utf8')`. Maintain this pattern.
- **Endpoints:** All API routes must be prefixed with `/api`.
- **Service Layer:** Logic resides in `server/services/`, not directly in controllers/routes.

### 3. Frontend Architecture
- **API Client:** Use `client/src/api.js` for all backend calls. Do not use `fetch` directly in components.
- **Styling:** Tailwind CSS. Use `className` props.
- **State:** React Hooks.

## Essential Paths
- **Server Entry:** [server/index.js](server/index.js)
- **Electron Entry:** [electron/main.cjs](electron/main.cjs)
- **Database logic:** [server/services/tableService.js](server/services/tableService.js)
- **Client API:** [client/src/api.js](client/src/api.js)

## Common "Gotchas"
- **Static Files:** The Express server serves `server/public` as static files. This directory is populated by the client build.
- **Port Handling:** In Electron, the server runs on port '0' (random free port). The Electron main process captures this port from stdout/IPC message and loads the window at that specific port.
