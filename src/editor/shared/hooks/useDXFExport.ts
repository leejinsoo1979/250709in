import { useCallback, useState } from 'react';
import { generateDXFFromScene, downloadDXFFromScene, generateDXFFilenameFromScene } from '../utils/dxfFromScene';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import type { PlacedModule } from '../furniture/types';
import JSZip from 'jszip';
import { exportWithPersistence } from '@/services/exportService';
import { getCurrentVersionId } from '@/services/designs.repo';
import { auth } from '@/firebase/config';
import { sceneHolder } from '../viewer3d/sceneHolder';

// 도면 타입 정의
export type DrawingType = 'front' | 'plan' | 'side';

/**
 * DXF 내보내기 기능을 제공하는 커스텀 훅
 * Three.js 씬에서 실제 렌더링된 geometry를 추출하여 DXF로 내보냄
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
      setIsExporting(true);
      console.log(`🔧 DXF ZIP 내보내기 시작 (씬 기반)...`);
      console.log('📊 선택된 도면:', drawingTypes);

      // 씬 확인
      const scene = sceneHolder.getScene();
      if (!scene) {
        throw new Error('Three.js 씬을 찾을 수 없습니다. 에디터가 로드될 때까지 기다려주세요.');
      }

      // ZIP 파일 생성
      const zip = new JSZip();

      // 각 도면 타입별로 DXF 생성
      for (const drawingType of drawingTypes) {
        console.log(`📄 ${drawingType} 도면 생성 중...`);

        const dxfContent = generateDXFFromScene(spaceInfo, drawingType, placedModules);

        if (!dxfContent) {
          console.warn(`⚠️ ${drawingType} 도면 생성 실패, 건너뜀`);
          continue;
        }

        const filename = generateDXFFilenameFromScene(spaceInfo, drawingType);
        zip.file(filename, dxfContent);

        console.log(`✅ ${drawingType} 도면 추가 완료: ${filename}`);
      }

      // README 파일 추가
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
- 단위: mm (밀리미터)
- CAD 호환: AutoCAD DXF 형식
- 생성 방식: Three.js 씬에서 직접 추출

참고사항:
- 모든 치수는 밀리미터(mm) 단위입니다.
- 2D 에디터 화면과 동일한 결과가 출력됩니다.
- DXF 파일은 대부분의 CAD 프로그램에서 열 수 있습니다.
`;

      zip.file('README.txt', readmeContent);

      // ZIP 파일 생성 및 다운로드
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const dimensions = `${spaceInfo.width}W-${spaceInfo.height}H-${spaceInfo.depth}D`;
      const zipFilename = `furniture-drawings-${dimensions}-${timestamp}.zip`;

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFilename;

      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(`✅ DXF ZIP 파일 다운로드 완료: ${zipFilename}`);

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
    } finally {
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
