from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Preformatted, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from datetime import datetime
import glob, os

# 폰트 탐색 - TTF 파일도 포함
FONT_CANDIDATES = []
for root in [os.path.expanduser("~/Library/Fonts"), "/Library/Fonts", "/System/Library/Fonts"]:
    for pattern in ["NotoSansKR*.otf", "NotoSansKR*.ttf", "NotoSans*.ttf", "AppleGothic.ttf"]:
        for p in glob.glob(os.path.join(root, pattern)):
            FONT_CANDIDATES.append(p)

# 시스템 기본 한글 폰트 추가 탐색
if not FONT_CANDIDATES:
    # macOS 기본 한글 폰트 경로들
    default_fonts = [
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
        "/System/Library/Fonts/Supplemental/AppleMyungjo.ttf"
    ]
    for font in default_fonts:
        if os.path.exists(font):
            FONT_CANDIDATES.append(font)
            break

if not FONT_CANDIDATES:
    # 폰트가 없어도 영어로 진행
    print("⚠️ 한글 폰트를 찾지 못했습니다. 기본 폰트로 진행합니다.")
    FONT_PATH = None
else:
    FONT_PATH = sorted(FONT_CANDIDATES)[0]
    print(f"✅ 사용할 폰트: {FONT_PATH}")
    
    # TTC 파일 처리 (TTFont는 TTC를 직접 지원하지 않음)
    if FONT_PATH.endswith('.ttc'):
        # TTC는 ReportLab에서 직접 지원하지 않으므로 건너뜀
        print("⚠️ TTC 폰트는 직접 사용할 수 없습니다. 기본 폰트로 진행합니다.")
        FONT_PATH = None

# 폰트 등록 시도
if FONT_PATH:
    try:
        pdfmetrics.registerFont(TTFont("KOR", FONT_PATH))
        FONT_NAME = "KOR"
    except Exception as e:
        print(f"⚠️ 폰트 등록 실패: {e}. 기본 폰트로 진행합니다.")
        FONT_NAME = "Helvetica"
else:
    FONT_NAME = "Helvetica"

# 스타일
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleCenter", parent=styles["Title"], alignment=TA_CENTER, textColor=colors.HexColor("#111111"), fontName=FONT_NAME))
styles.add(ParagraphStyle(name="H1K", parent=styles["Heading1"], spaceAfter=10, textColor=colors.HexColor("#1f2937"), fontName=FONT_NAME))
styles.add(ParagraphStyle(name="H2K", parent=styles["Heading2"], spaceAfter=6, textColor=colors.HexColor("#111827"), fontName=FONT_NAME))
styles.add(ParagraphStyle(name="BodyK", parent=styles["BodyText"], spaceAfter=8, leading=16, fontName=FONT_NAME))
styles.add(ParagraphStyle(name="MonoK", fontName="Courier", fontSize=9, leading=12, textColor=colors.HexColor("#111111")))

pdf_path = "Git_Autocommit_LFS_CI_Guide.pdf"
doc = SimpleDocTemplate(pdf_path, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=48, bottomMargin=48)
story = []

today = datetime.now().strftime("%Y-%m-%d %H:%M")
story.append(Paragraph("Git Workflow & Auto Checkpoint System - Guide", styles["TitleCenter"]))
story.append(Spacer(1, 6))
story.append(Paragraph(f"Version: 1.0  |  Created: {today}", styles["BodyK"]))
story.append(Spacer(1, 18))

# 1. 개요
story.append(Paragraph("1. Overview / Scope", styles["H1K"]))
story.append(Paragraph(
    "This document summarizes the automatic checkpoint commits, Git LFS, and GitHub Actions CI setup configured in the repository. "
    "These changes only affect development workflow (version control, large files, CI) and do not impact the application runtime logic.",
    styles["BodyK"])
)

# 2. 상태 요약
story.append(Paragraph("2. Configuration Summary (Current Status)", styles["H1K"]))
story.append(Paragraph(
    "• Git LFS: Installed, <b>.gitattributes</b> committed<br/>"
    "• Tracked extensions: <b>*.glb, *.gltf, *.png, *.jpg</b><br/>"
    "• Auto checkpoint: <b>scripts/checkpoint.js</b> working (create/delete tests passed)<br/>"
    "• NPM scripts: <b>checkpoint</b>, <b>autocommit</b>, <b>push</b>, <b>push:feature</b> available<br/>"
    "• Recommended: main branch protection + PR-based merge",
    styles["BodyK"])
)

# 3. 일상 워크플로우
story.append(Paragraph("3. Daily Workflow (with Claude Code)", styles["H1K"]))
story.append(Paragraph(
    "1) Start work<br/>"
    "&nbsp;&nbsp;• <code>git checkout -b feature/&lt;feature-name&gt;</code><br/>"
    "&nbsp;&nbsp;• Run <code>npm run autocommit</code> in separate terminal (auto detect/checkpoint)<br/><br/>"
    "2) During work<br/>"
    "&nbsp;&nbsp;• Auto commit on each change detected (message: <i>chore: checkpoint ...</i>)<br/><br/>"
    "3) Push/PR<br/>"
    "&nbsp;&nbsp;• <code>npm run push</code> or first upstream <code>npm run push:feature</code><br/>"
    "&nbsp;&nbsp;• <code>gh pr create -f -B main -H feature/&lt;feature-name&gt;</code><br/><br/>"
    "4) Important<br/>"
    "&nbsp;&nbsp;• Never commit directly to main → Always PR from feature branch<br/>"
    "&nbsp;&nbsp;• Never commit <b>.env*</b>, <b>dist/</b> (.gitignore configured)<br/>"
    "&nbsp;&nbsp;• Large binaries managed by LFS",
    styles["BodyK"])
)

