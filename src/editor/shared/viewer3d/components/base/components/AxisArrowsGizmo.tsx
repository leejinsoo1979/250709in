import React, { useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useUIStore } from '@/store/uiStore';
import * as THREE from 'three';

// 외부에서 메인 카메라 상태를 받기 위한 전역
export const mainCameraQuaternion = new THREE.Quaternion();
// 클릭 시 뷰 전환 요청을 ThreeCanvas로 전달하기 위한 콜백 핸들러
export type ViewName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
export const viewCubeRequest = {
  handler: null as ((view: ViewName) => void) | null,
};

// ───────── 라벨 텍스처 ─────────
const createFaceTexture = (text: string): THREE.Texture => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // 배경 (연한 회색)
  ctx.fillStyle = '#e8ecf0';
  ctx.fillRect(0, 0, size, size);

  // 테두리
  ctx.strokeStyle = '#a8b0b8';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  // 텍스트
  ctx.font = 'italic 600 60px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#404040';
  ctx.fillText(text, size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  return tex;
};

// 호버 시 강조 텍스처
const createFaceTextureHover = (text: string): THREE.Texture => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#c8e6ff'; // 호버 시 파랑 톤
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#3d8bff';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  ctx.font = 'italic 600 60px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a4a8a';
  ctx.fillText(text, size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  return tex;
};

// 컴퍼스 링 텍스처 (W/N/E/S)
const createCompassTexture = (): THREE.Texture => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.48;
  const rInner = size * 0.34;

  // 외곽 링
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(180, 190, 200, 0.55)';
  ctx.fill();

  // 4방위 라벨
  const labelR = (rOuter + rInner) / 2;
  const directions: Array<{ text: string; angle: number }> = [
    { text: 'N', angle: -Math.PI / 2 },
    { text: 'E', angle: 0 },
    { text: 'S', angle: Math.PI / 2 },
    { text: 'W', angle: Math.PI },
  ];
  ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3a4550';
  directions.forEach(({ text, angle }) => {
    const x = cx + Math.cos(angle) * labelR;
    const y = cy + Math.sin(angle) * labelR;
    ctx.fillText(text, x, y);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
};

// ───────── 큐브 면 정의 ─────────
// 방을 축소한 큐브처럼 보이게 한다. 앞쪽(+Z)은 열려 있고, 안쪽 뒷벽(-Z)이 Front 배치면이다.
const FACES: Array<{ view: ViewName; label: string; normal: [number, number, number]; innerNormal: [number, number, number] }> = [
  { view: 'right', label: 'Right', normal: [1, 0, 0], innerNormal: [-1, 0, 0] },
  { view: 'left', label: 'Left', normal: [-1, 0, 0], innerNormal: [1, 0, 0] },
  { view: 'top', label: 'Top', normal: [0, 1, 0], innerNormal: [0, -1, 0] },
  { view: 'bottom', label: 'Bottom', normal: [0, -1, 0], innerNormal: [0, 1, 0] },
  { view: 'front', label: 'Front', normal: [0, 0, -1], innerNormal: [0, 0, 1] },
];

// ───────── ViewCube 본체 ─────────
const ViewCube: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<ViewName | null>(null);

  // 면별 텍스처(노말+호버)를 미리 만들어 캐시
  const textures = useMemo(() => {
    const out: Record<string, { base: THREE.Texture; hover: THREE.Texture }> = {};
    FACES.forEach((f) => {
      out[f.view] = {
        base: createFaceTexture(f.label),
        hover: createFaceTextureHover(f.label),
      };
    });
    return out;
  }, []);

  // 메인 카메라 회전을 큐브에 그대로 반영 (역회전)
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.quaternion.copy(mainCameraQuaternion).invert();
  });

  const cubeSize = 1.05; // 약간 줄임
  const handleClick = useCallback((view: ViewName) => {
    viewCubeRequest.handler?.(view);
  }, []);

  return (
    // 큐브 그룹을 위로 살짝 올림 (컴퍼스 링과 간격 확보)
    <group ref={groupRef} position={[0, 0.25, 0]}>
      {FACES.map((face) => {
        const normal = new THREE.Vector3(...face.normal);
        const innerNormal = new THREE.Vector3(...face.innerNormal);
        const pos = normal.clone().multiplyScalar(cubeSize / 2);
        const innerPos = pos.clone().add(innerNormal.clone().multiplyScalar(0.006));
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        const innerQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), innerNormal);
        const isHover = hovered === face.view;
        return (
          <group key={face.view}>
            <mesh
              position={pos.toArray()}
              quaternion={quat}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(face.view);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHovered(null);
                document.body.style.cursor = '';
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleClick(face.view);
              }}
            >
              <planeGeometry args={[cubeSize, cubeSize]} />
              <meshBasicMaterial
                map={isHover ? textures[face.view].hover : textures[face.view].base}
                toneMapped={false}
                side={THREE.FrontSide}
              />
            </mesh>
            <mesh
              position={innerPos.toArray()}
              quaternion={innerQuat}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(face.view);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHovered(null);
                document.body.style.cursor = '';
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleClick(face.view);
              }}
            >
              <planeGeometry args={[cubeSize * 0.92, cubeSize * 0.92]} />
              <meshBasicMaterial
                map={isHover ? textures[face.view].hover : textures[face.view].base}
                toneMapped={false}
                side={THREE.FrontSide}
                transparent
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

