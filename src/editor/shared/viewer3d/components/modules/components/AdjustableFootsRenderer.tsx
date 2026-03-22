import React, { useContext } from 'react';
import * as THREE from 'three';
import { AdjustableFoot } from './AdjustableFoot';
import { useUIStore } from '@/store/uiStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { Space3DViewContext } from '../../../context/Space3DViewContextTypes';

interface AdjustableFootsRendererProps {
  width: number; // 가구 폭 (Three.js units)
  depth: number; // 가구 깊이 (Three.js units)
  yOffset?: number; // Y축 오프셋 (가구 하단 위치)
  backZOffset?: number; // 뒤쪽 조절발 Z축 오프셋 (섹션 깊이 조정용)
  placedFurnitureId?: string; // 배치된 가구 ID (baseFrameOffset 조회용)
  material?: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isHighlighted?: boolean;
  isFloating?: boolean; // 띄움배치 여부
  baseHeight?: number; // 받침대 높이 (mm)
  baseDepth?: number; // 받침대 깊이 (mm, 0~300) - 폴백용, store 값 우선
  viewMode?: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
}

/**
 * 가구 네 모서리에 조절발통 렌더링
 * - 각 모서리(좌측앞, 좌측뒤, 우측앞, 우측뒤)에 1개씩
 * - 앞쪽: 앞면에서 27mm 안쪽
 * - 뒤쪽: 뒷면에서 20mm 안쪽
 */
export const AdjustableFootsRenderer: React.FC<AdjustableFootsRendererProps> = ({
  width,
  depth,
  yOffset = 0,
  backZOffset = 0,
  placedFurnitureId,
  renderMode = 'solid',
  isHighlighted = false,
  isFloating = false,
  viewMode = '3D',
  view2DDirection,
}) => {
  // 옵티마이저 뷰어에서는 조절발 숨김
  const space3DCtx = useContext(Space3DViewContext);

  const storeViewMode = useUIStore(state => state.viewMode);
  const storeView2DDirection = useUIStore(state => state.view2DDirection);
  // Store에서 직접 baseDepth 읽기 (실시간 반영 보장)
  const storeBaseDepth = useSpaceConfigStore(state => state.spaceInfo.baseConfig?.depth ?? 0);
  const storeBaseHeight = useSpaceConfigStore(state => state.spaceInfo.baseConfig?.height ?? 65);
  const storeFloorFinishHeight = useSpaceConfigStore(state =>
    state.spaceInfo.hasFloorFinish && state.spaceInfo.floorFinish ? state.spaceInfo.floorFinish.height : 0
  );
  const storeIsFloating = useSpaceConfigStore(state =>
    state.spaceInfo.baseConfig?.type === 'stand' &&
    state.spaceInfo.baseConfig?.placementType === 'float'
  );
  // placedFurnitureId로 baseFrameOffset, hasBase 조회 (primitive 반환으로 무한 렌더 방지)
  const baseFrameOffset = useFurnitureStore(state => {
    if (!placedFurnitureId) return 0;
    const mod = state.placedModules.find(m => m.id === placedFurnitureId);
    return mod?.baseFrameOffset ?? 0;
  });
  const hasBase = useFurnitureStore(state => {
    if (!placedFurnitureId) return true;
    const mod = state.placedModules.find(m => m.id === placedFurnitureId);
    return mod?.hasBase !== false;
  });

  // Store 값 우선, prop은 폴백
  const effectiveBaseDepth = storeBaseDepth;
  // 조절발 크기는 바닥마감재와 무관하게 받침대 높이 그대로 사용
  const effectiveBaseHeight = storeBaseHeight;
  const effectiveIsFloating = storeIsFloating || isFloating;

  const effectiveViewMode = viewMode ?? storeViewMode ?? '3D';
  const effectiveView2DDirection =
    view2DDirection ?? (effectiveViewMode === '2D' ? storeView2DDirection : undefined);

  // 옵티마이저 뷰어에서는 조절발 숨김
  if (space3DCtx?.hideAccessories) return null;

  // 띄움배치일 때는 발통 렌더링 안 함
  if (effectiveIsFloating) {
    return null;
  }

  // 하부프레임 토글 꺼짐 → 조절발도 함께 숨김
  if (!hasBase) {
    return null;
  }

  // 2D 탑뷰일 때만 발통 렌더링 안 함
  if (effectiveViewMode === '2D' && (effectiveView2DDirection === 'top' || effectiveView2DDirection === 'all')) {
    return null;
  }
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // width, depth는 이미 Three.js units
  const furnitureWidth = width;
  const furnitureDepth = depth;

  // 64×64mm 정사각형 플레이트의 바깥쪽 모서리가 가구 모서리에 맞도록
  const plateSize = mmToThreeUnits(64);
  const plateHalf = plateSize / 2; // 플레이트 크기의 절반 (32mm)

  // X축 위치 (플레이트 바깥쪽 모서리가 가구 모서리에 맞도록)
  const leftX = -furnitureWidth / 2 + plateHalf;
  const rightX = furnitureWidth / 2 - plateHalf;

  // Z축 위치
  // 앞쪽: 하부프레임 뒷면과 맞닿도록 20mm 뒤로 + 받침대 깊이만큼 뒤로 + 하부프레임 옵셋
  // 뒤쪽: 뒷부분 꼭지점과 맞닿도록 plateHalf만큼 안쪽 (받침대 깊이 영향 없음)
  const baseDepthOffset = mmToThreeUnits(effectiveBaseDepth);
  const baseFrameZOffset = mmToThreeUnits(baseFrameOffset);
  const frontZ = furnitureDepth / 2 - plateHalf - mmToThreeUnits(20) - baseDepthOffset + baseFrameZOffset;
  const backZ = -furnitureDepth / 2 + plateHalf;

  // 발통 위치 배열 (네 모서리, 회전 없음)
  const footPositions: Array<{pos: [number, number, number], rot: number}> = [
    { pos: [leftX, yOffset, frontZ], rot: 0 },   // 좌측 앞 (받침대 깊이 적용)
    { pos: [rightX, yOffset, frontZ], rot: 0 },  // 우측 앞 (받침대 깊이 적용)
    { pos: [leftX, yOffset, backZ + backZOffset], rot: 0 },    // 좌측 뒤 (받침대 깊이 미적용 + 섹션 깊이 오프셋)
    { pos: [rightX, yOffset, backZ + backZOffset], rot: 0 },   // 우측 뒤 (받침대 깊이 미적용 + 섹션 깊이 오프셋)
  ];
  
  return (
    <group>
      {footPositions.map((item, index) => (
        <AdjustableFoot
          key={`foot-${index}`}
          position={item.pos}
          rotation={item.rot}
          renderMode={renderMode}
          isHighlighted={isHighlighted}
          baseHeight={effectiveBaseHeight}
        />
      ))}
    </group>
  );
};

export default AdjustableFootsRenderer;
