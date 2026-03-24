# 프로젝트 완성 계획서

> **작성일**: 2025-07-09
> **목표 완료일**: 2025-04-30 (※ 현재 날짜 기준 이미 지남 — 실제 목표를 재조정 필요)
> **현재 완성도**: 약 88%
> **총 코드**: 224,917줄 / 593개 TS/TSX 파일

---

## 현재 상태 요약

| 항목 | 수치 |
|------|------|
| 전체 기능 완성도 | ~88% |
| ESLint 에러 | 2,359개 |
| console.log 잔존 | 2,366개 (257개 파일) |
| TypeScript any 타입 | 600+개 |
| TODO/FIXME 주석 | 6개 |
| 미구현 핵심 함수 | 3개 |
| 거대 컴포넌트 (>1500줄) | 5개 |

---

## Phase 1: 긴급 버그 수정 및 안정화 (1주차)

### 1.1 현재 진행 중인 버그 수정 (Day 1-2)

#### 도어 Y축 위치 버그
- **파일**: `src/editor/shared/viewer3d/components/modules/DoorModule.tsx`
- **문제**: 상부/하부/사이드 프레임 축소 시 도어 Y 위치가 올라감
- **원인**: FurnitureItem의 group center Y가 변하는데 도어 local position이 보정되지 않음
- **관련 파일**:
  - `src/editor/shared/viewer3d/components/elements/furniture/FurnitureItem.tsx` (Y 계산: ~line 1400)
  - `src/editor/shared/viewer3d/components/modules/BoxModule.tsx` (parentGroupY 전달)
- **작업**:
  - [ ] FurnitureItem과 DoorModule의 debug log로 정확한 값 추적
  - [ ] 절대좌표 기반 도어 Y 계산 로직 재설계
  - [ ] 모든 프레임 조합(상부/하부/사이드 변경)에서 테스트

#### 도어 Close/Open 버튼 UI
- **파일**: `src/editor/Configurator/index.tsx` (~line 6148)
- **문제**: 2D 다크모드에서 버튼 배경/글자색 문제
- **작업**:
  - [ ] viewerArea/viewer 배경과의 z-index 충돌 해결
  - [ ] 3D(항상 밝은 배경) / 2D dark / 2D light 3가지 경우 스타일 확인

#### 옷봉 CNC 옵티마이저 표시
- **파일**: `src/editor/CNCOptimizer/hooks/useLivePanelData.ts`
- **문제**: 선반 하이라이트 시 옷봉이 옵티마이저에 나오지 않음
- **작업**:
  - [ ] 고정선반에 옷봉 연결 로직 확인
  - [ ] useLivePanelData에서 rod 패널 생성 조건 디버깅

### 1.2 디버그 코드 정리 (Day 2-3)

- **파일들**: 257개 파일에 2,366개 console.log
- **작업**:
  - [ ] `FurnitureItem.tsx` 디버그 로그 제거 (~line 1408)
  - [ ] `DoorModule.tsx` 디버그 로그 제거
  - [ ] `AdjustableFootsRenderer.tsx` 디버그 로그 제거
  - [ ] `useLivePanelData.ts`의 `[BORING DEBUG]`, `[OPT BORING DEBUG]` 로그 제거
  - [ ] `ThumbnailImage.tsx:51` 강제 재생성 플래그 제거
  - [ ] `designs.repo.ts`의 디자인 파일 로드 경로 추적 로그 정리
  - [ ] `ThemeContext.tsx` 테마 적용 추적 로그 제거
  - [ ] `AuthProvider.tsx` 인증 상태 로깅 제거
  - [ ] 나머지 파일들의 console.log → 조건부 로깅 또는 제거

### 1.3 Dead Code 제거 (Day 3)

- [ ] `designs.repo.ts:58,102` — `if (false)` 블록 75줄 삭제
- [ ] `App.tsx` 미사용 import 제거 (TestDashboard, SettingsIcon, CNCOptimizer, CNCOptimizerNew, disposeWebGLCanvases)
- [ ] `Chatbot.tsx:4` — faqData 미사용 import 제거
- [ ] `DashboardFileTree.tsx` — handleCreateFolder, hasRootDesignFile 미사용 제거
- [ ] `FileTree.tsx` — 6개 미사용 import 제거
- [ ] 전체 미사용 import/변수 400+개 정리

### 1.4 TypeScript/ESLint 기본 정리 (Day 4-5)

