# FIX_PLAN 실행 로그

기준 문서: `docs/FIX_PLAN_2026-05-10.md`

현재 단계: Phase -1 기준 잠금 + export 샘플 검증 진행

## 실행 원칙

- 이 로그는 `FIX_PLAN_2026-05-10.md`의 실행 상태만 기록한다.
- 실제 수정은 Phase 순서를 바꾸지 않는다.
- 기준값이 없는 치수/뷰/내보내기 코드는 바로 교체하지 않는다.
- PDF, DXF, 2D, 3D 중 한 출력만 맞추는 수정은 완료로 보지 않는다.
- 측면뷰 내보내기는 좌측뷰만 기준으로 검증한다.

## 시작 상태

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 작업 브랜치 | 확인 | `main`, `origin/main` 추적 |
| 작업트리 | 확인 | 시작 시 `git status --short --branch` 기준 clean |
| 계획서 추적 여부 | 확인 | `docs/FIX_PLAN_2026-05-10.md`는 git 추적 파일 |
| 기존 테스트 위치 | 확인 | `src/editor/shared/utils/__tests__` 존재 |
| 기존 DXF 회귀 테스트 | 확인 | `dxfDimensions.test.ts` 및 snapshot 존재 |

## Phase -1 기준 잠금 대상

| 기준 ID | 연결 이슈 | 고정해야 할 기준 | 산출물 | 상태 |
| --- | --- | --- | --- | --- |
| BASE-DOOR-OPEN-90 | 0510-01, 0510-05, 0510-14 | 90도 열린 도어의 X/Z 기준, 경첩축, 프레임 두께 절반 삽입량 | 도어 기하 테스트 | 진행 |
| BASE-DOOR-DIMS | 0508-04, 0508-08, 0510-06 | 도어 높이 치수는 좌우 외곽만, 개별 도어 반복 높이 금지, 너비 누락 금지 | 2D/PDF 치수 회귀 테스트 | 진행 |
| BASE-SIDE-LEFT | 0508-01, 0508-06, 0508-10, 0510-10, 0510-15 | 측면뷰는 좌측뷰만, 슬롯별 몸통/서랍/프레임/백패널/보강대 누락 금지 | 좌측뷰 추출 회귀 테스트 | 진행 |
| BASE-SHOE-DEPTH | 0510-02, 0510-04, 0510-07, 0510-17 | 신발장 생성 직후 깊이 380 유지, 클릭 전후 깊이 불변 | 배치/스토어 회귀 테스트 | 진행 |
| BASE-HANGER-ROD | 0508-07, 0510-13 | 2D에 보이는 옷봉과 내보내기 옷봉 동일 | 2D/PDF/DXF 비교 테스트 | 진행 |
| BASE-PANEL-LIST | 0508-02, 0508-03, 0508-05, 0510-11, 0510-12, 0510-16 | 패널리스트와 실제 배치/가공 치수 일치 | 패널 상세 계산 테스트 | 진행 |
| BASE-EXPORT-STABILITY | 0510-03, 0510-09 | 내보내기 중 화면 깜빡임/3D 치수 가이드 오염 금지 | export 상태 격리 테스트 | 진행 |

## 첫 구현 단위

1. 도어 열린 상태 계산을 `DoorModule.tsx` 내부 JSX 좌표에서 분리한다.
2. `doorGeometryCalculator`를 관찰 모드로 추가해서 기존 계산값과 새 계산값을 비교한다.
3. 오차 로그만 먼저 남기고 렌더링 결과는 바꾸지 않는다.
4. 기준 케이스 통과 후 `DoorModule.tsx`의 열린 도어 좌표만 공통 계산기로 교체한다.

## 진행 기록

