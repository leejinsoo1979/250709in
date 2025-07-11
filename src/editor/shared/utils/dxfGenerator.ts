import { DxfWriter, point3d } from '@tarikjabiri/dxf';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../viewer3d/utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';

interface DXFModuleData {
  name: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
}

interface DXFPlacedModule {
  id: string;
  moduleId: string; // 실제 모듈 ID 추가
  position: {
    x: number;
    y: number;
    z: number;
  };
  moduleData: DXFModuleData;
  rotation?: number;
  slotIndex?: number; // 슬롯 인덱스 정보 추가
  isDualSlot?: boolean; // 듀얼 슬롯 여부 추가
}

interface DXFExportData {
  spaceInfo: SpaceInfo;
  placedModules: DXFPlacedModule[];
  drawingType?: string;
}

/**
 * DXF 도면을 생성하는 메인 함수
 * @param data 공간 정보와 배치된 가구 모듈 데이터
 * @returns DXF 파일 내용 (문자열)
 */
export const generateDXF = (data: DXFExportData): string => {
  const { spaceInfo, placedModules, drawingType = 'front' } = data;
  
  // derivedSpaceStore에서 계산된 데이터 가져오기
  const derivedSpaceState = useDerivedSpaceStore.getState();
  
  // 스토어가 현재 spaceInfo로 계산되었는지 확인
  if (!derivedSpaceState.isCalculated || 
      !derivedSpaceState.lastCalculatedSpaceInfo ||
      JSON.stringify(derivedSpaceState.lastCalculatedSpaceInfo) !== JSON.stringify(spaceInfo)) {
    // 계산되지 않았거나 다른 spaceInfo로 계산된 경우 재계산
    derivedSpaceState.recalculateFromSpaceInfo(spaceInfo);
  }
  
  // DXF Writer 초기화
  const dxf = new DxfWriter();
  
  // 도면 타입별로 다른 그리기 함수 호출
  switch (drawingType) {
    case 'front':
      // 정면도: 기존 로직 사용
      drawFrontElevation(dxf, spaceInfo, placedModules);
      break;
    case 'plan':
      // 평면도: 새로운 로직
      drawPlanView(dxf, spaceInfo, placedModules);
      break;
    case 'side':
      // 측면도: 향후 구현 예정
      drawSideSection(dxf, spaceInfo, placedModules);
      break;
    default:
      // 기본값: 정면도
      drawFrontElevation(dxf, spaceInfo, placedModules);
      break;
  }
  
  // 제목과 정보 추가
  drawTitleAndInfo(dxf, spaceInfo, drawingType);
  
  return dxf.stringify();
};

/**
 * 정면도 전체 그리기
 */
const drawFrontElevation = (dxf: DxfWriter, spaceInfo: SpaceInfo, placedModules: DXFPlacedModule[]): void => {
  // 공간 외곽선 그리기
  drawFrontSpaceBoundary(dxf, spaceInfo);
  
  // 가구 모듈들 그리기
  drawFrontFurnitureModules(dxf, placedModules, spaceInfo);
};

/**
 * 평면도 전체 그리기
 */
const drawPlanView = (dxf: DxfWriter, spaceInfo: SpaceInfo, placedModules: DXFPlacedModule[]): void => {
  // 공간 외곽선 그리기 (평면도: width x depth)
  drawPlanSpaceBoundary(dxf, spaceInfo);
  
  // 가구 모듈들 그리기 (평면도: 위에서 본 모습)
  drawPlanFurnitureModules(dxf, placedModules, spaceInfo);
};

/**
 * 측면도 전체 그리기
 */
const drawSideSection = (dxf: DxfWriter, spaceInfo: SpaceInfo, placedModules: DXFPlacedModule[]): void => {
  // 공간 외곽선 그리기 (측면도: depth x height)
  drawSideSpaceBoundary(dxf, spaceInfo);
  
  // 가구 모듈들 그리기 (측면도: 옆에서 본 모습)
  drawSideFurnitureModules(dxf, placedModules, spaceInfo);
};

/**
 * 공간 외곽선을 그리기 (정면도 기준: width x height)
 */
