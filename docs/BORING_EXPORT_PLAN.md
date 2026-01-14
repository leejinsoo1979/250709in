# 보링 데이터 내보내기 기획안

## 1. 개요

### 1.1 목적
가구 설계 데이터에서 CNC 가공에 필요한 보링(홀 가공) 정보를 추출하여 다양한 CNC 소프트웨어 형식으로 내보내는 기능 구현

### 1.2 기대 효과
- 설계 → 생산 워크플로우 자동화
- 수작업 보링 도면 작성 시간 절감
- 가공 오류 감소

### 1.3 범위
- 패널별 보링 데이터 생성
- 다중 CNC 소프트웨어 포맷 지원
- 기존 옵티마이저 내보내기와 통합

---

## 2. 보링 타입 정의

### 2.1 힌지 보링 (Hinge Boring)

| 항목 | 규격 | 비고 |
|------|------|------|
| 컵 직경 | 35mm | 표준 유럽형 힌지 |
| 컵 깊이 | 11.5~13mm | 힌지 제조사별 상이 |
| 측판 거리 | 3~6mm | 오버레이 타입에 따라 |
| 상하 마진 | 70~120mm | 도어 상/하단에서 거리 |
| 힌지 간격 | 도어 높이에 따라 | 아래 표 참조 |

**도어 높이별 힌지 개수:**
| 도어 높이 | 힌지 개수 | 배치 |
|-----------|----------|------|
| ~800mm | 2개 | 상/하 |
| 800~1600mm | 3개 | 상/중/하 |
| 1600~2200mm | 4개 | 균등 배치 |
| 2200mm~ | 5개 | 균등 배치 |

### 2.2 캠락 보링 (Cam Lock Boring)

| 항목 | 규격 | 비고 |
|------|------|------|
| 캠 직경 | 15mm | 캠 하우징 |
| 캠 깊이 | 12.5mm | |
| 볼트 직경 | 5mm | 캠 볼트 |
| 볼트 깊이 | 관통 또는 34mm | |
| 패널 가장자리 거리 | 8mm (중심) | 18mm 패널 기준 |
| 캠 간 간격 | 32mm 배수 | 32mm 시스템 |

### 2.3 다웰 보링 (Dowel Boring)

| 항목 | 규격 | 비고 |
|------|------|------|
| 직경 | 8mm | 표준 다웰 |
| 깊이 | 12~15mm | 각 면 |
| 간격 | 32mm | 32mm 시스템 |
| 가장자리 거리 | 37mm | 첫 번째 홀 |

### 2.4 선반핀 보링 (Shelf Pin Boring)

| 항목 | 규격 | 비고 |
|------|------|------|
| 직경 | 5mm | 표준 선반핀 |
| 깊이 | 10~12mm | |
| 수직 피치 | 32mm | 32mm 시스템 |
| 측판 거리 | 37mm (전면), 37mm (후면) | 양쪽 열 |
| 시작 높이 | 바닥에서 37mm | |

### 2.5 조절발 보링 (Adjustable Foot Boring)

| 항목 | 규격 | 비고 |
|------|------|------|
| 직경 | 10mm | M10 너트 |
| 깊이 | 15mm 또는 관통 | |
| 위치 | 모서리에서 50mm | 전후좌우 |

---

## 3. 데이터 구조 설계

### 3.1 보링 데이터 인터페이스

