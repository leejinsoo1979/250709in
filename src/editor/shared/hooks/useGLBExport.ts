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

      console.log('🔍 Scene children 필터링 시작...');

      // scene의 모든 자식을 순회하며 가구 관련 요소만 복사
      scene.traverse((child: any) => {
        // 제외할 요소들 (벽, 바닥, 조명, 카메라 등)
        const excludeNames = [
          'Room', 'Wall', 'Floor', 'Ceiling', 'Grid',
          'Light', 'Camera', 'Helper', 'Background',
          'ColumnAsset', 'WallAsset', 'ColumnGhost',
          'ColumnLabel', 'ColumnDistance'
        ];

        const shouldExclude = excludeNames.some(name =>
          child.name?.includes(name) || child.type?.includes(name)
        );

        // Mesh이면서 제외 대상이 아닌 경우만 포함
        if (child.isMesh && !shouldExclude) {
          console.log('✅ 포함:', child.name || child.type);
          // 원본 mesh를 복제하여 추가
          const clonedMesh = child.clone();
          furnitureGroup.add(clonedMesh);
        } else if (shouldExclude && child.isMesh) {
          console.log('❌ 제외:', child.name || child.type);
        }
      });

      console.log('📦 추출된 가구 mesh 개수:', furnitureGroup.children.length);

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

    // 제외할 요소 이름
    const excludeNames = [
      'Room', 'Wall', 'Floor', 'Ceiling', 'Grid',
      'Light', 'Camera', 'Helper', 'Background',
      'ColumnAsset', 'WallAsset', 'ColumnGhost',
      'ColumnLabel', 'ColumnDistance'
    ];

    // 가구 mesh가 있는지 확인
    let hasFurniture = false;
    scene.traverse((child: any) => {
      const shouldExclude = excludeNames.some(name =>
        child.name?.includes(name) || child.type?.includes(name)
      );
      if (child.isMesh && !shouldExclude) {
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
