## 기본 데이터 저장 및 흐름관리

- **Zustand + persist 미들웨어**를 사용하여, 에디터의 주요 정보(basicInfo, customization 등)가 자동으로 localStorage에 저장됩니다.
- 사용자가 브라우저를 닫거나 새로고침해도 데이터가 복원됩니다.
- Step1, Step2 등 주요 컴포넌트는 store를 직접 사용하며, 상태 변경 시 자동으로 localStorage에 반영됩니다.
- 복잡한 뷰어 컴포넌트(Space2DView)는 내부적으로 React Context API를 사용하여 컴포넌트 간 상태 공유 및 관리를 개선합니다.
  - SpaceViewContext를 통해 계산된 값과 상태를 하위 컴포넌트에 효율적으로 제공
  - useSpaceView 훅을 통한 간편한 컨텍스트 접근
  - 전역 상태(Zustand store)와 지역 상태(Context API) 조합으로 최적화된 데이터 흐름 구현
- 최종적으로 서버에 저장이 필요할 경우, localStorage에 저장된 데이터를 API로 전송하는 구조로 확장할 수 있습니다.
- 이 섹션은 데이터 흐름/저장 방식이 바뀔 때마다 계속 업데이트할 예정입니다. 

# 가구 에디터 데이터 구조

## 기본 데이터 저장 및 흐름 관리

- **Zustand + persist 미들웨어**를 사용하여, 에디터의 주요 정보(basicInfo, spaceInfo, customization 등)가 자동으로 localStorage에 저장됩니다.
- 사용자가 브라우저를 닫거나 새로고침해도 데이터가 완전히 복원됩니다.
- Step0, Step1, Step2 등 모든 컴포넌트는 중앙화된 store를 직접 사용하며, 상태 변경 시 자동으로 localStorage에 반영됩니다.
- **중앙화된 컨트롤 시스템**: `src/editor/shared/controls/`에서 모든 컨트롤 컴포넌트를 통합 관리하여 일관된 데이터 처리를 보장합니다.
- **2D 뷰어 컴포넌트(Space2DView)**는 내부적으로 React Context API를 사용하여 컴포넌트 간 상태 공유 및 관리를 개선합니다:
  - SpaceViewContext를 통해 계산된 값과 상태를 하위 컴포넌트에 효율적으로 제공
  - useSpaceView 훅을 통한 간편한 컨텍스트 접근
  - 전역 상태(Zustand store)와 지역 상태(Context API) 조합으로 최적화된 데이터 흐름 구현
- **3D 뷰어 컴포넌트(Space3DView)**는 Three.js 기반으로 실시간 3D 렌더링을 제공합니다:
  - Space3DViewContext를 통한 3D 관련 상태 관리
  - 재질 메모이제이션을 통한 성능 최적화
  - 카메라 모드별 설정 관리 (Perspective/Orthographic)
- 최종적으로 서버에 저장이 필요할 경우, localStorage에 저장된 데이터를 API로 전송하는 구조로 확장할 수 있습니다.
- 이 섹션은 데이터 흐름/저장 방식이 바뀔 때마다 계속 업데이트할 예정입니다.

## 기본 정보 (Step 0)

사용자가 입력하는 기본 정보:
- 디자인 제목 (string)
- 가구 위치 선택 (string)

### 가구 위치 옵션
- 안방
- 작은방
- 드레스룸
- 거실
- 주방
- 현관
- 기타

### 데이터 구조
```typescript
interface BasicInfo {
  title: string;
  location: string;
}
```

## 공간 정보 (Step 1)

### 공간 크기
- 폭(width): 1200-8000mm 범위 제한
- 높이(height): 1500-2500mm 범위 제한
- 실시간 유효성 검사 및 에러 메시지 표시

### 설치 타입
- **빌트인(built-in)**: 양쪽 벽면 모두 있음
- **세미스탠딩(semi-standing)**: 한쪽 벽면만 있음
- **프리스탠딩(free-standing)**: 양쪽 벽면 모두 없음

