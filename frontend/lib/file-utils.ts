/**
 * File Utility Functions
 * Provides common utilities for file operations and UI interactions
 */

// ==================== DEBOUNCE & THROTTLE ====================

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, wait)
    }
  }
}

// ==================== FILE TYPE DETECTION ====================

export type FileType = 
  | 'javascript' | 'typescript' | 'python' | 'html' | 'css' | 'scss' | 'less'
  | 'json' | 'yaml' | 'xml' | 'markdown' | 'text' | 'image' | 'pdf' | 'video' 
  | 'audio' | 'archive' | 'executable' | 'font' | 'unknown'

const FILE_TYPE_MAP: Record<string, FileType> = {
  // Programming languages
  'js': 'javascript',
  'jsx': 'javascript',
  'mjs': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',
  'py': 'python',
  'pyw': 'python',
  'html': 'html',
  'htm': 'html',
  'css': 'css',
  'scss': 'scss',
  'sass': 'scss',
  'less': 'less',
  
  // Data formats
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'xml': 'xml',
  'md': 'markdown',
  'markdown': 'markdown',
  'txt': 'text',
  'log': 'text',
  'ini': 'text',
  'conf': 'text',
  'config': 'text',
  
  // Media files
  'jpg': 'image',
  'jpeg': 'image',
  'png': 'image',
  'gif': 'image',
  'svg': 'image',
  'webp': 'image',
  'bmp': 'image',
  'ico': 'image',
  'pdf': 'pdf',
  'mp4': 'video',
  'avi': 'video',
  'mkv': 'video',
  'mov': 'video',
  'webm': 'video',
  'mp3': 'audio',
  'wav': 'audio',
  'flac': 'audio',
  'ogg': 'audio',
  
  // Archives and executables
  'zip': 'archive',
  'rar': 'archive',
  '7z': 'archive',
  'tar': 'archive',
  'gz': 'archive',
  'exe': 'executable',
  'msi': 'executable',
  'dmg': 'executable',
  'deb': 'executable',
  
  // Fonts
  'ttf': 'font',
  'otf': 'font',
  'woff': 'font',
  'woff2': 'font',
  'eot': 'font'
}

export function detectFileType(fileName: string): FileType {
  const extension = getFileExtension(fileName)
  return FILE_TYPE_MAP[extension] || 'unknown'
}

export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return ''
  }
  return fileName.substring(lastDot + 1).toLowerCase()
}

export function getLanguageFromFileType(fileType: FileType): string {
  const languageMap: Record<FileType, string> = {
    'javascript': 'javascript',
    'typescript': 'typescript',
    'python': 'python',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'json': 'json',
    'yaml': 'yaml',
    'xml': 'xml',
    'markdown': 'markdown',
    'text': 'text',
    'image': 'text',
    'pdf': 'text',
    'video': 'text',
    'audio': 'text',
    'archive': 'text',
    'executable': 'text',
    'font': 'text',
    'unknown': 'text'
  }
  
  return languageMap[fileType] || 'text'
}

// ==================== FILE SIZE FORMATTING ====================

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  if (i === 0) {
    return `${bytes} B`
  }
  
  const size = bytes / Math.pow(k, i)
  return `${size.toFixed(1)} ${units[i]}`
}

// ==================== VALIDATION UTILITIES ====================

export function isValidFileName(name: string): boolean {
  // Check for empty name
  if (!name || name.trim().length === 0) {
    return false
  }
  
  // Check length
  if (name.length > 255) {
    return false
  }
  
  // Check for invalid characters (Windows + Unix restrictions)
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/
  if (invalidChars.test(name)) {
    return false
  }
  
  // Check for reserved names (Windows)
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ]
  
  const nameWithoutExt = name.split('.')[0].toUpperCase()
  if (reservedNames.includes(nameWithoutExt)) {
    return false
  }
  
  // Check for names ending with space or period
  if (name.endsWith(' ') || name.endsWith('.')) {
    return false
  }
  
  return true
}

export function sanitizeFileName(name: string): string {
  // Remove invalid characters
  let sanitized = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  
  // Remove leading/trailing spaces and periods
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '')
  
  // Ensure it's not empty
  if (!sanitized) {
    sanitized = 'untitled'
  }
  
  // Ensure it's not too long
  if (sanitized.length > 255) {
    const extension = getFileExtension(sanitized)
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'))
    const maxNameLength = 255 - (extension.length > 0 ? extension.length + 1 : 0)
    sanitized = nameWithoutExt.substring(0, maxNameLength) + (extension ? `.${extension}` : '')
  }
  
  return sanitized
}

// ==================== PATH UTILITIES ====================

export function joinPath(...parts: string[]): string {
  const cleanParts = parts
    .filter(part => part && part !== '/')
    .map(part => part.replace(/^\/+|\/+$/g, ''))
    .filter(part => part.length > 0)
  
  if (cleanParts.length === 0) {
    return '/'
  }
  
  return '/' + cleanParts.join('/')
}

export function getParentPath(path: string): string {
  if (path === '/' || !path) {
    return '/'
  }
  
  const lastSlash = path.lastIndexOf('/')
  if (lastSlash <= 0) {
    return '/'
  }
  
  return path.substring(0, lastSlash)
}

export function getFileName(path: string): string {
  if (path === '/' || !path) {
    return ''
  }
  
  const lastSlash = path.lastIndexOf('/')
  return path.substring(lastSlash + 1)
}

export function normalizePath(path: string): string {
  if (!path || path === '/') {
    return '/'
  }
  
  // Remove double slashes and normalize
  const normalized = path
    .split('/')
    .filter(part => part.length > 0)
    .join('/')
  
  return '/' + normalized
}

// ==================== SEARCH UTILITIES ====================

export function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  if (!text) return false
  
  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()
  
  // Simple substring match for now
  return textLower.includes(queryLower)
}

export function highlightMatch(text: string, query: string): string {
  if (!query) return text
  
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ==================== CLIPBOARD UTILITIES ====================

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) {
    return false
  }
  
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    return false
  }
}

export async function readFromClipboard(): Promise<string | null> {
  if (!navigator.clipboard) {
    return null
  }
  
  try {
    return await navigator.clipboard.readText()
  } catch (error) {
    console.error('Failed to read from clipboard:', error)
    return null
  }
}

// ==================== TIME UTILITIES ====================

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  // Less than 1 minute
  if (diff < 60000) {
    return 'just now'
  }
  
  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  
  // Less than 1 day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  
  // More than 1 day
  return date.toLocaleDateString()
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

// ==================== MIME TYPE UTILITIES ====================

export function getMimeType(fileName: string): string {
  const extension = getFileExtension(fileName)
  
  const mimeTypes: Record<string, string> = {
    // Text
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'xml': 'text/xml',
    'md': 'text/markdown',
    
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    
    // Documents
    'pdf': 'application/pdf',
    
    // Video
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'avi': 'video/x-msvideo',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    
    // Archives
    'zip': 'application/zip',
    'tar': 'application/x-tar',
    'gz': 'application/gzip'
  }
  
  return mimeTypes[extension] || 'application/octet-stream'
}