- [ ] `react-hooks/exhaustive-deps` 경고 40개 수정
- [ ] `prefer-const` 에러 10개 수정
- [ ] `no-case-declarations` — FileTree.tsx:606 수정
- [ ] `no-prototype-builtins` — Object.hasOwn으로 변경 (2개)
- [ ] `no-constant-condition` — designs.repo.ts (2개)

---

## Phase 2: 미구현 핵심 기능 완성 (2주차)

### 2.1 템플릿 시스템 구현 (Day 6-8)

#### applyTemplate() 함수 구현
- **파일**: `src/services/template.service.ts` (line 524)
- **현재 상태**: console.log만 실행하고 실제 로직 없음
- **작업**:
  - [ ] applyData 객체에서 spaceInfo, placedModules 추출
  - [ ] 기존 프로젝트에 템플릿 데이터 병합 로직 구현
  - [ ] 충돌 처리 (기존 가구 vs 템플릿 가구)
  - [ ] Firebase에 업데이트 저장
  - [ ] 템플릿 적용 후 뷰어 새로고침

#### 사용자 템플릿 저장/로드
- **작업**:
  - [ ] 현재 프로젝트를 템플릿으로 저장하는 UI 추가
  - [ ] 사용자별 템플릿 목록 Firebase 컬렉션 설계
  - [ ] 템플릿 미리보기 섬네일 생성
  - [ ] 템플릿 갤러리 UI 컴포넌트

### 2.2 프로젝트 삭제 시 하위 데이터 정리 (Day 8)

- **파일**: `src/repositories/project.repository.ts` (line 101)
- **작업**:
  - [ ] designs 하위 컬렉션 삭제 로직 추가
  - [ ] folders 하위 컬렉션 삭제 로직 추가
  - [ ] Storage 파일(섬네일 등) 정리 로직 추가
  - [ ] 공유 링크 데이터 정리
  - [ ] 삭제 트랜잭션으로 원자성 보장

### 2.3 CustomFurnitureModule 3D 모델 로드 (Day 9-10)

- **파일**: `src/editor/shared/viewer3d/components/modules/types/CustomFurnitureModule.tsx` (line 131)
- **작업**:
  - [ ] Firebase Storage에서 GLB/GLTF 모델 로드 로직 구현
  - [ ] IndexedDB 캐싱으로 오프라인 지원
  - [ ] 로드 중 로딩 인디케이터 표시
  - [ ] 로드 실패 시 폴백 (기본 박스 메시)
  - [ ] 모델 메모리 관리 (dispose)

### 2.4 CSV 내보내기 패널 두께 전달 (Day 10)

- **파일**: `src/editor/CNCOptimizer/utils/csvExporter.ts` (line 355)
- **작업**:
  - [ ] panelThickness를 caller에서 전달받도록 인터페이스 수정
  - [ ] 호출부 수정
  - [ ] 내보내기 결과 검증

---

## Phase 3: 프레임/도어/CNC 고도화 (3주차)

### 3.1 프레임 시스템 안정화 (Day 11-13)

- **파일들**:
  - `src/editor/shared/utils/frameMergeUtils.ts`
  - `src/editor/CNCOptimizer/hooks/useLivePanelData.ts`
  - `src/editor/shared/viewer3d/components/elements/Room.tsx`
- **작업**:
  - [ ] 프레임 병합 로직 엣지 케이스 테스트 (단내림 + 병합, 커튼박스 + 병합)
  - [ ] 프레임 병합 상태가 CNC 옵티마이저에 정확히 반영되는지 검증
  - [ ] 프레임 높이/너비가 변경될 때 가구 높이 자동 재계산 검증
  - [ ] EP(끝판) 렌더링이 프레임 병합 시 정확한지 확인
  - [ ] 사이드 프레임 + 상하부 프레임 조합 테스트

### 3.2 도어 시스템 안정화 (Day 13-14)

- **파일들**:
  - `src/editor/shared/viewer3d/components/modules/DoorModule.tsx`
  - `src/editor/shared/viewer3d/components/elements/furniture/FurnitureItem.tsx`
- **작업**:
  - [ ] 모든 프레임 조합에서 도어 위치 정확성 검증
  - [ ] 도어 갭(상단/하단) 조절 시 실시간 반영 확인
  - [ ] 듀얼 슬롯 가구의 도어 렌더링 정확성
  - [ ] 커스텀 가구의 도어 호환성
  - [ ] 도어 보링 위치 정확성 (hingeCalculator.ts)