const drawFrontSpaceBoundary = (dxf: DxfWriter, spaceInfo: SpaceInfo): void => {
  // 공간 외곽 사각형 (정면도 기준: width x height)
  // 하단 가로선 (바닥)
  dxf.addLine(point3d(0, 0), point3d(spaceInfo.width, 0));
  // 우측 세로선 (우측 벽)
  dxf.addLine(point3d(spaceInfo.width, 0), point3d(spaceInfo.width, spaceInfo.height));
  // 상단 가로선 (천장)
  dxf.addLine(point3d(spaceInfo.width, spaceInfo.height), point3d(0, spaceInfo.height));
  // 좌측 세로선 (좌측 벽)
  dxf.addLine(point3d(0, spaceInfo.height), point3d(0, 0));
  
  // 공간 라벨
  dxf.addText(
    point3d(spaceInfo.width / 2, spaceInfo.height + 200),
    100, // 텍스트 높이
    `정면도: ${spaceInfo.width}mm(폭) × ${spaceInfo.height}mm(높이)`
  );
  
  // 깊이 정보 추가 표기
  dxf.addText(
    point3d(spaceInfo.width / 2, spaceInfo.height + 300),
    60, // 텍스트 높이
    `공간 깊이: ${spaceInfo.depth}mm`
  );
};

/**
 * 공간 외곽선을 그리기 (평면도 기준: width x depth)
 */
const drawPlanSpaceBoundary = (dxf: DxfWriter, spaceInfo: SpaceInfo): void => {
  // 공간 외곽 사각형 (평면도 기준: width x depth)
  // 하단 가로선 (앞쪽 벽)
  dxf.addLine(point3d(0, 0), point3d(spaceInfo.width, 0));
  // 우측 세로선 (우측 벽)
  dxf.addLine(point3d(spaceInfo.width, 0), point3d(spaceInfo.width, spaceInfo.depth));
  // 상단 가로선 (뒤쪽 벽)
  dxf.addLine(point3d(spaceInfo.width, spaceInfo.depth), point3d(0, spaceInfo.depth));
  // 좌측 세로선 (좌측 벽)
  dxf.addLine(point3d(0, spaceInfo.depth), point3d(0, 0));
  
  // 공간 라벨
  dxf.addText(
    point3d(spaceInfo.width / 2, spaceInfo.depth + 200),
    100, // 텍스트 높이
    `평면도: ${spaceInfo.width}mm(폭) × ${spaceInfo.depth}mm(깊이)`
  );
  
  // 높이 정보 추가 표기
  dxf.addText(
    point3d(spaceInfo.width / 2, spaceInfo.depth + 300),
    60, // 텍스트 높이
    `공간 높이: ${spaceInfo.height}mm`
  );
};

/**
 * 공간 외곽선을 그리기 (측면도 기준: depth x height)
 */
const drawSideSpaceBoundary = (dxf: DxfWriter, spaceInfo: SpaceInfo): void => {
  // 공간 외곽 사각형 (측면도 기준: depth x height)
  // 하단 가로선 (바닥)
  dxf.addLine(point3d(0, 0), point3d(spaceInfo.depth, 0));
  // 우측 세로선 (뒤쪽 벽)
  dxf.addLine(point3d(spaceInfo.depth, 0), point3d(spaceInfo.depth, spaceInfo.height));
  // 상단 가로선 (천장)
  dxf.addLine(point3d(spaceInfo.depth, spaceInfo.height), point3d(0, spaceInfo.height));
  // 좌측 세로선 (앞쪽 벽)
  dxf.addLine(point3d(0, spaceInfo.height), point3d(0, 0));
  
  // 공간 라벨
  dxf.addText(
    point3d(spaceInfo.depth / 2, spaceInfo.height + 200),
    100, // 텍스트 높이
    `측면도: ${spaceInfo.depth}mm(깊이) × ${spaceInfo.height}mm(높이)`
  );
  
  // 폭 정보 추가 표기
  dxf.addText(
    point3d(spaceInfo.depth / 2, spaceInfo.height + 300),
    60, // 텍스트 높이
    `공간 폭: ${spaceInfo.width}mm`
  );
};

/**
 * 가구 모듈들을 슬롯 위치 기반으로 그리기 (정면도 기준)
 */
