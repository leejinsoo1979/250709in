# FIX 실행 보고서

기준 문서: `docs/FIX_PLAN_2026-05-10.md`

## 수행 범위

이번 범위는 전체 27건 수정이 아니라 Phase -1과 Phase 0까지만 대상으로 한다.

- Phase -1: 기준 fixture/baseline 저장, regression scaffold 생성
- Phase 0: 공통 계산기 scaffold 추가
- 기존 렌더/출력 로직 교체 금지
- PDF/DXF 출력 변경 금지
- 대규모 리팩토링 금지

## 현재 작업트리 감사

현재 작업트리에는 이전 세션 변경이 이미 섞여 있다.

- `git status --short` 기준 변경 항목: 68개
- 변경 범위에는 `DoorModule.tsx`, `calculatePanelDetails.ts`, `usePDFExport.ts`, `useDXFExport.ts`, `dxfToPdf.ts`, `dxfDataRenderer.ts`가 포함된다.
- 따라서 현재 전체 작업트리를 한 번에 커밋하면 이번 범위의 금지 조건인 기존 렌더/출력 로직 교체 금지와 50개 이상 파일 수정 금지를 위반한다.
- 이 보고서는 Phase -1/0 허용 산출물과 범위 초과 변경을 분리해 기록한다.

## 수정 파일 목록

이번 Phase -1/0 허용 산출물로 분리 가능한 파일:

- `src/editor/shared/utils/moduleClassification.ts`
- `src/editor/shared/utils/__tests__/moduleClassification.test.ts`
- `src/editor/shared/utils/doorGeometryCalculator.ts`
- `src/editor/shared/utils/__tests__/doorGeometryCalculator.test.ts`
- `src/editor/shared/utils/shelfInsetCalculator.ts`
- `src/editor/shared/utils/__tests__/shelfInsetCalculator.test.ts`
- `src/editor/shared/utils/__fixtures__/phase0Baselines.ts`
- `src/editor/shared/utils/__tests__/phase0Baselines.test.ts`
- `docs/FIX_EXECUTION_REPORT_2026-05-10.md`

현재 작업트리에 존재하지만 이번 Phase -1/0 범위를 넘는 변경:

- `src/editor/shared/viewer3d/components/modules/DoorModule.tsx`
- `src/editor/shared/utils/calculatePanelDetails.ts`
- `src/editor/shared/hooks/usePDFExport.ts`
- `src/editor/shared/hooks/useDXFExport.ts`
- `src/editor/shared/utils/dxfToPdf.ts`
- `src/editor/shared/utils/dxfDataRenderer.ts`
- `src/editor/Configurator/components/ConvertModal.tsx`
- `src/editor/shared/components/PDFTemplatePreview/PDFTemplatePreview.tsx`
- 기타 렌더/출력/스토어/배치 연결 파일

## Fixture 저장 결과

저장 파일:

- `src/editor/shared/utils/__fixtures__/phase0Baselines.ts`

저장한 기준:

- module classification 기준
  - `upper-cabinet-shelf-500`
  - `single-entryway-h-500`
  - `dual-lower-induction-cabinet-1000`
- door leaf W/H 기준
  - 상부장 싱글 도어 leaf 폭/높이
  - 듀얼 하부장 leaf 폭
  - 하부 상판내림 도어 높이
- shelf front inset 기준
  - 상부장 30mm
  - 현관장 30mm
  - 일반 옷장 0mm

## Regression Scaffold

추가 또는 확인된 scaffold:

- `moduleClassification.test.ts`
- `doorGeometryCalculator.test.ts`
- `shelfInsetCalculator.test.ts`
- `phase0Baselines.test.ts`

이 테스트들은 기존 렌더링 결과를 직접 바꾸지 않고, 현재 기준값을 계산기 결과와 비교할 수 있게 만든다.

## Phase 0 계산기 Scaffold

### `moduleClassification.ts`

역할:

- 흩어진 `moduleId.includes(...)` 판별을 한 곳으로 모으기 위한 어댑터
- family, dual, upper/lower/entryway/channel/dummy/induction/pantry/fridge 계열 판별

### `doorGeometryCalculator.ts`

역할:

- door leaf W/H
- door vertical bottom/top/center
- 열린 도어 힌지 오프셋과 부모/자식 좌표 계산
- 기존 좌표식과 비교 가능한 관찰용 계산 결과 제공

주의:

- 이번 Phase -1/0 범위에서는 `DoorModule.tsx` 렌더 로직에 연결하면 안 된다.
- 현재 작업트리에는 이미 `DoorModule.tsx` 연결 변경이 존재하므로, 커밋 범위에서 제외해야 한다.

