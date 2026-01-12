import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401 && localStorage.getItem('token')) {
    localStorage.removeItem('token');
    window.location.reload();
  }
  return Promise.reject(err);
});

export const api = {
  login: (username, password) => axios.post(`${API_URL}/auth/login`, { username, password }),
  register: (username, password) => axios.post(`${API_URL}/auth/register`, { username, password }),
  changePassword: (oldPassword, newPassword) => client.post('/auth/change-password', { oldPassword, newPassword }),

  getProjects: () => client.get('/projects'),
  createProject: (data) => client.post('/projects', data),
  updateProject: (id, data) => client.put(`/projects/${id}`, data),
  deleteProject: (id, deleteTables = false) => client.delete(`/projects/${id}`, { params: { deleteTables } }),

  getTables: (projectId) => client.get('/tables', { params: { projectId } }),
  uploadFile: (formData) => client.post('/upload', formData),
  getTableData: (tableName, page, pageSize, filters, sorts = [], groups = []) => 
    client.get(`/tables/${tableName}/data`, { 
      params: { 
        page, 
        pageSize,
        filters: JSON.stringify(filters || []),
        sorts: JSON.stringify(sorts),
        groups: JSON.stringify(groups)
      } 
    }),

  getTableAggregates: (tableName, filters, aggregates) =>
    client.get(`/tables/${tableName}/aggregates`, {
        params: {
            filters: JSON.stringify(filters || []),
            aggregates: JSON.stringify(aggregates || {})
        }
    }),

  locateRow: (tableName, rowId, pageSize = 50) =>
    client.get(`/tables/${tableName}/rows/${rowId}/locate`, { params: { pageSize } }),
  deleteTable: (id) => client.delete(`/tables/${id}`),
  updateTable: (id, data) => client.put(`/tables/${id}`, data),
  
  // projectScope:
  // - null/undefined => all projects
  // - 'uncategorized' or number/string => single scope (backward compatible)
  // - array => multiple scopes (e.g. ['uncategorized', '1', '2'])
  search: (query, filters, projectScope) => client.get('/search', {
    params: {
      q: query,
      filters: JSON.stringify(filters || []),
      projectIds: Array.isArray(projectScope) ? JSON.stringify(projectScope) : undefined,
      projectId: !Array.isArray(projectScope) ? projectScope : undefined, // backward compatible
    }
  }),

  updateCellValue: (tableName, rowId, column, value) => 
    client.put(`/tables/${tableName}/rows/${rowId}`, { column, value }),

  exportTable: (tableName) => 
    client.get(`/tables/${tableName}/export`, { responseType: 'blob' }),

  saveQueryAsTable: (sql, tableName, projectId) => 
    client.post('/query/save', { sql, tableName, projectId }),

  previewQuery: (sql) => client.post('/query/preview', { sql }),

  addRow: (tableName, rowData, position = null) => {
      if (position) {
          return client.post(`/tables/${tableName}/rows`, { data: rowData, position });
      }
      return client.post(`/tables/${tableName}/rows`, rowData);
  },
  deleteRow: (tableName, rowId) => client.delete(`/tables/${tableName}/rows/${rowId}`),
  addColumn: (tableName, name, type) => client.post(`/tables/${tableName}/columns`, { name, type }),
  deleteColumn: (tableName, columnName) => client.delete(`/tables/${tableName}/columns/${columnName}`),
};
