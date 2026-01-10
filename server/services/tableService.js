const db = require('../db');
const xlsx = require('xlsx');

// Helper to sanitize column names (SQLite identifiers)
function sanitizeColumnName(name) {
  if (!name) return 'col';
  
  // Allow Chinese characters, alphanumeric, and underscores
  // Replace anything that is NOT (Chinese, Letter, Number, Underscore)
  let sanitized = name.trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, '_');
  
  // Ensure it doesn't start with a number (if it does, prefix with _)
  if (/^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  
  return sanitized || 'col';
}

// Helper to determine SQLite type from JS value
function inferType(value) {
  if (value === null || value === undefined) return 'TEXT';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';
  if (typeof value === 'boolean') return 'INTEGER'; // 0 or 1
  return 'TEXT';
}

// Projects
exports.createProject = (name, description) => {
    const stmt = db.prepare('INSERT INTO projects (name, description) VALUES (?, ?)');
    const info = stmt.run(name, description);
    return { id: info.lastInsertRowid, name, description };
};

exports.getAllProjects = () => {
    return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
};

exports.deleteProject = (id, deleteTables = false) => {
    return db.transaction(() => {
        if (deleteTables) {
            // Find all tables in this project
            const tables = db.prepare('SELECT id, table_name FROM _app_tables WHERE project_id = ?').all(id);
            for (const table of tables) {
                db.exec(`DROP TABLE IF EXISTS "${table.table_name}"`);
            }
            db.prepare('DELETE FROM _app_tables WHERE project_id = ?').run(id);
        }
        // If not deleting tables, they will auto-set to NULL due to ON DELETE SET NULL
        
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    })();
};

exports.updateTableMeta = (id, { name, projectId }) => {
    const updates = [];
    const params = [];
    
    if (name) {
        updates.push('name = ?');
        params.push(name);
    }
    
    if (projectId !== undefined) {
        updates.push('project_id = ?');
        // Handle explicit null or valid ID
        params.push(projectId === 'null' || projectId === null ? null : projectId);
    }
    
    if (updates.length === 0) return { success: true };
    
    params.push(id);
    const sql = `UPDATE _app_tables SET ${updates.join(', ')} WHERE id = ?`;
    const info = db.prepare(sql).run(...params);
    return { success: info.changes > 0 };
};

exports.importExcel = (buffer, originalFilename, projectId = null) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0]; // Import first sheet only for now
  const sheet = workbook.Sheets[sheetName];
  
  // Convert to JSON to get headers and data
  const data = xlsx.utils.sheet_to_json(sheet, { defval: null });
  
  if (data.length === 0) {
    throw new Error('Sheet is empty');
  }

  // Generate Table Name
  const timestamp = Date.now();
  const tableName = `t_${timestamp}`;
  
  // Analyze Columns
  const headers = Object.keys(data[0]);
  // Use lower case to track duplicates case-insensitively
  const usedNames = new Set();
  
  const columns = headers.map(header => {
    // Check first few rows to infer type
    let type = 'TEXT';
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const val = data[i][header];
      if (val !== null && val !== '') {
        type = inferType(val);
        break; 
      }
    }
    
    let sanitized = sanitizeColumnName(header);
    
    // Handle duplicates
    let uniqueName = sanitized;
    let counter = 1;
    // Check against existing names in this import (case-insensitive)
    while (usedNames.has(uniqueName.toLowerCase())) {
      uniqueName = `${sanitized}_${counter}`;
      counter++;
    }
    usedNames.add(uniqueName.toLowerCase());

    return {
      original: header,
      name: uniqueName,
      type: type
    };
  });

  // Create Table Transaction
  const createTableTransaction = db.transaction(() => {
    // 1. Create SQLite Table
    const colDefs = columns.map(c => `"${c.name}" ${c.type}`).join(', ');
    db.exec(`CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs});`);

    // 2. Insert Data
    const insertStmt = db.prepare(`
      INSERT INTO "${tableName}" (${columns.map(c => `"${c.name}"`).join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
    `);

    for (const row of data) {
      const values = columns.map(col => {
        let val = row[col.original];
        if (col.type === 'INTEGER' && typeof val === 'boolean') val = val ? 1 : 0;
        return val;
      });
      insertStmt.run(...values);
    }

    // 3. Register in Meta Table
    db.prepare(`
      INSERT INTO _app_tables (name, table_name, columns, project_id)
      VALUES (?, ?, ?, ?)
    `).run(originalFilename.replace(/\.xlsx$/i, ''), tableName, JSON.stringify(columns), projectId);

    return { tableName, columns };
  });

  return createTableTransaction();
};

