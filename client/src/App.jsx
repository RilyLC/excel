import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import DataGrid from './components/DataGrid';
import UploadModal from './components/UploadModal';
import Modal from './components/Modal';
import ConfirmModal from './components/ConfirmModal';
import PromptModal from './components/PromptModal';
import AlertModal from './components/AlertModal';
import { api } from './api';
import { Search, Loader2, Filter, Plus, Trash2, Download, Database as DatabaseIcon, LogOut, KeyRound } from 'lucide-react';
import QueryBuilder from './components/QueryBuilder';

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[\S]{8,64}$/;

/* --- Global Search Filter Components (supports parentheses via groups) --- */

const GlobalFilterItem = ({ item, columns, onUpdate, onRemove }) => {
    return (
        <div className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded text-sm shadow-sm">
            <input
                list="global-column-suggestions"
                type="text"
                placeholder="列名"
                className="text-sm border-gray-300 rounded shadow-sm px-2 py-1 w-44 focus:border-blue-500 focus:ring-blue-500"
                value={item.column || ''}
                onChange={e => onUpdate({ ...item, column: e.target.value })}
            />
            <datalist id="global-column-suggestions">
                {columns.map(c => (
                    <option key={c.name} value={c.name} />
                ))}
            </datalist>

            <select
                className="text-sm border-gray-300 rounded shadow-sm py-1 focus:border-blue-500 focus:ring-blue-500"
                value={item.operator || '='}
                onChange={e => onUpdate({ ...item, operator: e.target.value })}
            >
                <option value="=">等于</option>
                <option value="!=">不等于</option>
                <option value=">">大于</option>
                <option value="<">小于</option>
                <option value=">=">大于等于</option>
                <option value="<=">小于等于</option>
                <option value="LIKE">包含</option>
                <option value="NOT LIKE">不包含</option>
                <option value="IS EMPTY">为空</option>
                <option value="IS NOT EMPTY">不为空</option>
            </select>

            {!['IS EMPTY', 'IS NOT EMPTY'].includes(item.operator) && (
                <input
                    type="text"
                    className="text-sm border-gray-300 rounded shadow-sm px-2 py-1 flex-1 min-w-[100px] focus:border-blue-500 focus:ring-blue-500"
                    placeholder="值"
                    value={item.value || ''}
                    onChange={e => onUpdate({ ...item, value: e.target.value })}
                />
            )}

            <button onClick={onRemove} className="text-gray-400 hover:text-red-500 ml-2 transition-colors">
                <Trash2 size={14} />
            </button>
        </div>
    );
};

