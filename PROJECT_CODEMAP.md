# 프로젝트 코드맵 - 가구 에디터 애플리케이션

## 📋 **프로젝트 개요**

이 프로젝트는 사용자가 3D 공간에서 맞춤형 가구 레이아웃을 디자인하고 시각화할 수 있는 정교한 React 기반 가구 에디터 애플리케이션입니다. 최신 웹 기술을 결합하여 실시간 3D 시각화와 함께 대화형 디자인 경험을 제공합니다.

### **기술 스택**
- **프론트엔드**: React 18, TypeScript, Vite
- **3D 그래픽**: Three.js, React Three Fiber
- **상태 관리**: Zustand
- **백엔드**: Firebase (인증, 저장소, 설정)
- **테스팅**: Vitest, Testing Library
- **스타일링**: CSS Modules
- **빌드 도구**: Vite (최적화된 청킹)

---

## 🏗️ **아키텍처 개요**

```
┌─────────────────────────────────────────────────────────────┐
│                    프레젠테이션 레이어                        │
├─────────────────────────────────────────────────────────────┤
│  React 컴포넌트  │  3D 뷰어  │  컨트롤  │  UI 스토어        │
├─────────────────────────────────────────────────────────────┤
│                     비즈니스 로직 레이어                      │
├─────────────────────────────────────────────────────────────┤
│  코어 스토어  │  파생 스토어  │  유틸/인덱싱  │ 훅           │
├─────────────────────────────────────────────────────────────┤
│                       데이터 레이어                          │
├─────────────────────────────────────────────────────────────┤
│   Firebase    │  모듈 데이터   │  재질 시스템 │ 타입        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 **디렉토리 구조**

```
src/
├── 📱 App.tsx                          # 라우팅 & WebGL 메모리 관리를 담당하는 메인 앱
├── 🚀 main.tsx                         # 애플리케이션 진입점
│
├── 📂 editor/                          # 메인 애플리케이션 모듈
│   ├── 📂 Step0/                       # 초기 프로젝트 설정 화면
│   │   └── index.tsx                   # 프로젝트 정보 입력
│   │
│   ├── 📂 Configurator/                # 메인 디자인 인터페이스
│   │   ├── index.tsx                   # 메인 구성기 컴포넌트
│   │   └── 📂 components/              # 구성기 UI 컴포넌트
│   │       ├── ViewerControls.tsx      # 2D/3D 뷰 컨트롤
│   │       ├── TabSelector.tsx         # 탭 네비게이션
│   │       └── *.module.css            # 컴포넌트 스타일
│   │
│   └── 📂 shared/                      # 공유 컴포넌트 & 시스템
│       ├── 📂 viewer3d/                # 3D 시각화 시스템
│       ├── 📂 controls/                # 중앙집중식 컨트롤 컴포넌트
│       ├── 📂 furniture/               # 가구 관리 로직
│       └── 📂 utils/                   # 비즈니스 로직 유틸리티
│
├── 📂 store/                           # 상태 관리 (Zustand)
│   ├── 📂 core/                        # 핵심 비즈니스 스토어
│   ├── derivedSpaceStore.ts            # 계산된 값 스토어
│   └── uiStore.ts                      # UI 상태 관리
│
├── 📂 data/                            # 정적 데이터 정의
│   └── 📂 modules/                     # 가구 모듈 정의
│
├── 📂 firebase/                        # 백엔드 통합
│   ├── auth.ts                         # 인증
│   ├── projects.ts                     # 프로젝트 영속성
│   └── config.ts                       # Firebase 설정
│
├── 📂 types/                           # TypeScript 타입 정의
└── 📂 test/                            # 테스트 설정
```

---

## 🗄️ **상태 관리 아키텍처**

### **스토어 계층 구조 및 관계**

```
코어 스토어 (독립적)
├── projectStore          # 기본 프로젝트 정보 (이름, ID 등)
├── spaceConfigStore      # 공간 치수, 재질, 도어
└── furnitureStore        # 배치된 가구 아이템

        ↓ (파생됨)

계산된 스토어
└── derivedSpaceStore     # 계산된 값들 (면적, 제약사항)

        ↓ (소비됨)

