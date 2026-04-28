import React from 'react';
import * as THREE from 'three';
import BoxWithEdges from './BoxWithEdges';
import type { ModuleData, SectionConfig } from '@/data/modules/shelving';

/**
 * SectionedCabinetShell
 *   - 섹션별 독립 박스 렌더링 (인출장/팬트리장 전용)
 *   - 각 섹션마다: 측판(좌/우) + 상판 + 바닥판 + 백패널 + 후면 보강대(위/아래)
 *   - 인출장(3섹션): 1단(H600 고정) + 2단(H500 고정) + 3단(가변)
 *   - 팬트리장(2섹션): 1단(H1825 고정) + 2단(가변)
 *   - 상판 옵셋: 마지막(최상) 섹션은 옵셋 0, 그 외 섹션은 85mm 앞에서 안쪽
 *   - 바닥판: 옵셋 0
 *   - 섹션 사이 갭: 0 (1단 상판 = 2단 바닥판 = 18mm 두께 한 장 X — 각각 별도 패널)
 *
 * 좌표계:
 *   - 가구 그룹 중심이 원점 (x=0, y=0, z=0)
 *   - x: 좌(-) ~ 우(+) — 가로
 *   - y: 아래(-) ~ 위(+) — 세로
 *   - z: 뒤(-) ~ 앞(+) — 깊이
 *   - 가구 외경 = (width × height × depth)
 */

interface SectionedCabinetShellProps {
  width: number;          // Three.js 단위 (가구 외경 폭)
  height: number;         // Three.js 단위 (가구 외경 높이 = sections 합)
  depth: number;          // Three.js 단위 (가구 외경 깊이)
  basicThickness: number; // Three.js 단위 (18mm)
  backPanelThickness: number; // Three.js 단위 (백패널 두께)
  material: THREE.Material;
  mmToThreeUnits: (mm: number) => number;
  sections: SectionConfig[]; // 1단, 2단, 3단 (또는 1단, 2단)
  modelConfig?: ModuleData['modelConfig'];
  isDragging?: boolean;
  isEditMode?: boolean;
  isHighlighted?: boolean;
  /** 섹션별 children 렌더링 (속서랍, 다보선반, 전자렌지 인출 등) */
  renderSectionContent?: (sectionIndex: number, info: SectionInfo) => React.ReactNode;
}

export interface SectionInfo {
  /** 섹션 외경 높이 (Three.js 단위) */
  outerHeight: number;
  /** 섹션 외경 높이 (mm) */
  outerHeightMm: number;
  /** 섹션 내경 높이 (외경 - 상판 - 바닥판) */
  innerHeight: number;
  /** 섹션 중심 Y (가구 중심 기준, Three.js 단위) */
  centerY: number;
  /** 섹션 바닥판 윗면 Y (가구 중심 기준) */
  bottomTopY: number;
  /** 섹션 상판 밑면 Y */
  topBottomY: number;
  /** 섹션 내경 폭 (외경 - 측판×2) */
  innerWidth: number;
  /** 섹션 깊이 (외경) */
  outerDepth: number;
  /** 섹션 내경 깊이 (외경 - 백패널) */
  innerDepth: number;
}

