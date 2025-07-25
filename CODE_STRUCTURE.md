# 🏗️ 가구 편집기 코드맵 - 파일별 기능 정리

## 📁 메인 애플리케이션 구조

### 🎯 핵심 진입점
- **`src/App.tsx`** - 메인 애플리케이션 라우팅 및 WebGL 메모리 관리
- **`src/main.tsx`** - 애플리케이션 부트스트랩 엔트리포인트
- **`src/editor/Step0/index.tsx`** - 초기 프로젝트 정보 입력 단계
- **`src/editor/Configurator/index.tsx`** - 메인 가구 디자인 인터페이스

## 🗄️ 상태 관리 (Zustand 기반)

### 핵심 스토어
- **`src/store/core/projectStore.ts`** - 프로젝트 기본 정보 관리
- **`src/store/core/spaceConfigStore.ts`** - 공간 설정 (치수, 재질, 기둥 등)
- **`src/store/core/furnitureStore.ts`** - 배치된 가구 모듈 관리
- **`src/store/derivedSpaceStore.ts`** - 공간 설정으로부터 계산된 값들
- **`src/store/uiStore.ts`** - UI 상태 (뷰 모드, 선택 상태 등)

## 🎨 3D 시각화 시스템

### 메인 뷰어 컴포넌트
- **`src/editor/shared/viewer3d/Space3DView.tsx`** - 메인 3D 뷰어 (2D/3D 전환 가능)
- **`src/editor/shared/viewer3d/components/base/ThreeCanvas.tsx`** - Three.js 캔버스 설정 및 관리
- **`src/editor/shared/viewer3d/components/base/hooks/`** - 카메라 및 캔버스 관리 훅들

### 3D 씬 요소들
- **`src/editor/shared/viewer3d/components/elements/`** - 3D 씬의 기본 요소들 (룸, 가구, 조명)
- **`src/editor/shared/viewer3d/components/modules/`** - 가구별 3D 렌더링 컴포넌트
- **`src/editor/shared/viewer3d/utils/materials/`** - 재질 및 텍스처 시스템

## 🎛️ 제어 시스템

### 통합 컨트롤 컴포넌트
- **`src/editor/shared/controls/`** - 중앙화된 제어 컴포넌트들
- **`src/editor/shared/controls/space/`** - 공간 치수 조절 컨트롤
- **`src/editor/shared/controls/furniture/`** - 가구 라이브러리 및 배치
- **`src/editor/shared/controls/styling/`** - 재질 및 색상 제어

## 🪑 가구 시스템

### 가구 데이터 및 비즈니스 로직
- **`src/data/modules/`** - 가구 모듈 정의 및 데이터
- **`src/editor/shared/furniture/hooks/`** - 가구 상호작용 로직 (드래그&드롭, 공간 적응)
- **`src/editor/shared/furniture/providers/`** - 가구 관리 프로바이더들
- **`src/editor/shared/furniture/providers/withFurnitureSpaceAdapter.tsx`** - 공간 변경 대응 HOC

## 🧮 비즈니스 로직 및 계산

### 공간 계산 시스템 (4개 전문 클래스로 분리)
- **`src/editor/shared/utils/indexing/SpaceCalculator.ts`** - 공간 계산 전담
- **`src/editor/shared/utils/indexing/ColumnIndexer.ts`** - 기둥 인덱싱 전담
- **`src/editor/shared/utils/indexing/FurniturePositioner.ts`** - 가구 위치 계산 전담
- **`src/editor/shared/utils/indexing/FurnitureSpaceAdapter.ts`** - 가구-공간 적응 전담
- **`src/editor/shared/utils/indexing/index.ts`** - 통합 인터페이스 (하위 호환성)

### 유틸리티
- **`src/editor/shared/utils/dxfGenerator.ts`** - DXF 기술도면 내보내기
- **`src/editor/shared/utils/thumbnailCapture.ts`** - 3D 화면 썸네일 캡처

## 🔥 Firebase 데이터 계층

### 데이터베이스 연동
- **`src/firebase/config.ts`** - Firebase 설정
- **`src/firebase/auth.ts`** - 사용자 인증
- **`src/firebase/projects.ts`** - 프로젝트 CRUD 작업
- **`src/firebase/types.ts`** - Firebase 데이터 타입 정의

### 새로운 협업 기능
- **`src/firebase/teams.ts`** - 팀 관리
- **`src/firebase/sharing.ts`** - 프로젝트 공유
- **`src/firebase/userProfiles.ts`** - 사용자 프로필
- **`src/firebase/bookmarks.ts`** - 북마크 기능

