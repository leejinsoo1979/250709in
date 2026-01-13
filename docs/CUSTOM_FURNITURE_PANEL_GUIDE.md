# 커스텀 가구 패널 명명 규칙 가이드

SketchUp에서 모델링한 가구를 에디터의 커스텀 라이브러리로 불러올 때 사용하는 패널 명명 규칙입니다.

## 목차

1. [측면 패널 (Side Panels)](#1-측면-패널-side-panels)
2. [상/하단 패널 (Top/Bottom Panels)](#2-상하단-패널-topbottom-panels)
3. [구분 패널 (Divider Panels)](#3-구분-패널-divider-panels)
4. [백패널 (Back Panels)](#4-백패널-back-panels)
5. [내부 구성요소 (Internal Components)](#5-내부-구성요소-internal-components)
6. [특수 패널 (Special Panels)](#6-특수-패널-special-panels)
7. [SketchUp 모델링 가이드](#sketchup-모델링-가이드)
8. [패널 크기 조정 규칙](#패널-크기-조정-규칙)

---

## 1. 측면 패널 (Side Panels)

| 한글명 | 영문 권장명 | 용도 |
|--------|------------|------|
| `좌측판` | `LeftPanel` | 전체 높이 좌측판 (단일 섹션) |
| `우측판` | `RightPanel` | 전체 높이 우측판 (단일 섹션) |
| `(하)좌측` | `LowerLeftPanel` | 하부 섹션 좌측판 |
| `(상)좌측` | `UpperLeftPanel` | 상부 섹션 좌측판 |
| `(하)우측` | `LowerRightPanel` | 하부 섹션 우측판 |
| `(상)우측` | `UpperRightPanel` | 상부 섹션 우측판 |

---

## 2. 상/하단 패널 (Top/Bottom Panels)

| 한글명 | 영문 권장명 | 용도 |
|--------|------------|------|
| `상판` | `TopPanel` | 상판 (단일 섹션) |
| `바닥판` | `BottomPanel` | 바닥판 (단일 섹션) |
| `(상)상판` | `UpperTopPanel` | 상부 섹션 상판 |
| `(하)바닥` | `LowerBottomPanel` | 하부 섹션 바닥판 |

---

## 3. 구분 패널 (Divider Panels)

| 한글명 | 영문 권장명 | 용도 |
|--------|------------|------|
| `(하)상판` | `LowerTopPanel` | 하부 섹션 상판 (중간 구분판) |
| `(상)바닥` | `UpperBottomPanel` | 상부 섹션 바닥판 (중간 구분판) |
| `중간판` | `MiddlePanel` | 섹션 구분 중간판 |

---

## 4. 백패널 (Back Panels)

| 한글명 | 영문 권장명 | 용도 |
|--------|------------|------|
| `백패널` | `BackPanel` | 뒷판 (단일 섹션) |
| `(하)백패널` | `LowerBackPanel` | 하부 섹션 뒷판 |
| `(상)백패널` | `UpperBackPanel` | 상부 섹션 뒷판 |

---

## 5. 내부 구성요소 (Internal Components)

| 한글명 | 영문 권장명 | 용도 | 복수 표기 |
|--------|------------|------|----------|
| `선반` | `Shelf` | 선반 | `Shelf_1`, `Shelf_2`, ... |
| `서랍` | `Drawer` | 서랍 | `Drawer_1`, `Drawer_2`, ... |
| `도어` | `Door` | 도어 | `Door_Left`, `Door_Right` |
| `옷걸이봉` | `ClothingRod` | 옷걸이 봉 | `ClothingRod_1`, ... |
| `바지걸이` | `PantsHanger` | 바지걸이 | - |

---

## 6. 특수 패널 (Special Panels)

| 한글명 | 영문 권장명 | 용도 |
|--------|------------|------|
| `엔드패널` | `EndPanel` | 마감 패널 (벽면 노출) |
| `좌측엔드패널` | `LeftEndPanel` | 좌측 마감 패널 |
| `우측엔드패널` | `RightEndPanel` | 우측 마감 패널 |
| `멍장패널` | `MullionPanel` | 분할 기둥용 50mm 패널 |

---

## SketchUp 모델링 가이드

### 단일 섹션 가구 (Single Section)

```
┌─────────────────────────────────┐
│         TopPanel                │
├────────┬─────────────┬──────────┤
│        │   Shelf_1   │          │
│  Left  │   Shelf_2   │  Right   │
│  Panel │   Drawer_1  │  Panel   │
│        │   Drawer_2  │          │
├────────┴─────────────┴──────────┤
│         BottomPanel             │
└─────────────────────────────────┘
         └── BackPanel (뒤)
```

### 상하 분할 가구 (Upper/Lower Section)

```
┌─────────────────────────────────┐
│         UpperTopPanel           │  ← 상부 섹션
├──────────┬───────────┬──────────┤
│  Upper   │  Shelf_1  │  Upper   │
│  Left    │  Shelf_2  │  Right   │
│  Panel   │           │  Panel   │
├──────────┴───────────┴──────────┤
│      UpperBottomPanel           │  ← 중간 구분
│      (= LowerTopPanel)          │
├──────────┬───────────┬──────────┤
│  Lower   │ Drawer_1  │  Lower   │  ← 하부 섹션
│  Left    │ Drawer_2  │  Right   │
│  Panel   │ Drawer_3  │  Panel   │
├──────────┴───────────┴──────────┤
│       LowerBottomPanel          │
└─────────────────────────────────┘
         └── UpperBackPanel, LowerBackPanel (뒤)
```

### SketchUp 작업 순서

1. **패널별 모델링**: 각 패널을 개별 솔리드로 모델링
2. **그룹 생성**: 각 패널을 선택 후 그룹(Group)으로 만들기
3. **이름 지정**: Entity Info에서 그룹 이름을 위 규칙대로 지정
4. **원점 설정**: 가구 전체의 원점을 좌측 하단 앞쪽으로 설정
5. **내보내기**: DAE 또는 GLB 형식으로 내보내기

### 원점(Origin) 설정 기준

```
        Y (높이)
        │
        │    Z (깊이)
        │   /
        │  /
        │ /
        └─────────── X (너비)
       원점
    (좌측 하단 앞쪽)
```

---

## 패널 크기 조정 규칙

슬롯에 배치될 때 각 패널이 어떻게 조정되는지:

| 패널 | 너비(W) | 높이(H) | 깊이(D) |
|------|--------|--------|--------|
| LeftPanel / RightPanel | 패널 두께 (18mm) | 슬롯 높이 | 슬롯 깊이 |
| TopPanel / BottomPanel | 슬롯 너비 | 패널 두께 (18mm) | 슬롯 깊이 |
| BackPanel | 슬롯 너비 | 슬롯 높이 | 패널 두께 (9mm) |
| Shelf | 내부 너비 | 패널 두께 (18mm) | 슬롯 깊이 - 마진 |
| Drawer | 내부 너비 | 서랍 높이 | 슬롯 깊이 - 마진 |

### 크기 조정 공식

```
슬롯 배치 시:
- 내부 너비 = 슬롯 너비 - (좌측판 두께 + 우측판 두께)
- 내부 높이 = 슬롯 높이 - (상판 두께 + 하판 두께)
- 내부 깊이 = 슬롯 깊이 - 백패널 두께 - 전면 마진
```

---

## 주의사항

1. **이름 정확성**: 패널 이름은 대소문자를 정확히 구분해서 입력
2. **그룹 필수**: 각 패널은 반드시 그룹으로 만들어야 함 (컴포넌트 아님)
3. **중첩 금지**: 그룹 안에 그룹을 넣지 말 것 (단일 레벨 유지)
4. **단위 통일**: SketchUp에서 mm 단위로 모델링 권장
5. **좌표계**: SketchUp은 Z-up, 에디터는 Y-up이므로 자동 변환됨

---

## 지원 파일 형식

| 형식 | 확장자 | 권장도 | 비고 |
|------|-------|-------|------|
| COLLADA | `.dae` | ⭐⭐⭐ | SketchUp 기본 지원, 그룹명 보존 |
| glTF Binary | `.glb` | ⭐⭐⭐ | 파일 크기 작음, 호환성 좋음 |
| OBJ | `.obj` | ⭐⭐ | 널리 사용됨, 그룹명 일부 손실 가능 |

---

## 문의

커스텀 가구 제작 관련 문의는 개발팀에 연락해주세요.
