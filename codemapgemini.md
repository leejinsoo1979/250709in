# 💎 가구 에디터 코드맵 (Gemini 최종 심층 분석)

이 문서는 프로젝트의 **모든 소스 코드**를 기반으로 작성된 최종 분석 문서입니다. 코드의 구조, 데이터 흐름, 아키텍처의 문제점을 심층적으로 분석하고, 이를 해결하기 위한 구체적이고 실행 가능한 로드맵을 제시합니다.

## 1. 🌟 Executive Summary (요약)

- **프로젝트:** 웹 기반 3D 가구 디자인 및 시각화 애플리케이션.
- **기술 스택:** React, TypeScript, Vite, Three.js (@react-three/fiber), Zustand, Firebase.
- **핵심 아키텍처:** 컴포넌트 기반 UI, 중앙 집중식 상태 관리(Zustand), Firebase 백엔드 연동.
- **주요 강점:**
    - **반응성:** Zustand와 최적화된 3D 렌더링으로 사용자 입력에 따른 실시간 시각적 피드백이 빠름.
    - **상태-파생 상태 분리:** `useSpaceConfigStore` (원본 데이터)와 `useDerivedSpaceStore` (계산된 데이터)의 분리는 성능 최적화의 훌륭한 패턴.
    - **모듈화된 3D 뷰어:** `viewer3d` 디렉토리 내의 컴포넌트와 유틸리티는 비교적 잘 분리되어 있음.
- **🚨 핵심 도전 과제:**
    - **거대 컴포넌트 (God Component):** `src/editor/Configurator/index.tsx`가 애플리케이션의 거의 모든 로직을 처리하여 유지보수성과 확장성을 심각하게 저해.
    - **혼재된 책임:** 상태 저장소(`useFurnitureStore`)와 컴포넌트 내에 데이터 로직, UI 로직, 비즈니스 로직, 서버 통신 로직이 명확한 경계 없이 섞여 있음.
    - **암묵적 데이터 흐름:** 여러 스토어와 컴포넌트 `useState`에 상태가 분산되어 있어, 데이터의 최종 소유자(Source of Truth)를 파악하기 어렵고 예측 불가능한 사이드 이펙트를 유발할 수 있음.

## 2. 🏛️ 아키텍처 심층 분석 (Layered View)

애플리케이션을 논리적 계층으로 나누어 분석하면 문제점을 더 명확히 파악할 수 있습니다.

```mermaid
graph TD
    subgraph User Interface (View Layer)
        direction LR
        A1[Configurator.tsx]
        A2[Header.tsx]
        A3[Sidebar.tsx]
        A4[RightPanel.tsx]
        A5[Space3DView.tsx]
        A6[...other UI components]
    end

    subgraph State & Business Logic Layer
        direction LR
        B1[Zustand Stores]
        B2[Custom Hooks]
        B3["Logic inside Configurator.tsx (🚨 PROBLEM)"]
    end

    subgraph Data Layer
        direction LR
        C1[Module Definitions
(src/data/modules)]
        C2[Firebase SDK Wrappers
(src/firebase)]
    end

    subgraph Backend Services
        direction LR
        D1[Firebase Auth]
        D2[Firestore Database]
        D3[Firebase Storage]
    end

    A1 --> B1 & B2 & B3
    A2 & A3 & A4 & A5 --> A1
    B3 --> C1 & C2
    C2 --> D1 & D2 & D3
```

- **문제의 핵심:** **State & Business Logic Layer**가 `Configurator.tsx`라는 View Layer의 특정 파일에 강하게 결합되어 있습니다. 이상적으로는 이 계층은 UI와 독립적이어야 합니다.

## 3. 🗺️ 전체 소스코드 상세 분석 (`src` 디렉토리)

모든 파일을 기반으로 각 디렉토리와 파일의 역할, 책임, 문제점을 상세히 기술합니다.

### 3.1. `main.tsx` & `App.tsx`
- **역할:** 앱 진입점 및 최상위 설정.
- **`App.tsx`:**
    - **라우팅:** `react-router-dom`으로 페이지 경로 설정.
    - **전역 Provider:** `ErrorBoundary`, `ThemeProvider`, `AuthProvider`를 제공하여 하위 모든 컴포넌트가 해당 기능에 접근할 수 있도록 함.
    - **메모리 관리:** `disposeWebGLCanvases` 함수를 통해 페이지 이동 시 WebGL 컨텍스트를 정리하려는 시도는 좋으나, React 18의 `StrictMode`나 Fast Refresh 환경에서는 예기치 않게 동작할 수 있어 주의가 필요.

