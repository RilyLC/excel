import React, { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Filter, Plus, Trash2, Download, Settings } from 'lucide-react';

const EditableCell = ({ value: initialValue, rowId, columnId, onUpdate }) => {
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
                className="w-full px-1 py-0.5 border border-blue-500 rounded text-sm focus:outline-none bg-white"
            />
        );
    }

    return (
        <div 
            onDoubleClick={() => setIsEditing(true)}
            className="cursor-text w-full h-full min-h-[20px] truncate"
            title={value}
        >
            {value}
        </div>
    );
};

export default function DataGrid({ tableMeta, data, totalPages, currentPage, onPageChange, onFilterChange, initialFilters = [], onExport, onCellUpdate, onManage }) {
  // Dynamic columns based on metadata
  const columns = useMemo(() => {
    if (!tableMeta || !tableMeta.columns) return [];
    return tableMeta.columns.map(col => ({
      accessorKey: col.name, // Use the sanitized name
      header: col.original, // Show the original header
      size: 160,
      minSize: 80,
      maxSize: 600,
      cell: info => (
        <EditableCell 
            value={info.getValue()} 
            rowId={info.row.original.id} 
            columnId={col.name} 
            onUpdate={onCellUpdate} 
        />
      ),
    }));
  }, [tableMeta, onCellUpdate]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    columnResizeMode: 'onChange',
    defaultColumn: {
      size: 160,
      minSize: 80,
      maxSize: 600,
    },
  });

  // Filter State
  const [showFilters, setShowFilters] = useState(false);
  const [filterList, setFilterList] = useState([]);
  
  // Temporary state for the new filter being added
  const [newFilter, setNewFilter] = useState({ column: '', operator: '=', value: '', logic: 'AND' });

  // Reset filter state when table changes
  React.useEffect(() => {
    if (initialFilters && initialFilters.length > 0) {
        setFilterList(initialFilters);
        setShowFilters(true);
    } else {
        setFilterList([]);
        setShowFilters(false);
    }
    setNewFilter({ column: '', operator: '=', value: '', logic: 'AND' });
  }, [tableMeta?.id, initialFilters]);

  const addFilter = () => {
    if (!newFilter.column || !newFilter.value) return;
    
    const updatedFilters = [...filterList, { ...newFilter }];
    setFilterList(updatedFilters);
    onFilterChange(updatedFilters);
    
    // Reset input but keep logic for next one
    setNewFilter(prev => ({ ...prev, value: '' })); 
  };

  const removeFilter = (index) => {
    const updatedFilters = filterList.filter((_, i) => i !== index);
    setFilterList(updatedFilters);
    onFilterChange(updatedFilters);
  };

  const clearAllFilters = () => {
    setFilterList([]);
    onFilterChange([]);
  };

  if (!tableMeta) return <div className="p-10 text-center text-gray-500">请选择一个表格查看数据</div>;

  return (
    <div className="flex flex-col h-full bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
        <h2 className="text-lg font-semibold text-gray-800">{tableMeta.name}</h2>
        <div className="flex items-center gap-2">
          {onManage && (
            <button 
              onClick={onManage}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              title="管理表格"
            >
              <Settings size={16} />
              管理
            </button>
          )}
          {onExport && (
            <button 
              onClick={onExport}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              title="导出 Excel"
            >
              <Download size={16} />
              导出
            </button>
          )}
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            <Filter size={16} />
            高级筛选 {filterList.length > 0 && <span className="bg-blue-600 text-white text-[10px] px-1.5 rounded-full">{filterList.length}</span>}
          </button>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="p-4 bg-gray-50 border-b border-gray-200 space-y-3 animate-in slide-in-from-top-2">
            
            {/* Existing Filters List */}
            {filterList.length > 0 && (
                <div className="space-y-2 mb-4">
                    {filterList.map((filter, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm bg-white p-2 rounded border border-gray-200">
                            {idx > 0 && <span className="font-bold text-gray-500 text-xs uppercase px-1">{filter.logic === 'AND' ? '且' : '或'}</span>}
                            <span className="text-gray-600 font-medium">
                                {tableMeta.columns.find(c => c.name === filter.column)?.original || filter.column}
                            </span>
                            <span className="text-blue-600 font-mono">{filter.operator}</span>
                            <span className="text-gray-900 font-medium">{filter.value}</span>
                            <button onClick={() => removeFilter(idx)} className="ml-auto text-gray-400 hover:text-red-500">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add New Filter Row */}
            <div className="flex items-center gap-2 flex-wrap">
                {filterList.length > 0 && (
                     <select 
                        className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 w-20"
                        value={newFilter.logic}
                        onChange={e => setNewFilter({...newFilter, logic: e.target.value})}
                    >
                        <option value="AND">且 (AND)</option>
                        <option value="OR">或 (OR)</option>
                    </select>
                )}

                <select 
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={newFilter.column}
                    onChange={e => setNewFilter({...newFilter, column: e.target.value})}
                >
                    <option value="">选择列...</option>
                    {tableMeta.columns.map(c => (
                        <option key={c.name} value={c.name}>{c.original}</option>
                    ))}
                </select>

                <select 
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    value={newFilter.operator}
                    onChange={e => setNewFilter({...newFilter, operator: e.target.value})}
                >
                    <option value="=">等于 (=)</option>
                    <option value="!=">不等于 (!=)</option>
                    <option value=">">大于 ({'>'})</option>
                    <option value="<">小于 ({'<'})</option>
                    <option value=">=">大于等于 ({'>='})</option>
                    <option value="<=">小于等于 ({'<='})</option>
                    <option value="LIKE">包含</option>
                    <option value="NOT LIKE">不包含</option>
                </select>

                <input 
                    type="text" 
                    placeholder="值..." 
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-2 py-1 flex-1 min-w-[100px]"
                    value={newFilter.value}
                    onChange={e => setNewFilter({...newFilter, value: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && addFilter()}
                />

                <button 
                    onClick={addFilter} 
                    disabled={!newFilter.column || !newFilter.value}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus size={14} /> 添加条件
                </button>
                
                {filterList.length > 0 && (
                    <button onClick={clearAllFilters} className="px-3 py-1 text-gray-500 text-sm hover:text-gray-900 ml-2">
                        清空所有
                    </button>
                )}
            </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="text-left border-collapse" style={{ width: table.getTotalSize() }}>
          <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50 relative"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {/* Resize handle */}
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none ${
                        header.column.getIsResizing() ? 'bg-blue-500' : 'hover:bg-gray-300'
                      }`}
                      title="拖动调整列宽"
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {table.getRowModel().rows.length === 0 ? (
                <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-400">
                        暂无数据
                    </td>
                </tr>
            ) : (
                table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap border-r border-transparent last:border-r-0"
                      style={{ width: cell.column.getSize() }}
                    >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                    ))}
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-3 border-t border-gray-200 bg-white flex items-center justify-between">
        <div className="text-sm text-gray-500">
            第 <span className="font-medium">{currentPage}</span> 页 / 共 <span className="font-medium">{totalPages || 1}</span> 页
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
