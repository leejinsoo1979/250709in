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
   * 객체가 FurnitureContainer의 하위 요소인지 확인
   */
  const isInsideFurnitureContainer = (obj: THREE.Object3D): boolean => {
    let current = obj.parent;
    while (current) {
      if (current.name === 'FurnitureContainer') return true;
      current = current.parent;
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
        name.includes('space') ||
        name.includes('공간') ||
        name.includes('measure') ||
        name.includes('nativeline') ||
        name.includes('ghost') ||
        name.includes('preview') ||
        name.includes('overlay') ||
        name.includes('bounds') ||
        name.includes('outline') ||
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
   * 씬에서 내보낼 객체 찾기
   * 화이트리스트 방식: FurnitureContainer와 Column만 포함
   * Room의 top-frame, base-frame 등 공간 구조물은 제외
   */
  const findExportableObjects = (scene: Scene | Group): THREE.Object3D[] => {
    const result: THREE.Object3D[] = [];
    const addedUuids = new Set<string>();

    console.log('🔍 내보낼 객체 탐색 시작 (화이트리스트 방식)...');

    const traverse = (obj: THREE.Object3D, depth: number = 0) => {
      const indent = '  '.repeat(depth);

      // 이미 추가된 객체는 건너뛰기
      if (addedUuids.has(obj.uuid)) return;

      // FurnitureContainer는 전체 포함 (가구 메쉬 전체)
      if (obj.name === 'FurnitureContainer') {
        result.push(obj);
        addedUuids.add(obj.uuid);
        console.log(`${indent}✅ FurnitureContainer 포함`);
        return; // 하위 요소는 이미 포함됨
      }

      // Column (기둥)은 전체 포함 - ColumnGuide 등 가이드 요소 제외
      if (obj.name && obj.name.toLowerCase().includes('column') &&
          !obj.name.toLowerCase().includes('columnguide') &&
          !obj.name.toLowerCase().includes('columndistance') &&
          !obj.name.toLowerCase().includes('columncreation') &&
          !obj.name.toLowerCase().includes('columnghost')) {
        // Column이 FurnitureContainer 안에 있지 않은 독립 기둥인 경우만 별도 포함
        if (!isInsideFurnitureContainer(obj)) {
          result.push(obj);
          addedUuids.add(obj.uuid);
          console.log(`${indent}✅ Column 포함: ${obj.name}`);
          return;
        }
      }

      // 자식 탐색
      if (obj.children && obj.children.length > 0) {
        obj.children.forEach(child => traverse(child, depth + 1));
      }
    };

    scene.children.forEach(child => traverse(child, 0));

    console.log(`📊 총 ${result.length}개의 객체 발견`);
    return result;
  };

  /**
   * 내보내기용 그룹 준비
   */
  const prepareExportGroup = (scene: Scene | Group, scale: number = 0.1): THREE.Group => {
    // 씬의 월드 매트릭스 업데이트 (클론 전 필수)
    scene.updateMatrixWorld(true);

    const exportGroup = new THREE.Group();
    exportGroup.name = 'FurnitureExport';
    exportGroup.scale.set(scale, scale, scale);

    const objectsToExport = findExportableObjects(scene);
    console.log(`📦 내보낼 객체 수: ${objectsToExport.length}`);

    objectsToExport.forEach((obj, index) => {
      console.log(`  ${index + 1}. ${obj.name || '(unnamed)'} - position: (${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)})`);
      const cloned = obj.clone(true);
      removeUnwantedFromClone(cloned);
      exportGroup.add(cloned);
    });

    return exportGroup;
  };

  /**
   * Z-up 좌표계용 래퍼 그룹 생성 (STL, OBJ, DAE용)
   * 지오메트리를 수정하지 않고 래퍼 그룹 회전으로 좌표계 변환
   */
  const wrapForZUp = (group: THREE.Group): THREE.Group => {
    const wrapper = new THREE.Group();
    wrapper.name = 'ZUpWrapper';
    wrapper.add(group);
    // Y-up → Z-up: X축 기준 -90도 회전
    wrapper.rotation.x = -Math.PI / 2;
    wrapper.updateMatrixWorld(true);
    return wrapper;
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
      const wrappedGroup = wrapForZUp(exportGroup);

      const exporter = new OBJExporter();
      const result = exporter.parse(wrappedGroup);

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
   * 참고: STL은 Y-up으로 내보내짐 (SketchUp에서 수동 회전 필요)
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

      // STL은 변환 없이 그대로 내보내기 (Y-up)
      // SketchUp에서 불러온 후 X축 90도 회전 필요

      // 월드 매트릭스 업데이트 (STL 내보내기 전 필수)
      exportGroup.updateMatrixWorld(true);

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

      console.log('📦 Scene 확인:', scene.name, scene.type);

      const exportGroup = prepareExportGroup(scene);
      console.log('📦 Export Group children:', exportGroup.children.length);

      if (exportGroup.children.length === 0) {
        throw new Error('내보낼 가구가 없습니다.');
      }

      // ColladaExporter 내부에서 Y-up → Z-up 좌표계 변환 처리
      const exporter = new ColladaExporter();
      console.log('🔧 ColladaExporter 생성됨');

      const result = exporter.parse(exportGroup);
      console.log('📄 DAE 결과 길이:', result.length);

      if (!result || result.length === 0) {
        throw new Error('DAE 변환 결과가 비어있습니다.');
      }

      const blob = new Blob([result], { type: 'model/vnd.collada+xml' });
      downloadBlob(blob, filename);

      console.log('✅ DAE 파일 다운로드 완료:', filename);
      return { success: true };
    } catch (error) {
      console.error('❌ DAE 내보내기 오류:', error);
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
