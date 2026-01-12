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

exports.updateProject = (id, name, description) => {
    const updates = [];
    const params = [];
    
    if (name) {
        updates.push('name = ?');
        params.push(name);
    }
    
    if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
    }
    
    if (updates.length === 0) return { success: true };
    
    params.push(id);
    const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`;
    const info = db.prepare(sql).run(...params);
    return { success: info.changes > 0 };
};

exports.updateTableMeta = (id, { name, projectId, columns }) => {
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

    if (columns) {
        updates.push('columns = ?');
        // Ensure columns is stringified if it's an object/array
        const colStr = typeof columns === 'string' ? columns : JSON.stringify(columns);
        params.push(colStr);
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
  // Use header: 1 to get array of arrays for CSV handling robustness, or stick to sheet_to_json
  // For CSV/XLS compatibility, sheet_to_json works well if sheet is parsed correctly.
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
        // Handle boolean conversion for SQLite
        if (col.type === 'INTEGER' && typeof val === 'boolean') val = val ? 1 : 0;
        return val;
      });
      insertStmt.run(...values);
    }

    // 3. Register in Meta Table
    // Strip extension from filename for display name
    const name = originalFilename.replace(/\.[^/.]+$/, "");
    
    // Handle explicit null string or null value for projectId
    const pid = (projectId === 'null' || projectId === 'undefined' || projectId === '') ? null : projectId;

    db.prepare(`
      INSERT INTO _app_tables (name, table_name, columns, project_id)
      VALUES (?, ?, ?, ?)
    `).run(name, tableName, JSON.stringify(columns), pid);

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

exports.getTableData = (tableName, page = 1, pageSize = 50, filters = [], sorts = [], groups = []) => {
// --- Shared WHERE Builder ---
function buildWhereCondition(filterItem, params) {
    // Case 1: Group (has 'items')
    if (filterItem.items && Array.isArray(filterItem.items) && filterItem.items.length > 0) {
        const clauses = filterItem.items.map(item => buildWhereCondition(item, params)).filter(c => c);
        if (clauses.length === 0) return '';
        return `(${clauses.join(` ${filterItem.logic || 'AND'} `)})`;
    }
    
    // Case 2: Condition (has 'column')
    if (filterItem.column) {
        const validOps = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IS EMPTY', 'IS NOT EMPTY'];
        const op = validOps.includes(filterItem.operator) ? filterItem.operator : '=';
        
        if (op === 'IS EMPTY') {
            return `("${filterItem.column}" IS NULL OR "${filterItem.column}" = '')`;
        }
        if (op === 'IS NOT EMPTY') {
           return `("${filterItem.column}" IS NOT NULL AND "${filterItem.column}" != '')`;
        }

        if (op === 'LIKE' || op === 'NOT LIKE') {
            params.push(`%${filterItem.value}%`);
        } else {
            params.push(filterItem.value);
        }
        return `"${filterItem.column}" ${op} ?`;
    }
    
    return '';
}

function buildWhereClause(filters, params) {
    let whereClause = '';
    // Support legacy flat array or new root group object
    if (Array.isArray(filters)) {
        if (filters.length > 0) {
             const conditions = filters.map((f, index) => {
                 const validOps = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IS EMPTY', 'IS NOT EMPTY'];
                 const op = validOps.includes(f.operator) ? f.operator : '=';
                 
                 if (op === 'IS EMPTY') {
                     const clause = `("${f.column}" IS NULL OR "${f.column}" = '')`;
                     if (index > 0) {
                         const logic = (f.logic === 'OR') ? 'OR' : 'AND';
                         return ` ${logic} ${clause}`;
                     }
                     return clause;
                 }
                 if (op === 'IS NOT EMPTY') {
                     const clause = `("${f.column}" IS NOT NULL AND "${f.column}" != '')`;
                     if (index > 0) {
                         const logic = (f.logic === 'OR') ? 'OR' : 'AND';
                         return ` ${logic} ${clause}`;
                     }
                     return clause;
                 }
    
                 if (op === 'LIKE' || op === 'NOT LIKE') params.push(`%${f.value}%`);
                 else params.push(f.value);
                 const clause = `"${f.column}" ${op} ?`;
                 if (index > 0) {
                     const logic = (f.logic === 'OR') ? 'OR' : 'AND';
                     return ` ${logic} ${clause}`;
                 }
                 return clause;
            });
            whereClause = `WHERE ${conditions.join('')}`;
        }
    } else if (typeof filters === 'object' && filters !== null) {
        // It's a root group
        const sql = buildWhereCondition(filters, params);
        if (sql) whereClause = `WHERE ${sql}`;
    }
    return whereClause;
}

exports.getTableData = (tableName, page = 1, pageSize = 50, filters = [], sorts = [], groups = []) => {
    // Verify tableName exists in _app_tables to prevent SQL injection
    const tableExists = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ?').get(tableName);
    if (!tableExists) {
        throw new Error(`Table ${tableName} not found`);
    }

    // Check if _sort_order exists
    const hasSortOrder = db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = '_sort_order'`).get(tableName);

    const offset = (page - 1) * pageSize;
    const params = [];

    // --- 1. Build Recursive WHERE Clause ---
    const whereClause = buildWhereClause(filters, params);

    // --- 2. Build ORDER BY (Handling Groups as Primary Sort) ---

    // We do NOT use SQL GROUP BY because we want to display all rows grouped visually.
    // So we treat 'groups' as the primary sort keys.
    const selectClause = 'SELECT *';
    
    let orderByParts = [];
    
    // 1. Add Groups to Sort Order
    if (groups && groups.length > 0) {
        const validGroups = groups.filter(g => typeof g === 'string' && !g.includes('"'));
        validGroups.forEach(g => {
             // Use existing sort direction if specified, otherwise ASC
             const existingSort = sorts.find(s => s.column === g);
             const dir = existingSort ? (existingSort.direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC') : 'ASC';
             orderByParts.push(`"${g}" ${dir}`);
        });
    }
    
    // 2. Add remaining Sorts
    if (sorts && sorts.length > 0) {
        sorts.forEach(s => {
            // Skip if already added via groups
            if (groups && groups.includes(s.column)) return;
            
            const dir = s.direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            if (typeof s.column === 'string' && !s.column.includes('"')) {
                orderByParts.push(`"${s.column}" ${dir}`);
            }
        });
    } else if (orderByParts.length === 0 && hasSortOrder) {
        // Default sort by _sort_order if no other sorts
        orderByParts.push('"_sort_order" ASC');
    }

    let orderByClause = '';
    if (orderByParts.length > 0) {
        orderByClause = `ORDER BY ${orderByParts.join(', ')}`;
    } else {
        // Fallback to ID if no sorts and no _sort_order (though usually ID is implicit)
        orderByClause = 'ORDER BY "id" ASC';
    }

    // --- 3. Execute ---
    // Count total matches
    const countSql = `SELECT COUNT(*) as count FROM "${tableName}" ${whereClause}`;
    
    const count = db.prepare(countSql).get(...params).count;
    
    // No GROUP BY clause in SQL
    const sql = `${selectClause} FROM "${tableName}" ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`;
    const rows = db.prepare(sql).all(...params, pageSize, offset);

    return {
        data: rows,
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize)
    };
};

