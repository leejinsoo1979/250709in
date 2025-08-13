import * as THREE from 'three';

/**
 * 텍스처 생성을 위한 유틸리티 클래스
 * 반복적인 캔버스 생성 및 그라데이션 로직을 통합 관리
 */
export class TextureGenerator {
  /**
   * 기본 캔버스 생성
   */
  private static createCanvas(width: number = 256, height: number = 256): {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    return { canvas, context };
  }

  /**
   * 세로 그라데이션 생성
   */
  private static createVerticalGradient(
    context: CanvasRenderingContext2D,
    height: number,
    colorStops: Array<{ position: number; color: string }>
  ): CanvasGradient {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    colorStops.forEach(({ position, color }) => {
      gradient.addColorStop(position, color);
    });
    return gradient;
  }

  /**
   * 가로 그라데이션 생성
   */
  private static createHorizontalGradient(
    context: CanvasRenderingContext2D,
    width: number,
    colorStops: Array<{ position: number; color: string }>
  ): CanvasGradient {
    const gradient = context.createLinearGradient(0, 0, width, 0);
    colorStops.forEach(({ position, color }) => {
      gradient.addColorStop(position, color);
    });
    return gradient;
  }

  /**
   * 서라운딩 프레임용 세로 그라데이션 텍스처 (진한 색상)
   */
  static createWallGradientTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas();
    
