import React from 'react';
import * as THREE from 'three';
import BoxWithEdges from './BoxWithEdges';
import type { ModuleData, SectionConfig } from '@/data/modules/shelving';

/**
 * SectionedCabinetShell
 *   - 인출장/팬트리장 전용 셸
 *   - 측판: 가구 전체 1쌍 (좌/우, 풀 높이)
 *   - 상판/바닥판: 각 섹션마다 1개 (1·2단은 85mm 앞 옵셋, 마지막 섹션 옵셋 0)
 *   - 백패널: 섹션별 분리 (9mm)
 *   - 후면 보강대: 섹션별 위/아래 (60×15.5)
 *
 * 좌표계: 가구 그룹 중심이 원점.
 */

interface SectionedCabinetShellProps {
  width: number;
  height: number;
  depth: number;
  basicThickness: number;
  backPanelThickness: number;
  material: THREE.Material;
  mmToThreeUnits: (mm: number) => number;
  sections: SectionConfig[];
  modelConfig?: ModuleData['modelConfig'];
  isDragging?: boolean;
  isEditMode?: boolean;
  isHighlighted?: boolean;
  renderSectionContent?: (sectionIndex: number, info: SectionInfo) => React.ReactNode;
}

export interface SectionInfo {
  outerHeight: number;
  outerHeightMm: number;
  innerHeight: number;
  centerY: number;
  bottomTopY: number;
  topBottomY: number;
  innerWidth: number;
  outerDepth: number;
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
  renderSectionContent,
}) => {
  if (!sections || sections.length === 0) return null;

  const TOP_OFFSET_MM = 85; // 1·2단 상판: 앞에서 85mm 안쪽 옵셋, 마지막 섹션은 0
  const REINFORCEMENT_HEIGHT_MM = 60;
  const REINFORCEMENT_DEPTH_MM = 15.5;

  const reinforcementHeight = mmToThreeUnits(REINFORCEMENT_HEIGHT_MM);
  const reinforcementDepth = mmToThreeUnits(REINFORCEMENT_DEPTH_MM);
  const sidePanelGap = mmToThreeUnits(1); // 좌/우 측판과 0.5mm씩 갭

  const halfHeight = height / 2;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const innerWidth = width - basicThickness * 2;

  // 섹션 누적 Y 위치 계산
  let cursorY = -halfHeight;
  const sectionInfos: SectionInfo[] = sections.map((section) => {
    const outerHeightMm = section.height;
    const outerHeight = mmToThreeUnits(outerHeightMm);
    const sectionBottomY = cursorY;
    const sectionTopY = cursorY + outerHeight;
    const centerY = (sectionBottomY + sectionTopY) / 2;
    const innerHeight = outerHeight - basicThickness * 2;
    const bottomTopY = sectionBottomY + basicThickness;
    const topBottomY = sectionTopY - basicThickness;
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

  // 측판: 가구 전체 1쌍 (풀 높이 = height, 풀 깊이 = depth)
  const sidePanelY = 0;
  const leftPanelX = -halfWidth + basicThickness / 2;
  const rightPanelX = halfWidth - basicThickness / 2;

  // 백패널 Z: 가구 뒤쪽 안쪽으로 백패널 두께/2 만큼 들어감
  const backPanelZ = -halfDepth + backPanelThickness / 2;

  return (
    <group>
      {/* 좌 측판 (가구 전체 1개) */}
      <BoxWithEdges
        args={[basicThickness, height, depth]}
        position={[leftPanelX, sidePanelY, 0]}
        material={material}
      />
      {/* 우 측판 (가구 전체 1개) */}
      <BoxWithEdges
        args={[basicThickness, height, depth]}
        position={[rightPanelX, sidePanelY, 0]}
        material={material}
      />

      {/* 섹션별 상판/바닥판/백패널/보강대 */}
      {sectionInfos.map((info, idx) => {
        const isLastSection = idx === sectionInfos.length - 1;
        const isFirstSection = idx === 0;
        const topOffsetMm = isLastSection ? 0 : TOP_OFFSET_MM;
        const topOffset = mmToThreeUnits(topOffsetMm);

        // 상판: 옵셋 + 백패널 두께만큼 깊이 줄임, 너비는 내경 - 갭
        const topPanelDepth = depth - topOffset - backPanelThickness;
        const topPanelZ = -halfDepth + backPanelThickness + topPanelDepth / 2;
        const topPanelY = info.topBottomY + basicThickness / 2;
        const topPanelWidth = innerWidth - sidePanelGap;

        // 바닥판: 옵셋 0, 백패널 두께만큼 깊이 줄임, 너비 내경 - 갭
        const bottomPanelDepth = depth - backPanelThickness;
        const bottomPanelZ = -halfDepth + backPanelThickness + bottomPanelDepth / 2;
        const bottomPanelY = info.bottomTopY - basicThickness / 2;
        const bottomPanelWidth = innerWidth - sidePanelGap;

        // 백패널: 섹션 내경 높이, 너비 내경 (측판 사이)
        const backPanelHeight = info.innerHeight;
        const backPanelWidth = innerWidth;
        const backPanelY = info.centerY;

        // 후면 보강대: 백패널 안쪽 위/아래
        const reinforcementWidth = innerWidth - sidePanelGap;
        const reinforcementZ = backPanelZ - backPanelThickness / 2 - reinforcementDepth / 2;
        const backPanelTopY = backPanelY + backPanelHeight / 2;
        const backPanelBottomY = backPanelY - backPanelHeight / 2;
        const lowerReinforcementY = backPanelBottomY + reinforcementHeight / 2;
        const upperReinforcementY = backPanelTopY - reinforcementHeight / 2;

        return (
          <group key={`section-${idx}`}>
            {/* 상판 */}
            <BoxWithEdges
              args={[topPanelWidth, basicThickness, topPanelDepth]}
              position={[0, topPanelY, topPanelZ]}
              material={material}
            />
            {/* 바닥판 — 1단(첫 섹션)은 가구 외경 바닥과 일치 */}
            <BoxWithEdges
              args={[bottomPanelWidth, basicThickness, bottomPanelDepth]}
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
            {/* 섹션 내부 콘텐츠 */}
            {renderSectionContent && renderSectionContent(idx, info)}
          </group>
        );
      })}
    </group>
  );
};

export default SectionedCabinetShell;
