import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Header.module.css';
import { Settings, User, ChevronDown, Undo, Redo, FileText, Sun, Moon } from 'lucide-react';
import { FiSunset } from 'react-icons/fi';
import { FaRegKeyboard } from 'react-icons/fa';
import { SiConvertio } from 'react-icons/si';
import { RxDashboard } from 'react-icons/rx';
import { TbTableExport } from 'react-icons/tb';
import HelpModal from './HelpModal';
import SettingsPanel from '@/components/common/SettingsPanel';
import Logo from '@/components/common/Logo';
import { useAuth } from '@/auth/AuthProvider';
import ProfilePopup from './ProfilePopup';
import { useTranslation } from '@/i18n/useTranslation';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useHistoryStore } from '@/store/historyStore';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/contexts/ThemeContext';
import { ProjectCollaborator } from '@/firebase/shareLinks';
import { PiCrownDuotone } from "react-icons/pi";
import { FiLink } from "react-icons/fi";
import { GoPersonAdd } from "react-icons/go";
import { useResponsive } from '@/hooks/useResponsive';

// Perspective Cube Icon (원근 투영 큐브 - 아래로 좁아짐)
const PerspectiveCubeIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    {/* 상단면 (넓음) */}
    <path d="M12 4 L20 7 L12 10 L4 7 Z" />
    {/* 좌측면 (아래로 좁아짐) */}
    <path d="M4 7 L8 17" />
    {/* 우측면 (아래로 좁아짐) */}
    <path d="M20 7 L16 17" />
    {/* 중앙 수직선 */}
    <path d="M12 10 L12 19" />
    {/* 하단 좌우 연결 */}
    <path d="M8 17 L12 19" />
    <path d="M16 17 L12 19" />
  </svg>
);

// Orthographic Cube Icon (직교 투영 - 평행선 큐브)
const OrthographicCubeIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8 L12 4 L20 8 L20 16 L12 20 L4 16 Z" />
    <path d="M4 8 L12 12 L20 8" />
    <path d="M12 12 L12 20" />
    <path d="M4 8 L4 16" />
    <path d="M20 8 L20 16" />
  </svg>
);

interface HeaderProps {
  title: string;
  projectName?: string; // 프로젝트명 추가
  folderName?: string; // 폴더명 추가
  designFileName?: string; // 디자인 파일명 추가
  projectId?: string | null; // 프로젝트 ID 추가
  designFileId?: string | null; // 디자인 파일 ID 추가
  owner?: { userId: string; name: string; photoURL?: string } | null; // 프로젝트 소유자
  collaborators?: ProjectCollaborator[]; // 협업자 목록
  onSave: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onHelp?: () => void;
  onConvert?: () => void;
  onLogout?: () => void;
  onProfile?: () => void;
  saving?: boolean;
  saveStatus?: 'idle' | 'success' | 'error';
  // 도어 설치 관련 props 추가
  hasDoorsInstalled?: boolean;
  onDoorInstallationToggle?: () => void;
  // 파일 메뉴 관련 props 추가
  onNewProject?: () => void;
  onSaveAs?: () => void;
  onProjectNameChange?: (newName: string) => void;
  onDesignFileNameChange?: (newName: string) => void; // 디자인 파일명 변경
  onDesignFileChange?: () => void; // 디자인 파일 선택/변경
  // 햄버거 메뉴 관련 props 추가
  onFileTreeToggle?: () => void;
  isFileTreeOpen?: boolean;
  // 내보내기 관련 props
  onExportPDF?: () => void; // 실제로는 ConvertModal을 열어줌
  onExport3D?: (format: 'glb' | 'obj' | 'stl' | 'dae') => void; // 3D 모델 내보내기
  // 읽기 전용 모드
  readOnly?: boolean; // viewer 권한용 읽기 전용 모드 (디자인명 수정 불가)
  // 모바일 메뉴 토글
  onMobileMenuToggle?: () => void;
  // 보링 관련 props
  showBorings?: boolean;
  onToggleBorings?: () => void;
  onBoringExport?: () => void;
  totalBorings?: number;
  boringFurnitureCount?: number;
}

