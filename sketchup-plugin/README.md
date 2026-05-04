# tttcraft for SketchUp

SketchUp 안에서 tttcraft 에디터를 그대로 사용하고, 디자인한 가구를 한 번에 SketchUp 모델로 가져오는 플러그인입니다.

## 요구사항

- **SketchUp 2022 이상** (Mac / Windows)
- 인터넷 연결

## 디렉터리 구조

```
sketchup-plugin/
├── tttcraft.rb              ← SketchUp 진입점 (SketchupExtension 등록)
├── tttcraft/
│   ├── main.rb              ← 메뉴/툴바/HtmlDialog
│   ├── importer.rb          ← base64 DAE → 임시파일 → model.import
│   └── icons/               ← 툴바 아이콘 (placeholder)
├── build.sh                 ← .rbz 빌드 스크립트
└── README.md
```

## 빌드

```bash
cd sketchup-plugin
./build.sh           # → tttcraft.rbz
./build.sh 1.0.0     # → tttcraft-1.0.0.rbz
```

## 개발 시 빠른 설치 (수동)

`.rbz` 빌드 없이 바로 테스트하려면 SketchUp Plugins 폴더에 심볼릭 링크를 걸면 됩니다.

### macOS
```bash
SKETCHUP_PLUGINS="$HOME/Library/Application Support/SketchUp 2024/SketchUp/Plugins"
ln -sf "$(pwd)/tttcraft.rb" "$SKETCHUP_PLUGINS/tttcraft.rb"
ln -sf "$(pwd)/tttcraft"    "$SKETCHUP_PLUGINS/tttcraft"
```
SketchUp 재시작.

### Windows
```
%AppData%\SketchUp\SketchUp 2024\SketchUp\Plugins\
```
에 `tttcraft.rb` 와 `tttcraft/` 폴더를 복사.

## 사용자용 .rbz 설치

1. 사용자가 `.rbz` 다운로드
2. SketchUp 실행 → **Window → Extension Manager** → **Install Extension**
3. `.rbz` 선택
4. (Unsigned 경고가 뜨면 일단 수락 — 디지털 서명은 Trimble Extension Warehouse 등록 시 자동 추가됨)
5. SketchUp 재시작
6. 상단 **Extensions** 메뉴 → **tttcraft** → **디자인 시작** 클릭
7. 또는 툴바의 tttcraft 아이콘 클릭

## 동작 흐름

```
[SketchUp 메뉴 클릭]
        ↓
HtmlDialog 창 열림 → https://tttcraft.com/?sketchup=1
        ↓
로그인 → 대시보드 → 에디터 (tttcraft 풀 기능 그대로)
        ↓
파일 메뉴 → 3D 내보내기 → DAE
        ↓
[웹앱] window.sketchup.import_dae(base64, filename) 호출
        ↓
[루비] base64 디코딩 → tmp 파일 저장 → model.import
        ↓
SketchUp 모델에 가구가 즉시 추가됨
```

## 웹앱 측 통합 포인트

`src/editor/shared/utils/sketchupBridge.ts` 가 `window.sketchup` 객체를 감지하고, DAE 익스포트 시점에 다운로드 대신 `import_dae` 콜백을 호출합니다.

- `?sketchup=1` 쿼리만으로도 강제 활성화 가능 (브라우저에서 모킹 테스트할 때 유용)
- 콘솔에서 임시 모킹:
  ```js
  window.sketchup = { import_dae: (b64, name) => console.log('DAE bytes ~', atob(b64).length, name) };
  ```

## 디버깅

- **루비 콘솔**: SketchUp → `Window → Ruby Console`
- **HtmlDialog 개발자 도구**:
  - Mac: 다이얼로그가 열린 상태에서 별도 디버깅 옵션 필요 (SketchUp 환경설정의 Ruby Debug)
  - 또는 코드 한 줄 추가: `@dialog.set_can_close(true)` + `add_action_callback`에 `puts` 디버그 출력
- **로컬 테스트 빠른 사이클**:
  1. 위 심볼릭 링크 방식으로 설치
  2. 코드 수정 후 SketchUp 재시작
  3. 메뉴 클릭 → 동작 확인

## 알려진 이슈 / TODO

- [ ] 아이콘 이미지를 실제 tttcraft 로고로 교체 (현재 1x1 투명 PNG)
- [ ] 구글 OAuth가 HtmlDialog 내장 CEF에서 막히는지 검증 → 막히면 시스템 브라우저 위임 흐름 추가
- [ ] DAE 임포트 시 좌표 단위(mm) 자동 인식 검증
- [ ] 대용량 디자인 (100+ 가구) 임포트 성능 측정
- [ ] Mac/Windows × SketchUp 2022/2023/2024 호환성 매트릭스 테스트
- [ ] 디지털 서명 (Trimble Extension Warehouse 등록 시 자동 처리)
