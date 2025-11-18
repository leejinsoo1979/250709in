import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { ErrorBoundary } from 'react-error-boundary';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';

// 클린 아키텍처: 의존성 방향 관리
import { useCameraManager } from './hooks/useCameraManager'; // 하위 레벨
import { useOrbitControlsConfig } from './hooks/useOrbitControlsConfig'; // 하위 레벨
import { CustomZoomController } from './hooks/useCustomZoom'; // 하위 레벨
import { useResponsive } from '@/hooks/useResponsive'; // 반응형 감지
import SceneCleanup from './components/SceneCleanup'; // 하위 레벨
import SceneBackground from './components/SceneBackground'; // 하위 레벨
import { TouchOrbitControlsSetup } from './components/TouchOrbitControlsSetup'; // 터치 컨트롤
import { CAMERA_SETTINGS, CANVAS_SETTINGS, LIGHTING_SETTINGS } from './utils/constants'; // 하위 레벨

// 최근 복사한 가구 ID를 전역 수준에서 유지해 Ctrl+V 붙여넣기 시 활용
let lastCopiedFurnitureId: string | null = null;



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
  style?: React.CSSProperties;
  cameraMode?: 'perspective' | 'orthographic';
  zoomMultiplier?: number;
  /** 3D 씬 참조 (GLB 내보내기용) */
  sceneRef?: React.MutableRefObject<any>;
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
  style,
  isSplitView = false,
  cameraMode: cameraModeFromProps,
  zoomMultiplier,
  sceneRef
}) => {
  const CANVAS_DEBUG = false;
  const canvasLog = (...args: any[]) => {
    if (CANVAS_DEBUG) {
      console.log(...args);
    }
  };
  const canvasWarn = (...args: any[]) => {
    if (CANVAS_DEBUG) {
      console.warn(...args);
    }
  };

  // 테마 컨텍스트
  const { theme } = useViewerTheme();

  // UIStore에서 2D 뷰 테마, 카메라 설정, 측정 모드, 지우개 모드 가져오기
  const { view2DTheme, isFurnitureDragging, isDraggingColumn, isSlotDragging, cameraMode: cameraModeFromStore, cameraFov, shadowEnabled, isMeasureMode, isEraserMode } = useUIStore();

  // Props가 있으면 props를 사용, 없으면 UIStore 값을 사용
  const cameraMode = cameraModeFromProps || cameraModeFromStore;

  // 커서 색상 (다크모드: 흰색, 라이트모드: 검정색)
  const cursorColor = view2DTheme === 'dark' ? 'white' : 'black';

  // 지우개 커서 색상 (다크모드: 흰색, 라이트모드: 검정색)
  const eraserCursorColor = view2DTheme === 'dark' ? 'white' : 'black';
  
  // 단내림 설정 변경 감지
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  // 단내림 좌/우 위치 변경 이전 상태 추적
  const prevDroppedPositionRef = useRef<'left' | 'right' | undefined>(spaceInfo?.droppedCeiling?.position);
  
  // 반응형 감지
  const { isTouchDevice, isMobile, isTablet } = useResponsive();
  
  // 테마에 따른 배경색 결정 - 무조건 라이트 테마
  const getBackgroundColor = useCallback(() => {
    // 디자인 미리보기는 항상 라이트 테마
    return '#ffffff';
  }, []);
  
  // 마운트 상태 관리
  const [mounted, setMounted] = useState(false);
  const [canvasKey, setCanvasKey] = useState(() => `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [canvasReady, setCanvasReady] = useState(false);
  // isFurnitureDragging 상태는 UIStore에서 가져옴
  
  // 캔버스 참조 저장
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<any>(null);
  
  // 초기 카메라 설정 저장 (2D와 3D 각각)
  const initialCameraSetup = useRef<{
    position0: THREE.Vector3 | null;
    target0: THREE.Vector3 | null;
    zoom0: number | null;
    // 2D 모드 초기 상태 별도 저장
    position2D: THREE.Vector3 | null;
    target2D: THREE.Vector3 | null;
    up2D: THREE.Vector3 | null;
    zoom2D: number | null;
  }>({
    position0: null,
    target0: null,
    zoom0: null,
    position2D: null,
    target2D: null,
    up2D: null,
    zoom2D: null
  });
  
  
  // 뷰모드 변경 시 캔버스 재생성 (테마는 무시)
  useEffect(() => {
    // 뷰 모드 변경 시 해당 모드의 초기 상태 리셋 - 제거
    // 초기 상태를 null로 리셋하면 스페이스 키 누를 때 초기값이 없어서 문제 발생
    // if (viewMode === '2D') {
    //   initialCameraSetup.current.position2D = null;
    //   initialCameraSetup.current.target2D = null;
    //   initialCameraSetup.current.zoom2D = null;
    // }
    setCanvasKey(`canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }, [viewMode, view2DDirection]);
  
  // 단내림 설정 변경 시 캔버스 강제 업데이트
  useEffect(() => {
    if (spaceInfo?.droppedCeiling) {
      canvasLog('🔄 ThreeCanvas - 단내림 설정 변경 감지, 캔버스 강제 업데이트');
      // 캔버스 키를 변경하여 강제로 재생성
      setCanvasKey(`canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    }
  }, [spaceInfo?.droppedCeiling?.enabled, spaceInfo?.droppedCeiling?.position, spaceInfo?.droppedCeiling?.width, spaceInfo?.droppedCeiling?.dropHeight]);

  // 단내림 좌/우 위치가 바뀌면 배치된 가구 초기화
  useEffect(() => {
    const currentPos = spaceInfo?.droppedCeiling?.position;
    const prevPos = prevDroppedPositionRef.current;
    const enabled = !!spaceInfo?.droppedCeiling?.enabled;
    
    if (enabled && prevPos && currentPos && prevPos !== currentPos) {
      canvasLog('🧹 단내림 위치 변경 → 가구 초기화', { prevPos, currentPos });
      try {
        useFurnitureStore.getState().setPlacedModules([]);
        useFurnitureStore.getState().clearAllSelections();
      } catch (e) {
        canvasWarn('가구 초기화 오류:', e);
      }
    }
    prevDroppedPositionRef.current = currentPos;
  }, [spaceInfo?.droppedCeiling?.position, spaceInfo?.droppedCeiling?.enabled]);
  
  // 클린 아키텍처: 각 책임을 전용 훅으로 위임
  const camera = useCameraManager(viewMode, cameraPosition, view2DDirection, cameraTarget, cameraUp, isSplitView, zoomMultiplier);
  const controlsConfig = useOrbitControlsConfig(camera.target, viewMode, camera.spaceWidth, camera.spaceHeight);
  
  // 기본: 한 손가락 회전, 두 손가락 줌+팬
  
  // 측정 모드일 때 커서 스타일 강제 유지
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    if (!isMeasureMode) {
      // 측정 모드가 아니면 기본 커서로 복원
      canvas.style.cursor = 'default';
      return;
    }

    const cursorStyle = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 21 21"><line x1="10.5" y1="0" x2="10.5" y2="21" stroke="${cursorColor}" stroke-width="1"/><line x1="0" y1="10.5" x2="21" y2="10.5" stroke="${cursorColor}" stroke-width="1"/><circle cx="10.5" cy="10.5" r="2" fill="none" stroke="${cursorColor}" stroke-width="1"/></svg>') 10 10, crosshair`;

    // 초기 설정
    canvas.style.cursor = cursorStyle;

    // MutationObserver로 커서 변경 감지 및 복원
    const observer = new MutationObserver(() => {
      if (canvas.style.cursor !== cursorStyle) {
        canvas.style.cursor = cursorStyle;
      }
    });

    observer.observe(canvas, {
      attributes: true,
      attributeFilter: ['style']
    });

    // 주기적으로 커서 체크 (OrbitControls가 강제로 변경하는 경우 대비)
    const interval = setInterval(() => {
      if (canvas.style.cursor !== cursorStyle) {
        canvas.style.cursor = cursorStyle;
      }
    }, 100);

    return () => {
      observer.disconnect();
      clearInterval(interval);
      // cleanup 시 기본 커서로 복원
      canvas.style.cursor = 'default';
    };
  }, [isMeasureMode, cursorColor]);

  // viewMode 및 cameraMode 변경 시 그림자 설정 업데이트
  useEffect(() => {
    if (rendererRef.current && viewMode === '3D') {
      if (import.meta.env.DEV) {
        canvasLog('🔄 3D 모드 전환 - 그림자 설정 업데이트, shadowEnabled:', shadowEnabled);
      }
      // 3D 모드에서는 shadowEnabled 상태에 따라 그림자 활성화
      rendererRef.current.shadowMap.enabled = shadowEnabled;
      if (shadowEnabled) {
        rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current.shadowMap.autoUpdate = true;
      }
      rendererRef.current.shadowMap.needsUpdate = true;

      // 씬의 모든 오브젝트와 라이트를 traverse하여 그림자 설정 강제 업데이트
      const canvas = canvasRef.current;
      if (canvas) {
        const r3f = (canvas as any).__r3f;
        if (r3f?.scene) {
          r3f.scene.traverse((child: any) => {
            // 라이트 설정
            if (child.isLight && child.castShadow !== undefined) {
              child.castShadow = shadowEnabled;
              if (child.shadow) {
                child.shadow.needsUpdate = true;
              }
            }
            // 메쉬 설정
            if (child.isMesh) {
              child.castShadow = shadowEnabled;
              child.receiveShadow = shadowEnabled;
            }
          });

          // 강제 렌더링 트리거
          if (r3f.gl) {
            r3f.gl.shadowMap.enabled = shadowEnabled;
            if (shadowEnabled) {
              r3f.gl.shadowMap.type = THREE.PCFSoftShadowMap;
              r3f.gl.shadowMap.autoUpdate = true;
            }
            r3f.gl.shadowMap.needsUpdate = true;
          }
        }
      }
    } else if (rendererRef.current && viewMode === '2D') {
      // 2D 모드에서는 그림자 비활성화
      rendererRef.current.shadowMap.enabled = false;
    }
  }, [viewMode, shadowEnabled]);

  // 배경색 업데이트 (라이트 테마 강제)
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
  }, [getBackgroundColor]);
  
  // WebGL 컨텍스트 정리 함수 (더 부드러운 접근)
  const cleanupWebGL = useCallback(() => {
    canvasLog('Cleaning up WebGL resources...');
    
    // 기존 renderer 정리 (forceContextLoss 제거)
    if (rendererRef.current) {
      try {
        rendererRef.current.dispose();
        // forceContextLoss를 제거하여 불필요한 context lost 에러 방지
      } catch (error) {
        canvasWarn('Error disposing renderer:', error);
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
      
      // 드래그 이벤트 핸들러 정리
      if ((window as any).__canvasDragHandlers) {
        const { canvas, dragOver, drop } = (window as any).__canvasDragHandlers;
        if (canvas && dragOver && drop) {
          canvasLog('🧹 Removing canvas drag event handlers');
          canvas.removeEventListener('dragover', dragOver);
          canvas.removeEventListener('drop', drop);
          delete (window as any).__canvasDragHandlers;
        }
      }
    };
  }, [cleanupWebGL]);

  // 가구 드래그 이벤트 리스너
  useEffect(() => {
    const handleFurnitureDragStart = () => {
      canvasLog('🎯 가구/기둥 드래그 시작 - 카메라 회전 비활성화');
      
      // 카메라 컨트롤 비활성화
      if (controlsRef.current) {
        const controls = controlsRef.current;
        controls.enabled = false;
        controls.enablePan = false;
        controls.enableZoom = false;
        controls.enableRotate = false;
        controls.update();
        canvasLog('🎯 카메라 컨트롤 비활성화 완료');
      }
    };

    const handleFurnitureDragEnd = () => {
      canvasLog('🎯 가구/기둥 드래그 종료 - OrbitControls 회전 활성화');
      
      // 카메라 컨트롤 재활성화
      if (controlsRef.current) {
        const controls = controlsRef.current;
        controls.enabled = true;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.enableRotate = viewMode === '3D';
        controls.update();
        canvasLog('🎯 카메라 컨트롤 재활성화 완료');
      }
    };

    const handleFurniturePlacementComplete = () => {
      canvasLog('🎯 가구 배치 완료');
      // 카메라 리셋 기능 제거 - 사용자가 원하는 각도 유지
      
      // 카메라 컨트롤 재활성화
      if (controlsRef.current) {
        const controls = controlsRef.current;
        controls.enabled = true;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.enableRotate = viewMode === '3D';
        controls.update();
        canvasLog('🎯 카메라 컨트롤 재활성화 완료');
      }
    };

    window.addEventListener('furniture-drag-start', handleFurnitureDragStart);
    window.addEventListener('furniture-drag-end', handleFurnitureDragEnd);
    window.addEventListener('furniture-placement-complete', handleFurniturePlacementComplete);

    return () => {
      window.removeEventListener('furniture-drag-start', handleFurnitureDragStart);
      window.removeEventListener('furniture-drag-end', handleFurnitureDragEnd);
      window.removeEventListener('furniture-placement-complete', handleFurniturePlacementComplete);
    };
  }, [camera, cameraPosition, cameraTarget, viewMode]);

  // 카메라 리셋 함수
  const resetCamera = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    const isOrthographicCamera = controls.object.type === 'OrthographicCamera';

    // 2D 모드 또는 Orthographic 카메라 리셋
    if (viewMode === '2D' || isOrthographicCamera) {
      const initial = initialCameraSetup.current;
      const targetVec = initial.target2D?.clone() ?? new THREE.Vector3(...camera.target);
      const positionVec = initial.position2D?.clone() ?? new THREE.Vector3(...camera.position);
      const upVec = initial.up2D?.clone() ?? new THREE.Vector3(0, 1, 0);
      const zoomValue = initial.zoom2D ?? camera.zoom ?? 1;

      canvasLog('🎯 2D 카메라 리셋 실행', {
        storedPosition: initial.position2D?.toArray(),
        fallbackPosition: positionVec.toArray(),
        storedTarget: initial.target2D?.toArray(),
        zoomValue
      });

      controls.target.copy(targetVec);
      controls.object.position.copy(positionVec);
      controls.object.up.copy(upVec);

      if ('zoom' in controls.object) {
        controls.object.zoom = zoomValue;
        if (typeof (controls.object as THREE.OrthographicCamera).updateProjectionMatrix === 'function') {
          (controls.object as THREE.OrthographicCamera).updateProjectionMatrix();
        }
      }

      controls.object.lookAt(controls.target);
      controls.update();
      return;
    }

    // 3D 퍼스펙티브/Orthographic (cameraMode=orthographic) 리셋
    const isOrthographic = controls.object.type === 'OrthographicCamera' || cameraMode === 'orthographic';

    canvasLog('🎯 3D 카메라 리셋 시작:', {
      type: controls.object.type,
      cameraMode,
      currentPosition: controls.object.position.toArray(),
      currentTarget: controls.target.toArray()
    });

    const initialPos = initialCameraSetup.current.position0?.clone() ?? new THREE.Vector3(...camera.position);
    const initialTarget = initialCameraSetup.current.target0?.clone() ?? new THREE.Vector3(...camera.target);
    const initialZoom = initialCameraSetup.current.zoom0 ?? (controls.object as any).zoom ?? 1;

    controls.target.copy(initialTarget);
    controls.object.position.copy(initialPos);

    if (isOrthographic && 'zoom' in controls.object) {
      controls.object.zoom = initialZoom;
      if (typeof (controls.object as THREE.OrthographicCamera).updateProjectionMatrix === 'function') {
        (controls.object as THREE.OrthographicCamera).updateProjectionMatrix();
      }
    }

    controls.object.up.set(0, 1, 0);
    controls.object.lookAt(controls.target);
    controls.update();

    canvasLog('🎯 3D 카메라 리셋 완료:', {
      newPosition: controls.object.position.toArray(),
      newTarget: controls.target.toArray(),
      zoom: (controls.object as any).zoom
    });
  }, [camera, viewMode, cameraMode]);

  // 스페이스바로 카메라 리셋
  useEffect(() => {
    canvasLog('🎮 스페이스 키 리스너 등록됨 - viewMode:', viewMode, 'cameraMode:', cameraMode);

    const handleKeyDown = (e: KeyboardEvent) => {
      canvasLog('⌨️ 키 눌림:', e.code, e.keyCode);

      // 스페이스바 (32) 또는 Space 키
      if (e.code === 'Space' || e.keyCode === 32) {
        e.preventDefault(); // 페이지 스크롤 방지
        e.stopPropagation(); // 이벤트 전파 방지
        canvasLog('🚀 스페이스 키 눌림 - viewMode:', viewMode, 'cameraMode:', cameraMode);
        resetCamera();
        return;
      }

      const uiStateSnapshot = useUIStore.getState();

      // Ctrl+Z / Cmd+Z : Undo (측정 모드가 아니고 편집 입력 포커스가 없을 때)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ') {
        if (!uiStateSnapshot.isMeasureMode) {
          e.preventDefault();
          e.stopPropagation();
          const undoButton = document.querySelector('[title="실행 취소 (Ctrl+Z)"]') as HTMLButtonElement | null;
          undoButton?.click();
        }
        return;
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y : Redo
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ') ||
          ((e.ctrlKey || e.metaKey) && e.code === 'KeyY')) {
        if (!uiStateSnapshot.isMeasureMode) {
          e.preventDefault();
          e.stopPropagation();
          const redoButton = document.querySelector('[title="다시 실행 (Ctrl+Y)"]') as HTMLButtonElement | null;
          redoButton?.click();
        }
        return;
      }

      // Ctrl+C: 선택된 가구를 클립보드에 저장 (즉시 배치 없이 복사만 수행)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        const furnitureState = useFurnitureStore.getState();
        const selectedFurnitureId = uiStateSnapshot.selectedFurnitureId
          || furnitureState.selectedFurnitureId
          || furnitureState.selectedPlacedModuleId;

        if (selectedFurnitureId) {
          const selectedFurniture = furnitureState.placedModules.find(m => m.id === selectedFurnitureId);
          if (selectedFurniture?.isLocked) {
            console.log('🔒 잠긴 가구는 복제할 수 없습니다');
            return;
          }

          e.preventDefault();
          e.stopPropagation();

          lastCopiedFurnitureId = selectedFurnitureId;
          console.log('📋 가구 복사됨 (키보드):', lastCopiedFurnitureId);
        }
      }

      // Ctrl+V: 마지막으로 복사한 가구 붙여넣기 (없으면 현재 선택 가구 사용)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
        const furnitureState = useFurnitureStore.getState();
        const uiState = useUIStore.getState();
        const preferredIds = [
          uiState.selectedFurnitureId,
          furnitureState.selectedFurnitureId,
          furnitureState.selectedPlacedModuleId,
          lastCopiedFurnitureId
        ].filter((id): id is string => !!id);

        if (preferredIds.length === 0) {
          console.log('📋 붙여넣기 실패: 복사된 가구가 없습니다');
          return;
        }

        const targetFurniture = preferredIds
          .map(id => furnitureState.placedModules.find(m => m.id === id))
          .find((module): module is typeof furnitureState.placedModules[number] => !!module);

        if (!targetFurniture) {
          console.log('📋 붙여넣기 실패: 대상 가구를 찾을 수 없습니다');
          return;
        }

        if (targetFurniture.isLocked) {
          console.log('🔒 잠긴 가구는 복제할 수 없습니다');
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        lastCopiedFurnitureId = targetFurniture.id;
        console.log('📋 가구 붙여넣기:', targetFurniture.id);

        window.dispatchEvent(new CustomEvent('duplicate-furniture', {
          detail: { furnitureId: targetFurniture.id }
        }));
      }
    };

    // capture: true로 이벤트를 먼저 캡처
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [resetCamera, viewMode, cameraMode]);

  // 기둥 드래그 및 설정 변경 관련 이벤트 처리
  useEffect(() => {
    // 3D 모드에서 기둥 드래그 시작 시 카메라 리셋
    const handleResetCameraForColumn = () => {
      canvasLog('🎯 3D 모드에서 기둥 드래그 시작 - 카메라 리셋');
      resetCamera();
    };
    
    const handleColumnDragEnd = () => {
      canvasLog('🎯 기둥 드래그 종료');
      // 드래그 종료 시에는 특별한 처리 없음
    };
    
    // 공간 설정 변경 시 카메라 리셋
    const handleResetCameraForSettings = () => {
      canvasLog('🎯 공간 설정 변경 - 카메라 리셋');
      resetCamera();
    };

    window.addEventListener('reset-camera-for-column', handleResetCameraForColumn);
    window.addEventListener('column-drag-end', handleColumnDragEnd);
    window.addEventListener('reset-camera-for-settings', handleResetCameraForSettings);
    
    return () => {
      window.removeEventListener('reset-camera-for-column', handleResetCameraForColumn);
      window.removeEventListener('column-drag-end', handleColumnDragEnd);
      window.removeEventListener('reset-camera-for-settings', handleResetCameraForSettings);
    };
  }, [resetCamera]);
  
  // ViewMode가 변경될 때 캔버스 재생성 - 제거
  // 불필요한 재생성은 React Three Fiber 컨텍스트 문제를 유발
  // useEffect(() => {
  //   if (mounted) {
  //     // 초기 마운트 직후에는 실행하지 않음
  //     const timer = setTimeout(() => {
  //       canvasLog('ViewMode changed, regenerating canvas...');
  //       regenerateCanvas();
  //     }, 100);
  //     return () => clearTimeout(timer);
  //   }
  // }, [viewMode]); // regenerateCanvas 의존성 제거로 무한 루프 방지

  // 2D 모드에서 휠 버튼(가운데 마우스 버튼) 클릭 시 커서 변경
  useEffect(() => {
    if (!containerRef.current || viewMode !== '2D') return;

    const container = containerRef.current;
    
    // 휠 버튼 이벤트 처리
    const handleMouseDown = (e: MouseEvent) => {
      // 가운데 버튼(휠 버튼) = 1
      if (e.button === 1) {
        e.preventDefault();
        // Canvas 요소 찾기
        const canvas = container.querySelector('canvas');
        if (canvas) {
          canvas.style.cursor = 'grab';
          canvasLog('🖱️ 2D 모드: 휠 버튼 누름 - grab 커서');
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      // buttons === 4는 가운데 버튼이 눌린 상태
      if (e.buttons === 4) {
        const canvas = container.querySelector('canvas');
        if (canvas) {
          canvas.style.cursor = 'grabbing';
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // 가운데 버튼 해제
      if (e.button === 1) {
        const canvas = container.querySelector('canvas');
        if (canvas) {
          canvas.style.cursor = 'auto';
          canvasLog('🖱️ 2D 모드: 휠 버튼 해제 - 기본 커서');
        }
      }
    };

    // 이벤트 리스너 등록
    container.addEventListener('mousedown', handleMouseDown, true);
    container.addEventListener('mousemove', handleMouseMove, true);
    container.addEventListener('mouseup', handleMouseUp, true);
    
    // 윈도우 레벨에서도 mouseup 처리 (컨테이너 밖에서 버튼 뗄 경우)
    window.addEventListener('mouseup', handleMouseUp, true);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown, true);
      container.removeEventListener('mousemove', handleMouseMove, true);
      container.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
    };
  }, [viewMode]);

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

  // viewMode 또는 view2DDirection 변경 시 OrbitControls 리셋
  useEffect(() => {
    if (!controlsRef.current) return;

    const controls = controlsRef.current;

    // 2D 모드로 전환 시 카메라 각도만 리셋 (줌/팬 상태는 유지)
    if (viewMode === '2D' && controls.object) {
      canvasLog('🔄 2D 모드 전환 - 카메라 각도만 리셋 (줌/팬 유지)');

      // controls.reset() 제거 - 줌/팬 상태 초기화 방지
      // 대신 카메라 위치와 타겟만 업데이트

      // 카메라 위치와 타겟을 현재 설정된 값으로 업데이트
      controls.object.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
      if (cameraTarget) {
        controls.target.set(cameraTarget[0], cameraTarget[1], cameraTarget[2]);
      }
      if (cameraUp) {
        controls.object.up.set(cameraUp[0], cameraUp[1], cameraUp[2]);
      }

      // 카메라 quaternion(회전) 완전 초기화
      controls.object.quaternion.set(0, 0, 0, 1);

      // 카메라가 타겟을 정확히 바라보도록 설정
      controls.object.lookAt(controls.target);

      // OrbitControls 업데이트
      controls.update();

      canvasLog('✅ 2D 카메라 각도 리셋 완료 (줌/팬 유지):', {
        position: controls.object.position.toArray(),
        target: controls.target.toArray(),
        up: controls.object.up.toArray(),
        quaternion: controls.object.quaternion.toArray()
      });
    }
  }, [viewMode, view2DDirection]);

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
      >
        <Canvas
        key={`${canvasKey}-shadow-${shadowEnabled}`}
        shadows={viewMode === '3D' && shadowEnabled}
        style={{
          ...style,
          background: '#ffffff',
          cursor: (isEraserMode && viewMode === '2D')
            ? (view2DTheme === 'dark'
                ? `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16" fill="white"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828l6.879-6.879zm2.121.707a1 1 0 0 0-1.414 0L4.16 7.547l5.293 5.293 4.633-4.633a1 1 0 0 0 0-1.414l-3.879-3.879zM8.746 13.547 3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293l.16-.16z"/></svg>') 12 12, pointer`
                : `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16" fill="black"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828l6.879-6.879zm2.121.707a1 1 0 0 0-1.414 0L4.16 7.547l5.293 5.293 4.633-4.633a1 1 0 0 0 0-1.414l-3.879-3.879zM8.746 13.547 3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293l.16-.16z"/></svg>') 12 12, pointer`)
            : (isMeasureMode && viewMode === '2D')
            ? (view2DTheme === 'dark'
                ? `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 21 21"><line x1="10.5" y1="0" x2="10.5" y2="21" stroke="white" stroke-width="1"/><line x1="0" y1="10.5" x2="21" y2="10.5" stroke="white" stroke-width="1"/><circle cx="10.5" cy="10.5" r="2" fill="none" stroke="white" stroke-width="1"/></svg>') 10 10, crosshair`
                : `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 21 21"><line x1="10.5" y1="0" x2="10.5" y2="21" stroke="black" stroke-width="1"/><line x1="0" y1="10.5" x2="21" y2="10.5" stroke="black" stroke-width="1"/><circle cx="10.5" cy="10.5" r="2" fill="none" stroke="black" stroke-width="1"/></svg>') 10 10, crosshair`)
            : 'default',
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
          try {
            canvasLog('🎨 Canvas 생성 시작:', { canvasKey, viewMode });

            // 기존 renderer가 있으면 정리
            if (rendererRef.current && rendererRef.current !== gl) {
              canvasLog('🧹 기존 renderer 정리');
              rendererRef.current.dispose();
            }

            // renderer 참조 저장
            canvasRef.current = gl.domElement;
            rendererRef.current = gl;

            // GLB 내보내기를 위한 scene 참조 저장
            if (sceneRef) {
              sceneRef.current = scene;
              canvasLog('✅ Scene ref 저장 완료 (GLB 내보내기용)');
            }
            
            // Canvas 요소에 드래그 이벤트 리스너 추가
            const canvas = gl.domElement;
            
            // 드래그 오버 이벤트 처리
            const handleCanvasDragOver = (e: DragEvent) => {
              e.preventDefault(); // 드롭을 허용
              // stopPropagation 제거 - 이벤트가 자연스럽게 버블링되도록 허용
              canvasLog('🎨 Canvas dragOver 이벤트 감지:', {
                clientX: e.clientX,
                clientY: e.clientY,
                dataTransfer: e.dataTransfer?.types
              });
              
              // 커스텀 이벤트 발생시켜서 다른 컴포넌트에 알림
              const customEvent = new CustomEvent('canvas-dragover', {
                detail: { clientX: e.clientX, clientY: e.clientY, originalEvent: e }
              });
              window.dispatchEvent(customEvent);
            };
            
            // 드롭 이벤트 처리
            const handleCanvasDrop = (e: DragEvent) => {
              e.preventDefault();
              // stopPropagation 제거 - 이벤트가 자연스럽게 버블링되도록 허용
              canvasLog('🎨 Canvas drop 이벤트 감지:', {
                clientX: e.clientX,
                clientY: e.clientY,
                dataTransfer: e.dataTransfer?.types,
                getData: e.dataTransfer?.getData('application/json')
              });
              
              // activeZone 결정 로직
              // Three.js 좌표계로 변환하여 zone 판단
              const rect = canvas.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
              
              // spaceInfo에서 단내림 정보 확인
              const spaceInfo = (window as any).__currentSpaceInfo;
              let activeZone: 'normal' | 'dropped' | undefined = undefined;
              
              if (spaceInfo?.droppedCeiling?.enabled) {
                const totalWidth = spaceInfo.width;
                const droppedWidth = spaceInfo.droppedCeiling.width || 800;
                const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
                
                // Three.js 좌표계에서 실제 X 위치 계산 (중심이 0)
                const worldX = x * (totalWidth / 2);
                
                if (droppedPosition === 'left') {
                  // 왼쪽 단내림: 왼쪽 부분이 dropped zone
                  activeZone = worldX < -totalWidth/2 + droppedWidth ? 'dropped' : 'normal';
                } else {
                  // 오른쪽 단내림: 오른쪽 부분이 dropped zone  
                  activeZone = worldX > totalWidth/2 - droppedWidth ? 'dropped' : 'normal';
                }
                
                canvasLog('🎯 ActiveZone 결정:', {
                  droppedPosition,
                  worldX,
                  totalWidth,
                  droppedWidth,
                  activeZone
                });
              }
              
              // window.handleSlotDrop이 있으면 직접 호출
              if (typeof (window as any).handleSlotDrop === 'function') {
                canvasLog('🎯 Canvas에서 직접 handleSlotDrop 호출 with activeZone:', activeZone);
                const result = (window as any).handleSlotDrop(e, canvas, activeZone);
                canvasLog('🎯 handleSlotDrop 결과:', result);

                // 결과가 false면 부모 컨테이너로 이벤트 전파
                if (!result) {
                  canvasLog('📤 handleSlotDrop이 false 반환, 부모로 이벤트 전파 시도');
                  // 원본 이벤트의 버블링을 중단하여 중복 호출 방지
                  e.stopPropagation();
                  e.preventDefault();

                  const parentContainer = canvas.closest('[data-viewer-container="true"]');
                  if (parentContainer) {
                    const syntheticEvent = new DragEvent('drop', {
                      bubbles: true,
                      cancelable: true,
                      dataTransfer: e.dataTransfer,
                      clientX: e.clientX,
                      clientY: e.clientY,
                      screenX: e.screenX,
                      screenY: e.screenY
                    });
                    parentContainer.dispatchEvent(syntheticEvent);
                  }
                }
              } else {
                console.error('❌ window.handleSlotDrop이 정의되지 않음!');
              }
            };
            
            // 이벤트 리스너 추가
            canvas.addEventListener('dragover', handleCanvasDragOver);
            canvas.addEventListener('drop', handleCanvasDrop);
            
            // 전역 변수에 클린업 함수 저장 (나중에 정리를 위해)
            (window as any).__canvasDragHandlers = {
              canvas,
              dragOver: handleCanvasDragOver,
              drop: handleCanvasDrop
            };
            
            // 기본 렌더링 설정
            gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));

            // ToneMapping 설정 - emissive 효과가 보이도록
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.0;
            gl.outputColorSpace = THREE.SRGBColorSpace;

            // 그림자 설정 - 3D 모드이면서 shadowEnabled가 true일 때만
            const enableShadows = viewMode === '3D' && shadowEnabled;
            gl.shadowMap.enabled = enableShadows;
            if (enableShadows) {
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
            
            setCanvasReady(true);
            canvasLog('✅ Canvas 생성 완료:', { canvasKey, viewMode });
          } catch (error) {
            console.error('❌ Canvas 생성 중 오류:', error);
            setCanvasReady(false);
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
            zoomSpeed={0.1}
          />
        )}
        
        {/* Fog 효과 제거 - 멀다고 흐려질 필요 없음 */}
        {/* <fog attach="fog" args={[CANVAS_SETTINGS.FOG_COLOR, CANVAS_SETTINGS.FOG_NEAR, CANVAS_SETTINGS.FOG_FAR]} /> */}
        
        {/* 카메라 설정 - UI 스토어의 카메라 모드 사용 */}
        {camera.is2DMode || (viewMode === '3D' && cameraMode === 'orthographic') ? (
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
            fov={cameraFov || camera.fov}
            near={CAMERA_SETTINGS.NEAR_PLANE}
            far={CAMERA_SETTINGS.FAR_PLANE}
            onUpdate={(self) => self.lookAt(...camera.target)}
          />
        )}
        
        {/* OrbitControls */}
        <OrbitControls 
          ref={(ref) => {
            controlsRef.current = ref;
            // OrbitControls가 처음 생성될 때 초기 상태 저장
            if (ref) {
              // 2D 모드일 때 2D 초기 상태 저장
              if (viewMode === '2D' && !initialCameraSetup.current.position2D) {
                setTimeout(() => {
                  if (ref && ref.object) {
                    canvasLog('📸 2D 모드 초기 상태 저장', {
                      position: ref.object.position.toArray(),
                      target: ref.target.toArray(),
                      up: ref.object.up.toArray(),
                      zoom: ref.object.zoom
                    });
                    initialCameraSetup.current.position2D = ref.object.position.clone();
                    initialCameraSetup.current.target2D = ref.target.clone();
                    initialCameraSetup.current.up2D = ref.object.up.clone();
                    initialCameraSetup.current.zoom2D = ref.object.zoom;
                  }
                }, 100);
              }
              // 3D 모드 초기 상태 저장
              else if (viewMode === '3D' && !initialCameraSetup.current.position0) {
                setTimeout(() => {
                  if (ref && ref.object) {
                    canvasLog('📸 3D 모드 초기 상태 저장', {
                      position: ref.object.position.toArray(),
                      target: ref.target.toArray(),
                      zoom: ref.object.zoom
                    });
                    initialCameraSetup.current.position0 = ref.object.position.clone();
                    initialCameraSetup.current.target0 = ref.target.clone();
                    initialCameraSetup.current.zoom0 = ref.object.zoom;
                  }
                }, 100);
              }
            }
          }}
          enabled={controlsConfig.enabled && !isFurnitureDragging && !isDraggingColumn && !isSlotDragging}
          target={controlsConfig.target}
          minPolarAngle={controlsConfig.minPolarAngle}
          maxPolarAngle={controlsConfig.maxPolarAngle}
          minAzimuthAngle={controlsConfig.minAzimuthAngle}
          maxAzimuthAngle={controlsConfig.maxAzimuthAngle}
          enablePan={controlsConfig.enablePan && !isFurnitureDragging && !isDraggingColumn && !isSlotDragging}
          enableZoom={controlsConfig.enableZoom && !isFurnitureDragging && !isDraggingColumn && !isSlotDragging}
          enableRotate={controlsConfig.enableRotate && !isFurnitureDragging && !isDraggingColumn && !isSlotDragging}
          minDistance={controlsConfig.minDistance}
          maxDistance={controlsConfig.maxDistance}
          mouseButtons={controlsConfig.mouseButtons}
          touches={controlsConfig.touches}
          panSpeed={0.8}
          rotateSpeed={0.3}
          zoomSpeed={viewMode === '2D' ? 0.02 : 1.2}
          enableDamping={true}
          dampingFactor={viewMode === '2D' ? 0.2 : 0.04}
          screenSpacePanning={true}
          zoomToCursor={true}
          makeDefault
        />
        
        {/* 터치 컨트롤 설정 - 항상 활성화 (테스트용) */}
        <TouchOrbitControlsSetup 
          controlsRef={controlsRef}
          enabled={!isFurnitureDragging && !isDraggingColumn && !isSlotDragging}
        />
        
        {/* 기존 조건부 터치 컨트롤 (나중에 필요시 사용) */}
        {/* {(isTouchDevice || isMobile || isTablet) && (
          <TouchOrbitControlsSetup 
            controlsRef={controlsRef}
            enabled={true}
          />
        )} */}
        
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
