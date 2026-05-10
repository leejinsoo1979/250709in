import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import { generateDXFFilenameFromScene, generateDXFFromScene } from '../dxfFromScene'
import { sceneHolder } from '../../viewer3d/sceneHolder'

const createSpaceInfo = (): SpaceInfo => ({
  width: 1200,
  height: 2400,
  depth: 600,
  installType: 'builtin',
  wallConfig: { left: true, right: true },
  hasFloorFinish: false
} as SpaceInfo)

const parseFirstLineX = (dxf: string): { x1: number; x2: number } => {
  const match = dxf.match(/\nLINE\n([\s\S]*?\n\s*10\n\s*([-\d.]+)[\s\S]*?\n\s*11\n\s*([-\d.]+))/)
  expect(match).not.toBeNull()
  return { x1: Number(match?.[2]), x2: Number(match?.[3]) }
}

describe('DXF side export policy', () => {
  afterEach(() => {
    sceneHolder.clear()
  })

  it('legacy side export uses left-side projection, not right-side projection', () => {
    const scene = new THREE.Scene()
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 1)
    ])
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff }))
    line.name = 'furniture-edge'
    scene.add(line)
    sceneHolder.setScene(scene)

    const dxf = generateDXFFromScene(createSpaceInfo(), 'side', []) ?? ''
    const { x1, x2 } = parseFirstLineX(dxf)

    expect(x1).toBe(200)
    expect(x2).toBe(400)
  })

  it('side and sideLeft filenames do not create side-right names', () => {
    const spaceInfo = createSpaceInfo()

    expect(generateDXFFilenameFromScene(spaceInfo, 'side')).toContain('furniture-side-')
    expect(generateDXFFilenameFromScene(spaceInfo, 'sideLeft')).toContain('furniture-side-')
    expect(generateDXFFilenameFromScene(spaceInfo, 'side')).not.toContain('right')
    expect(generateDXFFilenameFromScene(spaceInfo, 'sideLeft')).not.toContain('right')
  })
})
