"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, Check, X, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { updateApiBaseUrl, getCurrentApiBaseUrl } from "@/lib/api"

interface ApiSettingsProps {
  className?: string
  onClearApiCache?: () => void
}

export function ApiSettings({ className, onClearApiCache }: ApiSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [apiUrl, setApiUrl] = useState("")
  const [tempApiUrl, setTempApiUrl] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'failed'>('idle')
  const { toast } = useToast()

  // 从localStorage读取保存的API地址，如果没有则使用默认值
  useEffect(() => {
    const currentUrl = getCurrentApiBaseUrl()
    setApiUrl(currentUrl)
    setTempApiUrl(currentUrl)
  }, [])

  // 测试API连接
  const testConnection = async (url: string) => {
    setIsConnecting(true)
    setConnectionStatus('idle')
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        setConnectionStatus('connected')
        toast({
          title: "连接成功",
          description: "API服务器连接正常",
        })
        return true
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      clearTimeout(timeoutId)
      setConnectionStatus('failed')
      
      let errorMessage = "未知错误"
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = "连接超时"
        } else {
          errorMessage = error.message
        }
      }
      
      toast({
        title: "连接失败",
        description: `无法连接到API服务器: ${errorMessage}`,
        variant: "destructive"
      })
      return false
    } finally {
      setIsConnecting(false)
    }
  }

  // 保存API地址
  const saveApiUrl = async () => {
    if (!tempApiUrl.trim()) {
      toast({
        title: "请输入有效的API地址",
        variant: "destructive"
      })
      return
    }

    // 测试连接
    const isConnected = await testConnection(tempApiUrl)
    
    if (isConnected) {
      // 使用api.ts提供的函数更新API地址
      updateApiBaseUrl(tempApiUrl)
      setApiUrl(tempApiUrl)
      
      toast({
        title: "API地址已保存",
        description: "新的API地址已生效，刷新页面后完全启用",
      })
      setIsOpen(false)
    }
  }

  // 重置为默认地址
  const resetToDefault = () => {
    const defaultUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
    setTempApiUrl(defaultUrl)
  }

  return (
    <div className={`relative ${className}`}>
      {/* 设置按钮 - 不显眼的灰色设计 */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-white/20 backdrop-blur-sm transition-all duration-200"
        title="API设置"
      >
        <Settings className="h-3 w-3" />
      </Button>

      {/* 设置面板 - 毛玻璃悬浮窗 */}
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* 设置面板 */}
          <div className="absolute top-10 right-0 z-50 w-80 backdrop-blur-xl bg-white/80 border border-white/30 rounded-xl shadow-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">API服务器设置</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600 mb-1 block">当前API地址</label>
                <div className="text-xs text-slate-500 bg-slate-100/50 rounded-md p-2 font-mono break-all">
                  {apiUrl}
                </div>
              </div>
              
              <div>
                <label className="text-xs text-slate-600 mb-1 block">新API地址</label>
                <Input
                  value={tempApiUrl}
                  onChange={(e) => setTempApiUrl(e.target.value)}
                  placeholder="http://localhost:5000/api"
                  className="text-xs bg-white/60 border-white/30 focus:bg-white/80 focus:border-blue-300/50"
                />
              </div>
              
              {/* 连接状态指示 */}
              {connectionStatus !== 'idle' && (
                <div className={`flex items-center gap-2 text-xs px-2 py-1 rounded-md ${
                  connectionStatus === 'connected' 
                    ? 'bg-green-100/60 text-green-700' 
                    : 'bg-red-100/60 text-red-700'
                }`}>
                  {connectionStatus === 'connected' ? (
                    <>
                      <Check className="h-3 w-3" />
                      连接正常
                    </>
                  ) : (
                    <>
                      <X className="h-3 w-3" />
                      连接失败
                    </>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={saveApiUrl}
                disabled={isConnecting}
                className="flex-1 h-8 text-xs bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    测试中...
                  </>
                ) : (
                  '测试并保存'
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={resetToDefault}
                className="h-8 text-xs text-slate-600 hover:text-slate-800 hover:bg-white/40"
              >
                重置
              </Button>
            </div>
            
            {/* API配置缓存管理 */}
            {onClearApiCache && (
              <div className="border-t border-slate-200/50 pt-3 space-y-2">
                                 <div className="flex items-center justify-between">
                   <span className="text-xs text-slate-600">API Config Cache</span>
                  <Button
                    variant="ghost"
                    size="sm"
                                         onClick={() => {
                       onClearApiCache()
                       toast({
                         title: "API Configuration Cache Cleared",
                         description: "All saved API Key, Base URL and Model settings have been deleted",
                         variant: "default"
                       })
                     }}
                                         className="h-6 px-2 text-xs text-red-600 hover:text-red-800 hover:bg-red-50/60"
                   >
                     Clear Cache
                   </Button>
                 </div>
                 <div className="text-xs text-slate-500">
                   Clear locally saved API Key, Base URL and Model configuration
                 </div>
              </div>
            )}
            
            <div className="text-xs text-slate-500 leading-relaxed">
              修改API地址后，将测试连接并保存设置。页面刷新后完全生效。
            </div>
          </div>
        </>
      )}
    </div>
  )
} 