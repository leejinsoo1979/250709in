# 🏛️ SUPER CODE MAP - 가구 편집기 완벽한 아키텍처 구조

## 📊 프로젝트 개요
- **프로젝트명**: 3D 가구 편집기 (Furniture Editor)
- **기술 스택**: React 18 + TypeScript + Three.js + Firebase + Zustand
- **아키텍처 패턴**: Feature-Sliced Design + Clean Architecture
- **빌드 도구**: Vite
- **배포**: Vercel/Netlify

## 🏗️ 아키텍처 레이어 구조

### Layer 1: 프레젠테이션 계층 (Presentation Layer)
```
src/
├── pages/                      # 라우트별 페이지 컴포넌트
│   ├── SimpleDashboard.tsx    # 메인 대시보드 (프로젝트/폴더/디자인 관리)
│   └── SimpleDashboard.module.css
│
├── components/                 # 재사용 가능한 UI 컴포넌트
│   ├── common/                # 공통 컴포넌트
│   │   ├── LoginModal.tsx     # 인증 모달
│   │   ├── ThumbnailImage.tsx # 3D 썸네일 렌더러
│   │   ├── ProjectViewerModal.tsx # 3D 뷰어 팝업
│   │   ├── Modal/             # 기본 모달 시스템
│   │   └── SettingsModal.tsx  # 테마/설정 관리
│   │
│   ├── layout/                # 레이아웃 컴포넌트
│   │   └── Header.tsx         # 전역 헤더
│   │
│   └── collaboration/         # 협업 기능 UI (새로운 기능)
│
└── editor/                    # 에디터 관련 컴포넌트
    ├── Step0/                 # 프로젝트 초기 설정
    │   └── index.tsx
    │
    └── Configurator/          # 메인 에디터
        ├── index.tsx          # 에디터 메인 컨테이너
        ├── components/        # 에디터 전용 컴포넌트
        │   ├── Header.tsx     # 에디터 헤더 (저장/내보내기)
        │   └── HelpModal.tsx  # 도움말
        │
        └── shared/            # 에디터 공유 모듈
```

### Layer 2: 비즈니스 로직 계층 (Business Logic Layer)
```
src/editor/shared/
├── controls/                  # 제어 시스템 (MVC의 Controller)
│   ├── space/                # 공간 제어
│   │   ├── SpaceDimensionControl.tsx
│   │   ├── FloorFinishControl.tsx
│   │   └── WallControl.tsx
│   │
│   ├── furniture/            # 가구 제어
│   │   ├── ModuleGallery.tsx
│   │   ├── PlacedModulesList.tsx
│   │   └── FurnitureControls.tsx
│   │
│   └── styling/              # 스타일링 제어
│       ├── MaterialControl.tsx
│       ├── ColorPicker.tsx
│       └── TextureSelector.tsx
│
├── furniture/                # 가구 비즈니스 로직
│   ├── hooks/               # 가구 관련 커스텀 훅
│   │   ├── useFurnitureDragDrop.ts    # 드래그앤드롭
│   │   ├── useFurnitureInteraction.ts  # 상호작용
│   │   ├── useFurnitureSelection.ts    # 선택 로직
│   │   └── useBaseFurniture.ts         # 기본 가구 로직
│   │
│   ├── providers/           # 가구 관련 프로바이더 (4개 분리)
│   │   ├── FurnitureDragDropProvider.tsx
│   │   ├── FurnitureSelectionProvider.tsx
│   │   ├── FurnitureViewModeProvider.tsx
│   │   └── withFurnitureSpaceAdapter.tsx # HOC 패턴
│   │
│   └── types.ts            # 가구 타입 정의
│
└── utils/                   # 유틸리티 및 핵심 비즈니스 로직
    ├── indexing/           # 공간 계산 시스템 (4개 전문 클래스)
    │   ├── SpaceCalculator.ts      # 공간 계산 전담
    │   ├── ColumnIndexer.ts        # 기둥 인덱싱 전담
    │   ├── FurniturePositioner.ts  # 가구 위치 전담
    │   ├── FurnitureSpaceAdapter.ts # 가구-공간 적응 전담
    │   └── index.ts               # 통합 인터페이스
    │
    ├── dxfGenerator.ts     # DXF 기술도면 생성
    ├── thumbnailCapture.ts # 3D 캔버스 캡처
    └── fileUtils.ts        # 파일 처리 유틸
```