UI 스토어
└── uiStore              # 뷰 모드, 선택사항, 환경설정
```

### **주요 스토어 파일**
- `src/store/core/projectStore.ts` - 프로젝트 메타데이터 및 Firebase 통합
- `src/store/core/spaceConfigStore.ts` - 지속성을 가진 공간 구성
- `src/store/core/furnitureStore.ts` - 가구 배치 및 관리
- `src/store/derivedSpaceStore.ts` - 계산된 공간 계산값
- `src/store/uiStore.ts` - localStorage 지속성을 가진 UI 상태

---

## 🎮 **컴포넌트 아키텍처**

### **메인 애플리케이션 플로우**
```
App.tsx
├── Router
│   ├── /step0 → Step0/index.tsx
│   └── /configurator → Configurator/index.tsx
│       ├── ViewerControls
│       ├── TabSelector
│       ├── Space3DView (3D 시스템)
│       └── Control Components
```

### **3D 시각화 시스템**
```
Space3DView.tsx
├── ThreeCanvas.tsx                     # Three.js 설정 & 카메라 관리
│   ├── 📂 components/base/
│   │   ├── CameraController            # 2D/3D 카메라 전환
│   │   └── hooks/                      # 캔버스 & 카메라 훅
│   │
│   ├── 📂 components/elements/         # 씬 요소
│   │   ├── Room.tsx                    # 바닥, 벽, 그리드
│   │   ├── Door.tsx                    # 도어 표현
│   │   ├── Column.tsx                  # 구조 기둥
│   │   └── 📂 furniture/               # 인터랙티브 가구 객체
│   │
│   ├── 📂 components/modules/          # 가구 3D 모델
│   │   ├── Cabinet.tsx                 # 캐비닛 렌더링
│   │   ├── Desk.tsx                    # 책상 렌더링
│   │   └── [기타 모듈]
│   │
│   └── 📂 utils/                       # 3D 유틸리티
│       ├── 📂 materials/               # 재질 시스템
│       │   ├── MaterialFactory.ts     # 캐시된 재질 생성
│       │   └── [재질 타입]
│       └── positioning.ts              # 3D 위치 로직
```

### **컨트롤 시스템**
```
src/editor/shared/controls/
├── 📂 space/                           # 공간 구성 컨트롤
│   ├── DimensionControls.tsx
│   ├── DoorControls.tsx
│   └── MaterialControls.tsx
│
├── 📂 furniture/                       # 가구 관리
│   ├── FurnitureLibrary.tsx
│   ├── FurniturePlacement.tsx
│   └── FurnitureEditor.tsx
│
├── 📂 styling/                         # 외관 컨트롤
│   ├── ColorControls.tsx
│   └── MaterialSelector.tsx
│
└── index.ts                            # 중앙집중식 export
```

---

## ⚙️ **비즈니스 로직 모듈**

### **인덱싱 시스템 (모듈러 아키텍처)**
```
src/editor/shared/utils/indexing/
├── SpaceCalculator.ts                  # 면적 계산, 그리드 로직
├── ColumnIndexer.ts                    # 컬럼 위치 지정 & 제약사항
├── FurniturePositioner.ts              # 가구 배치 로직
├── FurnitureSpaceAdapter.ts            # 공간 변경 적응
└── index.ts                            # 호환성을 위한 재export
```

**주요 책임:**
- **SpaceCalculator**: 그리드 시스템, 면적 계산, 공간 메트릭
- **ColumnIndexer**: 컬럼 감지, 제약사항 매핑
- **FurniturePositioner**: 배치 검증, 위치 지정 알고리즘
- **FurnitureSpaceAdapter**: 공간 변경 시 가구 적응

### **중요 비즈니스 로직 파일**
- `src/editor/shared/utils/dxfGenerator.ts` - 기술 도면 내보내기
- `src/editor/shared/furniture/hooks/` - 가구 상호작용 로직
- `src/editor/shared/furniture/providers/` - 가구 상태를 위한 Context 프로바이더

---

## 📊 **데이터 플로우 패턴**

### **프로젝트 로드/저장 플로우**
```
사용자 액션
    ↓
Firebase 서비스 (projects.ts)
    ↓
프로젝트 스토어 (projectStore.ts)
    ↓
공간/가구 스토어
    ↓
UI 업데이트 & 3D 씬 새로고침
```

### **가구 배치 플로우**
```
사용자가 라이브러리에서 선택
    ↓
FurnitureLibrary 컴포넌트
    ↓
배치 로직 (FurniturePositioner)
    ↓
가구 스토어 업데이트
    ↓
