import React, { useState, useEffect, useRef } from "react";
import {
  Database,
  Plus,
  Trash2,
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Search,
  Settings,
  FileText,
} from "lucide-react";

export default function Sidebar({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onEditProject,
  tables,
  activeTable,
  onSelectTable,
  onUploadClick,
  onDeleteTable,
  onManageTable,
}) {
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(true);
  const [tableSearch, setTableSearch] = useState("");

  // Resizable logic for Project List
  const [projectHeight, setProjectHeight] = useState(160); // Default height
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const delta = e.clientY - startY.current;
      // Min height 60, avoid making it too large (optional max limit could be added)
      const newHeight = Math.max(60, startHeight.current + delta);
      setProjectHeight(newHeight);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleMouseDown = (e) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = projectHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none"; // Prevent text selection
  };

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase())
  );

  return (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen border-r border-slate-800">
      <div className="p-4 border-b border-slate-800">
        <h1 className="font-bold text-white flex items-center gap-2 mb-4">
          <Database size={20} className="text-blue-400" />
          数据管理平台
        </h1>

        {/* Project Selector */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>项目列表</span>
            <button
              onClick={onCreateProject}
              className="hover:text-blue-400"
              title="新建项目"
            >
              <FolderPlus size={14} />
            </button>
          </div>
          <div
            className="space-y-1 overflow-y-auto custom-scrollbar"
            style={{ height: projectHeight }}
          >
            <button
              onClick={() => onSelectProject(null)}
              className={`w-full text-left px-3 py-1.5 text-sm rounded flex items-center gap-2 transition-colors ${
                activeProject === null
                  ? "bg-slate-800 text-white"
                  : "hover:bg-slate-800/50"
              }`}
            >
              <Folder size={14} className="text-slate-400" />
              全部
            </button>
            <button
              onClick={() =>
                onSelectProject({ id: "uncategorized", name: "未分类" })
              }
              className={`w-full text-left px-3 py-1.5 text-sm rounded flex items-center gap-2 transition-colors ${
                activeProject?.id === "uncategorized"
                  ? "bg-slate-800 text-white"
                  : "hover:bg-slate-800/50"
              }`}
            >
              <Folder size={14} className="text-slate-400" />
              未分类
            </button>
            {projects.map((p) => (
              <div key={p.id} className="group relative flex items-center">
                <button
                  onClick={() => onSelectProject(p)}
                  className={`flex-1 text-left px-3 py-1.5 text-sm rounded flex items-center gap-2 transition-colors pr-12 ${
                    activeProject?.id === p.id
                      ? "bg-slate-800 text-white"
                      : "hover:bg-slate-800/50"
                  }`}
                >
                  <Folder
                    size={14}
                    className={
                      activeProject?.id === p.id
                        ? "text-blue-400"
                        : "text-slate-400"
                    }
                  />
                  <span className="truncate">
                    {p.name}
                    {p.owner_name && (
                      <span className="ml-2 opacity-70 text-[10px] bg-slate-700 px-1 py-0.5 rounded text-slate-300">
                        所属用户:{p.owner_name}
                      </span>
                    )}
                  </span>
                </button>
                <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditProject && onEditProject(p);
                    }}
                    className="p-1 hover:text-blue-400 text-slate-500"
                    title="编辑项目"
                  >
                    <Pencil size={12} />
                  </button>
                  {onDeleteProject && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject(p.id);
                    }}
                    className="p-1 hover:text-red-400 text-slate-500"
                    title="删除项目"
                  >
                    <Trash2 size={12} />
                  </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Drag Handle */}
      <div
        className="h-2 cursor-row-resize flex items-center justify-center hover:bg-slate-800 rounded transition-colors"
        onMouseDown={handleMouseDown}
        title="拖动调整高度"
      ></div>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-3 flex items-center justify-between shrink-0">
          <span
            className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate max-w-[120px]"
            title={activeProject ? activeProject.name : "所有"}
          >
            {activeProject ? activeProject.name : "所有"} 数据
          </span>
          <button
            onClick={onUploadClick}
            className="p-1 hover:bg-slate-800 rounded text-blue-400 transition-colors"
            title="导入 Excel"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Table Search */}
        <div className="px-4 pb-2 shrink-0">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
              size={12}
            />
            <input
              type="text"
              placeholder="搜索文件..."
              className="w-full bg-slate-800 border-none rounded py-1 pl-7 pr-2 text-xs text-slate-300 focus:ring-1 focus:ring-blue-500 placeholder-slate-600"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <ul>
            {filteredTables.map((table) => (
              <li key={table.id} className="group relative">
                <button
                  onClick={() => onSelectTable(table)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors pr-14 ${
                    activeTable?.id === table.id
                      ? "bg-blue-600 text-white"
                      : "hover:bg-slate-800 text-slate-300"
                  }`}
                  title={table.name}
                >
                  {table.type === "document" ? (
                    <FileText size={16} className={"text-orange-400"} />
                  ) : (
                    <Database size={16} className={"text-blue-500"} />
                  )}
                  <span className="w-full truncate">{table.name}</span>
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onManageTable && onManageTable(table);
                    }}
                    className={`p-1 ${
                      activeTable?.id === table.id
                        ? "text-blue-200 hover:text-white"
                        : "text-slate-500 hover:text-blue-400"
                    }`}
                    title="管理表格"
                  >
                    <Settings size={12} />
                  </button>
                  {onDeleteTable && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTable(table.id);
                    }}
                    className={`p-1 ${
                      activeTable?.id === table.id
                        ? "text-blue-200 hover:text-white"
                        : "text-slate-500 hover:text-red-400"
                    }`}
                    title="删除表格"
                  >
                    <Trash2 size={12} />
                  </button>
                  )}
                </div>
              </li>
            ))}
            {filteredTables.length === 0 && (
              <li className="px-4 py-4 text-sm text-slate-500 text-center italic">
                {tableSearch
                  ? "无匹配表格"
                  : activeProject
                  ? "该项目下暂无表格"
                  : "暂无表格"}
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center shrink-0">
        v1.0.0
      </div>
    </div>
  );
}
