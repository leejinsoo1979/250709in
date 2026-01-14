# 보링 데이터 내보내기 기획안

> **확정 사양**: Blum CLIP top BLUMOTION / Full Overlay / 나사고정 마운팅 플레이트 / 캠락 Ø15mm / 백패널 홈 방식 (다웰 미사용)

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

## 2. Blum CLIP top BLUMOTION 힌지 상세 규격

### 2.1 힌지 기본 정보

| 항목 | 값 | 비고 |
|------|-----|------|
| 제조사 | Blum |  |
| 모델 | CLIP top BLUMOTION 110° |  |
| 오버레이 타입 | **Full Overlay (전면)** | 확정 |
| 마운팅 방식 | **나사 고정** | 확정 |
| 개폐 각도 | 110° | 표준 |

### 2.2 도어 보링 (힌지 컵홀)

```
┌────────────────────────────────────────┐
│                 도어                    │
│  ┌──┐                                  │
│  │●│ ← 힌지컵 Ø35, 깊이 13mm           │
│  └──┘                                  │
│    ↑                                   │
│    3mm (도어 가장자리에서 컵 중심까지)    │
│                                        │
└────────────────────────────────────────┘
```

| 항목 | 규격 | 비고 |
|------|------|------|
| **컵홀 직경** | **Ø35mm** | 표준 |
| **컵홀 깊이** | **13mm** | CLIP top 기준 |
| **도어 가장자리 → 컵 중심** | **3mm** | Full Overlay 기준 |
| **컵 중심 → 도어 상/하단** | **70~120mm** | 권장 100mm |

### 2.3 측판 보링 (마운팅 플레이트 - 나사 고정)

```
측판 단면도 (전면에서 본 모습)
┌─────────────────────────────────────────────────────┐
│                      측판 전면                        │
│                                                     │
│   37mm        32mm                                  │
│   ←──→       ←──→                                   │
│   ○           ○    ← 나사홀 Ø2.5mm (또는 Ø3mm)       │
│                                                     │
│   ↑                                                 │
│   │ 측판 상단에서 힌지 위치까지 = 도어 상단 마진 + α    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

| 항목 | 규격 | 비고 |
|------|------|------|
| **나사홀 직경** | **Ø2.5mm** | 사전 드릴 (또는 Ø3mm) |
| **나사홀 깊이** | **10~12mm** | 비관통 |
| **첫 번째 나사 위치** | **측판 전면에서 37mm** | 32mm 시스템 |
| **두 번째 나사 위치** | **측판 전면에서 69mm** (37+32) | 32mm 시스템 |
| **나사 간격** | **32mm** | 표준 |

### 2.4 도어 높이별 힌지 개수 및 위치

| 도어 높이 | 힌지 수 | 위치 (도어 상/하단에서) |
|-----------|---------|----------------------|
| ~600mm | 2개 | 상: 100mm, 하: 100mm |
| 600~900mm | 2개 | 상: 100mm, 하: 100mm |
| 900~1200mm | 3개 | 상: 100mm, 중: 중앙, 하: 100mm |
| 1200~1600mm | 3개 | 상: 100mm, 중: 중앙, 하: 100mm |
| 1600~2000mm | 4개 | 균등 배치 (마진 100mm) |
| 2000~2400mm | 5개 | 균등 배치 (마진 100mm) |

**힌지 Y 위치 계산 공식:**
```
2개: Y1 = 100, Y2 = doorHeight - 100
3개: Y1 = 100, Y2 = doorHeight / 2, Y3 = doorHeight - 100
4개: Y1 = 100, Y2 = (doorHeight - 200) / 3 + 100, Y3 = (doorHeight - 200) * 2/3 + 100, Y4 = doorHeight - 100
n개: 균등 배치, 상하 마진 100mm
```

---

## 3. 캠락 (Cam Lock) 상세 규격

### 3.1 캠락 구성

```
상판/하판 (평면도)
┌──────────────────────────────────────────────────┐
│                                                  │
│  ●──────────────────────────────────────────●   │
│  ↑                                          ↑   │
│  캠 하우징                               캠 하우징  │
│  (Ø15, 깊이 12.5mm)                              │
│                                                  │
│  측판 두께 중심에서 8mm                            │
└──────────────────────────────────────────────────┘

측판 (단면도)
┌─────┐
│     │
│  ○──┼── 캠볼트홀 Ø5mm, 깊이 34mm (또는 관통)
│     │
│  ○──┼── 캠볼트홀
│     │
└─────┘
```

### 3.2 캠 하우징 (상판/하판)

| 항목 | 규격 | 비고 |
|------|------|------|
| **하우징 직경** | **Ø15mm** | 표준 |
| **하우징 깊이** | **12.5mm** | 표준 |
| **패널 가장자리 → 중심** | **8mm** | 18mm 패널 기준 (두께/2 - 1) |
| **앞뒤 위치** | **37mm, 69mm** | 32mm 시스템 (선택) |

### 3.3 캠 볼트홀 (측판)

| 항목 | 규격 | 비고 |
|------|------|------|
| **볼트홀 직경** | **Ø5mm** | 표준 |
| **볼트홀 깊이** | **34mm** 또는 **관통** | 측판 두께에 따라 |
| **위치 (상면/하면에서)** | **8mm** | 캠 하우징과 일치 |
| **앞뒤 위치** | **37mm, 69mm** | 32mm 시스템 |

---

## 4. 선반핀 (Shelf Pin) 상세 규격

### 4.1 선반핀 홀 배치

```
측판 내측면 (정면도)
┌────────────────────────────────────────────┐
│                                            │
│  37mm    ←─── 전면열 ───→    ←─── 후면열 ──→│
│   ↓                              (깊이-37) │
│   ○  ○  ○  ○  ○  ○  ○  ○  ...      ○  ○  ○│
│   │                                        │
│   32mm 피치                                 │
│   │                                        │
│   ○  ○  ○  ○  ○  ○  ○  ○  ...      ○  ○  ○│
│                                            │
│   시작: 바닥에서 37mm                        │
│   끝: 상단에서 37mm 전까지                   │
└────────────────────────────────────────────┘
```

### 4.2 선반핀 홀 규격

| 항목 | 규격 | 비고 |
|------|------|------|
| **홀 직경** | **Ø5mm** | 표준 선반핀 |
| **홀 깊이** | **12mm** | 비관통 |
| **수직 피치** | **32mm** | 32mm 시스템 |
| **전면열 위치** | **전면에서 37mm** | 32mm 시스템 |
| **후면열 위치** | **후면에서 37mm** | 32mm 시스템 |
| **시작 높이** | **바닥에서 37mm** | 32mm 시스템 |
| **종료 높이** | **상단에서 37mm 전** | 32mm 시스템 |

### 4.3 선반핀 홀 개수 계산

```
홀 개수 = floor((측판높이 - 37 - 37) / 32) + 1
        = floor((측판높이 - 74) / 32) + 1