3D 씬 재렌더링 (modules/*.tsx)
```

### **공간 구성 플로우**
```
사용자가 치수 수정
    ↓
공간 컨트롤 (DimensionControls)
    ↓
SpaceConfig 스토어 업데이트
    ↓
파생 스토어 재계산
    ↓
가구 적응 (FurnitureSpaceAdapter)
    ↓
3D 씬 업데이트
```

---

## 🧱 **재질 시스템 아키텍처**

### **재질 팩토리 패턴**
```
MaterialFactory.ts
├── createMaterials()                   # 캐싱을 통한 재질 생성
├── updateMaterial()                    # 동적 재질 업데이트
├── clearCache()                        # 메모리 관리
└── Material Cache                      # 중복 객체 생성 방지
```

**성능 이점:**
- Three.js 객체 생성 오버헤드 감소
- 중앙집중식 재질 관리
- 메모리 효율적인 캐싱 시스템

---

## 🗃️ **데이터 정의**

### **모듈 시스템**
```
src/data/modules/
├── cabinet.ts                          # 캐비닛 구성
├── desk.ts                             # 책상 변형
├── storage.ts                          # 수납 가구
├── seating.ts                          # 의자, 소파
└── index.ts                            # 모듈 레지스트리
```

**모듈 구조:**
```typescript
interface FurnitureModule {
  id: string;
  name: string;
  category: string;
  dimensions: Dimensions3D;
  materials: MaterialOptions;
  placementRules: PlacementConstraints;
}
```

---

## 🧪 **테스트 구조**

### **테스트 조직**
```
src/
├── test/setup.ts                       # Vitest 구성
├── store/__tests__/                    # 스토어 단위 테스트
│   ├── derivedSpaceStore.test.ts
│   └── [기타 스토어 테스트]
└── editor/shared/utils/__tests__/      # 비즈니스 로직 테스트
    ├── indexing/                       # 인덱싱 시스템 테스트
    └── [유틸리티 테스트]
```

**테스트 도구:**
- **Vitest** - 빠른 단위 테스트 러너
- **Testing Library** - 컴포넌트 테스트 유틸리티
- **happy-dom** - 경량 DOM 환경

---

## 🎯 **주요 기능 & 패턴**

### **개발 패턴**
- **CSS Modules** - 스코프된 스타일링 시스템
- **Provider Pattern** - 복잡한 상태 관리 (가구는 4개 프로바이더 사용)
- **HOC Pattern** - 횡단 관심사 (`withFurnitureSpaceAdapter`)
- **Hook Pattern** - 비즈니스 로직 추출
- **Factory Pattern** - 재질 생성 및 캐싱

### **성능 최적화**
- **WebGL 메모리 관리** - 라우트 변경 시 자동 정리
- **재질 캐싱** - 중복 Three.js 객체 생성 방지
- **파생 스토어 패턴** - 중복 계산 방지
- **청크 분할** - 최적화된 번들 로딩

### **코드 조직 원칙**
- **관심사의 분리** - 레이어 간 명확한 경계
- **모듈러 아키텍처** - 독립적이고 재사용 가능한 모듈
- **중앙집중식 컨트롤** - 컴포넌트 중복 방지
- **타입 안전성** - 포괄적인 TypeScript 적용

---

## 🔧 **개발 워크플로우**

### **주요 명령어**
```bash
npm run dev              # 개발 서버
npm run build            # 프로덕션 빌드 (TS 체크 포함)
npm run test             # Vitest로 테스트 실행
npm run lint             # ESLint 코드 품질 검사
```

### **파일 생성 가이드라인**
- **새 가구 타입**: `src/data/modules/`에 추가 + 3D 컴포넌트 생성
- **새 컨트롤**: 적절한 카테고리와 함께 `src/editor/shared/controls/`에 추가
- **3D 수정**: `utils/materials/`의 재질과 요소 업데이트
- **비즈니스 로직**: 복잡한 계산을 위해 인덱싱 시스템 클래스 확장

---

## 🚀 **배포 & 구성**

### **빌드 구성**
- **Vite** - 빠른 개발과 최적화된 프로덕션 빌드
- **청크 분할** - 주요 라이브러리를 위한 수동 분할 (Three.js, React)
- **경로 별칭** - 깔끔한 import를 위해 `@/`가 `src/`를 가리킴
- **정적 호스팅** - Netlify/Vercel 배포용 구성

### **환경 설정**
- **Firebase 구성** - 환경 기반 구성
- **CORS 헤더** - WebGL 컨텍스트 지원
- **TypeScript** - 경로 매핑을 포함한 엄격한 구성

---

## 📋 **상세 코드맵 링크**

더 자세한 기능별 구현 내용은 [PROJECT_CODEMAP_DETAILED.md](./PROJECT_CODEMAP_DETAILED.md)를 참조하세요.

이 코드맵은 가구 에디터 애플리케이션의 아키텍처에 대한 포괄적인 개요를 제공하여, 개발자가 프로젝트 구조, 컴포넌트 관계, 그리고 코드베이스 전반에 걸쳐 사용된 주요 패턴을 이해하는 데 도움을 줍니다.