### Layer 3: 상태 관리 계층 (State Management Layer)
```
src/store/
├── core/                    # 핵심 도메인 스토어
│   ├── projectStore.ts     # 프로젝트 기본 정보
│   │   - basicInfo: { name, createdAt, updatedAt }
│   │   - setBasicInfo()
│   │   - resetProject()
│   │
│   ├── spaceConfigStore.ts # 공간 설정
│   │   - spaceInfo: { width, height, depth }
│   │   - columns: Column[]
│   │   - walls: Wall[]
│   │   - materialConfig: { interiorColor, doorColor }
│   │   - updateSpaceInfo()
│   │   - addColumn(), updateColumn(), removeColumn()
│   │   - addWall(), updateWall(), removeWall()
│   │
│   └── furnitureStore.ts   # 가구 관리
│       - placedModules: PlacedModule[]
│       - addModule()
│       - updateModule()
│       - removeModule()
│       - updateModuleDimensions()
│
├── derivedSpaceStore.ts    # 계산된 값 (파생 상태)
│   - frameWidth, frameHeight
│   - innerWidth, innerHeight
│   - availableSlots
│   - 자동 재계산 (Zustand subscribeWithSelector)
│
└── uiStore.ts              # UI 상태
    - viewMode: '2D' | '3D'
    - view2DDirection: 'front' | 'left' | 'right' | 'top'
    - selectedModuleId
    - hoveredModuleId
    - showDimensions
    - showGuides
```

### Layer 4: 3D 렌더링 계층 (3D Rendering Layer)
```
src/editor/shared/viewer3d/
├── Space3DView.tsx         # 메인 3D 뷰어 컨테이너
│
├── components/
│   ├── base/              # 기본 3D 컴포넌트
│   │   ├── ThreeCanvas.tsx        # Three.js 캔버스 설정
│   │   ├── hooks/                 # 3D 관련 훅
│   │   │   ├── useCameraManager.ts    # 카메라 관리
│   │   │   ├── useCanvasEventHandlers.ts
│   │   │   ├── useOrbitControlsConfig.ts
│   │   │   └── useCustomZoom.ts
│   │   └── utils/
│   │       └── threeUtils.ts      # Three.js 유틸
│   │
│   ├── elements/          # 3D 씬 요소
│   │   ├── Room.tsx              # 룸 전체
│   │   ├── space/               # 공간 요소
│   │   │   ├── Floor.tsx        # 바닥
│   │   │   ├── Walls.tsx        # 벽면
│   │   │   ├── ColumnAsset.tsx  # 기둥
│   │   │   └── WallAsset.tsx    # 가벽
│   │   │
│   │   ├── furniture/           # 가구 요소
│   │   │   ├── PlacedFurniture.tsx
│   │   │   ├── FurnitureItem.tsx
│   │   │   └── DraggableFurniture.tsx
│   │   │
│   │   └── guides/              # 가이드 요소
│   │       ├── ColumnGuides.tsx
│   │       ├── CleanCAD2D.tsx
│   │       └── CADGrid.tsx
│   │
│   └── modules/           # 가구별 3D 렌더러
│       ├── WardrobeModule.tsx
│       ├── KitchenModule.tsx
│       ├── StorageModule.tsx
│       └── BathroomModule.tsx
│
└── utils/
    └── materials/         # 재질 시스템
        ├── MaterialFactory.ts    # 재질 생성 팩토리
        ├── TextureLoader.ts      # 텍스처 로더
        ├── materialCache.ts      # 재질 캐싱
        └── index.ts
```