## 📱 대시보드 및 UI

### 메인 대시보드
- **`src/pages/SimpleDashboard.tsx`** - 통합 프로젝트 관리 대시보드
- **`src/components/common/ProjectViewerModal.tsx`** - 3D 미리보기 팝업 모달

### 공통 UI 컴포넌트
- **`src/components/common/ThumbnailImage.tsx`** - 디자인 썸네일 렌더링
- **`src/utils/thumbnailGenerator.ts`** - 3D 썸네일 생성 엔진
- **`src/components/common/Modal/`** - 기본 모달 컴포넌트

## 🎨 테마 및 스타일링

### 테마 시스템
- **`src/styles/theme.css`** - CSS 커스텀 속성 정의 (다크모드 포함)
- **`src/contexts/ThemeContext.tsx`** - 테마 상태 관리 컨텍스트
- **`*.module.css`** - CSS 모듈 방식 스타일링

## ⚙️ 설정 및 빌드

### 개발 환경
- **`vite.config.ts`** - Vite 빌드 설정 (청크 분할 포함)
- **`tsconfig.json`** - TypeScript 설정
- **`eslint.config.js`** - ESLint 코드 품질 설정

### 배포 설정
- **`netlify.toml`** - Netlify 배포 설정
- **`public/_redirects`** - SPA 라우팅 리다이렉트

## 🧪 테스트

### 테스트 파일들
- **`src/store/__tests__/`** - 스토어 단위 테스트
- **`src/editor/shared/utils/__tests__/`** - 유틸리티 단위 테스트
- **`src/test/setup.ts`** - 테스트 환경 설정

## 📊 현재 작업 중인 기능

### 썸네일 시스템
- **문제**: 디자인 카드에서 3D 썸네일이 표시되지 않음
- **관련 파일**: `ThumbnailImage.tsx`, `thumbnailGenerator.ts`, `SimpleDashboard.tsx`
- **상태**: 디자인 파일 매칭은 성공했지만 썸네일 생성 실패

### 주요 아키텍처 특징
1. **클린 아키텍처**: 비즈니스 로직을 4개 전문 클래스로 분리
2. **모듈러 설계**: 컴포넌트별 책임 분리 및 재사용성
3. **상태 관리**: Zustand 기반 타입세이프 전역 상태
4. **3D 렌더링**: Three.js + React Three Fiber 통합
5. **실시간 협업**: Firebase 기반 다중 사용자 지원

## 🔍 주요 기능 파일 경로 가이드

### 🔐 로그인/인증 시스템
- **로그인 UI**: `src/components/common/LoginModal.tsx`
- **인증 로직**: `src/firebase/auth.ts`
- **인증 상태 관리**: `src/contexts/AuthProvider.tsx`
- **로그아웃 버튼**: `src/components/layout/Header.tsx`

### 📊 대시보드
- **메인 대시보드 페이지**: `src/pages/SimpleDashboard.tsx`
- **대시보드 스타일**: `src/pages/SimpleDashboard.module.css`
- **프로젝트 카드 컴포넌트**: `src/pages/SimpleDashboard.tsx` (내부 컴포넌트)
- **폴더 구조**: `src/pages/SimpleDashboard.tsx` (folders 상태)

### 💾 대시보드 데이터 저장/관리
- **프로젝트 데이터 저장**: `src/firebase/projects.ts`
  - `createProject()` - 새 프로젝트 생성
  - `updateProject()` - 프로젝트 업데이트
  - `deleteProject()` - 프로젝트 삭제
  - `getUserProjects()` - 사용자 프로젝트 목록
- **디자인 파일 저장**: `src/firebase/projects.ts`
  - `createDesignFile()` - 디자인 파일 생성
  - `updateDesignFile()` - 디자인 파일 업데이트
  - `getDesignFiles()` - 디자인 파일 목록
- **폴더 데이터**: `src/firebase/projects.ts`
  - `saveFolderData()` - 폴더 구조 저장
  - `loadFolderData()` - 폴더 구조 불러오기

### 🎨 테마 색상 관리
- **테마 컨텍스트**: `src/contexts/ThemeContext.tsx`
- **테마 CSS 변수**: `src/styles/theme.css`
- **테마 선택 UI**: `src/components/common/SettingsModal.tsx`
- **테마 적용 로직**: `src/contexts/ThemeContext.tsx` (`applyTheme()`)
- **사용 가능한 테마들**: `src/contexts/ThemeContext.tsx` (`themes` 객체)