| 시간 | 작업 | 산출물 | 검증 |
| --- | --- | --- | --- |
| 2026-05-10 | 도어 열린 상태 좌표식을 순수 계산기로 분리 | `src/editor/shared/utils/doorGeometryCalculator.ts` | `npm run test -- src/editor/shared/utils/__tests__/doorGeometryCalculator.test.ts --run` 통과 |
| 2026-05-10 | 싱글/듀얼 도어 X/Z 기존 좌표식 회귀 테스트 추가 | `src/editor/shared/utils/__tests__/doorGeometryCalculator.test.ts` | 5 tests passed |
| 2026-05-10 | `DoorModule.tsx`의 싱글/듀얼 열린 도어 좌표식을 계산기 호출로 치환 | `src/editor/shared/viewer3d/components/modules/DoorModule.tsx` | 도어 계산기 테스트 통과, `npm run build` 통과 |
| 2026-05-10 | 새 계산기/테스트 lint 확인 | `doorGeometryCalculator.ts`, `doorGeometryCalculator.test.ts` | `npx eslint src/editor/shared/utils/doorGeometryCalculator.ts src/editor/shared/utils/__tests__/doorGeometryCalculator.test.ts` 통과 |
| 2026-05-10 | 90도 열린 도어 중심 좌표 검증 추가 | `calculateDoorCenterAfterYRotation` | 도어 계산기 테스트 7개 통과, `npm run build` 통과 |
| 2026-05-10 | 현관장 H 기본 깊이 계산을 순수 util로 분리 | `src/editor/shared/utils/furnitureDepthDefaults.ts` | 현관장 깊이 테스트 3개 통과, `npm run build` 통과 |
| 2026-05-10 | 현관장 H가 생성/배치 기준에서 380mm를 유지하는 회귀 테스트 추가 | `src/editor/shared/furniture/hooks/__tests__/entrywayDepth.regression.test.ts` | `npm run test -- src/editor/shared/furniture/hooks/__tests__/entrywayDepth.regression.test.ts --run` 통과 |
| 2026-05-10 | store 추가 경로와 슬롯 배치 경로의 상부장/신발장 기본 깊이 분기를 공통 util로 연결 | `src/store/core/furnitureStore.ts`, `src/editor/shared/furniture/hooks/usePlaceFurnitureAtSlot.ts` | 현관장 깊이 테스트 5개 통과, `npm run build` 통과 |
| 2026-05-10 | DXF 측면뷰 요청 정규화 함수 분리 및 우측뷰 차단 회귀 테스트 추가 | `src/editor/shared/utils/dxfDataRenderer.ts`, `src/editor/shared/utils/__tests__/dxfSideViewNormalization.test.ts` | DXF 측면뷰 정규화 테스트 4개 통과, `npm run build` 통과 |
| 2026-05-10 | PDF 선택 뷰 정의를 util로 분리하고 우측뷰 문자열 제거 테스트 추가 | `src/editor/shared/utils/pdfViewSelection.ts`, `src/editor/shared/hooks/usePDFExport.ts`, `src/editor/shared/utils/__tests__/pdfViewSelection.test.ts` | PDF 뷰 선택 테스트 3개 통과, `npm run build` 통과 |
| 2026-05-10 | 도어 높이 치수 좌/우 외곽 판단 및 3D 치수 가이드 차단 조건 분리 | `src/editor/shared/utils/doorDimensionGuides.ts`, `src/editor/shared/viewer3d/components/modules/DoorModule.tsx` | 도어 치수 가이드 테스트 5개 통과, `npm run build` 통과 |
| 2026-05-10 | 옷봉 브라켓/봉 치수와 2D 탑뷰 숨김 조건을 순수 계산기로 분리 | `src/editor/shared/utils/clothingRodGeometry.ts`, `src/editor/shared/viewer3d/components/modules/components/ClothingRod.tsx` | 옷봉 계산 테스트 3개 통과, `ClothingRod.tsx` lint 통과, `npm run build` 통과 |
| 2026-05-10 | 패널리스트 기준값 회귀 테스트 추가: 현관장 H 380 깊이, 상판내림 30T 상판/앞판, 하부 3단 서랍 높이 축소 | `src/editor/shared/utils/__tests__/panelDetails.regression.test.ts` | 패널 상세 테스트 3개 통과, 테스트 파일 lint 통과 |
| 2026-05-10 | PDF/DXF 내보내기 중 UI 상태 스냅샷/복원 기준 추가 및 호출부 연결 | `src/editor/shared/utils/exportStateSnapshot.ts`, `src/editor/shared/hooks/useDXFExport.ts`, `src/editor/shared/utils/dxfToPdf.ts`, `src/editor/shared/hooks/usePDFExport.ts` | export 상태 테스트 3개 통과, 관련 파일 lint 통과, `npm run build` 통과 |
| 2026-05-10 | 모듈 family/속성 판별 어댑터 추가 및 기본 깊이 계산 연결 | `src/editor/shared/utils/moduleClassification.ts`, `src/editor/shared/utils/furnitureDepthDefaults.ts` | 모듈 판별 테스트 3개 + 현관장 깊이 테스트 5개 통과, 관련 파일 lint 통과, `npm run build` 통과 |
| 2026-05-10 | 선반 앞 들이기 계산기를 추가하고 기존 30mm 기준을 렌더/패널리스트 호출부에 연결 | `src/editor/shared/utils/shelfInsetCalculator.ts`, `src/editor/shared/utils/calculatePanelDetails.ts`, `SingleType2.tsx`, `DualType2.tsx`, `UpperCabinet.tsx` | 선반 들이기 테스트 5개 + 패널 상세 테스트 3개 통과, 새 계산기 lint 통과, `npm run build` 통과 |
| 2026-05-10 | 도어 leaf 폭/높이 기준 계산기를 추가하고 싱글/듀얼 폭 합산 오류 방지 기준을 테스트로 고정 | `src/editor/shared/utils/doorGeometryCalculator.ts`, `src/editor/shared/utils/__tests__/doorGeometryCalculator.test.ts` | 도어 계산기 테스트 13개 통과, 관련 파일 lint 통과, `npm run build` 통과 |
| 2026-05-10 | 정면/평면/좌측/도어 도면 치수 세그먼트 계산기를 추가하고 1mm 반올림/우측뷰 차단/듀얼 도어 leaf 폭 기준을 회귀 테스트로 고정 | `src/editor/shared/utils/furnitureDimensionCalculator.ts`, `src/editor/shared/utils/__tests__/drawingDimensions.regression.test.ts` | 도면 치수 테스트 5개 통과, 관련 파일 lint 통과, `npm run build` 통과 |
| 2026-05-10 | 뒷벽 이격 입력 검증을 분리하고 음수 이격 입력을 허용 | `src/editor/shared/utils/backWallGapValidation.ts`, `src/editor/shared/controls/furniture/PlacedModulePropertiesPanel.tsx` | 뒷벽 이격 validation 테스트 4개 통과, 새 util lint 통과, `npm run build` 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 실행 | 신규 테스트 12개 파일 | 12 files / 57 tests 통과 |
| 2026-05-10 | 자유배치 초기 생성 깊이에도 신발장/현관장 380mm 기준을 연결 | `src/editor/shared/furniture/hooks/usePlaceFurnitureFree.ts`, `src/editor/shared/utils/furnitureDepthDefaults.ts` | 현관장 깊이 테스트 6개 통과, 관련 파일 lint 통과, `npm run build` 통과 |
| 2026-05-10 | 선반 앞 들이기 30mm 하드코딩을 공통 계산기로 추가 연결 | `BoxModule.tsx`, `LowerCabinet.tsx`, `calculatePanelDetails.ts`, `shelfInsetCalculator.ts` | 선반 들이기 테스트 6개 + 패널 상세 테스트 3개 통과, `npm run build` 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 재실행 | 신규 테스트 12개 파일 | 12 files / 58 tests 통과 |
| 2026-05-10 | 커스텀 선반 고정/다보/명시 들이기 경로를 선반 계산기로 연결 | `CustomizableBoxModule.tsx`, `shelfInsetCalculator.ts` | 선반 들이기 테스트 7개 통과, `npx vite build --debug` 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 재실행 | 신규 테스트 12개 파일 | 12 files / 59 tests 통과 |
| 2026-05-10 | 패널리스트 도어 W/H 산출을 door leaf 계산기로 연결하고 듀얼 도어 합산 폭 회귀를 추가 | `calculatePanelDetails.ts`, `panelDetails.regression.test.ts` | 패널 상세 테스트 5개 통과, 신규 기준/계산기 테스트 12 files / 61 tests 통과 |
| 2026-05-10 | PDF 레거시 우측뷰 선택값을 버리지 않고 좌측뷰로 정규화 | `pdfViewSelection.ts`, `pdfViewSelection.test.ts` | PDF 뷰 선택 테스트 4개 통과, 관련 파일 lint 통과 |
| 2026-05-10 | 도어 세로 top/bottom/center 기준 계산을 추가하고 도어 도면 치수 세그먼트 경로에 연결 | `doorGeometryCalculator.ts`, `furnitureDimensionCalculator.ts` | 도어 계산기/도면 치수 테스트 21개 통과, 관련 파일 lint 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 재실행 | 신규 테스트 12개 파일 | 12 files / 65 tests 통과, `git diff --check` 통과, `npx vite build --debug` 통과 |
| 2026-05-10 | 공통 치수 계산기가 자유배치 W/H/D를 우선 사용하도록 보강 | `furnitureDimensionCalculator.ts`, `drawingDimensions.regression.test.ts` | 도면 치수 테스트 6개 통과, 관련 파일 lint 통과 |
| 2026-05-10 | 슬롯별 측면뷰 필터를 공통 util로 분리하고 DXF/PDF 측면 export 중 전역 `placedModules` 교체를 제거 | `sideViewModuleFilter.ts`, `PlacedFurnitureContainer.tsx`, `CleanCAD2D.tsx`, `useDXFExport.ts`, `dxfToPdf.ts` | 측면뷰 필터/export 상태 테스트 7개 통과, 관련 파일 lint 통과, `npx vite build --debug` 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 재실행 | 신규 테스트 13개 파일 | 13 files / 70 tests 통과, `git diff --check` 통과 |
| 2026-05-10 | 듀얼 가구가 점유한 두 슬롯 모두 측면도 그룹으로 생성되도록 보강 | `sideViewModuleFilter.ts`, `useDXFExport.ts`, `dxfToPdf.ts` | 측면뷰 필터 테스트 5개 통과, 신규 기준/계산기 테스트 13 files / 71 tests 통과, `git diff --check` 통과, `npx vite build --debug` 통과 |
| 2026-05-10 | 레거시 jsPDF fallback 도어 도면의 도어/서랍 추출을 순수 계산기로 분리하고 듀얼 도어 leaf 폭, 경첩 방향, 외곽 좌/우 높이 치수 기준을 고정 | `pdfDoorDrawingGeometry.ts`, `usePDFExport.ts`, `pdfDoorDrawingGeometry.test.ts` | PDF fallback 도어 도면 테스트 4개 통과, 신규 기준/계산기 테스트 14 files / 75 tests 통과, 관련 파일 lint 통과, `git diff --check` 통과, `npx vite build --debug` 통과. 기본 PDF 도어 도면은 `dxfToPdf.ts`가 `DoorModule.tsx`의 `DOOR`/`DOOR_DIMENSIONS` 레이어를 사용하므로 별도 시각 검증 필요 |
| 2026-05-10 | 로컬 dev server 기동 및 접근성 확인 | `npm run dev -- --host 127.0.0.1` | `curl -I http://127.0.0.1:5173/` HTTP 200 확인. 이 세션에는 Browser plugin용 Node REPL 실행 도구가 노출되지 않아 실제 PDF/DXF 브라우저 export 시각 검증은 미완료 |
| 2026-05-10 | PDF 측면뷰 페이지 생성도 공통 슬롯 그룹 계산기를 사용하도록 변경 | `usePDFExport.ts`, `sideViewModuleFilter.ts` | PDF/측면/도어 관련 테스트 13개 통과, 신규 기준/계산기 테스트 14 files / 75 tests 통과, 관련 파일 lint 통과, `git diff --check` 통과, `npx vite build --debug` 통과 |
| 2026-05-10 | 도어 도면 경첩 누락 방지를 위해 경첩 객체 이름과 DXF 레이어 분류를 보강 | `Hinge.tsx`, `dxfDataRenderer.ts`, `dxfDoorHingeLayer.test.ts` | 경첩 레이어 테스트 3개 통과. `generateDxfDrawingData(..., ['DOOR', 'DOOR_DIMENSIONS'])` 단계에서 경첩은 남고 가구 패널은 제외됨. `Hinge.tsx` lint 통과. `dxfDataRenderer.ts` 전체 lint는 기존 legacy lint debt 때문에 별도 정리 필요 |
| 2026-05-10 | 사용자 보고 기준 상부장 하부 EP 옵셋은 Claude 변경으로 해결된 항목으로 분리 | `BaseFurnitureShell.tsx` | 해당 변경은 유지하고, 현재 작업에서 건드리거나 되돌리지 않음 |
| 2026-05-10 | PDF 도어 도면 door-only 레이어 필터를 공통 helper로 분리 | `dxfToPdf.ts`, `dxfToPdfDoorOnlyFilter.test.ts` | door-only 필터 테스트 2개 통과, 관련 파일 lint 통과 |
| 2026-05-10 | PDF export 하단/타이틀블록 깊이 표기 기준 공통화 및 빈 페이지 방지 | `dxfToPdf.ts`, `dxfToPdfDepthFooter.test.ts` | 일반 PDF 페이지, 슬롯별 측면 페이지, 한 장 레이아웃 타이틀블록이 같은 export 깊이 계산을 사용. 현관장 H legacy 400mm 값은 380mm로 보정. 선/텍스트가 없는 PDF 뷰는 페이지 생성을 건너뜀. 전체가 비면 완전 빈 PDF 대신 `No drawing data` 페이지를 생성. 테스트 5개 통과, 관련 파일 lint 통과 |
| 2026-05-10 | 레거시 DXF `side` 타입도 좌측뷰 정책만 쓰도록 회귀 테스트 추가 | `dxfFromSceneSidePolicy.test.ts` | `side`가 좌측뷰 투영 좌표를 만들고 `side`/`sideLeft` 파일명에 `right`가 없음을 확인, 테스트 2개 통과, 테스트 파일 lint 통과 |
| 2026-05-10 | PDF 도어도면 선택값 alias 보강 | `pdfViewSelection.ts`, `pdfViewSelection.test.ts` | `2d-door-only`/`door-only` 저장값을 `2d-door`로 정규화, PDF 뷰 선택 테스트 5개 통과, 관련 파일 lint 통과 |
| 2026-05-10 | DXF/PDF export 중 불필요한 UI setState 반복 감소 | `exportStateSnapshot.ts`, `useDXFExport.ts`, `dxfToPdf.ts`, `exportStateSnapshot.test.ts` | export UI patch 비교 helper 추가, 값이 바뀔 때만 setState 수행. 관련 파일 lint 통과, export 상태/측면 슬롯/DXF side 테스트 11개 통과 |
| 2026-05-10 | 통합 DXF에서 빈 측면/우측 도면 제목이 출력되지 않도록 회귀 테스트 추가 | `dxfCombinedLayout.test.ts`, `dxfDataRenderer.ts` | 빈 측면도와 우측 도면 제목이 DXF 문자열에 포함되지 않고, 전체 빈 입력은 `NO DRAWING DATA`로 떨어짐. 테스트 2개 통과 |
| 2026-05-10 | PDF 템플릿 기본 메뉴/슬롯에서 우측뷰 제거 | `PDFTemplatePreview.tsx`, `pdfTemplateSidePolicy.test.ts` | 기본 템플릿에 `Right VIEW`/`target: 'right'`/`right?: string`이 남지 않고, legacy `right` 뷰 타겟은 `side`로 정규화되도록 보강. 단독 테스트 1개 통과, 새 테스트 lint 통과. `PDFTemplatePreview.tsx` 전체 lint는 기존 legacy lint debt 때문에 별도 정리 필요 |
| 2026-05-10 | PDF 템플릿 편집 오버레이의 2D 방향 버튼에서 우측뷰 제거 | `PDFTemplatePreview.tsx`, `pdfTemplateSidePolicy.test.ts` | 도면 편집 오버레이의 방향 선택에서 `right` 버튼을 제거하고, legacy `right` 뷰 더블클릭도 `side`로 정규화. `pdfTemplateSidePolicy.test.ts` 단독 통과, 테스트 파일 lint 통과 |
| 2026-05-10 | PDF 템플릿 side policy 변경 검증 | `PDFTemplatePreview.tsx`, `pdfTemplateSidePolicy.test.ts`, `pdfViewSelection.test.ts`, `dxfSideViewNormalization.test.ts` | 관련 테스트 3 files / 11 tests 통과, `git diff --check` 통과, `npm run build` 통과. Firebase dynamic import/chunk size warning은 기존 build warning으로 남음 |
| 2026-05-10 | DXF drawing data 직접 호출의 우측뷰/우측필터 정규화 검증 추가 | `dxfSideViewNormalization.test.ts` | `generateDxfDrawingData(..., 'right', 'rightmost')`가 좌측뷰 좌표를 생성함을 확인. 단독 테스트 5개 통과, 테스트 파일 lint 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 재실행 및 production build 확인 | 신규 테스트 20개 파일, `dxfToPdf.ts`, `dxfDataRenderer.ts`, `PDFTemplatePreview.tsx` | 20 files / 93 tests 통과. `npm run build` 통과. Firebase dynamic import/chunk size warning은 기존 build warning으로 남음 |
| 2026-05-10 | PDF 템플릿 PDF 생성 폴백의 우측뷰 분기 제거 | `PDFTemplatePreview.tsx`, `pdfTemplateSidePolicy.test.ts` | PDF 생성 중 이미지 직접 삽입 실패 시에도 `viewType === 'right'` 분기가 남지 않도록 제거하고, legacy `right_*` id는 `side`로 정규화. PDF 템플릿/뷰선택/DXF 우측뷰 정규화 테스트 3 files / 11 tests 통과, 새 테스트 lint 통과 |
| 2026-05-10 | PDF 한 장 레이아웃의 빈 슬롯별 측면도 방지 | `dxfToPdf.ts`, `dxfToPdfDepthFooter.test.ts` | 한 장 장표에서 선/텍스트가 없는 슬롯별 측면도 데이터를 제외하고, 전체 측면 데이터가 비어도 `sideDataList[0]` 접근으로 깨지지 않도록 보강. 관련 테스트 3 files / 13 tests 통과, `dxfToPdf.ts`/테스트 lint 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 재실행 및 production build 재확인 | 신규 테스트 20개 파일, `dxfToPdf.ts`, `PDFTemplatePreview.tsx` | 20 files / 94 tests 통과. `npm run build` 통과. Firebase dynamic import/chunk size warning은 기존 build warning으로 남음 |
| 2026-05-10 | 로컬 dev server 재기동 | `npm run dev -- --host 127.0.0.1` | `curl -I http://127.0.0.1:5173/` HTTP 200 확인. 실제 브라우저 PDF/DXF 다운로드 후 샘플 시각 검증은 아직 별도 수행 필요 |
| 2026-05-10 | 개별 DXF 다운로드의 슬롯별 좌측 측면도 생성 보강 | `useDXFExport.ts` | 개별 파일 다운로드 경로에서도 `side`/`sideLeft`를 단일 최외곽 측면도 1개로 만들지 않고, `getSideViewSlotGroups` 기준 슬롯별 좌측 측면 DXF 파일로 생성. 정면/평면/도어도 생성 전 해당 2D 뷰로 전환하도록 보강. 관련 테스트 4 files / 16 tests 통과, 전체 회귀 20 files / 94 tests 통과, `useDXFExport.ts` lint 통과, `npm run build` 통과 |
| 2026-05-10 | ExportPanel PDF 내보내기 디버그 UI 제거 | `ExportPanel.tsx`, `exportPanelUx.test.ts` | PDF 내보내기 버튼 클릭 시 뜨던 디버그 alert와 렌더마다 찍히던 PDF 버튼 상태 로그 제거. 재도입 방지 정적 테스트 추가. `ExportPanel.tsx` lint 통과, 관련 테스트 3 files / 15 tests 및 신규 테스트 1개 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 재실행 | 신규 테스트 21개 파일 | 21 files / 95 tests 통과 |
| 2026-05-10 | ConvertModal PDF export에서 미사용 캡처/프리뷰 경로 제거 | `ConvertModal.tsx`, `exportPanelUx.test.ts` | PDF 선택지에서 3D 투시도 제거 상태를 고정하고, 미사용 `PDFTemplatePreview` 캡처 경로가 UI view/dimension 상태를 직접 전환하지 않도록 제거. `ConvertModal.tsx`/신규 테스트 lint 통과, 관련 테스트 3 files / 13 tests 통과 |
| 2026-05-10 | Header → Configurator → ConvertModal export 연결 회귀 테스트 추가 | `Header.tsx`, `Configurator/index.tsx`, `ConvertModal.tsx`, `exportPanelUx.test.ts` | Header 내보내기 버튼이 `onExportPDF()`를 호출하고, Configurator가 `setIsConvertModalOpen(true)`로 ConvertModal을 여는 경로를 정적 회귀 테스트로 고정. ConvertModal 기본 DXF/PDF 선택값도 `sideLeft`/`left`만 사용하고 `right`/`sideRight`를 노출하지 않도록 확인. `exportPanelUx.test.ts` 4 tests 통과, 테스트 파일 lint 통과 |
| 2026-05-10 | `/demo` Header 컨버팅 버튼 실제 클릭 확인 | Playwright `/demo` | `/demo`에서 Header의 `컨버팅` 버튼을 클릭하면 ConvertModal이 아니라 “기업회원 전용 기능입니다… 컨버팅(CNC 옵티마이저 · 내보내기) 기능은 기업회원에게만 제공됩니다.” 안내 모달이 표시됨. 따라서 실제 Header → ConvertModal → 다운로드 버튼 경로는 인증된 기업 계정 프로젝트에서만 완료 검증 가능 |
| 2026-05-10 | 자유배치 생성 결과의 현관장 H 깊이 회귀 테스트 추가 | `entrywayDepth.regression.test.ts`, `usePlaceFurnitureFree.ts` | `placeFurnitureFree()`에 현관장 H를 `dimensions.depth: 400`으로 넣어도 생성 결과 `module.freeDepth`가 380mm로 고정되는 테스트 추가. 단독 7 tests 통과, 테스트 파일 lint 통과 |
| 2026-05-10 | legacy PDF view 정의에서 3D 투시도 제거 | `pdfViewSelection.ts`, `ExportPanel.tsx`, `pdfViewSelection.test.ts`, `exportPanelUx.test.ts` | `PDF_VIEW_TYPES`에서 `3d-front`/`3D 투시도 (Perspective)` 제거. legacy `normalizePdfSelectedViews(['3d-front'])`는 빈 배열로 정규화. ExportPanel 안내 문구도 `2D 도면, 치수, 가구 정보`로 수정. 관련 테스트 2 files / 10 tests 통과, 관련 파일 lint 통과 |
| 2026-05-10 | legacy ExportPanel PDF 미리보기 3D 전환 제거 | `ExportPanel.tsx`, `exportPanelUx.test.ts` | 현재 `ExportPanel`은 `Configurator`에서 import만 되고 렌더링되지 않는 legacy 경로지만, PDF 미리보기 도어 캡처가 `setViewMode('3D')`로 전환하던 코드를 2D 정면 와이어프레임 캡처로 변경. `setViewMode('3D')` 재도입 방지 테스트 추가. `exportPanelUx.test.ts` 5 tests 통과, 관련 파일 lint 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 재실행 | 신규 테스트 21개 파일 | `backWallGapValidation`, `drawingDimensions`, `doorGeometryCalculator`, `doorDimensionGuides`, `pdfViewSelection`, `pdfDoorDrawingGeometry`, `dxfSideViewNormalization`, `dxfDoorHingeLayer`, `dxfToPdfDoorOnlyFilter`, `dxfToPdfDepthFooter`, `dxfFromSceneSidePolicy`, `dxfCombinedLayout`, `pdfTemplateSidePolicy`, `exportStateSnapshot`, `exportPanelUx`, `clothingRodGeometry`, `moduleClassification`, `shelfInsetCalculator`, `panelDetails`, `sideViewModuleFilter`, `entrywayDepth` 전체 21 files / 98 tests 통과. `git diff --check` 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 재실행 | 신규 테스트 21개 파일 | 자유배치 `freeDepth` 회귀 테스트 추가 후 전체 21 files / 99 tests 통과. `git diff --check` 통과 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 및 production build 재실행 | 신규 테스트 21개 파일 | legacy PDF 3D view 제거 후 전체 21 files / 100 tests 통과. `git diff --check` 통과. `npm run build` 통과. Firebase dynamic import/chunk size warning은 기존 build warning으로 남음 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 및 production build 재실행 | 신규 테스트 21개 파일 | legacy ExportPanel PDF 미리보기 3D 전환 제거 후 전체 21 files / 101 tests 통과. `git diff --check` 통과. `npm run build` 통과. Firebase dynamic import/chunk size warning은 기존 build warning으로 남음 |
| 2026-05-10 | 신규 기준/계산기 회귀 테스트 묶음 및 production build 재실행 | 신규 테스트 21개 파일 | 21 files / 96 tests 통과. `git diff --check` 통과. `npm run build` 통과. `curl -I http://127.0.0.1:5173/` HTTP 200 확인. Firebase dynamic import/chunk size warning은 기존 build warning으로 남음 |
| 2026-05-10 | Playwright 브라우저에서 실제 2D scene 기반 PDF export 샘플 생성/검사 | `/private/tmp/codex-export-browser-check.cjs`, `/private/tmp/codex-export-check/drawing_2026-05-10.pdf`, `/private/tmp/codex-export-check/browser-export-audit.json` | `/demo`에서 샘플 3개 모듈을 store에 주입하고 실제 R3F scene에서 front/top/left/door-only 데이터를 추출. 현관장 H는 생성 직후 `customDepth: 380`, PDF는 9페이지, 텍스트에 `Right View` 없음, `Side View (Slot 1~4)` 존재. side slot 1~4 모두 라인/텍스트 있음. door-only는 `DOOR` 832 lines + `DOOR_DIMENSIONS` 30 lines, 텍스트 `2342`, `577`, `770` 포함. front/side에는 `CLOTHING_ROD`, `BACK_PANEL`, `DRAWER`, `FURNITURE_PANEL` 레이어가 검출됨. PDF export 전후 UI는 `2D/left/wireframe`, `selectedSlotIndex: 3`으로 복원됨. 단, 인증된 실제 프로젝트에서 Header/ConvertModal 버튼을 누르는 검증은 아직 별도 필요 |
| 2026-05-10 | 실제 DXF 샘플 검증 스크립트 보강 | `/private/tmp/codex-export-browser-check.cjs` | 기존 PDF 브라우저 샘플 스크립트에 통합 DXF 다운로드 이벤트 저장과 DXF 본문 검사 단계를 추가했다. 검사 항목은 우측뷰 문자열, 슬롯별 측면도 제목, 도어/정면/평면 제목, `NO DRAWING DATA`, 현관장 380, 레거시 400, `DOOR`/`DOOR_DIMENSIONS`/`FURNITURE_PANEL`/`BACK_PANEL`/`DRAWER`/`CLOTHING_ROD` 레이어, LINE/TEXT 엔티티 수다. 실행 결과는 다음 행에 별도 기록했다 |
| 2026-05-10 | Playwright 브라우저에서 실제 2D scene 기반 DXF export 샘플 생성/검사 | `/private/tmp/codex-export-check/codex-browser-export-left-only.dxf`, `/private/tmp/codex-export-check/dxf-inspection.json`, `/private/tmp/codex-export-check/dxf-ui-result.json` | `/demo` 샘플 3개 모듈로 통합 DXF를 실제 다운로드 이벤트로 저장했다. DXF 크기 841,308 bytes, LINE 5,378개, TEXT 61개. `Right View`/`RIGHT`/`우측` 문자열 없음. 측면도 제목은 `측면도 1~4`만 존재하고 `NO DRAWING DATA` 없음. 현관장 380 텍스트 존재, 레거시 400 깊이 표기 없음. `DOOR`, `DOOR_DIMENSIONS`, `FURNITURE_PANEL`, `BACK_PANEL`, `DRAWER`, `CLOTHING_ROD` 레이어 모두 존재. 도어도면은 `DOOR` 832 lines + `DOOR_DIMENSIONS` 30 lines, 텍스트 `2342`, `577`, `770` 포함. DXF 생성 전후 UI는 `2D/left/wireframe`, `selectedSlotIndex: 3`으로 복원됨 |
| 2026-05-10 | `Line2` 치수선 추출 경고 원인 확인 | `src/editor/shared/utils/dxfDataRenderer.ts`, `/private/tmp/codex-export-check/browser-export-audit.json` | 경고는 `dimension_line` 객체 중 일부가 현재 투영 방향에서 점으로 보이는 X축 tick/extension이거나 투영 후 1mm 미만인 경우 `isLineVisibleInView`/길이 필터에 걸리며 발생한다. `/demo` audit 기준 실제 도면 데이터에는 front `DIMENSIONS` 84 lines, top `DIMENSIONS` 15 lines, side slot별 `DIMENSIONS` 23/23/26/26 lines와 치수 텍스트가 존재한다. 따라서 샘플 기준 전체 치수 누락은 아니지만, 인증된 실제 프로젝트에서도 같은 판정인지 추가 확인이 필요하다 |
| 2026-05-10 | 3D 화면 도어 발주 치수 guide 차단 실제 scene 확인 | `/private/tmp/codex-3d-door-dimension-check.cjs`, `/private/tmp/codex-export-check/3d-door-dimension-check.json` | `/demo`에서 싱글 도어장과 듀얼 도어장을 주입하고 문 설치 후 scene을 순회했다. `viewMode: '3D'`에서는 `door-dimension*` 객체 0개, `viewMode: '2D'`, `front`에서는 `door-dimension-height`, `door-dimension-height-text`, `door-dimension`, `door-dimension-text` 객체가 검출됨. 샘플 기준 3D에는 발주용 도어 치수 guide가 뜨지 않음을 확인 |
| 2026-05-10 | 실제 프로젝트 수동 검증 절차를 계획서에 추가 | `docs/FIX_PLAN_2026-05-10.md` | Header export button → `Configurator` `onExportPDF` → `ConvertModal` → PDF/DXF 다운로드 경로를 명시했다. 실제 프로젝트 검증 절차, 합격 기준, 산출물 보관 기준을 추가했으며, 인증된 실제 프로젝트와 사용자 PDF 템플릿 검증 전에는 완료 처리하지 않도록 못박았다 |
| 2026-05-10 | PDF export 캡처 경로의 3D 전환 잔존 제거 | `src/editor/shared/hooks/usePDFExport.ts`, `src/editor/shared/components/PDFTemplatePreview/PDFTemplatePreview.tsx.backup`, `pdfViewSelection.test.ts`, `exportPanelUx.test.ts` | `usePDFExport.ts`의 legacy `viewInfo.viewMode === '3D'` 캡처 분기를 제거하고 모든 PDF 캡처를 2D/wireframe 기준으로 고정했다. git 추적 중인 `PDFTemplatePreview.tsx.backup`에서도 우측뷰 타입/버튼과 3D 전환 버튼을 제거했다. `pdfViewSelection + exportPanelUx` 2 files / 11 tests 통과, 관련 eslint 통과, 전체 기준/계산기 회귀 21 files / 101 tests 통과, `git diff --check` 통과, `npm run build` 통과 |
| 2026-05-10 | 계획서 명시 게이트 감사 | `docs/FIX_PLAN_2026-05-10.md`, `docs/FIX_PLAN_EXECUTION_LOG_2026-05-10.md`, export 관련 소스 | 계획서 3.3의 제안 테스트 파일 14개가 모두 실제 파일로 존재함을 확인했다. export 관련 금지 문자열 검색 결과 `2d-right`/`rightmost`는 legacy 입력 정규화와 회귀 테스트 용도이며, `generateDxfDrawingData()` 시작부에서 `right`/`rightmost`를 `left`/`leftmost`로 강제한다. `PDFTemplatePreview.tsx`에 남은 `setViewMode('3D')`는 템플릿 편집기 수동 보기 전환 버튼이며 PDF export 캡처 경로는 아니다. 계획서 12.1 명시 명령 중 `npx vite build --debug`도 현재 상태에서 통과했다. 기존 Firebase dynamic import/chunk size warning은 빌드 실패가 아닌 기존 경고로 남음 |
| 2026-05-10 | 계획서의 PDF/DXF 다운로드 검증 범위 재확인 | `docs/FIX_PLAN_2026-05-10.md` | 계획서에는 PDF/DXF 다운로드 검증이 명시되어 있다. 현재 상태표의 `PDF/DXF 측면뷰`, `PDF export 모달`, `브라우저 PDF/DXF 샘플` 항목과 완료 정의의 `실제 브라우저에서 PDF/DXF 파일을 생성하고 샘플 출력물을 확인했다` 조건, 13장의 `Header export button → Configurator onExportPDF → ConvertModal → PDF 다운로드 / DXF ZIP 다운로드` 경로가 해당 근거다. 따라서 실제 인증 프로젝트 버튼 다운로드와 사용자 템플릿 출력 검증은 선택 작업이 아니라 완료 게이트로 유지한다 |

