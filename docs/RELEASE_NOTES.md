# 릴리즈 노트 (Release Notes)

> 가구 에디터 프로젝트의 버전별 주요 업데이트 내역

## 📋 버전 관리 정책

- **Major (1.x.x)**: 아키텍처 대규모 변경, 호환성 파괴적 변경
- **Minor (x.1.x)**: 새로운 기능 추가, 기존 기능 개선
- **Patch (x.x.1)**: 버그 수정, 성능 최적화, 문서 업데이트

---

## 🎯 v1.10.0 - Firebase Test Harness 도입 (2025-08-27)

### ✨ 주요 신기능
- **Firebase 통합 테스트 하네스**: 완전한 Firebase 서비스 테스트 환경 구축
  - **Auth 테스트**: 사용자 인증 및 권한 관리 테스트
  - **Firestore 테스트**: 데이터베이스 CRUD 작업 및 보안 규칙 검증
  - **Storage 테스트**: 파일 업로드/다운로드 및 접근 권한 테스트
  - **에뮬레이터 통합**: 로컬 Firebase 에뮬레이터와 완벽한 연동

### 🚀 실행 방법

#### 개발 환경 실행
```bash
# 1. Firebase 에뮬레이터 시작
npm run firebase:emulators

# 2. 별도 터미널에서 테스트 실행
npm run test:firebase

# 3. 특정 테스트만 실행
npm run test:firebase -- auth
npm run test:firebase -- firestore
npm run test:firebase -- storage
```

#### CI/CD 환경 실행
```yaml
# GitHub Actions 예시
- name: Run Firebase Tests
  run: |
    # 에뮬레이터 백그라운드 실행
    npx firebase emulators:start --only auth,firestore,storage &
    
    # 에뮬레이터 준비 대기
    npx wait-on http://127.0.0.1:9099
    
    # 테스트 실행
    npm run test:firebase
```

### ⚠️ 제약사항 및 한계

#### 환경 제약
- **Node.js 버전**: 14.x 이상 필요 (TextEncoder/TextDecoder API)
- **메모리 요구사항**: 최소 2GB RAM (에뮬레이터 + 테스트 실행)
- **포트 사용**: 다음 포트가 사용 가능해야 함
  - 9099 (Auth)
  - 8080 (Firestore)
  - 9199 (Storage)
  - 4000 (Emulator UI)

#### 기능 제약
- **실시간 리스너**: Firestore 실시간 업데이트 테스트 제한적
- **파일 크기**: Storage 테스트에서 대용량 파일(>10MB) 처리 시 타임아웃 가능
- **동시성**: 병렬 테스트 실행 시 에뮬레이터 리소스 경합 가능
- **브라우저 API**: jsdom 환경에서 일부 브라우저 전용 API 미지원

### 🔄 롤백 절차

#### 1. 기능 플래그 비활성화
```javascript
// src/test/firebase-setup.ts
export const FIREBASE_TEST_ENABLED = false; // true → false

// 또는 환경변수로 제어
// .env.test
VITE_FIREBASE_TEST_ENABLED=false
```

#### 2. 워크플로우 비활성화
```yaml
# .github/workflows/test.yml
jobs:
  test:
    steps:
      # Firebase 테스트 단계 주석 처리
      # - name: Run Firebase Tests
      #   run: npm run test:firebase
```

#### 3. 패키지 의존성 제거 (선택사항)
```bash
# Firebase 테스트 관련 패키지만 제거
npm uninstall @firebase/rules-unit-testing

# 테스트 스크립트 제거
# package.json에서 "test:firebase" 스크립트 제거
```

### 🔧 기술적 구현 세부사항

#### 테스트 환경 설정
- **Polyfills 분리**: `firebase-polyfills.ts`로 환경 호환성 확보
  - TextEncoder/TextDecoder polyfill 적용
  - XMLHttpRequest mock 구현
- **Firebase Setup 모듈화**: `firebase-setup.ts`로 초기화 로직 중앙화
  - 에뮬레이터 자동 연결
  - 테스트 사용자 생성 헬퍼
  - 클린업 유틸리티 제공

#### Mock 시스템
- **Firestore Mock** (`__mocks__/firebase/firestore.ts`)
  - 컬렉션/문서 CRUD 작업 시뮬레이션
  - 쿼리 및 필터링 지원
  - 트랜잭션 및 배치 작업 모킹
- **Storage Mock** (`__mocks__/firebase/storage.ts`)
  - 파일 업로드/다운로드 시뮬레이션
  - 메타데이터 관리
  - URL 생성 모킹

### 📊 개발 통계
- **개발 기간**: 2025-08-26 ~ 2025-08-27
- **커밋 범위**: `27a00d4..ab8799e`
- **브랜치**: `feature/firebase-test-harness`
- **주요 변경**: 
  - Firebase Rules Unit Testing 패키지 추가
  - jsdom 환경 설정 및 polyfill 적용
  - Auth, Firestore, Storage 통합 테스트 구현
  - Mock 시스템 구축

### 🎯 개발자 혜택
- **안전한 테스트**: 프로덕션 환경 영향 없이 Firebase 기능 검증
- **빠른 피드백**: 로컬 에뮬레이터로 즉시 테스트 실행
- **CI/CD 통합**: 자동화된 테스트로 배포 안정성 확보
- **실제 동작 검증**: Mock이 아닌 실제 Firebase 에뮬레이터 사용

### 🔮 향후 발전 방향
- **Performance 모니터링**: Firebase Performance 테스트 추가
- **Cloud Functions**: 서버리스 함수 테스트 통합
- **Remote Config**: 원격 구성 테스트 지원
- **테스트 커버리지**: 더 많은 엣지 케이스 및 시나리오 추가

---

## Firebase Test Harness Introduction (English Version)

### ✨ Key Features
- **Firebase Integration Test Harness**: Complete Firebase services testing environment
  - **Auth Testing**: User authentication and authorization management tests
  - **Firestore Testing**: Database CRUD operations and security rules validation
  - **Storage Testing**: File upload/download and access permission tests
  - **Emulator Integration**: Perfect integration with local Firebase emulators

### 🚀 Execution Methods

#### Development Environment
```bash
# 1. Start Firebase emulators
npm run firebase:emulators

# 2. Run tests in separate terminal
npm run test:firebase

# 3. Run specific tests
npm run test:firebase -- auth
npm run test:firebase -- firestore
npm run test:firebase -- storage
```

#### CI/CD Environment
```yaml
# GitHub Actions example
- name: Run Firebase Tests
  run: |
    # Run emulators in background
    npx firebase emulators:start --only auth,firestore,storage &
    
    # Wait for emulators
    npx wait-on http://127.0.0.1:9099
    
    # Execute tests
    npm run test:firebase
```

### ⚠️ Constraints and Limitations

#### Environment Constraints
- **Node.js Version**: 14.x or higher required (TextEncoder/TextDecoder API)
- **Memory Requirements**: Minimum 2GB RAM (emulators + test execution)
- **Port Usage**: Following ports must be available
  - 9099 (Auth)
  - 8080 (Firestore)
  - 9199 (Storage)
  - 4000 (Emulator UI)

