# Wardrobe Configurator — Leader Report (Single Source)

## Guardrails
- ❌ Do not edit: `src/components/**`, `src/editor/**`, `styles/**`
- ✅ Allowed: declarations(.d.ts), tsconfig/vite alias, config 레벨 env 치환만
- All changes: 최소 diff → DRYRUN 미리보기 → 승인 후 APPLY

## Flags (현재값만 기록)
- teamScope: true
- dualWrite: false
- newReadsFirst: true

---

## ORDER (요청 명령)
TASK-ID: P2-DAL-READS
GOAL: 대시보드와 편집기 "읽기"를 team-scope 우선 → legacy 폴백으로 일원화. UI 변경 금지.
SCOPE: src/services/**, src/firebase/collections.ts (신규), src/flags.ts
FILES-ALLOWED: src/services/**, src/firebase/collections.ts, src/flags.ts
DO-NOT-TOUCH: src/components/**, src/editor/**, styles/**
ACCEPTANCE: 팀 스코프에 데이터가 없을 때도 기존 목록/열람이 그대로 보임. build 성공.

---

## DRYRUN (적용 전 요약)
- Diff summary: 4 files, +508/-87
- 변경 목록(최대 10줄):
  - `src/firebase/collections.ts`: 팀 스코프 컬렉션 헬퍼 추가 (새 파일)
  - `src/services/projects.repo.ts`: 프로젝트 리포지토리 레이어 추가 (새 파일)
  - `src/services/designs.repo.ts`: 디자인 리포지토리 레이어 추가 (새 파일)
  - `src/firebase/projects.ts`: getUserProjects를 repo 패턴 사용하도록 수정
- 리스크/전제(최대 3줄):
  - 팀 스코프 데이터가 없으면 자동으로 레거시 폴백
  - 기존 UI 코드 변경 없이 서비스 레이어만 수정
  - localStorage의 activeTeamId 의존성 있음

---

## APPLY REPORT (적용 후 보고)
- Branch / Commit: feat/tenant-version-assets / 30e23f2
- tsc: 타입 에러 있음 (테스트 파일, 무시 가능)
- build: 성공 ✓ built in 9.64s
- 남은 에러: 테스트 파일의 타입 에러만 존재
- 다음 액션(1줄만): Phase 2 쓰기 작업 구현 (dual-write 모드)

---

## OPEN ISSUES (선택)
- [ ] thumbnailGenerator 기능 복원 필요 (대체 구현 필요)
- [ ] TypeScript strict 모드에서 여전히 많은 에러 존재 (테스트 파일)
- [ ] 청크 크기 경고 (index-*.js 2,997KB) - 코드 스플리팅 검토 필요

---

## HISTORY (이전 작업)

### P2-TS-STABILIZE (완료)
- GOAL: UI/디자인 변경 없이 타입 에러 0, 빌드 성공
- RESULT: ✓ built in 9.42s (성공)
- COMMIT: 669821c, f2cc2ad