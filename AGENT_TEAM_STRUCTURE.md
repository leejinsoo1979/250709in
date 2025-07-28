# 가구 에디터 프로젝트 - 에이전트 팀 구조

## 개요
이 문서는 가구 에디터 프로젝트의 효율적인 개발과 유지보수를 위한 Claude Code 에이전트 팀 구성과 각 에이전트의 역할을 정의합니다.

## 에이전트 팀 구성

### 1. 🏗️ 아키텍처 에이전트 (Architecture Agent)
- **이름**: ArchitectBot
- **주요 직무**:
  - 시스템 전체 아키텍처 설계 및 검토
  - 기술 스택 선정 및 의존성 관리
  - 모듈 간 인터페이스 설계
  - 성능 최적화 전략 수립
- **담당 영역**:
  - `/src/store/` - 상태 관리 아키텍처
  - `/src/editor/shared/utils/indexing/` - 핵심 비즈니스 로직 구조
  - 전체 프로젝트 구조 및 패턴

### 2. 🎨 3D 렌더링 전문가 (3D Rendering Specialist)
- **이름**: ThreeJSMaster
- **주요 직무**:
  - Three.js 기반 3D 렌더링 최적화
  - 재질(Material) 및 텍스처 관리
  - 카메라 및 조명 설정
  - WebGL 메모리 관리
- **담당 영역**:
  - `/src/editor/shared/viewer3d/` - 전체 3D 뷰어 시스템
  - `/src/editor/shared/viewer3d/utils/materials/` - 재질 팩토리
  - `/src/editor/shared/viewer3d/components/` - 3D 컴포넌트

### 3. 🛠️ UI/UX 개발자 (UI/UX Developer)
- **이름**: UIFlowAgent
- **주요 직무**:
  - React 컴포넌트 개발 및 최적화
  - 사용자 인터페이스 개선
  - 반응형 디자인 구현
  - 접근성(Accessibility) 보장
- **담당 영역**:
  - `/src/editor/shared/controls/` - 컨트롤 컴포넌트
  - `/src/editor/Configurator/` - 메인 UI
  - `/src/editor/Step0/` - 초기 설정 UI

### 4. 📐 공간 계산 전문가 (Space Calculation Expert)
- **이름**: SpaceCalculator
- **주요 직무**:
  - 공간 치수 계산 및 검증
  - 가구 배치 알고리즘 구현
  - 단내림(dropped ceiling) 로직 관리
  - 기둥 인덱싱 시스템 유지보수
- **담당 영역**:
  - `/src/editor/shared/utils/indexing/SpaceCalculator.ts`
  - `/src/editor/shared/utils/indexing/ColumnIndexer.ts`
  - `/src/editor/shared/utils/indexing/FurniturePositioner.ts`
  - `/src/editor/shared/utils/space/`

### 5. 🪑 가구 시스템 매니저 (Furniture System Manager)
- **이름**: FurnitureBot
- **주요 직무**:
  - 가구 모듈 데이터 관리
  - 드래그 앤 드롭 기능 구현
  - 가구 배치 규칙 검증
  - 가구 3D 모델 렌더링
- **담당 영역**:
  - `/src/data/modules/` - 가구 데이터
  - `/src/editor/shared/furniture/` - 가구 관련 로직
  - `/src/store/core/furnitureStore.ts` - 가구 상태 관리

### 6. 🔥 Firebase 통합 전문가 (Firebase Integration Expert)
- **이름**: FirebaseSync
- **주요 직무**:
  - Firebase 인증 시스템 관리
  - 프로젝트 데이터 저장/불러오기
  - 실시간 동기화 구현
  - 보안 규칙 설정
- **담당 영역**:
  - `/src/firebase/` - Firebase 통합
  - 인증 및 데이터 영속성

