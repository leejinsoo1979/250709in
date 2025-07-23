import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

// 클린 아키텍처: 의존성 방향 관리
import { useCameraManager } from './hooks/useCameraManager'; // 하위 레벨
import { useCanvasEventHandlers } from './hooks/useCanvasEventHandlers'; // 하위 레벨
import { useOrbitControlsConfig } from './hooks/useOrbitControlsConfig'; // 하위 레벨
import { CustomZoomController } from './hooks/useCustomZoom'; // 하위 레벨
import SceneCleanup from './components/SceneCleanup'; // 하위 레벨
import { CAMERA_SETTINGS, CANVAS_SETTINGS, LIGHTING_SETTINGS } from './utils/constants'; // 하위 레벨

// React Three Fiber의 EventManager를 위한 인터페이스 정의
interface EventManager {
  connect: (domElement: HTMLCanvasElement) => void;
  disconnect: () => void;
}

// EventManager 타입 가드
function isEventManager(value: unknown): value is EventManager {
  return (
    value !== null &&
    typeof value === 'object' &&
    'connect' in value &&
    'disconnect' in value
  );
}

// ThreeCanvas 컴포넌트 props 정의
interface ThreeCanvasProps {
  children: React.ReactNode;
  cameraPosition?: [number, number, number];
  viewMode?: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top';
  renderMode?: 'solid' | 'wireframe';
}

/**
 * Three.js Canvas 컴포넌트
 * step0 이후로는 모든 step이 configurator로 통일되어 동일하게 처리
 */
