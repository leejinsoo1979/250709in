# 🦐 Shrimp Task Manager 설정 및 사용 가이드

## 📋 목차
1. [초기 설정](#초기-설정)
2. [기본 사용법](#기본-사용법)
3. [일상 워크플로우](#일상-워크플로우)
4. [고급 기능](#고급-기능)
5. [트러블슈팅](#트러블슈팅)

---

## 🚀 초기 설정

### 1. MCP 설정 확인
```json
{
  "shrimp-task-manager": {
    "command": "node",
    "args": [
      "/Users/jinsoolee/mcp-shrimp-task-manager/dist/index.js"
    ],
    "env": {
      "DATA_DIR": "/Users/jinsoolee/Desktop/250709in/SHRIMP",
      "TEMPLATES_USE": "templates_ko",
      "ENABLE_GUI": "true",
      "AUTO_SAVE": "true",
      "BACKUP_ENABLED": "true"
    }
  }
}
```

### 2. 데이터 디렉토리 구조
```
/Users/jinsoolee/Desktop/250709in/SHRIMP/
├── projects/           # 프로젝트 데이터
├── tasks/             # 작업 데이터
├── categories/        # 카테고리 설정
├── templates/         # 템플릿 파일
└── backups/          # 백업 파일
```

### 3. 초기 설정 완료 확인
- ✅ 데이터 디렉토리 생성: `/Users/jinsoolee/Desktop/250709in/SHRIMP`
- ✅ MCP 서버 연결 상태 확인
- ✅ GUI 활성화 설정

---

## 📋 기본 사용법

### 필수 명령어

#### 상태 확인
```bash
# MCP 연결 상태 확인
/mcp

# Shrimp Task Manager 상태
/mcp__shrimp-task-manager__status
```

#### 작업 관리
```bash
# 빠른 작업 추가
/mcp__shrimp-task-manager__quick-add "작업 내용"

# 상세 작업 추가
/mcp__shrimp-task-manager__add-task --title="제목" --category="카테고리" --priority="high|medium|low"

# 모든 작업 보기
/mcp__shrimp-task-manager__list-all

# 오늘의 작업
/mcp__shrimp-task-manager__today-tasks
```

#### 작업 상태 변경
```bash
# 작업 완료
/mcp__shrimp-task-manager__complete-task "task-id"

# 작업 진행률 업데이트
/mcp__shrimp-task-manager__update-progress "task-id" --progress=50

# 작업 상태 변경
/mcp__shrimp-task-manager__set-status "task-id" "in-progress|completed|pending"
```

### GUI 사용법
```bash
# GUI 실행
/mcp__shrimp-task-manager__open-gui

# 브라우저에서 접속: http://localhost:3000
```

---

## 🎯 일상 워크플로우

### 매일 아침 (9:00 AM)
```bash
# 1. 상태 확인
/mcp__shrimp-task-manager__status

# 2. 오늘의 할 일 확인
/mcp__shrimp-task-manager__today-tasks

# 3. 우선순위 높은 작업 3개 선택
/mcp__shrimp-task-manager__top-priority --limit=3

# 4. GUI 열어서 칸반 보드 확인
/mcp__shrimp-task-manager__open-gui
```

### 개발 중 (수시)
```bash
# 새로운 버그 발견
/mcp__shrimp-task-manager__quick-add "버그: 사이드바 버튼 호버 효과 문제" --category="🔧 Bug Fixes" --priority="medium"

# 기능 아이디어 메모
/mcp__shrimp-task-manager__quick-add "아이디어: 드래그 앤 드롭 파일 업로드" --category="💡 Ideas" --priority="low"

# 작업 완료 시
/mcp__shrimp-task-manager__complete-task "task-id-here"
```

### 매일 저녁 (6:00 PM)
```bash
# 1. 오늘 완료한 작업 확인
/mcp__shrimp-task-manager__completed-today

# 2. 진행률 리포트
/mcp__shrimp-task-manager__daily-report

# 3. 내일 계획 세우기
/mcp__shrimp-task-manager__plan-tomorrow

# 4. 백업 생성
/mcp__shrimp-task-manager__backup
```

### 주간 리뷰 (금요일)
```bash
# 1. 주간 성과 리포트
/mcp__shrimp-task-manager__weekly-report

# 2. 완료되지 않은 작업 검토
/mcp__shrimp-task-manager__pending-tasks

# 3. 다음 주 계획
/mcp__shrimp-task-manager__plan-next-week
```

---

## 🔧 고급 기능

### 카테고리 관리
```bash
# 카테고리 생성
/mcp__shrimp-task-manager__create-category "🎨 UI/UX Design"
/mcp__shrimp-task-manager__create-category "⚛️ React Development"
/mcp__shrimp-task-manager__create-category "🔧 Bug Fixes"
/mcp__shrimp-task-manager__create-category "📝 Documentation"
/mcp__shrimp-task-manager__create-category "🚀 Deployment"
/mcp__shrimp-task-manager__create-category "💡 Ideas"

# 카테고리별 작업 조회
/mcp__shrimp-task-manager__tasks-by-category "🎨 UI/UX Design"
```

### Git과 연동
```bash
# 커밋과 작업 연결
/mcp__shrimp-task-manager__link-commit "task-id" "commit-hash"

# 브랜치와 작업 연결
/mcp__shrimp-task-manager__link-branch "task-id" "feature/sidebar-improvements"

# TODO 주석을 작업으로 변환
/mcp__shrimp-task-manager__scan-todos --path="/Users/jinsoolee/Desktop/250709in/src"
```

### 리포팅 및 분석
```bash
# 진행률 분석
/mcp__shrimp-task-manager__progress-analysis

# 생산성 통계
/mcp__shrimp-task-manager__productivity-stats

# 병목 지점 분석
/mcp__shrimp-task-manager__bottleneck-analysis

# 시간 추적
/mcp__shrimp-task-manager__time-tracking "task-id"
```

### 백업 및 복원
```bash
# 수동 백업
/mcp__shrimp-task-manager__backup --name="before-major-changes"

# 백업 목록 확인
/mcp__shrimp-task-manager__list-backups

# 백업 복원
/mcp__shrimp-task-manager__restore --backup="backup-name"
```

---

## 🏗️ 프로젝트별 설정

### 현재 프로젝트 (250709in - 가구 디자인 앱)

#### 기본 카테고리
- 🎨 **UI/UX Design**: 디자인 시스템, 컴포넌트 디자인
- ⚛️ **React Development**: 컴포넌트 개발, 상태 관리
- 🔧 **Bug Fixes**: 버그 수정, 성능 개선
- 📝 **Documentation**: README, 주석, 가이드
- 🚀 **Deployment**: 빌드, 배포, CI/CD
- 💡 **Ideas**: 기능 아이디어, 개선사항

#### 우선순위 설정
- **High**: 치명적 버그, 핵심 기능
- **Medium**: 일반적인 기능 개발
- **Low**: 아이디어, 향후 개선사항

#### 작업 템플릿
```bash
# 버그 리포트
/mcp__shrimp-task-manager__use-template "bug-report" --title="버그 제목"

# 기능 개발
/mcp__shrimp-task-manager__use-template "feature-development" --title="기능 이름"

# 리팩토링
/mcp__shrimp-task-manager__use-template "refactoring" --title="리팩토링 대상"
```

---

## 🎨 GUI 기능 가이드

### 대시보드
- **진행률 차트**: 전체 프로젝트 진행률 시각화
- **카테고리별 분포**: 각 카테고리의 작업 분포
- **최근 활동**: 최근 완료한 작업들
- **오늘의 목표**: 오늘 완료해야 할 작업들

### 칸반 보드
- **드래그 앤 드롭**: 작업 상태 변경
- **실시간 업데이트**: 변경사항 즉시 반영
- **필터링**: 카테고리, 우선순위별 필터
- **검색**: 작업 제목, 내용 검색

### 통계 페이지
- **생산성 트렌드**: 일/주/월별 완료 작업 수
- **카테고리 분석**: 어떤 유형의 작업을 많이 하는지
- **소요 시간 분석**: 작업별 평균 소요 시간
- **완료율**: 예정 대비 실제 완료율

---

## 🚨 트러블슈팅

### 자주 발생하는 문제

#### 1. MCP 연결 실패
```bash
# 해결방법
pkill claude
# Claude 재시작 후
/mcp
```

#### 2. GUI 접속 불가
```bash
# 포트 확인
lsof -i :3000

# 강제 종료 후 재시작
/mcp__shrimp-task-manager__restart-gui
```

#### 3. 데이터 손실 우려
```bash
# 즉시 백업 생성
/mcp__shrimp-task-manager__emergency-backup

# 백업에서 복원
/mcp__shrimp-task-manager__restore --backup="latest"
```

#### 4. 성능 저하
```bash
# 데이터베이스 최적화
/mcp__shrimp-task-manager__optimize-db

# 캐시 클리어
/mcp__shrimp-task-manager__clear-cache
```

### 로그 확인
```bash
# 에러 로그 확인
tail -f /Users/jinsoolee/Desktop/250709in/SHRIMP/logs/error.log

# 활동 로그 확인
tail -f /Users/jinsoolee/Desktop/250709in/SHRIMP/logs/activity.log
```

---

## 📊 설정 완료 체크리스트

### 기본 설정
- [x] 데이터 디렉토리 생성
- [x] MCP 서버 설정 완료
- [x] GUI 활성화 설정
- [x] 기본 카테고리 생성 준비
- [x] 템플릿 설정 준비

### 워크플로우 준비
- [ ] 아침 루틴 명령어 테스트
- [ ] 개발 중 사용 명령어 테스트
- [ ] 저녁 루틴 명령어 테스트
- [ ] GUI 접속 테스트

### 고급 기능
- [ ] Git 연동 테스트
- [ ] 백업 시스템 테스트
- [ ] 리포팅 기능 테스트
- [ ] 템플릿 시스템 테스트

---

## 🎯 다음 단계

1. **즉시 실행**: `/mcp__shrimp-task-manager__status`로 연결 확인
2. **첫 작업 추가**: 간단한 테스트 작업 생성
3. **GUI 확인**: 웹 인터페이스 접속 테스트
4. **일주일 사용**: 실제 개발 작업에 적용
5. **워크플로우 최적화**: 개인 패턴에 맞게 조정

---

*📅 문서 생성일: 2024년 7월 23일*  
*🔄 마지막 업데이트: 2024년 7월 23일*  
*👤 작성자: Claude + 이진수*