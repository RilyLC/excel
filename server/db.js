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
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add user_id to existing tables if missing
try {
  const tableInfo = db.prepare('PRAGMA table_info(_app_tables)').all();
  if (!tableInfo.find(c => c.name === 'user_id')) {
     db.prepare('ALTER TABLE _app_tables ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE').run();
  }

  const projectInfo = db.prepare('PRAGMA table_info(projects)').all();
  if (!projectInfo.find(c => c.name === 'user_id')) {
     db.prepare('ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE').run();
  }
} catch (err) {
  console.error('Migration failed:', err.message);
}

module.exports = db;

module.exports = db;
