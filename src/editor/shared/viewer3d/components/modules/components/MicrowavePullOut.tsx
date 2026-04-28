import React from 'react';
import * as THREE from 'three';
import BoxWithEdges from './BoxWithEdges';

/**
 * MicrowavePullOut
 *   - 인출장 2단 섹션 안의 전자렌지 인출서랍 부재
 *   - 좌/우 날개프레임 18t × 65mm (가구 앞면에서 35mm 안쪽 옵셋 ~ 백패널까지)
 *   - 전면프레임 18 × 63mm (좌우 2mm 갭, 2단 섹션 바닥판에서 3mm 위)
 *   - 인출 트레이 바닥판 18t × 깊이 450 (백패널에서 39.5mm 앞, 좌우 2mm 갭, 날개프레임 윗면 -22)
 *
 * 좌표계: 인출장 그룹 중심 기준
 *   - 2단 섹션의 Y 범위: sectionBottomY ~ sectionTopY (가구 그룹 중심 기준)
 *   - 가구 외경 깊이 depth, 측판 두께 18, 백패널 두께 backPanelThickness
 */

interface MicrowavePullOutProps {
  // mm 단위 (외부에서 mm로 전달)
  sectionBottomMm: number;     // 2단 섹션 바닥(외경) Y mm — 가구 그룹 중심 기준
  sectionHeightMm: number;     // 2단 섹션 외경 높이 mm (500)
  innerWidthMm: number;         // 2단 섹션 내경 폭 (가구 외경 - 측판×2)
  outerDepthMm: number;         // 가구 외경 깊이 mm
  backPanelThicknessMm: number; // 백패널 두께 mm (9)
  basicThicknessMm: number;     // 패널 기본 두께 (18)
  material: THREE.Material;
  mmToThreeUnits: (mm: number) => number;
}

