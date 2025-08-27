#!/bin/bash
# ===== PR 머지 & 후처리 원클릭 보조 스크립트 =====
set -e

PR_URL="https://github.com/leejinsoo1979/250709in/pull/1"
BRANCH="feature/auto-commit-setup"

cat <<'MSG'

🧭 안내
- 분홍 박스의 빨간 X들은 "예전 커밋"의 실패 기록입니다. 최신 커밋이 초록불이면 머지해도 안전합니다.
- Squash & merge로 머지하면 메인에는 새 1개 커밋만 남고, 과거 빨간 기록은 메인에 반영되지 않습니다.
- Vercel "Ready"는 프리뷰 배포가 정상이라는 뜻입니다.

📌 지금 할 일
1) 브라우저가 열리면 PR 페이지에서 상태가 모두 초록인지 확인
2) Merge 방식은 "Squash and merge" 추천
3) 머지 완료 후 터미널로 돌아와 Enter

MSG

# PR 페이지 열기 (macOS)
if command -v open >/dev/null 2>&1; then
  open "$PR_URL"
else
  echo "🔗 PR URL: $PR_URL"
fi

read -p "✅ PR을 머지 완료했다면 Enter 를 눌러 로컬 정리를 진행합니다..."

# 안전 체크: git 저장소인지 확인
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "❌ git repo가 아닙니다. 프로젝트 루트에서 실행하세요."; exit 1; }

# 최신 메인 받기 + 작업 브랜치 정리
echo "🧹 메인 동기화 & 작업 브랜치 정리 중..."
git checkout main
git pull

# 로컬 브랜치 삭제 (있으면)
git branch --list "$BRANCH" >/dev/null | grep "$BRANCH" >/dev/null 2>&1 && git branch -D "$BRANCH" || true
# 원격 브랜치 삭제 (있으면)
git ls-remote --heads origin "$BRANCH" | grep "$BRANCH" >/dev/null 2>&1 && git push origin --delete "$BRANCH" || true

cat <<'DONE'

🎉 정리 완료!

다음 권장 마무리:
- GitHub Settings → Branches → main 규칙에 Required checks로
  "CI / test (18.x)", "CI / test (20.x)" 추가
- Vercel에서 main 배포(Production) 상태 확인
- 필요하면 README의 CI 배지가 초록인지 확인

문제 생기면 실패 로그 앞 30줄만 붙여 주세요. 바로 잡아 드릴게요.
DONE