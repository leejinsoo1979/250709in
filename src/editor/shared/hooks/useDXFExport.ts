import { useCallback } from 'react';
import { generateDXF, downloadDXF, generateDXFFilename } from '../utils/dxfGenerator';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import type { PlacedModule } from '../furniture/types';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../viewer3d/utils/geometry';

// 도면 타입 정의
export type DrawingType = 'front' | 'plan' | 'side';

/**
 * DXF 내보내기 기능을 제공하는 커스텀 훅
 */
export const useDXFExport = () => {
  /**
   * 현재 가구 배치를 DXF 파일로 내보내기
   * @param spaceInfo 공간 정보
   * @param placedModules 배치된 가구 모듈들
   * @param drawingType 도면 타입 (기본값: 'front')
   */
  const exportToDXF = useCallback(async (
    spaceInfo: SpaceInfo,
    placedModules: PlacedModule[],
    drawingType: DrawingType = 'front'
  ) => {
    try {
      console.log(`🔧 DXF ${drawingType} 도면 내보내기 시작...`);
      console.log('📊 입력 데이터:', {
        spaceInfo: {
          width: spaceInfo.width,
          height: spaceInfo.height,
          depth: spaceInfo.depth,
          surroundType: spaceInfo.surroundType,
          customColumnCount: spaceInfo.customColumnCount
        },
        placedModulesCount: placedModules.length,
        drawingType,
        placedModules: placedModules.map(m => ({
          id: m.id,
          moduleId: m.moduleId,
          position: m.position,
          slotIndex: m.slotIndex,
          isDualSlot: m.isDualSlot,
          customDepth: m.customDepth // customDepth 로그 추가
        }))
      });
      
      // 내부 공간 계산
      const internalSpace = calculateInternalSpace(spaceInfo);
      
      // 데이터 변환 (새로운 DXF 타입으로 변환)
      const dxfData = {
        spaceInfo: spaceInfo, // SpaceInfo를 직접 전달
        drawingType, // 도면 타입 추가
        placedModules: placedModules.map(module => {
          // 모듈 데이터 가져오기
          const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
          
          // customDepth 디버깅 로그
          console.log(`🔍 가구 ${module.id} customDepth 확인:`, {
            moduleId: module.moduleId,
            customDepth: module.customDepth,
            originalDepth: moduleData?.dimensions.depth
          });
          
          return {
            id: module.id,
            moduleId: module.moduleId, // 실제 모듈 ID 추가
            position: {
              x: module.position.x,
              y: module.position.y,
              z: module.position.z
            },
            moduleData: {
              name: moduleData?.name || `모듈-${module.moduleId}`,
              dimensions: {
                width: moduleData?.dimensions.width || 400,
                height: moduleData?.dimensions.height || 400,
                depth: module.customDepth || moduleData?.dimensions.depth || 300
              }
            },
            rotation: module.rotation,
            slotIndex: module.slotIndex, // 슬롯 인덱스 정보 추가
            isDualSlot: module.isDualSlot // 듀얼 슬롯 여부 추가
          };
        })
      };
      
      console.log('🔄 변환된 DXF 데이터:', dxfData);
      
      // DXF 내용 생성
      const dxfContent = generateDXF(dxfData);
      
      // 파일명 생성 (도면 타입 포함)
      const filename = generateDXFFilename(spaceInfo, drawingType);
      
      // 파일 다운로드
      downloadDXF(dxfContent, filename);
      
      console.log(`✅ DXF ${drawingType} 도면 내보내기 완료!`);
      
      // 도면 타입별 메시지
      const drawingTypeNames = {
        front: '정면도',
        plan: '평면도',
        side: '측면도'
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
    }
  }, []);

  /**
   * DXF 내보내기 가능 여부 확인
   * @param spaceInfo 공간 정보
   * @param placedModules 배치된 가구 모듈들
   */
  const canExportDXF = useCallback((
    spaceInfo: SpaceInfo | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _placedModules: PlacedModule[]
  ): boolean => {
    // 공간 정보가 있고, 최소한의 치수가 설정되어 있어야 함
    if (!spaceInfo || spaceInfo.width <= 0 || spaceInfo.depth <= 0) {
      return false;
    }
    
    // 가구가 하나도 없어도 공간 도면은 생성 가능
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
     
     const moduleCount = placedModules.length;
     if (moduleCount === 0) {
       return '공간 도면만 생성됩니다.';
     }
     
     return `${moduleCount}개 가구가 포함된 도면이 생성됩니다.`;
   }, []);

  return {
    exportToDXF,
    canExportDXF,
    getExportStatusMessage
  };
}; 