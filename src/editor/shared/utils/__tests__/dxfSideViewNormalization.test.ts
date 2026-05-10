import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import { generateDxfDrawingData, normalizeDxfSideViewRequest } from '../dxfDataRenderer'
import { sceneHolder } from '../../viewer3d/sceneHolder'

const createSpaceInfo = (): SpaceInfo => ({
  width: 1200,
  height: 2400,
  depth: 600,
  installType: 'builtin',
  wallConfig: { left: true, right: true },
  hasFloorFinish: false
} as SpaceInfo)

const createSideProjectionScene = (): THREE.Scene => {
  const scene = new THREE.Scene()
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 1, 1)
  ])
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff }))
  line.name = 'furniture-edge'
  scene.add(line)
  return scene
}

describe('normalizeDxfSideViewRequest', () => {
  afterEach(() => {
    sceneHolder.clear()
  })

  it('우측뷰 요청은 좌측뷰로 강제한다', () => {
    expect(normalizeDxfSideViewRequest('right', 'all')).toEqual({
      viewDirection: 'left',
      sideViewFilter: 'all',
      forcedLeftView: true,
      forcedLeftFilter: false
    })
  })

  it('우측 측면 필터 요청은 좌측 필터로 강제한다', () => {
    expect(normalizeDxfSideViewRequest('left', 'rightmost')).toEqual({
      viewDirection: 'left',
      sideViewFilter: 'leftmost',
      forcedLeftView: false,
      forcedLeftFilter: true
    })
  })

  it('우측뷰와 우측 필터가 같이 들어와도 좌측뷰/좌측필터만 남긴다', () => {
    expect(normalizeDxfSideViewRequest('right', 'rightmost')).toEqual({
      viewDirection: 'left',
      sideViewFilter: 'leftmost',
      forcedLeftView: true,
      forcedLeftFilter: true
    })
  })

  it('정면/평면/도어 뷰는 viewDirection을 바꾸지 않는다', () => {
    expect(normalizeDxfSideViewRequest('front', 'all').viewDirection).toBe('front')
    expect(normalizeDxfSideViewRequest('top', 'all').viewDirection).toBe('top')
    expect(normalizeDxfSideViewRequest('door', 'all').viewDirection).toBe('door')
  })

  it('DXF drawing data 직접 호출도 우측뷰/우측필터를 좌측뷰 좌표로 강제한다', () => {
    sceneHolder.setScene(createSideProjectionScene())

    const result = generateDxfDrawingData(createSpaceInfo(), [], 'right', 'rightmost')

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].x1).toBe(200)
    expect(result.lines[0].x2).toBe(400)
  })
})
