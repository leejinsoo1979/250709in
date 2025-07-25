import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '@/contexts/ThemeContext';
import { ErrorBoundary } from 'react-error-boundary';

// 클린 아키텍처: 의존성 방향 관리
import { useCameraManager } from './hooks/useCameraManager'; // 하위 레벨
import { useCanvasEventHandlers } from './hooks/useCanvasEventHandlers'; // 하위 레벨
import { useOrbitControlsConfig } from './hooks/useOrbitControlsConfig'; // 하위 레벨
import { CustomZoomController } from './hooks/useCustomZoom'; // 하위 레벨
import SceneCleanup from './components/SceneCleanup'; // 하위 레벨
import SceneBackground from './components/SceneBackground'; // 하위 레벨
import { CAMERA_SETTINGS, CANVAS_SETTINGS, LIGHTING_SETTINGS } from './utils/constants'; // 하위 레벨



// ThreeCanvas 컴포넌트 props 정의
interface ThreeCanvasProps {
  children: React.ReactNode;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  cameraUp?: [number, number, number];
  viewMode?: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top';
  renderMode?: 'solid' | 'wireframe';
  isSplitView?: boolean;
}

/**
 * Three.js Canvas 컴포넌트
 * step0 이후로는 모든 step이 configurator로 통일되어 동일하게 처리
 */
