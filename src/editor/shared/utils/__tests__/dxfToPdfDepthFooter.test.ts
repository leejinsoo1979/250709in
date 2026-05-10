import { describe, expect, it } from 'vitest'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import type { PlacedModule } from '@/editor/shared/furniture/types'
import {
  filterVisiblePdfDrawingItems,
  hasPdfDrawingData,
  resolveMaxPlacedModuleExportDepth,
  resolvePlacedModuleExportDepth
} from '../dxfToPdf'

const createSpaceInfo = (depth = 600): SpaceInfo => ({
  width: 1200,
  height: 2400,
  depth,
  installType: 'builtin',
  wallConfig: { left: true, right: true },
  hasFloorFinish: false
} as SpaceInfo)

const createModule = (overrides: Partial<PlacedModule> = {}): PlacedModule => ({
  id: 'module-1',
  moduleId: 'lower-cabinet-basic-500',
  position: { x: 0, y: 0, z: 0 },
  rotation: 0,
  ...overrides
})

describe('PDF export depth footer', () => {
  it('PDF export는 선/텍스트가 없는 도면 데이터를 빈 페이지로 보지 않는다', () => {
    expect(hasPdfDrawingData([], [])).toBe(false)
    expect(hasPdfDrawingData([{ layer: 'FURNITURE_PANEL' }], [])).toBe(true)
    expect(hasPdfDrawingData([], [{ layer: 'DIMENSIONS', text: '380' }])).toBe(true)
  })

  it('한 장 PDF 장표는 빈 슬롯별 측면도 데이터를 제외한다', () => {
    const visibleItems = filterVisiblePdfDrawingItems([
      { slotTitle: 1, lines: [], texts: [] },
      { slotTitle: 2, lines: [{ layer: 'FURNITURE_PANEL' }], texts: [] },
      { slotTitle: 3, lines: [], texts: [{ layer: 'DIMENSIONS', text: '380' }] }
    ])

    expect(visibleItems.map(item => item.slotTitle)).toEqual([2, 3])
  })

  it('현관장 H의 legacy 400mm 깊이 값은 PDF export 표기에서 380mm로 보정한다', () => {
    const module = createModule({
      moduleId: 'single-entryway-h-500',
      customDepth: 400
    })

    expect(resolvePlacedModuleExportDepth(createSpaceInfo(), module)).toBe(380)
  })

  it('하부/자유배치/섹션 깊이를 포함해 실제 최대 깊이를 표기한다', () => {
    const module = createModule({
      customDepth: 360,
      lowerSectionDepth: 420,
      freeDepth: 390,
      sectionDepths: [350, 450]
    })

    expect(resolvePlacedModuleExportDepth(createSpaceInfo(), module)).toBe(450)
  })

  it('여러 모듈이 있을 때 PDF 하단 표기 깊이는 export 기준 최대 깊이다', () => {
    const modules = [
      createModule({ id: 'entryway', moduleId: 'single-entryway-h-500', customDepth: 400 }),
      createModule({ id: 'lower', moduleId: 'lower-cabinet-basic-500', lowerSectionDepth: 580 })
    ]

    expect(resolveMaxPlacedModuleExportDepth(createSpaceInfo(), modules)).toBe(580)
  })

  it('명시 깊이가 없으면 상부장은 300mm, 신발장은 380mm 기본 깊이를 쓴다', () => {
    expect(resolvePlacedModuleExportDepth(
      createSpaceInfo(),
      createModule({ moduleId: 'upper-cabinet-shelf-500' })
    )).toBe(300)
    expect(resolvePlacedModuleExportDepth(
      createSpaceInfo(),
      createModule({ moduleId: 'single-entryway-h-500' })
    )).toBe(380)
  })
})
