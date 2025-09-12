// lib/api.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { normalizeFilename } from './utils';

// 获取API基础URL的函数 - 支持从localStorage读取用户设置
const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const savedApiUrl = localStorage.getItem('api_base_url');
    if (savedApiUrl) {
      return savedApiUrl;
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
};

// 可以通过环境变量或localStorage设置后端地址
let API_BASE_URL = getApiBaseUrl();

// 导出函数以便组件可以更新API_BASE_URL
export const updateApiBaseUrl = (newUrl: string) => {
  API_BASE_URL = newUrl;
  if (typeof window !== 'undefined') {
    localStorage.setItem('api_base_url', newUrl);
  }
};

// 导出函数以便组件可以获取当前API_BASE_URL
export const getCurrentApiBaseUrl = () => {
  // 在每次调用时重新检查localStorage，确保获取最新值
  if (typeof window !== 'undefined') {
    const savedApiUrl = localStorage.getItem('api_base_url');
    if (savedApiUrl && savedApiUrl !== API_BASE_URL) {
      API_BASE_URL = savedApiUrl;
    }
  }
  return API_BASE_URL;
};

// 🆕 简化的重试配置
const RETRY_CONFIG = {
  maxRetries: 1, // 减少重试次数
  baseDelay: 2000, // 增加基础延迟
  maxDelay: 5000,
  retryableStatuses: [503, 502, 504, 408, 429]
};

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 🆕 全局健康状态缓存，避免频繁检查
let lastHealthCheck = 0;
let lastHealthStatus = false;
const HEALTH_CACHE_DURATION = 10000; // 10秒缓存

// 🆕 优化的健康检查函数 - 带缓存
const checkBackendHealth = async (forceCheck = false): Promise<boolean> => {
  const now = Date.now();
  
  // 如果不是强制检查且缓存仍然有效，直接返回缓存结果
  if (!forceCheck && (now - lastHealthCheck) < HEALTH_CACHE_DURATION) {
    console.log('使用缓存的健康状态:', lastHealthStatus);
    return lastHealthStatus;
  }
  
  try {
    console.log('执行健康检查...');
    const response = await fetch(`${getCurrentApiBaseUrl()}/health`, {
      method: 'GET',
      timeout: 3000, // 减少超时时间
    } as any);
    
    lastHealthStatus = response.ok;
    lastHealthCheck = now;
    console.log('健康检查结果:', lastHealthStatus);
    return lastHealthStatus;
  } catch (error) {
    console.log('健康检查失败:', error);
    lastHealthStatus = false;
    lastHealthCheck = now;
    return false;
  }
};

// 🆕 简化的重试工具函数 - 仅针对连接请求
const withConnectionRetry = async <T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`${operationName} 重试第 ${attempt} 次`);
      }
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      const isRetryableError = (
        error.message?.includes('503') ||
        error.message?.includes('502') ||
        error.message?.includes('504') ||
        error.message?.includes('timeout') ||
        error.name === 'TypeError'
      );

      if (attempt === RETRY_CONFIG.maxRetries || !isRetryableError) {
        console.error(`${operationName} 最终失败:`, error);
        throw error;
      }

      const delayMs = Math.min(RETRY_CONFIG.baseDelay * Math.pow(1.5, attempt), RETRY_CONFIG.maxDelay);
      console.warn(`${operationName} 失败，${delayMs}ms后重试:`, error.message);
      await delay(delayMs);
    }
  }

  throw lastError!;
};

// 🆕 普通请求的重试函数 - 不包含健康检查
const withRetry = async <T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    console.error(`${operationName} 失败:`, error);
    
    // 对于普通请求，如果失败了就直接抛出错误，不重试
    const error_obj = new Error(`${operationName} failed: ${error.message}`) as any;
    error_obj.status = error.status;
    throw error_obj;
  }
};

export interface Activity {
  id: number;
  text: string;
  type: string;
  status: string;
  timestamp: number;
  command?: string;
  filename?: string;
  path?: string;
  speaker?: 'user' | 'ai';
}

export interface FileStructureNode {
  name: string;
  type: 'file' | 'directory';
  children?: FileStructureNode[];
  size?: number;
}

