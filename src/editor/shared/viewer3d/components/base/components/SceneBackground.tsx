import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Color } from 'three';
import { useViewerTheme } from '../../../context/ViewerThemeContext';
import { useUIStore } from '@/store/uiStore';

interface SceneBackgroundProps {
  viewMode: '2D' | '3D';
}

const SceneBackground: React.FC<SceneBackgroundProps> = ({ viewMode }) => {
  const { scene, gl } = useThree();
  const { theme } = useViewerTheme();
  
  useEffect(() => {
    const backgroundColor = viewMode === '2D' && theme.mode === 'dark' 
      ? '#121212' 
      : viewMode === '2D' 
        ? '#ffffff' 
        : '#ffffff'; // 3D 모드는 항상 흰색
    
    // Scene 배경색 설정
    scene.background = new Color(backgroundColor);
    
    // Renderer 배경색도 설정
    gl.setClearColor(new Color(backgroundColor), 1.0);
    
    console.log('🎨 배경색 업데이트:', {
      viewMode,
      themeMode: theme.mode,
      backgroundColor
    });
  }, [scene, gl, viewMode, theme.mode]);
  
  return null;
};

export default SceneBackground;