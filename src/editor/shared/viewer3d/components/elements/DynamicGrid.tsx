import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';

interface DynamicGridProps {
  viewMode: '2D' | '3D';
  enabled?: boolean;
  maxDrawDistance?: number;
  gridOpacity?: number;
  showAxisLines?: boolean;
  enableSnapping?: boolean;
}

/**
 * 고성능 동적 무한 그리드 시스템
 * Shader 기반으로 성능을 극대화한 CAD 스타일 그리드
 */
const DynamicGrid: React.FC<DynamicGridProps> = ({
  viewMode,
  enabled = true,
  maxDrawDistance = 1000,
  gridOpacity = 0.5,
  showAxisLines = true,
  enableSnapping = false
}) => {
  const { camera, size } = useThree();
  const gridMeshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  const { spaceInfo } = useSpaceConfigStore();
  
  // 커스텀 그리드 셰이더
  const gridShader = useMemo(() => ({
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vCameraPosition;
      
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vCameraPosition = cameraPosition;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uCameraDistance;
      uniform float uGridOpacity;
      uniform vec3 uGridColor;
      uniform vec3 uAxisColor;
      uniform bool uShowAxis;
      uniform float uFadeDistance;
      
      varying vec3 vWorldPosition;
      varying vec3 vCameraPosition;
      
      float getGridIntensity(vec2 pos, float scale, float lineWidth) {
        vec2 grid = abs(fract(pos * scale - 0.5) - 0.5);
        vec2 gridDerivative = fwidth(pos * scale);
        grid = grid / gridDerivative;
        float line = min(grid.x, grid.y);
        return 1.0 - min(line, 1.0);
      }
      
      void main() {
        vec2 worldPos = vWorldPosition.xy;
        float distanceToCamera = length(vCameraPosition - vWorldPosition);
        
        // 카메라 거리에 따른 그리드 스케일 자동 조정
        float baseScale = 1.0;
        float minorScale = 10.0;
        
        if (uCameraDistance < 3.0) {
          baseScale = 10.0;   // 100mm 간격
          minorScale = 100.0; // 10mm 간격
        } else if (uCameraDistance < 8.0) {
          baseScale = 2.0;    // 500mm 간격
          minorScale = 10.0;  // 50mm 간격
        } else if (uCameraDistance < 20.0) {
          baseScale = 1.0;    // 1000mm (1m) 간격
          minorScale = 10.0;  // 100mm 간격
        } else if (uCameraDistance < 50.0) {
          baseScale = 0.5;    // 2000mm (2m) 간격
          minorScale = 2.0;   // 500mm 간격
        } else {
          baseScale = 0.2;    // 5000mm (5m) 간격
          minorScale = 1.0;   // 1000mm 간격
        }
        
        // 주요 그리드와 보조 그리드 계산
        float majorGrid = getGridIntensity(worldPos, baseScale, 2.0);
        float minorGrid = getGridIntensity(worldPos, minorScale, 1.5);
        
        // 축 라인 계산 (더 두껍게)
        float axisLine = 0.0;
        if (uShowAxis) {
          float xAxis = 1.0 - smoothstep(0.0, 0.02, abs(worldPos.y));
          float yAxis = 1.0 - smoothstep(0.0, 0.02, abs(worldPos.x));
          axisLine = max(xAxis, yAxis);
        }
        
        // 거리에 따른 페이드 아웃 (덜 급격하게)
        float fadeStart = uFadeDistance * 0.7;
        float fadeEnd = uFadeDistance;
        float fadeFactor = 1.0 - smoothstep(fadeStart, fadeEnd, distanceToCamera);
        
        // 최종 그리드 강도 계산 (더 선명하게)
        float gridIntensity = max(majorGrid * 0.9, minorGrid * 0.4);
        
        // 색상 믹싱
        vec3 finalColor = mix(uGridColor, uAxisColor, axisLine);
        float finalOpacity = max(gridIntensity, axisLine * 0.8) * uGridOpacity * fadeFactor;
        
        // 최소 투명도 높이기 (더 잘 보이게)
        if (finalOpacity < 0.05) discard;
        
        gl_FragColor = vec4(finalColor, finalOpacity);
      }
    `
  }), []);
  
  // 그리드 지오메트리 (매우 큰 평면)
  const geometry = useMemo(() => {
    const size = maxDrawDistance * 2;
    return new THREE.PlaneGeometry(size, size, 1, 1);
  }, [maxDrawDistance]);
  
  // 카메라 거리 계산
  const cameraDistance = useMemo(() => {
    if (viewMode === '3D') return 0;
    return camera.position.length();
  }, [camera.position, viewMode]);
  
  // 셰이더 유니폼 업데이트
  useFrame((state) => {
    if (!enabled || viewMode === '3D' || !materialRef.current) return;
    
    const material = materialRef.current;
    
    // 카메라 거리 업데이트
    const distance = state.camera.position.length();
    material.uniforms.uCameraDistance.value = distance;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uFadeDistance.value = maxDrawDistance;
    
    // 디버깅: 그리드 상태 로그 (2초마다)
    if (Math.floor(state.clock.elapsedTime) % 2 === 0 && state.clock.elapsedTime % 1 < 0.1) {
      console.log('🔲 DynamicGrid 상태:', {
        enabled,
        viewMode,
        distance,
        opacity: material.uniforms.uGridOpacity.value,
        meshVisible: gridMeshRef.current?.visible,
        materialUniforms: Object.keys(material.uniforms)
      });
    }
    
    // 그리드를 카메라 중심으로 이동 (무한 그리드 효과)
    if (gridMeshRef.current) {
      const cameraPos = state.camera.position;
      gridMeshRef.current.position.set(
        cameraPos.x,
        cameraPos.y,
        -0.001
      );
    }
  });
  
  // 스냅 기능을 위한 헬퍼 함수
  const snapToGrid = useMemo(() => {
    if (!enableSnapping) return null;
    
    return (worldPosition: THREE.Vector3): THREE.Vector3 => {
      const distance = camera.position.length();
      
      let snapSize = 1.0; // 기본 1m 스냅
      if (distance < 2) snapSize = 0.01;      // 10mm
      else if (distance < 5) snapSize = 0.05;  // 50mm
      else if (distance < 10) snapSize = 0.1;  // 100mm
      else if (distance < 20) snapSize = 0.5;  // 500mm
      else if (distance < 50) snapSize = 1.0;  // 1000mm
      else snapSize = 5.0;                     // 5000mm
      
      return new THREE.Vector3(
        Math.round(worldPosition.x / snapSize) * snapSize,
        Math.round(worldPosition.y / snapSize) * snapSize,
        worldPosition.z
      );
    };
  }, [camera.position, enableSnapping]);
  
  // 스냅 함수를 글로벌로 노출 (다른 컴포넌트에서 사용 가능)
  useEffect(() => {
    if (snapToGrid && enableSnapping) {
      (window as any).snapToGrid = snapToGrid;
    }
    
    return () => {
      if ((window as any).snapToGrid) {
        delete (window as any).snapToGrid;
      }
    };
  }, [snapToGrid, enableSnapping]);
  
  if (!enabled || viewMode === '3D') {
    return null;
  }
  
  return (
    <mesh 
      ref={gridMeshRef}
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-1000}
      position={[0, 0, -0.001]}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={gridShader.vertexShader}
        fragmentShader={gridShader.fragmentShader}
        uniforms={{
          uTime: { value: 0 },
          uCameraDistance: { value: cameraDistance },
          uGridOpacity: { value: gridOpacity },
          uGridColor: { value: new THREE.Color('#888888') },
          uAxisColor: { value: new THREE.Color('#ff0000') },
          uShowAxis: { value: showAxisLines },
          uFadeDistance: { value: maxDrawDistance }
        }}
        transparent
        depthWrite={false}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

export default DynamicGrid;