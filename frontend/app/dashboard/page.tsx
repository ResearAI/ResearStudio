"use client"

import React, { useState, useEffect, Suspense, useRef, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { DashboardContent } from "@/components/dashboard-content"
import { ComputerView } from "@/components/computer-view"
import { ConnectionStatus } from "@/components/ui/connection-status"
import { Terminal, AlertCircle, GitBranch, Activity, CheckCircle2, XCircle, Pause, Play, ChevronLeft, ChevronRight, PanelLeftClose, PanelRightClose, Sparkles, Download, Save, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useTaskStream, Activity as ApiActivity, FileStructureNode, apiService, getCurrentApiBaseUrl } from "@/lib/api"
import { useIsMobile } from "@/lib/hooks"
import { normalizeFilename } from '@/lib/utils'

// 增强的历史快照接口
interface HistorySnapshot {
  taskId: string | null;
  promptText: string;
  activities: ApiActivity[];
  currentFile: string;
  fileContent: string;
  terminalOutput: string[];
  // 🆕 新增：完整的文件状态映射
  allFilesContent: Map<string, string>;
  // 🆕 新增：活动文件历史
  activeFileHistory: string[];
  timestamp: number;
}

// ComputerView ref type
interface ComputerViewRef {
  save: () => void;
  revert: () => void;
  updateFileContent: (file: string, content: string) => void;
}

function DashboardPageContent() {
  const searchParams = useSearchParams()
  const taskId = searchParams?.get('taskId')
  const promptText = searchParams?.get('prompt') || "AI任务执行中"
  const isMobile = useIsMobile()

  const [isPaused, setIsPaused] = useState(false)
  const [displayedActivities, setDisplayedActivities] = useState<ApiActivity[]>([]);

  // 修改面板状态为三种模式
  const [layoutMode, setLayoutMode] = useState<'both' | 'chat-only' | 'workspace-only'>('both')

  // 添加文件选择状态
  const [selectedFile, setSelectedFile] = useState<{ filename: string; content: string } | null>(null)

  // 文件编辑状态
  const [fileEditState, setFileEditState] = useState<{ hasChanges: boolean; activeFilename: string | null }>({
    hasChanges: false,
    activeFilename: null
  });

  // ComputerView的引用
  const computerViewRef = useRef<ComputerViewRef>(null);

  // History State
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1);
  const [isViewingHistory, setIsViewingHistory] = useState<boolean>(false);

  // 🆕 新增：文件内容映射状态
  const [allFilesContentMap, setAllFilesContentMap] = useState<Map<string, string>>(new Map());

  // useTaskStream hook - 先声明，后面定义跳转回调
  const liveTaskState = useTaskStream(taskId);

  // Effect to merge liveTaskState.activities (AI) into displayedActivities
  useEffect(() => {
    if (isViewingHistory) return;

    setDisplayedActivities(prevDisplayed => {
      const newAiActivities = liveTaskState.activities.filter(
        aiActivity => !prevDisplayed.some(dispActivity => dispActivity.id === aiActivity.id && dispActivity.speaker !== 'user')
      );
      
      // 🆕 防止重复添加相同的活动
      if (newAiActivities.length === 0) {
        return prevDisplayed;
      }
      
      const combined = [...prevDisplayed, ...newAiActivities];
      return combined.sort((a, b) => a.timestamp - b.timestamp);
    });
  }, [liveTaskState.activities, isViewingHistory]);

  // 🆕 监听文件更新，维护完整的文件内容映射
  useEffect(() => {
    if (liveTaskState.currentFile && liveTaskState.fileContent !== undefined && !isViewingHistory) {
      setAllFilesContentMap(prev => {
        const normalizedFilename = normalizeFilename(liveTaskState.currentFile);
        // 🆕 检查是否真的有变化
        const existingContent = prev.get(normalizedFilename);
        if (existingContent === liveTaskState.fileContent) {
          return prev; // 没有变化，不更新
        }
        
        const newMap = new Map(prev);
        newMap.set(normalizedFilename, liveTaskState.fileContent);
        console.log('🔄 Updated file content in cache:', normalizedFilename, 'Length:', liveTaskState.fileContent.length);
        return newMap;
      });

      // 🆕 强制更新文件系统缓存以确保同步
      if (computerViewRef.current && computerViewRef.current.updateFileContent) {
        computerViewRef.current.updateFileContent(liveTaskState.currentFile, liveTaskState.fileContent);
      }

      // 如果更新的文件是当前选中的文件，则刷新视图
      if (selectedFile && normalizeFilename(selectedFile.filename) === normalizeFilename(liveTaskState.currentFile)) {
        console.log('🔄 Auto-refreshing content for currently selected file:', selectedFile.filename);
        setSelectedFile(currentSelectedFile => {
          if (currentSelectedFile && currentSelectedFile.content !== liveTaskState.fileContent) {
            return { ...currentSelectedFile, content: liveTaskState.fileContent };
          }
          return currentSelectedFile;
        });
      }
    }
  }, [liveTaskState.currentFile, liveTaskState.fileContent, isViewingHistory, selectedFile?.filename]);

  // 🆕 监听文件列表变化，为新文件预留缓存空间
  useEffect(() => {
    if (liveTaskState.fileList && liveTaskState.fileList.length > 0 && !isViewingHistory) {
      setAllFilesContentMap(prev => {
        const newMap = new Map(prev);
        let hasChanges = false;
        
        // 为文件列表中的新文件添加空缓存条目（如果还没有的话）
        liveTaskState.fileList.forEach(rawFilename => {
          const filename = normalizeFilename(rawFilename);
          if (!newMap.has(filename)) {
            // 不设置内容，只是标记文件存在，首次点击时才从后端获取
            console.log('📋 Adding file to cache registry:', filename);
            hasChanges = true;
          }
        });
        
        return hasChanges ? newMap : prev;
      });
    }
  }, [liveTaskState.fileList, isViewingHistory]);

  const handleAddUserMessage = useCallback(async (text: string) => {
    if (isViewingHistory || !taskId) return;

    const newUserActivity: ApiActivity = {
      id: Date.now(),
      text: text,
      type: 'user_input',
      timestamp: Math.floor(Date.now() / 1000),
      speaker: 'user',
      status: 'completed'
    };
    
    // Optimistically update UI
    setDisplayedActivities(prev => [...prev, newUserActivity].sort((a, b) => a.timestamp - b.timestamp));

    try {
      const API_BASE_URL = getCurrentApiBaseUrl();
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      console.log('User message sent to backend successfully.');

    } catch (error) {
      console.error('Failed to send user message to backend:', error);
      const errorActivity: ApiActivity = {
        id: Date.now() + 1, // ensure unique id
        text: 'Failed to send message. Multi-turn conversation may not be supported by the backend.',
        type: 'system_error',
        timestamp: Math.floor(Date.now() / 1000),
        status: 'failed'
      };
      setDisplayedActivities(prev => [...prev, errorActivity].sort((a, b) => a.timestamp - b.timestamp));
    }
  }, [isViewingHistory, taskId]);

  // 🆕 Map 比较工具函数
  const compareMaps = useCallback((map1: Map<string, string>, map2: Map<string, string>): boolean => {
    if (map1.size !== map2.size) return false;
    for (let [key, value] of map1) {
      if (!map2.has(key) || map2.get(key) !== value) {
        return false;
      }
    }
    return true;
  }, []);

  // 🆕 优化的快照创建逻辑 - 使用useCallback减少不必要的重新渲染
  const createSnapshot = useCallback(() => {
    return {
      taskId,
      promptText,
      activities: displayedActivities,
      currentFile: liveTaskState.currentFile,
      fileContent: liveTaskState.fileContent,
      terminalOutput: liveTaskState.terminalOutput,
      allFilesContent: new Map(allFilesContentMap),
      activeFileHistory: [liveTaskState.currentFile].filter(Boolean),
      timestamp: Date.now()
    };
  }, [
    taskId,
    promptText,
    displayedActivities,
    liveTaskState.currentFile,
    liveTaskState.fileContent,
    liveTaskState.terminalOutput,
    allFilesContentMap
  ]);

  // 增强的快照创建逻辑
  useEffect(() => {
    if (isViewingHistory) {
      return;
    }

    const newSnapshot = createSnapshot();

    if (history.length > 0) {
      const lastSnapshot = history[history.length - 1];
      
      // 更智能的变化检测
      const hasActivityChange = JSON.stringify(lastSnapshot.activities) !== JSON.stringify(newSnapshot.activities);
      const hasFileChange = lastSnapshot.currentFile !== newSnapshot.currentFile || 
                           lastSnapshot.fileContent !== newSnapshot.fileContent;
      const hasTerminalChange = JSON.stringify(lastSnapshot.terminalOutput) !== JSON.stringify(newSnapshot.terminalOutput);
      
      // 检查文件内容映射是否有变化
      const hasFileContentMapChange = !compareMaps(lastSnapshot.allFilesContent, newSnapshot.allFilesContent);
      
      if (!hasActivityChange && !hasFileChange && !hasTerminalChange && !hasFileContentMapChange) {
        return;
      }
      
      console.log('创建新的历史快照:', {
        hasActivityChange,
        hasFileChange,
        hasTerminalChange,
        hasFileContentMapChange,
        filesCount: newSnapshot.allFilesContent.size
      });
    }

    setHistory(prevHistory => {
      const updatedHistory = [...prevHistory, newSnapshot];
      // 限制历史记录数量，避免内存过大
      if (updatedHistory.length > 100) {
        return updatedHistory.slice(-100);
      }
      return updatedHistory;
    });
    setCurrentHistoryIndex(history.length);

  }, [createSnapshot, isViewingHistory, history.length, compareMaps]); // 🆕 简化依赖项

  const handleHistoryChange = useCallback((newIndex: number) => {
    if (newIndex === -1 || newIndex >= history.length) {
      setIsViewingHistory(false);
      setCurrentHistoryIndex(history.length > 0 ? history.length - 1 : -1);
      console.log('切换到实时模式');
    } else if (newIndex >= 0 && newIndex < history.length) {
      setCurrentHistoryIndex(newIndex);
      setIsViewingHistory(true);
      console.log('切换到历史模式，索引:', newIndex);
    }
  }, [history.length]);

  // 🆕 增强的文件选择处理 - 优先使用本地缓存
  const handleFileSelect = useCallback(async (rawFilename: string) => {
    const filename = normalizeFilename(rawFilename);
    console.log('File selected:', filename, 'Is viewing history:', isViewingHistory);
    
    let content = '';
    let fileMetadata: {
      isUrl?: boolean;
      isEditable?: boolean;
      fileType?: string;
      contentMode?: 'text' | 'url';
    } = {};
    
    if (isViewingHistory && currentHistoryIndex >= 0 && history[currentHistoryIndex]) {
      // 🆕 历史模式：从历史快照中获取文件内容
      const historicalSnapshot = history[currentHistoryIndex];
      content = historicalSnapshot.allFilesContent.get(filename) || '';
      console.log('Historical file content for', filename, ':', content.length, 'characters');
    } else {
      // 🆕 实时模式：优先检查本地缓存
      const cachedContent = allFilesContentMap.get(filename);
      
      if (cachedContent !== undefined) {
        // 使用本地缓存的内容
        content = cachedContent;
        console.log('💾 Using cached file content for:', filename, 'Length:', content.length);
        
        // 如果是当前正在显示的文件，还要检查是否有更新的内容
        if (normalizeFilename(liveTaskState.currentFile) === filename && liveTaskState.fileContent) {
          if (liveTaskState.fileContent !== cachedContent) {
            console.log('📝 Current file has newer content, updating cache:', filename);
            content = liveTaskState.fileContent;
            // 更新缓存
            setAllFilesContentMap(prev => {
              const newMap = new Map(prev);
              newMap.set(filename, content);
              return newMap;
            });
          }
        }
      } else {
        // 🆕 文件不在缓存中，从后端获取
        if (taskId) {
          try {
            console.log('🌐 File not in cache, fetching from backend for:', filename);
            const response = await apiService.getFileContent(taskId, filename);
            if (response.success && response.content !== undefined) {
              content = response.content;
              console.log('✅ Successfully fetched and cached file content:', filename, 'Length:', content.length);
              
              // 提取文件元数据
              fileMetadata = {
                isUrl: response.is_url,
                isEditable: response.is_editable,
                fileType: response.file_type,
                contentMode: response.content_mode
              };
              
              // 🆕 添加到本地缓存
              setAllFilesContentMap(prev => {
                const newMap = new Map(prev);
                newMap.set(filename, content);
                return newMap;
              });
            } else {
              console.warn('Failed to fetch file content from backend:', response.message);
              // 回退到当前文件内容（如果是当前文件）
              if (normalizeFilename(liveTaskState.currentFile) === filename) {
                content = liveTaskState.fileContent || '';
              } else {
                content = '';
              }
            }
          } catch (error) {
            console.error('Error fetching file content from backend:', error);
            // 回退到当前文件内容（如果是当前文件）
            if (normalizeFilename(liveTaskState.currentFile) === filename) {
              content = liveTaskState.fileContent || '';
            } else {
              content = '';
            }
          }
        } else {
          // 没有taskId，使用当前文件内容（如果是当前文件）
          if (normalizeFilename(liveTaskState.currentFile) === filename) {
            content = liveTaskState.fileContent || '';
          } else {
            content = '';
          }
        }
      }
    }
    
    setSelectedFile({ filename, content });
    console.log('📁 File selected and displayed:', filename, 'Content length:', content.length, 'Metadata:', fileMetadata);
  }, [liveTaskState.currentFile, liveTaskState.fileContent, allFilesContentMap, isViewingHistory, currentHistoryIndex, history, taskId]);

  // 添加跳转到指定活动的功能
  const handleJumpToActivity = useCallback((activityIndex: number) => {
    if (activityIndex >= 0 && activityIndex < displayedActivities.length) {
      // 这里可以添加滚动到指定活动的逻辑
      console.log('Jump to activity:', activityIndex, displayedActivities[activityIndex]);
    }
  }, [displayedActivities]);

  // 处理文件编辑状态变化
  const handleFileEditStateChange = useCallback((hasChanges: boolean, activeFilename: string | null) => {
    setFileEditState({ hasChanges, activeFilename });
  }, []);

  // 保存文件
  const handleSaveFile = useCallback(() => {
    if (computerViewRef.current) {
      computerViewRef.current.save();
    }
  }, []);

  // 还原文件
  const handleRevertFile = useCallback(() => {
    if (computerViewRef.current) {
      computerViewRef.current.revert();
    }
  }, []);

  // 修改面板控制逻辑，实现三种状态切换
  const handleLayoutToggle = () => {
    if (isMobile) {
      setLayoutMode(prev => prev === 'chat-only' ? 'workspace-only' : 'chat-only');
    } else {
      const modes: Array<'both' | 'chat-only' | 'workspace-only'> = ['both', 'chat-only', 'workspace-only'];
      const currentIndex = modes.indexOf(layoutMode);
      setLayoutMode(modes[(currentIndex + 1) % modes.length]);
    }
  };

  const getLayoutButtonContent = () => {
    switch(layoutMode) {
      case 'both':
        return <><PanelRightClose className="h-4 w-4 mr-2" /> Workspace</>;
      case 'chat-only':
        return <><PanelLeftClose className="h-4 w-4 mr-2" /> Chat & Files</>;
      case 'workspace-only':
        return <><PanelLeftClose className="h-4 w-4 mr-2" /> Chat</>;
      default:
        return <><PanelLeftClose className="h-4 w-4 mr-2" /> Chat</>;
    }
  };

  // 获取任务开始时间（用于计算运行时长）
  const getTaskStartTime = () => {
    if (liveTaskState.activities.length > 0) {
      return liveTaskState.activities[0].timestamp;
    }
    return Math.floor(Date.now() / 1000);
  };

  // 🆕 优化的历史状态显示计算
  const displayState: HistorySnapshot = (() => {
    if (isViewingHistory && currentHistoryIndex >= 0 && history[currentHistoryIndex]) {
      const historicalState = history[currentHistoryIndex];
      
      // 如果有选中的文件且在历史数据中存在，使用历史内容
      if (selectedFile?.filename && historicalState.allFilesContent.has(selectedFile.filename)) {
        return {
          ...historicalState,
          currentFile: selectedFile.filename,
          fileContent: historicalState.allFilesContent.get(selectedFile.filename) || ''
        };
      }
      
      return historicalState;
    }
    
    // 实时状态
    return {
      taskId,
      promptText,
      activities: displayedActivities,
      currentFile: selectedFile?.filename || liveTaskState.currentFile,
      fileContent: selectedFile?.content || liveTaskState.fileContent,
      terminalOutput: liveTaskState.terminalOutput,
      allFilesContent: allFilesContentMap,
      activeFileHistory: [liveTaskState.currentFile].filter(Boolean),
      timestamp: Date.now()
    };
  })();

  // Diagnostic Log for displayState (removed to prevent re-rendering issues)

  const handlePause = async () => {
    if (!taskId) {
      console.warn('No task ID available for pause/resume');
      return;
    }

    try {
      console.log('🎮 Attempting to toggle pause state for task:', taskId, 'Current paused state:', isPaused);
      
      // 🔧 根据当前状态调用正确的API
      const result = isPaused 
        ? await apiService.resumeTask(taskId)  // 当前暂停，调用恢复API
        : await apiService.pauseTask(taskId);  // 当前运行，调用暂停API
        
      setIsPaused(result.is_paused);
      console.log('✅ Successfully toggled pause state:', result.is_paused ? 'PAUSED' : 'RESUMED');
    } catch (error) {
      console.error('❌ Failed to pause/resume task:', error);
      // 可以添加用户友好的错误提示
    }
  }

  const handleExport = async () => {
    if (!taskId) return

    try {
      const blob = await apiService.exportTask(taskId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
                              a.download = `researstudio-task-${taskId}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to export task:', error)
    }
  }

  // 如果没有 taskId，显示错误
  if (!taskId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'rgb(255, 252, 252)' }}>
        <div className="bg-white border border-slate-200 rounded-lg p-8 shadow-sm max-w-md w-full">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              任务 ID 缺失，请从主页重新开始。
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  // 计算布局宽度
  const getChatWidth = () => {
    if (isMobile) return '100%';
    switch (layoutMode) {
      case 'chat-only': return 'flex-1'
      case 'workspace-only': return 'w-0'
      case 'both': return 'flex-[0_0_32%]'
      default: return 'flex-[0_0_32%]'
    }
  }

  const getChatPosition = () => {
    return layoutMode === 'chat-only' ? 'ml-[25%]' : ''
  }

  const getFileTreeWidth = () => {
    switch (layoutMode) {
      case 'chat-only': return 'w-0'
      case 'workspace-only': return 'flex-[0_0_19%]'
      case 'both': return 'flex-[0_0_19%]'
      default: return 'flex-[0_0_19%]'
    }
  }

  const getWorkspaceWidth = () => {
    switch (layoutMode) {
      case 'chat-only': return 'w-0'
      case 'workspace-only': return 'flex-1'
      case 'both': return 'flex-1'
      default: return 'flex-1'
    }
  }

  const currentTaskState = isViewingHistory && history[currentHistoryIndex] ? history[currentHistoryIndex] : liveTaskState;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #f1f5f9 100%)' }}>
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-green-400/20 to-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-purple-400/10 to-pink-400/10 rounded-full blur-3xl"></div>
      </div>

      {/* 顶部标题栏 - 现代化设计 */}
      {isMobile ? (
        <div className="relative z-20 backdrop-blur-xl bg-white/80 border-b border-white/20 shadow-lg">
          <div className="px-6 py-4 h-full">
            <div className="flex items-center justify-between h-full">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-light text-slate-800 flex items-center">
                  <span className="bg-gradient-to-r from-blue-700 via-blue-800 to-blue-900 bg-clip-text text-transparent">Resear</span>
                  <span className="text-slate-900 font-black ml-1">Shop</span>
                </h1>
                <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center shadow-sm">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                className="bg-white/60 backdrop-blur-sm border border-white/30 hover:bg-white/80 text-slate-700 rounded-xl shadow-sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          {/* 错误提示 */}
          {liveTaskState.error && !['completed', 'failed'].includes(liveTaskState.taskStatus) && !isViewingHistory && (
            <div className="px-6 pb-4">
              <div className="bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="h-4 w-4" />
                  <span>{liveTaskState.error}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="relative z-20 backdrop-blur-xl bg-white/80 border-b border-white/20 shadow-lg">
          <div className="px-8 py-4 h-full">
            <div className="flex items-center justify-between h-full">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-4">
                  <h1 className="text-2xl font-light text-slate-800 flex items-center">
                    <span className="bg-gradient-to-r from-blue-700 via-blue-800 to-blue-900 bg-clip-text text-transparent">Resear</span>
                    <span className="text-slate-900 font-black ml-1">Studio</span>
                  </h1>
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center shadow-lg">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                </div>

                {/* 状态信息 - 现代化卡片样式 */}
                <div className="flex items-center gap-4">
                  <div className="bg-white/60 backdrop-blur-sm border border-white/30 rounded-xl px-4 py-2 shadow-sm">
                    <div className="flex items-center gap-4 text-xs text-slate-600">
                      <span>Task: {displayState.taskId ? displayState.taskId.slice(0, 12) : 'N/A'}...</span>
                      <div className="w-px h-3 bg-slate-300"></div>
                      <span>Steps: {displayState.activities.length}</span>
                      <div className="w-px h-3 bg-slate-300"></div>
                      <span>Files: {displayState.allFilesContent.size}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {liveTaskState.isConnected && liveTaskState.taskStatus === 'started' && !isViewingHistory && (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs border border-green-200/50">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span>Live</span>
                      </div>
                    )}
                    
                    {isViewingHistory && (
                      <div className="flex items-center gap-2 text-amber-600 bg-amber-50/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs border border-amber-200/50">
                        <Activity className="h-3 w-3" />
                        <span>History ({currentHistoryIndex + 1}/{history.length})</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* 布局控制按钮 - 现代化样式 */}
                <div className="bg-white/60 backdrop-blur-sm border border-white/30 rounded-xl p-1 shadow-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLayoutToggle}
                    className="h-8 px-3 hover:bg-white/60 text-slate-700 rounded-lg transition-all duration-200"
                    title={`Current: ${layoutMode.replace('-', ' ')} | Click to toggle layout`}
                  >
                    {getLayoutButtonContent()}
                  </Button>
                </div>

                <div className="bg-white/60 backdrop-blur-sm border border-white/30 rounded-xl p-1 shadow-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePause}
                    disabled={isViewingHistory}
                    className="h-8 px-3 hover:bg-white/60 text-slate-700 rounded-lg transition-all duration-200 disabled:opacity-50"
                  >
                    {isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
                    <span className="text-xs font-medium">{isPaused ? "Resume" : "Pause"}</span>
                  </Button>
                </div>

                <div className="bg-white/60 backdrop-blur-sm border border-white/30 rounded-xl p-1 shadow-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExport}
                    className="h-8 px-3 hover:bg-white/60 text-slate-700 rounded-lg transition-all duration-200"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    <span className="text-xs font-medium">Export</span>
                  </Button>
                </div>

                {/* 分隔符 */}
                <div className="w-px h-6 bg-slate-300/50 mx-2"></div>

                {/* Save和Revert按钮 */}
                <div className="bg-white/60 backdrop-blur-sm border border-white/30 rounded-xl p-1 shadow-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveFile}
                    disabled={!fileEditState.hasChanges || isViewingHistory}
                    className="h-8 px-3 hover:bg-white/60 text-slate-700 rounded-lg transition-all duration-200 disabled:opacity-50"
                    title={`Save file (hasChanges: ${fileEditState.hasChanges}, isViewingHistory: ${isViewingHistory})`}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    <span className="text-xs font-medium">Save</span>
                  </Button>
                </div>
                
                <div className="bg-white/60 backdrop-blur-sm border border-white/30 rounded-xl p-1 shadow-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRevertFile}
                    disabled={!fileEditState.hasChanges || isViewingHistory}
                    className="h-8 px-3 hover:bg-white/60 text-slate-700 rounded-lg transition-all duration-200 disabled:opacity-50"
                    title={`Revert changes (hasChanges: ${fileEditState.hasChanges}, isViewingHistory: ${isViewingHistory})`}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    <span className="text-xs font-medium">Revert</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 错误提示 */}
          {liveTaskState.error && !['completed', 'failed'].includes(liveTaskState.taskStatus) && !isViewingHistory && (
            <div className="px-8 pb-4">
              <div className="bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="h-4 w-4" />
                  <span>{liveTaskState.error}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 历史导航提示组件 - 现代化样式 */}
      {isViewingHistory && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-30 bg-white/90 backdrop-blur-xl border border-white/30 rounded-2xl px-6 py-3 shadow-xl">
          <div className="flex items-center gap-3 text-amber-800">
            <Activity className="h-4 w-4" />
            <span className="font-medium">
              Viewing history step {currentHistoryIndex + 1} of {history.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-3 bg-amber-100/80 text-amber-700 hover:bg-amber-200/80 rounded-xl border border-amber-200/50 transition-all duration-200"
              onClick={() => handleHistoryChange(-1)}
            >
              Return to Live
            </Button>
          </div>
        </div>
      )}

      {/* 主内容区域 - 毛玻璃卡片式布局 */}
      <div className="h-[calc(100vh-6rem)] flex p-4 gap-4 relative z-10">
        {/* 移动端：只显示对话框界面 */}
        {isMobile ? (
          <div className="w-full h-full">
            <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-xl h-full">
              <DashboardContent
                activeTask={displayState.promptText}
                commandOutput={[]}
                activities={displayState.activities}
                taskStatus={isViewingHistory ? 'history' : liveTaskState.taskStatus}
                onAddUserMessage={handleAddUserMessage}
                isViewingHistory={isViewingHistory}
                isSimpleMode={true}
                isMobile={true}
                onJumpToActivity={handleJumpToActivity}
              />
            </div>
          </div>
        ) : (
          /* 桌面端：毛玻璃卡片布局 */
          <>
            {/* 当操作台隐藏时，显示简洁的对话框界面 */}
            {layoutMode === 'chat-only' ? (
              <div className="w-full h-full transition-all duration-500 ease-in-out transform">
                <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-xl h-full">
                  <DashboardContent
                    activeTask={displayState.promptText}
                    commandOutput={[]}
                    activities={displayState.activities}
                    taskStatus={isViewingHistory ? 'history' : liveTaskState.taskStatus}
                    onAddUserMessage={handleAddUserMessage}
                    isViewingHistory={isViewingHistory}
                    isSimpleMode={true}
                    onJumpToActivity={handleJumpToActivity}
                  />
                </div>
              </div>
            ) : (
              <>
                {/* 左侧对话框 - 毛玻璃卡片 */}
                <div className={`${getChatWidth()} transition-all duration-500 ease-in-out flex-shrink-0 ${layoutMode === 'workspace-only' ? 'w-0 overflow-hidden opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                  {layoutMode !== 'workspace-only' && (
                    <div className="h-full transition-all duration-300 ease-in-out">
                      <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-xl h-full transition-all duration-500 ease-in-out transform hover:shadow-2xl overflow-hidden">
                        <DashboardContent
                          activeTask={displayState.promptText}
                          commandOutput={[]}
                          activities={displayState.activities}
                          taskStatus={isViewingHistory ? 'history' : liveTaskState.taskStatus}
                          onAddUserMessage={handleAddUserMessage}
                          isViewingHistory={isViewingHistory}
                          isSimpleMode={false}
                          onJumpToActivity={handleJumpToActivity}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 中间文件树 - 毛玻璃卡片 */}
                <div className={`${getFileTreeWidth()} transition-all duration-500 ease-in-out flex-shrink-0 ${layoutMode !== 'both' && layoutMode !== 'workspace-only' ? 'w-0 overflow-hidden opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                  {(layoutMode === 'both' || layoutMode === 'workspace-only') && (
                    <div className="h-full transition-all duration-300 ease-in-out">
                      <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-xl h-full transition-all duration-500 ease-in-out transform hover:shadow-2xl overflow-hidden">
                        <ComputerView
                          ref={computerViewRef}
                          currentFile={displayState.currentFile}
                          fileContent={displayState.fileContent}
                          setFileContent={() => {}}
                          isLive={liveTaskState.isConnected && !isViewingHistory}
                          taskStatus={isViewingHistory ? 'history' : liveTaskState.taskStatus}
                          terminalOutput={displayState.terminalOutput}
                          fileList={liveTaskState.fileList}
                          isViewingHistory={isViewingHistory}
                          historyLength={history.length}
                          currentHistoryIndexValue={currentHistoryIndex}
                          onHistoryChange={handleHistoryChange}
                          showOnlyFileTree={true}
                          onFileSelect={handleFileSelect}
                          onFileEditStateChange={handleFileEditStateChange}
                          taskId={taskId}
                          activities={displayState.activities}
                          taskStartTime={getTaskStartTime()}
                          historicalFilesContent={isViewingHistory && history[currentHistoryIndex] ? 
                            history[currentHistoryIndex].allFilesContent : undefined}
                          currentFileMetadata={liveTaskState.currentFileMetadata}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 右侧操作台 - 毛玻璃卡片 */}
                <div className={`${getWorkspaceWidth()} transition-all duration-500 ease-in-out flex-shrink-0 ${layoutMode !== 'both' && layoutMode !== 'workspace-only' ? 'w-0 overflow-hidden opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                  {(layoutMode === 'both' || layoutMode === 'workspace-only') && (
                    <div className="h-full transition-all duration-300 ease-in-out">
                      <div className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-xl h-full transition-all duration-500 ease-in-out transform hover:shadow-2xl overflow-hidden">
                        <ComputerView
                          ref={computerViewRef}
                          currentFile={displayState.currentFile}
                          fileContent={displayState.fileContent}
                          setFileContent={() => {}}
                          isLive={liveTaskState.isConnected && !isViewingHistory}
                          taskStatus={isViewingHistory ? 'history' : liveTaskState.taskStatus}
                          terminalOutput={displayState.terminalOutput}
                          fileList={liveTaskState.fileList}
                          isViewingHistory={isViewingHistory}
                          historyLength={history.length}
                          currentHistoryIndexValue={currentHistoryIndex}
                          onHistoryChange={handleHistoryChange}
                          showOnlyWorkspace={true}
                          maxTabs={layoutMode === 'workspace-only' ? 8 : 4}
                          onFileSelect={handleFileSelect}
                          onFileEditStateChange={handleFileEditStateChange}
                          taskId={taskId}
                          activities={displayState.activities}
                          taskStartTime={getTaskStartTime()}
                          historicalFilesContent={isViewingHistory && history[currentHistoryIndex] ? 
                            history[currentHistoryIndex].allFilesContent : undefined}
                          currentFileMetadata={liveTaskState.currentFileMetadata}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 对话框隐藏/显示按钮 - 现代化样式 */}
            {layoutMode === 'workspace-only' && (
              <div className="absolute left-6 top-1/2 transform -translate-y-1/2 z-20 transition-all duration-500 animate-slide-in-left">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLayoutToggle}
                  className="h-16 w-8 rounded-r-2xl bg-white/80 backdrop-blur-xl border border-white/30 shadow-lg hover:bg-white/90 flex flex-col items-center justify-center p-0 transition-all duration-300 hover:w-10 hover:scale-110 group"
                >
                  <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-slate-800 transition-colors duration-200" />
                </Button>
              </div>
            )}

            {/* 操作台隐藏/显示按钮 - 现代化样式 */}
            {layoutMode === 'chat-only' && (
              <div className="absolute right-6 top-1/2 transform -translate-y-1/2 z-20 transition-all duration-500 animate-slide-in-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLayoutToggle}
                  className="h-16 w-8 rounded-l-2xl bg-white/80 backdrop-blur-xl border border-white/30 shadow-lg hover:bg-white/90 flex flex-col items-center justify-center p-0 transition-all duration-300 hover:w-10 hover:scale-110 group"
                >
                  <ChevronLeft className="h-5 w-5 text-slate-600 group-hover:text-slate-800 transition-colors duration-200" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'rgb(250, 252, 254)' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading workspace...</p>
        </div>
      </div>
    }>
      <DashboardPageContent />
    </Suspense>
  )
}