# 4. 브랜치 보호
story.append(Paragraph("4. Branch Protection (GitHub)", styles["H1K"]))
story.append(Paragraph(
    "GitHub → Settings → Branches → Add rule<br/>"
    "• Branch name pattern: <b>main</b><br/>"
    "• ✅ Require a pull request before merging<br/>"
    "• ✅ Require status checks to pass<br/>"
    "• ✅ Require conversation resolution<br/>"
    "• ✅ Include administrators",
    styles["BodyK"])
)

# 5. CI/CD 예시
story.append(Paragraph("5. CI/CD (GitHub Actions Example)", styles["H1K"]))
ci_yaml = """name: CI
on:
  push:
    branches: [ main, develop, 'feature/**' ]
  pull_request:
    branches: [ main ]
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20]
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
      - run: git lfs install && git lfs pull
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --run
      - run: npm run build
"""
story.append(Preformatted(ci_yaml, styles["MonoK"]))

# 6. 자동 커밋 구성
story.append(Paragraph("6. Auto Commit Components", styles["H1K"]))
story.append(Paragraph("6.1 NPM Scripts (package.json)", styles["H2K"]))
pkg_scripts = """"scripts": {
  "checkpoint": "node scripts/checkpoint.js",
  "autocommit": "chokidar \\"src/**/*\\" \\"public/**/*\\" \\"package.json\\" -i \\"dist/**\\" -i \\"**/*.map\\" --debounce 600 -c \\"npm run checkpoint\\"",
  "push": "git push origin HEAD",
  "push:feature": "git push -u origin $(git branch --show-current)"
}"""
story.append(Preformatted(pkg_scripts, styles["MonoK"]))

story.append(Paragraph("6.2 Checkpoint Script (scripts/checkpoint.js)", styles["H2K"]))
checkpoint_js = """#!/usr/bin/env node
import { execSync } from 'node:child_process';

function run(cmd){ execSync(cmd,{stdio:'inherit'}); }

try{
  run('git add -A'); // Stage all changes
  const msg = `chore: checkpoint ${new Date().toISOString()}`;
  run(`git commit -m "${msg}"`);
}catch(e){
  console.log('No changes to commit.');
}"""
story.append(Preformatted(checkpoint_js, styles["MonoK"]))

# 7. LFS
story.append(Paragraph("7. Large Files (Git LFS)", styles["H1K"]))
story.append(Paragraph(
    "• Install/activate: <code>brew install git-lfs</code> → <code>git lfs install</code><br/>"
    "• Tracked extensions: <b>*.glb, *.gltf, *.png, *.jpg</b><br/>"
    "• In CI: <code>actions/checkout@v4</code> with <code>lfs: true</code> + <code>git lfs pull</code>",
    styles["BodyK"])
)

# 8. 보안/운영 수칙
story.append(Paragraph("8. Security/Operations Rules", styles["H1K"]))
story.append(Paragraph(
    "• Never record Secrets/PAT in repo or docs (use <code>gh auth login</code>)<br/>"
    "• Never commit/push directly to main → Always PR from feature branch<br/>"
    "• Use auto commit for work units, pause watcher during bulk changes",
    styles["BodyK"])
)

# 9. 문제 해결 / 롤백
story.append(Paragraph("9. Troubleshooting / Rollback", styles["H1K"]))
tb = """• Stop watcher: Ctrl+C (terminate autocommit)
• Restore files: git checkout -- scripts/checkpoint.js package.json .gitattributes .gitignore
• Discard branch: git checkout main && git branch -D feature/auto-commit-setup
• Disable LFS: git lfs untrack "*.glb" "*.gltf" "*.png" "*.jpg" then commit .gitattributes
"""
story.append(Preformatted(tb, styles["MonoK"]))

# 부록
story.append(PageBreak())
story.append(Paragraph("Appendix A. Pull Request Template", styles["H1K"]))
pr_tmpl = """## Summary
- Changes:

## Checklist
- [ ] Tests/lint/build pass
- [ ] DXF/3D changes include snapshot/entity count tests
- [ ] Docs (README/CLAUDE.md/docs) updated
"""
story.append(Preformatted(pr_tmpl, styles["MonoK"]))

story.append(Paragraph("Appendix B. CODEOWNERS Example", styles["H1K"]))
owners = """* @leejinsoo1979
src/editor/** @leejinsoo1979
"""
story.append(Preformatted(owners, styles["MonoK"]))

doc.build(story)
print(f"✅ PDF created: {pdf_path}")