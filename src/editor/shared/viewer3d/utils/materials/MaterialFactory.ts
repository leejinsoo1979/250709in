import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator';

/**
 * 재질 팩토리 클래스 - 기존 materials.ts의 모든 함수를 대체
 */
export class MaterialFactory {
  // 캐시를 위한 정적 맵
  private static materialCache = new Map<string, THREE.Material>();

  // 전역 에지 라인 재질 캐시
  private static globalEdgeLineMaterial: THREE.LineBasicMaterial | null = null;

  /**
   * 캐시된 재질 반환 (성능 최적화)
   */
  private static getCachedMaterial(key: string, factory: () => THREE.Material): THREE.Material {
    if (!this.materialCache.has(key)) {
      this.materialCache.set(key, factory());
    }
    return this.materialCache.get(key)!;
  }

  /**
   * 텍스처 최적화 설정 적용
   */
  private static optimizeTexture(texture: THREE.CanvasTexture): void {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
  }

  /**
   * 기본 재질 생성 헬퍼
   */
  private static createBasicMaterial(
    texture: THREE.CanvasTexture,
    options: {
      transparent?: boolean;
      opacity?: number;
      side?: THREE.Side;
      fog?: boolean;
      alphaTest?: number;
      emissive?: THREE.Color;
    } = {}
  ): THREE.MeshLambertMaterial {
    this.optimizeTexture(texture);

    return new THREE.MeshLambertMaterial({
      map: texture,
      transparent: options.transparent || false,
      opacity: options.opacity || 1.0,
      side: options.side || THREE.FrontSide,
      fog: options.fog !== undefined ? options.fog : false,
      ...(options.alphaTest && { alphaTest: options.alphaTest }),
      ...(options.emissive && { emissive: options.emissive })
    });
  }

  /**
   * 벽면용 재질 (커스텀 색상 지원) - 고품질 PBR 재질
   */
  static createWallMaterial(baseColor: string = '#e0e0e0'): THREE.MeshStandardMaterial {
    return this.getCachedMaterial(`wall_${baseColor}`, () => {
      const texture = TextureGenerator.createWallGradientTexture();
      return new THREE.MeshStandardMaterial({
        map: texture,
        color: baseColor,
        roughness: 0.9,  // 벽면은 거친 질감
        metalness: 0.0,  // 벽면은 완전 비금속
        side: THREE.DoubleSide,
        
        // 벽면의 자연스러운 반사
        envMapIntensity: 0.3,
        
        // 미세한 범프맵 효과 (실제 텍스처가 있다면)
        bumpScale: 0.02,
        
        // 색상 보정
        transparent: false,
        opacity: 1.0,
        
        // Z-fighting 방지를 위한 설정
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2
      });
    }) as THREE.MeshStandardMaterial;
  }

  /**
   * 외부 벽면용 재질 - 고품질 PBR 재질
   */
  static createOuterWallMaterial(): THREE.MeshStandardMaterial {
    return this.getCachedMaterial('outerWall', () => {
      const texture = TextureGenerator.createOuterWallGradientTexture();
      return new THREE.MeshStandardMaterial({
        map: texture,
        color: '#f8f8f8',
        roughness: 0.85,  // 외부 벽면은 약간 덜 거칠게
        metalness: 0.0,   // 벽면은 완전 비금속
        side: THREE.DoubleSide,
        
        // 외부 벽면의 미묘한 반사
        envMapIntensity: 0.2,
        
        // 색상과 조명 반응 개선
        transparent: false,
        opacity: 1.0,
        
        // Z-fighting 방지를 위한 설정
        polygonOffset: true,
        polygonOffsetFactor: 3,
        polygonOffsetUnits: 3
      });
    }) as THREE.MeshStandardMaterial;
  }

  /**
   * 바닥용 재질
   */
  static createFloorMaterial(): THREE.MeshLambertMaterial {
    return this.getCachedMaterial('floor', () => {
      const texture = TextureGenerator.createFloorGradientTexture();
      return this.createBasicMaterial(texture);
    }) as THREE.MeshLambertMaterial;
  }

