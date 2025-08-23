import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from '@/contexts/NavigationContext';
import { Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { UserIcon, HomeIcon, UsersIcon, SettingsIcon, LogOutIcon, PlusIcon, FolderIcon, StarIcon, TrashIcon, SearchIcon, BellIcon, MessageIcon, CalendarIcon, EditIcon, CopyIcon, ShareIcon, MoreHorizontalIcon, EyeIcon } from '../components/common/Icons';
import { ProjectSummary } from '../firebase/types';
import { getUserProjects, createProject, saveFolderData, loadFolderData, FolderData, getDesignFiles, deleteProject, deleteDesignFile } from '@/firebase/projects';
import { signOutUser } from '@/firebase/auth';
import { useAuth } from '@/auth/AuthProvider';
import SettingsPanel from '@/components/common/SettingsPanel';
import Logo from '@/components/common/Logo';
import Step1 from '../editor/Step1';
import SimpleProjectDropdown from '@/components/common/SimpleProjectDropdown';
import BookmarksTab from '../components/collaboration/BookmarksTab';
import SharedTab from '../components/collaboration/SharedTab';
import TeamsTab from '../components/collaboration/TeamsTab';
import ProfileTab from '../components/collaboration/ProfileTab';
import NotificationBadge from '../components/common/NotificationBadge';
import ProjectViewerModal from '../components/common/ProjectViewerModal';
import ThumbnailImage from '../components/common/ThumbnailImage';
import { generateProjectThumbnail } from '../utils/thumbnailGenerator';
import styles from './SimpleDashboard.module.css';

// 커스텀 프로젝트 아이콘 (단색, 네모+선 형태)
const ProjectIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="14" height="12" rx="2" stroke="#6b7280" strokeWidth="1.5" fill="none" />
    <rect x="6" y="7" width="8" height="2" rx="1" fill="#6b7280" />
    <rect x="6" y="11" width="5" height="1.5" rx="0.75" fill="#6b7280" />
  </svg>
);

const SimpleDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [sidebarImageError, setSidebarImageError] = useState(false);
  const [headerImageError, setHeaderImageError] = useState(false);
  
  // Firebase 프로젝트 목록 상태
  const [firebaseProjects, setFirebaseProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 디자인 파일 로딩 상태
  const [designFilesLoading, setDesignFilesLoading] = useState<{[projectId: string]: boolean}>({});
  
  // 파일 트리 접기/펼치기 상태 (폴더별로 관리)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // 선택된 프로젝트 필터링
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  // 브레드크럼 네비게이션 상태
  const [breadcrumbPath, setBreadcrumbPath] = useState<string[]>(['전체 프로젝트']);
  
  // 현재 폴더 상태
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  // 폴더 구조 상태
  const [folders, setFolders] = useState<{
    [projectId: string]: FolderData[];
  }>({});
  
  // 드래그 앤 드롭 상태
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    draggedItem: {
      id: string;
      name: string;
      type: 'design' | 'file';
      projectId: string;
    } | null;
    dragOverFolder: string | null;
  }>({
    isDragging: false,
    draggedItem: null,
    dragOverFolder: null
  });
  
  // 더보기 메뉴 상태
  const [moreMenu, setMoreMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    itemId: string;
    itemName: string;
    itemType: 'folder' | 'design' | 'project';
  } | null>(null);
  
  // 새 폴더 생성 모달 상태
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  // 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    fileId: string;
    fileName: string;
    fileType: string;
  } | null>(null);
  
  // 프로젝트 생성 모달 상태
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Step1 모달 상태
  const [isStep1ModalOpen, setIsStep1ModalOpen] = useState(false);
  
  // 3D 뷰어 모달 상태
  const [viewerModal, setViewerModal] = useState<{
    isOpen: boolean;
    projectId: string;
    designFileId?: string;
  }>({
    isOpen: false,
    projectId: '',
    designFileId: undefined
  });

  // 로그아웃 모달 상태 추가
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // 설정 패널 상태 추가
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  
  // 팀 모달 상태
  const [showTeamModal, setShowTeamModal] = useState(false);

  // 메뉴 상태 추가
  const [activeMenu, setActiveMenu] = useState<'all' | 'bookmarks' | 'shared' | 'profile' | 'team' | 'trash'>('all');
  const [bookmarkedProjects, setBookmarkedProjects] = useState<Set<string>>(new Set());
  const [bookmarkedDesigns, setBookmarkedDesigns] = useState<Set<string>>(new Set());
  const [bookmarkedFolders, setBookmarkedFolders] = useState<Set<string>>(new Set());
  const [sharedProjects, setSharedProjects] = useState<ProjectSummary[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<ProjectSummary[]>([]);
  
  // 파일트리 폴딩 상태
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);
  
  // 카드 선택 상태 (여러 선택 가능)
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  
  // 썸네일 캐시
  const [thumbnailCache, setThumbnailCache] = useState<Map<string, string>>(new Map());
  
  // 디자인 파일 데이터 캐시
  const [designFilesCache, setDesignFilesCache] = useState<Map<string, any[]>>(new Map());
  
  // 프로젝트별 디자인 파일들 (projectId -> DesignFileSummary[])
  const [projectDesignFiles, setProjectDesignFiles] = useState<{[projectId: string]: any[]}>({});

  // 로컬 스토리지에서 데모 프로젝트 삭제
  const cleanupDemoProjects = useCallback(() => {
    console.log('🧹 로컬 스토리지 데모 프로젝트 정리 시작');
    
    const keys = Object.keys(localStorage);
    let deletedCount = 0;
    
    keys.forEach(key => {
      // demo 관련 항목 삭제
      if (key.includes('demo') || key.includes('Demo') || key.includes('demoProject')) {
        console.log('삭제:', key);
        localStorage.removeItem(key);
        deletedCount++;
      }
    });
    
    console.log(`🧹 총 ${deletedCount}개의 데모 프로젝트 관련 항목 삭제됨`);
  }, []);

  // Firebase에서 프로젝트 목록 가져오기
  const loadFirebaseProjects = useCallback(async () => {
    if (!user) {
      console.log('사용자가 로그인되지 않았습니다.');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const { projects, error } = await getUserProjects();
      
      if (error) {
        setError(error);
        console.error('Firebase 프로젝트 로드 에러:', error);
      } else {
        setFirebaseProjects(projects);
        console.log('✅ Firebase 프로젝트 로드 성공:', projects.length, '개');
      }
    } catch (err) {
      setError('프로젝트 목록을 가져오는 중 오류가 발생했습니다.');
      console.error('Firebase 프로젝트 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Firebase에서 폴더 데이터 불러오기
  const loadFolderDataForProject = useCallback(async (projectId: string) => {
    if (!user) return;

    try {
      const { folders, error } = await loadFolderData(projectId);
      if (error) {
        console.error('폴더 데이터 불러오기 에러:', error);
      } else {
        setFolders(prev => ({
          ...prev,
          [projectId]: folders
        }));
      }
    } catch (err) {
      console.error('폴더 데이터 불러오기 중 오류:', err);
    }
  }, [user]);

  // Firebase에서 디자인 파일들 불러오기
  const loadDesignFilesForProject = useCallback(async (projectId: string) => {
    if (!user) return;

    console.log('🚀 디자인 파일 로딩 시작:', { projectId, userId: user.uid });
    
    // 로딩 상태 설정
    setDesignFilesLoading(prev => ({ ...prev, [projectId]: true }));

    try {
      const { designFiles, error } = await getDesignFiles(projectId);
      if (error) {
        console.error('❌ 디자인 파일 불러오기 에러:', error);
      } else {
        console.log('✅ 불러온 디자인 파일들:', {
          projectId,
          designFiles,
          designFilesCount: designFiles?.length || 0,
          timestamp: new Date().toISOString()
        });
        setProjectDesignFiles(prev => ({
          ...prev,
          [projectId]: designFiles
        }));
      }
    } catch (err) {
      console.error('❌ 디자인 파일 불러오기 중 오류:', err);
    } finally {
      // 로딩 상태 해제
      setDesignFilesLoading(prev => ({ ...prev, [projectId]: false }));
    }
  }, [user]);

  // Firebase에 폴더 데이터 저장하기
  const saveFolderDataToFirebase = useCallback(async (projectId: string, folderData: FolderData[]) => {
    if (!user) return;

    try {
      const { error } = await saveFolderData(projectId, folderData);
      if (error) {
        console.error('폴더 데이터 저장 에러:', error);
      }
    } catch (err) {
      console.error('폴더 데이터 저장 중 오류:', err);
    }
  }, [user]);

  // 컴포넌트 마운트 시 데모 프로젝트 정리 및 Firebase 프로젝트 로드
  useEffect(() => {
    // 컴포넌트 마운트 시 항상 데모 프로젝트 정리
    cleanupDemoProjects();
    
    if (user) {
      loadFirebaseProjects();
    }
  }, [user]); // loadFirebaseProjects 의존성 제거로 무한 루프 방지
  
  // firebaseProjects가 업데이트될 때 대기 중인 프로젝트 선택 처리
  useEffect(() => {
    const pendingProjectId = sessionStorage.getItem('pendingProjectSelect');
    if (pendingProjectId && firebaseProjects.length > 0) {
      const projectExists = firebaseProjects.some(p => p.id === pendingProjectId);
      if (projectExists) {
        console.log('대기 중인 프로젝트 선택:', pendingProjectId);
        handleProjectSelect(pendingProjectId);
        sessionStorage.removeItem('pendingProjectSelect');
      }
    }
  }, [firebaseProjects]);
  
  // selectedProjectId가 있을 때 프로젝트 정보가 로드되면 breadcrumb 업데이트 및 디자인 파일 로드
  useEffect(() => {
    if (selectedProjectId && firebaseProjects.length > 0) {
      const selectedProject = firebaseProjects.find(p => p.id === selectedProjectId);
      if (selectedProject && breadcrumbPath[1] === '로딩 중...') {
        setBreadcrumbPath(['전체 프로젝트', selectedProject.title]);
      }
      
      // handleProjectSelect에서 이미 로드하므로 여기서는 로드하지 않음
    }
  }, [selectedProjectId, firebaseProjects, breadcrumbPath, projectDesignFiles]); // projectDesignFiles 의존성 추가

  // 윈도우 포커스 시 프로젝트 데이터 새로고침
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        console.log('🔄 윈도우 포커스 - 프로젝트 데이터 새로고침');
        loadFirebaseProjects();
        
        // 선택된 프로젝트가 있으면 디자인 파일도 새로고침
        if (selectedProjectId) {
          console.log('🔄 윈도우 포커스 - 디자인 파일 새로고침:', selectedProjectId);
          loadDesignFilesForProject(selectedProjectId);
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, selectedProjectId, loadDesignFilesForProject]); // 의존성 추가

  // 메뉴 변경 시 파일트리 자동 접기/펼치기
  useEffect(() => {
    if (activeMenu === 'all') {
      // 전체 프로젝트 메뉴일 때는 파일트리 펼치기
      setIsFileTreeCollapsed(false);
    } else {
      // 다른 메뉴일 때는 파일트리 접기
      setIsFileTreeCollapsed(true);
    }
  }, [activeMenu]);

  // BroadcastChannel로 프로젝트 업데이트 감지
  useEffect(() => {
    const channel = new BroadcastChannel('project-updates');
    
    const handleProjectUpdate = (event: MessageEvent) => {
      console.log('📡 프로젝트 업데이트 알림 수신:', event.data);
      
      if (event.data.type === 'PROJECT_SAVED' || event.data.type === 'PROJECT_CREATED' || event.data.type === 'DESIGN_FILE_UPDATED') {
        console.log('🔄 프로젝트 목록 새로고침 중...');
        loadFirebaseProjects();
        
        // 디자인 파일이 업데이트된 경우, 해당 프로젝트의 디자인 파일도 새로고침
        if (event.data.type === 'DESIGN_FILE_UPDATED' && event.data.projectId) {
          console.log('🔄 디자인 파일 새로고침:', event.data.projectId);
          loadDesignFilesForProject(event.data.projectId);
        }
        // 현재 선택된 프로젝트의 디자인 파일도 새로고침
        else if (selectedProjectId) {
          console.log('🔄 선택된 프로젝트의 디자인 파일 새로고침:', selectedProjectId);
          loadDesignFilesForProject(selectedProjectId);
        }
      }
    };

    channel.addEventListener('message', handleProjectUpdate);
    
    return () => {
      channel.removeEventListener('message', handleProjectUpdate);
      channel.close();
    };
  }, [selectedProjectId, loadDesignFilesForProject]); // 의존성 배열 비움 - 한 번만 설정


  // 북마크 및 휴지통 데이터 로드
  useEffect(() => {
    if (user) {
      // 프로젝트 북마크 로드
      const savedBookmarks = localStorage.getItem(`bookmarks_${user.uid}`);
      if (savedBookmarks) {
        setBookmarkedProjects(new Set(JSON.parse(savedBookmarks)));
      }
      
      // 디자인 파일 북마크 로드
      const savedDesignBookmarks = localStorage.getItem(`design_bookmarks_${user.uid}`);
      if (savedDesignBookmarks) {
        setBookmarkedDesigns(new Set(JSON.parse(savedDesignBookmarks)));
      }
      
      // 폴더 북마크 로드
      const savedFolderBookmarks = localStorage.getItem(`folder_bookmarks_${user.uid}`);
      if (savedFolderBookmarks) {
        setBookmarkedFolders(new Set(JSON.parse(savedFolderBookmarks)));
      }
      
      // 휴지통 프로젝트 로드
      const savedTrash = localStorage.getItem(`trash_${user.uid}`);
      if (savedTrash) {
        setDeletedProjects(JSON.parse(savedTrash));
      }
    }
  }, [user]);

  // 사용자별 프로젝트 목록 결정
  const allProjects = user ? firebaseProjects : [];
  
  // 선택된 프로젝트 정보를 메모이제이션
  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    const project = allProjects.find(p => p.id === selectedProjectId);
    console.log('🔍 selectedProject 업데이트:', { selectedProjectId, found: !!project, allProjectsCount: allProjects.length });
    return project || null;
  }, [selectedProjectId, allProjects]);
  
  console.log('🔍 현재 상태 확인:', {
    user: !!user,
    userEmail: user?.email,
    firebaseProjectsCount: firebaseProjects.length,
    allProjectsCount: allProjects.length,
    selectedProjectId,
    selectedProject: selectedProject?.title,
    activeMenu,
    loading
  });

  // selectedProjectId가 있고 프로젝트 정보가 로드되면 breadcrumb 업데이트
  useEffect(() => {
    if (selectedProject && breadcrumbPath[1] === '로딩 중...') {
      console.log('📝 Breadcrumb 업데이트:', selectedProject.title);
      setBreadcrumbPath(['전체 프로젝트', selectedProject.title]);
    }
  }, [selectedProject, breadcrumbPath]);

  // 프로젝트 북마크 토글 함수
  const toggleBookmark = (projectId: string) => {
    const newBookmarks = new Set(bookmarkedProjects);
    if (newBookmarks.has(projectId)) {
      newBookmarks.delete(projectId);
    } else {
      newBookmarks.add(projectId);
      // 북마크 추가 시 북마크 메뉴로 이동
      setActiveMenu('bookmarks');
    }
    setBookmarkedProjects(newBookmarks);
    if (user) {
      localStorage.setItem(`bookmarks_${user.uid}`, JSON.stringify(Array.from(newBookmarks)));
    }
  };
  
  // 디자인 파일 북마크 토글 함수
  const toggleDesignBookmark = (designId: string) => {
    const newBookmarks = new Set(bookmarkedDesigns);
    if (newBookmarks.has(designId)) {
      newBookmarks.delete(designId);
    } else {
      newBookmarks.add(designId);
      // 북마크 추가 시 북마크 메뉴로 이동
      setActiveMenu('bookmarks');
    }
    setBookmarkedDesigns(newBookmarks);
    if (user) {
      localStorage.setItem(`design_bookmarks_${user.uid}`, JSON.stringify(Array.from(newBookmarks)));
    }
  };
  
  // 폴더 북마크 토글 함수
  const toggleFolderBookmark = (folderId: string) => {
    const newBookmarks = new Set(bookmarkedFolders);
    if (newBookmarks.has(folderId)) {
      newBookmarks.delete(folderId);
    } else {
      newBookmarks.add(folderId);
      // 북마크 추가 시 북마크 메뉴로 이동
      setActiveMenu('bookmarks');
    }
    setBookmarkedFolders(newBookmarks);
    if (user) {
      localStorage.setItem(`folder_bookmarks_${user.uid}`, JSON.stringify(Array.from(newBookmarks)));
    }
  };

  // 휴지통으로 이동 함수 (실제로 Firebase에서 삭제)
  const moveToTrash = async (project: ProjectSummary) => {
    try {
      // Firebase에서 프로젝트 삭제
      const { error } = await deleteProject(project.id);
      
      if (error) {
        alert('프로젝트 삭제 실패: ' + error);
        return;
      }
      
      // 로컬 상태에서 제거
      setFirebaseProjects(prev => prev.filter(p => p.id !== project.id));
      
      // 북마크에서도 제거
      if (bookmarkedProjects.has(project.id)) {
        toggleBookmark(project.id);
      }
      
      // BroadcastChannel로 다른 창에 삭제 알림
      try {
        const channel = new BroadcastChannel('project-updates');
        channel.postMessage({
          type: 'PROJECT_DELETED',
          projectId: project.id
        });
        channel.close();
      } catch (broadcastError) {
        console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
      }
      
      console.log('✅ 프로젝트 삭제 완료:', project.id);
    } catch (error) {
      console.error('프로젝트 삭제 중 오류:', error);
      alert('프로젝트 삭제 중 오류가 발생했습니다.');
    }
  };

  // 휴지통에서 복원 함수
  const restoreFromTrash = (projectId: string) => {
    const project = deletedProjects.find(p => p.id === projectId);
    if (project) {
      const updatedTrash = deletedProjects.filter(p => p.id !== projectId);
      setDeletedProjects(updatedTrash);
      
      // deletedAt 속성 제거하고 복원
      const { deletedAt, ...restoredProject } = project as any;
      setFirebaseProjects(prev => [...prev, restoredProject]);
      
      // localStorage 업데이트
      if (user) {
        localStorage.setItem(`trash_${user.uid}`, JSON.stringify(updatedTrash));
      }
    }
  };
  
  // 휴지통 비우기 함수
  const emptyTrash = () => {
    if (window.confirm('휴지통을 비우시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      setDeletedProjects([]);
      if (user) {
        localStorage.removeItem(`trash_${user.uid}`);
      }
    }
  };
  
  // 공유 프로젝트 처리 함수
  const shareProject = async (projectId: string) => {
    try {
      // 현재는 공유 링크만 생성
      const shareUrl = `${window.location.origin}/configurator?projectId=${projectId}&shared=true`;
      
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        alert('공유 링크가 클립보드에 복사되었습니다!');
      } else {
        prompt('공유 링크를 복사하세요:', shareUrl);
      }
      
      // 미래에는 Firebase에 공유 상태 업데이트
      // await updateProject(projectId, { shared: true, sharedAt: new Date() });
      
    } catch (error) {
      console.error('프로젝트 공유 중 오류:', error);
      alert('프로젝트 공유 중 오류가 발생했습니다.');
    }
  };

  // 메뉴별 프로젝트 필터링
  const getFilteredProjects = () => {
    // 삭제된 프로젝트 ID 목록
    const deletedProjectIds = new Set(deletedProjects.map(p => p.id));
    
    switch (activeMenu) {
      case 'bookmarks':
        // 북마크된 프로젝트들 반환
        return allProjects.filter(p => 
          bookmarkedProjects.has(p.id) && !deletedProjectIds.has(p.id)
        );
      case 'shared':
        return sharedProjects.filter(p => !deletedProjectIds.has(p.id));
      case 'trash':
        return deletedProjects;
      case 'all':
      default:
        // 삭제된 프로젝트는 제외하고 반환
        return allProjects.filter(p => !deletedProjectIds.has(p.id));
    }
  };
  
  // 북마크된 디자인 파일들 가져오기
  const getBookmarkedDesignItems = () => {
    const items = [];
    
    // 전체 프로젝트를 순회하며 북마크된 디자인 파일 찾기
    allProjects.forEach(project => {
      const designFiles = projectDesignFiles[project.id] || [];
      
      designFiles.forEach(designFile => {
        if (bookmarkedDesigns.has(designFile.id)) {
          items.push({
            id: designFile.id,
            type: 'design',
            name: designFile.name,
            project: project,
            designFile: designFile
          });
        }
      });
    });
    
    return items;
  };
  
  // 북마크된 폴더들 가져오기
  const getBookmarkedFolderItems = () => {
    const items = [];
    
    // 전체 프로젝트를 순회하며 북마크된 폴더 찾기
    allProjects.forEach(project => {
      const projectFolders = folders[project.id] || [];
      
      projectFolders.forEach(folder => {
        if (bookmarkedFolders.has(folder.id)) {
          items.push({
            id: folder.id,
            type: 'folder',
            name: folder.name,
            project: project,
            children: folder.children
          });
        }
      });
    });
    
    return items;
  };
  
  // 프로젝트의 모든 파일과 폴더를 가져오는 함수
  const getProjectItems = useCallback((projectId: string) => {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) {
      console.log('❌ getProjectItems: 프로젝트를 찾을 수 없습니다:', projectId, 'allProjects:', allProjects.length);
      return [];
    }
    
    const projectFolders = folders[projectId] || [];
    const items = [];
    
    // 폴더들 추가
    projectFolders.forEach(folder => {
      items.push({
        id: folder.id,
        type: 'folder',
        name: folder.name,
        project: project
      });
    });
    
    // 폴더 내부 파일들 추가
    projectFolders.forEach(folder => {
      folder.children.forEach(child => {
        items.push({
          id: child.id,
          type: 'design',
          name: child.name,
          project: project
        });
      });
    });
    
    // 루트 레벨 디자인 파일 추가 (실제 Firebase 디자인 파일들 기반)
    const allFolderChildren = projectFolders.flatMap(folder => folder.children);
    const folderChildIds = new Set(allFolderChildren.map(child => child.id));
    
    // 실제 Firebase 디자인 파일들을 사용해서 표시
    const isDesignFilesLoading = designFilesLoading[projectId] || false;
    const actualDesignFiles = projectDesignFiles[projectId] || [];
    console.log('🔥 getProjectItems - 디자인 파일 상태 확인:', {
      projectId,
      projectTitle: project.title,
      isDesignFilesLoading,
      projectDesignFilesKeys: Object.keys(projectDesignFiles),
      hasDesignFilesForProject: !!projectDesignFiles[projectId],
      actualDesignFiles,
      actualDesignFilesCount: actualDesignFiles.length,
      projectFurnitureCount: project.furnitureCount,
      timestamp: new Date().toISOString()
    });
    
    // 디자인 파일이 로딩 중이면 로딩 표시 추가
    if (isDesignFilesLoading && actualDesignFiles.length === 0) {
      items.push({
        id: 'loading',
        type: 'loading',
        name: '디자인 파일 로딩 중...',
        project: selectedProject
      });
    } else {
      // 폴더에 속하지 않은 디자인 파일들을 루트 레벨에 표시
      actualDesignFiles.forEach(designFile => {
        if (!folderChildIds.has(designFile.id)) {
          console.log('📁 루트 레벨 디자인 파일 추가:', designFile.name);
          items.push({
            id: designFile.id,
            type: 'design',
            name: designFile.name,
            project: selectedProject,
            designFile: designFile
          });
        }
      });
    }
    
    return items;
  }, [allProjects, folders, projectDesignFiles, designFilesLoading]);

  // 메인에 표시할 항목들 결정
  const getDisplayedItems = () => {
    console.log('🔍 getDisplayedItems 호출:', {
      selectedProjectId,
      currentFolderId,
      viewMode,
      activeMenu,
      allProjectsCount: allProjects.length,
      allProjects: allProjects.map(p => ({id: p.id, title: p.title}))
    });
    
    if (selectedProjectId) {
      if (!selectedProject) {
        console.log('❌ 선택된 프로젝트를 찾을 수 없습니다:', selectedProjectId);
        console.log('현재 allProjects:', allProjects.map(p => ({ id: p.id, title: p.title })));
        console.log('firebaseProjects:', firebaseProjects.map(p => ({ id: p.id, title: p.title })));
        return [];
      }
      
      console.log('✅ 선택된 프로젝트 찾음:', selectedProject.title);
      
      const projectFolders = folders[selectedProjectId] || [];
      
      // 현재 폴더 내부에 있는 경우
      if (currentFolderId) {
        const currentFolder = projectFolders.find(f => f.id === currentFolderId);
        if (currentFolder) {
          const items = [
            { id: 'new-design', type: 'new-design', name: '디자인 생성', project: selectedProject, icon: '+' }
          ];
          
          // 폴더 내부 파일들 추가
          currentFolder.children.forEach(child => {
            items.push({
              id: child.id,
              type: 'design',
              name: child.name,
              project: selectedProject,
              icon: ''
            });
          });
          
          return items;
        }
      }
      
      // 프로젝트 루트 레벨
      console.log('📁 프로젝트 루트 레벨 아이템 생성:', {
        currentFolderId,
        activeMenu,
        selectedProjectId,
        '프로젝트 루트 레벨 조건': {
          '선택된 프로젝트 있음': !!selectedProjectId,
          '현재 폴더 없음': currentFolderId === null,
          '프로젝트 메뉴': activeMenu === 'project'
        }
      });
      const items = [
        { id: 'new-design', type: 'new-design', name: '디자인 생성', project: selectedProject, icon: '+' }
      ];
      console.log('✅ 디자인 생성 카드 추가됨:', items[0]);
      
      // 폴더들 추가
      projectFolders.forEach(folder => {
        items.push({
          id: folder.id,
          type: 'folder',
          name: folder.name,
          project: selectedProject,
          icon: '📁'
        });
      });
      
      // 폴더에 속하지 않은 파일들만 추가 (furnitureCount가 있는 경우에만)
      const allFolderChildren = projectFolders.flatMap(folder => folder.children);
      const folderChildIds = new Set(allFolderChildren.map(child => child.id));
      
      if (selectedProject.furnitureCount && selectedProject.furnitureCount > 0) {
        const rootDesignId = `${selectedProject.id}-design`;
        if (!folderChildIds.has(rootDesignId)) {
          items.push({
            id: rootDesignId, 
            type: 'design', 
            name: selectedProject.title, // 프로젝트 이름을 사용
            project: selectedProject, 
            icon: ''
          });
        }
      }
      
      console.log('📊 최종 아이템 개수:', items.length);
      return items;
    }
    
    // 북마크 메뉴인 경우 프로젝트와 디자인 파일 모두 표시
    if (activeMenu === 'bookmarks') {
      const items = [];
      
      // 북마크된 프로젝트들
      const filteredProjects = getFilteredProjects();
      filteredProjects.forEach(project => {
        items.push({
          id: project.id,
          type: 'project',
          name: project.title,
          project: project,
          icon: ''
        });
      });
      
      // 북마크된 디자인 파일들
      const bookmarkedDesignItems = getBookmarkedDesignItems();
      items.push(...bookmarkedDesignItems);
      
      // 북마크된 폴더들
      const bookmarkedFolderItems = getBookmarkedFolderItems();
      items.push(...bookmarkedFolderItems);
      
      console.log('📋 북마크 뷰 - 전체 아이템:', {
        totalItems: items.length,
        projectsCount: filteredProjects.length,
        designsCount: bookmarkedDesignItems.length,
        foldersCount: bookmarkedFolderItems.length
      });
      
      return items;
    }
    
    // 메뉴별 프로젝트 필터링 적용
    const filteredProjects = getFilteredProjects();
    console.log('📋 전체 프로젝트 뷰 - 필터링된 프로젝트들:', {
      activeMenu,
      allProjectsCount: allProjects.length,
      filteredProjectsCount: filteredProjects.length,
      filteredProjects: filteredProjects.map(p => ({id: p.id, title: p.title}))
    });
    
    return filteredProjects.map(project => ({ 
      id: project.id, 
      type: 'project', 
      name: project.title, 
      project: project, 
      icon: '' 
    }));
  };

  const displayedItems = useMemo(() => {
    const items = getDisplayedItems();
    console.log('💡 displayedItems 계산 완료:', {
      itemsCount: items.length,
      selectedProjectId,
      projectDesignFilesKeys: Object.keys(projectDesignFiles),
      hasDesignFiles: projectDesignFiles[selectedProjectId]?.length > 0
    });
    return items;
  }, [selectedProjectId, allProjects, activeMenu, currentFolderId, folders, projectDesignFiles]);
  
  console.log('💡 displayedItems 최종 결과:', displayedItems);
  
  // 정렬 적용
  const sortedItems = [...displayedItems].sort((a, b) => {
    if (sortBy === 'date') {
      // 최신순 정렬
      const dateA = a.project?.lastModified || new Date(0);
      const dateB = b.project?.lastModified || new Date(0);
      return dateB.getTime() - dateA.getTime();
    } else {
      // 이름순 정렬
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      return nameA.localeCompare(nameB, 'ko');
    }
  });

  const handleDesignOpen = (id: string, designFileName?: string) => {
    console.log('🚀 디자인 에디터 열기 시도:', {
      projectId: id,
      designFileName,
      hasDesignFileName: !!designFileName
    });
    
    // React Router로 네비게이션 (기본은 같은 탭에서 이동)
    const url = designFileName 
      ? `/configurator?projectId=${id}&designFileName=${encodeURIComponent(designFileName)}`
      : `/configurator?projectId=${id}`;
    
    console.log('🔗 네비게이션 URL:', url);
    
    try {
      navigate(url);
      console.log('✅ 네비게이션 성공');
    } catch (error) {
      console.error('❌ 네비게이션 실패:', error);
    }
    // 만약 새 탭에서 열고 싶다면: window.open(url, '_blank');
  };

  // 3D 뷰어 모달 핸들러
  const handleOpenViewer = (projectId: string, designFileId?: string) => {
    console.log('🔥 handleOpenViewer 호출:', { projectId, designFileId });
    setViewerModal({
      isOpen: true,
      projectId: projectId,
      designFileId: designFileId
    });
  };

  const handleCloseViewer = () => {
    setViewerModal({
      isOpen: false,
      projectId: '',
      designFileId: undefined
    });
  };

  // 썸네일 생성 함수
  const getThumbnail = async (project: ProjectSummary): Promise<string> => {
    // 캐시에서 먼저 확인
    if (thumbnailCache.has(project.id)) {
      return thumbnailCache.get(project.id)!;
    }

    try {
      // 3D 썸네일 생성
      const thumbnailUrl = await generateProjectThumbnail(project);
      
      // 캐시에 저장
      setThumbnailCache(prev => new Map(prev).set(project.id, thumbnailUrl));
      
      return thumbnailUrl;
    } catch (error) {
      console.error('썸네일 생성 실패:', error);
      // 기본 썸네일 반환
      return '';
    }
  };

  const handleViewModeToggle = (mode: 'grid' | 'list') => {
    setViewMode(mode);
  };

  const handleSortChange = (sort: 'date' | 'name') => {
    setSortBy(sort);
  };

  // 카드 체크박스 선택 핸들러
  const handleCardSelect = (cardId: string, isSelected: boolean) => {
    setSelectedCards(prev => {
      const newSelected = new Set(prev);
      if (isSelected) {
        newSelected.add(cardId);
      } else {
        newSelected.delete(cardId);
      }
      return newSelected;
    });
  };

  // 전체 선택/해제
  const handleSelectAll = (items: any[]) => {
    // new-design 타입은 체크박스가 없으므로 제외
    const selectableCardIds = items
      .filter(item => item.type !== 'new-design')
      .map(item => item.id);
    
    const allSelected = selectableCardIds.every(id => selectedCards.has(id));
    
    if (allSelected) {
      // 전체 해제
      setSelectedCards(new Set());
    } else {
      // 전체 선택
      setSelectedCards(new Set(selectableCardIds));
    }
  };

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(`.${styles.sortButton}`) && !target.closest(`.${styles.sortDropdownMenu}`)) {
        setSortDropdownOpen(false);
      }
    };

    if (sortDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [sortDropdownOpen]);

  // 폴더 토글
  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  // 프로젝트 선택
  const handleProjectSelect = (projectId: string) => {
    if (selectedProjectId === projectId) {
      // 같은 프로젝트 클릭 시 전체 프로젝트로 돌아가기
      setSelectedProjectId(null);
      setBreadcrumbPath(['전체 프로젝트']);
    } else {
      // 새 프로젝트 선택
      const targetProject = allProjects.find(p => p.id === projectId);
      if (targetProject) {
        setSelectedProjectId(projectId);
        setBreadcrumbPath(['전체 프로젝트', targetProject.title]);
        // 프로젝트 선택 시 폴더 데이터 불러오기
        loadFolderDataForProject(projectId);
        
        // 디자인 파일은 항상 새로 로드 (최신 데이터 보장)
        console.log('🔄 프로젝트 선택 시 디자인 파일 로드:', projectId);
        loadDesignFilesForProject(projectId);
      } else {
        // 프로젝트를 찾을 수 없는 경우에도 일단 선택은 하되, 
        // 나중에 프로젝트 목록이 업데이트되면 breadcrumb 업데이트
        console.warn('프로젝트를 찾을 수 없습니다. 일단 선택만 진행합니다:', projectId);
        setSelectedProjectId(projectId);
        setBreadcrumbPath(['전체 프로젝트', '로딩 중...']);
        // 프로젝트 선택 시 폴더 데이터와 디자인 파일들 불러오기
        loadFolderDataForProject(projectId);
        loadDesignFilesForProject(projectId);
      }
    }
  };

  // 브레드크럼 클릭 핸들러
  const handleBreadcrumbClick = (index: number) => {
    if (index === 0) {
      // 전체 프로젝트 클릭
      setSelectedProjectId(null);
      setCurrentFolderId(null);
      setBreadcrumbPath(['전체 프로젝트']);
    } else if (index === 1 && selectedProjectId && selectedProject) {
      // 프로젝트 클릭 - 폴더에서 나가기
      setCurrentFolderId(null);
      setBreadcrumbPath(['전체 프로젝트', selectedProject.title]);
    } else if (index === 2 && currentFolderId) {
      // 폴더 클릭 - 현재 상태 유지
      return;
    }
  };

  // 새 폴더 생성 모달 열기
  const handleCreateFolder = () => {
    setIsCreateFolderModalOpen(true);
    setNewFolderName('');
  };

  // 폴더 생성 처리
  const handleCreateFolderSubmit = async () => {
    if (!newFolderName.trim() || !selectedProjectId) return;
    
    setIsCreatingFolder(true);
    try {
      const folderId = `folder_${Date.now()}`;
      const newFolder = {
        id: folderId,
        name: newFolderName.trim(),
        type: 'folder' as const,
        children: [],
        expanded: false
      };

      const updatedFolders = [
        ...(folders[selectedProjectId] || []),
        newFolder
      ];
      
      setFolders(prev => ({
        ...prev,
        [selectedProjectId]: updatedFolders
      }));

      // Firebase에 저장
      await saveFolderDataToFirebase(selectedProjectId, updatedFolders);

      setIsCreateFolderModalOpen(false);
      setNewFolderName('');
      
    } catch (error) {
      console.error('폴더 생성 실패:', error);
      alert('폴더 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // 폴더 토글 (접기/펼치기)
  const toggleFolderExpansion = (folderId: string) => {
    if (!selectedProjectId) return;
    
    setFolders(prev => ({
      ...prev,
      [selectedProjectId]: prev[selectedProjectId]?.map(folder => 
        folder.id === folderId 
          ? { ...folder, expanded: !folder.expanded }
          : folder
      ) || []
    }));
  };

  // 폴더 모달 닫기
  const handleCloseFolderModal = () => {
    setIsCreateFolderModalOpen(false);
    setNewFolderName('');
  };

  // 더보기 메뉴 열기
  const handleMoreMenuOpen = (e: React.MouseEvent, itemId: string, itemName: string, itemType: 'folder' | 'design' | 'project') => {
    e.preventDefault();
    e.stopPropagation();
    setMoreMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      itemId,
      itemName,
      itemType
    });
  };

  // 더보기 메뉴 닫기
  const closeMoreMenu = () => {
    setMoreMenu(null);
  };

  // 더보기 메뉴 액션 핸들러들
  const handleRenameItem = async () => {
    if (!moreMenu) return;
    const newName = prompt('새 이름을 입력하세요:', moreMenu.itemName);
    if (newName && newName.trim()) {
      if (moreMenu.itemType === 'project') {
        // 프로젝트 이름 변경
        try {
          const { updateProject } = await import('@/firebase/projects');
          const result = await updateProject(moreMenu.itemId, {
            title: newName.trim()
          });
          
          if (result.error) {
            console.error('프로젝트 이름 변경 실패:', result.error);
            alert('프로젝트 이름 변경에 실패했습니다: ' + result.error);
            return;
          }
          
          // 로컬 상태 업데이트
          setFirebaseProjects(prev => prev.map(project => 
            project.id === moreMenu.itemId 
              ? { ...project, title: newName.trim() }
              : project
          ));
          
          // 현재 선택된 프로젝트인 경우 브레드크럼도 업데이트
          if (selectedProjectId === moreMenu.itemId) {
            setBreadcrumbPath(prev => {
              const newPath = [...prev];
              const projectIndex = newPath.findIndex(path => path !== '전체 프로젝트');
              if (projectIndex !== -1) {
                newPath[projectIndex] = newName.trim();
              }
              return newPath;
            });
          }
          
          console.log('프로젝트 이름 변경 성공:', moreMenu.itemId, '→', newName.trim());
          
          // BroadcastChannel로 다른 탭에 알림
          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({ 
              type: 'PROJECT_UPDATED', 
              action: 'renamed',
              projectId: moreMenu.itemId,
              newName: newName.trim()
            });
            channel.close();
          } catch (error) {
            console.warn('BroadcastChannel 전송 실패 (무시 가능):', error);
          }
          
        } catch (error) {
          console.error('프로젝트 이름 변경 중 오류:', error);
          alert('프로젝트 이름 변경 중 오류가 발생했습니다.');
        }
      } else if (moreMenu.itemType === 'folder') {
        // 폴더 이름 변경
        const updatedFolders = folders[selectedProjectId!]?.map(folder => 
          folder.id === moreMenu.itemId 
            ? { ...folder, name: newName.trim() }
            : folder
        ) || [];
        
        setFolders(prev => ({
          ...prev,
          [selectedProjectId!]: updatedFolders
        }));

        // Firebase에 저장
        await saveFolderDataToFirebase(selectedProjectId!, updatedFolders);
      } else if (moreMenu.itemType === 'design') {
        // 디자인 파일 이름 변경
        try {
          // TODO: Firebase에서 실제 디자인파일 데이터 업데이트 필요
          // 현재는 로컬 상태만 업데이트
          
          // 폴더 내부 디자인 파일인지 확인
          let isInFolder = false;
          if (selectedProjectId) {
            const projectFolders = folders[selectedProjectId] || [];
            for (const folder of projectFolders) {
              if (folder.children.some(child => child.id === moreMenu.itemId)) {
                isInFolder = true;
                break;
              }
            }
          }
          
          if (isInFolder) {
            // 폴더 내부 디자인 파일인 경우 - 폴더 데이터에서 이름 변경
            setFolders(prev => ({
              ...prev,
              [selectedProjectId!]: prev[selectedProjectId!]?.map(folder => ({
                ...folder,
                children: folder.children.map(child => 
                  child.id === moreMenu.itemId 
                    ? { ...child, name: newName.trim() }
                    : child
                )
              })) || []
            }));
            
            // Firebase에 폴더 데이터 저장
            const updatedFolders = folders[selectedProjectId!]?.map(folder => ({
              ...folder,
              children: folder.children.map(child => 
                child.id === moreMenu.itemId 
                  ? { ...child, name: newName.trim() }
                  : child
              )
            })) || [];
            await saveFolderDataToFirebase(selectedProjectId!, updatedFolders);
          } else {
            // 루트 레벨 디자인 파일인 경우 - Firebase 디자인파일 업데이트
            const { updateDesignFile } = await import('@/firebase/projects');
            const result = await updateDesignFile(moreMenu.itemId, {
              name: newName.trim()
            });
            
            if (result.error) {
              console.error('디자인파일 이름 변경 실패:', result.error);
              alert('디자인파일 이름 변경에 실패했습니다: ' + result.error);
              return;
            }
            
            console.log('루트 레벨 디자인파일 이름 변경 성공:', moreMenu.itemId, '→', newName.trim());
            
            // 프로젝트 목록을 새로고침하여 변경사항 반영
            await loadFirebaseProjects();
            
            // BroadcastChannel로 다른 탭에 알림
            try {
              const channel = new BroadcastChannel('project-updates');
              channel.postMessage({ 
                type: 'PROJECT_UPDATED', 
                action: 'design_renamed',
                projectId: selectedProjectId,
                designFileId: moreMenu.itemId,
                newName: newName.trim()
              });
              channel.close();
            } catch (error) {
              console.warn('BroadcastChannel 전송 실패 (무시 가능):', error);
            }
          }
          
        } catch (error) {
          console.error('디자인파일 이름 변경 중 오류:', error);
          alert('디자인파일 이름 변경 중 오류가 발생했습니다.');
        }
      }
      console.log('이름 변경:', moreMenu.itemId, '→', newName);
    }
    closeMoreMenu();
  };

  const handleDeleteItem = async () => {
    if (!moreMenu) return;
    
    let confirmMessage = '';
    if (moreMenu.itemType === 'project') {
      confirmMessage = `정말로 프로젝트 "${moreMenu.itemName}"을(를) 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 프로젝트 내의 모든 디자인파일과 폴더도 함께 삭제됩니다.`;
    } else if (moreMenu.itemType === 'folder') {
      confirmMessage = `정말로 폴더 "${moreMenu.itemName}"을(를) 삭제하시겠습니까?\n\n폴더 내의 모든 파일도 함께 삭제됩니다.`;
    } else {
      confirmMessage = `정말로 파일 "${moreMenu.itemName}"을(를) 삭제하시겠습니까?`;
    }
    
    if (window.confirm(confirmMessage)) {
      if (moreMenu.itemType === 'project') {
        // 프로젝트 삭제
        try {
          if (activeMenu === 'trash') {
            // 휴지통에서 영구 삭제
            const projectToDelete = deletedProjects.find(p => p.id === moreMenu.itemId);
            if (projectToDelete) {
              // Firebase에서 삭제
              const { error } = await deleteProject(projectToDelete.id);
              if (error) {
                alert('프로젝트 삭제 실패: ' + error);
              } else {
                // 휴지통에서 제거
                const updatedTrash = deletedProjects.filter(p => p.id !== moreMenu.itemId);
                setDeletedProjects(updatedTrash);
                
                // localStorage 업데이트
                if (user) {
                  localStorage.setItem(`trash_${user.uid}`, JSON.stringify(updatedTrash));
                }
                
                // BroadcastChannel로 다른 창에 삭제 알림
                try {
                  const channel = new BroadcastChannel('project-updates');
                  channel.postMessage({
                    type: 'PROJECT_UPDATED', 
                    action: 'deleted',
                    projectId: moreMenu.itemId 
                  });
                  channel.close();
                } catch (broadcastError) {
                  console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
                }
              }
            }
          }
        } catch (error) {
          console.error('프로젝트 삭제 중 오류:', error);
          alert('프로젝트 삭제 중 오류가 발생했습니다.');
        }
      } else if (moreMenu.itemType === 'folder') {
        const updatedFolders = folders[selectedProjectId!]?.filter(folder => folder.id !== moreMenu.itemId) || [];
        setFolders(prev => ({
          ...prev,
          [selectedProjectId!]: updatedFolders
        }));
        
        // Firebase에 저장
        await saveFolderDataToFirebase(selectedProjectId!, updatedFolders);
      } else if (moreMenu.itemType === 'design') {
        // 디자인 파일 삭제
        try {
          if (selectedProjectId) {
            const { error } = await deleteDesignFile(moreMenu.itemId, selectedProjectId);
            
            if (error) {
              alert('디자인 파일 삭제 실패: ' + error);
            } else {
              // 로컬 상태에서 제거
              setProjectDesignFiles(prev => ({
                ...prev,
                [selectedProjectId]: prev[selectedProjectId]?.filter(df => df.id !== moreMenu.itemId) || []
              }));
              
              // BroadcastChannel로 다른 창에 삭제 알림
              try {
                const channel = new BroadcastChannel('project-updates');
                channel.postMessage({
                  type: 'DESIGN_FILE_DELETED',
                  projectId: selectedProjectId,
                  designFileId: moreMenu.itemId
                });
                channel.close();
              } catch (broadcastError) {
                console.warn('BroadcastChannel 전송 실패 (무시 가능):', broadcastError);
              }
              
              console.log('✅ 디자인 파일 삭제 완료:', moreMenu.itemId);
            }
          }
        } catch (error) {
          console.error('디자인 파일 삭제 중 오류:', error);
          alert('디자인 파일 삭제 중 오류가 발생했습니다.');
        }
      }
      console.log('삭제:', moreMenu.itemId);
    }
    closeMoreMenu();
  };

  const handleShareItem = () => {
    if (!moreMenu) return;
    
    if (moreMenu.itemType === 'project') {
      shareProject(moreMenu.itemId);
    } else {
      // 폴더나 파일 공유
      alert('폴더/파일 공유 기능은 준비 중입니다.');
    }
    
    closeMoreMenu();
  };

  const handleDuplicateItem = async () => {
    if (!moreMenu) return;
    if (moreMenu.itemType === 'project') {
      // 프로젝트 복제
      try {
        const originalProject = allProjects.find(p => p.id === moreMenu.itemId);
        if (!originalProject) return;
        
        const { createProject } = await import('@/firebase/projects');
        const result = await createProject({
          title: `${originalProject.title} 복사본`
        });
        
        if (result.error) {
          console.error('프로젝트 복제 실패:', result.error);
          alert('프로젝트 복제에 실패했습니다: ' + result.error);
          return;
        }
        
        if (result.id) {
          console.log('프로젝트 복제 성공:', result.id);
          alert('프로젝트가 복제되었습니다.');
          
          // 프로젝트 목록 새로고침
          await loadFirebaseProjects();
          
          // BroadcastChannel로 다른 탭에 알림
          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({ 
              type: 'PROJECT_CREATED', 
              projectId: result.id,
              timestamp: Date.now()
            });
            channel.close();
          } catch (error) {
            console.warn('BroadcastChannel 전송 실패 (무시 가능):', error);
          }
        }
        
      } catch (error) {
        console.error('프로젝트 복제 중 오류:', error);
        alert('프로젝트 복제 중 오류가 발생했습니다.');
      }
    } else if (moreMenu.itemType === 'folder') {
      const originalFolder = folders[selectedProjectId!]?.find(f => f.id === moreMenu.itemId);
      if (originalFolder) {
        const newFolderId = `folder_${Date.now()}`;
        const newFolder = {
          ...originalFolder,
          id: newFolderId,
          name: `${originalFolder.name} 복사본`,
          children: []
        };
        const updatedFolders = [
          ...(folders[selectedProjectId!] || []),
          newFolder
        ];
        
        setFolders(prev => ({
          ...prev,
          [selectedProjectId!]: updatedFolders
        }));
        
        // Firebase에 저장
        await saveFolderDataToFirebase(selectedProjectId!, updatedFolders);
      }
    }
    console.log('복제하기:', moreMenu.itemId);
    closeMoreMenu();
  };

  // 드래그 시작
  const handleDragStart = (e: React.DragEvent, item: { id: string; name: string; type: 'design' | 'file'; projectId: string }) => {
    setDragState({
      isDragging: true,
      draggedItem: item,
      dragOverFolder: null
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify(item));
  };

  // 드래그 오버 (폴더 위에 있을 때)
  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState(prev => ({
      ...prev,
      dragOverFolder: folderId
    }));
  };

  // 드래그 리브 (폴더에서 벗어날 때)
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragState(prev => ({
      ...prev,
      dragOverFolder: null
    }));
  };

  // 드롭 (폴더에 파일을 놓을 때)
  const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    
    if (!dragState.draggedItem) return;
    
    const draggedItem = dragState.draggedItem;
    
    const updatedFolders = folders[selectedProjectId!]?.map(folder => {
      if (folder.id === targetFolderId) {
        return {
          ...folder,
          children: [...folder.children, draggedItem]
        };
      }
      return folder;
    }) || [];
    
    setFolders(prev => ({
      ...prev,
      [selectedProjectId!]: updatedFolders
    }));
    
    // Firebase에 저장
    await saveFolderDataToFirebase(selectedProjectId!, updatedFolders);
    
    // 드래그 상태 초기화
    setDragState({
      isDragging: false,
      draggedItem: null,
      dragOverFolder: null
    });
    
    console.log(`파일 "${draggedItem.name}"을 폴더에 추가했습니다.`);
  };

  // 드래그 종료
  const handleDragEnd = () => {
    setDragState({
      isDragging: false,
      draggedItem: null,
      dragOverFolder: null
    });
  };

  // 파일 우클릭 메뉴
  const handleFileRightClick = (e: React.MouseEvent, fileId: string, fileName: string, fileType: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      fileId,
      fileName,
      fileType
    });
  };

  // 컨텍스트 메뉴 닫기
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 파일 이름 변경
  const handleRenameFile = (fileId: string) => {
    const newName = prompt('새 파일명을 입력하세요:', contextMenu?.fileName);
    if (newName && newName.trim()) {
      console.log('파일 이름 변경:', fileId, '→', newName);
    }
    closeContextMenu();
  };

  // 파일 삭제
  const handleDeleteFile = (fileId: string) => {
    if (window.confirm('정말로 이 파일을 삭제하시겠습니까?')) {
      console.log('파일 삭제:', fileId);
    }
    closeContextMenu();
  };

  // 새 프로젝트 생성 모달 열기
  const handleCreateProject = () => {
    setIsCreateModalOpen(true);
    setNewProjectName('');
  };

  // 프로젝트 생성 처리
  const handleCreateProjectSubmit = async () => {
    if (!newProjectName.trim()) return;
    
    setIsCreating(true);
    try {
      if (user) {
        const { id, error } = await createProject({
          title: newProjectName.trim()
        });

        if (error) {
          console.error('Firebase 프로젝트 생성 실패:', error);
          alert('프로젝트 생성에 실패했습니다: ' + error);
          return;
        }

        if (id) {
          console.log('✅ Firebase 프로젝트 생성 성공:', id);
          await loadFirebaseProjects();
          
          // 모달 닫기
          setIsCreateModalOpen(false);
          setNewProjectName('');
          
          // 프로젝트 선택
          handleProjectSelect(id);
          
          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({ 
              type: 'PROJECT_CREATED', 
              projectId: id,
              timestamp: Date.now()
            });
            console.log('📡 프로젝트 생성 알림 전송');
            channel.close();
          } catch (error) {
            console.warn('BroadcastChannel 전송 실패 (무시 가능):', error);
          }
        }
      } else {
        alert('프로젝트를 생성하려면 먼저 로그인해주세요.');
        navigate('/auth');
        return;
      }
      
    } catch (error) {
      console.error('프로젝트 생성 실패:', error);
      alert('프로젝트 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  // 모달 닫기
  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setNewProjectName('');
  };

  // 새로운 디자인 시작
  const handleCreateDesign = (projectId?: string) => {
    if (user) {
      // Step1 모달 열기
      setIsStep1ModalOpen(true);
    } else {
      alert('로그인이 필요합니다.');
    }
  };

  // Step1 모달 닫기
  const handleCloseStep1Modal = () => {
    setIsStep1ModalOpen(false);
  };

  // 로그아웃 핸들러
  const handleLogout = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsLogoutModalOpen(true);
  };

  // 실제 로그아웃 실행 함수
  const doLogout = async () => {
    try {
      console.log('🔐 Firebase 로그아웃 시작...');
      const { signOut } = await import('firebase/auth');
      const { auth } = await import('@/firebase/config');
      await signOut(auth);
      console.log('✅ Firebase 로그아웃 성공');
      navigate('/auth');
    } catch (error) {
      console.error('❌ 로그아웃 실패:', error);
      alert('로그아웃 중 오류가 발생했지만 로그인 페이지로 이동합니다.');
      navigate('/auth');
    }
  };

  // 현재 날짜 포맷팅
  const formatDate = (date: Date) => {
    return `수정일: ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 오후 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // 로딩 상태 표시
  if (loading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.emptyState}>
          <div>프로젝트 목록을 불러오는 중...</div>
        </div>
      </div>
    );
  }

  // 에러 상태 표시
  if (error) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>오류: {error}</div>
          <button onClick={loadFirebaseProjects} className={styles.emptyStateButton}>다시 시도</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard} data-menu={activeMenu}>
      {/* 좌측 사이드바 */}
      <aside className={styles.sidebar}>
        {/* 로고 영역 */}
        <div className={styles.logoSection}>
          <div className={styles.logo}>
            <Logo size="medium" />
          </div>
        </div>

        {/* 사용자 프로필 영역 */}
        <div className={styles.profileSection}>
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
              {user?.photoURL && !sidebarImageError ? (
                <img 
                  src={user.photoURL} 
                  alt="프로필" 
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }}
                  onError={() => setSidebarImageError(true)}
                  onLoad={() => setSidebarImageError(false)}
                />
              ) : (
                <UserIcon size={16} />
              )}
            </div>
            <div className={styles.userDetails}>
              <div className={styles.userName}>
                {user?.displayName || user?.email?.split('@')[0] || '사용자'}
              </div>
              <div className={styles.userEmail}>
                {user?.email || '로그인이 필요합니다'}
              </div>
            </div>
          </div>
        </div>
        
        {/* 프로젝트 생성 버튼 */}
        <div className={styles.createProjectSection}>
          <button className={styles.createProjectBtn} onClick={handleCreateProject}>
            <PlusIcon size={16} />
            Create Project
          </button>
        </div>
        
        {/* 네비게이션 메뉴 */}
        <nav className={styles.navSection}>
          <div 
            className={`${styles.navItem} ${activeMenu === 'all' ? styles.active : ''}`}
            onClick={() => {
              setActiveMenu('all');
              setSelectedProjectId(null);
              setBreadcrumbPath(['전체 프로젝트']);
            }}
          >
            <div className={styles.navItemIcon}>
              <FolderIcon size={20} />
            </div>
            <span>전체 프로젝트</span>
            <span className={styles.navItemCount}>{allProjects.length}</span>
          </div>
          
          <div 
            className={`${styles.navItem} ${activeMenu === 'bookmarks' ? styles.active : ''}`}
            onClick={() => {
              setActiveMenu('bookmarks');
              setSelectedProjectId(null);
              setBreadcrumbPath([]);
            }}
          >
            <div className={styles.navItemIcon}>
              <StarIcon size={20} />
            </div>
            <span>북마크</span>
            <span className={styles.navItemCount}>{bookmarkedProjects.size + bookmarkedDesigns.size + bookmarkedFolders.size}</span>
          </div>
          
          <div 
            className={`${styles.navItem} ${activeMenu === 'shared' ? styles.active : ''}`}
            onClick={() => {
              setActiveMenu('shared');
              setSelectedProjectId(null);
              setBreadcrumbPath([]);
            }}
          >
            <div className={styles.navItemIcon}>
              <ShareIcon size={20} />
            </div>
            <span>공유 프로젝트</span>
            <span className={styles.navItemCount}>{sharedProjects.length}</span>
          </div>
          
          <div 
            className={`${styles.navItem} ${activeMenu === 'profile' ? styles.active : ''}`}
            onClick={() => {
              setActiveMenu('profile');
              setBreadcrumbPath([]);
            }}
          >
            <div className={styles.navItemIcon}>
              <UserIcon size={20} />
            </div>
            <span>내 정보 관리</span>
          </div>
          
          <div 
            className={`${styles.navItem} ${activeMenu === 'team' ? styles.active : ''}`}
            onClick={() => {
              setActiveMenu('team');
              setBreadcrumbPath([]);
            }}
          >
            <div className={styles.navItemIcon}>
              <UsersIcon size={20} />
            </div>
            <span>팀 관리</span>
          </div>
          
          <div 
            className={`${styles.navItem} ${activeMenu === 'trash' ? styles.active : ''}`}
            onClick={() => {
              setActiveMenu('trash');
              setSelectedProjectId(null);
              setBreadcrumbPath([]);
            }}
          >
            <div className={styles.navItemIcon}>
              <TrashIcon size={20} />
            </div>
            <span>휴지통</span>
            <span className={styles.navItemCount}>{deletedProjects.length}</span>
          </div>
        </nav>

        {/* 하단 설정 메뉴 */}
        <div className={styles.settingsSection}>
          <div 
            className={styles.settingsItem}
            onClick={() => setIsSettingsPanelOpen(true)}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.navItemIcon}>
              <SettingsIcon size={20} />
            </div>
            <span>설정</span>
          </div>
          
          {user && (
            <div className={styles.settingsItem} onClick={handleLogout}>
              <div className={styles.navItemIcon}>
                <LogOutIcon size={20} />
              </div>
              <span>로그아웃</span>
            </div>
          )}
          
          {!user && (
            <div 
              className={styles.settingsItem}
              onClick={() => navigate('/auth')}
            >
              <div className={styles.navItemIcon}>
                <UserIcon size={20} />
              </div>
              <span>로그인</span>
            </div>
          )}
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className={styles.main}>
        {/* 상단 헤더 */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.headerActions}>
              <button className={styles.actionButton}>
                <MessageIcon size={20} />
              </button>
              <NotificationBadge>
                <button className={styles.actionButton}>
                  <BellIcon size={20} />
                </button>
              </NotificationBadge>
            </div>
            
            {user && (
              <div className={styles.userProfile}>
                <div className={styles.userProfileAvatar}>
                  {user?.photoURL && !headerImageError ? (
                    <img 
                      src={user.photoURL} 
                      alt="프로필" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        borderRadius: '50%',
                        objectFit: 'cover'
                      }}
                      onError={() => setHeaderImageError(true)}
                      onLoad={() => setHeaderImageError(false)}
                    />
                  ) : (
                    <UserIcon size={14} />
                  )}
                </div>
                <span className={styles.userProfileName}>
                  {user?.displayName || user?.email?.split('@')[0] || '사용자'}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* 서브헤더 */}
        <div className={styles.subHeader}>
          <div className={styles.subHeaderContent}>
            {/* 선택된 아이템 개수 표시 (좌측) */}
            {selectedCards.size > 0 && (
              <div className={styles.selectionInfo}>
                <span>{selectedCards.size}개의 항목이 선택됨</span>
                <button 
                  className={styles.clearSelectionBtn}
                  onClick={() => setSelectedCards(new Set())}
                >
                  선택 해제
                </button>
              </div>
            )}
            
            {/* 우측 액션 버튼들 */}
            <div className={styles.subHeaderActions}>
              {/* 검색바 */}
              <div className={styles.searchContainer}>
                <div className={styles.searchIcon}>
                  <SearchIcon size={16} />
                </div>
                <input
                  type="text"
                  placeholder="프로젝트 검색..."
                  className={styles.searchInput}
                />
              </div>
              
              {/* 뷰 모드 토글 */}
              <div className={styles.viewToggleGroup}>
                <button 
                  className={`${styles.viewToggleButton} ${viewMode === 'grid' ? styles.active : ''}`}
                  onClick={() => handleViewModeToggle('grid')}
                  title="그리드 보기"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="1" width="6" height="6" rx="1"/>
                    <rect x="9" y="1" width="6" height="6" rx="1"/>
                    <rect x="1" y="9" width="6" height="6" rx="1"/>
                    <rect x="9" y="9" width="6" height="6" rx="1"/>
                  </svg>
                </button>
                <button 
                  className={`${styles.viewToggleButton} ${viewMode === 'list' ? styles.active : ''}`}
                  onClick={() => handleViewModeToggle('list')}
                  title="리스트 보기"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="2" width="14" height="2" rx="1"/>
                    <rect x="1" y="7" width="14" height="2" rx="1"/>
                    <rect x="1" y="12" width="14" height="2" rx="1"/>
                  </svg>
                </button>
              </div>
              
              {/* 정렬 드롭다운 */}
              <button 
                className={styles.sortButton}
                onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 6h10M5 10h6M7 14h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
                </svg>
                <span>{sortBy === 'date' ? '최신순' : '이름순'}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>
              
              {sortDropdownOpen && (
                <div className={styles.sortDropdownMenu}>
                  <button 
                    className={`${styles.sortOption} ${sortBy === 'date' ? styles.active : ''}`}
                    onClick={() => {
                      handleSortChange('date');
                      setSortDropdownOpen(false);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 3v10M5 10l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                    최신순
                  </button>
                  <button 
                    className={`${styles.sortOption} ${sortBy === 'name' ? styles.active : ''}`}
                    onClick={() => {
                      handleSortChange('name');
                      setSortDropdownOpen(false);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 6h8M4 10h5M4 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                    </svg>
                    이름순
                  </button>
                </div>
              )}
              
              {/* 휴지통 비우기 버튼 */}
              {activeMenu === 'trash' && deletedProjects.length > 0 && (
                <button 
                  className={styles.emptyTrashBtn}
                  onClick={emptyTrash}
                >
                  <TrashIcon size={16} />
                  <span>휴지통 비우기</span>
                </button>
              )}
              
              {/* 리스트 뷰에서 디자인 생성 버튼 */}
              {viewMode === 'list' && currentFolderId && (
                <button 
                  className={styles.createDesignBtn}
                  onClick={() => {
                    if (selectedProjectId) {
                      navigate(`/configurator?project=${selectedProjectId}&design=new`);
                    }
                  }}
                >
                  <PlusIcon size={16} />
                  <span>새 디자인</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={styles.content}>
          {/* 프로젝트 트리 - 전체 프로젝트 메뉴일 때만 표시 */}
          {activeMenu === 'all' && (
          <aside className={`${styles.projectTree} ${isFileTreeCollapsed ? styles.collapsed : ''}`}>
            <div className={styles.treeHeader}>
              {allProjects.length > 0 && (
                <button 
                  className={styles.treeToggleButton}
                  onClick={() => setIsFileTreeCollapsed(!isFileTreeCollapsed)}
                  aria-label={isFileTreeCollapsed ? "파일트리 펼치기" : "파일트리 접기"}
                >
                  <span className={`${styles.toggleIcon} ${isFileTreeCollapsed ? styles.collapsed : ''}`}>
                    ◀
                  </span>
                </button>
              )}
              <div className={styles.projectSelectorContainer}>
                <SimpleProjectDropdown
                  projects={allProjects}
                  currentProject={selectedProject}
                  onProjectSelect={(project) => {
                    setSelectedProjectId(project.id);
                    setBreadcrumbPath(['전체 프로젝트', project.title]);
                    loadFolderDataForProject(project.id);
                  }}
                />
              </div>
            </div>
            
            <div className={styles.treeContent}>
              {selectedProjectId && selectedProject ? (
                (() => {
                  if (!selectedProject) return null;
                  
                  const projectFolders = folders[selectedProjectId] || [];
                  const hasDesignFiles = selectedProject.furnitureCount && selectedProject.furnitureCount > 0;
                  
                  return (
                    <div>
                      {/* 새 폴더 생성 버튼 */}
                      <button className={styles.createFolderBtn} onClick={handleCreateFolder}>
                        <div className={styles.createFolderIcon}>
                          <FolderIcon size={16} />
                          <PlusIcon size={12} />
                        </div>
                        <span>새로운 폴더</span>
                      </button>
                      
                      {/* 프로젝트 루트 */}
                      <div 
                        className={`${styles.treeItem} ${styles.active}`}
                        onClick={() => {
                          // 프로젝트 루트 클릭 시 프로젝트 메인으로 이동
                          setCurrentFolderId(null);
                          setBreadcrumbPath(['전체 프로젝트', selectedProject.title]);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={styles.treeItemIcon}>
                          <ProjectIcon size={16} />
                        </div>
                        <span>{selectedProject.title}</span>
                        <div className={styles.treeItemActions}>
                          <button 
                            className={styles.treeItemActionBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoreMenuOpen(e, selectedProject.id, selectedProject.title, 'project');
                            }}
                          >
                            ⋯
                          </button>
                        </div>
                      </div>
                      
                      {/* 폴더 목록 */}
                      {projectFolders.map(folder => (
                        <div key={folder.id}>
                          <div 
                            className={styles.treeItem}
                            onClick={() => {
                              // 폴더 클릭 시 해당 폴더로 이동
                              setCurrentFolderId(folder.id);
                              setBreadcrumbPath(['전체 프로젝트', selectedProject.title, folder.name]);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <div 
                              className={styles.treeItemIcon}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFolderExpansion(folder.id);
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <FolderIcon size={16} />
                            </div>
                            <span>{folder.name}</span>
                            {folder.children && folder.children.length > 0 && (
                              <span className={styles.treeItemCount}>{folder.children.length}</span>
                            )}
                            <div 
                              className={`${styles.dropdownArrow} ${styles.folderDropdown} ${folder.expanded ? styles.expanded : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFolderExpansion(folder.id);
                              }}
                            >
                              ▼
                            </div>
                            <div className={styles.treeItemActions}>
                              <button 
                                className={styles.treeItemActionBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoreMenuOpen(e, folder.id, folder.name, 'folder');
                                }}
                              >
                                ⋯
                              </button>
                            </div>
                          </div>
                          
                          {/* 폴더 내부 파일들 */}
                          {folder.expanded && folder.children && folder.children.length > 0 ? (
                            <div className={styles.folderChildren}>
                              {folder.children.map(child => (
                                <div 
                                  key={child.id} 
                                  className={`${styles.treeItem} ${styles.childItem}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('디자인 파일 클릭됨:', child, '폴더 ID:', folder.id, '프로젝트 ID:', selectedProjectId);
                                    
                                    // 1. 해당 프로젝트로 이동 (이미 있다면 스킵)
                                    if (selectedProjectId !== child.projectId && child.projectId) {
                                      handleProjectSelect(child.projectId);
                                    }
                                    
                                    // 2. 해당 폴더로 이동
                                    setCurrentFolderId(folder.id);
                                    setBreadcrumbPath(['전체 프로젝트', selectedProject.title, folder.name]);
                                    
                                    // 3. 잠시 대기 후 디자인 카드로 스크롤
                                    setTimeout(() => {
                                      // 디자인 카드 찾기
                                      const designCards = document.querySelectorAll(`.${styles.designCard}`);
                                      console.log('모든 디자인 카드:', designCards.length);
                                      
                                      // child.name으로 카드 찾기
                                      const targetCard = Array.from(designCards).find(card => {
                                        const cardElement = card as HTMLElement;
                                        const cardTitle = cardElement.querySelector(`.${styles.cardTitle}`)?.textContent;
                                        console.log('카드 제목 확인:', cardTitle, '찾는 디자인:', child.name);
                                        return cardTitle === child.name;
                                      });
                                      
                                      if (targetCard) {
                                        console.log('디자인 카드 찾음:', targetCard);
                                        
                                        // 카드로 스크롤
                                        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        
                                        // 오버레이 강제 표시
                                        (targetCard as HTMLElement).classList.add(styles.forceHover);
                                        
                                        // 3초 후 오버레이 제거
                                        setTimeout(() => {
                                          (targetCard as HTMLElement).classList.remove(styles.forceHover);
                                        }, 3000);
                                      } else {
                                        console.log('디자인 카드를 찾을 수 없음:', child.name);
                                      }
                                    }, 300);
                                  }}
                                  style={{ cursor: 'pointer', userSelect: 'none' }}
                                  onMouseDown={(e) => e.preventDefault()}
                                >
                                  <div className={styles.treeItemIcon}>
                                    <div className={styles.designIcon}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                        <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                                        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                                        <path d="M2 2l7.586 7.586"/>
                                        <circle cx="11" cy="11" r="2"/>
                                      </svg>
                                    </div>
                                  </div>
                                  <span>{child.name}</span>
                                  <div className={styles.treeItemActions}>
                                    <button 
                                      className={styles.treeItemActionBtn}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoreMenuOpen(e, child.id, child.name, child.type === 'file' ? 'design' : child.type);
                                      }}
                                    >
                                      ⋯
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                      
                      {/* 루트 레벨 디자인 파일 (폴더에 속하지 않은 파일들만) */}
                      {(() => {
                        const allFolderChildren = projectFolders.flatMap(folder => folder.children);
                        const folderChildIds = new Set(allFolderChildren.map(child => child.id));
                        const rootDesignId = `${selectedProject.id}-design`;
                        const isRootDesignInFolder = folderChildIds.has(rootDesignId);
                        
                        if (hasDesignFiles && !isRootDesignInFolder) {
                          return (
                            <div 
                              className={styles.treeItem}
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('루트 디자인 파일 클릭됨:', selectedProject.title);
                                
                                // 현재 위치에서 디자인 카드로 스크롤
                                setTimeout(() => {
                                  // 디자인 카드 찾기
                                  const designCards = document.querySelectorAll(`.${styles.designCard}`);
                                  console.log('모든 디자인 카드:', designCards.length);
                                  
                                  // 프로젝트 제목으로 카드 찾기
                                  const targetCard = Array.from(designCards).find(card => {
                                    const cardElement = card as HTMLElement;
                                    const cardTitle = cardElement.querySelector(`.${styles.cardTitle}`)?.textContent;
                                    console.log('카드 제목 확인:', cardTitle, '찾는 디자인:', selectedProject.title);
                                    return cardTitle === selectedProject.title;
                                  });
                                  
                                  if (targetCard) {
                                    console.log('디자인 카드 찾음:', targetCard);
                                    
                                    // 카드로 스크롤
                                    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    
                                    // 오버레이 강제 표시
                                    (targetCard as HTMLElement).classList.add(styles.forceHover);
                                    
                                    // 3초 후 오버레이 제거
                                    setTimeout(() => {
                                      (targetCard as HTMLElement).classList.remove(styles.forceHover);
                                    }, 3000);
                                  } else {
                                    console.log('디자인 카드를 찾을 수 없음');
                                  }
                                }, 100);
                              }}
                              onContextMenu={(e) => handleFileRightClick(e, rootDesignId, 'design.json', 'design')}
                            >
                              <div className={styles.treeItemIcon}>
                                <div className={styles.designIcon}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                    <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                                    <path d="M2 2l7.586 7.586"/>
                                    <circle cx="11" cy="11" r="2"/>
                                  </svg>
                                </div>
                              </div>
                              <span>{selectedProject.title}</span>
                              <div className={styles.treeItemActions}>
                                <button 
                                  className={styles.treeItemActionBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoreMenuOpen(e, rootDesignId, selectedProject.title, 'design');
                                  }}
                                >
                                  ⋯
                                </button>
                              </div>
                            </div>
                          );
                        } else if (!hasDesignFiles || isRootDesignInFolder) {
                          return null;
                        }
                        return null;
                      })()}
                    </div>
                  );
                })()
              ) : (
                user && allProjects.length > 0 ? (
                  <>
                    {allProjects.map(project => (
                      <div 
                        key={project.id}
                        className={styles.treeItem}
                        onClick={() => handleProjectSelect(project.id)}
                      >
                        <div className={styles.treeItemIcon}>
                          <ProjectIcon size={16} />
                        </div>
                        <span>{project.title}</span>
                        <span className={styles.treeItemCount}>1</span>
                        <div className={styles.treeItemActions}>
                          <button 
                            className={styles.treeItemActionBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoreMenuOpen(e, project.id, project.title, 'project');
                            }}
                          >
                            ⋯
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                ) : user ? (
                  <div className={styles.treeItem}>
                    <span style={{ color: '#999', fontSize: '14px' }}>
                      프로젝트가 없습니다
                    </span>
                  </div>
                ) : (
                  <div className={styles.treeItem}>
                    <span style={{ color: '#999', fontSize: '14px' }}>
                      로그인이 필요합니다
                    </span>
                  </div>
                )
              )}
            </div>
          </aside>
          )}

          {/* 프로젝트 카드 영역 */}
          <section className={styles.designArea}>
            {/* 파일 경로 (브레드크럼) */}
            <div className={styles.breadcrumb}>
              {activeMenu === 'bookmarks' && <h2 className={styles.pageTitle}>북마크</h2>}
              {activeMenu === 'all' && breadcrumbPath.map((item, index) => (
                <React.Fragment key={index}>
                  <span 
                    className={`${styles.breadcrumbItem} ${index === breadcrumbPath.length - 1 ? styles.active : ''}`}
                    onClick={() => handleBreadcrumbClick(index)}
                  >
                    {item}
                  </span>
                  {index < breadcrumbPath.length - 1 && (
                    <span className={styles.breadcrumbSeparator}>/</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* 협업 탭들 */}
            {activeMenu === 'shared' && (
              <SharedTab onProjectSelect={(projectId) => navigate(`/configurator?projectId=${projectId}`)} />
            )}
            {activeMenu === 'team' && (
              <TeamsTab onTeamSelect={(teamId) => console.log('팀 선택:', teamId)} />
            )}
            {activeMenu === 'profile' && (
              <ProfileTab />
            )}
            
            {/* 기존 프로젝트 그리드 (all, trash, bookmarks 메뉴일 때만 표시) */}
            {console.log('🔍 activeMenu 체크:', {
              activeMenu,
              isAllTrashBookmarks: activeMenu === 'all' || activeMenu === 'trash' || activeMenu === 'bookmarks',
              shouldShowGrid: (activeMenu === 'all' || activeMenu === 'trash' || activeMenu === 'bookmarks')
            })}
            {(activeMenu === 'all' || activeMenu === 'trash' || activeMenu === 'bookmarks') ? (
              <>
              {viewMode === 'list' && sortedItems.some(item => item.type !== 'new-design') && (
                <div className={styles.listTableHeader}>
                  <div className={styles.headerColumn}>
                    <input
                      type="checkbox"
                      checked={(() => {
                        const selectableItems = sortedItems.filter(item => item.type !== 'new-design');
                        return selectableItems.length > 0 && selectableItems.every(item => selectedCards.has(item.id));
                      })()}
                      onChange={() => handleSelectAll(sortedItems)}
                    />
                  </div>
                  <div className={styles.headerColumn}>제목</div>
                  <div className={styles.headerColumn}>마지막 수정일</div>
                  <div className={styles.headerColumn}>등록자</div>
                  <div className={styles.headerColumn}></div>
                </div>
              )}
              <div className={`${styles.designGrid} ${viewMode === 'list' ? styles.listView : ''} ${currentFolderId ? styles.folderView : ''}`}>
              
              {console.log('🎨 렌더링 시작:', {
                sortedItemsLength: sortedItems.length,
                viewMode,
                items: sortedItems.map(item => ({ type: item.type, name: item.name })),
                filteredItems: sortedItems.filter(item => {
                  if (viewMode === 'list' && item.type === 'new-design') {
                    return false;
                  }
                  return true;
                }).map(item => ({ type: item.type, name: item.name }))
              })}
              {(() => {
                const filteredItems = sortedItems.filter(item => {
                  // 리스트 뷰에서는 new-design 카드 제외
                  if (viewMode === 'list' && item.type === 'new-design') {
                    console.log('📝 리스트 뷰에서 new-design 카드 제외');
                    return false;
                  }
                  return true;
                });
                
                console.log('🔍 필터링 후 상태:', {
                  viewMode,
                  sortedItemsLength: sortedItems.length,
                  filteredItemsLength: filteredItems.length,
                  sortedItems: sortedItems.map(item => ({ type: item.type, name: item.name })),
                  filteredItems: filteredItems.map(item => ({ type: item.type, name: item.name }))
                });
                
                console.log('🚨 렌더링 조건 체크:', {
                  filteredItemsLength: filteredItems.length,
                  filteredItemsEmpty: filteredItems.length === 0,
                  willRenderCards: filteredItems.length > 0
                });
                
                return filteredItems.length > 0 ? (
                  filteredItems.map((item, index) => (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ 
                      duration: 0.3, 
                      delay: index * 0.05,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`${styles.designCard} ${item.type === 'new-design' ? styles.newDesign : ''} ${item.type === 'folder' ? styles.folderCard : ''}`}
                    data-design-id={item.type === 'design' ? item.id : undefined}
                    draggable={item.type === 'design'}
                    onDragStart={(e) => {
                      if (item.type === 'design') {
                        handleDragStart(e, {
                          id: item.id,
                          name: item.name,
                          type: 'design',
                          projectId: item.project.id
                        });
                      }
                    }}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => {
                      console.log('🖱️ 카드 클릭됨:', {
                        itemType: item.type,
                        itemName: item.name,
                        itemId: item.id,
                        projectId: item.project?.id,
                        clickEvent: e.type
                      });
                      
                      if (item.type === 'project') {
                        console.log('📂 프로젝트 선택');
                        handleProjectSelect(item.project.id);
                      } else if (item.type === 'new-design') {
                        console.log('➕ 새 디자인 생성');
                        handleCreateDesign(item.project.id);
                      } else if (item.type === 'loading') {
                        console.log('⏳ 로딩 중...');
                        // 로딩 아이템은 클릭 무시
                      } else if (item.type === 'folder') {
                        console.log('📁 폴더 이동');
                        // 폴더 클릭 시 폴더 내부로 이동
                        setCurrentFolderId(item.id);
                        const folder = folders[selectedProjectId!]?.find(f => f.id === item.id);
                        if (folder && selectedProject) {
                          setBreadcrumbPath(['전체 프로젝트', selectedProject.title, folder.name]);
                        }
                      } else if (item.type === 'design') {
                        console.log('🎨 디자인 카드 클릭 - 에디터로 이동', {
                          itemId: item.id,
                          projectId: item.project.id,
                          itemName: item.name
                        });
                        // 디자인 카드 클릭 시 에디터로 이동
                        handleDesignOpen(item.project.id, item.name);
                      }
                    }}
                  >
                    {/* 체크박스를 카드 좌측 상단에 배치 */}
                    {item.type !== 'new-design' && item.type !== 'loading' && (
                      <div className={styles.cardCheckbox}>
                        <input
                          type="checkbox"
                          checked={selectedCards.has(item.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleCardSelect(item.id, e.target.checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                    
                    {/* 더보기 버튼을 카드 우측 상단에 배치 */}
                    {item.type !== 'new-design' && item.type !== 'loading' && (
                      <button 
                        className={styles.cardActionButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.type === 'folder') {
                            handleMoreMenuOpen(e, item.id, item.name, 'folder');
                          } else if (item.type === 'design') {
                            handleMoreMenuOpen(e, item.id, item.name, 'design');
                          } else if (item.type === 'project') {
                            handleMoreMenuOpen(e, item.project.id, item.project.title, 'project');
                          }
                        }}
                      >
                        ⋯
                      </button>
                    )}
                    
                    <div 
                      className={`${styles.cardThumbnail} ${item.type === 'new-design' ? styles.newDesign : ''} ${item.type === 'folder' ? styles.folderDropZone : ''} ${dragState.dragOverFolder === item.id ? styles.dragOver : ''}`}
                      onDragOver={(e) => {
                        if (item.type === 'folder') {
                          handleDragOver(e, item.id);
                        }
                      }}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => {
                        if (item.type === 'folder') {
                          handleDrop(e, item.id);
                        }
                      }}
                    >
                      {item.type === 'new-design' ? (
                        <div className={styles.cardThumbnailContent}>
                          <div className={styles.cardThumbnailIcon}>
                            <PlusIcon size={32} />
                          </div>
                          <div className={styles.cardThumbnailText}>{item.name}</div>
                        </div>
                      ) : item.type === 'loading' ? (
                        <div className={styles.cardThumbnailContent}>
                          <div className={styles.cardThumbnailIcon}>
                            <div style={{ opacity: 0.5 }}>⏳</div>
                          </div>
                          <div className={styles.cardThumbnailText}>{item.name}</div>
                        </div>
                      ) : item.type === 'folder' ? (
                        <div className={styles.folderIcon}>
                          <svg className={styles.folderIconSvg} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 4h6l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="var(--theme-primary, #10b981)"/>
                            <path d="M4 6h16v10H4V6z" fill="var(--theme-primary, #10b981)" fillOpacity="0.7"/>
                          </svg>
                        </div>
                      ) : (
                        (() => {
                          // 디자인 파일인 경우 해당 디자인의 썸네일 표시
                          if (item.type === 'design') {
                            // 해당 디자인 파일 찾기 (item.designFile이 있으면 우선 사용)
                            const designFiles = projectDesignFiles[item.project.id] || [];
                            const designFile = item.designFile || designFiles.find(df => df.name === item.name || df.id === item.id);
                            
                            console.log('🔍 디자인 카드 썸네일 생성:', {
                              itemName: item.name,
                              itemId: item.id,
                              projectId: item.project.id,
                              designFilesCount: designFiles.length,
                              designFilesData: designFiles.map(df => ({
                                id: df.id,
                                name: df.name,
                                matchesName: df.name === item.name,
                                matchesId: df.id === item.id
                              })),
                              foundDesignFile: !!designFile,
                              designFileData: designFile ? {
                                id: designFile.id,
                                name: designFile.name,
                                hasSpaceConfig: !!designFile.spaceConfig,
                                hasFurniture: !!designFile.furniture,
                                furnitureCount: designFile.furniture?.placedModules?.length || 0
                              } : null
                            });
                            
                            return (
                              <div className={styles.designThumbnail}>
                                <ThumbnailImage 
                                  project={item.project}
                                  designFile={designFile ? {
                                    thumbnail: designFile.thumbnail,
                                    updatedAt: designFile.updatedAt,
                                    spaceConfig: designFile.spaceConfig,
                                    furniture: designFile.furniture
                                  } : undefined}
                                  className={styles.designThumbnailImage}
                                  alt={item.name}
                                />
                                
                                {/* 디자인 카드 호버 오버레이 */}
                                <div className={styles.designCardOverlay}>
                                  <button 
                                    className={styles.overlayButton}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('🔥 디자인 미리보기 버튼 클릭:', {
                                        itemId: item.id,
                                        itemType: item.type,
                                        projectId: item.project.id,
                                        hasDesignFile: !!item.designFile,
                                        designFileId: item.designFile?.id,
                                        itemData: item
                                      });
                                      // 실제 디자인 파일이 있으면 디자인 파일 ID 사용, 없으면 프로젝트 ID만 사용
                                      const actualDesignFileId = item.designFile?.id || (item.id.endsWith('-design') ? undefined : item.id);
                                      handleOpenViewer(item.project.id, actualDesignFileId);
                                    }}
                                  >
                                    <EyeIcon size={16} />
                                    디자인 미리보기
                                  </button>
                                  <button 
                                    className={`${styles.overlayButton} ${styles.primary}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('🎨 오버레이 버튼 클릭 - 에디터로 이동', {
                                        itemId: item.id,
                                        projectId: item.project.id,
                                        itemName: item.name
                                      });
                                      handleDesignOpen(item.project.id, item.name);
                                    }}
                                  >
                                    <EditIcon size={16} />
                                    에디터로 이동
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          
                          // 프로젝트인 경우 모든 파일과 폴더를 가져와서 썸네일 그리드 생성
                          console.log('🚀 getProjectItems 호출 전 상태:', {
                            projectId: item.project.id,
                            projectTitle: item.project.title,
                            projectDesignFilesState: projectDesignFiles,
                            hasDesignFiles: !!projectDesignFiles[item.project.id],
                            designFilesCount: projectDesignFiles[item.project.id]?.length || 0
                          });
                          
                          const projectItems = getProjectItems(item.project.id);
                          
                          console.log('🎯 프로젝트 아이템 렌더링 확인:', {
                            projectId: item.project.id,
                            projectTitle: item.project.title,
                            projectItemsCount: projectItems.length,
                            projectItems: projectItems.map(i => ({ id: i.id, type: i.type, name: i.name })),
                            timestamp: new Date().toISOString()
                          });
                          
                          // 프로젝트에 아무것도 없는 경우 빈 상태 메시지 표시
                          if (projectItems.length === 0) {
                            return (
                              <div className={styles.emptyThumbnailState}>
                                <div className={styles.emptyThumbnailIcon}>
                                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14,2 14,8 20,8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                    <polyline points="10,9 9,9 8,9"/>
                                  </svg>
                                </div>
                                <div className={styles.emptyThumbnailText}>
                                  생성된 파일이 없습니다
                                </div>
                              </div>
                            );
                          }
                          
                          const displayItems = projectItems.slice(0, 4); // 최대 4개만 표시
                          
                          return (
                            <div className={styles.thumbnailGrid}>
                              {displayItems.map((projectItem, index) => (
                                <div key={projectItem.id} className={styles.thumbnailItem}>
                                  {projectItem.type === 'folder' ? (
                                    <div className={styles.thumbnailFolder}>
                                      <FolderIcon size={48} />
                                    </div>
                                  ) : (
                                    <div className={styles.thumbnailFile}>
                                      <div className={styles.fileIconWrapper}>
                                        <span className={styles.fileIcon}>D</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                              {/* 빈 슬롯 채우기 */}
                              {Array.from({ length: 4 - displayItems.length }).map((_, index) => (
                                <div key={`empty-${index}`} className={styles.thumbnailEmpty} />
                              ))}
                            </div>
                          );
                        })()
                      )}
                      
                    </div>
                    
                    {/* 디자인 생성 카드가 아닌 경우에만 cardInfo 표시 */}
                    {item.type !== 'new-design' && (
                      item.type === 'folder' ? (
                        <div className={styles.cardInfo}>
                          <div className={styles.cardTitle}>{item.name}</div>
                          <div className={styles.cardMeta}>
                            <div className={styles.cardDate}>
                              {(() => {
                                const dateToUse = item.project.createdAt || item.project.updatedAt;
                                if (dateToUse && dateToUse.seconds) {
                                  return new Date(dateToUse.seconds * 1000).toLocaleString('ko-KR', {
                                    year: 'numeric',
                                    month: 'long', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  });
                                }
                                return '날짜 정보 없음';
                              })()}
                            </div>
                          </div>
                          <div className={styles.cardFooter}>
                            <div className={styles.cardUser}>
                              <div className={styles.cardUserAvatar}>
                                {user?.photoURL ? (
                                  <img 
                                    src={user.photoURL} 
                                    alt="프로필" 
                                    style={{ 
                                      width: '100%', 
                                      height: '100%', 
                                      borderRadius: '50%',
                                      objectFit: 'cover'
                                    }}
                                  />
                                ) : (
                                  <UserIcon size={12} />
                                )}
                              </div>
                              <span className={styles.cardUserName}>
                                {user?.displayName || user?.email?.split('@')[0] || '이진수'}
                              </span>
                            </div>
                            <div className={styles.cardBadge}>
                              {(() => {
                                // 해당 폴더의 실제 디자인 파일 개수를 계산
                                const projectFolders = folders[item.project.id] || [];
                                const currentFolder = projectFolders.find(f => f.id === item.id);
                                if (!currentFolder?.children) return 0;
                                
                                // children 중에서 type이 'design'인 것만 카운트
                                const designCount = currentFolder.children.filter(child => 
                                  child.type === 'design' || child.type === 'file' || !child.type
                                ).length;
                                
                                console.log(`폴더 ${item.name}의 디자인 파일 개수:`, designCount, currentFolder.children);
                                return designCount;
                              })()}
                            </div>
                          </div>
                        </div>
                      ) : item.type === 'design' ? (
                        // 디자인 카드 (폴더 내부에서)
                        <div className={styles.cardInfo}>
                          <div className={styles.cardTitle}>{item.name}</div>
                          
                          <div className={styles.cardMeta}>
                            <div className={styles.cardDate}>
                              {(() => {
                                const dateToUse = item.project.updatedAt || item.project.createdAt;
                                if (dateToUse && dateToUse.seconds) {
                                  return new Date(dateToUse.seconds * 1000).toLocaleString('ko-KR', {
                                    year: 'numeric',
                                    month: 'long', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  });
                                }
                                return '날짜 정보 없음';
                              })()}
                            </div>
                          </div>
                        </div>
                      ) : (
                        // 프로젝트 카드
                        <div className={styles.cardInfo}>
                          <div className={styles.cardTitle}>{item.name}</div>
                          
                          <div className={styles.cardMeta}>
                            <div className={styles.cardDate}>
                              {(() => {
                                // createdAt이 있으면 사용하고, 없으면 updatedAt 사용
                                const dateToUse = item.project.createdAt || item.project.updatedAt;
                                if (dateToUse && dateToUse.seconds) {
                                  return new Date(dateToUse.seconds * 1000).toLocaleString('ko-KR', {
                                    year: 'numeric',
                                    month: 'long', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  });
                                }
                                return '날짜 정보 없음';
                              })()}
                            </div>
                          </div>
                          
                          <div className={styles.cardFooter}>
                            <div className={styles.cardUser}>
                              <div className={styles.cardUserAvatar}>
                                {user?.photoURL ? (
                                  <img 
                                    src={user.photoURL} 
                                    alt="프로필" 
                                    style={{ 
                                      width: '100%', 
                                      height: '100%', 
                                      borderRadius: '50%',
                                      objectFit: 'cover'
                                    }}
                                  />
                                ) : (
                                  <UserIcon size={12} />
                                )}
                              </div>
                              <span className={styles.cardUserName}>
                                {user?.displayName || user?.email?.split('@')[0] || '이진수'}
                              </span>
                            </div>
                            <div className={styles.cardBadge}>
                              V5.0
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </motion.div>
                ))
                ) : (
                  // 빈 상태 표시
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateTitle}>표시할 항목이 없습니다</div>
                  </div>
                );
              })()}
              
              {user && sortedItems.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateTitle}>
                    {activeMenu === 'bookmarks' && '북마크한 프로젝트가 없습니다'}
                    {activeMenu === 'shared' && '공유된 프로젝트가 없습니다'}
                    {activeMenu === 'trash' && '휴지통이 비어있습니다'}
                    {activeMenu === 'all' && '아직 생성된 프로젝트가 없습니다'}
                  </div>
                  <div className={styles.emptyStateSubtitle}>
                    {activeMenu === 'bookmarks' && '프로젝트를 북마크하려면 ⋯ 메뉴를 사용하세요'}
                    {activeMenu === 'shared' && '다른 사용자가 공유한 프로젝트가 여기에 표시됩니다'}
                    {activeMenu === 'trash' && '삭제된 프로젝트가 여기에 표시됩니다'}
                    {activeMenu === 'all' && '새 프로젝트를 생성해보세요'}
                  </div>
                </div>
              ) : null}
              </div>
              </>
            ) : null}
          </section>
        </div>
      </main>

      {/* 프로젝트 생성 모달 */}
      {isCreateModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>새 프로젝트 생성</h2>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="프로젝트 이름을 입력하세요"
              className={styles.modalInput}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newProjectName.trim()) {
                  handleCreateProjectSubmit();
                }
              }}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button
                onClick={handleCloseModal}
                disabled={isCreating}
                className={styles.modalCancelBtn}
              >
                취소
              </button>
              <button
                onClick={handleCreateProjectSubmit}
                disabled={!newProjectName.trim() || isCreating}
                className={styles.modalCreateBtn}
              >
                {isCreating ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 로그아웃 확인 모달 */}
      {isLogoutModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>로그아웃 하시겠습니까?</h2>
            <div style={{ margin: '16px 0', color: '#666', fontSize: '15px', textAlign: 'center' }}>
              로그아웃 하시겠습니까?
            </div>
            <div className={styles.modalActions}>
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className={styles.modalCancelBtn}
              >
                취소
              </button>
              <button
                onClick={doLogout}
                className={styles.modalCreateBtn}
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <>
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999
            }}
            onClick={closeContextMenu}
          />
          <div
            className={styles.contextMenu}
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 1000
            }}
          >
            <div 
              className={styles.contextMenuItem}
              onClick={() => handleRenameFile(contextMenu.fileId)}
            >
              이름 변경
            </div>
            <div 
              className={styles.contextMenuItem}
              onClick={() => handleDeleteFile(contextMenu.fileId)}
            >
              삭제
            </div>
          </div>
        </>
      )}

      {/* 더보기 메뉴 */}
      {moreMenu && (
        <>
          <div 
            className={styles.moreMenuBackdrop}
            onClick={closeMoreMenu}
          />
          <div
            className={styles.moreMenu}
            style={{
              position: 'fixed',
              top: moreMenu.y,
              left: moreMenu.x
            }}
          >
            <div 
              className={styles.moreMenuItem}
              onClick={handleRenameItem}
            >
              <EditIcon size={14} />
              이름 바꾸기
            </div>
            <div 
              className={styles.moreMenuItem}
              onClick={handleDuplicateItem}
            >
              <CopyIcon size={14} />
              복제하기
            </div>
            <div 
              className={styles.moreMenuItem}
              onClick={handleShareItem}
            >
              <ShareIcon size={14} />
              공유하기
            </div>
            {(moreMenu.itemType === 'project' || moreMenu.itemType === 'design' || moreMenu.itemType === 'folder') && (
              <div 
                className={styles.moreMenuItem}
                onClick={() => {
                  if (moreMenu.itemType === 'project') {
                    toggleBookmark(moreMenu.itemId);
                  } else if (moreMenu.itemType === 'design') {
                    toggleDesignBookmark(moreMenu.itemId);
                  } else if (moreMenu.itemType === 'folder') {
                    toggleFolderBookmark(moreMenu.itemId);
                  }
                  closeMoreMenu();
                }}
              >
                <StarIcon size={14} />
                {moreMenu.itemType === 'project' 
                  ? (bookmarkedProjects.has(moreMenu.itemId) ? '북마크 해제' : '북마크 추가')
                  : moreMenu.itemType === 'design' 
                  ? (bookmarkedDesigns.has(moreMenu.itemId) ? '북마크 해제' : '북마크 추가')
                  : (bookmarkedFolders.has(moreMenu.itemId) ? '북마크 해제' : '북마크 추가')
                }
              </div>
            )}
            <div 
              className={`${styles.moreMenuItem} ${styles.deleteItem}`}
              onClick={() => {
                if (activeMenu === 'trash') {
                  if (window.confirm('정말로 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
                    handleDeleteItem();
                  }
                } else {
                  if (moreMenu.itemType === 'project') {
                    const project = allProjects.find(p => p.id === moreMenu.itemId);
                    if (project) {
                      moveToTrash(project);
                      closeMoreMenu();
                    }
                  } else {
                    handleDeleteItem();
                  }
                }
              }}
            >
              <TrashIcon size={14} />
              {activeMenu === 'trash' ? '영구 삭제' : '휴지통으로 이동'}
            </div>
            {activeMenu === 'trash' && moreMenu.itemType === 'project' && (
              <div 
                className={styles.moreMenuItem}
                onClick={() => {
                  restoreFromTrash(moreMenu.itemId);
                  closeMoreMenu();
                }}
              >
                <FolderIcon size={14} />
                복원하기
              </div>
            )}
          </div>
        </>
      )}

      {/* 폴더 생성 모달 */}
      {isCreateFolderModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>새 폴더 생성</h2>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="폴더 이름을 입력하세요"
              className={styles.modalInput}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  handleCreateFolderSubmit();
                }
              }}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button
                onClick={handleCloseFolderModal}
                disabled={isCreatingFolder}
                className={styles.modalCancelBtn}
              >
                취소
              </button>
              <button
                onClick={handleCreateFolderSubmit}
                disabled={!newFolderName.trim() || isCreatingFolder}
                className={styles.modalCreateBtn}
              >
                {isCreatingFolder ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step1 모달 - 대시보드 컨텍스트에서도 라이트 테마 강제 적용 */}
      {isStep1ModalOpen && (
        <div data-theme="light" style={{ colorScheme: 'light' }}>
          <Step1 onClose={handleCloseStep1Modal} />
        </div>
      )}


      {/* 팀 관리 모달 */}
      {showTeamModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>팀 관리</h2>
            <div className={styles.teamModalContent}>
              <div className={styles.teamList}>
                <div className={styles.teamEmpty}>
                  <UsersIcon size={40} />
                  <p>아직 팀이 없습니다</p>
                  <button 
                    className={styles.createTeamBtn}
                    onClick={() => alert('팀 생성 기능은 준비 중입니다.')}
                  >
                    <PlusIcon size={16} />
                    새 팀 만들기
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                onClick={() => setShowTeamModal(false)}
                className={styles.modalCancelBtn}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D 뷰어 모달 */}
      <ProjectViewerModal
        isOpen={viewerModal.isOpen}
        onClose={handleCloseViewer}
        projectId={viewerModal.projectId}
        designFileId={viewerModal.designFileId}
      />

      {/* 설정 패널 */}
      <SettingsPanel 
        isOpen={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
      />
    </div>
  );
};

export default SimpleDashboard;