예시: 측판 높이 720mm
홀 개수 = floor((720 - 74) / 32) + 1 = floor(646 / 32) + 1 = 20 + 1 = 21개
```

---

## 5. 서랍 레일 (Blum) 상세 규격 - 사용자 선택

> **참고**: 서랍 레일은 사용자가 UI에서 선택할 수 있도록 구현

### 5.1 지원 모델

| 모델 | 설명 | 적재 하중 | 특징 |
|------|------|----------|------|
| **TANDEM** | 언더마운트 러너 | 30/50kg | BLUMOTION 소프트클로즈 |
| **MOVENTO** | 프리미엄 언더마운트 | 40/60kg | TIP-ON BLUMOTION 옵션 |
| **LEGRABOX** | 메탈 서랍 시스템 | 40/70kg | 통합 디자인, 프리미엄 |
| **METABOX** | 메탈 사이드 서랍 | 25kg | 경제적 |

### 5.2 TANDEM / MOVENTO 보링 규격 (언더마운트)

```
측판 내측면 (서랍 위치)
┌────────────────────────────────────────────────────────┐
│                                                        │
│   37mm                                                 │
│   ↓                                                    │
│   ●────○     ← 전면 브라켓 (●원형 Ø5, ○장공 10x5)       │
│                                                        │
│   후면 브라켓은 레일에 포함 (별도 보링 불필요)              │
│                                                        │
└────────────────────────────────────────────────────────┘
```

| 항목 | 규격 | 비고 |
|------|------|------|
| **전면 원형홀** | **Ø5mm** | 깊이 12mm |
| **전면 장공** | **10mm × 5mm** | 높이 조절용 |
| **전면에서 거리** | **37mm** | 32mm 시스템 |
| **홀 간격** | **32mm** | 원형홀 ↔ 장공 |
| **바닥에서 높이** | **서랍 높이에 따라** | 계산 필요 |

### 5.3 LEGRABOX 보링 규격

```
측판 내측면 (서랍 위치)
┌────────────────────────────────────────────────────────┐
│                                                        │
│   37mm                                                 │
│   ↓                                                    │
│   ●────●     ← 전면 브라켓 (●원형 Ø5 × 2)              │
│                                                        │
└────────────────────────────────────────────────────────┘
```

| 항목 | 규격 | 비고 |
|------|------|------|
| **전면 홀 1** | **Ø5mm** | 깊이 12mm |
| **전면 홀 2** | **Ø5mm** | 깊이 12mm |
| **전면에서 거리** | **37mm** | 32mm 시스템 |
| **홀 간격** | **32mm** | |

### 5.4 METABOX 보링 규격

```
측판 내측면 (서랍 위치)
┌────────────────────────────────────────────────────────┐
│                                                        │
│   37mm                                                 │
│   ↓                                                    │
│   ○    ○    ○    ← 나사홀 Ø3mm (3개)                   │
│   32   32                                              │
│                                                        │
└────────────────────────────────────────────────────────┘
```

| 항목 | 규격 | 비고 |
|------|------|------|
| **나사홀** | **Ø3mm** | 깊이 10mm |
| **홀 개수** | **3개** | |
| **전면에서 거리** | **37mm** | 첫 번째 홀 |
| **홀 간격** | **32mm** | |

### 5.5 서랍 레일 Y 위치 계산

```typescript
/**
 * 서랍 레일 Y 위치 계산
 * @param cabinetHeight 캐비넷 내부 높이 (mm)
 * @param drawerHeights 서랍 높이 배열 (아래부터, mm)
 * @param bottomMargin 바닥 여유 (mm, 기본 5)
 * @returns 각 서랍 레일의 Y 위치 (바닥 기준)
 */
function calculateDrawerRailPositions(
  cabinetHeight: number,
  drawerHeights: number[],
  bottomMargin: number = 5
): number[] {
  const positions: number[] = [];
  let currentY = bottomMargin;

  for (const height of drawerHeights) {
    positions.push(currentY);
    currentY += height + 3; // 3mm 간격
  }

  return positions;
}
```

---

## 6. 패널별 보링 상세 매핑

### 6.1 하부장 (Lower Cabinet) - 도어 타입

#### 6.1.1 좌측판

| 면 | 보링 타입 | X 위치 (mm) | Y 위치 (mm) | 직경 | 깊이 | 조건 |
|-----|----------|------------|------------|------|------|------|
| **내측면** | 선반핀 | 37 | 37 + (n × 32) | Ø5 | 12 | 항상 |
| **내측면** | 선반핀 | 깊이-37 | 37 + (n × 32) | Ø5 | 12 | 항상 |
| **상면** | 캠볼트 | 37 | 8 | Ø5 | 34 | 항상 |
| **상면** | 캠볼트 | 69 | 8 | Ø5 | 34 | 항상 |
| **하면** | 캠볼트 | 37 | 8 | Ø5 | 34 | 항상 |
| **하면** | 캠볼트 | 69 | 8 | Ø5 | 34 | 항상 |
| **전면** | 힌지 나사 | 37 | 힌지Y | Ø2.5 | 12 | 좌힌지 도어 |
| **전면** | 힌지 나사 | 69 | 힌지Y | Ø2.5 | 12 | 좌힌지 도어 |

#### 6.1.2 우측판

| 면 | 보링 타입 | X 위치 (mm) | Y 위치 (mm) | 직경 | 깊이 | 조건 |
|-----|----------|------------|------------|------|------|------|
| **내측면** | 선반핀 | 37 | 37 + (n × 32) | Ø5 | 12 | 항상 |
| **내측면** | 선반핀 | 깊이-37 | 37 + (n × 32) | Ø5 | 12 | 항상 |
| **상면** | 캠볼트 | 37 | 8 | Ø5 | 34 | 항상 |
| **상면** | 캠볼트 | 69 | 8 | Ø5 | 34 | 항상 |
| **하면** | 캠볼트 | 37 | 8 | Ø5 | 34 | 항상 |
| **하면** | 캠볼트 | 69 | 8 | Ø5 | 34 | 항상 |
| **전면** | 힌지 나사 | 37 | 힌지Y | Ø2.5 | 12 | 우힌지 도어 |
| **전면** | 힌지 나사 | 69 | 힌지Y | Ø2.5 | 12 | 우힌지 도어 |

#### 6.1.3 상판

| 면 | 보링 타입 | X 위치 (mm) | Y 위치 (mm) | 직경 | 깊이 | 조건 |
|-----|----------|------------|------------|------|------|------|
| **하면** | 캠하우징 | 8 | 37 | Ø15 | 12.5 | 항상 |
| **하면** | 캠하우징 | 8 | 69 | Ø15 | 12.5 | 항상 |
| **하면** | 캠하우징 | 너비-8 | 37 | Ø15 | 12.5 | 항상 |
| **하면** | 캠하우징 | 너비-8 | 69 | Ø15 | 12.5 | 항상 |

#### 6.1.4 하판

| 면 | 보링 타입 | X 위치 (mm) | Y 위치 (mm) | 직경 | 깊이 | 조건 |
|-----|----------|------------|------------|------|------|------|
| **상면** | 캠하우징 | 8 | 37 | Ø15 | 12.5 | 항상 |
| **상면** | 캠하우징 | 8 | 69 | Ø15 | 12.5 | 항상 |
| **상면** | 캠하우징 | 너비-8 | 37 | Ø15 | 12.5 | 항상 |
| **상면** | 캠하우징 | 너비-8 | 69 | Ø15 | 12.5 | 항상 |

#### 6.1.5 도어

| 면 | 보링 타입 | X 위치 (mm) | Y 위치 (mm) | 직경 | 깊이 | 조건 |
|-----|----------|------------|------------|------|------|------|
| **후면** | 힌지컵 | 3 (좌힌지) / 너비-3 (우힌지) | 힌지Y | Ø35 | 13 | 항상 |

### 6.2 상부장 (Upper Cabinet) - 도어 타입

> 하부장과 동일한 패턴, 조절발 보링 없음

### 6.3 서랍장 (Drawer Cabinet)

> 힌지 보링 없음, 서랍 레일 보링 추가

#### 6.3.1 좌측판

| 면 | 보링 타입 | X 위치 (mm) | Y 위치 (mm) | 직경 | 깊이 | 조건 |
|-----|----------|------------|------------|------|------|------|
| **상면** | 캠볼트 | 37 | 8 | Ø5 | 34 | 항상 |
| **상면** | 캠볼트 | 69 | 8 | Ø5 | 34 | 항상 |
| **하면** | 캠볼트 | 37 | 8 | Ø5 | 34 | 항상 |
| **하면** | 캠볼트 | 69 | 8 | Ø5 | 34 | 항상 |
| **내측면** | 서랍레일 | 37 | 레일Y | Ø5 | 12 | 서랍별 |
| **내측면** | 서랍레일(장공) | 69 | 레일Y | 10×5 | 12 | TANDEM/MOVENTO |
| **내측면** | 서랍레일 | 69 | 레일Y | Ø5 | 12 | LEGRABOX |
| **내측면** | 서랍레일(나사) | 37,69,101 | 레일Y | Ø3 | 10 | METABOX |

#### 6.3.2 우측판

> 좌측판과 동일 (내측면 미러링)

#### 6.3.3 상판

| 면 | 보링 타입 | X 위치 (mm) | Y 위치 (mm) | 직경 | 깊이 | 조건 |
|-----|----------|------------|------------|------|------|------|
| **하면** | 캠하우징 | 8 | 37 | Ø15 | 12.5 | 항상 |
| **하면** | 캠하우징 | 8 | 69 | Ø15 | 12.5 | 항상 |
| **하면** | 캠하우징 | 너비-8 | 37 | Ø15 | 12.5 | 항상 |
| **하면** | 캠하우징 | 너비-8 | 69 | Ø15 | 12.5 | 항상 |

#### 6.3.4 하판

| 면 | 보링 타입 | X 위치 (mm) | Y 위치 (mm) | 직경 | 깊이 | 조건 |
|-----|----------|------------|------------|------|------|------|
| **상면** | 캠하우징 | 8 | 37 | Ø15 | 12.5 | 항상 |
| **상면** | 캠하우징 | 8 | 69 | Ø15 | 12.5 | 항상 |
| **상면** | 캠하우징 | 너비-8 | 37 | Ø15 | 12.5 | 항상 |
| **상면** | 캠하우징 | 너비-8 | 69 | Ø15 | 12.5 | 항상 |

#### 6.3.5 서랍 전면 (Drawer Front)

> 서랍 전면에는 보링 없음 (레일에 클립 방식으로 연결)

### 6.4 양문 도어 (Double Door) 케이스

```
┌─────────────────────────────────────────┐
│              캐비넷 정면                  │
│  ┌─────────────┐  ┌─────────────┐       │
│  │   좌도어     │  │   우도어     │       │
│  │             │  │             │       │
│  │ ●         ● │  │ ●         ● │       │
│  │ (좌힌지)     │  │     (우힌지) │       │
│  │             │  │             │       │
│  │ ●         ● │  │ ●         ● │       │
│  │             │  │             │       │
│  └─────────────┘  └─────────────┘       │
│                                         │
│  좌측판: 좌힌지 나사홀                     │
│  우측판: 우힌지 나사홀                     │
└─────────────────────────────────────────┘
```

| 도어 타입 | 좌측판 힌지 | 우측판 힌지 | 비고 |
|----------|-----------|-----------|------|
| 단문 좌힌지 | ● 있음 | - 없음 | |
| 단문 우힌지 | - 없음 | ● 있음 | |
| 양문 | ● 있음 | ● 있음 | 좌우 모두 |

### 6.5 상부장 vs 하부장 차이점

| 항목 | 하부장 | 상부장 | 비고 |
|------|--------|--------|------|
| 캠락 | 상판/하판 모두 | 상판/하판 모두 | 동일 |
| 힌지 | 측판 전면 | 측판 전면 | 동일 |
| 선반핀 | 측판 내측 | 측판 내측 | 동일 |
| 조절발 | 하판 하면 (옵션) | **없음** | 차이 |
| 벽걸이 브라켓 | **없음** | 후면 상단 (옵션) | 차이 |

#### 6.5.1 조절발 보링 (하부장 전용, 옵션)

| 면 | 보링 타입 | X 위치 (mm) | Y 위치 (mm) | 직경 | 깊이 | 조건 |
|-----|----------|------------|------------|------|------|------|
| **하판 하면** | 조절발 | 37 | 37 | Ø10 | 15 | 조절발 사용 시 |
| **하판 하면** | 조절발 | 37 | 깊이-37 | Ø10 | 15 | 조절발 사용 시 |
| **하판 하면** | 조절발 | 너비-37 | 37 | Ø10 | 15 | 조절발 사용 시 |
| **하판 하면** | 조절발 | 너비-37 | 깊이-37 | Ø10 | 15 | 조절발 사용 시 |

---

## 7. 데이터 구조 설계

### 7.1 TypeScript 인터페이스

```typescript
// ============================================
// 기본 타입 정의
// ============================================