  /**
   * 깊이 기반 외부 벽면용 재질 - StandardMaterial로 변경
   */
  static createDepthBasedWallMaterial(): THREE.MeshStandardMaterial {
    return this.getCachedMaterial('depthWall', () => {
      const texture = TextureGenerator.createDepthBasedWallGradientTexture();
      return new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        fog: false,
        roughness: 0.8,  // 벽면은 약간 거친 질감
        metalness: 0.0   // 벽면은 비금속
      });
    }) as THREE.MeshStandardMaterial;
  }

  /**
   * 깊이 기반 투명도 재질
   */
  static createDepthTransparencyMaterial(): THREE.MeshLambertMaterial {
    return this.getCachedMaterial('depthTransparency', () => {
      const texture = TextureGenerator.createDepthTransparencyTexture();
      return this.createBasicMaterial(texture, {
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        fog: false,
        alphaTest: 0.01,
        emissive: new THREE.Color(0.2, 0.2, 0.2)
      });
    }) as THREE.MeshLambertMaterial;
  }

  /**
   * 방향별 투명도 재질 생성 (좌측, 상단, 우측) - StandardMaterial로 변경
   */
  static createDirectionalTransparencyMaterial(direction: 'left' | 'top' | 'right'): THREE.MeshStandardMaterial {
    // 캐시를 사용하지 않고 매번 새로 생성하여 텍스처 업데이트 강제
    let texture;
    switch (direction) {
      case 'left':
        texture = TextureGenerator.createLeftWallDepthTransparencyTexture();
        break;
      case 'top':
        texture = TextureGenerator.createTopWallDepthTransparencyTexture();
        break;
      case 'right':
        texture = TextureGenerator.createRightWallDepthTransparencyTexture();
        break;
      default:
        texture = TextureGenerator.createDepthTransparencyTexture();
    }
    
    this.optimizeTexture(texture);
    
    return new THREE.MeshStandardMaterial({
      map: texture,
      transparent: false,
      opacity: 1.0,
      side: THREE.DoubleSide,
      fog: false,
      roughness: 0.8,  // 벽면은 약간 거친 질감
      metalness: 0.0   // 벽면은 비금속
    });
  }

  /**
   * 단색 재질 (2D 모드용)
   */
  static createFlatMaterial(color: string = '#ffffff'): THREE.MeshBasicMaterial {
    return this.getCachedMaterial(`flat-${color}`, () => {
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: false,
        fog: false
      });
    }) as THREE.MeshBasicMaterial;
  }

  /**
   * 엣지 라인 재질
   */
  static createEdgeLineMaterial(color: string = '#000000'): THREE.LineBasicMaterial {
    return this.getCachedMaterial(`edge-${color}`, () => {
      return new THREE.LineBasicMaterial({
        color: new THREE.Color(color),
        linewidth: 1
      });
    }) as THREE.LineBasicMaterial;
  }

  /**
   * 자연스러운 가구 재질 (레퍼런스 이미지 스타일)
   */
  static createSolidFrameMaterial(color: string = '#d0d0d0', textureUrl?: string): THREE.MeshStandardMaterial {
    const baseColor = new THREE.Color(color);
    
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      transparent: false,
      
      // 자연스러운 물리적 특성
      metalness: 0.0,  // 완전 비금속
      roughness: 0.4,  // 적당한 거칠기
      
      // 적당한 환경맵 반응
      envMapIntensity: 0.6,
      
      // 미세한 자체발광으로 자연스러운 톤
      emissive: baseColor.clone().multiplyScalar(0.015),
      
      // Z-fighting 방지를 위한 설정
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    // 텍스처가 있는 경우 적용
    if (textureUrl) {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(textureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        material.map = texture;
        material.needsUpdate = true;
      });
    }

    return material;
  }

  /**
   * 단색 벽면용 재질 (이미지 참조용 - 밝은 회색 단색)
   */
  static createSolidWallMaterial(color: string = '#e8e8e8'): THREE.MeshStandardMaterial {
    return this.getCachedMaterial(`solidWall-${color}`, () => {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.8,  // 벽면은 약간 거친 질감
        metalness: 0.0,  // 벽면은 비금속
        side: THREE.DoubleSide,
        transparent: false,
        opacity: 1.0
      });
    }) as THREE.MeshStandardMaterial;
  }

  /**
   * ShaderMaterial 기반 그라데이션 벽면 재질 (확실한 그라데이션 효과)
   */
  static createShaderGradientWallMaterial(direction: 'horizontal' | 'vertical' | 'horizontal-reverse' | 'vertical-reverse' = 'horizontal', viewMode?: '2D' | '3D'): THREE.ShaderMaterial {
    // viewMode가 명시적으로 '2D'가 아니면 3D로 처리
    const is2DMode = viewMode === '2D';
    console.log('🔍 createShaderGradientWallMaterial:', { viewMode, is2DMode, direction });
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vWorldNormal;
      varying vec3 vViewDirection;
      
      void main() {
        vUv = uv;
        vPosition = position;
        
        // 월드 노말과 뷰 방향 계산
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vViewDirection = normalize(cameraPosition - worldPosition.xyz);
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
          const fragmentShader = `
        uniform vec3 colorStart;
        uniform vec3 colorEnd;
        uniform float direction;
        uniform float reverse;
        uniform float isOrthographic;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vWorldNormal;
        varying vec3 vViewDirection;
        
        void main() {
          float gradientFactor;
          
          if (direction < 0.5) {
            // 수평 그라데이션 (0.0 = 왼쪽/앞쪽, 1.0 = 오른쪽/뒤쪽)
            gradientFactor = vUv.x;
          } else {
            // 수직 그라데이션 (0.0 = 아래/앞쪽, 1.0 = 위/뒤쪽)
            gradientFactor = vUv.y;
          }
          
          // reverse가 1.0이면 그라데이션 방향 반전
          if (reverse > 0.5) {
            gradientFactor = 1.0 - gradientFactor;
          }
          
          vec3 color = mix(colorStart, colorEnd, gradientFactor);
          
          // orthographic(2D) 모드에서만 투명도 계산
          // 3D 모드에서는 항상 불투명 (opacity = 1.0)
          float opacity = 1.0;
          if (isOrthographic > 0.5) {
            // 2D 모드에서만 투명도 적용
            // 뷰 방향과 노말의 내적으로 각도 계산
            float dotProduct = abs(dot(vWorldNormal, vViewDirection));
            
            // 카메라가 면을 뒤에서 보거나 옆에서 보면 투명하게
            // dotProduct가 작을수록 (뒤에서 보는 각도) 더 투명하게
            if (dotProduct < 0.2) {
              opacity = 0.05; // 거의 완전 투명
            } else if (dotProduct < 0.5) {
              opacity = 0.2 + (dotProduct - 0.2) * 2.0; // 부드러운 전환
            } else {
              opacity = 0.8; // 정면에서 봐도 약간 투명
            }
          }
          // isOrthographic가 0이면 (3D 모드) opacity는 1.0 유지
          
          gl_FragColor = vec4(color, opacity);
        }
      `;
    
          const isReverse = direction === 'horizontal-reverse' || direction === 'vertical-reverse';
      const directionValue = direction === 'vertical' || direction === 'vertical-reverse' ? 1.0 : 0.0;
      
      return new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          colorStart: { value: new THREE.Color('#ffffff') }, // 앞쪽: 흰색
          colorEnd: { value: new THREE.Color('#c0c0c0') },   // 뒤쪽: 아주 살짝 더 진한 회색 (#c8c8c8 → #c0c0c0)
          direction: { value: directionValue },
          reverse: { value: isReverse ? 1.0 : 0.0 },
          isOrthographic: { value: is2DMode ? 1.0 : 0.0 }
        },
        side: THREE.DoubleSide,
        transparent: is2DMode // 2D 모드에서만 투명 처리
      });
  }

  /**
   * 코너용 셰이더 재질 (모서리 그라데이션 효과)
   */
  static createCornerShaderMaterial(): THREE.ShaderMaterial {
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      
      void main() {
        vUv = uv;
        vPosition = position;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform vec3 centerColor;
      uniform vec3 edgeColor;
      uniform float intensity;
      
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      
      void main() {
        // UV 좌표를 이용한 거리 계산 (중앙에서 가장자리로)
        vec2 center = vec2(0.5, 0.5);
        float distanceFromCenter = distance(vUv, center);
        
        // 0.0 (중앙)에서 0.707 (코너)까지의 거리를 0-1로 정규화
        float normalizedDistance = min(distanceFromCenter / 0.707, 1.0);
        
        // 강도 조절
        float gradientFactor = pow(normalizedDistance, intensity);
        
        vec3 color = mix(centerColor, edgeColor, gradientFactor);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        centerColor: { value: new THREE.Color('#ffffff') }, // 중앙: 흰색
        edgeColor: { value: new THREE.Color('#dddddd') },   // 가장자리: 연한 회색
        intensity: { value: 1.5 }  // 그라데이션 강도
      },
      side: THREE.DoubleSide,
      transparent: false
    });
  }

  /**
   * 모서리 음영용 어두운 재질
   */
  static createEdgeShadowMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: '#888888', // 어두운 회색
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
  }

  /**
   * 캐시 정리 (메모리 관리)
   */
  static clearCache(): void {
    this.materialCache.forEach(material => {
      material.dispose();
    });
    this.materialCache.clear();
  }

  /**
   * 전역 에지 라인 재질 가져오기 (싱글톤 패턴)
   */
  static getGlobalEdgeLineMaterial(): THREE.LineBasicMaterial {
    if (!this.globalEdgeLineMaterial) {
      this.globalEdgeLineMaterial = this.createEdgeLineMaterial('#000000');
    }
    return this.globalEdgeLineMaterial;
  }
} 