#### Functional Constraints
- **Realtime Listeners**: Limited Firestore realtime update testing
- **File Size**: Potential timeout with large files (>10MB) in Storage tests
- **Concurrency**: Resource contention possible with parallel test execution
- **Browser APIs**: Some browser-specific APIs unsupported in jsdom environment

### 🔄 Rollback Procedures

#### 1. Feature Flag Deactivation
```javascript
// src/test/firebase-setup.ts
export const FIREBASE_TEST_ENABLED = false; // true → false

// Or control via environment variable
// .env.test
VITE_FIREBASE_TEST_ENABLED=false
```

#### 2. Workflow Deactivation
```yaml
# .github/workflows/test.yml
jobs:
  test:
    steps:
      # Comment out Firebase test step
      # - name: Run Firebase Tests
      #   run: npm run test:firebase
```

#### 3. Remove Package Dependencies (Optional)
```bash
# Remove only Firebase test-related packages
npm uninstall @firebase/rules-unit-testing

# Remove test script
# Remove "test:firebase" script from package.json
```

### 🔧 Technical Implementation Details

#### Test Environment Setup
- **Separated Polyfills**: Environment compatibility via `firebase-polyfills.ts`
  - TextEncoder/TextDecoder polyfill application
  - XMLHttpRequest mock implementation
- **Modular Firebase Setup**: Centralized initialization logic in `firebase-setup.ts`
  - Automatic emulator connection
  - Test user creation helpers
  - Cleanup utilities provided

#### Mock System
- **Firestore Mock** (`__mocks__/firebase/firestore.ts`)
  - Collection/document CRUD operation simulation
  - Query and filtering support
  - Transaction and batch operation mocking
- **Storage Mock** (`__mocks__/firebase/storage.ts`)
  - File upload/download simulation
  - Metadata management
  - URL generation mocking

### 📊 Development Statistics
- **Development Period**: 2025-08-26 ~ 2025-08-27
- **Commit Range**: `27a00d4..ab8799e`
- **Branch**: `feature/firebase-test-harness`
- **Major Changes**: 
  - Added Firebase Rules Unit Testing package
  - Configured jsdom environment and applied polyfills
  - Implemented Auth, Firestore, Storage integration tests
  - Built mock system

### 🎯 Developer Benefits
- **Safe Testing**: Verify Firebase features without affecting production
- **Fast Feedback**: Immediate test execution with local emulators
- **CI/CD Integration**: Deployment stability through automated testing
- **Real Behavior Validation**: Using actual Firebase emulators instead of mocks

### 🔮 Future Roadmap
- **Performance Monitoring**: Add Firebase Performance testing
- **Cloud Functions**: Integrate serverless function testing
- **Remote Config**: Support remote configuration testing
- **Test Coverage**: Add more edge cases and scenarios

---

## 🎯 v1.9.0 - 사이드바 토글 시스템 및 UI 혁신 (2025-07-04)

### ✨ 주요 신기능
- **사이드바 토글 시스템**: 스케치업 스타일의 유연한 작업 공간 구현
  - **좌측 패널 토글**: 모듈/재질 탭의 독립적 열기/닫기 기능
  - **우측 패널 토글**: 공간설정 패널의 선택적 표시/숨김 기능
  - **5분할 레이아웃**: 좌측탭 + 좌측패널 + 뷰어 + 우측패널 + 우측탭 구조
  - **즉각적 반응성**: 애니메이션 지연 제거로 스냅 효과의 빠른 토글

- **가구편집 창 독립성**: 패널 상태와 무관한 안정적 편집 환경
  - 우측 패널이 닫힌 상태에서도 가구 더블클릭 시 편집창 정상 동작
  - 회색 반투명 오버레이 배경 완전 제거로 밝고 깔끔한 UI
  - 패널과 독립적인 오버레이 위치로 구조적 안정성 확보

### 🎨 UI/UX 개선사항
- **직관적 아이콘 시스템**:
  - 공간설정: ⚙️ (설정) → 📐 (자/측정)으로 변경하여 치수 설정 의미 명확화
  - 재질 내부: 🏠 (집) → 🟫 (갈색 사각형)으로 변경하여 목재 재질 표현
- **스케치업 스타일 작업 환경**: 전문 CAD 소프트웨어와 유사한 UI 패러다임
- **비방해적 편집 환경**: 가구 편집 시 배경이 어두워지지 않는 자연스러운 환경

### 🔧 기술적 개선사항
- **린트 에러 완전 해결**: SurroundControls.tsx의 useEffect 의존성 배열 최적화
- **5분할 레이아웃 시스템**: 복잡한 다중 패널 관리 시스템 구축
- **컴포넌트 구조 최적화**: 가구편집 창의 독립적 렌더링 구조

### 🎯 사용자 혜택
- **유연한 작업 공간**: 작업 목적에 따른 선택적 패널 사용으로 집중도 향상
- **최대 뷰어 영역**: 양쪽 패널 동시 닫기 시 넓은 작업 공간 확보
- **직관적 조작**: 의미가 명확한 아이콘으로 사용자 이해도 향상
- **안정적 편집**: 패널 상태와 무관한 가구 편집 환경

### 📊 개발 통계
- **개발 기간**: 2024-12-31 (UI 혁신 집중 개발)
- **커밋 범위**: `07789a2..94bedae`
- **브랜치**: `feature/ui-development` → `main`
- **파일 변경**: 6개 파일 수정 (154줄 추가, 59줄 삭제)
- **주요 변경**: 
  - Configurator 토글 시스템 구현
  - CSS 5분할 레이아웃 시스템
  - 가구편집 창 독립성 확보
  - 아이콘 직관성 개선

### 🔧 호환성
- **기존 기능**: 모든 기존 가구 편집 기능 완전 호환
- **데이터 구조**: 기존 프로젝트 데이터 100% 호환
- **성능**: UI 개선으로 오히려 반응성 향상

### 🔮 향후 발전 방향
- **추가 패널 토글**: 더 많은 패널에 토글 기능 확장 검토
- **워크스페이스 프리셋**: 사용자 정의 패널 배치 저장 기능
- **키보드 단축키**: 패널 토글을 위한 단축키 시스템 추가

---

## 🎯 v1.8.3 - DualType5/DualType6 3D 렌더링 정확성 개선 (2025-01-16)

### 🐛 버그 수정
- **DualType6 중간 세로 패널 위치 교정**: 바지걸이장 고정폭에 맞는 정확한 렌더링
  - **문제**: 중간 세로 패널이 항상 중앙(x=0)에 위치하여 바지걸이 고정폭(564mm)과 불일치
  - **해결**: 좌우 폭 차이에 따른 올바른 X 위치 계산 `(leftWidth - rightWidth) / 2`
  - **개선**: 높이 9mm 증가 및 18mm 아래 이동으로 정확한 치수 적용
