import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 规范化文件名，移除前导斜杠
 * @param filename 文件名
 * @returns 规范化后的文件名
 */
export const normalizeFilename = (filename: string) => {
  if (!filename) return '';
  let normalized = filename.trim();
  if (normalized.startsWith('/')) {
    normalized = normalized.substring(1);
  }
  if (normalized.startsWith('./')) {
    normalized = normalized.substring(2);
  }
  const workspacePrefixes = ['workspace/', 'workspace\\'];
  const lowerNormalized = normalized.toLowerCase();
  for (const prefix of workspacePrefixes) {
    if (lowerNormalized.startsWith(prefix.toLowerCase())) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }
  return normalized;
};

/**
 * 为PNG资源追加去缓存参数，确保每次请求都直接命中后端
 * @param url 原始URL
 * @param cacheKey 用于生成去缓存参数的稳定值
 * @returns 新的URL（如果不是PNG则返回原值）
 */
export const appendCacheBusterForPng = (url: string, cacheKey: string | number): string => {
  if (!url) return url;

  const [withoutHash, hashFragment] = url.split('#', 2);
  const [basePath, queryString] = withoutHash.split('?', 2);

  if (!basePath.toLowerCase().endsWith('.png')) {
    return url;
  }

  const keyString = typeof cacheKey === 'number' ? Math.floor(cacheKey).toString() : String(cacheKey);
  const params = new URLSearchParams(queryString || '');
  params.set('noCache', keyString);

  const rebuilt = `${basePath}?${params.toString()}`;
  return hashFragment ? `${rebuilt}#${hashFragment}` : rebuilt;
};
