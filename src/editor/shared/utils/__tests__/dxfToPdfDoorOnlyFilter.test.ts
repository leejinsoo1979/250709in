import { describe, expect, it } from 'vitest'
import { filterDoorOnlyDrawingData, isDoorDrawingLayer } from '../dxfToPdf'

describe('PDF door-only layer filter', () => {
  it('도어 도면에는 실제 도어 형상과 도어 치수 레이어만 남긴다', () => {
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
      { layer: 'HINGE_MATCH_DIMENSIONS', text: '120' },
      { layer: 'DRAWER', text: 'drawer-label' },
      { layer: 'FURNITURE_PANEL', text: 'body-label' }
    ]

    const result = filterDoorOnlyDrawingData(lines, texts)

    expect(result.lines.map(line => line.id)).toEqual(['hinge', 'door-width'])
    expect(result.texts.map(text => text.text)).toEqual(['2360', 'hinge-label'])
  })

  it('도어 도면 레이어 판정은 실제 도어 형상과 도어 치수만 true이다', () => {
    expect(isDoorDrawingLayer('DOOR')).toBe(true)
    expect(isDoorDrawingLayer('DOOR_DIMENSIONS')).toBe(true)
    expect(isDoorDrawingLayer('HINGE_MATCH_DOOR')).toBe(false)
    expect(isDoorDrawingLayer('HINGE_MATCH_DIMENSIONS')).toBe(false)
    expect(isDoorDrawingLayer('DRAWER')).toBe(false)
    expect(isDoorDrawingLayer('FURNITURE_PANEL')).toBe(false)
  })
})
