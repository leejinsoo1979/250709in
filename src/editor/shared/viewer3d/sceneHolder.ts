import * as THREE from 'three';

/**
 * Three.js 씬/렌더러에 대한 전역 참조를 저장하는 홀더
 * DXF 내보내기, 섬네일 캡처 등에서 현재 렌더링 중인 씬/렌더러에 접근할 때 사용
 */
class SceneHolder {
  private scene: THREE.Scene | null = null;
  private renderer: THREE.WebGLRenderer | null = null;

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
   * 렌더러 참조 설정
   */
  setRenderer(renderer: THREE.WebGLRenderer | null): void {
    this.renderer = renderer;
  }

  /**
   * 현재 렌더러 참조 가져오기
   */
  getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  /**
   * 씬/렌더러 참조 초기화
   */
  clear(): void {
    this.scene = null;
    this.renderer = null;
    console.log('📸 SceneHolder: Scene/Renderer reference cleared');
  }
}

// 싱글톤 인스턴스
export const sceneHolder = new SceneHolder();
