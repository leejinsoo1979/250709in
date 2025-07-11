# 컴포넌트 구조

이 문서는 가구 에디터 애플리케이션의 폴더 구조와 주요 컴포넌트 파일에 대한 설명을 제공합니다.

## 폴더 구조

```
furniture-editor/
├── src/
│   ├── components/        # 공통 컴포넌트
│   │   └── common/        # 버튼, 입력 필드 등 공통 UI 요소
│   │       ├── Button/        # 버튼 컴포넌트
│   │       ├── Card/          # 카드 컴포넌트
│   │       ├── Input/         # 입력 필드 컴포넌트
│   │       ├── Modal/         # 모달 컴포넌트
│   │       ├── Select/        # 셀렉트 컴포넌트
│   │       └── Tabs/          # 탭 컴포넌트
│   ├── editor/            # 에디터 관련 컴포넌트
│   │   ├── Step0/         # 기본 정보 입력 단계
│   │   ├── Configurator/  # 통합 설정 및 가구 배치 도구
│   │   └── shared/        # 공유 컴포넌트
│   │       ├── controls/  # 중앙화된 컨트롤 컴포넌트
│   │       │   ├── basic/     # 기본 정보 컨트롤
│   │       │   ├── space/     # 공간 설정 컨트롤
│   │       │   ├── customization/ # 맞춤 설정 컨트롤
│   │       │   ├── furniture/     # 가구 컨트롤 (라이브러리, 배치 목록)
│   │       │   ├── styles/    # 공통 스타일
│   │       │   ├── types.ts   # 공통 타입 정의
│   │       │   └── index.ts   # 컨트롤 내보내기
│   │       ├── components/# 공유 컴포넌트
│   │       │   ├── FurnitureViewer.tsx # 가구 시각화 컴포넌트
│   │       │   └── index.ts       # 컴포넌트 내보내기
│   │       ├── furniture/  # 가구 비즈니스 로직
│   │       │   ├── hooks/        # 가구 관련 커스텀 훅
│   │       │   ├── FurnitureContext.tsx # 가구 컨텍스트
│   │       │   ├── FurnitureProvider.tsx # 가구 프로바이더
│   │       │   ├── useFurniture.ts      # 가구 상태 관리 훅
│   │       │   ├── types.ts      # 가구 관련 타입
│   │       │   └── index.ts      # Provider 내보내기
│   │       ├── viewer3d/  # 3D 뷰어 컴포넌트
│   │       │   ├── components/   # 3D 뷰어 하위 컴포넌트
│   │       │   │   ├── base/     # 기본 Three.js 요소 (클린 아키텍처 적용)
│   │       │   │   │   ├── hooks/        # 전용 커스텀 훅들
│   │       │   │   │   ├── utils/        # 순수 함수 유틸리티
│   │       │   │   │   ├── components/   # 전용 컴포넌트
│   │       │   │   │   └── ThreeCanvas.tsx # 메인 캔버스 컴포넌트 (175라인)
│   │       │   │   ├── elements/ # 3D 기능별 요소 컴포넌트
│   │       │   │   │   ├── furniture/    # 가구 관련 요소
│   │       │   │   │   │   ├── hooks/    # 가구 관련 훅
│   │       │   │   │   │   ├── FurnitureItem.tsx         # 개별 가구 아이템
│   │       │   │   │   │   ├── PlacedFurnitureContainer.tsx # 배치된 가구 컨테이너
│   │       │   │   │   │   └── index.ts  # 가구 요소 내보내기
│   │       │   │   │   ├── AirconDrop.tsx        # 에어컨 단내림
│   │       │   │   │   ├── ColumnDropTarget.tsx  # 컬럼 드롭 대상
│   │       │   │   │   ├── ColumnGuides.tsx      # 컬럼 가이드
│   │       │   │   │   ├── DragGhost.tsx         # 드래그 미리보기
│   │       │   │   │   ├── FurniturePlacementPlane.tsx # 가구 배치 평면
│   │       │   │   │   ├── Room.tsx              # 룸 구조
│   │       │   │   │   └── SlotDropZones.tsx     # 슬롯 드롭 영역
│   │       │   │   └── modules/  # 가구 모듈 컴포넌트
│   │       │   │       ├── BoxModule.tsx    # 박스형 가구 렌더링
│   │       │   │       ├── ShelfRenderer.tsx # 선반 전용 렌더링
│   │       │   │       └── DoorModule.tsx   # 도어 전용 컴포넌트
│   │       │   ├── context/      # 3D 컨텍스트 관리
│   │       │   ├── utils/        # 3D 유틸리티 함수
│   │       │   │   └── materials/ # 재질 관련 유틸리티
│   │       │   ├── types.ts      # 3D 타입 정의
│   │       │   └── Space3DView.tsx # 메인 3D 뷰어 컴포넌트
│   │       └── utils/     # 공유 유틸리티
│   │           └── indexing.ts   # 컬럼 인덱싱 계산
│   ├── data/             # 데이터 모델 (2025-06-05 구조 개편)
│   │   └── modules/      # 가구 모듈 데이터 (타입별 분리)
│   │       ├── basic.ts      # 기본 오픈 박스 모듈
│   │       ├── shelving.ts   # 선반형 모듈 (2단, 7단)
│   │       └── index.ts      # 통합 관리 및 export
│   ├── store/            # 전역 상태 관리
│   ├── styles/           # 전역 스타일
│   ├── App.tsx           # 메인 애플리케이션 컴포넌트
│   ├── App.css           # 애플리케이션 스타일
│   ├── main.tsx          # 애플리케이션 진입점
│   ├── index.css         # 전역 CSS
│   └── vite-env.d.ts     # Vite 타입 정의
└── docs/                 # 문서화 파일
```