### 3.3 CNC 옵티마이저 보링 고도화 (Day 14-15)

- **파일들**:
  - `src/editor/CNCOptimizer/domain/boring/`
  - `src/editor/CNCOptimizer/hooks/useLivePanelData.ts`
- **작업**:
  - [ ] 힌지 보링 위치 정확성 전수 검증
  - [ ] 다보 보링 위치 정확성 검증
  - [ ] 보링 좌표계 변환 (가구 좌표 → 패널 좌표) 정확성
  - [ ] 보링 시각화(CuttingLayoutPreview2)에서 올바르게 표시되는지 확인
  - [ ] CSV 내보내기 시 보링 데이터 포함 여부

---

## Phase 4: 2D 뷰어 및 내보내기 강화 (4주차)

### 4.1 2D 뷰어 성능 최적화 (Day 16-17)

- **파일들**:
  - `src/editor/shared/viewer3d/components/base/hooks/useCameraManager.ts`
  - `src/editor/Configurator/components/ViewerControls.tsx`
- **작업**:
  - [ ] 2D 렌더링 성능 프로파일링
  - [ ] 불필요한 리렌더링 제거 (React.memo, useMemo 최적화)
  - [ ] 치수선 렌더링 최적화
  - [ ] 줌/팬 동작 부드러움 개선
  - [ ] 2D 다크/라이트 테마 전환 시 깜빡임 제거

### 4.2 DXF 내보내기 개선 (Day 17-18)

- **파일**: `src/editor/shared/utils/dxfGenerator.ts`
- **작업**:
  - [ ] 복잡한 도형 처리 시 오류 수정
  - [ ] AutoCAD 2024 호환성 테스트
  - [ ] 치수선 텍스트 한글 인코딩 안정화
  - [ ] 레이어 구조 최적화 (가구/프레임/도어/치수 레이어 분리)

### 4.3 PDF 내보내기 개선 (Day 18-20)

- **파일**: `src/editor/shared/components/PDFTemplatePreview/PDFTemplatePreview.tsx`
- **작업**:
  - [ ] 한글 폰트 완벽 지원 (커스텀 폰트 임베딩)
  - [ ] 다중 페이지 자동 레이아웃
  - [ ] 견적서 항목별 자동 정렬
  - [ ] PDF 템플릿 프리셋 (기본/상세/간략)
  - [ ] CNC 재단 레이아웃 PDF 포함

---

## Phase 5: 모바일 및 UX 개선 (5주차)

### 5.1 모바일 UI 최적화 (Day 21-23)

- **파일들**:
  - `src/editor/Configurator/index.tsx` (모바일 분기)
  - `src/styles/responsive.module.css`
  - `src/components/TouchUI/`
- **작업**:
  - [ ] 터치 제스처 개선 (핀치 줌 정확도, 2핑거 회전)
  - [ ] 모바일 가구 배치 UX 개선 (드래그 정확도)
  - [ ] 모바일 사이드바 슬라이드 동작 부드러움 개선
  - [ ] 숫자 입력 시 키패드 자동 표시
  - [ ] 모바일 3D 뷰어 성능 최적화 (LOD, 텍스처 해상도 다운)
  - [ ] 태블릿 레이아웃 최적화 (768px~1024px)

### 5.2 전반적 UX 개선 (Day 23-25)

- **작업**:
  - [ ] Undo/Redo 기능 안정성 검증
  - [ ] 키보드 단축키 지원 확대
  - [ ] 로딩 상태 인디케이터 통일
  - [ ] 에러 메시지 사용자 친화적으로 변경
  - [ ] 툴팁 시스템 통일
  - [ ] 가구 선택/하이라이트 시각 피드백 강화

---

## Phase 6: AR 및 고급 기능 (6주차)

### 6.1 AR 기능 강화 (Day 26-28)

- **파일들**:
  - `src/editor/shared/ar/components/ARViewer.tsx`
  - `src/editor/shared/ar/components/SimpleARViewer.tsx`
  - `src/editor/shared/ar/components/QRCodeGenerator.tsx`
- **작업**:
  - [ ] AR 평면 감지 정확도 개선
  - [ ] AR에서 가구 배치/이동/회전 터치 인터랙션
  - [ ] AR 스케일 조절 (실물 크기 매칭)
  - [ ] iOS Safari WebXR 호환성 확인 및 수정
  - [ ] AR 세션 스크린샷 캡처
  - [ ] QR 코드 → AR 뷰어 연결 플로우 테스트

