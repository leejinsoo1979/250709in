# 🗂️ 가구 편집기 완전한 코드맵 - 모든 파일 경로 정리

## 📁 프로젝트 루트 구조
```
250709in/
├── src/                    # 소스 코드 루트
├── public/                 # 정적 파일
├── node_modules/          # npm 패키지
├── dist/                  # 빌드 출력
└── 설정 파일들
```

## 🎯 메인 애플리케이션 파일

### 진입점 및 라우팅
- **`/src/main.tsx`** - React 앱 시작점, DOM 렌더링
- **`/src/App.tsx`** - 라우팅 설정, WebGL 메모리 관리
- **`/src/App.module.css`** - App 컴포넌트 스타일
- **`/index.html`** - HTML 템플릿

### 라우트별 페이지
- **`/src/pages/SimpleDashboard.tsx`** - 메인 대시보드 (/dashboard)
- **`/src/pages/SimpleDashboard.module.css`** - 대시보드 스타일
- **`/src/editor/Step0/index.tsx`** - 프로젝트 생성 페이지 (/step0)
- **`/src/editor/Step0/Step0.module.css`** - Step0 스타일
- **`/src/editor/Configurator/index.tsx`** - 메인 에디터 (/configurator/:id)
- **`/src/editor/Configurator/Configurator.module.css`** - 에디터 스타일

## 🔐 인증 시스템

### Firebase 인증
- **`/src/firebase/auth.ts`** - 인증 함수들
  - `signInWithGoogle()` - 구글 로그인
  - `signInWithEmail()` - 이메일 로그인
  - `signUpWithEmail()` - 회원가입
  - `signOut()` - 로그아웃
  - `getCurrentUser()` - 현재 사용자
  - `getCurrentUserAsync()` - 비동기 사용자 확인
  - `resetPassword()` - 비밀번호 재설정

### 인증 UI 컴포넌트
- **`/src/components/common/LoginModal.tsx`** - 로그인 모달
- **`/src/components/common/LoginModal.module.css`** - 로그인 모달 스타일
- **`/src/contexts/AuthProvider.tsx`** - 인증 상태 전역 관리
- **`/src/components/layout/Header.tsx`** - 헤더의 로그인/로그아웃 버튼

## 📊 대시보드 시스템

### 대시보드 메인
- **`/src/pages/SimpleDashboard.tsx`** - 대시보드 전체 로직
  - 라인 299-350: 프로젝트 생성 (`createNewProject`)
  - 라인 820-900: 프로젝트 선택 (`handleProjectSelect`)
  - 라인 950-1050: 프로젝트 편집 (`handleProjectEdit`)
  - 라인 1100-1200: 프로젝트 삭제 (`handleProjectDelete`)
  - 라인 1500-1650: 폴더 관리 (`handleFolderCreate`, `handleFolderDelete`)
  - 라인 2200-2600: 카드 렌더링 로직

### 대시보드 UI 요소
- **`/src/pages/SimpleDashboard.module.css`** - 모든 대시보드 스타일
  - `.dashboard` - 메인 컨테이너
  - `.sidebar` - 좌측 사이드바
  - `.mainContent` - 우측 메인 영역
  - `.projectCard` - 프로젝트 카드
  - `.folderCard` - 폴더 카드
  - `.designCard` - 디자인 카드
  - `.fileTree` - 파일 트리

## 💾 데이터 저장 및 관리

### Firebase 프로젝트 관리
- **`/src/firebase/projects.ts`** - 모든 프로젝트 CRUD
  - 라인 24-81: `createProject()` - 프로젝트 생성
  - 라인 84-127: `createDesignFile()` - 디자인 파일 생성
  - 라인 130-167: `getDesignFiles()` - 디자인 파일 목록
  - 라인 186-220: `getProject()` / `getProjectById()` - 프로젝트 조회
  - 라인 226-278: `updateProject()` - 프로젝트 업데이트
  - 라인 281-315: `deleteProject()` - 프로젝트 삭제
  - 라인 318-377: `updateDesignFile()` - 디자인 파일 업데이트
  - 라인 379-408: `deleteDesignFile()` - 디자인 파일 삭제
  - 라인 411-464: `getUserProjects()` - 사용자 프로젝트 목록
  - 라인 494-542: `saveFolderData()`, `loadFolderData()` - 폴더 데이터

