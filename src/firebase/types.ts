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
  thumbnail?: string;  // 썸네일 필드 추가
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
  
  // 협업 관련 필드
  isShared?: boolean;
  sharedWith?: string[]; // 공유된 사용자 ID 목록
  permissions?: {
    [userId: string]: 'viewer' | 'editor' | 'admin';
  };
  
  // 뷰어 모드를 위한 추가 데이터 (선택적)
  spaceInfo?: SpaceInfo;
  placedModules?: PlacedModule[];
}

// 팀 타입 정의
export interface Team {
  id: string;
  name: string;
  description?: string;
  ownerId: string; // 팀 생성자
  members: TeamMember[];
  settings: TeamSettings;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 팀 멤버 타입
export interface TeamMember {
  userId: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  joinedAt: Timestamp;
  status: 'active' | 'pending' | 'inactive';
  invitedBy?: string; // 초대한 사용자 ID
}

// 팀 설정 타입
export interface TeamSettings {
  isPublic: boolean; // 공개 팀 여부
  allowInvitations: boolean; // 멤버가 다른 사람을 초대할 수 있는지
  defaultRole: 'viewer' | 'editor'; // 새 멤버의 기본 역할
  maxMembers: number; // 최대 멤버 수
}

// 팀 초대 타입
export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  inviterUserId: string;
  inviterEmail: string;
  inviterDisplayName?: string;
  inviteeEmail: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: Timestamp;
  expiresAt: Timestamp;
  token: string; // 초대 토큰 (보안용)
}

// 프로젝트 공유 타입
export interface ProjectShare {
  id: string;
  projectId: string;
  projectTitle: string;
  ownerId: string;
  ownerEmail: string;
  sharedWith: string; // 공유받은 사용자 ID 또는 이메일
  permission: 'viewer' | 'editor';
  shareType: 'link' | 'email'; // 링크 공유 또는 이메일 직접 공유
  accessToken?: string; // 링크 공유용 토큰
  createdAt: Timestamp;
  expiresAt?: Timestamp; // 만료일 (옵션)
  isActive: boolean;
}

// 북마크 타입
export interface ProjectBookmark {
  id: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  projectOwnerId: string;
  bookmarkType: 'personal' | 'shared'; // 내 프로젝트 북마크 또는 공유받은 프로젝트 북마크
  createdAt: Timestamp;
}

// 사용자 프로필 확장 타입
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  bio?: string;
  company?: string;
  website?: string;
  location?: string;

  // 크레딧 시스템
  credits: number; // 사용 가능한 크레딧 (무료 플랜 기본: 200)

  // 협업 관련 설정
  teamNotifications: boolean;
  shareNotifications: boolean;
  emailNotifications: boolean;

  // 계정 설정
  isPublicProfile: boolean; // 다른 사용자가 프로필을 볼 수 있는지
  allowTeamInvitations: boolean; // 팀 초대를 받을 수 있는지

  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  // 썸네일 생성을 위한 전체 데이터
  spaceConfig?: SpaceInfo;
  furniture?: {
    placedModules: PlacedModule[];
  };
} 