/** 보링 타입 */
type BoringType =
  | 'hinge-cup'        // 힌지 컵홀 Ø35mm
  | 'hinge-screw'      // 힌지 마운팅 나사홀 Ø2.5mm
  | 'cam-housing'      // 캠 하우징 Ø15mm
  | 'cam-bolt'         // 캠 볼트홀 Ø5mm
  | 'shelf-pin'        // 선반핀홀 Ø5mm
  | 'adjustable-foot'  // 조절발 Ø10mm
  | 'drawer-rail'      // 서랍레일 원형홀
  | 'drawer-rail-slot' // 서랍레일 장공 (TANDEM/MOVENTO)
  | 'custom';          // 사용자 정의

/** 보링 면 (6면) */
type BoringFace =
  | 'front'    // 전면 (두께면, 앞)
  | 'back'     // 후면 (두께면, 뒤)
  | 'top'      // 상면
  | 'bottom'   // 하면
  | 'left'     // 좌측면 (두께면)
  | 'right';   // 우측면 (두께면)

/** 패널 타입 */
type PanelType =
  | 'side-left'    // 좌측판
  | 'side-right'   // 우측판
  | 'top'          // 상판
  | 'bottom'       // 하판
  | 'back'         // 백패널
  | 'shelf'        // 선반
  | 'door'         // 도어
  | 'drawer-front' // 서랍 전면
  | 'drawer-side'  // 서랍 측판
  | 'drawer-back'  // 서랍 후면
  | 'drawer-bottom'; // 서랍 바닥

// ============================================
// 보링 데이터
// ============================================

/** 단일 보링 */
interface Boring {
  id: string;
  type: BoringType;
  face: BoringFace;

  // 위치 (해당 면의 좌하단 기준, mm)
  x: number;
  y: number;

  // 규격
  diameter: number;  // 직경 (mm)
  depth: number;     // 깊이 (mm), 0 = 관통

  // 장공 (슬롯) 옵션 - drawer-rail-slot 타입용
  slotWidth?: number;   // 장공 가로 (mm)
  slotHeight?: number;  // 장공 세로 (mm)

  // 옵션
  angle?: number;    // 각도 (기본 90°)
  note?: string;     // 비고
}

/** 패널 보링 데이터 */
interface PanelBoringData {
  // 패널 식별
  panelId: string;
  panelName: string;
  panelType: PanelType;

  // 패널 치수 (mm)
  width: number;     // 가로 (결 방향 기준)
  height: number;    // 세로
  thickness: number; // 두께

  // 재질
  material: string;
  grain: 'horizontal' | 'vertical' | 'none';

  // 보링 목록
  borings: Boring[];

  // 소속 가구
  furnitureId: string;
  furnitureName: string;
}

// ============================================
// 설정
// ============================================

/** Blum CLIP top 힌지 설정 */
interface BlumClipTopSettings {
  // 도어 보링
  cupDiameter: 35;           // 고정값
  cupDepth: 13;              // mm
  cupEdgeDistance: 3;        // Full Overlay 기준

  // 측판 보링 (마운팅 플레이트)
  mountingScrewDiameter: 2.5;  // mm
  mountingScrewDepth: 12;      // mm
  mountingHole1Position: 37;   // 전면에서 (mm)
  mountingHole2Position: 69;   // 전면에서 (mm), 37 + 32

  // 힌지 배치
  topBottomMargin: 100;        // 도어 상/하단 마진 (mm)
  minDoorHeightFor3Hinges: 900;
  minDoorHeightFor4Hinges: 1600;
  minDoorHeightFor5Hinges: 2000;
}

/** 캠락 설정 */
interface CamLockSettings {
  housingDiameter: 15;    // mm
  housingDepth: 12.5;     // mm
  boltDiameter: 5;        // mm
  boltDepth: 34;          // mm (또는 관통)
  edgeDistance: 8;        // mm (18mm 패널 기준)
  positions: [37, 69];    // 전면에서의 위치 (mm)
}

/** 선반핀 설정 */
interface ShelfPinSettings {
  diameter: 5;       // mm
  depth: 12;         // mm
  pitch: 32;         // mm (수직 간격)
  frontRowPosition: 37;   // 전면에서 (mm)
  backRowPosition: 37;    // 후면에서 (mm)
  startHeight: 37;        // 바닥에서 (mm)
  endMargin: 37;          // 상단에서 (mm)
}

