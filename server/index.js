const express = require('express');
const cors = require('cors');
const multer = require('multer');
const tableService = require('./services/tableService');
const db = require('./db');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Set default charset for all responses
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// Upload config (memory storage for processing)
const upload = multer({ storage: multer.memoryStorage() });

// Routes

// Projects API
app.get('/api/projects', (req, res) => {
    try {
        const projects = tableService.getAllProjects();
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/projects', (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Project name is required' });
        const project = tableService.createProject(name, description);
        res.json(project);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/projects/:id', (req, res) => {
    try {
        const deleteTables = req.query.deleteTables === 'true';
        tableService.deleteProject(req.params.id, deleteTables);
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
    const tables = tableService.getAllTables(projectId);
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Table Meta (Project/Name)
app.put('/api/tables/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = tableService.updateTableMeta(id, req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Upload Excel
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Fix filename encoding (latin1 -> utf8)
    const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const projectId = req.body.projectId ? parseInt(req.body.projectId) : null;
    
    const result = tableService.importExcel(req.file.buffer, originalname, projectId);
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
    
    // Parse filters from query string (expecting JSON string in 'filters')
    let filters = [];
    if (req.query.filters) {
        try {
            filters = JSON.parse(req.query.filters);
        } catch (e) {
            console.error('Filter parse error', e);
        }
    }

    const result = tableService.getTableData(tableName, page, pageSize, filters);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete Table
app.delete('/api/tables/:id', (req, res) => {
  try {
    tableService.deleteTable(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
    }
});

// 6. Update Cell Data
app.put('/api/tables/:tableName/rows/:id', (req, res) => {
    try {
        const { tableName, id } = req.params;
        const { column, value } = req.body; 
        
        tableService.updateCellValue(tableName, id, column, value);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Export Table
app.get('/api/tables/:tableName/export', (req, res) => {
    try {
        const { tableName } = req.params;
        const result = tableService.exportTable(tableName);
        
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
app.get('/api/search', (req, res) => {
    try {
        const query = req.query.q; // String search
        const filters = req.query.filters ? JSON.parse(req.query.filters) : []; // Advanced filters
        const projectId = req.query.projectId; // Legacy single-scope filter
        const projectIdsRaw = req.query.projectIds; // Multi-scope filter (JSON array)
        
        // If no search query and no filters, return empty
        if (!query && filters.length === 0) return res.json([]);

        // Get all tables to search through
        let tables = tableService.getAllTables();
        
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
                tables = tableService.getAllTables(scopes);
            } else {
                // Explicitly scoped to nothing => no results
                return res.json([]);
            }
        } else if (projectId) {
            const scopeId = projectId === 'uncategorized' ? 'uncategorized' : parseInt(projectId);
            if (!isNaN(scopeId) || scopeId === 'uncategorized') {
                tables = tableService.getAllTables(scopeId);
            }
        }

        const results = [];

        // Limit search to first 5 matches per table to avoid performance kill
        for (const table of tables) {
            if (!table.columns || table.columns.length === 0) continue;

            let whereClauses = [];
            let params = [];

            // 1. Full Text Search
            if (query) {
                // Cast columns to TEXT before concatenating
                const cols = table.columns.map(c => `COALESCE(CAST("${c.name}" AS TEXT), '')`).join(" || ' ' || ");
                whereClauses.push(`(${cols} LIKE ?)`);
                params.push(`%${query}%`);
            }

            // 2. Advanced Filters (Applied to all tables if columns match)
            if (filters.length > 0) {
                // For global search, we only apply filters if the table actually HAS that column
                // This is a "Best Effort" filter across heterogeneous tables
                const validFilters = filters.filter(f => 
                    table.columns.some(c => c.name === f.column)
                );

                if (validFilters.length > 0) {
                    const filterConditions = validFilters.map((f, index) => {
                         const validOps = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE'];
                         const op = validOps.includes(f.operator) ? f.operator : '=';
                         
                         if (op === 'LIKE' || op === 'NOT LIKE') params.push(`%${f.value}%`);
                         else params.push(f.value);

                         const clause = `"${f.column}" ${op} ?`;
                         
                         if (index > 0) {
                             const logic = (f.logic === 'OR') ? 'OR' : 'AND';
                             return ` ${logic} ${clause}`;
                         }
                         return clause;
                    });
                    
                    if (filterConditions.length > 0) {
                        whereClauses.push(`(${filterConditions.join('')})`);
                    }
                }
            }
            
            // If we have filters but none matched this table's columns, and there was no text query, skip table
            if (whereClauses.length === 0) continue;

            const sql = `
                SELECT *, '${table.name}' as _source_table, '${table.table_name}' as _source_table_id 
                FROM "${table.table_name}" 
                WHERE ${whereClauses.join(' AND ')} 
                LIMIT 5
            `;
            
            try {
                const matches = db.prepare(sql).all(...params);
                if (matches.length > 0) {
                    results.push({
                        table: table.name,
                        tableName: table.table_name,
                        matches: matches
                    });
                }
            } catch (e) {
                // Ignore errors (e.g. type mismatch in comparison)
                console.error(`Error searching table ${table.name}`, e);
            }
        }
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Execute Query and Save
app.post('/api/query/save', (req, res) => {
    try {
        const { sql, tableName, projectId } = req.body;
        if (!sql || !tableName) return res.status(400).json({ error: 'SQL and tableName are required' });
        
        const result = tableService.executeQueryAndSave(sql, tableName, projectId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Preview Query
app.post('/api/query/preview', (req, res) => {
    try {
        const { sql } = req.body;
        if (!sql) return res.status(400).json({ error: 'SQL is required' });
        
        const result = tableService.previewQuery(sql);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
