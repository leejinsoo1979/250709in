import * as THREE from 'three';

/**
 * Collada (DAE) 내보내기 유틸리티
 * SketchUp과 호환되는 DAE 파일 생성
 */
export class ColladaExporter {
  private geometryId = 0;
  private materialId = 0;
  private nodeId = 0;

  /**
   * Three.js 객체를 Collada XML 문자열로 변환
   */
  parse(object: THREE.Object3D): string {
    this.geometryId = 0;
    this.materialId = 0;
    this.nodeId = 0;

    const geometries: string[] = [];
    const materials: string[] = [];
    const materialEffects: string[] = [];
    const nodes: string[] = [];
    const materialMap = new Map<string, string>();

    console.log('🔧 ColladaExporter.parse 시작');
    console.log('📦 입력 객체:', object.name, object.type);

    // 먼저 전체 월드 매트릭스 업데이트
    object.updateMatrixWorld(true);

    let meshCount = 0;

    // 메쉬 수집
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        const mesh = child as THREE.Mesh;
        const geometry = mesh.geometry;

        console.log(`  🔍 메쉬 발견: ${mesh.name || '(unnamed)'}, geometry:`, geometry ? 'exists' : 'null');

        if (!geometry) return;

        const worldMatrix = mesh.matrixWorld.clone();

        // 지오메트리 처리
        const geoId = `geometry_${this.geometryId++}`;
        const geoXml = this.processGeometry(geometry, geoId, worldMatrix);
        if (geoXml) {
          geometries.push(geoXml);

          // 재질 처리
          let matId = 'default_material';
          if (mesh.material) {
            const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            const matKey = this.getMaterialKey(mat);

            if (!materialMap.has(matKey)) {
              matId = `material_${this.materialId++}`;
              materialMap.set(matKey, matId);
              const { material, effect } = this.processMaterial(mat, matId);
              materials.push(material);
              materialEffects.push(effect);
            } else {
              matId = materialMap.get(matKey)!;
            }
          }

          // 노드 생성
          const nodeXml = this.createNode(geoId, matId);
          nodes.push(nodeXml);
        }
      }
    });

    console.log(`📊 메쉬 총 개수: ${meshCount}, 처리된 지오메트리: ${geometries.length}`);

    // 기본 재질 추가
    if (!materialMap.has('default')) {
      const { material, effect } = this.processMaterial(null, 'default_material');
      materials.push(material);
      materialEffects.push(effect);
    }

    if (geometries.length === 0) {
      console.warn('⚠️ 내보낼 지오메트리가 없습니다!');
    }

    return this.buildDocument(geometries, materials, materialEffects, nodes);
  }

  /**
   * 지오메트리를 Collada XML로 변환
   */
  private processGeometry(
    geometry: THREE.BufferGeometry,
    id: string,
    worldMatrix: THREE.Matrix4
  ): string | null {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex();

    if (!position) return null;

    // 버텍스 데이터 추출 및 월드 변환 적용
    const vertices: number[] = [];
    const normals: number[] = [];
    const tempVec = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    for (let i = 0; i < position.count; i++) {
      tempVec.set(
        position.getX(i),
        position.getY(i),
        position.getZ(i)
      );
      tempVec.applyMatrix4(worldMatrix);
      vertices.push(tempVec.x, tempVec.y, tempVec.z);

      if (normal) {
        tempVec.set(
          normal.getX(i),
          normal.getY(i),
          normal.getZ(i)
        );
        tempVec.applyMatrix3(normalMatrix).normalize();
        normals.push(tempVec.x, tempVec.y, tempVec.z);
      }
    }

    // 인덱스 데이터
    const indices: number[] = [];
    if (index) {
      for (let i = 0; i < index.count; i++) {
        indices.push(index.getX(i));
      }
    } else {
      for (let i = 0; i < position.count; i++) {
        indices.push(i);
      }
    }

    const hasNormals = normals.length > 0;

    return `
      <geometry id="${id}" name="${id}">
        <mesh>
          <source id="${id}-positions">
            <float_array id="${id}-positions-array" count="${vertices.length}">${vertices.join(' ')}</float_array>
            <technique_common>
              <accessor source="#${id}-positions-array" count="${vertices.length / 3}" stride="3">
                <param name="X" type="float"/>
                <param name="Y" type="float"/>
                <param name="Z" type="float"/>
              </accessor>
            </technique_common>
          </source>
          ${hasNormals ? `
          <source id="${id}-normals">
            <float_array id="${id}-normals-array" count="${normals.length}">${normals.join(' ')}</float_array>
            <technique_common>
              <accessor source="#${id}-normals-array" count="${normals.length / 3}" stride="3">
                <param name="X" type="float"/>
                <param name="Y" type="float"/>
                <param name="Z" type="float"/>
              </accessor>
            </technique_common>
          </source>
          ` : ''}
          <vertices id="${id}-vertices">
            <input semantic="POSITION" source="#${id}-positions"/>
          </vertices>
          <triangles count="${indices.length / 3}">
            <input semantic="VERTEX" source="#${id}-vertices" offset="0"/>
            ${hasNormals ? `<input semantic="NORMAL" source="#${id}-normals" offset="0"/>` : ''}
            <p>${indices.join(' ')}</p>
          </triangles>
        </mesh>
      </geometry>`;
  }

  /**
   * 재질 키 생성
   */
  private getMaterialKey(material: THREE.Material): string {
    if (material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshBasicMaterial ||
        material instanceof THREE.MeshPhongMaterial) {
      const color = (material as any).color;
      if (color) {
        return `${color.r.toFixed(3)}_${color.g.toFixed(3)}_${color.b.toFixed(3)}`;
      }
    }
    return 'default';
  }

  /**
   * 재질을 Collada XML로 변환
   */
  private processMaterial(material: THREE.Material | null, id: string): { material: string; effect: string } {
    let color = { r: 0.8, g: 0.8, b: 0.8 };

    if (material) {
      if (material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshBasicMaterial ||
          material instanceof THREE.MeshPhongMaterial) {
        const matColor = (material as any).color;
        if (matColor) {
          color = { r: matColor.r, g: matColor.g, b: matColor.b };
        }
      }
    }

    const materialXml = `
      <material id="${id}" name="${id}">
        <instance_effect url="#${id}-effect"/>
      </material>`;

    const effectXml = `
      <effect id="${id}-effect">
        <profile_COMMON>
          <technique sid="common">
            <phong>
              <diffuse>
                <color>${color.r} ${color.g} ${color.b} 1</color>
              </diffuse>
              <specular>
                <color>0.2 0.2 0.2 1</color>
              </specular>
              <shininess>
                <float>20</float>
              </shininess>
            </phong>
          </technique>
        </profile_COMMON>
      </effect>`;

    return { material: materialXml, effect: effectXml };
  }

  /**
   * 노드 생성
   */
  private createNode(geometryId: string, materialId: string): string {
    const nodeId = `node_${this.nodeId++}`;
    return `
      <node id="${nodeId}" name="${nodeId}" type="NODE">
        <instance_geometry url="#${geometryId}">
          <bind_material>
            <technique_common>
              <instance_material symbol="material0" target="#${materialId}"/>
            </technique_common>
          </bind_material>
        </instance_geometry>
      </node>`;
  }

  /**
   * Collada 문서 빌드
   */
  private buildDocument(
    geometries: string[],
    materials: string[],
    effects: string[],
    nodes: string[]
  ): string {
    const now = new Date().toISOString();

    return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <created>${now}</created>
    <modified>${now}</modified>
    <unit name="meter" meter="1"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_effects>
    ${effects.join('\n')}
  </library_effects>
  <library_materials>
    ${materials.join('\n')}
  </library_materials>
  <library_geometries>
    ${geometries.join('\n')}
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      ${nodes.join('\n')}
    </visual_scene>
  </library_visual_scenes>
  <scene>
    <instance_visual_scene url="#Scene"/>
  </scene>
</COLLADA>`;
  }
}