### Layer 5: 데이터 계층 (Data Layer)
```
src/
├── firebase/              # Firebase 통합
│   ├── config.ts         # Firebase 초기화
│   ├── auth.ts          # 인증 서비스
│   │   - signInWithGoogle()
│   │   - signInWithEmail()
│   │   - signUpWithEmail()
│   │   - signOut()
│   │   - getCurrentUser()
│   │   - resetPassword()
│   │
│   ├── projects.ts      # 프로젝트 CRUD
│   │   - createProject()
│   │   - getProject()
│   │   - updateProject()
│   │   - deleteProject()
│   │   - getUserProjects()
│   │   - createDesignFile()
│   │   - updateDesignFile()
│   │   - getDesignFiles()
│   │
│   ├── teams.ts         # 팀 관리
│   ├── sharing.ts       # 공유 기능
│   ├── userProfiles.ts  # 사용자 프로필
│   ├── bookmarks.ts     # 북마크
│   ├── realtime.ts      # 실시간 업데이트
│   └── types.ts         # Firebase 타입 정의
│
└── data/
    └── modules/         # 가구 모듈 데이터
        ├── wardrobe.ts  # 옷장 데이터
        ├── kitchen.ts   # 주방 데이터
        ├── storage.ts   # 수납 데이터
        ├── bathroom.ts  # 욕실 데이터
        ├── types.ts     # 모듈 타입
        └── index.ts     # 모듈 통합
```

## 🔄 데이터 흐름 아키텍처

### 1. 사용자 인터랙션 플로우
```
사용자 입력
    ↓
React Component (Presentation)
    ↓
Custom Hook (Business Logic)
    ↓
Zustand Store Action (State Management)
    ↓
State Update
    ↓
React Re-render
    ↓
Firebase Sync (비동기)
```

### 2. 3D 렌더링 파이프라인
```
Space3DView
    ↓
ThreeCanvas (WebGL Context)
    ↓
Scene Setup (Lights, Camera)
    ↓
Room Elements (Floor, Walls)
    ↓
Furniture Elements
    ↓
Material Factory (캐싱)
    ↓
Render Loop
```

### 3. 상태 동기화 플로우
```
Local State (Zustand)
    ↓
Optimistic Update (즉시 UI 반영)
    ↓
Firebase Write (비동기)
    ↓
Success: Confirm / Error: Rollback
    ↓
Other Tabs Update (BroadcastChannel)
```

## 🏛️ 아키텍처 패턴 및 원칙

### 1. Design Patterns 사용
- **Factory Pattern**: MaterialFactory (Three.js 재질 생성)
- **Singleton Pattern**: 썸네일 생성기, 재질 캐시
- **Strategy Pattern**: 2D/3D 렌더링 전략
- **Provider Pattern**: AuthProvider, FurnitureProviders
- **HOC Pattern**: withFurnitureSpaceAdapter
- **Command Pattern**: Store Actions
- **Observer Pattern**: Zustand subscriptions

### 2. SOLID 원칙 적용
- **Single Responsibility**: 4개로 분리된 인덱싱 클래스
- **Open/Closed**: 가구 모듈 확장 가능 구조
- **Liskov Substitution**: 모든 가구 모듈 인터페이스 통일
- **Interface Segregation**: 작은 단위의 커스텀 훅
- **Dependency Inversion**: Store를 통한 의존성 역전

### 3. Clean Architecture 특징
- **도메인 중심 설계**: 비즈니스 로직이 UI와 분리
- **의존성 방향**: 외부→내부 (UI→Business→Domain)
- **테스트 가능성**: 각 레이어 독립적 테스트
- **확장 가능성**: 새 기능 추가 시 기존 코드 수정 최소화

## 🚀 성능 최적화 전략

### 1. 렌더링 최적화
- React.memo로 불필요한 리렌더링 방지
- useMemo/useCallback으로 연산 캐싱
- Three.js 재질 캐싱으로 메모리 절약
- WebGL 컨텍스트 관리로 메모리 누수 방지

### 2. 번들 최적화
- Vite 코드 스플리팅
- 라우트별 레이지 로딩
- 청크 최적화 설정

### 3. 상태 관리 최적화
- Derived Store로 중복 계산 방지
- Zustand의 shallow comparison
- 선택적 구독으로 불필요한 업데이트 방지

## 🔒 보안 아키텍처

