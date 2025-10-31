"use client"

import React, { useLayoutEffect, useRef, useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Paperclip, ArrowUp, Loader2, FileText, X, ArrowRight, Sparkles, Brain, Code, Zap, Users, TrendingUp, BarChart3, Database, Search, Terminal, FileSpreadsheet } from "lucide-react"
import { useRouter } from "next/navigation"
import { apiService, AttachmentData, ApiConfig } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { ApiSettings } from "@/components/ui/api-settings"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { appendCacheBusterForPng, cn } from "@/lib/utils"

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger)



// Floating prompt texts similar to Adaline
const floatingPrompts = [
  "Analyze GDP trends across decades",
  "Generate comprehensive research reports", 
  "Create stunning data visualizations",
  "Execute complex analysis workflows",
  "Build interactive dashboards",
  "Process financial datasets",
  "Develop ML prediction models",
  "Automate research pipelines",
  "Extract insights from documents",
  "Collaborate with AI agents",
  "Plan strategic research initiatives",
  "Monitor real-time execution"
]

// Tools showcase data based on the architecture diagram
const toolsShowcase = [
  { icon: Search, name: "Google Search", color: "from-blue-500 to-blue-700", delay: 0 },
  { icon: FileSpreadsheet, name: "Excel Analysis", color: "from-green-500 to-green-700", delay: 0.1 },
  { icon: FileText, name: "Document Processing", color: "from-purple-500 to-purple-700", delay: 0.2 },
  { icon: Code, name: "Code Generation", color: "from-orange-500 to-orange-700", delay: 0.3 },
  { icon: Terminal, name: "Terminal Execution", color: "from-slate-500 to-slate-700", delay: 0.4 },
  { icon: Database, name: "Data Mining", color: "from-indigo-500 to-indigo-700", delay: 0.5 },
  { icon: BarChart3, name: "Visualization", color: "from-pink-500 to-pink-700", delay: 0.6 },
  { icon: Brain, name: "AI Analysis", color: "from-red-500 to-red-700", delay: 0.7 }
]

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  // API configuration states
  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [isApiConfigLoaded, setIsApiConfigLoaded] = useState(false)
  const [showCacheNotice, setShowCacheNotice] = useState(false)
  const [isCacheNoticeVisible, setIsCacheNoticeVisible] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { toast } = useToast()
  const mainRef = useRef<HTMLDivElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const backgroundImageUrl = useMemo(() => appendCacheBusterForPng('/bg.png', Date.now().toString()), [])

  // 缓存相关函数
  const saveApiConfigToCache = (config: { openaiApiKey: string; openaiBaseUrl: string; model: string }) => {
    try {
      localStorage.setItem('researchstudio_api_config', JSON.stringify({
        openaiApiKey: config.openaiApiKey,
        openaiBaseUrl: config.openaiBaseUrl,
        model: config.model,
        timestamp: Date.now()
      }))
      console.log('API配置已保存到缓存')
    } catch (error) {
      console.error('保存API配置失败:', error)
    }
  }

  const loadApiConfigFromCache = () => {
    try {
      const cached = localStorage.getItem('researchstudio_api_config')
      if (cached) {
        const config = JSON.parse(cached)
        const isRecent = Date.now() - config.timestamp < 7 * 24 * 60 * 60 * 1000 // 7天有效期
        
        if (isRecent) {
          setOpenaiApiKey(config.openaiApiKey || '')
          setOpenaiBaseUrl(config.openaiBaseUrl || '')
          setModel(config.model || '')
          console.log('从缓存加载API配置成功')
          return true
        } else {
          // 清除过期的缓存
          localStorage.removeItem('researchstudio_api_config')
          console.log('缓存已过期，已清除')
        }
      }
    } catch (error) {
      console.error('加载API配置失败:', error)
    }
    return false
  }

  const clearApiConfigCache = () => {
    try {
      localStorage.removeItem('researchstudio_api_config')
      setOpenaiApiKey('')
      setOpenaiBaseUrl('')
      setModel('')
      setShowCacheNotice(false)
      setIsCacheNoticeVisible(true)
      console.log('API configuration cache cleared')
    } catch (error) {
      console.error('Failed to clear API configuration cache:', error)
    }
  }

  // 页面加载时尝试从缓存恢复API配置
  useEffect(() => {
    const loaded = loadApiConfigFromCache()
    setIsApiConfigLoaded(true)
    
    if (loaded) {
      setShowCacheNotice(true)
      toast({
        title: "API Configuration Restored",
        description: "Previously saved API settings have been automatically loaded",
        variant: "default"
      })
      
      // 10秒后自动隐藏提示
      const timer = setTimeout(() => {
        setIsCacheNoticeVisible(false)
      }, 10000)
      
      return () => clearTimeout(timer)
    }
  }, [toast])

  // 监听API配置变化，自动保存到缓存
  useEffect(() => {
    if (isApiConfigLoaded && (openaiApiKey || openaiBaseUrl || model)) {
      const timer = setTimeout(() => {
        saveApiConfigToCache({
          openaiApiKey,
          openaiBaseUrl,
          model
        })
      }, 1000) // 延迟1秒保存，避免每次输入都保存

      return () => clearTimeout(timer)
    }
  }, [openaiApiKey, openaiBaseUrl, model, isApiConfigLoaded])

  // Mouse tracking for 3D effects
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 防止重复提交
    if (isSubmitting) {
      return
    }

    if (!prompt.trim()) {
      toast({
        title: "Please enter a task description",
        description: "Please describe what you'd like ResearStudio to help you accomplish",
        variant: "destructive"
      })
      return
    }

    if (!openaiApiKey.trim()) {
      toast({
        title: "API Key Required",
        description: "Please enter your OpenAI API Key to proceed",
        variant: "destructive"
      })
      return
    }

    if (!model.trim()) {
      toast({
        title: "Model Required",
        description: "Please specify the AI model to use",
        variant: "destructive"
      })
      return
    }

    setIsSubmitting(true)

    try {
      const readFileAsBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
          };
          reader.onerror = (error) => reject(error);
          reader.readAsDataURL(file);
        });
      };

      const attachmentData: AttachmentData[] = await Promise.all(
        attachments.map(async (file) => ({
          name: file.name,
          content: await readFileAsBase64(file),
        }))
      );

      // 构建并验证API配置对象
      const apiConfig: ApiConfig = {
        openaiApiKey: openaiApiKey.trim(),
        openaiBaseUrl: openaiBaseUrl.trim() || undefined,
        model: model.trim()
      }

      // 验证API配置
      if (!apiConfig.openaiApiKey) {
        throw new Error('OpenAI API Key is required')
      }
      if (!apiConfig.model) {
        throw new Error('Model is required')
      }

      // 调试信息：显示将要发送的配置（不包含完整API密钥）
      console.log('Sending API config:', {
        ...apiConfig,
        openaiApiKey: apiConfig.openaiApiKey ? `${apiConfig.openaiApiKey.substring(0, 7)}...` : 'empty'
      })

      const response = await apiService.createTask(prompt, attachmentData, apiConfig)
      
      console.log('Task created successfully:', {
        task_id: response.task_id,
        status: response.status
      })

      // 保存成功的API配置到缓存
      saveApiConfigToCache({
        openaiApiKey: apiConfig.openaiApiKey,
        openaiBaseUrl: apiConfig.openaiBaseUrl || '',
        model: apiConfig.model
      })
      
      // 安全导航
      setTimeout(() => {
        router.push(`/dashboard?taskId=${response.task_id}&prompt=${encodeURIComponent(prompt)}`)
      }, 100)
    } catch (error: any) {
      console.error('Failed to create task:', error)
      
      let errorMessage = "Please check your network connection and try again"
      
      if (error.message) {
        if (error.message.includes('API Key')) {
          errorMessage = "Please check your API Key and try again"
        } else if (error.message.includes('Model')) {
          errorMessage = "Please check your model configuration and try again"
        } else if (error.message.includes('401') || error.message.includes('403')) {
          errorMessage = "Invalid API credentials. Please check your API Key"
        } else if (error.message.includes('429')) {
          errorMessage = "API rate limit exceeded. Please try again later"
        } else {
          errorMessage = error.message
        }
      }
      
      toast({
        title: "Failed to create task",
        description: errorMessage,
        variant: "destructive"
      })
      setIsSubmitting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)
      setAttachments(prev => [...prev, ...newFiles])
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  useLayoutEffect(() => {
    if (!mainRef.current) return

    const ctx = gsap.context(() => {
      // Smooth fade-in animations for each section
      gsap.utils.toArray(".chapter-section").forEach((section: any, index) => {
        if (!section) return
        
        const leftContent = section.querySelector(".left-content")
        const rightContent = section.querySelector(".right-content")
        const chineseChar = section.querySelector(".chinese-character")
        
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: "top 70%",
            end: "bottom 30%",
            toggleActions: "play none none reverse"
          }
        })

        // Fade in left content
        if (leftContent && leftContent.children.length > 0) {
          tl.fromTo(leftContent.children, {
            opacity: 0,
            y: 40,
            stagger: 0.1
          }, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "power2.out",
            stagger: 0.1
          })
        }

        // Fade in right content with a slight delay
        if (rightContent) {
          tl.fromTo(rightContent, {
            opacity: 0,
            scale: 0.95
          }, {
            opacity: 1,
            scale: 1,
            duration: 1,
            ease: "power2.out"
          }, "-=0.6")
        }

        // Animate Chinese character
        if (chineseChar) {
          tl.fromTo(chineseChar, {
            opacity: 0.1,
            scale: 1.1
          }, {
            opacity: 0.15,
            scale: 1,
            duration: 1.5,
            ease: "power2.out"
          }, "-=1")
        }
      })

      // Hero section special animation
      const heroSection = document.querySelector("#hero-section")
      const inkRipple = document.querySelector("#ink-ripple")
      if (heroSection && inkRipple) {
        gsap.fromTo(inkRipple, {
          scale: 0,
          opacity: 1
        }, {
          scale: 3,
          opacity: 0,
          duration: 2,
          ease: "power2.out",
          scrollTrigger: {
            trigger: heroSection,
            start: "top top",
            end: "bottom top",
            scrub: 1
          }
        })
      }

             // Workflow animation
       const workflowElements = gsap.utils.toArray(".workflow-step")
       workflowElements.forEach((element: any, index) => {
         if (!element) return
         
         gsap.fromTo(element, {
           opacity: 0,
           x: -20
         }, {
           opacity: 1,
           x: 0,
           duration: 0.6,
           delay: index * 0.2,
           ease: "power2.out",
              scrollTrigger: {
             trigger: element,
             start: "top 80%"
           }
         })
       })

      // Performance bars animation
      gsap.utils.toArray(".performance-bar").forEach((bar: any) => {
        if (!bar) return
        
        const width = bar.getAttribute("data-width")
        if (width) {
          gsap.fromTo(bar, {
            width: "0%"
          }, {
            width: width,
            duration: 1.5,
            ease: "power2.out",
              scrollTrigger: {
              trigger: bar,
              start: "top 80%"
            }
          })
        }
      })

      // Demo cards stagger animation
      gsap.utils.toArray(".demo-card").forEach((card: any, index) => {
        if (!card) return
        
        gsap.fromTo(card, {
          opacity: 0,
          y: 60,
          scale: 0.95
        }, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.8,
          delay: index * 0.2,
          ease: "power2.out",
          scrollTrigger: {
            trigger: card,
            start: "top 85%"
          }
        })
      })

    }, mainRef)

    return () => {
      // 安全地清理GSAP上下文
      try {
        ctx.revert()
      } catch (error) {
        console.log('GSAP cleanup error (safe to ignore):', error)
      }
    }
  }, [])



  return (
    <div ref={mainRef} className="min-h-screen bg-gradient-to-b from-stone-50 via-amber-50 to-stone-100">
      {/* Hero Section */}
      <section id="hero-section" className="min-h-screen relative overflow-hidden">
        {/* Background */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10"
          style={{ backgroundImage: `url(${backgroundImageUrl})` }}
        />
        
        {/* Ink ripple effect */}
        <div 
          id="ink-ripple" 
          className="absolute top-1/2 left-1/2 w-32 h-32 bg-gradient-radial from-slate-800/20 to-transparent rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        />

        <div className="relative z-10 min-h-screen flex items-center justify-center px-8">
          <ApiSettings 
            className="absolute top-6 right-6" 
            onClearApiCache={clearApiConfigCache}
          />
          
          <div className="w-full max-w-4xl">
            {/* Hero Title */}
            <div className="text-center mb-16">
              {/* ResearShop Logo */}
              <div className="flex items-center justify-center gap-4 mb-8">
                <h1 className="text-8xl font-light tracking-wider text-slate-800 font-serif flex items-center">
                  <span className="bg-gradient-to-r from-blue-700 via-blue-800 to-blue-900 bg-clip-text text-transparent">
                    Resear
                  </span>
                  <span className="text-slate-900 font-black ml-1">
                    Studio
                  </span>
                </h1>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center shadow-lg">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className="text-2xl text-slate-600 font-light mb-4">
                Beyond Automation. Welcome to the Collaborative Workshop
              </p>

            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className={cn(
                "relative transition-all duration-700 ease-out transform",
                isFocused && "-translate-y-2 scale-[1.01]"
              )}>
                <div className={cn(
                  "backdrop-blur-sm bg-white/90 border border-slate-200/50 rounded-3xl shadow-xl transition-all duration-500",
                  isFocused && "shadow-slate-300/50 bg-white/95 border-slate-300/50"
                )}>
                  <textarea
                    className="w-full px-8 py-6 text-lg resize-none border-0 bg-transparent focus:outline-none placeholder:text-slate-400 min-h-[140px] rounded-3xl font-sans"
                    placeholder="Describe your research quest... (e.g., Analyze GDP trends, Create AI presentation, Generate data visualizations)"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    disabled={isSubmitting}
                  />

                  <div className="flex items-center justify-between px-8 py-6 border-t border-slate-200/50 bg-slate-50/30 backdrop-blur-sm rounded-b-3xl">
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-slate-600 hover:text-slate-800 hover:bg-white/60 backdrop-blur-sm transition-all duration-200"
                        onClick={triggerFileInput}
                        disabled={isSubmitting}
                      >
                        <Paperclip className="h-4 w-4 mr-2" />
                        Attach Files
                      </Button>

                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        onChange={handleFileChange}
                        disabled={isSubmitting}
                      />

                      {attachments.length > 0 && (
                        <span className="text-sm text-slate-600 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full">
                          {attachments.length} files
                        </span>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-slate-950 text-white px-8 py-3 rounded-2xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                      disabled={isSubmitting || !prompt.trim() || !openaiApiKey.trim() || !model.trim()}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          Enter Workshop
                          <ArrowUp className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* API Configuration */}
              <div className="backdrop-blur-sm bg-white/80 border border-slate-200/50 rounded-2xl p-6 shadow-lg space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-slate-700">API Configuration</h3>
                    {isApiConfigLoaded && (openaiApiKey || openaiBaseUrl || model) && (
                      <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50/80 px-2 py-1 rounded-full">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        <span>Auto-saved</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Cache Notice - 可隐藏的提示 */}
                  {showCacheNotice && (
                    <div className={cn(
                      "transition-all duration-700 ease-in-out overflow-hidden",
                      isCacheNoticeVisible ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
                    )}>
                      <div className="p-4 bg-blue-50/80 backdrop-blur-sm rounded-xl border border-blue-200/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm text-blue-700 leading-relaxed">
                              <strong>💾 Auto-Save Enabled:</strong> Your API configuration is automatically saved locally in your browser for convenience. This data stays on your device and expires after 7 days.
                            </p>
                            <p className="text-xs text-blue-600 mt-1">
                              You can clear saved data anytime via the settings button above.
                            </p>
                          </div>
                          <button
                            onClick={() => setIsCacheNoticeVisible(false)}
                            className="flex-shrink-0 p-1 hover:bg-blue-100/60 rounded-md transition-colors duration-200"
                            title="Hide notice"
                          >
                            <X className="h-3 w-3 text-blue-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* 重新显示提示的按钮 */}
                  {showCacheNotice && !isCacheNoticeVisible && (
                    <div className="flex justify-start">
                      <button
                        onClick={() => setIsCacheNoticeVisible(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50/60 px-2 py-1 rounded-md transition-all duration-200 flex items-center gap-1"
                      >
                        <span>💾</span>
                        <span>Show cache info</span>
                      </button>
                    </div>
                  )}
                  
                  {/* API Key Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">
                      OpenAI API Key *
                    </label>
                    <input
                      type="password"
                      className="w-full px-4 py-3 text-sm border border-slate-200/50 rounded-xl bg-white/60 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 transition-all duration-200"
                      placeholder="sk-..."
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Base URL Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">
                      OpenAI Base URL (Optional)
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 text-sm border border-slate-200/50 rounded-xl bg-white/60 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 transition-all duration-200"
                      placeholder="https://api.openai.com/v1"
                      value={openaiBaseUrl}
                      onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Model Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-600">
                      Model *
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 text-sm border border-slate-200/50 rounded-xl bg-white/60 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-300 transition-all duration-200"
                      placeholder="gpt-4, gpt-3.5-turbo, claude-3-opus-20240229, etc."
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {/* Security Notice */}
                <div className="mt-4 p-4 bg-red-50/80 backdrop-blur-sm rounded-xl border border-red-200/50">
                  <p className="text-sm text-red-700 leading-relaxed">
                    <strong>Privacy Notice:</strong> We do not store any API key information on our servers. However, we recommend using time-limited API keys for additional security. Each task typically costs between $1-100 in API credits depending on complexity.
                  </p>
                  <p className="text-sm text-red-700 mt-2">
                    <strong>Regional Notice:</strong> Our servers are located in Hong Kong, China. Please ensure your chosen model provider complies with regional restrictions.
                  </p>
                </div>



                {/* Preview Option */}
                <div className="mt-4 p-4 bg-blue-50/80 backdrop-blur-sm rounded-xl border border-blue-200/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 leading-relaxed">
                        <strong>💡 Want to see ResearStudio in action first?</strong>
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        Explore our interactive demo showcase with real examples
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const previewSection = document.getElementById('preview-section')
                        previewSection?.scrollIntoView({ behavior: 'smooth' })
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all duration-300 text-sm font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>View Demo</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Attachments List */}
              {attachments.length > 0 && (
                <div className="backdrop-blur-sm bg-white/80 border border-slate-200/50 rounded-2xl p-6 shadow-lg space-y-3">
                    {attachments.map((file, index) => (
                    <div key={index} className="flex items-center gap-3 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200/30 hover:bg-white/80 transition-all duration-200">
                      <FileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">
                          {file.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatFileSize(file.size)}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                        className="h-8 w-8 p-0 hover:bg-red-100/60 hover:text-red-600 transition-all duration-200"
                          onClick={() => removeAttachment(index)}
                          disabled={isSubmitting}
                        >
                        <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                </div>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* Chapter 1: The Problem */}
      <section className="chapter-section min-h-screen flex items-center py-24 px-8 relative">
                 {/* Chinese Character Background */}
         <div className="chinese-character absolute right-24 top-1/2 transform -translate-y-1/2 text-[20rem] font-calligraphy text-slate-800/8 select-none pointer-events-none leading-none">
           困
         </div>
        
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div className="left-content space-y-8">
            <div className="space-y-6">
              <h2 className="text-5xl font-light text-slate-800 font-serif">
                Tired of the Black Box?
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed">
                Current AI agents operate in mysterious ways. You send a request, wait, and hope for the best.
              </p>
              <p className="text-lg text-slate-500">
                Complex workflows become unpredictable. Debugging is nearly impossible. 
                You lose control over the most critical decisions.
          </p>
        </div>
            
            <div className="space-y-4">
              <h3 className="text-2xl font-medium text-slate-700">Common Pain Points:</h3>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Opaque decision-making processes</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Inability to intervene mid-process</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Unpredictable outputs and quality</span>
                </li>
              </ul>
            </div>
          </div>
          
          {/* Right Content - Chaos Visualization */}
          <div className="right-content">
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-slate-200/50">
              <div className="relative h-80 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="relative">
                      <div className="w-24 h-24 mx-auto bg-slate-900 rounded-2xl flex items-center justify-center">
                        <span className="text-white text-2xl">AI</span>
                                </div>
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full animate-pulse"></div>
                    </div>
                    <div className="text-lg font-medium text-slate-700">Black Box Agent</div>
                    <div className="text-sm text-slate-500">Processing... Please wait...</div>
                    
                    {/* Scattered elements representing chaos */}
                    <div className="absolute top-4 left-4 w-8 h-8 bg-red-200 rounded rotate-12 opacity-60"></div>
                    <div className="absolute top-12 right-8 w-6 h-6 bg-yellow-200 rounded-lg -rotate-45 opacity-60"></div>
                    <div className="absolute bottom-8 left-12 w-4 h-4 bg-blue-200 rounded-full opacity-60"></div>
                    <div className="absolute bottom-4 right-4 w-10 h-6 bg-green-200 rounded-md rotate-45 opacity-60"></div>
                  </div>
            </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Chapter 2: The Solution */}
      <section className="chapter-section min-h-screen flex items-center py-24 px-8 relative">
        {/* Chinese Character Background */}
        <div className="chinese-character absolute right-24 top-1/2 transform -translate-y-1/2 text-[12rem] font-bold text-slate-800/10 select-none pointer-events-none">
          法
        </div>
        
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div className="left-content space-y-8">
            <div className="space-y-6">
              <h2 className="text-5xl font-light text-slate-800 font-serif">
                Strategy Meets Execution
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed">
                Our two-agent architecture separates thinking from doing, 
                making every decision transparent and controllable.
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="workflow-step p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/50">
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Strategic Planner</h3>
                <p className="text-slate-600">Breaks down complex tasks into clear, actionable steps. You can see and modify the plan at any time.</p>
              </div>
              
              <div className="workflow-step p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/50">
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Code Executor</h3>
                <p className="text-slate-600">Executes each step with full visibility. Real-time logs, file changes, and results are always accessible.</p>
              </div>
              
              <div className="workflow-step p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/50">
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Human Oversight</h3>
                <p className="text-slate-600">Intervene whenever needed. Pause, modify, or redirect the workflow based on intermediate results.</p>
              </div>
            </div>
          </div>
          
          {/* Right Content - Clean Workflow */}
          <div className="right-content">
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-slate-200/50">
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-2xl font-semibold text-slate-800 mb-4">ResearStudio Architecture</h3>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto bg-blue-100 rounded-2xl flex items-center justify-center mb-2">
                      <span className="text-blue-600 text-lg">👤</span>
                    </div>
                    <div className="text-sm font-medium text-slate-700">You</div>
                  </div>
                  
                  <div className="flex-1 mx-4">
                    <div className="h-0.5 bg-slate-300 relative">
                      <div className="absolute right-0 top-1/2 transform -translate-y-1/2">
                        <ArrowRight className="w-4 h-4 text-slate-400" />
                      </div>
                  </div>
              </div>

                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto bg-purple-100 rounded-2xl flex items-center justify-center mb-2">
                      <span className="text-purple-600 text-lg">🧠</span>
                    </div>
                    <div className="text-sm font-medium text-slate-700">Planner</div>
                  </div>
                  
                  <div className="flex-1 mx-4">
                    <div className="h-0.5 bg-slate-300 relative">
                      <div className="absolute right-0 top-1/2 transform -translate-y-1/2">
                        <ArrowRight className="w-4 h-4 text-slate-400" />
                      </div>
                  </div>
              </div>
              
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto bg-green-100 rounded-2xl flex items-center justify-center mb-2">
                      <span className="text-green-600 text-lg">⚡</span>
                    </div>
                    <div className="text-sm font-medium text-slate-700">Executor</div>
                              </div>
                </div>
                
                <div className="bg-slate-50 rounded-2xl p-4">
                  <div className="text-xs font-mono space-y-1 text-slate-600">
                    <div>📋 Plan: Analyze GDP trends</div>
                    <div>🔍 Step 1: Search for GDP data</div>
                    <div>📊 Step 2: Create visualizations</div>
                    <div>📝 Step 3: Generate report</div>
                    <div className="text-green-600">✅ All steps transparent & modifiable</div>
                  </div>
                      </div>
                  </div>
              </div>
          </div>
        </div>
      </section>

      {/* Chapter 3: Real-time Collaboration */}
      <section className="chapter-section min-h-screen flex items-center py-24 px-8 relative">
        {/* Chinese Character Background */}
        <div className="chinese-character absolute right-24 top-1/2 transform -translate-y-1/2 text-[20rem] font-calligraphy text-slate-800/8 select-none pointer-events-none leading-none">
          合
        </div>
        
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div className="left-content space-y-8">
            <div className="space-y-6">
              <h2 className="text-5xl font-light text-slate-800 font-serif">
                Your AI Partner, Not Just a Tool
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed">
                Experience true human-AI collaboration. Intervene, guide, and refine 
                the process in real-time.
                  </p>
              </div>
              
            <div className="space-y-4">
              <h3 className="text-2xl font-medium text-slate-700">Collaboration Features:</h3>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Live activity monitoring with detailed logs</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Direct file editing during execution</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Instant task modification and redirection</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Pause, review, and resume capabilities</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Content - Collaboration Demo */}
          <div className="right-content">
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-2xl border border-slate-200/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-96">
                {/* AI Activity Log */}
                <div className="bg-slate-50 rounded-2xl p-4">
                  <h4 className="font-semibold text-slate-700 mb-3 text-sm">AI Activity Log</h4>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="text-slate-600">🧠 Planner: Analyzing request...</div>
                    <div className="text-slate-600">📝 Planner: Creating TODO list...</div>
                    <div className="text-slate-600">⚡ Executor: Starting data collection...</div>
                    <div className="text-blue-600 font-medium">👤 Human: Modified requirements</div>
                    <div className="text-green-600">🔄 Planner: Updated strategy...</div>
                    <div className="text-slate-600">⚡ Executor: Resuming with new plan...</div>
                      </div>
                  </div>

                {/* TODO File Editor */}
                <div className="bg-slate-50 rounded-2xl p-4">
                  <h4 className="font-semibold text-slate-700 mb-3 text-sm">TODO.md (Live Edit)</h4>
                  <div className="space-y-1 text-xs font-mono">
                    <div className="text-slate-600">## Research Tasks</div>
                    <div className="text-slate-600">□ Gather historical GDP data</div>
                    <div className="bg-yellow-200 px-1 text-slate-800">□ Focus on last 20 years ← edited</div>
                    <div className="text-slate-600">□ Create visualizations</div>
                    <div className="text-slate-600">□ Generate analysis report</div>
                    <div className="text-green-600 mt-4">✨ Changes auto-sync with AI</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Chapter 4: Performance & Results */}
      <section className="chapter-section min-h-screen flex items-center py-24 px-8 relative">
        {/* Chinese Character Background */}
        <div className="chinese-character absolute right-24 top-1/2 transform -translate-y-1/2 text-[20rem] font-calligraphy text-slate-800/8 select-none pointer-events-none leading-none">
          果
                      </div>
        
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div className="left-content space-y-8">
            <div className="space-y-6">
              <h2 className="text-5xl font-light text-slate-800 font-serif">
                Proven Excellence
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed">
                Industry-leading performance with the transparency you need. 
                ResearStudio outperforms traditional agents while keeping you in control.
              </p>
                  </div>

            <div className="space-y-4">
                              <h3 className="text-2xl font-medium text-slate-700">Why Teams Choose ResearStudio:</h3>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span>70.91% success rate on GAIA benchmark</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span>Complete visibility into AI decision-making</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span>Real-time collaboration capabilities</span>
                </li>
                <li className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span>Extensible toolbox for any domain</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Content - Performance Chart */}
          <div className="right-content">
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-slate-200/50">
              <h3 className="text-2xl font-semibold text-slate-800 mb-6 text-center">
                GAIA Benchmark Results
              </h3>
              <div className="space-y-6">
                {[
                  { name: "ODR-smolagents", score: 55.15, color: "bg-slate-400" },
                  { name: "AutoAgent", score: 55.15, color: "bg-slate-400" },
                  { name: "OWL", score: 69.09, color: "bg-slate-400" },
                  { name: "A-World", score: 69.70, color: "bg-slate-400" },
                  { name: "OpenAI-DeepResearch", score: 67.36, color: "bg-slate-400" },
                  { name: "ResearStudio", score: 70.91, color: "bg-gradient-to-r from-slate-600 to-slate-800", highlight: true }
                ].map((item) => (
                  <div key={item.name} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">{item.name}</span>
                      <span className="text-sm font-bold text-slate-800">{item.score}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div 
                        className={`performance-bar h-full rounded-full transition-all duration-500 ${item.color} ${item.highlight ? 'shadow-lg' : ''}`}
                        data-width={`${item.score}%`}
                        style={{ width: '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 text-center">
                <p className="text-sm text-slate-500">
                  *GAIA: General AI Assistant benchmark
                </p>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* Interactive Demo Showcase */}
      <section id="preview-section" className="chapter-section min-h-screen flex items-center py-24 px-8 relative">
        {/* Chinese Character Background */}
        <div className="chinese-character absolute right-24 top-1/2 transform -translate-y-1/2 text-[20rem] font-calligraphy text-slate-800/8 select-none pointer-events-none leading-none">
          演
        </div>
        
        <div className="w-full max-w-7xl mx-auto">
          {/* Floating particles background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-400/30 rounded-full animate-pulse"></div>
            <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-purple-400/40 rounded-full animate-bounce" style={{ animationDelay: '1s' }}></div>
            <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 bg-green-400/35 rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
            <div className="absolute top-1/2 right-1/4 w-1 h-1 bg-pink-400/30 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }}></div>
            <div className="absolute bottom-1/3 right-1/2 w-2 h-2 bg-teal-400/25 rounded-full animate-pulse" style={{ animationDelay: '3s' }}></div>
          </div>

          <div className="text-center mb-16 relative">
            <div className="inline-block relative">
              <h2 className="text-5xl font-light text-slate-800 mb-8 font-serif relative z-10">
                Live Demo Showcase
              </h2>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 blur-3xl rounded-full transform scale-150"></div>
            </div>
            <p className="text-xl text-slate-600 leading-relaxed max-w-3xl mx-auto">
              Experience ResearStudio's capabilities with these real-world examples. 
              Each demo showcases different aspects of our collaborative AI workshop.
            </p>
          </div>

          {/* Demo Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Demo 1: Research Analysis */}
            <div className="demo-card group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-200/30 via-stone-200/30 to-slate-200/30 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
              <div className="relative bg-gradient-to-br from-white/95 to-stone-50/95 backdrop-blur-sm border border-stone-200/60 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 cursor-pointer"
                   onClick={() => router.push('/dashboard?taskId=042f5942-560b-4273-a943-b572b796bd30&prompt=Which%20contributor%20to%20the%20version%20of%20OpenCV%20where%20support%20was%20added%20for%20the%20Mask-RCNN%20model%20has%20the%20same%20name%20as%20a%20former%20Chinese%20head%20of%20government%20when%20the%20names%20are%20transliterated%20to%20the%20Latin%20alphabet%3F')}>
                <div className="space-y-6">
                  {/* Category Badge */}
                  <div className="inline-flex items-center px-3 py-1 bg-amber-100/80 text-amber-800 text-xs font-medium rounded-full">
                    Research & Analysis
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-3 group-hover:text-slate-900 transition-colors">
                      Cross-Cultural Tech Research
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                      Combining technical documentation analysis with historical cross-cultural name matching to solve complex research puzzles.
                    </p>
                  </div>

                  <div className="bg-stone-100/60 rounded-xl p-4 border border-stone-200/40">
                    <p className="text-xs text-slate-700 leading-relaxed italic">
                      "Which OpenCV contributor shares a name with a former Chinese head of government when transliterated to Latin alphabet?"
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500 font-medium">Interactive Demo</span>
                    <div className="flex items-center gap-2 text-amber-700 font-medium text-sm group-hover:text-amber-800 transition-colors">
                      <span>Explore</span>
                      <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Demo 2: Mathematical Problem Solving */}
            <div className="demo-card group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-200/30 via-teal-200/30 to-slate-200/30 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
              <div className="relative bg-gradient-to-br from-white/95 to-emerald-50/95 backdrop-blur-sm border border-emerald-200/60 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 cursor-pointer"
                   onClick={() => router.push('/dashboard?taskId=e02b37a5-d764-41d5-b264-2bdfea64cbef&prompt=The%20following%20numbers%20function%20similarly%20to%20ISBN%2013%20numbers,%20however,%20their%20validation%20methods%20are%20slightly%20different.%20Rather%20than%20using%20alternate%20weights%20of%201%20and%203,%20the%20checksum%20digit%20is%20calculated%20with%20an%20alternate%20weight%20of%201%20and%20some%20other%20positive%20integer%20less%20than%2010.%20Otherwise,%20the%20checksum%20digit%20is%20calculated%20as%20expected.%20Unfortunately,%20there%20is%20an%20error%20in%20the%20data.%20Two%20adjacent%20columns%20have%20been%20transposed.%20These%20errored%20columns%20do%20not%20involve%20the%20final%20column%20or%20one%20of%20the%20first%20three%20columns.%20Using%20this%20information,%20please%20provide%20all%20potential%20solutions%20with%20the%20unknown%20weight%20and%20the%20smaller%20index%20of%20the%20two%20errored%20columns%20(assume%20we%20start%20our%20indexing%20at%200%20and%20ignore%20hyphens).%20Give%20your%20answer%20in%20the%20form%20x,%20y%20where%20x%20is%20the%20weight%20and%20y%20is%20the%20smaller%20index%20of%20the%20two%20transposed%20columns.\n\n978-354181391-9\n978-946669746-1\n978-398036139-6\n978-447656680-4\n978-279586664-7\n978-595073693-3\n978-976647652-6\n978-591178125-5\n978-728465924-5\n978-414825155-9')}>
                <div className="space-y-6">
                  {/* Category Badge */}
                  <div className="inline-flex items-center px-3 py-1 bg-emerald-100/80 text-emerald-800 text-xs font-medium rounded-full">
                    Mathematical Analysis
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-3 group-hover:text-slate-900 transition-colors">
                      Algorithm & Pattern Detection
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                      Complex algorithmic problem solving with pattern recognition and error detection in numerical data sequences.
                    </p>
                  </div>

                  <div className="bg-emerald-100/60 rounded-xl p-4 border border-emerald-200/40">
                    <p className="text-xs text-slate-700 leading-relaxed italic">
                      "Analyze ISBN-like numbers with custom validation rules and detect transposed digit errors..."
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500 font-medium">Interactive Demo</span>
                    <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm group-hover:text-emerald-800 transition-colors">
                      <span>Explore</span>
                      <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Demo 3: Historical Data Research */}
            <div className="demo-card group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-200/30 via-purple-200/30 to-slate-200/30 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-700"></div>
              <div className="relative bg-gradient-to-br from-white/95 to-violet-50/95 backdrop-blur-sm border border-violet-200/60 rounded-3xl p-8 shadow-lg hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 cursor-pointer"
                   onClick={() => router.push('/dashboard?taskId=fd7acaff-5ed5-4b5a-9e7a-991af6c99b50&prompt=All%20of%20the%20individuals%20who%20formally%20held%20the%20position%20of%20United%20States%20secretary%20of%20homeland%20security%20prior%20to%20April%202019%2C%20excluding%20those%20who%20held%20the%20position%20in%20an%20acting%20capacity%2C%20have%20a%20bachelor%27s%20degree.%20Of%20the%20universities%20that%20these%20bachelor%27s%20degrees%20were%20from%2C%20which%20is%20the%20westernmost%20university%20and%20which%20is%20the%20easternmost%20university%3F%20Give%20them%20to%20me%20as%20a%20comma-separated%20list%2C%20I%20only%20want%20the%20name%20of%20the%20cities%20where%20the%20universities%20are%20located%2C%20with%20the%20westernmost%20city%20listed%20first.')}>
                <div className="space-y-6">
                  {/* Category Badge */}
                  <div className="inline-flex items-center px-3 py-1 bg-violet-100/80 text-violet-800 text-xs font-medium rounded-full">
                    Political Research
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-3 group-hover:text-slate-900 transition-colors">
                      Geographic Data Analysis
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                      Government official background research with geographic analysis and educational institution mapping.
                    </p>
                  </div>

                  <div className="bg-violet-100/60 rounded-xl p-4 border border-violet-200/40">
                    <p className="text-xs text-slate-700 leading-relaxed italic">
                      "Find westernmost and easternmost universities of US Homeland Security secretaries' bachelor's degrees..."
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500 font-medium">Interactive Demo</span>
                    <div className="flex items-center gap-2 text-violet-700 font-medium text-sm group-hover:text-violet-800 transition-colors">
                      <span>Explore</span>
                      <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Additional CTA */}
          <div className="text-center mt-16">
            <p className="text-lg text-slate-600 mb-6">
              Ready to create your own research quest?
            </p>
            <button 
              onClick={() => {
                const heroSection = document.getElementById('hero-section')
                heroSection?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl transition-all duration-300 text-sm font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-1"
            >
              <ArrowUp className="h-4 w-4" />
              <span>Start Your Quest</span>
            </button>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="chapter-section min-h-screen flex items-center py-24 px-8 relative">
        {/* Chinese Character Background */}
        <div className="chinese-character absolute right-24 top-1/2 transform -translate-y-1/2 text-[20rem] font-calligraphy text-slate-800/8 select-none pointer-events-none leading-none">
          始
        </div>
        
        <div className="w-full max-w-4xl mx-auto text-center">
          <div className="left-content space-y-8">
            <h2 className="text-6xl font-light text-slate-800 mb-8 font-serif">
              Start Your Workshop
            </h2>
            <p className="text-xl text-slate-600 mb-12 leading-relaxed max-w-3xl mx-auto">
                              From ambitious startups to global enterprises, ResearStudio helps world-class teams 
              iterate quickly and deliver with confidence. Experience the future of human-AI collaboration.
            </p>
            <Button 
                size="lg" 
              className="bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-slate-950 text-white px-12 py-4 rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-2 hover:scale-105 transition-all duration-300 text-lg font-medium"
                onClick={() => {
                  const heroSection = document.getElementById('hero-section')
                  heroSection?.scrollIntoView({ behavior: 'smooth' })
                }}
            >
                                Try ResearStudio Now
              <ArrowRight className="ml-3 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
