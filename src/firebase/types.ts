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

// 디자인파일 (실제 3D 디자인 데이터)
export interface DesignFile {
  id: string;
  name: string;
  projectId: string;
  folderId?: string; // 폴더에 속한 경우
  
  // 실제 3D 디자인 데이터
  spaceConfig: SpaceInfo;
  furniture: {
    placedModules: PlacedModule[];
  };
  
  thumbnail?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 폴더 (방)
export interface ProjectFolder {
  id: string;
  name: string;
  projectId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Firebase에 저장되는 프로젝트 데이터 구조 (집)
export interface FirebaseProject {
  id: string;
  userId: string;
  
  // 메타데이터
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  version: string; // 데이터 버전 (마이그레이션용)
  
  // 통계 및 메타 정보
  stats: {
    designFileCount: number;
    lastOpenedAt: Timestamp;
  };
}

// 프로젝트 생성 시 사용하는 타입
export interface CreateProjectData {
  title: string;
}

// 디자인파일 생성 시 사용하는 타입
export interface CreateDesignFileData {
  name: string;
  projectId: string;
  folderId?: string;
  spaceConfig: SpaceInfo;
  furniture: {
    placedModules: PlacedModule[];
  };
}

// 프로젝트 목록에서 사용하는 간단한 타입
export interface ProjectSummary {
  id: string;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  furnitureCount: number;
  spaceSize: {
    width: number;
    height: number;
    depth: number;
  };
  thumbnail?: string;
  folderId?: string;
}

// 디자인파일 목록에서 사용하는 타입
export interface DesignFileSummary {
  id: string;
  name: string;
  projectId: string;
  folderId?: string;
  updatedAt: Timestamp;
  spaceSize: {
    width: number;
    height: number;
    depth: number;
  };
  furnitureCount: number;
  thumbnail?: string;
} 