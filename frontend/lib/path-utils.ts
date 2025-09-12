/**
 * 简化的路径工具类 - 扁平化根目录结构
 */
export class PathUtils {
    /**
     * 规范化文件路径 - 简化版本，移除多余斜杠
     */
    static normalizePath(path: string): string {
      if (!path) return '';
      
      // 移除开头和结尾的斜杠，移除多余斜杠
      return path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
    }
    
    /**
     * 检查两个路径是否指向同一个文件
     */
    static isSamePath(path1: string, path2: string): boolean {
      const normalized1 = this.normalizePath(path1);
      const normalized2 = this.normalizePath(path2);
      return normalized1 === normalized2;
    }
    
    /**
     * 从文件结构树路径转换为实际文件路径
     */
    static fromTreePath(treePath: string, parentPath: string = ''): string {
      if (!treePath) return '';
      
      // 如果是根节点
      if (treePath === '/' && !parentPath) {
        return '/';
      }
      
      // 构建完整路径
      if (parentPath && parentPath !== '/') {
        return `${parentPath}/${treePath}`;
      } else {
        return treePath;
      }
    }
    
    /**
     * 获取文件名（不包含路径）
     */
    static getFileName(path: string): string {
      if (!path) return '';
      const parts = path.split('/');
      return parts[parts.length - 1];
    }
    
    /**
     * 获取父路径
     */
    static getParentPath(path: string): string {
      if (!path || path === '/') return '/';
      const lastSlash = path.lastIndexOf('/');
      return lastSlash <= 0 ? '/' : path.substring(0, lastSlash);
    }
  }