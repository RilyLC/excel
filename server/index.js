const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const tableService = require('./services/tableService');
const authService = require('./services/authService');
const { authenticateToken, requirePermission } = require('./middleware/authMiddleware');
const db = require('./db');

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Upload config (memory storage for processing)
const upload = multer({ storage: multer.memoryStorage() });

// Routes

// --- Auth Routes (Public) ---
// app.post('/api/auth/register', (req, res) => {
//     try {
//         const { username, password } = req.body;
//         if (!username || !password) return res.status(400).json({ error: '用户名和密码是必填项' });
//         const user = authService.register(username, password);
//         res.json(user);
//     } catch (err) {
//         res.status(400).json({ error: err.message });
//     }
// });

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: '用户名和密码是必填项' });
        const result = authService.login(username, password);
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

// --- Middleware for Protected Routes ---
// Apply to all /api routes defined BELOW this point
app.use('/api', authenticateToken);

// --- Auth Routes (Protected) ---
app.post('/api/auth/change-password', (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body || {};
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: '原密码和新密码是必填项' });
        }
        const result = authService.changePassword(req.user.id, oldPassword, newPassword);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Projects API
app.get('/api/projects', (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.permissions?.view_all;
        const projects = tableService.getAllProjects(req.user.id, isAdmin);
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: '项目名称是必填项' });
        const project = tableService.createProject(name, description, req.user.id);
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/projects/:id', (req, res) => {
    try {
        const { name, description } = req.body;
        const result = tableService.updateProject(req.params.id, name, description, req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/projects/:id', requirePermission('can_delete'), (req, res) => {
    try {
        const deleteTables = req.query.deleteTables === 'true';
        const isAdmin = req.user.role === 'admin' || req.user.permissions?.can_delete; 
        tableService.deleteProject(req.params.id, deleteTables, req.user.id, isAdmin);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. List all tables (Filtered by Project)
app.get('/api/tables', (req, res) => {
  try {
    // If projectId is 'uncategorized' string, pass it directly
    const projectId = req.query.projectId === 'uncategorized' ? 'uncategorized' : (req.query.projectId ? parseInt(req.query.projectId) : null);
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.view_all;
    const tables = tableService.getAllTables(projectId, req.user.id, isAdmin);
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Table Meta (Project/Name)
app.put('/api/tables/:id', requirePermission('can_edit'), (req, res) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user.role === 'admin';
        const result = tableService.updateTableMeta(id, req.body, req.user.id, isAdmin);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Upload Excel
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    
    // Fix filename encoding (latin1 -> utf8)
    const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
    const sheetName = req.body.sheetName || null;
    const customName = req.body.tableName || null;
    const headerRowIndex = req.body.headerRowIndex ? parseInt(req.body.headerRowIndex) : 0;
    
    // Using await since importExcel is async now
    const result = await tableService.importExcel(req.file.buffer, originalname, projectId, req.user.id, sheetName, customName, headerRowIndex);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Table Data (Dynamic CRUD)
app.get('/api/tables/:tableName/data', (req, res) => {
  try {
    const { tableName } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    
    // Parse complex params
    let filters = [];
    let sorts = [];
    let groups = [];

    if (req.query.filters) {
        try { filters = JSON.parse(req.query.filters); } catch (e) { console.error('筛选异常', e); }
    }
    if (req.query.sorts) {
        try { sorts = JSON.parse(req.query.sorts); } catch (e) { console.error('排序异常', e); }
    }
    if (req.query.groups) {
        try { groups = JSON.parse(req.query.groups); } catch (e) { console.error('分组异常', e); }
    }

    const isAdmin = req.user.role === 'admin' || req.user.permissions?.view_all;
    const result = tableService.getTableData(tableName, page, pageSize, filters, sorts, groups, req.user.id, isAdmin);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Document Content
app.get('/api/documents/:id/content', (req, res) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user.role === 'admin' || req.user.permissions?.view_all;
        const { filePath, originalName } = tableService.getDocumentContent(id, req.user.id, isAdmin);
        res.download(filePath, originalName);
    } catch (err) {
        if (err.message.includes('not found') || err.message.includes('not a document')) {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

// 3.0.1 Get Table Aggregates
app.get('/api/tables/:tableName/aggregates', (req, res) => {
    try {
        const { tableName } = req.params;
        let filters = [];
        let aggregates = {};

        if (req.query.filters) {
            try { filters = JSON.parse(req.query.filters); } catch (e) { console.error('筛选异常', e); }
        }
        if (req.query.aggregates) {
            try { aggregates = JSON.parse(req.query.aggregates); } catch (e) { console.error('聚合异常', e); }
        }

        const isAdmin = req.user.role === 'admin' || req.user.permissions?.view_all;
        const result = tableService.getTableAggregates(tableName, filters, aggregates, req.user.id, isAdmin);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.1 Locate Row (for jump without filtering)
// Computes the page where a given row id would appear under default ordering (id ASC)
app.get('/api/tables/:tableName/rows/:id/locate', (req, res) => {
    try {
        const { tableName, id } = req.params;
        const pageSize = Math.max(1, parseInt(req.query.pageSize, 10) || 50);
        const rowId = Number(id);
        if (!Number.isFinite(rowId)) return res.status(400).json({ error: '无效行ID' });
        if (typeof tableName !== 'string' || tableName.includes('"')) {
            return res.status(400).json({ error: '无效表名' });
        }
        
        // Verify ownership manually since this logic is inline
        const isOwned = db.prepare('SELECT 1 FROM _app_tables WHERE table_name = ? AND user_id = ?').get(tableName, req.user.id);
        if (!isOwned) return res.status(404).json({ error: '表不存在或权限不足' });

        const exists = db.prepare(`SELECT 1 as ok FROM "${tableName}" WHERE id = ? LIMIT 1`).get(rowId);
        if (!exists) return res.status(404).json({ error: '行不存在' });

        // rank in id ASC order: count rows with id < rowId
        const rankRes = db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}" WHERE id < ?`).get(rowId);
        const rank0 = (rankRes?.cnt || 0); // 0-based index
        const page = Math.floor(rank0 / pageSize) + 1;
        const indexInPage = rank0 % pageSize;
        const rowNumber = rank0 + 1;
        res.json({ page, indexInPage, rowNumber, pageSize, rowId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Delete Table
app.delete('/api/tables/:id', requirePermission('can_delete'), (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.permissions?.can_delete;
    tableService.deleteTable(req.params.id, req.user.id, isAdmin);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
    }
});

// 6. Update Cell Data
app.put('/api/tables/:tableName/rows/:id', requirePermission('can_edit'), (req, res) => {
    try {
        const { tableName, id } = req.params;
        const { column, value } = req.body; 
        
        const isAdmin = req.user.role === 'admin';
        tableService.updateCellValue(tableName, id, column, value, req.user.id, isAdmin);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Export Table
app.get('/api/tables/:tableName/export', (req, res) => {
    try {
        const { tableName } = req.params;
        const isAdmin = req.user.role === 'admin' || req.user.permissions?.view_all;
        const result = tableService.exportTable(tableName, req.user.id, isAdmin);
        
        // Encode filename for header
        const filename = encodeURIComponent(result.filename);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(result.buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Global Search
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q; // String search
        const filtersRaw = req.query.filters ? JSON.parse(req.query.filters) : null; // Advanced filters (array legacy or group object)
        const projectId = req.query.projectId; // Legacy single-scope filter
        const projectIdsRaw = req.query.projectIds; // Multi-scope filter (JSON array)
        
        // If no search query and no filters, return empty
        const hasAnyFilter = Array.isArray(filtersRaw)
            ? filtersRaw.length > 0
            : (filtersRaw && typeof filtersRaw === 'object' && Array.isArray(filtersRaw.items) && filtersRaw.items.length > 0);
        if (!query && !hasAnyFilter) return res.json([]);

        // Get all tables to search through (scoped to user)
        const isAdmin = req.user.role === 'admin' || req.user.permissions?.view_all;
        let tables = tableService.getAllTables(null, req.user.id, isAdmin);
        
        // Filter by project scope if requested
        if (projectIdsRaw) {
            let scopes = [];
            try {
                scopes = JSON.parse(projectIdsRaw);
            } catch (e) {
                // Fallback: comma-separated list
                scopes = String(projectIdsRaw).split(',').map(s => s.trim()).filter(Boolean);
            }
            if (Array.isArray(scopes) && scopes.length > 0) {
                tables = tableService.getAllTables(scopes, req.user.id, isAdmin);
            } else {
                // Explicitly scoped to nothing => no results
                return res.json([]);
            }
        } else if (projectId) {
            const scopeId = projectId === 'uncategorized' ? 'uncategorized' : parseInt(projectId);
            if (!isNaN(scopeId) || scopeId === 'uncategorized') {
                tables = tableService.getAllTables(scopeId, req.user.id, isAdmin);
            }
        }

        // Pre-fetch document content matches (Optimization: 1 Query instead of N)
        let docContentMap = new Map();
        if (query) {
            try {
                const docMatches = db.prepare('SELECT table_id, content FROM _document_index WHERE content LIKE ?').all(`%${query}%`);
                for (const row of docMatches) {
                    docContentMap.set(row.table_id, row.content);
                }
            } catch (e) {
                console.error('Document index search failed', e);
            }
        }

        const results = [];

        const legacyFiltersToGroup = (legacyFilters) => {
            if (!Array.isArray(legacyFilters) || legacyFilters.length === 0) return null;
            // Convert sequential list with per-item logic to a left-associative tree:
            // A (op1) B (op2) C => ((A op1 B) op2 C)
            let expr = { ...legacyFilters[0] };
            delete expr.logic;
            for (let i = 1; i < legacyFilters.length; i++) {
                const logic = legacyFilters[i]?.logic === 'OR' ? 'OR' : 'AND';
                const right = { ...legacyFilters[i] };
                delete right.logic;
                expr = { logic, items: [expr, right] };
            }
            return expr;
        };

        // Limit search to first 5 matches per table to avoid performance kill
        for (const table of tables) {
            let matches = [];
            let matchReason = [];
            let totalMatches = 0;

            // Handle Documents
            if (table.type === 'document') {
                // 0. Metadata Search (Filename)
                if (query) {
                    if (table.name.toLowerCase().includes(query.toLowerCase())) {
                        matchReason.push('文档名匹配');
                    }
                    
                    // 1. Content Search using Pre-fetched Index
                    if (docContentMap.has(table.id)) {
                        const content = docContentMap.get(table.id);
                        const idx = content.toLowerCase().indexOf(query.toLowerCase());
                        const start = Math.max(0, idx - 20);
                        const end = Math.min(content.length, idx + query.length + 50);
                        const snippet = content.substring(start, end);
                        
                        matches.push({ id: table.id, content: snippet + '...' });
                        totalMatches = 1; 
                        matchReason.push('文档内容匹配');
                    }
                }

                if (matchReason.length > 0) {
                     results.push({
                        table: table.name,
                        tableName: table.table_name, // used as ID
                        matches: matches,
                        matchReason: matchReason,
                        totalCount: totalMatches,
                        type: 'document' // Frontend can use this to render differntly
                    });
                }
                continue;
            }

            // 0. Metadata Search (Table Name & Column Names)
            if (query) {
                if (table.name.toLowerCase().includes(query.toLowerCase())) {
                    matchReason.push('表名匹配');
                }
                const matchedCols = table.columns.filter(c => c.original.toLowerCase().includes(query.toLowerCase()));
                if (matchedCols.length > 0) {
                    matchReason.push(`列名匹配: ${matchedCols.map(c => c.original).join(', ')}`);
                }
            }

            if (!table.columns || table.columns.length === 0) {
                // Even if no columns, if table name matched, we return it
                if (matchReason.length > 0) {
                    results.push({
                        table: table.name,
                        tableName: table.table_name,
                        matches: [],
                        matchReason
                    });
                }
                continue;
            }

            let whereClauses = [];
            let params = [];

            const buildWhereForTable = (filterItem) => {
                if (!filterItem) return '';

                // Case 1: Group
                if (filterItem.items && Array.isArray(filterItem.items)) {
                    const logic = filterItem.logic === 'OR' ? 'OR' : 'AND';
                    const clauses = filterItem.items.map(buildWhereForTable).filter(Boolean);
                    if (clauses.length === 0) return '';
                    return `(${clauses.join(` ${logic} `)})`;
                }

                // Case 2: Condition
                if (filterItem.column) {
                    // Start: Handle _ALL_ column (Fuzzy Search across all columns)
                    if (filterItem.column === '_ALL_') {
                        const validOps = ['=', '!=', 'LIKE', 'NOT LIKE'];
                        const op = validOps.includes(filterItem.operator) ? filterItem.operator : 'LIKE';
                        const val = filterItem.value;

                        if (op === 'LIKE' || op === 'NOT LIKE') {
                             // Concatenate all columns for fuzzy search
                             const cols = table.columns.map(c => `COALESCE(CAST("${c.name}" AS TEXT), '')`).join(" || ' ' || ");
                             params.push(`%${val}%`);
                             return `(${cols} ${op} ?)`;
                        } else {
                             // Exact checks on any column (OR logic)
                             const clauses = table.columns.map(c => {
                                 // Handle potential type mismatch in SQL by casting to text for safety if flexible?
                                 // But better to just check.
                                 return `CAST("${c.name}" AS TEXT) ${op} ?`; 
                             });
                             clauses.forEach(() => params.push(String(val)));
                             return `(${clauses.join(' OR ')})`;
                        }
                    }
                    // End: Handle _ALL_ column

                    const hasColumn = table.columns.some(c => c.name === filterItem.column);
                    if (!hasColumn) return '1=0';

                    const validOps = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IS EMPTY', 'IS NOT EMPTY'];
                    const op = validOps.includes(filterItem.operator) ? filterItem.operator : '=';
                    const col = filterItem.column;

                    if (op === 'IS EMPTY') {
                        return `("${col}" IS NULL OR TRIM(COALESCE(CAST("${col}" AS TEXT), '')) = '')`;
                    }
                    if (op === 'IS NOT EMPTY') {
                        return `("${col}" IS NOT NULL AND TRIM(COALESCE(CAST("${col}" AS TEXT), '')) <> '')`;
                    }

                    if (op === 'LIKE' || op === 'NOT LIKE') params.push(`%${filterItem.value}%`);
                    else params.push(filterItem.value);

                    return `"${col}" ${op} ?`;
                }

                return '';
            };

            // 1. Full Text Search
            if (query) {
                // Cast columns to TEXT before concatenating
                const cols = table.columns.map(c => `COALESCE(CAST("${c.name}" AS TEXT), '')`).join(" || ' ' || ");
                whereClauses.push(`(${cols} LIKE ?)`);
                params.push(`%${query}%`);
            }

            // 2. Advanced Filters (Applied to all tables)
            if (filtersRaw) {
                const rootGroup = Array.isArray(filtersRaw)
                    ? legacyFiltersToGroup(filtersRaw)
                    : filtersRaw;
                const filterSql = buildWhereForTable(rootGroup);
                if (filterSql) whereClauses.push(`(${filterSql})`);
            }
            
            // If we have filters but the resulting clause implies no match (e.g. 1=0 AND ...), 
            // SQLite will handle it. We just need to run it.
            // But if whereClauses is empty (no query, no filters?) AND no metadata match, skip.
            if (whereClauses.length > 0) {
                const whereSql = whereClauses.join(' AND ');
                
                // Get Total Count
                try {
                    const countSql = `SELECT COUNT(*) as count FROM "${table.table_name}" WHERE ${whereSql}`;
                    const countRes = db.prepare(countSql).get(...params);
                    totalMatches = countRes ? countRes.count : 0;
                } catch (e) {
                    console.error(`查询表${table.name}匹配行数时出错`, e);
                }

                // Get Preview Rows
                const sql = `
                    SELECT *, '${table.name}' as _source_table, '${table.table_name}' as _source_table_id 
                    FROM "${table.table_name}" 
                    WHERE ${whereSql} 
                    LIMIT 5
                `;
                
                try {
                    matches = db.prepare(sql).all(...params);
                } catch (e) {
                    // Ignore errors (e.g. type mismatch in comparison)
                    console.error(`查询表${table.name}预览行时出错`, e);
                }
            }

            if (matches.length > 0 || matchReason.length > 0) {
                results.push({
                    table: table.name,
                    tableName: table.table_name,
                    matches: matches,
                    matchReason: matchReason,
                    totalCount: totalMatches,
                    type: table.type === 'document' ? 'document' : 'table'
                });
            }
        }
        
        // Results Pagination
        const page = parseInt(req.query.page) || 1;
        const pageSize = Math.max(1, parseInt(req.query.pageSize) || 20);
        const offset = (page - 1) * pageSize;
        
        const total = results.length;
        const pagedResults = results.slice(offset, offset + pageSize);
        
        res.json({
            data: pagedResults,
            total: total,
            page: page,
            pageSize: pageSize,
            totalPages: Math.ceil(total / pageSize)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Execute Query and Save
app.post('/api/query/save', (req, res) => {
    try {
        const { sql, tableName, projectId } = req.body;
        if (!sql || !tableName) return res.status(400).json({ error: 'SQL和表名是必填项' });
        
        const isAdmin = req.user.role === 'admin';
        const result = tableService.executeQueryAndSave(sql, tableName, projectId, req.user.id, isAdmin);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Preview Query
app.post('/api/query/preview', (req, res) => {
    try {
        const { sql } = req.body;
        if (!sql) return res.status(400).json({ error: 'SQL是必填项' });
        
        const isAdmin = req.user.role === 'admin' || req.user.permissions?.can_edit; // Preview implies read, but advanced functionality usually. Let's assume view_all is enough? No, this is raw sql. Let's say can_edit or admin. Or strict view_all.
        // Actually, previewQuery is read-only. view_all should be enough.
        // But `isAdmin` param in service bypasses explicit owner check.
        // If I am just a user with view_all (is that possible?), I should be able to preview?
        // Let's stick effectively to Admin for now as the prompt complained about Admin.
        const canPreview = req.user.role === 'admin' || req.user.permissions?.view_all;
        const result = tableService.previewQuery(sql, req.user.id, canPreview);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. Add Row
app.post('/api/tables/:tableName/rows', requirePermission('can_edit'), (req, res) => {
    try {
        const { tableName } = req.params;
        // Support both direct row object (legacy) and { data, position } wrapper
        let rowData = req.body;
        let position = null;

        if (req.body && typeof req.body === 'object' && 'data' in req.body && 'position' in req.body) {
            rowData = req.body.data;
            position = req.body.position;
        }
        
        const isAdmin = req.user.role === 'admin';
        const result = tableService.addRow(tableName, rowData, position, req.user.id, isAdmin);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// 12. Delete Row
// Row deletion is considered an 'edit' operation, not a 'resource delete' operation.
app.delete('/api/tables/:tableName/rows/:id', requirePermission('can_edit'), (req, res) => {
    try {
        const { tableName, id } = req.params;
        const isAdmin = req.user.role === 'admin';
        const result = tableService.deleteRow(tableName, id, req.user.id, isAdmin);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 13. Add Column
app.post('/api/tables/:tableName/columns', requirePermission('can_edit'), (req, res) => {
    try {
        const { tableName } = req.params;
        const { name, type } = req.body;
        if (!name) return res.status(400).json({ error: '列名是必填项' });
        
        const isAdmin = req.user.role === 'admin';
        const result = tableService.addColumn(tableName, name, type, req.user.id, isAdmin);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 14. Delete Column
// Column deletion is considered an 'edit' operation, not a 'resource delete' operation.
app.delete('/api/tables/:tableName/columns/:columnName', requirePermission('can_edit'), (req, res) => {
    try {
        const { tableName, columnName } = req.params;
        const isAdmin = req.user.role === 'admin';
        const result = tableService.deleteColumn(tableName, columnName, req.user.id, isAdmin);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: '未找到' });
    }
    res.sendFile(path.join(publicDir, 'index.html'));
});

const server = app.listen(port, () => {
  const actualPort = server.address()?.port ?? port;
  console.log(`Server running at http://localhost:${actualPort}`);
  if (typeof process.send === 'function') {
    process.send({ type: 'listening', port: actualPort });
  }
});
