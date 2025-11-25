import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { ProjectSummary } from '@/firebase/types';

/**
 * 2D/3D 뷰어에서 사용되는 공통 props 인터페이스
 */
export interface ViewerBaseProps {
  /** 공간 정보 */
  spaceInfo?: SpaceInfo;
  /** SVG 크기 정보 */
  svgSize?: { width: number; height: number };
  /** 뷰 모드 (2D 또는 3D) */
  viewMode?: '2D' | '3D';
}

/**
 * 3D 뷰어 전용 props 인터페이스
 */
export interface Space3DViewProps extends ViewerBaseProps {
  /** 뷰 모드 변경 함수 */
  setViewMode?: (mode: '2D' | '3D') => void;
  /** 렌더링 모드 (solid 또는 wireframe) */
  renderMode?: 'solid' | 'wireframe';
  /** 가이드 표시 여부 */
  showAll?: boolean;
  /** 가구 표시 여부 */
  showFurniture?: boolean;
  /** 뷰어 전용 모드 여부 */
  isViewerOnly?: boolean;
  /** 프로젝트 데이터 (뷰어 모드용) */
  project?: ProjectSummary;
  /** 프레임 표시 여부 (Step 2에서는 false) */
  showFrame?: boolean;
  /** 치수 표시 여부 */
  showDimensions?: boolean;
  /** 임베디드 모드 여부 */
  isEmbedded?: boolean;
  /** Step 2 모드 (공간 높이와 폭만 표시) */
  isStep2?: boolean;
  /** 현재 활성 영역 (단내림 사용 시) */
  activeZone?: 'normal' | 'dropped';
  /** 외곽선 숨김 (PDF 캡처 시 사용) */
  hideEdges?: boolean;
  /** 읽기 전용 모드 (viewer 권한) */
  readOnly?: boolean;
  /** 3D 씬 참조 (GLB 내보내기용) */
  sceneRef?: React.MutableRefObject<any>;
  /** 가구 클릭 시 콜백 (미리보기에서 측면뷰로 전환용) */
  onFurnitureClick?: (furnitureId: string, slotIndex: number) => void;
}

/**
 * SVG 뷰어 전용 props 인터페이스
 */
export interface Space2DViewProps extends ViewerBaseProps {
  /** 추가 SVG 관련 설정 */
  className?: string;
}

/**
 * 드래그 미리보기 데이터 타입 정의
 */
export interface DragPreviewData {
  moduleData: {
    id: string;
    name: string;
    dimensions: { width: number; height: number; depth: number };
    type: string;
    hasDoor?: boolean;
  };
  targetColumn: number;
  isBlocked: boolean;
}

/**
 * 3D 오브젝트 스타일 타입 정의
 */
export interface Object3DStyles {
  room: {
    floor: {
      color: string;
      roughness: number;
    };
    walls: {
      color: string;
      roughness: number;
    };
  };
  furniture: {
    color: string;
    roughness: number;
  };
} 