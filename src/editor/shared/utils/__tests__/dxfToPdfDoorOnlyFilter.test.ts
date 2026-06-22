import { describe, expect, it } from 'vitest'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import type { PlacedModule } from '@/editor/shared/furniture/types'
import { buildPdfHingeCoordinateDrawingData, filterDoorOnlyDrawingData, isDoorDrawingLayer } from '../dxfToPdf'

describe('PDF door-only layer filter', () => {
  it('도어 도면에는 도어 형상과 힌지 좌표 레이어만 남긴다', () => {
    const lines = [
      { layer: 'DOOR', id: 'hinge' },
      { layer: 'DOOR_DIMENSIONS', id: 'door-width' },
      { layer: 'HINGE_MATCH_DOOR', id: 'door-hinge-coordinate' },
      { layer: 'HINGE_MATCH_DIMENSIONS', id: 'hinge-coordinate-dim' },
      { layer: 'FURNITURE_PANEL', id: 'body' },
      { layer: 'DRAWER', id: 'drawer-front' },
      { layer: 'DIMENSIONS', id: 'general-dim' }
    ]
    const texts = [
      { layer: 'DOOR_DIMENSIONS', text: '2360' },
      { layer: 'DOOR', text: 'hinge-label' },
      { layer: 'HINGE_MATCH_DIMENSIONS', text: 'H1 120' },
      { layer: 'DRAWER', text: 'drawer-label' },
      { layer: 'FURNITURE_PANEL', text: 'body-label' }
    ]

    const result = filterDoorOnlyDrawingData(lines, texts)

    expect(result.lines.map(line => line.id)).toEqual(['hinge', 'door-width', 'door-hinge-coordinate', 'hinge-coordinate-dim'])
    expect(result.texts.map(text => text.text)).toEqual(['2360', 'hinge-label', 'H1 120'])
  })

  it('도어 도면 레이어 판정은 도어 형상과 힌지 좌표 레이어만 true이다', () => {
    expect(isDoorDrawingLayer('DOOR')).toBe(true)
    expect(isDoorDrawingLayer('DOOR_DIMENSIONS')).toBe(true)
    expect(isDoorDrawingLayer('HINGE_MATCH_DOOR')).toBe(true)
    expect(isDoorDrawingLayer('HINGE_MATCH_DIMENSIONS')).toBe(true)
    expect(isDoorDrawingLayer('DRAWER')).toBe(false)
    expect(isDoorDrawingLayer('FURNITURE_PANEL')).toBe(false)
  })

  it('도어와 몸통 힌지 좌표 오버레이를 생성한다', () => {
    const spaceInfo = {
      width: 1200,
      height: 2400,
      depth: 600,
      installType: 'builtin',
      wallConfig: { left: true, right: true },
      hasFloorFinish: false,
      panelThickness: 18
    } as SpaceInfo
    const placedModules: PlacedModule[] = [
      {
        id: 'module-1',
        moduleId: 'single-entryway-h-600',
        position: { x: 1.2, y: 0, z: 0 },
        rotation: 0,
        hasDoor: true,
        hingePosition: 'left'
      }
    ]

    const door = buildPdfHingeCoordinateDrawingData(spaceInfo, placedModules, 'door')
    const body = buildPdfHingeCoordinateDrawingData(spaceInfo, placedModules, 'body-side')

    expect(door.lines.some(line => line.layer === 'HINGE_MATCH_DOOR')).toBe(true)
    expect(door.texts.some(text => text.text === 'CUP D35')).toBe(true)
    expect(door.texts.some(text => /^H1\s+\d/.test(text.text))).toBe(true)
    expect(body.lines.some(line => line.layer === 'HINGE_MATCH_BODY')).toBe(true)
    expect(body.texts.some(text => /^H1\s+\d/.test(text.text))).toBe(true)
    expect(body.texts.some(text => text.text === 'F20')).toBe(true)
  })
})
