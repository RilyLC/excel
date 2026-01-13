const db = require('../db');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

// Ensure documents directory exists
const dataDir = process.env.APP_DATA_DIR ? path.resolve(process.env.APP_DATA_DIR) : path.join(__dirname, '../data');
const docsDir = path.join(dataDir, 'documents');
if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
}

// Helper to sanitize column names (SQLite identifiers)
function sanitizeColumnName(name) {
  if (!name) return 'col';
  
  // Allow Chinese characters, alphanumeric, and underscores
  // Replace anything that is NOT (Chinese, Letter, Number, Underscore)
  let sanitized = name.trim().replace(/[^\u4e00-\u9fffa-zA-Z0-9_]/g, '_');
  
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

// Generate unique internal table name to avoid collisions (use UUIDs)
function generateUniqueTableName(prefix = 't') {
  const crypto = require('crypto');

  // Prefer crypto.randomUUID() when available (Node 14.17+); fallback to randomBytes
  for (let i = 0; i < 10; i++) {
    const id = (typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const candidate = `${prefix}_${id}`;
    const existsMeta = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ?').get(candidate);
    const existsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(candidate);
    if (!existsMeta && !existsTable) return candidate;
    // Extremely small chance of collision, retry
  }

  // Fallback to a longer random value if all retries fail
  const fallbackId = (typeof require('crypto').randomUUID === 'function') ? require('crypto').randomUUID() : require('crypto').randomBytes(24).toString('hex');
  return `${prefix}_${fallbackId}`;
}

// Projects
exports.createProject = (name, description, userId) => {
    const stmt = db.prepare('INSERT INTO projects (name, description, user_id) VALUES (?, ?, ?)');
    const info = stmt.run(name, description, userId);
    return { id: info.lastInsertRowid, name, description, user_id: userId };
};

exports.getAllProjects = (userId) => {
    return db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC').all(userId);
};

exports.deleteProject = (id, deleteTables = false, userId) => {
    return db.transaction(() => {
        // Verify ownership
        const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(id, userId);
        if (!project) {
            // Check if it exists at all to give better error? Or just act idempotent.
            // For security, just say not found or success (idempotent).
            // Let's assume strict check.
            const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
            if (exists) throw new Error('项目不存在或没有权限');
            return; // Not found, ignore
        }

        if (deleteTables) {
            // Find all tables in this project
            const tables = db.prepare('SELECT id, table_name, type, file_path FROM _app_tables WHERE project_id = ?').all(id);
            for (const table of tables) {
                if (table.type === 'document' && table.file_path) {
                    const filePath = path.join(docsDir, table.file_path);
                    if (fs.existsSync(filePath)) {
                        try { fs.unlinkSync(filePath); } catch(e) { console.error('Failed to delete file', e); }
                    }
                } else {
                    db.exec(`DROP TABLE IF EXISTS "${table.table_name}"`);
                }
            }
            db.prepare('DELETE FROM _app_tables WHERE project_id = ?').run(id);
        }
        // If not deleting tables, they will auto-set to NULL due to ON DELETE SET NULL
        
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    })();
};

exports.updateProject = (id, name, description, userId) => {
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
    params.push(userId);
    const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
    const info = db.prepare(sql).run(...params);
    
    // Check if updated anything
    if (info.changes === 0) {
         const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
         if (exists) throw new Error('项目不存在或没有权限');
         // else not found
    }
    
    return { success: info.changes > 0 };
};

exports.updateTableMeta = (id, { name, projectId, columns }, userId) => {
    const updates = [];
    const params = [];

    // Verify ownership
    const table = db.prepare('SELECT id FROM _app_tables WHERE id = ? AND user_id = ?').get(id, userId);
    if (!table) throw new Error('表不存在或没有权限');
    
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
    const sql = `UPDATE _app_tables SET ${updates.join(', ')} WHERE id = ?`; // Already verified ownership
    const info = db.prepare(sql).run(...params);
    return { success: info.changes > 0 };
};

exports.importExcel = async (buffer, originalFilename, projectId = null, userId) => {
  const ext = path.extname(originalFilename).toLowerCase();
  
  if (ext === '.docx' || ext === '.txt' || ext === '.csv') {
      const name = originalFilename.replace(/\.[^/.]+$/, "");
      const filename = `${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
      const filePath = path.join(docsDir, filename);
      
      fs.writeFileSync(filePath, buffer);
      
      const pid = (projectId === 'null' || projectId === 'undefined' || projectId === '') ? null : projectId;
      const tableName = generateUniqueTableName('doc');
      
      const insertMeta = db.prepare(`
        INSERT INTO _app_tables (name, table_name, columns, project_id, user_id, type, file_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      // We need the ID for indexing, run synchronously
      const info = insertMeta.run(name, tableName, '[]', pid, userId, 'document', filename);
      const tableId = info.lastInsertRowid;
      
      // --- Indexing for Search ---
      try {
          let content = '';
          if (ext === '.txt' || ext === '.csv') {
               content = buffer.toString('utf8');
          } else if (ext === '.docx') {
               const result = await mammoth.extractRawText({ buffer: buffer });
               content = result.value;
          }
          
          if (content) {
              db.prepare('INSERT INTO _document_index (table_id, content) VALUES (?, ?)').run(tableId, content);
          }
      } catch (err) {
          console.error("Failed to index document during upload:", err);
      }
      
      return { tableName, type: 'document' };
  }

  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0]; // Import first sheet only for now
  const sheet = workbook.Sheets[sheetName];
  
  // Convert to JSON to get headers and data
  // Use header: 1 to get array of arrays for CSV handling robustness, or stick to sheet_to_json
  // For CSV/XLS compatibility, sheet_to_json works well if sheet is parsed correctly.
  const data = xlsx.utils.sheet_to_json(sheet, { defval: null });
  
  if (data.length === 0) {
    throw new Error('表格为空');
  }

  // Generate Table Name (ensure uniqueness)
  const tableName = generateUniqueTableName('t');
  
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
      INSERT INTO _app_tables (name, table_name, columns, project_id, user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, tableName, JSON.stringify(columns), pid, userId);

    return { tableName, columns };
  });

  return createTableTransaction();
};