// ───────── 컴퍼스 링 (큐브 아래, 월드 고정) ─────────
const CompassRing: React.FC = () => {
  const texture = useMemo(createCompassTexture, []);
  return (
    <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[2.4, 2.4]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
};

// ───────── 카메라 setup (메인 뷰 cameraMode 따라 perspective/orthographic 전환) ─────────
const GizmoCameraSetup: React.FC<{ mode: 'perspective' | 'orthographic' }> = ({ mode }) => {
  const { set } = useThree();

  useMemo(() => {
    if (mode === 'perspective') {
      const pcam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      // lookAt 위로 → 기즈모가 캔버스 위쪽에 위치
      pcam.position.set(0, 0.8, 5.5);
      pcam.lookAt(0, 0.4, 0);
      set({ camera: pcam });
    } else {
      const d = 1.7;
      const ocam = new THREE.OrthographicCamera(-d, d, d, -d, 0.1, 100);
      ocam.position.set(0, 0.5, 4.5);
      ocam.lookAt(0, 0.5, 0);
      set({ camera: ocam });
    }
  }, [mode, set]);

  return null;
};

/**
 * Autodesk Fusion 스타일 ViewCube 기즈모.
 * - 6면 라벨(Top/Bottom/Front/Back/Left/Right) + 컴퍼스 링(N/E/S/W)
 * - 면 클릭 → viewCubeRequest.handler 호출로 메인 뷰 시점 전환 요청
 * - 메인 카메라 회전 → 큐브 quaternion에 동기화 (실시간)
 */
const AxisArrowsGizmo: React.FC = () => {
  const cameraMode = useUIStore((s) => s.cameraMode);
  const mode: 'perspective' | 'orthographic' =
    cameraMode === 'orthographic' ? 'orthographic' : 'perspective';

  return (
    <div
      style={{
        position: 'absolute',
        top: -55,
        left: 4,
        width: 170,
        height: 170,
        pointerEvents: 'auto',
        zIndex: 100,
        background: 'transparent',
        backgroundColor: 'transparent',
      }}
    >
      <Canvas
        gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
        style={{
          background: 'transparent',
          backgroundColor: 'transparent'
        }}
        dpr={[1, 2]}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 0);
          gl.setClearAlpha(0);
          scene.background = null;
        }}
      >
        <GizmoCameraSetup mode={mode} />
        <ambientLight intensity={1} />
        <ViewCube />
        <CompassRing />
      </Canvas>
    </div>
  );
};

export default AxisArrowsGizmo;
