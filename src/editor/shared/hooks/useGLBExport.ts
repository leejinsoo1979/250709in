import { useCallback } from 'react';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';
import type { Group, Scene } from 'three';

/**
 * GLB 내보내기 기능을 제공하는 커스텀 훅
 * - 가구와 프레임만 내보내기
 * - 벽, 바닥, 천장 등 공간 요소 제외
 */
export const useGLBExport = () => {
  /**
   * 메쉬가 벽/바닥/천장인지 확인
   * PlaneGeometry를 사용하는 큰 메쉬는 벽/바닥으로 간주
   */
  const isWallOrFloorMesh = (mesh: THREE.Mesh): boolean => {
    const geometry = mesh.geometry;

    // PlaneGeometry 확인
    if (geometry.type === 'PlaneGeometry') {
      const params = (geometry as THREE.PlaneGeometry).parameters;
      // 크기가 큰 평면은 벽/바닥으로 간주 (100cm = 1m 이상)
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

    // 명시적으로 포함해야 할 패턴
    const includePatterns = [
      'FurnitureContainer', // 가구 컨테이너
      'Furniture',         // 가구
      'Frame',             // 프레임
      'Door',              // 도어
      'Cabinet',           // 캐비넷
      'Shelf',             // 선반
      'Drawer',            // 서랍
      'Panel',             // 패널 (엔드패널, 백패널 등)
      'EndPanel',          // 엔드패널
      'BackPanel',         // 백패널
      'Hinge',             // 힌지
    ];

    // 명시적으로 제외해야 할 패턴
    const excludePatterns = [
      'Wall',              // 벽
      'Floor',             // 바닥
      'Ceiling',           // 천장
      'Room',              // 방
      'Grid',              // 그리드
      'Axis',              // 축
      'Helper',            // 헬퍼
      'Light',             // 조명
      'Camera',            // 카메라
      'Text',              // 텍스트
      'Dimension',         // 치수
      'Label',             // 라벨
      'Html',              // HTML
      'Guide',             // 가이드
      'Arrow',             // 화살표
      'Marker',            // 마커
      'Placement',         // 배치 평면
      'Environment',       // 환경
      'Sky',               // 하늘
      'space-frame',       // 공간 프레임 (외곽선)
      'Column',            // 기둥 (공간 요소)
      'SlotDrop',          // 슬롯 드롭존
      'Indicator',         // 인디케이터
      'CAD',               // CAD 요소
      'Dropped',           // 단내림 공간
    ];

    // 제외 패턴에 해당하면 제외
    if (excludePatterns.some(pattern =>
      name.toLowerCase().includes(pattern.toLowerCase()) ||
      type.toLowerCase().includes(pattern.toLowerCase())
    )) {
      return false;
    }

    // 조명 제외
    if ((obj as any).isLight) {
      return false;
    }

    // Sprite 제외
    if (type === 'Sprite') {
      return false;
    }

    // 메쉬인 경우 벽/바닥 확인
    if ((obj as any).isMesh) {
      if (isWallOrFloorMesh(obj as THREE.Mesh)) {
        return false;
      }
    }

    // 포함 패턴에 해당하면 포함
    if (includePatterns.some(pattern =>
      name.toLowerCase().includes(pattern.toLowerCase())
    )) {
      return true;
    }

    return false;
  };

  /**
   * 씬을 재귀적으로 탐색하여 가구와 프레임 찾기
   */
  const findFurnitureAndFrames = (scene: Scene | Group): THREE.Object3D[] => {
    const result: THREE.Object3D[] = [];

    const traverse = (obj: THREE.Object3D, depth: number = 0) => {
      const indent = '  '.repeat(depth);
      const name = obj.name || '(unnamed)';
      const type = obj.type;

      // FurnitureContainer를 찾으면 전체 포함
      if (obj.name === 'FurnitureContainer') {
        console.log(`${indent}✅ FurnitureContainer 발견 - 전체 포함`);
        result.push(obj);
        return; // 하위 요소는 이미 포함됨
      }

      // 포함해야 할 요소인지 확인
      if (shouldInclude(obj) && (obj as any).isGroup) {
        console.log(`${indent}✅ 포함: ${name} (${type})`);
        result.push(obj);
        return; // 하위 요소는 이미 포함됨
      }

      // 자식 요소 탐색
      if (obj.children && obj.children.length > 0) {
        obj.children.forEach(child => traverse(child, depth + 1));
      }
    };

    scene.children.forEach(child => traverse(child, 0));

    return result;
  };

  /**
   * 3D 씬을 GLB 파일로 내보내기
   * @param scene Three.js Scene 또는 Group 객체
   * @param filename 저장할 파일명
   */
  const exportToGLB = useCallback(async (
    scene: Scene | Group,
    filename: string = 'furniture-design.glb'
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('🔧 GLB 내보내기 시작...');

      if (!scene) {
        throw new Error('내보낼 씬이 없습니다.');
      }

      // 내보낼 그룹 생성
      const exportGroup = new THREE.Group();
      exportGroup.name = 'FurnitureExport';

      // 스케일 조정: Three.js는 1 unit = 100mm, GLB 표준은 1 unit = 1m
      exportGroup.scale.set(0.1, 0.1, 0.1);

      console.log('🔍 씬 구조 분석 중...');

      // 전체 씬 구조 로깅
      console.log('📋 전체 씬 구조:');
      scene.traverse((child: any) => {
        if (child.isMesh || child.isGroup) {
          const depth = getDepth(child, scene);
          const indent = '  '.repeat(depth);
          console.log(`${indent}- ${child.name || '(unnamed)'} [${child.type}]`);
        }
      });

      // 가구와 프레임 찾기
      const objectsToExport = findFurnitureAndFrames(scene);

      console.log(`📦 내보낼 객체 수: ${objectsToExport.length}`);

      // 찾은 객체들을 복제하여 추가
      objectsToExport.forEach((obj, index) => {
        console.log(`  ${index + 1}. ${obj.name || '(unnamed)'} [${obj.type}]`);
        const cloned = obj.clone(true);
        exportGroup.add(cloned);
      });

      if (exportGroup.children.length === 0) {
        throw new Error('내보낼 가구가 없습니다. FurnitureContainer를 찾을 수 없습니다.');
      }

      console.log(`✅ 총 ${exportGroup.children.length}개의 객체가 내보내기에 포함됩니다.`);

      const exporter = new GLTFExporter();

      return new Promise((resolve) => {
        exporter.parse(
          exportGroup,
          (gltf) => {
            try {
              console.log('✅ GLTF 파싱 완료');

              const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
              const url = URL.createObjectURL(blob);

              const link = document.createElement('a');
              link.href = url;
              link.download = filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);

              setTimeout(() => URL.revokeObjectURL(url), 100);

              console.log('✅ GLB 파일 다운로드 완료:', filename);
              resolve({ success: true });
            } catch (error) {
              console.error('❌ GLB 저장 중 오류:', error);
              resolve({
                success: false,
                error: error instanceof Error ? error.message : '파일 저장 중 오류가 발생했습니다.'
              });
            }
          },
          (error) => {
            console.error('❌ GLTF 파싱 오류:', error);
            resolve({
              success: false,
              error: '3D 모델 변환 중 오류가 발생했습니다.'
            });
          },
          {
            binary: true,
            animations: [],
            includeCustomExtensions: true,
          }
        );
      });
    } catch (error) {
      console.error('❌ GLB 내보내기 오류:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'GLB 내보내기 중 오류가 발생했습니다.'
      };
    }
  }, []);

  /**
   * 객체의 씬에서의 깊이 계산
   */
  const getDepth = (obj: THREE.Object3D, root: THREE.Object3D): number => {
    let depth = 0;
    let current = obj;
    while (current.parent && current !== root) {
      depth++;
      current = current.parent;
    }
    return depth;
  };

  /**
   * 내보내기 가능 여부 확인
   */
  const canExportGLB = useCallback((scene?: Scene | Group): boolean => {
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
    canExportGLB,
  };
};