### 6.2 GLB 내보내기 최적화 (Day 28-29)

- **파일**: `src/editor/shared/viewer3d/hooks/useGLBExport.ts`
- **작업**:
  - [ ] 메시 최적화 (중복 버텍스 제거, 인덱스 최적화)
  - [ ] 텍스처 압축 (KTX2 포맷)
  - [ ] 파일 크기 목표: 50MB 이하
  - [ ] Draco 압축 적용

### 6.3 챗봇/AI 기능 결정 (Day 29-30)

- **파일**: `src/components/Chatbot/Chatbot.tsx`
- **작업**:
  - [ ] 챗봇 기능 범위 결정 (FAQ 기반 vs AI 기반)
  - [ ] FAQ 매칭 로직 구현 (키워드 기반)
  - [ ] 자주 묻는 질문 데이터베이스 구축
  - [ ] 챗봇 UI를 Configurator에 연결
  - [ ] 사용자 피드백 수집 기능

---

## Phase 7: 코드 품질 및 테스트 (7주차)

### 7.1 TypeScript 타입 안정성 (Day 31-33)

- **작업**:
  - [ ] any 타입 600+개 제거 (우선순위별 진행)
    - P0: editorSaveService.ts, firestore.service.ts (핵심 서비스)
    - P1: furnitureStore.ts, template.service.ts (상태 관리)
    - P2: 나머지 파일들
  - [ ] 공통 타입 정의 파일 정리 (`src/types/`)
  - [ ] 스토어 타입 강화 (Zustand 스토어별 strict typing)

### 7.2 거대 컴포넌트 리팩토링 (Day 33-35)

| 파일 | 현재 줄 수 | 목표 | 분해 계획 |
|------|-----------|------|---------|
| CleanCAD2D.tsx | 8,523 | 5개 파일 | CADCanvas, CADTools, CADSelection, CADZoom, CADExport |
| Configurator/index.tsx | 6,883 | 4개 파일 | ConfiguratorLayout, ViewerSection, SidebarManager, DoorManager |
| Room.tsx | 5,761 | 4개 파일 | RoomShell, RoomFrame, RoomBase, RoomCeiling |
| PDFTemplatePreview.tsx | 5,616 | 3개 파일 | PDFLayout, PDFContent, PDFExporter |
| CustomizablePropertiesPanel.tsx | 4,421 | 3개 파일 | PropertiesLayout, SectionEditor, PropertyInput |

- **작업**:
  - [ ] 각 컴포넌트 의존성 분석
  - [ ] 공통 로직 커스텀 훅으로 추출
  - [ ] 단계적 분해 (한 번에 한 컴포넌트씩)
  - [ ] 분해 후 기능 동일성 검증

### 7.3 테스트 작성 (Day 35-37)

- **작업**:
  - [ ] 핵심 비즈니스 로직 단위 테스트
    - `SpaceCalculator` 테스트
    - `ColumnIndexer` 테스트
    - `FurniturePositioner` 테스트
    - `frameMergeUtils` 테스트
    - `surroundGenerator` 테스트
  - [ ] CNC 옵티마이저 테스트
    - `guillotinePacking` 알고리즘 테스트
    - `useLivePanelData` 패널 생성 테스트
    - 보링 좌표 계산 테스트
  - [ ] 스토어 테스트
    - `spaceConfigStore` 상태 변경 테스트
    - `furnitureStore` 가구 배치/제거 테스트
    - `derivedSpaceStore` 계산값 테스트
  - [ ] 목표 커버리지: 핵심 로직 80% 이상

---

## Phase 8: 프로덕션 준비 및 최종 검증 (8주차)

### 8.1 성능 최적화 (Day 38-39)

- **작업**:
  - [ ] 번들 사이즈 분석 및 최적화
  - [ ] Three.js 메모리 누수 점검 (dispose 호출 확인)
  - [ ] React 리렌더링 최적화 (React DevTools Profiler)
  - [ ] 이미지/텍스처 lazy loading
  - [ ] Firebase 쿼리 최적화

### 8.2 보안 점검 (Day 39-40)

- **작업**:
  - [ ] Firebase Security Rules 검토
  - [ ] XSS 취약점 점검 (사용자 입력 새니타이징)
  - [ ] 인증 토큰 관리 검증
  - [ ] 공유 링크 권한 검증
  - [ ] .env 파일 노출 확인

### 8.3 최종 통합 테스트 (Day 41-42)