- **DualType6 상단 패널 통합**: 상단 옷장 구조에 맞는 올바른 렌더링
  - **문제**: 상단 옷장이 좌우 연결된 구조인데 좌/우 분리된 패널로 렌더링
  - **해결**: 하나의 전체 폭(`innerWidth`) 상단 패널로 통합
  - **결과**: 상단 옷장이 좌우 연결된 하나의 통합 공간으로 정확히 표현
- **DualType5 중간 세로 패널 분할 복원**: 스타일러장 구조에 맞는 상/하 분리
  - **문제**: 중간 세로 패널이 전체 높이로 렌더링되어 분리선 사라짐
  - **해결**: 중간 세로 패널을 좌측과 동일하게 섹션별로 분할하여 렌더링
  - **구현**: "좌측 측판과 중간 측판은 서랍장 높이(600mm)에서 상/하로 분할됨" 정확히 적용

### 🔧 기술적 개선
- **정확한 위치 계산**: 모든 패널의 X/Y 위치가 설계 의도와 정확히 일치
  - 스타일러장 고정폭(694mm), 바지걸이장 고정폭(564mm)에 맞는 중간 패널 위치
  - 세로 패널들이 바닥(`-height/2`)부터 시작하여 올바른 높이로 렌더링
  - 상/하 분리 패널이 바닥부터 600~618mm 위치에 정확히 배치
- **이중 오프셋 문제 해결**: 그룹 내부 요소들의 상대적 위치 계산으로 정확성 확보
  - **문제**: 구분 패널이 `<group position={[leftXOffset, 0, 0]}>` 내부에 있는데 X 위치를 `leftXOffset`으로 설정하여 이중 오프셋
  - **해결**: 구분 패널의 X 위치를 `0`으로 변경하여 그룹 내 상대적 위치로 수정
- **데이터 구조 준수**: `hasSharedMiddlePanel: false/true` 설정에 따른 정확한 분할/통합 패널 렌더링

### 🎨 구조적 정확성 향상
- **DualType5 세로 패널 3장 구조**: 좌측/중간 패널은 섹션별 분할, 우측 패널은 전체 높이
- **DualType6 통합 상단 공간**: 상단 옷장이 좌우 연결된 하나의 통합 공간으로 정확히 구현
- **고정폭 가구 지원**: 스타일러장(694mm), 바지걸이장(564mm) 등 고정폭 가구의 정확한 중간 패널 위치
- **치수 정확성**: 모든 패널의 위치와 크기가 실제 가구 제작 도면과 정확히 일치

### 📊 개발 통계
- **개발 기간**: 2025-01-16 (정밀 렌더링 개선)
- **브랜치**: `refactor/furniture-generation-structure`
- **파일 변경**: 2개 파일 수정 (`DualType5.tsx`, `DualType6.tsx`)
- **수정 내용**: 
  - DualType5: 중간 세로 패널 섹션별 분할, 구분 패널 위치 수정, Y 위치 바닥 기준 조정
  - DualType6: 중간 세로 패널 위치/높이 교정, 상단 패널 통합

### 🔧 호환성
- **기존 기능**: 모든 기존 가구 타입 정상 작동 유지
- **렌더링 성능**: 성능에 미치는 영향 없이 정확성만 개선
- **데이터 구조**: 기존 가구 데이터 구조 완전 호환

### 🎯 사용자 혜택
- **정확한 3D 미리보기**: 실제 제작될 가구와 동일한 구조로 3D 모델 표시
- **설계 신뢰성**: 모든 패널 위치가 정확하여 제작 도면으로 활용 가능
- **시각적 완성도**: 좌우 비대칭 가구의 복잡한 구조를 정확하고 이해하기 쉽게 표현
- **고정폭 가구 정확성**: 스타일러장, 바지걸이장 등 특수 가구의 정확한 구조 파악

### 🔮 향후 개선 방향
- **추가 특수 가구**: 새로운 고정폭 가구 타입 추가 시 동일한 정확성 보장
- **치수 표시 기능**: 3D 모델 위에 실제 치수 표시 기능 추가
- **단면도 뷰**: 복잡한 구조의 가구를 위한 단면도 뷰 기능 검토

---

## 🎯 v1.8.2 - 듀얼타입5 스타일러장 세로패널 구조 수정 (2025-01-25)

### 🐛 버그 수정
- **중간 세로 칸막이 높이 문제 해결**: 듀얼타입5 스타일러장에서 중간 세로 칸막이가 가구 높이를 초과하던 문제 수정
  - **문제**: 중간 세로 칸막이에 18mm 높이 조정으로 가구 전체 높이보다 높게 렌더링
  - **원인**: `sectionHeight + mmToThreeUnits(18)` 로직으로 인한 과도한 높이 증가
  - **해결**: 높이 조정 로직 제거하여 섹션 높이 그대로 사용 (`sectionHeight`)
- **세로패널 위치 일관성 확보**: 중간 세로 칸막이를 18mm 아래로 내려서 좌우 측판과 동일하게 바닥면부터 시작
  - **문제**: 중간 칸막이만 바닥판(18mm) 위에서 시작하여 좌우 측판과 위치 불일치
  - **해결**: Y 위치 계산에서 `- basicThickness` 적용하여 바닥면부터 시작하도록 수정
- **상단 패널 구조 통일**: 하단 패널과 동일하게 좌우로 분리하여 구조적 일관성 확보
  - **기존**: 상단 패널 통으로 1장, 하단 패널 좌우 분리 2장으로 비대칭 구조
  - **개선**: 상단 패널도 좌우 분리 2장으로 변경하여 하단과 동일한 구조

### 🔧 기술적 개선
- **BoxModule.tsx 최적화**: 듀얼타입5/6 가구에 대한 상단 패널 분리 로직 추가
- **일관된 패널 분할**: 상단/하단 패널이 동일한 폭 분할 계산 로직 사용
- **Y축 위치 정확성**: 상단 패널은 `height/2 - basicThickness/2`, 하단 패널은 `-height/2 + basicThickness/2`로 대칭 배치
- **코드 재사용성**: 하단 패널과 동일한 조건부 렌더링 로직을 상단 패널에도 적용

### 🎨 구조적 일관성 향상
- **세로 패널 3개 통일**: 좌측 측판, 중간 칸막이, 우측 측판 모두 동일한 기준점에서 시작
- **패널 분할 일관성**: 상단/중간/하단 모든 가로 패널이 중간 세로 칸막이를 기준으로 좌우 분리
- **시각적 완성도**: 듀얼타입5 스타일러장의 전체적인 구조가 논리적이고 일관되게 표현

### 📊 개발 통계
- **개발 기간**: 2025-01-25 (버그 수정)
- **커밋 해시**: `015065b`
- **브랜치**: `refactor/furniture-generation-structure`
- **파일 변경**: 1개 파일 수정 (`BoxModule.tsx`)
- **수정 내용**: 60줄 추가, 13줄 삭제

### 🔧 호환성
- **기존 기능**: 모든 기존 가구 타입 정상 작동
- **구조 개선**: 듀얼타입5 스타일러장만 영향, 다른 가구는 변경 없음
- **성능 영향**: 렌더링 성능에 미치는 영향 없음

