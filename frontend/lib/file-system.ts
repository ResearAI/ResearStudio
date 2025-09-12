import { EventEmitter } from 'events'

// File system node interface
export interface FileSystemNode {
  path: string
  name: string
  type: 'file' | 'directory'
  content?: string
  size?: number
  lastModified: number
  parent?: string
  children?: FileSystemNode[]
  
  // State flags
  isDirty: boolean
  isNew: boolean
  isLocked: boolean
  isOpen: boolean
  isActive: boolean
  
  // History for undo/redo
  history?: string[]
  historyIndex?: number
}

// Tab interface
export interface FileTab {
  path: string
  isDirty: boolean
}

// External file structure interface (for backend compatibility)
export interface ExternalFileNode {
  name: string
  type: 'file' | 'directory'
  content?: string
  size?: number
  children?: ExternalFileNode[]
}

/**
 * Enhanced File System Manager
 * Provides complete IDE-level file management functionality
 */
export class EnhancedFileSystemManager extends EventEmitter {
  private fileMap = new Map<string, FileSystemNode>()
  private openTabs: string[] = []
  private activeTab: string | null = null
  private taskId: string
  private syncTimer: NodeJS.Timeout | null = null

  constructor(taskId: string) {
    super()
    this.taskId = taskId
    this.initializeRootDirectory()
  }

  // ==================== PATH UTILITIES ====================

  private normalizePath(path: string): string {
    if (!path) return '/'
    if (path === '/') return '/'
    // 确保路径以 / 开头
    return path.startsWith('/') ? path : `/${path}`
  }

  private stripLeadingSlash(path: string): string {
    if (!path || path === '/') return ''
    return path.startsWith('/') ? path.slice(1) : path
  }

  // ==================== INITIALIZATION ====================

  private initializeRootDirectory() {
    const root: FileSystemNode = {
      path: '/',
      name: 'resear-pro-task',
      type: 'directory',
      lastModified: Date.now(),
      children: [],
      isDirty: false,
      isNew: false,
      isLocked: false,
      isOpen: false,
      isActive: false
    }
    this.fileMap.set('/', root)
    console.log('Initialized root directory')
  }

  // ==================== TREE MANAGEMENT ====================

  getFileTree(): FileSystemNode {
    return this.buildTreeStructure('/')
  }

