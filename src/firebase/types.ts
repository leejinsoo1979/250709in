import { User } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { BasicInfo } from '@/store/core/projectStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';

// Firebase 사용자 타입 (확장 가능)
export interface AppUser extends User {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

// Firebase에 저장되는 프로젝트 데이터 구조
export interface FirebaseProject {
  id: string;
  userId: string;
  
  // 메타데이터
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  version: string; // 데이터 버전 (마이그레이션용)
  
  // 썸네일 이미지 (base64 또는 URL)
  thumbnail?: string;
  
  // 프로젝트 데이터 (각 Store별 분리)
  projectData: BasicInfo;    // ProjectStore 데이터
  spaceConfig: SpaceInfo;    // SpaceConfigStore 데이터
  furniture: {               // FurnitureStore 데이터 (UI 상태 제외)
    placedModules: PlacedModule[];
  };
  
  // 통계 및 메타 정보
  stats: {
    furnitureCount: number;
    lastOpenedAt: Timestamp;
  };
}

// 프로젝트 생성/업데이트 시 사용하는 타입
export interface CreateProjectData {
  title: string;
  projectData: BasicInfo;
  spaceConfig: SpaceInfo;
  furniture: {
    placedModules: PlacedModule[];
  };
}

// 프로젝트 목록에서 사용하는 간단한 타입
export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: Timestamp;
  furnitureCount: number;
  spaceSize: {
    width: number;
    height: number;
    depth: number;
  };
  thumbnail?: string; // 썸네일 이미지
} 