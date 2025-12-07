import * as THREE from 'three';

/**
 * Three.js 씬에 대한 전역 참조를 저장하는 홀더
 * DXF 내보내기 등에서 현재 렌더링 중인 씬에 접근할 때 사용
 */
class SceneHolder {
  private scene: THREE.Scene | null = null;

  /**
   * 씬 참조 설정
   */
  setScene(scene: THREE.Scene | null): void {
    this.scene = scene;
    if (scene) {
      console.log('📸 SceneHolder: Scene reference stored');
    }
  }

  /**
   * 현재 씬 참조 가져오기
   */
  getScene(): THREE.Scene | null {
    return this.scene;
  }

  /**
   * 씬 참조 초기화
   */
  clear(): void {
    this.scene = null;
    console.log('📸 SceneHolder: Scene reference cleared');
  }
}

// 싱글톤 인스턴스
export const sceneHolder = new SceneHolder();