const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  children,
  cameraPosition,
  viewMode = '3D',
  view2DDirection = 'front',
  renderMode = 'wireframe'
}) => {
  // 마운트 상태 관리
  const [mounted, setMounted] = useState(false);
  const [canvasKey, setCanvasKey] = useState(() => `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [forceRender, setForceRender] = useState(0);
  
  // 캔버스 참조 저장
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<any>(null);
  
  // 클린 아키텍처: 각 책임을 전용 훅으로 위임
  const camera = useCameraManager(viewMode, cameraPosition, view2DDirection);
  const eventHandlers = useCanvasEventHandlers();
  const controlsConfig = useOrbitControlsConfig(camera.target, viewMode, camera.spaceWidth, camera.spaceHeight);
  
  // viewMode 변경 감지 및 그림자 강제 업데이트
  useEffect(() => {
    if (viewMode === '3D') {
              if (import.meta.env.DEV) {
          console.log('🔄 3D 모드 전환 - 그림자 강제 업데이트');
        }
      // 약간의 지연 후 그림자 업데이트
      setTimeout(() => {
        setForceRender(prev => prev + 1);
      }, 150);
    }
  }, [viewMode]);
  
  // 강력한 WebGL 컨텍스트 정리 함수
  const forceCleanupWebGL = useCallback(() => {
    console.log('Force cleaning up WebGL context...');
    
    // 기존 renderer 정리
    if (rendererRef.current) {
      try {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
      } catch (error) {
        console.warn('Error disposing renderer:', error);
      }
      rendererRef.current = null;
    }
    
    // 기존 canvas 정리
    if (canvasRef.current) {
      try {
        // 모든 WebGL 컨텍스트 강제 해제
        const webgl = canvasRef.current.getContext('webgl') as WebGLRenderingContext | null;
        const webgl2 = canvasRef.current.getContext('webgl2') as WebGL2RenderingContext | null;
        const experimental = canvasRef.current.getContext('experimental-webgl') as WebGLRenderingContext | null;
        
        [webgl, webgl2, experimental].forEach(gl => {
          if (gl) {
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
          }
        });
        
        // Canvas 요소 속성 초기화
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
        canvasRef.current.style.display = 'none';
        
      } catch (error) {
        console.warn('Error cleaning up canvas context:', error);
      }
      
      // DOM에서 완전히 제거
      if (canvasRef.current.parentNode) {
        canvasRef.current.parentNode.removeChild(canvasRef.current);
      }
      canvasRef.current = null;
    }
    
    // 컨테이너의 모든 canvas 요소 정리
    if (containerRef.current) {
      const canvases = containerRef.current.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        try {
          const gl = (canvas.getContext('webgl') || canvas.getContext('webgl2')) as WebGLRenderingContext | WebGL2RenderingContext | null;
          if (gl) {
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
          }
          if (canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
          }
        } catch (error) {
          console.warn('Error cleaning up stray canvas:', error);
        }
      });
    }
  }, []);

  // 새로운 캔버스 키 생성 및 강제 정리
  const regenerateCanvas = useCallback(() => {
    forceCleanupWebGL();
    
    // 즉시 새로운 키 생성 (지연 제거)
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const newKey = `canvas-${viewMode}-${timestamp}-${random}`;
    console.log('Regenerating canvas with key:', newKey);
    setCanvasKey(newKey);
    setForceRender(prev => prev + 1);
  }, [viewMode, forceCleanupWebGL]);
  
  // 마운트 시 상태 설정
  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
      forceCleanupWebGL();
    };
  }, [forceCleanupWebGL]);
  
  // ViewMode가 변경될 때 캔버스 재생성
  useEffect(() => {
    if (mounted) {
      console.log('ViewMode changed, regenerating canvas...');
      regenerateCanvas();
    }
  }, [viewMode, mounted, regenerateCanvas]);

  // OrbitControls 팬 범위 제한 (그리드 영역)
  useEffect(() => {
    if (!controlsRef.current || viewMode === '3D') return;

    const controls = controlsRef.current;
    const gridSize = 200; // 그리드 크기와 동일
    
    // 초기 카메라 거리 저장
    const initialDistance = controls.object ? controls.object.position.distanceTo(controls.target) : 10;
    
    const onControlsChange = () => {
      // 카메라 타겟 위치를 그리드 범위로 제한
      const target = controls.target;
      target.x = Math.max(-gridSize, Math.min(gridSize, target.x));
      target.y = Math.max(-gridSize, Math.min(gridSize, target.y));
      target.z = Math.max(-gridSize, Math.min(gridSize, target.z));
      
      // 카메라 위치도 그리드 범위 기준으로 제한
      const camera = controls.object;
      if (camera) {
        const distance = camera.position.distanceTo(target);
        const direction = camera.position.clone().sub(target).normalize();
        
        // 최대 줌아웃을 초기 거리의 2배로 제한
        const maxZoomDistance = initialDistance * 2;
        if (distance > maxZoomDistance) {
          camera.position.copy(target.clone().add(direction.multiplyScalar(maxZoomDistance)));
        }
        
        // 최소 줌인도 제한 (초기 거리의 10%)
        const minZoomDistance = initialDistance * 0.1;
        if (distance < minZoomDistance) {
          camera.position.copy(target.clone().add(direction.multiplyScalar(minZoomDistance)));
        }
      }
    };

    controls.addEventListener('change', onControlsChange);
    
    return () => {
      if (controls) {
        controls.removeEventListener('change', onControlsChange);
      }
    };
  }, [viewMode, mounted]);
  
  // WebGL 컨텍스트 관리
  useEffect(() => {
    const handleContextLost = (e: Event) => {
      console.warn('WebGL context lost event triggered');
      e.preventDefault();
      regenerateCanvas();
    };
    
    const handleContextRestored = () => {
      console.log('WebGL context restored');
    };
    
    if (canvasRef.current) {
      canvasRef.current.addEventListener('webglcontextlost', handleContextLost);
      canvasRef.current.addEventListener('webglcontextrestored', handleContextRestored);
      
      return () => {
        if (canvasRef.current) {
          canvasRef.current.removeEventListener('webglcontextlost', handleContextLost);
          canvasRef.current.removeEventListener('webglcontextrestored', handleContextRestored);
        }
      };
    }
  }, [regenerateCanvas]);

  // 로딩 상태
  if (!mounted) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        background: CANVAS_SETTINGS.BACKGROUND_COLOR 
      }}>
        <p>Loading 3D viewer...</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0,
        touchAction: 'none'
      }}
      onDrop={eventHandlers.handleDrop}
      onDragOver={eventHandlers.handleDragOver}
      onDragLeave={eventHandlers.handleDragLeave}
    >
      <Canvas
        key={`${canvasKey}-${forceRender}`}
        ref={canvasRef}
        shadows={viewMode === '3D'}
        style={{ 
          background: viewMode === '2D' ? '#fff' : CANVAS_SETTINGS.BACKGROUND_COLOR,
          cursor: 'default',
          touchAction: 'none'
        }}
        dpr={[1, 2]}
        gl={{
          powerPreference: 'high-performance',  // 고성능 GPU 사용
          antialias: true,
          alpha: false,
          stencil: true,  // 더 정확한 스텐실 버퍼
          depth: true,
          preserveDrawingBuffer: true, // 썸네일 캡처를 위해 true로 변경
          failIfMajorPerformanceCaveat: false,
          logarithmicDepthBuffer: true,  // 더 정확한 깊이 버퍼
          precision: 'highp',  // 고정밀도 셰이더
        }}
        onCreated={({ gl, events, scene }) => {
          console.log('Canvas created with key:', canvasKey);
          
          // 새로운 캔버스 설정
          canvasRef.current = gl.domElement;
          rendererRef.current = gl;
          
          // 전문적인 고품질 렌더링 설정
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          
          // 최고품질 그림자 설정 - 3D 모드에서만 활성화
          gl.shadowMap.enabled = viewMode === '3D';
          if (viewMode === '3D') {
            gl.shadowMap.type = THREE.PCFSoftShadowMap;  // PCF 소프트 그림자로 변경 (더 안정적)
            gl.shadowMap.autoUpdate = true;
            gl.shadowMap.needsUpdate = true;
          }
          
          // 그림자 품질 강화
          gl.capabilities.maxTextureSize = 4096;
          
          // 그림자 강제 렌더링
          gl.setRenderTarget(null);
          gl.clear(true, true, true);
          
          // 자연스러운 톤매핑 설정
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;  // 자연스러운 노출
          
          // 정확한 색상 공간 설정
          gl.outputColorSpace = THREE.SRGBColorSpace;
          
          // 렌더링 최적화
          gl.setClearColor(new THREE.Color(CANVAS_SETTINGS.BACKGROUND_COLOR), 1.0);
          gl.autoClear = true;
          gl.autoClearColor = true;
          gl.autoClearDepth = true;
          gl.autoClearStencil = true;
          
          // 고급 렌더링 옵션
          gl.sortObjects = true;  // 투명도 정렬
          gl.localClippingEnabled = true;  // 로컬 클리핑
          
          // 캔버스 표시 및 설정
          gl.domElement.style.display = 'block';
          gl.domElement.setAttribute('data-canvas-key', canvasKey);
          
          // 씬 배경색 설정 (2D는 흰색, 3D는 기본 색상)
          if (scene) {
            scene.background = new THREE.Color(viewMode === '2D' ? '#ffffff' : CANVAS_SETTINGS.BACKGROUND_COLOR);
            // 환경맵 자동 설정 허용 (Environment 컴포넌트에서 처리)
            // scene.environment = null; // 이 라인을 주석처리하여 환경맵 적용 허용
            scene.fog = null; // 포그 비활성화로 선명도 유지
            
            // 환경맵 디버깅
            console.log('Scene environment setup - allowing Environment component to set scene.environment');
          }
          
          // 이벤트 시스템 설정
          if (events && isEventManager(events)) {
            try {
              events.disconnect();
              events.connect(gl.domElement);
            } catch (error) {
              console.warn('Error connecting events:', error);
            }
          }
          
          console.log('Professional-grade canvas setup completed successfully');
        }}
        onPointerMissed={() => {
          // Canvas가 정상적으로 작동하는지 확인하는 이벤트
          console.log('Canvas pointer event working');
        }}
      >
        {/* 자원 정리 컴포넌트 */}
        <SceneCleanup />
        
        {/* 커스텀 줌 컨트롤러 - 2D 모드에서만 활성화 */}
        {viewMode === '2D' && (
          <CustomZoomController
            minDistance={controlsConfig.minDistance}
            maxDistance={controlsConfig.maxDistance}
            viewMode={viewMode}
            zoomSpeed={1.0}
          />
        )}
        
        {/* Fog 효과 제거 - 멀다고 흐려질 필요 없음 */}
        {/* <fog attach="fog" args={[CANVAS_SETTINGS.FOG_COLOR, CANVAS_SETTINGS.FOG_NEAR, CANVAS_SETTINGS.FOG_FAR]} /> */}
        
        {/* 카메라 설정 */}
        {camera.is2DMode ? (
          <OrthographicCamera 
            makeDefault 
            position={camera.position}
            zoom={camera.zoom}
            near={CAMERA_SETTINGS.NEAR_PLANE}
            far={CAMERA_SETTINGS.FAR_PLANE}
          />
        ) : (
          <PerspectiveCamera
            makeDefault
            position={camera.position}
            fov={camera.fov}
            near={CAMERA_SETTINGS.NEAR_PLANE}
            far={CAMERA_SETTINGS.FAR_PLANE}
          />
        )}
        
        {/* OrbitControls */}
        <OrbitControls 
          ref={controlsRef}
          enabled={controlsConfig.enabled}
          target={controlsConfig.target}
          minPolarAngle={controlsConfig.minPolarAngle}
          maxPolarAngle={controlsConfig.maxPolarAngle}
          minAzimuthAngle={controlsConfig.minAzimuthAngle}
          maxAzimuthAngle={controlsConfig.maxAzimuthAngle}
          enablePan={controlsConfig.enablePan}
          enableZoom={viewMode === '3D'}
          enableRotate={controlsConfig.enableRotate}
          minDistance={controlsConfig.minDistance}
          maxDistance={controlsConfig.maxDistance}
          mouseButtons={controlsConfig.mouseButtons}
          touches={controlsConfig.touches}
          makeDefault
        />
        
        {/* 기본 조명 제거 - Space3DView에서 모든 조명 관리 */}
        {/* 기본 조명이 우리 조명과 충돌하므로 제거 */}
        
        {/* 축 표시 - 기즈모 제거 */}
        {/* <axesHelper args={[5]} /> */}
        
        {children}
      </Canvas>
    </div>
  );
};

export default ThreeCanvas; 