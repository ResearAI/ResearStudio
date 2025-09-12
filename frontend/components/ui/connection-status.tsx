import React from 'react';
import { Wifi, WifiOff, AlertTriangle, CheckCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  isConnected: boolean;
  error: string | null;
  isRetrying?: boolean;
}

export function ConnectionStatus({ isConnected, error, isRetrying = false }: ConnectionStatusProps) {
  if (isConnected && !error) {
    return (
      <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1 rounded-full text-xs border border-green-200">
        <CheckCircle className="h-3 w-3" />
        <span>已连接</span>
      </div>
    );
  }

  if (isRetrying || (error && error.includes('重试'))) {
    return (
      <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-full text-xs border border-amber-200">
        <RotateCcw className="h-3 w-3 animate-spin" />
        <span>重新连接中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1 rounded-full text-xs border border-red-200">
        <WifiOff className="h-3 w-3" />
        <span>连接失败</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-slate-500 bg-slate-50 px-3 py-1 rounded-full text-xs border border-slate-200">
      <Wifi className="h-3 w-3" />
      <span>连接中...</span>
    </div>
  );
}

interface DetailedConnectionStatusProps extends ConnectionStatusProps {
  taskId?: string;
  showDetails?: boolean;
}

export function DetailedConnectionStatus({ 
  isConnected, 
  error, 
  isRetrying = false, 
  taskId,
  showDetails = false 
}: DetailedConnectionStatusProps) {
  if (!showDetails) {
    return <ConnectionStatus isConnected={isConnected} error={error} isRetrying={isRetrying} />;
  }

  return (
    <div className="space-y-2">
      <ConnectionStatus isConnected={isConnected} error={error} isRetrying={isRetrying} />
      
      {error && (
        <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded border">
          <div className="font-medium text-red-600 mb-1">连接问题:</div>
          <div>{error}</div>
          {taskId && (
            <div className="mt-1 text-slate-500">任务ID: {taskId}</div>
          )}
        </div>
      )}
      
      {isConnected && taskId && (
        <div className="text-xs text-slate-600 bg-green-50 p-2 rounded border border-green-200">
          <div className="font-medium text-green-600 mb-1">连接状态:</div>
          <div>✓ 后端服务已连接</div>
          <div>✓ 实时数据流正常</div>
          <div className="mt-1 text-slate-500">任务ID: {taskId}</div>
        </div>
      )}
    </div>
  );
} 