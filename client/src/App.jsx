import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import DataGrid from './components/DataGrid';
import UploadModal from './components/UploadModal';
import { api } from './api';
import { Search, Loader2, Filter, Plus, Trash2, Download, Database as DatabaseIcon } from 'lucide-react';
import QueryBuilder from './components/QueryBuilder';

function App() {
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  
  // Project State
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null); // null means "All" or "Uncategorized"

  const [tableData, setTableData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState([]);
  const [sorts, setSorts] = useState([]); // [{ column, direction }]
  const [groups, setGroups] = useState([]); // [column]
  
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
  const [advancedFilters, setAdvancedFilters] = useState([]);
  const [newAdvancedFilter, setNewAdvancedFilter] = useState({ column: '', operator: '=', value: '', logic: 'AND' });
  
  // Table Management Modal
  const [manageTable, setManageTable] = useState(null); // Table object to manage
  const [newProjectForTable, setNewProjectForTable] = useState(''); // Project ID or 'null'

  // Query Builder State
  const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);

  // Collect all unique columns across all tables for suggestion
  const allColumns = React.useMemo(() => {
      const cols = new Set();
      tables.forEach(t => {
          t.columns.forEach(c => cols.add(c.name));
      });
      return Array.from(cols).sort();
  }, [tables]);

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
      document.title = '表格管理系统';
    }
  }, [activeTable]);

  // Load Table Data
  const loadTableData = useCallback(async (table, page = 1, currentFilters = [], currentSorts = [], currentGroups = [], pageSize = 50) => {
    if (!table) return;
    setIsLoading(true);
    try {
      const res = await api.getTableData(table.table_name, page, pageSize, currentFilters, currentSorts, currentGroups);
      setTableData(res.data.data);
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
      const name = prompt('请输入新项目名称:');
      if (!name) return;
      try {
          await api.createProject({ name });
          loadData();
      } catch (err) {
          alert('创建失败');
      }
  };

  const handleDeleteProject = async (id) => {
    // Show custom confirmation instead of simple confirm
    // But since we can't easily inject a modal inside this sync handler called from Sidebar, 
    // we'll use a simple approach for now or need to pass a "request delete" handler to Sidebar
    // For now, let's use window.confirm logic but maybe use a custom UI state if we wanted to be fancy.
    // Given the prompt "Delete all tables or just project", we can use window.prompt? No.
    // Let's implement a quick confirm logic here using window.confirm sequence as a fallback if no modal, 
    // BUT the requirement is specific. Let's use `window.confirm` for the first step, and another for the second?
    // "确定删除此项目吗？" -> OK. 
    // "是否同时删除项目下的所有表格？点击'确定'删除表格，点击'取消'保留表格（变为未分类）"
    
    if(!window.confirm('确定删除此项目吗？')) return;
    
    const deleteTables = window.confirm('是否同时删除项目下的所有表格？\n点击"确定"将删除表格。\n点击"取消"将保留表格并移至"未分类"。');
    
    try {
        await api.deleteProject(id, deleteTables);
        if (activeProject?.id === id) setActiveProject(null);
        loadData();
    } catch (err) {
        alert('删除失败');
    }
  };

  const handleUpdateTableProject = async () => {
    if (!manageTable) return;
    try {
        await api.updateTable(manageTable.id, { 
            projectId: newProjectForTable === 'null' ? null : newProjectForTable 
        });
        setManageTable(null);
        loadData();
    } catch (err) {
        alert('更新失败');
    }
  };

  // Handle Table Selection
  const handleSelectTable = (table, initialFilters = []) => {
    setActiveTable(table);
    setSearchResults(null); // Clear search mode
    setSearchQuery('');
    setFilters(initialFilters);
    setSorts([]);
    setGroups([]);
    setPagination({ page: 1, totalPages: 1, total: 0 });
    loadTableData(table, 1, initialFilters, [], []);
  };

  // Handle Search
  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim() && advancedFilters.length === 0) {
        setSearchResults(null);
        return;
    }
    
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

        const res = await api.search(searchQuery, advancedFilters, projectScope);
        setSearchResults(res.data);
        setActiveTable(null); // Deselect table to show search results
    } catch (err) {
        console.error(err);
    } finally {
        setIsSearching(false);
    }
  };

  const addAdvancedFilter = () => {
    if (!newAdvancedFilter.column || !newAdvancedFilter.value) return;
    setAdvancedFilters([...advancedFilters, { ...newAdvancedFilter }]);
    setNewAdvancedFilter(prev => ({ ...prev, value: '' })); // Keep column/op, clear value
  };

  const removeAdvancedFilter = (idx) => {
    setAdvancedFilters(advancedFilters.filter((_, i) => i !== idx));
  };

  const handleSearchResultClick = (result, matchedRowId) => {
      // Find the table metadata from the list
      const targetTable = tables.find(t => t.table_name === result.tableName);
      if (targetTable) {
          // Construct a filter to show only this row
          const rowFilter = [{ column: 'id', operator: '=', value: matchedRowId, logic: 'AND' }];
          
          handleSelectTable(targetTable, rowFilter);
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
        tables={tables} 
        activeTable={activeTable} 
        onSelectTable={handleSelectTable}
        onUploadClick={() => setIsUploadOpen(true)}
        onDeleteTable={handleDeleteTable}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 shadow-sm z-20 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
                <form onSubmit={handleSearch} className="relative w-full max-w-md flex items-center gap-2">
                    {!showAdvancedSearch && (
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="全局搜索..." 
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
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
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                    U
                </div>
            </div>
          </div>

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
                
                {/* Active Filters */}
                {advancedFilters.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {advancedFilters.map((f, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm bg-white px-2 py-1 rounded border border-gray-200 shadow-sm">
                                {idx > 0 && <span className="font-bold text-gray-400 text-xs">{f.logic === 'AND' ? '且' : '或'}</span>}
                                <span className="text-gray-600 font-medium">{f.column}</span>
                                <span className="text-blue-500 font-mono">{f.operator}</span>
                                <span className="text-gray-900">{f.value}</span>
                                <button onClick={() => removeAdvancedFilter(idx)} className="text-gray-400 hover:text-red-500 ml-1">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* New Filter Inputs */}
                <div className="flex items-center gap-2 flex-wrap">
                    {advancedFilters.length > 0 && (
                         <select 
                            className="text-sm border-gray-300 rounded-md shadow-sm w-20"
                            value={newAdvancedFilter.logic}
                            onChange={e => setNewAdvancedFilter({...newAdvancedFilter, logic: e.target.value})}
                        >
                            <option value="AND">且</option>
                            <option value="OR">或</option>
                        </select>
                    )}

                    <input 
                        list="column-suggestions"
                        type="text"
                        placeholder="列名 (如: Age)"
                        className="text-sm border-gray-300 rounded-md shadow-sm px-2 py-1 w-32"
                        value={newAdvancedFilter.column}
                        onChange={e => setNewAdvancedFilter({...newAdvancedFilter, column: e.target.value})}
                    />
                    <datalist id="column-suggestions">
                        {allColumns.map(c => <option key={c} value={c} />)}
                    </datalist>

                    <select 
                        className="text-sm border-gray-300 rounded-md shadow-sm w-24"
                        value={newAdvancedFilter.operator}
                        onChange={e => setNewAdvancedFilter({...newAdvancedFilter, operator: e.target.value})}
                    >
                        <option value="=">等于</option>
                        <option value="!=">不等于</option>
                        <option value=">">大于</option>
                        <option value="<">小于</option>
                        <option value=">=">大于等于</option>
                        <option value="<=">小于等于</option>
                        <option value="LIKE">包含</option>
                        <option value="NOT LIKE">不包含</option>
                    </select>

                    <input 
                        type="text" 
                        placeholder="值..." 
                        className="text-sm border-gray-300 rounded-md shadow-sm px-2 py-1 flex-1 min-w-[100px]"
                        value={newAdvancedFilter.value}
                        onChange={e => setNewAdvancedFilter({...newAdvancedFilter, value: e.target.value})}
                        onKeyDown={e => e.key === 'Enter' && addAdvancedFilter()}
                    />

                    <button 
                        onClick={addAdvancedFilter} 
                        disabled={!newAdvancedFilter.column || !newAdvancedFilter.value}
                        className="flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 disabled:opacity-50"
                    >
                        <Plus size={14} /> 添加
                    </button>
                    
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
                    <h2 className="text-xl font-bold mb-4">搜索结果: "{searchQuery}"</h2>
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
                                        {group.table}
                                        <span className="text-xs text-gray-400 font-normal">点击跳转 &rarr;</span>
                                    </h3>
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
                    onManage={() => {
                        setManageTable(activeTable);
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
        onUpload={async (formData) => {
            // Append current project ID if active
            if (activeProject) {
                formData.append('projectId', activeProject.id);
            }
            // If activeProject is null (All Tables), projectId is undefined/null, which is fine
            
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
        />
      )}

      {/* Table Management Modal */}
      {manageTable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
                <h3 className="text-lg font-bold mb-4">管理表格: {manageTable.name}</h3>
                
                <div className="mb-4">
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

                <div className="flex justify-end gap-2">
                    <button 
                        onClick={() => setManageTable(null)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleUpdateTableProject}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        保存
                    </button>
                </div>
            </div>
        </div>
      )}
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
