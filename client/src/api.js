import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

export const api = {
  getProjects: () => axios.get(`${API_URL}/projects`),
  createProject: (data) => axios.post(`${API_URL}/projects`, data),
  deleteProject: (id, deleteTables = false) => axios.delete(`${API_URL}/projects/${id}`, { params: { deleteTables } }),

  getTables: (projectId) => axios.get(`${API_URL}/tables`, { params: { projectId } }),
  uploadFile: (formData) => axios.post(`${API_URL}/upload`, formData),
  getTableData: (tableName, page, pageSize, filters, sorts = [], groups = []) => 
    axios.get(`${API_URL}/tables/${tableName}/data`, { 
      params: { 
        page, 
        pageSize,
        filters: JSON.stringify(filters || []),
        sorts: JSON.stringify(sorts),
        groups: JSON.stringify(groups)
      } 
    }),
  deleteTable: (id) => axios.delete(`${API_URL}/tables/${id}`),
  updateTable: (id, data) => axios.put(`${API_URL}/tables/${id}`, data),
  
  // projectScope:
  // - null/undefined => all projects
  // - 'uncategorized' or number/string => single scope (backward compatible)
  // - array => multiple scopes (e.g. ['uncategorized', '1', '2'])
  search: (query, filters, projectScope) => axios.get(`${API_URL}/search`, {
    params: {
      q: query,
      filters: JSON.stringify(filters || []),
      projectIds: Array.isArray(projectScope) ? JSON.stringify(projectScope) : undefined,
      projectId: !Array.isArray(projectScope) ? projectScope : undefined, // backward compatible
    }
  }),

  updateCellValue: (tableName, rowId, column, value) => 
    axios.put(`${API_URL}/tables/${tableName}/rows/${rowId}`, { column, value }),

  exportTable: (tableName) => 
    axios.get(`${API_URL}/tables/${tableName}/export`, { responseType: 'blob' }),

  saveQueryAsTable: (sql, tableName, projectId) => 
    axios.post(`${API_URL}/query/save`, { sql, tableName, projectId }),

  previewQuery: (sql) => axios.post(`${API_URL}/query/preview`, { sql }),
};
