import React, { useState, useMemo } from 'react';
import { Play, Save, X, Database, Info, Loader2, Search } from 'lucide-react';
import { api } from '../api';

export default function QueryBuilder({ isOpen, onClose, tables, projects, onSaveSuccess, onShowAlert }) {
    const [sql, setSql] = useState('SELECT * FROM ');
    const [targetTableName, setTargetTableName] = useState('');
    const [targetProjectId, setTargetProjectId] = useState('null');
    const [error, setError] = useState(null);
    const [isExecuting, setIsExecuting] = useState(false);
    
    // Table Search State
    const [tableSearch, setTableSearch] = useState('');

    const filteredTables = useMemo(() => {
        if (!tableSearch.trim()) return tables;
        const q = tableSearch.toLowerCase();
        return tables.filter(t => 
            t.name.toLowerCase().includes(q) || 
            t.table_name.toLowerCase().includes(q)
        );
    }, [tables, tableSearch]);
    
    // Preview State
    const [previewData, setPreviewData] = useState(null); // { columns: [], data: [] }
    const [showPreview, setShowPreview] = useState(false);

    const handlePreview = async () => {
        if (!sql.trim()) {
            setError('请输入 SQL 查询语句');
            return;
        }
        
        setIsExecuting(true);
        setError(null);
        setPreviewData(null);

        try {
            const res = await api.previewQuery(sql);
            setPreviewData(res.data);
            setShowPreview(true);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || '执行失败，请检查 SQL 语法');
        } finally {
            setIsExecuting(false);
        }
    };

    const handleExecuteAndSave = async () => {
        if (!sql.trim()) {
            setError('请输入 SQL 查询语句');
            return;
        }
        if (!targetTableName.trim()) {
            setError('请输入目标表名');
            return;
        }

        setIsExecuting(true);
        setError(null);

        try {
            await api.saveQueryAsTable(
                sql, 
                targetTableName, 
                targetProjectId === 'null' ? null : targetProjectId
            );
            if (onShowAlert) {
                onShowAlert('查询执行成功并已保存为新表！', 'success');
            }
            onSaveSuccess();
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || '执行失败，请检查 SQL 语法');
        } finally {
            setIsExecuting(false);
        }
    };


    const insertTableName = (name) => {
        setSql(prev => prev + `"${name}" `);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-[900px] h-[700px] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Database className="text-blue-600" />
                        SQL 高级联合查询
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar: Table List */}
                    <div className="w-64 bg-gray-50 border-r border-gray-200 overflow-hidden flex flex-col shrink-0">
                        <div className="p-4 border-b border-gray-200 bg-gray-50">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">可用数据表</h3>
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input 
                                    type="text" 
                                    placeholder="搜索表名..." 
                                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                    value={tableSearch}
                                    onChange={e => setTableSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {filteredTables.length === 0 ? (
                                <div className="text-center text-gray-400 text-xs py-4">无匹配表格</div>
                            ) : (
                                filteredTables.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => insertTableName(t.table_name)}
                                        className="w-full text-left px-3 py-2 text-sm rounded hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all truncate group relative"
                                        title={`点击插入表名: ${t.table_name}`}
                                    >
                                        <span className="font-medium text-gray-700">{t.name}</span>
                                        <br/>
                                        <span className="text-xs text-gray-400 font-mono group-hover:text-blue-500">{t.table_name}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Main Area */}
                    <div className="flex-1 flex flex-col p-6 min-w-0">
                        {/* Info Box */}
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 flex gap-3 text-sm text-blue-700">
                            <Info size={18} className="shrink-0 mt-0.5" />
                            <div>
                                支持标准 SQLite 语法。您可以执行 JOIN, UNION, GROUP BY 等复杂查询。
                                <br />
                                示例: <code>SELECT A.name, B.salary FROM "t_users" A JOIN "t_salaries" B ON A.id = B.user_id</code>
                            </div>
                        </div>

                        {/* SQL Editor */}
                        <div className={`mb-4 relative flex flex-col transition-all duration-300 ${showPreview ? 'h-40 shrink-0' : 'flex-1'}`}>
                            <label className="text-xs font-semibold text-gray-500 mb-1">SQL 编辑器</label>
                            <textarea
                                value={sql}
                                onChange={e => setSql(e.target.value)}
                                className="w-full h-full p-4 font-mono text-sm bg-gray-900 text-green-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
                                placeholder="在此编写 SQL 查询..."
                                spellCheck="false"
                            />
                        </div>
                        
                        {/* Toolbar: Preview & Save Controls */}
                        <div className="flex flex-col gap-4">
                            {/* Error Message */}
                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded text-sm">
                                    <strong>错误:</strong> {error}
                                </div>
                            )}

                            {/* Controls */}
                            <div className="flex items-end gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <button 
                                    onClick={handlePreview}
                                    disabled={isExecuting}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 font-medium disabled:opacity-50 transition-colors"
                                >
                                    {isExecuting ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
                                    预览
                                </button>

                                <div className="w-px h-8 bg-gray-300 mx-2"></div>

                                <div className="w-40">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                        保存为新表名
                                    </label>
                                    <input 
                                        type="text" 
                                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm h-9"
                                        placeholder="例如: 季度汇总"
                                        value={targetTableName}
                                        onChange={e => setTargetTableName(e.target.value)}
                                    />
                                </div>
                                
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                        所属项目
                                    </label>
                                    <select 
                                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm h-9"
                                        value={targetProjectId}
                                        onChange={e => setTargetProjectId(e.target.value)}
                                    >
                                        <option value="null">未分类</option>
                                        {projects.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <button 
                                    onClick={handleExecuteAndSave}
                                    disabled={isExecuting || !targetTableName}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm h-9"
                                >
                                    <Save size={18} />
                                    保存结果
                                </button>
                            </div>
                        </div>

                        {/* Preview Results Area */}
                        {showPreview && (
                            <div className="mt-4 flex-1 min-h-0 flex flex-col animate-in slide-in-from-bottom-2">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-semibold text-gray-500">查询结果预览 (前 100 行)</label>
                                    <button onClick={() => setShowPreview(false)} className="text-xs text-blue-600 hover:underline">隐藏预览</button>
                                </div>
                                <div className="flex-1 overflow-auto border border-gray-200 rounded-lg bg-white shadow-inner">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead className="bg-gray-100 sticky top-0">
                                            <tr>
                                                {previewData?.columns.map(col => (
                                                    <th key={col} className="px-3 py-2 font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {previewData?.data.map((row, i) => (
                                                <tr key={i} className="hover:bg-blue-50">
                                                    {previewData.columns.map(col => (
                                                        <td key={col} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                                                            {row[col]}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                            {previewData?.data.length === 0 && (
                                                <tr>
                                                    <td colSpan={previewData.columns.length || 1} className="px-4 py-8 text-center text-gray-400">
                                                        无数据返回
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}