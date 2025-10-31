"use client"

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Terminal, FileText, FolderTree, ChevronRight, ChevronDown, File, Folder, Info, X, Plus, ArrowLeft, ArrowRight, Save, RotateCcw, Eye, EyeOff, ChevronLeft, Download, Play, Pause, CheckCircle2, XCircle, Edit, AlertCircle, Search, Globe, FileSpreadsheet, Presentation as PresentationIcon } from "lucide-react"
import { FileStructureNode, apiService, getCurrentApiBaseUrl, normalizeFileMetadata } from "@/lib/api"
import { ScrollArea } from '@/components/ui/scroll-area'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { appendCacheBusterForPng, normalizeFilename } from '@/lib/utils'

// 添加CSS样式
const scrollbarStyles = `
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #94a3b8 transparent;
  }
  
  .scrollbar-thin::-webkit-scrollbar {
    height: 4px;
    width: 4px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #94a3b8;
    border-radius: 2px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }
  
  .scrollbar-hide {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
`

// 注入样式
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style')
  styleElement.textContent = scrollbarStyles
  if (!document.head.querySelector('style[data-component="computer-view"]')) {
    styleElement.setAttribute('data-component', 'computer-view')
    document.head.appendChild(styleElement)
  }
}

// 🆕 URL处理工具函数 - 自动转换相对API路径
const convertApiUrl = (url: string): string => {
  if (!url) return url;
  
  // 检查是否是相对API路径（以 /api/ 开头）
  if (url.startsWith('/api/')) {
    const apiBaseUrl = getCurrentApiBaseUrl();
    // 移除 /api/ 前缀并拼接到API基础URL
    const relativePath = url.substring(4); // 移除 '/api'
    const fullUrl = `${apiBaseUrl}${relativePath}`;
    console.log(`🔗 Converting relative API URL: ${url} -> ${fullUrl}`);
    return fullUrl;
  }
  
  // 如果不是相对API路径，直接返回原URL
  return url;
};

// 动态导入 Prism.js 以避免服务器端渲染问题
let Prism: any;
if (typeof window !== 'undefined') {
  try {
    Prism = require('prismjs');
    require('prismjs/components/prism-python');
    require('prismjs/components/prism-javascript');
    require('prismjs/components/prism-typescript');
    require('prismjs/components/prism-css');
    require('prismjs/components/prism-json');
    require('prismjs/themes/prism-tomorrow.css');
  } catch (e) {
    console.warn('Prism.js not available');
  }
}

// 简单的语法高亮组件
const PythonSyntaxHighlighter = ({ children, showLineNumbers = true }: { children: string; showLineNumbers?: boolean }) => {
  const [highlightedCode, setHighlightedCode] = useState(children);

  useEffect(() => {
    if (typeof window !== 'undefined' && Prism && Prism.languages.python) {
      try {
        const highlighted = Prism.highlight(children, Prism.languages.python, 'python');
        setHighlightedCode(highlighted);
      } catch (error) {
        console.warn('Failed to highlight Python code:', error);
        setHighlightedCode(children);
      }
    }
  }, [children]);

  const lines = highlightedCode.split('\n');

  return (
    <div className="bg-gray-900 text-white text-sm font-mono overflow-auto">
      <pre className="p-4">
        <code>
          {showLineNumbers ? (
            lines.map((line, index) => (
              <div key={index} className="flex">
                <span className="select-none text-gray-500 text-right pr-4 w-8 flex-shrink-0">
                  {index + 1}
                </span>
                <span dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} />
              </div>
            ))
          ) : (
            <span dangerouslySetInnerHTML={{ __html: highlightedCode }} />
          )}
        </code>
      </pre>
    </div>
  );
};

// 简单的内置Markdown渲染器
const MarkdownRenderer = ({ children, taskId }: { children: string; taskId?: string }) => {
  const convertSimpleMarkdown = (text: string) => {
    return text
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mb-2 break-words">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mb-3 break-words">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mb-4 break-words">$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<strong class="font-semibold break-words">$1</strong>')
      .replace(/\*(.*)\*/gim, '<em class="italic break-words">$1</em>')
      .replace(/`([^`]*)`/gim, '<code class="bg-slate-100 px-1 py-0.5 rounded text-sm font-mono break-all">$1</code>')
      .replace(/```([^`]*)```/gim, '<pre class="bg-slate-100 p-3 rounded-lg overflow-x-auto mb-4 max-w-full"><code class="text-sm font-mono block whitespace-pre-wrap break-words">$1</code></pre>')
      // 🆕 图片需要特殊处理，在链接之前处理
      .replace(/!\[([^\]]*)\]\(([^\)]*)\)/gim, (match, alt, src) => {
        // 图片处理将在预处理步骤完成
        return `<img src="${src}" alt="${alt}" class="max-w-full h-auto rounded-lg shadow-sm my-4" />`;
      })
      .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline break-all">$1</a>')
      .replace(/^\* (.+)$/gim, '<li class="ml-4 break-words">$1</li>')
      .replace(/(<li.*?<\/li>(\s*<li.*?<\/li>)*)/g, '<ul class="mb-3">$1</ul>')
      .replace(/\n/gim, '<br>');
  };

  const pngCacheBuster = useMemo(() => Date.now().toString(), [children, taskId]);

  const htmlContent = useMemo(() => {
    // 🆕 增强的预处理：处理图片和文件链接
    let preProcessedContent = children || '';
    const apiBaseUrl = getCurrentApiBaseUrl();

    const applyNoCache = (inputUrl: string) => appendCacheBusterForPng(inputUrl, pngCacheBuster);

    // 1. 处理图片链接 ![alt](path)
    preProcessedContent = preProcessedContent.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, (match, alt, imagePath) => {
      console.log('🖼️  Processing markdown image:', { imagePath, taskId });

      // 如果是绝对HTTP/HTTPS URL
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        const updatedUrl = applyNoCache(imagePath);
        console.log('✅ Image is absolute URL, applying cache bust if needed:', updatedUrl);
        return `![${alt}](${updatedUrl})`;
      }

      // 处理 /files/ 路径
      if (imagePath.startsWith('/files/')) {
        const fileBaseUrl = apiBaseUrl.replace('/api', '');
        const fullUrl = `${fileBaseUrl}${imagePath}`;
        const updatedUrl = applyNoCache(fullUrl);
        console.log(`🔗 Converting /files/ image path: ${imagePath} -> ${updatedUrl}`);
        return `![${alt}](${updatedUrl})`;
      }

      // 处理相对路径（如 ./image.png 或 image.png）和任务文件路径
      // 清理路径：移除前导的 ./ 和 /
      const cleanPath = imagePath.replace(/^\.\//, '').replace(/^\//, '');

      if (!taskId) {
        console.warn('⚠️  No taskId provided, cannot convert relative image path:', imagePath);
        // 没有 taskId，尝试构建一个通用的 /api/files/ URL（如果后端支持）
        // 或者返回一个占位图
        return `![${alt}](data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="%23f0f0f0"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999">Image: ${cleanPath} (No Task ID)</text></svg>)`;
      }

      const fullUrl = `${apiBaseUrl}/tasks/${taskId}/files/${encodeURIComponent(cleanPath)}`;
      const updatedUrl = applyNoCache(fullUrl);
      console.log(`🔗 Converting relative image path: ${imagePath} -> ${updatedUrl}`);
      return `![${alt}](${updatedUrl})`;
    });

    // 2. 处理普通文件链接 [text](path)
    preProcessedContent = preProcessedContent.replace(/\[([^\]]*)\]\(([^\)]+)\)/g, (match, text, linkPath) => {
      // 如果是绝对HTTP/HTTPS URL、锚点或 mailto，保持不变
      if (linkPath.startsWith('http://') || linkPath.startsWith('https://') ||
          linkPath.startsWith('#') || linkPath.startsWith('mailto:')) {
        return match;
      }

      // 如果是 /files/ 路径
      if (linkPath.startsWith('/files/')) {
        const fileBaseUrl = apiBaseUrl.replace('/api', '');
        const fullUrl = `${fileBaseUrl}${linkPath}`;
        console.log(`🔗 Converting /files/ link: ${linkPath} -> ${fullUrl}`);
        return `[${text}](${fullUrl})`;
      }

      // 处理相对路径文件链接
      const cleanPath = linkPath.replace(/^\.\//, '').replace(/^\//, '');

      if (!taskId) {
        console.warn('⚠️  No taskId provided, cannot convert relative file link:', linkPath);
        // 返回一个禁用的链接
        return `[${text}](#no-task-id)`;
      }

      const fullUrl = `${apiBaseUrl}/tasks/${taskId}/files/${encodeURIComponent(cleanPath)}`;
      console.log(`🔗 Converting relative link: ${linkPath} -> ${fullUrl}`);
      return `[${text}](${fullUrl})`;
    });

    return convertSimpleMarkdown(preProcessedContent);
  }, [children, taskId, pngCacheBuster]);

  return (
    <div
      className="text-slate-800 leading-relaxed max-w-none prose prose-slate overflow-y-auto overflow-x-hidden h-full p-4 min-w-0"
      style={{
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
        maxWidth: '100%'
      }}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};

// 🆕 简化的路径工具
class PathUtils {
  static normalizePath(path: string): string {
    if (!path) return '';
    return path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  }
  
  static isSamePath(path1: string, path2: string): boolean {
    const normalized1 = this.normalizePath(path1);
    const normalized2 = this.normalizePath(path2);
    return normalized1 === normalized2;
  }
  
  static fromTreePath(treePath: string, parentPath: string = ''): string {
    if (!treePath) return '';
    
    // If the path is the root, return it.
    if (treePath === '/' && !parentPath) {
      return '/';
    }
    
    // If the parent is root, create an absolute path.
    if (parentPath === '/') {
      return `/${treePath}`;
    }
    
    // For any other directory, join the parts.
    if (parentPath) {
      return `${parentPath}/${treePath}`;
    }
    
    // Otherwise, it's a top-level item.
      return treePath;
  }
  
  static getFileName(path: string): string {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1];
  }
  
  static getParentPath(path: string): string {
    if (!path || path === '/') return '/';
    const lastSlash = path.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : path.substring(0, lastSlash);
  }
}

const shouldRewriteAssetUrl = (url?: string): boolean => {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(https?:|data:|blob:|javascript:|mailto:)/i.test(trimmed)) return false;
  if (trimmed.startsWith('//')) return false;
  return true;
};

// 🆕 检查文件是否为需要重写路径的资源文件
const isAssetFile = (path: string): boolean => {
  if (!path) return false;
  const lowerPath = path.toLowerCase();

  // 支持的资源文件扩展名
  const assetExtensions = [
    // 图片格式
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
    // 视频格式
    '.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv',
    // 音频格式
    '.mp3', '.wav', '.ogg', '.m4a', '.aac',
    // 文档格式
    '.pdf',
    // 数据文件
    '.csv', '.json', '.xml',
    // 其他常见资源
    '.txt', '.md'
  ];

  return assetExtensions.some(ext => lowerPath.endsWith(ext));
};

const applyCacheBusterIfNeeded = (url: string, cacheKey: number | string) => {
  try {
    const base = url.split('?')[0].toLowerCase();
    // 🆕 为所有图片格式添加缓存破坏参数，不仅仅是PNG
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'];
    const isImage = imageExtensions.some(ext => base.endsWith(ext));

    if (isImage) {
      return appendCacheBusterForPng(url, cacheKey);
    }
  } catch (error) {
    console.warn('Failed to apply cache buster:', error);
  }
  return url;
};

const buildTaskAssetUrl = (rawUrl: string, taskId?: string, cacheKey: number | string = Date.now()): string => {
  if (!shouldRewriteAssetUrl(rawUrl)) {
    return rawUrl;
  }

  const trimmed = rawUrl.trim();
  const [urlWithoutFragment, fragment] = trimmed.split('#', 2);
  const [pathPart, query] = urlWithoutFragment.split('?', 2);
  const normalizedPath = normalizeFilename(pathPart || '');

  if (!normalizedPath) {
    return trimmed;
  }

  // 🆕 使用新的 isAssetFile 函数检查是否为资源文件，而不是只检查 PNG
  if (!isAssetFile(normalizedPath)) {
    console.log(`🔍 Skipping non-asset file: ${normalizedPath}`);
    return trimmed;
  }

  const encodedPath = normalizedPath
    .split('/')
    .filter(segment => segment.length > 0)
    .map(segment => encodeURIComponent(segment))
    .join('/');

  const baseApi = getCurrentApiBaseUrl();
  const encodedTaskId = taskId ? encodeURIComponent(taskId) : '';
  let finalUrl = taskId
    ? `${baseApi}/tasks/${encodedTaskId}/files/${encodedPath}`
    : `${baseApi}/files/${encodedPath}`;

  if (query) {
    finalUrl += `?${query}`;
  }

  finalUrl = applyCacheBusterIfNeeded(finalUrl, cacheKey);

  if (fragment) {
    finalUrl += `#${fragment}`;
  }

  console.log(`🔗 Rewrote asset URL: ${rawUrl} -> ${finalUrl}`);
  return finalUrl;
};

