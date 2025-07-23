import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { UserIcon, HomeIcon, UsersIcon, SettingsIcon, LogOutIcon, PlusIcon, FolderIcon, StarIcon, TrashIcon, SearchIcon, BellIcon, MessageIcon, CalendarIcon, EditIcon, CopyIcon, ShareIcon, MoreHorizontalIcon } from '../components/common/Icons';
import { ProjectSummary } from '../firebase/types';
import { getUserProjects, createProject, saveFolderData, loadFolderData, FolderData } from '@/firebase/projects';
import { signOutUser } from '@/firebase/auth';
import { useAuth } from '@/auth/AuthProvider';
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

  // 사용자별 프로젝트 목록 결정
  const allProjects = user ? firebaseProjects : [];
  
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
    return allProjects.map(project => ({ 
      id: project.id, 
      type: 'project', 
      name: project.title, 
      project: project, 
      icon: '' 
    }));
  };

  const displayedItems = getDisplayedItems();

  const handleDesignOpen = (id: string) => {
    // React Router로 네비게이션 (기본은 같은 탭에서 이동)
    navigate(`/configurator?projectId=${id}`);
    // 만약 새 탭에서 열고 싶다면: window.open(`/configurator?projectId=${id}`, '_blank');
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

  const handleViewModeToggle = (mode: 'grid' | 'list') => {
    setViewMode(mode);
  };

  const handleSortChange = (sort: 'date' | 'name') => {
    setSortBy(sort);
  };

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
      if (moreMenu.itemType === 'folder') {
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
        const rootDesignId = `${selectedProjectId}-design`;
        if (moreMenu.itemId === rootDesignId) {
          // 루트 레벨 디자인 파일인 경우 - 프로젝트 이름 변경
          const projectIndex = allProjects.findIndex(p => p.id === selectedProjectId);
          if (projectIndex !== -1) {
            const updatedProjects = [...allProjects];
            updatedProjects[projectIndex] = {
              ...updatedProjects[projectIndex],
              title: newName.trim()
            };
            setFirebaseProjects(updatedProjects);
            
            // 브레드크럼도 업데이트
            if (breadcrumbPath.length >= 2) {
              const newBreadcrumbPath = [...breadcrumbPath];
              newBreadcrumbPath[1] = newName.trim();
              setBreadcrumbPath(newBreadcrumbPath);
            }
          }
        } else {
          // 폴더 내부 디자인 파일인 경우
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
        }
      }
      console.log('이름 변경:', moreMenu.itemId, '→', newName);
    }
    closeMoreMenu();
  };

  const handleDeleteItem = async () => {
    if (!moreMenu) return;
    if (window.confirm(`정말로 이 ${moreMenu.itemType === 'folder' ? '폴더' : '파일'}를 삭제하시겠습니까?`)) {
      if (moreMenu.itemType === 'folder') {
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
    console.log('공유하기:', moreMenu.itemId);
    // 공유 기능 구현
    alert('공유 기능은 준비 중입니다.');
    closeMoreMenu();
  };

  const handleDuplicateItem = async () => {
    if (!moreMenu) return;
    if (moreMenu.itemType === 'folder') {
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
        navigate(`/configurator?projectId=${projectId}&mode=new-design`);
      } else {
        navigate('/configurator');
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

  return (
    <div className={styles.dashboard}>
      {/* 좌측 사이드바 */}
      <aside className={styles.sidebar}>
        {/* 로고 영역 */}
        <div className={styles.logoSection}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>L</div>
            <span>LOGO</span>
          </div>
        </div>

        {/* 사용자 프로필 영역 */}
        <div className={styles.profileSection}>
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>
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
          <button className={styles.createProjectBtn} onClick={handleCreateProject}>
            <PlusIcon size={16} />
            Creat Project
          </button>
        </div>
        
        {/* 네비게이션 메뉴 */}
        <nav className={styles.navSection}>
          <div className={`${styles.navItem} ${!selectedProjectId ? styles.active : ''}`}>
            <div className={styles.navItemIcon}>
              <HomeIcon size={20} />
            </div>
            <span>Home</span>
          </div>
          
          <div className={styles.navItem}>
            <div className={styles.navItemIcon}>
              <FolderIcon size={20} />
            </div>
            <span>All project</span>
            <span className={styles.navItemCount}>{allProjects.length}</span>
          </div>
          
          <div className={styles.navItem}>
            <div className={styles.navItemIcon}>
              <FolderIcon size={20} />
            </div>
            <span>Files</span>
          </div>
          
          <div className={styles.navItem}>
            <div className={styles.navItemIcon}>
              <FolderIcon size={20} />
            </div>
            <span>Projects</span>
            <span className={styles.navItemCount}>{allProjects.length}</span>
          </div>
          
          <div className={styles.navItem}>
            <div className={styles.navItemIcon}>
              <FolderIcon size={20} />
            </div>
            <span>Learn</span>
          </div>
          
          <div className={styles.navItem}>
            <div className={styles.navItemIcon}>
              <UsersIcon size={20} />
            </div>
            <span>팀관리</span>
          </div>
          
          <div className={styles.navItem}>
            <div className={styles.navItemIcon}>
              <StarIcon size={20} />
            </div>
            <span>즐겨찾기</span>
          </div>
          
          <div className={styles.navItem}>
            <div className={styles.navItemIcon}>
              <TrashIcon size={20} />
            </div>
            <span>휴지통</span>
          </div>
        </nav>

        {/* 하단 설정 메뉴 */}
        <div className={styles.settingsSection}>
          <div className={styles.settingsItem}>
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
          
          <div className={styles.searchContainer}>
            <div className={styles.searchIcon}>
              <SearchIcon size={16} />
            </div>
            <input
              type="text"
              placeholder="Search..."
              className={styles.searchInput}
            />
          </div>
          
          <div className={styles.headerRight}>
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

        <div className={styles.content}>
          {/* 프로젝트 트리 */}
          <aside className={styles.projectTree}>
            <div className={styles.treeHeader}>
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
                                      handleDesignOpen(child.projectId);
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
                              onClick={() => handleDesignOpen(selectedProject.id)}
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
                          return (
                            <div className={styles.treeItem} style={{ color: '#999', fontSize: '13px' }}>
                              <span>디자인 파일이 없습니다</span>
                            </div>
                          );
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
                          <div className={styles.cardThumbnailIcon} style={{ background: '#fbbf24' }}>
                            <span style={{ fontSize: '32px' }}>📁</span>
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
                                    <span style={{ fontSize: '24px' }}>🎨</span>
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
                                      <span style={{ fontSize: '12px' }}>📁</span>
                                    </div>
                                  ) : (
                                    <div className={styles.thumbnailFile}>
                                      <span style={{ fontSize: '12px' }}>📄</span>
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
                    
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>{item.name}</div>
                      
                      <div className={styles.cardMeta}>
                        <div className={styles.cardDate}>
                          {(() => {
                            const projectItems = getProjectItems(item.project.id);
                            const folderCount = projectItems.filter(item => item.type === 'folder').length;
                            const fileCount = projectItems.filter(item => item.type === 'design').length;
                            return `${folderCount}개 폴더 • ${fileCount}개 파일`;
                          })()}
                        </div>
                        <div className={styles.cardActions}>
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
                  <div className={styles.emptyStateTitle}>아직 생성된 프로젝트가 없습니다</div>
                  <div className={styles.emptyStateSubtitle}>새 프로젝트를 생성해보세요</div>
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
            <div 
              className={`${styles.moreMenuItem} ${styles.deleteItem}`}
              onClick={handleDeleteItem}
            >
              <TrashIcon size={14} />
              삭제
            </div>
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
    </div>
  );
};

export default SimpleDashboard;