## 프롬프트-산출물 감사

| 명시 요구 | 확인한 산출물/증거 | 판정 |
| --- | --- | --- |
| `FIX_PLAN_2026-05-10.md`를 실행 계획서로 사용 | 이 로그가 기준 문서와 연결되어 있고, 진행 기록/계산기 연결 상태/완료 감사 체크리스트가 계획서 항목을 기준으로 갱신됨 | 진행 중 |
| 계획서 3.3의 제안 테스트 파일 존재 | `doorGeometryCalculator`, `shelfInsetCalculator`, `drawingDimensions`, `panelDetails`, `pdfViewSelection`, `exportStateSnapshot`, `exportPanelUx`, `sideViewModuleFilter`, `dxfDoorHingeLayer`, `dxfToPdfDoorOnlyFilter`, `dxfToPdfDepthFooter`, `dxfFromSceneSidePolicy`, `dxfCombinedLayout`, `pdfTemplateSidePolicy` 테스트 파일 모두 존재 확인 | 충족 |
| 계획서 7.1 View source / Side policy / Slot pages / Door drawing / Hidden 3D guides / Restore state / Visual sample | `/demo` Playwright PDF/DXF 샘플과 3D scene 검사로 우측뷰 없음, 슬롯별 좌측뷰 1~4, 도어/경첩/치수/옷봉/서랍/백패널/몸통 레이어, 3D `door-dimension*` 0개, export 후 UI 복원 확인 | 샘플 충족, 실제 프로젝트 필요 |
| 계획서 10.1 코드 검증 | 최신 `git diff --check`, 21 files / 101 tests, `npm run build`, `npx vite build --debug` 통과 | 충족 |
| 계획서 10.3 출력 검증 | `/demo` PDF 9페이지와 DXF LINE 5,378/TEXT 61 샘플 확인 | 샘플 충족, 실제 프로젝트 필요 |
| 계획서 13 Header/ConvertModal 실제 프로젝트 검증 | `/demo` Header 컨버팅 버튼은 기업회원 안내 모달로 차단됨. 인증된 실제 프로젝트에서 Header → ConvertModal → PDF/DXF 다운로드 파일 검증은 아직 미실행 | 미완료 |
| 사용자 PDF 템플릿 실제 출력 검증 | 소스 정책/테스트는 우측뷰 제거를 확인했지만, 사용자가 만든 템플릿 파일로 실제 출력 PDF를 대조하지 못함 | 미완료 |
| 완료 처리 | 위 미완료 항목이 있으므로 완료 선언 또는 goal complete 처리 금지 | 미완료 |