### 3.2. `store/` - 중앙 상태 관리 허브
- **역할:** Zustand를 사용하여 애플리케이션의 전역 상태를 관리.
- **`core/`:**
    - **`projectStore.ts`:** 프로젝트의 메타 정보(제목, 위치) 관리.
    - **`spaceConfigStore.ts`:** **가장 중요한 원본 데이터 저장소.** 공간의 물리적 속성(너비, 높이, 프레임, 받침대, 기둥 등)을 모두 담고 있음.
    - **`furnitureStore.ts`:**
        - **현재 책임:** 배치된 가구 목록(`placedModules`) + 가구 라이브러리 선택 상태 + 가구 편집/드래그 UI 상태.
        - **🚨 문제:** 데이터와 UI 상태의 책임이 혼재되어 있음.
- **`uiStore.ts`:** 뷰 모드, 팝업, 문 열림 등 순수 UI 상태 관리. `persist`를 통해 사용자 편의성 관련 설정을 유지하는 역할은 훌륭함.
- **`derivedSpaceStore.ts`:**
    - **역할:** `spaceConfigStore`의 원본 데이터를 입력받아, 렌더링과 로직에 실제 사용될 값들(내부 공간 크기, 컬럼 너비/위치 등)을 **계산 후 캐싱**.
    - **중요성:** 이 스토어 덕분에 복잡한 계산이 반복적으로 실행되는 것을 막아 **성능을 최적화**하는 핵심적인 역할을 함.

### 3.3. `firebase/` - 백엔드 통신 계층
- **역할:** Firebase 서비스(Auth, Firestore)와의 통신을 담당하는 함수들을 모아놓은 모듈. 일종의 경량 SDK 역할을 함.
- **`projects.ts`:** Firestore의 `projects` 컬렉션에 대한 CRUD(Create, Read, Update, Delete) 로직이 모두 포함. `getProject`, `updateProject`, `createProject` 등이 핵심 함수.
- **`auth.ts`, `userProfiles.ts` 등:** 각 Firebase 서비스에 맞춰 기능별로 파일이 잘 분리되어 있음.
- **🚨 문제:** `Configurator.tsx`에서 이 함수들을 직접 호출하고 있어, UI 컴포넌트가 데이터베이스 로직에 직접 의존하게 됨.

### 3.4. `editor/` - 핵심 에디터 로직
- **`Configurator/index.tsx`:**
    - **🚨 God Component:** 이 프로젝트의 아킬레스건.
    - **수행 역할:**
        1.  **UI 조립:** Header, Sidebar, Viewer, Panel 등 모든 UI 조각을 렌더링.
        2.  **상태 구독 및 전파:** 모든 Zustand 스토어를 구독하고, 여기서 얻은 상태와 액션을 수십 개의 하위 컴포넌트에 props로 전달 (Prop Drilling).
        3.  **서버 통신:** `firebase/projects.ts`를 직접 임포트하여 프로젝트 저장/로드/생성 로직 실행.
        4.  **비즈니스 로직:** 도어 개수 계산, 프레임 크기 업데이트 등 순수 계산 로직 포함.
        5.  **전역 이벤트 처리:** 키보드 단축키 이벤트 리스너 등록 및 처리.
- **`shared/`:** 에디터의 여러 부분에서 공유되는 로직 및 컴포넌트.
    - **`controls/`:** 공간 크기, 설치 타입, 재질 등 사용자가 값을 입력하고 제어하는 UI 컴포넌트들의 집합. 각 컴포넌트는 특정 상태(e.g., `spaceInfo`)를 받아 UI를 렌더링하고, 변경 시 상위(`Configurator`)로 콜백 함수를 호출하는 패턴을 따름.
    - **`furniture/`:** 가구와 관련된 훅(`useFurnitureSpaceAdapter`), 타입 정의(`types.ts`) 등이 위치.
    - **`viewer3d/`:** **가장 잘 분리된 모듈 중 하나.**
        - **`Space3DView.tsx`:** 3D 씬의 진입점.
        - **`components/`:** `Room`, `PlacedFurnitureContainer`, `BoxModule` 등 3D 객체를 React 컴포넌트로 추상화.
        - **`utils/`:** `geometry.ts` (좌표 계산), `MaterialFactory.ts` (재질 생성/캐싱) 등 3D 관련 순수 로직을 분리하여 컴포넌트의 복잡도를 낮춤.

### 3.5. `data/` - 정적 및 동적 데이터 정의
- **`modules/`:**
    - **역할:** 가구의 종류와 기본 명세를 정의.
    - **`index.ts`의 `generateDynamicModules`:** 이 프로젝트의 **핵심 데이터 생성 함수**. 공간의 `internalSpace` 값을 받아, 모든 가구 템플릿의 크기를 현재 공간에 맞게 동적으로 계산하여 반환. 이 함수 덕분에 에디터가 동적으로 반응할 수 있음.

## 4. 🌊 데이터 흐름 재분석 (End-to-End)

**시나리오: 사용자가 "프로젝트 저장" 버튼을 클릭**

