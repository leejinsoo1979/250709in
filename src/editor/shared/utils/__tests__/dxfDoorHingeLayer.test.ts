import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import { extractFromScene, generateDxfDrawingData } from '../dxfDataRenderer'
import { sceneHolder } from '../../viewer3d/sceneHolder'

const createLine = (name = ''): THREE.Line => {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0)
  ])
  const material = new THREE.LineBasicMaterial({ color: 0xffffff })
  const line = new THREE.Line(geometry, material)
  line.name = name
  return line
}

const createSpaceInfo = (): SpaceInfo => ({
  width: 1200,
  height: 2400,
  depth: 600,
  installType: 'builtin',
  wallConfig: { left: true, right: true },
  hasFloorFinish: false
} as SpaceInfo)

describe('DXF 도어 경첩 레이어 추출', () => {
  afterEach(() => {
    sceneHolder.clear()
  })

  it('부모가 door-hinge인 무명 Line을 DOOR 레이어로 분류한다', () => {
    const scene = new THREE.Scene()
    const hingeGroup = new THREE.Group()
    hingeGroup.name = 'door-hinge'
    hingeGroup.add(createLine())
    scene.add(hingeGroup)

    const result = extractFromScene(scene, 'front')

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].layer).toBe('DOOR')
    expect(result.lines[0].color).toBe(3)
  })

  it('이름이 door-hinge인 Line을 DOOR 레이어로 분류한다', () => {
    const scene = new THREE.Scene()
    scene.add(createLine('door-hinge'))

    const result = extractFromScene(scene, 'front')

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].layer).toBe('DOOR')
    expect(result.lines[0].color).toBe(3)
  })

  it('도어 전용 DXF drawing data는 경첩을 남기고 가구 패널을 제외한다', () => {
    const scene = new THREE.Scene()
    const hingeGroup = new THREE.Group()
    hingeGroup.name = 'door-hinge'
    hingeGroup.add(createLine())
    scene.add(hingeGroup)
    scene.add(createLine('furniture-edge'))

    sceneHolder.setScene(scene)

    const result = generateDxfDrawingData(
      createSpaceInfo(),
      [],
      'front',
      'all',
      false,
      undefined,
      ['DOOR', 'DOOR_DIMENSIONS']
    )

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].layer).toBe('DOOR')
    expect(result.lines[0].color).toBe(3)
  })
})