## 현재 진행 요약

2026-05-10 현재 작업은 `FIX_PLAN_2026-05-10.md`의 실행 계획을 기준으로 export/도면 정확도 축을 먼저 고정하는 단계다. 핵심 구현은 공통 계산기와 export 정책을 추가하고, 2D/PDF/DXF/패널 목록이 같은 기준을 쓰도록 연결하는 방향으로 진행했다.

### 완료 또는 강하게 검증된 항목

- 도어 열린 좌표: `doorGeometryCalculator.ts`로 분리했고 `DoorModule.tsx` 싱글/듀얼 열린 도어 좌표에 연결했다. 90도 열린 도어 중심 좌표 회귀 테스트를 추가했다.
- 도어 치수 가이드: `doorDimensionGuides.ts`를 추가했고 3D에서는 발주용 도어 높이 치수를 차단하며, 2D 정면에서는 외곽 좌/우 높이 기준을 쓰도록 고정했다.
- 도어 leaf 폭/높이: `doorGeometryCalculator.ts`, `furnitureDimensionCalculator.ts`, `calculatePanelDetails.ts`, `pdfDoorDrawingGeometry.ts`에 연결했다. 듀얼 도어 폭 합산 오류 방지 테스트를 추가했다.
- 현관장/신발장 H 깊이: `furnitureDepthDefaults.ts`를 추가했고 store, 슬롯 배치, 자유배치 초기 깊이에 380mm 기준을 연결했다. `placeFurnitureFree()` 생성 결과의 `freeDepth`도 380mm로 고정되는 테스트를 추가했다.
- 측면뷰 좌측 정책: `pdfViewSelection.ts`, `dxfDataRenderer.ts`, `dxfFromScene.ts`, `PDFTemplatePreview.tsx`에서 레거시 right 입력을 좌측뷰/side로 정규화하거나 제거했다.
- 슬롯별 측면뷰: `sideViewModuleFilter.ts`를 추가했고 2D 렌더, DXF/PDF 측면 캡처, PDF 측면 페이지 생성, 듀얼 모듈 양쪽 점유 슬롯 그룹에 연결했다.
- 도어 도면 경첩: `Hinge.tsx`에 `door-hinge` 이름을 부여하고 `dxfDataRenderer.ts`에서 부모 이름 기준 `DOOR` 레이어 분류를 보강했다.
- 옷봉: `clothingRodGeometry.ts`를 추가했고 `ClothingRod.tsx` 렌더 기준을 공통화했다. 브라우저 PDF 샘플의 front/side 추출 데이터에서 `CLOTHING_ROD` 레이어를 확인했다.
- PDF/DXF export 상태: `exportStateSnapshot.ts`를 추가했고 export 중 UI patch를 값이 바뀔 때만 적용하도록 `useDXFExport.ts`, `dxfToPdf.ts`, `usePDFExport.ts`에 연결했다.
- PDF export 모달/legacy view 정의: `ConvertModal.tsx`에서 3D 투시도 선택지와 미사용 PDF 프리뷰 캡처 경로를 제거했고, `pdfViewSelection.ts`의 legacy `PDF_VIEW_TYPES`에서도 `3d-front`를 제거했다. `usePDFExport.ts`의 PDF 캡처 경로도 3D 분기 없이 2D/wireframe 기준으로 고정했고, legacy `ExportPanel` PDF 미리보기 도어 캡처도 3D 전환 없이 2D 정면 와이어프레임으로 고정했다.
- 빈 도면 방지: `dxfToPdf.ts`와 `buildCombinedDxfFromDrawingData`에 빈 측면 데이터/빈 페이지 제외 기준을 추가했다.
- 회귀 테스트: 신규 기준/계산기 테스트 묶음은 최근 `21 files / 101 tests` 통과했다. `git diff --check`, `npm run build`, `npx vite build --debug`, dev server HTTP 200도 확인했다.
- 브라우저 PDF/DXF 샘플: `/demo`에서 실제 R3F scene 기반 PDF와 DXF를 생성했다. PDF는 9페이지, DXF는 LINE 5,378개/TEXT 61개이며, 둘 다 우측뷰 없음, 슬롯별 좌측 측면도 1~4, 현관장 380, 도어 치수 텍스트, 도어/옷봉/서랍/백패널/몸통 레이어를 확인했다.