```typescript
// 보링 타입 열거형
type BoringType =
  | 'hinge-cup'      // 힌지 컵홀 (Ø35)
  | 'hinge-screw'    // 힌지 나사홀 (Ø2~3)
  | 'cam-housing'    // 캠 하우징 (Ø15)
  | 'cam-bolt'       // 캠 볼트홀 (Ø5)
  | 'dowel'          // 다웰홀 (Ø8)
  | 'shelf-pin'      // 선반핀홀 (Ø5)
  | 'adjustable-foot' // 조절발 (Ø10)
  | 'custom';        // 사용자 정의

// 보링 면 열거형
type BoringFace =
  | 'front'   // 전면 (Z+)
  | 'back'    // 후면 (Z-)
  | 'top'     // 상면 (Y+)
  | 'bottom'  // 하면 (Y-)
  | 'left'    // 좌측면 (X-)
  | 'right';  // 우측면 (X+)

// 단일 보링 데이터
interface Boring {
  id: string;
  type: BoringType;
  face: BoringFace;
  x: number;          // 패널 좌하단 기준 X (mm)
  y: number;          // 패널 좌하단 기준 Y (mm)
  diameter: number;   // 직경 (mm)
  depth: number;      // 깊이 (mm), 0 = 관통
  angle?: number;     // 각도 (기본 90°, 수직)
  note?: string;      // 비고
}

// 패널 보링 데이터
interface PanelBoringData {
  panelId: string;
  panelName: string;
  panelWidth: number;   // 패널 가로 (mm)
  panelHeight: number;  // 패널 세로 (mm)
  panelThickness: number; // 패널 두께 (mm)
  borings: Boring[];
  material: string;
  grain: 'horizontal' | 'vertical' | 'none';
}

// 프로젝트 전체 보링 데이터
interface ProjectBoringData {
  projectId: string;
  projectName: string;
  createdAt: string;
  panels: PanelBoringData[];
  settings: BoringSettings;
}

// 보링 설정
interface BoringSettings {
  hingeType: 'clip-top' | 'sensys' | 'custom';
  hingeCupDiameter: number;
  hingeCupDepth: number;
  hingeEdgeDistance: number;
  shelfPinPitch: number;
  shelfPinDiameter: number;
  shelfPinDepth: number;
  dowelDiameter: number;
  dowelDepth: number;
  camHousingDiameter: number;
  camHousingDepth: number;
}
```

### 3.2 가구 모듈별 보링 패턴

```typescript
// 모듈별 보링 패턴 정의
interface ModuleBoringPattern {
  moduleType: string;  // 'lower-cabinet', 'upper-cabinet', etc.
  panels: {
    panelType: string; // 'side-left', 'side-right', 'top', 'bottom', 'back'
    boringPatterns: BoringPatternRule[];
  }[];
}

// 보링 패턴 규칙
interface BoringPatternRule {
  type: BoringType;
  face: BoringFace;
  positioning: {
    xRule: PositionRule;
    yRule: PositionRule;
  };
  conditions?: {
    minPanelHeight?: number;
    maxPanelHeight?: number;
    hasDoor?: boolean;
    hasDrawer?: boolean;
    shelfCount?: number;
  };
}

// 위치 계산 규칙
type PositionRule =
  | { type: 'fixed'; value: number }
  | { type: 'fromEdge'; edge: 'left' | 'right' | 'top' | 'bottom'; distance: number }
  | { type: 'center' }
  | { type: 'repeat'; start: number; pitch: number; end?: number }
  | { type: 'calculated'; formula: string };
```

---

## 4. 패널별 보링 매핑

### 4.1 하부장 (Lower Cabinet)

| 패널 | 보링 타입 | 위치 | 조건 |
|------|----------|------|------|
| 좌측판 | 힌지컵 | 전면, 도어 높이별 | 도어 있을 때 |
| 좌측판 | 선반핀 | 내측면, 32mm 피치 | 항상 |
| 좌측판 | 캠볼트 | 상면/하면 가장자리 | 항상 |
| 우측판 | 힌지컵 | 전면, 도어 높이별 | 도어 있을 때 |
| 우측판 | 선반핀 | 내측면, 32mm 피치 | 항상 |
| 우측판 | 캠볼트 | 상면/하면 가장자리 | 항상 |
| 상판 | 캠하우징 | 좌우 가장자리 | 항상 |
| 상판 | 다웰 | 후면 가장자리 | 백패널 있을 때 |
| 하판 | 캠하우징 | 좌우 가장자리 | 항상 |
| 하판 | 조절발 | 네 모서리 | 받침대 없을 때 |
| 백패널 | 다웰 | 상하좌우 가장자리 | 항상 |

### 4.2 상부장 (Upper Cabinet)

