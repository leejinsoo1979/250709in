## 프로젝트 개요

이 프로젝트는 사용자가 웹 인터페이스를 통해 가구를 직접 디자인하고 3D로 확인할 수 있는 가구 편집기 애플리케이션입니다.

### 주요 기능

- 다양한 모듈(선반, 서랍, 옷걸이 봉 등)을 조합하여 가구 디자인
- 가구의 크기, 색상, 재질 등 속성 변경
- 2D 및 3D 뷰어 제공
- 디자인 저장 및 불러오기

### 기술 스택

- **프론트엔드:** React, Vite, TypeScript
- **3D 렌더링:** Three.js, @react-three/fiber, @react-three/drei
- **상태 관리:** Zustand
- **라우팅:** React Router
- **테스팅:** Vitest, React Testing Library

## 개발 지침

### 실행 방법

- **개발 서버 실행:** `npm run dev`
- **빌드:** `npm run build`
- **테스트:** `npm run test`

### 코드 스타일

- ESLint와 Prettier를 사용하여 코드 스타일을 일관성 있게 유지합니다.
- 커밋하기 전에 `npm run lint`를 실행하여 코드 스타일을 확인해주세요.

### 브랜치 전략

- `main` 브랜치는 항상 배포 가능한 상태로 유지합니다.
- 기능 개발은 `feature/` 브랜치에서 진행합니다.
- 버그 수정은 `fix/` 브랜치에서 진행합니다.

### 커밋 메시지

- 커밋 메시지는 Conventional Commits 형식을 따릅니다.
- 예: `feat: 사용자가 가구 색상을 변경할 수 있는 기능 추가`