exports.getAllTables = (projectId = null) => {
    try {
        let sql = 'SELECT * FROM _app_tables ';
        const params = [];

        // Multi-scope support: array of project IDs and/or 'uncategorized'
        if (Array.isArray(projectId)) {
                const includeUncategorized = projectId.includes('uncategorized') || projectId.includes(-1) || projectId.includes('-1');
                const numericIds = projectId
                        .filter(v => v !== null && v !== undefined)
                        .map(v => (typeof v === 'number' ? v : String(v)))
                        .filter(v => v !== 'uncategorized' && v !== '-1')
                        .map(v => parseInt(v, 10))
                        .filter(v => !Number.isNaN(v));

                const clauses = [];
                if (includeUncategorized) clauses.push('project_id IS NULL');
                if (numericIds.length > 0) {
                        clauses.push(`project_id IN (${numericIds.map(() => '?').join(', ')})`);
                        params.push(...numericIds);
                }

                if (clauses.length === 0) {
                        // No valid scopes selected
                        return [];
                }
                sql += `WHERE (${clauses.join(' OR ')}) `;
        } else if (projectId === 'uncategorized' || projectId === -1) {
                sql += 'WHERE project_id IS NULL ';
        } else if (projectId) {
                sql += 'WHERE project_id = ? ';
                params.push(projectId);
        }

        sql += 'ORDER BY created_at DESC';
    
        const tables = db.prepare(sql).all(...params);
        return tables.map(t => ({
            ...t,
            columns: JSON.parse(t.columns)
        }));
    } catch (error) {
        // If table doesn't exist yet, return empty array
        if (error.message.includes('no such table')) return [];
        throw error;
    }
};

exports.getTableData = (tableName, page = 1, pageSize = 50, filters = []) => {
    // Verify tableName exists in _app_tables to prevent SQL injection
    const tableExists = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ?').get(tableName);
    if (!tableExists) {
        throw new Error(`Table ${tableName} not found`);
    }

    const offset = (page - 1) * pageSize;
    
    // Build WHERE clause
    let whereClause = '';
    const params = [];

    // Simple filters implementation for now
    // filters format: [{ column: 'Age', operator: '>', value: 20, logic: 'AND' }]
    if (filters.length > 0) {
        let sql = '';
        const conditions = filters.map((f, index) => {
             // Validate operator to prevent injection
            const validOps = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE'];
            const op = validOps.includes(f.operator) ? f.operator : '=';
            
            // Handle LIKE/NOT LIKE specifically
            if (op === 'LIKE' || op === 'NOT LIKE') {
                params.push(`%${f.value}%`);
            } else {
                params.push(f.value);
            }

            const clause = `"${f.column}" ${op} ?`;
            
            // Add logic operator (AND/OR) for all except the first condition
            if (index > 0) {
                const logic = (f.logic === 'OR') ? 'OR' : 'AND';
                return ` ${logic} ${clause}`;
            }
            return clause;
        });
        whereClause = `WHERE ${conditions.join('')}`;
    }

    const count = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}" ${whereClause}`).get(...params).count;
    const rows = db.prepare(`SELECT * FROM "${tableName}" ${whereClause} LIMIT ? OFFSET ?`).all(...params, pageSize, offset);

    return {
        data: rows,
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize)
    };
};

exports.deleteTable = (id) => {
    const table = db.prepare('SELECT table_name FROM _app_tables WHERE id = ?').get(id);
    if (!table) throw new Error('Table not found');

    const dropTransaction = db.transaction(() => {
        db.exec(`DROP TABLE IF EXISTS "${table.table_name}"`);
        db.prepare('DELETE FROM _app_tables WHERE id = ?').run(id);
    });
    
    return dropTransaction();
};

exports.updateCellValue = (tableName, rowId, column, value) => {
    // Verify table exists
    const tableExists = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ?').get(tableName);
    if (!tableExists) throw new Error(`Table ${tableName} not found`);

    // Update
    const stmt = db.prepare(`UPDATE "${tableName}" SET "${column}" = ? WHERE id = ?`);
    const info = stmt.run(value, rowId);
    
    return { success: info.changes > 0 };
};