## 주요 파일 설명

### 전역 상태 관리

- **src/store/editorStore.ts**: Zustand를 사용한 전역 상태 관리 스토어
  - 기본 정보, 커스터마이징, 공간 정보 등 상태 관리
  - localStorage를 통한 상태 영속성 관리
  - 상태 업데이트 액션 정의

### 공통 컴포넌트

- **src/components/common/Button.tsx**: 재사용 가능한 버튼 컴포넌트
  - 다양한 스타일 변형(variant) 지원
  - 크기(size) 옵션 지원

### 중앙화된 컨트롤 시스템

- **src/editor/shared/controls/**: 모든 컨트롤 컴포넌트의 중앙 관리 폴더
  - 코드 중복 제거 및 일관된 스타일링 제공
  - 모든 단계에서 재사용 가능한 컨트롤 컴포넌트

- **src/editor/shared/controls/types.ts**: 공통 타입 정의
  - InstallType, WallSide, InstallTypeConfig, WallConfig
  - AirconDropConfig, FloorFinishConfig
  - SurroundType, SurroundConfig, BaseType
  - 모든 컨트롤에서 사용하는 타입 통합 관리

- **src/editor/shared/controls/styles/common.module.css**: 공통 스타일 시스템
  - 컨테이너, 섹션, 라벨 스타일
  - 입력 필드, 버튼, 라디오 그룹 스타일
  - 일관된 디자인 시스템 적용

#### 기본 정보 컨트롤

- **src/editor/shared/controls/basic/BasicInfoControls.tsx**: 기본 정보 입력 컨트롤
  - 제목, 위치 입력 필드
  - Step0에서 사용

#### 공간 설정 컨트롤

- **src/editor/shared/controls/space/SpaceSizeControls.tsx**: 공간 크기 설정 컨트롤
  - 폭/높이 입력 필드 (1200-8000mm, 1500-2500mm 범위)
  - 실시간 유효성 검사 및 에러 메시지
  - 로컬 상태 관리로 입력 중 즉각적 반응

- **src/editor/shared/controls/space/InstallTypeControls.tsx**: 설치 타입 선택 컨트롤
  - 빌트인/세미스탠딩/프리스탠딩 라디오 버튼
  - 세미스탠딩 선택 시 벽 위치 설정 (좌측/우측/상단)
  - 조건부 UI 표시

- **src/editor/shared/controls/space/FloorFinishControls.tsx**: 바닥 마감재 설정 컨트롤
  - 바닥 마감재 유무 토글 스위치
  - 높이 설정 (10-100mm 범위)
  - 유효성 검사 및 에러 처리

- **src/editor/shared/controls/space/AirconDropControls.tsx**: 에어컨 단내림 설정 컨트롤
  - 에어컨 단내림 유무 토글 스위치
  - 위치 선택 (좌측/우측)
  - 폭/높이 설정 및 동적 범위 제한
  - 공간 크기에 따른 자동 조정

#### 맞춤 설정 컨트롤

- **src/editor/shared/controls/customization/SurroundControls.tsx**: 서라운드 설정 컨트롤
  - 서라운드/노서라운드 타입 선택
  - 프레임 크기 설정 (좌측, 우측, 상단)
  - 조건부 프레임 설정 UI

- **src/editor/shared/controls/customization/BaseControls.tsx**: 받침대 설정 컨트롤
  - 받침대 유형 선택 (없음/받침대/띄움)
  - 받침대 높이 설정
  - 띄움 높이 설정
  - 타입별 조건부 UI 표시

- **src/editor/shared/controls/index.ts**: 컨트롤 컴포넌트 내보내기
  - 모든 컨트롤 컴포넌트와 타입을 중앙에서 내보내기
  - 각 컴포넌트에서 필요한 컨트롤을 쉽게 import 가능

### 공유 뷰어 컴포넌트

- **src/editor/shared/components/FurnitureViewer.tsx**: 가구 시각화 컴포넌트
  - 선택된 가구의 세부 3D 시각화
  - Configurator의 내부 설정 탭에서 사용
  - 가구별 커스터마이징 옵션 시각화

### Step0 (기본 정보) 컴포넌트

- **src/editor/Step0/index.tsx**: 기본 정보 입력 메인 컴포넌트
  - 중앙화된 BasicInfoControls 사용
  - 제목, 위치 입력
  - Configurator로 진행하는 네비게이션

### Configurator (통합 설정 도구) 컴포넌트

- **src/editor/Configurator/index.tsx**: 통합 설정 및 가구 배치 메인 컴포넌트
  - **3분할 레이아웃 구조**:
    - 좌측: 가구 모듈 패널 (ModuleLibrary, PlacedFurnitureList)
    - 가운데: 3D 뷰어 (2D/3D 모드 전환 가능)
    - 우측: 컨트롤 패널 (탭별 설정)
  
  - **탭 기반 설정 시스템**:
    - 공간 설정 탭: SpaceSizeControls, InstallTypeControls, FloorFinishControls
    - 내부 설정 탭: SurroundControls, BaseControls
  
  - **통합 뷰어 시스템**:
    - Space3DView: 공간 구성 및 가구 배치 3D 시각화
    - FurnitureViewer: 선택된 가구의 세부 시각화
    - 2D/3D 모드 전환 지원
  
  - **드래그앤드롭 지원**:
    - 가구 라이브러리에서 3D 공간으로 직접 드래그
    - 실시간 배치 미리보기
    - 슬롯 기반 가구 배치 시스템
  
  - **통합 상태 관리**:
    - FurnitureProvider를 통한 가구 상태 통합
    - 실시간 공간 정보 및 가구 배치 상태 동기화

- **src/editor/Configurator/style.module.css**: Configurator 전용 스타일
  - 3분할 레이아웃 스타일 정의
  - 탭 네비게이션 및 패널 스타일
  - 반응형 레이아웃 지원

### 공유 3D 뷰어 컴포넌트

#### 메인 3D 뷰어
- **src/editor/shared/viewer3d/Space3DView.tsx**: 메인 3D 공간 시각화 컴포넌트
  - Three.js 기반 3D 렌더링
  - 2D/3D 모드 전환 지원 (Perspective ↔ Orthographic)
  - 컨텍스트 기반 상태 관리
  - 공간 크기에 따른 동적 카메라 위치 계산
  - Configurator에서 주로 사용
  - 줌 제한 시스템 (2D: minZoom/maxZoom, 3D: minDistance/maxDistance)

- **src/editor/shared/viewer3d/context/**: 3D 뷰어 컨텍스트 관리
  - 3D 뷰어 상태 및 계산된 값 제공
  - 컴포넌트 간 3D 데이터 공유
  - useSpace3DView 커스텀 훅 제공

- **src/editor/shared/viewer3d/types.ts**: 3D 뷰어 관련 타입 정의
- **src/editor/shared/viewer3d/utils/**: 3D 유틸리티 함수
  - **materials/**: 재질 관련 유틸리티

#### 3D 기본 컴포넌트 (클린 아키텍처)
- **src/editor/shared/viewer3d/components/base/ThreeCanvas.tsx**: Three.js 캔버스 및 카메라 설정
  - **리팩토링 결과**: 411라인 → 175라인 (57% 감소)
  - **클린 아키텍처 원칙**: 각 책임을 전용 훅과 컴포넌트로 분리
  - 조명, Fog 효과, 카메라 시스템 통합
  - OrbitControls 설정 (2D/3D 모드별 제어)
  - PerspectiveCamera/OrthographicCamera 전환
  - 수직/수평 각도 제한 (±8.6도)
  - 카메라 타입별 줌 제한 구현

- **src/editor/shared/viewer3d/components/base/hooks/**: 분리된 커스텀 훅들
  - **useCameraManager.ts**: 카메라 설정 전담 훅
    - 뷰모드별 카메라 위치 계산
    - 동적 FOV 계산 (공간 크기 기반)
    - 카메라 타겟 위치 관리
    - 메모이제이션을 통한 성능 최적화
  - **useCanvasEventHandlers.ts**: 이벤트 처리 전담 훅
    - 드래그앤드롭 이벤트 핸들러
    - Step별 조건부 이벤트 처리
    - 이벤트 버블링 제어
  - **useOrbitControlsConfig.ts**: OrbitControls 설정 전담 훅
    - Step별 컨트롤 활성화/비활성화
    - 마우스/터치 입력 매핑
    - 카메라 제한 설정 (거리, 각도)
  - **useWebGLManagement.ts**: WebGL 컨텍스트 관리 훅 (기존)

- **src/editor/shared/viewer3d/components/base/utils/**: 순수 함수 유틸리티
  - **constants.ts**: 설정 상수 정의
    - CAMERA_SETTINGS: 카메라 관련 상수
    - CANVAS_SETTINGS: 캔버스 설정 상수
    - LIGHTING_SETTINGS: 조명 시스템 상수
    - FOV_ADJUSTMENTS: FOV 계산 상수
  - **threeUtils.ts**: Three.js 계산 함수들
    - mmToThreeUnits(): 단위 변환 함수
    - calculateDynamicFOV(): 동적 FOV 계산
    - calculateCameraPosition(): 카메라 위치 계산
    - calculateCameraTarget(): 카메라 타겟 계산

- **src/editor/shared/viewer3d/components/base/components/**: 전용 컴포넌트
  - **SceneCleanup.tsx**: 메모리 정리 전담 컴포넌트
    - Three.js 씬 자원 자동 해제
    - 메쉬, 재질, 텍스처 정리
    - WebGL 컨텍스트 정리
    - 메모리 누수 방지

#### 3D 요소 컴포넌트
- **src/editor/shared/viewer3d/components/elements/Room.tsx**: 룸 구조 렌더링
  - 벽면, 바닥면 등 기본 공간 구조
  - 그라데이션 재질 시스템
  - 깊이감을 위한 Fog 효과

- **src/editor/shared/viewer3d/components/elements/AirconDrop.tsx**: 에어컨 단내림 렌더링
- **src/editor/shared/viewer3d/components/elements/ColumnGuides.tsx**: 컬럼 가이드 라인
- **src/editor/shared/viewer3d/components/elements/FurniturePlacementPlane.tsx**: 가구 배치 평면

#### 가구 관련 3D 컴포넌트
- **src/editor/shared/viewer3d/components/elements/furniture/PlacedFurnitureContainer.tsx**: 배치된 가구 컨테이너
  - 배치된 모든 가구 3D 렌더링
  - 받침대 설정에 따른 높이 계산
  - 드래그앤드롭 인터랙션 (슬롯 간 이동)
  - 선택/삭제 모드 지원
  - 충돌 감지 및 시각적 피드백
  - 도어 정보 및 공간 정보 전달

- **src/editor/shared/viewer3d/components/elements/furniture/FurnitureItem.tsx**: 개별 가구 아이템
  - 개별 가구의 3D 렌더링
  - 가구 모듈과 도어 정보 처리
  - 인터랙션 이벤트 핸들링

- **src/editor/shared/viewer3d/components/elements/furniture/hooks/**: 가구 관련 훅
- **src/editor/shared/viewer3d/components/elements/furniture/index.ts**: 가구 요소 내보내기

#### 드래그앤드롭 관련 컴포넌트
- **src/editor/shared/viewer3d/components/elements/SlotDropZones.tsx**: 슬롯 드롭 영역 및 하이라이트
  - **듀얼 가구 슬롯 하이라이트**: 2개 연속 컬럼 하이라이트 (hoveredSlotIndex + hoveredSlotIndex + 1)
  - **싱글 가구 슬롯 하이라이트**: 1개 컬럼 하이라이트
  - **가구 타입 자동 감지**: 가구 폭이 columnWidth * 2인지 자동 판별
  - **React 강제 재렌더링**: key에 hoveredSlotIndex 포함으로 상태 변화 즉시 반영
  - **시각적 피드백**: 드래그 중 녹색 반투명 메시로 배치 예정 영역 표시
  - **HTML5 드래그앤드롭 지원**: window.handleSlotDrop을 통한 네이티브 드롭 이벤트 처리
  - **충돌 감지 및 자동 삭제**: 기존 가구와 겹치는 슬롯의 가구 자동 제거

- **src/editor/shared/viewer3d/components/elements/ColumnDropTarget.tsx**: 컬럼 드롭 대상
  - React DnD 드롭 타겟
  - 컬럼별 드롭 영역 정의
  - 싱글/듀얼 가구 배치 로직
  - 슬롯 충돌 감지
  - 도어 정보 포함 배치

- **src/editor/shared/viewer3d/components/elements/DragGhost.tsx**: 드래그 미리보기
  - 드래그 중 가구 미리보기
  - 배치 가능/불가능 시각화
  - 컬럼 기반 위치 계산
  - 싱글/듀얼 가구 구분
  - 도어 미리보기 포함

#### 가구 모듈 시스템
- **src/editor/shared/viewer3d/components/modules/BoxModule.tsx**: 박스형 가구 렌더링 (240라인 → 110라인으로 54% 감소)
  - 20mm 두께 판재 구조
  - 앞면 오픈형 박스 렌더링
  - ShelfRenderer를 통한 모든 선반 구성 처리
  - 조건부 도어 렌더링
  - 고급 재질 시스템 (clearcoat, roughness)
  - 렌더링 로직 분리로 확장성과 유지보수성 대폭 향상

- **src/editor/shared/viewer3d/components/modules/ShelfRenderer.tsx**: 선반 전용 렌더링 컴포넌트
  - **모든 선반 구성 지원**: 1개, 2개, 6개, 12개 선반 구성
  - **자동 간격 계산**: 가구 높이에 따른 선반 간격 자동 계산으로 균등 배치
  - **타입별 렌더링**:
    - 싱글 2단: 1개 중간 선반
    - 듀얼 2단: 양쪽에 각각 1개씩 총 2개 선반
    - 싱글 7단: 6개 중간 선반
    - 듀얼 7단: 양쪽에 각각 6개씩 총 12개 선반
  - **재사용 가능한 구조**: 새로운 선반 구성 추가 시 확장 용이
  - BoxModule과의 완벽한 통합

- **src/editor/shared/viewer3d/components/modules/DoorModule.tsx**: 도어 전용 컴포넌트
  - **도어 크기 계산 로직**:
    - 싱글 가구: 도어 폭 = 슬롯 폭 - 좌우 각 1.5mm
    - 듀얼 가구: 도어 폭 = (슬롯 폭 - 좌우 1.5mm - 가운데 3mm) ÷ 2
  - **도어 두께**: 정확히 20mm
  - **도어 위치**: 가구 깊이에서 1mm 앞으로 배치
  - **듀얼 가구**: 두 개의 분리된 문 렌더링
  - **재질**: meshLambertMaterial, 흰색(#ffffff)

### 가구 컨트롤 시스템

- **src/editor/shared/controls/furniture/ModuleLibrary.tsx**: 가구 라이브러리 컴포넌트
  - 내경 공간 정보 표시
  - 동적 생성 가구 모듈 목록
  - 가구별 도어 체크박스 포함
  - 유효성 검사 및 비활성화 처리
  - 드래그 시작 시 도어 상태 포함

- **src/editor/shared/controls/furniture/ModuleItem.tsx**: 개별 가구 아이템 컴포넌트
  - 가구 미리보기 (박스 시각화)
  - 가구 정보 표시 (이름, 치수, 설명)
  - 도어 체크박스 (기본값: 체크됨)
  - 네이티브 HTML5 드래그 지원
  - 유효성 검사 시각화 (아이콘, 색상)
  - 이벤트 버블링 방지

- **src/editor/shared/controls/furniture/PlacedFurnitureList.tsx**: 배치된 가구 목록
  - 배치된 가구 카드 형태 표시
  - 가구별 삭제 버튼
  - 스크롤 가능한 목록 구조
  - 선택된 가구 하이라이트

- **src/editor/shared/controls/furniture/ModuleLibrary.module.css**: 가구 컨트롤 스타일
  - 모듈 카드 레이아웃
  - 도어 체크박스 스타일링
  - 호버 효과 및 상태별 스타일
  - 유효성 검사 시각화
  - 반응형 그리드 레이아웃

### 가구 비즈니스 로직

- **src/editor/shared/furniture/**: 가구 관련 비즈니스 로직
  - **FurnitureContext.tsx**: 가구 컨텍스트 정의
  - **FurnitureProvider.tsx**: 가구 상태 관리 프로바이더
  - **useFurniture.ts**: 가구 상태 관리 훅
  - **hooks/**: 가구 관련 커스텀 훅들
  - **types.ts**: 가구 관련 타입 정의
  - **index.ts**: FurnitureProvider 내보내기
  - Configurator에서 사용하는 가구 상태 통합 관리

### 공유 컴포넌트

- **src/editor/shared/components/FurnitureViewer.tsx**: 가구 시각화 컴포넌트
  - 선택된 가구의 세부 3D 시각화
  - Configurator의 내부 설정 탭에서 사용
  - 가구별 커스터마이징 옵션 시각화

### 공유 유틸리티

- **src/editor/shared/utils/indexing.ts**: 컬럼 인덱싱 계산
  - 공간 크기 기반 컬럼 수 계산
  - 싱글/듀얼 가구 위치 계산
  - Three.js 좌표계 변환
  - 슬롯 기반 배치 시스템

### 데이터 모델

- **src/data/modules/**: 모듈 데이터 타입별 분리 구조
  - **basic.ts**: 기본 오픈 박스 모듈 데이터
    - 싱글/듀얼 기본 수납 박스
    - 선반 없는 오픈 스토리지
  - **shelving.ts**: 선반형 모듈 데이터  
    - 2단 선반 (싱글/듀얼)
    - 7단 선반 (싱글/듀얼)
    - 선반 개수 및 구성 정보 포함
  - **index.ts**: 모듈 통합 관리
    - `generateDynamicModules()` 통합 생성 함수
    - `getModuleById()` 통합 조회 함수
    - ModuleData 타입 export
    - 모든 모듈 타입 통합 export

- **확장 가능한 모듈 시스템**:
  - 새로운 가구 타입 추가 시 독립적인 파일로 관리
  - 통합 생성 함수로 모든 모듈 타입 일괄 처리
  - TypeScript 타입 시스템으로 빌드 안정성 확보
  - 20개 가구 확장을 대비한 확장 가능한 아키텍처

- **ModuleData 인터페이스 (도어 정보 포함)**:
  - 가구 ID, 이름, 차지하는 컬럼 수
  - 3D 치수 정보 (width, height, depth)
  - 도어 유무 및 선반 구성 정보
  - 컬럼 기반 크기 계산 지원

## 도어 기능 아키텍처

### 1. 데이터 흐름
```
ModuleItem (체크박스) → DragData (hasDoor) → DropEvent → PlacedModule (hasDoor) → 3D Rendering
```

### 2. 도어 크기 계산
- **싱글 가구**: `doorWidth = slotWidth - 1.5 - 1.5` (3mm 감소)
- **듀얼 가구**: `doorWidth = (slotWidth - 1.5 - 1.5 - 3) / 2` (가운데 3mm 간격)

### 3. 3D 렌더링 파이프라인
```
BoxModule → DoorModule (조건부) → meshLambertMaterial (흰색) → Three.js 렌더링
```

### 4. 드래그앤드롭 통합
- 네이티브 HTML5: ModuleItem → Configurator → 드롭 처리
- React DnD: 3D 뷰어 내 ColumnDropTarget → 배치 처리
- 모든 경로에서 도어 정보 유지 및 전달

### 5. UI/UX 고려사항
- 체크박스 기본값: 체크됨 (사용자 편의성)
- 이벤트 버블링 방지 (드래그와 체크박스 분리)
- 실시간 미리보기 (DragGhost에서 도어 표시)
- 시각적 일관성 (흰색 도어, 20mm 두께)

## 컴포넌트 간 상호작용

1. **중앙화된 컨트롤 시스템**:
   - 모든 컴포넌트에서 동일한 컨트롤 컴포넌트 재사용
   - 일관된 스타일링과 동작 보장
   - 새로운 기능 추가 시 기존 컨트롤 활용 가능
   - 유지보수 시 한 곳에서 모든 컨트롤 관리

2. **상태 흐름**:
   - `editorStore.ts`에서 정의된 전역 상태를 각 컴포넌트가 구독
   - 컴포넌트에서 상태 변경 시 `setSpaceInfo` 등의 액션을 통해 전역 상태 업데이트
   - 상태 변경은 자동으로 localStorage에 저장됨

3. **Configurator 통합 워크플로우**:
   - 3분할 레이아웃으로 모든 기능을 한 화면에서 관리
   - 좌측 가구 라이브러리에서 가운데 3D 뷰어로 드래그앤드롭
   - 우측 컨트롤 패널에서 실시간 설정 변경
   - 탭 전환을 통한 공간 설정과 내부 설정 분리

4. **뷰어와 컨트롤 패널 간 상호작용**:
   - 컨트롤 패널에서 설정 변경 시 전역 상태 업데이트
   - 3D 뷰어는 변경된 상태를 구독하여 실시간으로 시각화 업데이트
   - 뷰 모드 전환 시 동일한 데이터를 다른 방식으로 렌더링

5. **3D 뷰어 기능**:
   - 공간 크기에 따른 동적 카메라 위치 계산
   - 벽면별 개별 그라데이션 재질 적용
   - 깊이감을 위한 Fog 효과와 투명도 조합
   - 실시간 재질 업데이트 및 메모이제이션 최적화
   - 카메라 타입별 줄 제한 시스템 (Perspective ↔ Orthographic)

6. **드래그앤드롭 시스템**:
   - 가구 라이브러리에서 3D 공간으로 직접 드래그
   - 실시간 배치 미리보기 (DragGhost 컴포넌트)
   - 슬롯 기반 가구 배치 시스템
   - 듀얼 가구 2개 슬롯 하이라이트 기능
   - HTML5 네이티브 드래그앤드롭 지원

7. **유효성 검사**:
   - 각 컨트롤 컴포넌트에서 자체적으로 입력값 유효성 검사
   - 유효하지 않은 입력에 대한 시각적 피드백 제공
   - 유효한 값만 전역 상태에 반영

8. **라우팅 시스템**:
   - Step0 (기본 정보) → Configurator (통합 설정) 워크플로우
   - 기존 Step1,2,3 경로는 Configurator로 리다이렉트
   - 브라우저 히스토리 관리 및 WebGL 메모리 정리

## 확장성

현재 구조는 다음과 같은 확장을 고려하여 설계되었습니다:

1. **새로운 컨트롤 추가**:
   - `shared/controls` 디렉토리에 새 컴포넌트 추가
   - 기존 공통 스타일과 타입 시스템 활용
   - `index.ts`에서 내보내기 추가
   - Configurator에서 즉시 사용 가능

2. **3D 뷰어 기능 확장**:
   - `shared/viewer3d/components/elements`에 새로운 3D 요소 추가
   - `utils/materials.ts`에 새로운 재질 시스템 추가
   - `utils/geometry.ts`에 새로운 기하학 계산 함수 추가
   - 애니메이션 및 인터랙션 기능 확장 가능

3. **새로운 재질 효과**:
   - 깊이 기반 그라데이션 시스템 확장
   - 새로운 텍스처 및 재질 효과 추가
   - 조명 시스템 개선 및 확장
   - 실시간 재질 편집 기능 추가

4. **Configurator 탭 확장**:
   - 새로운 설정 탭 추가 (예: 조명, 재질 등)
   - 탭별 전용 뷰어 모드 추가
   - 고급 설정 및 전문가 모드 구현
   - 설정 프리셋 및 템플릿 시스템

5. **성능 최적화**:
   - 3D 렌더링 최적화 (LOD, 인스턴싱 등)
   - 재질 메모이제이션 확장
   - 동적 로딩 및 코드 스플리팅
   - WebGL 성능 모니터링 추가

6. **컨트롤 시스템 확장**:
   - 새로운 카테고리의 컨트롤 추가 (예: lighting/, materials/ 등)
   - 고급 입력 컴포넌트 개발 (슬라이더, 컬러 피커 등)
   - 조건부 컨트롤 시스템 확장
   - 실시간 미리보기 기능 강화 

7. **가구 시스템 확장**:
   - 새로운 가구 유형 및 모듈 추가
   - 가구별 커스터마이징 옵션 확장
   - 가구 조합 및 세트 시스템
   - 가구 라이브러리 카테고리 시스템 