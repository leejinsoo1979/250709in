import React, { createContext, useContext, useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';

interface ViewerThemeContextType {
  theme: {
    mode: 'light' | 'dark';
  };
}

const ViewerThemeContext = createContext<ViewerThemeContextType | null>(null);

export const ViewerThemeProvider: React.FC<{ children: React.ReactNode; viewMode: '2D' | '3D' }> = ({ children, viewMode }) => {
  const originalTheme = useTheme();
  const { view2DTheme } = useUIStore();
  
  const viewerTheme = useMemo(() => {
    if (viewMode === '2D') {
      // 2D 모드에서는 view2DTheme 사용
      return {
        theme: {
          mode: view2DTheme
        }
      };
    }
    // 3D 모드에서는 원래 테마 사용
    return originalTheme;
  }, [viewMode, view2DTheme, originalTheme]);
  
  return (
    <ViewerThemeContext.Provider value={viewerTheme}>
      {children}
    </ViewerThemeContext.Provider>
  );
};

export const useViewerTheme = () => {
  const context = useContext(ViewerThemeContext);
  if (!context) {
    // ViewerThemeProvider 밖에서 사용된 경우 원래 테마 반환
    return useTheme();
  }
  return context;
};