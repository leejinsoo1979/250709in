import { describe, expect, it } from 'vitest'
import { getModuleById } from '@/data/modules'
import type { SectionConfig } from '@/data/modules'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import { calculatePanelDetails } from '../calculatePanelDetails'
import { resolveTopDown2TierGeometry } from '../topDownCabinetGeometry'
import { getDefaultGrainDirection } from '../materialConstants'

const translate = (key: string) => key

interface PanelDetail {
  name?: string
  width?: number
  height?: number
  depth?: number
  thickness?: number
  material?: string
  isDoor?: boolean
  isLeftHinge?: boolean
  boringPositions?: number[]
  screwPositions?: number[]
  boringDepthPositions?: number[]
  hingeCount?: number
  bracketBoringPositions?: number[]
  sideNotches?: Array<{ y: number; z: number; fromBottom: number }>
  groovePositions?: Array<{ y: number; height: number; depth: number }>
}

const getRequiredModule = (id: string, width: number, depth: number) => {
  const spaceInfo = {
    width: 2700,
    height: 2400,
    depth,
    _tempSlotWidths: [width, width]
  } as SpaceInfo & { _tempSlotWidths: number[] }

  const moduleData = getModuleById(
    id,
    { width: 2700, height: 2400, depth },
    spaceInfo
  )

  expect(moduleData).toBeDefined()
  return moduleData!
}

interface PanelDetailOptions {
  hasDoor?: boolean
  hingePosition?: 'left' | 'right'
  spaceHeight?: number
  doorTopGap?: number
  doorBottomGap?: number
  backPanelThicknessMm?: number
  basicThicknessMm?: number
  freeHeight?: number
  stoneTopThickness?: number
  customHingePositionsMm?: number[]
  customUpperDoorHingePositionsMm?: number[]
  customLowerDoorHingePositionsMm?: number[]
  customSections?: SectionConfig[]
  lowerSectionTopOffsetMm?: number
}

const calculatePanels = (
  id: string,
  width: number,
  depth: number,
  options: PanelDetailOptions = {}
) => {
  const rawModuleData = getRequiredModule(id, width, depth)
  const moduleData = options.basicThicknessMm == null
    ? rawModuleData
    : {
        ...rawModuleData,
        modelConfig: {
          ...rawModuleData.modelConfig,
          basicThickness: options.basicThicknessMm
        }
      }

  return calculatePanelDetails(
    moduleData,
    width,
    depth,
    options.hasDoor ?? false,
    translate,
    undefined,
    options.hingePosition,
    undefined,
    options.spaceHeight,
    options.doorTopGap,
    options.doorBottomGap,
    undefined,
    options.backPanelThicknessMm,
    undefined,
    undefined,
    undefined,
    undefined,
    options.freeHeight,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.stoneTopThickness,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.customHingePositionsMm,
    options.customUpperDoorHingePositionsMm,
    options.customLowerDoorHingePositionsMm,
    options.customSections,
    undefined,
    undefined,
    options.lowerSectionTopOffsetMm
  )
}

const findPanel = (panels: PanelDetail[], name: string) => {
  const panel = panels.find((item) => item.name === name)
  expect(panel).toBeDefined()
  return panel
}

