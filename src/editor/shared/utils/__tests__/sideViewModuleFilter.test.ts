import { describe, expect, it } from 'vitest'
import type { PlacedModule } from '@/editor/shared/furniture/types'
import { filterSideViewModules, getSideViewSlotGroups } from '../sideViewModuleFilter'

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
})
