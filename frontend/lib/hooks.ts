import { useState, useEffect } from 'react';

// 检测是否为移动设备
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const userAgent = window.navigator.userAgent;
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
      const isMobileUA = mobileRegex.test(userAgent);
      
      // 同时检查屏幕宽度
      const isMobileWidth = window.innerWidth <= 768;
      
      setIsMobile(isMobileUA || isMobileWidth);
    };

    // 初始检查
    checkDevice();

    // 监听窗口大小变化
    window.addEventListener('resize', checkDevice);

    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);

  return isMobile;
} 