const drawFrontFurnitureModules = (dxf: DxfWriter, placedModules: DXFPlacedModule[], spaceInfo: SpaceInfo): void => {
  // derivedSpaceStore에서 계산된 데이터 사용 (독립적인 계산 제거)
  const derivedSpaceState = useDerivedSpaceStore.getState();
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // derivedSpaceStore의 데이터를 indexing 형태로 재구성
  const indexing = {
    columnCount: derivedSpaceState.columnCount,
    columnWidth: derivedSpaceState.columnWidth,
    columnPositions: derivedSpaceState.columnPositions,
    threeUnitPositions: derivedSpaceState.threeUnitPositions,
    dualColumnPositions: derivedSpaceState.dualColumnPositions,
    internalStartX: (spaceInfo.width - derivedSpaceState.internalWidth) / 2,
    internalWidth: derivedSpaceState.internalWidth,
    threeUnitDualPositions: derivedSpaceState.dualColumnPositions.map((pos: number) => pos / 10) // mm to Three.js units
  };
  
  console.log('🔍 DXF 생성 - 슬롯 인덱싱 정보:', {
    columnCount: indexing.columnCount,
    columnPositions: indexing.columnPositions,
    threeUnitPositions: indexing.threeUnitPositions,
    dualPositions: indexing.dualColumnPositions,
    threeUnitDualPositions: indexing.threeUnitDualPositions,
    internalStartX: indexing.internalStartX,
    internalWidth: indexing.internalWidth
  });
  
  placedModules.forEach((module, index) => {
    const { position, moduleData, moduleId } = module;
    
    // 실제 모듈 데이터 가져오기 (정확한 치수 정보를 위해)
    const actualModuleData = getModuleById(moduleId, internalSpace, spaceInfo);
    // customDepth가 이미 반영된 moduleData.dimensions를 우선 사용
    const dimensions = moduleData.dimensions;
    
    // 가구가 듀얼 슬롯인지 확인
    const isDualFurniture = Math.abs(dimensions.width - (indexing.columnWidth * 2)) < 50;
    
    // 슬롯 인덱스 찾기 (기존 position.x 기준)
    let slotIndex = -1;
    let slotPositionMm = 0; // mm 단위 슬롯 위치
    
    if (isDualFurniture && indexing.threeUnitDualPositions) {
      // 듀얼 가구: threeUnitDualPositions에서 가장 가까운 위치 찾기
      slotIndex = indexing.threeUnitDualPositions.findIndex(pos => 
        Math.abs(pos - position.x) < 0.1
      );
      if (slotIndex >= 0) {
        // 듀얼 슬롯의 실제 mm 위치 사용
        slotPositionMm = indexing.dualColumnPositions[slotIndex];
      }
    } else {
      // 싱글 가구: threeUnitPositions에서 가장 가까운 위치 찾기
      slotIndex = indexing.threeUnitPositions.findIndex(pos => 
        Math.abs(pos - position.x) < 0.1
      );
      if (slotIndex >= 0) {
        // 싱글 슬롯의 실제 mm 위치 사용
        slotPositionMm = indexing.columnPositions[slotIndex];
      }
    }
    
    // 슬롯을 찾지 못한 경우 기존 방식으로 폴백
    if (slotIndex < 0) {
      console.warn(`⚠️ 가구 ${index + 1}의 슬롯을 찾을 수 없음. 기존 방식 사용.`);
      slotPositionMm = position.x * 10; // 기존 변환 방식
    }
    
    // DXF 좌표계로 변환: Three.js 중앙 기준 → DXF 왼쪽 하단 기준
    // Three.js에서 slotPositionMm은 중앙(0)을 기준으로 한 위치
    // DXF에서는 왼쪽 하단(0,0)을 기준으로 해야 함
    const dxfXPosition = (spaceInfo.width / 2) + slotPositionMm; // 공간 중앙에서 슬롯 위치만큼 이동
    
    console.log(`🔍 가구 ${index + 1} (${moduleData.name}) 좌표 변환:`, {
      originalThreeJsX: position.x,
      slotIndex,
      isDualFurniture,
      slotPositionMm, // Three.js 기준 mm 위치 (중앙 기준)
      dxfXPosition,   // DXF 기준 위치 (왼쪽 하단 기준)
      spaceWidth: spaceInfo.width,
      dimensions
    });
    
    // 가구 사각형 (정면도 기준: dxfXPosition 사용)
    const x1 = dxfXPosition - (dimensions.width / 2); // 중심점에서 좌측 끝
    const y1 = position.y * 10; // Y 좌표 (바닥에서의 높이, Three.js -> mm 변환)
    const x2 = x1 + dimensions.width; // 우측 끝
    const y2 = y1 + dimensions.height; // 상단
    
    console.log(`📐 DXF 좌표 최종 계산:`, {
      slotIndex,
      slotPositionMm,
      dxfXPosition,
      x1, y1, x2, y2,
      width: dimensions.width,
      height: dimensions.height
    });
    
    // 가구 외곽선 그리기 (정면도 - 완전한 2D 단면)
    dxf.addLine(point3d(x1, y1), point3d(x2, y1)); // 하단
    dxf.addLine(point3d(x2, y1), point3d(x2, y2)); // 우측
    dxf.addLine(point3d(x2, y2), point3d(x1, y2)); // 상단
    dxf.addLine(point3d(x1, y2), point3d(x1, y1)); // 좌측
    
    // 가구 종류별 내부 구조 표현 (실제 모듈 데이터 기반)
    const furnitureHeight = dimensions.height;
    const furnitureWidth = dimensions.width;
    const modelConfig = actualModuleData?.modelConfig;
    const shelfCount = modelConfig?.shelfCount || 0;
    
    console.log(`🏗️ 가구 ${index + 1} 내부 구조:`, {
      moduleId,
      shelfCount,
      modelConfig,
      furnitureWidth,
      furnitureHeight
    });
    
    // 가구가 충분히 클 때만 내부 구조 표시
    if (furnitureHeight > 200 && furnitureWidth > 200) {
      if (shelfCount > 0) {
        // 선반이 있는 가구: 실제 선반 개수에 따라 구조 그리기
        if (isDualFurniture) {
          // 듀얼 가구: 중앙 칸막이 + 양쪽 선반
          const centerX = x1 + (furnitureWidth / 2);
          
          // 중앙 세로 칸막이
          dxf.addLine(point3d(centerX, y1), point3d(centerX, y2));
          
          // 양쪽 칸에 선반 그리기
          const shelvesPerSide = Math.floor(shelfCount / 2); // 듀얼이므로 절반씩
          
          if (shelvesPerSide > 0) {
            // 왼쪽 칸 선반
            for (let i = 1; i <= shelvesPerSide; i++) {
              const shelfY = y1 + (furnitureHeight / (shelvesPerSide + 1)) * i;
              dxf.addLine(point3d(x1, shelfY), point3d(centerX, shelfY));
            }
            
            // 오른쪽 칸 선반
            for (let i = 1; i <= shelvesPerSide; i++) {
              const shelfY = y1 + (furnitureHeight / (shelvesPerSide + 1)) * i;
              dxf.addLine(point3d(centerX, shelfY), point3d(x2, shelfY));
            }
          }
        } else {
          // 싱글 가구: 선반 개수만큼 수평선 그리기
          for (let i = 1; i <= shelfCount; i++) {
            const shelfY = y1 + (furnitureHeight / (shelfCount + 1)) * i;
            dxf.addLine(point3d(x1, shelfY), point3d(x2, shelfY));
          }
        }
      } else {
        // 오픈 박스: 내부 구조 없음 (외곽선만)
        console.log(`📦 오픈 박스 가구 - 내부 구조 없음`);
      }
    }
    
    // 가구 이름 텍스트 (중앙에 배치)
    const centerX = x1 + dimensions.width / 2;
    const centerY = y1 + dimensions.height / 2;
    
    dxf.addText(
      point3d(centerX, centerY),
      Math.min(dimensions.height / 4, 50), // 높이에 비례한 텍스트 크기
      moduleData.name || `가구${index + 1}`
    );
    
    // 가구 타입 정보 표시 (디버깅용)
    const furnitureType = shelfCount === 0 ? '오픈박스' : 
                         shelfCount === 1 ? '2단' :
                         shelfCount === 6 ? '7단' :
                         shelfCount === 2 ? '듀얼2단' :
                         shelfCount === 12 ? '듀얼7단' : `${shelfCount}선반`;
    
    dxf.addText(
      point3d(centerX, y1 - 120),
      20,
      `슬롯${slotIndex + 1} | ${furnitureType}`
    );
    
    // 좌표 정보 표시 (디버깅용)
    dxf.addText(
      point3d(centerX, y1 - 160),
      15,
      `DXF-X: ${Math.round(dxfXPosition)}mm`
    );
    
    // 가구 치수 디버깅 로그
    console.log(`🔍 정면도 가구 ${index + 1} (${moduleData.name}) 치수:`, {
      moduleId,
      moduleDataDepth: moduleData.dimensions.depth,
      actualModuleDataDepth: actualModuleData?.dimensions.depth,
      finalDepth: dimensions.depth,
      width: dimensions.width,
      height: dimensions.height
    });
    
    // 가구 치수 표기 (하단에 표시)
    dxf.addText(
      point3d(centerX, y1 - 80),
      25, // 텍스트 높이
      `${dimensions.width}W×${dimensions.height}H×${dimensions.depth}D`
    );
    
    // 높이 치수선 (우측에 표시)
    if (dimensions.height > 100) {
      const dimensionX = x2 + 50; // 가구 우측 끝에서 50mm 떨어진 위치
      
      // 치수선
      dxf.addLine(point3d(dimensionX, y1), point3d(dimensionX, y2));
      
      // 치수 화살표 (간단한 선으로 표현)
      dxf.addLine(point3d(dimensionX - 20, y1), point3d(dimensionX + 20, y1));
      dxf.addLine(point3d(dimensionX - 20, y2), point3d(dimensionX + 20, y2));
      
      // 높이 치수 텍스트
      dxf.addText(
        point3d(dimensionX + 30, centerY),
        20,
        `${dimensions.height}mm`
      );
    }
  });
};

