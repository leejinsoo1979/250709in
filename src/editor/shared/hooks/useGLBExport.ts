import { useCallback } from 'react';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
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

      const exporter = new GLTFExporter();

      return new Promise((resolve) => {
        exporter.parse(
          scene,
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
    return !!scene && scene.children.length > 0;
  }, []);

  return {
    exportToGLB,
    canExportGLB,
  };
};
