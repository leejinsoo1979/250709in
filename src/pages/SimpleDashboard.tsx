import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { Timestamp, doc, getDoc } from 'firebase/firestore';
import { UserIcon, HomeIcon, UsersIcon, SettingsIcon, LogOutIcon, PlusIcon, FolderIcon, StarIcon, TrashIcon, SearchIcon, BellIcon, MessageIcon, CalendarIcon, EditIcon, CopyIcon, ShareIcon, MoreHorizontalIcon, EyeIcon } from '../components/common/Icons';
import { PiFolderFill, PiFolderPlus } from "react-icons/pi";
import { AiOutlineFileMarkdown } from "react-icons/ai";
import { IoFileTrayStackedOutline } from "react-icons/io5";
import { TiThSmall } from "react-icons/ti";
import { ProjectSummary } from '../firebase/types';
import { getUserProjects, createProject, saveFolderData, loadFolderData, FolderData, getDesignFiles, deleteProject, deleteDesignFile, subscribeToUserProjects } from '@/firebase/projects';
import { getProjectCollaborators, type ProjectCollaborator, getSharedProjectsForUser, getMySharedLinks } from '@/firebase/shareLinks';
import { signOutUser } from '@/firebase/auth';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
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
import ProfilePopup from '../editor/Configurator/components/ProfilePopup';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ShareLinkModal } from '@/components/ShareLinkModal';
import RenameModal from '../components/common/RenameModal';
// import { generateProjectThumbnail } from '../utils/thumbnailGenerator';
import styles from './SimpleDashboard.module.css';

const SimpleDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();

  // URL 파라미터 파싱
  const searchParams = new URLSearchParams(location.search);
  const urlProjectId = searchParams.get('projectId');
  const urlSection = searchParams.get('section') as 'profile' | 'notifications' | 'privacy' | 'account' | 'subscription' | 'security' | null;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // 로그인하지 않은 사용자는 로그인 페이지로 리다이렉트 (로딩 완료 후에만)
  useEffect(() => {
    if (!loading && !user) {
      console.log('🔒 사용자가 로그인되지 않음 - 로그인 페이지로 리다이렉트');
      navigate('/auth', { replace: true });
    }
  }, [user, loading, navigate]);

  // 대시보드 진입 시 store의 isDirty 플래그 초기화
  useEffect(() => {
    const { markAsSaved: markProjectSaved } = useProjectStore.getState();
    const { markAsSaved: markSpaceSaved } = useSpaceConfigStore.getState();
    const { markAsSaved: markFurnitureSaved } = useFurnitureStore.getState();
    
    markProjectSaved();
    markSpaceSaved();
    markFurnitureSaved();
  }, []);
  
  // URL 변경 시 activeMenu 동기화
  useEffect(() => {
    const menu = getMenuFromPath();
    console.log('🔄 URL 변경 감지:', {
      pathname: location.pathname,
      extractedMenu: menu,
      currentActiveMenu: activeMenu
    });
    setActiveMenu(menu);
  }, [location.pathname]);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [sidebarImageError, setSidebarImageError] = useState(false);
  const [headerImageError, setHeaderImageError] = useState(false);

  // 프로필 사진 디버깅 및 에러 리셋
  useEffect(() => {
    if (user) {
      console.log('🖼️ User photoURL:', user.photoURL);
      console.log('🖼️ User displayName:', user.displayName);
      console.log('🖼️ User email:', user.email);
      // photoURL이 변경되면 에러 상태 리셋
      setSidebarImageError(false);
      setHeaderImageError(false);
    }
  }, [user?.photoURL]);

  // 프로필 팝업 상태
  const [isProfilePopupOpen, setIsProfilePopupOpen] = useState(false);
  const [profilePopupPosition, setProfilePopupPosition] = useState({ top: 60, right: 20 });

  // 공유 링크 모달 상태
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareProjectId, setShareProjectId] = useState<string | null>(null);
  const [shareProjectName, setShareProjectName] = useState<string>('');
  const [shareDesignFileId, setShareDesignFileId] = useState<string | null>(null);
  const [shareDesignFileName, setShareDesignFileName] = useState<string>('');

  // 이름 바꾸기 모달 상태
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
    type: 'folder' | 'design' | 'project';
  } | null>(null);

  // 프로젝트 협업자 목록 상태 (projectId를 key로 사용)
  const [projectCollaborators, setProjectCollaborators] = useState<{[projectId: string]: ProjectCollaborator[]}>({});

  // Firebase 프로젝트 목록 상태
  const [firebaseProjects, setFirebaseProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true); // 초기값을 true로 설정
  const [initialLoadComplete, setInitialLoadComplete] = useState(false); // 초기 로딩 완료 플래그
  const [error, setError] = useState<string | null>(null);
  
  // 디자인 파일 로딩 상태
  const [designFilesLoading, setDesignFilesLoading] = useState<{[projectId: string]: boolean}>({});
  
  // 파일 트리 접기/펼치기 상태 (폴더별로 관리)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // 선택된 프로젝트 필터링
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  // 확장된 프로젝트 트리 상태
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  
  // 브레드크럼 네비게이션 상태
  const [breadcrumbPath, setBreadcrumbPath] = useState<string[]>(['전체 프로젝트']);

  // 검색 상태
  const [searchTerm, setSearchTerm] = useState<string>('');

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
  const [modalProjectId, setModalProjectId] = useState<string | null>(null);
  const [modalProjectTitle, setModalProjectTitle] = useState<string | null>(null);
  
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

  // URL 경로에서 현재 메뉴 결정
  const getMenuFromPath = () => {
    const path = location.pathname.replace('/dashboard', '');
    if (path === '' || path === '/') return 'all';
    const menu = path.substring(1); // Remove leading slash
    return menu as 'all' | 'bookmarks' | 'shared' | 'profile' | 'team' | 'trash';
  };
  
  // 메뉴 상태 추가 - URL과 동기화
  const [activeMenu, setActiveMenu] = useState<'all' | 'bookmarks' | 'shared' | 'profile' | 'team' | 'trash'>(getMenuFromPath());
  const [bookmarkedProjects, setBookmarkedProjects] = useState<Set<string>>(new Set());
  const [bookmarkedDesigns, setBookmarkedDesigns] = useState<Set<string>>(new Set());
  const [bookmarkedFolders, setBookmarkedFolders] = useState<Set<string>>(new Set());
  const [sharedProjects, setSharedProjects] = useState<ProjectSummary[]>([]);
  const [sharedByMeProjects, setSharedByMeProjects] = useState<ProjectSummary[]>([]); // 내가 공유한 프로젝트
  const [sharedWithMeProjects, setSharedWithMeProjects] = useState<ProjectSummary[]>([]); // 공유받은 프로젝트
  const [deletedProjects, setDeletedProjects] = useState<ProjectSummary[]>([]);
  const [deletedDesignFiles, setDeletedDesignFiles] = useState<Array<{designFile: any, projectId: string, projectTitle: string}>>([]);

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

  // 프로젝트 소유자 정보 캐시 (userId -> {displayName, photoURL})
  const [projectOwners, setProjectOwners] = useState<{[userId: string]: {displayName: string, photoURL?: string}}>({});

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
  const loadFirebaseProjects = useCallback(async (retryCount = 0) => {
    if (!user) {
      console.log('사용자가 로그인되지 않았습니다.');
      setProjectsLoading(false); // 사용자가 없으면 로딩 종료
      return;
    }

    console.log(`🔄 프로젝트 로드 시도 ${retryCount + 1}/3 - 사용자: ${user.email}`);
    if (retryCount === 0) {
      setProjectsLoading(true); // 첫 시도일 때만 로딩 시작
    }
    setError(null);

    try {
      const { projects, error } = await getUserProjects();

      if (error) {
        // 재시도 로직
        if (retryCount < 2) {
          console.log(`⚠️ 프로젝트 로드 실패, 1초 후 재시도...`);
          setTimeout(() => {
            loadFirebaseProjects(retryCount + 1);
          }, 1000);
          return;
        }

        setError(error);
        console.error('Firebase 프로젝트 로드 최종 실패:', error);
        setProjectsLoading(false);
      } else {
        setFirebaseProjects(projects);
        console.log('✅ Firebase 프로젝트 로드 성공:', projects.length, '개');
        setProjectsLoading(false); // 성공하면 바로 로딩 종료
        setInitialLoadComplete(true); // 초기 로딩 완료
      }
    } catch (err) {
      // 재시도 로직
      if (retryCount < 2) {
        console.log(`⚠️ 프로젝트 로드 예외 발생, 1초 후 재시도...`);
        setTimeout(() => {
          loadFirebaseProjects(retryCount + 1);
        }, 1000);
        return;
      }

      setError('프로젝트 목록을 가져오는 중 오류가 발생했습니다.');
      console.error('Firebase 프로젝트 로드 최종 실패:', err);
      setProjectsLoading(false); // 에러 발생 시에도 로딩 종료
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

  // 컴포넌트 마운트 시 데모 프로젝트 정리 및 Firebase 프로젝트 실시간 구독
  useEffect(() => {
    // 컴포넌트 마운트 시 항상 데모 프로젝트 정리
    cleanupDemoProjects();

    if (!user) {
      console.log('⚠️ 사용자 없음, 프로젝트 로딩 건너뜀');
      setProjectsLoading(false);
      return;
    }

    console.log('🔥 사용자 로그인 감지, 실시간 구독 시작:', user.email);

    // 로그인 후 저장된 공유 링크가 있으면 리다이렉트
    const pendingShareLink = localStorage.getItem('pendingShareLink');
    if (pendingShareLink) {
      console.log('🔗 저장된 공유 링크 발견, 리다이렉트:', pendingShareLink);
      localStorage.removeItem('pendingShareLink');
      navigate(pendingShareLink);
      return;
    }

    // 실시간 구독 설정 (약간의 지연 후)
    const timeoutId = setTimeout(() => {
      const unsubscribe = subscribeToUserProjects(user.uid, (projects) => {
        console.log('🔔 프로젝트 실시간 업데이트 수신:', projects.length, '개');
        setFirebaseProjects(projects);
        setProjectsLoading(false);
        setInitialLoadComplete(true); // 초기 로딩 완료
      });

      // cleanup 시 구독 해제
      return () => {
        console.log('🔕 프로젝트 실시간 구독 해제');
        unsubscribe();
      };
    }, 500);

    // cleanup
    return () => {
      clearTimeout(timeoutId);
    };
  }, [user, navigate]);
  
  // 프로젝트 목록이 로드되면 각 프로젝트의 디자인 파일도 로드
  useEffect(() => {
    if (firebaseProjects.length > 0 && user) {
      console.log('🔥 프로젝트 목록 로드 완료, 각 프로젝트의 디자인 파일 로딩 시작');
      firebaseProjects.forEach(project => {
        // 이미 로드된 프로젝트는 건너뜀
        if (!projectDesignFiles[project.id] && !designFilesLoading[project.id]) {
          console.log(`📁 프로젝트 ${project.title}의 디자인 파일 로딩`);
          loadDesignFilesForProject(project.id);
        }
      });
    }
  }, [firebaseProjects, user, loadDesignFilesForProject]);

  // 프로젝트 목록이 로드되면 각 프로젝트의 협업자 정보도 로드
  useEffect(() => {
    if (firebaseProjects.length > 0) {
      console.log('👥 프로젝트 협업자 정보 로딩 시작:', firebaseProjects.length, '개 프로젝트');

      // 각 프로젝트의 협업자 가져오기
      const fetchAllCollaborators = async () => {
        const collaboratorsMap: {[projectId: string]: ProjectCollaborator[]} = {};

        for (const project of firebaseProjects) {
          try {
            const collaborators = await getProjectCollaborators(project.id);
            if (collaborators.length > 0) {
              collaboratorsMap[project.id] = collaborators;
              console.log(`✅ 프로젝트 ${project.title} 협업자:`, collaborators.length, '명');
            }
          } catch (error) {
            console.error(`❌ 프로젝트 ${project.id} 협업자 조회 실패:`, error);
          }
        }

        setProjectCollaborators(collaboratorsMap);
      };

      fetchAllCollaborators();
    }
  }, [firebaseProjects]);

  // 공유받은 프로젝트 로드
  useEffect(() => {
    const loadSharedProjects = async () => {
      if (!user) return;

      try {
        // 공유받은 프로젝트 로드
        const shared = await getSharedProjectsForUser(user.uid);
        console.log('✅ 공유받은 프로젝트:', shared.length, '개');

        // 내가 생성한 공유 링크 로드
        const mySharedLinks = await getMySharedLinks(user.uid);
        console.log('✅ 내가 생성한 공유 링크:', mySharedLinks.length, '개');

        // 공유한 프로젝트 (협업자가 있는 프로젝트)
        const sharedByMeProjects = firebaseProjects.filter(project => {
          const collaborators = projectCollaborators[project.id];
          return collaborators && collaborators.length > 0;
        });
        console.log('✅ 협업자가 있는 프로젝트:', sharedByMeProjects.length, '개');

        // 공유한 프로젝트 합치기 (프로젝트 ID로 중복 제거)
        const sharedByMeMap = new Map<string, any>();

        // 협업자가 있는 프로젝트 추가
        sharedByMeProjects.forEach(p => {
          sharedByMeMap.set(p.id, {
            ...p,
            sharedDesignFileIds: [],
            sharedDesignFileNames: []
          });
        });

        // 공유 링크를 프로젝트별로 그룹화
        mySharedLinks.forEach(link => {
          if (!sharedByMeMap.has(link.projectId)) {
            // 새 프로젝트 항목 생성
            sharedByMeMap.set(link.projectId, {
              id: link.projectId,
              title: link.projectName,
              userId: user.uid,
              createdAt: link.createdAt,
              updatedAt: link.createdAt,
              designFilesCount: 0,
              lastDesignFileName: null,
              // 공유한 디자인 파일 ID 목록
              sharedDesignFileIds: link.designFileId ? [link.designFileId] : [],
              sharedDesignFileNames: link.designFileName ? [link.designFileName] : [],
            });
          } else if (link.designFileId) {
            // 기존 프로젝트에 디자인 추가
            const existing = sharedByMeMap.get(link.projectId);
            if (!existing.sharedDesignFileIds) {
              existing.sharedDesignFileIds = [];
              existing.sharedDesignFileNames = [];
            }
            if (!existing.sharedDesignFileIds.includes(link.designFileId)) {
              existing.sharedDesignFileIds.push(link.designFileId);
              if (link.designFileName) {
                existing.sharedDesignFileNames.push(link.designFileName);
              }
            }
          }
        });

        const sharedByMe = Array.from(sharedByMeMap.values());
        console.log('✅ 공유한 프로젝트 (통합):', sharedByMe.length, '개');

        // 공유받은 프로젝트 정보를 프로젝트 ID로 그룹화하여 중복 제거
        const sharedProjectsMap = new Map<string, any>();

        for (const s of shared) {
          // 공유한 사람(호스트)의 프로필 정보 가져오기
          let sharedByPhotoURL = null;
          let sharedByDisplayName = s.sharedByName;
          try {
            const userDocRef = doc(db, 'users', s.sharedBy);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              const userData = userDoc.data();
              sharedByPhotoURL = userData.photoURL || null;
              sharedByDisplayName = userData.displayName || s.sharedByName;

              // 프로젝트 소유자 정보 캐싱
              setProjectOwners(prev => ({
                ...prev,
                [s.sharedBy]: {
                  displayName: sharedByDisplayName,
                  photoURL: sharedByPhotoURL
                }
              }));
            }
          } catch (error) {
            console.error('공유한 사람 프로필 조회 실패:', error);
          }

          // Firebase에서 designFileIds 배열로 가져오기 (새 형식) 또는 단일 designFileId (이전 형식)
          const designFileIds = s.designFileIds || (s.designFileId ? [s.designFileId] : []);
          const designFileNames = s.designFileNames || (s.designFileName ? [s.designFileName] : []);

          console.log('🔍 공유받은 프로젝트 생성:', {
            projectId: s.projectId,
            projectName: s.projectName,
            designFileIds,
            designFileNames,
            sharedBy: s.sharedBy
          });

          sharedProjectsMap.set(s.projectId, {
            id: s.projectId,
            title: s.projectName,
            userId: s.sharedBy,
            createdAt: s.grantedAt,
            updatedAt: s.grantedAt,
            designFilesCount: 0,
            lastDesignFileName: null,
            // 공유받은 디자인 파일 ID 목록 (배열로 저장)
            sharedDesignFileIds: designFileIds,
            sharedDesignFileNames: designFileNames,
            // 첫 번째 디자인 정보 (호환성)
            sharedDesignFileId: designFileIds[0] || null,
            sharedDesignFileName: designFileNames[0] || null,
            // 공유한 사람(호스트) 정보
            sharedByName: sharedByDisplayName,
            sharedByPhotoURL: sharedByPhotoURL
          });
        }

        const sharedProjectSummaries = Array.from(sharedProjectsMap.values());

        console.log('📋 공유받은 프로젝트 최종 목록:', sharedProjectSummaries.map(p => ({
          id: p.id,
          title: p.title,
          sharedDesignFileIds: p.sharedDesignFileIds,
          sharedDesignFileNames: p.sharedDesignFileNames
        })));

        // 공유한 프로젝트와 공유받은 프로젝트 합치기
        const allSharedProjects = [...sharedByMe, ...sharedProjectSummaries];
        setSharedProjects(allSharedProjects);

        // 분리된 state에도 저장
        setSharedByMeProjects(sharedByMe);
        setSharedWithMeProjects(sharedProjectSummaries);

        console.log('✅ 전체 공유 프로젝트:', allSharedProjects.length, '개');
      } catch (error) {
        console.error('❌ 공유 프로젝트 로드 실패:', error);
      }
    };

    loadSharedProjects();
  }, [user, firebaseProjects, projectCollaborators]);

  // 공유 프로젝트(내가 공유한 + 공유받은)의 디자인 파일 로드
  useEffect(() => {
    const allShared = [...sharedByMeProjects, ...sharedWithMeProjects];

    if (allShared.length > 0) {
      console.log('📁 공유 프로젝트 디자인 파일 로딩 시작:', allShared.length, '개');

      // 아직 로드되지 않은 프로젝트만 필터링
      const projectsToLoad = allShared.filter(project =>
        !projectDesignFiles[project.id] && !designFilesLoading[project.id]
      );

      if (projectsToLoad.length > 0) {
        console.log(`📁 ${projectsToLoad.length}개 프로젝트의 디자인 파일 로딩 필요`);
        projectsToLoad.forEach(project => {
          console.log(`📁 공유 프로젝트 ${project.title}의 디자인 파일 로딩`);
          loadDesignFilesForProject(project.id);
        });
      }
    }
  }, [sharedByMeProjects, sharedWithMeProjects, projectDesignFiles, designFilesLoading, loadDesignFilesForProject]);

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

  // URL의 projectId가 변경되면 해당 프로젝트 선택
  useEffect(() => {
    if (urlProjectId && firebaseProjects.length > 0) {
      const projectExists = firebaseProjects.some(p => p.id === urlProjectId);
      if (projectExists && selectedProjectId !== urlProjectId) {
        console.log('🔗 URL에서 프로젝트 ID 감지, 자동 선택:', urlProjectId);
        setSelectedProjectId(urlProjectId);
        const targetProject = firebaseProjects.find(p => p.id === urlProjectId);
        if (targetProject) {
          setBreadcrumbPath(['전체 프로젝트', targetProject.title]);
          loadFolderDataForProject(urlProjectId);
          loadDesignFilesForProject(urlProjectId);
        }
      }
    } else if (!urlProjectId && selectedProjectId) {
      // URL에 projectId가 없으면 선택 해제
      console.log('🔗 URL에 projectId가 없음, 전체 프로젝트로 돌아가기');
      setSelectedProjectId(null);
      setBreadcrumbPath(['전체 프로젝트']);
    }
  }, [urlProjectId, firebaseProjects, selectedProjectId]);

  // URL 변경 시 activeMenu 업데이트
  useEffect(() => {
    const currentMenu = getMenuFromPath();
    if (currentMenu !== activeMenu) {
      setActiveMenu(currentMenu);
    }
  }, [location.pathname]);

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
        const parsedTrash = JSON.parse(savedTrash);
        console.log('🗑️ 휴지통 데이터 로드:', {
          userId: user.uid,
          trashCount: parsedTrash.length,
          projects: parsedTrash.map((p: ProjectSummary) => ({ id: p.id, title: p.title }))
        });
        setDeletedProjects(parsedTrash);
      } else {
        console.log('🗑️ 휴지통 데이터 없음:', { userId: user.uid });
      }

      // 휴지통 디자인 파일 로드
      const savedDesignTrash = localStorage.getItem(`design_trash_${user.uid}`);
      if (savedDesignTrash) {
        const parsedDesignTrash = JSON.parse(savedDesignTrash);
        console.log('🗑️ 휴지통 디자인 파일 데이터 로드:', {
          userId: user.uid,
          designTrashCount: parsedDesignTrash.length,
          designs: parsedDesignTrash.map((d: any) => ({ id: d.designFile.id, name: d.designFile.name, projectTitle: d.projectTitle }))
        });
        setDeletedDesignFiles(parsedDesignTrash);
      } else {
        console.log('🗑️ 휴지통 디자인 파일 데이터 없음:', { userId: user.uid });
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
    projectsLoading
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
      navigate('/dashboard/bookmarks');
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
      
      // Firebase에서 프로젝트 목록 다시 로드
      await loadFirebaseProjects();
      
      // 휴지통에 추가
      const deletedProject = {
        ...project,
        deletedAt: new Date().toISOString()
      };
      setDeletedProjects(prev => [...prev, deletedProject as any]);
      
      // localStorage에 휴지통 상태 저장
      if (user) {
        const updatedTrash = [...deletedProjects, deletedProject];
        localStorage.setItem(`trash_${user.uid}`, JSON.stringify(updatedTrash));
      }
      
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

  // 디자인 파일을 휴지통으로 이동 함수
  const moveDesignFileToTrash = async (designFile: any, projectId: string, projectTitle: string) => {
    try {
      console.log('🗑️ 디자인 파일을 휴지통으로 이동:', {
        designFileId: designFile.id,
        designFileName: designFile.name,
        projectId,
        projectTitle
      });

      // Firebase에서 디자인 파일 즉시 삭제 (휴지통으로 이동 시 바로 삭제)
      const { error } = await deleteDesignFile(designFile.id, projectId);
      if (error) {
        alert('디자인 파일 삭제 실패: ' + error);
        return;
      }

      // 로컬 상태에서 제거
      setProjectDesignFiles(prev => ({
        ...prev,
        [projectId]: prev[projectId]?.filter(df => df.id !== designFile.id) || []
      }));

      // 휴지통에 추가 (복원을 위한 정보 보관 - 하지만 Firebase에서는 이미 삭제됨)
      const deletedItem = {
        designFile: {
          ...designFile,
          deletedAt: new Date().toISOString()
        },
        projectId,
        projectTitle
      };

      const updatedDesignTrash = [...deletedDesignFiles, deletedItem];
      setDeletedDesignFiles(updatedDesignTrash);

      // localStorage에 휴지통 상태 저장
      if (user) {
        localStorage.setItem(`design_trash_${user.uid}`, JSON.stringify(updatedDesignTrash));
      }

      // 북마크에서도 제거
      if (bookmarkedDesigns.has(designFile.id)) {
        toggleDesignBookmark(designFile.id);
      }

      console.log('✅ 디자인 파일 Firebase 삭제 및 휴지통 이동 완료:', designFile.id);
    } catch (error) {
      console.error('디자인 파일 휴지통 이동 중 오류:', error);
      alert('디자인 파일 삭제 중 오류가 발생했습니다.');
    }
  };

  // 휴지통에서 복원 함수 (프로젝트)
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

  // 휴지통에서 디자인 파일 복원 함수 (Firebase에서 이미 삭제되어 복원 불가)
  const restoreDesignFileFromTrash = (designFileId: string) => {
    alert('디자인 파일은 이미 서버에서 삭제되어 복원할 수 없습니다.\n\n휴지통에서 항목만 제거됩니다.');

    // 휴지통에서만 제거 (Firebase에 이미 없으므로 복원 불가)
    const updatedDesignTrash = deletedDesignFiles.filter(d => d.designFile.id !== designFileId);
    setDeletedDesignFiles(updatedDesignTrash);

    // localStorage 업데이트
    if (user) {
      localStorage.setItem(`design_trash_${user.uid}`, JSON.stringify(updatedDesignTrash));
    }

    console.log('⚠️ 디자인 파일 복원 불가 - 휴지통에서만 제거:', designFileId);
  };
  
  // 휴지통 비우기 함수 (이미 Firebase에서 삭제되었으므로 localStorage만 정리)
  const emptyTrash = async () => {
    if (window.confirm('휴지통을 비우시겠습니까?\n\n항목들은 이미 서버에서 삭제되어 있으며, 휴지통 기록만 지워집니다.')) {
      // Firebase에서 프로젝트 영구 삭제 (프로젝트는 Firebase에 남아있음)
      for (const project of deletedProjects) {
        await deleteProject(project.id);
      }

      // 디자인 파일은 이미 Firebase에서 삭제되었으므로 로컬만 정리

      // 로컬 상태 초기화
      setDeletedProjects([]);
      setDeletedDesignFiles([]);

      if (user) {
        localStorage.removeItem(`trash_${user.uid}`);
        localStorage.removeItem(`design_trash_${user.uid}`);
      }

      console.log('🗑️ 휴지통 비우기 완료 (디자인 파일은 이미 Firebase에서 삭제됨)');
    }
  };
  
  // 공유 프로젝트 처리 함수
  const shareProject = async (projectId: string, designFileId?: string, designFileName?: string) => {
    try {
      // 프로젝트 정보 가져오기
      const project = allProjects.find(p => p.id === projectId);
      if (!project) {
        console.error('프로젝트를 찾을 수 없습니다:', projectId);
        return;
      }

      // ShareLinkModal 열기
      setShareProjectId(projectId);
      setShareProjectName(project.title);
      setShareDesignFileId(designFileId || null);
      setShareDesignFileName(designFileName || '');
      setShareModalOpen(true);

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

    let filteredProjects: ProjectSummary[] = [];

    console.log('🔍 getFilteredProjects 호출:', {
      activeMenu,
      deletedProjectsCount: deletedProjects.length,
      allProjectsCount: allProjects.length
    });

    switch (activeMenu) {
      case 'bookmarks':
        // 북마크된 프로젝트들 반환
        filteredProjects = allProjects.filter(p =>
          bookmarkedProjects.has(p.id) && !deletedProjectIds.has(p.id)
        );
        break;
      case 'shared':
        filteredProjects = sharedProjects.filter(p => !deletedProjectIds.has(p.id));
        break;
      case 'trash':
        filteredProjects = deletedProjects;
        console.log('🗑️ 휴지통 필터링:', {
          deletedProjectsCount: deletedProjects.length,
          projects: deletedProjects.map(p => ({ id: p.id, title: p.title }))
        });
        break;
      case 'all':
      default:
        // 삭제된 프로젝트는 제외하고 반환
        filteredProjects = allProjects.filter(p => !deletedProjectIds.has(p.id));
        break;
    }

    // 검색어로 필터링
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase().trim();
      filteredProjects = filteredProjects.filter(p =>
        p.title?.toLowerCase().includes(lowerSearch) ||
        p.description?.toLowerCase().includes(lowerSearch)
      );
    }

    return filteredProjects;
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
        project: project  // selectedProject가 아니라 project 사용
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
            project: project,  // selectedProject가 아니라 project 사용
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

    // 휴지통에서는 프로젝트 선택을 무시하고 삭제된 프로젝트와 디자인 파일들을 표시
    if (activeMenu === 'trash') {
      const filteredProjects = getFilteredProjects();
      console.log('🗑️ 휴지통 뷰 - 삭제된 항목들:', {
        deletedProjectsCount: filteredProjects.length,
        deletedDesignFilesCount: deletedDesignFiles.length,
        filteredProjects: filteredProjects.map(p => ({id: p.id, title: p.title})),
        deletedDesigns: deletedDesignFiles.map(d => ({id: d.designFile.id, name: d.designFile.name, project: d.projectTitle}))
      });

      const items = [];

      // 삭제된 프로젝트들 추가
      filteredProjects.forEach(project => {
        items.push({
          id: project.id,
          type: 'project',
          name: project.title,
          project: project,
          icon: ''
        });
      });

      // 삭제된 디자인 파일들 추가
      deletedDesignFiles.forEach(item => {
        items.push({
          id: item.designFile.id,
          type: 'design',
          name: item.designFile.name,
          project: { id: item.projectId, title: item.projectTitle },
          designFile: item.designFile,
          isDeleted: true
        });
      });

      return items;
    }

    if (selectedProjectId) {
      if (!selectedProject) {
        console.log('❌ 선택된 프로젝트를 찾을 수 없습니다:', selectedProjectId);
        console.log('현재 allProjects:', allProjects.map(p => ({ id: p.id, title: p.title })));
        console.log('firebaseProjects:', firebaseProjects.map(p => ({ id: p.id, title: p.title })));
        return [];
      }
      
      console.log('✅ 선택된 프로젝트 찾음:', selectedProject.title);

      const projectFolders = folders[selectedProjectId] || [];

      // 공유받은 프로젝트인지 확인
      // 1. sharedWithMeProjects에 있거나
      // 2. activeMenu가 'shared'이고 본인 프로젝트가 아닌 경우
      const inSharedWithMeList = sharedWithMeProjects.some(p => p.id === selectedProjectId);
      const isSharedMenuAndNotOwner = activeMenu === 'shared' && selectedProject.userId !== user?.uid;
      const isSharedWithMe = inSharedWithMeList || isSharedMenuAndNotOwner;

      console.log('🔍 공유 프로젝트 체크 - activeMenu:', activeMenu);
      console.log('🔍 공유 프로젝트 체크 - projectUserId:', selectedProject.userId);
      console.log('🔍 공유 프로젝트 체크 - currentUserId:', user?.uid);
      console.log('🔍 공유 프로젝트 체크 - inSharedWithMeList:', inSharedWithMeList);
      console.log('🔍 공유 프로젝트 체크 - isSharedMenuAndNotOwner:', isSharedMenuAndNotOwner);
      console.log('🔍 공유 프로젝트 체크 - 최종 isSharedWithMe:', isSharedWithMe);

      // 현재 폴더 내부에 있는 경우
      if (currentFolderId) {
        const currentFolder = projectFolders.find(f => f.id === currentFolderId);
        if (currentFolder) {
          const items = [];

          // 공유받은 프로젝트가 아닐 때만 디자인 생성 카드 추가
          if (!isSharedWithMe) {
            items.push({ id: 'new-design', type: 'new-design', name: '디자인 생성', project: selectedProject, icon: '+' });
          }

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
        isSharedWithMe,
        '프로젝트 루트 레벨 조건': {
          '선택된 프로젝트 있음': !!selectedProjectId,
          '현재 폴더 없음': currentFolderId === null,
          '프로젝트 메뉴': activeMenu === 'project'
        }
      });
      const items = [];

      // 공유받은 프로젝트가 아닐 때만 디자인 생성 카드 추가
      if (!isSharedWithMe) {
        items.push({ id: 'new-design', type: 'new-design', name: '디자인 생성', project: selectedProject, icon: '+' });
        console.log('✅ 디자인 생성 카드 추가됨:', items[0]);
      } else {
        console.log('🔒 공유받은 프로젝트 - 디자인 생성 카드 제외');
      }
      
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
      
      // 폴더에 속하지 않은 파일들만 추가 (실제 Firebase 디자인 파일들)
      const allFolderChildren = projectFolders.flatMap(folder => folder.children);
      const folderChildIds = new Set(allFolderChildren.map(child => child.id));

      // 실제 Firebase에서 가져온 디자인 파일들을 표시
      let actualDesignFiles = projectDesignFiles[selectedProjectId] || [];

      // 공유받은 프로젝트인 경우 공유 범위에 따라 필터링
      const sharedProject = sharedWithMeProjects.find(p => p.id === selectedProjectId);
      console.log('🔍 공유 프로젝트 필터링 체크:', {
        selectedProjectId,
        sharedProject: sharedProject ? {
          id: sharedProject.id,
          title: sharedProject.title,
          sharedDesignFileIds: (sharedProject as any).sharedDesignFileIds,
          sharedDesignFileNames: (sharedProject as any).sharedDesignFileNames
        } : null,
        actualDesignFilesCount: actualDesignFiles.length,
        actualDesignFileIds: actualDesignFiles.map(df => df.id)
      });

      if (sharedProject) {
        const sharedDesignFileIds = (sharedProject as any).sharedDesignFileIds || [];
        const sharedDesignFileNames = (sharedProject as any).sharedDesignFileNames || [];

        if (sharedDesignFileIds.length > 0 || sharedDesignFileNames.length > 0) {
          console.log('🔒 공유받은 디자인 - 필터링 적용:', {
            projectId: selectedProjectId,
            sharedDesignFileIds,
            sharedDesignFileNames,
            필터링전: actualDesignFiles.length
          });
          // 공유받은 디자인 파일만 필터링
          actualDesignFiles = actualDesignFiles.filter(df =>
            sharedDesignFileIds.includes(df.id) || sharedDesignFileNames.includes(df.name)
          );
          console.log('🔒 필터링 후:', actualDesignFiles.length);
        } else {
          console.log('⚠️ sharedDesignFileIds가 비어있음 - 프로젝트 전체 공유로 간주');
        }
      }

      console.log('🎨 디자인 파일 추가:', {
        projectId: selectedProjectId,
        actualDesignFilesCount: actualDesignFiles.length,
        actualDesignFiles: actualDesignFiles.map(df => ({ id: df.id, name: df.name }))
      });

      actualDesignFiles.forEach(designFile => {
        // 폴더에 속하지 않은 디자인만 루트에 표시
        if (!folderChildIds.has(designFile.id)) {
          items.push({
            id: designFile.id,
            type: 'design',
            name: designFile.name,
            project: selectedProject,
            designFile: designFile, // 실제 디자인 파일 데이터 추가
            icon: ''
          });
        }
      });
      
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
    let items = getDisplayedItems();

    // 검색어로 필터링
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase().trim();
      items = items.filter(item => {
        // '디자인 생성' 카드와 로딩 카드는 필터링하지 않음
        if (item.type === 'new-design' || item.type === 'loading') {
          return true;
        }
        // 프로젝트, 폴더, 디자인 파일 이름으로 검색
        return item.name?.toLowerCase().includes(lowerSearch);
      });
    }

    console.log('💡 displayedItems 계산 완료:', {
      itemsCount: items.length,
      selectedProjectId,
      projectDesignFilesKeys: Object.keys(projectDesignFiles),
      hasDesignFiles: projectDesignFiles[selectedProjectId]?.length > 0,
      searchTerm
    });
    return items;
  }, [selectedProjectId, allProjects, activeMenu, currentFolderId, folders, projectDesignFiles, searchTerm]);
  
  console.log('💡 displayedItems 최종 결과:', displayedItems);
  
  // 정렬 적용
  const sortedItems = [...displayedItems].sort((a, b) => {
    // '디자인 생성' 카드는 항상 맨 앞에 고정
    if (a.type === 'new-design') return -1;
    if (b.type === 'new-design') return 1;

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

  // 디자인 미리보기 함수
  const handlePreviewDesign = (itemId: string) => {
    // 현재 표시 중인 아이템들에서 해당 아이템 찾기
    const item = sortedItems.find(i => i.id === itemId);
    
    if (item && item.type === 'design') {
      const actualDesignFileId = item.designFile?.id || (item.id.endsWith('-design') ? undefined : item.id);
      handleOpenViewer(item.project.id, actualDesignFileId);
    }
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
      // URL에서 projectId 제거
      navigate('/dashboard');
    } else {
      // 새 프로젝트 선택 - allProjects, 공유한 프로젝트, 공유받은 프로젝트에서 모두 검색
      const targetProject =
        allProjects.find(p => p.id === projectId) ||
        sharedByMeProjects.find(p => p.id === projectId) ||
        sharedWithMeProjects.find(p => p.id === projectId);

      if (targetProject) {
        setSelectedProjectId(projectId);
        setBreadcrumbPath(['전체 프로젝트', targetProject.title]);
        // URL에 projectId 추가
        navigate(`/dashboard?projectId=${projectId}`);

        // 프로젝트를 선택하면 자동으로 확장
        setExpandedProjects(prev => {
          const newExpanded = new Set(prev);
          newExpanded.add(projectId);
          return newExpanded;
        });

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
        // URL에 projectId 추가
        navigate(`/dashboard?projectId=${projectId}`);
        
        // 프로젝트를 선택하면 자동으로 확장
        setExpandedProjects(prev => {
          const newExpanded = new Set(prev);
          newExpanded.add(projectId);
          return newExpanded;
        });
        
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
      // URL을 전체 프로젝트로 업데이트
      navigate('/dashboard');
    } else if (index === 1 && selectedProjectId && selectedProject) {
      // 프로젝트 클릭 - 폴더에서 나가기
      setCurrentFolderId(null);
      setBreadcrumbPath(['전체 프로젝트', selectedProject.title]);
      // URL을 해당 프로젝트로 업데이트
      navigate(`/dashboard?projectId=${selectedProjectId}`);
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

  // 프로젝트 토글 (접기/펼치기)
  const toggleProjectExpansion = (projectId: string) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
        // 프로젝트 확장 시 디자인 파일 로드
        if (!projectDesignFiles[projectId] && !designFilesLoadingStates[projectId]) {
          loadDesignFilesForProject(projectId);
        }
      }
      return newSet;
    });
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
    console.log('📌 더보기 메뉴 열기:', { itemId, itemName, itemType });
    setMoreMenu({
      visible: true,
      x: 0, // 더 이상 사용되지 않음
      y: 0, // 더 이상 사용되지 않음
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
  const handleRenameItem = () => {
    if (!moreMenu) return;
    setRenameTarget({
      id: moreMenu.itemId,
      name: moreMenu.itemName,
      type: moreMenu.itemType
    });
    setIsRenameModalOpen(true);
    closeMoreMenu();
  };

  // 이름 변경 확인 핸들러
  const handleConfirmRename = async (newName: string) => {
    if (!renameTarget) return;
    if (newName && newName.trim()) {
      if (renameTarget.type === 'project') {
        // 프로젝트 이름 변경
        try {
          const { updateProject } = await import('@/firebase/projects');
          const result = await updateProject(renameTarget.id, {
            title: newName.trim()
          });

          if (result.error) {
            console.error('프로젝트 이름 변경 실패:', result.error);
            alert('프로젝트 이름 변경에 실패했습니다: ' + result.error);
            return;
          }

          // 로컬 상태 업데이트
          setFirebaseProjects(prev => prev.map(project =>
            project.id === renameTarget.id
              ? { ...project, title: newName.trim() }
              : project
          ));

          // 현재 선택된 프로젝트인 경우 브레드크럼도 업데이트
          if (selectedProjectId === renameTarget.id) {
            setBreadcrumbPath(prev => {
              const newPath = [...prev];
              const projectIndex = newPath.findIndex(path => path !== '전체 프로젝트');
              if (projectIndex !== -1) {
                newPath[projectIndex] = newName.trim();
              }
              return newPath;
            });
          }

          console.log('프로젝트 이름 변경 성공:', renameTarget.id, '→', newName.trim());

          // BroadcastChannel로 다른 탭에 알림
          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({
              type: 'PROJECT_UPDATED',
              action: 'renamed',
              projectId: renameTarget.id,
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
      } else if (renameTarget.type === 'folder') {
        // 폴더 이름 변경
        const updatedFolders = folders[selectedProjectId!]?.map(folder =>
          folder.id === renameTarget.id
            ? { ...folder, name: newName.trim() }
            : folder
        ) || [];

        setFolders(prev => ({
          ...prev,
          [selectedProjectId!]: updatedFolders
        }));

        // Firebase에 저장
        await saveFolderDataToFirebase(selectedProjectId!, updatedFolders);
      } else if (renameTarget.type === 'design') {
        // 디자인 파일 이름 변경
        try {
          // TODO: Firebase에서 실제 디자인파일 데이터 업데이트 필요
          // 현재는 로컬 상태만 업데이트

          // 폴더 내부 디자인 파일인지 확인
          let isInFolder = false;
          if (selectedProjectId) {
            const projectFolders = folders[selectedProjectId] || [];
            for (const folder of projectFolders) {
              if (folder.children.some(child => child.id === renameTarget.id)) {
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
                  child.id === renameTarget.id
                    ? { ...child, name: newName.trim() }
                    : child
                )
              })) || []
            }));

            // Firebase에 폴더 데이터 저장
            const updatedFolders = folders[selectedProjectId!]?.map(folder => ({
              ...folder,
              children: folder.children.map(child =>
                child.id === renameTarget.id
                  ? { ...child, name: newName.trim() }
                  : child
              )
            })) || [];
            await saveFolderDataToFirebase(selectedProjectId!, updatedFolders);
          } else {
            // 루트 레벨 디자인 파일인 경우 - Firebase 디자인파일 업데이트
            const { updateDesignFile } = await import('@/firebase/projects');
            const result = await updateDesignFile(renameTarget.id, {
              name: newName.trim()
            });

            if (result.error) {
              console.error('디자인파일 이름 변경 실패:', result.error);
              alert('디자인파일 이름 변경에 실패했습니다: ' + result.error);
              return;
            }

            console.log('루트 레벨 디자인파일 이름 변경 성공:', renameTarget.id, '→', newName.trim());

            // 프로젝트 목록을 새로고침하여 변경사항 반영
            await loadFirebaseProjects();

            // BroadcastChannel로 다른 탭에 알림
            try {
              const channel = new BroadcastChannel('project-updates');
              channel.postMessage({
                type: 'PROJECT_UPDATED',
                action: 'design_renamed',
                projectId: selectedProjectId,
                designFileId: renameTarget.id,
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
      console.log('이름 변경:', renameTarget.id, '→', newName);
    }
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
                
                // Firebase에서 프로젝트 목록 다시 로드
                await loadFirebaseProjects();
                
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
          if (activeMenu === 'trash') {
            // 휴지통에서 영구 삭제 (이미 Firebase에서 삭제됨, localStorage만 정리)
            const deletedItem = deletedDesignFiles.find(d => d.designFile.id === moreMenu.itemId);
            if (deletedItem) {
              // 이미 Firebase에서 삭제되었으므로 로컬만 정리
              const updatedDesignTrash = deletedDesignFiles.filter(d => d.designFile.id !== moreMenu.itemId);
              setDeletedDesignFiles(updatedDesignTrash);

              // localStorage 업데이트
              if (user) {
                localStorage.setItem(`design_trash_${user.uid}`, JSON.stringify(updatedDesignTrash));
              }

              console.log('✅ 디자인 파일 휴지통에서 제거 완료 (이미 Firebase에서 삭제됨):', moreMenu.itemId);
            }
          } else {
            // 일반 삭제 - 휴지통으로 이동
            if (selectedProjectId) {
              const designFile = projectDesignFiles[selectedProjectId]?.find(df => df.id === moreMenu.itemId);
              const projectTitle = allProjects.find(p => p.id === selectedProjectId)?.title || '';

              if (designFile) {
                await moveDesignFileToTrash(designFile, selectedProjectId, projectTitle);
              }

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
      // 프로젝트 공유 - 첫 번째 디자인 파일과 함께 공유
      const projectDesigns = projectDesignFiles[moreMenu.itemId];
      if (projectDesigns && projectDesigns.length > 0) {
        // 첫 번째 디자인 파일과 함께 공유
        const firstDesign = projectDesigns[0];
        shareProject(moreMenu.itemId, firstDesign.id, firstDesign.title);
      } else {
        // 디자인 파일이 없으면 프로젝트만 공유
        shareProject(moreMenu.itemId);
      }
    } else if (moreMenu.itemType === 'design') {
      // 디자인 파일이 속한 프로젝트 찾기
      let designProjectId: string | null = null;
      let designFile: any = null;

      // projectDesignFiles에서 해당 디자인 파일이 속한 프로젝트와 파일 정보 찾기
      for (const [projectId, designFiles] of Object.entries(projectDesignFiles)) {
        const foundDesign = designFiles.find(df => df.id === moreMenu.itemId);
        if (foundDesign) {
          designProjectId = projectId;
          designFile = foundDesign;
          break;
        }
      }

      // 또는 현재 선택된 프로젝트 사용
      if (!designProjectId && selectedProjectId) {
        designProjectId = selectedProjectId;
        // 선택된 프로젝트에서 디자인 파일 찾기
        const selectedProjectDesigns = projectDesignFiles[selectedProjectId];
        if (selectedProjectDesigns) {
          designFile = selectedProjectDesigns.find(df => df.id === moreMenu.itemId);
        }
      }

      if (designProjectId && designFile) {
        // 디자인 파일 정보와 함께 공유
        shareProject(designProjectId, designFile.id, designFile.title);
      } else {
        alert('프로젝트 정보를 찾을 수 없습니다.');
      }
    } else if (moreMenu.itemType === 'folder') {
      // 폴더가 속한 프로젝트 공유
      if (selectedProjectId) {
        shareProject(selectedProjectId);
      } else {
        alert('프로젝트 정보를 찾을 수 없습니다.');
      }
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
        console.log('🚀 프로젝트 생성 시작:', {
          title: newProjectName.trim(),
          userId: user.uid,
          userEmail: user.email
        });
        
        const { id, error } = await createProject({
          title: newProjectName.trim()
        });

        if (error) {
          console.error('❌ Firebase 프로젝트 생성 실패:', error);
          alert('프로젝트 생성에 실패했습니다: ' + error);
          setIsCreating(false);
          return;
        }

        if (id) {
          console.log('✅ Firebase 프로젝트 생성 성공:', {
            projectId: id,
            title: newProjectName.trim(),
            timestamp: new Date().toISOString()
          });
          
          // 모달 먼저 닫기
          setIsCreateModalOpen(false);
          setNewProjectName('');
          
          // 프로젝트 목록 새로고침 (강제로)
          await loadFirebaseProjects(0);
          
          // 약간의 지연 후 프로젝트 선택 (목록이 업데이트된 후)
          setTimeout(() => {
            console.log('🎯 새 프로젝트 선택:', id);
            handleProjectSelect(id);
          }, 500);
          
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
  const handleCreateDesign = (projectId?: string, projectTitle?: string) => {
    console.log('🚀 handleCreateDesign 호출됨:', { projectId, projectTitle, user: !!user });
    
    if (user) {
      if (!projectId) {
        alert('프로젝트를 먼저 선택해주세요.');
        return;
      }
      
      // 프로젝트 제목 찾기
      const project = allProjects.find(p => p.id === projectId);
      const title = projectTitle || project?.title || '새 프로젝트';
      
      console.log('✅ projectId 확인됨, Step1 모달 열기 준비');
      
      // projectStore에 projectId와 프로젝트명 설정
      const { setProjectId, setProjectTitle, resetBasicInfo } = useProjectStore.getState();
      setProjectId(projectId);
      setProjectTitle(title);
      resetBasicInfo(); // 이전 디자인 정보 초기화
      
      // 모달에 전달할 projectId와 title을 state에 저장
      setModalProjectId(projectId);
      setModalProjectTitle(title);
      
      // Step1 모달 열기 - 새 디자인 생성
      console.log('📝 Step1 모달 열기 with projectId:', projectId, 'title:', title);
      setIsStep1ModalOpen(true);
    } else {
      alert('로그인이 필요합니다.');
    }
  };

  // Step1 모달 닫기
  const handleCloseStep1Modal = async () => {
    setIsStep1ModalOpen(false);
    setModalProjectId(null);
    setModalProjectTitle(null);
    // 디자인이 생성되었을 수 있으므로 프로젝트 목록을 새로고침
    if (selectedProjectId) {
      await loadDesignFilesForProject(selectedProjectId);
    }
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
  if (projectsLoading) {
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

  // 로딩 중일 때 로딩 표시
  if (loading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--theme-background, #ffffff)'
      }}>
        <div style={{
          textAlign: 'center',
          color: 'var(--theme-text, #000000)'
        }}>
          <div style={{ marginBottom: '16px' }}>로딩 중...</div>
        </div>
      </div>
    );
  }

  // 로딩이 완료되었지만 사용자가 없는 경우
  if (!user) {
    return null;
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
                  referrerPolicy="no-referrer"
                  
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }}
                  onLoad={() => {
                    console.log('✅ Sidebar 프로필 이미지 로드 성공');
                    setSidebarImageError(false);
                  }}
                  onError={(e) => {
                    console.error('❌ Sidebar 프로필 이미지 로드 실패:', user.photoURL);
                    setSidebarImageError(true);
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
              console.log('🏠 전체 프로젝트 클릭');
              setActiveMenu('all');
              setSelectedProjectId(null);
              setCurrentFolderId(null);
              setBreadcrumbPath(['전체 프로젝트']);
              navigate('/dashboard');
            }}
          >
            <div className={styles.navItemIcon}>
              <TiThSmall size={20} />
            </div>
            <span>전체 프로젝트</span>
            <span className={styles.navItemCount}>{allProjects.length}</span>
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
              console.log('🗑️ 휴지통 클릭');
              setActiveMenu('trash');
              setSelectedProjectId(null);
              setBreadcrumbPath([]);
            }}
          >
            <div className={styles.navItemIcon}>
              <TrashIcon size={20} />
            </div>
            <span>휴지통</span>
            <span className={styles.navItemCount}>{deletedProjects.length + deletedDesignFiles.length}</span>
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
              <NotificationCenter />
            </div>

            {/* 프로필 영역은 항상 표시 - user가 없어도 기본 아이콘 표시 */}
            <div
              className={styles.userProfile}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setProfilePopupPosition({
                  top: rect.bottom + 8,
                  right: window.innerWidth - rect.right
                });
                setIsProfilePopupOpen(!isProfilePopupOpen);
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className={styles.userProfileAvatar}>
                {user?.photoURL && !headerImageError ? (
                  <img
                    src={user.photoURL}
                    alt="프로필"
                    referrerPolicy="no-referrer"
                    
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      objectFit: 'cover'
                    }}
                    onLoad={() => {
                      console.log('✅ Header 프로필 이미지 로드 성공');
                      setHeaderImageError(false);
                    }}
                    onError={(e) => {
                      console.error('❌ Header 프로필 이미지 로드 실패:', user.photoURL);
                      setHeaderImageError(true);
                    }}
                  />
                ) : (
                  <UserIcon size={14} />
                )}
              </div>
              <span className={styles.userProfileName}>
                {user ? (user?.displayName || user?.email?.split('@')[0] || '사용자') : '게스트'}
              </span>
            </div>
          </div>
        </header>

        {/* 서브헤더 - 프로젝트 관련 메뉴에서만 표시 */}
        {(activeMenu === 'all' || activeMenu === 'bookmarks' || activeMenu === 'trash' || activeMenu === 'shared') && (
        <div className={styles.subHeader}>
          <div className={styles.subHeaderContent}>
            {/* 메뉴별 타이틀 표시 (좌측) */}
            <div className={styles.subHeaderLeft}>
              {activeMenu === 'all' && (
                <h1 className={styles.subHeaderTitle}>전체 프로젝트</h1>
              )}
              {activeMenu === 'trash' && (
                <h1 className={styles.subHeaderTitle}>휴지통</h1>
              )}
              {/* 북마크는 타이틀 없음 */}
            </div>
            
            {/* 우측 액션 버튼들 */}
            <div className={styles.subHeaderActions}>
              {/* 선택된 아이템 개수 표시 */}
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

              {/* 선택된 카드가 있을 때 액션 버튼 */}
              {selectedCards.size > 0 && activeMenu !== 'trash' && (() => {
                // 공유 프로젝트 메뉴에서 처리
                if (activeMenu === 'shared') {
                  // 프로젝트를 선택하지 않은 상태 (목록 화면)
                  if (!selectedProjectId) {
                    // 선택된 카드들이 모두 본인 소유 프로젝트인지 확인
                    const selectedProjectIds = Array.from(selectedCards);
                    const allOwnedByUser = selectedProjectIds.every(cardId => {
                      const project = [...sharedByMeProjects, ...sharedWithMeProjects].find(p => p.id === cardId);
                      return project?.userId === user?.uid;
                    });

                    if (allOwnedByUser) {
                      return (
                        <button
                          className={styles.bulkDeleteButton}
                          onClick={async () => {
                            if (window.confirm(`선택한 ${selectedCards.size}개 프로젝트의 공유를 취소하시겠습니까?`)) {
                              // TODO: 공유 해제 로직 구현
                              console.log('🔗 공유 해제:', Array.from(selectedCards));
                              // 선택 해제
                              setSelectedCards(new Set());
                              alert('공유 해제 기능은 곧 구현됩니다.');
                            }
                          }}
                        >
                          <ShareIcon size={16} />
                          <span>공유해제 ({selectedCards.size})</span>
                        </button>
                      );
                    } else {
                      // 공유받은 프로젝트는 체크 불가 (버튼 숨김)
                      return null;
                    }
                  }
                  // 프로젝트 내부 (디자인 선택 시)
                  else {
                    const selectedProj = [...sharedByMeProjects, ...sharedWithMeProjects].find(p => p.id === selectedProjectId);
                    const isHost = selectedProj?.userId === user?.uid;

                    if (isHost) {
                      return (
                        <button
                          className={styles.bulkDeleteButton}
                          onClick={async () => {
                            if (window.confirm(`선택한 ${selectedCards.size}개 디자인의 공유를 취소하시겠습니까?`)) {
                              // TODO: 공유 해제 로직 구현
                              console.log('🔗 공유 해제:', Array.from(selectedCards));
                              // 선택 해제
                              setSelectedCards(new Set());
                              alert('공유 해제 기능은 곧 구현됩니다.');
                            }
                          }}
                        >
                          <ShareIcon size={16} />
                          <span>공유해제 ({selectedCards.size})</span>
                        </button>
                      );
                    } else {
                      // 공유받은 디자인은 삭제 불가
                      return null;
                    }
                  }
                }

                // 일반 휴지통 이동 버튼
                return (
                  <button
                    className={styles.bulkDeleteButton}
                    onClick={async () => {
                      if (window.confirm(`선택한 ${selectedCards.size}개 항목을 휴지통으로 이동하시겠습니까?`)) {
                        // 선택된 항목들을 휴지통으로 이동
                        for (const cardId of Array.from(selectedCards)) {
                          const item = sortedItems.find(i => i.id === cardId);
                          if (item) {
                            if (item.type === 'project') {
                              await moveToTrash(item.project);
                            } else if (item.type === 'design') {
                              // 디자인 파일 휴지통으로 이동
                              console.log('디자인 파일 휴지통으로 이동:', item);
                              const projectId = item.project.id;
                              const projectTitle = item.project.title || '';
                              const designFile = projectDesignFiles[projectId]?.find(df => df.id === cardId);

                              if (designFile) {
                                await moveDesignFileToTrash(designFile, projectId, projectTitle);
                                console.log('✅ 디자인 파일 휴지통 이동 완료:', cardId);
                              }
                            } else if (item.type === 'folder') {
                              // 폴더 삭제 로직 - 폴더 안의 디자인 파일들도 함께 휴지통으로 이동
                              console.log('폴더 삭제:', item);
                              const projectId = item.project.id;
                              const projectTitle = item.project.title || '';
                              const currentFolders = folders[projectId] || [];
                              const targetFolder = currentFolders.find(f => f.id === cardId);

                              // 폴더 안의 디자인 파일들을 먼저 휴지통으로 이동
                              if (targetFolder?.children) {
                                for (const child of targetFolder.children) {
                                  const designFile = projectDesignFiles[projectId]?.find(df => df.id === child.id);
                                  if (designFile) {
                                    await moveDesignFileToTrash(designFile, projectId, projectTitle);
                                  }
                                }
                              }

                              // 폴더를 폴더 목록에서 제거
                              const updatedFolders = currentFolders.filter(f => f.id !== cardId);
                              await saveFolderDataToFirebase(projectId, updatedFolders);
                              console.log('✅ 폴더 삭제 완료:', cardId);

                              // 프로젝트 새로고침
                              await loadFirebaseProjects();
                            }
                          }
                        }
                        // 선택 해제
                        setSelectedCards(new Set());
                      }
                    }}
                  >
                    <TrashIcon size={16} />
                    <span>휴지통으로 이동 ({selectedCards.size})</span>
                  </button>
                );
              })()}

              {/* 검색바 */}
              <div className={styles.searchContainer}>
                <div className={styles.searchIcon}>
                  <SearchIcon size={16} />
                </div>
                <input
                  type="text"
                  placeholder="프로젝트 검색..."
                  className={styles.searchInput}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                />
                <button
                  className={styles.searchButton}
                  onClick={() => {
                    document.querySelector<HTMLInputElement>(`.${styles.searchInput}`)?.blur();
                  }}
                  title="검색"
                >
                  <SearchIcon size={16} />
                </button>
                {searchTerm && (
                  <button
                    className={styles.searchClearButton}
                    onClick={() => setSearchTerm('')}
                    title="검색 초기화"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                      <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z"/>
                    </svg>
                  </button>
                )}
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
              {activeMenu === 'trash' && (deletedProjects.length > 0 || deletedDesignFiles.length > 0) && (
                <button
                  className={styles.emptyTrashBtn}
                  onClick={emptyTrash}
                >
                  <TrashIcon size={16} />
                  <span>휴지통 비우기</span>
                </button>
              )}
              
              {/* 리스트 뷰에서 디자인 생성 버튼 - 프로젝트 선택 시에만 */}
              {viewMode === 'list' && selectedProjectId && (
                <button 
                  className={styles.createDesignBtn}
                  onClick={() => {
                    handleCreateDesign(selectedProjectId, selectedProject?.title);
                  }}
                >
                  <PlusIcon size={14} />
                  <span>디자인 생성</span>
                </button>
              )}
              
            </div>
          </div>
        </div>
        )}

        <div className={styles.content}>
          {/* 프로젝트 트리 - 전체 프로젝트 메뉴일 때만 표시 */}
          {activeMenu === 'all' && allProjects.length > 0 && (
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
                <SimpleProjectDropdown
                  projects={allProjects}
                  currentProject={selectedProject}
                  onProjectSelect={(project) => {
                    console.log('🎯 SimpleDashboard - 프로젝트 선택됨:', project.id, project.title);
                    handleProjectSelect(project.id);
                  }}
                />
              </div>
            </div>
            
            <div className={styles.treeContent}>
              {allProjects.length > 0 ? (
                <div>
                  {/* 모든 프로젝트 표시 */}
                  {allProjects.map(project => {
                    const isExpanded = expandedProjects.has(project.id);
                    const isSelected = selectedProjectId === project.id;
                    const projectFolders = folders[project.id] || [];
                    const designFiles = projectDesignFiles[project.id] || [];
                    const hasContent = projectFolders.length > 0 || designFiles.length > 0 || project.furnitureCount > 0;
                    
                    return (
                      <div key={project.id}>
                        {/* 프로젝트 아이템 */}
                        <div 
                          className={`${styles.treeItem} ${isSelected ? styles.active : ''}`}
                          onClick={() => {
                            // 프로젝트 클릭 시 handleProjectSelect 호출
                            console.log('🎯 파일트리 프로젝트 클릭:', project.id, project.title);
                            handleProjectSelect(project.id);
                            setCurrentFolderId(null);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {/* 토글 화살표 */}
                          {hasContent && (
                            <div 
                              className={`${styles.treeToggleArrow} ${isExpanded ? styles.expanded : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleProjectExpansion(project.id);
                              }}
                            >
                              ▶
                            </div>
                          )}
                          <div className={styles.treeItemIcon}>
                            <IoFileTrayStackedOutline size={16} />
                          </div>
                          <span>{project.title}</span>
                          {/* 디자인 파일 개수 표시 */}
                          {(designFiles.length > 0 || project.furnitureCount > 0) && (
                            <span className={styles.treeItemCount}>
                              {designFiles.length || project.furnitureCount || 0}
                            </span>
                          )}
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
                        
                        {/* 프로젝트가 확장되었을 때 하위 내용 표시 */}
                        {isExpanded && (
                          <div className={styles.projectChildren}>
                            {/* 새 폴더 생성 버튼 (선택된 프로젝트만) */}
                            {isSelected && (
                              <button className={styles.createFolderBtn} onClick={handleCreateFolder}>
                                <PiFolderPlus size={16} style={{ marginRight: '8px' }} />
                                <span>새로운 폴더</span>
                              </button>
                            )}
                            
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
                              <PiFolderFill size={16} style={{ color: 'var(--theme-primary, #10b981)' }} />
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
                                    <AiOutlineFileMarkdown size={14} />
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
                      
                            {/* 디자인 파일 목록 */}
                            {designFiles.map(designFile => (
                              <div 
                                key={designFile.id}
                                className={styles.treeItem}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('디자인 파일 클릭됨:', designFile.name);
                                
                                  // 현재 위치에서 디자인 카드로 스크롤
                                  setTimeout(() => {
                                    const designCards = document.querySelectorAll(`.${styles.designCard}`);
                                    const targetCard = Array.from(designCards).find(card => {
                                      const cardElement = card as HTMLElement;
                                      const cardTitle = cardElement.querySelector(`.${styles.cardTitle}`)?.textContent;
                                      return cardTitle === designFile.name;
                                    });
                                    
                                    if (targetCard) {
                                      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      (targetCard as HTMLElement).classList.add(styles.forceHover);
                                      setTimeout(() => {
                                        (targetCard as HTMLElement).classList.remove(styles.forceHover);
                                      }, 3000);
                                    }
                                  }, 100);
                                }}
                              >
                                <div className={styles.treeItemIcon}>
                                  <AiOutlineFileMarkdown size={14} />
                                </div>
                                <span>{designFile.name}</span>
                                <div className={styles.treeItemActions}>
                                  <button 
                                    className={styles.treeItemActionBtn}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoreMenuOpen(e, designFile.id, designFile.name, 'design');
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
                    );
                  })}
                </div>
              ) : (
                // 프로젝트가 없을 때
                user ? (
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
            {activeMenu === 'shared' && !selectedProjectId && (
              <SharedTab
                sharedByMe={sharedByMeProjects}
                sharedWithMe={sharedWithMeProjects}
                projectDesignFiles={projectDesignFiles}
                projectCollaborators={projectCollaborators}
                onProjectSelect={handleProjectSelect}
                selectedCards={selectedCards}
                onCardSelect={(cardId) => {
                  const isCurrentlySelected = selectedCards.has(cardId);
                  handleCardSelect(cardId, !isCurrentlySelected);
                }}
              />
            )}
            {activeMenu === 'team' && (
              <TeamsTab onTeamSelect={(teamId) => console.log('팀 선택:', teamId)} />
            )}
            {activeMenu === 'profile' && (
              <ProfileTab initialSection={urlSection || 'profile'} />
            )}
            
            {/* 기존 프로젝트 그리드 (all, trash, bookmarks, shared 메뉴일 때 표시) */}
            {console.log('🔍 activeMenu 체크:', {
              activeMenu,
              isAllTrashBookmarks: activeMenu === 'all' || activeMenu === 'trash' || activeMenu === 'bookmarks' || activeMenu === 'shared',
              shouldShowGrid: (activeMenu === 'all' || activeMenu === 'trash' || activeMenu === 'bookmarks' || activeMenu === 'shared')
            })}
            {(activeMenu === 'all' || activeMenu === 'trash' || activeMenu === 'bookmarks' || activeMenu === 'shared') ? (
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
                // 로딩 중일 때는 스켈레톤 UI 표시
                if (projectsLoading && sortedItems.length === 0) {
                  return (
                    <>
                      {[1, 2, 3, 4].map((i) => (
                        <div 
                          key={`skeleton-${i}`}
                          className={styles.designCard}
                          style={{ opacity: 0.3, pointerEvents: 'none' }}
                        >
                          <div className={styles.designCardThumbnail} style={{ background: '#f0f0f0' }}>
                            <div style={{ 
                              width: '100%', 
                              height: '100%', 
                              background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                              animation: 'shimmer 2s infinite' 
                            }} />
                          </div>
                          <div className={styles.designCardFooter}>
                            <div style={{ width: '60%', height: '16px', background: '#f0f0f0', borderRadius: '4px' }} />
                            <div style={{ width: '30%', height: '12px', background: '#f0f0f0', borderRadius: '4px', marginTop: '4px' }} />
                          </div>
                        </div>
                      ))}
                    </>
                  );
                }
                
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
                  <div
                    key={item.id}
                    className={`${styles.designCard} ${item.type === 'new-design' ? styles.newDesign : ''} ${item.type === 'folder' ? styles.folderCard : ''}`}
                    data-design-id={item.type === 'design' ? item.id : undefined}
                    data-item-type={item.type}
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
                        handleCreateDesign(item.project.id, item.project.title);
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
                        console.log('🎨 디자인 카드 클릭', {
                          itemId: item.id,
                          projectId: item.project.id,
                          itemName: item.name,
                          hasDesignFile: !!item.designFile,
                          viewMode
                        });
                        // 카드 클릭은 무시 - 오버레이 버튼을 통해서만 에디터로 이동
                        // 그리드 뷰: 호버 시 오버레이 버튼 표시
                        // 리스트 뷰: 우측 액션 버튼 클릭
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
                          <PiFolderFill size={144} style={{ color: 'var(--theme-primary, #10b981)' }} />
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
                                
                                {/* 디자인 카드 호버 오버레이 - 그리드 뷰에서만 표시 (휴지통 제외) */}
                                {viewMode === 'grid' && activeMenu !== 'trash' && (
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
                                        itemName: item.name,
                                        hasDesignFile: !!item.designFile
                                      });
                                      // designFile이 있으면 ID를 사용, 없으면 이름을 사용
                                      if (item.designFile && item.designFile.id) {
                                        navigate(`/configurator?projectId=${item.project.id}&designFileId=${item.designFile.id}`);
                                      } else {
                                        navigate(`/configurator?projectId=${item.project.id}&designFileName=${encodeURIComponent(item.name)}`);
                                      }
                                    }}
                                  >
                                    <EditIcon size={16} />
                                    에디터로 이동
                                  </button>
                                </div>
                                )}
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
                                      <PiFolderFill size={24} />
                                    </div>
                                  ) : projectItem.type === 'design' && projectItem.designFile ? (
                                    // 디자인 파일의 실제 썸네일 표시
                                    <ThumbnailImage 
                                      project={item.project}
                                      designFile={{
                                        thumbnail: projectItem.designFile.thumbnail,
                                        updatedAt: projectItem.designFile.updatedAt,
                                        spaceConfig: projectItem.designFile.spaceConfig,
                                        furniture: projectItem.designFile.furniture
                                      }}
                                      className={styles.thumbnailImage}
                                      alt={projectItem.name}
                                    />
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
                                    referrerPolicy="no-referrer"
                                    
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
                          <div className={styles.cardTitle}>
                            {item.project.title} &gt; {item.name}
                            {/* 리스트 뷰에서만 제목 우측에 액션 버튼 표시 (휴지통 제외) */}
                            {viewMode === 'list' && activeMenu !== 'trash' && (
                              <div className={styles.listActionButtons}>
                                <button
                                  className={styles.listActionBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePreviewDesign(item.id);
                                  }}
                                  title="미리보기"
                                >
                                  <EyeIcon size={16} />
                                  <span>미리보기</span>
                                </button>
                                <button
                                  className={styles.listActionBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.designFile && item.designFile.id) {
                                      navigate(`/configurator?projectId=${item.project.id}&designFileId=${item.designFile.id}`);
                                    } else {
                                      navigate(`/configurator?projectId=${item.project.id}&designFileName=${encodeURIComponent(item.name)}`);
                                    }
                                  }}
                                  title="에디터로 이동"
                                >
                                  <EditIcon size={16} />
                                  <span>에디터로 이동</span>
                                </button>
                              </div>
                            )}
                          </div>
                          
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
                          
                          <div className={styles.cardFooter}>
                            <div className={styles.cardUser}>
                              {/* 소유자 프로필 */}
                              <div className={styles.cardUserAvatar}>
                                {(() => {
                                  // 공유받은 프로젝트인 경우 프로젝트 소유자 프로필 표시
                                  const isSharedProject = item.project.userId !== user?.uid;
                                  const ownerInfo = isSharedProject ? projectOwners[item.project.userId] : null;
                                  const photoURL = isSharedProject && ownerInfo?.photoURL ? ownerInfo.photoURL : user?.photoURL;

                                  return photoURL ? (
                                    <img
                                      src={photoURL}
                                      alt="프로필"
                                      referrerPolicy="no-referrer"
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        borderRadius: '50%',
                                        objectFit: 'cover'
                                      }}
                                    />
                                  ) : (
                                    <UserIcon size={12} />
                                  );
                                })()}
                              </div>
                              <span className={styles.cardUserName}>
                                {(() => {
                                  // 공유받은 프로젝트인 경우 프로젝트 소유자 이름 표시
                                  const isSharedProject = item.project.userId !== user?.uid;
                                  const ownerInfo = isSharedProject ? projectOwners[item.project.userId] : null;
                                  return isSharedProject && ownerInfo?.displayName
                                    ? ownerInfo.displayName
                                    : (user?.displayName || user?.email?.split('@')[0] || '이진수');
                                })()}
                              </span>
                            </div>

                            {/* 협업자 프로필 사진들 */}
                            {projectCollaborators[item.project.id] && projectCollaborators[item.project.id].length > 0 && (
                              <div className={styles.collaborators} style={{
                                display: 'flex',
                                gap: '4px',
                                marginTop: '8px',
                                paddingLeft: '4px'
                              }}>
                                {projectCollaborators[item.project.id].slice(0, 3).map((collaborator, idx) => (
                                  <div
                                    key={collaborator.userId}
                                    title={`${collaborator.userName} (${collaborator.permission === 'editor' ? '편집 가능' : '조회만'})`}
                                    style={{
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '50%',
                                      overflow: 'hidden',
                                      border: '2px solid white',
                                      backgroundColor: '#e0e0e0',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '10px',
                                      fontWeight: 'bold',
                                      color: '#666'
                                    }}
                                  >
                                    {collaborator.photoURL ? (
                                      <img
                                        src={collaborator.photoURL}
                                        alt={collaborator.userName}
                                        referrerPolicy="no-referrer"
                                        style={{
                                          width: '100%',
                                          height: '100%',
                                          objectFit: 'cover'
                                        }}
                                      />
                                    ) : (
                                      <UserIcon size={10} />
                                    )}
                                  </div>
                                ))}
                                {projectCollaborators[item.project.id].length > 3 && (
                                  <div
                                    title={`+${projectCollaborators[item.project.id].length - 3}명 더`}
                                    style={{
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '50%',
                                      border: '2px solid white',
                                      backgroundColor: '#666',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '10px',
                                      fontWeight: 'bold',
                                      color: 'white'
                                    }}
                                  >
                                    +{projectCollaborators[item.project.id].length - 3}
                                  </div>
                                )}
                              </div>
                            )}
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
                                    referrerPolicy="no-referrer"
                                    
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

                    {/* 더보기 메뉴 - 각 카드 내부에 렌더링 */}
                    {moreMenu && moreMenu.itemId === item.id && (
                      <>
                        <div
                          className={styles.moreMenuBackdrop}
                          onClick={closeMoreMenu}
                        />
                        <div className={styles.moreMenu}>
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
                            {activeMenu === 'trash' ? '영구 삭제' : '삭제하기'}
                          </div>
                          {activeMenu === 'trash' && (
                            <div
                              className={styles.moreMenuItem}
                              onClick={() => {
                                if (moreMenu.itemType === 'project') {
                                  restoreFromTrash(moreMenu.itemId);
                                } else if (moreMenu.itemType === 'design') {
                                  restoreDesignFileFromTrash(moreMenu.itemId);
                                }
                                closeMoreMenu();
                              }}
                            >
                              복원하기
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))
                ) : !projectsLoading && initialLoadComplete ? (
                  // 빈 상태 표시 (초기 로딩 완료 후에만)
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateTitle}>표시할 항목이 없습니다</div>
                  </div>
                ) : null;
              })()}

              {user && sortedItems.length === 0 && !projectsLoading && firebaseProjects.length === 0 && !selectedProjectId && initialLoadComplete ? (
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
      {isStep1ModalOpen && modalProjectId && (
        <div data-theme="light" style={{ colorScheme: 'light' }}>
          <Step1 
            onClose={handleCloseStep1Modal}
            projectId={modalProjectId}
            projectTitle={modalProjectTitle || undefined}
          />
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

      {/* Step1 모달 - 새 디자인 생성 */}
      {isStep1ModalOpen && modalProjectId && (
        <Step1
          onClose={handleCloseStep1Modal}
          projectId={modalProjectId}
          projectTitle={modalProjectTitle || undefined}
        />
      )}

      {/* 프로필 팝업 */}
      <ProfilePopup
        isOpen={isProfilePopupOpen}
        onClose={() => setIsProfilePopupOpen(false)}
        position={profilePopupPosition}
      />

      {/* 공유 링크 모달 */}
      {shareModalOpen && shareProjectId && shareProjectName && (
        <ShareLinkModal
          projectId={shareProjectId}
          projectName={shareProjectName}
          designFileId={shareDesignFileId}
          designFileName={shareDesignFileName}
          onClose={() => {
            setShareModalOpen(false);
            setShareProjectId(null);
            setShareProjectName('');
            setShareDesignFileId(null);
            setShareDesignFileName('');
          }}
        />
      )}

      {/* 이름 바꾸기 모달 */}
      <RenameModal
        isOpen={isRenameModalOpen}
        onClose={() => {
          setIsRenameModalOpen(false);
          setRenameTarget(null);
        }}
        onConfirm={handleConfirmRename}
        currentName={renameTarget?.name || ''}
        title="이름 바꾸기"
      />
    </div>
  );
};

export default SimpleDashboard;