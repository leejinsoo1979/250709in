/**
 * 프로젝트 데이터베이스 스키마 정의
 * Step1-3에서 수집되는 모든 데이터의 완벽한 타입 정의
 */

import { Timestamp } from 'firebase/firestore';

// ========================
// STEP 1: 기본 정보 (Basic Info)
// ========================

export interface ProjectBasicInfo {
  /** 디자인 제목 */
  title: string;
  /** 설치 위치 */
  location: string;
  /** 생성일시 */
  createdAt: Timestamp;
  /** 수정일시 */
  updatedAt: Timestamp;
  /** 프로젝트 버전 */
  version: string;
  /** 프로젝트 설명 (선택사항) */
  description?: string;
  /** 고객 정보 (선택사항) */
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
}

// ========================
// STEP 2: 공간 정보 (Space Configuration)
// ========================

/** 설치 타입 */
export type InstallType = 'builtin' | 'standalone' | 'freestanding';

/** 벽 위치 (세미스탠딩 전용) */
export type WallPosition = 'left' | 'right';

/** 에이전트 단내팀 위치 */
export type AgentDamperPosition = 'none' | 'left' | 'right' | 'both';

/** 공간 치수 정보 */
export interface SpaceDimensions {
  /** 폭 (mm) */
  width: number;
  /** 높이 (mm) */
  height: number;
  /** 깊이 (mm) */
  depth: number;
}

/** 단내팀 설정 */
export interface DamperConfig {
  /** 에이전트 단내팀 위치 */
  agentPosition: AgentDamperPosition;
  /** 단내팀 크기 */
  size: {
    /** 폭 (mm) */
    width: number;
    /** 높이 (mm) */
    height: number;
  };
}

/** 바닥 마감재 설정 */
export interface FloorFinishConfig {
  /** 바닥 마감재 사용 여부 */
  enabled: boolean;
  /** 바닥 마감재 높이 (mm) */
  height: number;
}

/** STEP 2 공간 설정 통합 데이터 */
export interface SpaceConfiguration {
  /** 공간 치수 */
  dimensions: SpaceDimensions;
  /** 설치 타입 */
  installType: InstallType;
  /** 벽 위치 (세미스탠딩인 경우만) */
  wallPosition?: WallPosition;
  /** 단내팀 설정 */
  damper: DamperConfig;
  /** 바닥 마감재 설정 */
  floorFinish: FloorFinishConfig;
}

// ========================
// STEP 3: 맞춤 배치 설정 (Custom Layout Configuration)
// ========================

/** 맞춤 방듯 타입 */
export type WallType = 'nowall' | 'wall';

/** 어기가대 두께 */
export type RackThickness = '2mm' | '3mm';

/** 방충대 설정 */
export type VentilationType = 'no' | 'dry';

/** 맞춤 방듯 설정 */
export interface CustomWallConfig {
  /** 벽 타입 */
  type: WallType;
  /** 설정 완료 여부 */
  completed: boolean;
}

/** 어기가대 설정 */
export interface RackConfig {
  /** 두께 */
  thickness: RackThickness;
  /** 설정 완료 여부 */
  completed: boolean;
  /** 추가 옵션 */
  options?: {
    /** 복합대 여부 */
    isComposite: boolean;
    /** 간격 (mm) */
    spacing?: number;
  };
}

/** 모이터 설정 */
export interface MotorConfig {
  /** 상단 높이 (mm) */
  topHeight: number;
  /** 설정 완료 여부 */
  completed: boolean;
}

/** 방충대 설정 */
export interface VentilationConfig {
  /** 방충대 타입 */
  type: VentilationType;
  /** 설정 완료 여부 */
  completed: boolean;
}

/** 배기 설정 */
export interface ExhaustConfig {
  /** 높이 (mm) */
  height: number;
  /** 설정 완료 여부 */
  completed: boolean;
  /** 바닥에서부터 계산하는 높이 */
  fromFloor: boolean;
}

/** STEP 3 맞춤 배치 설정 통합 데이터 */
export interface CustomLayoutConfiguration {
  /** 맞춤 방듯 설정 */
  wall: CustomWallConfig;
  /** 어기가대 설정 */
  rack: RackConfig;
  /** 모이터 설정 */
  motor: MotorConfig;
  /** 방충대 설정 */
  ventilation: VentilationConfig;
  /** 배기 설정 */
  exhaust: ExhaustConfig;
}