exports.exportTable = (tableName) => {
    // Verify table exists and get display name
    const tableMeta = db.prepare('SELECT name, columns FROM _app_tables WHERE table_name = ?').get(tableName);
    if (!tableMeta) throw new Error(`Table ${tableName} not found`);

    // Get Data
    const rows = db.prepare(`SELECT * FROM "${tableName}"`).all();
    
    // Map keys to original names
    const columns = JSON.parse(tableMeta.columns);
    const colMap = {};
    columns.forEach(c => colMap[c.name] = c.original);

    // Transform data for Export (Use original headers)
    const exportData = rows.map(row => {
        const newRow = {};
        Object.keys(row).forEach(key => {
            if (key === 'id') return; // Skip internal ID
            const originalName = colMap[key] || key;
            newRow[originalName] = row[key];
        });
        return newRow;
    });

    // Create Workbook
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(exportData);
    xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
    
    // Write to Buffer
    return {
        filename: `${tableMeta.name}.xlsx`,
        buffer: xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
    };
};

exports.executeQueryAndSave = (sql, newTableName, projectId = null) => {
    // Basic SQL validation to prevent DROP/DELETE/UPDATE/INSERT (Read-onlyish, but we are creating a table)
    // We allow SELECT. We will wrap this in CREATE TABLE AS SELECT or similar logic.
    // Use word boundary check to avoid false positives (e.g. "created_at" containing "CREATE")
    
    const forbidden = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'REPLACE', 'CREATE', 'PRAGMA'];
    const upperSql = sql.toUpperCase();
    
    // Check for forbidden keywords with word boundaries
    const hasForbidden = forbidden.some(word => {
        // Regex: \bWORD\b (word boundary)
        // We escape the word just in case, though these are simple uppercase letters
        const regex = new RegExp(`\\b${word}\\b`);
        return regex.test(upperSql);
    });

    if (hasForbidden) {
        throw new Error('Only SELECT queries are allowed for creating new tables.');
    }

    // Generate internal table name
    const timestamp = Date.now();
    const targetTableName = `t_${timestamp}`;
    
    return db.transaction(() => {
        // 1. Create the table using the query
        try {
            db.exec(`CREATE TABLE "${targetTableName}" AS ${sql}`);
        } catch (e) {
            throw new Error(`Query execution failed: ${e.message}`);
        }
        
        // 2. Inspect the new table to get columns
        const pragmaInfo = db.prepare(`PRAGMA table_info("${targetTableName}")`).all();
        const columns = pragmaInfo.map(col => ({
            original: col.name, // In a query result, name is the header
            name: col.name,     // We just use the same name
            type: col.type || 'TEXT'
        }));
        
        // 3. Register in meta table
        db.prepare(`
            INSERT INTO _app_tables (name, table_name, columns, project_id)
            VALUES (?, ?, ?, ?)
        `).run(newTableName, targetTableName, JSON.stringify(columns), projectId);
        
        return { success: true, tableName: targetTableName };
    })();
};

exports.previewQuery = (sql) => {
    // Basic SQL validation
    const forbidden = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'REPLACE', 'CREATE', 'PRAGMA'];
    const upperSql = sql.toUpperCase();
    
    // Check for forbidden keywords with word boundaries
    const hasForbidden = forbidden.some(word => {
        const regex = new RegExp(`\\b${word}\\b`);
        return regex.test(upperSql);
    });

    if (hasForbidden) {
        throw new Error('Only SELECT queries are allowed for preview.');
    }

    try {
        // Run query with limit for preview
        // We wrap it to limit rows returned to frontend to avoid crash
        // But if user typed LIMIT, we might override it. Let's just run it and take first 50 rows in JS or SQL wrapper.
        // Safer to wrap: SELECT * FROM (user_sql) LIMIT 50
        const previewSql = `SELECT * FROM (${sql}) LIMIT 100`;
        const rows = db.prepare(previewSql).all();
        
        if (rows.length === 0) return { columns: [], data: [] };
        
        // Infer columns from first row (or empty if no data)
        const columns = Object.keys(rows[0]);
        
        return { columns, data: rows };
    } catch (e) {
        throw new Error(`Query execution failed: ${e.message}`);
    }
};
