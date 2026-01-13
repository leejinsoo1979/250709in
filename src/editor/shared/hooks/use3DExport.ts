import { useCallback } from 'react';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { ColladaExporter } from '../utils/ColladaExporter';
import * as THREE from 'three';
import type { Group, Scene } from 'three';

export type ExportFormat = 'glb' | 'obj' | 'stl' | 'dae';

interface ExportResult {
  success: boolean;
  error?: string;
}

/**
 * 3D 모델 내보내기 기능을 제공하는 커스텀 훅
 * - GLB, OBJ, STL, DAE 포맷 지원
 * - 가구만 내보내기, 벽/바닥/천장 제외
 */
export const use3DExport = () => {
  /**
   * 메쉬가 벽/바닥/천장인지 확인
   */
  const isWallOrFloorMesh = (mesh: THREE.Mesh): boolean => {
    const geometry = mesh.geometry;
    if (geometry.type === 'PlaneGeometry') {
      const params = (geometry as THREE.PlaneGeometry).parameters;
      if (params && (params.width > 10 || params.height > 10)) {
        return true;
      }
    }
    return false;
  };

  /**
   * 그룹 또는 메쉬가 내보내기에 포함되어야 하는지 확인
   */
  const shouldInclude = (obj: THREE.Object3D): boolean => {
    const name = obj.name || '';
    const type = obj.type || '';

    const includePatterns = [
      'FurnitureContainer', 'Furniture', 'Frame', 'Door', 'Cabinet',
      'Shelf', 'Drawer', 'Panel', 'EndPanel', 'BackPanel', 'Hinge',
    ];

    const excludePatterns = [
      'Wall', 'Floor', 'Ceiling', 'Room', 'Grid', 'Axis', 'Helper',
      'Light', 'Camera', 'Text', 'Dimension', 'Label', 'Html', 'Guide',
      'Arrow', 'Marker', 'Placement', 'Environment', 'Sky', 'space-frame',
      'Column', 'SlotDrop', 'Indicator', 'CAD', 'Dropped',
    ];

    if (excludePatterns.some(pattern =>
      name.toLowerCase().includes(pattern.toLowerCase()) ||
      type.toLowerCase().includes(pattern.toLowerCase())
    )) {
      return false;
    }

    if ((obj as any).isLight) return false;
    if (type === 'Sprite') return false;

    if ((obj as any).isMesh && isWallOrFloorMesh(obj as THREE.Mesh)) {
      return false;
    }

    if (includePatterns.some(pattern =>
      name.toLowerCase().includes(pattern.toLowerCase())
    )) {
      return true;
    }

    return false;
  };

  /**
   * 복제된 객체에서 치수/텍스트/조명 요소 제거
   */
  const removeUnwantedFromClone = (obj: THREE.Object3D): void => {
    const childrenToRemove: THREE.Object3D[] = [];

    obj.traverse((child: any) => {
      const name = (child.name || '').toLowerCase();
      const type = child.type || '';

      // 조명 관련 요소 식별
      const isLight =
        child.isLight ||
        type.includes('Light') ||
        name.includes('light') ||
        type === 'SpotLight' ||
        type === 'PointLight' ||
        type === 'DirectionalLight' ||
        type === 'AmbientLight' ||
        type === 'HemisphereLight' ||
        type === 'RectAreaLight';

      // 치수 관련 요소 식별
      const isDimension =
        name.includes('dimension') ||
        name.includes('text') ||
        name.includes('label') ||
        name.includes('치수') ||
        type === 'Sprite' ||
        type === 'Line' ||
        type === 'LineSegments' ||
        type === 'Line2' ||
        (child.isMesh && child.geometry && child.geometry.type === 'ShapeGeometry') ||
        (child.isMesh && child.material && child.material.type === 'MeshBasicMaterial' &&
         child.geometry && child.geometry.boundingSphere &&
         child.geometry.boundingSphere.radius < 1);

      // 헬퍼/카메라 요소 식별
      const isHelper =
        name.includes('helper') ||
        name.includes('camera') ||
        type.includes('Helper') ||
        type === 'Camera' ||
        type === 'PerspectiveCamera' ||
        type === 'OrthographicCamera';

      if (isLight || isDimension || isHelper) {
        childrenToRemove.push(child);
      }
    });

    childrenToRemove.forEach(child => {
      if (child.parent) {
        child.parent.remove(child);
      }
    });
  };

  /**
   * 씬에서 가구 찾기
   */
  const findFurniture = (scene: Scene | Group): THREE.Object3D[] => {
    const result: THREE.Object3D[] = [];

    const traverse = (obj: THREE.Object3D) => {
      if (obj.name === 'FurnitureContainer') {
        result.push(obj);
        return;
      }

      if (shouldInclude(obj) && (obj as any).isGroup) {
        result.push(obj);
        return;
      }

      if (obj.children && obj.children.length > 0) {
        obj.children.forEach(child => traverse(child));
      }
    };

    scene.children.forEach(child => traverse(child));
    return result;
  };

  /**
   * 내보내기용 그룹 준비
   */
  const prepareExportGroup = (scene: Scene | Group, scale: number = 0.1): THREE.Group => {
    const exportGroup = new THREE.Group();
    exportGroup.name = 'FurnitureExport';
    exportGroup.scale.set(scale, scale, scale);

    const objectsToExport = findFurniture(scene);

    objectsToExport.forEach((obj) => {
      const cloned = obj.clone(true);
      removeUnwantedFromClone(cloned);
      exportGroup.add(cloned);
    });

    return exportGroup;
  };

  /**
   * Y-up을 Z-up 좌표계로 변환 (STL, OBJ, DAE용)
   * 모든 월드 변환을 지오메트리에 베이크한 후 좌표계 변환
   * 중요: 원본 지오메트리를 수정하지 않도록 복제 후 수정
   */
  const convertToZUp = (group: THREE.Group): void => {
    const rotationMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

    // 먼저 모든 월드 매트릭스 업데이트
    group.updateMatrixWorld(true);

    // 모든 메쉬를 수집
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh);
      }
    });

    // 각 메쉬의 지오메트리를 복제하고 월드 변환 적용
    meshes.forEach((mesh) => {
      if (mesh.geometry) {
        // 중요: 지오메트리를 복제하여 원본을 보존
        const clonedGeometry = mesh.geometry.clone();

        // 월드 매트릭스를 복제된 지오메트리에 적용 (위치, 회전, 스케일 모두 포함)
        clonedGeometry.applyMatrix4(mesh.matrixWorld);

        // Z-up 변환 적용
        clonedGeometry.applyMatrix4(rotationMatrix);

        // 복제된 지오메트리로 교체
        mesh.geometry = clonedGeometry;

        // 메쉬의 로컬 변환을 리셋 (이미 지오메트리에 베이크됨)
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        mesh.updateMatrix();
      }
    });

    // 그룹의 변환도 리셋
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
    group.updateMatrix();
  };

  /**
   * GLB 포맷으로 내보내기
   */
  const exportToGLB = useCallback(async (
    scene: Scene | Group,
    filename: string = 'furniture-design.glb'
  ): Promise<ExportResult> => {
    try {
      console.log('🔧 GLB 내보내기 시작...');

      if (!scene) {
        throw new Error('내보낼 씬이 없습니다.');
      }

      const exportGroup = prepareExportGroup(scene);

      if (exportGroup.children.length === 0) {
        throw new Error('내보낼 가구가 없습니다.');
      }

      const exporter = new GLTFExporter();

      return new Promise((resolve) => {
        exporter.parse(
          exportGroup,
          (gltf) => {
            try {
              const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
              downloadBlob(blob, filename);
              console.log('✅ GLB 파일 다운로드 완료:', filename);
              resolve({ success: true });
            } catch (error) {
              resolve({
                success: false,
                error: error instanceof Error ? error.message : '파일 저장 중 오류가 발생했습니다.'
              });
            }
          },
          (error) => {
            resolve({
              success: false,
              error: '3D 모델 변환 중 오류가 발생했습니다.'
            });
          },
          { binary: true, animations: [], includeCustomExtensions: true }
        );
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'GLB 내보내기 중 오류가 발생했습니다.'
      };
    }
  }, []);

  /**
   * OBJ 포맷으로 내보내기
   * SketchUp 등 Z-up 좌표계 소프트웨어와 호환되도록 Y-up을 Z-up으로 변환
   */
  const exportToOBJ = useCallback(async (
    scene: Scene | Group,
    filename: string = 'furniture-design.obj'
  ): Promise<ExportResult> => {
    try {
      console.log('🔧 OBJ 내보내기 시작...');

      if (!scene) {
        throw new Error('내보낼 씬이 없습니다.');
      }

      const exportGroup = prepareExportGroup(scene);

      if (exportGroup.children.length === 0) {
        throw new Error('내보낼 가구가 없습니다.');
      }

      // Y-up (Three.js) → Z-up (SketchUp, CAD) 좌표계 변환
      convertToZUp(exportGroup);

      const exporter = new OBJExporter();
      const result = exporter.parse(exportGroup);

      const blob = new Blob([result], { type: 'text/plain' });
      downloadBlob(blob, filename);

      console.log('✅ OBJ 파일 다운로드 완료:', filename);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OBJ 내보내기 중 오류가 발생했습니다.'
      };
    }
  }, []);

  /**
   * STL 포맷으로 내보내기
   * SketchUp 등 Z-up 좌표계 소프트웨어와 호환되도록 Y-up을 Z-up으로 변환
   */
  const exportToSTL = useCallback(async (
    scene: Scene | Group,
    filename: string = 'furniture-design.stl'
  ): Promise<ExportResult> => {
    try {
      console.log('🔧 STL 내보내기 시작...');

      if (!scene) {
        throw new Error('내보낼 씬이 없습니다.');
      }

      const exportGroup = prepareExportGroup(scene);

      if (exportGroup.children.length === 0) {
        throw new Error('내보낼 가구가 없습니다.');
      }

      // Y-up (Three.js) → Z-up (SketchUp, CAD) 좌표계 변환
      convertToZUp(exportGroup);

      const exporter = new STLExporter();
      const result = exporter.parse(exportGroup, { binary: true });

      const blob = new Blob([result], { type: 'application/octet-stream' });
      downloadBlob(blob, filename);

      console.log('✅ STL 파일 다운로드 완료:', filename);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'STL 내보내기 중 오류가 발생했습니다.'
      };
    }
  }, []);

  /**
   * DAE (Collada) 포맷으로 내보내기
   * SketchUp에서 기본 지원하는 포맷
   */
  const exportToDAE = useCallback(async (
    scene: Scene | Group,
    filename: string = 'furniture-design.dae'
  ): Promise<ExportResult> => {
    try {
      console.log('🔧 DAE 내보내기 시작...');

      if (!scene) {
        throw new Error('내보낼 씬이 없습니다.');
      }

      const exportGroup = prepareExportGroup(scene);

      if (exportGroup.children.length === 0) {
        throw new Error('내보낼 가구가 없습니다.');
      }

      // Y-up (Three.js) → Z-up (SketchUp, CAD) 좌표계 변환
      convertToZUp(exportGroup);

      const exporter = new ColladaExporter();
      const result = exporter.parse(exportGroup);

      const blob = new Blob([result], { type: 'model/vnd.collada+xml' });
      downloadBlob(blob, filename);

      console.log('✅ DAE 파일 다운로드 완료:', filename);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'DAE 내보내기 중 오류가 발생했습니다.'
      };
    }
  }, []);

  /**
   * 포맷에 따라 내보내기
   */
  const exportTo3D = useCallback(async (
    scene: Scene | Group,
    format: ExportFormat,
    filename?: string
  ): Promise<ExportResult> => {
    const defaultFilename = `furniture-design.${format}`;
    const finalFilename = filename || defaultFilename;

    switch (format) {
      case 'glb':
        return exportToGLB(scene, finalFilename);
      case 'obj':
        return exportToOBJ(scene, finalFilename);
      case 'stl':
        return exportToSTL(scene, finalFilename);
      case 'dae':
        return exportToDAE(scene, finalFilename);
      default:
        return { success: false, error: `지원하지 않는 포맷: ${format}` };
    }
  }, [exportToGLB, exportToOBJ, exportToSTL, exportToDAE]);

  /**
   * Blob 다운로드 헬퍼
   */
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  /**
   * 내보내기 가능 여부 확인
   */
  const canExport = useCallback((scene?: Scene | Group): boolean => {
    if (!scene) return false;

    let hasFurnitureContainer = false;
    scene.traverse((child: any) => {
      if (child.name === 'FurnitureContainer') {
        hasFurnitureContainer = true;
      }
    });

    return hasFurnitureContainer;
  }, []);

  return {
    exportToGLB,
    exportToOBJ,
    exportToSTL,
    exportToDAE,
    exportTo3D,
    canExport,
  };
};

// 하위 호환성을 위해 기존 useGLBExport도 export
export const useGLBExport = use3DExport;