- **시나리오별 전체 플로우 테스트**:
  - [ ] 신규 프로젝트 생성 → Step0 → 가구 배치 → 도어 설치 → CNC → 내보내기
  - [ ] 기존 프로젝트 로드 → 수정 → 저장
  - [ ] 커스텀 가구 설계 → 저장 → 배치 → CNC
  - [ ] 자유배치 모드 → 서라운드 → 프레임 → 내보내기
  - [ ] 단내림 설정 → 가구 배치 → 도어 → CNC
  - [ ] 모바일에서 전체 플로우
  - [ ] 공유 링크로 접근 → 읽기 전용 확인
  - [ ] 다국어 전환 후 모든 UI 텍스트 확인

### 8.4 도메인 및 SEO 설정 (Day 42-43)

#### 도메인 연결
- **도메인**: `www.tttcraft.com`
- **작업**:
  - [ ] Netlify에 커스텀 도메인 연결 (DNS 설정)
  - [ ] SSL 인증서 자동 발급 확인 (Let's Encrypt)
  - [ ] `tttcraft.com` → `www.tttcraft.com` 리다이렉트 설정
  - [ ] HTTPS 강제 설정

#### 검색엔진 등록
- **구글 서치 콘솔**:
  - [ ] Google Search Console에 `www.tttcraft.com` 사이트 등록
  - [ ] 소유권 확인 (DNS TXT 레코드 또는 HTML 파일)
  - [ ] `sitemap.xml` 제출
  - [ ] 색인 요청
  - [ ] Google Analytics 연동 (GA4 트래킹 코드 삽입)

- **네이버 웹마스터 도구**:
  - [ ] 네이버 서치어드바이저 (`searchadvisor.naver.com`)에 사이트 등록
  - [ ] 소유권 확인 (HTML 메타태그 또는 파일 업로드)
  - [ ] `sitemap.xml` 제출
  - [ ] 네이버 신디케이션 API 설정 (선택)
  - [ ] 네이버 애널리틱스 연동 (선택)

- **기타 검색엔진**:
  - [ ] Bing Webmaster Tools 등록
  - [ ] Daum 검색 등록 확인

#### SEO 메타태그 추가
- **파일**: `index.html`
- **현재 상태**: title만 있고 description, OG 태그 없음
- **작업**:
  - [ ] `<meta name="description">` 추가 (한국어/영어)
  - [ ] `<meta name="keywords">` 추가
  - [ ] Open Graph 태그 추가 (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`)
  - [ ] Twitter Card 태그 추가 (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`)
  - [ ] `<html lang="ko">` 로 변경 (한국어 기본)
  - [ ] canonical URL 설정
  - [ ] 구조화 데이터 (JSON-LD) 추가 — SoftwareApplication 스키마
  - [ ] apple-touch-icon 설정
  - [ ] manifest.json (PWA) 추가

#### sitemap.xml 보강
- **현재 상태**: 루트 URL 1개만 등록
- **작업**:
  - [ ] 랜딩 페이지, 주요 정적 페이지 URL 추가
  - [ ] `<lastmod>` 날짜 추가
  - [ ] 자동 sitemap 생성 스크립트 작성 (빌드 시 자동 갱신)

#### robots.txt 점검
- **현재 상태**: `/dashboard`, `/configurator`, `/step0` 차단 (올바름)
- **작업**:
  - [ ] 크롤링 정책 최종 확인
  - [ ] 불필요한 리소스 차단 추가 (`/api/`, 정적 자산 등)

### 8.5 배포 (Day 43-44)

- **작업**:
  - [ ] Netlify 배포 설정 확인
  - [ ] 환경 변수 프로덕션용 설정
  - [ ] 빌드 최적화 (vite.config.ts 프로덕션 설정)
  - [ ] CDN 캐시 설정
  - [ ] 모니터링 설정 (에러 트래킹)
  - [ ] 배포 후 스모크 테스트
  - [ ] 구글/네이버 색인 확인

---

## 기능별 완성도 현황표

| 기능 | 현재 | 목표 | Phase |
|------|------|------|-------|
| 대시보드/프로젝트 관리 | 95% | 100% | 2 |
| Step0 초기 설정 | 100% | 100% | - |
| 가구 배치 | 100% | 100% | - |
| 커스텀 가구 (My캐비넷) | 90% | 98% | 2 |
| 도어 시스템 | 95% | 100% | 1, 3 |
| 프레임 시스템 | 85% | 98% | 3 |
| 서라운드 | 90% | 95% | 3 |
| 3D 뷰어 | 98% | 100% | 4 |
| 2D 뷰어 | 80% | 95% | 4 |
| CNC 옵티마이저 | 92% | 98% | 3 |
| DXF 내보내기 | 90% | 98% | 4 |
| PDF/인쇄 | 85% | 95% | 4 |
| AR 기능 | 70% | 85% | 6 |
| 재질/색상 | 95% | 98% | - |
| 공간 설정 | 95% | 100% | 3 |
| 모바일 대응 | 75% | 90% | 5 |
| 다국어 | 100% | 100% | - |
| 인증/권한 | 90% | 95% | 8 |
| GLB 내보내기 | 80% | 90% | 6 |
| 챗봇/AI | 50% | 70% | 6 |
| **코드 품질** | **40%** | **85%** | **1, 7** |
| **테스트 커버리지** | **~20%** | **80%** | **7** |
| **SEO/도메인/검색엔진** | **20%** | **100%** | **8** |

---

## 주간 일정 요약

| 주차 | Phase | 핵심 작업 | 예상 작업량 |
|------|-------|---------|-----------|
| 1주차 | Phase 1 | 긴급 버그 수정, 디버그 코드 정리, Dead Code 제거 | 40h |
| 2주차 | Phase 2 | 템플릿 구현, 프로젝트 삭제 완성, 커스텀 가구 모델 로드 | 40h |
| 3주차 | Phase 3 | 프레임/도어/CNC 안정화, 보링 고도화 | 40h |
| 4주차 | Phase 4 | 2D 뷰어 최적화, DXF/PDF 개선 | 40h |
| 5주차 | Phase 5 | 모바일 최적화, UX 개선 | 40h |
| 6주차 | Phase 6 | AR 강화, GLB 최적화, 챗봇 결정 | 40h |
| 7주차 | Phase 7 | 타입 안정성, 리팩토링, 테스트 작성 | 40h |
| 8주차 | Phase 8 | 성능/보안 점검, 통합 테스트, 도메인/SEO/검색엔진 등록, 배포 | 40h |

---

## 위험 요소 및 대응

| 위험 | 영향도 | 대응 방안 |
|------|--------|---------|
| 도어 Y 위치 버그 장기화 | 높음 | Phase 1에서 절대좌표 기반으로 완전 재설계 |
| 거대 컴포넌트 리팩토링 시 회귀 버그 | 높음 | 단계적 분해 + 기능 테스트 병행 |
| AR WebXR 브라우저 호환성 | 중간 | iOS 미지원 시 QR→3D 뷰어 폴백 제공 |
| CNC 보링 좌표 오류 | 높음 | 실제 재단 데이터와 비교 검증 필수 |
| Firebase 비용 증가 | 중간 | 쿼리 최적화 + 캐싱 전략 |
| 모바일 성능 부족 | 중간 | LOD + 텍스처 다운스케일 + 메시 간소화 |

---

## 핵심 파일 참조 맵

### 상태 관리
- `src/store/core/spaceConfigStore.ts` — 공간 설정
- `src/store/core/furnitureStore.ts` — 가구 배치
- `src/store/core/projectStore.ts` — 프로젝트 정보
- `src/store/derivedSpaceStore.ts` — 계산값
- `src/store/uiStore.ts` — UI 상태

### 3D 렌더링
- `src/editor/shared/viewer3d/Space3DView.tsx` — 메인 3D 뷰어
- `src/editor/shared/viewer3d/components/modules/DoorModule.tsx` — 도어
- `src/editor/shared/viewer3d/components/modules/BoxModule.tsx` — 가구 박스
- `src/editor/shared/viewer3d/components/elements/Room.tsx` — 공간/프레임
- `src/editor/shared/viewer3d/components/elements/furniture/FurnitureItem.tsx` — 가구 위치

### CNC/내보내기
- `src/editor/CNCOptimizer/hooks/useLivePanelData.ts` — 패널 생성
- `src/editor/CNCOptimizer/utils/csvExporter.ts` — CSV 내보내기
- `src/editor/shared/utils/dxfGenerator.ts` — DXF 생성
- `src/editor/shared/utils/frameMergeUtils.ts` — 프레임 병합

### 비즈니스 로직
- `src/editor/shared/utils/indexing/` — 공간 계산 (4개 클래스)
- `src/editor/shared/furniture/hooks/` — 가구 인터랙션
- `src/editor/shared/utils/surroundGenerator.ts` — 서라운드 생성