// ========================
// 프로젝트 전체 데이터 구조
// ========================

/** 프로젝트 상태 */
export type ProjectStatus = 'draft' | 'in_progress' | 'completed' | 'archived';

/** 프로젝트 우선순위 */
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';

/** 프로젝트 메타데이터 */
export interface ProjectMetadata {
  /** 프로젝트 상태 */
  status: ProjectStatus;
  /** 우선순위 */
  priority: ProjectPriority;
  /** 태그 */
  tags: string[];
  /** 즐겨찾기 여부 */
  isFavorite: boolean;
  /** 마지막 열람 시간 */
  lastAccessedAt?: Timestamp;
  /** 프로젝트 색상 (UI용) */
  color?: string;
}

/** 프로젝트 통계 */
export interface ProjectStats {
  /** 총 디자인 파일 수 */
  designFileCount: number;
  /** 총 가구 개수 */
  furnitureCount: number;
  /** 프로젝트 진행률 (0-100) */
  completionRate: number;
  /** 마지막 열람 시간 */
  lastOpenedAt?: Timestamp;
}

/** 완전한 프로젝트 데이터 구조 */
export interface ProjectData {
  /** 프로젝트 고유 ID */
  id: string;
  /** 사용자 ID */
  userId: string;
  /** STEP 1: 기본 정보 */
  basicInfo: ProjectBasicInfo;
  /** STEP 2: 공간 설정 */
  spaceConfig: SpaceConfiguration;
  /** STEP 3: 맞춤 배치 설정 */
  customLayout: CustomLayoutConfiguration;
  /** 프로젝트 메타데이터 */
  metadata: ProjectMetadata;
  /** 프로젝트 통계 */
  stats: ProjectStats;
  /** 썸네일 이미지 URL */
  thumbnailUrl?: string;
}

// ========================
// 데이터 검증 및 기본값
// ========================

/** STEP 2 기본값 */
export const DEFAULT_SPACE_CONFIG: SpaceConfiguration = {
  dimensions: {
    width: 3600,
    height: 2400,
    depth: 1500,
  },
  installType: 'builtin',
  damper: {
    agentPosition: 'none',
    size: {
      width: 900,
      height: 200,
    },
  },
  floorFinish: {
    enabled: false,
    height: 10,
  },
};

/** STEP 3 기본값 */
export const DEFAULT_CUSTOM_LAYOUT: CustomLayoutConfiguration = {
  wall: {
    type: 'nowall',
    completed: true,
  },
  rack: {
    thickness: '2mm',
    completed: false,
    options: {
      isComposite: false,
    },
  },
  motor: {
    topHeight: 50,
    completed: false,
  },
  ventilation: {
    type: 'no',
    completed: true,
  },
  exhaust: {
    height: 300,
    completed: true,
    fromFloor: true,
  },
};

/** 프로젝트 메타데이터 기본값 */
export const DEFAULT_PROJECT_METADATA: ProjectMetadata = {
  status: 'draft',
  priority: 'medium',
  tags: [],
  isFavorite: false,
};

/** 프로젝트 통계 기본값 */
export const DEFAULT_PROJECT_STATS: ProjectStats = {
  designFileCount: 0,
  furnitureCount: 0,
  completionRate: 0,
};

// ========================
// 유틸리티 타입 및 함수
// ========================

/** 프로젝트 생성 시 필요한 데이터 */
export type CreateProjectData = Pick<ProjectData, 'basicInfo' | 'spaceConfig' | 'customLayout'> & {
  userId: string;
};

/** 프로젝트 업데이트 시 사용할 부분 데이터 */
export type UpdateProjectData = Partial<Omit<ProjectData, 'id' | 'userId' | 'basicInfo'>> & {
  basicInfo?: Partial<ProjectBasicInfo>;
};

/** 프로젝트 요약 정보 (리스트 표시용) */
export type ProjectSummary = Pick<ProjectData, 'id' | 'basicInfo' | 'metadata' | 'stats' | 'thumbnailUrl'>;