const SectionedCabinetShell: React.FC<SectionedCabinetShellProps> = ({
  width,
  height,
  depth,
  basicThickness,
  backPanelThickness,
  material,
  mmToThreeUnits,
  sections,
  modelConfig,
  renderSectionContent,
}) => {
  if (!sections || sections.length === 0) return null;

  const TOP_OFFSET_MM = 85; // 1·2단 상판은 앞에서 85mm 안쪽 옵셋, 마지막(최상) 섹션은 0
  const REINFORCEMENT_HEIGHT_MM = 60; // 보강대 높이
  const REINFORCEMENT_DEPTH_MM = 15.5; // 보강대 두께 (다른 가구와 동일)

  const reinforcementHeight = mmToThreeUnits(REINFORCEMENT_HEIGHT_MM);
  const reinforcementDepth = mmToThreeUnits(REINFORCEMENT_DEPTH_MM);

  // 섹션 누적 Y 위치 계산 (1단부터 위로 쌓임)
  // 가구 중심 기준 (가구 외경 합 = height)
  const halfHeight = height / 2;
  let cursorY = -halfHeight; // 가구 바닥(아래)부터 시작

  const sectionInfos: SectionInfo[] = sections.map((section) => {
    const outerHeightMm = section.height;
    const outerHeight = mmToThreeUnits(outerHeightMm);
    const sectionBottomY = cursorY;
    const sectionTopY = cursorY + outerHeight;
    const centerY = (sectionBottomY + sectionTopY) / 2;
    const innerHeight = outerHeight - basicThickness * 2;
    const bottomTopY = sectionBottomY + basicThickness;
    const topBottomY = sectionTopY - basicThickness;
    const innerWidth = width - basicThickness * 2;
    const innerDepth = depth - backPanelThickness;

    cursorY = sectionTopY;

    return {
      outerHeight,
      outerHeightMm,
      innerHeight,
      centerY,
      bottomTopY,
      topBottomY,
      innerWidth,
      outerDepth: depth,
      innerDepth,
    };
  });

  const halfDepth = depth / 2;
  const halfWidth = width / 2;
  const innerWidth = width - basicThickness * 2;

  return (
    <group>
      {sectionInfos.map((info, idx) => {
        const isLastSection = idx === sectionInfos.length - 1;
        const topOffsetMm = isLastSection ? 0 : TOP_OFFSET_MM;
        const topOffset = mmToThreeUnits(topOffsetMm);

        // 측판 (좌/우): 섹션 외경 높이 전체
        const sidePanelY = info.centerY;
        const leftPanelX = -halfWidth + basicThickness / 2;
        const rightPanelX = halfWidth - basicThickness / 2;

        // 상판: 옵셋 적용 (앞쪽에서 안쪽으로 들어감)
        // 깊이 = 외경 깊이 - 옵셋 - 백패널두께
        const topPanelDepth = depth - topOffset - backPanelThickness;
        const topPanelZ = -halfDepth + backPanelThickness + topPanelDepth / 2; // 백패널 앞에서 시작
        const topPanelY = info.topBottomY + basicThickness / 2;

        // 바닥판: 옵셋 0, 깊이 = 외경 깊이 - 백패널 두께 (백패널 앞에 닿음)
        const bottomPanelDepth = depth - backPanelThickness;
        const bottomPanelZ = -halfDepth + backPanelThickness + bottomPanelDepth / 2;
        const bottomPanelY = info.bottomTopY - basicThickness / 2;

        // 백패널: 9mm 두께, 섹션 내경 폭/높이 - 약간 작게
        const backPanelHeight = info.outerHeight - basicThickness * 2; // 섹션 내경 높이
        const backPanelWidth = innerWidth;
        const backPanelZ = -halfDepth + backPanelThickness / 2;
        const backPanelY = info.centerY;

        // 후면 보강대 (위/아래) — 섹션 내경 폭(양쪽 0.5mm씩 축소), 깊이 15.5mm, 백패널 뒤쪽에 부착 (다른 가구와 동일)
        const sidePanelGap = mmToThreeUnits(1); // 좌/우 측판과 0.5mm씩 갭 (총 1mm)
        const reinforcementWidth = innerWidth - sidePanelGap;
        const reinforcementZ = backPanelZ - backPanelThickness / 2 - reinforcementDepth / 2;
        // 백패널 내경 상/하단에 보강대 정렬
        const backPanelTopY = backPanelY + backPanelHeight / 2;
        const backPanelBottomY = backPanelY - backPanelHeight / 2;
        const lowerReinforcementY = backPanelBottomY + reinforcementHeight / 2;
        const upperReinforcementY = backPanelTopY - reinforcementHeight / 2;

        return (
          <group key={`section-${idx}`}>
            {/* 좌 측판 */}
            <BoxWithEdges
              args={[basicThickness, info.outerHeight, depth]}
              position={[leftPanelX, sidePanelY, 0]}
              material={material}
            />
            {/* 우 측판 */}
            <BoxWithEdges
              args={[basicThickness, info.outerHeight, depth]}
              position={[rightPanelX, sidePanelY, 0]}
              material={material}
            />
            {/* 상판 (옵셋 적용) */}
            <BoxWithEdges
              args={[innerWidth, basicThickness, topPanelDepth]}
              position={[0, topPanelY, topPanelZ]}
              material={material}
            />
            {/* 바닥판 */}
            <BoxWithEdges
              args={[innerWidth, basicThickness, bottomPanelDepth]}
              position={[0, bottomPanelY, bottomPanelZ]}
              material={material}
            />
            {/* 백패널 (9mm) */}
            <BoxWithEdges
              args={[backPanelWidth, backPanelHeight, backPanelThickness]}
              position={[0, backPanelY, backPanelZ]}
              material={material}
            />
            {/* 후면 보강대 (하단) */}
            <BoxWithEdges
              args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
              position={[0, lowerReinforcementY, reinforcementZ]}
              material={material}
            />
            {/* 후면 보강대 (상단) */}
            <BoxWithEdges
              args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
              position={[0, upperReinforcementY, reinforcementZ]}
              material={material}
            />
            {/* 섹션 내부 콘텐츠 (속서랍, 다보선반, 전자렌지 인출 등) */}
            {renderSectionContent && renderSectionContent(idx, info)}
          </group>
        );
      })}
    </group>
  );
};

export default SectionedCabinetShell;