| 패널 | 보링 타입 | 위치 | 조건 |
|------|----------|------|------|
| 좌측판 | 힌지컵 | 전면, 도어 높이별 | 도어 있을 때 |
| 좌측판 | 선반핀 | 내측면, 32mm 피치 | 항상 |
| 좌측판 | 캠볼트 | 상면/하면 가장자리 | 항상 |
| 우측판 | 힌지컵 | 전면, 도어 높이별 | 도어 있을 때 |
| 우측판 | 선반핀 | 내측면, 32mm 피치 | 항상 |
| 우측판 | 캠볼트 | 상면/하면 가장자리 | 항상 |
| 상판 | 캠하우징 | 좌우 가장자리 | 항상 |
| 상판 | 월행거 | 후면 | 벽걸이형 |
| 하판 | 캠하우징 | 좌우 가장자리 | 항상 |

### 4.3 도어 (Door)

| 패널 | 보링 타입 | 위치 | 조건 |
|------|----------|------|------|
| 도어 | 힌지플레이트 | 힌지 위치에 대응 | 항상 |
| 도어 | 손잡이 | 좌/우측 상단 | 손잡이 있을 때 |

---

## 5. CNC 소프트웨어별 내보내기 형식

### 5.1 지원 예정 형식

| 우선순위 | 소프트웨어 | 파일 형식 | 비고 |
|----------|-----------|----------|------|
| 1 | 범용 | CSV | 가장 기본적인 형식 |
| 2 | 범용 | DXF | 보링 레이어 포함 |
| 3 | Homag | MPR | WoodWOP 호환 |
| 4 | Biesse | CIX | bSolid 호환 |
| 5 | SCM | PGM | Maestro 호환 |

### 5.2 CSV 형식 (범용)

**panels_boring.csv:**
```csv
PanelID,PanelName,Width,Height,Thickness,Material,Grain
P001,좌측판,560,720,18,PB,V
P002,우측판,560,720,18,PB,V
...
```

**borings.csv:**
```csv
PanelID,BoringID,Type,Face,X,Y,Diameter,Depth,Angle,Note
P001,B001,hinge-cup,front,24,100,35,13,90,상단힌지
P001,B002,hinge-cup,front,24,620,35,13,90,하단힌지
P001,B003,shelf-pin,right,37,37,5,12,90,선반핀
...
```

### 5.3 DXF 형식 (범용)

- 레이어 구조:
  - `PANEL_OUTLINE` - 패널 외곽선
  - `BORING_HINGE` - 힌지 보링 (빨간색)
  - `BORING_CAM` - 캠락 보링 (파란색)
  - `BORING_DOWEL` - 다웰 보링 (녹색)
  - `BORING_SHELF` - 선반핀 보링 (노란색)
  - `BORING_OTHER` - 기타 보링 (흰색)
  - `DIMENSIONS` - 치수
  - `LABELS` - 라벨

### 5.4 MPR 형식 (Homag WoodWOP)

```
[H
VERSION="4.0"
]
[001
<100 \WPL\="1"\WPD\="18"
<101 \KM\="Kante"
...
\BO\="35"\TI\="13"\XA\="24"\YA\="100"
...
]
```

### 5.5 CIX 형식 (Biesse bSolid)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CixDocument>
  <Header>
    <Name>Panel_001</Name>
    <Thickness>18</Thickness>
    <Width>560</Width>
    <Height>720</Height>
  </Header>
  <Operations>
    <Boring>
      <X>24</X>
      <Y>100</Y>
      <Diameter>35</Diameter>
      <Depth>13</Depth>
      <Face>1</Face>
    </Boring>
    ...
  </Operations>
