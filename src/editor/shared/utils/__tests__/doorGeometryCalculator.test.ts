import { describe, expect, it } from 'vitest'
import {
  calculateDoorCenterAfterYRotation,
  calculateDoorOpenInsetUnits,
  calculateDualDoorOpenGeometry,
  calculateSingleDoorOpenGeometry,
  mmToDoorGeometryUnits,
  normalizeDoorHingePositionsMm,
  resolveDoorLeafDimensions,
  resolveDoorVerticalGeometry,
  resolveDefaultDoorHingePositionsMm,
  resolveHingeOppositeDoorWidthAdjustment
} from '../doorGeometryCalculator'

describe('doorGeometryCalculator', () => {
  it('18mm 패널 기준 힌지 오프셋과 열린 도어 삽입 보정값을 고정한다', () => {
    const geometry = calculateDoorOpenInsetUnits(18)

    expect(geometry.hingeOffsetUnits).toBeCloseTo(0.09, 8)
    expect(geometry.openInsetAdjustUnits).toBeCloseTo(0.045, 8)
  })

  it('싱글 좌측 힌지 도어의 기존 DoorModule X/Z 좌표식을 재현한다', () => {
    const doorGroupX = 1.2
    const doorYPosition = 3.4
    const doorDepth = mmToDoorGeometryUnits(608)
    const doorWidthUnits = mmToDoorGeometryUnits(500)
    const epTrimShiftX = mmToDoorGeometryUnits(9)
    const insertExtendShiftX = -mmToDoorGeometryUnits(12.25)

    const geometry = calculateSingleDoorOpenGeometry({
      hingeSide: 'left',
      doorGroupX,
      doorYPosition,
      doorDepth,
      doorWidthUnits,
      epTrimShiftX,
      insertExtendShiftX,
      panelThicknessMm: 18
    })

    const hingeAxisOffset = -doorWidthUnits / 2 + 0.09
    const innerXShift = 0.045

    expect(geometry.hingeAxisOffset).toBeCloseTo(hingeAxisOffset, 8)
    expect(geometry.parentPosition).toEqual([
      doorGroupX + hingeAxisOffset + epTrimShiftX + insertExtendShiftX + innerXShift,
      doorYPosition,
      doorDepth / 2 + 0.045
    ])
    expect(geometry.childPosition).toEqual([
      -hingeAxisOffset - innerXShift,
      0,
      -0.045
    ])
  })

  it('싱글 우측 힌지 도어의 기존 DoorModule X/Z 좌표식을 재현한다', () => {
    const doorGroupX = -0.8
    const doorYPosition = 2.1
    const doorDepth = mmToDoorGeometryUnits(408)
    const doorWidthUnits = mmToDoorGeometryUnits(420)

    const geometry = calculateSingleDoorOpenGeometry({
      hingeSide: 'right',
      doorGroupX,
      doorYPosition,
      doorDepth,
      doorWidthUnits,
      panelThicknessMm: 18
    })

    const hingeAxisOffset = doorWidthUnits / 2 - 0.09
    const innerXShift = -0.045

    expect(geometry.parentPosition).toEqual([
      doorGroupX + hingeAxisOffset + innerXShift,
      doorYPosition,
      doorDepth / 2 + 0.045
    ])
    expect(geometry.childPosition).toEqual([
      -hingeAxisOffset - innerXShift,
      0,
      -0.045
    ])
  })

  it('듀얼 좌측 도어의 부모/자식 좌표식을 기존 DoorModule과 맞춘다', () => {
    const doorYPosition = 1.5
    const doorDepth = mmToDoorGeometryUnits(608)
    const hingeX = -2.0
    const doorWidthUnits = mmToDoorGeometryUnits(497)
    const epTrimShift = mmToDoorGeometryUnits(9)
    const insertExtendShift = -mmToDoorGeometryUnits(12.25)

    const geometry = calculateDualDoorOpenGeometry({
      doorSide: 'left',
      doorYPosition,
      doorDepth,
      hingeX,
      doorWidthUnits,
      epTrimShift,
      insertExtendShift,
      panelThicknessMm: 18
    })

    expect(geometry.parentPosition).toEqual([
      hingeX + epTrimShift + insertExtendShift + 0.045,
      doorYPosition,
      doorDepth / 2 + 0.045
    ])
    expect(geometry.childPosition).toEqual([
      doorWidthUnits / 2 - 0.09 - 0.045,
      0,
      -0.045
    ])
  })

  it('듀얼 우측 도어의 부모/자식 좌표식을 기존 DoorModule과 맞춘다', () => {
    const doorYPosition = 1.5
    const doorDepth = mmToDoorGeometryUnits(608)
    const hingeX = 2.0
    const doorWidthUnits = mmToDoorGeometryUnits(497)
    const epTrimShift = -mmToDoorGeometryUnits(9)
    const insertExtendShift = mmToDoorGeometryUnits(12.25)

    const geometry = calculateDualDoorOpenGeometry({
      doorSide: 'right',
      doorYPosition,
      doorDepth,
      hingeX,
      doorWidthUnits,
      epTrimShift,
      insertExtendShift,
      panelThicknessMm: 18
    })

    expect(geometry.parentPosition).toEqual([
      hingeX + epTrimShift + insertExtendShift - 0.045,
      doorYPosition,
      doorDepth / 2 + 0.045
    ])
    expect(geometry.childPosition).toEqual([
      -doorWidthUnits / 2 + 0.09 + 0.045,
      0,
      -0.045
    ])
  })

  it('닫힌 상태의 싱글 도어 중심은 도어 깊이 중앙과 X 기준 위치를 유지한다', () => {
    const doorGroupX = 0.7
    const doorYPosition = 2.2
    const doorDepth = mmToDoorGeometryUnits(608)
    const doorWidthUnits = mmToDoorGeometryUnits(500)
    const epTrimShiftX = mmToDoorGeometryUnits(9)
    const insertExtendShiftX = -mmToDoorGeometryUnits(12.25)
    const geometry = calculateSingleDoorOpenGeometry({
      hingeSide: 'left',
      doorGroupX,
      doorYPosition,
      doorDepth,
      doorWidthUnits,
      epTrimShiftX,
      insertExtendShiftX,
      panelThicknessMm: 18
    })

    const [x, y, z] = calculateDoorCenterAfterYRotation(geometry, 0)

    expect(x).toBeCloseTo(doorGroupX + epTrimShiftX + insertExtendShiftX, 8)
    expect(y).toBe(doorYPosition)
    expect(z).toBeCloseTo(doorDepth / 2, 8)
  })

  it('90도 열린 좌/우 도어는 같은 깊이 방향 기준으로 열린다', () => {
    const doorYPosition = 1.5
    const doorDepth = mmToDoorGeometryUnits(608)
    const doorWidthUnits = mmToDoorGeometryUnits(497)
    const leftGeometry = calculateDualDoorOpenGeometry({
      doorSide: 'left',
      doorYPosition,
      doorDepth,
      hingeX: -2,
      doorWidthUnits,
      panelThicknessMm: 18
    })
    const rightGeometry = calculateDualDoorOpenGeometry({
      doorSide: 'right',
      doorYPosition,
      doorDepth,
      hingeX: 2,
      doorWidthUnits,
      panelThicknessMm: 18
    })

    const leftOpenCenter = calculateDoorCenterAfterYRotation(leftGeometry, -Math.PI / 2)
    const rightOpenCenter = calculateDoorCenterAfterYRotation(rightGeometry, Math.PI / 2)
    const expectedOpenCenterZ = doorDepth / 2 + doorWidthUnits / 2 - 0.09

    expect(leftOpenCenter[2]).toBeCloseTo(expectedOpenCenterZ, 8)
    expect(rightOpenCenter[2]).toBeCloseTo(expectedOpenCenterZ, 8)
    expect(leftOpenCenter[1]).toBe(doorYPosition)
    expect(rightOpenCenter[1]).toBe(doorYPosition)
  })

  it('수동 도어 폭 조정은 경첩 반대 방향으로 분배한다', () => {
    expect(resolveHingeOppositeDoorWidthAdjustment(30, 'right')).toEqual({
      leftMm: 30,
      rightMm: 0
    })
    expect(resolveHingeOppositeDoorWidthAdjustment(-20, 'right')).toEqual({
      leftMm: -20,
      rightMm: 0
    })
    expect(resolveHingeOppositeDoorWidthAdjustment(30, 'left')).toEqual({
      leftMm: 0,
      rightMm: 30
    })
    expect(resolveHingeOppositeDoorWidthAdjustment(-20, 'left')).toEqual({
      leftMm: 0,
      rightMm: -20
    })
  })

  it('사용자 경첩 위치는 도어 높이 범위 안에서 중복 없이 하단 기준으로 정렬한다', () => {
    expect(normalizeDoorHingePositionsMm([500.4, -20, 500.2, 900], 800)).toEqual([1, 500, 799])
    expect(normalizeDoorHingePositionsMm(undefined, 800)).toEqual([])
    expect(normalizeDoorHingePositionsMm([100], 0)).toEqual([])
  })

  it('기본 경첩 위치는 기존 2D 뷰어 배치 기준과 일치한다', () => {
    expect(resolveDefaultDoorHingePositionsMm({
      doorHeightMm: 800,
      isUpperCabinet: true
    })).toEqual([100, 700])

    expect(resolveDefaultDoorHingePositionsMm({
      doorHeightMm: 780,
      isLowerCabinet: true
    })).toEqual([149, 680])

    expect(resolveDefaultDoorHingePositionsMm({
      doorHeightMm: 2100
    })).toEqual([149, 749, 1400, 2000])

    expect(resolveDefaultDoorHingePositionsMm({
      doorHeightMm: 2700,
      hingeMode: 'lower5'
    })).toEqual([149, 749, 1350, 2000, 2600])
  })

  it('상부장 도어 패널 높이는 패널리스트 기존 기준값을 유지한다', () => {
    const result = resolveDoorLeafDimensions({
      moduleId: 'upper-cabinet-basic',
      cabinetCategory: 'upper',
      doorWidthMm: 500,
      cabinetHeightMm: 785
    })

    expect(result.leafCount).toBe(1)
    expect(result.leafWidthMm).toBe(497)
    expect(result.leafHeightMm).toBe(808)
  })

  it('하부 상판내림 도어 높이는 710mm 고정값을 유지한다', () => {
    const result = resolveDoorLeafDimensions({
      moduleId: 'lower-top-down-2tier',
      cabinetCategory: 'lower',
      doorWidthMm: 600,
      cabinetHeightMm: 720
    })

    expect(result.leafHeightMm).toBe(710)
  })

  it('하부 도어올림 도어 높이는 캐비넷 높이에 상하 확장값을 더한다', () => {
    const result = resolveDoorLeafDimensions({
      moduleId: 'lower-door-lift-2tier',
      cabinetCategory: 'lower',
      doorWidthMm: 600,
      cabinetHeightMm: 720
    })

    expect(result.leafHeightMm).toBe(755)
  })

  it('하부 도어올림 도어 높이는 입력된 상하 갭 변경을 반영한다', () => {
    const result = resolveDoorLeafDimensions({
      moduleId: 'lower-door-lift-2tier',
      cabinetCategory: 'lower',
      doorWidthMm: 600,
      cabinetHeightMm: 720,
      doorTopGapMm: 40,
      doorBottomGapMm: 10
    })

    expect(result.leafHeightMm).toBe(770)
  })

  it('일반 하부장 도어 높이는 입력된 상하 갭만큼 확장한다', () => {
    const result = resolveDoorLeafDimensions({
      moduleId: 'lower-cabinet-basic',
      cabinetCategory: 'lower',
      doorWidthMm: 600,
      cabinetHeightMm: 720,
      doorTopGapMm: 12,
      doorBottomGapMm: 8
    })

    expect(result.leafHeightMm).toBe(740)
  })

  it('키큰장 도어 높이는 몸통 높이에 상하 갭을 더한다', () => {
    const result = resolveDoorLeafDimensions({
      moduleId: 'single-shelf-cabinet',
      cabinetCategory: 'full',
      doorWidthMm: 600,
      cabinetHeightMm: 2100,
      spaceHeightMm: 2400,
      doorTopGapMm: 5,
      doorBottomGapMm: 25
    })

    expect(result.leafHeightMm).toBe(2130)
  })

  it('듀얼 도어는 전체 폭을 합산하지 않고 좌우 leaf 폭을 따로 계산한다', () => {
    const result = resolveDoorLeafDimensions({
      moduleId: 'dual-lower-cabinet-basic',
      cabinetCategory: 'lower',
      doorWidthMm: 1000,
      cabinetHeightMm: 720
    })

    expect(result.leafCount).toBe(2)
    expect(result.leafWidthMm).toBe(497)
    expect(result.leaves).toEqual([
      {
        index: 0,
        name: 'left',
        widthMm: 497,
        heightMm: 720,
        hingeSide: 'right'
      },
      {
        index: 1,
        name: 'right',
        widthMm: 497,
        heightMm: 720,
        hingeSide: 'left'
      }
    ])
  })

  it('일반 하부장 도어 세로 위치는 하단/상단 갭을 포함해 산출한다', () => {
    const result = resolveDoorVerticalGeometry({
      moduleId: 'lower-cabinet-basic',
      cabinetCategory: 'lower',
      doorWidthMm: 500,
      cabinetHeightMm: 720,
      cabinetBottomMm: 65,
      doorTopGapMm: 12,
      doorBottomGapMm: 8
    })

    expect(result.leafHeightMm).toBe(740)
    expect(result.bottomMm).toBe(57)
    expect(result.topMm).toBe(797)
    expect(result.centerYMm).toBe(427)
  })

  it('하부 도어올림 도어 세로 위치는 입력된 상하 갭을 몸통 기준으로 적용한다', () => {
    const result = resolveDoorVerticalGeometry({
      moduleId: 'lower-door-lift-2tier',
      cabinetCategory: 'lower',
      doorWidthMm: 500,
      cabinetHeightMm: 720,
      cabinetBottomMm: 65,
      doorTopGapMm: 40,
      doorBottomGapMm: 10
    })

    expect(result.leafHeightMm).toBe(770)
    expect(result.bottomMm).toBe(55)
    expect(result.topMm).toBe(825)
    expect(result.centerYMm).toBe(440)
  })

  it('상부장 도어 세로 위치는 공간 상단 기준 top gap을 유지한다', () => {
    const result = resolveDoorVerticalGeometry({
      moduleId: 'upper-cabinet-basic',
      cabinetCategory: 'upper',
      doorWidthMm: 500,
      cabinetHeightMm: 785,
      spaceHeightMm: 2400,
      doorTopGapMm: 5
    })

    expect(result.leafHeightMm).toBe(808)
    expect(result.topMm).toBe(2395)
    expect(result.bottomMm).toBe(1587)
    expect(result.centerYMm).toBe(1991)
  })

  it('키큰장 도어 세로 위치는 몸통 기준 상하 갭을 유지한다', () => {
    const result = resolveDoorVerticalGeometry({
      moduleId: 'single-shelf-cabinet',
      cabinetCategory: 'full',
      doorWidthMm: 500,
      cabinetHeightMm: 2100,
      spaceHeightMm: 2400,
      doorTopGapMm: 5,
      doorBottomGapMm: 25
    })

    expect(result.leafHeightMm).toBe(2130)
    expect(result.bottomMm).toBe(-25)
    expect(result.topMm).toBe(2105)
    expect(result.centerYMm).toBe(1040)
  })
})
