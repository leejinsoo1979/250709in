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
- nestedDesigns: true

---

## ORDER (요청 명령)
TASK-ID: P7-DESIGNS-UNDER-PROJECTS
GOAL: 디자인을 프로젝트 하위 경로에 저장/조회 (nested structure)
SCOPE: 새 경로 teams/{t}/projects/{p}/designs/{d} 사용
FILES-ALLOWED: src/firebase/collections.ts, src/services/designs.repo.ts, firestore.rules
DO-NOT-TOUCH: src/components/**, src/editor/**, styles/**
ACCEPTANCE: 새 경로 우선 + 듀얼라이트 + 폴백, tsc 0

---

## DRYRUN (적용 전 요약)
- Diff summary: 디자인 중첩 경로 구현 및 폴백 지원
- 변경 목록(최대 10줄):
  - src/flags.ts: nestedDesigns 플래그 추가
  - src/firebase/collections.ts: projectDesignsCol 등 헬퍼 추가
  - src/services/designs.repo.ts: 3단계 폴백 구현
  - scripts/migrate-designs-to-projects.ts: 마이그레이션 스크립트
  - firestore.rules: 중첩 프로젝트 디자인 권한 추가
  - 듀얼라이트: 새 경로 + 팀 경로 + 레거시 경로
- 리스크/전제(최대 3줄):
  - FLAGS.nestedDesigns=false로 즉시 롤백 가능
  - 기존 디자인은 삭제하지 않고 복사만 수행
  - 빌드 에러는 기존 문제로 이번 변경과 무관

---

## APPLY REPORT (적용 후 보고)
- Branch / Commit: feat/tenant-version-assets / 7392983
- 구현 결과:
  - ✅ 중첩 경로: teams/{t}/projects/{p}/designs/{d}
  - ✅ 3단계 폴백: nested → team → legacy
  - ✅ 듀얼라이트: 새 경로 + 이전 경로 동시 저장
  - ✅ 마이그레이션 스크립트 작성
- TypeScript: ✅ 0 errors (npx tsc --noEmit)
- Build: ❌ 기존 타입 에러로 실패 (P7과 무관)
- 롤백: FLAGS.nestedDesigns=false로 즉시 가능

---

## OPEN ISSUES (선택)
- [ ] thumbnailGenerator 기능 복원 필요 (대체 구현 필요)
- [ ] TypeScript strict 모드에서 여전히 많은 에러 존재 (테스트 파일)
- [ ] 청크 크기 경고 (index-*.js 2,997KB) - 코드 스플리팅 검토 필요

---

## HISTORY (이전 작업)

### P7-DESIGNS-UNDER-PROJECTS (완료)
- GOAL: 디자인을 프로젝트 하위 경로에 저장
- RESULT: 중첩 경로 구현, 3단계 폴백, 듀얼라이트 완료
- COMMIT: 7392983

### P6-FIX-TESTS-GREEN (개선됨)
- GOAL: 테스트 통과 개선
- RESULT: 43/86 통과 (50%), TypeScript OK, 빌드는 기존 에러
- COMMIT: 6fe4055 (vi.mocked 수정으로 개선)

### P6-TEST-VALIDATION (완료)
- GOAL: 통합 테스트 작성 및 검증
- RESULT: 5개 테스트 파일 작성 완료
- COMMIT: 7d562d8, 8595a04

### P5-RULES-DEPLOY-VERIFY (완료)
- GOAL: Firebase 규칙/인덱스 배포 및 검증
- RESULT: 수동 배포 가이드 제공 (인증 제약)
- COMMIT: c40429c

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