### 🎯 사용자 혜택
- **정확한 3D 모델**: 세로 패널들이 올바른 높이와 위치로 표시되어 시각적 정확성 향상
- **구조적 이해**: 일관된 패널 분할로 가구 구조를 더 직관적으로 파악 가능
- **설계 신뢰성**: 실제 제작 시 참고할 수 있는 정확한 3D 모델 제공

---

## 🎯 v1.8.1 - 대시보드 드롭다운 메뉴 위치 수정 (2025-01-25)

### 🐛 버그 수정
- **대시보드 드롭다운 메뉴 위치 문제 해결**: 프로젝트 리스트 [...] 버튼 플로팅 창 정확한 위치 표시
  - **문제**: 리스트 하단 항목 클릭 시 드롭다운이 화면 하단에 잘못 표시
  - **원인**: `position: fixed` 사용 시 `window.scrollY` 중복 계산으로 이중 오프셋 발생
  - **해결**: 뷰포트 기준 위치 계산으로 수정 (`rect.bottom + 4` 직접 사용)
  - **개선**: 화면 경계 체크 로직 추가로 완벽한 가시성 보장

### 🔧 기술적 개선
- **정확한 위치 계산**: `getBoundingClientRect()` 기반 절대 위치 계산
- **스마트 경계 처리**: 
  - 오른쪽 경계: 드롭다운이 화면 밖으로 나가면 왼쪽 정렬로 자동 변경
  - 하단 경계: 공간 부족 시 버튼 위쪽으로 표시 위치 변경
  - 좌측 경계: 최소 8px 여백 확보
- **반응형 대응**: 다양한 화면 크기에서 드롭다운 메뉴 완벽 표시

### 🎯 사용자 경험 향상
- **일관된 조작성**: 리스트 어느 위치에서든 버튼 바로 아래에 정확히 표시
- **가시성 보장**: 화면 경계 처리로 드롭다운 메뉴 항상 완전 표시
- **직관적 위치**: 사용자가 기대하는 위치에 메뉴 표시

### 📊 개발 통계
- **개발 기간**: 2025-01-25 (버그 수정)
- **커밋 해시**: `9f7be56`
- **브랜치**: `feature/furniture-list-ui`
- **파일 변경**: 1개 파일 수정 (`src/pages/HomePage.tsx`)
- **수정 내용**: 드롭다운 토글 함수 개선 및 경계 체크 로직 추가

### 🔧 호환성
- **기존 기능**: 모든 기존 대시보드 기능 정상 작동
- **브라우저 호환성**: 모든 모던 브라우저에서 완벽 지원
- **반응형**: 데스크톱/태블릿/모바일 모든 화면에서 최적화

---

## 🎯 v1.8.0 - ModuleGallery 썸네일 기반 가구 선택 UI 구현 (2025-01-25)

### ✨ 새로운 기능
- **ModuleGallery 컴포넌트**: 간소화된 썸네일 전용 가구 선택 인터페이스
  - 2열 그리드 레이아웃으로 직관적인 가구 선택 환경
  - 싱글/듀얼 탭 메뉴로 가구 타입별 체계적 분류
  - 세로 긴 비율(3:4) 썸네일로 가구 구조 직관적 파악
  - 이미지 중심의 간소화된 인터페이스로 복잡한 설명 텍스트 제거
- **8개 가구 이미지 완전 매핑**: 모든 가구 타입에 개별 썸네일 이미지 연결
  ```
  single-2drawer-hanging, single-2hanging, single-4drawer-hanging,
  dual-2drawer-hanging, dual-2hanging, dual-4drawer-hanging,
  dual-2drawer-styler, dual-4drawer-pantshanger
  ```
- **드래그 앤 드롭 시스템 통합**: ModuleItem과 동일한 로직으로 완벽한 호환성
  - `setCurrentDragData` 및 전역 상태 관리 적용
  - 기존 SlotDropZones와 100% 호환
  - 유효성 검사 및 안전한 에러 처리

### 🎨 UI/UX 개선사항
- **Configurator 통합**: ModuleLibrary 대신 ModuleGallery 컴포넌트 적용
- **시각적 식별성**: 세로 긴 썸네일로 가구 구조 한눈에 파악 가능
- **간소화된 선택 프로세스**: 
  - 복잡한 설명 텍스트 제거로 빠른 가구 선택
  - 2열 그리드로 한눈에 비교 가능한 레이아웃
  - 호버 효과 및 애니메이션으로 상호작용 개선
- **반응형 디자인**: 다양한 화면 크기에서 최적화된 썸네일 표시

### 🏗️ 시스템 설계 우수성
- **기존 로직 100% 재사용**: ModuleLibrary의 모든 핵심 로직 활용
  - 가구 분류 및 유효성 검사 시스템
  - 특수 가구(스타일러, 바지걸이장) 조건부 노출 처리
  - 컬럼 수 기반 싱글/듀얼 분류 알고리즘
- **점진적 대체 전략**: 기존 ModuleLibrary 보존하면서 새 컴포넌트 도입
- **확장성 확보**: 새로운 가구 타입 추가 시 이미지만 추가하면 자동 적용
- **성능 최적화**: useMemo를 통한 가구 목록 캐싱 및 불필요한 리렌더링 방지

### 🔧 기술적 구현 세부사항
- **이미지 구조**: `public/images/furniture-thumbnails/` 폴더에 체계적 관리
- **타입 안전성**: 기존 ModuleData 인터페이스 완전 호환
- **에러 처리**: 이미지 로드 실패 시 fallback 이미지 자동 적용
- **CSS 모듈**: 전용 스타일시트로 독립적인 디자인 시스템
- **드래그 데이터**: ModuleItem과 동일한 구조로 일관성 확보

### 📊 개발 통계
- **개발 기간**: 2025-01-25 (1일 집중 개발)
- **커밋 해시**: `6b22420`
- **브랜치**: `feature/furniture-list-ui`
- **파일 변경**: 12개 파일 (1,180줄 추가, 2줄 삭제)
- **새 파일**: ModuleGallery.tsx, ModuleGallery.module.css + 8개 이미지
- **이미지 크기**: 총 406.30 KiB (평균 50KB per 이미지)

### 🔧 호환성
- **기존 프로젝트**: 모든 기존 기능 정상 작동
- **점진적 대체**: ModuleLibrary 보존으로 안전한 전환
- **확장성**: 새 가구 타입 추가 시 즉시 적용

### 🎯 사용자 혜택
- **설계 효율성**: 이미지 기반 직관적 가구 선택으로 작업 속도 향상
- **시각적 명확성**: 가구 구조를 한눈에 파악하여 설계 정확도 증대
- **간편한 조작**: 드래그 앤 드롭으로 빠른 가구 배치
- **일관된 경험**: 기존 시스템과 완벽 호환으로 학습 비용 없음

### 🔮 향후 계획
- **추가 이미지 최적화**: 더 고품질 썸네일 이미지 적용
- **애니메이션 확장**: 드래그 시작/종료 시 시각적 피드백 강화
- **필터링 기능**: 가구 타입별 고급 필터링 옵션 추가
- **즐겨찾기 시스템**: 자주 사용하는 가구 즐겨찾기 기능

