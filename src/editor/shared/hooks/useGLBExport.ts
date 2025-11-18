import { useCallback } from 'react';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';
import type { Group, Scene } from 'three';

/**
 * GLB 내보내기 기능을 제공하는 커스텀 훅
 */
export const useGLBExport = () => {
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

      // 가구만 포함하는 임시 그룹 생성
      const furnitureGroup = new THREE.Group();
      furnitureGroup.name = 'FurnitureExport';

      // 스케일 조정: Three.js는 1 unit = 100mm, GLB 표준은 1 unit = 1m
      // 600mm 가구 = Three.js 6 units → GLB 0.6 units (0.6m) 되도록 0.1배
      furnitureGroup.scale.set(0.1, 0.1, 0.1);

      console.log('🔍 Scene children 전체 목록:');
      scene.traverse((child: any) => {
        if (child.isMesh || child.isGroup) {
          console.log('  - name:', child.name, '/ type:', child.type, '/ parent:', child.parent?.name);
        }
      });

      console.log('🔍 가구 필터링 시작...');

      // 제외할 요소들 (공간, 조명, 헬퍼, 치수 라벨 등)
      const excludePatterns = [
        'Wall', 'Floor', 'Ceiling', 'Room',
        'DirectionalLight', 'AmbientLight', 'HemisphereLight', 'PointLight', 'SpotLight',
        'GridHelper', 'AxesHelper', 'Grid',
        'Camera',
        'Text', 'Dimension', 'Label', 'Html', // 치수 라벨 제외
        'Guide', 'Line', 'Arrow', 'Marker', // 가이드 라인 제외
        'Plane', 'PlacementPlane', // 배치 평면 제외
        'Environment', 'Sky', // 환경 제외
      ];

      // scene의 모든 자식을 순회하며 가구만 복사
      scene.children.forEach((child: any) => {
        const childName = child.name || '';
        const childType = child.type || '';

        // 1. excludePatterns에 해당하는 것 제외
        const shouldExclude = excludePatterns.some(pattern =>
          childName.includes(pattern) || childType.includes(pattern)
        );

        // 2. Sprite 타입도 제외 (Text는 Sprite로 렌더링됨)
        const isSprite = childType === 'Sprite';

        // 3. Light 타입 제외
        const isLight = child.isLight;

        if (!shouldExclude && !isSprite && !isLight && (child.isGroup || child.isMesh)) {
          console.log('✅ 포함 (Group/Mesh):', child.name, '/ type:', child.type);
          // Group 전체를 복제 (가구와 모든 부속품 포함)
          const cloned = child.clone(true); // true = recursive clone
          furnitureGroup.add(cloned);
        } else {
          console.log('❌ 제외:', child.name, '/ type:', child.type, '/ isLight:', isLight, '/ isSprite:', isSprite);
        }
      });

      console.log('📦 추출된 가구 그룹/메쉬 개수:', furnitureGroup.children.length);

      if (furnitureGroup.children.length === 0) {
        throw new Error('내보낼 가구가 없습니다.');
      }

      const exporter = new GLTFExporter();

      return new Promise((resolve) => {
        exporter.parse(
          furnitureGroup,
          (gltf) => {
            try {
              console.log('✅ GLTF 파싱 완료');

              // GLB는 ArrayBuffer로 반환됨
              const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
              const url = URL.createObjectURL(blob);

              // 다운로드 링크 생성
              const link = document.createElement('a');
              link.href = url;
              link.download = filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);

              // URL 해제
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
            binary: true, // GLB 포맷으로 출력
            animations: [], // 애니메이션 포함 (도어 열림/닫힘)
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
   * 내보내기 가능 여부 확인
   */
  const canExportGLB = useCallback((scene?: Scene | Group): boolean => {
    if (!scene) return false;

    // 제외 패턴
    const excludePatterns = [
      'Wall', 'Floor', 'Ceiling',
      'DirectionalLight', 'AmbientLight', 'HemisphereLight',
      'GridHelper', 'AxesHelper',
      'Camera'
    ];

    // 가구가 있는지 확인
    let hasFurniture = false;
    scene.children.forEach((child: any) => {
      const childName = child.name || '';
      const shouldExclude = excludePatterns.some(pattern => childName.includes(pattern));
      if (!shouldExclude && (child.isGroup || child.isMesh)) {
        hasFurniture = true;
      }
    });

    return hasFurniture;
  }, []);

  return {
    exportToGLB,
    canExportGLB,
  };
};