exports.getTableAggregates = (tableName, filters = [], aggregates = {}) => {
    // Verify tableName exists
    const tableExists = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ?').get(tableName);
    if (!tableExists) {
        throw new Error(`Table ${tableName} not found`);
    }

    const params = [];
    const whereClause = buildWhereClause(filters, params);
    
    // Build Select Clause for Aggregates
    // aggregates: { columnName: 'SUM', otherColumn: 'AVG', ... }
    const validAggs = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'];
    const selectParts = [];
    
    Object.entries(aggregates).forEach(([column, aggFunc]) => {
        if (!column || !aggFunc) return;
        const func = aggFunc.toUpperCase();
        if (validAggs.includes(func)) {
             // For COUNT, if column is specified, we count non-nulls. 
             // COUNT(*) is usually better but here we are per-column.
             // SQLite: COUNT(col) counts non-nulls.
             selectParts.push(`${func}("${column}") as "${column}"`);
        }
    });
    
    if (selectParts.length === 0) {
        return {};
    }
    
    const sql = `SELECT ${selectParts.join(', ')} FROM "${tableName}" ${whereClause}`;
    
    try {
        const result = db.prepare(sql).get(...params);
        return result;
    } catch (e) {
        console.error('Aggregate error:', e);
        // If error (e.g. type mismatch in SUM), return nulls or empty
        return {};
    }
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

exports.addRow = (tableName, rowData = {}, position = null) => {
    // Verify table exists
    const tableMeta = db.prepare('SELECT columns FROM _app_tables WHERE table_name = ?').get(tableName);
    if (!tableMeta) throw new Error(`Table ${tableName} not found`);

    const columns = JSON.parse(tableMeta.columns);
    const validColumns = columns.map(c => c.name);
    
    // Check/Create _sort_order column if position is used
    if (position && position.rowId) {
        const hasSortOrder = db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = '_sort_order'`).get(tableName);
        if (!hasSortOrder) {
            db.transaction(() => {
                db.exec(`ALTER TABLE "${tableName}" ADD COLUMN "_sort_order" REAL`);
                // Initialize existing rows with their ID as order
                db.exec(`UPDATE "${tableName}" SET "_sort_order" = id`);
            })();
        }
    }

    // Determine Order
    let newOrder = null;
    if (position && position.rowId) {
        // Find anchor row order
        const anchorRow = db.prepare(`SELECT "_sort_order", "id" FROM "${tableName}" WHERE id = ?`).get(position.rowId);
        
        if (anchorRow) {
            // If anchor row has no order (shouldn't happen due to init above, but safety check)
            const anchorOrder = anchorRow._sort_order || anchorRow.id;
            
            if (position.direction === 'before') {
                // Find previous row
                const prevRow = db.prepare(`SELECT "_sort_order" FROM "${tableName}" WHERE "_sort_order" < ? ORDER BY "_sort_order" DESC LIMIT 1`).get(anchorOrder);
                const prevOrder = prevRow ? prevRow._sort_order : (anchorOrder - 1.0);
                newOrder = (anchorOrder + prevOrder) / 2.0;
            } else {
                // After
                const nextRow = db.prepare(`SELECT "_sort_order" FROM "${tableName}" WHERE "_sort_order" > ? ORDER BY "_sort_order" ASC LIMIT 1`).get(anchorOrder);
                const nextOrder = nextRow ? nextRow._sort_order : (anchorOrder + 1.0);
                newOrder = (anchorOrder + nextOrder) / 2.0;
            }
        }
    }
    
    // If we didn't calculate an order (e.g. no position or invalid anchor), 
    // AND the table has _sort_order column, we should set it to max + 1 to keep it at end
    if (newOrder === null) {
        const hasSortOrder = db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = '_sort_order'`).get(tableName);
        if (hasSortOrder) {
            const maxRow = db.prepare(`SELECT MAX("_sort_order") as maxOrder FROM "${tableName}"`).get();
            // If table is empty, start at 1.0. If not, max + 1.0
            newOrder = (maxRow && maxRow.maxOrder) ? maxRow.maxOrder + 1.0 : 1.0;
        }
    }

    const insertCols = [];
    const insertVals = [];
    
    Object.keys(rowData).forEach(key => {
        if (validColumns.includes(key)) {
            insertCols.push(`"${key}"`);
            insertVals.push(rowData[key]);
        }
    });
    
    if (newOrder !== null) {
        insertCols.push('"_sort_order"');
        insertVals.push(newOrder);
    }
    
    if (insertCols.length === 0) {
        // Insert empty row (default values)
        const stmt = db.prepare(`INSERT INTO "${tableName}" DEFAULT VALUES`);
        const info = stmt.run();
        // Update order if needed after insert? No, DEFAULT VALUES can't set specific col.
        // We need to UPDATE immediately if we have order.
        if (newOrder !== null) {
            db.prepare(`UPDATE "${tableName}" SET "_sort_order" = ? WHERE id = ?`).run(newOrder, info.lastInsertRowid);
        }
        return { id: info.lastInsertRowid };
    }
    
    const placeholders = insertVals.map(() => '?').join(', ');
    const sql = `INSERT INTO "${tableName}" (${insertCols.join(', ')}) VALUES (${placeholders})`;
    const info = db.prepare(sql).run(...insertVals);
    
    return { id: info.lastInsertRowid };
};

