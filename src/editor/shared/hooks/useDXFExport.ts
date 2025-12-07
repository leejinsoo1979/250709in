import { useCallback } from 'react';
import { generateDXF, downloadDXF, generateDXFFilename } from '../utils/dxfGenerator';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import type { PlacedModule } from '../furniture/types';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../viewer3d/utils/geometry';
import JSZip from 'jszip';
import { exportWithPersistence } from '@/services/exportService';
import { getCurrentVersionId } from '@/services/designs.repo';
import { auth } from '@/firebase/config';

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
          
          // 가구 치수 디버깅 로그
          console.log(`🔍 가구 ${module.id} DXF 내보내기 치수 확인:`, {
            moduleId: module.moduleId,
            customDepth: module.customDepth,
            originalDepth: moduleData?.dimensions.depth,
            customWidth: module.customWidth,
            adjustedWidth: module.adjustedWidth,
            originalWidth: moduleData?.dimensions.width,
            finalWidth: module.customWidth || module.adjustedWidth || moduleData?.dimensions.width
          });
          
          // 실제 모듈의 modelConfig 추출 (섹션 정보 포함)
          const modelConfig = moduleData?.modelConfig;

          console.log(`📦 [DXF Export] 모듈 ${module.moduleId} 구조 정보:`, {
            sections: modelConfig?.sections,
            shelfCount: modelConfig?.shelfCount,
            drawerCount: modelConfig?.drawerCount,
            basicThickness: modelConfig?.basicThickness
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
                // 기둥에 의해 조정된 너비 우선 사용 (customWidth는 Column C용, adjustedWidth는 일반 기둥용)
                width: module.customWidth || module.adjustedWidth || moduleData?.dimensions.width || 400,
                height: moduleData?.dimensions.height || 400,
                depth: module.customDepth || moduleData?.dimensions.depth || 300
              },
              // 실제 가구 구조 정보 전달 (섹션, 선반, 서랍 등)
              modelConfig: modelConfig ? {
                basicThickness: modelConfig.basicThickness,
                hasOpenFront: modelConfig.hasOpenFront,
                sections: modelConfig.sections,
                shelfCount: modelConfig.shelfCount,
                drawerCount: modelConfig.drawerCount
              } : undefined
            },
            rotation: module.rotation,
            slotIndex: module.slotIndex, // 슬롯 인덱스 정보 추가
            isDualSlot: module.isDualSlot, // 듀얼 슬롯 여부 추가
            adjustedWidth: module.adjustedWidth, // 조정된 너비 추가
            customWidth: module.customWidth // Column C용 커스텀 너비 추가
          };
        })
      };
      
      console.log('🔄 변환된 DXF 데이터:', dxfData);
      
      // DXF 내용 생성
      const dxfContent = generateDXF(dxfData);
      
      // 파일명 생성 (도면 타입 포함)
      const filename = generateDXFFilename(spaceInfo, drawingType);
      
      // Storage 업로드 시도
      try {
        const user = auth.currentUser;
        if (user) {
          // Team ID와 Design ID 가져오기 (실제 프로젝트에서는 context나 store에서 가져와야 함)
          const teamId = `personal_${user.uid}`; // 임시: personal team 사용
          const designId = 'current_design'; // 임시: 현재 디자인 ID
          const versionId = await getCurrentVersionId(teamId, designId) || 'v_' + Date.now();
          
          // Blob 생성
          const blob = new Blob([dxfContent], { type: 'application/dxf' });
          
          // Storage에 저장 시도
          await exportWithPersistence(blob, filename, 'dxf', teamId, designId, versionId);
          console.log(`✅ DXF ${drawingType} Storage 업로드 성공!`);
        } else {
          // 로그인하지 않은 경우 기존 방식으로 다운로드
          downloadDXF(dxfContent, filename);
        }
      } catch (error) {
        console.error('Storage 업로드 실패, 로컬 다운로드로 폴백:', error);
        // 실패 시 기존 방식으로 다운로드
        downloadDXF(dxfContent, filename);
      }
      
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

  /**
   * 여러 DXF 파일을 ZIP으로 묶어서 다운로드
   * @param spaceInfo 공간 정보
   * @param placedModules 배치된 가구 모듈들
   * @param drawingTypes 도면 타입들
   */
  const exportToZIP = useCallback(async (
    spaceInfo: SpaceInfo,
    placedModules: PlacedModule[],
    drawingTypes: DrawingType[]
  ) => {
    try {
      console.log(`🔧 DXF ZIP 내보내기 시작...`);
      console.log('📊 선택된 도면:', drawingTypes);
      
      // ZIP 파일 생성
      const zip = new JSZip();
      
      // 내부 공간 계산
      const internalSpace = calculateInternalSpace(spaceInfo);
      
      // 각 도면 타입별로 DXF 생성
      for (const drawingType of drawingTypes) {
        console.log(`📄 ${drawingType} 도면 생성 중...`);
        
        // DXF 데이터 준비
        const dxfData = {
          spaceInfo: spaceInfo,
          drawingType,
          placedModules: placedModules.map(module => {
            const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
            const modelConfig = moduleData?.modelConfig;

            return {
              id: module.id,
              moduleId: module.moduleId,
              position: {
                x: module.position.x,
                y: module.position.y,
                z: module.position.z
              },
              moduleData: {
                name: moduleData?.name || `모듈-${module.moduleId}`,
                dimensions: {
                  width: module.customWidth || module.adjustedWidth || moduleData?.dimensions.width || 400,
                  height: moduleData?.dimensions.height || 400,
                  depth: module.customDepth || moduleData?.dimensions.depth || 300
                },
                // 실제 가구 구조 정보 전달
                modelConfig: modelConfig ? {
                  basicThickness: modelConfig.basicThickness,
                  hasOpenFront: modelConfig.hasOpenFront,
                  sections: modelConfig.sections,
                  shelfCount: modelConfig.shelfCount,
                  drawerCount: modelConfig.drawerCount
                } : undefined
              },
              rotation: module.rotation,
              slotIndex: module.slotIndex,
              isDualSlot: module.isDualSlot
            };
          })
        };
        
        // DXF 내용 생성
        const dxfContent = generateDXF(dxfData);
        
        // 파일명 생성
        const filename = generateDXFFilename(spaceInfo, drawingType);
        
        // ZIP에 파일 추가
        zip.file(filename, dxfContent);
        
        console.log(`✅ ${drawingType} 도면 추가 완료: ${filename}`);
      }
      
      // README 파일 추가 (도면 정보 포함)
      const readmeContent = `가구 배치 도면 (DXF)
========================

생성일: ${new Date().toLocaleDateString('ko-KR')}
공간 크기: ${spaceInfo.width}mm × ${spaceInfo.height}mm × ${spaceInfo.depth}mm

포함된 도면:
${drawingTypes.map(type => {
  const typeNames = {
    front: '- 정면도 (Front Elevation)',
    plan: '- 평면도 (Plan View)',
    side: '- 측면도 (Side Section)'
  };
  return typeNames[type] || `- ${type}`;
}).join('\n')}

가구 개수: ${placedModules.length}개

도면 정보:
- 축척: 1:100
- 단위: mm (밀리미터)
- CAD 호환: AutoCAD DXF 형식

참고사항:
- 모든 치수는 밀리미터(mm) 단위입니다.
- 가구 배치는 실제 공간 치수를 기준으로 합니다.
- DXF 파일은 대부분의 CAD 프로그램에서 열 수 있습니다.
`;
      
      zip.file('README.txt', readmeContent);
      
      // ZIP 파일 생성 및 다운로드
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // 파일명 생성
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const dimensions = `${spaceInfo.width}W-${spaceInfo.height}H-${spaceInfo.depth}D`;
      const zipFilename = `furniture-drawings-${dimensions}-${timestamp}.zip`;
      
      // 다운로드 링크 생성
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFilename;
      
      // 다운로드 실행
      document.body.appendChild(link);
      link.click();
      
      // 정리
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log(`✅ DXF ZIP 파일 다운로드 완료: ${zipFilename}`);
      
      // 도면 타입별 메시지
      const drawingTypeNames = {
        front: '정면도',
        plan: '평면도',
        side: '측면도'
      };
      
      const selectedDrawingNames = drawingTypes.map(type => drawingTypeNames[type]).join(', ');
      
      return {
        success: true,
        filename: zipFilename,
        message: `DXF 도면 ${drawingTypes.length}개 (${selectedDrawingNames})가 ZIP 파일로 생성되었습니다.`
      };
      
    } catch (error) {
      console.error(`❌ DXF ZIP 내보내기 실패:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        message: `DXF ZIP 파일 생성에 실패했습니다.`
      };
    }
  }, []);

  return {
    exportToDXF,
    exportToZIP,
    canExportDXF,
    getExportStatusMessage
  };
}; 