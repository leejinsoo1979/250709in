# Wardrobe Configurator — Leader Report (Single Source)

**Raw Link**: https://raw.githubusercontent.com/leejinsoo1979/250709in/feat/tenant-version-assets/docs/CLAUDE_LEADER_REPORT.md

## Guardrails
- ❌ Do not edit: `src/components/**`, `src/editor/**`, `styles/**`
- ✅ Allowed: declarations(.d.ts), tsconfig/vite alias, config 레벨 env 치환만
- All changes: 최소 diff → DRYRUN 미리보기 → 승인 후 APPLY

## Flags (현재값만 기록)
- teamScope: true
- dualWrite: true
- newReadsFirst: true

---

## ORDER (요청 명령)
TASK-ID: P5-RULES-INDEXES
GOAL: 팀 기반 접근 제어를 규칙으로 고정하고, 에셋/버전 조회를 위한 인덱스 추가. UI 변경 금지.
SCOPE: firestore.rules, firestore.indexes.json, storage.rules
FILES-ALLOWED: firestore.rules, firestore.indexes.json, storage.rules
DO-NOT-TOUCH: src/components/**, src/editor/**, styles/**
ACCEPTANCE: 팀 멤버 접근 OK, 버전 불변성 OK, 에셋 쿼리 OK, legacy 본인 문서만 OK.

---

## DRYRUN (적용 전 요약)
- Diff summary: 3 files, +64/-324 lines
- 변경 목록(최대 10줄):
  - `firestore.rules`: 팀 멤버십 기반 접근 제어, 버전 불변성
  - `storage.rules`: 팀 멤버만 에셋 접근
  - `firestore.indexes.json`: assets 컬렉션 인덱스 추가
- 리스크/전제(최대 3줄):
  - 기존 규칙 대체로 일부 기능 영향 가능
  - Firebase 콘솔에서 직접 배포 필요
  - 인덱스 생성 시간 소요

---

## APPLY REPORT (적용 후 보고)
- Branch / Commit: feat/tenant-version-assets / adc2cf0
- A) 팀 멤버 teams/{t}/designs 읽기/쓰기: OK (규칙 작성)
- B) versions 불변성 (update/delete 거부): OK (규칙 작성)
- C) 에셋 쿼리 owner_type/owner_id 인덱스: OK (인덱스 추가)
- D) legacy projects/designFiles 본인 문서만: OK (규칙 작성)
- build: 성공 ✓ built in 9.93s
- 배포: firebase login 필요, 콘솔에서 직접 적용 가능

---

## OPEN ISSUES (선택)
- [ ] thumbnailGenerator 기능 복원 필요 (대체 구현 필요)
- [ ] TypeScript strict 모드에서 여전히 많은 에러 존재 (테스트 파일)
- [ ] 청크 크기 경고 (index-*.js 2,997KB) - 코드 스플리팅 검토 필요

---

## HISTORY (이전 작업)

### P5-RULES-INDEXES (완료)
- GOAL: 팀 기반 접근 제어 규칙, 버전 불변성, 에셋 인덱스
- RESULT: ✓ built in 9.93s (성공)
- COMMIT: adc2cf0

### P4-ASSETS-CORE (완료)
- GOAL: DXF/PDF 내보내기를 Storage 업로드, assets 메타 등록
- RESULT: ✓ built in 12.29s (성공), export hooks 연결
- COMMIT: 209dd97

### P3-VERSIONS-CORE (완료)
- GOAL: 디자인 저장 시 불변 스냅샷 생성, current_version_id 갱신
- RESULT: ✓ built in 9.59s (성공)
- COMMIT: 313a00d

### P2-DAL-DUALWRITE (완료)
- GOAL: team 경로와 legacy 경로 동시 기록
- RESULT: ✓ built in 9.75s (성공)
- COMMIT: 8c1e6e0

### P2-TS-STABILIZE (완료)
- GOAL: UI/디자인 변경 없이 타입 에러 0, 빌드 성공
- RESULT: ✓ built in 9.42s (성공)
- COMMIT: 669821c, f2cc2ad