### Firebase 타입 정의
- **`/src/firebase/types.ts`** - 모든 데이터 타입
  - 라인 8-12: `AppUser` - 사용자 타입
  - 라인 15-30: `DesignFile` - 디자인 파일
  - 라인 33-39: `ProjectFolder` - 폴더
  - 라인 42-57: `FirebaseProject` - 프로젝트
  - 라인 60-73: `CreateProjectData`, `CreateDesignFileData`
  - 라인 76-100: `ProjectSummary` - 프로젝트 요약
  - 라인 103-201: 팀, 공유, 북마크 타입들

### Firebase 설정
- **`/src/firebase/config.ts`** - Firebase 초기화
- **`/src/firebase/teams.ts`** - 팀 관리
- **`/src/firebase/sharing.ts`** - 프로젝트 공유
- **`/src/firebase/userProfiles.ts`** - 사용자 프로필
- **`/src/firebase/bookmarks.ts`** - 북마크
- **`/src/firebase/realtime.ts`** - 실시간 업데이트

## 🗄️ 상태 관리 (Zustand)

### 코어 스토어
- **`/src/store/core/projectStore.ts`** - 프로젝트 기본 정보
  - `basicInfo` - 프로젝트 이름, 생성일 등
  - `setBasicInfo()` - 정보 업데이트
  - `resetProject()` - 프로젝트 초기화

- **`/src/store/core/spaceConfigStore.ts`** - 공간 설정
  - `spaceInfo` - 공간 크기 (width, height, depth)
  - `columns` - 기둥 배열
  - `walls` - 가벽 배열
  - `materialConfig` - 재질 설정
  - `updateSpaceInfo()` - 공간 정보 업데이트
  - `addColumn()`, `updateColumn()`, `removeColumn()` - 기둥 관리
  - `addWall()`, `updateWall()`, `removeWall()` - 가벽 관리

- **`/src/store/core/furnitureStore.ts`** - 가구 관리
  - `placedModules` - 배치된 가구 목록
  - `addModule()` - 가구 추가
  - `updateModule()` - 가구 업데이트
  - `removeModule()` - 가구 제거
  - `updateModuleDimensions()` - 가구 크기 변경

- **`/src/store/derivedSpaceStore.ts`** - 계산된 값
  - `frameWidth`, `frameHeight` - 프레임 크기
  - `innerWidth`, `innerHeight` - 내부 크기
  - `availableSlots` - 사용 가능한 슬롯

- **`/src/store/uiStore.ts`** - UI 상태
  - `viewMode` - 2D/3D 모드
  - `view2DDirection` - 2D 뷰 방향
  - `selectedModuleId` - 선택된 가구 ID
  - `hoveredModuleId` - 호버된 가구 ID
  - `showDimensions` - 치수 표시 여부
  - `showGuides` - 가이드 표시 여부

## 🎨 3D 시각화 시스템

### 메인 3D 뷰어
- **`/src/editor/shared/viewer3d/Space3DView.tsx`** - 메인 3D 뷰어
  - 라인 49-55: 뷰어/에디터 모드 분기
  - 라인 88-125: 카메라 위치 계산
  - 라인 135-176: 드롭 이벤트 처리
  - 라인 179-211: 기둥 드롭 처리
  - 라인 214-245: 가벽 드롭 처리
  - 라인 296-425: Three.js 씬 구성

### Three.js 캔버스
- **`/src/editor/shared/viewer3d/components/base/ThreeCanvas.tsx`** - 캔버스 설정
  - 라인 54-61: 배경색 결정 (2D 흰색 고정)
  - 라인 140-143: 카메라 관리자
  - 라인 200-250: WebGL 컨텍스트 관리
  - 라인 300-450: 캔버스 렌더링

### 3D 컴포넌트 - 공간 요소
- **`/src/editor/shared/viewer3d/components/elements/Room.tsx`** - 룸 전체
- **`/src/editor/shared/viewer3d/components/elements/space/Floor.tsx`** - 바닥
- **`/src/editor/shared/viewer3d/components/elements/space/Walls.tsx`** - 벽면
- **`/src/editor/shared/viewer3d/components/elements/space/ColumnAsset.tsx`** - 기둥
- **`/src/editor/shared/viewer3d/components/elements/space/WallAsset.tsx`** - 가벽

