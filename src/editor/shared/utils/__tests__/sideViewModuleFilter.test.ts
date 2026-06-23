import { describe, expect, it } from 'vitest'
import type { PlacedModule } from '@/editor/shared/furniture/types'
import {
  filterSideViewModules,
  getSideViewFreePlacementSlotGroups,
  getSideViewGuideSlotGroups,
  getSideViewSlotGroups
} from '../sideViewModuleFilter'

const createModule = (
  id: string,
  x: number,
  slotIndex?: number,
  overrides: Partial<PlacedModule> = {}
): PlacedModule => ({
  id,
  moduleId: 'single-entryway-h-500',
  position: { x, y: 0, z: 0 },
  rotation: 0,
  slotIndex,
  ...overrides
})

describe('filterSideViewModules', () => {
  it('선택 슬롯이 없으면 좌측뷰는 가장 왼쪽 X 그룹만 사용한다', () => {
    const modules = [
      createModule('left-lower', -2, 0),
      createModule('left-upper', -2, 0),
      createModule('right', 2, 1)
    ]

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left'
    }).map(module => module.id)).toEqual(['left-lower', 'left-upper'])
  })

  it('선택 슬롯이 있으면 해당 슬롯 가구만 측면뷰에 남긴다', () => {
    const modules = [
      createModule('slot-0', -2, 0),
      createModule('slot-1', 0, 1),
      createModule('slot-2', 2, 2)
    ]

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left',
      selectedSlotIndex: 1
    }).map(module => module.id)).toEqual(['slot-1'])
  })

  it('듀얼 슬롯 가구는 시작 슬롯과 다음 슬롯 측면뷰에 모두 포함한다', () => {
    const dual = createModule('dual', 0, 1, { isDualSlot: true })

    expect(filterSideViewModules({
      placedModules: [dual],
      viewDirection: 'left',
      selectedSlotIndex: 1
    })).toEqual([dual])
    expect(filterSideViewModules({
      placedModules: [dual],
      viewDirection: 'left',
      selectedSlotIndex: 2
    })).toEqual([dual])
  })

  it('같은 선택 슬롯의 상부 싱글과 하부 듀얼은 X 중심이 달라도 함께 표시한다', () => {
    const upper = createModule('slot-0-upper', -1, 0, {
      moduleId: 'upper-cabinet-single',
    })
    const lowerDual = createModule('slot-0-1-lower', 0, 0, {
      moduleId: 'dual-lower-cabinet',
      isDualSlot: true,
    })

    expect(filterSideViewModules({
      placedModules: [upper, lowerDual],
      viewDirection: 'left',
      selectedSlotIndex: 0
    }).map(module => module.id)).toEqual(['slot-0-upper', 'slot-0-1-lower'])
  })

  it('자유배치는 X 위치 그룹을 가상 슬롯으로 사용한다', () => {
    const modules = [
      createModule('left', -2),
      createModule('middle-lower', 0),
      createModule('middle-upper', 0),
      createModule('right', 2)
    ]

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left',
      selectedSlotIndex: 1,
      isFreePlacement: true
    }).map(module => module.id)).toEqual(['middle-lower', 'middle-upper'])
  })

  it('커스텀 상하분할 가이드는 커스텀슬롯 측면도처럼 겹치는 상부/하부를 함께 표시한다', () => {
    const guides = [
      { id: 'upper-1', index: 0, x: 0, width: 600, guideZone: 'upper' as const },
      { id: 'upper-2', index: 1, x: 600, width: 600, guideZone: 'upper' as const },
      { id: 'lower-1', index: 0, x: 0, width: 400, guideZone: 'lower' as const },
      { id: 'lower-2', index: 1, x: 400, width: 400, guideZone: 'lower' as const },
      { id: 'lower-3', index: 2, x: 800, width: 400, guideZone: 'lower' as const }
    ]
    const groups = getSideViewGuideSlotGroups(guides)

    expect(groups.map(group => group.label)).toEqual(['상1', '하1', '하2', '상2', '하3'])
    expect(groups.map(group => group.selectedSlotIndex)).toEqual([0, 1, 2, 3, 4])

    const modules = [
      createModule('upper-1-module', -3, undefined, {
        moduleId: 'upper-cabinet-600',
        isFreePlacement: true,
        guideSlotPlacement: true,
        guideSlotZone: 'upper'
      }),
      createModule('lower-1-module', -4, undefined, {
        moduleId: 'lower-cabinet-400',
        isFreePlacement: true,
        guideSlotPlacement: true,
        guideSlotZone: 'lower'
      }),
      createModule('lower-2-module', 0, undefined, {
        moduleId: 'lower-cabinet-400',
        isFreePlacement: true,
        guideSlotPlacement: true,
        guideSlotZone: 'lower'
      }),
      createModule('upper-2-module', 3, undefined, {
        moduleId: 'upper-cabinet-600',
        isFreePlacement: true,
        guideSlotPlacement: true,
        guideSlotZone: 'upper'
      }),
      createModule('lower-3-module', 4, undefined, {
        moduleId: 'lower-cabinet-400',
        isFreePlacement: true,
        guideSlotPlacement: true,
        guideSlotZone: 'lower'
      })
    ]

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left',
      selectedSlotIndex: 0,
      isFreePlacement: true,
      spaceInfo: { width: 1200, freePlacementGuides: guides }
    }).map(module => module.id)).toEqual(['upper-1-module', 'lower-1-module'])

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left',
      selectedSlotIndex: 1,
      isFreePlacement: true,
      spaceInfo: { width: 1200, freePlacementGuides: guides }
    }).map(module => module.id)).toEqual(['upper-1-module', 'lower-1-module'])

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left',
      selectedSlotIndex: 2,
      isFreePlacement: true,
      spaceInfo: { width: 1200, freePlacementGuides: guides }
    }).map(module => module.id)).toEqual(['upper-1-module', 'lower-2-module'])

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left',
      selectedSlotIndex: 3,
      isFreePlacement: true,
      spaceInfo: { width: 1200, freePlacementGuides: guides }
    }).map(module => module.id)).toEqual(['upper-2-module', 'lower-3-module'])
  })

  it('자유배치도 커스텀슬롯처럼 가구 폭 기준 상부/하부 슬롯 번호를 만든다', () => {
    const modules = [
      createModule('upper-1-module', -3, undefined, {
        moduleId: 'upper-cabinet-600',
        isFreePlacement: true,
        freePlacementCategory: 'upper',
        freeWidth: 600
      }),
      createModule('lower-1-module', -4, undefined, {
        moduleId: 'lower-cabinet-400',
        isFreePlacement: true,
        freePlacementCategory: 'lower',
        freeWidth: 400
      }),
      createModule('lower-2-module', 0, undefined, {
        moduleId: 'lower-cabinet-400',
        isFreePlacement: true,
        freePlacementCategory: 'lower',
        freeWidth: 400
      }),
      createModule('upper-2-module', 3, undefined, {
        moduleId: 'upper-cabinet-600',
        isFreePlacement: true,
        freePlacementCategory: 'upper',
        freeWidth: 600
      }),
      createModule('lower-3-module', 4, undefined, {
        moduleId: 'lower-cabinet-400',
        isFreePlacement: true,
        freePlacementCategory: 'lower',
        freeWidth: 400
      })
    ]
    const groups = getSideViewFreePlacementSlotGroups(modules, 1200)

    expect(groups.map(group => group.label)).toEqual(['상1', '하1', '하2', '상2', '하3'])

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left',
      selectedSlotIndex: 0,
      isFreePlacement: true,
      spaceInfo: { width: 1200 }
    }).map(module => module.id)).toEqual(['upper-1-module', 'lower-1-module'])

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left',
      selectedSlotIndex: 2,
      isFreePlacement: true,
      spaceInfo: { width: 1200 }
    }).map(module => module.id)).toEqual(['upper-1-module', 'lower-2-module'])

    expect(filterSideViewModules({
      placedModules: modules,
      viewDirection: 'left',
      selectedSlotIndex: 3,
      isFreePlacement: true,
      spaceInfo: { width: 1200 }
    }).map(module => module.id)).toEqual(['upper-2-module', 'lower-3-module'])
  })

  it('측면도 슬롯 그룹은 듀얼 가구를 점유한 두 슬롯에 모두 포함한다', () => {
    const modules = [
      createModule('slot-0', -2, 0),
      createModule('dual-1-2', 0, 1, { isDualSlot: true }),
      createModule('slot-3', 2, 3)
    ]

    expect(getSideViewSlotGroups(modules).map(group => ({
      titleIndex: group.titleIndex,
      selectedSlotIndex: group.selectedSlotIndex,
      moduleIds: group.modules.map(module => module.id)
    }))).toEqual([
      { titleIndex: 1, selectedSlotIndex: 0, moduleIds: ['slot-0'] },
      { titleIndex: 2, selectedSlotIndex: 1, moduleIds: ['dual-1-2'] },
      { titleIndex: 3, selectedSlotIndex: 2, moduleIds: ['dual-1-2'] },
      { titleIndex: 4, selectedSlotIndex: 3, moduleIds: ['slot-3'] }
    ])
  })

  it('단내림 가구는 일반 슬롯 뒤의 전역 슬롯 번호를 selectedSlotIndex로 사용한다', () => {
    const modules = [
      createModule('normal-0', -2, 0, { zone: 'normal' }),
      createModule('dropped-0', 2, 0, { zone: 'dropped' })
    ]

    expect(getSideViewSlotGroups(modules, {
      spaceInfo: {
        customColumnCount: 3,
        droppedCeiling: { enabled: true, columnCount: 2, position: 'right' } as any
      }
    }).map(group => ({
      titleIndex: group.titleIndex,
      selectedSlotIndex: group.selectedSlotIndex,
      moduleIds: group.modules.map(module => module.id)
    }))).toEqual([
      { titleIndex: 1, selectedSlotIndex: 0, moduleIds: ['normal-0'] },
      { titleIndex: 4, selectedSlotIndex: 3, moduleIds: ['dropped-0'] }
    ])
  })
})
