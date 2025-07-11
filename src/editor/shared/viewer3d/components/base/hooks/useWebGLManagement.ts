import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const useWebGLManagement = (step: string, viewMode: string) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  // WebGL 컨텍스트 관리
  useEffect(() => {
    // WebGL 컨텍스트 손실 처리 핸들러
    const handleContextLost = (e: Event) => {
      console.warn('WebGL context lost', e);
      e.preventDefault();
      
      // 컨텍스트 손실 시 모든 Three.js 자원 정리
      if (rendererRef.current) {
        rendererRef.current.forceContextLoss();
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
    
    // WebGL 컨텍스트 복원 처리 핸들러
    const handleContextRestored = () => {
      console.log('WebGL context restored');
    };
    
    // 캔버스가 있을 때 이벤트 리스너 추가
    if (canvasRef.current) {
      canvasRef.current.addEventListener('webglcontextlost', handleContextLost);
      canvasRef.current.addEventListener('webglcontextrestored', handleContextRestored);
    }
    
    // 정리 함수
    return () => {
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('webglcontextlost', handleContextLost);
        canvasRef.current.removeEventListener('webglcontextrestored', handleContextRestored);
      }
    };
  }, [step, viewMode]);

  // 컴포넌트 언마운트 시 자원 정리
  useEffect(() => {
    return () => {
      // 렌더러 정리
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      
      // 캔버스 참조 정리
      if (canvasRef.current) {
        const gl = canvasRef.current.getContext('webgl') || canvasRef.current.getContext('webgl2');
        if (gl) {
          const loseContextExt = gl.getExtension('WEBGL_lose_context');
          if (loseContextExt) {
            loseContextExt.loseContext();
          }
        }
        canvasRef.current = null;
      }
      
      console.log('WebGL cleanup completed');
    };
  }, []);

  return {
    canvasRef,
    rendererRef,
    sceneRef
  };
}; 