/**
 * 가구 모듈들을 슬롯 위치 기반으로 그리기 (평면도 기준)
 */
const drawPlanFurnitureModules = (dxf: DxfWriter, placedModules: DXFPlacedModule[], spaceInfo: SpaceInfo): void => {
  // derivedSpaceStore에서 계산된 데이터 사용 (독립적인 계산 제거)
  const derivedSpaceState = useDerivedSpaceStore.getState();
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // derivedSpaceStore의 데이터를 indexing 형태로 재구성
  const indexing = {
    columnCount: derivedSpaceState.columnCount,
    columnWidth: derivedSpaceState.columnWidth,
    columnPositions: derivedSpaceState.columnPositions,
    threeUnitPositions: derivedSpaceState.threeUnitPositions,
    dualColumnPositions: derivedSpaceState.dualColumnPositions,
    internalStartX: (spaceInfo.width - derivedSpaceState.internalWidth) / 2,
    internalWidth: derivedSpaceState.internalWidth,
    threeUnitDualPositions: derivedSpaceState.dualColumnPositions.map((pos: number) => pos / 10) // mm to Three.js units
  };
  
  console.log('🔍 DXF 평면도 생성 - 슬롯 인덱싱 정보:', {
    columnCount: indexing.columnCount,
    columnPositions: indexing.columnPositions,
    threeUnitPositions: indexing.threeUnitPositions,
    dualPositions: indexing.dualColumnPositions,
    threeUnitDualPositions: indexing.threeUnitDualPositions,
    internalStartX: indexing.internalStartX,
    internalWidth: indexing.internalWidth
  });
  
  placedModules.forEach((module, index) => {
    const { position, moduleData, moduleId } = module;
    
    // 실제 모듈 데이터 가져오기 (정확한 치수 정보를 위해)
    const actualModuleData = getModuleById(moduleId, internalSpace, spaceInfo);
    // customDepth가 이미 반영된 moduleData.dimensions를 우선 사용
    const dimensions = moduleData.dimensions;
    
    // 가구가 듀얼 슬롯인지 확인
    const isDualFurniture = Math.abs(dimensions.width - (indexing.columnWidth * 2)) < 50;
    
    // 슬롯 인덱스 찾기 (기존 position.x 기준)
    let slotIndex = -1;
    let slotPositionMm = 0; // mm 단위 슬롯 위치
    
    if (isDualFurniture && indexing.threeUnitDualPositions) {
      // 듀얼 가구: threeUnitDualPositions에서 가장 가까운 위치 찾기
      slotIndex = indexing.threeUnitDualPositions.findIndex(pos => 
        Math.abs(pos - position.x) < 0.1
      );
      if (slotIndex >= 0) {
        // 듀얼 슬롯의 실제 mm 위치 사용
        slotPositionMm = indexing.dualColumnPositions[slotIndex];
      }
    } else {
      // 싱글 가구: threeUnitPositions에서 가장 가까운 위치 찾기
      slotIndex = indexing.threeUnitPositions.findIndex(pos => 
        Math.abs(pos - position.x) < 0.1
      );
      if (slotIndex >= 0) {
        // 싱글 슬롯의 실제 mm 위치 사용
        slotPositionMm = indexing.columnPositions[slotIndex];
      }
    }
    
    // 슬롯을 찾지 못한 경우 기존 방식으로 폴백
    if (slotIndex < 0) {
      console.warn(`⚠️ 가구 ${index + 1}의 슬롯을 찾을 수 없음. 기존 방식 사용.`);
      slotPositionMm = position.x * 10; // 기존 변환 방식
    }
    
    // DXF 좌표계로 변환: Three.js 중앙 기준 → DXF 왼쪽 하단 기준
    // 평면도에서는 X축은 그대로, Y축은 가구 앞면 기준으로 배치
    const dxfXPosition = (spaceInfo.width / 2) + slotPositionMm; // 공간 중앙에서 슬롯 위치만큼 이동
    
    // 가구 앞면 위치: 공간 앞면에서 20mm 뒤 (측면도와 동일한 로직)
    const frontPositionMm = 20;
    const dxfYPosition = frontPositionMm; // 가구 앞면을 공간 앞면에서 20mm 뒤에 배치
    
    console.log(`🔍 평면도 가구 ${index + 1} (${moduleData.name}) 좌표 변환:`, {
      originalThreeJsX: position.x,
      originalThreeJsZ: position.z,
      slotIndex,
      isDualFurniture,
      slotPositionMm, // Three.js 기준 mm 위치 (중앙 기준)
      dxfXPosition,   // DXF 기준 X 위치 (왼쪽 하단 기준)
      frontPositionMm, // 가구 앞면 위치 (공간 앞면에서 20mm 뒤)
      dxfYPosition,   // DXF 기준 Y 위치 (가구 앞면 기준)
      spaceWidth: spaceInfo.width,
      spaceDepth: spaceInfo.depth,
      dimensions
    });
    
    // 가구 사각형 (평면도 기준: width x depth)
    const x1 = dxfXPosition - (dimensions.width / 2); // 중심점에서 좌측 끝
    const y1 = dxfYPosition; // 가구 앞면 (공간 앞면에서 20mm 뒤)
    const x2 = x1 + dimensions.width; // 우측 끝
    const y2 = y1 + dimensions.depth; // 가구 뒤면 (앞면에서 깊이만큼 뒤)
    
    console.log(`📐 평면도 DXF 좌표 최종 계산:`, {
      slotIndex,
      slotPositionMm,
      dxfXPosition,
      dxfYPosition,
      x1, y1, x2, y2,
      width: dimensions.width,
      depth: dimensions.depth
    });
    
    // 가구 외곽선 그리기 (평면도 - 위에서 본 모습)
    dxf.addLine(point3d(x1, y1), point3d(x2, y1)); // 앞쪽
    dxf.addLine(point3d(x2, y1), point3d(x2, y2)); // 우측
    dxf.addLine(point3d(x2, y2), point3d(x1, y2)); // 뒤쪽
    dxf.addLine(point3d(x1, y2), point3d(x1, y1)); // 좌측
    
    // 가구 종류별 내부 구조 표현 (평면도용 - 간소화)
    const furnitureWidth = dimensions.width;
    const furnitureDepth = dimensions.depth;
    const modelConfig = actualModuleData?.modelConfig;
    const shelfCount = modelConfig?.shelfCount || 0;
    
    console.log(`🏗️ 평면도 가구 ${index + 1} 내부 구조:`, {
      moduleId,
      shelfCount,
      modelConfig,
      furnitureWidth,
      furnitureDepth
    });
    
    // 가구가 충분히 클 때만 내부 구조 표시 (평면도에서는 간단하게)
    if (furnitureWidth > 200 && furnitureDepth > 200) {
      if (isDualFurniture) {
        // 듀얼 가구: 중앙 세로 칸막이만 표시
        const centerX = x1 + (furnitureWidth / 2);
        dxf.addLine(point3d(centerX, y1), point3d(centerX, y2));
      }
      // 싱글 가구는 외곽선만 표시 (평면도에서는 선반이 보이지 않음)
    }
    
    // 가구 이름 텍스트 (중앙에 배치)
    const centerX = x1 + dimensions.width / 2;
    const centerY = y1 + dimensions.depth / 2;
    
    dxf.addText(
      point3d(centerX, centerY),
      Math.min(dimensions.width / 4, dimensions.depth / 4, 50), // 크기에 비례한 텍스트 크기
      moduleData.name || `가구${index + 1}`
    );
    
    // 가구 타입 정보 표시 (디버깅용)
    const furnitureType = shelfCount === 0 ? '오픈박스' : 
                         shelfCount === 1 ? '2단' :
                         shelfCount === 6 ? '7단' :
                         shelfCount === 2 ? '듀얼2단' :
                         shelfCount === 12 ? '듀얼7단' : `${shelfCount}선반`;
    
    dxf.addText(
      point3d(centerX, y1 - 80),
      15,
      `슬롯${slotIndex + 1} | ${furnitureType}`
    );
    
    // 가구 치수 디버깅 로그
    console.log(`🔍 평면도 가구 ${index + 1} (${moduleData.name}) 치수:`, {
      moduleId,
      moduleDataDepth: moduleData.dimensions.depth,
      actualModuleDataDepth: actualModuleData?.dimensions.depth,
      finalDepth: dimensions.depth,
      width: dimensions.width,
      height: dimensions.height
    });
    
    // 가구 치수 표기 (하단에 표시)
    dxf.addText(
      point3d(centerX, y1 - 50),
      20, // 텍스트 높이
      `${dimensions.width}W×${dimensions.depth}D×${dimensions.height}H`
    );
  });
};

