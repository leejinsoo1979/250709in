import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { PlusIcon, UsersIcon } from '../components/common/Icons';
import { createProject, createDesignFile, saveFolderData, updateProject, FolderData } from '@/firebase/projects';
import { useAuth } from '@/auth/AuthProvider';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore, DEFAULT_SPACE_CONFIG } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { checkCredits } from '@/firebase/userProfiles';
import SettingsPanel from '@/components/common/SettingsPanel';
import { useUIStore } from '@/store/uiStore';
import Step1 from '../editor/Step1';
import ProjectViewerModal from '../components/common/ProjectViewerModal';
import ProfilePopup from '../editor/Configurator/components/ProfilePopup';
import { ShareLinkModal } from '@/components/ShareLinkModal';
import RenameModal from '../components/common/RenameModal';
import CreditErrorModal from '@/components/common/CreditErrorModal';
import { PopupManager } from '@/components/PopupManager';
// import { Chatbot } from '@/components/Chatbot';
import { useResponsive } from '@/hooks/useResponsive';

// Explorer 컴포넌트
import DashboardHeader from '@/components/dashboard/DashboardHeader';

import NavigationPane from '@/components/dashboard/NavigationPane';
import ContentToolbar from '@/components/dashboard/ContentToolbar';
import ContentPane from '@/components/dashboard/ContentPane';
import StatusBar from '@/components/dashboard/StatusBar';
import ClassicDashboard from '@/components/dashboard/ClassicDashboard';

// Explorer 훅
import { useExplorerNavigation } from '@/hooks/dashboard/useExplorerNavigation';
import { useExplorerData } from '@/hooks/dashboard/useExplorerData';
import { useExplorerActions } from '@/hooks/dashboard/useExplorerActions';
import { useMarqueeSelection } from '@/hooks/dashboard/useMarqueeSelection';
import type { ViewMode, SortBy, SortDirection, ExplorerItem } from '@/hooks/dashboard/types';

import styles from './SimpleDashboard.module.css';

const SimpleDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isMobile } = useResponsive();
  const { dashboardLayout } = useUIStore();

  // --- Explorer 훅 ---
  const nav = useExplorerNavigation();
  const data = useExplorerData(nav.currentProjectId, nav.currentFolderId, nav.activeMenu);
  const actions = useExplorerActions(data, nav);

  // 마키(올가미) 선택
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const { marqueeRect, marqueeHandlers } = useMarqueeSelection({
    containerRef: contentAreaRef,
    onSelectionChange: actions.setSelectedItems,
    existingSelection: actions.selectedItems,
    enabled: dashboardLayout === 'windows',
  });

  // --- 로컬 UI 상태 ---
  const [viewMode, setViewMode] = useState<ViewMode>('medium');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // 모달 상태들
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const [isStep1ModalOpen, setIsStep1ModalOpen] = useState(false);
  const [modalProjectId, setModalProjectId] = useState<string | null>(null);
  const [modalProjectTitle, setModalProjectTitle] = useState<string | null>(null);
  const [modalInitialStep, setModalInitialStep] = useState<1 | 2>(1);

  // SaaS 모드 디자인 생성 모달 (이름만 입력, 에디터 이동 없음)
  const [isSaasDesignModalOpen, setIsSaasDesignModalOpen] = useState(false);
  const [newDesignName, setNewDesignName] = useState('');
  const [isCreatingDesign, setIsCreatingDesign] = useState(false);

  const [viewerModal, setViewerModal] = useState<{
    isOpen: boolean;
    projectId: string;
    designFileId?: string;
  }>({ isOpen: false, projectId: '', designFileId: undefined });

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [isComingSoonModalOpen, setIsComingSoonModalOpen] = useState(false);

  const [isProfilePopupOpen, setIsProfilePopupOpen] = useState(false);
  const [profilePopupPosition] = useState({ top: 60, right: 20 });

  const [creditError, setCreditError] = useState({
    isOpen: false,
    currentCredits: 0,
    requiredCredits: 0,
  });

  // 공유 링크 모달
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareProjectId, setShareProjectId] = useState<string | null>(null);
  const [shareProjectName, setShareProjectName] = useState('');
  const [shareDesignFileId, setShareDesignFileId] = useState<string | null>(null);
  const [shareDesignFileName, setShareDesignFileName] = useState('');

  // 모바일 네비게이션 토글
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // 이름 변경 모달
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
    type: 'folder' | 'design' | 'project';
  } | null>(null);

  // 컨텍스트 메뉴 (아이템 우클릭)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: ExplorerItem;
  } | null>(null);

  // 빈 영역 컨텍스트 메뉴 (허공 우클릭)
  const [blankContextMenu, setBlankContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // 컨텍스트 메뉴 바깥 클릭 시 닫기
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const blankContextMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!contextMenu && !blankContextMenu) return;
    const close = (e: MouseEvent) => {
      // 메뉴 내부 클릭은 무시 (onClick이 먼저 처리)
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      if (blankContextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
      setBlankContextMenu(null);
    };
    const prevent = (e: MouseEvent) => { e.preventDefault(); setContextMenu(null); setBlankContextMenu(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('contextmenu', prevent);
    window.addEventListener('scroll', () => { setContextMenu(null); setBlankContextMenu(null); }, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('contextmenu', prevent);
      window.removeEventListener('scroll', () => { setContextMenu(null); setBlankContextMenu(null); }, true);
    };
  }, [contextMenu, blankContextMenu]);

  // --- 초기화 효과 ---

  // 로그인하지 않은 사용자 리다이렉트
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [user, loading, navigate]);

  // 대시보드 진입 시 store isDirty 초기화
  useEffect(() => {
    const { markAsSaved: markProjectSaved } = useProjectStore.getState();
    const { markAsSaved: markSpaceSaved } = useSpaceConfigStore.getState();
    const furnitureState = useFurnitureStore.getState() as any;
    markProjectSaved();
    markSpaceSaved();
    furnitureState.markAsSaved?.();
  }, []);

  // --- 핸들러들 ---

  // 디자인 에디터 열기
  const handleDesignOpen = useCallback((projectId: string, designFileName?: string) => {
    const url = designFileName
      ? `/configurator?projectId=${projectId}&designFileName=${encodeURIComponent(designFileName)}`
      : `/configurator?projectId=${projectId}`;
    navigate(url);
  }, [navigate]);

  // 3D 뷰어 모달
  const handleCloseViewer = useCallback(() => {
    setViewerModal({ isOpen: false, projectId: '', designFileId: undefined });
  }, []);

  // 아이템 더블클릭 핸들러
  const handleItemDoubleClick = useCallback((item: ExplorerItem) => {
    if (item.type === 'project') {
      // 프로젝트 진입
      nav.navigateTo(item.id, null, item.name);
    } else if (item.type === 'folder') {
      // 폴더 진입
      nav.navigateTo(nav.currentProjectId, item.id, item.name);
    } else if (item.type === 'design') {
      // 디자인 에디터 열기
      const projectId = item.projectId || nav.currentProjectId;
      if (projectId) {
        handleDesignOpen(projectId, item.name);
      }
    }
  }, [nav, handleDesignOpen]);

  // 아이템 컨텍스트 메뉴 (우클릭 / 더보기 버튼)
  const handleItemContextMenu = useCallback((e: React.MouseEvent, item: ExplorerItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  // 프로젝트 생성
  const handleCreateProject = useCallback(() => {
    setIsCreateModalOpen(true);
    setNewProjectName('');
  }, []);

  const handleCreateProjectSubmit = useCallback(async () => {
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      if (user) {
        const { id, error } = await createProject({ title: newProjectName.trim() });

        if (error) {
          alert('프로젝트 생성에 실패했습니다: ' + error);
          setIsCreating(false);
          return;
        }

        if (id) {
          setIsCreateModalOpen(false);
          setNewProjectName('');

          await data.refreshProjects();

          setTimeout(() => {
            nav.navigateTo(id, null, newProjectName.trim());
          }, 500);

          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({ type: 'PROJECT_CREATED', projectId: id, timestamp: Date.now() });
            channel.close();
          } catch { /* ignore */ }
        }
      } else {
        alert('프로젝트를 생성하려면 먼저 로그인해주세요.');
        navigate('/auth');
      }
    } catch (error) {
      console.error('프로젝트 생성 실패:', error);
      alert('프로젝트 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  }, [newProjectName, user, data, nav, navigate]);

  // 폴더 생성
  const handleCreateFolder = useCallback(() => {
    if (!nav.currentProjectId) {
      alert('프로젝트를 먼저 선택해주세요.');
      return;
    }
    setIsCreateFolderModalOpen(true);
    setNewFolderName('');
  }, [nav.currentProjectId]);

  const handleCreateFolderSubmit = useCallback(async () => {
    if (!newFolderName.trim() || !nav.currentProjectId) return;

    setIsCreatingFolder(true);
    try {
      const folderId = `folder_${Date.now()}`;
      const newFolder: FolderData = {
        id: folderId,
        name: newFolderName.trim(),
        type: 'folder' as const,
        children: [],
        expanded: false,
      };

      const updatedFolders = [...(data.folders[nav.currentProjectId] || []), newFolder];
      await saveFolderData(nav.currentProjectId, updatedFolders);
      await data.refreshFolders(nav.currentProjectId);

      setIsCreateFolderModalOpen(false);
      setNewFolderName('');
    } catch (error) {
      console.error('폴더 생성 실패:', error);
      alert('폴더 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingFolder(false);
    }
  }, [newFolderName, nav.currentProjectId, data]);

  // 새 디자인 생성
  const handleCreateDesign = useCallback(async (projectId?: string) => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    const targetProjectId = projectId || nav.currentProjectId;
    if (!targetProjectId) {
      alert('프로젝트를 먼저 선택해주세요.');
      return;
    }

    // 크레딧 체크
    const { hasEnough, currentCredits } = await checkCredits(20);
    if (!hasEnough) {
      setCreditError({ isOpen: true, currentCredits, requiredCredits: 20 });
      return;
    }

    const project = data.projects.find(p => p.id === targetProjectId);
    const title = project?.title || '새 프로젝트';

    const { setProjectId, setProjectTitle, resetBasicInfo } = useProjectStore.getState();
    setProjectId(targetProjectId);
    setProjectTitle(title);
    resetBasicInfo();

    setModalProjectId(targetProjectId);
    setModalProjectTitle(title);
    setIsStep1ModalOpen(true);
  }, [user, nav.currentProjectId, data.projects]);

  // SaaS 모드 디자인 생성 (이름만 입력, 에디터 이동 없음)
  const handleSaasCreateDesign = useCallback(() => {
    if (!nav.currentProjectId) {
      alert('프로젝트를 먼저 선택해주세요.');
      return;
    }
    setIsSaasDesignModalOpen(true);
    setNewDesignName('');
  }, [nav.currentProjectId]);

  const handleSaasCreateDesignSubmit = useCallback(async () => {
    if (!newDesignName.trim() || !nav.currentProjectId) return;

    setIsCreatingDesign(true);
    try {
      const { hasEnough, currentCredits } = await checkCredits(20);
      if (!hasEnough) {
        setCreditError({ isOpen: true, currentCredits, requiredCredits: 20 });
        return;
      }

      const { id, error } = await createDesignFile({
        name: newDesignName.trim(),
        projectId: nav.currentProjectId,
        spaceConfig: DEFAULT_SPACE_CONFIG,
        furniture: { placedModules: [] },
      });

      if (error) {
        alert('디자인 생성에 실패했습니다: ' + error);
        return;
      }

      if (id) {
        setIsSaasDesignModalOpen(false);
        setNewDesignName('');
        await data.refreshDesignFiles(nav.currentProjectId);
      }
    } catch (error) {
      console.error('디자인 생성 실패:', error);
      alert('디자인 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingDesign(false);
    }
  }, [newDesignName, nav.currentProjectId, data]);

  // Step1 모달 닫기
  const handleCloseStep1Modal = useCallback(async () => {
    setIsStep1ModalOpen(false);
    setModalProjectId(null);
    setModalProjectTitle(null);
    setModalInitialStep(1);
    if (nav.currentProjectId) {
      await data.refreshDesignFiles(nav.currentProjectId);
    }
  }, [nav.currentProjectId, data]);

  // 이름 변경 확인
  const handleConfirmRename = useCallback(async (newName: string) => {
    if (!renameTarget || !newName.trim()) return;

    if (renameTarget.type === 'project') {
      try {
        const { updateProject } = await import('@/firebase/projects');
        const result = await updateProject(renameTarget.id, { title: newName.trim() });
        if (result.error) {
          alert('프로젝트 이름 변경에 실패했습니다: ' + result.error);
          return;
        }
        await data.refreshProjects();
        try {
          const ch = new BroadcastChannel('project-updates');
          ch.postMessage({ type: 'PROJECT_UPDATED', action: 'renamed', projectId: renameTarget.id, newName: newName.trim() });
          ch.close();
        } catch { /* ignore */ }
      } catch (error) {
        console.error('프로젝트 이름 변경 중 오류:', error);
        alert('프로젝트 이름 변경 중 오류가 발생했습니다.');
      }
    } else if (renameTarget.type === 'folder' && nav.currentProjectId) {
      const updatedFolders = (data.folders[nav.currentProjectId] || []).map(folder =>
        folder.id === renameTarget.id ? { ...folder, name: newName.trim() } : folder
      );
      await saveFolderData(nav.currentProjectId, updatedFolders);
      await data.refreshFolders(nav.currentProjectId);
    } else if (renameTarget.type === 'design') {
      try {
        const { updateDesignFile } = await import('@/firebase/projects');
        const result = await updateDesignFile(renameTarget.id, { name: newName.trim() });
        if (result.error) {
          alert('디자인파일 이름 변경에 실패했습니다: ' + result.error);
          return;
        }
        if (nav.currentProjectId) {
          await data.refreshDesignFiles(nav.currentProjectId);
          // 폴더 내부 디자인인 경우 폴더 데이터도 갱신
          const projectFolders = data.folders[nav.currentProjectId] || [];
          const isInFolder = projectFolders.some(f => f.children.some(c => c.id === renameTarget.id));
          if (isInFolder) {
            const updatedFolders = projectFolders.map(folder => ({
              ...folder,
              children: folder.children.map(child =>
                child.id === renameTarget.id ? { ...child, name: newName.trim() } : child
              ),
            }));
            await saveFolderData(nav.currentProjectId, updatedFolders);
            await data.refreshFolders(nav.currentProjectId);
          }
        }
        await data.refreshProjects();
        try {
          const ch = new BroadcastChannel('project-updates');
          ch.postMessage({ type: 'PROJECT_UPDATED', action: 'design_renamed', designFileId: renameTarget.id, newName: newName.trim() });
          ch.close();
        } catch { /* ignore */ }
      } catch (error) {
        console.error('디자인파일 이름 변경 중 오류:', error);
        alert('디자인파일 이름 변경 중 오류가 발생했습니다.');
      }
    }
  }, [renameTarget, nav.currentProjectId, data]);

  // 로그아웃
  const doLogout = useCallback(async () => {
    try {
      const { signOut } = await import('firebase/auth');
      const { auth } = await import('@/firebase/config');
      await signOut(auth);
      navigate('/auth');
    } catch {
      alert('로그아웃 중 오류가 발생했지만 로그인 페이지로 이동합니다.');
      navigate('/auth');
    }
  }, [navigate]);

  // 정렬 방향 토글
  const handleSortDirectionToggle = useCallback(() => {
    setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
  }, []);

  // --- 선택된 아이템 헬퍼 ---
  const getSelectedExplorerItems = useCallback(() => {
    return data.currentItems.filter(item => actions.selectedItems.has(item.id));
  }, [data.currentItems, actions.selectedItems]);

  // --- 키보드 네비게이션 + 단축키 ---
  useEffect(() => {
    if (dashboardLayout !== 'windows') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const isMod = e.ctrlKey || e.metaKey;

      // 네비게이션
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); nav.goBack(); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); nav.goForward(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); nav.goUp(); return; }

      // Ctrl+A: 전체선택
      if (isMod && e.key === 'a') { e.preventDefault(); actions.selectAll(); return; }

      // Ctrl+C: 복사
      if (isMod && e.key === 'c' && actions.selectedItems.size > 0) {
        e.preventDefault();
        actions.copyItems(getSelectedExplorerItems());
        return;
      }

      // Ctrl+X: 잘라내기
      if (isMod && e.key === 'x' && actions.selectedItems.size > 0) {
        e.preventDefault();
        actions.cutItems(getSelectedExplorerItems());
        return;
      }

      // Ctrl+V: 붙여넣기
      if (isMod && e.key === 'v' && actions.clipboard) {
        e.preventDefault();
        actions.pasteItems(nav.currentProjectId || undefined, nav.currentFolderId || undefined);
        return;
      }

      // Ctrl+D: 복제
      if (isMod && e.key === 'd' && actions.selectedItems.size > 0) {
        e.preventDefault();
        actions.duplicateItems(getSelectedExplorerItems());
        return;
      }

      // Delete: 삭제
      if (e.key === 'Delete' && actions.selectedItems.size > 0) {
        e.preventDefault();
        const itemsToDelete = data.currentItems
          .filter(item => actions.selectedItems.has(item.id))
          .map(item => ({ id: item.id, type: item.type, projectId: item.projectId || nav.currentProjectId || undefined }));
        if (itemsToDelete.length > 0 && confirm(`${itemsToDelete.length}개 항목을 삭제하시겠습니까?`)) {
          actions.deleteItems(itemsToDelete);
        }
        return;
      }

      // Enter: 열기
      if (e.key === 'Enter' && actions.selectedItems.size === 1) {
        const selectedId = Array.from(actions.selectedItems)[0];
        const item = data.currentItems.find(i => i.id === selectedId);
        if (item) handleItemDoubleClick(item);
        return;
      }

      // Escape: 선택 해제
      if (e.key === 'Escape') { actions.clearSelection(); return; }

      // F2: 이름 바꾸기
      if (e.key === 'F2' && actions.selectedItems.size === 1) {
        const selectedId = Array.from(actions.selectedItems)[0];
        const item = data.currentItems.find(i => i.id === selectedId);
        if (item) {
          setRenameTarget({ id: item.id, name: item.name, type: item.type as 'folder' | 'design' | 'project' });
          setIsRenameModalOpen(true);
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nav, actions, data.currentItems, handleItemDoubleClick, dashboardLayout, getSelectedExplorerItems]);

  // --- 로딩/에러 상태 ---

  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--theme-background, #ffffff)',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--theme-text, #000000)' }}>
          <div style={{ marginBottom: '16px' }}>로딩 중...</div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // --- 렌더 ---
  return (
    <div className={styles.explorerLayout}>
      {/* 헤더: 윈도우 모드에서만 표시 (SaaS는 자체 헤더 사용) */}
      {dashboardLayout === 'windows' && (
        <DashboardHeader
          onLogoClick={() => nav.navigateToRoot()}
          onProfileClick={() => setIsProfilePopupOpen(true)}
          onOpenSettings={() => setIsSettingsPanelOpen(true)}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
      )}

      {/* 레이아웃 분기: SaaS vs 윈도우 */}
      {dashboardLayout === 'saas' ? (
        <ClassicDashboard
          nav={nav}
          data={data}
          actions={actions}
          onItemDoubleClick={handleItemDoubleClick}
          onItemContextMenu={handleItemContextMenu}
          onCreateProject={handleCreateProject}
          onCreateDesign={handleSaasCreateDesign}
          onBlankContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setBlankContextMenu({ x: e.clientX, y: e.clientY });
          }}
          onOpenEditor={(item) => {
            // 이미 공간설정 완료된 디자인은 바로 에디터로 이동
            if (item.thumbnail || item.spaceSize) {
              handleItemDoubleClick(item);
              return;
            }
            // 공간설정 안 된 디자인은 Step2(공간설정) 팝업
            const project = data.projects.find(p => p.id === (item.projectId || nav.currentProjectId));
            const targetProjectId = item.projectId || nav.currentProjectId;
            if (targetProjectId) {
              const { setProjectId, setProjectTitle, setBasicInfo } = useProjectStore.getState();
              setProjectId(targetProjectId);
              setProjectTitle(project?.title || '새 프로젝트');
              setBasicInfo({ title: item.name, location: project?.title || '기본 위치' });
              setModalProjectId(targetProjectId);
              setModalProjectTitle(project?.title || '새 프로젝트');
              setModalInitialStep(2);
              setIsStep1ModalOpen(true);
            }
          }}
        />
      ) : (
        <>
          {/* 메인 바디: 좌측(트리) + 우측(컨텐츠) */}
          <div className={styles.explorerBody}>
            {/* 모바일 햄버거 버튼 */}
            {isMobile && (
              <button
                className={styles.mobileNavToggle}
                onClick={() => setMobileNavOpen(prev => !prev)}
                aria-label="네비게이션 토글"
              >
                {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            )}

            {/* 좌측 칼럼: 네비게이션 트리 */}
            {(!isMobile || mobileNavOpen) && (
              <div className={isMobile ? styles.mobileNavOverlay : styles.leftColumn}>
                <NavigationPane
                  projects={
                    nav.activeMenu === 'in-progress'
                      ? data.projects.filter(p => !p.status || p.status === 'in_progress')
                      : nav.activeMenu === 'completed'
                        ? data.projects.filter(p => p.status === 'completed')
                        : data.projects
                  }
                  folders={data.folders}
                  currentProjectId={nav.currentProjectId}
                  currentFolderId={nav.currentFolderId}
                  activeMenu={nav.activeMenu}
                  onNavigate={(projectId, folderId, label) => {
                    nav.navigateTo(projectId, folderId, label);
                    if (isMobile) setMobileNavOpen(false);
                  }}
                  onMenuChange={(menu) => {
                    nav.setActiveMenu(menu);
                    if (isMobile) setMobileNavOpen(false);
                  }}
                  onCreateProject={handleCreateProject}
                  menuCounts={{
                    'in-progress': data.projects.filter(p => !p.status || p.status === 'in_progress').length,
                    'completed': data.projects.filter(p => p.status === 'completed').length,
                    'shared-with-me': data.sharedWithMeProjects.length,
                    'shared-by-me': data.sharedByMeProjects.length,
                  }}
                />
                {isMobile && (
                  <div className={styles.mobileNavBackdrop} onClick={() => setMobileNavOpen(false)} />
                )}
              </div>
            )}

            {/* 우측 컨텐츠 영역 */}
            <div
              ref={contentAreaRef}
              className={styles.explorerContent}
              onContextMenu={(e) => {
                // 아이템 위에서 클릭한 경우 무시 (아이템 자체 컨텍스트 메뉴 우선)
                const target = e.target as HTMLElement;
                if (target.closest('[data-item-card]')) return;
                e.preventDefault();
                e.stopPropagation();
                setBlankContextMenu({ x: e.clientX, y: e.clientY });
              }}
              {...marqueeHandlers}
            >
              <ContentToolbar
                viewMode={viewMode}
                sortBy={sortBy}
                onViewModeChange={setViewMode}
                onSortChange={setSortBy}
                onCreateProject={handleCreateProject}
                onCreateFolder={nav.currentProjectId ? handleCreateFolder : undefined}
                onCreateDesign={nav.currentProjectId ? () => handleCreateDesign() : undefined}
                nav={nav}
                totalItemCount={data.currentItems.length}
                selectedCount={actions.selectedItems.size}
                onSelectAll={actions.selectAll}
                onClearSelection={actions.clearSelection}
              />

              <ContentPane
                items={data.currentItems}
                viewMode={viewMode}
                sortBy={sortBy}
                sortDirection={sortDirection}
                searchTerm={searchTerm}
                selectedItems={actions.selectedItems}
                dragState={actions.dragState}
                onItemClick={actions.selectItem}
                onItemDoubleClick={handleItemDoubleClick}
                onItemContextMenu={handleItemContextMenu}
                onSortDirectionToggle={handleSortDirectionToggle}
                dragHandlers={actions.dragHandlers}
                projectDesignFiles={data.projectDesignFiles}
                isLoading={data.isLoading}
              />

              {/* 마키 선택 오버레이 */}
              {marqueeRect && (
                <div
                  style={{
                    position: 'fixed',
                    left: marqueeRect.x,
                    top: marqueeRect.y,
                    width: marqueeRect.width,
                    height: marqueeRect.height,
                    border: '1px solid var(--theme-primary, #3b82f6)',
                    background: 'rgba(59, 130, 246, 0.1)',
                    pointerEvents: 'none',
                    zIndex: 10000,
                  }}
                />
              )}
            </div>
          </div>

          {/* 하단 상태바 */}
          <StatusBar
            itemCount={data.currentItems.length}
            selectedCount={actions.selectedItems.size}
          />
        </>
      )}

      {/* ===== 모달들 ===== */}

      {/* 프로젝트 생성 모달 */}
      {isCreateModalOpen && (
        <div className={styles.modalOverlay} onClick={() => { setIsCreateModalOpen(false); setNewProjectName(''); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>새 프로젝트</h2>
            <input
              type="text"
              className={styles.modalInput}
              placeholder="프로젝트 이름을 입력하세요"
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateProjectSubmit()}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button onClick={() => { setIsCreateModalOpen(false); setNewProjectName(''); }} className={styles.modalCancelBtn}>
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

      {/* 폴더 생성 모달 */}
      {isCreateFolderModalOpen && (
        <div className={styles.modalOverlay} onClick={() => { setIsCreateFolderModalOpen(false); setNewFolderName(''); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>새 폴더</h2>
            <input
              type="text"
              className={styles.modalInput}
              placeholder="폴더 이름을 입력하세요"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolderSubmit()}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button onClick={() => { setIsCreateFolderModalOpen(false); setNewFolderName(''); }} className={styles.modalCancelBtn}>
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

      {/* SaaS 디자인 생성 모달 (이름만 입력) */}
      {isSaasDesignModalOpen && (
        <div className={styles.modalOverlay} onClick={() => { setIsSaasDesignModalOpen(false); setNewDesignName(''); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>새 디자인</h2>
            <input
              type="text"
              className={styles.modalInput}
              placeholder="디자인 이름을 입력하세요"
              value={newDesignName}
              onChange={e => setNewDesignName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaasCreateDesignSubmit()}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button onClick={() => { setIsSaasDesignModalOpen(false); setNewDesignName(''); }} className={styles.modalCancelBtn}>
                취소
              </button>
              <button
                onClick={handleSaasCreateDesignSubmit}
                disabled={!newDesignName.trim() || isCreatingDesign}
                className={styles.modalCreateBtn}
              >
                {isCreatingDesign ? '생성 중...' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 로그아웃 확인 모달 */}
      {isLogoutModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsLogoutModalOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>로그아웃</h2>
            <p style={{ textAlign: 'center', color: 'var(--theme-text-secondary)', marginBottom: 20 }}>
              정말로 로그아웃 하시겠습니까?
            </p>
            <div className={styles.modalActions}>
              <button onClick={() => setIsLogoutModalOpen(false)} className={styles.modalCancelBtn}>취소</button>
              <button onClick={doLogout} className={styles.modalCreateBtn}>로그아웃</button>
            </div>
          </div>
        </div>
      )}

      {/* 팀 관리 모달 */}
      {showTeamModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>팀 관리</h2>
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--theme-text-muted)' }}>
              <UsersIcon size={40} />
              <p>아직 팀이 없습니다</p>
              <button
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '8px 16px', background: 'var(--theme-primary)', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer', marginTop: 12,
                }}
                onClick={() => alert('팀 생성 기능은 준비 중입니다.')}
              >
                <PlusIcon size={16} />
                새 팀 만들기
              </button>
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setShowTeamModal(false)} className={styles.modalCancelBtn}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* Step1 모달 - 새 디자인 생성 */}
      {isStep1ModalOpen && modalProjectId && (
        <div data-theme="light" style={{ colorScheme: 'light' }}>
          <Step1
            onClose={handleCloseStep1Modal}
            projectId={modalProjectId}
            projectTitle={modalProjectTitle || undefined}
            initialStep={modalInitialStep}
          />
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

      {/* 크레딧 부족 모달 */}
      <CreditErrorModal
        isOpen={creditError.isOpen}
        currentCredits={creditError.currentCredits}
        requiredCredits={creditError.requiredCredits}
        onClose={() => setCreditError({ ...creditError, isOpen: false })}
        onRecharge={() => {
          setCreditError({ ...creditError, isOpen: false });
          setIsProfilePopupOpen(true);
        }}
      />

      {/* 준비중 모달 */}
      {isComingSoonModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsComingSoonModalOpen(false)}>
          <div className={styles.comingSoonModal} onClick={e => e.stopPropagation()}>
            <div className={styles.comingSoonIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            <h3 className={styles.comingSoonTitle}>서비스 준비중</h3>
            <p className={styles.comingSoonDesc}>키친 디자인 기능은 현재 개발 중입니다.<br />빠른 시일 내에 만나보실 수 있습니다.</p>
            <button className={styles.comingSoonBtn} onClick={() => setIsComingSoonModalOpen(false)}>
              확인
            </button>
          </div>
        </div>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <>
          <div
            ref={contextMenuRef}
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              minWidth: 200,
              background: 'var(--theme-surface, #1e1e1e)',
              border: '1px solid var(--theme-border, #333)',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              padding: '4px 0',
              zIndex: 100000,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontSize: 13,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* 열기 */}
            <button
              style={{
                width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={() => {
                handleItemDoubleClick(contextMenu.item);
                setContextMenu(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              열기
            </button>

            {/* 에디터로 이동 (디자인만) */}
            {contextMenu.item.type === 'design' && (
              <button
                style={{
                  width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                  color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                onClick={() => {
                  const item = contextMenu.item;
                  const projectId = item.projectId || nav.currentProjectId;
                  if (projectId) {
                    navigate(`/configurator?projectId=${projectId}&designFileName=${encodeURIComponent(item.name)}`);
                  }
                  setContextMenu(null);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                에디터로 이동
              </button>
            )}

            {/* 구분선 */}
            <div style={{ height: 1, background: 'var(--theme-border, #333)', margin: '4px 0' }} />

            {/* 이름 바꾸기 */}
            <button
              style={{
                width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={() => {
                setRenameTarget({
                  id: contextMenu.item.id,
                  name: contextMenu.item.name,
                  type: contextMenu.item.type as 'folder' | 'design' | 'project',
                });
                setIsRenameModalOpen(true);
                setContextMenu(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              이름 바꾸기
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>F2</span>
            </button>

            {/* 공유 (프로젝트/디자인) */}
            {(contextMenu.item.type === 'project' || contextMenu.item.type === 'design') && (
              <button
                style={{
                  width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                  color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                onClick={() => {
                  const item = contextMenu.item;
                  if (item.type === 'project') {
                    setShareProjectId(item.id);
                    setShareProjectName(item.name);
                    setShareDesignFileId(null);
                    setShareDesignFileName('');
                  } else {
                    const projectId = item.projectId || nav.currentProjectId || '';
                    setShareProjectId(projectId);
                    setShareProjectName('');
                    setShareDesignFileId(item.id);
                    setShareDesignFileName(item.name);
                  }
                  setShareModalOpen(true);
                  setContextMenu(null);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                공유
              </button>
            )}

            {/* 프로젝트 상태 이동 (프로젝트만) */}
            {contextMenu.item.type === 'project' && nav.activeMenu !== 'completed' && (
              <button
                style={{
                  width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                  color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                onClick={async () => {
                  const item = contextMenu.item;
                  setContextMenu(null);
                  const result = await updateProject(item.id, { status: 'completed' } as any);
                  if (result.error) {
                    alert(result.error);
                  } else {
                    alert(`"${item.name}"이(가) 완료된 프로젝트로 이동되었습니다.`);
                    window.location.reload();
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                완료된 프로젝트로 이동
              </button>
            )}
            {contextMenu.item.type === 'project' && nav.activeMenu === 'completed' && (
              <button
                style={{
                  width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                  color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                onClick={async () => {
                  const item = contextMenu.item;
                  setContextMenu(null);
                  const result = await updateProject(item.id, { status: 'in_progress' } as any);
                  if (result.error) {
                    alert(result.error);
                  } else {
                    alert(`"${item.name}"이(가) 진행중 프로젝트로 이동되었습니다.`);
                    window.location.reload();
                  }
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                진행중 프로젝트로 이동
              </button>
            )}

            {/* 구분선 */}
            <div style={{ height: 1, background: 'var(--theme-border, #333)', margin: '4px 0' }} />

            {/* 복사 */}
            <button
              style={{
                width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={() => {
                const selected = getSelectedExplorerItems();
                const items = selected.length > 0 ? selected : [contextMenu.item];
                actions.copyItems(items);
                setContextMenu(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              복사
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>Ctrl+C</span>
            </button>

            {/* 잘라내기 */}
            <button
              style={{
                width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={() => {
                const selected = getSelectedExplorerItems();
                const items = selected.length > 0 ? selected : [contextMenu.item];
                actions.cutItems(items);
                setContextMenu(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
              잘라내기
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>Ctrl+X</span>
            </button>

            {/* 붙여넣기 (클립보드에 항목이 있을 때) */}
            {actions.clipboard && (
              <button
                style={{
                  width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                  color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                onClick={() => {
                  actions.pasteItems(nav.currentProjectId || undefined, nav.currentFolderId || undefined);
                  setContextMenu(null);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                붙여넣기
                <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>Ctrl+V</span>
              </button>
            )}

            {/* 복제 */}
            <button
              style={{
                width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={() => {
                const selected = getSelectedExplorerItems();
                const items = selected.length > 0 ? selected : [contextMenu.item];
                actions.duplicateItems(items);
                setContextMenu(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16V4a2 2 0 012-2h12"/></svg>
              복제
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>Ctrl+D</span>
            </button>

            {/* 구분선 */}
            <div style={{ height: 1, background: 'var(--theme-border, #333)', margin: '4px 0' }} />

            {/* 삭제 */}
            <button
              style={{
                width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                color: '#ef4444', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={() => {
                const item = contextMenu.item;
                if (confirm(`"${item.name}"을(를) 삭제하시겠습니까?`)) {
                  actions.deleteItems([{
                    id: item.id,
                    type: item.type,
                    projectId: item.projectId || nav.currentProjectId || undefined,
                  }]);
                }
                setContextMenu(null);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              삭제
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>Del</span>
            </button>
          </div>
        </>
      )}

      {/* 빈 영역 우클릭 컨텍스트 메뉴 */}
      {blankContextMenu && (
        <div
          ref={blankContextMenuRef}
          style={{
            position: 'fixed',
            left: blankContextMenu.x,
            top: blankContextMenu.y,
            minWidth: 200,
            background: 'var(--theme-surface, #1e1e1e)',
            border: '1px solid var(--theme-border-hover, #444)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            padding: '4px 0',
            zIndex: 100000,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: 13,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 프로젝트 생성 */}
          <button
            style={{
              width: '100%', padding: '8px 16px', border: 'none', background: 'none',
              color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { handleCreateProject(); setBlankContextMenu(null); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            새 프로젝트
          </button>

          {/* 폴더 생성 (프로젝트 내부일 때만) */}
          {nav.currentProjectId && (
            <button
              style={{
                width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              onClick={() => { handleCreateFolder(); setBlankContextMenu(null); }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              새 폴더
            </button>
          )}

          {/* 디자인 생성 (프로젝트 내부일 때만) */}
          {nav.currentProjectId && (
            <>
              <div style={{ height: 1, background: 'var(--theme-border, #333)', margin: '4px 0' }} />
              <button
                style={{
                  width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                  color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                onClick={() => { handleSaasCreateDesign(); setBlankContextMenu(null); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                새 디자인
              </button>
            </>
          )}

          {/* 붙여넣기 (클립보드에 항목이 있을 때) */}
          {actions.clipboard && (
            <>
              <div style={{ height: 1, background: 'var(--theme-border, #333)', margin: '4px 0' }} />
              <button
                style={{
                  width: '100%', padding: '8px 16px', border: 'none', background: 'none',
                  color: 'var(--theme-text, #fff)', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--theme-primary, #3b82f6)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                onClick={() => {
                  actions.pasteItems(nav.currentProjectId || undefined, nav.currentFolderId || undefined);
                  setBlankContextMenu(null);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                붙여넣기
                <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>Ctrl+V</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 팝업 매니저 */}
      <PopupManager />

      {/* 챗봇 - 비활성화 */}
      {/* <Chatbot /> */}
    </div>
  );
};

export default SimpleDashboard;
