import { useCallback, useState } from 'react';
import {
  generateDXFFromScene,
  downloadDXFFromScene,
  generateDXFFilenameFromScene,
  generateCombinedDXFFilenameFromScene
} from '../utils/dxfFromScene';
import {
  buildCombinedDxfFromDrawingData,
  generateDxfDrawingData,
  type CombinedDxfDrawingData
} from '../utils/dxfDataRenderer';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import type { PlacedModule } from '../furniture/types';
import { exportWithPersistence } from '@/services/exportService';
import { getCurrentVersionId } from '@/services/designs.repo';
import { auth } from '@/firebase/config';
import { sceneHolder } from '../viewer3d/sceneHolder';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';

// 도면 타입 정의
export type DrawingType = 'front' | 'plan' | 'side' | 'sideLeft' | 'door';

const waitForSceneUpdate = async (delayMs = 500): Promise<void> => {
  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }

  if (delayMs > 0) {
    await new Promise<void>(resolve => window.setTimeout(resolve, delayMs));
  }
};

/**
 * DXF 내보내기 기능을 제공하는 커스텀 훅
 * Three.js 씬에서 실제 렌더링된 geometry를 추출하여 DXF로 내보냄
 * 그리드는 객체 이름(name="grid-*")으로 자동 필터링됨
 */