/** 서랍 레일 타입 (Blum) */
type DrawerRailType = 'tandem' | 'movento' | 'legrabox' | 'metabox';

/** 서랍 레일 설정 */
interface DrawerRailSettings {
  type: DrawerRailType;
  // TANDEM / MOVENTO / LEGRABOX
  frontHoleDiameter: 5;     // mm
  frontHoleDepth: 12;       // mm
  frontHolePosition: 37;    // 전면에서 (mm)
  holeSpacing: 32;          // mm
  // TANDEM / MOVENTO 전용 (장공)
  slotWidth?: 10;           // mm (장공 가로)
  slotHeight?: 5;           // mm (장공 세로)
  // METABOX 전용
  metaboxHoleCount?: 3;     // 나사홀 개수
  metaboxHoleDiameter?: 3;  // mm
}

/** 전체 보링 설정 */
interface BoringSettings {
  hinge: BlumClipTopSettings;
  camLock: CamLockSettings;
  shelfPin: ShelfPinSettings;
  drawerRail: DrawerRailSettings;

  // 32mm 시스템
  systemPitch: 32;
  systemStartOffset: 37;
}

// ============================================
// 프로젝트 데이터
// ============================================

/** 프로젝트 보링 데이터 */
interface ProjectBoringData {
  projectId: string;
  projectName: string;
  createdAt: string;

  settings: BoringSettings;
  panels: PanelBoringData[];

  // 통계
  summary: {
    totalPanels: number;
    totalBorings: number;
    boringsByType: Record<BoringType, number>;
  };
}
```

### 7.2 기본 설정값 (상수)

```typescript
/** Blum CLIP top Full Overlay 기본 설정 */
export const DEFAULT_BORING_SETTINGS: BoringSettings = {
  hinge: {
    cupDiameter: 35,
    cupDepth: 13,
    cupEdgeDistance: 3,
    mountingScrewDiameter: 2.5,
    mountingScrewDepth: 12,
    mountingHole1Position: 37,
    mountingHole2Position: 69,
    topBottomMargin: 100,
    minDoorHeightFor3Hinges: 900,
    minDoorHeightFor4Hinges: 1600,
    minDoorHeightFor5Hinges: 2000,
  },
  camLock: {
    housingDiameter: 15,
    housingDepth: 12.5,
    boltDiameter: 5,
    boltDepth: 34,
    edgeDistance: 8,
    positions: [37, 69],
  },
  shelfPin: {
    diameter: 5,
    depth: 12,
    pitch: 32,
    frontRowPosition: 37,
    backRowPosition: 37,
    startHeight: 37,
    endMargin: 37,
  },
  drawerRail: {
    type: 'tandem',  // 기본값, 사용자 선택 가능
    frontHoleDiameter: 5,
    frontHoleDepth: 12,
    frontHolePosition: 37,
    holeSpacing: 32,
    slotWidth: 10,
    slotHeight: 5,
  },
  systemPitch: 32,
  systemStartOffset: 37,
};
```

---

## 8. 보링 위치 계산 알고리즘

### 8.1 힌지 위치 계산

```typescript
/**
 * 도어 높이에 따른 힌지 Y 위치 계산
 * @param doorHeight 도어 높이 (mm)
 * @param settings 힌지 설정
 * @returns 힌지 Y 위치 배열 (mm, 도어 하단 기준)
 */
function calculateHingePositions(
  doorHeight: number,
  settings: BlumClipTopSettings
): number[] {
  const margin = settings.topBottomMargin;

  // 힌지 개수 결정
  let hingeCount: number;
  if (doorHeight < settings.minDoorHeightFor3Hinges) {
    hingeCount = 2;
  } else if (doorHeight < settings.minDoorHeightFor4Hinges) {
    hingeCount = 3;
  } else if (doorHeight < settings.minDoorHeightFor5Hinges) {
    hingeCount = 4;
  } else {
    hingeCount = 5;
  }

  // 위치 계산
  const positions: number[] = [];

  if (hingeCount === 2) {
    positions.push(margin);                    // 하단
    positions.push(doorHeight - margin);       // 상단
  } else {
    // 균등 배치
    const spacing = (doorHeight - 2 * margin) / (hingeCount - 1);
    for (let i = 0; i < hingeCount; i++) {
      positions.push(margin + spacing * i);
    }
  }

  return positions;
}
```

### 8.2 선반핀 홀 위치 계산

```typescript
/**
 * 측판 선반핀 홀 위치 계산
 * @param panelHeight 측판 높이 (mm)
 * @param panelDepth 측판 깊이 (mm)
 * @param settings 선반핀 설정
 * @returns 선반핀 홀 위치 배열
 */
function calculateShelfPinPositions(
  panelHeight: number,
  panelDepth: number,
  settings: ShelfPinSettings
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  // Y 위치 계산 (수직)
  const startY = settings.startHeight;
  const endY = panelHeight - settings.endMargin;
  const yPositions: number[] = [];

  for (let y = startY; y <= endY; y += settings.pitch) {
    yPositions.push(y);
  }

  // X 위치 (전면열, 후면열)
  const frontX = settings.frontRowPosition;
  const backX = panelDepth - settings.backRowPosition;

  // 모든 조합 생성
  for (const y of yPositions) {
    positions.push({ x: frontX, y });
    positions.push({ x: backX, y });
  }

  return positions;
}
```

### 8.3 캠락 위치 계산

```typescript
/**
 * 상판/하판 캠 하우징 위치 계산
 * @param panelWidth 패널 너비 (mm)
 * @param settings 캠락 설정
 * @returns 캠 하우징 위치 배열
 */