### 3D 컴포넌트 - 가구
- **`/src/editor/shared/viewer3d/components/elements/furniture/PlacedFurniture.tsx`** - 배치된 가구 컨테이너
- **`/src/editor/shared/viewer3d/components/elements/furniture/PlacedFurnitureContainer.tsx`** - 가구 관리
- **`/src/editor/shared/viewer3d/components/elements/furniture/FurnitureItem.tsx`** - 개별 가구
- **`/src/editor/shared/viewer3d/components/elements/furniture/DraggableFurniture.tsx`** - 드래그 가능 가구

### 3D 가구 모듈 렌더러
- **`/src/editor/shared/viewer3d/components/modules/WardrobeModule.tsx`** - 옷장 3D
- **`/src/editor/shared/viewer3d/components/modules/KitchenModule.tsx`** - 주방 3D
- **`/src/editor/shared/viewer3d/components/modules/StorageModule.tsx`** - 수납 3D
- **`/src/editor/shared/viewer3d/components/modules/BathroomModule.tsx`** - 욕실 3D
- **`/src/editor/shared/viewer3d/components/modules/index.tsx`** - 모듈 인덱스

### 3D 재질 시스템
- **`/src/editor/shared/viewer3d/utils/materials/MaterialFactory.ts`** - 재질 생성
- **`/src/editor/shared/viewer3d/utils/materials/TextureLoader.ts`** - 텍스처 로더
- **`/src/editor/shared/viewer3d/utils/materials/materialCache.ts`** - 재질 캐시
- **`/src/editor/shared/viewer3d/utils/materials/index.ts`** - 재질 유틸

### 3D 유틸리티
- **`/src/editor/shared/viewer3d/components/base/utils/threeUtils.ts`** - Three.js 유틸
  - `mmToThreeUnits()` - 밀리미터를 Three.js 단위로
  - `threeUnitsToMm()` - Three.js 단위를 밀리미터로
  - `calculateOptimalDistance()` - 최적 카메라 거리

### 3D 훅
- **`/src/editor/shared/viewer3d/components/base/hooks/useCameraManager.ts`** - 카메라 관리
- **`/src/editor/shared/viewer3d/components/base/hooks/useCanvasEventHandlers.ts`** - 캔버스 이벤트
- **`/src/editor/shared/viewer3d/components/base/hooks/useOrbitControlsConfig.ts`** - 궤도 컨트롤
- **`/src/editor/shared/viewer3d/components/base/hooks/useCustomZoom.ts`** - 줌 컨트롤

## 🪑 가구 시스템

### 가구 데이터 정의
- **`/src/data/modules/wardrobe.ts`** - 옷장 모듈 데이터
- **`/src/data/modules/kitchen.ts`** - 주방 모듈 데이터
- **`/src/data/modules/storage.ts`** - 수납 모듈 데이터
- **`/src/data/modules/bathroom.ts`** - 욕실 모듈 데이터
- **`/src/data/modules/index.ts`** - 모든 모듈 통합
- **`/src/data/modules/types.ts`** - 모듈 타입 정의

### 가구 비즈니스 로직
- **`/src/editor/shared/furniture/hooks/useFurnitureDragDrop.ts`** - 드래그앤드롭
- **`/src/editor/shared/furniture/hooks/useFurnitureInteraction.ts`** - 상호작용
- **`/src/editor/shared/furniture/hooks/useFurnitureSelection.ts`** - 선택
- **`/src/editor/shared/furniture/hooks/useBaseFurniture.ts`** - 기본 가구 로직
- **`/src/editor/shared/furniture/hooks/index.ts`** - 훅 인덱스

### 가구 프로바이더
- **`/src/editor/shared/furniture/providers/FurnitureDragDropProvider.tsx`** - 드래그앤드롭
- **`/src/editor/shared/furniture/providers/FurnitureSelectionProvider.tsx`** - 선택
- **`/src/editor/shared/furniture/providers/FurnitureViewModeProvider.tsx`** - 뷰 모드
- **`/src/editor/shared/furniture/providers/withFurnitureSpaceAdapter.tsx`** - 공간 적응 HOC
- **`/src/editor/shared/furniture/providers/index.tsx`** - 프로바이더 통합

### 가구 타입 정의
- **`/src/editor/shared/furniture/types.ts`** - 가구 관련 타입
- **`/src/editor/shared/furniture/utils.ts`** - 가구 유틸리티

