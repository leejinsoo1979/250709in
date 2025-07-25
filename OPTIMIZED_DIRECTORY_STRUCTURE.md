# 🏛️ 최적화된 디렉토리 구조 제안 (Optimized Directory Structure)

**From:** Gemini (리드 에이전트)
**Subject:** 프로젝트의 확장성, 유지보수성, 협업 효율성 극대화를 위한 디렉토리 구조 재설계

## 1. 목표 및 원칙

이 새로운 디렉토리 구조는 다음 목표를 달성하기 위해 설계되었습니다.

- **관심사 분리 (Separation of Concerns):** UI, 상태(State), 비즈니스 로직, API 통신을 명확하게 분리합니다.
- **기능 중심 (Feature-Driven):** 관련된 기능들을 하나의 폴더에 모아 코드의 응집도를 높이고, 기능 단위로 쉽게 파악하고 수정할 수 있도록 합니다.
- **확장성 (Scalability):** 새로운 기능을 추가할 때, 기존 코드에 미치는 영향을 최소화하고 정해진 패턴에 따라 쉽게 확장할 수 있습니다.
- **탐색 용이성 (Navigability):** 개발자가 특정 기능을 찾을 때, 여러 폴더를 헤매지 않고 `features/` 내의 해당 기능 폴더만 탐색하면 되도록 합니다.

## 2. 제안하는 디렉토리 구조

```
src/
├── api/                    # 📡 API 통신 및 서버 관련 로직 (기존 firebase/)
│   ├── firebase.ts         # Firebase 초기 설정 및 SDK 인스턴스
│   └── projectsAPI.ts      # 프로젝트 관련 Firestore CRUD 함수
│   └── authAPI.ts          # 인증 관련 함수
│
├── assets/                 # 🖼️ 이미지, 폰트, svg 등 정적 에셋
│
├── components/             # 🧩 공용 UI 컴포넌트 (재사용 가능, 비즈니스 로직 없음)
│   ├── common/             # 버튼, 모달, 인풋 등 가장 범용적인 컴포넌트
│   └── layout/             # 페이지 레이아웃 관련 컴포넌트 (e.g., PageWrapper)
│
├── features/               # ✨ 핵심 변경: 기능(도메인) 기반으로 코드 구성
│   ├── auth/               # 🔐 인증 기능
│   │   ├── components/     # LoginForm, SignupForm 등 인증 관련 UI
│   │   ├── hooks/          # useAuth (로그인/로그아웃 로직)
│   │   └── index.tsx       # 인증 페이지의 진입점
│   │
│   ├── dashboard/          # 📊 대시보드 기능
│   │   ├── components/     # ProjectGrid, DashboardSidebar 등
│   │   ├── hooks/          # useUserProjects (프로젝트 목록 불러오기)
│   │   └── index.tsx       # 대시보드 페이지 진입점
│   │
│   └── editor/             # 🎨 가구 에디터 기능
│       ├── components/     # 에디터에서만 사용하는 컴포넌트 (Header, RightPanel)
│       ├── hooks/          # useProjectSync, useColumnInteraction 등 에디터 로직
│       ├── services/       # 순수 비즈니스 로직 (SpaceCalculator, Validation)
│       ├── viewer3d/       # 3D 뷰어 관련 코드 (기존 구조 유지)
│       └── index.tsx       # 에디터 페이지 진입점 (구 Configurator.tsx)
│
├── hooks/                  # 🎣 전역 커스텀 훅 (여러 기능에서 공유)
│   └── useDebounce.ts
│
├── store/                  # 🗄️ 전역 상태 관리 (Zustand)
│   ├── projectStore.ts
│   ├── spaceConfigStore.ts
│   └── uiStore.ts
│
├── styles/                 # 🎨 전역 스타일 및 테마
│   ├── global.css
│   └── theme.css
│
├── types/                  # 📝 전역 타입 정의
│   ├── project.d.ts
│   └── space.d.ts
│
├── utils/                  # 🛠️ 전역 유틸리티 함수 (순수 함수)
│   ├── formatters.ts
│   └── calculations.ts
│
├── App.tsx                 # 🌐 최상위 컴포넌트 및 라우터
└── main.tsx                # 🚀 애플리케이션 진입점
```

## 3. 주요 변경점 및 기대 효과

| 변경 전 (문제점) | 변경 후 (개선안) | 기대 효과 |
| :--- | :--- | :--- |
| **거대 컴포넌트 (`Configurator.tsx`)** | **`features/editor/index.tsx`** + **`hooks/`** | 컴포넌트는 UI 조립 역할만 수행, 로직은 훅으로 분리되어 명확성 및 테스트 용이성 증대 |
| **산재된 로직** (UI, 상태, 서버 통신 혼재) | **`components`, `hooks`, `services`, `api`** 계층 분리 | 각 파일/폴더의 책임이 명확해져 유지보수 비용 감소 및 버그 추적 용이 |
| **모호한 디렉토리** (`pages`, `shared`) | **`features/`** 디렉토리로 기능별 그룹화 | 코드 탐색이 직관적으로 변하고, 신규 기능 추가 시 작업 위치가 명확해짐 |
| **컴포넌트 내 Firebase 직접 호출** | **`api/`** 계층을 통한 간접 호출 | UI와 서버 통신이 분리되어, 향후 다른 API로 교체하거나 테스트 시 Mocking이 용이해짐 |

## 4. 마이그레이션 전략 (단계적 전환 방안)

한 번에 모든 구조를 바꾸는 것은 위험하므로, 다음과 같이 단계적으로 진행할 것을 권장합니다.

1.  **1단계 (구조 준비):** 제안된 새로운 디렉토리(`features`, `api` 등)를 먼저 생성합니다.
2.  **2단계 (공용 요소 이동):** `components/common`, `hooks`, `utils` 등 기능과 무관한 공용 모듈부터 이동시킵니다.
3.  **3단계 (기능 단위 마이그레이션):** 가장 독립적인 기능부터 `features` 폴더로 옮깁니다. 예를 들어, `auth` 기능을 먼저 `features/auth`로 완전히 이전하고, 정상 동작을 확인합니다.
4.  **4단계 (핵심 기능 리팩토링):** 가장 복잡한 `editor` 기능을 대상으로, `useProjectSync` 훅 등을 먼저 만들어 로직을 분리한 후, `features/editor` 구조로 점진적으로 리팩토링을 진행합니다.

이 구조를 통해 우리 프로젝트는 더 전문적이고, 체계적이며, 어떤 요구사항 변경에도 유연하게 대처할 수 있는 강력한 기반을 갖추게 될 것입니다.