function calculateCamHousingPositions(
  panelWidth: number,
  settings: CamLockSettings
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  // 좌측 (X = edgeDistance)
  for (const yPos of settings.positions) {
    positions.push({ x: settings.edgeDistance, y: yPos });
  }

  // 우측 (X = panelWidth - edgeDistance)
  for (const yPos of settings.positions) {
    positions.push({ x: panelWidth - settings.edgeDistance, y: yPos });
  }

  return positions;
}
```

---

## 9. CNC 내보내기 형식

### 9.1 지원 형식 우선순위

| 우선순위 | 형식 | 용도 | 구현 난이도 |
|----------|------|------|------------|
| **1** | CSV | 범용, 다른 소프트웨어로 가져오기 | 쉬움 |
| **2** | DXF | CAD 호환, 레이어별 보링 표시 | 중간 |
| **3** | **MPR** | **HOMAG woodWOP 네이티브** | **중간~어려움** |
| **4** | **CIX** | **Biesse bSolid 네이티브 (XML)** | **중간~어려움** |

### 9.2 CSV 형식 상세

**파일 1: panels.csv**
```csv
PanelID,FurnitureID,FurnitureName,PanelType,PanelName,Width,Height,Thickness,Material,Grain
P001,F001,하부장-1,side-left,좌측판,560,720,18,PB,V
P002,F001,하부장-1,side-right,우측판,560,720,18,PB,V
P003,F001,하부장-1,top,상판,564,560,18,PB,H
P004,F001,하부장-1,bottom,하판,564,560,18,PB,H
P005,F001,하부장-1,door,도어,596,716,18,PB,V
```

**파일 2: borings.csv**
```csv
PanelID,BoringID,Type,Face,X,Y,Diameter,Depth,Angle,Note
P001,B001,shelf-pin,right,37,37,5,12,90,선반핀-전면열
P001,B002,shelf-pin,right,37,69,5,12,90,선반핀-전면열
P001,B003,shelf-pin,right,37,101,5,12,90,선반핀-전면열
...
P001,B042,cam-bolt,top,37,8,5,34,90,캠볼트-전면
P001,B043,cam-bolt,top,69,8,5,34,90,캠볼트-후면
P001,B044,hinge-screw,front,37,100,2.5,12,90,힌지마운팅-하단
P001,B045,hinge-screw,front,69,100,2.5,12,90,힌지마운팅-하단
P001,B046,hinge-screw,front,37,620,2.5,12,90,힌지마운팅-상단
P001,B047,hinge-screw,front,69,620,2.5,12,90,힌지마운팅-상단
...
P005,B101,hinge-cup,back,3,100,35,13,90,힌지컵-하단
P005,B102,hinge-cup,back,3,620,35,13,90,힌지컵-상단
```

**파일 3: drawer_borings.csv (서랍장용)**
```csv
PanelID,BoringID,Type,Face,X,Y,Diameter,Depth,Angle,SlotWidth,SlotHeight,Note
P010,B201,drawer-rail,right,37,50,5,12,90,,,서랍1-전면홀
P010,B202,drawer-rail-slot,right,69,50,5,12,90,10,5,서랍1-장공(TANDEM)
P010,B203,drawer-rail,right,37,200,5,12,90,,,서랍2-전면홀
P010,B204,drawer-rail-slot,right,69,200,5,12,90,10,5,서랍2-장공(TANDEM)
P010,B205,drawer-rail,right,37,350,5,12,90,,,서랍3-전면홀
P010,B206,drawer-rail-slot,right,69,350,5,12,90,10,5,서랍3-장공(TANDEM)
```

> **참고**: 장공은 `SlotWidth`, `SlotHeight` 컬럼으로 구분. 원형 홀은 해당 컬럼 비워둠.

### 9.3 DXF 형식 상세

**레이어 구조:**
| 레이어명 | 색상 | 내용 |
|----------|------|------|
| `0_OUTLINE` | White (7) | 패널 외곽선 |
| `1_HINGE_CUP` | Red (1) | 힌지 컵홀 Ø35 |
| `2_HINGE_SCREW` | Red (1) | 힌지 나사홀 Ø2.5 |
| `3_CAM_HOUSING` | Blue (5) | 캠 하우징 Ø15 |
| `4_CAM_BOLT` | Blue (5) | 캠 볼트홀 Ø5 |
| `5_SHELF_PIN` | Yellow (2) | 선반핀홀 Ø5 |
| `6_DRAWER_RAIL` | Green (3) | 서랍레일홀 |
| `7_ADJUSTABLE_FOOT` | White (7) | 조절발홀 Ø10 |
| `8_DIMENSIONS` | Cyan (4) | 치수 |
| `9_LABELS` | Magenta (6) | 라벨/주석 |

**파일 구성:**
- 패널별 개별 DXF 파일 생성
- 또는 전체 패널을 하나의 DXF에 배치 (옵션)

### 9.4 장공(슬롯) DXF 표현 방식

TANDEM/MOVENTO 서랍 레일의 장공은 원형이 아닌 타원형 슬롯입니다.

**DXF 표현 방법:**
```
장공 (10mm × 5mm)
┌──────────────┐
│  ╭──────╮    │
│  │      │    │  방법 1: LWPOLYLINE (폴리라인)
│  ╰──────╯    │  - 두 개의 반원 + 두 개의 직선
└──────────────┘

또는

┌──────────────┐
│    ○──○      │  방법 2: 2개의 CIRCLE + 설명
│              │  - 원형 2개로 표시 + 노트로 "SLOT 10x5" 표기
└──────────────┘
```

**권장 방법:** LWPOLYLINE (폴리라인)
```
LWPOLYLINE
  90 (vertex count: 4 + arcs)
  70 (closed: 1)
  10, 20 (start point)
  42 (bulge for arc)
  ... (vertices)
```

**대안 방법:** 2개의 원 + 텍스트 주석
- CNC 소프트웨어가 폴리라인을 지원하지 않을 경우
- 원형 홀 2개 (Ø5mm, 간격 5mm) + "SLOT" 라벨

### 9.5 MPR 형식 상세 (HOMAG woodWOP)

MPR(Machine Process Report)은 HOMAG woodWOP CNC 소프트웨어의 네이티브 가공 프로그램 형식입니다.

#### 9.5.1 MPR 파일 구조

```mpr
[H                              // 헤더 섹션
VERSION="4.0"                   // MPR 버전
HP="1"                          // 헤더 페이지
]

[001                            // 패널 정보 섹션
LA="패널명"                      // 패널 라벨
L="600"                         // 길이 (X)
B="400"                         // 너비 (Y)
D="18"                          // 두께 (Z)
]

<100 \BO\                       // 수직 보링 (Vertical Bore)
XA="37"                         // X 절대 위치
YA="37"                         // Y 절대 위치
DU="5"                          // 직경
TI="12"                         // 깊이
]

<101 \BO\                       // 또 다른 보링
XA="37"
YA="69"
DU="5"
TI="12"
]
```

#### 9.5.2 MPR 보링 명령어

| 명령어 | 설명 | 용도 |
|--------|------|------|
| `\BO\` | Vertical Bore | 수직 보링 (상면/하면) |
| `\HO\` | Horizontal Bore | 수평 보링 (측면) |
| `\SL\` | Slot (Groove) | 장공/홈 가공 |

#### 9.5.3 수직 보링 (상면/하면) - \BO\

```mpr
<100 \BO\                       // 보링 ID 및 타입
XA="37"                         // X 절대 위치 (mm)
YA="37"                         // Y 절대 위치 (mm)
DU="5"                          // 직경 (mm)
TI="12"                         // 깊이 (mm)
TNO="1"                         // 공구 번호
BO="0"                          // 보링면 (0=상면, 1=하면)
AN="0"                          // 각도
]
```

#### 9.5.4 수평 보링 (측면) - \HO\

```mpr
<200 \HO\                       // 수평 보링
XA="37"                         // X 위치
ZA="9"                          // Z 위치 (패널 두께 방향)
YS="-30"                        // Y 시작점 (음수 = 측면 진입)
DU="5"                          // 직경
TI="12"                         // 깊이 (측면 진입 깊이)
KA="1"                          // 가공면 (1=전면, 2=후면, 3=좌측, 4=우측)
]
```

#### 9.5.5 장공 (슬롯) - \SL\

```mpr
<300 \SL\                       // 슬롯 가공
XA="69"                         // X 시작 위치
YA="50"                         // Y 시작 위치
XE="79"                         // X 끝 위치 (10mm 장공)
YE="50"                         // Y 끝 위치
DU="5"                          // 공구 직경
TI="12"                         // 깊이
]
```

#### 9.5.6 보링 타입별 MPR 매핑

| 보링 타입 | MPR 명령 | 파라미터 예시 |
|-----------|----------|---------------|
| 힌지 컵 (Ø35) | `\BO\` | `DU="35" TI="13" BO="1"` (하면) |
| 힌지 나사 (Ø2.5) | `\HO\` | `DU="2.5" TI="12" KA="1"` (전면) |
| 캠 하우징 (Ø15) | `\BO\` | `DU="15" TI="12" BO="0"` (상면/하면) |
| 캠 볼트 (Ø5) | `\HO\` | `DU="5" TI="34" KA="3/4"` (측면) |
| 선반핀 (Ø5) | `\HO\` | `DU="5" TI="12" KA="3/4"` (측면) |
| 서랍레일 원형 (Ø5) | `\HO\` | `DU="5" TI="12" KA="3/4"` (측면) |
| 서랍레일 장공 | `\SL\` | 슬롯 명령으로 처리 |
| 조절발 (Ø10) | `\BO\` | `DU="10" TI="15" BO="1"` (하면) |

#### 9.5.7 전체 MPR 예시 (측판)

```mpr
[H
VERSION="4.0"
HP="1"
]

[001
LA="좌측판_P001"
L="560"
B="720"
D="18"
MAT="PB18"
]

// 선반핀 홀 (전면열)
<100 \HO\
XA="37" ZA="9" YS="-30" DU="5" TI="12" KA="4"
]
<101 \HO\
XA="37" ZA="9" YS="-30" DU="5" TI="12" KA="4"
YA="69"
]
<102 \HO\
XA="37" ZA="9" YS="-30" DU="5" TI="12" KA="4"
YA="101"
]