## 🏗️ 공간 계산 및 충돌 처리

### 인덱싱 시스템 (4개 전문 클래스)
- **`/src/editor/shared/utils/indexing/SpaceCalculator.ts`** - 공간 계산
  - `calculateInnerDimensions()` - 내부 치수 계산
  - `calculateAvailableSlots()` - 슬롯 계산
  - `getSlotPosition()` - 슬롯 위치

- **`/src/editor/shared/utils/indexing/ColumnIndexer.ts`** - 기둥 인덱싱
  - `getColumnsInRange()` - 범위 내 기둥 찾기
  - `isColumnInRange()` - 기둥 범위 확인
  - `sortColumnsByPosition()` - 기둥 정렬

- **`/src/editor/shared/utils/indexing/FurniturePositioner.ts`** - 가구 위치
  - `calculateFurniturePosition()` - 가구 위치 계산
  - `getFurnitureSlotRange()` - 가구 슬롯 범위
  - `adjustPositionForColumns()` - 기둥 회피 위치

- **`/src/editor/shared/utils/indexing/FurnitureSpaceAdapter.ts`** - 가구 적응
  - `adaptFurnitureToSpace()` - 공간 변경 적응
  - `checkColumnCollisions()` - 기둥 충돌 확인
  - `adjustFurnitureForColumns()` - 기둥 충돌 시 크기 조정
  - `validateFurniturePlacement()` - 배치 유효성 검사

- **`/src/editor/shared/utils/indexing/index.ts`** - 통합 인터페이스
  - `calculateSpaceIndexing()` - 전체 인덱싱 계산

## 🎛️ 컨트롤 시스템

### 공간 컨트롤
- **`/src/editor/shared/controls/space/SpaceDimensionControl.tsx`** - 공간 크기
- **`/src/editor/shared/controls/space/SpaceDimensionControl.module.css`** - 스타일
- **`/src/editor/shared/controls/space/FloorFinishControl.tsx`** - 바닥 마감
- **`/src/editor/shared/controls/space/WallControl.tsx`** - 벽면 설정
- **`/src/editor/shared/controls/space/index.ts`** - 공간 컨트롤 인덱스

### 가구 컨트롤
- **`/src/editor/shared/controls/furniture/ModuleGallery.tsx`** - 가구 갤러리
- **`/src/editor/shared/controls/furniture/ModuleGallery.module.css`** - 갤러리 스타일
- **`/src/editor/shared/controls/furniture/PlacedModulesList.tsx`** - 배치된 가구 목록
- **`/src/editor/shared/controls/furniture/FurnitureControls.tsx`** - 가구 제어
- **`/src/editor/shared/controls/furniture/index.ts`** - 가구 컨트롤 인덱스

### 스타일링 컨트롤
- **`/src/editor/shared/controls/styling/MaterialControl.tsx`** - 재질 선택
- **`/src/editor/shared/controls/styling/MaterialControl.module.css`** - 재질 스타일
- **`/src/editor/shared/controls/styling/ColorPicker.tsx`** - 색상 선택
- **`/src/editor/shared/controls/styling/TextureSelector.tsx`** - 텍스처 선택
- **`/src/editor/shared/controls/styling/index.ts`** - 스타일링 인덱스

### 컨트롤 인덱스
- **`/src/editor/shared/controls/index.ts`** - 모든 컨트롤 통합

## 🎨 테마 시스템

### 테마 관리
- **`/src/contexts/ThemeContext.tsx`** - 테마 컨텍스트
  - 라인 20-100: `themes` 객체 (모든 테마 정의)
  - 라인 150-200: `applyTheme()` - 테마 적용
  - 라인 250-300: `setTheme()` - 테마 변경
  - 라인 350-400: localStorage 저장/로드

### 테마 스타일
- **`/src/styles/theme.css`** - CSS 변수 정의
  - `:root` - 라이트 모드 변수
  - `:root[data-theme="dark"]` - 다크 모드 변수
  - 색상 변수: `--theme-primary`, `--theme-background`, `--theme-text` 등

### 테마 UI
- **`/src/components/common/SettingsModal.tsx`** - 설정 모달
- **`/src/components/common/SettingsModal.module.css`** - 설정 스타일

## 📸 썸네일 시스템