</CixDocument>
```

---

## 6. 구현 단계

### Phase 1: 기반 구조 (1주)
- [ ] 보링 데이터 타입 정의 (`types/boring.ts`)
- [ ] 보링 설정 스토어 생성 (`store/boringStore.ts`)
- [ ] 기본 UI 설정 패널 추가

### Phase 2: 보링 패턴 정의 (1주)
- [ ] 가구 모듈별 보링 패턴 JSON 정의
- [ ] 패턴 → 실제 보링 데이터 변환 로직
- [ ] 도어 높이별 힌지 개수 자동 계산

### Phase 3: CSV 내보내기 (0.5주)
- [ ] 패널 보링 CSV 생성
- [ ] 보링 상세 CSV 생성
- [ ] 다운로드 기능

### Phase 4: DXF 내보내기 (1주)
- [ ] DXF 레이어 구조 설계
- [ ] 보링을 원형으로 표현
- [ ] 패널별 DXF 파일 생성

### Phase 5: 3D 뷰어 시각화 (0.5주)
- [ ] 3D 뷰에서 보링 위치 표시 옵션
- [ ] 보링 타입별 색상 구분

### Phase 6: CNC 전용 포맷 (추후)
- [ ] MPR 내보내기 (Homag)
- [ ] CIX 내보내기 (Biesse)
- [ ] 기타 포맷

---

## 7. UI/UX 설계

### 7.1 보링 설정 패널

```
┌─────────────────────────────────────┐
│ 보링 설정                            │
├─────────────────────────────────────┤
│ 힌지 타입: [Blum Clip-Top ▼]        │
│ ├ 컵 직경: [35] mm                  │
│ ├ 컵 깊이: [13] mm                  │
│ └ 측판 거리: [5] mm                 │
│                                     │
│ 선반핀                               │
│ ├ 직경: [5] mm                      │
│ ├ 깊이: [12] mm                     │
│ └ 피치: [32] mm                     │
│                                     │
│ 캠락                                 │
│ ├ 하우징 직경: [15] mm              │
│ └ 하우징 깊이: [12.5] mm            │
│                                     │
│ [기본값으로 재설정]                   │
└─────────────────────────────────────┘
```

### 7.2 내보내기 다이얼로그

```
┌─────────────────────────────────────┐
│ 보링 데이터 내보내기                  │
├─────────────────────────────────────┤
│ 포맷 선택:                           │
│ ○ CSV (범용)                        │
│ ○ DXF (범용, 레이어 포함)            │
│ ○ MPR (Homag WoodWOP)              │
│ ○ CIX (Biesse bSolid)              │
│                                     │
│ 옵션:                               │
│ ☑ 패널별 개별 파일                   │
│ ☑ 치수 포함                         │
│ ☐ 미러링 패널 별도 생성              │
│                                     │
│ [취소]              [내보내기]       │
└─────────────────────────────────────┘
```

---

## 8. 파일 구조

```
src/
├── domain/
│   └── boring/
│       ├── types.ts              # 보링 타입 정의
│       ├── patterns/
│       │   ├── index.ts
│       │   ├── lowerCabinet.ts   # 하부장 패턴
│       │   ├── upperCabinet.ts   # 상부장 패턴
│       │   └── door.ts           # 도어 패턴
│       ├── calculator.ts         # 보링 위치 계산
│       └── exporters/
│           ├── index.ts
│           ├── csvExporter.ts    # CSV 내보내기
│           ├── dxfExporter.ts    # DXF 내보내기
│           ├── mprExporter.ts    # MPR 내보내기 (Homag)
│           └── cixExporter.ts    # CIX 내보내기 (Biesse)
├── store/
│   └── boringStore.ts            # 보링 설정 스토어
└── editor/
    └── shared/
        └── controls/
            └── boring/
                ├── BoringSettingsPanel.tsx
                └── BoringExportDialog.tsx
```

---

## 9. 필요 자료 (사용자 제공)

### 9.1 필수 자료
- [ ] 사용 중인 힌지 제품 스펙 (제조사, 모델명)
- [ ] 캠락 제품 스펙
- [ ] 현재 사용하는 CNC 소프트웨어 종류
- [ ] 해당 소프트웨어의 샘플 파일 (가능하면)

### 9.2 선택 자료
- [ ] 기존 보링 도면 예시
- [ ] 특수 보링 요구사항 (비표준 규격)
- [ ] 32mm 시스템 외 다른 시스템 사용 여부

---

## 10. 향후 확장 계획

### 10.1 자동 최적화
- 보링 순서 최적화 (CNC 가공 시간 단축)
- 공구 교체 최소화 경로 계산

### 10.2 양방향 연동
- CNC 소프트웨어에서 수정한 데이터 다시 불러오기
- 가공 결과 피드백 반영

### 10.3 바코드/QR 연동
- 패널별 식별 코드 생성
- 가공 현장에서 스캔하여 작업 지시

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 내용 |
|------|------|--------|------|
| 0.1 | 2025-01-14 | Claude | 초안 작성 |