// 모바일 배치 모드 토글 (슬롯배치/자유배치)
const MobileLayoutToggle: React.FC = () => {
  const spaceInfo = useSpaceConfigStore(s => s.spaceInfo);
  const setSpaceInfo = useSpaceConfigStore(s => s.setSpaceInfo);
  const layoutMode = spaceInfo.layoutMode || 'equal-division';
  const isFree = layoutMode === 'free-placement';

  const handleMode = (mode: 'equal-division' | 'free-placement') => {
    if (layoutMode === mode) return;
    const pm = useFurnitureStore.getState().placedModules;
    if (pm.length > 0) {
      if (!window.confirm('배치 방식을 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
      useFurnitureStore.getState().clearAllModules();
      setSpaceInfo({ freeSurround: undefined });
    }
    const updates: Record<string, unknown> = { layoutMode: mode };
    if (spaceInfo.surroundType === 'no-surround') {
      const wc = spaceInfo.wallConfig || { left: true, right: true };
      updates.gapConfig = { left: wc.left ? 1.5 : 0, right: wc.right ? 1.5 : 0, middle: 1.5 };
    }
    if (mode === 'equal-division') {
      if (spaceInfo.droppedCeiling?.enabled) {
        updates.droppedCeiling = { enabled: false, position: 'right', width: 150, dropHeight: 20 };
      }
      updates.curtainBox = { enabled: false, position: 'right', width: 150, dropHeight: 20 };
    }
    setSpaceInfo(updates);
  };

  return (
    <div className={styles.mobileViewModeToggle}>
      <button
        className={`${styles.viewModeButton} ${!isFree ? styles.active : ''}`}
        onClick={() => handleMode('equal-division')}
      >
        <span>슬롯배치</span>
      </button>
      <button
        className={`${styles.viewModeButton} ${isFree ? styles.active : ''}`}
        onClick={() => handleMode('free-placement')}
      >
        <span>자유배치</span>
      </button>
    </div>
  );
};

const Header: React.FC<HeaderProps> = ({
  title,
  projectName,
  folderName,
  designFileName,
  projectId,
  designFileId,
  owner,
  collaborators = [],
  onSave,
  onPrevious,
  onNext,
  onHelp,
  onConvert,
  onLogout,
  onProfile,
  saving = false,
  saveStatus = 'idle',
  hasDoorsInstalled = false,
  onDoorInstallationToggle,
  onNewProject,
  onSaveAs,
  onProjectNameChange,
  onDesignFileNameChange,
  onDesignFileChange,
  onFileTreeToggle,
  isFileTreeOpen,
  onExportPDF,
  onExport3D,
  readOnly = false,
  onMobileMenuToggle,
  showBorings = false,
  onToggleBorings,
  onBoringExport,
  totalBorings = 0,
  boringFurnitureCount = 0
}) => {
  console.log('🎯 Header 컴포넌트 렌더링:', {
    title,
    projectName,
    designFileName,
    projectId,
    designFileId,
    owner,
    collaborators,
    collaboratorsCount: collaborators.length
  });

  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, currentLanguage } = useTranslation();
  const { isMobile } = useResponsive();

  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isProfilePopupOpen, setIsProfilePopupOpen] = useState(false);
  const [profilePopupPosition, setProfilePopupPosition] = useState({ top: 60, right: 20 });
  const [isConvertMenuOpen, setIsConvertMenuOpen] = useState(false);
  const [is3DExportSubmenuOpen, setIs3DExportSubmenuOpen] = useState(false);
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isEditingDesignName, setIsEditingDesignName] = useState(false);
  const [editingDesignName, setEditingDesignName] = useState('');
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isFrameMergeModalOpen, setIsFrameMergeModalOpen] = useState(false);
  // UIStore에서 카메라 및 그래픽 설정 가져오기
  const { cameraMode, setCameraMode, shadowEnabled, setShadowEnabled, viewMode, setViewMode, view2DDirection, setView2DDirection, sunAngle, setSunAngle } = useUIStore();
  const { colors } = useThemeColors();
  const { theme, toggleMode } = useTheme();
  const profileButtonRef = useRef<HTMLDivElement>(null);
  const fileMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const convertMenuRef = useRef<HTMLDivElement>(null);
  const designNameInputRef = useRef<HTMLInputElement>(null);

  // 대시보드 이동 (해당 프로젝트 위치)
  const navigateToDashboard = () => {
    if (projectId) {
      navigate(`/dashboard?projectId=${projectId}`);
    } else {
      navigate('/dashboard');
    }
  };

  // 프로젝트명(경로) 클릭 → 자동저장 후 대시보드 이동 (해당 프로젝트 선택)
  const handleNavigateToDashboard = async () => {
    try {
      await onSave();
    } catch (e) {
      console.error('자동저장 실패:', e);
    }
    navigateToDashboard();
  };

  // 로고 클릭 → 나가기 확인 모달 표시
  const handleLogoClick = () => {
    setIsExitModalOpen(true);
  };

  // CNC 옵티마이저로 이동
  const navigateToCncOptimizer = () => {
    const currentState = {
      projectId,
      designFileId,
      basicInfo: useProjectStore.getState().basicInfo,
      spaceInfo: useSpaceConfigStore.getState().spaceInfo,
      placedModules: useFurnitureStore.getState().placedModules,
      timestamp: Date.now()
    };
    sessionStorage.setItem('configurator_state_backup', JSON.stringify(currentState));
    console.log('💾 Configurator 상태 백업 완료');

    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (designFileId) params.set('designFileId', designFileId);
    if (projectName) params.set('projectName', encodeURIComponent(projectName));
    if (designFileName) params.set('designFileName', encodeURIComponent(designFileName));
    const queryString = params.toString();

    console.log('🔗 CNC Optimizer로 전달하는 파라미터:', {
      projectId, designFileId, projectName, designFileName, queryString
    });

    navigate(`/cnc-optimizer${queryString ? `?${queryString}` : ''}`, {
      state: { fromConfigurator: true }
    });
  };

  // 저장하고 나가기
  const handleSaveAndExit = async () => {
    setIsExitModalOpen(false);
    try {
      await onSave();
    } catch (e) {
      console.error('저장 실패:', e);
    }
    navigateToDashboard();
  };

  // 저장하지 않고 나가기
  const handleExitWithoutSave = () => {
    setIsExitModalOpen(false);
    navigateToDashboard();
  };

  // HistoryStore에서 undo/redo 기능 가져오기
  const { canUndo, canRedo, undo, redo } = useHistoryStore();
  const setSpaceInfo = useSpaceConfigStore(state => state.setSpaceInfo);
  const setPlacedModules = useFurnitureStore(state => state.setPlacedModules);
  const setBasicInfo = useProjectStore(state => state.setBasicInfo);

  // 디버깅용 로그
  console.log('🔍 Header 컴포넌트 title:', title);
  console.log('🔍 Header 컴포넌트 projectName:', projectName);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (fileMenuTimeoutRef.current) {
        clearTimeout(fileMenuTimeoutRef.current);
      }
    };
  }, []);


  // 설정 패널 열기 이벤트 리스너
  useEffect(() => {
    const handleOpenSettings = () => {
      setIsSettingsPanelOpen(true);
    };

    window.addEventListener('openSettingsPanel', handleOpenSettings);

    return () => {
      window.removeEventListener('openSettingsPanel', handleOpenSettings);
    };
  }, []);

  const handleHelpClick = () => {
    setIsHelpModalOpen(true);
  };

  const handleHelpClose = () => {
    setIsHelpModalOpen(false);
  };

  // 디자인명 편집 시작
  const handleDesignNameClick = () => {
    // 읽기 전용 모드에서는 편집 불가
    if (readOnly) {
      console.log('🚫 읽기 전용 모드 - 디자인명 편집 차단');
      return;
    }
    if (!designFileName || !onDesignFileNameChange) return;
    setEditingDesignName(designFileName);
    setIsEditingDesignName(true);
    // input이 렌더링된 후 포커스
    setTimeout(() => {
      designNameInputRef.current?.focus();
      designNameInputRef.current?.select();
    }, 0);
  };

  // 디자인명 편집 저장
  const handleDesignNameSave = () => {
    const newName = editingDesignName.trim();

    console.log('💾 디자인명 저장 시도:', {
      newName,
      designFileName,
      isChanged: newName !== designFileName,
      hasCallback: !!onDesignFileNameChange
    });

    // 이름이 변경되지 않았으면 그냥 닫기
    if (!newName || newName === designFileName) {
      console.log('⏭️ 이름이 변경되지 않아서 편집 모드 종료');
      setIsEditingDesignName(false);
      return;
    }

    // 변경되었으면 확인 팝업 표시
    if (onDesignFileNameChange) {
      const confirmed = confirm(`디자인 파일명을 "${newName}"(으)로 바꾸시겠습니까?`);
      console.log('❓ 확인 팝업 결과:', confirmed);
      if (confirmed) {
        console.log('✅ 디자인파일명 변경 콜백 호출:', newName);
        onDesignFileNameChange(newName);
      } else {
        console.log('❌ 사용자가 취소 - 원래 이름으로 복원');
        // 취소하면 원래 이름으로 복원
        setEditingDesignName(designFileName || '');
      }
    }
    setIsEditingDesignName(false);
  };

  // 디자인명 편집 취소
  const handleDesignNameCancel = () => {
    setIsEditingDesignName(false);
    setEditingDesignName('');
  };

  // 디자인명 입력 키 핸들러
  const handleDesignNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleDesignNameSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDesignNameCancel();
    }
  };

  const handleFileMenuToggle = () => {
    console.log('📁 파일 메뉴 토글:', !isFileMenuOpen);
    // 타이머가 있으면 취소
    if (fileMenuTimeoutRef.current) {
      clearTimeout(fileMenuTimeoutRef.current);
      fileMenuTimeoutRef.current = null;
    }
    setIsFileMenuOpen(!isFileMenuOpen);
  };

  const handleFileMenuMouseEnter = () => {
    // 마우스가 들어오면 타이머 취소
    if (fileMenuTimeoutRef.current) {
      clearTimeout(fileMenuTimeoutRef.current);
      fileMenuTimeoutRef.current = null;
    }
  };

  const handleFileMenuMouseLeave = () => {
    // 마우스가 나가면 300ms 후에 메뉴 닫기
    fileMenuTimeoutRef.current = setTimeout(() => {
      setIsFileMenuOpen(false);
    }, 300);
  };

  // Undo 핸들러
  const handleUndo = () => {
    const previousState = undo();
    if (previousState) {
      setSpaceInfo(previousState.spaceInfo);
      setPlacedModules(previousState.placedModules);
      setBasicInfo(previousState.basicInfo);
    }
  };

  // Redo 핸들러
  const handleRedo = () => {
    const nextState = redo();
    if (nextState) {
      setSpaceInfo(nextState.spaceInfo);
      setPlacedModules(nextState.placedModules);
      setBasicInfo(nextState.basicInfo);
    }
  };

  const handleNewProject = () => {
    console.log('🆕 Header - 새디자인 버튼 클릭됨');
    console.log('🆕 Header - onNewProject 타입:', typeof onNewProject);
    setIsFileMenuOpen(false);
    onNewProject?.();
  };

  const handleSaveAs = () => {
    setIsFileMenuOpen(false);
    onSaveAs?.();
  };


  // 프로필 클릭 핸들러
  const handleProfileClick = () => {
    if (profileButtonRef.current) {
      const rect = profileButtonRef.current.getBoundingClientRect();
      setProfilePopupPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    }
    setIsProfilePopupOpen(!isProfilePopupOpen);
  };

  // 컨버팅 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (convertMenuRef.current && !convertMenuRef.current.contains(event.target as Node)) {
        setIsConvertMenuOpen(false);
      }
    };

    if (isConvertMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isConvertMenuOpen]);


  return (
    <header className={styles.header}>
      <div className={styles.container}>
        {/* 로고 영역 — 고정 너비, 애니메이션 격리 */}
        <div className={styles.logo}>
          <Logo size="medium" onClick={handleLogoClick} noAnimation />
        </div>

        {/* 파일 메뉴 + 저장 버튼 */}
        {!isMobile && !readOnly && (
          <div className={styles.fileActionGroup}>
            <div
              className={styles.fileMenuContainer}
              onMouseEnter={handleFileMenuMouseEnter}
              onMouseLeave={handleFileMenuMouseLeave}
            >
              <button
                className={styles.actionButton}
                onClick={handleFileMenuToggle}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" />
                  <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" />
                  <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" />
                  <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" />
                  <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2" />
                </svg>
                {t('common.file')}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '4px' }}>
                  <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>

              {isFileMenuOpen && (
                <div className={styles.fileDropdown}>
                  <button
                    className={styles.dropdownItem}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('🆕 Header - 새디자인 버튼 직접 클릭됨');
                      handleNewProject();
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" />
                      <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" />
                      <line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="2" />
                      <line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    {currentLanguage === 'ko' ? '새 디자인' : t('project.newProject')}
                  </button>
                  <div
                    className={styles.dropdownItemWithSubmenu}
                    style={{ display: user?.email === 'sbbc212@gmail.com' ? undefined : 'none' }}
                    onMouseEnter={() => {
                      if (submenuTimeoutRef.current) {
                        clearTimeout(submenuTimeoutRef.current);
                        submenuTimeoutRef.current = null;
                      }
                      setIs3DExportSubmenuOpen(true);
                    }}
                    onMouseLeave={() => {
                      submenuTimeoutRef.current = setTimeout(() => {
                        setIs3DExportSubmenuOpen(false);
                      }, 150);
                    }}
                  >
                    <button
                      className={styles.dropdownItem}
                      disabled={!onExport3D}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      3D 모델 다운로드
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}>
                        <polyline points="9 6 15 12 9 18" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </button>
                    {is3DExportSubmenuOpen && (
                      <div className={styles.submenu}>
                        <button
                          className={styles.submenuItem}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('📦 Header - GLB로 다운로드 버튼 클릭됨');
                            setIsFileMenuOpen(false);
                            setIs3DExportSubmenuOpen(false);
                            onExport3D?.('glb');
                          }}
                        >
                          GLB 파일 (.glb)
                        </button>
                        <button
                          className={styles.submenuItem}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('📦 Header - OBJ로 다운로드 버튼 클릭됨');
                            setIsFileMenuOpen(false);
                            setIs3DExportSubmenuOpen(false);
                            onExport3D?.('obj');
                          }}
                        >
                          OBJ 파일 (.obj)
                        </button>
                        <button
                          className={styles.submenuItem}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('📦 Header - STL로 다운로드 버튼 클릭됨');
                            setIsFileMenuOpen(false);
                            setIs3DExportSubmenuOpen(false);
                            onExport3D?.('stl');
                          }}
                        >
                          STL 파일 (.stl)
                        </button>
                        <button
                          className={styles.submenuItem}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('📦 Header - DAE로 다운로드 버튼 클릭됨');
                            setIsFileMenuOpen(false);
                            setIs3DExportSubmenuOpen(false);
                            onExport3D?.('dae');
                          }}
                        >
                          DAE 파일 (.dae)
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    className={styles.dropdownItem}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('💾 Header - 다른이름으로 저장 버튼 클릭됨');
                      handleSaveAs();
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2" />
                      <polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" strokeWidth="2" />
                      <polyline points="7,3 7,8 15,8" stroke="currentColor" strokeWidth="2" />
                      <path d="M7 16h2v2H7z" stroke="currentColor" strokeWidth="1" />
                    </svg>
                    {t('project.saveAs')}
                  </button>
                </div>
              )}
            </div>

            <button
              className={styles.actionButton}
              onClick={() => {
                console.log('💾💾💾 [Header] 저장 버튼 클릭됨!');
                if (onSave) {
                  onSave();
                }
              }}
              disabled={saving}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2" />
                <polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" strokeWidth="2" />
                <polyline points="7,3 7,8 15,8" stroke="currentColor" strokeWidth="2" />
              </svg>
              {saving ? t('common.saving') : t('common.save')}
            </button>

            {/* 저장하고 나가기 버튼 */}
            {!readOnly && (
              <button
                className={styles.exitButton}
                onClick={() => setIsExitModalOpen(true)}
                title="저장하고 나가기"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                저장하고 나가기
              </button>
            )}
          </div>
        )}

        {/* 중앙: 프로젝트명 › 디자인명 - 모바일에서는 숨김 */}
        {!isMobile && (
          <div className={styles.centerActions}>
            <div className={styles.designFileName}>
              {projectName && designFileName ? (
                <>
                  <RxDashboard size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                  <span
                    style={{ cursor: 'pointer' }}
                    onClick={handleNavigateToDashboard}
                    title="대시보드로 이동 (자동저장)"
                  >
                    {projectName}
                  </span>
                  {folderName && (
                    <>
                      {' '}<span className={styles.separator}>›</span>{' '}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6, flexShrink: 0 }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      <span style={{ opacity: 0.8 }}>{folderName}</span>
                    </>
                  )}
                  {' '}<span className={styles.separator}>›</span>{' '}
                  <FileText size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                  {isEditingDesignName ? (
                    <input
                      ref={designNameInputRef}
                      type="text"
                      value={editingDesignName}
                      onChange={(e) => setEditingDesignName(e.target.value)}
                      onKeyDown={handleDesignNameKeyDown}
                      onBlur={handleDesignNameSave}
                      className={styles.designNameInput}
                      style={{
                        color: 'var(--theme-primary)',
                        background: 'transparent',
                        border: '1px solid var(--theme-primary)',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: 'inherit',
                        fontFamily: 'inherit',
                        outline: 'none',
                        minWidth: '100px'
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        color: 'var(--theme-primary)',
                        cursor: (onDesignFileNameChange && !readOnly) ? 'pointer' : 'default',
                        textDecoration: (onDesignFileNameChange && !readOnly) ? 'underline' : 'none',
                        textDecorationStyle: 'dotted',
                        textUnderlineOffset: '3px'
                      }}
                      onClick={handleDesignNameClick}
                      title={(onDesignFileNameChange && !readOnly) ? '클릭하여 디자인명 변경' : undefined}
                    >
                      {designFileName}
                    </span>
                  )}
                </>
              ) : projectName ? (
                <>
                  <RxDashboard size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                  <span
                    style={{ cursor: 'pointer' }}
                    onClick={handleNavigateToDashboard}
                    title="대시보드로 이동 (자동저장)"
                  >
                    {projectName}
                  </span>
                </>
              ) : designFileName ? (
                <>
                  <FileText size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                  {isEditingDesignName ? (
                    <input
                      ref={designNameInputRef}
                      type="text"
                      value={editingDesignName}
                      onChange={(e) => setEditingDesignName(e.target.value)}
                      onKeyDown={handleDesignNameKeyDown}
                      onBlur={handleDesignNameSave}
                      className={styles.designNameInput}
                      style={{
                        color: 'var(--theme-primary)',
                        background: 'transparent',
                        border: '1px solid var(--theme-primary)',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: 'inherit',
                        fontFamily: 'inherit',
                        outline: 'none',
                        minWidth: '100px'
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        color: 'var(--theme-primary)',
                        cursor: (onDesignFileNameChange && !readOnly) ? 'pointer' : 'default',
                        textDecoration: (onDesignFileNameChange && !readOnly) ? 'underline' : 'none',
                        textDecorationStyle: 'dotted',
                        textUnderlineOffset: '3px'
                      }}
                      onClick={handleDesignNameClick}
                      title={(onDesignFileNameChange && !readOnly) ? '클릭하여 디자인명 변경' : undefined}
                    >
                      {designFileName}
                    </span>
                  )}
                </>
              ) : (
                '새로운 디자인'
              )}
            </div>

            {/* 읽기 전용 모드 표시 */}
            {readOnly && (
              <div style={{
                padding: '6px 12px',
                backgroundColor: `${colors.primary}15`,
                border: `1px solid ${colors.primary}40`,
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: '500',
                color: colors.primary
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" />
                </svg>
                읽기 전용
              </div>
            )}

            {onNext && (
              <button className={styles.actionButton} onClick={onNext}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
                {t('common.finish')}
              </button>
            )}
          </div>
        )}

        {/* 우측 액션 버튼들 */}
        <div className={styles.rightActions}>
          {/* 모바일용 저장 버튼 */}
          {isMobile && !readOnly && (
            <button
              className={styles.actionButton}
              onClick={() => {
                if (onSave) onSave();
              }}
              disabled={saving}
              style={{ marginRight: '8px' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2" />
                <polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" strokeWidth="2" />
                <polyline points="7,3 7,8 15,8" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          )}

          {/* 다크/라이트 모드 토글 — 모바일 숨김 */}
          {!isMobile && (
            <button
              className={styles.settingsButton}
              onClick={toggleMode}
              title={theme.mode === 'dark' ? '라이트 모드' : '다크 모드'}
            >
              {theme.mode === 'dark' ? <Moon size={18} strokeWidth={1.8} /> : <Sun size={18} strokeWidth={1.8} />}
            </button>
          )}

          {/* 조작법 버튼 - 컨버팅 옆 */}
          {!isMobile && (
            <button className={styles.actionButton} onClick={handleHelpClick}>
              <FaRegKeyboard size={20} />
              {t('help.title')}
            </button>
          )}

          {/* CNC 옵티마이저 버튼 - 읽기 전용/모바일에서는 숨김 */}
          {!readOnly && !isMobile && (
            <div className={styles.convertButtonContainer} ref={convertMenuRef}>
              <button
                className={styles.convertButton}
                onClick={() => {
                  setIsConvertMenuOpen(!isConvertMenuOpen);
                }}
              >
                <SiConvertio size={20} />
                {t('common.converting')}
                <ChevronDown size={16} style={{ marginLeft: '4px' }} />
              </button>

              {isConvertMenuOpen && (
                <div className={styles.dropdownMenu}>
                  <button
                    className={styles.dropdownItem}
                    onClick={() => {
                      console.log('CNC 옵티마이저 버튼 클릭됨');

                      const currentSpaceInfo = useSpaceConfigStore.getState().spaceInfo;
                      const isFrameMerged = currentSpaceInfo.frameMergeEnabled ?? false;

                      // 슬롯 배치 가구 2개 이상일 때 자동 병합 처리 (팝업 없음)
                      // computeFrameMergeGroups가 높이/너비 기준으로 병합 가능한 것만 묶으므로
                      // 단순히 frameMergeEnabled = true로 설정하면 동일 높이/사이즈만 자동 병합됨
                      const slotModules = useFurnitureStore.getState().placedModules
                        .filter(m => !m.isFreePlacement);
                      if (!isFrameMerged && slotModules.length >= 2) {
                        useSpaceConfigStore.getState().setSpaceInfo({ frameMergeEnabled: true });
                      }

                      navigateToCncOptimizer();
                      setIsConvertMenuOpen(false);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
                      <rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="2" />
                      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="2" />
                      <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    {t('export.cuttingOptimizer')}
                  </button>

                  {onExportPDF && (
                    <button
                      className={styles.dropdownItem}
                      onClick={() => {
                        console.log('내보내기 버튼 클릭됨');
                        onExportPDF();
                        setIsConvertMenuOpen(false);
                      }}
                    >
                      <TbTableExport size={16} style={{ marginRight: '8px' }} />
                      {t('export.title')}
                    </button>
                  )}


                </div>
              )}
            </div>
          )}

          {/* 모바일 메뉴 토글 버튼 (모바일 전용) */}
          {!readOnly && (
            <button
              className={styles.mobileMenuButton}
              onClick={onMobileMenuToggle}
              title="메뉴"
            >
              <Settings size={20} />
            </button>
          )}

          {/* onProfile이 있을 때만 프로필 영역 표시 (readonly 모드에서는 숨김) */}
          {onProfile && (
            <>
              {user ? (
                <div className={styles.desktopProfile}>
                  {/* 프로필 */}
                  <div
                    ref={profileButtonRef}
                    className={styles.userProfile}
                    onClick={handleProfileClick}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className={styles.userProfileAvatar}>
                      {user?.photoURL && !imageError ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || user.email || '사용자'}
                          className={styles.profileImage}
                          onError={() => setImageError(true)}
                          onLoad={() => setImageError(false)}
                        />
                      ) : (
                        <User size={16} />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  className={styles.loginButton}
                  onClick={() => navigate('/login')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="2" />
                    <polyline points="10 17 15 12 10 7" stroke="currentColor" strokeWidth="2" />
                    <line x1="15" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  {currentLanguage === 'ko' ? '로그인' : t('common.login')}
                </button>
              )}
            </>
          )}

          {/* 태양 위치 슬라이더 (3D 모드에서만 표시) */}
          {viewMode === '3D' && !isMobile && (
            <div className={`${styles.sunSliderWrap} ${!shadowEnabled ? styles.sunSliderOff : ''}`}>
              <button
                className={`${styles.sunToggle} ${!shadowEnabled ? styles.sunToggleOff : ''}`}
                onClick={() => setShadowEnabled(!shadowEnabled)}
                title={shadowEnabled ? '그림자 끄기' : '그림자 켜기'}
              >
                <FiSunset size={15} />
              </button>
              <input
                type="range"
                min="0"
                max="360"
                value={sunAngle ?? 45}
                onChange={(e) => setSunAngle(Number(e.target.value))}
                className={styles.sunSlider}
                disabled={!shadowEnabled}
                title={shadowEnabled ? `태양 각도: ${sunAngle ?? 45}°` : '그림자 꺼짐'}
              />
            </div>
          )}

          {/* 설정 버튼 */}
          <button
            className={styles.settingsButton}
            onClick={() => window.dispatchEvent(new CustomEvent('openSettingsPanel'))}
            title="설정"
          >
            <Settings size={18} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* 모바일 서브헤더 - 2D/3D, 뷰모드 & 그림자 토글 */}
      {isMobile && (
        <div className={styles.mobileSubHeader}>
          {/* 2D/3D 토글 */}
          <div className={styles.mobileViewModeToggle}>
            <button
              className={`${styles.viewModeButton} ${viewMode === '2D' ? styles.active : ''}`}
              onClick={() => setViewMode('2D')}
            >
              2D
            </button>
            <button
              className={`${styles.viewModeButton} ${viewMode === '3D' ? styles.active : ''}`}
              onClick={() => setViewMode('3D')}
            >
              3D
            </button>
          </div>

          {/* 2D 시점 선택 (2D에서만 표시) */}
          {viewMode === '2D' && (
            <div className={styles.mobileViewModeToggle}>
              <button
                className={`${styles.viewModeButton} ${view2DDirection === 'front' ? styles.active : ''}`}
                onClick={() => setView2DDirection('front')}
              >
                정면
              </button>
              <button
                className={`${styles.viewModeButton} ${view2DDirection === 'top' ? styles.active : ''}`}
                onClick={() => setView2DDirection('top')}
              >
                상부
              </button>
              <button
                className={`${styles.viewModeButton} ${view2DDirection === 'left' ? styles.active : ''}`}
                onClick={() => setView2DDirection('left')}
              >
                좌측
              </button>
              <button
                className={`${styles.viewModeButton} ${view2DDirection === 'right' ? styles.active : ''}`}
                onClick={() => setView2DDirection('right')}
              >
                우측
              </button>
            </div>
          )}

          {/* 배치 모드 토글 (모바일) */}
          {!readOnly && <MobileLayoutToggle />}

          {/* 도어 설치 토글 */}
          <div className={styles.mobileShadowToggle}>
            <span className={styles.shadowLabel}>{hasDoorsInstalled ? '도어제거' : '도어설치'}</span>
            <div
              onClick={onDoorInstallationToggle}
              className={`${styles.toggleSwitch} ${hasDoorsInstalled ? styles.active : ''}`}
            >
              <div className={styles.toggleKnob} />
            </div>
          </div>

          {/* 그림자 토글 (3D에서만 표시) */}
          {viewMode === '3D' && (
            <div className={styles.mobileShadowToggle}>
              <span className={styles.shadowLabel}>그림자</span>
              <div
                onClick={() => setShadowEnabled(!shadowEnabled)}
                className={`${styles.toggleSwitch} ${shadowEnabled ? styles.active : ''}`}
              >
                <div className={styles.toggleKnob} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 저장 에러 표시 (성공 알림은 생략) */}
      {saveStatus === 'error' && (
        <div className={styles.saveError}>
          ✕ {t('messages.saveFailed')}
        </div>
      )}

      {/* 조작법 모달 */}
      <HelpModal isOpen={isHelpModalOpen} onClose={handleHelpClose} />

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

      {/* 나가기 확인 모달 */}
      {isExitModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setIsExitModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--theme-surface, #fff)',
              borderRadius: '12px',
              padding: '24px',
              minWidth: '320px',
              maxWidth: '400px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--theme-border, #e5e7eb)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--theme-text, #111)',
            }}>
              에디터 나가기
            </h3>
            <p style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'var(--theme-text-secondary, #6b7280)',
              lineHeight: 1.5,
            }}>
              저장하지 않은 변경사항이 있을 수 있습니다.
            </p>
            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setIsExitModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--theme-border, #e5e7eb)',
                  background: 'transparent',
                  color: 'var(--theme-text-secondary, #6b7280)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={handleExitWithoutSave}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--theme-border, #e5e7eb)',
                  background: 'transparent',
                  color: 'var(--theme-text, #111)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                저장하지 않고 나가기
              </button>
              <button
                onClick={handleSaveAndExit}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--theme-primary, #667eea)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                저장하고 나가기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 프레임 병합 확인 모달 */}
      {isFrameMergeModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setIsFrameMergeModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--theme-surface, #fff)',
              borderRadius: '12px',
              padding: '24px',
              minWidth: '320px',
              maxWidth: '400px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--theme-border, #e5e7eb)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--theme-text, #111)',
            }}>
              프레임 병합
            </h3>
            <p style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'var(--theme-text-secondary, #6b7280)',
              lineHeight: 1.5,
            }}>
              분절된 상하부 프레임을 병합하여 내보내시겠습니까?
            </p>
            <div style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => {
                  setIsFrameMergeModalOpen(false);
                  navigateToCncOptimizer();
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--theme-border, #e5e7eb)',
                  background: 'transparent',
                  color: 'var(--theme-text-secondary, #6b7280)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                아니오
              </button>
              <button
                onClick={() => {
                  useSpaceConfigStore.getState().setSpaceInfo({ frameMergeEnabled: true });
                  setIsFrameMergeModalOpen(false);
                  navigateToCncOptimizer();
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--theme-primary, #667eea)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                네
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header; 