### 아직 완료로 보면 안 되는 항목

- `/demo` Header 컨버팅 버튼은 기업회원 안내 모달로 차단됨을 확인했다. 인증된 실제 프로젝트에서 Header/ConvertModal 버튼을 직접 눌러 생성한 PDF/DXF 파일 검증은 아직 남아 있다.
- 사용자가 만든 PDF 템플릿 출력 결과를 실제 샘플로 대조하는 검증은 아직 남아 있다.
- 실제 브라우저 다운로드 DXF 파일 검증은 `/demo` 샘플 기준으로 통과했다. 다만 인증된 실제 프로젝트의 Header/ConvertModal 버튼 경로는 아직 별도 검증이 필요하다.
- 브라우저 샘플 중 `Line2` 치수선 일부가 투영 길이 부족으로 추출 실패 경고를 남긴다. 코드 확인상 좌측뷰에서 X축 tick/extension이 점으로 투영되는 케이스이며, 샘플 audit에는 치수 텍스트와 `DIMENSIONS` 레이어가 존재한다. 인증된 실제 프로젝트에서도 같은 판정인지 확인 전까지 잔여 리스크로 둔다.
- `dxfDataRenderer.ts`, `PDFTemplatePreview.tsx` 일부 파일은 기존 legacy lint debt가 있어 전체 파일 lint 정리는 별도 작업이다.
- Phase 4 데이터 의미 변경 항목인 장 앞면 기준 거리, EP 상단갭 의미 변경, 모든 하부장 띄움장 옵션 등은 이 작업에서 완료 처리하지 않는다.