// 선반핀 홀 (후면열)
<110 \HO\
XA="523" ZA="9" YS="-30" DU="5" TI="12" KA="4"
YA="37"
]
<111 \HO\
XA="523" ZA="9" YS="-30" DU="5" TI="12" KA="4"
YA="69"
]

// 캠 볼트홀 (상단)
<200 \HO\
XA="37" ZA="9" YS="-30" DU="5" TI="34" KA="1"
YA="8"
]
<201 \HO\
XA="523" ZA="9" YS="-30" DU="5" TI="34" KA="1"
YA="8"
]

// 캠 볼트홀 (하단)
<210 \HO\
XA="37" ZA="9" YS="-30" DU="5" TI="34" KA="2"
YA="712"
]
<211 \HO\
XA="523" ZA="9" YS="-30" DU="5" TI="34" KA="2"
YA="712"
]

// 힌지 마운팅 나사홀
<300 \HO\
XA="37" ZA="9" YS="-30" DU="2.5" TI="12" KA="4"
YA="100"
]
<301 \HO\
XA="69" ZA="9" YS="-30" DU="2.5" TI="12" KA="4"
YA="100"
]
<302 \HO\
XA="37" ZA="9" YS="-30" DU="2.5" TI="12" KA="4"
YA="620"
]
<303 \HO\
XA="69" ZA="9" YS="-30" DU="2.5" TI="12" KA="4"
YA="620"
]
```

#### 9.5.8 MPR 내보내기 설정

```typescript
interface MPRExportSettings {
  version: '4.0' | '5.0';          // woodWOP 버전
  toolMapping: {                    // 공구 번호 매핑
    hingeCup: number;               // 힌지컵 드릴 (Ø35)
    hingScrew: number;              // 힌지나사 드릴 (Ø2.5)
    camHousing: number;             // 캠하우징 드릴 (Ø15)
    camBolt: number;                // 캠볼트 드릴 (Ø5)
    shelfPin: number;               // 선반핀 드릴 (Ø5)
    drawerRail: number;             // 서랍레일 드릴 (Ø5)
    adjustableFoot: number;         // 조절발 드릴 (Ø10)
  };
  useAbsoluteCoordinates: boolean;  // 절대 좌표 사용
  includeComments: boolean;         // 주석 포함
  filePerPanel: boolean;            // 패널당 개별 파일
}

// 기본 설정
const defaultMPRSettings: MPRExportSettings = {
  version: '4.0',
  toolMapping: {
    hingeCup: 1,
    hingScrew: 2,
    camHousing: 3,
    camBolt: 4,
    shelfPin: 4,    // 같은 Ø5 드릴 사용
    drawerRail: 4,  // 같은 Ø5 드릴 사용
    adjustableFoot: 5,
  },
  useAbsoluteCoordinates: true,
  includeComments: true,
  filePerPanel: true,
};
```

#### 9.5.9 MPR 좌표계 변환

```
woodWOP 좌표계:
- X: 패널 길이 방향 (0 = 좌측)
- Y: 패널 너비 방향 (0 = 전면)
- Z: 패널 두께 방향 (0 = 하면)

가공면(KA) 코드:
- KA="1": 전면 (Front)
- KA="2": 후면 (Back)
- KA="3": 좌측 (Left)
- KA="4": 우측 (Right)

보링면(BO) 코드:
- BO="0": 상면 (Top)
- BO="1": 하면 (Bottom)
```

### 9.6 CIX 형식 상세 (Biesse bSolid)

CIX(Cad Interchange eXtended)는 Biesse bSolid CNC 소프트웨어의 XML 기반 가공 프로그램 형식입니다.

#### 9.6.1 CIX 파일 구조

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Programme>
  <Header>
    <Name>패널명_P001</Name>
    <Version>4.0</Version>
    <Date>2025-01-14</Date>
  </Header>

  <Piece>
    <Length>600</Length>          <!-- X: 길이 -->
    <Width>400</Width>            <!-- Y: 너비 -->
    <Thickness>18</Thickness>     <!-- Z: 두께 -->
    <Material>PB18</Material>
  </Piece>

  <Operations>
    <!-- 보링 및 가공 명령 -->
  </Operations>
</Programme>
```

#### 9.6.2 CIX 보링 명령어

| 명령어 | 설명 | 용도 |
|--------|------|------|
| `<Boring>` | 수직 보링 | 상면/하면 홀 가공 |
| `<BoringSide>` | 수평 보링 | 측면 홀 가공 |
| `<Slot>` | 슬롯 가공 | 장공/홈 가공 |
| `<Pocket>` | 포켓 가공 | 사각형 홈 가공 |

#### 9.6.3 수직 보링 (상면/하면)

```xml
<Boring id="B001">
  <X>37</X>                       <!-- X 위치 (mm) -->
  <Y>37</Y>                       <!-- Y 위치 (mm) -->
  <Diameter>5</Diameter>          <!-- 직경 (mm) -->
  <Depth>12</Depth>               <!-- 깊이 (mm) -->
  <Side>0</Side>                  <!-- 0=상면, 1=하면 -->
  <Tool>4</Tool>                  <!-- 공구 번호 -->
  <SpindleSpeed>6000</SpindleSpeed>
  <FeedRate>3</FeedRate>
</Boring>
```

#### 9.6.4 수평 보링 (측면)

```xml
<BoringSide id="BS001">
  <X>37</X>                       <!-- X 위치 -->
  <Z>9</Z>                        <!-- Z 위치 (두께 방향) -->
  <Diameter>5</Diameter>          <!-- 직경 -->
  <Depth>34</Depth>               <!-- 진입 깊이 -->
  <Side>1</Side>                  <!-- 1=전면, 2=후면, 3=좌측, 4=우측 -->
  <Tool>4</Tool>
</BoringSide>
```

#### 9.6.5 슬롯 가공 (장공)

```xml
<Slot id="SL001">
  <StartX>69</StartX>             <!-- 시작 X -->
  <StartY>50</StartY>             <!-- 시작 Y -->
  <EndX>79</EndX>                 <!-- 끝 X (10mm 장공) -->
  <EndY>50</EndY>                 <!-- 끝 Y -->
  <Diameter>5</Diameter>          <!-- 공구 직경 -->
  <Depth>12</Depth>               <!-- 깊이 -->
  <Side>3</Side>                  <!-- 가공면 -->
  <Tool>4</Tool>
</Slot>
```

#### 9.6.6 보링 타입별 CIX 매핑

| 보링 타입 | CIX 요소 | 속성 예시 |
|-----------|----------|-----------|
| 힌지 컵 (Ø35) | `<Boring>` | `Diameter="35" Depth="13" Side="1"` |
| 힌지 나사 (Ø2.5) | `<BoringSide>` | `Diameter="2.5" Depth="12" Side="1"` |
| 캠 하우징 (Ø15) | `<Boring>` | `Diameter="15" Depth="12" Side="0/1"` |
| 캠 볼트 (Ø5) | `<BoringSide>` | `Diameter="5" Depth="34" Side="1/2"` |
| 선반핀 (Ø5) | `<BoringSide>` | `Diameter="5" Depth="12" Side="3/4"` |
| 서랍레일 원형 (Ø5) | `<BoringSide>` | `Diameter="5" Depth="12" Side="3/4"` |
| 서랍레일 장공 | `<Slot>` | `Diameter="5" Depth="12"` |
| 조절발 (Ø10) | `<Boring>` | `Diameter="10" Depth="15" Side="1"` |