### 썸네일 생성
- **`/src/utils/thumbnailGenerator.ts`** - 3D 썸네일 생성
  - 라인 8-32: `ThumbnailGenerator` 클래스
  - 라인 36-81: `generateThumbnail()` - 썸네일 생성
  - 라인 108-197: `createRoomModel()` - 룸 모델
  - 라인 201-227: `createFurnitureModels()` - 가구 모델
  - 라인 231-280: `generateFallbackThumbnail()` - 폴백 썸네일

### 썸네일 캡처
- **`/src/editor/shared/utils/thumbnailCapture.ts`** - 캔버스 캡처
  - 라인 7-37: `find3DViewerContainer()` - 3D 뷰어 찾기
  - 라인 40-53: `findThreeCanvas()` - 캔버스 찾기
  - 라인 56-100: `captureCanvasThumbnail()` - 캔버스 캡처
  - 라인 105-177: `captureFrontViewThumbnail()` - 정면뷰 캡처
  - 라인 180-234: `captureProjectThumbnail()` - 프로젝트 썸네일

### 썸네일 컴포넌트
- **`/src/components/common/ThumbnailImage.tsx`** - 썸네일 이미지
- **`/src/editor/shared/utils/thumbnailUtils.ts`** - 썸네일 유틸

## 🎯 헤더 및 네비게이션

### 헤더 컴포넌트
- **`/src/editor/Configurator/components/Header.tsx`** - 메인 헤더
  - 라인 50-150: 파일 드롭다운 메뉴
  - 라인 200-250: 저장 버튼 로직
  - 라인 300-350: 미리보기 버튼
  - 라인 400-450: DXF 내보내기

- **`/src/editor/Configurator/components/Header.module.css`** - 헤더 스타일
- **`/src/components/layout/Header.tsx`** - 대시보드 헤더

### 모달 컴포넌트
- **`/src/components/common/Modal/index.tsx`** - 기본 모달
- **`/src/components/common/Modal/style.module.css`** - 모달 스타일
- **`/src/components/common/ProjectViewerModal.tsx`** - 3D 뷰어 모달
- **`/src/components/common/ProjectViewerModal.module.css`** - 뷰어 모달 스타일
- **`/src/editor/Configurator/components/HelpModal.tsx`** - 도움말 모달
- **`/src/editor/Configurator/components/HelpModal.module.css`** - 도움말 스타일

## 📤 내보내기 기능

### DXF 생성
- **`/src/editor/shared/utils/dxfGenerator.ts`** - DXF 파일 생성
  - 라인 50-200: `generateDXF()` - DXF 생성
  - 라인 250-400: `drawFurniture()` - 가구 그리기
  - 라인 450-600: `drawDimensions()` - 치수 그리기

### 파일 다운로드
- **`/src/editor/shared/utils/fileUtils.ts`** - 파일 유틸
- **`/src/editor/shared/utils/exportUtils.ts`** - 내보내기 유틸

## 🔄 실시간 업데이트

### BroadcastChannel
- **`/src/editor/Configurator/index.tsx`** - 라인 200-220
  - 탭 간 통신
  - 프로젝트 업데이트 알림

### Firebase 실시간
- **`/src/firebase/realtime.ts`** - 실시간 리스너
- **`/src/firebase/collaboration.ts`** - 협업 기능

## 🧪 테스트 파일

### 스토어 테스트
- **`/src/store/__tests__/projectStore.test.ts`**
- **`/src/store/__tests__/spaceConfigStore.test.ts`**
- **`/src/store/__tests__/furnitureStore.test.ts`**
- **`/src/store/__tests__/derivedSpaceStore.test.ts`**

### 유틸 테스트
- **`/src/editor/shared/utils/__tests__/indexing.test.ts`**
- **`/src/editor/shared/utils/__tests__/dxfGenerator.test.ts`**

### 테스트 설정
- **`/src/test/setup.ts`** - 테스트 환경 설정
- **`/src/test/mocks/`** - 목업 데이터

## ⚙️ 설정 파일

### 빌드 도구
- **`/vite.config.ts`** - Vite 설정
- **`/tsconfig.json`** - TypeScript 설정
- **`/tsconfig.node.json`** - Node TypeScript 설정

### 코드 품질
- **`/eslint.config.js`** - ESLint 설정
- **`/.prettierrc`** - Prettier 설정