const rewriteHtmlAssetUrls = (
  html: string,
  taskId?: string,
  options: { bodyOnly?: boolean; cacheKey?: number | string } = {}
): string => {
  if (!html) {
    return html;
  }

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const cacheKey = options.cacheKey ?? Date.now();

    const rewriteAttribute = (element: Element, attribute: string) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const rewritten = buildTaskAssetUrl(value, taskId, cacheKey);
      if (rewritten !== value) {
        element.setAttribute(attribute, rewritten);
      }
    };

    const rewriteSrcSet = (element: Element, attribute: string) => {
      const srcSet = element.getAttribute(attribute);
      if (!srcSet) return;
      const rewritten = srcSet
        .split(',')
        .map(entry => {
          const trimmed = entry.trim();
          if (!trimmed) return trimmed;
          const parts = trimmed.split(/\s+/);
          const urlPart = parts[0];
          const descriptor = parts.slice(1).join(' ');
          const rewrittenUrl = buildTaskAssetUrl(urlPart, taskId, cacheKey);
          return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl;
        })
        .join(', ');
      element.setAttribute(attribute, rewritten);
    };

    const elementsWithSrc = doc.querySelectorAll('img, source, video, audio');
    elementsWithSrc.forEach(element => {
      rewriteAttribute(element, 'src');
      rewriteSrcSet(element, 'srcset');
    });

    const ensureResponsiveStyle = () => {
      const styleId = '__researstudio_html_asset_style__';
      if (!doc.head) {
        const head = doc.createElement('head');
        doc.documentElement?.insertBefore(head, doc.body || null);
      }
      if (doc.head && !doc.head.querySelector(`#${styleId}`)) {
        const styleElement = doc.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = `
          :root, html, body {
            max-width: 100%;
            width: 100%;
            box-sizing: border-box;
            overflow-x: hidden;
          }
          img, video, canvas, iframe, object {
            max-width: 100%;
            height: auto;
          }
          figure {
            max-width: 100%;
          }
        `;
        doc.head.appendChild(styleElement);
      }
    };

    ensureResponsiveStyle();

    if (options.bodyOnly) {
      return doc.body ? doc.body.innerHTML : html;
    }

    if (doc.documentElement) {
      return doc.documentElement.outerHTML;
    }

    return doc.body ? doc.body.innerHTML : html;
  } catch (error) {
    console.warn('Failed to rewrite HTML asset URLs:', error);
    return html;
  }
};

// 🆕 搜索结果接口
interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

// 文件状态接口定义
interface FileState {
  id: string
  filename: string
  content: string
  originalContent: string
  isDirty: boolean
  isLoading: boolean
  lastSaved: number
  fileType: 'text' | 'image' | 'video' | 'pdf' | 'markdown' | 'html' | 'folder' | 'audio' | 'csv' | 'spreadsheet' | 'document' | 'presentation' | 'python'
  isUrl?: boolean
  isEditable?: boolean
  contentMode?: 'text' | 'url'
}

// 🆕 简化的文件系统管理器 - 扁平化结构
class FileSystemManager {
    private files: Map<string, FileState> = new Map()
  private openTabs: string[] = []
  private activeTab: string | null = null
  private listeners: Set<() => void> = new Set()
  private silentMode: boolean = false // 🚨 新增：静默模式，避免编辑时通知

  // 虚拟文件结构 - 扁平化根目录
  private virtualFileStructure: FileStructureNode = {
    name: '/',
    type: 'directory',
    children: []
  }
  
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    if (!this.silentMode) {
      this.listeners.forEach(listener => listener())
    }
  }

  // 🆕 新增公开的notify方法，用于外部触发UI更新
  notifyListeners() {
    this.notify()
  }

  // 🚨 新增：设置静默模式
  setSilentMode(silent: boolean) {
    this.silentMode = silent
  }

  // 🚨 新增：强制通知（忽略静默模式）
  forceNotify() {
    this.listeners.forEach(listener => listener())
  }

  // 🆕 新增：恢复文件到原始状态
  revertFile(rawFilename: string): boolean {
    const filename = normalizeFilename(rawFilename);
    const file = this.files.get(filename);
    if (file && file.isEditable) {
      file.content = file.originalContent;
      file.isDirty = false;
      // 强制通知，忽略静默模式
      this.forceNotify();
      return true;
    }
    return false;
  }

  getVirtualFileStructure(): FileStructureNode {
    return this.virtualFileStructure
  }

  getFile(rawFilename: string): FileState | undefined {
    if (!rawFilename) return undefined;
    const filename = normalizeFilename(rawFilename);
    return this.files.get(filename)
  }

  getOpenTabs(): FileState[] {
    return this.openTabs.map(filename => this.files.get(filename)!).filter(Boolean)
  }

  getActiveFile(): FileState | null {
    return this.activeTab ? this.files.get(this.activeTab) || null : null
  }

  openFile(rawFilename: string, content: string = '', fileType?: string, metaData?: Partial<FileState>): FileState {
    const filename = normalizeFilename(rawFilename);
    const id = `file-${filename}-${Date.now()}`

      if (!this.files.has(filename)) {
        const file: FileState = {
          id,
          filename,
          content,
        originalContent: content,
        isDirty: false,
        isLoading: false,
        lastSaved: Date.now(),
        fileType: fileType ? fileType as FileState['fileType'] : this.detectFileType(filename),
        isUrl: metaData?.isUrl || false,
        isEditable: metaData?.isEditable !== undefined ? metaData.isEditable : true,
        contentMode: metaData?.contentMode || 'text'
      }
      this.files.set(filename, file)

      // 🆕 检查是否是特殊文件(.jsonsearch 或 Web.html)
      const isSpecialFile = filename.endsWith('.jsonsearch') || filename === 'Web.html'
      console.log(`📁 File "${filename}" is special file: ${isSpecialFile}`);

      // 🆕 特殊文件不添加到标签页中，但仍然保存在文件系统中供处理使用
      if (!isSpecialFile && !this.openTabs.includes(filename)) {
        this.openTabs.push(filename)
      }
      } else {
        // 🆕 文件已存在：只有在文件未被编辑时才更新内容
        const existingFile = this.files.get(filename)!

        if (!existingFile.isDirty) {
          // 文件没有未保存的更改，可以安全更新
          console.log(`📝 Updating clean file: ${filename}`)
          existingFile.content = content
          existingFile.originalContent = content
          existingFile.lastSaved = Date.now()
        } else {
          // 文件有未保存的更改，不覆盖用户的编辑
          console.warn(`🔒 File has unsaved changes, not updating: ${filename}`)
        }
        if (metaData) {
        Object.assign(existingFile, metaData)
      }
    }

    this.notify()
    return this.files.get(filename)!
  }

  closeFile(rawFilename: string): boolean {
    const filename = normalizeFilename(rawFilename);
    const index = this.openTabs.indexOf(filename)
    if (index === -1) return false

    this.openTabs.splice(index, 1)

    if (this.activeTab === filename) {
      if (this.openTabs.length > 0) {
        const newIndex = Math.min(index, this.openTabs.length - 1)
        this.activeTab = this.openTabs[newIndex]
      } else {
        this.activeTab = null
      }
    }

    this.notify()
    return true
  }

  setActiveTab(rawFilename: string) {
    const filename = normalizeFilename(rawFilename);
    const existingFile = this.files.get(filename)
    if (existingFile) {
      this.activeTab = filename
      this.notify()
    } else {
      console.log(`⚠️ Attempted to set active tab for file not in open tabs: ${filename}`)
    }
  }

  updateFileContent(rawFilename: string, content: string) {
    const filename = normalizeFilename(rawFilename);
    const file = this.files.get(filename)
    if (file) {
      file.content = content
      file.isDirty = content !== file.originalContent;
      this.notify()
    }
  }

  saveFile(rawFilename: string) {
    const filename = normalizeFilename(rawFilename);
    const file = this.files.get(filename)
    if (file) {
      file.originalContent = file.content
      file.isDirty = false
      file.lastSaved = Date.now()
      this.notify()
      return file.content
    }
    return null
  }

  detectFileType(filename: string): FileState['fileType'] {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (!ext) return 'text'
    
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext)) return 'image'
    if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'].includes(ext)) return 'video'
    if (ext === 'pdf') return 'pdf'
    if (ext === 'html') return 'html'
    if (ext === 'md') return 'markdown'
    if (ext === 'py') return 'python'
    if (['mp3', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) return 'audio'
    if (ext === 'csv') return 'csv'
    if (['xls', 'xlsx'].includes(ext)) return 'spreadsheet'
    if (['doc', 'docx'].includes(ext)) return 'document'
    if (['ppt', 'pptx'].includes(ext)) return 'presentation'
    
    return 'text'
  }

  // 🆕 合并外部文件结构 - 支持层级，过滤特殊文件
  // 🆕 添加单个文件或文件夹到虚拟文件结构
  addFileToVirtualStructure(path: string, isDirectory: boolean = false): void {
    const insertNode = (filePath: string, root: FileStructureNode) => {
      const parts = filePath.split('/').filter(p => p);
      let currentNode = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;

        // 过滤特殊文件
        const isSpecialFile = part.endsWith('.jsonsearch') || part === 'Web.html';
        if (isSpecialFile) {
          return;
        }

        let childNode = currentNode.children?.find(child => child.name === part);

        if (childNode) {
          // 节点已存在
          if (isLastPart && childNode.type === 'directory') {
            console.warn(`Path conflict: ${filePath} is a file, but was already a directory.`);
          }
          currentNode = childNode;
        } else {
          // 创建新节点
          if (!currentNode.children) {
            currentNode.children = [];
          }
          
          if (isLastPart) {
            // 根据参数决定是文件还是文件夹
            if (isDirectory) {
              childNode = { name: part, type: 'directory', children: [] };
            } else {
              childNode = { name: part, type: 'file' };
            }
            currentNode.children.push(childNode);
          } else {
            // It's a directory
            childNode = { name: part, type: 'directory', children: [] };
            currentNode.children.push(childNode);
            currentNode = childNode;
          }
        }
      }
    };

    insertNode(path, this.virtualFileStructure);
    
    // Sort children after adding new file
    const sortChildren = (node: FileStructureNode) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type === 'directory' && b.type === 'file') return -1;
          if (a.type === 'file' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortChildren);
      }
    };

    sortChildren(this.virtualFileStructure);
    
    // 通知组件重新渲染
    this.notify();
  }

  mergeExternalFileStructure(externalFilePaths: string[]): void {
    console.log('Merging external file structure with paths:', externalFilePaths);
    
    const root: FileStructureNode = { name: '/', type: 'directory', children: [] };

    const insertNode = (path: string) => {
      const parts = path.split('/').filter(p => p);
      let currentNode = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;

        // 过滤特殊文件
        const isSpecialFile = part.endsWith('.jsonsearch') || part === 'Web.html';
        if (isSpecialFile) {
          console.log(`🚫 Filtering out special file from explorer: ${path}`);
          return;
        }

        let childNode = currentNode.children?.find(child => child.name === part);

        if (childNode) {
          // 节点已存在
          if (isLastPart && childNode.type === 'directory') {
            // 如果路径的最后一部分已经作为目录存在，但现在它是一个文件，这是冲突。
            // 实际上，一个路径不应该既是文件又是目录。这里我们假设API不会发送冲突的路径。
            // For example, we won't get `a/b` and `a/b/c.txt`.
            console.warn(`Path conflict: ${path} is a file, but was already a directory.`);
          }
          currentNode = childNode;
        } else {
          // 创建新节点
          if (isLastPart) {
            // It's a file
            childNode = { name: part, type: 'file' };
            currentNode.children?.push(childNode);
          } else {
            // It's a directory
            childNode = { name: part, type: 'directory', children: [] };
            currentNode.children?.push(childNode);
            currentNode = childNode;
          }
        }
      }
    };
    
    externalFilePaths.forEach(path => insertNode(path));
    
    // Sort children: folders first, then files, all alphabetically
    const sortChildren = (node: FileStructureNode) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type === 'directory' && b.type === 'file') return -1;
          if (a.type === 'file' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortChildren);
      }
    };

    sortChildren(root);

    this.virtualFileStructure = root;
    console.log('✅ File structure merged with hierarchy and special files filtered', this.virtualFileStructure);
    this.notify();
  }

  // 🆕 获取缓存状态信息
  getCacheStatus(): {
    totalFiles: number;
    openTabs: number;
    dirtyFiles: number;
    cacheHitRate?: number;
    cachedFiles: string[];
  } {
    return {
      totalFiles: this.files.size,
      openTabs: this.openTabs.length,
      dirtyFiles: this.getDirtyFiles().length,
      cachedFiles: Array.from(this.files.keys())
    };
  }

  // 🆕 清除缓存（如果需要）
  clearCache() {
    this.files.clear();
    this.openTabs = [];
    this.activeTab = null;
    this.notify();
    console.log('🗑️ File system cache cleared');
  }

  getDirtyFiles(): FileState[] {
    return Array.from(this.files.values()).filter(file => file.isDirty)
  }
}

