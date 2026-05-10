import { describe, expect, it } from 'vitest'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import { buildCombinedDxfFromDrawingData, type DxfDrawingData } from '../dxfDataRenderer'

const createSpaceInfo = (): SpaceInfo => ({
  width: 1200,
  height: 2400,
  depth: 600,
  installType: 'builtin',
  wallConfig: { left: true, right: true },
  hasFloorFinish: false
} as SpaceInfo)

const createEmptyDrawing = (): DxfDrawingData => ({
  lines: [],
  texts: [],
  minX: 0,
  maxX: 0,
  minY: 0,
  maxY: 0,
  width: 0,
  height: 0
})

const createLineDrawing = (): DxfDrawingData => ({
  lines: [{
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 0,
    layer: 'FURNITURE_PANEL',
    color: 30
  }],
  texts: [],
  minX: 0,
  maxX: 100,
  minY: 0,
  maxY: 0,
  width: 100,
  height: 0
})

describe('combined DXF layout', () => {
  it('빈 측면/우측 도면 제목을 통합 DXF에 넣지 않는다', () => {
    const dxf = buildCombinedDxfFromDrawingData(createSpaceInfo(), [
      { title: '입면도', data: createLineDrawing() },
      { title: '측면도 1', data: createLineDrawing() },
      { title: '측면도 2', data: createEmptyDrawing() },
      { title: 'RIGHT_SIDE_SHOULD_NOT_APPEAR', data: createEmptyDrawing() }
    ])

    expect(dxf).toContain('입면도')
    expect(dxf).toContain('측면도 1')
    expect(dxf).not.toContain('측면도 2')
    expect(dxf).not.toContain('RIGHT_SIDE_SHOULD_NOT_APPEAR')
  })

  it('모든 도면이 비어 있으면 명시적인 빈 데이터 DXF를 만든다', () => {
    const dxf = buildCombinedDxfFromDrawingData(createSpaceInfo(), [
      { title: '측면도 1', data: createEmptyDrawing() }
    ])

    expect(dxf).toContain('NO DRAWING DATA')
    expect(dxf).not.toContain('측면도 1')
  })
})
