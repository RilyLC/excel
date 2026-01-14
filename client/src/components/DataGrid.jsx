import React, { useState, useMemo, useEffect, useRef, useContext, createContext, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Plus, Trash2, Download, Settings, ArrowUp, ArrowDown, ArrowUpDown, GripVertical, Eye, EyeOff, Layers, Calculator, Copy, Eraser, Columns, Rows } from 'lucide-react';
import { api } from '../api';

const SelectionContext = createContext(null);

/* --- Helper Components --- */

const EditableHeader = ({ initialValue, onUpdate, canEdit }) => {
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
                value={value ?? ''}
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
                if (canEdit) setIsEditing(true);
            }}
        >
            {initialValue}
        </span>
    );
};

const EditableCell = ({ value: initialValue, rowId, columnId, rowIndex, colIndex, onUpdate }) => {
    const { selection, onSelectionStart, onSelectionMove, onSelectionEnd, onContextMenu, canEdit } = useContext(SelectionContext);
    const [value, setValue] = useState(initialValue);
    const [isEditing, setIsEditing] = useState(false);

    const isSelected = useMemo(() => {
        if (!selection || !selection.start || !selection.end) return false;
        const minRow = Math.min(selection.start.row, selection.end.row);
        const maxRow = Math.max(selection.start.row, selection.end.row);
        const minCol = Math.min(selection.start.col, selection.end.col);
        const maxCol = Math.max(selection.start.col, selection.end.col);
        return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
    }, [selection, rowIndex, colIndex]);

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
            className={`absolute inset-0 flex items-center px-1 select-none ${isSelected ? 'bg-blue-100' : ''}`}
            title={value}
            onDoubleClick={(e) => {
                e.stopPropagation();
                if (canEdit) setIsEditing(true);
            }}
            onMouseDown={(e) => {
                // Left click only
                if (e.button === 0) {
                     // Only select if not editing (though input is separate return)
                     onSelectionStart(rowIndex, colIndex);
                }
            }}
            onMouseEnter={() => onSelectionMove(rowIndex, colIndex)}
            onMouseUp={onSelectionEnd}
            onContextMenu={(e) => onContextMenu(e, rowIndex, colIndex)}
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
                 <option value="IS EMPTY">为空</option>
                 <option value="IS NOT EMPTY">不为空</option>
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
                value={val ?? ''}
                onChange={e => setVal(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={e => e.key === 'Enter' && handleCommit()}
             />
             <span>/ {totalPages || 1} 页</span>
        </div>
    );
};

const AggregateCell = ({ value, func, onChange }) => {
    const displayValue = useMemo(() => {
        if (typeof value === 'number') {
            return Number.isInteger(value) ? value : parseFloat(value.toFixed(2));
        }
        return value;
    }, [value]);

    return (
        <div className="flex items-center justify-between px-2 py-1 h-full gap-1 group relative hover:bg-gray-100 transition-colors cursor-pointer">
            <div className="flex flex-col min-w-0 flex-1">
                {func ? (
                    <>
                        <span className="text-[10px] text-blue-500 font-bold uppercase leading-none mb-0.5 select-none">{func}</span>
                        <span className="text-sm font-bold text-gray-800 truncate font-mono" title={value}>
                            {displayValue}
                        </span>
                    </>
                ) : (
                    <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity select-none flex items-center gap-1">
                        <Calculator size={12} /> 计算函数
                    </span>
                )}
            </div>
            
            <select
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={func || ''}
                onChange={e => onChange(e.target.value)}
                title="选择聚合函数"
            >
                <option value="">无</option>
                <option value="SUM">求和 (Sum)</option>
                <option value="AVG">平均 (Avg)</option>
                <option value="MIN">最小 (Min)</option>
                <option value="MAX">最大 (Max)</option>
                <option value="COUNT">计数 (Count)</option>
            </select>
        </div>
    );
};

export default function DataGrid({ 
    currentUser,
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
    onTableUpdate,
    focusRowId = null
}) {
  
  // -- View State -- //
  const [showViewSettings, setShowViewSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('filter'); // 'filter', 'sort', 'group'

  // -- Aggregates State --
  const [aggregates, setAggregates] = useState({});
  const [aggregateResults, setAggregateResults] = useState({});

  useEffect(() => {
    // Reset aggregates when table changes
    setAggregates({});
    setAggregateResults({});
  }, [tableMeta?.id]);

  useEffect(() => {
      const fetchAggregates = async () => {
          // If no aggregates selected, clear results and return
          if (Object.keys(aggregates).length === 0) {
              setAggregateResults({});
              return;
          }

          if (!tableMeta?.table_name) return;

          try {
              const res = await api.getTableAggregates(tableMeta.table_name, initialFilters, aggregates);
              setAggregateResults(res.data || {});
          } catch (e) {
              console.error("Failed to fetch aggregates", e);
          }
      };

      // Debounce slightly or just run
      const timer = setTimeout(fetchAggregates, 200);
      return () => clearTimeout(timer);
  }, [aggregates, initialFilters, tableMeta?.table_name]);

  // Local State for View Configuration
  const [filters, setFilters] = useState(() => {
    if (!initialFilters) return { logic: 'AND', items: [] };
    if (Array.isArray(initialFilters)) return { logic: 'AND', items: initialFilters };
    return initialFilters;
  });
  const [sorts, setSorts] = useState(initialSorts);
  const [groups, setGroups] = useState(initialGroups);
  const [columnVisibility, setColumnVisibility] = useState({});

  const handleTabToggle = (tab) => {
      if (showViewSettings && activeTab === tab) {
          setShowViewSettings(false);
      } else {
          setActiveTab(tab);
          setShowViewSettings(true);
      }
  };

  // DnD Refs
  const dragItem = useRef(null);
  
  const onSortDragStart = (e, index) => {
      dragItem.current = index;
      e.dataTransfer.effectAllowed = "move"; 
  };
  const onSortDragEnter = (e, index) => {
      if (dragItem.current === null || dragItem.current === index) return;
      const newSorts = [...sorts];
      const draggedItem = newSorts[dragItem.current];
      newSorts.splice(dragItem.current, 1);
      newSorts.splice(index, 0, draggedItem);
      setSorts(newSorts);
      dragItem.current = index;
  };
  const onSortDragEnd = () => { dragItem.current = null; };

  const onGroupDragStart = (e, index) => {
      dragItem.current = index;
      e.dataTransfer.effectAllowed = "move";
  };
  const onGroupDragEnter = (e, index) => {
      if (dragItem.current === null || dragItem.current === index) return;
      const newGroups = [...groups];
      const draggedItem = newGroups[dragItem.current];
      newGroups.splice(dragItem.current, 1);
      newGroups.splice(index, 0, draggedItem);
      setGroups(newGroups);
      dragItem.current = index;
  };
  const onGroupDragEnd = () => { dragItem.current = null; };

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
    setColumnVisibility({});
  }, [initialFilters, initialSorts, initialGroups, tableMeta?.id]);

    const scrollContainerRef = useRef(null);
    const [highlightRowId, setHighlightRowId] = useState(null);

    useEffect(() => {
        if (focusRowId === null || typeof focusRowId === 'undefined') return;

        // Defer to next tick so the DOM for rows is present.
        const handle = window.setTimeout(() => {
            const container = scrollContainerRef.current;
            if (!container) return;

            const selector = `tr[data-row-id="${String(focusRowId)}"]`;
            const rowEl = container.querySelector(selector);
            if (rowEl && typeof rowEl.scrollIntoView === 'function') {
                rowEl.scrollIntoView({ block: 'center' });
                setHighlightRowId(focusRowId);
                window.setTimeout(() => setHighlightRowId(null), 2500);
            }
        }, 0);

        return () => window.clearTimeout(handle);
    }, [focusRowId, data, currentPage, tableMeta?.id]);

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

  const isRowSelected = (rowIndex) => {
      if (!selection.start || !selection.end) return false;
      const minRow = Math.min(selection.start.row, selection.end.row);
      const maxRow = Math.max(selection.start.row, selection.end.row);

      return rowIndex >= minRow && rowIndex <= maxRow;
  };

  const [contextMenu, setContextMenu] = useState(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleAddRow = async (positionDirection) => {
      if (!tableMeta) return;
      try {
          const position = contextMenu?.rowId 
            ? { rowId: contextMenu.rowId, direction: positionDirection } 
            : null;
            
          await api.addRow(tableMeta.table_name, {}, position);
          onTableUpdate && onTableUpdate();
          setContextMenu(null);
      } catch (e) {
          alert('添加行失败');
      }
  };

  const handleDeleteRow = async () => {
      if (!contextMenu?.rowId || !tableMeta) return;
      if (!window.confirm('确定要删除该行吗？')) return;
      try {
          await api.deleteRow(tableMeta.table_name, contextMenu.rowId);
          onTableUpdate && onTableUpdate();
          setContextMenu(null);
      } catch (e) {
          alert('删除行失败');
      }
  };

  const handleAddColumn = async (position) => {
      if (!tableMeta || !contextMenu?.colId) return;
      const name = window.prompt('请输入新列名:');
      if (!name) return;

      try {
          const res = await api.addColumn(tableMeta.table_name, name, 'TEXT');
          const newCol = res.data.column;
          
          const currentCols = [...tableMeta.columns];
          const refIndex = currentCols.findIndex(c => c.name === contextMenu.colId);
          
          if (position === 'left') {
              currentCols.splice(refIndex, 0, newCol);
          } else {
              currentCols.splice(refIndex + 1, 0, newCol);
          }
          
          await api.updateTable(tableMeta.id, { columns: currentCols });
          // Must update meta first, then trigger data refresh or full update
          // onTableUpdate should handle full refresh including columns
          onTableUpdate && onTableUpdate({ ...tableMeta, columns: currentCols });
          setContextMenu(null);
      } catch (e) {
          alert('添加列失败: ' + (e.response?.data?.error || e.message));
      }
  };

  const handleDeleteColumn = async () => {
       if (!tableMeta || !contextMenu?.colId) return;
       if (!window.confirm(`确定要删除列 "${contextMenu.colId}" 吗？此操作不可恢复。`)) return;
       try {
           await api.deleteColumn(tableMeta.table_name, contextMenu.colId);
           
           const currentCols = tableMeta.columns.filter(c => c.name !== contextMenu.colId);
           onTableUpdate && onTableUpdate({ ...tableMeta, columns: currentCols });
           
           setContextMenu(null);
       } catch (e) {
           alert('删除列失败');
       }
  };

  const handleClearSelection = async () => {
      if (!tableMeta || !selection.start || !selection.end) return;
      
      const minRow = Math.min(selection.start.row, selection.end.row);
      const maxRow = Math.max(selection.start.row, selection.end.row);
      const minCol = Math.min(selection.start.col, selection.end.col);
      const maxCol = Math.max(selection.start.col, selection.end.col);

      try {
          // Iterate over selected cells
          for (let r = minRow; r <= maxRow; r++) {
              const row = data[r];
              if (!row) continue;
              
              // Iterate columns
              // colIndex 0 is index, so data col is colIndex - 1
              for (let c = minCol; c <= maxCol; c++) {
                  if (c === 0) continue; // Skip index column
                  const colDef = tableMeta.columns[c - 1];
                  if (colDef) {
                      await api.updateCellValue(tableMeta.table_name, row.id, colDef.name, null);
                  }
              }
          }
          // Ideally we should batch this in backend, but for now simple loop
          onTableUpdate && onTableUpdate();
          setContextMenu(null);
      } catch (e) {
          alert('清空失败');
      }
  };



  const handleDeleteSelectedRows = async () => {
      if (!tableMeta || !selection.start || !selection.end) return;
      if (!window.confirm('确定要删除选中的行吗？')) return;

      const minRow = Math.min(selection.start.row, selection.end.row);
      const maxRow = Math.max(selection.start.row, selection.end.row);
      
      try {
          for (let r = minRow; r <= maxRow; r++) {
              const row = data[r];
              if (row) {
                  await api.deleteRow(tableMeta.table_name, row.id);
              }
          }
          onTableUpdate && onTableUpdate();
          setContextMenu(null);
      } catch (e) {
          alert('删除行失败');
      }
  };

  const handleDeleteSelectedColumns = async () => {
      if (!tableMeta || !selection.start || !selection.end) return;
      
      const minCol = Math.min(selection.start.col, selection.end.col);
      const maxCol = Math.max(selection.start.col, selection.end.col);
      
      // Filter out index column (0)
      const colIndices = [];
      for (let c = minCol; c <= maxCol; c++) {
          if (c > 0) colIndices.push(c - 1);
      }
      
      if (colIndices.length === 0) return;
      
      const colNames = colIndices.map(idx => tableMeta.columns[idx]?.name).filter(Boolean);
      if (colNames.length === 0) return;

      if (!window.confirm(`确定要删除选中的 ${colNames.length} 列吗？`)) return;

      try {
          // Delete sequentially or extend API for batch
          for (const colName of colNames) {
              await api.deleteColumn(tableMeta.table_name, colName);
          }
          
          const newColumns = tableMeta.columns.filter(c => !colNames.includes(c.name));
          onTableUpdate && onTableUpdate({ ...tableMeta, columns: newColumns });
          setContextMenu(null);
      } catch (e) {
          alert('删除列失败');
      }
  };

  const handleContextMenu = (e, rowIndex, colIndex) => {
      e.preventDefault();
      
      // If right click is OUTSIDE current selection, reset selection to just clicked cell
      if (!isCellSelected(rowIndex, colIndex)) {
          setSelection({ 
              start: { row: rowIndex, col: colIndex }, 
              end: { row: rowIndex, col: colIndex }, 
              isDragging: false 
          });
      }
      // If inside selection, keep selection (so we can apply bulk actions)

      const rowId = data[rowIndex]?.id;
      const colId = colIndex > 0 ? tableMeta.columns[colIndex - 1]?.name : null;

      setContextMenu({
          x: e.clientX,
          y: e.clientY,
          rowIndex,
          colIndex,
          rowId,
          colId
      });
  };
  
  // ... (Column Management remains)
  const handleColumnNameUpdate = (oldName, newOriginalName) => {
      if (!onTableUpdate || !tableMeta) return;
      const newColumns = tableMeta.columns.map(c => c.name === oldName ? { ...c, original: newOriginalName } : c);
      onTableUpdate({ ...tableMeta, columns: newColumns });
  };
  
  const canEdit = currentUser?.role === 'admin' || !!currentUser?.permissions?.can_edit;

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
        />
      ),
    }));

    return [indexCol, ...dataCols];

  }, [tableMeta, onCellUpdate, currentPage]);

  const table = useReactTable({
    data: data || [],
    columns,
    state: {
        columnVisibility
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    columnResizeMode: 'onChange',
    defaultColumn: { size: 160, minSize: 80, maxSize: 600 },
  });

  const handleCopySelection = useCallback((e) => {
      if (!selection.start || !selection.end) return;
      
      // Keep default behavior if user is copying text inside an input
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          const sel = window.getSelection();
          if (sel && sel.toString().length > 0) {
              return; 
          }
      }

      const minRow = Math.min(selection.start.row, selection.end.row);
      const maxRow = Math.max(selection.start.row, selection.end.row);
      const minCol = Math.min(selection.start.col, selection.end.col);
      const maxCol = Math.max(selection.start.col, selection.end.col);

      const rows = table.getRowModel().rows.slice(minRow, maxRow + 1);

      const escapeForExcel = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes('\t') || str.includes('\n') || str.includes('"')) {
               return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
      };

      const text = rows.map(row => {
          const cells = row.getVisibleCells().filter((_, idx) => idx >= minCol && idx <= maxCol);
          return cells.map(cell => {
              const val = cell.getValue();
              return escapeForExcel(val);
          }).join('\t');
      }).join('\n');

      if (e && e.type === 'copy') {
          e.preventDefault();
          e.clipboardData.setData('text/plain', text);
      } else {
          navigator.clipboard.writeText(text).then(() => {
              setContextMenu(null);
          });
      }
  }, [selection, table]);

  useEffect(() => {
      document.addEventListener('copy', handleCopySelection);
      return () => document.removeEventListener('copy', handleCopySelection);
  }, [handleCopySelection]);
  
  // -- Quick Filter State (Legacy) --
  // We keep local `filters` state for the advanced panel.

  // New Filter Row State
  if (!tableMeta) return <div className="p-10 text-center text-gray-500">请选择一个表格查看数据</div>;

  const filterCount = filters.items?.length || 0;
  const hiddenCount = Object.values(columnVisibility).filter(v => v === false).length;
  const hasViewChanges = filterCount > 0 || sorts.length > 0 || groups.length > 0 || hiddenCount > 0;

  const canDeleteRows = canEdit && selection.start && selection.end;

  return (
    <SelectionContext.Provider value={{ selection, onSelectionStart: handleSelectionStart, onSelectionMove: handleSelectionMove, onSelectionEnd: handleSelectionEnd, onContextMenu: handleContextMenu, canEdit }}>
    <div className="flex flex-col h-full bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white gap-4">
        
        {/* Left: Title + View Chips */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
             <h2 className="text-lg font-semibold text-gray-800 whitespace-nowrap shrink-0">{tableMeta.name}</h2>
             
             {/* View Control Chips */}
             <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mask-linear-fade pr-2">
                 {/* Filter Chip */}
                 <button 
                    onClick={() => handleTabToggle('filter')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold border transition-all whitespace-nowrap ${
                        showViewSettings && activeTab === 'filter'
                            ? 'bg-orange-100/50 border-orange-300 text-orange-700 shadow-sm ring-1 ring-orange-200'
                            : filterCount > 0 
                                ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-300' 
                                : 'bg-white border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                 >
                    <Filter size={14} className={filterCount > 0 ? "fill-orange-500/20" : ""} />
                    {filterCount > 0 ? `${filterCount} 筛选` : '筛选'}
                 </button>

                 {/* Sort Chip */}
                 <button 
                    onClick={() => handleTabToggle('sort')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold border transition-all whitespace-nowrap ${
                        showViewSettings && activeTab === 'sort'
                            ? 'bg-blue-100/50 border-blue-300 text-blue-700 shadow-sm ring-1 ring-blue-200'
                            : sorts.length > 0
                                ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300' 
                                : 'bg-white border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                 >
                    <ArrowUpDown size={14} />
                    {sorts.length > 0 ? `${sorts.length} 排序` : '排序'}
                 </button>

                 {/* Group Chip */}
                 <button 
                    onClick={() => handleTabToggle('group')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold border transition-all whitespace-nowrap ${
                        showViewSettings && activeTab === 'group'
                            ? 'bg-purple-100/50 border-purple-300 text-purple-700 shadow-sm ring-1 ring-purple-200'
                            : groups.length > 0
                                ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 hover:border-purple-300' 
                                : 'bg-white border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                 >
                    <Layers size={14} /> 
                    {groups.length > 0 ? `${groups.length} 分组` : '分组'}
                 </button>

                 {/* Hidden Chip */}
                 <button 
                    onClick={() => handleTabToggle('field')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold border transition-all whitespace-nowrap ${
                        showViewSettings && activeTab === 'field'
                            ? 'bg-gray-100 border-gray-300 text-gray-800 shadow-sm ring-1 ring-gray-200'
                            : hiddenCount > 0
                                ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300' 
                                : 'bg-white border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                 >
                    {hiddenCount > 0 ? <EyeOff size={14} /> : <Eye size={14} />}
                    {hiddenCount > 0 ? `${hiddenCount} 隐藏` : '字段'}
                 </button>
             </div>
        </div>
        
        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {onManage && (
            <button onClick={onManage} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm">
              <Settings size={14} /> 管理
            </button>
          )}
          {onExport && (
            <button onClick={onExport} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm">
              <Download size={14} /> 导出
            </button>
          )}
        </div>
      </div>

      {/* Advanced View Settings Panel */}
      {showViewSettings && (
        <div className="bg-gray-50 border-b border-gray-200 animate-in slide-in-from-top-2 flex flex-col max-h-[60vh] shadow-lg relative z-20">
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
                        <div className="flex flex-col gap-2">
                        {sorts.map((s, idx) => (
                            <div 
                                key={idx} 
                                draggable
                                onDragStart={(e) => onSortDragStart(e, idx)}
                                onDragEnter={(e) => onSortDragEnter(e, idx)}
                                onDragEnd={onSortDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                                className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded text-sm shadow-sm hover:border-blue-400 transition-colors"
                            >
                                <div className="text-gray-300 cursor-move hover:text-gray-600 transition-colors" title="拖拽排序">
                                    <GripVertical size={14} />
                                </div>
                                <span className="text-xs font-bold text-gray-400 w-8 select-none">No.{idx + 1}</span>
                                <div className="h-4 w-px bg-gray-200 mx-1"></div>
                                <select 
                                    className="text-sm border-gray-300 rounded shadow-sm py-1 focus:border-blue-500 focus:ring-blue-500 flex-1"
                                    value={s.column}
                                    onChange={e => updateSort(idx, 'column', e.target.value)}
                                >
                                    {tableMeta.columns.map(c => (
                                        <option key={c.name} value={c.name}>{c.original}</option>
                                    ))}
                                </select>
                                <select 
                                    className="text-sm border-gray-300 rounded shadow-sm py-1 focus:border-blue-500 focus:ring-blue-500 w-32"
                                    value={s.direction}
                                    onChange={e => updateSort(idx, 'direction', e.target.value)}
                                >
                                    <option value="ASC">升序 (A-Z)</option>
                                    <option value="DESC">降序 (Z-A)</option>
                                </select>
                                <button onClick={() => removeSort(idx)} className="text-gray-400 hover:text-red-500 ml-2 transition-colors">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                        </div>
                        <button onClick={addSort} className="text-xs text-gray-600 hover:text-blue-600 flex items-center gap-1 px-1 py-1 rounded hover:bg-white transition-colors w-fit border border-transparent hover:border-gray-200">
                            <Plus size={12} /> 添加排序规则
                        </button>
                    </div>
                )}

                {/* GROUP TAB */}
                {activeTab === 'group' && (
                    <div className="space-y-3">
                        <div className="flex flex-col gap-2">
                            {groups.map((gColumn, idx) => {
                                const colDef = tableMeta.columns.find(c => c.name === gColumn);
                                return (
                                    <div 
                                        key={idx} 
                                        draggable
                                        onDragStart={(e) => onGroupDragStart(e, idx)}
                                        onDragEnter={(e) => onGroupDragEnter(e, idx)}
                                        onDragEnd={onGroupDragEnd}
                                        onDragOver={(e) => e.preventDefault()}
                                        className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded text-sm shadow-sm justify-between hover:border-blue-400 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 flex-1">
                                            <div className="text-gray-300 cursor-move hover:text-gray-600 transition-colors" title="拖拽排序">
                                                <GripVertical size={14} />
                                            </div>
                                            <span className="text-xs font-bold text-gray-400 w-12 select-none">Level {idx + 1}</span>
                                            <div className="h-4 w-px bg-gray-200 mx-1"></div>
                                            <span className="font-medium text-gray-700">{colDef ? colDef.original : gColumn}</span>
                                        </div>
                                        <button onClick={() => toggleGroup(gColumn)} className="text-gray-400 hover:text-red-500 transition-colors">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Add Group Logic */}
                        <div className="pt-2 border-t border-gray-200 mt-2">
                            <span className="text-xs text-gray-500 block mb-2">点击字段添加到分组:</span>
                            <div className="flex flex-wrap gap-2">
                                {tableMeta.columns.filter(c => !groups.includes(c.name)).map(c => (
                                    <button 
                                        key={c.name}
                                        onClick={() => toggleGroup(c.name)}
                                        className="px-2 py-1 text-xs rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center gap-1"
                                    >
                                        <Plus size={10} />
                                        {c.original}
                                    </button>
                                ))}
                                {tableMeta.columns.filter(c => !groups.includes(c.name)).length === 0 && (
                                    <span className="text-xs text-gray-400 italic">所有字段已添加</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* FIELD TAB */}
                {activeTab === 'field' && (
                    <div className="space-y-3">
                         <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                             <span className="text-xs text-gray-500">点击并在选中状态下显示，灰色为隐藏</span>
                             <div className="flex items-center gap-3">
                                 <button 
                                     onClick={() => {
                                         const newVis = {};
                                         tableMeta.columns.forEach(c => newVis[c.name] = false);
                                         setColumnVisibility(newVis);
                                     }}
                                     className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                     disabled={hiddenCount === tableMeta.columns.length}
                                     title="隐藏所有字段"
                                 >
                                     <EyeOff size={12} /> 隐藏所有
                                 </button>
                                 <div className="h-3 w-px bg-gray-200"></div>
                                 <button 
                                     onClick={() => setColumnVisibility({})}
                                     className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                     disabled={hiddenCount === 0}
                                     title="显示所有字段"
                                 >
                                     <Eye size={12} /> 显示所有
                                 </button>
                             </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {tableMeta.columns.map(col => {
                                const isHidden = columnVisibility[col.name] === false;
                                return (
                                    <button
                                        key={col.name}
                                        onClick={() => setColumnVisibility(prev => ({
                                            ...prev,
                                            [col.name]: prev[col.name] === false ? true : false
                                        }))}
                                        className={`flex items-center gap-2 p-2 border rounded text-sm text-left transition-all ${
                                            isHidden 
                                                ? 'bg-gray-100/50 border-gray-200 text-gray-400' 
                                                : 'bg-white border-blue-300 text-blue-700 shadow-sm ring-1 ring-blue-100/50'
                                        }`}
                                    >
                                        {isHidden ? (
                                            <EyeOff size={14} className="text-gray-400 shrink-0" />
                                        ) : (
                                            <Eye size={14} className="text-blue-500 shrink-0" />
                                        )}
                                        <span className={`truncate text-xs font-medium ${isHidden ? 'line-through decoration-gray-300' : ''}`}>
                                            {col.original}
                                        </span>
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
            <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-white relative select-none">
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
                        className={`px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 border-r border-gray-200 bg-gray-50 relative group/header ${isIndex ? 'sticky left-0 z-30 shadow-[1px_0_3px_rgba(0,0,0,0.05)]' : ''}`}
                        style={{ width: header.getSize() }}
                    >
                        <div className="flex items-center justify-between gap-2 h-full">
                            {!isIndex ? (
                                <EditableHeader 
                                    initialValue={header.column.columnDef.header}
                                    onUpdate={(newVal) => handleColumnNameUpdate(columnName, newVal)}
                                    canEdit={canEdit}
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

                    const isSelectedRow = isRowSelected(rIdx);

                    return (
                        <React.Fragment key={row.id}>
                            {groupRows}
                            <tr
                                data-row-id={row.original?.id}
                                className={`hover:bg-blue-50 transition-colors group ${!isSelectedRow ? 'even:bg-gray-50/50' : ''} ${
                                    highlightRowId !== null && String(row.original?.id) === String(highlightRowId)
                                        ? 'bg-yellow-50 ring-2 ring-yellow-300'
                                        : isSelectedRow ? 'bg-blue-50' : ''
                                }`}
                            >
                                {row.getVisibleCells().map((cell, cIdx) => {
                                    const isSelected = isCellSelected(rIdx, cIdx);
                                    const isIndex = cell.column.id === '_index';
                                    
                                    return (
                                    <td
                                    key={cell.id}
                                    className={`px-0 py-0 text-sm text-gray-700 whitespace-nowrap border-b border-gray-100 border-r border-gray-200 last:border-r-0 h-9 relative ${isSelected ? 'bg-blue-50 border-blue-200 z-10' : ''} ${isIndex ? 'bg-gray-50 sticky left-0 z-20 shadow-[1px_0_3px_rgba(0,0,0,0.05)]' : ''}`}
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
          <tfoot className="bg-gray-50 sticky bottom-0 z-30 border-t border-gray-200 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]">
            <tr>
               {table.getVisibleLeafColumns().map((column, idx) => {
                   const isIndex = column.id === '_index';
                   if (isIndex) {
                       return <td key={column.id} className="p-2 text-xs text-center text-gray-400 font-semibold bg-gray-50 border-r border-gray-200 sticky left-0 z-30 shadow-[1px_0_3px_rgba(0,0,0,0.05)]">统计</td>;
                   }
                   
                   const colName = column.columnDef.accessorKey;
                   const func = aggregates[colName];
                   const result = aggregateResults[colName];
                   
                   return (
                       <td key={column.id} className="border-r border-gray-200 last:border-r-0 bg-gray-50 h-10 p-0">
                           <AggregateCell 
                                value={result} 
                                func={func} 
                                onChange={(newFunc) => {
                                    setAggregates(prev => {
                                        const next = { ...prev };
                                        if (!newFunc) delete next[colName];
                                        else next[colName] = newFunc;
                                        return next;
                                    });
                                }}
                           />
                       </td>
                   );
               })}
            </tr>
          </tfoot>
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
      
      {/* Context Menu */}
      {contextMenu && (
        <div 
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-52 text-sm animate-in fade-in zoom-in-95 duration-100"
            style={{ top: Math.min(contextMenu.y, window.innerHeight - 350), left: Math.min(contextMenu.x, window.innerWidth - 250) }}
            onClick={e => e.stopPropagation()}
        >
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100 mb-1">
                操作 ({selection.start && selection.end ? (Math.abs(selection.end.row - selection.start.row) + 1) * (Math.abs(selection.end.col - selection.start.col) + 1) : 1} 个单元格)
            </div>

            <button 
                onClick={handleCopySelection}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2 text-gray-700"
            >
                <Copy size={14} className="text-gray-400" /> 复制内容
            </button>
            <button 
                onClick={handleClearSelection}
                disabled={!canEdit}
                className={`w-full text-left px-4 py-2 flex items-center gap-2 ${!canEdit ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-700'}`}
            >
                <Eraser size={14} className={!canEdit ? 'text-gray-300' : 'text-gray-400'} /> 清空数据
            </button>

            <div className="h-px bg-gray-100 my-1"></div>

            <button 
                onClick={() => handleAddRow('before')}
                disabled={!canEdit}
                className={`w-full text-left px-4 py-2 flex items-center gap-2 ${!canEdit ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-700'}`}
            >
                <ArrowUp size={14} className={!canEdit ? 'text-gray-300' : 'text-gray-400'} /> 在上方插入行
            </button>
            <button 
                onClick={() => handleAddRow('after')}
                disabled={!canEdit}
                className={`w-full text-left px-4 py-2 flex items-center gap-2 ${!canEdit ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-700'}`}
            >
                <ArrowDown size={14} className={!canEdit ? 'text-gray-300' : 'text-gray-400'} /> 在下方插入行
            </button>
            {canDeleteRows && (
                <button 
                    onClick={handleDeleteSelectedRows}
                    className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"
                >
                    <Rows size={14} /> 删除选中行
                </button>
            )}
            
            {contextMenu.colId && (
                <>
                    <div className="h-px bg-gray-100 my-1"></div>
                    <button 
                        onClick={() => handleAddColumn('left')}
                        disabled={!canEdit}
                        className={`w-full text-left px-4 py-2 flex items-center gap-2 ${!canEdit ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-700'}`}
                    >
                        <ChevronsLeft size={14} className={!canEdit ? 'text-gray-300' : 'text-gray-400'} /> 左侧插入列
                    </button>
                    <button 
                        onClick={() => handleAddColumn('right')}
                        disabled={!canEdit}
                        className={`w-full text-left px-4 py-2 flex items-center gap-2 ${!canEdit ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-700'}`}
                    >
                        <ChevronsRight size={14} className={!canEdit ? 'text-gray-300' : 'text-gray-400'} /> 右侧插入列
                    </button>
                    {canEdit && (
                        <button 
                            onClick={handleDeleteSelectedColumns}
                            className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"
                        >
                            <Columns size={14} /> 删除选中列
                        </button>
                    )}
                </>
            )}
        </div>
      )}
    </div>
    </SelectionContext.Provider>
  );
}

// Helper for the custom select arrow
const ChevronDownIconComponent = ({ className, size }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="m6 9 6 6 6-6"/>
    </svg>
);