interface ComputerViewRef {
  save: () => void;
  revert: () => void;
}

interface ComputerViewProps {
  currentFile: string
  fileContent: string
  setFileContent: (content: string) => void
  isLive?: boolean
  taskStatus?: string
  terminalOutput?: string[]
  fileList?: string[]
  isViewingHistory?: boolean;
  historyLength?: number;
  currentHistoryIndexValue?: number;
  onHistoryChange?: (newIndex: number) => void;
  showOnlyFileTree?: boolean;
  showOnlyWorkspace?: boolean;
  maxTabs?: number;
  onFileSelect?: (filename: string) => void;
  onFileEditStateChange?: (hasChanges: boolean, activeFilename: string | null) => void;
  onFileSaved?: (filename: string, content: string) => void;  // 🆕 新增：文件保存回调
  taskId?: string;
  activities?: any[];
  taskStartTime?: number;
  // 🆕 新增：历史文件内容映射
  historicalFilesContent?: Map<string, string>;
  // 🆕 新增：当前文件元数据
  currentFileMetadata?: {
    isUrl?: boolean;
    isEditable?: boolean;
    fileType?: string;
    contentMode?: 'text' | 'url';
  };
}

export const ComputerView = forwardRef<ComputerViewRef, ComputerViewProps>(({
  currentFile,
  fileContent,
  setFileContent,
  isLive = true,
  taskStatus = 'idle',
  terminalOutput = [],
  fileList = [],
  isViewingHistory = false,
  historyLength = 0,
  currentHistoryIndexValue = -1,
  onHistoryChange,
  showOnlyFileTree = false,
  showOnlyWorkspace = false,
  maxTabs = 999,
  onFileSelect,
  onFileEditStateChange,
  onFileSaved,  // 🆕 新增
  taskId,
  activities = [],
  taskStartTime,
  historicalFilesContent, // 🆕 新增参数
  currentFileMetadata, // 🆕 新增参数
}, ref) => {
  // 文件系统状态管理
  const fileSystemRef = useRef<FileSystemManager | null>(null)
  if (!fileSystemRef.current) {
    fileSystemRef.current = new FileSystemManager()
  }
  const fileSystem = fileSystemRef.current

  const [selectedView, setSelectedView] = useState<string>('editing')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']))
  // 🆕 统一的文件视图模式：'preview'（渲染模式）或 'edit'（编辑模式）
  const [fileViewMode, setFileViewMode] = useState<'preview' | 'edit'>('preview')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  
  // 🆕 搜索和Web页面的状态管理
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [webContent, setWebContent] = useState<string>('')
  const [hasSearchResults, setHasSearchResults] = useState(false)
  const [hasWebContent, setHasWebContent] = useState(false)
  
  // 强制重新渲染的状态
  const [, forceUpdate] = useState({})
  const triggerUpdate = useCallback(() => forceUpdate({}), [])

  // 订阅文件系统状态变化
  useEffect(() => {
    const unsubscribe = fileSystem.subscribe(triggerUpdate)
    return unsubscribe
  }, [fileSystem, triggerUpdate])

  const terminalInputRef = useRef<HTMLInputElement>(null)
  const terminalDisplayRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  // 🆕 文件点击请求管理 - 用于取消过期的文件加载请求
  const currentFileClickRef = useRef<{
    filename: string | null;
    abortController: AbortController | null;
  }>({
    filename: null,
    abortController: null
  });

  const [terminalInputValue, setTerminalInputValue] = useState('')
  const [displayedTerminalOutput, setDisplayedTerminalOutput] = useState<string[]>([])
  const [showHtmlPreview, setShowHtmlPreview] = useState(false)

  const [showFileContextMenu, setShowFileContextMenu] = useState<{
    show: boolean, x: number, y: number, filename: string, isFolder: boolean
  }>({
    show: false, x: 0, y: 0, filename: '', isFolder: false
  })
  const [newItemDialog, setNewItemDialog] = useState<{
    show: boolean, type: 'file' | 'folder', parentPath: string, inputValue: string
  }>({
    show: false, type: 'file', parentPath: '', inputValue: ''
  })
  const [renameDialog, setRenameDialog] = useState<{
    show: boolean, filename: string, newName: string
  }>({
    show: false, filename: '', newName: ''
  })

  // 🔍 调试所有props变化
  useEffect(() => {
    // 🔍 All props tracker (避免console.log触发重新渲染)
  }, [currentFile, fileContent, currentFileMetadata, isViewingHistory, showOnlyWorkspace, taskId]);

  // 统一的状态管理Effect，处理实时和历史模式
  useEffect(() => {
    // Part 1: 处理历史模式
    if (isViewingHistory) {
      console.log(`🕒 HISTORY MODE: index ${currentHistoryIndexValue}`);

      // 重置所有实时视图状态
      setSearchResults([]);
      setHasSearchResults(false);
      setWebContent('');
      setHasWebContent(false);
      
      // A. 更新文件资源管理器
      const historicalFileList = fileList || [];
      console.log(`🕒 History File List:`, historicalFileList);
      fileSystem.mergeExternalFileStructure(historicalFileList);

      // B. 更新主视图 (编辑器, Search, Web, Terminal)
      const historicalFile = currentFile;
      const historicalContent = historicalFilesContent?.get(historicalFile);
      console.log(`🕒 History File: ${historicalFile}`, `Has Content: ${historicalContent !== undefined}`);

      if (historicalFile && historicalContent !== undefined) {
        const isJsonSearch = historicalFile.endsWith('.jsonsearch');
        const isWebHtml = historicalFile === 'Web.html';

        if (isJsonSearch) {
          try {
            const parsed = JSON.parse(historicalContent);
            const results = (Array.isArray(parsed) ? parsed : []).map(item => typeof item === 'string' ? JSON.parse(item) : item);
            setSearchResults(results);
            setHasSearchResults(results.length > 0);
            setSelectedView('search');
            console.log(`🕒 History View: Search with ${results.length} results`);
          } catch (e) { console.error("Failed to parse historical search JSON", e); }
        } else if (isWebHtml) {
          setWebContent(historicalContent);
          setHasWebContent(true);
          setSelectedView('web');
          console.log(`🕒 History View: Web`);
        } else {
          fileSystem.openFile(historicalFile, historicalContent);
          fileSystem.setActiveTab(historicalFile);
          setSelectedView('editing');
          console.log(`🕒 History View: Editing ${historicalFile}`);
        }
      } else if (terminalOutput && terminalOutput.length > 0) {
        // C. 如果没有文件，检查此步骤的终端输出
        setDisplayedTerminalOutput(terminalOutput);
        setSelectedView('terminal');
        // 🕒 History View: Terminal
        } else {
        // D. 历史步骤的默认视图
        setSelectedView('info');
        console.log(`🕒 History View: Info`);
        }
      } else {
      // Part 2: 处理实时模式
      // 🔄 LIVE MODE: file (避免console.log触发重新渲染)

      // A. 使用实时数据更新文件资源管理器
      fileSystem.mergeExternalFileStructure(fileList || []);

      // B. 处理当前的实时文件
      if (currentFile && fileContent !== undefined && fileContent !== null) {
        const isJsonSearchFile = currentFile.endsWith('.jsonsearch');
        const isWebHtmlFile = currentFile === 'Web.html';
        
        if (isJsonSearchFile) {
          // 🔄 Live View: Processing search file
          try {
            const parsed = JSON.parse(fileContent);
            const results = (Array.isArray(parsed) ? parsed : []).map(item => typeof item === 'string' ? JSON.parse(item) : item);
            setSearchResults(results);
            setHasSearchResults(results.length > 0);
            setSelectedView('search');
          } catch (e) { console.error("Failed to parse live search JSON", e); }
        } else if (isWebHtmlFile) {
          // 🔄 Live View: Processing web file
          setWebContent(fileContent);
          setHasWebContent(true);
          setSelectedView('web');
        } else {
          // 🔄 Live View: Processing regular file for editor
          // 🚨 修复：智能更新策略 - 创建新文件或更新干净文件
          const existingFile = fileSystem.getFile(currentFile);
          if (!existingFile) {
            // 文件不存在，创建新文件
            console.log(`🆕 Creating new file from props: ${currentFile}`);
            fileSystem.openFile(currentFile, fileContent, currentFileMetadata?.fileType, {
              isUrl: currentFileMetadata?.isUrl,
              isEditable: currentFileMetadata?.isEditable,
              contentMode: currentFileMetadata?.contentMode,
            });
          } else {
            // 🆕 文件存在，检查是否需要更新
            if (!existingFile.isDirty && existingFile.content !== fileContent) {
              // 文件干净且内容不同，更新内容
              console.log(`🔄 Updating clean file in main effect: ${currentFile}`);
              existingFile.content = fileContent;
              existingFile.originalContent = fileContent;
              fileSystem.notify();
            } else if (existingFile.isDirty) {
              console.log(`🔒 File has unsaved changes, not updating: ${currentFile}`);
            } else {
              console.log(`📁 File already cached with same content: ${currentFile}`);
            }
          }
          fileSystem.setActiveTab(currentFile);
          setSelectedView('editing');
        }
      } else if (fileSystem.getActiveFile()) {
        setSelectedView('editing');
      } else {
        setSelectedView('terminal');
      }
      
      // C. 使用实时输出更新终端
      setDisplayedTerminalOutput(terminalOutput || []);
    }
  }, [
      isViewingHistory, 
      currentHistoryIndexValue, 
      currentFile, 
      fileContent, 
      historicalFilesContent,
      fileList,
      terminalOutput,
      currentFileMetadata,
      fileSystem // 添加fileSystem以避免linting警告
  ]);

  // 🚨 修复：实时更新文件内容 - 允许更新干净文件，保护用户编辑
  useEffect(() => {
    if (currentFile && fileContent !== undefined && fileContent !== null && isLive && !isViewingHistory) {
      const existingFile = fileSystem.getFile(currentFile)

      if (!existingFile) {
        // 文件不存在，创建新文件
        const metaData = currentFileMetadata ? {
          isUrl: currentFileMetadata.isUrl,
          isEditable: currentFileMetadata.isEditable,
          contentMode: currentFileMetadata.contentMode
        } : undefined;

        console.log(`🆕 Loading new file from props: ${currentFile}`);
        fileSystem.openFile(currentFile, fileContent, currentFileMetadata?.fileType, metaData)
      } else if (!existingFile.isDirty) {
        // 🆕 文件存在但用户没有编辑（isDirty = false），允许更新
        if (existingFile.content !== fileContent) {
          console.log(`🔄 Updating clean file from props: ${currentFile}, old length: ${existingFile.content.length}, new length: ${fileContent.length}`);
          existingFile.content = fileContent;
          existingFile.originalContent = fileContent; // 更新 originalContent 以保持 isDirty = false
          fileSystem.notify(); // 通知订阅者更新
        } else {
          console.log(`✅ File content unchanged: ${currentFile}`);
        }
      } else {
        // 文件存在且用户有编辑（isDirty = true），保护用户内容
        console.log(`🔒 Protecting dirty file, skipping update: ${currentFile}`);
      }
    }
  }, [currentFile, fileContent, isLive, isViewingHistory, currentFileMetadata, fileSystem]);

  // 只有在用户首次进入且没有活动文件时才考虑显示Terminal
  useEffect(() => {
    if (terminalOutput.length > 0 && selectedView === 'editing') {
      const activeFile = fileSystem.getActiveFile()
      const openTabs = fileSystem.getOpenTabs()
      if (!activeFile && openTabs.length === 0) {
        setSelectedView('terminal')
      }
    }
  }, [terminalOutput.length])

  // 更新终端输出
  useEffect(() => {
    // 这个Effect现在由主Effect处理，以避免冲突
    // setDisplayedTerminalOutput(terminalOutput || [])
  }, [terminalOutput])

  // 自动滚动终端
  useEffect(() => {
    if (selectedView === 'terminal' && terminalDisplayRef.current) {
      terminalDisplayRef.current.scrollTop = terminalDisplayRef.current.scrollHeight
    }
  }, [displayedTerminalOutput, selectedView])

  // 自动聚焦终端输入
  useEffect(() => {
    if (selectedView === 'terminal' && terminalInputRef.current) {
      terminalInputRef.current.focus()
    }
  }, [selectedView])

  // 🆕 获取是否有未保存的文件
  const hasUnsavedFiles = useCallback(() => {
    return fileSystem.getDirtyFiles().length > 0
  }, [fileSystem])

  // 🆕 获取当前活动文件是否有更改
  const activeFileHasChanges = useCallback(() => {
    const activeFile = fileSystem.getActiveFile()
    return activeFile ? activeFile.isDirty : false
  }, [fileSystem])

  // 🚨 简化的文件系统订阅，仅用于tab变化等非编辑操作
  useEffect(() => {
    if (!onFileEditStateChange) return;

    const handleFileSystemUpdate = () => {
      // 只在非编辑时（如切换tab、打开/关闭文件）更新状态
      const activeFile = fileSystem.getActiveFile()
      const hasChanges = fileSystem.getDirtyFiles().length > 0
      
      // 检查是否与当前保存的状态不同
      if (saveButtonStateRef.current.hasChanges !== hasChanges || 
          saveButtonStateRef.current.activeFilename !== (activeFile?.filename || null)) {
        saveButtonStateRef.current = {
          hasChanges,
          activeFilename: activeFile?.filename || null
        };
        onFileEditStateChange(hasChanges, activeFile?.filename || null)
      }
    }

    // 订阅文件系统变化，但在handleFileContentChange中已处理编辑状态
    const unsubscribe = fileSystem.subscribe(handleFileSystemUpdate)
    
    // 立即执行一次状态更新
    handleFileSystemUpdate()
    
    return unsubscribe
  }, [onFileEditStateChange, fileSystem])

  // 🆕 获取文件内容的增强方法 - 绝对优先使用本地缓存
  const getFileContent = useCallback((rawFilename: string): string => {
    if (!rawFilename) return '';
    const filename = normalizeFilename(rawFilename);
    
    // 🚨 修复：绝对优先从fileSystem获取最新内容，包括已保存的内容
    const file = fileSystem.getFile(filename);
    if (file) {
      // 如果文件存在于缓存中，无论是否dirty都优先使用缓存内容
      return file.content;
    }
    
    // 🆕 历史模式：从历史内容映射获取（仅当fileSystem中没有时）
    if (isViewingHistory && historicalFilesContent) {
      const historicalContent = historicalFilesContent.get(filename);
      if (historicalContent !== undefined) {
        return historicalContent;
      }
    }
    
    // 最后的回退：使用props中的内容（仅在文件从未被加载到缓存时）
    if (filename === normalizeFilename(currentFile)) {
      return fileContent || '';
    }
    
    return '';
  }, [isViewingHistory, historicalFilesContent, currentFile, fileContent, fileSystem]);

  // 🆕 增强的文件点击处理逻辑 - 优先使用本地缓存 + 竞态条件保护
  const handleFileClick = useCallback(async (rawFilename: string) => {
    const filename = normalizeFilename(rawFilename);
    console.log('File clicked:', filename, 'Is viewing history:', isViewingHistory);

    if (showOnlyFileTree && onFileSelect) {
      onFileSelect(filename);
      return;
    }

    // 🆕 取消之前的文件请求
    if (currentFileClickRef.current.abortController) {
      console.log('⚠️ Cancelling previous file click request:', currentFileClickRef.current.filename);
      currentFileClickRef.current.abortController.abort();
    }

    // 🆕 创建新的 AbortController
    const abortController = new AbortController();
    currentFileClickRef.current = {
      filename: filename,
      abortController: abortController
    };

    // 🆕 检查是否为HTML文件
    const isHtmlFile = filename.toLowerCase().endsWith('.html');

    // 🆕 优先检查本地缓存
    let content = '';
    const fallbackMeta = normalizeFileMetadata(filename, {
      file_type: fileSystem.detectFileType(filename)
    });
    let fileMetadata: {
      isUrl?: boolean;
      isEditable?: boolean;
      fileType?: FileState['fileType'];
      contentMode?: 'text' | 'url';
    } = {
      isUrl: fallbackMeta.is_url,
      isEditable: fallbackMeta.is_editable,
      fileType: fallbackMeta.file_type as FileState['fileType'],
      contentMode: fallbackMeta.content_mode
    };

    // 首先尝试从本地文件系统获取
    const existingFile = fileSystem.getFile(filename);
    if (existingFile) {
      console.log('📂 Using cached file content for:', filename, 'Content length:', existingFile.content.length, 'isDirty:', existingFile.isDirty);
      content = existingFile.content;
      const normalizedMeta = normalizeFileMetadata(filename, {
        file_type: existingFile.fileType,
        is_url: existingFile.isUrl,
        is_editable: existingFile.isEditable,
        content_mode: existingFile.contentMode
      });
      fileMetadata = {
        isUrl: normalizedMeta.is_url,
        isEditable: normalizedMeta.is_editable,
        fileType: normalizedMeta.file_type as FileState['fileType'],
        contentMode: normalizedMeta.content_mode
      };
    } else if (isViewingHistory) {
      // 历史模式：从历史内容映射获取
      content = getFileContent(filename);
      console.log('History mode: displaying file', filename, 'with', content.length, 'characters');
    } else if (taskId) {
      // 只有在本地缓存中没有文件时，才从后端获取
      try {
        console.log('File not in cache, fetching from backend for:', filename);

        // 🆕 传递 signal 给 API
        const response = await apiService.getFileContent(taskId, filename, abortController.signal);

        // 🆕 验证请求是否被取消
        if (abortController.signal.aborted) {
          console.log('🚫 Request was cancelled, ignoring response for:', filename);
          return;
        }

        // 🆕 验证这个响应是否仍然有效
        if (currentFileClickRef.current.filename !== filename) {
          console.log('⚠️ User has clicked another file, ignoring stale response for:', filename);
          return;
        }

        if (response.success && response.content !== undefined) {
          content = response.content ?? '';
          console.log('Successfully fetched file content from backend:', filename, 'Length:', content.length);

          // 提取文件元数据
          const normalizedMeta = normalizeFileMetadata(filename, {
            file_type: response.file_type,
            is_url: response.is_url,
            is_editable: response.is_editable,
            content_mode: response.content_mode
          });
          fileMetadata = {
            isUrl: normalizedMeta.is_url,
            isEditable: normalizedMeta.is_editable,
            fileType: normalizedMeta.file_type as FileState['fileType'],
            contentMode: normalizedMeta.content_mode
          };
        } else {
          console.warn('Failed to fetch file content from backend:', response.message);
          content = getFileContent(filename);
        }
      } catch (error: any) {
        // 🆕 忽略 AbortError
        if (error.name === 'AbortError') {
          console.log('🚫 Fetch aborted for:', filename);
          return;
        }

        console.error('Error fetching file content from backend:', error);
        content = getFileContent(filename);
      }
    } else {
      content = getFileContent(filename);
    }

    // 🆕 最后一次验证：确保文件名仍然匹配
    if (currentFileClickRef.current.filename !== filename) {
      console.log('⚠️ File click changed during processing, ignoring:', filename);
      return;
    }

    // 🆕 HTML文件特殊处理：重置源码编辑器状态
    if (isHtmlFile && !isViewingHistory) {
      // 重置HTML源码编辑器状态，确保默认显示预览
      setShowHtmlSourceEditor(false);

      // 确保文件在缓存中
      if (!existingFile) {
        const metaData = {
          isUrl: fileMetadata.isUrl,
          isEditable: fileMetadata.isEditable,
          fileType: fileMetadata.fileType,
          contentMode: fileMetadata.contentMode
        };
        fileSystem.openFile(filename, content, 'html', metaData);
      }
    }

    // 普通文件处理
    setSelectedView('editing');

    // 打开或切换到文件 - 只有在缓存中没有时才创建新文件
    if (existingFile) {
      // 文件已存在于缓存中，直接切换
      console.log('Switching to existing cached file:', filename);
      fileSystem.setActiveTab(filename);
    } else {
      // 创建新文件并添加到缓存
      console.log('Adding new file to cache:', filename);
      const metaData = {
        isUrl: fileMetadata.isUrl,
        isEditable: fileMetadata.isEditable,
        fileType: fileMetadata.fileType,
        contentMode: fileMetadata.contentMode
      };

      fileSystem.openFile(filename, content, fileMetadata.fileType || fileSystem.detectFileType(filename), metaData);
    }

    if (onFileSelect) {
      onFileSelect(filename);
    }

    setTimeout(() => {
      if (!isViewingHistory) {
        const tabs = fileSystem.getOpenTabs();
        const tabIndex = tabs.findIndex(tab => PathUtils.isSamePath(tab.filename, filename));

        if (tabIndex !== -1 && tabsContainerRef.current) {
          const tabWidth = 120;
          const scrollPosition = tabIndex * tabWidth;

          tabsContainerRef.current.scrollTo({
            left: scrollPosition,
            behavior: 'smooth'
          });
        }
      }
    }, 50);
  }, [showOnlyFileTree, onFileSelect, selectedView, isViewingHistory, getFileContent, taskId, fileSystem]);



  // 标签页切换处理
  const handleTabClick = useCallback((filename: string) => {
    fileSystem.setActiveTab(filename)
    if (onFileSelect) {
      onFileSelect(filename)
    }
    setSelectedView('editing')
    scrollToTab(filename)
  }, [onFileSelect])

  // 标签页自动滚动功能
  const scrollToTab = useCallback((filename: string) => {
    if (!tabsContainerRef.current) return
    
    const tabs = fileSystem.getOpenTabs()
    const tabIndex = tabs.findIndex(tab => tab.filename === filename)
    
    if (tabIndex !== -1) {
      const tabWidth = 120
      const scrollPosition = tabIndex * tabWidth
      
      tabsContainerRef.current.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      })
    }
  }, [])

  // 关闭标签页处理
  const handleCloseTab = useCallback((filename: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    const file = fileSystem.getFile(filename)
    if (file?.isDirty) {
      const confirmed = window.confirm(`File "${filename}" has unsaved changes. Close anyway?`)
      if (!confirmed) return
    }
    
    fileSystem.closeFile(filename)
  }, [])

  // 🆕 专门用于Save按钮状态的ref，避免触发重新渲染
  const saveButtonStateRef = useRef<{ hasChanges: boolean; activeFilename: string | null }>({
    hasChanges: false,
    activeFilename: null
  });

  // 🚨 新增：用于存储当前活动文件的textarea引用
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 文件内容更改处理 - 完全避免重新渲染
  const handleFileContentChange = useCallback((rawFilename: string, content: string) => {
    const filename = normalizeFilename(rawFilename);
    
    // 先检查内容是否真的发生了变化，避免不必要的更新
    const existingFile = fileSystem.getFile(filename);
    if (existingFile && existingFile.content === content) {
      return; // 内容没有变化，直接返回
    }
    
    // 🚨 启用静默模式，避免fileSystem操作触发重新渲染
    fileSystem.setSilentMode(true);
    
    // 直接更新文件系统内容
    const file = fileSystem.getFile(filename);
    if (file) {
      file.content = content;
      file.isDirty = content !== file.originalContent;
      
      // 🚨 使用debounced方式更新Save按钮状态，但不触发组件重新渲染
      const updateSaveButtonState = () => {
        const dirtyFiles = fileSystem.getDirtyFiles();
        const hasChanges = dirtyFiles.length > 0;
        const activeFile = fileSystem.getActiveFile();
        
        // 只有状态真正变化时才通知父组件
        if (saveButtonStateRef.current.hasChanges !== hasChanges || 
            saveButtonStateRef.current.activeFilename !== (activeFile?.filename || null)) {
          saveButtonStateRef.current = {
            hasChanges,
            activeFilename: activeFile?.filename || null
          };
          
          // 只通知父组件Save按钮状态，不触发当前组件重新渲染
          if (onFileEditStateChange) {
            onFileEditStateChange(hasChanges, activeFile?.filename || null);
          }
        }
        
        // 延迟恢复通知模式
        setTimeout(() => {
          fileSystem.setSilentMode(false);
        }, 100);
      };
      
      // 延迟更新Save按钮状态，但不触发组件重新渲染
      if (notifyTimeoutRef.current) {
        clearTimeout(notifyTimeoutRef.current);
      }
      notifyTimeoutRef.current = setTimeout(updateSaveButtonState, 300);
    }
  }, [fileSystem, onFileEditStateChange]);

  // 🆕 添加ref用于延迟通知
  const notifyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 🆕 清理定时器
  useEffect(() => {
    return () => {
      if (notifyTimeoutRef.current) {
        clearTimeout(notifyTimeoutRef.current);
      }
    };
  }, []);

  // 保存文件处理
  const handleSave = useCallback(async (rawFilename?: string) => {
    const filename = rawFilename ? normalizeFilename(rawFilename) : undefined;
    const targetFile = filename ? fileSystem.getFile(filename) : fileSystem.getActiveFile()
    if (!targetFile || !targetFile.isDirty || !taskId || !targetFile.isEditable) return

    console.log(`💾 Starting save for file: ${targetFile.filename}`, {
      contentLength: targetFile.content.length,
      originalContentLength: targetFile.originalContent.length,
      isDirty: targetFile.isDirty
    });

    try {
      setSaveStatus('saving')
      const result = await apiService.saveFileContent(taskId, targetFile.filename, targetFile.content)
      
      if (result.success) {
        console.log(`✅ Save successful, updating file system for: ${targetFile.filename}`);
        fileSystem.saveFile(targetFile.filename)

        // 🚨 验证保存后的状态
        const savedFile = fileSystem.getFile(targetFile.filename);
        console.log(`📝 Post-save verification:`, {
          filename: savedFile?.filename,
          contentLength: savedFile?.content.length,
          originalContentLength: savedFile?.originalContent.length,
          isDirty: savedFile?.isDirty
        });

        // 🆕 通知 Dashboard 文件已保存，更新它的缓存
        if (onFileSaved && savedFile) {
          onFileSaved(savedFile.filename, savedFile.content);
        }

        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        console.error(`❌ Save failed:`, result.message);
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (error) {
      console.error('Save failed:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [taskId])

  // 🚨 修复：还原文件处理，强制更新UI和textarea
  const handleRevert = useCallback((filename: string) => {
    const activeFile = fileSystem.getFile(filename);
    if (activeFile && activeFile.isEditable) {
      // 使用新的revertFile方法，强制通知UI更新
      const reverted = fileSystem.revertFile(filename);
      
      if (reverted) {
        // 直接更新当前活动的textarea
        if (activeTextareaRef.current) {
          activeTextareaRef.current.value = activeFile.originalContent;
          // 触发一个change事件确保状态同步
          const event = new Event('input', { bubbles: true });
          activeTextareaRef.current.dispatchEvent(event);
        }
        
        // 更新Save按钮状态
        if (onFileEditStateChange) {
          onFileEditStateChange(false, activeFile.filename);
        }
      }
    }
  }, [fileSystem, onFileEditStateChange])

  // 文件夹展开/折叠处理
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }, [])

  // 右键菜单处理
  const handleFileRightClick = useCallback((e: React.MouseEvent, filename: string, isFolder: boolean) => {
    e.preventDefault()
    setShowFileContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      filename,
      isFolder
    })
  }, [])



  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFileContextMenu(prev => ({ ...prev, show: false }))
    }
    
    if (showFileContextMenu.show) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showFileContextMenu.show])

  // 终端输入处理
  const handleTerminalInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTerminalInputValue(e.target.value)
  }

  // 🆕 执行终端命令的API调用
  const executeTerminalCommand = useCallback(async (command: string) => {
    if (!taskId) {
      console.error('No task ID available for terminal command execution');
      return;
    }

    // 🆕 使用与其他API相同的配置函数，确保地址一致性
    const API_BASE_URL = getCurrentApiBaseUrl();

    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/terminal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // 显示命令执行结果
        const outputLines = [
          `$ ${command}`,
          result.output || 'Command executed successfully',
        ];
        setDisplayedTerminalOutput(prevOutput => [...prevOutput, ...outputLines]);
      } else {
        // 显示错误信息
        const errorLines = [
          `$ ${command}`,
          `Error: ${result.output || 'Command execution failed'}`,
        ];
        setDisplayedTerminalOutput(prevOutput => [...prevOutput, ...errorLines]);
      }
    } catch (error) {
      // 📡 Terminal command execution failed (避免console.error触发重新渲染)
      const errorLines = [
        `$ ${command}`,
        `Network Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ];
      setDisplayedTerminalOutput(prevOutput => [...prevOutput, ...errorLines]);
    }
  }, [taskId]);

  const handleTerminalInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInputValue.trim() !== '') {
      e.preventDefault()
      const command = terminalInputValue.trim();
      
      // 立即显示用户输入的命令
      setDisplayedTerminalOutput(prevOutput => [...prevOutput, `> ${command}`]);
      
      // 清空输入框
      setTerminalInputValue('');
      
      // 如果不在历史模式且有taskId，执行API调用
      if (!isViewingHistory && taskId) {
        executeTerminalCommand(command);
      } else {
        // 历史模式或无taskId时，只显示本地回显
      }
    }
  }

  // 📝 新建文件/文件夹处理函数
  const handleCreateNewItem = useCallback(async () => {
    if (!newItemDialog.inputValue.trim()) return;
    
    const newName = newItemDialog.inputValue.trim();
    const parentPath = newItemDialog.parentPath;
    const fullPath = parentPath ? `${parentPath}/${newName}` : newName;
    
    try {
      if (newItemDialog.type === 'file') {
        // 检查是否已存在同名文件
        const existingFile = fileSystem.getFile(fullPath);
        if (existingFile) {
          const shouldOverwrite = window.confirm(
            `File "${fullPath}" already exists. Creating a new file will overwrite the existing one. Continue?`
          );
          if (!shouldOverwrite) {
            return;
          }
        }
        
        // 创建新文件并打开编辑器
        fileSystem.openFile(fullPath, '', 'text');
        fileSystem.setActiveTab(fullPath);
        setSelectedView('editing');

        // 🔧 立即添加文件到虚拟文件结构，让File Explorer显示新文件
        fileSystem.addFileToVirtualStructure(fullPath);
        
        // 自动展开包含新文件的父文件夹
        const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (parentPath) {
          setExpandedFolders(prev => new Set(prev).add(parentPath));
        } else {
          setExpandedFolders(prev => new Set(prev).add('/'));
        }
        
        // 通知父组件文件编辑状态变化
        if (onFileEditStateChange) {
          onFileEditStateChange(true, fullPath);
        }
        
        // 🆕 自动保存空文件到后端
        if (taskId) {
          try {
            
            const result = await apiService.saveFileContent(taskId, fullPath, '');
            if (result.success) {
              // 标记文件为已保存
              fileSystem.saveFile(fullPath);
              
            } else {
              console.warn('⚠️ Failed to save new file to backend:', result.message);
            }
          } catch (error) {
            console.error('❌ Error saving new file to backend:', error);
          }
        }
      } else {
        // 创建新文件夹
        console.log('📁 Created new folder:', fullPath);
        
        // 🔧 立即添加文件夹到虚拟文件结构，让File Explorer显示新文件夹
        fileSystem.addFileToVirtualStructure(fullPath, true);
        
        // 自动展开包含新文件夹的父文件夹
        const parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        if (parentPath) {
          setExpandedFolders(prev => new Set(prev).add(parentPath));
        } else {
          setExpandedFolders(prev => new Set(prev).add('/'));
        }
      }
      
      // 关闭对话框
      setNewItemDialog({ show: false, type: 'file', parentPath: '', inputValue: '' });
    } catch (error) {
      console.error('Failed to create new item:', error);
    }
  }, [newItemDialog, fileSystem, onFileEditStateChange, setSelectedView, taskId]);

  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey)) {
        switch (event.key) {
          case 's':
            event.preventDefault()
            handleSave()
            break
          case 'w':
            event.preventDefault()
            const activeFile = fileSystem.getActiveFile()
            if (activeFile) {
              fileSystem.closeFile(activeFile.filename)
            }
            break
          case 'z':
            event.preventDefault()
            handleRevert()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, handleRevert])

  // 🆕 通过ref暴露保存和还原功能
  useImperativeHandle(ref, () => ({
    save: () => {
      const activeFile = fileSystem.getActiveFile()
      if (activeFile) {
        handleSave(activeFile.filename)
      }
    },
    revert: () => {
      const activeFile = fileSystem.getActiveFile()
      if (activeFile) {
        handleRevert(activeFile.filename)
      }
    },
    // 🆕 暴露updateFileContent方法以便外部强制更新文件内容
    updateFileContent: (filename: string, content: string) => {
      console.log('📝 Force updating file content via ref:', filename, 'Length:', content.length);
      fileSystem.updateFileContent(filename, content);
      
      // 🆕 强制通知组件更新
      fileSystem.forceNotify();
    }
  }))

  // 🆕 扁平化文件树渲染函数
  const renderFileTree = useCallback((node: FileStructureNode, path: string = '', level: number = 0) => {
    if (!node) return null

    const fullPath = PathUtils.fromTreePath(node.name, path);
    const isExpanded = expandedFolders.has(fullPath);

    if (node.type === 'directory') {
      return (
        <div key={fullPath}>
          <div
            className="flex items-center gap-1 py-1 px-2 hover:bg-white/60 cursor-pointer select-none text-sm transition-all duration-200 rounded-lg mx-1"
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => toggleFolder(fullPath)}
            onContextMenu={(e) => handleFileRightClick(e, fullPath, true)}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Folder className="h-4 w-4 text-blue-600" />
            <span>{node.name}</span>
          </div>
          {isExpanded && node.children && (
            <div>
              {node.children.map(child => renderFileTree(child, fullPath, level + 1))}
            </div>
          )}
        </div>
      )
    } else {
      const openTabs = fileSystem.getOpenTabs();
      const activeFile = fileSystem.getActiveFile();
      const isOpen = openTabs.some(tab => PathUtils.isSamePath(tab.filename, fullPath));
      const isActive = activeFile ? PathUtils.isSamePath(activeFile.filename, fullPath) : false;
      
      return (
        <div
          key={fullPath}
          className={`flex items-center gap-1 py-1 px-2 hover:bg-white/60 cursor-pointer text-sm transition-all duration-200 rounded-lg mx-1 ${
            isActive ? 'bg-blue-100/80 text-blue-800 shadow-sm' : 
            isOpen ? 'bg-blue-50/60 text-blue-700' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 24}px` }}
          onClick={() => handleFileClick(fullPath)}
          onContextMenu={(e) => handleFileRightClick(e, fullPath, false)}
        >
          <File className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-slate-500'}`} />
          <span className={isActive ? 'font-medium' : ''}>{node.name}</span>
          {isOpen && (
            <div className={`w-1.5 h-1.5 rounded-full ml-auto ${
              isActive ? 'bg-blue-600' : 'bg-blue-500'
            }`}></div>
          )}
        </div>
      )
    }
  }, [expandedFolders, fileSystem, handleFileClick, toggleFolder, handleFileRightClick]);

  // 获取当前状态
  const openTabs = fileSystem.getOpenTabs()
  const activeFile = fileSystem.getActiveFile()

  // 计算文件总数的辅助函数
  const countAllFiles = (node: FileStructureNode): number => {
    if (!node) return 0
    let count = node.type === 'file' ? 1 : 0
    if (node.children) {
      count += node.children.reduce((acc, child) => acc + countAllFiles(child), 0)
    }
    return count
  }

  // 计算运行时长
  const getRuntime = useCallback(() => {
    if (!taskStartTime) return 'Unknown'
    const now = Date.now()
    const runtime = Math.floor((now - taskStartTime * 1000) / 1000)
    const hours = Math.floor(runtime / 3600)
    const minutes = Math.floor((runtime % 3600) / 60)
    const seconds = runtime % 60
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
  }, [taskStartTime])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 🆕 统一的文件内容渲染逻辑 - 确保URL模式文件正确显示
  const renderFileContent = () => {
    if (!activeFile) {
      return (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a file to view its contents</p>
          </div>
        </div>
      )
    }

    // 🆕 获取要显示的内容
    let contentToRender = '';
    if (isViewingHistory && historicalFilesContent && activeFile.filename) {
      const historicalContent = historicalFilesContent.get(activeFile.filename);
      contentToRender = historicalContent !== undefined ? historicalContent : activeFile.content;
    } else {
      contentToRender = activeFile.content;
    }

    // 🎯 渲染文件 (避免console.log触发重新渲染)

    // 🆕 使用统一的FileContentRenderer来渲染所有内容
    return <FileContentRenderer file={activeFile} />
  }

  // 🆕 增强的文件内容渲染器 - 专门处理URL模式文件
  const FileContentRenderer = useCallback((props: { file: FileState }) => {
    const { file } = props;
    const inferredFileType = useMemo<FileState['fileType']>(() => {
      return fileSystem.detectFileType(file.filename);
    }, [fileSystem, file.filename]);

    const effectiveFileType = useMemo<FileState['fileType']>(() => {
      if (!file.fileType) {
        return inferredFileType;
      }
      if (file.fileType === inferredFileType) {
        return file.fileType;
      }
      // 如果当前标记为 html / text 但后缀显示为其他类型，则使用推断类型
      if (['html', 'text', 'markdown'].includes(file.fileType) && inferredFileType !== 'text') {
        return inferredFileType;
      }
      return file.fileType;
    }, [file.fileType, inferredFileType]);

    if (file.fileType !== effectiveFileType) {
      file.fileType = effectiveFileType;
    }

    const derivedIsUrl = useMemo(() => {
      if (typeof file.isUrl === 'boolean') {
        return file.isUrl;
      }
      return ['image', 'video', 'audio', 'pdf'].includes(effectiveFileType);
    }, [file.isUrl, effectiveFileType]);

    const isEditable = (file.isEditable !== undefined ? file.isEditable : !derivedIsUrl) && !isViewingHistory;
    // 🚨 修复：直接使用file.content，不再通过getFileContent获取，确保显示缓存中的最新内容
    const displayContent = file.content;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    
    console.log(`🎨 Rendering file: ${file.filename}, content length: ${displayContent.length}, isDirty: ${file.isDirty}`);
    
    // 🚨 修复：只在文件切换时更新textarea值，避免编辑时覆盖用户输入
    useEffect(() => {
      if (textareaRef.current) {
        const currentValue = textareaRef.current.value;
        // 只有当textarea为空或者文件切换时才设置初始值
        if (currentValue === '' || (!currentValue && displayContent)) {
          textareaRef.current.value = displayContent;
        }
      }
    }, [file.filename]); // 只在文件名变化时更新，避免编辑时重置

    const isImageFile = effectiveFileType === 'image';
    const isPngFile = isImageFile && file.filename.toLowerCase().endsWith('.png');

    const isHtmlFile = effectiveFileType === 'html';

    const processedHtmlContent = useMemo(() => {
      if (!isHtmlFile || !displayContent) {
        return '';
      }
      const cacheKey = file.lastSaved ?? displayContent.length;
      return rewriteHtmlAssetUrls(displayContent, taskId, { cacheKey });
    }, [isHtmlFile, displayContent, taskId, file.lastSaved]);

    const pngCacheKey = useMemo<string | undefined>(() => {
      if (!isPngFile) return undefined;
      return Date.now().toString();
    }, [isPngFile, file.filename, file.content, file.lastSaved]);

    const baseImageUrl = useMemo(() => {
      if (!isImageFile || !taskId) return '';
      const encodedPath = file.filename
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
      return `${getCurrentApiBaseUrl()}/tasks/${taskId}/files/${encodedPath}`;
    }, [isImageFile, taskId, file.filename]);

    const imageUrl = useMemo(() => {
      if (!isImageFile) return '';
      if (!baseImageUrl) return '';
      const cacheKey = pngCacheKey || file.lastSaved || Date.now();
      return appendCacheBusterForPng(baseImageUrl, cacheKey);
    }, [isImageFile, baseImageUrl, pngCacheKey, file.lastSaved]);

    const downloadUrl = imageUrl;

    // 🆕 图片类型渲染
    if (effectiveFileType === 'image') {
      return (
        <div className="h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-200/60 bg-white/60">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Image Viewer
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{file.filename}</span>
              <a
                href={downloadUrl}
                download={file.filename}
                className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Download
              </a>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50/50 min-h-0 min-w-0">
            <img
              src={imageUrl}
              alt={file.filename}
              className="max-w-full max-h-full object-contain rounded-lg shadow-md"
              style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
              onError={(e) => {
                console.error('Failed to load image:', file.filename);
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImage Load Failed%3C/text%3E%3C/svg%3E';
              }}
            />
          </div>
        </div>
      );
    }

    // 🆕 PDF 类型渲染
    if (effectiveFileType === 'pdf') {
      const pdfUrl = taskId
        ? `${getCurrentApiBaseUrl()}/tasks/${taskId}/files/${file.filename.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
        : '';

      return (
        <div className="h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-200/60 bg-white/60">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              PDF Viewer
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{file.filename}</span>
              <a
                href={pdfUrl}
                download={file.filename}
                className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Download
              </a>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe
              src={pdfUrl}
              className="w-full h-full border-none"
              title={`PDF: ${file.filename}`}
            />
          </div>
        </div>
      );
    }

    // 🆕 视频类型渲染
    if (effectiveFileType === 'video') {
      const videoUrl = taskId
        ? `${getCurrentApiBaseUrl()}/tasks/${taskId}/files/${encodeURIComponent(file.filename)}`
        : '';

      return (
        <div className="h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-200/60 bg-white/60">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Video Player
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{file.filename}</span>
              <a
                href={videoUrl}
                download={file.filename}
                className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Download
              </a>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50/50 min-h-0 min-w-0">
            <video
              src={videoUrl}
              controls
              className="max-w-full max-h-full rounded-lg shadow-md"
              style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      );
    }

    // 🆕 音频类型渲染
    if (effectiveFileType === 'audio') {
      const audioUrl = taskId
        ? `${getCurrentApiBaseUrl()}/tasks/${taskId}/files/${encodeURIComponent(file.filename)}`
        : '';

      return (
        <div className="h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-200/60 bg-white/60">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Audio Player
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{file.filename}</span>
              <a
                href={audioUrl}
                download={file.filename}
                className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Download
              </a>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50/50 min-h-0 min-w-0">
            <audio
              src={audioUrl}
              controls
              className="w-full max-w-2xl"
              style={{ maxWidth: '100%' }}
            >
              Your browser does not support the audio tag.
            </audio>
          </div>
        </div>
      );
    }

    if (isHtmlFile) {
      const isValidUrl = (content: string): boolean => {
        try {
          new URL(content);
          return true;
        } catch {
          return false;
        }
      };

      const getCleanUrl = (content: string): string => {
        const trimmedContent = content.trim();
        if (trimmedContent.startsWith('http://') || trimmedContent.startsWith('https://')) {
          return trimmedContent;
        }
        return `https://${trimmedContent}`;
      };

      if (isValidUrl(displayContent)) {
        const cleanUrl = getCleanUrl(displayContent);
        return (
          <div className="h-full w-full bg-white rounded-lg shadow-sm overflow-hidden">
            <iframe 
              src={cleanUrl}
              className="w-full h-full border-none"
              title={`Website: ${file.filename}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-navigation"
            />
          </div>
        );
      } else {
        // 🆕 HTML文件默认显示Web预览，统一的模式切换
        return (
          <div className="h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-slate-200/60 bg-white/60">
              <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Globe className="h-4 w-4" />
                HTML File
              </h3>
              <div className="flex items-center gap-3">
                {/* 🆕 统一的模式切换按钮 */}
                <button
                  onClick={() => setFileViewMode(fileViewMode === 'preview' ? 'edit' : 'preview')}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors duration-200 ${
                    fileViewMode === 'preview'
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-200/60 text-slate-600 hover:bg-slate-300/60'
                  }`}
                >
                  {fileViewMode === 'preview' ? 'Edit Mode' : 'Preview Mode'}
                </button>
                <div className="text-xs text-slate-500">
                  {fileViewMode === 'preview' ? 'Preview' : 'Editable'}
                </div>
              </div>
            </div>

            {/* 🆕 条件渲染：预览模式显示Web预览，编辑模式显示源码编辑器 */}
            <div className="flex-1 overflow-hidden">
              {fileViewMode === 'preview' ? (
                <div className="h-full bg-white">
                  <iframe
                    key={`html-preview-${file.filename}-${processedHtmlContent.length}`}
                    srcDoc={processedHtmlContent}
                    className="w-full h-full border-none"
                    title={`HTML Preview: ${file.filename}`}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-modals allow-popups-to-escape-sandbox allow-downloads"
                  />
                </div>
              ) : (
                <div className="h-full p-4 overflow-hidden">
                  <textarea
                    key={`${file.filename}-html-editor`}
                    ref={(ref) => {
                      textareaRef.current = ref;
                      if (ref && fileSystem.getActiveFile()?.filename === file.filename) {
                        activeTextareaRef.current = ref;
                      }
                    }}
                    className="w-full h-full border-none resize-none focus:outline-none font-mono text-sm"
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                      overflowWrap: 'break-word'
                    }}
                    defaultValue={displayContent}
                    onChange={(e) => handleFileContentChange(file.filename, e.target.value)}
                    placeholder="Edit HTML content..."
                  />
                </div>
              )}
            </div>
          </div>
        );
      }
    }

    if (effectiveFileType === 'python') {
      return (
        <div className="h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-200/60 bg-white/60">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Python File
            </h3>
            <div className="flex items-center gap-3">
              {/* 🆕 统一的模式切换按钮 */}
              <button
                onClick={() => setFileViewMode(fileViewMode === 'preview' ? 'edit' : 'preview')}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors duration-200 ${
                  fileViewMode === 'preview'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-200/60 text-slate-600 hover:bg-slate-300/60'
                }`}
              >
                {fileViewMode === 'preview' ? 'Edit Mode' : 'Preview Mode'}
              </button>
              <div className="text-xs text-slate-500">
                {fileViewMode === 'preview' ? 'Preview' : 'Editable'}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
        {fileViewMode === 'preview' ? (
          // 🆕 预览模式：语法高亮展示
          <div className="h-full overflow-auto bg-slate-50/50">
            <PythonSyntaxHighlighter>{displayContent}</PythonSyntaxHighlighter>
          </div>
            ) : (
              // 编辑模式：可编辑的 textarea
              <div className="h-full p-4 overflow-hidden">
                <textarea
                  key={`${file.filename}-python-editor`}
                  ref={(ref) => {
                    textareaRef.current = ref;
                    if (ref && fileSystem.getActiveFile()?.filename === file.filename) {
                      activeTextareaRef.current = ref;
                    }
                  }}
                  className="w-full h-full border-none resize-none focus:outline-none font-mono text-sm"
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word'
                  }}
                  defaultValue={displayContent}
                  onChange={(e) => handleFileContentChange(file.filename, e.target.value)}
                  placeholder="Edit Python code..."
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (effectiveFileType === 'markdown') {
      return (
        <div className="h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-200/60 bg-white/60">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Markdown File
            </h3>
            <div className="flex items-center gap-3">
              {/* 🆕 统一的模式切换按钮 */}
              <button
                onClick={() => setFileViewMode(fileViewMode === 'preview' ? 'edit' : 'preview')}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors duration-200 ${
                  fileViewMode === 'preview'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-200/60 text-slate-600 hover:bg-slate-300/60'
                }`}
              >
                {fileViewMode === 'preview' ? 'Edit Mode' : 'Preview Mode'}
              </button>
              <div className="text-xs text-slate-500">
                {fileViewMode === 'preview' ? 'Preview' : 'Editable'}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {fileViewMode === 'preview' ? (
              <MarkdownRenderer taskId={taskId}>{displayContent}</MarkdownRenderer>
            ) : (
              <div className="h-full p-4 overflow-hidden">
                <textarea
                  key={`${file.filename}-markdown-editor`}
                  ref={(ref) => {
                    textareaRef.current = ref;
                    if (ref && fileSystem.getActiveFile()?.filename === file.filename) {
                      activeTextareaRef.current = ref;
                    }
                  }}
                  className="w-full h-full border-none resize-none focus:outline-none font-mono text-sm"
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word'
                  }}
                  defaultValue={displayContent}
                  onChange={(e) => handleFileContentChange(file.filename, e.target.value)}
                  placeholder="Edit markdown content..."
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col bg-white/90 backdrop-blur-sm rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-slate-200/60 bg-white/60">
          <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {effectiveFileType === 'text' ? 'Text File' : `${effectiveFileType.toUpperCase()} File`}
          </h3>
          <div className="flex items-center gap-3">
            {/* 🆕 统一的模式切换按钮 */}
            <button
              onClick={() => setFileViewMode(fileViewMode === 'preview' ? 'edit' : 'preview')}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors duration-200 ${
                fileViewMode === 'preview'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-200/60 text-slate-600 hover:bg-slate-300/60'
              }`}
            >
              {fileViewMode === 'preview' ? 'Edit Mode' : 'Preview Mode'}
            </button>
            <div className="text-xs text-slate-500">
              {fileViewMode === 'preview' ? 'Preview' : 'Editable'}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {fileViewMode === 'preview' ? (
            // 🆕 预览模式：只读文本显示
            <div className="h-full p-4 overflow-auto bg-slate-50/50">
              <pre className="font-mono text-sm text-slate-800 whitespace-pre-wrap break-words">
                {displayContent}
              </pre>
            </div>
          ) : (
            // 编辑模式：可编辑的 textarea
            <div className="h-full p-4 overflow-hidden">
              <textarea
                key={`${file.filename}-text-editor`}
                ref={(ref) => {
                  textareaRef.current = ref;
                  if (ref && fileSystem.getActiveFile()?.filename === file.filename) {
                    activeTextareaRef.current = ref;
                  }
                }}
                className="w-full h-full border-none resize-none focus:outline-none font-mono text-sm"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word'
                }}
                defaultValue={displayContent}
                onChange={(e) => handleFileContentChange(file.filename, e.target.value)}
                placeholder="Edit file content..."
              />
            </div>
          )}
        </div>
      </div>
    )
  }, [getFileContent, isViewingHistory, fileViewMode, handleFileContentChange, taskId]);

  // 🚨 移除会覆盖用户输入的历史恢复逻辑
  // 历史内容现在通过getFileContent函数动态获取，不再自动覆盖fileSystem中的内容

  // 如果只显示文件树
  if (showOnlyFileTree) {
    return (
      <div className="h-full flex flex-col bg-transparent relative">
        <div className="border-b border-white/20 px-4 py-3 bg-white/30 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <FolderTree className="h-4 w-4" />
              File Explorer
            </h3>
            <button
              onClick={() => setNewItemDialog({ 
                show: true, 
                type: 'file', 
                parentPath: '',
                inputValue: ''
              })}
              className="p-1.5 hover:bg-white/40 rounded-lg transition-colors duration-200 text-slate-600 hover:text-slate-800"
              title="Create new file"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          {renderFileTree(fileSystem.getVirtualFileStructure())}
        </div>

        {/* 右键菜单 */}
        {showFileContextMenu.show && (
          <div
            className="fixed bg-white/90 backdrop-blur-xl border border-white/30 rounded-xl shadow-xl py-2 z-50 min-w-[160px]"
            style={{ left: showFileContextMenu.x, top: showFileContextMenu.y }}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-white/60 transition-colors duration-200 flex items-center gap-2"
              onClick={() => {
                setNewItemDialog({ 
                  show: true, 
                  type: 'file', 
                  parentPath: showFileContextMenu.isFolder ? showFileContextMenu.filename : '',
                  inputValue: ''
                })
                setShowFileContextMenu(prev => ({ ...prev, show: false }))
              }}
            >
              <Plus className="h-4 w-4" />
              New File
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-white/60 transition-colors duration-200 flex items-center gap-2"
              onClick={() => {
                setNewItemDialog({ 
                  show: true, 
                  type: 'folder', 
                  parentPath: showFileContextMenu.isFolder ? showFileContextMenu.filename : '',
                  inputValue: ''
                })
                setShowFileContextMenu(prev => ({ ...prev, show: false }))
              }}
            >
              <FolderTree className="h-4 w-4" />
              New Folder
            </button>
          </div>
        )}

        {/* 🆕 新建文件/文件夹对话框 */}
        {newItemDialog.show && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white/90 backdrop-blur-xl border border-white/30 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Create New {newItemDialog.type === 'file' ? 'File' : 'Folder'}
              </h3>
              
              <div className="space-y-4">
                {newItemDialog.parentPath && (
                  <div>
                    <label className="text-sm text-slate-600">Location:</label>
                    <div className="text-sm text-slate-800 font-mono bg-slate-100/80 rounded px-2 py-1">
                      {newItemDialog.parentPath || '/'}
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="text-sm text-slate-600 block mb-2">
                    {newItemDialog.type === 'file' ? 'File' : 'Folder'} Name:
                  </label>
                  <input
                    type="text"
                    value={newItemDialog.inputValue}
                    onChange={(e) => setNewItemDialog(prev => ({ ...prev, inputValue: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateNewItem();
                      } else if (e.key === 'Escape') {
                        setNewItemDialog({ show: false, type: 'file', parentPath: '', inputValue: '' });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder={newItemDialog.type === 'file' ? 'example.txt' : 'folder-name'}
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setNewItemDialog({ show: false, type: 'file', parentPath: '', inputValue: '' })}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNewItem}
                  disabled={!newItemDialog.inputValue.trim()}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 如果只显示工作空间（文件编辑器和终端）
  if (showOnlyWorkspace) {
    return (
      <div className="h-full flex flex-col bg-transparent">
        {/* 文件标签栏 */}
        <div className="flex items-center border-b border-white/20 bg-white/30 backdrop-blur-sm min-h-[40px] flex-shrink-0">
          {/* 标签页滚动区域 */}
          <div className="flex-1 flex items-center overflow-hidden">
            <div
              ref={tabsContainerRef}
              className="flex overflow-x-auto flex-1 h-full scrollbar-thin"
              style={{ 
                scrollBehavior: 'smooth',
                scrollbarWidth: 'thin',
                scrollbarColor: '#94a3b8 transparent'
              }}
              onWheel={(e) => {
                if (tabsContainerRef.current) {
                  e.preventDefault()
                  tabsContainerRef.current.scrollLeft += e.deltaY
                }
              }}
            >
              {openTabs.map(tab => (
                <div
                  key={tab.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTabClick(tab.filename)}
                  className={`flex items-center gap-2 px-3 h-10 text-sm cursor-pointer min-w-[120px] max-w-[200px] border-r border-white/20 flex-shrink-0 transition-all duration-200 ${
                    activeFile?.filename === tab.filename && selectedView === 'editing'
                      ? 'bg-white/60 text-slate-900 shadow-sm' 
                      : 'text-slate-600 hover:bg-white/40 hover:text-slate-800'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate flex-1">{tab.filename}</span>
                  {tab.isDirty && <span className="w-2 h-2 bg-orange-400 rounded-full flex-shrink-0" />}
                  <button
                    onClick={(e) => handleCloseTab(tab.filename, e)}
                    className="p-0.5 hover:bg-white/50 rounded flex-shrink-0 transition-colors duration-200"
                    aria-label={`Close tab ${tab.filename}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 视图选择按钮 */}
          <div className="flex border-l border-white/20 flex-shrink-0">
            {/* 🆕 Search按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs flex items-center justify-center gap-1 transition-all duration-200 ${
                selectedView === 'search' ? 'bg-white/60 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/40 hover:text-slate-800'
              }`}
              onClick={() => setSelectedView('search')}
            >
              <Search className="h-3 w-3" />
              <span>Search</span>
              {hasSearchResults && (
                <span className="text-xs bg-emerald-100/80 text-emerald-700 px-1 py-0.5 rounded-full">
                  {searchResults.length}
                </span>
              )}
            </Button>
            
            {/* 🆕 Web按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs flex items-center justify-center gap-1 border-l border-white/20 transition-all duration-200 ${
                selectedView === 'web' ? 'bg-white/60 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/40 hover:text-slate-800'
              }`}
              onClick={() => setSelectedView('web')}
            >
              <Globe className="h-3 w-3" />
              <span>Web</span>
              {hasWebContent && (
                <span className="text-xs bg-purple-100/80 text-purple-700 px-1 py-0.5 rounded-full">
                  •
                </span>
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs flex items-center justify-center gap-1 transition-all duration-200 ${
                selectedView === 'terminal' ? 'bg-white/60 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/40 hover:text-slate-800'
              }`}
              onClick={() => setSelectedView('terminal')}
            >
              <Terminal className="h-3 w-3" />
              <span>Terminal</span>
              {terminalOutput.length > 0 && (
                <span className="text-xs bg-blue-100/80 text-blue-700 px-1 py-0.5 rounded-full">
                  {Math.floor(terminalOutput.length / 2)}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 px-3 rounded-none text-xs flex items-center justify-center gap-1 border-l border-white/20 transition-all duration-200 ${
                selectedView === 'info' ? 'bg-white/60 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/40 hover:text-slate-800'
              }`}
              onClick={() => setSelectedView('info')}
            >
              <Info className="h-3 w-3" />
              <span>Info</span>
            </Button>
          </div>

          {/* 增强的状态指示器 */}
          <div className="flex items-center border-l border-white/20 flex-shrink-0 px-3">
            {saveStatus !== 'idle' && (
              <div className={`flex items-center gap-2 text-xs transition-all duration-300 ${
                saveStatus === 'saving' ? 'text-blue-600' :
                saveStatus === 'saved' ? 'text-green-600' :
                'text-red-600'
              }`}>
                {saveStatus === 'saving' && (
                  <>
                    <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-medium">Saving...</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircle2 className="h-4 w-4 animate-pulse" />
                    <span className="font-medium">Saved</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <XCircle className="h-4 w-4 animate-bounce" />
                    <span className="font-medium">Save Failed</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 🆕 内容区域 - 添加Search和Web页面 */}
        <div className="flex-1 overflow-hidden">
          {/* 🆕 Search页面 - 统一与Web页面的现代化风格 */}
          {selectedView === 'search' && (
            <div className="h-full overflow-hidden bg-gradient-to-br from-slate-50/90 via-white/95 to-blue-50/90 backdrop-blur-xl">
              {hasSearchResults ? (
                <div className="h-full flex flex-col">
                  {/* Search页面标题栏 - 与Web页面统一风格 */}
                  <div className="p-6 border-b border-white/50 bg-white/80 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-100/80 rounded-2xl">
                        <Search className="h-7 w-7 text-blue-600" />
              </div>
                      <div className="flex-1">
                        <h2 className="text-2xl font-semibold text-slate-800">Search Results</h2>
                        <p className="text-sm text-slate-600 mt-1">
                          {searchResults.length} results found from AI search
                        </p>
            </div>
                      {/* 状态指示器 */}
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100/80 rounded-xl">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-sm font-medium text-emerald-700">Loaded</span>
          </div>
              </div>
            </div>

                  {/* 搜索结果列表 - 紧凑设计，白色背景对比 */}
                  <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
                    <div className="space-y-3 max-w-6xl mx-auto">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          className="group bg-white/90 backdrop-blur-sm border border-white/60 rounded-xl p-4 hover:border-blue-200 hover:shadow-lg transition-all duration-200"
                        >
                          <div className="flex gap-4">
                            {/* 左侧内容 */}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-base font-medium text-slate-800 mb-2 line-clamp-2 group-hover:text-blue-700 transition-colors">
                                {result.title}
                              </h3>
                              <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed mb-3">
                                {result.snippet}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                                <span className="font-mono truncate max-w-96">{result.link}</span>
                    </div>
                  </div>
                            
                            {/* 右侧按钮 */}
                            <div className="flex-shrink-0 flex flex-col justify-center">
                              <a
                                href={result.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 rounded-lg transition-colors text-sm font-medium"
                              >
                                <Globe className="h-4 w-4" />
                                <span>View</span>
                              </a>
                    </div>
                  </div>
                </div>
                          ))}
                        </div>
                      </div>
                  </div>
              ) : (
                /* Search空状态 - 与Web页面统一的macOS风格 */
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md mx-auto p-8">
                    <div className="relative mb-8">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full blur-2xl opacity-20 animate-pulse" />
                      <div className="relative p-6 bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-white/60">
                        <Search className="h-16 w-16 mx-auto text-slate-400" />
                </div>
                      </div>
                    <h2 className="text-2xl font-semibold text-slate-700 mb-4">Waiting for Search Results</h2>
                    <p className="text-slate-500 leading-relaxed">
                      AI search results will appear here when available
                    </p>
                    <div className="mt-6 flex justify-center">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* 🆕 Web页面 - 支持HTML文件显示和源码编辑 */}
          {selectedView === 'web' && (
            <div className="h-full overflow-hidden bg-gradient-to-br from-slate-50/90 via-white/95 to-purple-50/90 backdrop-blur-xl">
              {hasWebContent ? (
                <div className="h-full flex flex-col">
                  {/* Web页面标题栏 */}
                  <div className="p-6 border-b border-white/50 bg-white/80 backdrop-blur-sm">
            <div className="flex items-center gap-4">
                      <div className="p-3 bg-purple-100/80 rounded-2xl">
                        <Globe className="h-7 w-7 text-purple-600" />
            </div>
                      <div className="flex-1">
                        <h2 className="text-2xl font-semibold text-slate-800">
                          {webContent.endsWith('.html') ? 'HTML Preview' : 'Web Content'}
                        </h2>
                        <p className="text-sm text-slate-600 mt-1 font-mono bg-slate-100/80 px-3 py-1 rounded-lg inline-block">
                          {webContent}
                        </p>
              </div>
                      {/* 🆕 HTML文件编辑按钮 */}
                      {webContent.endsWith('.html') && (
                        <button
                          onClick={() => {
                            // 切换到editing视图并激活HTML文件
                            const htmlFile = fileSystem.getFile(webContent);
                            if (htmlFile) {
                              fileSystem.setActiveTab(webContent);
                              setSelectedView('editing');
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                          <Edit className="h-4 w-4" />
                          <span>Edit Source</span>
                        </button>
                      )}
                      {/* 状态指示器 */}
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100/80 rounded-xl">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-sm font-medium text-emerald-700">Loaded</span>
          </div>
                    </div>
                  </div>

                  {/* Web内容显示区域 */}
                  <div className="flex-1 relative bg-white/50 backdrop-blur-sm">
                    {webContent.endsWith('.html') ? (
                      (() => {
                        const htmlFile = fileSystem.getFile(webContent);
                        const processedHtml = htmlFile
                          ? rewriteHtmlAssetUrls(htmlFile.content, taskId, {
                              cacheKey: htmlFile.lastSaved ?? htmlFile.content.length
                            })
                          : '';
                        const previewKey = `html-preview-${webContent}-${processedHtml.length}`;
                        return (
                          <iframe
                            key={previewKey} // 🚨 添加key确保内容变化时重新渲染
                            srcDoc={processedHtml}
                            className="w-full h-full border-0 rounded-none"
                            title={`HTML Preview: ${webContent}`}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-modals allow-popups-to-escape-sandbox allow-downloads"
                            style={{ minHeight: '0', height: '100%', maxHeight: '100%' }}
                            onLoad={() => {}} // 🌐 HTML iframe loaded successfully
                            onError={() => {}} // 🌐 HTML iframe failed to load
                          />
                        );
                      })()
                    ) : (
                      // 普通URL内容显示
                    <iframe
                      src={convertApiUrl(webContent)}
                      className="w-full h-full border-0 rounded-none"
                      title="Web Content Display"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-modals allow-popups-to-escape-sandbox allow-downloads"
                      style={{ minHeight: '0', height: '100%', maxHeight: '100%' }}
                        onLoad={() => {}} // 🌐 Iframe loaded successfully
                        onError={() => {}} // 🌐 Iframe failed to load
                    />
                    )}
            </div>
              </div>
              ) : (
                /* Web空状态 - macOS风格 */
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md mx-auto p-8">
                    <div className="relative mb-8">
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full blur-2xl opacity-20 animate-pulse" />
                      <div className="relative p-6 bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-white/60">
                        <Globe className="h-16 w-16 mx-auto text-slate-400" />
          </div>
      </div>
                    <h2 className="text-2xl font-semibold text-slate-700 mb-4">Waiting for Web Content</h2>
                    <p className="text-slate-500 leading-relaxed">
                      When AI provides a web URL or HTML file, content will be safely displayed here
                    </p>
                    <div className="mt-6 flex justify-center">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        </div>
      </div>
                    </div>
              )}
              </div>
          )}

          {/* 📝 Editing View */}
              {selectedView === 'editing' && activeFile && renderFileContent()}

              {selectedView === 'editing' && !activeFile && (
                <div className="h-full flex items-center justify-center bg-white/20 backdrop-blur-sm">
                  <div className="text-center text-slate-500">
                    <FileText className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                    <p>No file selected</p>
                    <p className="text-sm mt-1">Select a file from the tree to start editing</p>
                  </div>
                </div>
              )}

          {/* 🖥️ Terminal View */}
              {selectedView === 'terminal' && (
                <div className="h-full flex flex-col bg-slate-900/95 backdrop-blur-sm">
                  <div
                    ref={terminalDisplayRef}
                    className="flex-1 overflow-y-auto p-4 font-mono text-sm custom-scrollbar-dark"
                  >
                    {displayedTerminalOutput.length > 0 ? (
                      displayedTerminalOutput.map((line, i) => (
                        <div
                          key={i}
                          className={`mb-1 ${
                            line.startsWith('$') ? 'text-green-400 font-bold' : 
                            line.startsWith('>') ? 'text-sky-400' : 'text-slate-300'
                          }`}
                          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                        >
                          {line}
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-400 text-center py-8">
                        Waiting for terminal output...
                      </div>
                    )}
                  </div>
                  <div className="flex items-center p-2 border-t border-slate-700/50 backdrop-blur-sm flex-shrink-0">
                    <span className="text-slate-400 font-mono text-sm mr-2">&gt;</span>
                    <input
                      ref={terminalInputRef}
                      type="text"
                      value={terminalInputValue}
                      onChange={handleTerminalInputChange}
                      onKeyDown={handleTerminalInputKeyDown}
                      className="flex-1 bg-transparent text-slate-300 outline-none font-mono text-sm placeholder:text-slate-500"
                      placeholder="Type a command..."
                      disabled={isViewingHistory}
                    />
                  </div>
                </div>
              )}

          {/* ℹ️ Info View */}
              {selectedView === 'info' && (
                <div className="p-4 overflow-y-auto custom-scrollbar bg-white/20 backdrop-blur-sm">
                  <div className="space-y-6 max-w-2xl">
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-3">Task Status</h3>
                      <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                        <div className={`inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full ${
                          taskStatus === 'completed' ? 'bg-green-100/80 text-green-800' :
                          taskStatus === 'failed' ? 'bg-red-100/80 text-red-800' :
                          taskStatus === 'started' ? 'bg-blue-100/80 text-blue-800' :
                          'bg-slate-200/80 text-slate-800'
                        }`}>
                          {taskStatus === 'completed' ? '✓ Completed' :
                           taskStatus === 'failed' ? '✗ Failed' :
                           taskStatus === 'started' ? '● Running' : 
                           taskStatus === 'history' ? '📜 History View' : '○ Waiting'}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-slate-900 mb-3">Project Overview</h3>
                      <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 space-y-2 text-sm border border-white/30">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Total files:</span>
                          <span>{countAllFiles(fileSystem.getVirtualFileStructure())}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Open tabs:</span>
                          <span>{openTabs.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Modified files:</span>
                          <span>{fileSystem.getDirtyFiles().length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Steps completed:</span>
                          <span>{activities?.length || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Runtime:</span>
                          <span>{getRuntime()}</span>
                        </div>
                        {isViewingHistory && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">History mode:</span>
                            <span className="text-amber-600">Active</span>
                          </div>
                        )}
                      </div>
                    </div>

                {/* Cache Status */}
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-3">Cache Status</h3>
                      <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 space-y-2 text-sm border border-white/30">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Cached files:</span>
                          <span>{fileSystem.getCacheStatus().totalFiles}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Active tabs:</span>
                          <span>{fileSystem.getCacheStatus().openTabs}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Unsaved changes:</span>
                          <span>{fileSystem.getCacheStatus().dirtyFiles}</span>
                        </div>
                        {fileSystem.getCacheStatus().cachedFiles.length > 0 && (
                          <div>
                            <span className="text-slate-600 block mb-1">Cached files:</span>
                            <div className="text-xs text-slate-500 max-h-20 overflow-y-auto">
                              {fileSystem.getCacheStatus().cachedFiles.map(filename => (
                                <div key={filename} className="truncate">• {filename}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {activeFile && (
                      <div>
                        <h3 className="font-semibold text-slate-900 mb-3">
                          Current File {activeFile.isDirty ? <span className="text-orange-500 font-normal">(Unsaved)</span> : ''}
                        </h3>
                        <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 space-y-2 text-sm border border-white/30">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Name:</span>
                            <span className="font-mono">{activeFile.filename}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Type:</span>
                            <span className="capitalize">{activeFile.fileType}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Size:</span>
                            <span>{formatFileSize(new Blob([activeFile.content]).size)}</span>
                          </div>
                          {(activeFile.fileType === 'text' || activeFile.fileType === 'markdown') && (
                            <div className="flex justify-between">
                              <span className="text-slate-600">Lines:</span>
                              <span>{activeFile.content.split('\n').length}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

        {/* 🚀 历史进度条 - 底部 */}
        {historyLength > 0 && (
          <div className="border-t border-white/20 bg-white/40 backdrop-blur-sm p-3 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onHistoryChange?.(Math.max(0, (currentHistoryIndexValue ?? 0) - 1))}
                  disabled={currentHistoryIndexValue === 0}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-slate-600 font-medium min-w-[100px] text-center">
                  {(currentHistoryIndexValue ?? 0) + 1} / {historyLength}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onHistoryChange?.(Math.min(historyLength - 1, (currentHistoryIndexValue ?? -1) + 1))}
                  disabled={!isViewingHistory || (currentHistoryIndexValue ?? -1) >= historyLength - 1}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
          </div>
              
              <div className="flex-1 px-2">
                <Slider
                  value={[isViewingHistory ? (currentHistoryIndexValue ?? 0) : (historyLength - 1)]}
                  onValueChange={(value) => {
                    if (value[0] !== (isViewingHistory ? (currentHistoryIndexValue ?? 0) : (historyLength - 1))) {
                      onHistoryChange?.(value[0]);
                    }
                  }}
                  max={Math.max(0, historyLength - 1)}
                  min={0}
                  step={1}
                  className="w-full"
                />
        </div>
              
              <div className="flex items-center gap-2">
                {isViewingHistory && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onHistoryChange?.(-1)}
                    className="text-xs h-7 px-3"
                  >
                    Back to Live
                  </Button>
                )}
                <div className={`text-xs px-2 py-1 rounded-md font-medium ${
                  isViewingHistory 
                    ? 'text-amber-600 bg-amber-100/80' 
                    : 'text-green-600 bg-green-100/80'
                }`}>
                  {isViewingHistory ? 'History Mode' : 'Live Mode'}
      </div>
              </div>
            </div>
          </div>
        )}

        {/* 🆕 新建文件/文件夹对话框 - showOnlyWorkspace 模式 */}
        {newItemDialog.show && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white/90 backdrop-blur-xl border border-white/30 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Create New {newItemDialog.type === 'file' ? 'File' : 'Folder'}
              </h3>
              
              <div className="space-y-4">
                {newItemDialog.parentPath && (
                  <div>
                    <label className="text-sm text-slate-600">Location:</label>
                    <div className="text-sm text-slate-800 font-mono bg-slate-100/80 rounded px-2 py-1">
                      {newItemDialog.parentPath || '/'}
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="text-sm text-slate-600 block mb-2">
                    {newItemDialog.type === 'file' ? 'File' : 'Folder'} Name:
                  </label>
                  <input
                    type="text"
                    value={newItemDialog.inputValue}
                    onChange={(e) => setNewItemDialog(prev => ({ ...prev, inputValue: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateNewItem();
                      } else if (e.key === 'Escape') {
                        setNewItemDialog({ show: false, type: 'file', parentPath: '', inputValue: '' });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder={newItemDialog.type === 'file' ? 'example.txt' : 'folder-name'}
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setNewItemDialog({ show: false, type: 'file', parentPath: '', inputValue: '' })}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNewItem}
                  disabled={!newItemDialog.inputValue.trim()}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
  }
})



ComputerView.displayName = 'ComputerView'