### 다음 작업

1. 인증된 실제 프로젝트에서 Header/ConvertModal 버튼으로 PDF/DXF를 직접 생성한다.
2. 사용자 PDF 템플릿 출력 결과를 실제 샘플로 대조한다.
3. 실제 프로젝트에서도 `Line2` 경고가 치수 누락으로 이어지지 않는지 샘플 도면과 대조한다.
4. 실제 프로젝트 검증까지 통과하면 `FIX_PLAN_2026-05-10.md`의 남은 “부분 연결” 판정을 갱신한다.

## 완료 감사 체크리스트

현재 목표는 `docs/FIX_PLAN_2026-05-10.md`를 실행 계획서로 사용해, 발주 도면에 직접 영향을 주는 2D/PDF/DXF/패널 기준을 계획서의 완료 정의와 대조하면서 진행하는 것이다.

아래 표는 완료 선언 전 반드시 다시 확인해야 할 항목이다.

| 요구/게이트 | 현재 증거 | 판정 |
| --- | --- | --- |
| 2D 화면에 보이는 몸통/서랍/선반/옷봉/프레임/백패널/보강대/경첩/도어/치수 누락 방지 | `/demo` R3F scene 추출에서 `FURNITURE_PANEL`, `DRAWER`, `CLOTHING_ROD`, `BACK_PANEL`, `DOOR`, `DOOR_DIMENSIONS`, `DIMENSIONS` 레이어 확인. DXF LINE 5,378개/TEXT 61개 | 샘플 통과, 실제 프로젝트 필요 |
| 측면뷰는 좌측뷰만 | `pdfViewSelection.ts`, `dxfDataRenderer.ts`, `dxfFromScene.ts`, `PDFTemplatePreview.tsx` 정규화/제거. PDF/DXF 샘플에 `Right View`/`RIGHT`/`우측` 없음 | 샘플 통과, 실제 프로젝트 필요 |
| 슬롯별 측면뷰 | `/demo` PDF/DXF에 측면도 1~4 존재. 듀얼 모듈이 slot 3/4 양쪽에 표시됨 | 샘플 통과, 실제 프로젝트 필요 |
| 도어 도면 경첩 | `Hinge.tsx` `door-hinge` naming, `dxfDoorHingeLayer.test.ts`, door-only DXF/PDF `DOOR` 레이어 832 lines | 샘플 통과, 실제 프로젝트 필요 |
| 도어 높이 좌/우 외곽, 폭 누락 금지, 듀얼 leaf 폭 | `doorDimensionGuides.ts`, `doorGeometryCalculator.ts`, `pdfDoorDrawingGeometry.ts`; door-only 텍스트 `2342`, `577`, `770` 확인 | 샘플 통과, 실제 프로젝트 필요 |
| 3D 발주 치수 guide 차단 | `doorDimensionGuides.ts` 테스트와 `DoorModule.tsx` 연결. `/demo` scene 검사에서 3D `door-dimension*` 객체 0개, 2D front에는 동일 객체 존재 확인 | 샘플 통과, 실제 프로젝트 필요 |
| 현관장/신발장 H 380 | 슬롯 배치 샘플 생성 직후 `customDepth: 380`, 자유배치 `placeFurnitureFree()` 생성 결과 `freeDepth: 380`, PDF/DXF에 `380`, legacy `400` 없음 | 샘플/테스트 통과, 실제 프로젝트 필요 |
| export 후 UI 상태 복원/깜빡임 감소 | `exportStateSnapshot.ts`, PDF/DXF 샘플 전후 `2D/left/wireframe`, `selectedSlotIndex: 3` 복원 | 샘플 통과, 실제 버튼 경로 필요 |
| PDF 템플릿 우측뷰 제거 | `PDFTemplatePreview.tsx`, `pdfTemplateSidePolicy.test.ts` | 테스트 통과, 사용자 템플릿 출력 필요 |
| 회귀 테스트 | 신규 기준/계산기 테스트 최신 재실행 `21 files / 101 tests` 통과, `npm run build` 통과, `npx vite build --debug` 통과, `git diff --check` 통과 | 통과 |
| Line2 치수선 경고 | 코드상 좌측뷰에서 점/1mm 미만 tick 필터링 원인 확인. 샘플 audit에 `DIMENSIONS` 라인과 텍스트 존재 | 원인 확인, 실제 프로젝트 필요 |
| 인증된 실제 프로젝트 Header/ConvertModal 버튼 | 미실행 | 미완료 |
| 사용자 PDF 템플릿 실제 출력 | 미실행 | 미완료 |

