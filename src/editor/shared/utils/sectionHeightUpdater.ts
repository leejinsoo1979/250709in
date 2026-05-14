import { SectionConfig } from '@/data/modules/shelving';
import { PlacedModule } from '../furniture/types';

/**
 * 섹션 높이 업데이트 유틸리티
 *
 * 가구의 특정 섹션 높이를 변경하고, 전체 가구 높이도 조정합니다.
 */

export interface SectionHeightUpdateResult {
  success: boolean;
  updatedSections?: SectionConfig[];
  updatedHeight?: number;
  error?: string;
}

/**
 * 가구 섹션의 높이를 업데이트합니다.
 *
 * @param placedModule 배치된 가구 모듈
 * @param sectionIndex 변경할 섹션 인덱스
 * @param newInternalHeight 새로운 내경 높이 (mm)
 * @param basicThickness 패널 두께 (mm, 기본값 18)
 * @returns 업데이트 결과
 */
export function updateSectionHeight(
  placedModule: PlacedModule,
  sectionIndex: number,
  newInternalHeight: number,
  basicThickness: number = 18
): SectionHeightUpdateResult {
  try {
    // customSections가 있으면 사용, 없으면 기본 섹션 복사
    const currentSections = placedModule.customSections ||
                           (placedModule.moduleData?.modelConfig?.sections ?
                            [...placedModule.moduleData.modelConfig.sections] : []);

    if (!currentSections || currentSections.length === 0) {
      return {
        success: false,
        error: '섹션 정보가 없습니다'
      };
    }

    if (sectionIndex < 0 || sectionIndex >= currentSections.length) {
      return {
        success: false,
        error: '유효하지 않은 섹션 인덱스입니다'
      };
    }

    const section = currentSections[sectionIndex];

    // 절대 높이 타입만 편집 가능
    if (section.heightType !== 'absolute') {
      return {
        success: false,
        error: '퍼센트 기반 섹션은 편집할 수 없습니다'
      };
    }

    // 새로운 섹션 높이 계산 (내경 + 상하판 두께)
    // drawer 섹션: 내경 + 상판(18) + 바닥판(18) = 내경 + 36
    // hanging 섹션: 내경 + 바닥판(18) + (isTopFinishPanel ? 상판(18) : 0)
    let newSectionHeight: number;

    if (section.type === 'drawer') {
      // 서랍 섹션: 내경 + 상하 패널
      newSectionHeight = newInternalHeight + basicThickness * 2;
    } else if (section.type === 'hanging') {
      // Hanging 섹션
      if (section.isTopFinishPanel) {
        // 상판이 있는 경우 (타입2 하부 섹션)
        newSectionHeight = newInternalHeight + basicThickness * 2;
      } else {
        // 상판이 없는 경우 (일반 hanging, 상단 몰딩이 상판 역할)
        newSectionHeight = newInternalHeight + basicThickness;
      }
    } else {
      // 다른 타입은 기본값
      newSectionHeight = newInternalHeight;
    }

    // 섹션 높이 변경량 계산
    const heightDelta = newSectionHeight - section.height;

    console.log('📏 섹션 높이 업데이트:', {
      sectionIndex,
      sectionType: section.type,
      oldHeight: section.height,
      newSectionHeight,
      newInternalHeight,
      heightDelta,
      isTopFinishPanel: section.isTopFinishPanel
    });

    // 새로운 섹션 배열 생성
    const updatedSections = currentSections.map((s, idx) => {
      if (idx === sectionIndex) {
        return {
          ...s,
          height: newSectionHeight,
          // 내경 높이도 저장 (선택사항)
          internalHeight: newInternalHeight
        };
      }
      return s;
    });

    // 전체 가구 높이 계산
    const allFixedHeight = updatedSections
      .filter(s => s.heightType === 'absolute')
      .reduce((sum, s) => sum + s.height, 0);

    // 새로운 전체 높이 = 고정 섹션들의 합 + 상하 프레임 (2 * basicThickness)
    const newTotalHeight = allFixedHeight + basicThickness * 2;

    console.log('📐 전체 가구 높이 업데이트:', {
      oldHeight: placedModule.moduleData?.dimensions.height,
      newHeight: newTotalHeight,
      allFixedHeight,
      frameThickness: basicThickness * 2
    });

    return {
      success: true,
      updatedSections,
      updatedHeight: newTotalHeight
    };
  } catch (error) {
    console.error('❌ 섹션 높이 업데이트 실패:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    };
  }
}