### `shelfInsetCalculator.ts`

역할:

- 선반 앞 들이기 기준을 관찰 가능한 함수로 분리
- 기본 30mm 기준과 명시 inset 우선순위 비교

주의:

- 이번 Phase -1/0 범위에서는 기존 선반 렌더/패널 목록 계산을 이 계산기로 교체하지 않는다.

## 검증 결과

최근 확인한 명령:

- `git diff --check`: 통과
- `npm run test -- ... --run`: 21 files / 101 tests 통과
- `npm run build`: 통과
- `npx vite build --debug`: 통과

이번 보고서 작성 후 확인한 명령:

```bash
npm run test -- src/editor/shared/utils/__tests__/moduleClassification.test.ts src/editor/shared/utils/__tests__/doorGeometryCalculator.test.ts src/editor/shared/utils/__tests__/shelfInsetCalculator.test.ts src/editor/shared/utils/__tests__/phase0Baselines.test.ts --run
npm run build
git diff --check
```

결과:

- Phase 0 테스트: 4 files / 29 tests 통과
- `npm run build`: 통과
- `git diff --check`: 통과
- Firebase dynamic import/chunk size warning은 기존 빌드 경고로 남음

## Phase 1에서 수정 가능한 저위험 항목

Phase 1에서 상대적으로 먼저 볼 수 있는 항목:

- `0510-03`: 뒷벽 이격 음수 입력 허용
- `0510-09`: 2D 입면 백패널/우라 뒤 밴드 표시 정책 정리
- `0508-06`: 선반 치수 입력창 위치/크기 보정

주의:

- 위 항목도 2D/PDF/DXF/패널 목록 동작과 직접 연결되면 Phase 1 저위험으로 보지 않는다.
- export 결과물이나 실제 렌더 좌표를 바꾸는 순간 Phase 3 이후 게이트로 올려야 한다.

## 회귀 위험이 높은 파일

이번 범위에서 커밋 제외해야 하는 고위험 파일:

- `src/editor/shared/viewer3d/components/modules/DoorModule.tsx`
- `src/editor/shared/utils/calculatePanelDetails.ts`
- `src/editor/shared/hooks/usePDFExport.ts`
- `src/editor/shared/hooks/useDXFExport.ts`
- `src/editor/shared/utils/dxfToPdf.ts`
- `src/editor/shared/utils/dxfDataRenderer.ts`
- `src/editor/shared/viewer3d/components/elements/CADDimensions2D.tsx`
- `src/editor/shared/viewer3d/components/elements/CleanCAD2D.tsx`
- `src/editor/shared/viewer3d/components/modules/components/BaseFurnitureShell.tsx`
- `src/store/core/furnitureStore.ts`

이 파일들은 실제 렌더, 패널 목록, PDF/DXF 출력, 배치 기본값에 직접 영향을 준다.

## 완료 판정

Phase -1/0 산출물은 scaffold 수준으로 분리 가능하다.

다만 현재 전체 작업트리에는 금지 범위 변경이 이미 섞여 있으므로, 전체 작업트리를 그대로 커밋하면 안 된다. 로컬 커밋을 진행할 경우 허용 산출물만 명시적으로 stage해야 한다.

## 로컬 커밋 결과

로컬 커밋:

```text
HEAD test: add phase 0 baseline scaffolds
```

커밋 포함 파일 수:

- 9개

커밋 포함 파일:

- `docs/FIX_EXECUTION_REPORT_2026-05-10.md`
- `src/editor/shared/utils/__fixtures__/phase0Baselines.ts`
- `src/editor/shared/utils/__tests__/doorGeometryCalculator.test.ts`
- `src/editor/shared/utils/__tests__/moduleClassification.test.ts`
- `src/editor/shared/utils/__tests__/phase0Baselines.test.ts`
- `src/editor/shared/utils/__tests__/shelfInsetCalculator.test.ts`
- `src/editor/shared/utils/doorGeometryCalculator.ts`
- `src/editor/shared/utils/moduleClassification.ts`
- `src/editor/shared/utils/shelfInsetCalculator.ts`

금지 파일 포함 여부:

- `DoorModule.tsx`: 커밋 미포함
- `calculatePanelDetails.ts`: 커밋 미포함
- `usePDFExport.ts`: 커밋 미포함
- `useDXFExport.ts`: 커밋 미포함
- `dxfToPdf.ts`: 커밋 미포함
- `dxfDataRenderer.ts`: 커밋 미포함
- PDF/DXF 출력 로직 파일: 커밋 미포함

Push:

- 수행하지 않음
