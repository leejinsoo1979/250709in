import { Timestamp } from 'firebase/firestore';

// 네비게이션 히스토리 항목
export interface NavigationEntry {
  projectId: string | null;
  folderId: string | null;
  label: string;
}

// 브레드크럼 항목
export interface BreadcrumbItem {
  id: string;
  label: string;
  type: 'root' | 'project' | 'folder';
}

// 탐색기 항목 (ContentPane에 표시)
export interface ExplorerItem {
  id: string;
  name: string;
  type: 'project' | 'folder' | 'design';
  projectId?: string;
  folderId?: string;
  updatedAt?: Timestamp;
  thumbnail?: string;
  spaceSize?: { width: number; height: number; depth: number };
  furnitureCount?: number;
  status?: 'in_progress' | 'completed';
  isShared?: boolean;
  // 디자인 파일 소유자
  userId?: string;
  ownerName?: string;
  ownerPhotoURL?: string;
}

// 드래그앤드롭 상태
export interface DragState {
  isDragging: boolean;
  draggedItem: {
    id: string;
    name: string;
    type: 'design' | 'file';
    projectId: string;
  } | null;
  draggedItems: {
    id: string;
    name: string;
    type: 'design' | 'file';
    projectId: string;
  }[];
  dragOverFolder: string | null;
}

// 클립보드 상태
export interface ClipboardState {
  items: ExplorerItem[];
  mode: 'copy' | 'cut';
}

// 빠른 액세스 메뉴 타입
export type QuickAccessMenu =
  | 'all'            // 전체 (루트)
  | 'in-progress'    // 진행 중
  | 'completed'      // 완료
  | 'bookmarks'      // 즐겨찾기
  | 'shared-by-me'   // 내가 공유
  | 'shared-with-me' // 나에게 공유
  | 'trash'          // 휴지통
  | 'profile'        // 프로필
  | 'team';          // 팀

// 뷰 모드 (윈도우 탐색기 스타일)
export type ViewMode = 'extra-large' | 'large' | 'medium' | 'small' | 'list' | 'details' | 'tiles';

// 아이콘 크기 매핑 (px)
export const VIEW_MODE_ICON_SIZE: Record<ViewMode, number> = {
  'extra-large': 256,
  'large': 200,
  'medium': 120,
  'small': 48,
  'list': 16,
  'details': 16,
  'tiles': 64,
};

// 정렬 기준
export type SortBy = 'name' | 'date' | 'type';
export type SortDirection = 'asc' | 'desc';

// 컨텍스트 메뉴 상태
export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  item: ExplorerItem | null;
}

// useExplorerNavigation 반환 타입
export interface UseExplorerNavigationReturn {
  currentProjectId: string | null;
  currentFolderId: string | null;
  activeMenu: QuickAccessMenu;
  breadcrumbPath: BreadcrumbItem[];
  canGoBack: boolean;
  canGoForward: boolean;
  canGoUp: boolean;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  navigateTo: (projectId: string | null, folderId?: string | null, label?: string) => void;
  setActiveMenu: (menu: QuickAccessMenu) => void;
  navigateToRoot: () => void;
}

// useExplorerData 반환 타입
export interface UseExplorerDataReturn {
  projects: import('@/firebase/types').ProjectSummary[];
  currentItems: ExplorerItem[];
  folders: { [projectId: string]: import('@/firebase/projects').FolderData[] };
  projectDesignFiles: { [projectId: string]: any[] };
  isLoading: boolean;
  projectsLoading: boolean;
  error: string | null;
  projectOwners: { [userId: string]: { displayName: string; photoURL?: string | null } };
  sharedByMeProjects: import('@/firebase/types').ProjectSummary[];
  sharedWithMeProjects: import('@/firebase/types').ProjectSummary[];
  bookmarkedProjects: Set<string>;
  bookmarkedDesigns: Set<string>;
  bookmarkedFolders: Set<string>;
  refreshProjects: () => Promise<void>;
  refreshDesignFiles: (projectId: string) => Promise<void>;
  refreshFolders: (projectId: string) => Promise<void>;
  setFoldersLocal: (projectId: string, folders: import('@/firebase/projects').FolderData[]) => void;
}

// selectItem 옵션
export interface SelectItemOptions {
  multi?: boolean;
  shift?: boolean;
  orderedIds?: string[];
}

// useExplorerActions 반환 타입
export interface UseExplorerActionsReturn {
  selectedItems: Set<string>;
  setSelectedItems: (items: Set<string>) => void;
  dragState: DragState;
  selectItem: (id: string, optionsOrMulti?: boolean | SelectItemOptions) => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteItems: (items: { id: string; type: string; projectId?: string }[]) => Promise<void>;
  restoreItems: (items: { id: string; type: string; projectId?: string }[]) => Promise<void>;
  permanentDeleteItems: (items: { id: string; type: string; projectId?: string }[]) => Promise<void>;
  renameItem: (id: string, type: string, newName: string, projectId?: string) => Promise<void>;
  duplicateProject: (projectId: string) => Promise<void>;
  toggleBookmark: (id: string, type: 'project' | 'design' | 'folder') => Promise<void>;
  clipboard: ClipboardState | null;
  copyItems: (items: ExplorerItem[]) => void;
  cutItems: (items: ExplorerItem[]) => void;
  pasteItems: (targetProjectId?: string, targetFolderId?: string) => Promise<void>;
  duplicateItems: (items: ExplorerItem[]) => Promise<void>;
  dragHandlers: {
    onDragStart: (e: React.DragEvent, item: DragState['draggedItem']) => void;
    onDragOver: (e: React.DragEvent, folderId: string) => void;
    onDrop: (e: React.DragEvent, targetFolderId: string) => void;
    onDragEnd: () => void;
  };
}
