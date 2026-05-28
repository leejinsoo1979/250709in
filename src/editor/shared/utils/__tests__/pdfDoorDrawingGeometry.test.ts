import { describe, expect, it } from 'vitest'
import { resolveDoorDrawingOuterBounds, resolvePdfDoorDrawingItem } from '../pdfDoorDrawingGeometry'

const basePlacedModule = {
  moduleId: 'single-entryway-h-600',
  position: { x: 1.2, y: 0, z: 0 },
  hasDoor: true
}

const baseModuleData = {
  id: 'single-entryway-h-600',
  name: 'Entryway H',
  category: 'full',
  hasDoor: true,
  dimensions: {
    width: 600,
    height: 2000
  },
  modelConfig: {
    basicThickness: 18,
    sections: []
  }
}

describe('pdfDoorDrawingGeometry', () => {
  it('PDF 도어 도면은 도어 폭/높이를 공통 도어 계산기 기준으로 추출한다', () => {
    const item = resolvePdfDoorDrawingItem(basePlacedModule, baseModuleData)

    expect(item?.furnitureX).toBe(120)
    expect(item?.items).toHaveLength(1)
    expect(item?.items[0]).toMatchObject({
      type: 'door',
      x: 18,
      y: 65,
      width: 561,
      height: 1925,
      hingeSide: 'left'
    })
  })

  it('듀얼 도어는 전체 합산 폭이 아니라 좌우 leaf 폭으로 분리한다', () => {
    const item = resolvePdfDoorDrawingItem(
      {
        ...basePlacedModule,
        moduleId: 'dual-entryway-h-1000',
        isDualSlot: true,
        moduleWidth: 1000
      },
      {
        ...baseModuleData,
        id: 'dual-entryway-h-1000',
        dimensions: {
          width: 1000,
          height: 2000
        }
      }
    )

    expect(item?.items).toHaveLength(2)
    expect(item?.items.map(door => door.width)).toEqual([479, 479])
    expect(item?.items.map(door => door.hingeSide)).toEqual(['left', 'right'])
    expect(item?.items[0].x).toBe(18)
    expect(item?.items[1].x).toBe(503)
  })

  it('자유배치 폭/높이를 모듈 기본 치수보다 우선한다', () => {
    const item = resolvePdfDoorDrawingItem(
      {
        ...basePlacedModule,
        freeWidth: 720,
        freeHeight: 2100
      },
      baseModuleData
    )

    expect(item?.furnitureWidth).toBe(720)
    expect(item?.furnitureHeight).toBe(2100)
    expect(item?.items[0].width).toBe(681)
    expect(item?.items[0].height).toBe(2025)
  })

  it('외곽 높이 치수용 bounds는 개별 도어가 아니라 전체 도어 도면 범위를 반환한다', () => {
    const item = resolvePdfDoorDrawingItem(
      {
        ...basePlacedModule,
        moduleId: 'dual-entryway-h-1000',
        isDualSlot: true,
        moduleWidth: 1000
      },
      {
        ...baseModuleData,
        id: 'dual-entryway-h-1000',
        dimensions: {
          width: 1000,
          height: 2000
        }
      }
    )
    const bounds = resolveDoorDrawingOuterBounds(item ? [item] : [])

    expect(bounds).toMatchObject({
      minX: 138,
      maxX: 1102,
      minY: 65,
      maxY: 1990,
      width: 964,
      height: 1925
    })
  })
})
