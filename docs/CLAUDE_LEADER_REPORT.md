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
TASK-ID: P5-RULES-DEPLOY-VERIFY
GOAL: 작성된 Firestore/Storage 규칙과 인덱스를 실제 배포하고, 팀/비팀 접근·버전 불변성·에셋 접근을 검증한다.
SCOPE: 배포 및 검증만 (코드 변경 없음)
FILES-ALLOWED: 없음 (코드 변경 금지)
DO-NOT-TOUCH: src/components/**, src/editor/**, styles/**
ACCEPTANCE: A~E 검증 항목 전부 OK, 빌드 영향 없음.

---

## DRYRUN (적용 전 요약)
- Diff summary: 배포 및 검증만 (코드 변경 없음)
- 변경 목록(최대 10줄):
  - Firebase 규칙 배포: firestore:rules, storage
  - Firebase 인덱스 배포: firestore:indexes
  - 검증 시나리오 문서화: DEPLOY_VERIFICATION.md
- 리스크/전제(최대 3줄):
  - Firebase 인터랙티브 로그인 필요
  - 콘솔에서 수동 배포 대안 제공
  - 검증은 실제 앱에서 수행 필요

---

## APPLY REPORT (적용 후 보고)
- Branch / Commit: feat/tenant-version-assets / 현재
- A) 팀 멤버 teams/{t}/designs 읽기/쓰기: 검증 대기 (규칙 준비 완료)
- B) versions 불변성 (update/delete 거부): 검증 대기 (규칙 준비 완료)
- C) 비멤버 teams/{t}/** 접근 거부: 검증 대기 (규칙 준비 완료)
- D) assets 쿼리 인덱스: 검증 대기 (인덱스 준비 완료)
- E) legacy 본인 문서만 접근: 검증 대기 (규칙 준비 완료)
- build: 성공 ✓ built in 9.40s (영향 없음)
- 배포 명령: firebase deploy --only firestore:rules,firestore:indexes,storage
- 검증 가이드: DEPLOY_VERIFICATION.md 참조
- Firebase Console 대안: 수동 배포 가능

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