### 벽 위치 (세미스탠딩 타입에서만)
- 좌측 벽(left)
- 우측 벽(right)
- 상단 벽(top)

### 바닥 마감재
- 유무: boolean
- 높이: 10-100mm 범위 제한
- 2D/3D 뷰어에서 시각적 표현

### 에어컨 단내림
- 유무: boolean
- 위치: 좌측(left)/우측(right)
- 폭: 400mm ~ 전체폭의 1/2
- 높이: 200mm ~ 전체높이의 1/2
- 공간 크기 변경 시 동적 범위 조정

### 데이터 구조
```typescript
interface SpaceInfo {
  width: number;
  height: number;
  installType: 'built-in' | 'semi-standing' | 'free-standing';
  wallSide?: 'left' | 'right' | 'top';
  floorFinish: {
    enabled: boolean;
    height: number;
  };
  airconDrop: {
    enabled: boolean;
    position: 'left' | 'right';
    width: number;
    height: number;
  };
}
```

## 맞춤 설정 (Step 2)

### 서라운드 타입
- **서라운드(surround)**: 프레임이 있는 형태
- **노서라운드(no-surround)**: 프레임이 없는 형태

### 프레임 크기 (서라운드 타입에서만)
- 좌측 프레임: mm 단위
- 우측 프레임: mm 단위
- 상단 프레임: mm 단위

### 받침대 설정
- **타입**:
  - 없음(none): 받침대 없음
  - 받침대(base): 일반 받침대
  - 띄움(float): 띄움 받침대
- **받침대 높이**: 받침대 타입에서 설정
- **띄움 높이**: 띄움 타입에서 설정

### 데이터 구조
```typescript
interface Customization {
  surroundType: 'surround' | 'no-surround';
  frameSize: {
    left: number;
    right: number;
    top: number;
  };
  baseType: 'none' | 'base' | 'float';
  baseHeight: number;
  floatHeight: number;
}
```

## 2D 뷰어 시스템

### SVG 렌더링 설정
- **크기 제한**:
  - 너비: 컨테이너의 80%
  - 최소 너비: 300px
  - 최대 너비: 600px
  - 최소 높이: 200px
  - 최대 높이: 600px

### 동적 스케일링
- 폰트 크기: SVG 너비의 1/30 (최소 12px)
- 선 두께: SVG 너비의 1/300 (최소 2px)
- 공간 크기에 따른 자동 비율 조정

### 치수선 시스템
- 전문적인 건축 도면 스타일
- 보조가이드(|) 표시
- 치수 텍스트 (mm 단위)
- 치수선 간 간섭 최소화

### 특수 요소 표시
- **에어컨 단내림**: 점선 테두리와 치수선
- **바닥 마감재**: 점선 테두리와 높이 치수선
- **프레임**: 서라운드 타입에서 프레임 영역 표시
- **받침대**: 받침대 타입별 시각적 표현

## 3D 뷰어 시스템

### 카메라 시스템
- **Perspective 카메라**: 3D 모드용
- **Orthographic 카메라**: 2D 모드용
- 동적 카메라 위치 계산 (공간 크기 기반)

### 컨트롤 시스템
- **OrbitControls**: 마우스 인터랙션
- **각도 제한**: 수직 ±8.6도, 수평 ±10도
- **줌 제한**:
  - 2D 모드: minZoom 10, maxZoom 50
  - 3D 모드: minDistance 20, maxDistance 55

