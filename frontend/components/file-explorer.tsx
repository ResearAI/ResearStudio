"use client"

import React, { useState } from "react"
import { FolderTree, ChevronRight, ChevronDown, File, Folder } from "lucide-react"
import { FileStructureNode } from "@/lib/api"

interface FileExplorerProps {
  fileStructure: FileStructureNode | null
  onFileClick: (filename: string) => void
}

export function FileExplorer({ fileStructure, onFileClick }: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['resear-pro-task']))

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }

  const renderFileTree = (node: FileStructureNode, path: string = '', level: number = 0) => {
    if (!node) return null

    const fullPath = path ? `${path}/${node.name}` : node.name
    const isExpanded = expandedFolders.has(fullPath)

    if (node.type === 'directory') {
      return (
        <div key={fullPath}>
          <div
            className="flex items-center gap-1 py-1 px-1 hover:bg-slate-100 cursor-pointer select-none"
            style={{ paddingLeft: `${level * 8 + 4}px` }}
            onClick={() => toggleFolder(fullPath)}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Folder className="h-3 w-3 text-blue-600" />
            <span className="text-xs truncate">{node.name}</span>
          </div>
          {isExpanded && node.children && (
            <div>
              {node.children.map(child => renderFileTree(child, fullPath, level + 1))}
            </div>
          )}
        </div>
      )
    } else {
      return (
        <div
          key={fullPath}
          className="flex items-center gap-1 py-1 px-1 hover:bg-slate-100 cursor-pointer"
          style={{ paddingLeft: `${level * 8 + 16}px` }}
          onClick={() => onFileClick(node.name)}
        >
          <File className="h-3 w-3 text-slate-500" />
          <span className="text-xs truncate">{node.name}</span>
        </div>
      )
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-slate-300 px-2 py-2">
        <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1">
          <FolderTree className="h-3 w-3" />
          <span className="truncate">Files</span>
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {fileStructure ? (
          renderFileTree(fileStructure)
        ) : (
          <div className="px-2 py-4 text-center">
            <p className="text-xs text-slate-500">No files</p>
          </div>
        )}
      </div>
    </div>
  )
}