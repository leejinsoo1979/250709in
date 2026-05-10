import { describe, expect, it } from 'vitest'
import { getModuleById } from '@/data/modules'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import { calculatePanelDetails } from '../calculatePanelDetails'

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
  freeHeight?: number
  stoneTopThickness?: number
}

const calculatePanels = (
  id: string,
  width: number,
  depth: number,
  options: PanelDetailOptions = {}
) => {
  const moduleData = getRequiredModule(id, width, depth)

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
    options.stoneTopThickness
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

    expect(findPanel(panels, '좌측판').width).toBe(380)
    expect(findPanel(panels, '우측판').width).toBe(380)
    expect(findPanel(panels, '서랍받침대').depth).toBe(269)
    expect(findPanel(panels, '서랍속장(좌)').width).toBe(233)
    expect(findPanel(panels, '서랍1 바닥').depth).toBe(232)
  })

  it('상판내림 30T 패널 목록은 상판/앞판 기준 치수를 고정한다', () => {
    const panels = calculatePanels('lower-top-down-2tier-500', 500, 650, {
      hasDoor: true,
      doorTopGap: -80,
      doorBottomGap: 25,
      backPanelThicknessMm: 9,
      stoneTopThickness: 30
    })

    expect(findPanel(panels, '상판').depth).toBe(614)
    expect(findPanel(panels, '인조대리석 상판').depth).toBe(673)
    expect(findPanel(panels, '인조대리석 앞판').height).toBe(90)
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
    expect(doors[0].height).toBeGreaterThan(0)
  })
})
