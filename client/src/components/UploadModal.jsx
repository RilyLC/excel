import React, { useRef, useState, useEffect } from 'react';
import { Upload, X, Loader2, FileText, Trash2, CheckCircle, AlertCircle, ChevronDown, ChevronRight, Table } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function UploadModal({ isOpen, onClose, onUpload, projects = [], initialProjectId = 'null' }) {
  const fileInputRef = useRef(null);
  
  // State for flow
  const [step, setStep] = useState('select'); // 'select', 'config', 'uploading'
  
  // Configuration State
  const [tasks, setTasks] = useState([]); // Array of { id, file, baseName, sheetName (opt), tableName, status, errorMsg, rawData, headerRowIndex, isExpanded }
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false); // parsing or uploading
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);

  useEffect(() => {
      if (isOpen) {
          setSelectedProjectId(initialProjectId);
          resetState();
      }
  }, [isOpen, initialProjectId]);

  const resetState = () => {
      setStep('select');
      setTasks([]);
      setIsProcessing(false);
      setUploadProgress({ current: 0, total: 0 });
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setError(null);
    setIsProcessing(true); // Parsing...

    const newTasks = [];
    
    try {
        for (const file of files) {
             const baseName = file.name.replace(/\.[^/.]+$/, "");
             const ext = file.name.split('.').pop().toLowerCase();
             
             if (['xlsx', 'xls'].includes(ext)) {
                 try {
                     const data = await file.arrayBuffer();
                     const workbook = XLSX.read(data, { type: 'array' });
                     const sheetNames = workbook.SheetNames;
                     
                     if (sheetNames.length > 0) {
                         // Create a task for EACH sheet
                         sheetNames.forEach((sheet, idx) => {
                             let defaultTableName = baseName;
                             if (sheetNames.length > 1) {
                                 defaultTableName = `${baseName}_${sheet}`;
                             }
                             
                             // Read Top 5 rows for Preview (header: 1 returns array of arrays)
                             const previewSheet = workbook.Sheets[sheet];
                             const rawData = XLSX.utils.sheet_to_json(previewSheet, { header: 1, limit: 10 }).slice(0, 5);

                             // Check empty
                             const isEmpty = !rawData || rawData.length === 0;

                             newTasks.push({
                                 id: Math.random().toString(36).substr(2, 9),
                                 file,
                                 baseName,
                                 sheetName: sheet,
                                 tableName: defaultTableName,
                                 status: isEmpty ? 'skipped' : 'pending',
                                 errorMsg: isEmpty ? '表格为空，已自动跳过' : null,
                                 headerRowIndex: 0,
                                 rawData,
                                 isExpanded: false
                             });
                         });
                     } else {
                         // Empty excel? Treat as file (will fail on server likely but handle generic)
                         newTasks.push({
                             id: Math.random().toString(36).substr(2, 9),
                             file,
                             baseName,
                             sheetName: null,
                             tableName: baseName,
                             status: 'pending'
                         });
                     }
                 } catch (err) {
                    console.error(`Failed to parse ${file.name}`, err);
                    // Add as generic task, let server handle or fail
                    newTasks.push({
                         id: Math.random().toString(36).substr(2, 9),
                         file,
                         baseName,
                         sheetName: null,
                         tableName: baseName,
                         status: 'error',
                         errorMsg: '解析失败: ' + err.message
                     });
                 }
             } else {
                // Not Excel
                newTasks.push({
                    id: Math.random().toString(36).substr(2, 9),
                    file,
                    baseName,
                    sheetName: null,
                    tableName: baseName,
                    status: 'pending'
                });
             }
        }
        
        setTasks(prev => [...prev, ...newTasks]);
        setStep('config');
    } catch (err) {
        console.error(err);
        setError('解析文件失败: ' + err.message);
    } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeTask = (id) => {
      setTasks(prev => prev.filter(t => t.id !== id));
      if (tasks.length <= 1) { // removing last one
           // Maybe go back to select? No, allow adding more? 
           // If empty after remove, show empty state in config
      }
  };

  const updateTaskName = (id, newName) => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, tableName: newName } : t));
  };
  
  const toggleTaskExpand = (id) => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, isExpanded: !t.isExpanded } : t));
  };

  const setTaskHeaderRow = (id, rowIndex) => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, headerRowIndex: rowIndex } : t));
  };

  const handleStartUpload = async () => {
      // Filter out skipped tasks as well
      const pendingTasks = tasks.filter(t => t.status !== 'success' && t.status !== 'skipped');
      if (pendingTasks.length === 0) return;

      // Validate names
      const emptyNames = pendingTasks.filter(t => !t.tableName || !t.tableName.trim());
      if (emptyNames.length > 0) {
          setError('请为所有文件设置表名称');
          return;
      }

      setIsProcessing(true);
      setUploadProgress({ current: 0, total: pendingTasks.length });
      setError(null);

      let successCount = 0;

      for (let i = 0; i < pendingTasks.length; i++) {
          const task = pendingTasks[i];
          setUploadProgress(prev => ({ ...prev, current: i + 1 }));
          
          // Mark as uploading (optimistic UI update if we wanted deeper state)
          
          try {
              const formData = new FormData();
              formData.append('file', task.file);
              formData.append('projectId', selectedProjectId === 'null' ? '' : selectedProjectId);
              formData.append('tableName', task.tableName);
              if (task.sheetName) {
                  formData.append('sheetName', task.sheetName);
              }
              formData.append('headerRowIndex', task.headerRowIndex || 0);

              await onUpload(formData);
              
              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'success' } : t));
              successCount++;
          } catch (err) {
              console.error(err);
              const msg = err.response?.data?.error || err.message || '上传失败';
              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error', errorMsg: msg } : t));
          }
      }

      setIsProcessing(false);
      
      if (successCount === pendingTasks.length) {
          // All good
          onClose();
      } else {
          // Some failed
          setError(`已完成，但有 ${pendingTasks.length - successCount} 个文件失败`);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[80vh] flex flex-col relative animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">批量导入数据</h3>
            <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            >
            <X size={20} />
            </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
            {step === 'select' && (
                <>
                    <p className="text-sm text-gray-500 mb-4">
                    支持 .xlsx, .xls, .csv, .docx, .txt 格式。
                    </p>
                    {/* Project Selection */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">导入到项目</label>
                        <select 
                            className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                            value={selectedProjectId}
                            onChange={e => setSelectedProjectId(e.target.value)}
                        >
                            <option value="null">未分类</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div 
                    onClick={() => !isProcessing && fileInputRef.current?.click()}
                    className={`
                        border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
                        ${isProcessing ? 'bg-gray-50 border-gray-300' : 'border-blue-300 hover:border-blue-500 hover:bg-blue-50'}
                    `}
                    >
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".xlsx, .xls, .csv, .docx, .txt"
                        className="hidden"
                        multiple 
                    />
                    
                    {isProcessing ? (
                        <div className="flex flex-col items-center gap-2 text-blue-600">
                        <Loader2 size={32} className="animate-spin" />
                        <span className="text-sm font-medium">正在解析文件...</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-600">
                        <Upload size={32} className="text-blue-500" />
                        <span className="text-sm font-medium">点击选择多个文件</span>
                        <span className="text-xs text-gray-400">支持 Excel / CSV / Word / Txt</span>
                        </div>
                    )}
                    </div>
                </>
            )}

            {step === 'config' && (
              
                <div className="space-y-4">
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 flex items-center gap-1.5">
                        <AlertCircle size={14} className="shrink-0"/>
                        <span>提示: 对于表格类型,请确保表头为列名,点击“设置表头”进行调整</span>
                    </div>

                    {/* Project Selection in Config Step */}
                    <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-md border border-gray-200">
                        <label className="text-sm font-medium text-gray-700 shrink-0">导入到项目:</label>
                        <select 
                            className="flex-1 border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
                            value={selectedProjectId}
                            onChange={e => setSelectedProjectId(e.target.value)}
                            disabled={isProcessing}
                        >
                            <option value="null">未分类</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">待导入列表 ({tasks.length})</span>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            disabled={isProcessing}
                        >
                            <Upload size={12} /> 继续添加
                        </button>
                        {/* Hidden input for adding more */}
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".xlsx, .xls, .csv, .docx, .txt"
                            className="hidden"
                            multiple 
                        />
                    </div>

                    {tasks.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">暂无文件</div>
                    ) : (
                        <div className="space-y-3">
                            {tasks.map((task, index) => (
                                <div key={task.id} className={`flex items-start gap-3 p-3 rounded-lg border ${task.status === 'error' ? 'bg-red-50 border-red-200' : task.status === 'success' ? 'bg-green-50 border-green-200' : task.status === 'skipped' ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-200 shadow-sm'}`}>
                                    <div className="mt-2 text-gray-500 ">
                                        {task.status === 'success' ? <CheckCircle size={18} className="text-green-500"/> :
                                         task.status === 'error' ? <AlertCircle size={18} className="text-red-500"/> :
                                         task.status === 'skipped' ? <AlertCircle size={18} className="text-gray-400"/> :
                                         <FileText size={18} />}
                                    </div>
                                    <div className="flex-1 space-y-2 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs text-gray-500 flex items-center gap-2">
                                                <span className="font-medium text-gray-700 max-w-[270px] ">{task.file.name}</span>
                                                {task.sheetName && <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs">Sheet: {task.sheetName}</span>}
                                                {task.status === 'skipped' && <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-xs">已跳过</span>}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {task.rawData && task.status !== 'skipped' && (
                                                    <button 
                                                        onClick={() => toggleTaskExpand(task.id)}
                                                        className="text-xs flex items-center gap-1 text-gray-500 hover:text-blue-600 bg-gray-50 px-2 py-1 rounded border border-gray-200"
                                                        title="预览并设置表头"
                                                    >
                                                        <Table size={12} />
                                                        {task.isExpanded ? '收起预览' : '设置表头'}
                                                        {task.isExpanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                                                    </button>
                                                )}
                                                {task.status !== 'success' && !isProcessing && (
                                                    <button onClick={() => removeTask(task.id)} className="text-gray-400 hover:text-red-500 p-1">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {task.status === 'success' ? (
                                             <div className="text-sm font-medium text-green-700 truncate">{task.tableName} (已导入)</div>
                                        ) : task.status === 'skipped' ? (
                                             <div className="text-sm text-gray-400 italic">{task.errorMsg}</div>
                                        ) : (
                                            <input 
                                                className={`w-full text-sm border rounded px-2 py-1 ${task.status === 'error' ? 'border-red-300 bg-white' : 'border-gray-300 focus:border-blue-500'}`}
                                                value={task.tableName}
                                                onChange={e => updateTaskName(task.id, e.target.value)}
                                                placeholder="输入表名称"
                                                disabled={isProcessing}
                                            />
                                        )}
                                        
                                        {/* Preview Area */}
                                        {task.isExpanded && task.rawData && (
                                            <div className="mt-2 p-3 bg-gray-50  rounded-md border border-gray-200 text-xs overflow-hidden  animate-in fade-in zoom-in-95 duration-200">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-bold text-gray-700">请点击选择哪一行作为列名（表头）：</span>
                                                    <span className="text-gray-400">默认第1行</span>
                                                </div>
                                                <div className="space-y-1 overflow-y-auto overflow-x-auto ">
                                                    {task.rawData.map((row, rIdx) => (
                                                        <div 
                                                            key={rIdx}
                                                            onClick={() => setTaskHeaderRow(task.id, rIdx)}
                                                            className={`
                                                                flex items-center gap-2 p-1.5 rounded cursor-pointer border transition-colors
                                                                ${task.headerRowIndex === rIdx 
                                                                    ? 'bg-blue-100 border-blue-300 font-medium text-blue-900 ring-1 ring-blue-300' 
                                                                    : 'bg-white border-gray-200 hover:bg-gray-100 hover:border-gray-300'}
                                                            `}
                                                        >
                                                            <div className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] shrink-0 ${task.headerRowIndex === rIdx ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                                {rIdx + 1}
                                                            </div>
                                                            <div className="flex gap-2 flex-1 min-w-0">
                                                                {row.map((cell, cIdx) => (
                                                                    <div key={cIdx} className="w-24 truncate border-r border-gray-200 last:border-0 pl-1">
                                                                        {cell === null || cell === undefined ? <span className="text-gray-300 italic">空</span> : String(cell)}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {task.headerRowIndex === rIdx && <span className="text-[10px] bg-blue-600 text-white px-1.5 rounded ml-auto shrink-0">表头</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-2 text-[10px] text-gray-500 border-t border-gray-200 pt-1">
                                                    提示: 选中行将作为列名，上方行会被忽略，下方行将作为数据导入。
                                                </div>
                                            </div>
                                        )}

                                        {task.status === 'error' && (
                                            <div className="text-xs text-red-600">{task.errorMsg}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-xl flex gap-3 justify-end items-center">
             {error && (
                <div className="flex-1 text-sm text-red-600 truncate mr-2" title={error}>
                    {error}
                </div>
             )}
             
             {step === 'config' && (
                 <>
                    {isProcessing && (
                        <div className="flex items-center gap-2 text-sm text-blue-600 mr-4">
                            <Loader2 size={16} className="animate-spin" />
                            <span>处理中 {uploadProgress.current}/{uploadProgress.total}</span>
                        </div>
                    )}
                    <button
                        onClick={handleStartUpload}
                        disabled={isProcessing || tasks.length === 0}
                        className="inline-flex justify-center items-center gap-2 py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        {isProcessing ? '导入中...' : '开始导入'}
                    </button>
                 </>
             )}
             
             {step === 'select' && (
                 <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-sm">取消</button>
             )}
        </div>
      </div>
    </div>
  );
}