---

## 🎯 v1.7.0 - 듀얼 타입6 바지걸이장 구현 및 제약사항 시스템 확장 (2025-01-01)

### ✨ 새로운 기능
- **듀얼 타입6 바지걸이장**: 좌측 4단서랍+우측 바지걸이+상단 통합옷장 복합형 가구
  - 하단부: 좌측 4단서랍(255,255,176,176mm) + 우측 바지걸이(564mm 내경)
  - 상단부: 중앙 칸막이 없는 통합 옷장으로 공간 활용도 극대화
  - 1000mm 위치 구분선반으로 듀얼 타입4와 시각적 일관성 확보
- **제약사항 시스템 확장**: 스타일러장과 바지걸이장 통합 관리
  - 특수 가구(스타일러, 바지걸이) 슬롯폭 550mm 미만 시 조건부 숨김
  - 배치 후 공간 폭/컬럼 수 변경 제한으로 구조 보호
  - 예측 가능한 제약으로 일관된 사용자 경험 제공
- **사용자 메시지 개선**: "(스타일러장, 바지걸이장 배치시 수정불가)" 통일된 안내

### 🏗️ 시스템 설계 개선
- **기존 시스템 100% 재활용**: 좌우 비대칭 구조(`leftSections` + `rightSections`) 완전 활용
- **측판 분할 시스템 확장**: 좌우 비대칭 가구에도 다층 측판 분할 적용
  ```typescript
  const isMultiSectionFurniture = () => {
    return sections.length > 1 || (leftSections && rightSections);
  };
  ```
- **중앙 칸막이 최적화**: 듀얼 타입6 전용 로직으로 하단부만 차지
  ```typescript
  if (isDualPantsHanger) {
    partitionHeight = mmToThreeUnits(982); // 하단부만
    partitionYOffset = -height/2 + basicThickness + partitionHeight/2;
  }
  ```

### 🔧 기술적 구현
- **확장 가능한 특수 가구 시스템**: 배열 기반 ID 매칭으로 새 가구 추가 용이
  ```typescript
  const isSpecialDualFurniture = module.id.includes('dual-drawer-styler-') || 
                                 module.id.includes('dual-drawer-pantshanger-');
  ```
- **3곳 제약 적용**: WidthControl, SurroundControls, BaseControls에서 일관된 제한
- **구조적 완성도**: 하단부 982mm + 구분선반 18mm = 정확히 1000mm

### 🎨 사용자 경험 향상
- **이중 안전장치**: 조건부 노출(사전 차단) + 변경 제한(사후 보호)
- **예측 가능한 제약**: 스타일러장과 바지걸이장이 동일한 규칙으로 작동
- **명확한 안내**: 제약 상황에서 구체적이고 이해하기 쉬운 메시지
- **시각적 일관성**: 듀얼 타입4와 동일한 구분선반 위치

### 📊 개발 통계
- **개발 기간**: 2025-01-01 (1일 집중 개발)
- **파일 변경**: 9개 파일 수정
- **새 가구 모듈**: `dual-drawer-pantshanger` 시리즈 (400-800mm)
- **제약 로직 통합**: 특수 가구 판별 함수로 재사용성 확보

### 🔧 호환성
- **기존 프로젝트**: 모든 기존 가구 정상 작동
- **시스템 확장**: 기존 좌우 비대칭 시스템 변경 없이 신규 기능 추가
- **UI 호환성**: 기존 제약 메시지 구조 유지하며 텍스트만 확장

### 🎯 사용자 혜택
- **공간 활용 극대화**: 바지걸이+서랍+옷장을 한 번에 배치
- **실용적 구조**: 바지걸이 564mm 내경으로 실제 사용에 최적화
- **혼동 방지**: 배치 불가능한 상황에서는 아예 선택 옵션 제공 안함
- **구조 보호**: 특수 가구 배치 후 실수로 구조 파괴하는 것 방지

---

## 🎯 v1.6.0 - 개별 가구 깊이 시스템 및 스타일러 조건부 노출 (2025-07-01)

### ✨ 새로운 기능
- **개별 가구 기본 깊이 시스템**: 가구별 맞춤형 깊이 설정 지원
  - `ModuleData` 인터페이스에 `defaultDepth?: number` 필드 추가
  - 가구 타입별 최적화된 기본 깊이 자동 적용
  - 드래그앤드롭 시 개별 가구의 `defaultDepth`를 `customDepth`로 자동 설정
- **싱글 타입1 최적화**: 2단서랍+옷장 가구에 580mm 기본 깊이 적용
  - 기존 전역 780mm에서 서랍장 특성에 맞는 580mm로 개선
  - 현실적이고 실용적인 깊이로 사용성 향상
- **스타일러 가구 조건부 노출**: 스마트 필터링으로 배치 불가능한 상황 사전 차단
  - 슬롯폭 550mm 이상일 때만 듀얼 타입5 스타일러 가구 표시
  - 컬럼 수/공간 폭 변경 시 동적 필터링 자동 적용
  - 사용자 혼동 방지 및 직관적인 가구 선택 환경 제공

### 🔧 핵심 문제 해결
- **3D 뷰어 깊이 불일치 해결**: 가구 리스트 표시 깊이와 실제 3D 렌더링 깊이 완벽 일치
  - 근본 원인 발견: `useFurnitureDragHandlers` 미사용, `SlotDropZones`에서 직접 처리
  - `SlotDropZones.tsx`에서 `newModule` 생성 시 `customDepth` 필드 추가
  - 가구 생성부터 3D 렌더링까지 전 과정의 데이터 일관성 확보
- **UI 컴포넌트 간 일관성**: 모든 가구 관련 UI에서 통일된 깊이 값 표시
  - `ModuleItem.tsx`: 가구 리스트에서 `defaultDepth` 우선 표시
  - `PlacedModulePropertiesPanel.tsx`: 속성 편집 시 `defaultDepth` 반영
  - `PlacedFurnitureList.tsx`: 배치된 가구 목록에서 정확한 깊이 표시

### 🏗️ 시스템 설계 개선
- **논리적 일관성 확보**: 이중 안전장치로 완벽한 사용자 경험 보장
  ```
  사전 예방 (조건부 노출): 배치 불가능한 조건에서 리스트 숨김
         ↓
  사후 보호 (변경 제한): 배치 후 조건 파괴할 수 있는 변경 차단
  ```
- **데이터 흐름 최적화**: 가구 생성 → 리스트 표시 → 드래그앤드롭 → 3D 렌더링
  - 각 단계에서 일관된 `defaultDepth` 처리
  - 복잡한 프롭 드릴링 없이 컴포넌트별 직접 처리
- **스마트 필터링 알고리즘**: 실시간 슬롯폭 계산 기반 동적 가구 목록
  ```typescript
  // 스타일러 최소 폭 요구사항 체크
  if (module.id.includes('dual-drawer-styler-') && columnWidth < 550) {
    return acc; // 리스트에서 제외
  }
  ```

