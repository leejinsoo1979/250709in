import React from 'react';
import { Line } from '@react-three/drei';
import DimensionText from './DimensionText';

/**
 * 마이다(서랍 도어면) 하단 폭 치수 — 공통 컴포넌트
 *
 * 서랍장/인덕션장/터치장이 동일 형태로 사용.
 * - 3D 모드: 모듈 앞면 + 15mm 앞에 표시
 * - 2D 정면뷰: 마이다 앞면 + 10mm 앞에 표시
 *
 * 좌표계 기준
 * - 호출자는 "마이다 하단" Y 지점을 기준으로 이 컴포넌트를 배치해야 한다.
 *   (예: `<group position={[0, maidaBottomY, 0]}><MaidaWidthDimension ... /></group>`)
 *   내부에서는 -extensionLineStart / -extensionLineLength 를 더해 아래쪽으로 연장선과 치수선을 그림.
 * - Z는 내부에서 moduleDepthMm/maidaZ 로부터 계산하므로 호출자 group Z=0 이어야 한다.
 * - 서랍 인출 애니메이션과 독립적으로 고정되도록 `<animated.group>` 밖에서 렌더링할 것.
 */
interface MaidaWidthDimensionProps {
  /** 표시할 마이다 너비(mm). 보통 `moduleWidth - 3` */
  maidaWidthMm: number;
  /** 마이다 Three.js 폭 (mmToThreeUnits(maidaWidthMm) 미리 계산한 값) */
  maidaWidth: number;
  /** 모듈 깊이(mm) — 3D zPos 계산에 사용 */
  moduleDepthMm: number;
  /** 마이다 중심 Z (Three.js 단위) — 2D zPos 계산에 사용 */
  maidaZ: number;
  /** 뷰 모드 */
  viewMode: '3D' | '2D';
  /** 2D 보는 방향 */
  view2DDirection: 'front' | 'left' | 'right' | 'top' | 'back';
  /** 2D 색상 (is3D일 땐 무시되고 검정 사용) */
  dimensionColor: string;
  /** mm → Three.js 단위 변환 함수 */
  mmToThreeUnits: (mm: number) => number;
}

const MaidaWidthDimension: React.FC<MaidaWidthDimensionProps> = ({
  maidaWidthMm, maidaWidth, moduleDepthMm, maidaZ,
  viewMode, view2DDirection, dimensionColor, mmToThreeUnits,
}) => {
  // 3D 또는 2D 정면뷰에서만 표시
  if (!(viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'front'))) {
    return null;
  }

  const is3D = viewMode === '3D';
  const extensionLineStart = mmToThreeUnits(70);
  const extensionLineLength = mmToThreeUnits(110);
  const tickSize = 0.008;
  const zPos = is3D ? mmToThreeUnits(moduleDepthMm / 2 + 14 + 1) : maidaZ + mmToThreeUnits(10);
  const dimColor = is3D ? '#000000' : dimensionColor;
  const halfW = maidaWidth / 2;

  const dimLineY = -extensionLineLength - extensionLineStart;
  const extStartY = -extensionLineStart;

  return (
    <>
      <Line name="maida-dimension" points={[[-halfW, extStartY, zPos], [-halfW, dimLineY, zPos]]} color={dimColor} lineWidth={1} />
      <Line name="maida-dimension" points={[[halfW, extStartY, zPos], [halfW, dimLineY, zPos]]} color={dimColor} lineWidth={1} />
      <Line name="maida-dimension" points={[[-halfW, dimLineY, zPos], [halfW, dimLineY, zPos]]} color={dimColor} lineWidth={1} />
      <Line name="maida-dimension" points={[[-halfW - tickSize, dimLineY, zPos], [-halfW + tickSize, dimLineY, zPos]]} color={dimColor} lineWidth={1} />
      <Line name="maida-dimension" points={[[halfW - tickSize, dimLineY, zPos], [halfW + tickSize, dimLineY, zPos]]} color={dimColor} lineWidth={1} />
      <DimensionText
        name="maida-dimension-text"
        value={maidaWidthMm}
        position={[0, dimLineY + mmToThreeUnits(15), zPos]}
        color={dimColor}
        anchorX="center"
        anchorY="bottom"
        forceShow={true}
      />
    </>
  );
};

export default MaidaWidthDimension;