### 패키지 관리
- **`/package.json`** - 프로젝트 정보 및 의존성
- **`/package-lock.json`** - 의존성 락 파일

### 배포
- **`/netlify.toml`** - Netlify 배포 설정
- **`/public/_redirects`** - SPA 리다이렉트
- **`/vercel.json`** - Vercel 배포 설정

### Git
- **`/.gitignore`** - Git 무시 파일
- **`/.git/`** - Git 저장소

### 환경 변수
- **`/.env`** - 환경 변수 (Git 무시됨)
- **`/.env.example`** - 환경 변수 예시

## 📁 정적 파일

### 이미지
- **`/public/images/`** - 이미지 폴더
- **`/public/images/furniture-thumbnails/`** - 가구 썸네일
- **`/public/favicon.ico`** - 파비콘

### 폰트
- **`/public/fonts/`** - 커스텀 폰트

## 🔍 유틸리티 파일

### 공통 유틸
- **`/src/utils/`** - 공통 유틸리티
- **`/src/utils/constants.ts`** - 상수 정의
- **`/src/utils/helpers.ts`** - 헬퍼 함수
- **`/src/utils/validators.ts`** - 유효성 검사

### 에디터 유틸
- **`/src/editor/shared/utils/`** - 에디터 전용 유틸
- **`/src/editor/shared/utils/geometryUtils.ts`** - 기하학 계산
- **`/src/editor/shared/utils/mathUtils.ts`** - 수학 계산

## 📱 반응형 및 모바일

### 반응형 스타일
- **`/src/styles/responsive.css`** - 반응형 미디어 쿼리
- **`/src/styles/global.css`** - 전역 스타일

### 모바일 최적화
- **`/src/hooks/useResponsive.ts`** - 반응형 훅
- **`/src/hooks/useMobile.ts`** - 모바일 감지

## 🎯 컨텍스트 및 프로바이더

### 컨텍스트
- **`/src/contexts/`** - 모든 컨텍스트
- **`/src/contexts/ThemeContext.tsx`** - 테마
- **`/src/contexts/AuthProvider.tsx`** - 인증
- **`/src/contexts/ConfiguratorContext.tsx`** - 에디터 설정

## 🛠️ 개발 도구

### 스크립트
- **`npm run dev`** - 개발 서버
- **`npm run build`** - 프로덕션 빌드
- **`npm run preview`** - 빌드 미리보기
- **`npm run test`** - 테스트 실행
- **`npm run lint`** - 린트 검사
- **`npm run typecheck`** - 타입 검사

### 디버깅
- **브라우저 개발자 도구** - F12
- **React DevTools** - React 컴포넌트 검사
- **Redux DevTools** - 상태 관리 디버깅

## 📍 자주 찾는 기능 위치

1. **"로그인 버튼이 어디야?"** 
   - UI: `/src/components/common/LoginModal.tsx`
   - 로직: `/src/firebase/auth.ts`

2. **"프로젝트 만들기 버튼?"**
   - `/src/pages/SimpleDashboard.tsx` 라인 299

3. **"가구 드래그 안 돼요"**
   - `/src/editor/shared/furniture/hooks/useFurnitureDragDrop.ts`

4. **"기둥 넣으면 가구가 줄어들어요"**
   - `/src/editor/shared/utils/indexing/FurnitureSpaceAdapter.ts`

5. **"색상 바꾸는 곳?"**
   - UI: `/src/editor/shared/controls/styling/MaterialControl.tsx`
   - 상태: `/src/store/core/spaceConfigStore.ts`

6. **"3D가 안 보여요"**
   - `/src/editor/shared/viewer3d/Space3DView.tsx`

7. **"저장이 안 돼요"**
   - `/src/firebase/projects.ts` 라인 226

8. **"다크모드 토글?"**
   - `/src/components/common/SettingsModal.tsx`

9. **"폴더 만들기?"**
   - `/src/pages/SimpleDashboard.tsx` 라인 1500

10. **"썸네일이 안 나와요"**
    - `/src/components/common/ThumbnailImage.tsx`
    - `/src/utils/thumbnailGenerator.ts`

이 문서는 프로젝트의 모든 파일 위치를 완벽하게 정리한 것입니다. 
어떤 기능이든 이 문서에서 찾을 수 있습니다!