### 🎨 사용자 경험 향상
- **직관적 가구 선택**: 배치 불가능한 가구는 선택 옵션에서 제외
- **정확한 깊이 표시**: 모든 UI에서 실제 가구 깊이와 일치하는 값 표시
- **혼동 방지**: "선택했는데 배치 안됨" 상황 원천 차단
- **현실적 깊이**: 가구 타입별 최적화된 깊이로 실제 제작 시 유용성 증대

### 🔧 기술적 구현
- **타입 안전성**: `ModuleData` 인터페이스 확장으로 컴파일 타임 검증
- **성능 최적화**: 조건부 렌더링으로 불필요한 가구 옵션 표시 방지
- **메모리 효율성**: 동적 필터링으로 렌더링 대상 최소화
- **확장성**: 새로운 가구 타입 추가 시 `defaultDepth` 설정만으로 즉시 적용

### 📊 개발 통계
- **개발 기간**: 2025-07-01 (1일 집중 개발)
- **커밋 해시**: `4eaaa31`
- **파일 변경**: 8개 파일 수정 (125줄 추가, 27줄 삭제)
- **새 가구 모듈**: `dual-drawer-pantshanger` 시리즈 (400-800mm)
- **제약 로직 통합**: 특수 가구 판별 함수로 재사용성 확보

### 🔧 호환성
- **기존 프로젝트**: 모든 기존 가구 정상 작동, `defaultDepth` 미설정 시 기본값 사용
- **새로운 가구**: `defaultDepth` 설정 가구는 즉시 최적화된 깊이 적용
- **마이그레이션**: 자동 적용, 수동 작업 불필요

### 🎯 사용자 혜택
- **정확한 설계**: 가구 리스트와 3D 뷰어의 완벽한 일치로 신뢰성 향상
- **효율적 작업**: 배치 불가능한 옵션 제거로 빠른 가구 선택
- **현실적 제작**: 가구별 최적 깊이로 실제 제작 시 유용성 증대
- **직관적 인터페이스**: 논리적 일관성으로 예측 가능한 시스템 동작

### 🔮 향후 계획
- **추가 이미지 최적화**: 더 고품질 썸네일 이미지 적용
- **애니메이션 확장**: 드래그 시작/종료 시 시각적 피드백 강화
- **필터링 기능**: 가구 타입별 고급 필터링 옵션 추가
- **즐겨찾기 시스템**: 자주 사용하는 가구 즐겨찾기 기능

---

## 🎯 v1.5.0 - 2D 뷰 방향 전환 시스템 구현 (2025-06-30)

### ✨ 새로운 기능
- **4방향 2D 뷰 시스템**: 정면/좌측/우측/상단 방향 자유 전환
  - 각 방향별 최적 카메라 위치 자동 계산
  - 2D 모드에서 다각도 가구 설계 지원
  - localStorage 지속화로 선택 방향 유지
- **직관적 방향 선택기**: 십자가 형태의 방향 버튼 UI
  ```
      ↑ (상단)
  ←  ⬜  →
  (좌측)(정면)(우측)
  ```
- **UI 레이아웃 개선**: 문 열기/닫기 버튼을 메인 헤더로 통합
  - 2D/3D 토글, 문 제어, 저장 버튼이 한 줄에 배치
  - 더 일관된 사용자 인터페이스 경험

### 🔧 상단 뷰 정확도 개선
- **가구 중복 렌더링 문제 해결**: 카메라 z축 위치 최적화
- **완전 수직 뷰 지원**: OrbitControls 각도 제한 해제
- **정확한 평면도**: z축 0 지점에서 완벽한 수직 시점 제공

### 🎨 UI/UX 향상
- **방향별 아이콘**: 좌측(←), 우측(→), 정면(⬜), 상단(↑) 직관적 표현
- **활성 상태 시각화**: 현재 선택 방향을 파란색으로 명확히 표시
- **반응형 디자인**: 모바일 환경에서도 최적화된 버튼 크기
- **마우스 호버 효과**: 확대 애니메이션으로 상호작용 피드백

### 🏗️ 기술적 구현
- **상태 관리 확장**: UIStore에 View2DDirection 타입 및 관련 액션 추가
- **카메라 시스템 개선**: 방향별 카메라 위치 계산 로직 구현
- **OrbitControls 최적화**: 2D 모드에서 회전/팬 비활성화, 줌만 허용
- **성능 최적화**: useCallback으로 카메라 위치 계산 메모이제이션

### 📊 개발 통계
- **개발 기간**: 2025-06-30 (1일 집중 개발)
- **파일 변경**: 8개 파일 수정
- **새 컴포넌트**: ViewDirectionSelector (독립 컴포넌트)
- **코드 품질**: 한글 주석으로 가독성 향상

### 🔧 호환성
- **기존 프로젝트**: 모든 기존 프로젝트 정상 작동
- **기본 설정**: 정면 뷰가 기본값으로 설정
- **브라우저 지원**: 모든 모던 브라우저에서 localStorage 지원

### 🎯 사용자 혜택
- **설계 효율성**: 한 번에 4방향에서 가구 배치 확인 가능
- **정확한 평면도**: 상단 뷰로 정확한 레이아웃 설계
- **직관적 조작**: 실제 방향과 일치하는 버튼 배치
- **일관된 인터페이스**: 통합된 헤더로 더 깔끔한 작업 환경

---

## 🐛 v1.4.1 - 컬럼 수 설정 버그 수정 & 새창 저장 동기화 개선 (2025-06-30)

### 🐛 버그 수정
- **컬럼 수 설정 범위 오류**: 컬럼 4개→6개로 변경 후 저장/로딩 시 잘못된 범위(6~11) 표시 문제 해결
  - 올바른 범위(4~7)로 정상 표시
  - derivedSpaceStore 재계산 타이밍 개선
  - useBaseCalculations에서 internalWidth 불일치 감지 시 재계산 강제
- **Firebase 인증 타임아웃 경고**: 정상 인증 완료 후에도 발생하는 경고 메시지 해결
  - 클로저 캡처 문제로 인한 잘못된 상태 체크 수정
  - 함수형 업데이트로 실제 현재 상태 확인하도록 개선

### ✨ 새로운 기능
- **새창 저장 동기화**: BroadcastChannel API 구현으로 창 간 실시간 동기화
  - 새창에서 프로젝트 저장 시 원래 대시보드 자동 새로고침
  - 복잡도 낮고 모든 모던 브라우저 지원
  - Configurator와 Step0에서 저장 성공 시 메시지 전송

### 🔧 기술적 개선
- **코드 품질 향상**: 린트 에러 수정 및 불필요한 eslint-disable 제거
- **디버깅 로그 정리**: 개발 중 상세 로그 제거로 깔끔한 콘솔 출력
  - Room.tsx 재질 생성 로그 제거
  - derivedSpaceStore, BaseControls, useBaseCalculations 디버깅 로그 정리
- **의존성 배열 최적화**: useBaseCalculations의 useMemo 중복 제거

