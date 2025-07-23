import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { UserIcon, HomeIcon, UsersIcon, SettingsIcon, LogOutIcon, PlusIcon, FolderIcon, StarIcon, TrashIcon, SearchIcon, BellIcon, MessageIcon, CalendarIcon, EditIcon, CopyIcon, ShareIcon, MoreHorizontalIcon } from '../components/common/Icons';
import { ProjectSummary } from '../firebase/types';
import { getUserProjects, createProject, saveFolderData, loadFolderData, FolderData } from '@/firebase/projects';
import { signOutUser } from '@/firebase/auth';
import { useAuth } from '@/auth/AuthProvider';
import SettingsPanel from '@/components/common/SettingsPanel';
import Logo from '@/components/common/Logo';
import Step0 from '../editor/Step0';
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
  
  // Step0 모달 상태
  const [isStep0ModalOpen, setIsStep0ModalOpen] = useState(false);

  // 로그아웃 모달 상태 추가
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // 설정 패널 상태 추가
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);

  // 메뉴 상태 추가
  const [activeMenu, setActiveMenu] = useState<'all' | 'bookmarks' | 'shared' | 'profile' | 'team' | 'trash'>('all');
  const [bookmarkedProjects, setBookmarkedProjects] = useState<Set<string>>(new Set());
  const [sharedProjects, setSharedProjects] = useState<ProjectSummary[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<ProjectSummary[]>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  
  // 파일트리 폴딩 상태
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);

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
        // 첫 번째 프로젝트의 데이터 구조 확인을 위한 로그
        if (projects.length > 0) {
          console.log('📊 첫 번째 프로젝트 데이터 구조:', projects[0]);
          console.log('📊 createdAt 필드 존재 여부:', 'createdAt' in projects[0]);
          console.log('📊 updatedAt 필드 존재 여부:', 'updatedAt' in projects[0]);
        }
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

  // 컴포넌트 마운트 시 Firebase 프로젝트 로드
  useEffect(() => {
    loadFirebaseProjects();
  }, [user, loadFirebaseProjects]);

  // BroadcastChannel로 프로젝트 업데이트 감지
  useEffect(() => {
    const channel = new BroadcastChannel('project-updates');
    
    const handleProjectUpdate = (event: MessageEvent) => {
      console.log('📡 프로젝트 업데이트 알림 수신:', event.data);
      
      if (event.data.type === 'PROJECT_SAVED' || event.data.type === 'PROJECT_CREATED') {
        console.log('🔄 프로젝트 목록 새로고침 중...');
        loadFirebaseProjects();
      }
    };

    channel.addEventListener('message', handleProjectUpdate);
    
    return () => {
      channel.removeEventListener('message', handleProjectUpdate);
      channel.close();
    };
  }, [loadFirebaseProjects]);

  // 북마크 및 휴지통 데이터 로드
  useEffect(() => {
    if (user) {
      // 북마크 로드
      const savedBookmarks = localStorage.getItem(`bookmarks_${user.uid}`);
      if (savedBookmarks) {
        setBookmarkedProjects(new Set(JSON.parse(savedBookmarks)));
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

  // 북마크 토글 함수
  const toggleBookmark = (projectId: string) => {
    const newBookmarks = new Set(bookmarkedProjects);
    if (newBookmarks.has(projectId)) {
      newBookmarks.delete(projectId);
    } else {
      newBookmarks.add(projectId);
    }
    setBookmarkedProjects(newBookmarks);
    if (user) {
      localStorage.setItem(`bookmarks_${user.uid}`, JSON.stringify(Array.from(newBookmarks)));
    }
  };

  // 휴지통으로 이동 함수
  const moveToTrash = (project: ProjectSummary) => {
    const updatedTrash = [...deletedProjects, { ...project, deletedAt: new Date() }];
    setDeletedProjects(updatedTrash);
    setFirebaseProjects(prev => prev.filter(p => p.id !== project.id));
    
    // localStorage에 저장
    if (user) {
      localStorage.setItem(`trash_${user.uid}`, JSON.stringify(updatedTrash));
    }
    
    // 북마크에서도 제거
    if (bookmarkedProjects.has(project.id)) {
      toggleBookmark(project.id);
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
    switch (activeMenu) {
      case 'bookmarks':
        return allProjects.filter(p => bookmarkedProjects.has(p.id));
      case 'shared':
        // 나중에 Firebase에서 실제 공유 프로젝트를 가져와야 함
        // 지금은 임시로 빈 배열 반환
        return sharedProjects;
      case 'trash':
        return deletedProjects;
      case 'all':
      default:
        return allProjects;
    }
  };
  
  // 프로젝트의 모든 파일과 폴더를 가져오는 함수
  const getProjectItems = (projectId: string) => {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return [];
    
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
    
    // 루트 레벨 디자인 파일 추가
    if (project.furnitureCount && project.furnitureCount > 0) {
      const rootDesignId = `${project.id}-design`;
      const allFolderChildren = projectFolders.flatMap(folder => folder.children);
      const folderChildIds = new Set(allFolderChildren.map(child => child.id));
      
      if (!folderChildIds.has(rootDesignId)) {
        items.push({
          id: rootDesignId,
          type: 'design',
          name: project.title,
          project: project
        });
      }
    }
    
    return items;
  };

  // 메인에 표시할 항목들 결정
  const getDisplayedItems = () => {
    if (selectedProjectId) {
      const selectedProject = allProjects.find(p => p.id === selectedProjectId);
      if (selectedProject) {
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
        const items = [
          { id: 'new-design', type: 'new-design', name: '디자인 생성', project: selectedProject, icon: '+' }
        ];
        
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
        
        // 폴더에 속하지 않은 파일들만 추가
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
        
        return items;
      }
    }
    // 메뉴별 프로젝트 필터링 적용
    const filteredProjects = getFilteredProjects();
    return filteredProjects.map(project => ({ 
      id: project.id, 
      type: 'project', 
      name: project.title, 
      project: project, 
      icon: '' 
    }));
  };

  const displayedItems = getDisplayedItems();

  const handleDesignOpen = (id: string, designFileName?: string) => {
    // React Router로 네비게이션 (기본은 같은 탭에서 이동)
    const url = designFileName 
      ? `/configurator?projectId=${id}&designFileName=${encodeURIComponent(designFileName)}`
      : `/configurator?projectId=${id}`;
    navigate(url);
    // 만약 새 탭에서 열고 싶다면: window.open(url, '_blank');
  };

  const handleViewModeToggle = (mode: 'grid' | 'list') => {
    setViewMode(mode);
  };

  const handleSortChange = (sort: 'date' | 'name') => {
    setSortBy(sort);
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
      const selectedProject = allProjects.find(p => p.id === projectId);
      if (selectedProject) {
        setSelectedProjectId(projectId);
        setBreadcrumbPath(['전체 프로젝트', selectedProject.title]);
        // 프로젝트 선택 시 폴더 데이터 불러오기
        loadFolderDataForProject(projectId);
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
    } else if (index === 1 && selectedProjectId) {
      // 프로젝트 클릭 - 폴더에서 나가기
      setCurrentFolderId(null);
      const selectedProject = allProjects.find(p => p.id === selectedProjectId);
      if (selectedProject) {
        setBreadcrumbPath(['전체 프로젝트', selectedProject.title]);
      }
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
          const { deleteProject } = await import('@/firebase/projects');
          const result = await deleteProject(moreMenu.itemId);
          
          if (result.error) {
            console.error('프로젝트 삭제 실패:', result.error);
            alert('프로젝트 삭제에 실패했습니다: ' + result.error);
            return;
          }
          
          console.log('프로젝트 삭제 성공:', moreMenu.itemId);
          alert('프로젝트가 삭제되었습니다.');
          
          // 삭제된 프로젝트가 현재 선택된 프로젝트인 경우 선택 해제
          if (selectedProjectId === moreMenu.itemId) {
            setSelectedProjectId(null);
            setBreadcrumbPath(['전체 프로젝트']);
          }
          
          // 프로젝트 목록 새로고침
          await loadFirebaseProjects();
          
          // BroadcastChannel로 다른 탭에 알림
          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({ 
              type: 'PROJECT_UPDATED', 
              action: 'deleted',
              projectId: moreMenu.itemId 
            });
            channel.close();
          } catch (error) {
            console.warn('BroadcastChannel 전송 실패 (무시 가능):', error);
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
      
      setIsCreateModalOpen(false);
      setNewProjectName('');
      
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
      if (projectId) {
        
        // 현재 폴더 내부에서 디자인 생성하는 경우
        if (currentFolderId) {
          const newDesignId = `design_${Date.now()}`;
          const newDesign = {
            id: newDesignId,
            name: '새 디자인',
            type: 'design' as const,
            projectId: projectId
          };
          
          // 폴더에 새 디자인 추가
          setFolders(prev => ({
            ...prev,
            [projectId]: prev[projectId]?.map(folder => 
              folder.id === currentFolderId 
                ? { ...folder, children: [...folder.children, newDesign] }
                : folder
            ) || []
          }));
          
          console.log('폴더에 새 디자인 추가:', newDesignId);
        }
        
        // 디자인 생성 시 브레드크럼에 '디자인' 추가
        const selectedProject = allProjects.find(p => p.id === projectId);
        if (selectedProject) {
          setBreadcrumbPath(['전체 프로젝트', selectedProject.title, '디자인']);
        }
      }
      
      // React Router로 네비게이션
      if (projectId) {
        navigate(`/configurator?projectId=${projectId}&mode=new-design&designFileName=${encodeURIComponent('새로운 디자인')}`);
      } else {
        navigate(`/configurator?designFileName=${encodeURIComponent('새로운 디자인')}`);
      }
    } else {
      setIsStep0ModalOpen(true);
    }
  };

  // Step0 모달 닫기
  const handleCloseStep0Modal = () => {
    setIsStep0ModalOpen(false);
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
    <div className={styles.dashboard}>
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
              setBreadcrumbPath(['모든 프로젝트']);
            }}
          >
            <div className={styles.navItemIcon}>
              <FolderIcon size={20} />
            </div>
            <span>모든 프로젝트</span>
            <span className={styles.navItemCount}>{allProjects.length}</span>
          </div>
          
          <div 
            className={`${styles.navItem} ${activeMenu === 'bookmarks' ? styles.active : ''}`}
            onClick={() => {
              setActiveMenu('bookmarks');
              setSelectedProjectId(null);
              setBreadcrumbPath(['북마크']);
            }}
          >
            <div className={styles.navItemIcon}>
              <StarIcon size={20} />
            </div>
            <span>북마크</span>
            <span className={styles.navItemCount}>{allProjects.filter(p => bookmarkedProjects.has(p.id)).length}</span>
          </div>
          
          <div 
            className={`${styles.navItem} ${activeMenu === 'shared' ? styles.active : ''}`}
            onClick={() => {
              setActiveMenu('shared');
              setSelectedProjectId(null);
              setBreadcrumbPath(['공유 프로젝트']);
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
            onClick={() => setShowProfileModal(true)}
          >
            <div className={styles.navItemIcon}>
              <UserIcon size={20} />
            </div>
            <span>내 정보 관리</span>
          </div>
          
          <div 
            className={`${styles.navItem} ${activeMenu === 'team' ? styles.active : ''}`}
            onClick={() => setShowTeamModal(true)}
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
              setBreadcrumbPath(['휴지통']);
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
            <div className={styles.breadcrumb}>
              {breadcrumbPath.map((item, index) => (
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
          </div>
          
          
          <div className={styles.headerRight}>
            {activeMenu === 'trash' && deletedProjects.length > 0 && (
              <button 
                onClick={emptyTrash}
                className={styles.emptyTrashBtn}
              >
                <TrashIcon size={16} />
                휴지통 비우기
              </button>
            )}
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
            
            <div className={styles.headerActions}>
              <button className={styles.actionButton}>
                <CalendarIcon size={20} />
              </button>
              <button className={styles.actionButton}>
                <MessageIcon size={20} />
              </button>
              <button className={styles.actionButton}>
                <BellIcon size={20} />
              </button>
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
            <div className={styles.subHeaderActions}>
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
            </div>
          </div>
        </div>

        <div className={styles.content}>
          {/* 프로젝트 트리 */}
          <aside className={`${styles.projectTree} ${isFileTreeCollapsed ? styles.collapsed : ''}`}>
            <div className={styles.treeHeader}>
              <button 
                className={styles.treeToggleButton}
                onClick={() => setIsFileTreeCollapsed(!isFileTreeCollapsed)}
                aria-label={isFileTreeCollapsed ? "파일트리 펼치기" : "파일트리 접기"}
              >
                <span className={`${styles.toggleIcon} ${isFileTreeCollapsed ? styles.collapsed : ''}`}>
                  ◀
                </span>
              </button>
              <div className={styles.projectSelectorContainer}>
                <select 
                  value={selectedProjectId || 'all'}
                  onChange={(e) => setSelectedProjectId(e.target.value === 'all' ? null : e.target.value)}
                  className={styles.projectSelector}
                >
                  <option value="all">모든 프로젝트</option>
                  {allProjects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
                <div className={styles.dropdownArrow}>▼</div>
              </div>
            </div>
            
            <div className={styles.treeContent}>
              {selectedProjectId ? (
                (() => {
                  const selectedProject = allProjects.find(p => p.id === selectedProjectId);
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
                          {folder.expanded && folder.children && folder.children.length > 0 && (
                            <div className={styles.folderChildren}>
                              {folder.children.map(child => (
                                <div 
                                  key={child.id} 
                                  className={`${styles.treeItem} ${styles.childItem}`}
                                  onClick={() => {
                                    // 디자인 파일 클릭 시 에디터로 이동
                                    if (child.type === 'design') {
                                      handleDesignOpen(child.projectId, child.name);
                                    }
                                  }}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <div className={styles.treeItemIcon}>
                                    <div className={styles.designIcon}>+</div>
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
                          )}
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
                              onClick={() => handleDesignOpen(selectedProject.id, selectedProject.title)}
                              onContextMenu={(e) => handleFileRightClick(e, rootDesignId, 'design.json', 'design')}
                            >
                              <div className={styles.treeItemIcon}>
                                <div className={styles.designIcon}>+</div>
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

          {/* 프로젝트 카드 영역 */}
          <section className={styles.designArea}>
            <div className={`${styles.designGrid} ${viewMode === 'list' ? styles.listView : ''}`}>
              
              {displayedItems.length > 0 ? (
                displayedItems.map(item => (
                  <div 
                    key={item.id} 
                    className={`${styles.designCard} ${item.type === 'new-design' ? styles.newDesign : ''} ${item.type === 'folder' ? styles.folderCard : ''}`}
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
                    onClick={() => {
                      if (item.type === 'design') {
                        handleDesignOpen(item.project.id);
                      } else if (item.type === 'project') {
                        handleProjectSelect(item.project.id);
                      } else if (item.type === 'new-design') {
                        handleCreateDesign(item.project.id);
                      } else if (item.type === 'folder') {
                        // 폴더 클릭 시 폴더 내부로 이동
                        setCurrentFolderId(item.id);
                        const folder = folders[selectedProjectId!]?.find(f => f.id === item.id);
                        const selectedProject = allProjects.find(p => p.id === selectedProjectId);
                        if (folder && selectedProject) {
                          setBreadcrumbPath(['전체 프로젝트', selectedProject.title, folder.name]);
                        }
                      }
                    }}
                  >
                    {/* 더보기 버튼을 카드 우측 상단에 배치 */}
                    {item.type !== 'new-design' && (
                      <button 
                        className={styles.cardActionButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.type === 'folder') {
                            handleMoreMenuOpen(e, item.id, item.name, 'folder');
                          } else if (item.type === 'design') {
                            handleMoreMenuOpen(e, item.id, item.name, 'design');
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
                      ) : item.type === 'folder' ? (
                        <div className={styles.cardThumbnailContent}>
                          <div className={styles.cardThumbnailIcon} style={{ background: 'var(--theme-primary, #10b981)' }}>
                            <FolderIcon size={32} />
                          </div>
                          <div className={styles.cardThumbnailText}>{item.name}</div>
                        </div>
                      ) : (
                        (() => {
                          // 디자인 파일인 경우 하나의 대표 썸네일만 표시
                          if (item.type === 'design') {
                            return (
                              <div className={styles.designThumbnail}>
                                {item.project.thumbnail ? (
                                  <img 
                                    src={item.project.thumbnail} 
                                    alt={item.name}
                                    className={styles.designThumbnailImage}
                                  />
                                ) : (
                                  <div className={styles.designThumbnailPlaceholder}>
                                    <div className={styles.designFileIcon}>
                                      <span className={styles.designIcon}>D</span>
                                    </div>
                                    <span style={{ fontSize: '12px', marginTop: '8px' }}>디자인</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          
                          // 프로젝트인 경우 모든 파일과 폴더를 가져와서 썸네일 그리드 생성
                          const projectItems = getProjectItems(item.project.id);
                          const displayItems = projectItems.slice(0, 4); // 최대 4개만 표시
                          
                          return (
                            <div className={styles.thumbnailGrid}>
                              {displayItems.map((projectItem, index) => (
                                <div key={projectItem.id} className={styles.thumbnailItem}>
                                  {projectItem.type === 'folder' ? (
                                    <div className={styles.thumbnailFolder}>
                                      <FolderIcon size={14} />
                                    </div>
                                  ) : (
                                    <div className={styles.thumbnailFile}>
                                      <div className={styles.fileIconWrapper}>
                                        <span className={styles.fileIcon}>🎨</span>
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
                            {(() => {
                              const projectItems = getProjectItems(item.project.id);
                              return projectItems.length;
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : selectedProjectId ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateTitle}>선택된 프로젝트를 찾을 수 없습니다</div>
                  <button 
                    onClick={() => setSelectedProjectId(null)}
                    className={styles.emptyStateButton}
                  >
                    모든 프로젝트 보기
                  </button>
                </div>
              ) : user ? (
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
                  {activeMenu === 'trash' && deletedProjects.length > 0 && (
                    <button 
                      onClick={emptyTrash}
                      className={styles.emptyStateButton}
                    >
                      휴지통 비우기
                    </button>
                  )}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateTitle}>로그인하여 프로젝트를 관리하세요</div>
                  <button 
                    onClick={() => navigate('/auth')}
                    className={styles.emptyStateButton}
                  >
                    로그인하기
                  </button>
                </div>
              )}
            </div>
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
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999
            }}
            onClick={closeMoreMenu}
          />
          <div
            className={styles.moreMenu}
            style={{
              position: 'fixed',
              top: moreMenu.y,
              left: moreMenu.x,
              zIndex: 1000
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
            {moreMenu.itemType === 'project' && (
              <div 
                className={styles.moreMenuItem}
                onClick={() => {
                  toggleBookmark(moreMenu.itemId);
                  closeMoreMenu();
                }}
              >
                <StarIcon size={14} />
                {bookmarkedProjects.has(moreMenu.itemId) ? '북마크 해제' : '북마크 추가'}
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

      {/* Step0 모달 */}
      {isStep0ModalOpen && (
        <div className={styles.step0ModalOverlay}>
          <div className={styles.step0ModalContent}>
            <Step0 onClose={handleCloseStep0Modal} />
          </div>
        </div>
      )}

      {/* 프로필 관리 모달 */}
      {showProfileModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>내 정보 관리</h2>
            <div className={styles.profileModalContent}>
              <div className={styles.profileSection}>
                <div className={styles.profileAvatar}>
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="프로필" />
                  ) : (
                    <UserIcon size={40} />
                  )}
                  <button className={styles.changeAvatarBtn}>사진 변경</button>
                </div>
                <div className={styles.profileInfo}>
                  <div className={styles.profileField}>
                    <label>이름</label>
                    <input 
                      type="text" 
                      value={user?.displayName || ''} 
                      placeholder="이름을 입력하세요"
                      className={styles.profileInput}
                    />
                  </div>
                  <div className={styles.profileField}>
                    <label>이메일</label>
                    <input 
                      type="email" 
                      value={user?.email || ''} 
                      disabled
                      className={styles.profileInput}
                    />
                  </div>
                  <div className={styles.profileField}>
                    <label>가입일</label>
                    <input 
                      type="text" 
                      value={user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('ko-KR') : ''} 
                      disabled
                      className={styles.profileInput}
                    />
                  </div>
                </div>
              </div>
              <div className={styles.profileStats}>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{allProjects.length}</div>
                  <div className={styles.statLabel}>프로젝트</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{bookmarkedProjects.size}</div>
                  <div className={styles.statLabel}>북마크</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{sharedProjects.length}</div>
                  <div className={styles.statLabel}>공유됨</div>
                </div>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                onClick={() => setShowProfileModal(false)}
                className={styles.modalCancelBtn}
              >
                닫기
              </button>
              <button
                onClick={() => {
                  alert('프로필 업데이트 기능은 준비 중입니다.');
                }}
                className={styles.modalCreateBtn}
              >
                저장
              </button>
            </div>
          </div>
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

      {/* 설정 패널 */}
      <SettingsPanel 
        isOpen={isSettingsPanelOpen}
        onClose={() => setIsSettingsPanelOpen(false)}
      />
    </div>
  );
};

export default SimpleDashboard;