최종 판정: 아직 완료가 아니다. `/demo` 기반 PDF/DXF 샘플은 강한 근거지만, 인증된 실제 프로젝트의 버튼 경로와 사용자 PDF 템플릿 출력이 남아 있으므로 `FIX_PLAN_2026-05-10.md` 기준 완료 처리하지 않는다.

## 계산기 연결 상태

| 계산기 | 현재 연결된 경로 | 아직 미연결/관찰 필요 경로 | 판정 |
| --- | --- | --- | --- |
| `doorGeometryCalculator.ts` 열린 도어 X/Z | `DoorModule.tsx` 싱글/듀얼 열린 도어 좌표 | 2D/PDF/DXF의 열린 도어 표현 검증 | 부분 연결 |
| `doorGeometryCalculator.ts` door leaf W/H + Y | 회귀 테스트, `furnitureDimensionCalculator.ts` 도어 세그먼트, `calculatePanelDetails.ts` 도어 패널 W/H, `pdfDoorDrawingGeometry.ts` 레거시 fallback 도어 도면 추출 | `DoorModule.tsx` 렌더 Y 공식, DXF 도어 도면 직접 연결, 실제 PDF 캡처 검증 | 부분 연결 |
| `doorDimensionGuides.ts` | `DoorModule.tsx` 도어 높이 치수 좌/우 외곽 표시, 3D 차단 | PDF 템플릿 캡처 결과 시각 검증 | 부분 연결 |
| `furnitureDepthDefaults.ts` | `furnitureStore.ts`, `usePlaceFurnitureAtSlot.ts`, `usePlaceFurnitureFree.ts`. 슬롯 배치 샘플과 자유배치 생성 함수 테스트에서 380mm 확인 | 인증된 실제 프로젝트 생성/export 확인 | 부분 연결 |
| `pdfViewSelection.ts` | `usePDFExport.ts` 선택 뷰 정규화, 레거시 `2d-right`/`right` 값을 `2d-left`로 변환, `2d-door-only`/`door-only`를 `2d-door`로 변환. `3d-front`는 더 이상 PDF view type으로 제공하지 않고 legacy 입력은 제외 | PDF 템플릿 UI의 우측뷰 잔존 여부 확인 | 부분 연결 |
| `dxfDataRenderer.ts` 측면뷰 정규화 | DXF 데이터 생성 시 right/rightmost 요청을 left/leftmost로 정규화 | 실제 ZIP/PDF export 생성물 검증 | 부분 연결 |
| `clothingRodGeometry.ts` | `ClothingRod.tsx` 옷봉/브라켓 치수와 2D 탑뷰 숨김 | DXF/PDF 추출물 내 옷봉 동일성 검증 | 부분 연결 |
| `shelfInsetCalculator.ts` | `calculatePanelDetails.ts`, `SingleType2.tsx`, `DualType2.tsx`, `UpperCabinet.tsx`, `BoxModule.tsx`, `LowerCabinet.tsx`, `CustomizableBoxModule.tsx` | 실제 2D/PDF/DXF 생성물 검증 | 부분 연결 |
| `furnitureDimensionCalculator.ts` drawing segments | 회귀 테스트, 자유배치 W/H/D 우선순위 기준 | `CADDimensions2D.tsx`, `CleanCAD2D.tsx`, PDF/DXF 호출부 | 기준 잠금 |
| `exportStateSnapshot.ts` | `useDXFExport.ts`, `dxfToPdf.ts`, `usePDFExport.ts`, export UI patch 변경 여부 비교 | 실제 내보내기 중 화면 깜빡임 재현 검증 | 부분 연결 |
| `useDXFExport.ts`/`dxfToPdf.ts` state churn | DXF export 중 `placedModules`를 도면마다 재설정하지 않도록 제거, 마지막 복원도 변경 감지 후 수행. PDF/DXF export UI patch도 값이 바뀔 때만 적용. 개별 DXF 다운로드도 정면/평면/슬롯별 좌측/도어 생성 전 해당 2D 뷰로 전환 | 실제 브라우저 export 중 화면 깜빡임 재현 검증 | 부분 연결 |
| `ConvertModal.tsx`/legacy `ExportPanel.tsx`/`usePDFExport.ts` PDF export | PDF export 선택지에서 3D 투시도를 제외하고, legacy `PDF_VIEW_TYPES`에서도 `3d-front`를 제거했다. 미사용 PDF 프리뷰 캡처 경로를 제거해 modal export가 view mode/dimension UI를 직접 순회하지 않도록 정리. `usePDFExport.ts` 캡처도 3D 분기 없이 2D/wireframe으로 고정. legacy `ExportPanel` 미리보기 도어 캡처도 2D 정면 와이어프레임으로 고정. Header → Configurator → ConvertModal open 경로와 `left`/`sideLeft` 기본 선택값을 회귀 테스트로 고정 | 실제 브라우저 PDF 다운로드 중 화면 깜빡임 재현 검증 | 부분 연결 |
| 브라우저 PDF/DXF 샘플 검증 | `/demo` + Playwright에서 실제 R3F scene 기반 PDF/DXF 파일과 추출 audit 생성. 우측뷰 없음, 슬롯별 좌측뷰 4개, 현관장 380, 도어/경첩/폭/높이 텍스트, 옷봉/서랍/백패널/몸통 레이어 확인 | 인증된 실제 프로젝트에서 UI 버튼 클릭 경로와 사용자가 만든 템플릿 출력 검증 | 부분 연결 |
| `sideViewModuleFilter.ts` | `PlacedFurnitureContainer.tsx`, `CleanCAD2D.tsx`, DXF/PDF 측면 export 슬롯 선택, `usePDFExport.ts` 측면 페이지 생성, 듀얼 가구의 양쪽 점유 슬롯 그룹 생성 | 실제 브라우저 export 중 깜빡임 시각 검증 | 부분 연결 |
| `pdfDoorDrawingGeometry.ts` | `usePDFExport.ts` 레거시 jsPDF fallback 도어 도면용 도어/서랍 추출, 듀얼 leaf 폭, 경첩 방향, 외곽 높이 치수 bounds | 기본 PDF export는 `dxfToPdf.ts` 경로이므로 실제 도어 도면 캡처 결과 검증 | 부분 연결 |
| `Hinge.tsx` door-hinge naming | 경첩 Line/Line2 객체가 `door-hinge` 이름을 갖고, `dxfDataRenderer.ts`가 부모 이름 기준으로 `DOOR` 레이어에 분류. 무명 child Line이 부모 `door-hinge`만으로도 `DOOR` 레이어/ACI 3으로 추출되고, door-only DXF drawing data에 남는 회귀 테스트 추가 | 실제 PDF/DXF door-only 출력에서 경첩 표시 확인 | 부분 연결 |
| `dxfToPdf.ts` door-only filter | PDF 도어 도면 레이어 필터를 `filterDoorOnlyDrawingData`로 공통화하고 `DOOR`/`DOOR_DIMENSIONS`만 남기는 회귀 테스트 추가 | 실제 PDF door-only 페이지 캡처 결과 검증 | 부분 연결 |
| `dxfToPdf.ts` export depth footer / empty pages | PDF 일반 페이지, 슬롯별 측면 페이지, 한 장 레이아웃 타이틀블록 깊이 표기를 `resolveMaxPlacedModuleExportDepth`로 통일. 현관장 H legacy 400mm 값은 380mm로 보정. 선/텍스트 없는 PDF 뷰 페이지와 한 장 장표의 빈 슬롯별 측면 데이터는 생성/배치하지 않음 | 실제 PDF 샘플 깊이 표기와 페이지 수 확인 | 부분 연결 |
| `dxfFromScene.ts` side policy | 레거시 `side`와 현재 `sideLeft` 파일명에 right가 없고, `side`가 좌측뷰 투영 좌표를 만드는 회귀 테스트 추가. `/demo` DXF 샘플에서 우측뷰 문자열 없음 확인 | 인증된 실제 프로젝트 DXF 다운로드 확인 | 부분 연결 |
| `buildCombinedDxfFromDrawingData` layout | 통합 DXF 생성 시 선/텍스트 없는 측면도와 우측 도면 제목을 제외하고, 전체 빈 입력은 `NO DRAWING DATA`로 대체하는 회귀 테스트 추가. `/demo` DXF 샘플에서 측면도 1~4, 빈 도면 없음 확인 | 인증된 실제 프로젝트 DXF 다운로드 확인 | 부분 연결 |
| `PDFTemplatePreview.tsx` side policy | 기본 템플릿 메뉴/슬롯에서 우측뷰를 제거하고, 편집 오버레이 방향 버튼도 `all/front/top/left`만 노출. PDF 생성 폴백의 `viewType === 'right'` 분기 제거. `Right VIEW`/`target: 'right'`/`right?: string`/`viewType === 'right'`/우측 방향 버튼 재도입을 막는 회귀 테스트 추가 | 실제 PDF 템플릿 미리보기/출력 확인 | 부분 연결 |
| `backWallGapValidation.ts` | `PlacedModulePropertiesPanel.tsx` 입력값/화살표 증감 | 뒷벽 이격 의미 변경은 Phase 4에서 별도 처리 | 연결 |

