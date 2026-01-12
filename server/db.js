const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

// Initialize Meta Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS _app_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    table_name TEXT NOT NULL UNIQUE,
    columns TEXT NOT NULL, -- JSON string of column definitions
    project_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
