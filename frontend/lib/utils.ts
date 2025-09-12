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
  return filename.startsWith('/') ? filename.substring(1) : filename;
};