## 확인해야 할 파일

| 영역 | 파일 |
| --- | --- |
| 도어 3D | `src/editor/shared/viewer3d/components/modules/DoorModule.tsx` |
| 몸통/프레임/패널 | `src/editor/shared/viewer3d/components/modules/components/BaseFurnitureShell.tsx` |
| 선반/옷봉 | `src/editor/shared/utils/shelving.ts`, `src/editor/shared/viewer3d/components/modules/ShelfRenderer.tsx` |
| 배치 깊이 | `src/editor/shared/furniture/hooks/usePlaceFurnitureAtSlot.ts`, `src/editor/shared/furniture/hooks/usePlaceFurnitureFree.ts` |
| 2D 치수 | `src/editor/shared/viewer3d/components/elements/CADDimensions2D.tsx`, `src/editor/shared/viewer3d/components/elements/CleanCAD2D.tsx` |
| PDF | `src/editor/shared/hooks/usePDFExport.ts`, `src/editor/shared/components/PDFTemplatePreview/PDFTemplatePreview.tsx` |
| DXF | `src/editor/shared/utils/dxfDataRenderer.ts` |
| 패널리스트 | `src/editor/shared/utils/calculatePanelDetails.ts` |

## 완료 판정

Phase -1은 아래 조건을 모두 만족해야 완료한다.

- 대표 케이스별 기준 치수가 문서 또는 테스트 fixture로 고정되어 있다.
- 새 계산기 테스트가 기존 출력과 비교 가능한 형태로 존재한다.
- 2D/PDF/DXF/패널리스트 중 어느 경로가 같은 계산기를 쓰는지 명시되어 있다.
- 수정 전/후 차이가 의도된 축인지 확인할 수 있다.
