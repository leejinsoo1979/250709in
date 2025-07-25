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
  /** 뷰어 전용 모드 여부 */
  isViewerOnly?: boolean;
  /** 프로젝트 데이터 (뷰어 모드용) */
  project?: ProjectSummary;
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