### 🪑 가구 모듈
- **가구 데이터 정의**: `src/data/modules/`
  - `wardrobe.ts` - 옷장 모듈
  - `kitchen.ts` - 주방 모듈
  - `storage.ts` - 수납 모듈
  - `bathroom.ts` - 욕실 모듈
- **가구 3D 렌더링**: `src/editor/shared/viewer3d/components/modules/`
  - `WardrobeModule.tsx` - 옷장 3D 컴포넌트
  - `KitchenModule.tsx` - 주방 3D 컴포넌트
- **가구 갤러리 UI**: `src/editor/shared/controls/furniture/ModuleGallery.tsx`
- **가구 상태 관리**: `src/store/core/furnitureStore.ts`

### 🏗️ 기둥-가구 충돌 처리 (가구 크기 조정)
- **메인 로직**: `src/editor/shared/furniture/providers/withFurnitureSpaceAdapter.tsx`
  - `adaptFurnitureToSpace()` - 공간 변경 시 가구 적응
- **충돌 감지**: `src/editor/shared/utils/indexing/FurnitureSpaceAdapter.ts`
  - `checkColumnCollisions()` - 기둥과 가구 충돌 확인
  - `adjustFurnitureForColumns()` - 기둥 충돌 시 가구 크기 조정
- **가구 위치 계산**: `src/editor/shared/utils/indexing/FurniturePositioner.ts`
  - `calculateFurniturePosition()` - 가구 위치 계산
- **기둥 인덱싱**: `src/editor/shared/utils/indexing/ColumnIndexer.ts`
  - `getColumnsInRange()` - 특정 범위 내 기둥 찾기

### 📐 공간 설정
- **공간 크기 조절 UI**: `src/editor/shared/controls/space/SpaceDimensionControl.tsx`
- **공간 상태 관리**: `src/store/core/spaceConfigStore.ts`
- **공간 계산 로직**: `src/editor/shared/utils/indexing/SpaceCalculator.ts`

### 🎯 3D 뷰어
- **메인 3D 뷰어**: `src/editor/shared/viewer3d/Space3DView.tsx`
- **카메라 관리**: `src/editor/shared/viewer3d/components/base/hooks/useCameraManager.ts`
- **조명 설정**: `src/editor/shared/viewer3d/Space3DView.tsx` (라인 310-345)
- **2D/3D 전환**: `src/store/uiStore.ts` (`viewMode` 상태)

### 📸 썸네일 시스템
- **썸네일 컴포넌트**: `src/components/common/ThumbnailImage.tsx`
- **3D 썸네일 생성**: `src/utils/thumbnailGenerator.ts`
- **캔버스 캡처**: `src/editor/shared/utils/thumbnailCapture.ts`
- **프로젝트 카드 썸네일**: `src/pages/SimpleDashboard.tsx` (라인 2343-2375)

### 🔄 실시간 업데이트
- **BroadcastChannel**: `src/editor/Configurator/index.tsx` (라인 200-220)
- **Firebase 실시간 리스너**: `src/firebase/realtime.ts`
- **윈도우 포커스 새로고침**: `src/pages/SimpleDashboard.tsx` (라인 273-286)

### 📤 내보내기 기능
- **DXF 내보내기**: `src/editor/shared/utils/dxfGenerator.ts`
- **프로젝트 저장**: `src/editor/Configurator/components/Header.tsx` (저장 버튼)

### 🎛️ 헤더/네비게이션
- **헤더 컴포넌트**: `src/editor/Configurator/components/Header.tsx`
- **파일 드롭다운**: `src/editor/Configurator/components/Header.tsx` (라인 100-200)
- **헤더 스타일**: `src/editor/Configurator/components/Header.module.css`

### 🔧 개발/디버깅
- **개발 서버 실행**: `npm run dev`
- **빌드**: `npm run build`
- **타입 체크**: `npm run typecheck`
- **린트**: `npm run lint`

### 자주 묻는 위치들
1. **"프로젝트 생성 버튼 어디?"**: `src/pages/SimpleDashboard.tsx` (createNewProject 함수)
2. **"가구 드래그앤드롭 로직?"**: `src/editor/shared/furniture/hooks/useFurnitureDragDrop.ts`
3. **"다크모드 토글?"**: `src/components/common/SettingsModal.tsx`
4. **"프로젝트 이름 변경?"**: `src/pages/SimpleDashboard.tsx` (handleProjectEdit 함수)
5. **"3D 모델 색상 변경?"**: `src/editor/shared/controls/styling/MaterialControl.tsx`

이 구조는 대규모 3D 가구 편집기의 복잡성을 체계적으로 관리하면서도 확장 가능한 아키텍처를 제공합니다.