describe('panelDetails regression baselines', () => {
  it('현관장 H 패널 목록은 생성 직후 깊이 380mm 기준으로 계산한다', () => {
    const panels = calculatePanels('single-entryway-h-500', 500, 380, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })

    expect(findPanel(panels, '(하)좌측').width).toBe(380)
    expect(findPanel(panels, '(상)좌측').width).toBe(380)
    expect(findPanel(panels, '(하)우측').width).toBe(380)
    expect(findPanel(panels, '(상)우측').width).toBe(380)
    expect(panels.some(panel => panel.name === '좌측판')).toBe(false)
    expect(panels.some(panel => panel.name === '우측판')).toBe(false)
    expect(findPanel(panels, '서랍받침대').depth).toBe(269)
    expect(findPanel(panels, '서랍속장(좌)').width).toBe(233)
    expect(findPanel(panels, '서랍1 좌측판').width).toBe(276)
    expect(findPanel(panels, '서랍1 좌측판').groovePositions).toEqual([{ y: 12, height: 10, depth: 7.5 }])
    expect(findPanel(panels, '서랍1 우측판').groovePositions).toEqual([{ y: 12, height: 10, depth: 7.5 }])
    expect(findPanel(panels, '서랍1 앞판').groovePositions).toBeUndefined()
    expect(findPanel(panels, '서랍1 뒷판').groovePositions).toBeUndefined()
    expect(findPanel(panels, '서랍1 바닥').depth).toBe(275)
  })

  it('18.5T도 백패널 홈 기준 후면 오프셋은 18T와 동일하게 계산한다', () => {
    const panels = calculatePanels('single-entryway-h-500', 500, 380, {
      hasDoor: true,
      backPanelThicknessMm: 3,
      basicThicknessMm: 18.5
    })

    expect(findPanel(panels, '(하)바닥').depth).toBe(360)
    expect(findPanel(panels, '(하)상판').depth).toBe(360)
    expect(findPanel(panels, '(상)바닥').depth).toBe(360)
    expect(findPanel(panels, '(상)상판').depth).toBe(360)
  })

  it('상판내림 30T 패널 목록은 상판/앞판 기준 치수를 고정한다', () => {
    const panels = calculatePanels('lower-top-down-2tier-500', 500, 650, {
      hasDoor: true,
      doorTopGap: -80,
      doorBottomGap: 25,
      backPanelThicknessMm: 9,
      stoneTopThickness: 30
    })

    expect(findPanel(panels, '상판').depth).toBe(595.5)
    expect(findPanel(panels, '인조대리석 상판').depth).toBe(673)
    expect(findPanel(panels, '인조대리석 앞판').height).toBe(80)
  })

  it('상판내림 높이 변경 시 마이다 상단과 인조대리석 앞판 하단 갭 20mm를 유지한다', () => {
    const panels = calculatePanels('lower-top-down-2tier-500', 500, 650, {
      hasDoor: true,
      doorTopGap: -80,
      doorBottomGap: 25,
      backPanelThicknessMm: 9,
      freeHeight: 815,
      stoneTopThickness: 30
    })

    expect(findPanel(panels, '서랍1(마이다)').height).toBe(365)
    expect(findPanel(panels, '서랍2(마이다)').height).toBe(365)
    expect(findPanel(panels, '전대').height).toBe(55)
    expect(findPanel(panels, '인조대리석 앞판').height).toBe(80)
  })

  it('상판내림 전면 상판은 상판 두께와 무관하게 80mm다', () => {
    for (const thickness of [10, 20, 30]) {
      const panels = calculatePanels('lower-top-down-2tier-500', 500, 650, {
        hasDoor: true,
        doorTopGap: -80,
        doorBottomGap: 5,
        backPanelThicknessMm: 9,
        stoneTopThickness: thickness
      })

      expect(findPanel(panels, '인조대리석 앞판').height).toBe(80)
      const geometry = resolveTopDown2TierGeometry(785, thickness)
      expect(geometry.upperMaidaBottomMm - geometry.lowerMaidaTopMm).toBe(20)
    }
  })

  it('하부 3단 서랍장 높이 축소 시 서랍 패널 높이는 가구 높이 안에서 재계산된다', () => {
    const panels = calculatePanels('lower-drawer-3tier-500', 500, 650, {
      backPanelThicknessMm: 9,
      freeHeight: 700
    })
    const drawerFronts = panels.filter((panel) => panel.name?.match(/^서랍\d+\(마이다\)$/))

    expect(drawerFronts).toHaveLength(3)
    drawerFronts.forEach((panel) => {
      expect(panel.height).toBeGreaterThan(0)
      expect(panel.height).toBeLessThan(700)
    })
    expect(Math.max(...drawerFronts.map((panel) => panel.height))).toBeLessThanOrEqual(700)
    expect(findPanel(panels, '서랍1 좌측판').groovePositions).toEqual([{ y: 12, height: 10, depth: 7.5 }])
    expect(findPanel(panels, '서랍1 우측판').groovePositions).toEqual([{ y: 12, height: 10, depth: 7.5 }])
    expect(findPanel(panels, '서랍1 뒷판').groovePositions).toBeUndefined()
  })

  it('유리장 서랍 모듈 목재 패널은 옵티마이저 패널 목록에 모두 포함된다', () => {
    const panels = calculatePanels('single-glass-cabinet-500', 500, 365, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })

    const expectedDrawerModulePanels = [
      '서랍 좌측판',
      '서랍 우측판',
      '서랍 바닥판',
      '유리장 서랍1 좌측판',
      '유리장 서랍1 우측판',
      '유리장 서랍1 앞판',
      '유리장 서랍1 뒷판',
      '유리장 서랍1 바닥',
      '유리장 서랍1 마이다',
      '유리장 서랍2 좌측판',
      '유리장 서랍2 우측판',
      '유리장 서랍2 앞판',
      '유리장 서랍2 뒷판',
      '유리장 서랍2 바닥',
      '유리장 서랍2 마이다',
      '목찬넬프레임수평(1)',
      '목찬넬프레임수직(1)',
      '전대',
      '상단뒤프레임',
      '상단뒤프레임 안쪽판재',
      '상단뒤프레임 하단판재',
      '서랍 바닥판2'
    ]

    expectedDrawerModulePanels.forEach((name) => {
      expect(findPanel(panels, name)).toBeDefined()
    })
    const drawerFrontPanelNames = ['유리장 서랍1 앞판', '유리장 서랍2 앞판']
    drawerFrontPanelNames.forEach((name) => {
      const panel = findPanel(panels, name)
      expect(panel.boringPositions).toBeUndefined()
      expect(panel.boringDepthPositions).toBeUndefined()
    })
    expect(findPanel(panels, '목찬넬프레임수평(1)')).toMatchObject({ thickness: 18.5, material: 'PET' })
    expect(findPanel(panels, '목찬넬프레임수직(1)')).toMatchObject({ thickness: 18.5, material: 'PET' })
    expect(findPanel(panels, '백패널').height).toBe(510)
    expect(panels.some(panel => panel.name?.includes('보강대'))).toBe(false)
  })

  it('상부장 2단형 H1000은 선반과 경첩 보링이 50mm 이상 이격된다', () => {
    const panels = calculatePanels('upper-cabinet-2tier-500', 500, 300, {
      hasDoor: true,
      hingePosition: 'left',
      backPanelThicknessMm: 9,
      freeHeight: 1000
    })

    const door = findPanel(panels, '도어')
    const leftSide = findPanel(panels, '좌측판')

    expect(door.height).toBe(1033)
    expect(door.boringPositions).toEqual([120, 469, 913])
    expect(leftSide.bracketBoringPositions).toEqual([92, 441, 885])
    expect(491 - leftSide.bracketBoringPositions![1]).toBe(50)
  })

  it('키큰장찬넬 프레임 패널은 옵티마이저 패널 목록에 포함된다', () => {
    const panels = calculatePanels('insert-frame-136', 136, 58, {
      spaceHeight: 2400
    })

    ;[
      '키큰장찬넬 전면프레임',
      '키큰장찬넬 좌EP',
      '키큰장찬넬 우EP',
      '상단몰딩',
      '걸래받이'
    ].forEach((name) => {
      expect(findPanel(panels, name)).toBeDefined()
    })
  })

  it('키큰장찬넬 세로 프레임 패널은 높이 방향 재단으로 고정된다', () => {
    expect(getDefaultGrainDirection('키큰장찬넬 전면프레임')).toBe('vertical')
    expect(getDefaultGrainDirection('키큰장찬넬 좌EP')).toBe('vertical')
    expect(getDefaultGrainDirection('키큰장찬넬 우EP')).toBe('vertical')
  })

  it('도어분절 팬트리장 도어는 하부/상부 도어 이름으로 패널 목록에 포함된다', () => {
    const panels = calculatePanels('single-pantry-cabinet-split-600', 600, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })
    const doorNames = panels.filter(panel => panel.isDoor).map(panel => panel.name)

    expect(doorNames).toEqual(['하부 도어', '상부 도어'])
  })

  it('도어분절 현관장 도어 보링은 측판 섹션 기준 120mm 기본 공식을 따른다', () => {
    const panels = calculatePanels('single-shelf-split-500', 500, 380, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })
    const lowerDoor = findPanel(panels, '하부 도어')
    const upperDoor = findPanel(panels, '상부 도어')

    expect(lowerDoor.height).toBe(820)
    expect(lowerDoor.boringPositions).toEqual([120, 740])
    expect(lowerDoor.screwPositions).toEqual([97.5, 142.5, 717.5, 762.5])
    expect(lowerDoor.hingeCount).toBe(2)
    expect(upperDoor.height).toBe(1560)
    expect(upperDoor.boringPositions).toEqual([140, 790, 1440])
    expect(upperDoor.screwPositions).toEqual([117.5, 162.5, 767.5, 812.5, 1417.5, 1462.5])
    expect(upperDoor.hingeCount).toBe(3)
  })

  it('듀얼 도어분절 현관장 도어 보링도 좌우 도어별 섹션 기준 120mm 기본 공식을 따른다', () => {
    const panels = calculatePanels('dual-shelf-split-1000', 1000, 380, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })
    const doors = panels.filter(panel => panel.isDoor)

    expect(doors.map(panel => panel.name)).toEqual([
      '좌측 하부 도어',
      '좌측 상부 도어',
      '우측 하부 도어',
      '우측 상부 도어'
    ])
    doors.filter(panel => panel.name?.includes('하부')).forEach(panel => {
      expect(panel.height).toBe(820)
      expect(panel.boringPositions).toEqual([120, 740])
      expect(panel.hingeCount).toBe(2)
    })
    doors.filter(panel => panel.name?.includes('상부')).forEach(panel => {
      expect(panel.height).toBe(1560)
      expect(panel.boringPositions).toEqual([140, 790, 1440])
      expect(panel.hingeCount).toBe(3)
    })
  })

  it('도어분절 현관장 하부 상단 목찬넬은 옵티마이저 패널 목록에 포함된다', () => {
    const panels = calculatePanels('single-shelf-split-500', 500, 380, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })

    expect(findPanel(panels, '목찬넬프레임수평(1)')).toMatchObject({ thickness: 18.5, material: 'PET' })
    expect(findPanel(panels, '목찬넬프레임수직(1)')).toMatchObject({ thickness: 18.5, material: 'PET' })
    expect(findPanel(panels, '전대')).toBeDefined()
    expect(findPanel(panels, '(하)상판').depth).toBe(296)
    expect(findPanel(panels, '(하)좌측').sideNotches).toEqual([{ y: 80, z: 40, fromBottom: 780 }])
    expect(findPanel(panels, '(하)우측').sideNotches).toEqual([{ y: 80, z: 40, fromBottom: 780 }])
  })

  it('주방 키큰장 인출장 패널 목록은 3D 옵티마이저 mesh 이름과 일치한다', () => {
    const panels = calculatePanels('single-pull-out-cabinet-600', 600, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })
    const names = panels.map((panel) => panel.name)

    ;[
      '좌측판1',
      '우측판1',
      '좌측판2',
      '우측판2',
      '좌측판3',
      '우측판3',
      '(1단)백패널',
      '(2단)백패널',
      '(3단)백패널',
      '(1단)보강대 1',
      '(1단)보강대 2',
      '(2단)보강대 1',
      '(2단)보강대 2',
      '(3단)보강대 1',
      '(3단)보강대 2',
      '전자렌지 좌날개',
      '전자렌지 우날개',
      '전자렌지 전면프레임',
      '전자렌지 인출 트레이 바닥판'
    ].forEach((name) => {
      expect(findPanel(panels, name)).toBeDefined()
    })

    expect(names.filter(name => name === '(하)상판')).toHaveLength(2)
    expect(names.filter(name => name === '(상)바닥')).toHaveLength(2)
    expect(names).not.toContain('(하)좌측')
    expect(names).not.toContain('(상)좌측')
    expect(names).not.toContain('(상)후면 보강대 1')
  })

  it('하부섹션 상판 옵셋은 실제 (하)상판 깊이에 반영한다', () => {
    const panels = calculatePanels('single-pull-out-cabinet-600', 600, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9,
      lowerSectionTopOffsetMm: 85
    })

    const lowerTopPanels = panels.filter(panel => panel.name === '(하)상판')
    expect(lowerTopPanels.length).toBeGreaterThan(0)
    lowerTopPanels.forEach(panel => {
      expect(panel.depth).toBe(489)
    })
  })

  it('주방 키큰장 팬트리장/냉장고장 백패널과 보강대는 3D 이름으로 생성된다', () => {
    const pantryPanels = calculatePanels('single-pantry-cabinet-600', 600, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })
    const fridgePanels = calculatePanels('single-fridge-cabinet-600', 600, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })
    const builtInPanels = calculatePanels('built-in-fridge-582', 582, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })
    const pantryNames = pantryPanels.map((panel) => panel.name)
    const fridgeNames = fridgePanels.map((panel) => panel.name)
    const builtInNames = builtInPanels.map((panel) => panel.name)

    ;['좌측판1', '우측판1', '좌측판2', '우측판2', '(1단)백패널', '(2단)백패널', '(1단)보강대 1', '(2단)보강대 2'].forEach((name) => {
      expect(findPanel(pantryPanels, name)).toBeDefined()
    })
    expect(pantryNames).not.toContain('(하)백패널')
    expect(pantryNames).not.toContain('(상)후면 보강대 1')

    ;['좌측판1', '우측판1', '좌측판2', '우측판2', '(1단)보강대 1', '(1단)보강대 2', '(1단)보강대 3', '(2단)백패널'].forEach((name) => {
      expect(findPanel(fridgePanels, name)).toBeDefined()
    })
    expect(fridgeNames).not.toContain('(1단)백패널')
    expect(fridgeNames).not.toContain('(하)백패널')

    ;['(하)후면보강대상', '(하)후면보강대중', '(하)후면보강대하', '(상)백패널'].forEach((name) => {
      expect(builtInNames.join('\n')).toContain(name)
    })
    expect(builtInNames).not.toContain('(하)백패널')
  })

  it('스타일러장 백패널과 보강대는 3D 옵티마이저 mesh 이름으로 생성된다', () => {
    const panels = calculatePanels('dual-2drawer-styler-1200', 1200, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })
    const names = panels.map((panel) => panel.name)

    ;[
      '좌(하)백패널',
      '좌(상)백패널',
      '우백패널',
      '(하)보강대',
      '(상)보강대',
      '우보강대'
    ].forEach((name) => {
      expect(findPanel(panels, name)).toBeDefined()
    })

    expect(names).not.toContain('(하)백패널')
    expect(names).not.toContain('(상)백패널')
    expect(names).not.toContain('(하)후면 보강대 1')
    expect(names).not.toContain('(상)후면 보강대 1')
  })

  it('바지걸이장 후면 보강대는 번호 없는 3D mesh 이름으로 생성된다', () => {
    const panels = calculatePanels('dual-4drawer-pantshanger-1200', 1200, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9
    })
    const names = panels.map((panel) => panel.name)

    ;[
      '(하)백패널',
      '(상)백패널',
      '(하)보강대',
      '(상)보강대'
    ].forEach((name) => {
      expect(findPanel(panels, name)).toBeDefined()
    })

    expect(names).not.toContain('(하)후면 보강대 1')
    expect(names).not.toContain('(상)후면 보강대 1')
  })

  it('듀얼 하부장 도어 패널은 전체 폭을 합산하지 않고 좌우 leaf 폭으로 생성된다', () => {
    const panels = calculatePanels('dual-lower-half-cabinet-1000', 1000, 650, {
      hasDoor: true
    })
    const doors = panels.filter((panel) => panel.isDoor)

    expect(doors).toHaveLength(2)
    expect(doors.map((panel) => panel.name)).toEqual(['좌측 도어', '우측 도어'])
    expect(doors.map((panel) => panel.width)).toEqual([497, 497])
    expect(doors.map((panel) => panel.isLeftHinge)).toEqual([false, true])
    expect(doors.map((panel) => panel.boringDepthPositions)).toEqual([[474.5], [22.5]])
    expect(doors.map((panel) => panel.screwDepthPositions)).toEqual([[465], [32]])
    doors.forEach((panel) => {
      expect(panel.height).toBeGreaterThan(0)
    })
  })

  it('싱글 도어 패널은 힌지 방향과 leaf 폭을 유지한다', () => {
    const panels = calculatePanels('lower-half-cabinet-500', 500, 650, {
      hasDoor: true,
      hingePosition: 'right'
    })
    const doors = panels.filter((panel) => panel.isDoor)

    expect(doors).toHaveLength(1)
    expect(doors[0].name).toBe('도어')
    expect(doors[0].width).toBe(497)
    expect(doors[0].isLeftHinge).toBe(false)
    expect(doors[0].boringDepthPositions).toEqual([22.5])
    expect(doors[0].screwDepthPositions).toEqual([32])
    expect(doors[0].height).toBeGreaterThan(0)
  })

  it('사용자 경첩 위치는 싱글 도어 패널 보링에 그대로 반영된다', () => {
    const panels = calculatePanels('lower-half-cabinet-500', 500, 650, {
      hasDoor: true,
      hingePosition: 'right',
      customHingePositionsMm: [333, 110]
    })
    const door = findPanel(panels, '도어')

    expect(door.boringPositions).toEqual([110, 333])
    expect(door.screwPositions).toEqual([87.5, 132.5, 310.5, 355.5])
    expect(door.hingeCount).toBe(2)
  })

  it('도어분절 팬트리장은 하부/상부 도어별 사용자 경첩 위치를 따로 반영한다', () => {
    const panels = calculatePanels('single-pantry-cabinet-split-600', 600, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9,
      customLowerDoorHingePositionsMm: [120, 640, 1260, 1700],
      customUpperDoorHingePositionsMm: [90, 220]
    })
    const lowerDoor = findPanel(panels, '하부 도어')
    const upperDoor = findPanel(panels, '상부 도어')

    expect(lowerDoor.boringPositions).toEqual([120, 640, 1260, 1700])
    expect(lowerDoor.hingeCount).toBe(4)
    expect(upperDoor.boringPositions).toEqual([90, 220])
    expect(upperDoor.hingeCount).toBe(2)
  })

  it('도어분절 경첩 간격은 사용자 섹션 높이를 기준으로 계산된다', () => {
    const panels = calculatePanels('single-pantry-cabinet-split-600', 600, 600, {
      hasDoor: true,
      backPanelThicknessMm: 9,
      freeHeight: 2400,
      customSections: [
        { type: 'shelf', height: 1700, heightType: 'absolute', count: 1 },
        { type: 'shelf', height: 700, heightType: 'absolute', count: 1 }
      ],
      customLowerDoorHingePositionsMm: [120, 640, 1260, 1600],
      customUpperDoorHingePositionsMm: [90, 220]
    })
    const lowerDoor = findPanel(panels, '하부 도어')
    const upperDoor = findPanel(panels, '상부 도어')

    expect(lowerDoor.height).toBe(1698)
    expect(lowerDoor.boringPositions).toEqual([120, 640, 1260, 1600])
    expect(upperDoor.height).toBe(699)
    expect(upperDoor.boringPositions).toEqual([90, 220])
  })
})