export interface StreamMessage {
  type: 'activity' | 'activity_update' | 'file_update' | 'task_update' | 'terminal' | 'heartbeat' | 'connection_close' | 'error';
  data?: any;
  reason?: string;
  message?: string;
}

export interface TaskResponse {
  task_id: string;
  status: string;
}

export interface FileUpdate {
  filename: string;
  content: string;
  is_url?: boolean;
  is_editable?: boolean;
  file_type?: string;
  content_mode?: 'text' | 'url';
}

// 🆕 Attachment data structure with content
export interface AttachmentData {
  name: string;
  content: string; // base64 encoded content
}

export interface ApiConfig {
  openaiApiKey: string;
  openaiBaseUrl?: string;
  model: string;
}

export class ApiService {
  // 🆕 Update createTask to accept AttachmentData and API config
  async createTask(prompt: string, attachments: AttachmentData[] = [], apiConfig?: ApiConfig): Promise<TaskResponse> {
    return withRetry(async () => {
      const requestBody = {
        prompt,
        attachments, // 🆕 Send the full attachment data
        api_config: apiConfig // 🆕 Send API configuration
      };

      // 调试信息：记录请求内容（隐藏敏感信息）
      console.log('Creating task with API config:', {
        prompt: prompt.substring(0, 50) + '...',
        attachments_count: attachments.length,
        api_config: apiConfig ? {
          model: apiConfig.model,
          openaiBaseUrl: apiConfig.openaiBaseUrl,
          hasApiKey: !!apiConfig.openaiApiKey
        } : null
      });

      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`) as any;
        error.status = response.status;
        throw error;
      }

      return response.json();
    }, 'createTask');
  }

  // 🆕 优化的连接方法 - 智能健康检查
  async connectTask(taskId: string): Promise<Response> {
    return withConnectionRetry(async () => {
      // 🆕 只在连接前检查一次健康状态，不强制刷新缓存
      const isHealthy = await checkBackendHealth(false);
      if (!isHealthy) {
        // 如果缓存显示不健康，强制检查一次
        const isActuallyHealthy = await checkBackendHealth(true);
        if (!isActuallyHealthy) {
          throw new Error('后端服务不可用');
        }
      }
      
      console.log(`连接任务 ${taskId}...`);
      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks/${taskId}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`) as any;
        error.status = response.status;
        throw error;
      }

      return response;
    }, `connectTask(${taskId})`);
  }

  async pauseTask(taskId: string): Promise<{ is_paused: boolean }> {
    return withRetry(async () => {
      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks/${taskId}/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`) as any;
        error.status = response.status;
        throw error;
      }

      return response.json();
    }, 'pauseTask');
  }

  async resumeTask(taskId: string): Promise<{ is_paused: boolean }> {
    return withRetry(async () => {
      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks/${taskId}/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`) as any;
        error.status = response.status;
        throw error;
      }

      return response.json();
    }, 'resumeTask');
  }

  async saveFileContent(taskId: string, filename: string, content: string): Promise<{ success: boolean; message?: string }> {
    return withRetry(async () => {
      const normalizedFilename = normalizeFilename(filename);
      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks/${taskId}/save-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          task_id: taskId,
          filename: normalizedFilename,
          content: content
        })
      });

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`) as any;
        error.status = response.status;
        throw error;
      }

      return response.json();
    }, 'saveFileContent');
  }

  async exportTask(taskId: string): Promise<Blob> {
    return withRetry(async () => {
      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks/${taskId}/export`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.blob();
    }, 'exportTask');
  }

  async getTask(taskId: string) {
    return withRetry(async () => {
      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks/${taskId}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    }, 'getTask');
  }

  async healthCheck() {
    return withRetry(async () => {
      const response = await fetch(`${getCurrentApiBaseUrl()}/health`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    }, 'healthCheck');
  }

  async getFileContent(taskId: string, filename: string): Promise<{ 
    success: boolean; 
    content?: string; 
    message?: string;
    filename?: string;
    size?: number;
    is_url?: boolean;
    is_editable?: boolean;
    file_type?: string;
    content_mode?: 'text' | 'url';
  }> {
    return withRetry(async () => {
      const normalizedFilename = normalizeFilename(filename);
      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks/${taskId}/files/${normalizedFilename}`);
      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`) as any;
        error.status = response.status;
        throw error;
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response.json();
      } else {
        // It's a binary file (image, pdf etc.). We don't need the content here.
        // The renderer will build a URL from the filename.
        // We can return a success object with dummy content.
        return {
          success: true,
          content: '', // Content is fetched by the browser via URL
          filename: filename,
          is_editable: false,
        };
      }
    }, 'getFileContent');
  }

  async getAllFilesContent(taskId: string): Promise<{ success: boolean; files?: Record<string, string>; message?: string }> {
    return withRetry(async () => {
      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks/${taskId}/files`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    }, 'getAllFilesContent');
  }
}

export const apiService = new ApiService();

// React Hook for streaming task data
export interface UseTaskStreamResult {
  activities: Activity[];
  currentFile: string;
  fileContent: string;
  taskStatus: string;
  error: string | null;
  isConnected: boolean;
  terminalOutput: string[];
  fileList: string[];
  currentFileMetadata?: {
    isUrl?: boolean;
    isEditable?: boolean;
    fileType?: string;
    contentMode?: 'text' | 'url';
  };
}

export function useTaskStream(taskId: string | null): UseTaskStreamResult {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentFile, setCurrentFile] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [taskStatus, setTaskStatus] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [currentFileMetadata, setCurrentFileMetadata] = useState<UseTaskStreamResult['currentFileMetadata']>();
  const [fileList, setFileList] = useState<string[]>([]);

  // 🆕 简化状态管理 - 只用一个ref跟踪当前连接
  const currentConnectionRef = useRef<{
    taskId: string | null;
    abortController: AbortController | null;
    isConnecting: boolean;
  }>({
    taskId: null,
    abortController: null,
    isConnecting: false
  });

  // 稳定handleMessage引用
  const handleMessage = useCallback((message: StreamMessage) => {
    console.log('收到消息:', message.type, message);

    switch (message.type) {
      case 'activity':
        setActivities(prev => [...prev, message.data as Activity]);
        break;

      case 'activity_update':
        setActivities(prev => prev.map(activity =>
          activity.id === message.data.id
            ? { ...activity, status: message.data.status, ...message.data }
            : activity
        ));
        break;

      case 'file_update':
        const fileUpdate = message.data as FileUpdate;
        const normalizedFilename = normalizeFilename(fileUpdate.filename);

        console.log('📄 File update received:', normalizedFilename, 'Content length:', fileUpdate.content.length);
        
        // 🆕 更严格的文件更新逻辑：总是更新当前文件和内容
        setCurrentFile(normalizedFilename);
        setFileContent(fileUpdate.content);
        setCurrentFileMetadata({
          isUrl: fileUpdate.is_url,
          isEditable: fileUpdate.is_editable,
          fileType: fileUpdate.file_type,
          contentMode: fileUpdate.content_mode
        });
        
        // 始终更新文件列表，确保新文件被添加
        setFileList(prev => {
          const newFileList = new Set([...prev, normalizedFilename]);
          return Array.from(newFileList).sort();
        });
        
        break;

      case 'task_update':
        setTaskStatus(message.data.status);
        if (message.data.error) {
          setError(message.data.error);
        }
        break;

      case 'terminal':
        setTerminalOutput(prev => [
          ...prev,
          `$ ${message.data.command}`,
          message.data.output
        ]);
        break;

      case 'heartbeat':
        setError(null);
        break;

      case 'error':
        setError(message.message || '未知错误');
        setIsConnected(false);
        break;

      default:
        console.log('未知消息类型:', message.type);
    }
  }, []);

  const connectToTask = useCallback(async (currentTaskId: string) => {
    console.log(`尝试连接任务: ${currentTaskId}`);
    
    // 检查是否已经在连接相同的任务
    const connection = currentConnectionRef.current;
    if (connection.isConnecting && connection.taskId === currentTaskId) {
      console.log(`任务 ${currentTaskId} 已在连接中，跳过`);
      return;
    }

    // 清理之前的连接
    disconnectFromTask();

    // 设置新连接状态
    connection.taskId = currentTaskId;
    connection.isConnecting = true;
    connection.abortController = new AbortController();
    
    console.log(`开始连接任务: ${currentTaskId}`);
    
    try {
      setError(null);
      setIsConnected(true);

      const response = await fetch(`${getCurrentApiBaseUrl()}/tasks/${currentTaskId}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: connection.abortController.signal
      });

      // 检查连接是否仍然有效（防止竞态条件）
      if (connection.taskId !== currentTaskId || connection.abortController?.signal.aborted) {
        console.log(`连接已过期或被中断: ${currentTaskId}`);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let messageCount = 0;
      let lastHeartbeat = Date.now();

      console.log(`任务 ${currentTaskId} 连接成功，开始读取消息流`);

      while (true) {
        // 检查连接是否仍然有效
        if (connection.taskId !== currentTaskId || connection.abortController?.signal.aborted) {
          console.log(`连接已过期或被中断，停止读取: ${currentTaskId}`);
          break;
        }

        // 心跳超时检查
        if (Date.now() - lastHeartbeat > 60000) {
          console.warn('心跳超时，断开连接...');
          throw new Error('连接心跳超时');
        }

        const { value, done } = await reader.read();
        
        if (done) {
          console.log(`任务 ${currentTaskId} 连接结束，总共处理了 ${messageCount} 条消息`);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message: StreamMessage = JSON.parse(line);
              messageCount++;
              lastHeartbeat = Date.now();
              
              console.log(`处理消息 ${messageCount}:`, message.type);
              handleMessage(message);

              if (message.type === 'task_update' && 
                  message.data?.status && 
                  ['completed', 'failed'].includes(message.data.status)) {
                console.log(`任务 ${currentTaskId} 完成，状态:`, message.data.status);
                setIsConnected(false);
                connection.isConnecting = false;
                return;
              }
            } catch (parseError) {
              console.error('解析消息失败:', parseError, '原始内容:', line);
            }
          }
        }
      }

    } catch (fetchError: any) {
      // 只有当连接仍然有效时才处理错误
      if (connection.taskId === currentTaskId && !connection.abortController?.signal.aborted) {
        console.error(`任务 ${currentTaskId} 连接错误:`, fetchError);
        setIsConnected(false);
      } else {
        console.log(`连接被取消或过期，忽略错误: ${currentTaskId}`);
      }
    } finally {
      // 只有当连接仍然有效时才清理状态
      if (connection.taskId === currentTaskId) {
        connection.isConnecting = false;
      }
    }
  }, [handleMessage]);

  const disconnectFromTask = useCallback(() => {
    if (currentConnectionRef.current.abortController) {
      console.log('中止任务连接:', currentConnectionRef.current.taskId);
      try {
        currentConnectionRef.current.abortController.abort();
      } catch (error) {
        // 忽略 abort 错误，这是正常的清理过程
        console.log('Connection abort completed');
      }
      currentConnectionRef.current.abortController = null;
    }
    currentConnectionRef.current.taskId = null;
    setIsConnected(false);
  }, []);
  
  useEffect(() => {
    if (taskId && taskId !== currentConnectionRef.current.taskId) {
      if (currentConnectionRef.current.taskId) {
        disconnectFromTask();
      }
    
      // 重置状态
      setActivities([]);
      setCurrentFile('');
      setFileContent('');
      setTaskStatus('idle');
      setError(null);
      setIsConnected(false);
      setTerminalOutput([]);
      setFileList([]);
      setCurrentFileMetadata(undefined);

    connectToTask(taskId);
    } else if (!taskId) {
      disconnectFromTask();
    }

    return () => {
      // 在组件卸载时断开连接
      if (taskId) {
        disconnectFromTask();
      }
    };
  }, [taskId, connectToTask, disconnectFromTask]);

  return {
    activities,
    currentFile,
    fileContent,
    taskStatus,
    error,
    isConnected,
    terminalOutput,
    fileList,
    currentFileMetadata,
  };
}

// 🆕 添加调试工具函数
export const debugFileStructure = (structure: FileStructureNode | null) => {
  if (!structure) {
    console.log('File structure: null');
    return;
  }
  
  const printNode = (node: FileStructureNode, indent = 0) => {
    const prefix = '  '.repeat(indent);
    console.log(`${prefix}${node.type === 'directory' ? '📁' : '📄'} ${node.name}`);
    if (node.children) {
      node.children.forEach(child => printNode(child, indent + 1));
    }
  };
  
  console.log('=== File Structure ===');
  printNode(structure);
  console.log('=====================');
};

export interface Task {
  task_id: string;
  // ... existing code ...
}