### 1. 인증 계층
- Firebase Auth 통합
- JWT 토큰 관리
- 라우트 가드 구현

### 2. 권한 관리
- 프로젝트별 접근 권한
- 뷰어/에디터/관리자 역할
- 공유 링크 권한 제어

### 3. 데이터 보호
- Firestore Security Rules
- 사용자별 데이터 격리
- XSS/CSRF 보호

## 🧪 테스트 전략

### 1. 단위 테스트
```
src/store/__tests__/         # Store 테스트
src/editor/shared/utils/__tests__/  # 유틸 테스트
```

### 2. 통합 테스트
- 컴포넌트 상호작용 테스트
- Firebase 연동 테스트

### 3. E2E 테스트
- 사용자 시나리오 기반 테스트
- 3D 렌더링 스냅샷 테스트

## 📦 빌드 및 배포

### 1. 개발 환경
```bash
npm run dev         # 개발 서버
npm run build       # 프로덕션 빌드
npm run preview     # 빌드 미리보기
npm run test        # 테스트 실행
npm run lint        # 린트 검사
```

### 2. 빌드 설정
- Vite 기반 빌드
- TypeScript 엄격 모드
- 환경 변수 관리

### 3. 배포 파이프라인
- GitHub Actions CI/CD
- Vercel/Netlify 자동 배포
- 환경별 설정 관리

## 🎯 핵심 기능별 아키텍처 매핑

### 1. 프로젝트 생성 플로우
```
Step0 → projectStore.setBasicInfo() → Firebase.createProject() → Router.navigate(/configurator)
```

### 2. 가구 배치 플로우
```
ModuleGallery → DragStart → Space3DView.handleDrop → furnitureStore.addModule() → 3D Render
```

### 3. 기둥 충돌 처리 플로우
```
Column 추가 → FurnitureSpaceAdapter.checkCollisions() → FurniturePositioner.adjust() → Store Update
```

### 4. 썸네일 생성 플로우
```
Project Save → ThumbnailGenerator.create() → Three.js Offscreen Render → Base64 → Firebase Storage
```

### 5. 실시간 동기화 플로우
```
Local Change → Store Update → Firebase Write → BroadcastChannel → Other Tabs Update
```

## 🔍 디버깅 가이드

### 1. 상태 디버깅
- Redux DevTools Extension 지원
- Zustand devtools 미들웨어
- Console 로깅 전략

### 2. 3D 렌더링 디버깅
- Three.js Inspector
- WebGL 디버깅 도구
- 성능 프로파일링

### 3. 네트워크 디버깅
- Firebase 에뮬레이터
- Network 탭 모니터링
- 에러 로깅 시스템

## 📚 확장 가이드

### 1. 새로운 가구 타입 추가
1. `/src/data/modules/`에 데이터 정의
2. `/src/editor/shared/viewer3d/components/modules/`에 3D 컴포넌트
3. `/src/data/modules/index.ts`에 등록

### 2. 새로운 공간 기능 추가
1. `spaceConfigStore`에 상태 추가
2. Control 컴포넌트 생성
3. 3D 렌더링 로직 추가

### 3. 새로운 협업 기능 추가
1. Firebase 스키마 설계
2. Store 및 타입 정의
3. UI 컴포넌트 구현

## 🎓 베스트 프랙티스

### 1. 코드 작성 규칙
- TypeScript strict mode 준수
- 함수형 프로그래밍 선호
- 불변성 유지
- 명확한 타입 정의

### 2. 컴포넌트 설계
- 단일 책임 원칙
- Props 타입 명시
- 에러 바운더리 적용
- 접근성 고려

### 3. 상태 관리
- 최소한의 전역 상태
- 파생 상태 활용
- 낙관적 업데이트
- 에러 상태 관리

### 4. 성능 고려사항
- 메모이제이션 적절히 사용
- 대용량 데이터 페이지네이션
- 이미지 최적화
- 번들 사이즈 모니터링

이 SUPER CODE MAP은 프로젝트의 완벽한 아키텍처 구조를 제공하며, 
새로운 개발자가 프로젝트를 이해하고 확장하는 데 필요한 모든 정보를 담고 있습니다.