const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  children,
  cameraPosition,
  cameraTarget,
  cameraUp,
  viewMode = '3D',
  view2DDirection = 'front',
  renderMode = 'wireframe',
  isSplitView = false
}) => {
  // 테마 컨텍스트
  const { theme } = useTheme();
  
  // 테마에 따른 배경색 결정
  const getBackgroundColor = useCallback(() => {
    if (viewMode === '2D') {
      // 2D 모드에서는 테마에 따른 배경색 사용
      return theme.mode === 'dark' ? '#000000' : '#ffffff';
    }
    return CANVAS_SETTINGS.BACKGROUND_COLOR;
  }, [viewMode, theme.mode]);
  
  // 마운트 상태 관리
  const [mounted, setMounted] = useState(false);
  const [canvasKey, setCanvasKey] = useState(() => `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  // 캔버스 참조 저장
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<any>(null);
  
  // 테마나 뷰모드 변경 시 캔버스 재생성 - renderMode 제외
  useEffect(() => {
    setCanvasKey(`canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }, [theme, viewMode, view2DDirection]);
  
  // 클린 아키텍처: 각 책임을 전용 훅으로 위임
  const camera = useCameraManager(viewMode, cameraPosition, view2DDirection, cameraTarget, cameraUp, isSplitView);
  const eventHandlers = useCanvasEventHandlers();
  const controlsConfig = useOrbitControlsConfig(camera.target, viewMode, camera.spaceWidth, camera.spaceHeight);
  
  // viewMode 변경 시 그림자 설정 업데이트
  useEffect(() => {
    if (rendererRef.current && viewMode === '3D') {
      if (import.meta.env.DEV) {
        console.log('🔄 3D 모드 전환 - 그림자 설정 업데이트');
      }
      // 그림자 설정 업데이트
      rendererRef.current.shadowMap.enabled = true;
      rendererRef.current.shadowMap.needsUpdate = true;
    } else if (rendererRef.current && viewMode === '2D') {
      // 2D 모드에서는 그림자 비활성화
      rendererRef.current.shadowMap.enabled = false;
    }
  }, [viewMode]);

  // 테마 변경 시 배경색 업데이트
  useEffect(() => {
    if (rendererRef.current) {
      const newBgColor = getBackgroundColor();
      rendererRef.current.setClearColor(new THREE.Color(newBgColor), 1.0);
      
      // Scene 배경색도 업데이트
      const canvas = canvasRef.current;
      if (canvas) {
        const r3f = (canvas as any).__r3f;
        if (r3f?.scene) {
          r3f.scene.background = new THREE.Color(newBgColor);
        }
      }
    }
  }, [theme.mode, viewMode, getBackgroundColor]);
  
  // WebGL 컨텍스트 정리 함수 (더 부드러운 접근)
  const cleanupWebGL = useCallback(() => {
    console.log('Cleaning up WebGL resources...');
    
    // 기존 renderer 정리 (forceContextLoss 제거)
    if (rendererRef.current) {
      try {
        rendererRef.current.dispose();
        // forceContextLoss를 제거하여 불필요한 context lost 에러 방지
      } catch (error) {
        console.warn('Error disposing renderer:', error);
      }
      rendererRef.current = null;
    }
    
    // Canvas 참조만 제거 (DOM 조작 최소화)
    canvasRef.current = null;
  }, []);

  // Canvas 재생성 함수 제거 - 더 이상 필요하지 않음
  
  // 마운트 시 상태 설정
  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
      cleanupWebGL();
    };
  }, [cleanupWebGL]);
  
  // ViewMode가 변경될 때 캔버스 재생성 - 제거
  // 불필요한 재생성은 React Three Fiber 컨텍스트 문제를 유발
  // useEffect(() => {
  //   if (mounted) {
  //     // 초기 마운트 직후에는 실행하지 않음
  //     const timer = setTimeout(() => {
  //       console.log('ViewMode changed, regenerating canvas...');
  //       regenerateCanvas();
  //     }, 100);
  //     return () => clearTimeout(timer);
  //   }
  // }, [viewMode]); // regenerateCanvas 의존성 제거로 무한 루프 방지

  // 2D 모드에서 트랙패드 줌 속도 조절
  useEffect(() => {
    if (!containerRef.current || viewMode !== '2D') return;

    const handleWheel = (e: WheelEvent) => {
      // 줌 이벤트인 경우 (Ctrl 키 또는 핀치 제스처)
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        
        // 줌 속도를 더 많이 줄임 (0.1로 변경 - 트랙패드에서 더 부드럽게)
        const scaledDeltaY = e.deltaY * 0.1;
        
        // 새로운 휠 이벤트 생성
        const newEvent = new WheelEvent('wheel', {
          deltaY: scaledDeltaY,
          deltaX: e.deltaX,
          deltaMode: e.deltaMode,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          bubbles: true,
          cancelable: true
        });
        
        // OrbitControls가 받을 수 있도록 이벤트 재발송
        if (canvasRef.current) {
          const canvas = canvasRef.current.querySelector('canvas');
          if (canvas) {
            canvas.dispatchEvent(newEvent);
          }
        }
        
        return false;
      }
    };

    const container = containerRef.current;
    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [viewMode]);


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
  

  // 로딩 상태
  if (!mounted) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        background: getBackgroundColor() 
      }}>
        <p>Loading 3D viewer...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div style={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          background: getBackgroundColor() 
        }}>
          <p>3D viewer error. Please refresh the page.</p>
        </div>
      }
      onError={(error) => {
        console.error('Canvas ErrorBoundary caught:', error);
      }}
    >
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
        key={canvasKey}
        shadows={viewMode === '3D'}
        style={{ 
          background: viewMode === '2D' && theme.mode === 'dark' ? '#121212' : viewMode === '2D' ? '#ffffff' : CANVAS_SETTINGS.BACKGROUND_COLOR,
          cursor: 'default',
          touchAction: 'none'
        }}
        dpr={[1, 2]}
        frameloop="always"
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
        onCreated={({ gl, scene }) => {
          // renderer 참조 저장
          canvasRef.current = gl.domElement;
          rendererRef.current = gl;
          
          // 기본 렌더링 설정
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          
          // 그림자 설정 - 3D 모드에서만
          gl.shadowMap.enabled = viewMode === '3D';
          if (viewMode === '3D') {
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            gl.shadowMap.autoUpdate = true;
            gl.shadowMap.needsUpdate = true;
          }
          
          // 초기 배경색 설정
          const initialBgColor = getBackgroundColor();
          gl.setClearColor(new THREE.Color(initialBgColor), 1.0);
          
          // 씬 배경색 설정
          if (scene) {
            scene.background = new THREE.Color(initialBgColor);
            scene.fog = null;
          }
        }}
      >
        {/* 자원 정리 컴포넌트 */}
        <Suspense fallback={null}>
          <SceneCleanup />
          <SceneBackground viewMode={viewMode} />
        </Suspense>
        
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
            up={camera.up || [0, 1, 0]}
            onUpdate={(self) => {
              if (camera.up) {
                self.up.set(...camera.up);
              }
              self.lookAt(...camera.target);
            }}
          />
        ) : (
          <PerspectiveCamera
            makeDefault
            position={camera.position}
            fov={camera.fov}
            near={CAMERA_SETTINGS.NEAR_PLANE}
            far={CAMERA_SETTINGS.FAR_PLANE}
            onUpdate={(self) => self.lookAt(...camera.target)}
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
          enableZoom={controlsConfig.enableZoom}
          enableRotate={controlsConfig.enableRotate}
          minDistance={controlsConfig.minDistance}
          maxDistance={controlsConfig.maxDistance}
          mouseButtons={controlsConfig.mouseButtons}
          touches={controlsConfig.touches}
          panSpeed={1.0}
          zoomSpeed={viewMode === '2D' ? 0.15 : 1.2}
          enableDamping={true}
          dampingFactor={viewMode === '2D' ? 0.1 : 0.05}
          screenSpacePanning={true}
          makeDefault
        />
        
        {/* 기본 조명 제거 - Space3DView에서 모든 조명 관리 */}
        {/* 기본 조명이 우리 조명과 충돌하므로 제거 */}
        
        {/* 축 표시 - 기즈모 제거 */}
        {/* <axesHelper args={[5]} /> */}
        
        {children}
      </Canvas>
    </div>
    </ErrorBoundary>
  );
};

export default ThreeCanvas; 