export const useDXFExport = () => {
  const [isExporting, setIsExporting] = useState(false);

  /**
   * 현재 가구 배치를 DXF 파일로 내보내기
   * Three.js 씬에서 실제 edge를 추출하여 2D 에디터와 동일한 결과 생성
   * @param spaceInfo 공간 정보
   * @param placedModules 배치된 가구 모듈들 (로깅용)
   * @param drawingType 도면 타입 (기본값: 'front')
   */
  const exportToDXF = useCallback(async (
    spaceInfo: SpaceInfo,
    placedModules: PlacedModule[],
    drawingType: DrawingType = 'front'
  ) => {
    try {
      setIsExporting(true);
      console.log(`🔧 DXF ${drawingType} 도면 내보내기 시작 (씬 기반)...`);
      console.log('📊 입력 데이터:', {
        spaceInfo: {
          width: spaceInfo.width,
          height: spaceInfo.height,
          depth: spaceInfo.depth,
          surroundType: spaceInfo.surroundType
        },
        placedModulesCount: placedModules.length,
        drawingType
      });

      // 씬 확인
      const scene = sceneHolder.getScene();
      if (!scene) {
        throw new Error('Three.js 씬을 찾을 수 없습니다. 에디터가 로드될 때까지 기다려주세요.');
      }

      // 데이터 기반 DXF 생성 (placedModules 전달)
      const dxfContent = generateDXFFromScene(spaceInfo, drawingType, placedModules);

      if (!dxfContent) {
        throw new Error('DXF 생성에 실패했습니다.');
      }

      // 파일명 생성
      const filename = generateDXFFilenameFromScene(spaceInfo, drawingType);

      // Storage 업로드 시도
      try {
        const user = auth.currentUser;
        if (user) {
          const teamId = `personal_${user.uid}`;
          const designId = 'current_design';
          const versionId = await getCurrentVersionId(teamId, designId) || 'v_' + Date.now();

          const blob = new Blob([dxfContent], { type: 'application/dxf' });
          await exportWithPersistence(blob, filename, 'dxf', teamId, designId, versionId);
          console.log(`✅ DXF ${drawingType} Storage 업로드 성공!`);
        } else {
          downloadDXFFromScene(dxfContent, filename);
        }
      } catch (error) {
        console.error('Storage 업로드 실패, 로컬 다운로드로 폴백:', error);
        downloadDXFFromScene(dxfContent, filename);
      }

      console.log(`✅ DXF ${drawingType} 도면 내보내기 완료!`);

      const drawingTypeNames: Record<DrawingType, string> = {
        front: '입면도',
        plan: '평면도',
        side: '측면도',
        sideLeft: '측면도',
        door: '도어도면'
      };

      return {
        success: true,
        filename,
        message: `DXF ${drawingTypeNames[drawingType]} 파일이 성공적으로 생성되었습니다.`
      };

    } catch (error) {
      console.error(`❌ DXF ${drawingType} 도면 내보내기 실패:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        message: `DXF ${drawingType} 도면 파일 생성에 실패했습니다.`
      };
    } finally {
      setIsExporting(false);
    }
  }, []);

  /**
   * DXF 내보내기 가능 여부 확인
   * @param spaceInfo 공간 정보
   * @param placedModules 배치된 가구 모듈들
   */
  const canExportDXF = useCallback((
    spaceInfo: SpaceInfo | null,
    _placedModules: PlacedModule[]
  ): boolean => {
    // 공간 정보가 있고, 최소한의 치수가 설정되어 있어야 함
    if (!spaceInfo || spaceInfo.width <= 0 || spaceInfo.depth <= 0) {
      return false;
    }

    // 씬이 있어야 함
    const scene = sceneHolder.getScene();
    if (!scene) {
      return false;
    }

    return true;
  }, []);

  /**
   * DXF 내보내기 상태 메시지 생성
   * @param spaceInfo 공간 정보
   * @param placedModules 배치된 가구 모듈들
   */
  const getExportStatusMessage = useCallback((
    spaceInfo: SpaceInfo | null,
    placedModules: PlacedModule[]
  ): string => {
    if (!spaceInfo) {
      return '공간 정보가 없습니다.';
    }

    if (spaceInfo.width <= 0 || spaceInfo.depth <= 0) {
      return '공간 크기를 설정해주세요.';
    }

    const scene = sceneHolder.getScene();
    if (!scene) {
      return '에디터가 로드될 때까지 기다려주세요.';
    }

    const moduleCount = placedModules.length;
    if (moduleCount === 0) {
      return '공간 도면만 생성됩니다.';
    }

    return `${moduleCount}개 가구가 포함된 도면이 생성됩니다.`;
  }, []);

  /**
   * 선택한 도면들을 하나의 DXF 레이아웃으로 묶어서 다운로드
   * @param spaceInfo 공간 정보
   * @param placedModules 배치된 가구 모듈들
   * @param drawingTypes 도면 타입들
   */
  const exportToZIP = useCallback(async (
    spaceInfo: SpaceInfo,
    placedModules: PlacedModule[],
    drawingTypes: DrawingType[]
  ) => {
    const uiStore = useUIStore.getState();
    const furnitureStore = useFurnitureStore.getState();
    const originalUI = {
      viewMode: uiStore.viewMode,
      view2DDirection: uiStore.view2DDirection,
      renderMode: uiStore.renderMode,
      showDimensions: uiStore.showDimensions,
      showDimensionsText: uiStore.showDimensionsText,
      showFurniture: uiStore.showFurniture
    };
    const originalPlacedModules = furnitureStore.placedModules;

    try {
      setIsExporting(true);
      console.log(`🔧 통합 DXF 내보내기 시작 (씬 기반)...`);
      console.log('📊 선택된 도면:', drawingTypes);

      // 씬 확인
      const scene = sceneHolder.getScene();
      if (!scene) {
        throw new Error('Three.js 씬을 찾을 수 없습니다. 에디터가 로드될 때까지 기다려주세요.');
      }

      const drawingData: CombinedDxfDrawingData[] = [];

      const switchSceneView = async (direction: 'front' | 'left' | 'top') => {
        useUIStore.setState({
          viewMode: '2D',
          view2DDirection: direction,
          renderMode: 'wireframe',
          showDimensions: true,
          showDimensionsText: true,
          showFurniture: true
        });
        await waitForSceneUpdate(700);
      };

      if (drawingTypes.includes('front')) {
        useFurnitureStore.setState({ placedModules: originalPlacedModules });
        await switchSceneView('front');
        drawingData.push({
          title: '입면도',
          data: generateDxfDrawingData(spaceInfo, placedModules, 'front')
        });
      }

      if (drawingTypes.includes('door')) {
        useFurnitureStore.setState({ placedModules: originalPlacedModules });
        await switchSceneView('front');
        drawingData.push({
          title: '도어도면',
          data: generateDxfDrawingData(spaceInfo, placedModules, 'front', 'all', false, undefined, ['DOOR', 'DOOR_DIMENSIONS'])
        });
      }

      if (drawingTypes.includes('plan')) {
        useFurnitureStore.setState({ placedModules: originalPlacedModules });
        await switchSceneView('top');
        drawingData.push({
          title: '평면도',
          data: generateDxfDrawingData(spaceInfo, placedModules, 'top')
        });
      }

      if (drawingTypes.includes('side') || drawingTypes.includes('sideLeft')) {
        const sideModules = [...placedModules].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));

        for (const [index, module] of sideModules.entries()) {
          useFurnitureStore.setState({ placedModules: [module] });
          await switchSceneView('left');

          const sideData = generateDxfDrawingData(spaceInfo, [module], 'left');
          drawingData.push({
            title: `측면도 ${index + 1}`,
            data: {
              ...sideData,
              lines: sideData.lines.filter(line => line.layer !== 'DOOR' && line.layer !== 'DOOR_DIMENSIONS'),
              texts: sideData.texts.filter(text => text.layer !== 'DOOR' && text.layer !== 'DOOR_DIMENSIONS')
            }
          });
        }
      }

      const dxfContent = buildCombinedDxfFromDrawingData(spaceInfo, drawingData);
      if (!dxfContent) {
        throw new Error('통합 DXF 생성에 실패했습니다.');
      }

      const filename = generateCombinedDXFFilenameFromScene(spaceInfo);
      downloadDXFFromScene(dxfContent, filename);

      console.log(`✅ 통합 DXF 파일 다운로드 완료: ${filename}`);

      const drawingTypeNames: Record<DrawingType, string> = {
        front: '입면도',
        plan: '평면도',
        side: '측면도',
        sideLeft: '측면도',
        door: '도어도면'
      };

      const selectedDrawingNames = drawingTypes.map(type => drawingTypeNames[type]).join(', ');

      return {
        success: true,
        filename,
        message: `DXF 도면 ${drawingTypes.length}개 (${selectedDrawingNames})가 통합 DXF 파일로 생성되었습니다.`
      };

    } catch (error) {
      console.error(`❌ 통합 DXF 내보내기 실패:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        message: `통합 DXF 파일 생성에 실패했습니다.`
      };
    } finally {
      useFurnitureStore.setState({ placedModules: originalPlacedModules });
      useUIStore.setState(originalUI);
      setIsExporting(false);
    }
  }, []);

  return {
    exportToDXF,
    exportToZIP,
    canExportDXF,
    getExportStatusMessage,
    isExporting
  };
};