const GlobalFilterGroup = ({ group, columns, onUpdate, onRemove, depth = 0 }) => {
    const addItem = () => {
        const newItem = { column: '', operator: '=', value: '' };
        onUpdate({ ...group, items: [...(group.items || []), newItem] });
    };

    const addGroup = () => {
        const newGroup = { logic: 'AND', items: [] };
        onUpdate({ ...group, items: [...(group.items || []), newGroup] });
    };

    const updateItem = (index, newItem) => {
        const newItems = [...(group.items || [])];
        newItems[index] = newItem;
        onUpdate({ ...group, items: newItems });
    };

    const removeItem = (index) => {
        const newItems = (group.items || []).filter((_, i) => i !== index);
        onUpdate({ ...group, items: newItems });
    };

    return (
        <div className={`p-1 pt-2 rounded-lg ${depth > 0 ? 'bg-gray-50/50 border border-gray-200 ml-4' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-1 gap-2 transition-colors">
                    <span className="text-xs font-semibold text-gray-600 uppercase select-none">
                        {depth === 0 ? '条件' : '条件组:'}
                    </span>
                    <select
                        className="text-xs border-none bg-transparent font-bold text-blue-700 focus:ring-0 cursor-pointer p-0 pr-6"
                        value={group.logic || 'AND'}
                        onChange={e => onUpdate({ ...group, logic: e.target.value })}
                    >
                        <option value="AND">且 (AND)</option>
                        <option value="OR">或 (OR)</option>
                    </select>

                    <div className="h-4 w-px bg-gray-300 mx-1"></div>

                    <button onClick={addItem} className="text-xs text-gray-600 hover:text-blue-600 flex items-center gap-1 px-1 rounded hover:bg-white transition-colors">
                        <Plus size={12} /> 添加条件
                    </button>
                    <button onClick={addGroup} className="text-xs text-gray-600 hover:text-blue-600 flex items-center gap-1 px-1 rounded hover:bg-white transition-colors">
                        <Plus size={12} /> 添加组
                    </button>

                    {depth > 0 && (
                        <>
                            <div className="h-4 w-px bg-gray-300 mx-1"></div>
                            <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-0.5 px-1 rounded hover:bg-white transition-colors">
                                <Trash2 size={12} /> 删除组
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2 pl-2">
                {(group.items || []).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                        <div className="mt-2.5 min-w-[32px] text-right shrink-0 select-none">
                            {idx > 0 ? (
                                <span className={`text-[10px] font-bold px-1 py-0.5 rounded uppercase border ${
                                    group.logic === 'AND'
                                        ? 'text-blue-600 bg-blue-50 border-blue-100'
                                        : 'text-orange-600 bg-orange-50 border-orange-100'
                                }`}>
                                    {group.logic === 'AND' ? 'And' : 'Or'}
                                </span>
                            ) : (
                                depth === 0 && <span className="text-[10px] font-bold text-gray-400 uppercase">Where</span>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            {item.items ? (
                                <GlobalFilterGroup
                                    group={item}
                                    columns={columns}
                                    onUpdate={(newGroup) => updateItem(idx, newGroup)}
                                    onRemove={() => removeItem(idx)}
                                    depth={depth + 1}
                                />
                            ) : (
                                <GlobalFilterItem
                                    item={item}
                                    columns={columns}
                                    onUpdate={(newItem) => updateItem(idx, newItem)}
                                    onRemove={() => removeItem(idx)}
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

function App({ onLogout }) {
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  
  // Project State
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null); // null means "All" or "Uncategorized"

  // Modal States
  const [alertState, setAlertState] = useState({ isOpen: false, title: '提示', message: '', type: 'info' });
  const [confirmState, setConfirmState] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, type: 'warning' });
  const [promptState, setPromptState] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {}, defaultValue: '' });
  // Specific Delete Project Modal State to handle the checkbox requirement
  const [deleteProjectState, setDeleteProjectState] = useState({ isOpen: false, project: null });
  const [deleteProjectWithTables, setDeleteProjectWithTables] = useState(false);

  const showAlert = (message, type = 'error', title = '提示') => {
      setAlertState({ isOpen: true, message, type, title });
  };

  const showConfirm = (message, onConfirm, title = '确认', type = 'warning') => {
      setConfirmState({ isOpen: true, message, onConfirm, title, type });
  };

  const showPrompt = (title, onConfirm, message = '', defaultValue = '') => {
      setPromptState({ isOpen: true, title, message, onConfirm, defaultValue });
  };

  // Change Password Modal
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [changePasswordTouched, setChangePasswordTouched] = useState({ oldPassword: false, newPassword: false, confirmPassword: false });
  const [changePasswordErrors, setChangePasswordErrors] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });

  const validateChangePasswordField = (field, value, allValues) => {
      const v = value || '';
      if (field === 'oldPassword') {
          if (!v) return '原密码是必填项';
          return '';
      }
      if (field === 'newPassword') {
          if (!v) return '新密码是必填项';
          if (!PASSWORD_REGEX.test(v)) return '新密码格式不正确（8-64位，至少包含字母和数字，且不能包含空格）';
          return '';
      }
      if (field === 'confirmPassword') {
          if (!v) return '确认新密码是必填项';
          if (v !== (allValues?.newPassword || '')) return '两次输入的新密码不一致';
          return '';
      }
      return '';
  };

  const setChangePasswordField = (field, value) => {
      setChangePasswordForm(prev => {
          const next = { ...prev, [field]: value };
          // 如果相关字段已被触发过失焦，则同步刷新错误信息
          setChangePasswordErrors(errPrev => {
              const errNext = { ...errPrev };
              if (changePasswordTouched[field]) {
                  errNext[field] = validateChangePasswordField(field, value, next);
              }
              // newPassword 变化会影响 confirmPassword
              if (field === 'newPassword' && changePasswordTouched.confirmPassword) {
                  errNext.confirmPassword = validateChangePasswordField('confirmPassword', next.confirmPassword, next);
              }
              return errNext;
          });
          return next;
      });
  };

  const closeChangePassword = () => {
      setIsChangePasswordOpen(false);
      setChangePasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setIsChangingPassword(false);
      setChangePasswordTouched({ oldPassword: false, newPassword: false, confirmPassword: false });
      setChangePasswordErrors({ oldPassword: '', newPassword: '', confirmPassword: '' });
  };

  const submitChangePassword = async () => {
      const oldPassword = changePasswordForm.oldPassword;
      const newPassword = changePasswordForm.newPassword;
      const confirmPassword = changePasswordForm.confirmPassword;

      const errs = {
          oldPassword: validateChangePasswordField('oldPassword', oldPassword, changePasswordForm),
          newPassword: validateChangePasswordField('newPassword', newPassword, changePasswordForm),
          confirmPassword: validateChangePasswordField('confirmPassword', confirmPassword, changePasswordForm),
      };
      setChangePasswordTouched({ oldPassword: true, newPassword: true, confirmPassword: true });
      setChangePasswordErrors(errs);
      if (errs.oldPassword || errs.newPassword || errs.confirmPassword) {
          showAlert(errs.oldPassword || errs.newPassword || errs.confirmPassword, 'warning');
          return;
      }

      setIsChangingPassword(true);
      try {
          await api.changePassword(oldPassword, newPassword);
          showAlert('密码修改成功，请使用新密码重新登录', 'success');
          closeChangePassword();
          onLogout();
      } catch (err) {
          const msg = err.response?.data?.error;
          showAlert(msg || '修改密码失败', 'error');
      } finally {
          setIsChangingPassword(false);
      }
  };


  const [tableData, setTableData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState([]);
  const [sorts, setSorts] = useState([]); // [{ column, direction }]
  const [groups, setGroups] = useState([]); // [column]
    const [focusRowId, setFocusRowId] = useState(null);
  
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

    // Advanced Search: scope (all projects / uncategorized / multiple projects)
    const [advancedSearchAllProjects, setAdvancedSearchAllProjects] = useState(true);
    const [advancedSearchIncludeUncategorized, setAdvancedSearchIncludeUncategorized] = useState(false);
    const [advancedSearchProjectIds, setAdvancedSearchProjectIds] = useState([]); // array of string ids

  // Advanced Search State
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
    const [advancedFilters, setAdvancedFilters] = useState({ logic: 'AND', items: [] });
  
  // Table Management Modal
  const [manageTable, setManageTable] = useState(null); // Table object to manage
  const [manageTableName, setManageTableName] = useState(''); // New Table Name
  const [newProjectForTable, setNewProjectForTable] = useState(''); // Project ID or 'null'

  // Query Builder State
  const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);

  // Search History State
  const [searchHistory, setSearchHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount
  useEffect(() => {
    // 检查项目加载是否需要token（应该在上层处理了，但为了保险起见）
    // 如果没有token，api会拦截并redirect
    
      const history = localStorage.getItem('searchHistory');
      if (history) {
          try {
              setSearchHistory(JSON.parse(history));
          } catch (e) {
              console.error('Failed to parse search history', e);
          }
      }
  }, []);

  // Save history
  const saveSearchToHistory = (query) => {
      if (!query.trim()) return;
      const newHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 10);
      setSearchHistory(newHistory);
      localStorage.setItem('searchHistory', JSON.stringify(newHistory));
  };

  const clearHistory = () => {
      setSearchHistory([]);
      localStorage.removeItem('searchHistory');
  };

  const removeHistoryItem = (term) => {
      setSearchHistory(prev => {
          const next = prev.filter(h => h !== term);
          localStorage.setItem('searchHistory', JSON.stringify(next));
          return next;
      });
  };

  // Collect all unique columns across all tables for suggestion
  const allColumns = React.useMemo(() => {
      const cols = new Set();
      tables.forEach(t => {
          t.columns.forEach(c => cols.add(c.name));
      });
      return Array.from(cols).sort();
  }, [tables]);

    const globalFilterColumns = React.useMemo(
        () => allColumns.map(name => ({ name, original: name })),
        [allColumns]
    );

  // Load Projects & Tables
  const loadData = useCallback(async () => {
    try {
      const [projRes, tableRes] = await Promise.all([
          api.getProjects(),
          api.getTables(activeProject?.id)
      ]);
      setProjects(projRes.data);
      setTables(tableRes.data);
    } catch (err) {
      console.error('Failed to load data', err);
    }
  }, [activeProject]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update document title based on active table
  useEffect(() => {
    if (activeTable) {
      document.title = activeTable.name;
    } else {
      document.title = '数据管理平台';
    }
  }, [activeTable]);

  // Load Table Data
  const loadTableData = useCallback(async (table, page = 1, currentFilters = [], currentSorts = [], currentGroups = [], pageSize = 50) => {
    if (!table) return;
    setIsLoading(true);
    try {
      const res = await api.getTableData(table.table_name, page, pageSize, currentFilters, currentSorts, currentGroups);
      setTableData(res.data.data || []);
      setPagination({
        page: res.data.page,
        pageSize: pageSize,
        totalPages: res.data.totalPages,
        total: res.data.total
      });
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectProject = (project) => {
      setActiveProject(project);
      setActiveTable(null);
      // loadData will trigger via useEffect
  };

  const handleCreateProject = async () => {
      showPrompt('新建项目', async (name) => {
          try {
              await api.createProject({ name });
              loadData();
          } catch (err) {
              showAlert('创建项目失败');
          }
      }, '请输入新项目名称:');
  };

  const handleEditProject = async (project) => {
      showPrompt('重命名项目', async (newName) => {
          if (newName === project.name) return;
          try {
              await api.updateProject(project.id, { name: newName });
              loadData();
          } catch (err) {
              showAlert('更新项目失败');
          }
      }, '请输入新的项目名称:', project.name);
  };

  const handleDeleteProject = async (id) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    
    // Open custom delete project modal
    setDeleteProjectWithTables(false); // Default to not deleting tables
    setDeleteProjectState({ isOpen: true, project });
  };

  const executeDeleteProject = async () => {
      if (!deleteProjectState.project) return;
      try {
          await api.deleteProject(deleteProjectState.project.id, deleteProjectWithTables);
          if (activeProject?.id === deleteProjectState.project.id) setActiveProject(null);
          loadData();
      } catch (err) {
          showAlert('删除项目失败');
      }
  };

  const handleUpdateTableProject = async () => {
    if (!manageTable) return;
    if (!manageTableName.trim()) {
        showAlert('表名不能为空');
        return;
    }
    try {
        const updateData = {
            name: manageTableName,
            projectId: newProjectForTable === 'null' ? null : newProjectForTable
        };
        await api.updateTable(manageTable.id, updateData);
        
        // Update local state if successful
        const updatedTable = { ...manageTable, ...updateData };
        if (activeTable?.id === manageTable.id) {
            setActiveTable(prev => ({ ...prev, ...updateData }));
        }
        setTables(prev => prev.map(t => t.id === manageTable.id ? { ...t, ...updateData } : t));

        setManageTable(null);
        // loadData(); // Optional, but local update is faster
    } catch (err) {
        showAlert('更新表格信息失败');
    }
  };

  // Handle Table Selection
  const handleSelectTable = (table, initialFilters = []) => {
    setActiveTable(table);
    setSearchResults(null); // Clear search mode
    setSearchQuery('');
        setFocusRowId(null);
    setFilters(initialFilters);
    setSorts([]);
    setGroups([]);
    setPagination({ page: 1, totalPages: 1, total: 0 });
    loadTableData(table, 1, initialFilters, [], []);
  };

  // Handle Search
  const handleSearch = async (e, overrideQuery) => {
    e?.preventDefault();

    // If a query is provided (e.g., clicking history), use it immediately to avoid stale state.
    const query = typeof overrideQuery === 'string' ? overrideQuery : searchQuery;
    const trimmedQuery = query.trim();

    if (!trimmedQuery && (advancedFilters?.items?.length || 0) === 0) {
        setSearchResults(null);
        return;
    }
    
    // Persist the text query to the input so the UI stays in sync.
    if (query !== searchQuery) {
        setSearchQuery(query);
    }

    // Save to history if it's a text search
    if (trimmedQuery) {
        saveSearchToHistory(trimmedQuery);
    }
    setShowHistory(false); // Hide history dropdown

    setIsSearching(true);
    try {
        // Scope selection only applies to Advanced Search.
        let projectScope = null;
        if (showAdvancedSearch && !advancedSearchAllProjects) {
            const scopes = [];
            if (advancedSearchIncludeUncategorized) scopes.push('uncategorized');
            for (const id of advancedSearchProjectIds) scopes.push(id);
            projectScope = scopes;
        }

        const res = await api.search(trimmedQuery, advancedFilters, projectScope);
        setSearchResults(res.data);
        setActiveTable(null); // Deselect table to show search results
    } catch (err) {
        console.error(err);
    } finally {
        setIsSearching(false);
    }
  };

    const clearAdvancedFilters = () => {
        setAdvancedFilters({ logic: 'AND', items: [] });
    };

  const handleSearchResultClick = async (result, matchedRowId) => {
      const targetTable = tables.find(t => t.table_name === result.tableName);
      if (!targetTable) return;

      // If user clicked the table card (no specific row), just open the table.
      if (!matchedRowId) {
          handleSelectTable(targetTable, []);
          return;
      }

      try {
          setIsLoading(true);

          const ps = pagination.pageSize || 50;
          const locateRes = await api.locateRow(targetTable.table_name, matchedRowId, ps);
          const page = locateRes?.data?.page || 1;

          setActiveTable(targetTable);
          setSearchResults(null);
          setSearchQuery('');
          setFilters([]);
          setSorts([]);
          setGroups([]);
          setFocusRowId(null);

          await loadTableData(targetTable, page, [], [], [], ps);
          setFocusRowId(matchedRowId);
      } catch (err) {
          console.error('Jump to row failed', err);
          // Fallback: open table normally
          handleSelectTable(targetTable, []);
      } finally {
          setIsLoading(false);
      }
  };

  // Helper to render matching fields
  const renderMatchingFields = (row, query) => {
      const q = query.toLowerCase();
      // Always include ID
      const fields = [{ key: 'id', value: row.id }];
      
      Object.entries(row).forEach(([key, value]) => {
          if (key === 'id' || key.startsWith('_')) return; // Skip ID (already added) and system fields
          const valStr = String(value);
          if (valStr.toLowerCase().includes(q)) {
              fields.push({ key, value: valStr });
          }
      });

      // If no other fields matched (unlikely if row was returned), show first 3 non-system fields
      if (fields.length === 1) {
          Object.entries(row).slice(0, 3).forEach(([key, value]) => {
              if (key !== 'id' && !key.startsWith('_')) {
                  fields.push({ key, value: String(value) });
              }
          });
      }

      return fields.slice(0, 5); // Limit to 5 fields
  };

  const handleDeleteTable = async (id) => {
      if(!window.confirm('确定要删除这张表吗？')) return;
      try {
          await api.deleteTable(id);
          if (activeTable?.id === id) setActiveTable(null);
          loadData();
      } catch (err) {
          alert('删除失败');
      }
  };

  const handleExportTable = async () => {
    if (!activeTable) return;
    try {
        const response = await api.exportTable(activeTable.table_name);
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${activeTable.name}.xlsx`); 
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (err) {
        console.error("Export failed", err);
        alert("导出失败");
    }
  };

  const handleCellUpdate = async (rowId, column, value) => {
    if (!activeTable) return;
    try {
        await api.updateCellValue(activeTable.table_name, rowId, column, value);
        // Optimistic update:
        setTableData(prev => prev.map(row => {
            if (row.id === rowId) {
                return { ...row, [column]: value };
            }
            return row;
        }));
    } catch (err) {
        console.error("Update failed", err);
        alert("更新失败");
        // Revert or reload
        loadTableData(activeTable, pagination.page, filters);
    }
  };

  const handleTableUpdate = async (updatedTableMeta) => {
    try {
        if (!updatedTableMeta || !updatedTableMeta.id) {
            // It might be just a refresh request without meta update
            // Or if id is missing, we can't update meta.
            // If the intention was just to reload data:
            if (activeTable) {
                loadTableData(activeTable, pagination.page, filters, sorts, groups, pagination.pageSize);
            }
            return;
        }

        await api.updateTable(updatedTableMeta.id, updatedTableMeta);
        // Refresh local state without full reload if possible, but loadData is safest
        
        // Update local activeTable reference immediately for UI responsiveness
        setActiveTable(updatedTableMeta);
        
        // Also update the table in the list 'tables'
        setTables(prev => prev.map(t => t.id === updatedTableMeta.id ? updatedTableMeta : t));
        
    } catch (err) {
        console.error("Update table failed", err);
        alert("更新表格信息失败");
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans">
      <Sidebar 
        projects={projects}
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onEditProject={handleEditProject}
        tables={tables} 
        activeTable={activeTable} 
        onSelectTable={handleSelectTable}
        onUploadClick={() => setIsUploadOpen(true)}
        onDeleteTable={handleDeleteTable}
        onManageTable={(table) => {
            setManageTable(table);
            setManageTableName(table.name);
            setNewProjectForTable(table.project_id || 'null');
        }}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 shadow-sm z-40 relative flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
                <form onSubmit={handleSearch} className="relative w-full max-w-md flex items-center gap-2">
                    {!showAdvancedSearch && (
                        <div className="relative flex-1 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="全局搜索..." 
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onFocus={() => setShowHistory(true)}
                                onBlur={() => setTimeout(() => setShowHistory(false), 200)} // Delay to allow click
                            />
                            {/* Search History Dropdown */}
                            {showHistory && searchHistory.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[999] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                                        <span className="text-xs font-semibold text-gray-500 uppercase">最近搜索</span>
                                        <button 
                                            type="button" 
                                            onMouseDown={clearHistory} 
                                            className="text-xs text-blue-600 hover:underline"
                                        >
                                            清空
                                        </button>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto">
                                        {searchHistory.map((term, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50"
                                            >
                                                <button
                                                    type="button"
                                                    className="flex-1 text-left flex items-center gap-2"
                                                    onMouseDown={() => {
                                                        handleSearch(null, term); // Trigger search immediately with the clicked term
                                                    }}
                                                >
                                                    <Search size={14} className="text-gray-400" />
                                                    <span className="truncate">{term}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-gray-400 hover:text-red-500"
                                                    title="删除这条记录"
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        removeHistoryItem(term);
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {showAdvancedSearch && (
                        <div className="flex-1 text-sm text-gray-500 font-medium px-2 flex items-center justify-between">
                            <span>高级搜索模式</span>
                        </div>
                    )}
                    <button 
                        type="button"
                        onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                        className={`p-2 rounded-lg border transition-colors ${showAdvancedSearch ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                        title="高级搜索"
                    >
                        <Filter size={20} />
                    </button>
                    <button 
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                    >
                        搜索
                    </button>
                </form>
            </div>
            
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200 ml-4">
                <div className="flex flex-col items-end">
                    <span className="text-sm font-semibold text-gray-700">
                        {JSON.parse(localStorage.getItem('user') || '{}').username || 'User'}
                    </span>
                    <span className="text-xs text-gray-500">用户</span>
                </div>
                <button
                    onClick={() => setIsChangePasswordOpen(true)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                    title="修改密码"
                >
                    <KeyRound size={18} />
                </button>
                <button 
                    onClick={onLogout}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    title="退出登录"
                >
                    <LogOut size={18} />
                </button>
            </div>
          </div>

          <Modal
              isOpen={isChangePasswordOpen}
              onClose={closeChangePassword}
              title="修改密码"
              size="sm"
              footer={
                  <>
                      <button
                          onClick={closeChangePassword}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                          disabled={isChangingPassword}
                      >
                          取消
                      </button>
                      <button
                          onClick={submitChangePassword}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          disabled={isChangingPassword}
                      >
                          {isChangingPassword ? '提交中...' : '确认修改'}
                      </button>
                  </>
              }
          >
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">原密码</label>
                      <input
                          type="password"
                          value={changePasswordForm.oldPassword}
                          onChange={(e) => setChangePasswordField('oldPassword', e.target.value)}
                          onBlur={() => {
                              setChangePasswordTouched(prev => ({ ...prev, oldPassword: true }));
                              setChangePasswordErrors(prev => ({
                                  ...prev,
                                  oldPassword: validateChangePasswordField('oldPassword', changePasswordForm.oldPassword, changePasswordForm)
                              }));
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoComplete="current-password"
                      />
                      {changePasswordTouched.oldPassword && changePasswordErrors.oldPassword && (
                          <div className="mt-1 text-xs text-red-600">{changePasswordErrors.oldPassword}</div>
                      )}
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                      <input
                          type="password"
                          value={changePasswordForm.newPassword}
                          onChange={(e) => setChangePasswordField('newPassword', e.target.value)}
                          onBlur={() => {
                              setChangePasswordTouched(prev => ({ ...prev, newPassword: true }));
                              setChangePasswordErrors(prev => {
                                  const next = { ...prev };
                                  next.newPassword = validateChangePasswordField('newPassword', changePasswordForm.newPassword, changePasswordForm);
                                  if (changePasswordTouched.confirmPassword) {
                                      next.confirmPassword = validateChangePasswordField('confirmPassword', changePasswordForm.confirmPassword, changePasswordForm);
                                  }
                                  return next;
                              });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoComplete="new-password"
                      />
                      <div className="mt-1 text-xs text-gray-500">8-64位，至少包含字母和数字，且不能包含空格</div>
                      {changePasswordTouched.newPassword && changePasswordErrors.newPassword && (
                          <div className="mt-1 text-xs text-red-600">{changePasswordErrors.newPassword}</div>
                      )}
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
                      <input
                          type="password"
                          value={changePasswordForm.confirmPassword}
                          onChange={(e) => setChangePasswordField('confirmPassword', e.target.value)}
                          onBlur={() => {
                              setChangePasswordTouched(prev => ({ ...prev, confirmPassword: true }));
                              setChangePasswordErrors(prev => ({
                                  ...prev,
                                  confirmPassword: validateChangePasswordField('confirmPassword', changePasswordForm.confirmPassword, changePasswordForm)
                              }));
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoComplete="new-password"
                          onKeyDown={(e) => {
                              if (e.key === 'Enter' && !isChangingPassword) submitChangePassword();
                          }}
                      />
                      {changePasswordTouched.confirmPassword && changePasswordErrors.confirmPassword && (
                          <div className="mt-1 text-xs text-red-600">{changePasswordErrors.confirmPassword}</div>
                      )}
                  </div>
              </div>
          </Modal>

          {/* Advanced Search Panel */}
          {showAdvancedSearch && (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 animate-in slide-in-from-top-2">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">全局搜索</div>

                {/* Project Scope (multi-select) */}
                <div className="mb-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm text-gray-600 font-medium">搜索范围</span>

                        <label className="flex items-center gap-1 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={advancedSearchAllProjects}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setAdvancedSearchAllProjects(checked);
                                    if (checked) {
                                        setAdvancedSearchIncludeUncategorized(false);
                                        setAdvancedSearchProjectIds([]);
                                    }
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            全部项目
                        </label>

                        <label className={`flex items-center gap-1 text-sm ${advancedSearchAllProjects ? 'text-gray-400' : 'text-gray-700'}`}>
                            <input
                                type="checkbox"
                                checked={advancedSearchIncludeUncategorized}
                                disabled={advancedSearchAllProjects}
                                onChange={(e) => setAdvancedSearchIncludeUncategorized(e.target.checked)}
                                className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            未分类
                        </label>
                    </div>

                    {!advancedSearchAllProjects && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {projects.length === 0 ? (
                                <div className="text-xs text-gray-400">暂无项目可选</div>
                            ) : (
                                projects.map(p => {
                                    const idStr = String(p.id);
                                    const checked = advancedSearchProjectIds.includes(idStr);
                                    return (
                                        <label key={p.id} className="flex items-center gap-1 text-sm bg-white px-2 py-1 rounded border border-gray-200 shadow-sm">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) => {
                                                    const nextChecked = e.target.checked;
                                                    setAdvancedSearchProjectIds(prev => {
                                                        if (nextChecked) return Array.from(new Set([...prev, idStr]));
                                                        return prev.filter(x => x !== idStr);
                                                    });
                                                }}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="max-w-[180px] truncate" title={p.name}>{p.name}</span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
                
                {/* Filter Groups (supports parentheses) */}
                <div className="mt-3">
                    {globalFilterColumns.length === 0 ? (
                        <div className="text-xs text-gray-400">暂无可用列（请先导入至少一张表）</div>
                    ) : (
                        <>
                            <div className="max-h-60 overflow-y-auto pr-2 border border-gray-200 rounded-lg bg-white/60">
                                <GlobalFilterGroup
                                    group={advancedFilters}
                                    columns={globalFilterColumns}
                                    onUpdate={setAdvancedFilters}
                                    depth={0}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={clearAdvancedFilters}
                                    className="text-xs text-gray-500 hover:text-red-600"
                                >
                                    清空筛选条件
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="w-full border-t border-gray-200 my-2 pt-2">
                    <button 
                        onClick={() => setIsQueryBuilderOpen(true)}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                    >
                        <DatabaseIcon size={14} />
                        使用高级 SQL 语句查询
                    </button>
                </div>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden p-6 relative">
            {/* Case 1: Loading */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-50">
                    <Loader2 className="animate-spin text-blue-600" size={40} />
                </div>
            )}

            {/* Case 2: Search Results */}
            {searchResults ? (
                <div className="h-full overflow-y-auto">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <h2 className="text-xl font-bold truncate">
                            搜索结果: "{searchQuery}" 共{' '}
                            <span className="font-semibold text-gray-900">
                                {Array.isArray(searchResults)
                                    ? searchResults.reduce((sum, group) => sum + (Number(group?.totalCount) || 0), 0)
                                    : 0}
                            </span>
                            {' '}条记录
                        </h2>
                    </div>
                    {searchResults.length === 0 ? (
                        <p className="text-gray-500">没有匹配的表或行</p>
                    ) : (
                        <div className="space-y-6">
                            {searchResults.map((group, idx) => (
                                <div 
                                    key={idx} 
                                    className="bg-white rounded-lg shadow p-4 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                                    onClick={() => handleSearchResultClick(group)}
                                >
                                    <h3 className="font-semibold text-lg text-blue-600 mb-2 border-b pb-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {group.table}
                                            {/* Match Count Badge */}
                                            {group.totalCount > 0 && (
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                                    {group.totalCount > 5 ? `找到 ${group.totalCount} 条 (仅显示前 5 条)` : `找到 ${group.totalCount} 条`}
                                                </span>
                                            )}
                                            {/* Metadata Match Badges */}
                                            {group.matchReason && group.matchReason.map((reason, i) => (
                                                <span key={i} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-normal">
                                                    {reason}
                                                </span>
                                            ))}
                                        </div>
                                        <span className="text-xs text-gray-400 font-normal">点击跳转 &rarr;</span>
                                    </h3>
                                    {group.matches.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <tbody>
                                                    {group.matches.map((row, rIdx) => {
                                                        const fields = renderMatchingFields(row, searchQuery);
                                                        return (
                                                            <tr 
                                                                key={rIdx} 
                                                                className="border-t hover:bg-blue-50 cursor-pointer transition-colors"
                                                                onClick={(e) => {
                                                                    e.stopPropagation(); // Prevent parent click
                                                                    handleSearchResultClick(group, row.id);
                                                                }}
                                                            >
                                                                {fields.map((field, fIdx) => (
                                                                    <td key={fIdx} className="p-2 text-gray-700">
                                                                        <span className="font-semibold text-gray-500 mr-1">{field.key}:</span>
                                                                        <span dangerouslySetInnerHTML={{
                                                                            __html: String(field.value).replace(
                                                                                new RegExp(`(${searchQuery})`, 'gi'), 
                                                                                '<span class="bg-yellow-200 text-black">$1</span>'
                                                                            )
                                                                        }} />
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-gray-500 italic py-2">
                                            仅表名或列名匹配，无内容匹配。
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : activeTable ? (
                /* Case 3: Data Grid */
                <DataGrid 
                    tableMeta={activeTable}
                    data={tableData}
                    
                    // Pagination Props
                    totalPages={pagination.totalPages}
                    currentPage={pagination.page}
                    pageSize={pagination.pageSize}
                    totalCount={pagination.total}
                    
                    initialFilters={filters}
                    initialSorts={sorts}
                    initialGroups={groups}
                    
                    onViewChange={(newFilters, newSorts, newGroups) => {
                        setFilters(newFilters);
                        setSorts(newSorts);
                        setGroups(newGroups);
                        loadTableData(activeTable, 1, newFilters, newSorts, newGroups, pagination.pageSize);
                    }}
                    onPageChange={(p) => loadTableData(activeTable, p, filters, sorts, groups, pagination.pageSize)}
                    onPageSizeChange={(ps) => loadTableData(activeTable, 1, filters, sorts, groups, ps)}

                    onExport={handleExportTable}
                    onCellUpdate={handleCellUpdate}
                    onTableUpdate={handleTableUpdate}
                    focusRowId={focusRowId}
                    onManage={() => {
                        setManageTable(activeTable);
                        setManageTableName(activeTable.name);
                        setNewProjectForTable(activeTable.project_id || 'null');
                    }}
                />
            ) : (
                /* Case 4: Empty State */
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Database size={64} className="mb-4 text-gray-200" />
                    <p className="text-lg">请选择一个表格或导入新文件以开始使用</p>
                </div>
            )}
        </main>
      </div>

      <UploadModal 
        isOpen={isUploadOpen} 
        onClose={() => setIsUploadOpen(false)} 
        projects={projects}
        initialProjectId={activeProject ? activeProject.id : 'null'}
        onUpload={async (formData) => {
            // UploadModal already appends projectId based on selection
            await api.uploadFile(formData);
            loadData();
        }}
      />

      {/* Query Builder Modal */}
      {isQueryBuilderOpen && (
        <QueryBuilder 
            isOpen={isQueryBuilderOpen}
            onClose={() => setIsQueryBuilderOpen(false)}
            tables={tables}
            projects={projects}
            onSaveSuccess={() => {
                setIsQueryBuilderOpen(false);
                loadData();
            }}
            onShowAlert={showAlert}
        />
      )}

      {/* Table Management Modal */}
      {manageTable && (
        <Modal
            isOpen={true}
            onClose={() => setManageTable(null)}
            title="管理表格"
            footer={
                <div className="flex justify-between w-full">
                    <button 
                        onClick={() => {
                            if (window.confirm('确定要删除这张表吗？')) {
                                api.deleteTable(manageTable.id).then(() => {
                                    if (activeTable?.id === manageTable.id) setActiveTable(null);
                                    setManageTable(null);
                                    loadData();
                                }).catch(() => showAlert('删除失败'));
                            }
                        }}
                        className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    >
                        删除表格
                    </button>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setManageTable(null)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleUpdateTableProject}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
                        >
                            保存
                        </button>
                    </div>
                </div>
            }
        >
             <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">表格名称</label>
                    <input 
                        type="text"
                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        value={manageTableName}
                        onChange={e => setManageTableName(e.target.value)}
                        placeholder="请输入表格名称"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">所属项目</label>
                    <select 
                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        value={newProjectForTable}
                        onChange={e => setNewProjectForTable(e.target.value)}
                    >
                        <option value="null">未分类</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
                
                <div className="bg-gray-50 p-3 rounded text-xs text-gray-500 border border-gray-200">
                    <p className="mb-1"><span className="font-semibold">物理表名:</span> {manageTable.table_name}</p>
                    <p><span className="font-semibold">创建时间:</span> {new Date(manageTable.created_at).toLocaleString()}</p>
                </div>
            </div>
        </Modal>
      )}

      {/* Global Alert Modal */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />

      {/* Global Confirm Modal */}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        type={confirmState.type}
      />

      {/* Global Prompt Modal */}
      <PromptModal
        isOpen={promptState.isOpen}
        onClose={() => setPromptState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={promptState.onConfirm}
        title={promptState.title}
        message={promptState.message}
        defaultValue={promptState.defaultValue}
      />

      {/* Specific Delete Project Modal */}
      <ConfirmModal
        isOpen={deleteProjectState.isOpen}
        onClose={() => setDeleteProjectState({ isOpen: false, project: null })}
        onConfirm={executeDeleteProject}
        title="删除项目"
        type="danger"
        confirmText="确认删除"
      >
        <div className="space-y-3">
            <p className="text-sm text-gray-600">
                确定要删除项目 <span className="font-bold text-gray-900">{deleteProjectState.project?.name}</span> 吗？
            </p>
            <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                <label className="flex items-start gap-2 cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="mt-1 rounded text-red-600 focus:ring-red-500 border-gray-300"
                        checked={deleteProjectWithTables}
                        onChange={e => setDeleteProjectWithTables(e.target.checked)}
                    />
                    <div className="text-sm">
                        <span className="font-medium text-red-800">同时删除该项目下的所有表格</span>
                        <p className="text-red-600 text-xs mt-0.5">如果不勾选，项目下的表格将移动到"未分类"。</p>
                    </div>
                </label>
            </div>
        </div>
      </ConfirmModal>

    </div>
  );
}

function Database({ size, className }) {
    return (
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width={size} 
            height={size} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={className}
        >
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
        </svg>
    )
}

export default App;