    const gradient = this.createVerticalGradient(context, 256, [
      { position: 0, color: '#e0e0e0' },
      { position: 0.3, color: '#d8d8d8' },
      { position: 0.7, color: '#d0d0d0' },
      { position: 1, color: '#c8c8c8' }
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 외부 벽면용 세로 그라데이션 텍스처 (흐린 색상)
   */
  static createOuterWallGradientTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas();
    
    const gradient = this.createVerticalGradient(context, 256, [
      { position: 0, color: '#f8f8f8' },
      { position: 0.3, color: '#f4f4f4' },
      { position: 0.7, color: '#f0f0f0' },
      { position: 1, color: '#ececec' }
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 기둥용 세로 그라데이션 텍스처 (적당한 중간톤)
   */
  static createColumnGradientTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas();
    
    const gradient = this.createVerticalGradient(context, 256, [
      { position: 0, color: '#d8d8d8' },    // 상단: 연한 회색
      { position: 0.3, color: '#d0d0d0' },  // 중상단
      { position: 0.7, color: '#c8c8c8' },  // 중하단
      { position: 1, color: '#c0c0c0' }     // 하단: 진한 회색
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 바닥용 가로 그라데이션 텍스처 (앞쪽: 흰색, 뒤쪽: 그레이)
   */
  static createFloorGradientTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas();
    
    const gradient = this.createHorizontalGradient(context, 256, [
      { position: 0, color: '#ffffff' },    // 앞쪽: 백그라운드와 동일한 완전한 흰색
      { position: 0.2, color: '#ffffff' },  // 앞쪽 20%는 완전한 흰색
      { position: 0.3, color: '#dddddd' },
      { position: 0.6, color: '#aaaaaa' },
      { position: 1, color: '#888888' }     // 뒤쪽: 그레이
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 깊이 기반 그라데이션 텍스처 (가구 근처는 진한 회색, 멀어질수록 흰색)
   */
  static createDepthBasedWallGradientTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas(1024, 512);
    
    const gradient = this.createHorizontalGradient(context, 1024, [
      { position: 0, color: '#555555' },
      { position: 0.1, color: '#777777' },
      { position: 0.25, color: '#999999' },
      { position: 0.4, color: '#bbbbbb' },
      { position: 0.6, color: '#dddddd' },
      { position: 0.8, color: '#eeeeee' },
      { position: 0.95, color: '#f8f8f8' },
      { position: 1, color: '#fafafa' }
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 512);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 깊이 기반 투명도 텍스처 (가까운 곳은 회색, 멀어질수록 흰색)
   */
  static createDepthTransparencyTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas(512, 256);
    
    const gradient = this.createHorizontalGradient(context, 512, [
      { position: 0, color: 'rgba(100, 100, 100, 1.0)' },
      { position: 0.3, color: 'rgba(120, 120, 120, 0.8)' },
      { position: 0.5, color: 'rgba(150, 150, 150, 0.6)' },
      { position: 0.7, color: 'rgba(180, 180, 180, 0.4)' },
      { position: 0.85, color: 'rgba(220, 220, 220, 0.2)' },
      { position: 1, color: 'rgba(250, 250, 250, 0.0)' }
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 좌측 벽면용 깊이 기반 투명도 텍스처 (앞쪽: 흰색, 뒤쪽: 그레이)
   */
  static createLeftWallDepthTransparencyTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas(512, 256);
    
    // 좌측 벽면: 앞쪽 흰색 → 뒤쪽 어두운 그레이 (강한 대비)
    const gradient = this.createHorizontalGradient(context, 512, [
      { position: 0, color: '#ffffff' },    // 앞쪽: 완전한 흰색
      { position: 0.3, color: '#e0e0e0' },
      { position: 0.6, color: '#999999' },
      { position: 0.8, color: '#666666' },
      { position: 1, color: '#444444' }     // 뒤쪽: 어두운 그레이
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 상단 벽면용 깊이 기반 투명도 텍스처 (앞쪽: 흰색, 뒤쪽: 그레이)
   */
  static createTopWallDepthTransparencyTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas(512, 256);
    
    // 상단 벽면용 세로 그라데이션 (앞쪽 흰색 → 뒤쪽 어두운 그레이) (강한 대비)
    const gradient = this.createVerticalGradient(context, 256, [
      { position: 0, color: '#ffffff' },    // 앞쪽: 완전한 흰색
      { position: 0.3, color: '#e0e0e0' },
      { position: 0.6, color: '#999999' },
      { position: 0.8, color: '#666666' },
      { position: 1, color: '#444444' }     // 뒤쪽: 어두운 그레이
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 우측 벽면용 깊이 기반 투명도 텍스처 (앞쪽: 흰색, 뒤쪽: 그레이)
   */
  static createRightWallDepthTransparencyTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas(512, 256);
    
    // 우측 벽면: 앞쪽 흰색 → 뒤쪽 어두운 그레이 (좌측과 동일한 그라데이션) (강한 대비)
    const gradient = this.createHorizontalGradient(context, 512, [
      { position: 0, color: '#ffffff' },    // 앞쪽: 완전한 흰색
      { position: 0.3, color: '#e0e0e0' },
      { position: 0.6, color: '#999999' },
      { position: 0.8, color: '#666666' },
      { position: 1, color: '#444444' }     // 뒤쪽: 어두운 그레이
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 사이드 프레임용 그라데이션 텍스처
   */
  static createSideFrameGradientTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas();
    
    const gradient = this.createVerticalGradient(context, 256, [
      { position: 0, color: '#f0f0f0' },
      { position: 0.2, color: '#e8e8e8' },
      { position: 0.5, color: '#e0e0e0' },
      { position: 0.8, color: '#d8d8d8' },
      { position: 1, color: '#d0d0d0' }
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 앞에서 뒤로 향하는 그라데이션 텍스처
   */
  static createFrontToBackGradientTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas();
    
    const gradient = this.createHorizontalGradient(context, 256, [
      { position: 0, color: '#e8e8e8' },
      { position: 0.3, color: '#e0e0e0' },
      { position: 0.7, color: '#d8d8d8' },
      { position: 1, color: '#d0d0d0' }
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 수평 그라데이션 텍스처 (좌에서 우로)
   */
  static createHorizontalGradientTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas();
    
    const gradient = this.createHorizontalGradient(context, 256, [
      { position: 0, color: '#f0f0f0' },
      { position: 0.25, color: '#e8e8e8' },
      { position: 0.5, color: '#e0e0e0' },
      { position: 0.75, color: '#d8d8d8' },
      { position: 1, color: '#d0d0d0' }
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * 좌측 수평 그라데이션 텍스처 (우에서 좌로)
   */
  static createLeftHorizontalGradientTexture(): THREE.CanvasTexture {
    const { canvas, context } = this.createCanvas();
    
    // 방향 반전: 우에서 좌로
    const gradient = this.createHorizontalGradient(context, 256, [
      { position: 0, color: '#d0d0d0' },
      { position: 0.25, color: '#d8d8d8' },
      { position: 0.5, color: '#e0e0e0' },
      { position: 0.75, color: '#e8e8e8' },
      { position: 1, color: '#f0f0f0' }
    ]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    
    return new THREE.CanvasTexture(canvas);
  }
}

/**
 * 프리셋 색상 팔레트
 */
export const ColorPresets = {
  // 벽면용 그라데이션 색상들
  wallGradient: [
    { offset: 0, color: '#e0e0e0' },
    { offset: 0.3, color: '#d8d8d8' },
    { offset: 0.7, color: '#d0d0d0' },
    { offset: 1, color: '#c8c8c8' }
  ],
  
  // 외부 벽면용 밝은 그라데이션
  outerWallGradient: [
    { offset: 0, color: '#f8f8f8' },
    { offset: 0.3, color: '#f4f4f4' },
    { offset: 0.7, color: '#f0f0f0' },
    { offset: 1, color: '#ececec' }
  ],
  
  // 바닥용 그라데이션
  floorGradient: [
    { offset: 0, color: '#c8c8c8' },
    { offset: 0.5, color: '#d5d5d5' },
    { offset: 1, color: '#e0e0e0' }
  ],
  
  // 깊이 기반 그라데이션
  depthGradient: [
    { offset: 0, color: '#555555' },
    { offset: 0.1, color: '#777777' },
    { offset: 0.25, color: '#999999' },
    { offset: 0.4, color: '#bbbbbb' },
    { offset: 0.6, color: '#dddddd' },
    { offset: 0.8, color: '#eeeeee' },
    { offset: 0.95, color: '#f8f8f8' },
    { offset: 1, color: '#fafafa' }
  ],
  
  // 투명도 그라데이션
  transparencyGradient: [
    { offset: 0, color: 'rgba(100, 100, 100, 1.0)' },
    { offset: 0.3, color: 'rgba(120, 120, 120, 0.8)' },
    { offset: 0.5, color: 'rgba(150, 150, 150, 0.6)' },
    { offset: 0.7, color: 'rgba(180, 180, 180, 0.4)' },
    { offset: 0.85, color: 'rgba(220, 220, 220, 0.2)' },
    { offset: 1, color: 'rgba(250, 250, 250, 0.0)' }
  ]
}; 