/**
 * 가구 모듈들을 그리기 (측면도 기준)
 */
const drawSideFurnitureModules = (dxf: DxfWriter, placedModules: DXFPlacedModule[], spaceInfo: SpaceInfo): void => {
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  console.log('🔍 DXF 측면도 생성 - 가구 배치 정보:', {
    totalModules: placedModules.length,
    spaceDepth: spaceInfo.depth,
    spaceHeight: spaceInfo.height
  });
  
  placedModules.forEach((module, index) => {
    const { moduleData, moduleId } = module;
    
    // 실제 모듈 데이터 가져오기
    const actualModuleData = getModuleById(moduleId, internalSpace, spaceInfo);
    // customDepth가 이미 반영된 moduleData.dimensions를 우선 사용
    const dimensions = moduleData.dimensions;
    
    // 가구 깊이 계산 (이미 customDepth가 반영된 상태)
    const actualDepthMm = dimensions.depth;
    
    console.log(`🔍 측면도 가구 ${index + 1} (${moduleData.name}) 치수:`, {
      moduleId,
      moduleDataDepth: moduleData.dimensions.depth,
      actualModuleDataDepth: actualModuleData?.dimensions.depth,
      finalDepth: actualDepthMm,
      height: dimensions.height
    });
    
    // 측면도 좌표 계산
    // X축: 깊이 방향 (0 = 공간 앞면, depth = 공간 뒤면)
    // Y축: 높이 방향 (0 = 바닥, height = 천장)
    
    // 가구 앞면 위치: 공간 앞면에서 20mm 뒤 (모든 가구 동일)
    const frontPositionMm = 20;
    
    // 가구 뒤면 위치: 앞면 + 가구 깊이
    const backPositionMm = frontPositionMm + actualDepthMm;
    
    // 가구 중심 위치 (측면도 X축)
    const furnitureCenterX = frontPositionMm + (actualDepthMm / 2);
    
    // 가구 높이 위치 계산 (기존 정면도와 동일한 로직)
    // Y 좌표는 바닥에서의 높이이므로 position.y * 10 사용
    const furnitureBottomY = 0; // 바닥부터 시작
    const furnitureTopY = dimensions.height; // 가구 높이만큼
    const furnitureCenterY = furnitureTopY / 2;
    
    console.log(`📐 측면도 DXF 좌표 계산:`, {
      frontPositionMm,
      backPositionMm,
      furnitureCenterX,
      furnitureBottomY,
      furnitureTopY,
      furnitureCenterY,
      actualDepthMm,
      height: dimensions.height
    });
    
    // 가구 사각형 그리기 (측면도: depth x height)
    const x1 = frontPositionMm; // 앞면
    const y1 = furnitureBottomY; // 바닥
    const x2 = backPositionMm; // 뒤면
    const y2 = furnitureTopY; // 상단
    
    // 가구 외곽선 그리기 (측면도 - 옆에서 본 모습)
    dxf.addLine(point3d(x1, y1), point3d(x2, y1)); // 하단
    dxf.addLine(point3d(x2, y1), point3d(x2, y2)); // 뒤쪽
    dxf.addLine(point3d(x2, y2), point3d(x1, y2)); // 상단
    dxf.addLine(point3d(x1, y2), point3d(x1, y1)); // 앞쪽
    
    // 가구 종류별 내부 구조 표현 (측면도용)
    const modelConfig = actualModuleData?.modelConfig;
    const shelfCount = modelConfig?.shelfCount || 0;
    
    console.log(`🏗️ 측면도 가구 ${index + 1} 내부 구조:`, {
      moduleId,
      shelfCount,
      modelConfig,
      actualDepthMm,
      height: dimensions.height
    });
    
    // 가구가 충분히 클 때만 내부 구조 표시
    if (dimensions.height > 200 && actualDepthMm > 200) {
      if (shelfCount > 0) {
        // 선반이 있는 가구: 측면에서 보이는 선반들 표시
        for (let i = 1; i <= shelfCount; i++) {
          const shelfY = y1 + (dimensions.height / (shelfCount + 1)) * i;
          // 선반을 측면에서 본 모습 (앞에서 뒤까지 수평선)
          dxf.addLine(point3d(x1, shelfY), point3d(x2, shelfY));
        }
      }
      // 오픈 박스는 외곽선만 표시
    }
    
    // 가구 이름 텍스트 (중앙에 배치)
    const centerX = furnitureCenterX;
    const centerY = furnitureCenterY;
    
    dxf.addText(
      point3d(centerX, centerY),
      Math.min(actualDepthMm / 4, dimensions.height / 4, 50), // 크기에 비례한 텍스트 크기
      moduleData.name || `가구${index + 1}`
    );
    
    // 가구 타입 정보 표시 (디버깅용)
    const furnitureType = shelfCount === 0 ? '오픈박스' : 
                         shelfCount === 1 ? '2단' :
                         shelfCount === 6 ? '7단' :
                         shelfCount === 2 ? '듀얼2단' :
                         shelfCount === 12 ? '듀얼7단' : `${shelfCount}선반`;
    
    dxf.addText(
      point3d(centerX, y1 - 80),
      15,
      `${furnitureType} | ${index + 1}번째`
    );
    
    // 가구 치수 표기 (하단에 표시)
    dxf.addText(
      point3d(centerX, y1 - 50),
      20, // 텍스트 높이
      `${dimensions.width}W×${actualDepthMm}D×${dimensions.height}H`
    );
    
    // 깊이 치수선 (하단에 표시)
    if (actualDepthMm > 100) {
      const dimensionY = y1 - 120; // 가구 하단에서 120mm 아래
      
      // 치수선
      dxf.addLine(point3d(x1, dimensionY), point3d(x2, dimensionY));
      
      // 치수 화살표 (간단한 선으로 표현)
      dxf.addLine(point3d(x1, dimensionY - 10), point3d(x1, dimensionY + 10));
      dxf.addLine(point3d(x2, dimensionY - 10), point3d(x2, dimensionY + 10));
      
      // 깊이 치수 텍스트
      dxf.addText(
        point3d(centerX, dimensionY - 30),
        15,
        `${actualDepthMm}mm`
      );
    }
  });
};

