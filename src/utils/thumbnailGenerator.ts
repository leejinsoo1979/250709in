import * as THREE from 'three';
import { ProjectSummary } from '../firebase/types';

/**
 * 프로젝트의 3D 정면뷰 썸네일을 생성하는 유틸리티
 */
export class ThumbnailGenerator {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  constructor() {
    // 오프스크린 렌더러 생성
    this.renderer = new THREE.WebGLRenderer({ 
      alpha: true, 
      antialias: true,
      preserveDrawingBuffer: true 
    });
    this.renderer.setSize(300, 200); // 썸네일 사이즈
    this.renderer.setClearColor(0xffffff, 0); // 투명 배경
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 씬 생성
    this.scene = new THREE.Scene();

    // 카메라 생성 (정면뷰)
    this.camera = new THREE.PerspectiveCamera(45, 300 / 200, 0.1, 1000);
    this.camera.position.set(0, 2, 8); // 정면에서 약간 위에서 보는 각도
    this.camera.lookAt(0, 1, 0);
  }

  /**
   * 프로젝트 데이터로부터 3D 썸네일 생성
   */
  async generateThumbnail(project: ProjectSummary): Promise<string> {
    try {
      console.log('🎨 썸네일 생성 시작:', {
        projectId: project.id,
        hasSpaceInfo: !!project.spaceInfo,
        hasPlacedModules: !!project.placedModules,
        placedModulesCount: project.placedModules?.length || 0
      });

      // 씬 초기화
      this.clearScene();

      // 조명 설정
      this.setupLighting();

      // 3D 모델 생성
      await this.createRoomModel(project);
      await this.createFurnitureModels(project);

      // 렌더링
      console.log('🎨 Three.js 렌더링 시작');
      this.renderer.render(this.scene, this.camera);

      // 렌더링 후 조금 기다림 (WebGL 완료 대기)
      await new Promise(resolve => setTimeout(resolve, 100));

      // 캔버스를 이미지 데이터 URL로 변환
      const dataUrl = this.renderer.domElement.toDataURL('image/png', 0.8);
      
      console.log('🎨 썸네일 생성 성공:', {
        dataUrlLength: dataUrl.length,
        isValidDataUrl: dataUrl.startsWith('data:image/png')
      });
      
      // 빈 이미지나 오류 이미지인지 확인
      if (dataUrl.length < 1000) { // 너무 작은 이미지는 빈 이미지일 가능성
        console.warn('⚠️ 생성된 썸네일이 너무 작음, fallback 사용');
        return this.generateFallbackThumbnail();
      }
      
      return dataUrl;
    } catch (error) {
      console.error('❌ 썸네일 생성 실패:', error);
      return this.generateFallbackThumbnail();
    }
  }