#### 9.6.7 전체 CIX 예시 (측판)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Programme>
  <Header>
    <Name>좌측판_P001</Name>
    <Version>4.0</Version>
    <Date>2025-01-14</Date>
    <Generator>FurnitureEditor</Generator>
  </Header>

  <Piece>
    <Length>560</Length>
    <Width>720</Width>
    <Thickness>18</Thickness>
    <Material>PB18</Material>
    <Grain>V</Grain>
  </Piece>

  <Operations>
    <!-- 선반핀 홀 (전면열) -->
    <BoringSide id="SP001">
      <X>37</X><Z>9</Z><Diameter>5</Diameter><Depth>12</Depth><Side>4</Side><Tool>4</Tool>
      <Y>37</Y>
    </BoringSide>
    <BoringSide id="SP002">
      <X>37</X><Z>9</Z><Diameter>5</Diameter><Depth>12</Depth><Side>4</Side><Tool>4</Tool>
      <Y>69</Y>
    </BoringSide>
    <BoringSide id="SP003">
      <X>37</X><Z>9</Z><Diameter>5</Diameter><Depth>12</Depth><Side>4</Side><Tool>4</Tool>
      <Y>101</Y>
    </BoringSide>

    <!-- 선반핀 홀 (후면열) -->
    <BoringSide id="SP010">
      <X>523</X><Z>9</Z><Diameter>5</Diameter><Depth>12</Depth><Side>4</Side><Tool>4</Tool>
      <Y>37</Y>
    </BoringSide>
    <BoringSide id="SP011">
      <X>523</X><Z>9</Z><Diameter>5</Diameter><Depth>12</Depth><Side>4</Side><Tool>4</Tool>
      <Y>69</Y>
    </BoringSide>

    <!-- 캠 볼트홀 (상단-전면) -->
    <BoringSide id="CB001">
      <X>37</X><Z>9</Z><Diameter>5</Diameter><Depth>34</Depth><Side>1</Side><Tool>4</Tool>
      <Y>8</Y>
    </BoringSide>
    <BoringSide id="CB002">
      <X>523</X><Z>9</Z><Diameter>5</Diameter><Depth>34</Depth><Side>1</Side><Tool>4</Tool>
      <Y>8</Y>
    </BoringSide>

    <!-- 캠 볼트홀 (하단-후면) -->
    <BoringSide id="CB003">
      <X>37</X><Z>9</Z><Diameter>5</Diameter><Depth>34</Depth><Side>2</Side><Tool>4</Tool>
      <Y>712</Y>
    </BoringSide>
    <BoringSide id="CB004">
      <X>523</X><Z>9</Z><Diameter>5</Diameter><Depth>34</Depth><Side>2</Side><Tool>4</Tool>
      <Y>712</Y>
    </BoringSide>

    <!-- 힌지 마운팅 나사홀 -->
    <BoringSide id="HS001">
      <X>37</X><Z>9</Z><Diameter>2.5</Diameter><Depth>12</Depth><Side>4</Side><Tool>2</Tool>
      <Y>100</Y>
    </BoringSide>
    <BoringSide id="HS002">
      <X>69</X><Z>9</Z><Diameter>2.5</Diameter><Depth>12</Depth><Side>4</Side><Tool>2</Tool>
      <Y>100</Y>
    </BoringSide>
    <BoringSide id="HS003">
      <X>37</X><Z>9</Z><Diameter>2.5</Diameter><Depth>12</Depth><Side>4</Side><Tool>2</Tool>
      <Y>620</Y>
    </BoringSide>
    <BoringSide id="HS004">
      <X>69</X><Z>9</Z><Diameter>2.5</Diameter><Depth>12</Depth><Side>4</Side><Tool>2</Tool>
      <Y>620</Y>
    </BoringSide>
  </Operations>
</Programme>
```

#### 9.6.8 CIX 내보내기 설정

```typescript
interface CIXExportSettings {
  version: '3.0' | '4.0' | '5.0';  // bSolid 버전
  toolMapping: {                    // 공구 번호 매핑
    hingeCup: number;               // 힌지컵 드릴 (Ø35)
    hingeScrew: number;             // 힌지나사 드릴 (Ø2.5)
    camHousing: number;             // 캠하우징 드릴 (Ø15)
    camBolt: number;                // 캠볼트 드릴 (Ø5)
    shelfPin: number;               // 선반핀 드릴 (Ø5)
    drawerRail: number;             // 서랍레일 드릴 (Ø5)
    adjustableFoot: number;         // 조절발 드릴 (Ø10)
  };
  machineParams: {
    spindleSpeed: number;           // 스핀들 속도 (RPM)
    feedRate: number;               // 이송 속도 (m/min)
  };
  includeComments: boolean;         // XML 주석 포함
  filePerPanel: boolean;            // 패널당 개별 파일
}

// 기본 설정
const defaultCIXSettings: CIXExportSettings = {
  version: '4.0',
  toolMapping: {
    hingeCup: 1,
    hingeScrew: 2,
    camHousing: 3,
    camBolt: 4,
    shelfPin: 4,
    drawerRail: 4,
    adjustableFoot: 5,
  },
  machineParams: {
    spindleSpeed: 6000,
    feedRate: 3,
  },
  includeComments: true,
  filePerPanel: true,
};
```

#### 9.6.9 CIX 좌표계

```
bSolid 좌표계:
- X: 패널 길이 방향 (0 = 좌측)
- Y: 패널 너비 방향 (0 = 전면)
- Z: 패널 두께 방향 (0 = 하면)

가공면(Side) 코드 - 수평 보링:
- Side="1": 전면 (Front, -Y 방향)
- Side="2": 후면 (Back, +Y 방향)
- Side="3": 좌측 (Left, -X 방향)
- Side="4": 우측 (Right, +X 방향)

가공면(Side) 코드 - 수직 보링:
- Side="0": 상면 (Top, +Z 방향)
- Side="1": 하면 (Bottom, -Z 방향)
```

---

## 10. 구현 계획

### Phase 1: 기반 구조 (3일)
- [ ] `src/domain/boring/types.ts` - 타입 정의
- [ ] `src/domain/boring/constants.ts` - 기본 설정값
- [ ] `src/store/boringStore.ts` - Zustand 스토어

### Phase 2: 보링 계산 로직 (5일)
- [ ] `src/domain/boring/calculators/hingeCalculator.ts`
- [ ] `src/domain/boring/calculators/camLockCalculator.ts`
- [ ] `src/domain/boring/calculators/shelfPinCalculator.ts`
- [ ] `src/domain/boring/calculators/drawerRailCalculator.ts`
- [ ] `src/domain/boring/calculators/index.ts` - 통합 계산기

### Phase 3: 가구 모듈 연동 (5일)
- [ ] 기존 가구 모듈 데이터에서 패널 정보 추출
- [ ] 패널별 보링 데이터 자동 생성
- [ ] 도어/서랍 여부에 따른 조건부 보링

### Phase 4: CSV 내보내기 (2일)
- [ ] `src/domain/boring/exporters/csvExporter.ts`
- [ ] 다운로드 기능

### Phase 5: DXF 내보내기 (6일)
- [ ] `src/domain/boring/exporters/dxfExporter.ts`
- [ ] 레이어 구조 구현
- [ ] 보링을 원형(CIRCLE)으로 표현
- [ ] 장공(슬롯)을 LWPOLYLINE으로 표현

### Phase 5.5: MPR 내보내기 (5일)
- [ ] `src/domain/boring/exporters/mprExporter.ts`
- [ ] MPR 헤더/패널 정보 생성
- [ ] 수직 보링(\BO\) 명령 생성
- [ ] 수평 보링(\HO\) 명령 생성
- [ ] 슬롯(\SL\) 명령 생성
- [ ] 좌표계 변환 (내부 → woodWOP)
- [ ] 공구 번호 매핑 설정

### Phase 5.6: CIX 내보내기 (5일)
- [ ] `src/domain/boring/exporters/cixExporter.ts`
- [ ] XML 구조 생성 (Header, Piece, Operations)
- [ ] 수직 보링(`<Boring>`) 요소 생성
- [ ] 수평 보링(`<BoringSide>`) 요소 생성
- [ ] 슬롯(`<Slot>`) 요소 생성
- [ ] 좌표계 변환 (내부 → bSolid)
- [ ] 공구 번호 및 기계 파라미터 매핑

### Phase 6: UI 통합 (3일)
- [ ] 보링 설정 패널 컴포넌트
- [ ] 내보내기 다이얼로그
- [ ] 기존 옵티마이저 메뉴에 통합

### Phase 7: 테스트 및 검증 (2일)
- [ ] 단위 테스트
- [ ] 실제 가구 데이터로 검증
- [ ] DXF를 CAD로 열어서 확인

---

## 11. 파일 구조

```
src/
├── domain/
│   └── boring/
│       ├── types.ts                 # 타입 정의
│       ├── constants.ts             # 기본 설정값
│       ├── calculators/
│       │   ├── index.ts               # 통합 계산기
│       │   ├── hingeCalculator.ts     # 힌지 위치 계산
│       │   ├── camLockCalculator.ts   # 캠락 위치 계산
│       │   ├── shelfPinCalculator.ts  # 선반핀 위치 계산
│       │   └── drawerRailCalculator.ts # 서랍레일 위치 계산
│       ├── generators/
│       │   ├── index.ts
│       │   ├── lowerCabinetBoring.ts  # 하부장 보링 생성
│       │   ├── upperCabinetBoring.ts  # 상부장 보링 생성
│       │   ├── drawerCabinetBoring.ts # 서랍장 보링 생성
│       │   └── doorBoring.ts          # 도어 보링 생성
│       └── exporters/
│           ├── index.ts
│           ├── csvExporter.ts       # CSV 내보내기
│           ├── dxfExporter.ts       # DXF 내보내기
│           ├── mprExporter.ts       # MPR 내보내기 (HOMAG woodWOP)
│           └── cixExporter.ts       # CIX 내보내기 (Biesse bSolid)
│
├── store/
│   └── boringStore.ts               # 보링 설정 스토어
│
└── editor/
    └── shared/
        └── controls/
            └── boring/
                ├── BoringSettingsPanel.tsx
                └── BoringExportDialog.tsx