/**
 * 제목과 정보 그리기
 */
const drawTitleAndInfo = (dxf: DxfWriter, spaceInfo: SpaceInfo, drawingType: string = 'front'): void => {
  // 도면 타입별로 제목 위치 조정
  const titleX = spaceInfo.width + 500;
  const titleY = drawingType === 'plan' ? spaceInfo.depth : spaceInfo.height;
  
  // 도면 타입별 제목 설정
  const drawingTypeNames = {
    front: { ko: '정면도', en: 'Front Elevation' },
    plan: { ko: '평면도', en: 'Plan View' },
    side: { ko: '측면도', en: 'Side Section' }
  };
  
  const currentDrawingType = drawingTypeNames[drawingType as keyof typeof drawingTypeNames] || drawingTypeNames.front;
  
  // 제목
  dxf.addText(
    point3d(titleX, titleY - 100),
    80, // 텍스트 높이
    `가구 배치 ${currentDrawingType.ko}`
  );
  
  // 날짜
  const currentDate = new Date().toLocaleDateString('ko-KR');
  dxf.addText(
    point3d(titleX, titleY - 200),
    40, // 텍스트 높이
    `작성일: ${currentDate}`
  );
  
  // 도면 종류
  dxf.addText(
    point3d(titleX, titleY - 280),
    40, // 텍스트 높이
    `도면: ${currentDrawingType.ko} (${currentDrawingType.en})`
  );
  
  // 축척
  dxf.addText(
    point3d(titleX, titleY - 360),
    40, // 텍스트 높이
    '축척: 1:100'
  );
  
  // 단위
  dxf.addText(
    point3d(titleX, titleY - 440),
    40, // 텍스트 높이
    '단위: mm'
  );
  
  // 도면 타입별 치수 표기
  if (drawingType === 'plan') {
    // 평면도용 치수 표기
    dxf.addText(
      point3d(spaceInfo.width / 2, -200),
      60, // 텍스트 높이
      `폭: ${spaceInfo.width}mm × 깊이: ${spaceInfo.depth}mm`
    );
    
    // 공간 높이 정보
    dxf.addText(
      point3d(spaceInfo.width / 2, -280),
      50, // 텍스트 높이
      `공간 높이: ${spaceInfo.height}mm`
    );
  } else {
    // 정면도용 치수 표기 (기본)
    dxf.addText(
      point3d(spaceInfo.width / 2, -200),
      60, // 텍스트 높이
      `폭: ${spaceInfo.width}mm × 높이: ${spaceInfo.height}mm`
    );
    
    // 공간 깊이 정보
    dxf.addText(
      point3d(spaceInfo.width / 2, -280),
      50, // 텍스트 높이
      `공간 깊이: ${spaceInfo.depth}mm`
    );
  }
};

/**
 * DXF 파일을 다운로드
 * @param content DXF 파일 내용
 * @param filename 파일명
 */
export const downloadDXF = (content: string, filename: string): void => {
  try {
    // Blob 생성
    const blob = new Blob([content], { type: 'application/dxf' });
    
    // 다운로드 링크 생성
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // 다운로드 실행
    document.body.appendChild(link);
    link.click();
    
    // 정리
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✅ DXF 파일 다운로드 완료: ${filename}`);
  } catch (error) {
    console.error('❌ DXF 파일 다운로드 실패:', error);
    throw new Error('DXF 파일 다운로드에 실패했습니다.');
  }
};

/**
 * 파일명 생성 헬퍼 함수
 */
export const generateDXFFilename = (spaceInfo: SpaceInfo, drawingType: string = 'front'): string => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const dimensions = `${spaceInfo.width}W-${spaceInfo.height}H-${spaceInfo.depth}D`;
  
  const drawingTypeMap: { [key: string]: string } = {
    front: 'elevation',
    plan: 'plan',
    side: 'section'
  };
  
  const drawingTypeName = drawingTypeMap[drawingType] || 'elevation';
  return `furniture-${drawingTypeName}-${dimensions}-${timestamp}.dxf`;
}; 