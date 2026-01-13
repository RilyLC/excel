import React, { useState, useEffect } from "react";
import mammoth from "mammoth";
import { api } from "../../api";
import { Loader2, FileText, Download,Settings } from "lucide-react";

export default function DocumentViewer({ document: doc, onClose, onManage }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (doc) loadDocument();
  }, [doc.id]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError(null);
      setContent("");

      const response = await api.getDocumentContent(doc.id);
      const blob = response.data;

      if (doc.file_path && doc.file_path.toLowerCase().endsWith(".docx")) {
        const arrayBuffer = await blob.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setContent(result.value);
      } else {
        // Assume text for txt or fallback
        const text = await blob.text();
        setContent(text);
      }
    } catch (err) {
      console.error(err);
      setError("加载文档失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await api.getDocumentContent(doc.id);
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // Construct filename
      let filename = doc.name;
      const ext = doc.file_path.split(".").pop();
      if (!filename.endsWith("." + ext)) {
        filename += "." + ext;
      }

      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-100 rounded-lg">
            <FileText className="text-orange-500" size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold truncate max-w-md">{doc.name}</h2>
            <p className="text-xs text-gray-500">文档预览</p>
          </div>
          <div className="text-xs text-gray-400  ml-4">
            提示: 预览无法加载完整样式, 建议下载查看原文档。
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onManage}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm"
          >
            <Settings size={14} /> 
            管理
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm"
            title="下载源文件"
          >
            <Download size={16} />
            下载
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="animate-spin text-blue-500" size={48} />
            <p className="text-gray-500">正在加载文档...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-red-500">
            <p className="text-xl font-bold">无法预览</p>
            <p>{error}</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto bg-white shadow-lg p-10 min-h-full">
            {doc.file_path && doc.file_path.toLowerCase().endsWith(".docx") ? (
              <div
                className="document-content text-gray-800 leading-relaxed"
                style={{ fontFamily: "SimSun, serif" }} // Example font
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800">
                {content}
              </pre>
            )}

            {/* Simple styles for generated HTML */}
            <style>{`
                .document-content h1 { font-size: 2em; font-weight: bold; margin-bottom: 0.5em; }
                .document-content h2 { font-size: 1.5em; font-weight: bold; margin-bottom: 0.5em; }
                .document-content p { margin-bottom: 1em; }
                .document-content table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
                .document-content td, .document-content th { border: 1px solid #ddd; padding: 8px; }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}