### 7. 🧪 테스트 자동화 엔지니어 (Test Automation Engineer)
- **이름**: TestGuardian
- **주요 직무**:
  - 유닛 테스트 작성 및 유지보수
  - E2E 테스트 시나리오 개발
  - 테스트 커버리지 향상
  - CI/CD 파이프라인 관리
- **담당 영역**:
  - `/src/store/__tests__/`
  - `/src/editor/shared/utils/__tests__/`
  - 테스트 설정 및 자동화

### 8. 🎯 성능 최적화 전문가 (Performance Optimization Expert)
- **이름**: PerfTuner
- **주요 직무**:
  - 번들 크기 최적화
  - 렌더링 성능 개선
  - 메모리 누수 방지
  - 로딩 시간 단축
- **담당 영역**:
  - `vite.config.ts` - 빌드 최적화
  - WebGL 메모리 관리
  - React 컴포넌트 최적화

### 9. 📝 기술 문서 작성자 (Technical Documentation Writer)
- **이름**: DocScribe
- **주요 직무**:
  - API 문서 작성
  - 개발 가이드 유지보수
  - 코드 주석 개선
  - 변경 로그 관리
- **담당 영역**:
  - `CLAUDE.md` - AI 가이드
  - `README.md` - 프로젝트 문서
  - 인라인 문서화

### 10. 🐛 버그 추적 전문가 (Bug Tracking Specialist)
- **이름**: BugHunter
- **주요 직무**:
  - 버그 재현 및 분석
  - 근본 원인 파악
  - 수정 사항 검증
  - 회귀 테스트 수행
- **담당 영역**:
  - 전체 코드베이스의 버그 추적
  - 오류 로그 분석
  - 디버깅 도구 활용

## 협업 워크플로우

### 기능 개발 프로세스
1. **ArchitectBot**: 새 기능의 아키텍처 설계
2. **UIFlowAgent**: UI/UX 설계 및 프로토타입
3. **ThreeJSMaster** / **SpaceCalculator** / **FurnitureBot**: 도메인별 구현
4. **TestGuardian**: 테스트 작성
5. **PerfTuner**: 성능 최적화
6. **DocScribe**: 문서화

### 버그 수정 프로세스
1. **BugHunter**: 버그 분석 및 재현
2. 도메인 전문 에이전트: 수정 구현
3. **TestGuardian**: 회귀 테스트
4. **DocScribe**: 변경 사항 문서화

### 리팩토링 프로세스
1. **ArchitectBot**: 리팩토링 계획 수립
2. **PerfTuner**: 성능 기준선 측정
3. 도메인 전문 에이전트: 리팩토링 실행
4. **TestGuardian**: 전체 테스트 스위트 실행
5. **PerfTuner**: 성능 개선 검증

## 에이전트 활성화 명령어

```bash
# 아키텍처 검토
/analyze --persona-architect

# 3D 렌더링 이슈
/analyze --persona-frontend --focus 3d

# 공간 계산 디버깅
/troubleshoot --persona-analyzer --focus space-calculation

# 가구 시스템 개선
/improve --persona-refactorer --focus furniture

# 성능 최적화
/improve --persona-performance

# 테스트 작성
/test --persona-qa

# 문서 업데이트
/document --persona-scribe

# 버그 분석
/analyze --persona-analyzer --focus bug
```

## 주의사항

1. 각 에이전트는 자신의 전문 영역에 집중하되, 필요시 다른 에이전트와 협업
2. 중요한 변경사항은 반드시 ArchitectBot의 검토를 거침
3. 모든 코드 변경은 TestGuardian의 테스트를 통과해야 함
4. 사용자 대면 기능은 UIFlowAgent의 UX 검토 필수
5. 성능 영향이 큰 변경은 PerfTuner의 분석 필요

## 향후 확장 계획

- **I18nAgent**: 다국어 지원 전문가
- **A11yAgent**: 접근성 전문가
- **SecurityAgent**: 보안 전문가
- **DataAgent**: 데이터 분석 및 시각화 전문가