```

---

## 12. UI 설계

### 12.1 보링 설정 패널

```
┌──────────────────────────────────────────────────┐
│ ⚙️ 보링 설정                                      │
├──────────────────────────────────────────────────┤
│                                                  │
│ 🔩 힌지 (Blum CLIP top)                          │
│ ┌──────────────────────────────────────────────┐ │
│ │ 컵 직경      │ 35     │ mm   │ (고정)        │ │
│ │ 컵 깊이      │ [13  ] │ mm   │               │ │
│ │ 가장자리 거리 │ [3   ] │ mm   │ Full Overlay  │ │
│ │ 상하 마진    │ [100 ] │ mm   │               │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ 🔗 캠락                                          │
│ ┌──────────────────────────────────────────────┐ │
│ │ 하우징 직경  │ [15  ] │ mm   │               │ │
│ │ 하우징 깊이  │ [12.5] │ mm   │               │ │
│ │ 볼트홀 직경  │ [5   ] │ mm   │               │ │
│ │ 볼트홀 깊이  │ [34  ] │ mm   │               │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ 📍 선반핀                                        │
│ ┌──────────────────────────────────────────────┐ │
│ │ 직경         │ [5   ] │ mm   │               │ │
│ │ 깊이         │ [12  ] │ mm   │               │ │
│ │ 피치         │ [32  ] │ mm   │ 32mm 시스템   │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ 🗄️ 서랍 레일 (Blum)                              │
│ ┌──────────────────────────────────────────────┐ │
│ │ 레일 종류    │ [▼ TANDEM          ]          │ │
│ │              │    TANDEM (언더마운트)         │ │
│ │              │    MOVENTO (프리미엄)          │ │
│ │              │    LEGRABOX (메탈시스템)       │ │
│ │              │    METABOX (메탈사이드)        │ │
│ │──────────────────────────────────────────────│ │
│ │ 전면홀 직경  │ [5   ] │ mm   │               │ │
│ │ 전면홀 깊이  │ [12  ] │ mm   │               │ │
│ │ 전면 위치    │ [37  ] │ mm   │ 32mm 시스템   │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [기본값 복원]                                     │
└──────────────────────────────────────────────────┘
```

### 12.2 내보내기 다이얼로그

```
┌──────────────────────────────────────────────────┐
│ 📤 보링 데이터 내보내기                            │
├──────────────────────────────────────────────────┤
│                                                  │
│ 형식 선택:                                        │
│ ┌──────────────────────────────────────────────┐ │
│ │ ● CSV (범용)                                 │ │
│ │   - panels.csv + borings.csv                │ │
│ │   - 엑셀, 다른 소프트웨어에서 열기 가능         │ │
│ │                                              │ │
│ │ ○ DXF (CAD)                                 │ │
│ │   - 레이어별 보링 구분                        │ │
│ │   - AutoCAD, 기타 CAD에서 열기 가능           │ │
│ │                                              │ │
│ │ ○ MPR (HOMAG woodWOP)                       │ │
│ │   - CNC 기계 직접 제어 가능                   │ │
│ │   - 수직/수평 보링, 슬롯 명령 포함             │ │
│ │                                              │ │
│ │ ○ CIX (Biesse bSolid)                       │ │
│ │   - XML 기반 CNC 프로그램                    │ │
│ │   - 공구/스핀들 설정 포함                     │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ 옵션:                                            │
│ ┌──────────────────────────────────────────────┐ │
│ │ ☑ 패널별 개별 파일 생성                       │ │
│ │ ☑ 치수 포함                                  │ │
│ │ ☐ 미러링 패널 구분                           │ │
│ │ ☐ ZIP으로 압축                               │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ 미리보기:                                        │
│ ┌──────────────────────────────────────────────┐ │
│ │ 총 패널: 24개                                │ │
│ │ 총 보링: 492개                               │ │
│ │   - 힌지: 48개                               │ │
│ │   - 캠락: 96개                               │ │
│ │   - 선반핀: 312개                            │ │
│ │   - 서랍레일: 36개                           │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│              [취소]        [내보내기]             │
└──────────────────────────────────────────────────┘
```

---

## 13. 추가 확인 필요 사항

### 13.1 확인 완료
- [x] 힌지: Blum CLIP top BLUMOTION
- [x] 오버레이: Full Overlay (전면)
- [x] 마운팅: 나사 고정
- [x] 시스템: 32mm
- [x] 캠락: Ø15mm 표준
- [x] 백패널: 홈 방식 (다웰 미사용)
- [x] 서랍 레일: Blum (TANDEM/MOVENTO/LEGRABOX/METABOX) - **사용자 선택**

### 13.2 CNC 소프트웨어 지원 (확정)
- [x] **Cabinet Vision** - CSV/DXF 호환
- [x] **Microvellum** - CSV/DXF 호환
- [x] **imos** - CSV/DXF 호환
- [x] **HOMAG woodWOP** - CSV/DXF/**MPR 네이티브** 호환
- [x] **Biesse bSolid** - CSV/DXF/**CIX 네이티브** 호환
- [x] **ARDIS** - CSV/DXF 호환

> 범용 CSV/DXF 형식 외에, HOMAG woodWOP은 MPR, Biesse bSolid는 CIX 네이티브 형식으로 직접 CNC 프로그램 내보내기 지원

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 내용 |
|------|------|--------|------|
| 0.1 | 2025-01-14 | Claude | 초안 작성 |
| 0.2 | 2025-01-14 | Claude | Blum CLIP top Full Overlay + 나사고정 기준으로 상세화 |
| 0.3 | 2025-01-14 | Claude | 캠락 Ø15mm 확정 |
| 0.4 | 2025-01-14 | Claude | 백패널 홈 방식 확정, 다웰 관련 내용 제거 |
| 0.5 | 2025-01-14 | Claude | Blum 서랍 레일 추가 (사용자 선택 옵션) |
| 0.6 | 2025-01-14 | Claude | 서랍장 보링 매핑, 양문도어, 상/하부장 차이점, 장공 DXF 표현 추가 |
| 0.7 | 2025-01-14 | Claude | CNC 소프트웨어 지원 목록 추가 (Cabinet Vision, Microvellum, imos, HOMAG, Biesse, ARDIS) |
| 0.8 | 2025-01-14 | Claude | MPR 형식 상세 추가 (HOMAG woodWOP 네이티브 포맷, 수직/수평 보링, 슬롯 명령) |
| 0.9 | 2025-01-14 | Claude | CIX 형식 상세 추가 (Biesse bSolid XML 네이티브 포맷) |