exports.getAllTables = (projectId = null, userId) => {
    try {
        let sql = 'SELECT * FROM _app_tables WHERE user_id = ? ';
        const params = [userId];

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

                if (clauses.length > 0) {
                    sql += `AND (${clauses.join(' OR ')}) `;
                }
                // If clauses invalid, maybe return empty? But here we are already filtering by user_id so it's safe to show "nothing inside this project selection"
        } else if (projectId === 'uncategorized' || projectId === -1) {
                sql += 'AND project_id IS NULL ';
        } else if (projectId) {
                sql += 'AND project_id = ? ';
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

exports.getTableData = (tableName, page = 1, pageSize = 50, filters = [], sorts = [], groups = [], userId) => {
    // Verify tableName exists in _app_tables AND belongs to user
    const tableExists = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ? AND user_id = ?').get(tableName, userId);
    if (!tableExists) {
        throw new Error(`表 ${tableName} 未找到或没有权限`);
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

exports.getTableAggregates = (tableName, filters = [], aggregates = {}, userId) => {
    // Verify tableName exists
    const tableExists = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ? AND user_id = ?').get(tableName, userId);
    if (!tableExists) {
        throw new Error(`表 ${tableName} 未找到或没有权限`);
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

exports.deleteTable = (id, userId) => {
    // Verify ownership
    const table = db.prepare('SELECT table_name, type, file_path FROM _app_tables WHERE id = ? AND user_id = ?').get(id, userId);
    if (!table) throw new Error('表未找到或没有权限');

    const dropTransaction = db.transaction(() => {
        if (table.type === 'document' && table.file_path) {
             const filePath = path.join(docsDir, table.file_path);
             // 1. Delete File
             if (fs.existsSync(filePath)) {
                 try { fs.unlinkSync(filePath); } catch(e) { console.error('Failed to delete file', e); }
             }
             // 2. Delete Index
             db.prepare('DELETE FROM _document_index WHERE table_id = ?').run(id);
        } else {
             db.exec(`DROP TABLE IF EXISTS "${table.table_name}"`);
        }
        db.prepare('DELETE FROM _app_tables WHERE id = ?').run(id);
    });
    
    return dropTransaction();
};

exports.updateCellValue = (tableName, rowId, column, value, userId) => {
    // Verify table exists AND belongs to user
    const tableExists = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ? AND user_id = ?').get(tableName, userId);
    if (!tableExists) throw new Error(`表 ${tableName} 未找到或没有权限`);

    // Update
    const stmt = db.prepare(`UPDATE "${tableName}" SET "${column}" = ? WHERE id = ?`);
    const info = stmt.run(value, rowId);
    
    return { success: info.changes > 0 };
};

exports.exportTable = (tableName, userId) => {
    // Verify table exists and get display name
    const tableMeta = db.prepare('SELECT name, columns FROM _app_tables WHERE table_name = ? AND user_id = ?').get(tableName, userId);
    if (!tableMeta) throw new Error(`表 ${tableName} 未找到或没有权限`);

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

const validateReadOnlySelect = (sql, userId) => {
    // 1. Basic Keyword Check
    const forbidden = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'REPLACE', 'CREATE', 'PRAGMA', 'VACUUM', 'ATTACH', 'DETACH', 'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK'];
    const upperSql = sql.toUpperCase();
    
    const hasForbidden = forbidden.some(word => {
        const regex = new RegExp(`\\b${word}\\b`);
        return regex.test(upperSql);
    });

    if (hasForbidden) {
        throw new Error('只允许执行 SELECT 查询。');
    }

    // 2. System Tables Check
    const systemTables = ['_app_tables', '_document_index', 'users', 'projects', 'sqlite_master', 'sqlite_sequence'];
    const hasSystemTable = systemTables.some(tbl => {
        const pattern = new RegExp(`\\b${tbl}\\b|"${tbl}"`, 'i');
        return pattern.test(sql);
    });
    if (hasSystemTable) throw new Error('禁止访问系统表。');

    // 4. User Isolation Check (Optimized: Allowlist approach)
    // Extract potential table names (pattern t_<uuid> or doc_<uuid> or hex) from SQL, supporting quoted identifiers
    // This avoids checking every single other user's table (O(N_total) -> O(N_my_tables))
    const tableNamePattern = /(?:"((?:t|doc)_[0-9a-fA-F-]{6,})"|\b((?:t|doc)_[0-9a-fA-F-]{6,})\b)/g;
    const matches = [];
    let m;
    while ((m = tableNamePattern.exec(sql)) !== null) {
        matches.push(m[1] || m[2]);
    }
    
    if (matches.length > 0) {
        // Get all DATA TABLES owned by current user (exclude documents)
        const myTables = db.prepare("SELECT table_name FROM _app_tables WHERE user_id = ? AND (type = 'table' OR type IS NULL)").all(userId);
        const myTableSet = new Set(myTables.map(t => t.table_name));
        
        const uniqueMatches = [...new Set(matches)]; // remove duplicates check
        
        for (const tbl of uniqueMatches) {
            // Verify if the referenced table is in my allowed list
            if (!myTableSet.has(tbl)) {
                 // It's either someone else's table, a document (not a table), or non-existent
                 // In all cases, we block it for security.
                throw new Error(`没有权限访问 '${tbl}' 或表不存在`);
            }
        }
    }
    
    // Also protect against using 'users' or 'projects' via whatever casing if checking strictly
    // (Already covered by systemTables regex with 'i' flag)
};

exports._validateReadOnlySelect = validateReadOnlySelect;

exports.executeQueryAndSave = (sql, newTableName, projectId = null, userId) => {
    try {
        validateReadOnlySelect(sql, userId);
    } catch (e) {
        throw new Error(e.message);
    }

    // Generate internal table name (ensure uniqueness)
    const targetTableName = generateUniqueTableName('t');
    
    return db.transaction(() => {
        // 1. Create the table using the query
        try {
            db.exec(`CREATE TABLE "${targetTableName}" AS ${sql}`);
        } catch (e) {
            throw new Error(`查询执行失败: ${e.message}`);
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
            INSERT INTO _app_tables (name, table_name, columns, project_id, user_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(newTableName, targetTableName, JSON.stringify(columns), projectId, userId);
        
        return { success: true, tableName: targetTableName };
    })();
};

exports.previewQuery = (sql, userId) => {
    try {
        validateReadOnlySelect(sql, userId);
    } catch (e) {
        throw new Error(e.message); // Re-throw
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
        throw new Error(`查询执行失败: ${e.message}`);
    }
};

exports.addRow = (tableName, rowData = {}, position = null, userId) => {
    // Verify table exists AND belongs to user
    const tableMeta = db.prepare('SELECT columns FROM _app_tables WHERE table_name = ? AND user_id = ?').get(tableName, userId);
    if (!tableMeta) throw new Error(`表 ${tableName} 未找到或没有权限`);

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

exports.deleteRow = (tableName, rowId, userId) => {
    // Verify table exists AND belongs to user
    const tableExists = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ? AND user_id = ?').get(tableName, userId);
    if (!tableExists) throw new Error(`表 ${tableName} 未找到或没有权限`);

    const info = db.prepare(`DELETE FROM "${tableName}" WHERE id = ?`).run(rowId);
    return { success: info.changes > 0 };
};

exports.addColumn = (tableName, columnName, columnType = 'TEXT', userId) => {
    // Verify table exists AND belongs to user
    const tableMeta = db.prepare('SELECT id, columns FROM _app_tables WHERE table_name = ? AND user_id = ?').get(tableName, userId);
    if (!tableMeta) throw new Error(`表 ${tableName} 未找到或没有权限`);

    const sanitizedName = sanitizeColumnName(columnName);
    
    // Check for duplicate
    const currentColumns = JSON.parse(tableMeta.columns);
    if (currentColumns.some(c => c.name.toLowerCase() === sanitizedName.toLowerCase())) {
        throw new Error(`列 ${sanitizedName} 已存在`);
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

exports.deleteColumn = (tableName, columnName, userId) => {
    // Verify table exists AND belongs to user
    const tableMeta = db.prepare('SELECT id, columns FROM _app_tables WHERE table_name = ? AND user_id = ?').get(tableName, userId);
    if (!tableMeta) throw new Error(`表 ${tableName} 未找到或没有权限`);

    const currentColumns = JSON.parse(tableMeta.columns);
    const colIndex = currentColumns.findIndex(c => c.name === columnName);
    
    if (colIndex === -1) throw new Error(`列 ${columnName} 未找到`);

    return db.transaction(() => {
        // 1. Alter Table (Try DROP COLUMN)
        try {
            db.exec(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`);
        } catch (e) {
            // Fallback for older SQLite if needed (Create new table, copy data, rename)
            // But we assume newer SQLite here.
            throw new Error(`删除列失败: ${e.message}`);
        }
        
        // 2. Update Meta
        const newColumns = currentColumns.filter(c => c.name !== columnName);
        db.prepare('UPDATE _app_tables SET columns = ? WHERE id = ?').run(JSON.stringify(newColumns), tableMeta.id);
        
        return { success: true };
    })();
};
exports.getDocumentContent = (id, userId) => {
    const table = db.prepare('SELECT file_path, name, type FROM _app_tables WHERE id = ? AND user_id = ?').get(id, userId);
    if (!table) throw new Error('Document not found or access denied');
    
    if (table.type !== 'document' || !table.file_path) {
        throw new Error('Requested resource is not a document');
    }
    
    const filePath = path.join(docsDir, table.file_path);
    if (!fs.existsSync(filePath)) {
        throw new Error('File not found on server');
    }
    
    return { 
        filePath, 
        originalName: table.name, 
        ext: path.extname(table.file_path)
    };
};