### 📝 문서 업데이트
- **CHANGELOG.md**: 2025-06-23 ~ 2025-06-27 변경사항 상세 기록
- **RELEASE_NOTES.md**: v1.4.0 릴리즈 노트 추가
- **변경 이력**: 최근 듀얼 가구 시스템, 서랍 개선 등 모든 변경사항 문서화

### 📊 변경 통계
- **커밋**: `5619d87`
- **파일 변경**: 9개 파일 수정
- **코드 변경**: +270줄, -21줄 (순 증가 249줄)
- **주요 개선**: BroadcastChannel 동기화, derivedSpaceStore 재계산 로직, Firebase 인증 안정성

### 🔧 호환성
- **기존 프로젝트**: 모든 기존 프로젝트 정상 작동
- **새로운 가구**: `defaultDepth` 설정 가구는 즉시 최적화된 깊이 적용
- **마이그레이션**: 자동 적용, 수동 작업 불필요

### 🎯 사용자 혜택
- **정확한 설계**: 가구 리스트와 3D 뷰어의 완벽한 일치로 신뢰성 향상
- **효율적 작업**: 배치 불가능한 옵션 제거로 빠른 가구 선택
- **현실적 제작**: 가구별 최적 깊이로 실제 제작 시 유용성 증대
- **직관적 인터페이스**: 논리적 일관성으로 예측 가능한 시스템 동작

### 🔮 향후 계획
- **추가 이미지 최적화**: 더 고품질 썸네일 이미지 적용
- **애니메이션 확장**: 드래그 시작/종료 시 시각적 피드백 강화
- **필터링 기능**: 가구 타입별 고급 필터링 옵션 추가
- **즐겨찾기 시스템**: 자주 사용하는 가구 즐겨찾기 기능

---

## 🎯 v1.4.0 - 가구 시스템 대폭 확장 및 UI 개선 (2025-06-27)

### ✨ 새로운 기능
- **듀얼 가구 모듈**: 2칸 폭을 차지하는 복합 가구 시스템 구현
  - 듀얼 서랍+스타일러 가구 모듈 추가
  - 기존 단일 모듈과 호환되는 배치 시스템
- **가구 타입 재설계**: 타입2 가구를 3단 선반장에서 2단 옷장으로 변경
  - 사용자 설정 가능한 높이 시스템
  - 행거바 지원으로 의류 보관 최적화
- **스타일러장 시스템**: 임시 비활성화로 안정성 확보

### 🔧 서랍 시스템 대폭 개선
- **3D 모델링 정밀화**: 서랍 각 구성 요소의 정확한 치수 적용
- **핸들 시스템**: 위치 및 크기 최적화로 현실감 증대
- **슬라이드 레일**: 시각화 추가로 기능적 표현 개선
- **서랍 깊이**: 계산 로직 정밀화로 공간 활용도 향상

### 🎨 UI/UX 개선사항
- **서라운드 타입 선택기**: 사용 가능한 옵션만 표시
- **컬럼 카운트 제어**: 더 직관적인 컬럼 수 조정 인터페이스
- **슬롯 하이라이트**: 드롭존 표시 최적화
- **색상 시스템**: Room.tsx에서 재질 색상 오류 완전 해결

### 🏗️ 기술적 개선
- **BoxModule 대규모 리팩토링**: 169줄 업데이트로 성능 및 정확성 향상
- **DrawerRenderer 전면 개선**: 96줄 리팩토링으로 3D 렌더링 품질 향상
- **fromBottom 높이 계산 방식 제거**: 불필요한 복잡성 제거
- **Three.js 유틸리티 확장**: 새로운 헬퍼 함수 추가

### 📊 개발 통계
- **개발 기간**: 2025-06-23 ~ 2025-06-27 (5일)
- **총 커밋**: 10개 주요 커밋
- **파일 변경**: 20+ 파일 수정
- **코드 변경**: +500줄, -200줄

### 🔧 호환성
- **기존 프로젝트**: 모든 기존 가구 정상 작동
- **새로운 가구**: 듀얼 모듈 시스템과 기존 시스템 완전 호환
- **마이그레이션**: 자동 업그레이드, 수동 작업 불필요

### 📝 문서 업데이트
- **FURNITURE_SPECIFICATIONS.md**: 가구 사양 대폭 개선
- **개발 가이드라인**: .cursorrules 파일 추가
- **CHANGELOG.md**: 상세한 변경 이력 기록

---

## 🔧 v1.3.2 - 가구 패널 두께 표준 변경 (2025-06-21)

### 📏 제품 사양 변경
- **패널 두께 표준화**: 모든 가구 패널 두께를 20mm에서 18mm로 변경
- **업계 표준 준수**: 일반적인 가구 제작 표준인 18mm 합판 두께로 통일
- **비용 효율성**: 얇아진 패널로 재료비 절감 및 제작 효율성 개선

### 🔧 주요 변경사항
- **백패널 두께**: 20mm → 18mm
- **엔드패널 두께**: 20mm → 18mm  
- **도어 두께**: 20mm → 18mm
- **힌지 오프셋**: 10mm → 9mm (패널 두께의 절반)
- **공간 전체 깊이**: 600mm → 598mm (내경 580mm + 백패널 18mm)

### 🎯 사용자 혜택
- **더 넓은 가구 공간**: 백패널이 2mm 얇아져 가구 배치 공간 확대
- **현실적인 제작 비용**: 실제 가구 제작 시 표준 18mm 합판 사용으로 비용 절감
- **업계 표준 준수**: 가구 제작업체와의 호환성 개선

### 🔧 기술적 개선
- **일관된 두께 적용**: 모든 가구 요소(벽면, 선반, 서랍, 도어)에 18mm 두께 통일
- **정확한 힌지 계산**: 도어 힌지 위치가 패널 두께에 맞춰 자동 조정
- **DXF 내보내기 반영**: 변경된 패널 두께가 도면 생성에도 자동 적용
- **3D 렌더링 정확성**: 모든 3D 가구 모델이 새로운 두께로 렌더링

### 📝 호환성
- **기존 프로젝트**: 이미 저장된 프로젝트는 20mm 기준으로 유지됨
- **새 프로젝트**: 모든 새로운 가구는 18mm 두께로 생성됨
- **마이그레이션**: 기존 프로젝트를 새로 열면 자동으로 18mm 기준으로 재계산됨

### 📊 변경 통계
- **커밋**: `패널 두께 18mm 적용`
- **파일 변경**: 8개 파일 수정
- **코드 변경**: 상수, 계산 로직, UI 텍스트 업데이트
- **가구 모듈**: 10개 모든 가구의 wallThickness 속성 변경

---

## 🛠️ v1.3.1 - 키보드 이동 로직 개선 (2025-06-21)

### 🔧 기능 개선
- **스마트 키보드 이동**: 기존 가구 삭제 대신 빈 슬롯으로 스마트 이동
- **알고리즘 통합**: 드래그 앤 드롭과 동일한 `findNextAvailableSlot` 재사용
- **순차적 검색**: 바로 옆 칸부터 빈 슬롯을 체계적으로 탐색
- **타입별 최적화**: 싱글 가구(1칸), 듀얼 가구(2칸 연속) 각각 최적화