const MicrowavePullOut: React.FC<MicrowavePullOutProps> = ({
  sectionBottomMm,
  sectionHeightMm,
  innerWidthMm,
  outerDepthMm,
  backPanelThicknessMm,
  basicThicknessMm,
  material,
  mmToThreeUnits,
}) => {
  // 사양 상수
  const WING_THICKNESS_MM = 18;       // 날개프레임 두께
  const WING_HEIGHT_MM = 65;          // 날개프레임 높이
  const WING_FRONT_INSET_MM = 35;     // 날개프레임 앞면에서 안쪽 옵셋
  const FRONT_THICKNESS_MM = 18;      // 전면프레임 두께
  const FRONT_HEIGHT_MM = 63;         // 전면프레임 높이
  const FRONT_SIDE_GAP_MM = 2;        // 전면프레임 좌/우 날개프레임과의 갭
  const FRONT_BOTTOM_GAP_MM = 3;      // 전면프레임 하단 갭 (2단 바닥판 윗면 기준)
  const TRAY_THICKNESS_MM = 18;       // 인출 트레이 바닥판 두께
  const TRAY_DEPTH_MM = 450;          // 인출 트레이 바닥판 깊이
  const TRAY_BACK_OFFSET_MM = 39.5;   // 백패널에서 트레이 뒤쪽까지 거리
  const TRAY_SIDE_GAP_MM = 2;         // 인출 트레이 좌/우 날개프레임과의 갭
  const TRAY_TOP_BELOW_WING_MM = 22;  // 트레이 윗면 = 날개프레임 윗면 - 22

  // 2단 섹션 바닥판 윗면 = sectionBottomMm + 18 (바닥판 두께)
  const sectionBottomTopMm = sectionBottomMm + basicThicknessMm;
  // 가구 외경 좌우 끝 (mm, 가구 중심 기준)
  // innerWidth = outerWidth - 18×2 → outerWidth = innerWidth + 36
  const outerWidthMm = innerWidthMm + basicThicknessMm * 2;
  const halfOuterWidthMm = outerWidthMm / 2;
  const halfOuterDepthMm = outerDepthMm / 2;
  // 백패널 앞면 Z (mm, 가구 중심 기준): 백패널이 가구 뒤끝에 있고 두께 backPanelThicknessMm
  // 백패널 앞면 = -outerDepth/2 + backPanelThickness
  const backPanelFrontZMm = -halfOuterDepthMm + backPanelThicknessMm;
  // 가구 앞면 Z = outerDepth/2
  const furnitureFrontZMm = halfOuterDepthMm;

  // === 1) 좌/우 날개프레임 ===
  // 날개프레임 길이 = 가구 앞면에서 35mm 안쪽 ~ 백패널 앞면
  const wingStartZMm = furnitureFrontZMm - WING_FRONT_INSET_MM; // 앞쪽 끝
  const wingEndZMm = backPanelFrontZMm; // 뒤쪽 끝 (백패널 앞면)
  const wingDepthMm = wingStartZMm - wingEndZMm; // 길이
  const wingCenterZMm = (wingStartZMm + wingEndZMm) / 2;
  // 날개프레임 Y: 2단 바닥판 위 → 윗면 = sectionBottomTopMm + WING_HEIGHT_MM
  const wingBottomMm = sectionBottomTopMm;
  const wingTopMm = wingBottomMm + WING_HEIGHT_MM;
  const wingCenterYMm = (wingBottomMm + wingTopMm) / 2;
  // 날개프레임 X: 가구 측판 안쪽에 부착
  // 측판 안쪽 면 = ±halfOuterWidth ∓ basicThickness
  // 날개프레임 두께 18, 안쪽 면 기준으로 안으로 들어가게 위치
  const leftWingXMm = -halfOuterWidthMm + basicThicknessMm + WING_THICKNESS_MM / 2;
  const rightWingXMm = halfOuterWidthMm - basicThicknessMm - WING_THICKNESS_MM / 2;

  // === 2) 전면프레임 ===
  // 가로 = 좌/우 날개프레임 안쪽 면 사이 - 좌우 갭
  // 좌/우 날개프레임 안쪽 면 = leftWingX + WING_THICKNESS_MM/2, rightWingX - WING_THICKNESS_MM/2
  // (즉 leftWingX/rightWingX는 날개프레임 중심)
  const wingsInnerLeftMm = leftWingXMm + WING_THICKNESS_MM / 2;
  const wingsInnerRightMm = rightWingXMm - WING_THICKNESS_MM / 2;
  const frontFrameWidthMm = (wingsInnerRightMm - wingsInnerLeftMm) - FRONT_SIDE_GAP_MM * 2;
  const frontFrameCenterXMm = 0; // 가구 중심
  // 전면프레임 Y: 2단 바닥판 위에서 3mm 위 (밑면)
  const frontFrameBottomMm = sectionBottomTopMm + FRONT_BOTTOM_GAP_MM;
  const frontFrameTopMm = frontFrameBottomMm + FRONT_HEIGHT_MM;
  const frontFrameCenterYMm = (frontFrameBottomMm + frontFrameTopMm) / 2;
  // === 3) 인출 트레이 바닥판 (먼저 계산해서 전면프레임 Z 위치 결정에 사용) ===
  // 깊이 450, 백패널 앞면에서 39.5mm 앞쪽까지
  const trayBackZMm = backPanelFrontZMm + TRAY_BACK_OFFSET_MM;
  const trayFrontZMm = trayBackZMm + TRAY_DEPTH_MM;
  const trayCenterZMm = (trayBackZMm + trayFrontZMm) / 2;

  // 전면프레임 Z: 트레이 바닥판 앞면에 부착 (서랍 앞판처럼)
  // 트레이 앞면 + 두께/2 = 전면프레임 중심
  const frontFrameCenterZMm = trayFrontZMm + FRONT_THICKNESS_MM / 2;
  // 트레이 가로 = 날개프레임 안쪽 사이 - 좌우 갭
  const trayWidthMm = (wingsInnerRightMm - wingsInnerLeftMm) - TRAY_SIDE_GAP_MM * 2;
  // 트레이 Y: 윗면 = 날개프레임 윗면 - 22
  const trayTopMm = wingTopMm - TRAY_TOP_BELOW_WING_MM;
  const trayBottomMm = trayTopMm - TRAY_THICKNESS_MM;
  const trayCenterYMm = (trayBottomMm + trayTopMm) / 2;

  // mm → Three.js 단위 변환
  const toUnit = mmToThreeUnits;

  return (
    <group>
      {/* 좌 날개프레임 */}
      <BoxWithEdges
        args={[toUnit(WING_THICKNESS_MM), toUnit(WING_HEIGHT_MM), toUnit(wingDepthMm)]}
        position={[toUnit(leftWingXMm), toUnit(wingCenterYMm), toUnit(wingCenterZMm)]}
        material={material}
        panelName="전자렌지 좌날개"
      />
      {/* 우 날개프레임 */}
      <BoxWithEdges
        args={[toUnit(WING_THICKNESS_MM), toUnit(WING_HEIGHT_MM), toUnit(wingDepthMm)]}
        position={[toUnit(rightWingXMm), toUnit(wingCenterYMm), toUnit(wingCenterZMm)]}
        material={material}
        panelName="전자렌지 우날개"
      />
      {/* 전면프레임 */}
      <BoxWithEdges
        args={[toUnit(frontFrameWidthMm), toUnit(FRONT_HEIGHT_MM), toUnit(FRONT_THICKNESS_MM)]}
        position={[toUnit(frontFrameCenterXMm), toUnit(frontFrameCenterYMm), toUnit(frontFrameCenterZMm)]}
        material={material}
        panelName="전자렌지 전면프레임"
      />
      {/* 인출 트레이 바닥판 */}
      <BoxWithEdges
        args={[toUnit(trayWidthMm), toUnit(TRAY_THICKNESS_MM), toUnit(TRAY_DEPTH_MM)]}
        position={[0, toUnit(trayCenterYMm), toUnit(trayCenterZMm)]}
        material={material}
        panelName="전자렌지 인출 트레이 바닥판"
      />
    </group>
  );
};

export default MicrowavePullOut;
