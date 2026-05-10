import { useCallback, useState } from 'react';
import {
  downloadDXFFromScene,
  generateDXFFilenameFromScene,
  generateCombinedDXFFilenameFromScene
} from '../utils/dxfFromScene';
import {
  buildCombinedDxfFromDrawingData,
  generateDxfFromData,
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
import { captureExportUiState, createExportViewUiPatch, shouldApplyExportUiPatch } from '../utils/exportStateSnapshot';
import { getSideViewSlotGroups } from '../utils/sideViewModuleFilter';

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

const createSideSlotFilename = (
  spaceInfo: SpaceInfo,
  slotNumber: number
): string => generateDXFFilenameFromScene(spaceInfo, 'sideLeft')
  .replace('furniture-side-', `furniture-side-slot-${slotNumber}-`);

/**
 * DXF 내보내기 기능을 제공하는 커스텀 훅
 * Three.js 씬에서 실제 렌더링된 geometry를 추출하여 DXF로 내보냄
 * 그리드는 객체 이름(name="grid-*")으로 자동 필터링됨
 */
export const useDXFExport = () => {
  const [isExporting, setIsExporting] = useState(false);

  const persistOrDownloadDxf = useCallback(async (
    dxfContent: string,
    filename: string
  ): Promise<void> => {
    try {
      const user = auth.currentUser;
      if (user) {
        const teamId = `personal_${user.uid}`;
        const designId = 'current_design';
        const versionId = await getCurrentVersionId(teamId, designId) || 'v_' + Date.now();

        const blob = new Blob([dxfContent], { type: 'application/dxf' });
        await exportWithPersistence(blob, filename, 'dxf', teamId, designId, versionId);
        console.log(`✅ DXF Storage 업로드 성공: ${filename}`);
        return;
      }

      downloadDXFFromScene(dxfContent, filename);
    } catch (error) {
      console.error('Storage 업로드 실패, 로컬 다운로드로 폴백:', error);
      downloadDXFFromScene(dxfContent, filename);
    }
  }, []);

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
    const originalUI = captureExportUiState(useUIStore.getState());

    const switchSceneView = async (direction: 'front' | 'left' | 'top', selectedSlotIndex?: number | null) => {
      const patch = createExportViewUiPatch(direction, selectedSlotIndex);
      if (shouldApplyExportUiPatch(useUIStore.getState(), patch)) {
        useUIStore.setState(patch);
      }
      await waitForSceneUpdate(700);
    };

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

      const downloadedFilenames: string[] = [];

      if (drawingType === 'side' || drawingType === 'sideLeft') {
        const sideSlotGroups = getSideViewSlotGroups(placedModules);
        if (sideSlotGroups.length === 0) {
          throw new Error('측면도에 포함할 가구가 없습니다.');
        }

        for (const group of sideSlotGroups) {
          await switchSceneView('left', group.selectedSlotIndex);
          const dxfContent = generateDxfFromData(spaceInfo, group.modules, 'left');
          const filename = createSideSlotFilename(spaceInfo, group.titleIndex);
          await persistOrDownloadDxf(dxfContent, filename);
          downloadedFilenames.push(filename);
        }
      } else {
        const viewDirection = drawingType === 'plan' ? 'top' : 'front';
        await switchSceneView(viewDirection);
        const dxfContent = generateDxfFromData(
          spaceInfo,
          placedModules,
          viewDirection,
          'all',
          false,
          drawingType === 'door' ? ['DOOR', 'DOOR_DIMENSIONS'] : undefined
        );
        const filename = generateDXFFilenameFromScene(spaceInfo, drawingType);
        await persistOrDownloadDxf(dxfContent, filename);
        downloadedFilenames.push(filename);
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
        filename: downloadedFilenames.join(', '),
        message: `DXF ${drawingTypeNames[drawingType]} 파일 ${downloadedFilenames.length}개가 성공적으로 생성되었습니다.`
      };

    } catch (error) {
      console.error(`❌ DXF ${drawingType} 도면 내보내기 실패:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        message: `DXF ${drawingType} 도면 파일 생성에 실패했습니다.`
      };
    } finally {
      useUIStore.setState(originalUI);
      setIsExporting(false);
    }
  }, [persistOrDownloadDxf]);

  /**
   * DXF 내보내기 가능 여부 확인
   * @param spaceInfo 공간 정보
   * @param placedModules 배치된 가구 모듈들
   */
  const canExportDXF = useCallback((
    spaceInfo: SpaceInfo | null,
    _placedModules: PlacedModule[]
  ): boolean => {
    void _placedModules;

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
    const originalUI = captureExportUiState(uiStore);
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
        const patch = createExportViewUiPatch(direction);
        if (shouldApplyExportUiPatch(useUIStore.getState(), patch)) {
          useUIStore.setState(patch);
        }
        await waitForSceneUpdate(700);
      };

      if (drawingTypes.includes('front')) {
        await switchSceneView('front');
        drawingData.push({
          title: '입면도',
          data: generateDxfDrawingData(spaceInfo, placedModules, 'front')
        });
      }

      if (drawingTypes.includes('plan')) {
        await switchSceneView('top');
        drawingData.push({
          title: '평면도',
          data: generateDxfDrawingData(spaceInfo, placedModules, 'top')
        });
      }

      if (drawingTypes.includes('side') || drawingTypes.includes('sideLeft')) {
        const sideSlotGroups = getSideViewSlotGroups(placedModules);

        for (const group of sideSlotGroups) {
          const slotPatch = { selectedSlotIndex: group.selectedSlotIndex };
          if (shouldApplyExportUiPatch(useUIStore.getState(), slotPatch)) {
            useUIStore.setState(slotPatch);
          }
          await switchSceneView('left');

          const sideData = generateDxfDrawingData(spaceInfo, group.modules, 'left');
          drawingData.push({
            title: `측면도 ${group.titleIndex}`,
            data: sideData
          });
        }
      }

      if (drawingTypes.includes('door')) {
        await switchSceneView('front');
        drawingData.push({
          title: '도어도면',
          data: generateDxfDrawingData(spaceInfo, placedModules, 'front', 'all', false, undefined, ['DOOR', 'DOOR_DIMENSIONS'])
        });
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
      if (useFurnitureStore.getState().placedModules !== originalPlacedModules) {
        useFurnitureStore.setState({ placedModules: originalPlacedModules });
      }
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
