import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Plus, Trash2, Download, Settings, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

/* --- Helper Components --- */

const EditableHeader = ({ initialValue, onUpdate }) => {
    const [value, setValue] = useState(initialValue);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => { setValue(initialValue); }, [initialValue]);

    const handleFinish = () => {
        setIsEditing(false);
        if (value && value !== initialValue) {
            onUpdate(value);
        } else {
            setValue(initialValue); // Revert if empty or unchanged
        }
    };

    if (isEditing) {
        return (
            <input
                autoFocus
                className="w-full bg-white border border-blue-500 rounded px-1 py-0.5 text-xs font-semibold text-gray-800"
                value={value}
                onChange={e => setValue(e.target.value)}
                onBlur={handleFinish}
                onKeyDown={e => e.key === 'Enter' && handleFinish()}
                onClick={e => e.stopPropagation()}
            />
        );
    }
    
    return (
        <span 
            className="truncate cursor-text" 
            title={initialValue}
            onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
            }}
        >
            {initialValue}
        </span>
    );
};

const EditableCell = ({ value: initialValue, rowId, columnId, rowIndex, colIndex, onUpdate, isSelected, onSelectionStart, onSelectionMove, onSelectionEnd, onContextMenu }) => {
    const [value, setValue] = useState(initialValue);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const handleBlur = () => {
        setIsEditing(false);
        if (value != initialValue) {
            onUpdate(rowId, columnId, value);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleBlur();
        }
    };

    if (isEditing) {
        return (
            <input
                autoFocus
                value={value === null ? '' : value}
                onChange={e => setValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-full h-full px-1 py-0.5 border-2 border-blue-500 text-sm focus:outline-none bg-white absolute inset-0 z-30"
                onClick={e => e.stopPropagation()} 
            />
        );
    }

    return (
        <div 
            className={`w-full h-full min-h-[20px] px-1 flex items-center select-none ${isSelected ? 'bg-blue-100' : ''}`}
            title={value}
            onDoubleClick={() => setIsEditing(true)}
            onMouseDown={(e) => {
                // Left click only
                if (e.button === 0) {
                     onSelectionStart(rowIndex, colIndex);
                }
            }}
            onMouseEnter={() => onSelectionMove(rowIndex, colIndex)}
            onMouseUp={onSelectionEnd}
            onContextMenu={onContextMenu}
        >
            <span className="truncate w-full block">{value}</span>
        </div>
    );
};

/* --- Filter Components --- */

const FilterItem = ({ item, columns, onUpdate, onRemove }) => {
    return (
        <div className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded text-sm shadow-sm">
            <select
                className="text-sm border-gray-300 rounded shadow-sm py-1 focus:border-blue-500 focus:ring-blue-500"
                value={item.column || ''}
                onChange={e => onUpdate({ ...item, column: e.target.value })}
            >
                <option value="">选择列...</option>
                {columns.map(c => (
                    <option key={c.name} value={c.name}>{c.original}</option>
                ))}
            </select>
            
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
                 <option value="IS EMPTY">为空 (Is Empty)</option>
                 <option value="IS NOT EMPTY">不为空 (Is Not Empty)</option>
            </select>

            {/* Hide value input for empty/not empty checks */}
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

const FilterGroup = ({ group, columns, onUpdate, onRemove, depth = 0 }) => {
    const addItem = () => {
        const newItem = { column: columns[0]?.name || '', operator: '=', value: '' };
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
                        {depth === 0 ? 'Where' : 'Group:'}
                     </span>
                     <select
                        className="text-xs border-none bg-transparent font-bold text-blue-700 focus:ring-0 cursor-pointer p-0 pr-6"
                        value={group.logic || 'AND'}
                        onChange={e => onUpdate({ ...group, logic: e.target.value })}
                     >
                         <option value="AND">Matches ALL (AND)</option>
                         <option value="OR">Matches ANY (OR)</option>
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
                         {/* Logic Label Connector */}
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
                                /* Only show 'Where' at very top level, otherwise empty spacer to align */
                                depth === 0 && <span className="text-[10px] font-bold text-gray-400 uppercase">Where</span>
                            )}
                         </div>

                         <div className="flex-1 min-w-0">
                            {item.items ? (
                                <FilterGroup
                                    group={item}
                                    columns={columns}
                                    onUpdate={(newGroup) => updateItem(idx, newGroup)}
                                    onRemove={() => removeItem(idx)}
                                    depth={depth + 1}
                                />
                            ) : (
                                <FilterItem
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

const PageJumpInput = ({ currentPage, totalPages, onPageChange }) => {
    const [val, setVal] = useState(currentPage);

    useEffect(() => {
        setVal(currentPage);
    }, [currentPage]);

    const handleCommit = () => {
        let p = parseInt(val, 10);
        if (Number.isNaN(p)) {
            setVal(currentPage);
            return;
        }
        const max = totalPages || 1;
        if (p < 1) p = 1;
        if (p > max) p = max;
        
        if (p !== currentPage) {
            onPageChange(p);
        } else {
             setVal(currentPage);
        }
    };

    return (
        <div className="flex items-center text-gray-500 bg-gray-50 px-2 py-0.5 rounded text-xs border border-gray-200">
             <span>第</span>
             <input 
                className="w-8 mx-1 text-center font-bold text-gray-800 bg-transparent border-b border-gray-300 hover:border-blue-400 focus:border-blue-500 focus:outline-none transition-colors appearance-none p-0"
                value={val}
                onChange={e => setVal(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={e => e.key === 'Enter' && handleCommit()}
             />
             <span>/ {totalPages || 1} 页</span>
        </div>
    );
};

export default function DataGrid({ 
    tableMeta, 
    data, 
    totalPages, 
    currentPage, 
    pageSize = 50,
    totalCount = 0,
    onPageChange, 
    onPageSizeChange,
    onViewChange, // Replaces onFilterChange, onSortChange
    initialFilters = [], 
    initialSorts = [], // [{ column, direction }]
    initialGroups = [], // [column]
    onExport, 
    onCellUpdate, 
    onManage,
    onTableUpdate
}) {
  
  // -- View State -- //
  const [showViewSettings, setShowViewSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('filter'); // 'filter', 'sort', 'group'

  // Local State for View Configuration
  const [filters, setFilters] = useState(() => {
    if (!initialFilters) return { logic: 'AND', items: [] };
    if (Array.isArray(initialFilters)) return { logic: 'AND', items: initialFilters };
    return initialFilters;
  });
  const [sorts, setSorts] = useState(initialSorts);
  const [groups, setGroups] = useState(initialGroups);

  // Sync with props
  useEffect(() => {
    if (!initialFilters) {
        setFilters({ logic: 'AND', items: [] });
    } else if (Array.isArray(initialFilters)) {
        setFilters({ logic: 'AND', items: initialFilters });
    } else {
        setFilters(initialFilters);
    }
    
    setSorts(initialSorts || []);
    setGroups(initialGroups || []);
  }, [initialFilters, initialSorts, initialGroups, tableMeta?.id]);

  // Apply changes
  const applyViewChanges = () => {
    onViewChange(filters, sorts, groups);
  };
  
  // -- Filter Helpers -- //
  // Recursive Filter Builder Component (Simplified for now: 1 level nesting or flat list logic adaptation)
  // For "All DQL", we ideally need a recursive tree builder.
  // Let's stick to a flat list that can add "Groups" visually? 
  // Or just keep the current flat list but allow nested logic on backend?
  // Current backend supports nested.
  // Let's enhance the UI to support basic "Filter Groups" (A and B) OR (C and D).
  
  // -- Sort Helpers -- //
  const addSort = () => {
      setSorts([...sorts, { column: tableMeta.columns[0]?.name, direction: 'ASC' }]);
  };
  const updateSort = (idx, field, val) => {
      const newSorts = [...sorts];
      newSorts[idx] = { ...newSorts[idx], [field]: val };
      setSorts(newSorts);
  };
  const removeSort = (idx) => {
      setSorts(sorts.filter((_, i) => i !== idx));
  };

  // -- Group Helpers -- //
  const toggleGroup = (col) => {
      if (groups.includes(col)) {
          setGroups(groups.filter(g => g !== col));
      } else {
          setGroups([...groups, col]);
      }
  };

  // ... (Selection Logic remains)
  const [selection, setSelection] = useState({ start: null, end: null, isDragging: false });
  // ... (handleSelectionStart/Move/End/isCellSelected/handleContextMenu remains)
  
  const handleSelectionStart = (rowIndex, colIndex) => {
      setSelection({ 
          start: { row: rowIndex, col: colIndex }, 
          end: { row: rowIndex, col: colIndex }, 
          isDragging: true 
      });
  };

  const handleSelectionMove = (rowIndex, colIndex) => {
      if (selection.isDragging) {
          setSelection(prev => ({
              ...prev,
              end: { row: rowIndex, col: colIndex }
          }));
      }
  };

  const handleSelectionEnd = () => {
      if (selection.isDragging) {
        setSelection(prev => ({ ...prev, isDragging: false }));
      }
  };

  const isCellSelected = (rowIndex, colIndex) => {
      if (!selection.start || !selection.end) return false;
      const minRow = Math.min(selection.start.row, selection.end.row);
      const maxRow = Math.max(selection.start.row, selection.end.row);
      const minCol = Math.min(selection.start.col, selection.end.col);
      const maxCol = Math.max(selection.start.col, selection.end.col);

      return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
  };

  const handleContextMenu = (e) => {
      e.preventDefault();
      if (!selection.start || !selection.end) return;

      const minRow = Math.min(selection.start.row, selection.end.row);
      const maxRow = Math.max(selection.start.row, selection.end.row);
      const minCol = Math.min(selection.start.col, selection.end.col);
      const maxCol = Math.max(selection.start.col, selection.end.col);

      const rows = table.getRowModel().rows.slice(minRow, maxRow + 1);
      const text = rows.map(row => {
          const cells = row.getVisibleCells().filter((_, idx) => idx >= minCol && idx <= maxCol);
          return cells.map(cell => cell.getValue()).join('\t');
      }).join('\n');

      navigator.clipboard.writeText(text).then(() => {
          console.log('Copied to clipboard');
      });
  };

  // ... (Column Management remains)
  const handleColumnNameUpdate = (oldName, newOriginalName) => {
      if (!onTableUpdate || !tableMeta) return;
      const newColumns = tableMeta.columns.map(c => c.name === oldName ? { ...c, original: newOriginalName } : c);
      onTableUpdate({ ...tableMeta, columns: newColumns });
  };
  
  // Dynamic columns
  const columns = useMemo(() => {
    if (!tableMeta || !tableMeta.columns) return [];

    const indexCol = {
        id: '_index',
        header: '#',
        size: 50,
        enableResizing: false,
        cell: info => (
             <div className="w-full text-center text-gray-400 text-xs font-mono select-none bg-gray-50 h-full flex items-center justify-center">
                {(currentPage - 1) * 50 + info.row.index + 1}
             </div>
        )
    };

    // If grouping is active, columns might be different or we might want to highlight grouped columns?
    // For now, standard columns.
    const dataCols = tableMeta.columns.map(col => ({
      accessorKey: col.name,
      header: col.original,
      size: 160,
      minSize: 80,
      maxSize: 600,
      cell: info => (
        <EditableCell 
            value={info.getValue()} 
            rowId={info.row.original.id} 
            columnId={col.name}
            onUpdate={onCellUpdate} 
            rowIndex={info.row.index}
            colIndex={tableMeta.columns.findIndex(c => c.name === col.name) + 1} // Offset by index col
            isSelected={isCellSelected(info.row.index, tableMeta.columns.findIndex(c => c.name === col.name) + 1)}
            onSelectionStart={handleSelectionStart}
            onSelectionMove={handleSelectionMove}
            onSelectionEnd={handleSelectionEnd}
            onContextMenu={handleContextMenu}
        />
      ),
    }));

    return [indexCol, ...dataCols];

  }, [tableMeta, onCellUpdate, currentPage, selection]); // Added selection dependency for re-render

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    columnResizeMode: 'onChange',
    defaultColumn: { size: 160, minSize: 80, maxSize: 600 },
  });
  
  // -- Quick Filter State (Legacy) --
  // We keep local `filters` state for the advanced panel.

  // New Filter Row State
  if (!tableMeta) return <div className="p-10 text-center text-gray-500">请选择一个表格查看数据</div>;

  const filterCount = filters.items?.length || 0;
  const hasViewChanges = filterCount > 0 || sorts.length > 0 || groups.length > 0;

  return (
    <div className="flex flex-col h-full bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
        <h2 className="text-lg font-semibold text-gray-800">{tableMeta.name}</h2>
        <div className="flex items-center gap-2">
          {onManage && (
            <button onClick={onManage} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">
              <Settings size={16} /> 管理
            </button>
          )}
          {onExport && (
            <button onClick={onExport} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">
              <Download size={16} /> 导出
            </button>
          )}
          <button 
            onClick={() => setShowViewSettings(!showViewSettings)}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border ${showViewSettings ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            <Filter size={16} />
            视图设置 {hasViewChanges && <span className="bg-blue-600 text-white text-[10px] px-1.5 rounded-full">!</span>}
          </button>
        </div>
      </div>

      {/* Advanced View Settings Panel */}
      {showViewSettings && (
        <div className="bg-gray-50 border-b border-gray-200 animate-in slide-in-from-top-2 flex flex-col max-h-[60vh] shadow-lg relative z-20">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-4 shrink-0 bg-gray-50">
                <button 
                    onClick={() => setActiveTab('filter')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'filter' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    筛选 ({filterCount})
                </button>
                <button 
                    onClick={() => setActiveTab('sort')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'sort' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    排序 ({sorts.length})
                </button>
                <button 
                    onClick={() => setActiveTab('group')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'group' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    分组 ({groups.length})
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-4 overflow-y-auto flex-1 min-h-0 bg-gray-50/50">
                {/* FILTER TAB */}
                {activeTab === 'filter' && (
                    <div className="space-y-3">
                         <FilterGroup 
                            group={filters}
                            columns={tableMeta.columns}
                            onUpdate={setFilters}
                         />
                    </div>
                )}

                {/* SORT TAB */}
                {activeTab === 'sort' && (
                    <div className="space-y-3">
                        {sorts.map((s, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <span className="text-sm text-gray-500 w-6">No.{idx + 1}</span>
                                <select 
                                    className="text-sm border-gray-300 rounded-md shadow-sm"
                                    value={s.column}
                                    onChange={e => updateSort(idx, 'column', e.target.value)}
                                >
                                    {tableMeta.columns.map(c => (
                                        <option key={c.name} value={c.name}>{c.original}</option>
                                    ))}
                                </select>
                                <select 
                                    className="text-sm border-gray-300 rounded-md shadow-sm"
                                    value={s.direction}
                                    onChange={e => updateSort(idx, 'direction', e.target.value)}
                                >
                                    <option value="ASC">升序 (A-Z)</option>
                                    <option value="DESC">降序 (Z-A)</option>
                                </select>
                                <button onClick={() => removeSort(idx)} className="text-gray-400 hover:text-red-500">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                        <button onClick={addSort} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                            <Plus size={14} /> 添加排序规则
                        </button>
                    </div>
                )}

                {/* GROUP TAB */}
                {activeTab === 'group' && (
                    <div>
                        <div className="text-xs text-gray-500 mb-3">选择分组字段 (分组后将聚合显示数据)</div>
                        <div className="flex flex-wrap gap-2">
                            {tableMeta.columns.map(c => {
                                const isActive = groups.includes(c.name);
                                return (
                                    <button 
                                        key={c.name}
                                        onClick={() => toggleGroup(c.name)}
                                        className={`px-3 py-1.5 text-sm rounded border transition-all ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                    >
                                        {c.original}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Actions Footer - Fixed at bottom of panel */}
            <div className="p-3 border-t border-gray-200 flex justify-end gap-2 bg-gray-50 shrink-0 shadow-inner z-10">
                <button 
                    onClick={() => {
                        setFilters(initialFilters || []);
                        setSorts(initialSorts || []);
                        setGroups(initialGroups || []);
                        setShowViewSettings(false);
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                >
                    取消
                </button>
                <button 
                    onClick={() => {
                        applyViewChanges();
                        setShowViewSettings(false);
                    }}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm font-medium"
                >
                    应用设置
                </button>
            </div>
        </div>
      )}

      {/* Table Content */}
      <div className="flex-1 overflow-auto bg-white relative select-none">
        <table className="text-left border-collapse" style={{ width: table.getTotalSize() }}>
          <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const sortInfo = sorts.find(s => s.column === header.id);
                  const isIndex = header.id === '_index';
                  const columnName = header.column.columnDef.accessorKey;

                  return (
                    <th
                        key={header.id}
                        className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 border-r border-gray-200 bg-gray-50 relative group/header"
                        style={{ width: header.getSize() }}
                    >
                        <div className="flex items-center justify-between gap-2 h-full">
                            {!isIndex ? (
                                <EditableHeader 
                                    initialValue={header.column.columnDef.header}
                                    onUpdate={(newVal) => handleColumnNameUpdate(columnName, newVal)}
                                />
                            ) : (
                                <span>#</span>
                            )}
                            
                            {/* Simple Sort Toggle Indicator */}
                            {!isIndex && sortInfo && (
                                <span className="text-blue-600 bg-blue-50 px-1 rounded text-[10px] font-bold">
                                    {sorts.indexOf(sortInfo) + 1}
                                    {sortInfo.direction === 'ASC' ? '↑' : '↓'}
                                </span>
                            )}
                        </div>
                        {!isIndex && (
                            <div
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
                                className="absolute right-0 top-0 h-full w-4 cursor-col-resize touch-none flex justify-center items-center group -mr-2 z-20"
                                onClick={(e) => e.stopPropagation()} 
                            >
                                <div className={`w-[3px] h-2/3 rounded-full transition-all ${
                                    header.column.getIsResizing() 
                                        ? 'bg-blue-500 scale-y-110 shadow-sm' 
                                        : 'bg-gray-300 opacity-0 group-hover:opacity-100'
                                }`} />
                            </div>
                        )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white">
            {table.getRowModel().rows.length === 0 ? (
                <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-400">
                        暂无数据
                    </td>
                </tr>
            ) : (
                table.getRowModel().rows.map((row, rIdx) => {
                    const groupRows = [];
                    // Check for group headers
                    if (groups && groups.length > 0) {
                        groups.forEach((groupCol, level) => {
                             // Get current value
                             // accessorKey is groupCol
                             const val = row.getValue(groupCol);
                             
                             // Get prev row value for comparison
                             const prevRow = rIdx > 0 ? table.getRowModel().rows[rIdx - 1] : null;
                             let isNewGroup = false;

                             if (!prevRow) {
                                 isNewGroup = true;
                             } else {
                                 // Check if this level OR any parent level changed
                                 // If parent changed, this level automatically is new
                                 for (let i = 0; i <= level; i++) {
                                     const g = groups[i];
                                     const v = row.getValue(g);
                                     const pv = prevRow.getValue(g);
                                     if (v !== pv) {
                                         isNewGroup = true;
                                         break;
                                     }
                                 }
                             }
                             
                             if (isNewGroup) {
                                const colDef = tableMeta.columns.find(c => c.name === groupCol);
                                const label = colDef ? colDef.original : groupCol;
                                const paddingLeft = (level * 24) + 12;

                                groupRows.push(
                                    <tr key={`group-${groupCol}-${row.id}-${level}`} className="bg-gray-100/90 hover:bg-gray-100 sticky z-10 border-b border-gray-200">
                                        <td colSpan={columns.length} className="py-1.5 text-sm font-medium text-gray-800" style={{ paddingLeft: `${paddingLeft}px` }}>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-500 font-normal uppercase text-xs tracking-wider">{label}</span>
                                                <span className="bg-white px-2 py-0.5 rounded border border-gray-300 shadow-sm text-xs font-bold text-gray-900">
                                                    {val === null || val === '' ? '(空白)' : String(val)}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                             }
                        });
                    }

                    return (
                        <React.Fragment key={row.id}>
                            {groupRows}
                            <tr className="hover:bg-blue-50 transition-colors group even:bg-gray-50/50">
                                {row.getVisibleCells().map((cell, cIdx) => {
                                    const isSelected = isCellSelected(rIdx, cIdx);
                                    const isIndex = cell.column.id === '_index';
                                    
                                    return (
                                    <td
                                    key={cell.id}
                                    className={`px-0 py-0 text-sm text-gray-700 whitespace-nowrap border-b border-gray-100 border-r border-gray-200 last:border-r-0 h-9 relative ${isSelected ? 'bg-blue-50 border-blue-200 z-10' : ''} ${isIndex ? 'bg-gray-50' : ''}`}
                                    style={{ 
                                        width: cell.column.getSize(),
                                        borderRightColor: isSelected ? '#93c5fd' : null,
                                        borderBottomColor: isSelected ? '#93c5fd' : null
                                    }}
                                    >
                                        {isIndex ? (
                                            flexRender(cell.column.columnDef.cell, cell.getContext())
                                        ) : (
                                            <EditableCell 
                                                value={cell.getValue()} 
                                                rowId={row.original.id} 
                                                columnId={cell.column.id} 
                                                onUpdate={onCellUpdate} 
                                                rowIndex={rIdx}
                                                colIndex={tableMeta.columns.findIndex(c => c.name === cell.column.id) + 1}
                                                isSelected={isSelected}
                                                onSelectionStart={handleSelectionStart}
                                                onSelectionMove={handleSelectionMove}
                                                onSelectionEnd={handleSelectionEnd}
                                                onContextMenu={handleContextMenu}
                                            />
                                        )}
                                    </td>
                                    );
                                })}
                            </tr>
                        </React.Fragment>
                    );
                })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Status Bar */}
      <div className="p-2 px-4 border-t border-gray-200 bg-white flex items-center justify-between text-sm select-none shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
        
        {/* Left: Stats & Page Size */}
        <div className="flex items-center gap-6 text-gray-500">
             <div className="flex items-center gap-1.5">
                 <span className="font-medium text-gray-700">{totalCount}</span>
                 <span>条记录</span>
             </div>
             
             <div className="h-4 w-px bg-gray-200"></div>
             
             <div className="flex items-center gap-2 group cursor-pointer relative">
                 <span>每页显示</span>
                 <select 
                    className="appearance-none bg-transparent font-medium text-gray-700 py-0.5 pl-2 pr-6 border border-gray-200 rounded hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer text-sm transition-colors"
                    value={pageSize}
                    onChange={(e) => {
                        const val = Number(e.target.value);
                        onPageSizeChange(val);
                    }}
                 >
                     <option value={50}>50 条</option>
                     <option value={100}>100 条</option>
                     <option value={200}>200 条</option>
                     <option value={500}>500 条</option>
                     <option value={1000}>1000 条</option>
                     <option value={100000}>全部显示</option>
                 </select>
                 <ChevronDownIconComponent className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={12} />
             </div>
        </div>

        {/* Right: Navigation */}
        <div className="flex items-center gap-3">
            <PageJumpInput 
                currentPage={currentPage} 
                totalPages={totalPages} 
                onPageChange={onPageChange} 
            />

            <div className="flex items-center gap-1">
                <button
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="第一页"
                >
                    <ChevronsLeft size={16} />
                </button>
                <button
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="上一页"
                >
                    <ChevronLeft size={16} />
                </button>
                
                <div className="w-px h-4 bg-gray-200 mx-1"></div>

                <button
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="下一页"
                >
                    <ChevronRight size={16} />
                </button>
                <button
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="最后一页"
                >
                    <ChevronsRight size={16} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}

// Helper for the custom select arrow
const ChevronDownIconComponent = ({ className, size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="m6 9 6 6 6-6"/>
    </svg>
);