### 🐛 버그 수정
- 키보드 이동 시 기존 가구 삭제 문제 해결
- 충돌 상황에서 가구 보존 로직 적용
- 가구 이동 실패 시 안전한 예외 처리

### 🔧 기술적 개선
- `useFurnitureKeyboard.ts`: 66줄 리팩토링으로 로직 간소화
- `PlacedFurnitureContainer.tsx`: 키보드 핸들러 최적화
- 드래그 앤 드롭 로직과 일관성 확보

### 📊 변경 통계
- **커밋**: `5c010f8`
- **파일 변경**: 2개 파일 수정
- **코드 변경**: +35줄, -39줄 (순 감소 4줄)

---

## 🚀 v1.3.0 - 가구 충돌 처리 및 UX 개선 (2025-06-21)

### ✨ 새로운 기능
- **가구 보존 시스템**: 컬럼 수 변경 시 기존 가구 삭제 대신 안전한 재배치
- **스마트 충돌 처리**: 새 가구 배치 시 기존 가구와의 충돌 방지
- **새창 프로젝트 생성**: 대시보드 유지하면서 새 프로젝트 작업 가능
- **프로젝트 썸네일**: 자동 생성되는 3D 프리뷰 이미지

### 🐛 버그 수정
- 슬롯 인덱스 계산 오류로 인한 가구 위치 문제 해결
- 하이픈 포함 모듈명 패턴 매칭 개선
- 듀얼 슬롯 가구의 정확한 충돌 범위 계산

### 🔧 기술적 개선
- `slotAvailability.ts`: 슬롯 가용성 검사 유틸리티 추가
- `materialRefresh.ts`: 재질 색상 강제 새로고침 유틸리티 추가
- 팝업 차단 방지 로직 구현
- 프로젝트 제목 "가구 YYMMDD" 형식 표준화

### 📊 변경 통계
- **커밋**: `5f146c8`, `022c672`, `54cf56f`
- **파일 변경**: 9개 파일 수정, 2개 추가, 2개 삭제
- **코드 변경**: +322줄, -218줄

---

## 🔥 v1.2.0 - Firebase 통합 및 프로젝트 관리 (2025-06-20)

### ✨ 새로운 기능
- **Firebase 인증**: 이메일/비밀번호, 구글 로그인 지원
- **클라우드 저장**: Firestore 기반 프로젝트 저장/불러오기
- **사용자별 프로젝트 관리**: 개인 프로젝트 목록 및 권한 관리
- **실시간 동기화**: 프로젝트 변경사항 자동 저장

### 🔧 기술적 개선
- React Hooks 의존성 배열 최적화
- 가구 재배치 로직 안정성 향상
- Firebase 보안 규칙 설정
- 프로젝트 메타데이터 구조 설계

### 📊 변경 통계
- **커밋**: `8e2f2e4`, `4522c70`
- **새 파일**: Firebase 설정, 인증, 프로젝트 CRUD
- **환경 설정**: `.env.local` Firebase 구성

---

## 🏗️ v1.1.0 - 아키텍처 대규모 리팩토링 (2025-06-20)

### ✨ 주요 변경사항
- **Context → Zustand 전환**: 모든 상태 관리를 Zustand Store로 통합
- **단일 책임 원칙**: editorStore를 projectStore, spaceConfigStore로 분리
- **성능 최적화**: 선택적 구독으로 불필요한 리렌더링 방지

### 🔧 기술적 개선
- **29개 파일 변경**: 전면적인 상태 관리 구조 개선
- **9개 파일 삭제**: 모든 Context Provider 제거
- **타입 안전성**: 모든 인터페이스 호환성 유지
- **번들 크기 최적화**: 274kB → 273.28kB

### 📊 변경 통계
- **커밋**: `54ff105`, `61a2d3a`, `b9ef599`
- **코드 변경**: +303줄, -565줄 (순 감소 262줄)
- **아키텍처**: Context Provider → Zustand Store

---

## 🎨 v1.0.0 - 핵심 기능 완성 (2025-06-14 ~ 2025-06-18)

### ✨ 주요 기능
- **3D 가구 에디터**: React Three Fiber 기반 실시간 3D 렌더링
- **드래그 앤 드롭**: 직관적인 가구 배치 시스템
- **슬롯 기반 배치**: 정확한 위치 스냅 및 충돌 감지
- **DXF 도면 생성**: CAD 호환 도면 파일 생성
- **측면도 기능**: 다각도 가구 설계 지원

### 🔧 기술 스택
- **Frontend**: React 18, TypeScript, Vite
- **3D 렌더링**: React Three Fiber, Three.js
- **상태 관리**: Zustand Store
- **스타일링**: CSS Modules
- **도면 생성**: DXF 라이브러리

### 🏗️ 아키텍처
- **컴포넌트 기반**: 재사용 가능한 모듈화 구조
- **레이어 분리**: UI, 로직, 3D 렌더링 계층 분리
- **타입 안전성**: 완전한 TypeScript 지원

### 📊 개발 통계
- **개발 기간**: 2025-06-13 ~ 2025-06-18 (6일)
- **총 커밋**: 15개 주요 커밋
- **핵심 파일**: 50+ 컴포넌트 및 유틸리티

---

## 📈 개발 로드맵

### 🎯 다음 버전 계획 (v1.4.0)
- **Undo/Redo 기능**: Zustand temporal 미들웨어 적용
- **협업 기능**: 실시간 다중 사용자 편집
- **고급 재질**: PBR 재질 및 텍스처 지원
- **모바일 최적화**: 터치 기반 인터페이스

### 🔮 장기 계획 (v2.0.0)
- **AI 설계 어시스턴트**: 자동 가구 배치 제안
- **VR/AR 지원**: 몰입형 3D 설계 환경
- **클라우드 렌더링**: 고품질 렌더링 서비스
- **마켓플레이스**: 사용자 제작 가구 모듈 공유

---

## 🤝 기여 가이드

### 📝 커밋 메시지 규칙
```
<type>(<scope>): <description>

Types:
- feat: 새로운 기능
- fix: 버그 수정  
- refactor: 리팩토링
- docs: 문서 업데이트
- style: 코드 스타일 변경
- test: 테스트 추가/수정
- chore: 빌드/도구 설정
```

### 🔄 브랜치 전략
- `main`: 안정 버전
- `feature/*`: 새 기능 개발
- `fix/*`: 버그 수정
- `refactor/*`: 리팩토링

### 📋 릴리즈 프로세스
1. 기능 개발 완료
2. 테스트 및 검증
3. CHANGELOG.md 업데이트
4. 버전 태그 생성
5. 릴리즈 노트 작성

---

## 📞 문의 및 지원

- **개발자**: dani
- **프로젝트 저장소**: GitHub Repository
- **문서**: `/docs` 폴더 참조
- **이슈 리포트**: GitHub Issues

---

*마지막 업데이트: 2025-06-30 (v1.5.0)* 