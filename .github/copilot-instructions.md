# GitHub Copilot Instructions for Excel DB Platform

## Project Overview
This is a "NoCode Excel DB Platform" that converts Excel sheets into dynamic SQLite tables. It is a monorepo structure with a React frontend and Node.js/Express backend.

### Architecture & Data Flow
- **Excel to SQLite**: Users upload Excel files. The backend parses them, sanitizes headers, validates types, and creates a dynamic SQLite table (naming convention: `t_${timestamp}`).
- **Metadata Handling**:
  - `_app_tables`: Stores metadata about the imported tables (display name, physical SQL table name, column definitions).
  - `projects`: Groups tables.
- **Dynamic Frontend**: The frontend does not know the schema at build time. It fetches `tableMeta` and renders columns dynamically using `@tanstack/react-table`.

### Monorepo Structure
- `start.bat`: Starts both services.
- `client/`: Vite + React + TypeScript + Tailwind CSS.
  - Port: `5173`
- `server/`: Node.js + Express + Better-SQLite3.
  - Port: `3001`
  - Database: `server/data/app.db`

## Tech Stack & Conventions

### Frontend (`client/`)
- **Framework**: React 19, Vite 7.
- **Language**: TypeScript (`.tsx`, `.ts`) and JavaScript (`.jsx` mixed in). Prefer **TypeScript** for new React files.
- **Styling**: Tailwind CSS 4. Use utility classes (e.g., `className="w-full px-1"`).
- **Data Fetching**: `axios` via `src/api.js`.
- **Tables**: `@tanstack/react-table` v8.
  - **Critical Pattern**: Columns are dynamic. Frontend uses `col.name` (sanitized DB column) for data access, but displays `col.original` (original Excel header) in the UI.
  - See `src/components/DataGrid.jsx` for the dynamic column definition pattern.
- **Components**: Functional components with Hooks. `lucide-react` for icons.

### Backend (`server/`)
- **Runtime**: Node.js.
- **Framework**: Express.js.
- **Database**: `better-sqlite3`.
  - **Synchronous**: `better-sqlite3` operations are synchronous. Do not use `await` on DB calls.
  - **Dynamic SQL**: Table names and column names are dynamic.
  - **Sanitization**: **CRITICAL**. Column names must be sanitized using `sanitizeColumnName` logic (preserve Chinese chars/alphanumerics, replace others with `_`) before creating tables.
  - See `services/tableService.js` for `sanitizeColumnName` and dynamic SQL construction.
- **Excel Processing**: `xlsx` library for reading buffers.

## Developer Workflows
- **Running**: Use `start.bat` in the root.
- **Debugging**:
  - Backend logs to the terminal where `start.bat` launched it.
  - Frontend errors in browser console.
- **API Pattern**:
  - Routes in `index.js`.
  - Business logic/DB calls in `services/*.js`.
  - Response always JSON.

## Key Patterns
1.  **Column Mapping**:
    - Excel Header: "Employee Name"
    - Database Column: "Employee_Name" (sanitized)
    - Metadata `columns` JSON: `[{ name: "Employee_Name", original: "Employee Name", type: "TEXT" }]`
2.  **Dynamic Filtering**:
    - Filters are sent as JSON strings via query params (`?filters=[...]`).
    - Backend parses and constructs SQL `WHERE` clauses dynamically.
3.  **File Upload**:
    - Uses `multer` in memory mode (`multer.memoryStorage()`).
    - Processed immediately in `tableService.importExcel`.

## Common Tasks
- **Adding an API**:
  1. Add service method in `server/services/`.
  2. Add route in `server/index.js`.
  3. Add client method in `client/src/api.js`.
- **Modifying Data Grid**:
  - Edit `client/src/components/DataGrid.jsx`.
  - Remember `onCellUpdate` sends updates to backend immediately on blur/enter.
