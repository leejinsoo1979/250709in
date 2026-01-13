import { useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { useCustomFurnitureStore, CustomFurnitureData, CustomPanel } from '@/store/core/customFurnitureStore';

/**
 * 패널 명명 규칙 매핑
 * SketchUp에서 사용하는 이름 → 내부 시스템 이름
 */
const PANEL_NAME_MAP: Record<string, string> = {
  // 영문 이름
  'LeftPanel': '좌측판',
  'RightPanel': '우측판',
  'TopPanel': '상판',
  'BottomPanel': '바닥판',
  'BackPanel': '백패널',
  'UpperLeftPanel': '(상)좌측',
  'UpperRightPanel': '(상)우측',
  'LowerLeftPanel': '(하)좌측',
  'LowerRightPanel': '(하)우측',
  'UpperTopPanel': '(상)상판',
  'LowerBottomPanel': '(하)바닥',
  'UpperBottomPanel': '(상)바닥',
  'LowerTopPanel': '(하)상판',
  'MiddlePanel': '중간판',
  'UpperBackPanel': '(상)백패널',
  'LowerBackPanel': '(하)백패널',
  'Shelf': '선반',
  'Drawer': '서랍',
  'Door': '도어',
  'ClothingRod': '옷걸이봉',
  'EndPanel': '엔드패널',
  'LeftEndPanel': '좌측엔드패널',
  'RightEndPanel': '우측엔드패널',
  'MullionPanel': '멍장패널',
  'PantsHanger': '바지걸이',
};

/**
 * 인식되는 패널 이름 패턴
 */
const PANEL_PATTERNS = [
  /^(Left|Right|Top|Bottom|Back|Middle|Upper|Lower|End|Mullion).*Panel/i,
  /^Shelf(_\d+)?$/i,
  /^Drawer(_\d+)?$/i,
  /^Door(_\w+)?$/i,
  /^ClothingRod(_\d+)?$/i,
  /^PantsHanger(_\d+)?$/i,
  // 한글 이름도 지원
  /^(좌측판|우측판|상판|바닥판|백패널|중간판|선반|서랍|도어)/,
  /^\((상|하)\)/,
];

/**
 * 객체가 패널인지 확인
 */
const isPanelObject = (name: string): boolean => {
  return PANEL_PATTERNS.some(pattern => pattern.test(name));
};

/**
 * 패널 이름 정규화 (영문 → 한글)
 */
const normalizePanelName = (name: string): string => {
  // 숫자 접미사 분리 (예: Shelf_1 → Shelf + _1)
  const match = name.match(/^(.+?)(_\d+)?$/);
  if (!match) return name;

  const baseName = match[1];
  const suffix = match[2] || '';

  // 매핑된 한글 이름 찾기
  const koreanName = PANEL_NAME_MAP[baseName] || baseName;

  return koreanName + suffix;
};

/**
 * 바운딩 박스 계산
 */
const calculateBoundingBox = (object: THREE.Object3D): THREE.Box3 => {
  const box = new THREE.Box3();
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  return box;
};

/**
 * 객체 크기 계산 (mm 단위)
 */
const calculateSize = (object: THREE.Object3D, scale: number = 10): { width: number; height: number; depth: number } => {
  const box = calculateBoundingBox(object);
  const size = box.getSize(new THREE.Vector3());

  return {
    width: Math.round(size.x * scale * 100) / 100,
    height: Math.round(size.y * scale * 100) / 100,
    depth: Math.round(size.z * scale * 100) / 100,
  };
};

/**
 * 객체 위치 계산 (mm 단위)
 */
const calculatePosition = (object: THREE.Object3D, scale: number = 10): { x: number; y: number; z: number } => {
  const box = calculateBoundingBox(object);
  const center = box.getCenter(new THREE.Vector3());

  return {
    x: Math.round(center.x * scale * 100) / 100,
    y: Math.round(center.y * scale * 100) / 100,
    z: Math.round(center.z * scale * 100) / 100,
  };
};

interface LoadResult {
  success: boolean;
  furniture?: CustomFurnitureData;
  error?: string;
}

/**
 * 커스텀 가구 로더 훅
 */
export const useCustomFurnitureLoader = () => {
  const { addCustomFurniture, setLoading, setError } = useCustomFurnitureStore();

  /**
   * 3D 모델에서 패널 추출
   */
  const extractPanels = useCallback((scene: THREE.Object3D, scale: number = 10): CustomPanel[] => {
    const panels: CustomPanel[] = [];

    scene.traverse((child) => {
      const name = child.name || '';

      // 패널 이름 패턴 매칭
      if (isPanelObject(name)) {
        const normalizedName = normalizePanelName(name);
        const size = calculateSize(child, scale);
        const position = calculatePosition(child, scale);

        // 메쉬인 경우 지오메트리 클론
        let geometry: THREE.BufferGeometry | undefined;
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) {
            geometry = mesh.geometry.clone();
          }
        }

        panels.push({
          name: normalizedName,
          originalSize: size,
          originalPosition: position,
          geometry,
        });

        console.log(`📦 패널 발견: ${name} → ${normalizedName}`, size);
      }
    });

    return panels;
  }, []);

  /**
   * 전체 모델 크기 계산
   */
  const calculateModelDimensions = useCallback((scene: THREE.Object3D, scale: number = 10) => {
    const box = calculateBoundingBox(scene);
    const size = box.getSize(new THREE.Vector3());

    return {
      width: Math.round(size.x * scale * 100) / 100,
      height: Math.round(size.y * scale * 100) / 100,
      depth: Math.round(size.z * scale * 100) / 100,
    };
  }, []);

  /**
   * Z-up → Y-up 좌표계 변환 (SketchUp → Three.js)
   */
  const convertZUpToYUp = useCallback((scene: THREE.Object3D): THREE.Object3D => {
    const wrapper = new THREE.Group();
    wrapper.add(scene);
    // Z-up → Y-up: X축 기준 90도 회전
    wrapper.rotation.x = -Math.PI / 2;
    wrapper.updateMatrixWorld(true);
    return wrapper;
  }, []);

  /**
   * GLB/GLTF 파일 로드
   */
  const loadGLTF = useCallback(async (file: File): Promise<THREE.Object3D> => {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      const reader = new FileReader();

      reader.onload = (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;

        loader.parse(
          arrayBuffer,
          '',
          (gltf) => {
            console.log('✅ GLTF 로드 완료:', gltf);
            resolve(gltf.scene);
          },
          (error) => {
            reject(new Error(`GLTF 파싱 오류: ${error}`));
          }
        );
      };

      reader.onerror = () => reject(new Error('파일 읽기 오류'));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  /**
   * DAE (Collada) 파일 로드
   */
  const loadDAE = useCallback(async (file: File): Promise<THREE.Object3D> => {
    return new Promise((resolve, reject) => {
      const loader = new ColladaLoader();
      const reader = new FileReader();

      reader.onload = (event) => {
        const text = event.target?.result as string;

        try {
          const collada = loader.parse(text, '');
          console.log('✅ Collada 로드 완료:', collada);

          // SketchUp DAE는 Z-up이므로 변환 필요
          const converted = convertZUpToYUp(collada.scene);
          resolve(converted);
        } catch (error) {
          reject(new Error(`Collada 파싱 오류: ${error}`));
        }
      };

      reader.onerror = () => reject(new Error('파일 읽기 오류'));
      reader.readAsText(file);
    });
  }, [convertZUpToYUp]);

  /**
   * OBJ 파일 로드
   */
  const loadOBJ = useCallback(async (file: File): Promise<THREE.Object3D> => {
    return new Promise((resolve, reject) => {
      const loader = new OBJLoader();
      const reader = new FileReader();

      reader.onload = (event) => {
        const text = event.target?.result as string;

        try {
          const obj = loader.parse(text);
          console.log('✅ OBJ 로드 완료:', obj);

          // SketchUp OBJ는 Z-up이므로 변환 필요
          const converted = convertZUpToYUp(obj);
          resolve(converted);
        } catch (error) {
          reject(new Error(`OBJ 파싱 오류: ${error}`));
        }
      };

      reader.onerror = () => reject(new Error('파일 읽기 오류'));
      reader.readAsText(file);
    });
  }, [convertZUpToYUp]);

  /**
   * 썸네일 생성
   */
  const generateThumbnail = useCallback(async (scene: THREE.Object3D): Promise<string> => {
    return new Promise((resolve) => {
      // 간단한 렌더러 생성
      const width = 200;
      const height = 200;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setClearColor(0xf5f5f5, 1);

      // 씬 설정
      const thumbnailScene = new THREE.Scene();
      thumbnailScene.background = new THREE.Color(0xf5f5f5);

      // 조명 추가
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 10, 7);
      thumbnailScene.add(ambientLight);
      thumbnailScene.add(directionalLight);

      // 모델 클론 추가
      const modelClone = scene.clone();
      thumbnailScene.add(modelClone);

      // 바운딩 박스로 카메라 위치 계산
      const box = calculateBoundingBox(modelClone);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // 카메라 설정
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(
        center.x + maxDim * 1.5,
        center.y + maxDim * 0.8,
        center.z + maxDim * 1.5
      );
      camera.lookAt(center);

      // 렌더링
      renderer.render(thumbnailScene, camera);

      // 이미지 추출
      const dataUrl = renderer.domElement.toDataURL('image/png');

      // 정리
      renderer.dispose();

      resolve(dataUrl);
    });
  }, []);

  /**
   * 파일 타입 감지
   */
  const detectFileType = useCallback((file: File): 'dae' | 'glb' | 'gltf' | 'obj' | null => {
    const extension = file.name.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'dae':
        return 'dae';
      case 'glb':
        return 'glb';
      case 'gltf':
        return 'gltf';
      case 'obj':
        return 'obj';
      default:
        return null;
    }
  }, []);

  /**
   * 카테고리 자동 감지 (높이 기반)
   */
  const detectCategory = useCallback((dimensions: { height: number }): 'full' | 'upper' | 'lower' => {
    const height = dimensions.height;

    if (height <= 800) {
      return 'upper';
    } else if (height <= 1200) {
      return 'lower';
    } else {
      return 'full';
    }
  }, []);

  /**
   * 커스텀 가구 파일 로드
   */
  const loadCustomFurniture = useCallback(async (
    file: File,
    options?: {
      name?: string;
      category?: 'full' | 'upper' | 'lower';
      scaleMode?: 'uniform' | 'non-uniform' | 'fixed';
      customThumbnail?: string; // 사용자가 업로드한 썸네일 (base64)
    }
  ): Promise<LoadResult> => {
    try {
      setLoading(true, 0);
      setError(null);

      console.log('📂 커스텀 가구 로드 시작:', file.name);

      // 파일 타입 감지
      const fileType = detectFileType(file);
      if (!fileType) {
        throw new Error('지원하지 않는 파일 형식입니다. (DAE, GLB, GLTF, OBJ 지원)');
      }

      setLoading(true, 20);

      // 파일 타입별 로더 선택
      let scene: THREE.Object3D;

      switch (fileType) {
        case 'glb':
        case 'gltf':
          scene = await loadGLTF(file);
          break;
        case 'dae':
          scene = await loadDAE(file);
          break;
        case 'obj':
          scene = await loadOBJ(file);
          break;
        default:
          throw new Error('지원하지 않는 파일 형식입니다.');
      }

      setLoading(true, 50);

      // 월드 매트릭스 업데이트
      scene.updateMatrixWorld(true);

      // 전체 크기 계산 (SketchUp 단위 → mm 변환, 1unit = 1mm로 가정)
      // SketchUp 기본 단위가 인치일 수 있으므로 스케일 조정 필요
      const scale = 1; // mm 단위로 모델링했다고 가정
      const dimensions = calculateModelDimensions(scene, scale);

      console.log('📏 모델 크기:', dimensions);

      setLoading(true, 70);

      // 패널 추출
      const panels = extractPanels(scene, scale);

      console.log(`📦 발견된 패널 수: ${panels.length}`);

      if (panels.length === 0) {
        console.warn('⚠️ 인식된 패널이 없습니다. 패널 명명 규칙을 확인하세요.');
      }

      setLoading(true, 85);

      // 썸네일 생성 (사용자가 업로드한 썸네일이 있으면 사용, 없으면 자동 생성)
      const thumbnail = options?.customThumbnail || await generateThumbnail(scene);

      setLoading(true, 95);

      // 커스텀 가구 데이터 생성
      const customFurniture: CustomFurnitureData = {
        id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: options?.name || file.name.replace(/\.[^/.]+$/, ''),
        fileName: file.name,
        fileType,
        category: options?.category || detectCategory(dimensions),
        originalDimensions: dimensions,
        panels,
        scaleMode: options?.scaleMode || 'non-uniform',
        thumbnail,
        createdAt: Date.now(),
      };

      // 스토어에 추가
      addCustomFurniture(customFurniture);

      setLoading(false, 100);

      console.log('✅ 커스텀 가구 로드 완료:', customFurniture);

      return {
        success: true,
        furniture: customFurniture,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      console.error('❌ 커스텀 가구 로드 오류:', errorMessage);
      setError(errorMessage);
      setLoading(false, 0);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }, [
    setLoading,
    setError,
    detectFileType,
    loadGLTF,
    loadDAE,
    loadOBJ,
    calculateModelDimensions,
    extractPanels,
    generateThumbnail,
    detectCategory,
    addCustomFurniture,
  ]);

  return {
    loadCustomFurniture,
    extractPanels,
    calculateModelDimensions,
    generateThumbnail,
    PANEL_NAME_MAP,
    PANEL_PATTERNS,
  };
};