  /**
   * 씬 초기화
   */
  private clearScene(): void {
    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      this.scene.remove(child);
      
      // 메모리 정리
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    }
  }

  /**
   * 조명 설정
   */
  private setupLighting(): void {
    // 환경광
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // 주 조명 (정면)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    this.scene.add(directionalLight);

    // 보조 조명 (측면)
    const sideLight = new THREE.DirectionalLight(0xffffff, 0.3);
    sideLight.position.set(-5, 5, 2);
    this.scene.add(sideLight);
  }

  /**
   * 룸 모델 생성
   */
  private async createRoomModel(project: ProjectSummary): Promise<void> {
    const { spaceInfo } = project;
    if (!spaceInfo) {
      console.log('🏠 spaceInfo 없음, 기본 룸 생성 스킵');
      return;
    }

    const { width = 3000, height = 2400, depth = 2000 } = spaceInfo;
    
    console.log('🏠 룸 모델 생성:', {
      width,
      height, 
      depth,
      columns: spaceInfo.columns?.length || 0
    });
    
    // Three.js 단위로 변환 (mm -> m)
    const roomWidth = width * 0.001;
    const roomHeight = height * 0.001;
    const roomDepth = depth * 0.001;

    // 바닥
    const floorGeometry = new THREE.PlaneGeometry(roomWidth, roomDepth);
    const floorMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xf5f5f5,
      side: THREE.DoubleSide 
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 벽면들
    this.createWalls(roomWidth, roomHeight, roomDepth);

    // 기둥 생성
    if (spaceInfo.columns && spaceInfo.columns.length > 0) {
      this.createColumns(spaceInfo.columns);
    }
  }

  /**
   * 벽면 생성
   */
  private createWalls(width: number, height: number, depth: number): void {
    const wallMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xffffff,
      transparent: true,
      opacity: 0.8 
    });

    // 뒷벽
    const backWallGeometry = new THREE.PlaneGeometry(width, height);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, height / 2, -depth / 2);
    this.scene.add(backWall);

    // 좌측벽
    const leftWallGeometry = new THREE.PlaneGeometry(depth, height);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
    leftWall.position.set(-width / 2, height / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);

    // 우측벽
    const rightWallGeometry = new THREE.PlaneGeometry(depth, height);
    const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
    rightWall.position.set(width / 2, height / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);
  }

  /**
   * 기둥 생성
   */
  private createColumns(columns: any[]): void {
    const columnMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });

    columns.forEach(column => {
      const columnWidth = (column.width || 300) * 0.001;
      const columnHeight = (column.height || 2400) * 0.001;
      const columnDepth = (column.depth || 300) * 0.001;

      const geometry = new THREE.BoxGeometry(columnWidth, columnHeight, columnDepth);
      const mesh = new THREE.Mesh(geometry, columnMaterial);
      
      // 위치 설정
      if (column.position && Array.isArray(column.position)) {
        mesh.position.set(
          column.position[0],
          columnHeight / 2,
          column.position[2]
        );
      }
      
      mesh.castShadow = true;
      this.scene.add(mesh);
    });
  }

  /**
   * 가구 모델 생성
   */
  private async createFurnitureModels(project: ProjectSummary): Promise<void> {
    const { placedModules } = project;
    if (!placedModules || placedModules.length === 0) {
      console.log('🪑 가구 모듈 없음, 가구 생성 스킵');
      return;
    }

    console.log('🪑 가구 모델 생성:', {
      moduleCount: placedModules.length,
      modules: placedModules.map(m => ({
        id: m.id || 'unknown',
        hasPosition: !!m.position,
        hasDimensions: !!m.dimensions,
        position: m.position,
        dimensions: m.dimensions
      }))
    });

    const furnitureMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });

    placedModules.forEach((module, index) => {
      if (!module.position || !module.dimensions) {
        console.warn(`⚠️ 가구 모듈 ${index} 데이터 불완전:`, {
          hasPosition: !!module.position,
          hasDimensions: !!module.dimensions
        });
        return;
      }

      const width = module.dimensions.width * 0.001;
      const height = module.dimensions.height * 0.001;
      const depth = module.dimensions.depth * 0.001;

      const geometry = new THREE.BoxGeometry(width, height, depth);
      const mesh = new THREE.Mesh(geometry, furnitureMaterial);
      
      mesh.position.set(
        module.position.x,
        height / 2,
        module.position.z
      );
      
      mesh.castShadow = true;
      this.scene.add(mesh);
    });
  }

  /**
   * fallback 썸네일 생성
   */
  private generateFallbackThumbnail(): string {
    console.log('🎨 Fallback 썸네일 생성');
    
    try {
      // 간단한 색상 블록 썸네일
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // 그라데이션 배경
        const gradient = ctx.createLinearGradient(0, 0, 300, 200);
        gradient.addColorStop(0, '#10b981');
        gradient.addColorStop(1, '#059669');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 300, 200);
        
        // 간단한 룸 아이콘 그리기
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        
        // 룸 윤곽선
        ctx.strokeRect(75, 60, 150, 80);
        
        // 가구 아이콘들
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(85, 70, 30, 20); // 왼쪽 가구
        ctx.fillRect(185, 70, 30, 20); // 오른쪽 가구
        ctx.fillRect(135, 110, 30, 20); // 가운데 가구
        
        // 텍스트
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('디자인 미리보기', 150, 170);
        
        const dataUrl = canvas.toDataURL('image/png');
        console.log('✅ Fallback 썸네일 생성 완료');
        return dataUrl;
      } else {
        throw new Error('Canvas context 생성 실패');
      }
    } catch (error) {
      console.error('❌ Fallback 썸네일 생성 실패:', error);
      // 최후의 수단: 단순 data URL
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    this.clearScene();
    this.renderer.dispose();
  }
}

// 싱글톤 인스턴스
let thumbnailGenerator: ThumbnailGenerator | null = null;

/**
 * 프로젝트 썸네일 생성
 */
export async function generateProjectThumbnail(project: ProjectSummary): Promise<string> {
  if (!thumbnailGenerator) {
    thumbnailGenerator = new ThumbnailGenerator();
  }
  
  return await thumbnailGenerator.generateThumbnail(project);
}

/**
 * 썸네일 생성기 정리
 */
export function disposeThumbnailGenerator(): void {
  if (thumbnailGenerator) {
    thumbnailGenerator.dispose();
    thumbnailGenerator = null;
  }
}