1.  **UI Layer (`Header.tsx`):** 사용자가 저장 아이콘 버튼을 클릭. `onClick` 이벤트로 `Configurator`로부터 받은 `onSave` 함수를 호출.
2.  **God Component (`Configurator.tsx`):** `onSave` prop에 연결된 `saveProject` 함수가 실행됨.
3.  **로직 실행 (in `Configurator.tsx`):**
    - `setSaving(true)`로 UI 상태 변경.
    - `captureProjectThumbnail()`을 호출하여 3D 캔버스 썸네일 생성.
    - **Zustand 스토어에서 최신 상태 직접 가져오기:** `useProjectStore.getState()`, `useSpaceConfigStore.getState()` 등을 사용하여 현재 `basicInfo`, `spaceInfo`, `placedModules`를 가져옴.
    - `removeUndefinedValues` 헬퍼 함수로 Firebase와 호환되도록 데이터 정리.
4.  **Data Layer (`firebase/projects.ts`):**
    - `Configurator`가 `updateProject(projectId, data, thumbnail)` 함수를 직접 호출.
    - `updateProject` 함수는 `doc`, `updateDoc` 등 Firebase SDK 함수를 사용하여 정리된 데이터를 Firestore에 전송.
5.  **피드백 (Back to `Configurator.tsx`):**
    - `updateProject`의 Promise가 resolve되면, `setSaveStatus('success')`를 호출하여 UI에 성공 피드백(V 표시 등)을 표시.
    - `BroadcastChannel`을 통해 다른 탭(대시보드)에 변경 사항을 알림.

- **🚨 문제점:** UI 컴포넌트인 `Configurator`가 데이터 정제, 서버 전송, 상태 스냅샷 생성 등 너무 많은 역할을 수행. 이 로직은 별도의 훅이나 서비스 모듈로 분리되어야 테스트와 재사용이 용이해짐.

## 5. 🚀 최종 리팩토링 로드맵

**목표: `Configurator.tsx`의 코드를 200라인 미만으로 줄이고, 모든 로직을 각자의 위치로 옮기기**

### Phase 1: 긴급 수술 - God Component 분리 (1~3일)

1.  **`useProjectSync` 훅 생성:**
    - `Configurator`에 있는 `loadProject`, `saveProject`, `handleNewProject`, `handleSaveAs`, `handleProjectNameChange` 등 Firebase와 통신하는 모든 함수를 `src/hooks/useProjectSync.ts`로 옮긴다.
    - 이 훅은 필요한 Zustand 스토어를 직접 사용하고, `loading`, `saving`, `projectData` 같은 상태와 `save`, `load` 같은 함수를 반환한다.
    - `Configurator`는 이 훅을 호출하여 상태와 함수만 가져다 쓴다.

2.  **`useEditorUI` 훅 생성:**
    - `Configurator`의 `useState`로 관리되던 모든 UI 상태(사이드바/패널 열림 여부, 활성 탭 등)와 관련 핸들러 함수를 `src/hooks/useEditorUI.ts`로 옮긴다.
    - 키보드 이벤트 리스너 로직도 이 훅으로 이전한다.

3.  **`Configurator` 정리:**
    - 위 훅들을 사용하여 `Configurator`를 순수하게 UI 컴포넌트들을 **조립(compose)**하는 역할만 하도록 코드를 정리한다.

### Phase 2: 체질 개선 - 상태와 비즈니스 로직 분리 (3~5일)

1.  **Zustand 스토어 책임 재분배:**
    - `useFurnitureStore`에서 가구 선택/편집/드래그 관련 상태(`selected...Id`, `editMode`, `currentDragData`)를 `useUIStore`로 이전한다. `useFurnitureStore`는 순수 데이터(`placedModules`)만 다루게 한다.

2.  **서비스 계층 도입 (`src/services/`):**
    - **`SpaceCalculatorService.ts`:** `calculateDoorRange`, 프레임/받침대 관련 계산 등 순수 비즈니스 로직을 담는 클래스 또는 객체를 만든다. `useSpaceConfigStore`의 상태를 입력받아 계산 결과를 반환한다.
    - **`FurnitureValidationService.ts`:** `validateModuleForInternalSpace` 등 가구 배치 유효성 검사 로직을 이 서비스로 옮긴다.

### Phase 3: 미래를 위한 투자 - 아키텍처 고도화 (장기)

1.  **Context API 도입:** 전역 스토어에 두기에는 애매하고, props로 내리기에는 너무 깊어지는 상태(예: 현재 선택된 객체의 상세 정보)는 React Context를 활용하여 해당 기능 범위 내에서만 상태를 공유하도록 한다.
2.  **테스트 커버리지 확대:** 분리된 훅과 서비스는 입력과 출력이 명확하므로 `vitest`로 단위 테스트를 작성하기 매우 용이하다. 핵심 비즈니스 로직에 대한 테스트 코드를 작성하여 안정성을 높인다.
3.  **문서화:** Storybook을 도입하여 `controls`에 있는 UI 컴포넌트들을 시각적으로 문서화하고, `JSDoc`을 활용하여 훅과 서비스의 API를 문서화한다.

---
*이 문서는 프로젝트의 모든 소스 코드를 기반으로 2025년 7월 24일에 생성되었습니다.*