exports.deleteRow = (tableName, rowId) => {
    // Verify table exists
    const tableExists = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ?').get(tableName);
    if (!tableExists) throw new Error(`Table ${tableName} not found`);

    const info = db.prepare(`DELETE FROM "${tableName}" WHERE id = ?`).run(rowId);
    return { success: info.changes > 0 };
};

exports.addColumn = (tableName, columnName, columnType = 'TEXT') => {
    // Verify table exists
    const tableMeta = db.prepare('SELECT id, columns FROM _app_tables WHERE table_name = ?').get(tableName);
    if (!tableMeta) throw new Error(`Table ${tableName} not found`);

    const sanitizedName = sanitizeColumnName(columnName);
    
    // Check for duplicate
    const currentColumns = JSON.parse(tableMeta.columns);
    if (currentColumns.some(c => c.name.toLowerCase() === sanitizedName.toLowerCase())) {
        throw new Error(`Column ${sanitizedName} already exists`);
    }

    return db.transaction(() => {
        // 1. Alter Table
        db.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${sanitizedName}" ${columnType}`);
        
        // 2. Update Meta
        const newColumns = [...currentColumns, { name: sanitizedName, original: columnName, type: columnType }];
        db.prepare('UPDATE _app_tables SET columns = ? WHERE id = ?').run(JSON.stringify(newColumns), tableMeta.id);
        
        return { success: true, column: { name: sanitizedName, original: columnName, type: columnType } };
    })();
};

exports.deleteColumn = (tableName, columnName) => {
    // Verify table exists
    const tableMeta = db.prepare('SELECT id, columns FROM _app_tables WHERE table_name = ?').get(tableName);
    if (!tableMeta) throw new Error(`Table ${tableName} not found`);

    const currentColumns = JSON.parse(tableMeta.columns);
    const colIndex = currentColumns.findIndex(c => c.name === columnName);
    
    if (colIndex === -1) throw new Error(`Column ${columnName} not found`);

    return db.transaction(() => {
        // 1. Alter Table (Try DROP COLUMN)
        try {
            db.exec(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`);
        } catch (e) {
            // Fallback for older SQLite if needed (Create new table, copy data, rename)
            // But we assume newer SQLite here.
            throw new Error(`Failed to delete column: ${e.message}`);
        }
        
        // 2. Update Meta
        const newColumns = currentColumns.filter(c => c.name !== columnName);
        db.prepare('UPDATE _app_tables SET columns = ? WHERE id = ?').run(JSON.stringify(newColumns), tableMeta.id);
        
        return { success: true };
    })();
};
}