### 재질 시스템
- **깊이 기반 투명도 그라데이션**:
  - 가구 근처: 진한 회색(#666666)
  - 멀어질수록: 흰색(#ffffff) 투명
- **벽면별 특화 재질**:
  - 좌측 벽면: 반전 그라데이션
  - 우측 벽면: 기본 그라데이션
  - 상단 벽면: 세로 그라데이션
  - 뒤쪽 벽면: 단순 재질 (#f0f0f0, 투명도 0.8)
- **메모이제이션**: 재질 재생성 방지

### 시각 효과
- **Fog 효과**: #fafafa, 15-50 범위
- **Emissive 효과**: 0.2 자체 발광
- **조명 시스템**: Ambient Light 0.8, Directional Light 1.0

### 3D 요소 렌더링
- **룸 구조**: 바닥 패널 및 프레임
- **벽면**: 그라데이션 효과 적용
- **바닥 마감재**: 3D 표현
- **에어컨 단내림**: 3D 표현
- **받침대**: 타입별 3D 렌더링

## 중앙화된 컨트롤 시스템

### 공통 타입 정의
```typescript
// src/editor/shared/controls/types.ts
export type InstallType = 'built-in' | 'semi-standing' | 'free-standing';
export type WallSide = 'left' | 'right' | 'top';
export type SurroundType = 'surround' | 'no-surround';
export type BaseType = 'none' | 'base' | 'float';

export interface InstallTypeConfig {
  type: InstallType;
  wallSide?: WallSide;
}

export interface WallConfig {
  side: WallSide;
  enabled: boolean;
}

export interface AirconDropConfig {
  enabled: boolean;
  position: 'left' | 'right';
  width: number;
  height: number;
}

export interface FloorFinishConfig {
  enabled: boolean;
  height: number;
}

export interface SurroundConfig {
  type: SurroundType;
  frameSize: {
    left: number;
    right: number;
    top: number;
  };
}
```

### 컨트롤 컴포넌트 구조
- **기본 정보**: BasicInfoControls
- **공간 설정**: SpaceSizeControls, InstallTypeControls, FloorFinishControls, AirconDropControls
- **맞춤 설정**: SurroundControls, BaseControls
- **공통 스타일**: common.module.css

## 데이터 흐름

### 1. Step 0 → Step 1
- 기본 정보 저장 (제목, 위치)
- localStorage 자동 저장

### 2. Step 1 → Step 2
- 공간 정보 저장 (크기, 설치 타입, 바닥 마감재, 에어컨 단내림)
- 2D/3D 뷰어 실시간 업데이트
- 유효성 검사 및 에러 처리

### 3. Step 2 → 완료
- 맞춤 설정 저장 (서라운드, 받침대)
- 최종 데이터 취합
- 2D/3D 뷰어 최종 렌더링

### 상태 관리 흐름
```typescript
// Zustand Store 구조
interface EditorStore {
  basicInfo: BasicInfo;
  spaceInfo: SpaceInfo;
  customization: Customization;
  
  // Actions
  setBasicInfo: (info: BasicInfo) => void;
  setSpaceInfo: (info: SpaceInfo) => void;
  setCustomization: (customization: Customization) => void;
}
```

### 뷰어 컨텍스트 흐름
```typescript
// 2D 뷰어 컨텍스트
interface SpaceViewContextType {
  spaceInfo: SpaceInfo;
  customization: Customization;
  calculatedValues: CalculatedValues;
  step: number;
}

// 3D 뷰어 컨텍스트
interface Space3DViewContextType {
  spaceInfo: SpaceInfo;
  customization: Customization;
  cameraPosition: Vector3;
  materials: Materials;
}
```

## 성능 최적화

### 2D 뷰어
- SVG 요소 메모이제이션
- 계산된 값 캐싱
- 불필요한 리렌더링 방지

### 3D 뷰어
- 재질 메모이제이션
- 기하학 객체 재사용
- Three.js 렌더링 최적화
- 메모리 사용량 최적화

### 상태 관리
- Zustand persist 미들웨어
- 선택적 상태 업데이트
- 로컬 상태와 전역 상태 분리

## 향후 확장 계획

### 1. 서버 연동
- localStorage 데이터를 서버로 전송
- 프로젝트 저장/불러오기 기능
- 사용자 계정 연동

### 2. 고급 3D 기능
- 애니메이션 효과
- 인터랙티브 요소
- VR/AR 지원

### 3. 추가 컨트롤
- 재질 선택 시스템
- 색상 커스터마이징
- 조명 설정

### 4. 내보내기 기능
- 3D 모델 파일 생성 (GLTF, OBJ)
- 2D 도면 PDF 생성
- 견적서 생성

이 데이터 구조는 지속적으로 업데이트되며, 새로운 기능 추가 시 해당 섹션이 확장됩니다.

## 가구 모듈 데이터 시스템

### 모듈 데이터 구조 개편 (2025-06-05)

확장성을 위한 대규모 리팩토링으로 가구 모듈 데이터가 타입별로 분리되어 관리됩니다.

### 파일 구조
```
src/data/modules/
├── basic.ts        # 기본 오픈 박스 모듈
├── shelving.ts     # 선반형 모듈 (2단, 7단)
└── index.ts        # 통합 관리 및 export
```

### ModuleData 인터페이스
```typescript
interface ModuleData {
  id: string;
  name: string;
  description: string;
  columnsOccupied: number;
  category: 'storage' | 'shelving';
  type: 'basic' | '2tier' | '7tier';
  shelfConfig?: ShelfConfiguration;
  dimensions: {
    width: number;    // mm 단위
    height: number;   // mm 단위
    depth: number;    // mm 단위
  };
  hasDoor?: boolean;
}

interface ShelfConfiguration {
  shelves: number;       // 중간 선반 개수
  spacing: 'even';       // 선반 간격 (균등 배치)
  thickness: number;     // 선반 두께 (20mm)
}
```

### 기본 모듈 (basic.ts)
```typescript
// 선반 없는 오픈 스토리지
const basicModules = [
  {
    id: 'basic-single-open',
    name: '기본 수납장 (1칸)',
    category: 'storage',
    type: 'basic',
    columnsOccupied: 1,
    // 중간 선반 없음
  },
  {
    id: 'basic-dual-open', 
    name: '기본 수납장 (2칸)',
    category: 'storage',
    type: 'basic',
    columnsOccupied: 2,
    // 중간 선반 없음
  }
];
```

### 선반형 모듈 (shelving.ts)
```typescript
// 2단 및 7단 선반 가구
const shelvingModules = [
  {
    id: 'shelf-single-2tier',
    name: '2단 선반 (1칸)',
    category: 'shelving',
    type: '2tier',
    columnsOccupied: 1,
    shelfConfig: {
      shelves: 1,        // 중간 선반 1개
      spacing: 'even',
      thickness: 20
    }
  },
  {
    id: 'shelf-dual-2tier',
    name: '2단 선반 (2칸)', 
    category: 'shelving',
    type: '2tier',
    columnsOccupied: 2,
    shelfConfig: {
      shelves: 2,        // 양쪽에 각각 1개씩 총 2개
      spacing: 'even',
      thickness: 20
    }
  },
  {
    id: 'shelf-single-7tier',
    name: '7단 선반 (1칸)',
    category: 'shelving', 
    type: '7tier',
    columnsOccupied: 1,
    shelfConfig: {
      shelves: 6,        // 중간 선반 6개 (7단 구조)
      spacing: 'even',
      thickness: 20
    }
  },
  {
    id: 'shelf-dual-7tier',
    name: '7단 선반 (2칸)',
    category: 'shelving',
    type: '7tier', 
    columnsOccupied: 2,
    shelfConfig: {
      shelves: 12,       // 양쪽에 각각 6개씩 총 12개
      spacing: 'even',
      thickness: 20
    }
  }
];
```

### 통합 관리 시스템 (index.ts)
```typescript
// 모든 모듈 타입 통합
export function generateDynamicModules(
  internalSpace: InternalSpace,
  spaceInfo: SpaceInfo
): ModuleData[] {
  const indexing = calculateSpaceIndexing(spaceInfo);
  const allModules = [...basicModules, ...shelvingModules];
  
  return allModules.map(template => ({
    ...template,
    dimensions: {
      width: template.columnsOccupied === 2 
        ? indexing.columnWidth * 2 
        : indexing.columnWidth,
      height: internalSpace.height,
      depth: internalSpace.depth
    },
    hasDoor: template.hasDoor ?? true
  }));
}

// 개별 모듈 조회
export function getModuleById(
  moduleId: string,
  internalSpace: InternalSpace,
  spaceInfo: SpaceInfo
): ModuleData | null {
  const modules = generateDynamicModules(internalSpace, spaceInfo);
  return modules.find(module => module.id === moduleId) || null;
}
```

### 선반 렌더링 시스템

#### ShelfRenderer 컴포넌트
```typescript
interface ShelfRendererProps {
  moduleData: ModuleData;
  internalSpace: InternalSpace;
  spaceInfo: SpaceInfo;
}

// 선반 개수별 렌더링 로직
const ShelfRenderer: React.FC<ShelfRendererProps> = ({ moduleData }) => {
  const shelfCount = moduleData.shelfConfig?.shelves || 0;
  
  // 1개, 2개, 6개, 12개 선반 구성 지원
  switch (shelfCount) {
    case 1:   return <SingleShelf />;     // 싱글 2단
    case 2:   return <DualShelf />;       // 듀얼 2단  
    case 6:   return <Single7Tier />;     // 싱글 7단
    case 12:  return <Dual7Tier />;       // 듀얼 7단
    default:  return null;
  }
};
```

#### 선반 간격 자동 계산
```typescript
// 7단 가구 선반 간격 계산 예시
const calculateShelfPositions = (
  totalHeight: number,
  shelfCount: number,
  shelfThickness: number = 20
): number[] => {
  const usableHeight = totalHeight - (shelfThickness * 2); // 상하판 제외
  const compartmentHeight = usableHeight / (shelfCount + 1);
  
  return Array.from({ length: shelfCount }, (_, index) => {
    return (index + 1) * compartmentHeight - (totalHeight / 2);
  });
};
```

### 가구 타입별 3D 렌더링

#### BoxModule 통합 시스템
```typescript
const BoxModule: React.FC<BoxModuleProps> = ({ moduleData, ...props }) => {
  return (
    <group>
      {/* 기본 박스 구조 (상판, 하판, 측판) */}
      <BasicBoxStructure />
      
      {/* 선반 렌더링 (타입별 분기) */}
      <ShelfRenderer 
        moduleData={moduleData}
        internalSpace={internalSpace}
        spaceInfo={spaceInfo}
      />
      
      {/* 도어 렌더링 (조건부) */}
      {moduleData.hasDoor && (
        <DoorModule {...doorProps} />
      )}
    </group>
  );
};
```

### 확장성 및 성능

#### 새로운 가구 타입 추가 시
```typescript
// 1. 새로운 파일 생성 (예: src/data/modules/cabinets.ts)
const cabinetModules = [
  {
    id: 'cabinet-with-drawers',
    name: '서랍장',
    category: 'cabinet',
    type: 'drawer-type',
    columnsOccupied: 1,
    drawerConfig: {
      drawers: 3,
      handles: 'modern'
    }
  }
];

// 2. index.ts에서 통합
const allModules = [...basicModules, ...shelvingModules, ...cabinetModules];

// 3. ShelfRenderer에 새로운 타입 추가
// 4. 독립적인 파일 관리로 기존 코드에 영향 없음
```

#### 성능 최적화
- **메모이제이션**: 동일한 공간 설정에서 모듈 데이터 재계산 방지
- **지연 로딩**: 필요한 모듈 타입만 로드
- **타입 안전성**: TypeScript로 빌드 타임 에러 방지
- **캐싱**: 계산된 치수와 위치 정보 캐시

### 데이터 흐름

```
공간 정보 입력 → calculateSpaceIndexing() → generateDynamicModules() → 
가구 라이브러리 표시 → 사용자 선택 → getModuleById() → 3D 렌더링
```

### 향후 확장 계획

1. **20개 가구 타입 지원**: 각 타입별 독립 파일로 관리
2. **고급 선반 구성**: 비균등 간격, 다양한 선반 두께
3. **재질별 모듈**: 목재, 금속, 유리 등 재질별 가구
4. **모듈 조합 시스템**: 여러 모듈을 조합한 커스텀 가구
5. **실시간 커스터마이징**: 사용자가 직접 선반 간격 조정

이 모듈 시스템은 앞으로 추가될 모든 가구 타입을 지원할 수 있도록 설계되었습니다.

