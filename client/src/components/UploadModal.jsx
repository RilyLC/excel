import React, { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';

export default function UploadModal({ isOpen, onClose, onUpload }) {
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      await onUpload(formData);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || '上传失败');
    } finally {
      setIsUploading(false);
      // Reset input value to allow re-uploading the same file if needed (e.g. after error)
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-96 p-6 relative animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h3 className="text-xl font-bold text-gray-900 mb-2">导入 Excel</h3>
        <p className="text-sm text-gray-500 mb-6">
          上传 .xlsx 文件以自动创建新表。
        </p>

        <div 
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isUploading ? 'bg-gray-50 border-gray-300' : 'border-blue-300 hover:border-blue-500 hover:bg-blue-50'}
          `}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx"
            className="hidden" 
          />
          
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 text-blue-600">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm font-medium">处理中...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-600">
              <Upload size={32} className="text-blue-500" />
              <span className="text-sm font-medium">点击上传</span>
              <span className="text-xs text-gray-400">支持格式: .xlsx</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-100">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
