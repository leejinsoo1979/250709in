# Git Workflow & 자동 체크포인트 시스템

## 🛡️ 브랜치 보호 설정 (GitHub)

### 1. main 브랜치 보호 규칙
GitHub → Settings → Branches → Add rule
- **Branch name pattern**: `main`
- ✅ **Require a pull request before merging**
  - ✅ Require approvals (최소 1명)
  - ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
- ✅ **Require conversation resolution before merging**
- ✅ **Include administrators** (관리자도 규칙 적용)

## 🔧 CI/CD에서 Git LFS 활성화

### GitHub Actions (.github/workflows/*.yml)
```yaml
name: CI
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true  # Git LFS 파일 자동 체크아웃
      
      - name: Ensure LFS is working
        run: |
          git lfs install
          git lfs pull
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
```

### Vercel (vercel.json)
```json
{
  "build": {
    "env": {
      "ENABLE_FILE_SYSTEM_API": "1"
    }
  },
  "installCommand": "git lfs install && git lfs pull && npm install",
  "buildCommand": "npm run build"
}
```

### Netlify (netlify.toml)
```toml
[build]
  command = "git lfs install && git lfs pull && npm run build"
  publish = "dist"

[build.environment]
  GIT_LFS_ENABLED = "true"
```

## 💻 Claude Code 사용 루틴

### 작업 시작 시
```bash
# 1. 새 feature 브랜치 생성
git checkout -b feature/your-feature-name

# 2. 자동 체크포인트 활성화 (별도 터미널)
npm run autocommit
# → 이제 파일 변경 시마다 자동으로 체크포인트 생성됨

# 3. 작업 진행
# 파일 생성/수정/삭제가 600ms 후 자동 커밋됨
```

### 작업 중
```bash
# 수동 체크포인트 (필요시)
npm run checkpoint

# 현재 상태 확인
git status
git log --oneline -5
```

### 작업 완료 후
```bash
# 1. 원격에 푸시
npm run push:feature  # 최초 푸시 (upstream 설정)
# 또는
npm run push          # 이후 푸시

# 2. GitHub에서 PR 생성
# → https://github.com/leejinsoo1979/250709in/pulls

# 3. PR 머지 후 로컬 정리
git checkout main
git pull origin main
git branch -d feature/your-feature-name
```

## 📦 대용량 파일 & 보안 관리

### Git LFS로 관리되는 파일
- `*.glb` - 3D 모델 파일
- `*.gltf` - 3D 모델 파일  
- `*.png` - 이미지 파일
- `*.jpg` - 이미지 파일

### .gitignore로 제외되는 항목
```
# 빌드 산출물
dist/
build/
coverage/

# 환경 변수 (절대 커밋 금지!)
.env*

# 의존성
node_modules/

# 로그
*.log

# OS 파일
.DS_Store
Thumbs.db

# 임시 파일
*.tmp
*.temp
```

### 보안 체크리스트
- ❌ **절대 커밋하면 안 되는 것들**:
  - API 키, 시크릿 (.env 파일)
  - Firebase 서비스 계정 키
  - 개인정보가 포함된 데이터
  - 빌드된 결과물 (dist/)

- ✅ **커밋해도 안전한 것들**:
  - 소스 코드
  - 설정 파일 (package.json, tsconfig.json 등)
  - 문서 (README.md, docs/)
  - 테스트 파일

## 🎯 베스트 프랙티스

### 1. 커밋 단위
- 작은 단위로 자주 커밋 (자동 체크포인트가 처리)
- 논리적 단위로 그룹화
- 의미 있는 커밋 메시지 작성

### 2. 브랜치 전략
```
main (보호됨)
├── feature/새기능
├── fix/버그수정
├── chore/유지보수
└── docs/문서화
```

### 3. PR 체크리스트
- [ ] 테스트 통과 (`npm test`)
- [ ] 빌드 성공 (`npm run build`)
- [ ] 린트 통과 (`npm run lint`)
- [ ] 문서 업데이트 (필요시)
- [ ] CHANGELOG 업데이트 (주요 변경시)

### 4. 대용량 파일 처리
- 이미지 최적화 후 커밋
- 3D 모델은 압축 포맷 사용
- 불필요한 에셋 정기적으로 정리
- Git LFS 스토리지 용량 모니터링

## 🚨 문제 해결

### LFS 관련 에러
```bash
# LFS 파일이 제대로 다운로드되지 않을 때
git lfs fetch --all
git lfs pull

# LFS 캐시 정리
git lfs prune
```

### 체크포인트 충돌
```bash
# 자동 커밋으로 인한 충돌 시
git rebase -i HEAD~n  # n은 정리할 커밋 수
# 'squash' 또는 'fixup'으로 커밋 정리
```

### 푸시 실패
```bash
# 대용량 파일로 인한 실패
git lfs migrate import --include="*.png,*.jpg"
git push origin feature/branch --force-with-lease
```

## 📝 명령어 요약

| 명령어 | 설명 | 사용 시점 |
|--------|------|-----------|
| `npm run autocommit` | 자동 체크포인트 모드 | 작업 시작 시 |
| `npm run checkpoint` | 수동 체크포인트 | 즉시 저장 필요 시 |
| `npm run push` | 현재 브랜치 푸시 | 원격 동기화 |
| `npm run push:feature` | 새 브랜치 첫 푸시 | 브랜치 생성 후 |
| `git lfs ls-files` | LFS 파일 목록 | LFS 상태 확인 |
| `git lfs status` | LFS 상태 확인 | 푸시 전 체크 |

---

최종 업데이트: 2025-08-27