  private buildTreeStructure(path: string): FileSystemNode {
    const node = this.fileMap.get(path)
    if (!node) {
      throw new Error(`Node not found: ${path}`)
    }

    const result: FileSystemNode = { ...node }
    
    if (node.type === 'directory') {
      const children = Array.from(this.fileMap.values())
        .filter(child => child.parent === path)
        .sort((a, b) => {
          // Directories first, then files
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
        .map(child => this.buildTreeStructure(child.path))
      
      result.children = children
    }

    return result
  }

  getNode(path: string): FileSystemNode | null {
    const normalizedPath = this.normalizePath(path)
    return this.fileMap.get(normalizedPath) || null
  }

  // ==================== TAB MANAGEMENT ====================

  getOpenTabs(): FileTab[] {
    return this.openTabs.map(path => {
      const node = this.fileMap.get(path)
      return {
        path,
        isDirty: node?.isDirty || false
      }
    })
  }

  getActiveTab(): string | null {
    return this.activeTab
  }

  openFile(path: string): FileSystemNode {
    const normalizedPath = this.normalizePath(path)
    let node = this.fileMap.get(normalizedPath)
    
    if (!node) {
      // Create a new file node if it doesn't exist
      const parentPath = this.getParentPath(normalizedPath)
      const fileName = this.getFileName(normalizedPath)
      
      console.log('Creating new file node:', normalizedPath, 'parent:', parentPath, 'name:', fileName)
      node = this.createFileNode(normalizedPath, fileName, parentPath, '')
    }

    // Mark as open
    node.isOpen = true
    
    // Add to tabs if not already open
    if (!this.openTabs.includes(normalizedPath)) {
      this.openTabs.push(normalizedPath)
    }

    // Set as active
    this.activateTab(normalizedPath)
    
    console.log('File opened:', normalizedPath)
    this.emit('fileOpened', normalizedPath)
    return node
  }

  activateTab(path: string): void {
    const normalizedPath = this.normalizePath(path)
    
    if (!this.openTabs.includes(normalizedPath)) {
      this.openFile(normalizedPath)
      return
    }

    // Update active states
    if (this.activeTab) {
      const prevNode = this.fileMap.get(this.activeTab)
      if (prevNode) {
        prevNode.isActive = false
      }
    }

    const node = this.fileMap.get(normalizedPath)
    if (node) {
      node.isActive = true
      this.activeTab = normalizedPath
      console.log('Tab activated:', normalizedPath)
      this.emit('tabActivated', normalizedPath)
    }
  }

  closeFile(path: string): void {
    const normalizedPath = this.normalizePath(path)
    const tabIndex = this.openTabs.indexOf(normalizedPath)
    if (tabIndex === -1) return

    const node = this.fileMap.get(normalizedPath)
    if (node) {
      node.isOpen = false
      node.isActive = false
    }

    // Remove from tabs
    this.openTabs.splice(tabIndex, 1)

    // Handle active tab change
    if (this.activeTab === normalizedPath) {
      if (this.openTabs.length > 0) {
        // Switch to adjacent tab
        const newIndex = Math.min(tabIndex, this.openTabs.length - 1)
        this.activateTab(this.openTabs[newIndex])
      } else {
        this.activeTab = null
      }
    }

    this.emit('fileClosed', normalizedPath)
  }

  // ==================== FILE OPERATIONS ====================

  createFile(parentPath: string, name: string, content: string = ''): FileSystemNode {
    const normalizedParentPath = this.normalizePath(parentPath)
    const fullPath = this.joinPath(normalizedParentPath, name)
    
    // Validation
    if (this.fileMap.has(fullPath)) {
      throw new Error(`File already exists: ${name}`)
    }

    if (!this.isValidFileName(name)) {
      throw new Error(`Invalid file name: ${name}`)
    }

    // Ensure parent directory exists
    this.ensureDirectory(normalizedParentPath)

    // Create file node
    const node = this.createFileNode(fullPath, name, normalizedParentPath, content, true)
    
    console.log('File created:', fullPath)
    this.emit('fileCreated', fullPath)
    return node
  }

  createDirectory(parentPath: string, name: string): FileSystemNode {
    const normalizedParentPath = this.normalizePath(parentPath)
    const fullPath = this.joinPath(normalizedParentPath, name)
    
    // Validation
    if (this.fileMap.has(fullPath)) {
      throw new Error(`Directory already exists: ${name}`)
    }

    if (!this.isValidFileName(name)) {
      throw new Error(`Invalid directory name: ${name}`)
    }

    // Ensure parent directory exists
    this.ensureDirectory(normalizedParentPath)

    // Create directory node
    const node: FileSystemNode = {
      path: fullPath,
      name,
      type: 'directory',
      parent: normalizedParentPath,
      lastModified: Date.now(),
      children: [],
      isDirty: false,
      isNew: true,
      isLocked: false,
      isOpen: false,
      isActive: false
    }

    this.fileMap.set(fullPath, node)
    this.emit('directoryCreated', fullPath)
    return node
  }

  deleteNode(path: string): void {
    const normalizedPath = this.normalizePath(path)
    if (normalizedPath === '/') {
      throw new Error('Cannot delete root directory')
    }

    const node = this.fileMap.get(normalizedPath)
    if (!node) return

    // Close file if open
    if (node.isOpen) {
      this.closeFile(normalizedPath)
    }

    // Recursively delete children
    if (node.type === 'directory') {
      const children = Array.from(this.fileMap.values())
        .filter(child => child.parent === normalizedPath)
      
      for (const child of children) {
        this.deleteNode(child.path)
      }
    }

    // Remove from map
    this.fileMap.delete(normalizedPath)
    this.emit('nodeDeleted', normalizedPath)
  }

  renameNode(path: string, newName: string): FileSystemNode {
    const normalizedPath = this.normalizePath(path)
    const node = this.fileMap.get(normalizedPath)
    if (!node) {
      throw new Error(`Node not found: ${normalizedPath}`)
    }

    if (!this.isValidFileName(newName)) {
      throw new Error(`Invalid name: ${newName}`)
    }

    const newPath = this.joinPath(node.parent || '/', newName)
    
    if (this.fileMap.has(newPath)) {
      throw new Error(`Name already exists: ${newName}`)
    }

    // Update node
    this.fileMap.delete(normalizedPath)
    node.path = newPath
    node.name = newName
    node.lastModified = Date.now()
    this.fileMap.set(newPath, node)

    // Update children paths recursively
    if (node.type === 'directory') {
      this.updateChildrenPaths(normalizedPath, newPath)
    }

    // Update tabs
    const tabIndex = this.openTabs.indexOf(normalizedPath)
    if (tabIndex !== -1) {
      this.openTabs[tabIndex] = newPath
    }

    if (this.activeTab === normalizedPath) {
      this.activeTab = newPath
    }

    this.emit('nodeRenamed', { oldPath: normalizedPath, newPath })
    return node
  }

  // ==================== CONTENT MANAGEMENT ====================

  updateFileContent(path: string, content: string): void {
    const normalizedPath = this.normalizePath(path)
    const node = this.fileMap.get(normalizedPath)
    if (!node || node.type !== 'file') return

    // Don't update if file is locked (new file being created)
    if (node.isLocked) return

    // Save to history for undo/redo
    this.saveToHistory(node, node.content || '')

    // Update content
    const oldContent = node.content || ''
    node.content = content
    node.size = new Blob([content]).size
    node.lastModified = Date.now()
    
    // Update dirty state
    const wasDirty = node.isDirty
    node.isDirty = content !== (node.history?.[0] || '')

    if (wasDirty !== node.isDirty) {
      this.emit('fileUpdated', normalizedPath)
    }
  }

  saveFile(path: string): void {
    const normalizedPath = this.normalizePath(path)
    const node = this.fileMap.get(normalizedPath)
    if (!node || node.type !== 'file') return

    // Clear history and reset dirty state
    if (node.content !== undefined) {
      node.history = [node.content]
      node.historyIndex = 0
    }
    
    node.isDirty = false
    node.isNew = false
    node.isLocked = false
    node.lastModified = Date.now()

    this.emit('fileSaved', normalizedPath)
  }

  revertFile(path: string): void {
    const normalizedPath = this.normalizePath(path)
    const node = this.fileMap.get(normalizedPath)
    if (!node || node.type !== 'file' || !node.history?.length) return

    // Revert to saved content
    node.content = node.history[0]
    node.isDirty = false
    node.historyIndex = 0

    this.emit('fileReverted', normalizedPath)
  }

  // ==================== UNDO/REDO SYSTEM ====================

  private saveToHistory(node: FileSystemNode, content: string): void {
    if (!node.history) {
      node.history = []
      node.historyIndex = -1
    }

    // Ensure historyIndex is defined
    if (node.historyIndex === undefined) {
      node.historyIndex = -1
    }

    // Remove any redo history if we're not at the end
    if (node.historyIndex < node.history.length - 1) {
      node.history = node.history.slice(0, node.historyIndex + 1)
    }

    // Add new state
    node.history.push(content)
    node.historyIndex = node.history.length - 1

    // Limit history size
    if (node.history.length > 50) {
      node.history = node.history.slice(-50)
      node.historyIndex = node.history.length - 1
    }
  }

  canUndo(path: string): boolean {
    const normalizedPath = this.normalizePath(path)
    const node = this.fileMap.get(normalizedPath)
    return !!(node?.history && (node.historyIndex ?? -1) > 0)
  }

  canRedo(path: string): boolean {
    const normalizedPath = this.normalizePath(path)
    const node = this.fileMap.get(normalizedPath)
    const historyIndex = node?.historyIndex ?? -1
    return !!(node?.history && historyIndex < node.history.length - 1)
  }

  undo(path: string): void {
    const normalizedPath = this.normalizePath(path)
    const node = this.fileMap.get(normalizedPath)
    if (!node || !this.canUndo(normalizedPath)) return

    // Ensure historyIndex is defined
    if (node.historyIndex === undefined) {
      node.historyIndex = 0
    }

    node.historyIndex--
    if (node.history && node.historyIndex >= 0) {
      node.content = node.history[node.historyIndex]
    }
    node.lastModified = Date.now()
    
    this.emit('fileUndone', normalizedPath)
  }

  redo(path: string): void {
    const normalizedPath = this.normalizePath(path)
    const node = this.fileMap.get(normalizedPath)
    if (!node || !this.canRedo(normalizedPath)) return

    // Ensure historyIndex is defined
    if (node.historyIndex === undefined) {
      node.historyIndex = -1
    }

    node.historyIndex++
    if (node.history && node.historyIndex < node.history.length) {
      node.content = node.history[node.historyIndex]
    }
    node.lastModified = Date.now()
    
    this.emit('fileRedone', normalizedPath)
  }

  // ==================== SEARCH FUNCTIONALITY ====================

  searchFiles(query: string): FileSystemNode[] {
    if (!query.trim()) return []

    const results: FileSystemNode[] = []
    const lowerQuery = query.toLowerCase()

    for (const node of this.fileMap.values()) {
      if (node.type === 'file' && node.name.toLowerCase().includes(lowerQuery)) {
        results.push(node)
      }
    }

    return results.sort((a, b) => a.path.localeCompare(b.path))
  }

  // ==================== EXTERNAL SYNCHRONIZATION ====================

  mergeExternalStructure(externalStructure: ExternalFileNode): void {
    console.log('Merging external structure:', externalStructure)
    
    // Clear existing files that are not new/locked (preserve user created files)
    this.clearNonUserFiles()
    
    // Process the root structure and its children directly
    if (externalStructure.children) {
      for (const child of externalStructure.children) {
        this.processExternalNode(child, '/')
      }
    }
    this.emit('structureMerged')
  }

  // 批量更新文件内容
  updateFileContentMap(contentMap: Map<string, string>): void {
    console.log('Updating file content map with', contentMap.size, 'files')
    let hasChanges = false
    
    for (const [filePath, content] of contentMap.entries()) {
      // 标准化路径 - 文件路径可能带或不带前导斜杠
      const normalizedPath = this.normalizePath(filePath)
      const node = this.fileMap.get(normalizedPath)
      
      if (node && node.type === 'file') {
        // 只在内容真的不同时才更新
        if (node.content !== content) {
          console.log('Updating content for file:', normalizedPath, 'length:', content.length)
          
          // 保存到历史记录
          this.saveToHistory(node, node.content || '')
          
          // 更新内容
          node.content = content
          node.size = new Blob([content]).size
          node.lastModified = Date.now()
          
          // 如果这个文件是从backend来的内容，不标记为dirty
          if (!node.isNew && !node.isLocked) {
            node.isDirty = false
          }
          
          hasChanges = true
        }
      } else {
        console.log('File not found for content update:', normalizedPath)
      }
    }
    
    if (hasChanges) {
      console.log('File content updated, emitting contentMapUpdated')
      this.emit('contentMapUpdated')
    }
  }

  private clearNonUserFiles(): void {
    // Remove all files that are not new or locked (i.e., backend files that may have been removed)
    const toRemove: string[] = []
    for (const [path, node] of this.fileMap.entries()) {
      if (path !== '/' && !node.isNew && !node.isLocked) {
        toRemove.push(path)
      }
    }
    
    for (const path of toRemove) {
      this.fileMap.delete(path)
    }
    
    if (toRemove.length > 0) {
      console.log('Cleared', toRemove.length, 'non-user files')
    }
  }

  private processExternalNode(external: ExternalFileNode, parentPath: string): void {
    const fullPath = parentPath === '/' ? `/${external.name}` : `${parentPath}/${external.name}`
    
    // Skip if this is a new/locked file (protect user changes)
    const existing = this.fileMap.get(fullPath)
    if (existing?.isNew || existing?.isLocked) {
      console.log('Skipping protected file:', fullPath)
      return
    }

    if (external.type === 'file') {
      // Create or update file from backend
      if (!existing) {
        console.log('Creating new file from external structure:', fullPath)
        const node = this.createFileNode(fullPath, external.name, parentPath, external.content || '', false)
        // Mark as not dirty since it comes from backend
        node.isDirty = false
        node.isNew = false
        node.isLocked = false
      } else {
        // Update existing file if content is different
        if (external.content !== undefined && existing.content !== external.content) {
          console.log('Updating existing file from external structure:', fullPath)
          existing.content = external.content
          existing.size = external.size || new Blob([external.content]).size
          existing.lastModified = Date.now()
          // Only mark as dirty if user has made changes after backend update
          existing.isDirty = false
        }
      }
    } else if (external.type === 'directory') {
      // Ensure directory exists
      this.ensureDirectory(fullPath, external.name)
      
      // Process children
      if (external.children) {
        for (const child of external.children) {
          this.processExternalNode(child, fullPath)
        }
      }
    }
  }

  // ==================== UTILITY METHODS ====================

  getDirtyFiles(): FileSystemNode[] {
    return Array.from(this.fileMap.values())
      .filter(node => node.type === 'file' && node.isDirty)
  }

  private createFileNode(
    path: string, 
    name: string, 
    parentPath: string, 
    content: string, 
    isNew: boolean = false
  ): FileSystemNode {
    const normalizedPath = this.normalizePath(path)
    const normalizedParentPath = this.normalizePath(parentPath)
    
    const node: FileSystemNode = {
      path: normalizedPath,
      name,
      type: 'file',
      content,
      size: new Blob([content]).size,
      parent: normalizedParentPath,
      lastModified: Date.now(),
      isDirty: isNew, // New files are dirty by default
      isNew,
      isLocked: isNew, // Lock new files until saved
      isOpen: false,
      isActive: false,
      history: [content],
      historyIndex: 0
    }

    this.fileMap.set(normalizedPath, node)
    console.log('Created file node:', normalizedPath)
    return node
  }

  private ensureDirectory(path: string, name?: string): void {
    const normalizedPath = this.normalizePath(path)
    if (normalizedPath === '/') return // Root already exists

    if (!this.fileMap.has(normalizedPath)) {
      const parentPath = this.getParentPath(normalizedPath)
      const dirName = name || this.getFileName(normalizedPath)
      
      // Recursively ensure parent
      this.ensureDirectory(parentPath)

      // Create directory
      const node: FileSystemNode = {
        path: normalizedPath,
        name: dirName,
        type: 'directory',
        parent: parentPath,
        lastModified: Date.now(),
        children: [],
        isDirty: false,
        isNew: false,
        isLocked: false,
        isOpen: false,
        isActive: false
      }

      this.fileMap.set(normalizedPath, node)
      console.log('Created directory:', normalizedPath)
    }
  }

  private updateChildrenPaths(oldParentPath: string, newParentPath: string): void {
    for (const node of this.fileMap.values()) {
      if (node.parent === oldParentPath) {
        const oldPath = node.path
        const newPath = this.joinPath(newParentPath, node.name)
        
        // Update map
        this.fileMap.delete(oldPath)
        node.path = newPath
        node.parent = newParentPath
        this.fileMap.set(newPath, node)
        
        // Recursively update children
        if (node.type === 'directory') {
          this.updateChildrenPaths(oldPath, newPath)
        }
      }
    }
  }

  private joinPath(parent: string, name: string): string {
    const normalizedParent = this.normalizePath(parent)
    if (normalizedParent === '/') {
      return `/${name}`
    }
    return `${normalizedParent}/${name}`
  }

  private getParentPath(path: string): string {
    const normalizedPath = this.normalizePath(path)
    if (normalizedPath === '/') return '/'
    const lastSlash = normalizedPath.lastIndexOf('/')
    return lastSlash <= 0 ? '/' : normalizedPath.substring(0, lastSlash)
  }

  private getFileName(path: string): string {
    const normalizedPath = this.normalizePath(path)
    if (normalizedPath === '/') return 'root'
    const lastSlash = normalizedPath.lastIndexOf('/')
    return normalizedPath.substring(lastSlash + 1)
  }

  private isValidFileName(name: string): boolean {
    // Basic validation - no empty names, no special characters
    return /^[a-zA-Z0-9._-]+$/.test(name) && name.length > 0 && name.length < 255
  }

  // ==================== CLEANUP ====================

  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
    }
    this.removeAllListeners()
    this.fileMap.clear()
    this.openTabs = []
    this.activeTab = null
    console.log('File system destroyed')
  }
}