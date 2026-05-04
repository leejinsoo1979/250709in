import * as THREE from 'three';

/**
 * Collada (DAE) 내보내기 유틸리티
 * SketchUp과 호환되는 DAE 파일 생성
 */
export class ColladaExporter {
  private geometryId = 0;
  private materialId = 0;
  private nodeId = 0;

  // Y-up → Z-up 변환 매트릭스 (X축 기준 +90도 회전)
  // Three.js Y-up: (0,1,0)이 위 → SketchUp Z-up: (0,0,1)이 위
  private yUpToZUpMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);

  // 프로젝트 단위: 1 three unit = 100 mm (MM_TO_THREE_UNITS = 0.01)
  // DAE는 mm로 출력하고 <unit name="millimeter" meter="0.001"/> 로 명시
  private static readonly THREE_UNIT_TO_MM = 100;

  /**
   * Three.js 객체를 Collada XML 문자열로 변환
   * 같은 패널 이름끼리 부모 그룹 노드로 묶어서 SketchUp에서 패널별 그룹/태그로 임포트되게 한다.
   */
  parse(object: THREE.Object3D): string {
    this.geometryId = 0;
    this.materialId = 0;
    this.nodeId = 0;

    const geometries: string[] = [];
    const materials: string[] = [];
    const materialEffects: string[] = [];
    const materialMap = new Map<string, string>();

    // 패널 이름별로 자식 노드 모음 (같은 이름 = 같은 그룹)
    const panelGroups = new Map<string, string[]>();
    const unnamedNodes: string[] = [];

    console.log('🔧 ColladaExporter.parse 시작');
    console.log('📦 입력 객체:', object.name, object.type);

    object.updateMatrixWorld(true);

    let meshCount = 0;

    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        const mesh = child as THREE.Mesh;
        const geometry = mesh.geometry;

        if (!geometry) return;

        const worldMatrix = new THREE.Matrix4();
        worldMatrix.multiplyMatrices(this.yUpToZUpMatrix, mesh.matrixWorld);

        const geoId = `geometry_${this.geometryId++}`;
        const geoXml = this.processGeometry(geometry, geoId, worldMatrix);
        if (!geoXml) return;
        geometries.push(geoXml);

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

        const panelName = this.resolveLayerName(mesh);
        const childNodeXml = this.createInstanceNode(geoId, matId, panelName);

        if (panelName) {
          let arr = panelGroups.get(panelName);
          if (!arr) {
            arr = [];
            panelGroups.set(panelName, arr);
          }
          arr.push(childNodeXml);
        } else {
          unnamedNodes.push(childNodeXml);
        }
      }
    });

    console.log(`📊 메쉬 총 개수: ${meshCount}, 패널 그룹: ${panelGroups.size}, 이름없는 노드: ${unnamedNodes.length}`);

    if (!materialMap.has('default')) {
      const { material, effect } = this.processMaterial(null, 'default_material');
      materials.push(material);
      materialEffects.push(effect);
    }

    // 패널 이름별로 부모 <node> 그룹 생성. 부모 노드에도 layer/name 부여.
    const groupedNodes: string[] = [];
    for (const [panelName, childNodes] of panelGroups.entries()) {
      groupedNodes.push(this.createGroupNode(panelName, childNodes));
    }
    // 이름 없는 메시는 그대로 최상위에 둠
    groupedNodes.push(...unnamedNodes);

    if (geometries.length === 0) {
      console.warn('⚠️ 내보낼 지오메트리가 없습니다!');
    }

    return this.buildDocument(geometries, materials, materialEffects, groupedNodes);
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
      // Three.js unit → mm 변환 (1 unit = 100mm)
      vertices.push(
        tempVec.x * ColladaExporter.THREE_UNIT_TO_MM,
        tempVec.y * ColladaExporter.THREE_UNIT_TO_MM,
        tempVec.z * ColladaExporter.THREE_UNIT_TO_MM
      );

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
  /**
   * 단일 mesh를 담는 leaf 노드 (geometry instance 포함).
   */
  private createInstanceNode(geometryId: string, materialId: string, layerName?: string): string {
    const nodeId = `node_${this.nodeId++}`;
    const safeName = this.escapeXmlAttr(layerName || nodeId);
    const layerAttr = layerName ? ` layer="${this.escapeXmlAttr(layerName)}"` : '';
    return `
      <node id="${nodeId}" name="${safeName}"${layerAttr} type="NODE">
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
   * 같은 패널 이름의 자식 노드들을 묶는 부모 그룹 노드.
   * SketchUp이 DAE 임포트 시 그룹 + layer로 인식한다.
   */
  private createGroupNode(panelName: string, childNodes: string[]): string {
    const groupId = `group_${this.nodeId++}`;
    const safeName = this.escapeXmlAttr(panelName);
    return `
      <node id="${groupId}" name="${safeName}" layer="${safeName}" type="NODE">
        ${childNodes.join('\n')}
      </node>`;
  }

  /**
   * 메시 또는 부모 그룹의 이름에서 layer로 사용할 이름 추출.
   * 가구 메시는 "furniture-mesh-좌측판" 같이 prefix가 붙어있으므로 정리한다.
   *
   * 매칭되는 형태:
   *   - "furniture-mesh-좌측판"      → "좌측판"
   *   - "back-panel-mesh-백패널"     → "백패널"
   *   - "furniture-edge-좌측판-0"    → 무시 (edge 메시는 가구 본체 아님)
   *   - "*-mesh"                     → 접미사 제거
   *   - 위 패턴 아니면 부모 그룹의 이름을 따라간다
   */
  private resolveLayerName(mesh: THREE.Mesh): string | undefined {
    const cleaned = this.cleanPanelName(mesh.name);
    if (cleaned) return cleaned;

    let current: THREE.Object3D | null = mesh.parent;
    while (current) {
      const parentCleaned = this.cleanPanelName(current.name);
      if (parentCleaned &&
          parentCleaned !== 'FurnitureContainer' &&
          parentCleaned !== 'Scene') {
        return parentCleaned;
      }
      current = current.parent;
    }
    return undefined;
  }

  private cleanPanelName(rawName: string | undefined | null): string | undefined {
    if (!rawName || rawName.trim() === '') return undefined;
    let n = rawName.trim();

    // CNC 옵티마이저와 동일한 prefix 정리
    n = n.replace(/^(furniture-mesh-|back-panel-mesh-)/, '');
    n = n.replace(/^(furniture-edge-|back-panel-edge-)/, '');
    if (n.endsWith('-mesh')) n = n.slice(0, -5);
    // edge에 붙은 라인 인덱스 제거 ("좌측판-0" → "좌측판")
    n = n.replace(/-\d+$/, '');

    return n.trim() || undefined;
  }

  private escapeXmlAttr(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    <unit name="millimeter" meter="0.001"/>
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
