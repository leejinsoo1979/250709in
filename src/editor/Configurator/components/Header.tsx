import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Header.module.css';
import { Settings, Menu, User, ChevronDown, Undo, Redo } from 'lucide-react';
import { FaRegKeyboard } from 'react-icons/fa';
import { SiConvertio } from 'react-icons/si';
import { TbTableExport } from 'react-icons/tb';
import { HiViewfinderCircle } from "react-icons/hi2";
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
  // 읽기 전용 모드
  readOnly?: boolean; // viewer 권한용 읽기 전용 모드 (디자인명 수정 불가)
}

const Header: React.FC<HeaderProps> = ({
  title,
  projectName,
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
  readOnly = false
}) => {
  console.log('🎯 Header 컴포넌트 렌더링:', {
    title,
    projectName,
    designFileName,
    projectId,
    designFileId
  });

  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, currentLanguage } = useTranslation();

  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isProfilePopupOpen, setIsProfilePopupOpen] = useState(false);
  const [profilePopupPosition, setProfilePopupPosition] = useState({ top: 60, right: 20 });
  const [isConvertMenuOpen, setIsConvertMenuOpen] = useState(false);
  const [isCameraMenuOpen, setIsCameraMenuOpen] = useState(false);
  const [isEditingDesignName, setIsEditingDesignName] = useState(false);
  const [editingDesignName, setEditingDesignName] = useState('');
  // UIStore에서 카메라 및 그림자 설정 가져오기
  const { cameraMode, setCameraMode, shadowEnabled, setShadowEnabled } = useUIStore();
  const { colors } = useThemeColors();
  const { theme } = useTheme();
  const profileButtonRef = useRef<HTMLDivElement>(null);
  const fileMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const convertMenuRef = useRef<HTMLDivElement>(null);
  const cameraMenuRef = useRef<HTMLDivElement>(null);
  const designNameInputRef = useRef<HTMLInputElement>(null);
  
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


  // 프로젝트 이름 변경 핸들러
  const handleProjectNameClick = () => {
    const currentName = projectName || t('project.untitled');
    const newName = prompt(t('project.enterName'), currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      onProjectNameChange?.(newName.trim());
    }
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

  // 카메라 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(event.target as Node)) {
        setIsCameraMenuOpen(false);
      }
    };

    if (isCameraMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCameraMenuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        {/* 로고 영역 */}
        <div className={styles.logoSection}>
          {/* 햄버거 메뉴 버튼 - 읽기 전용 모드에서는 숨김 */}
          {!readOnly && (
            <button
              className={`${styles.hamburgerButton} ${isFileTreeOpen ? styles.active : ''}`}
              onClick={onFileTreeToggle}
              title="파일 트리 열기/닫기"
            >
              <Menu size={20} />
            </button>
          )}
          
          <div className={styles.logo}>
            <Logo size="medium" />
          </div>
          <div className={styles.projectInfo}>
            <div className={styles.designFileName}>
              {projectName && designFileName ? (
                <>
                  {projectName} <span className={styles.separator}>›</span>{' '}
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
                projectName
              ) : designFileName ? (
                <>
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
          </div>

          {/* 소유자와 협업자 섹션 */}
          {(owner || collaborators.length > 0) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              marginLeft: '20px'
            }}>
              {/* Project owner */}
              {owner && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'
                  }}>
                    Project owner
                  </span>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: theme.mode === 'dark' ? '#2a2a2a' : '#f0f0f0'
                  }}>
                    {owner.photoURL ? (
                      <img
                        src={owner.photoURL}
                        alt={owner.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <User size={18} color={colors.primary} />
                    )}
                  </div>
                </div>
              )}

              {/* Members */}
              {collaborators.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'
                  }}>
                    Members
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {collaborators.map((collab, index) => (
                      <div
                        key={`${collab.userId}-${index}`}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: theme.mode === 'dark' ? '#2a2a2a' : '#f0f0f0'
                        }}
                        title={collab.userName || collab.userEmail}
                      >
                        {collab.userPhotoURL ? (
                          <img
                            src={collab.userPhotoURL}
                            alt={collab.userName || collab.userEmail}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <User size={18} color={colors.primary} />
                        )}
                      </div>
                    ))}
                    {/* + 버튼 (나중에 협업자 추가 기능) */}
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      background: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                      fontSize: '20px',
                      fontWeight: '300',
                      color: theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.4)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = theme.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
                    }}
                    title="협업자 추가">
                      +
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 중앙 액션 버튼들 */}
        <div className={styles.centerActions}>
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
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2"/>
              </svg>
              읽기 전용
            </div>
          )}

          {/* 파일 드롭다운 메뉴 - 읽기 전용 모드에서는 숨김 */}
          {!readOnly && (
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
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                  <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"/>
                  <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2"/>
                  <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2"/>
                  <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2"/>
                </svg>
                {t('common.file')}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: '4px' }}>
                  <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2"/>
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
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"/>
                    <line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="2"/>
                    <line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  {currentLanguage === 'ko' ? '새 디자인' : t('project.newProject')}
                </button>
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
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="7,3 7,8 15,8" stroke="currentColor" strokeWidth="2"/>
                    <path d="M7 16h2v2H7z" stroke="currentColor" strokeWidth="1"/>
                  </svg>
                  {t('project.saveAs')}
                </button>
              </div>
            )}
            </div>
          )}

          {/* 저장 버튼 - 파일 메뉴 바로 옆으로 이동, 읽기 전용 모드에서는 숨김 */}
          {!readOnly && (
            <button
              className={styles.actionButton}
              onClick={() => {
                console.log('💾💾💾 [Header] 저장 버튼 클릭됨!');
                console.log('💾💾💾 [Header] onSave 함수 존재 여부:', !!onSave);
                console.log('💾💾💾 [Header] saving 상태:', saving);
                if (onSave) {
                  console.log('💾💾💾 [Header] onSave 함수 호출 중...');
                  onSave();
                } else {
                  console.error('💾💾💾 [Header] onSave 함수가 없습니다!');
                }
              }}
              disabled={saving}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" strokeWidth="2"/>
                <polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" strokeWidth="2"/>
                <polyline points="7,3 7,8 15,8" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          )}

          {/* Undo 버튼 - 읽기 전용 모드에서는 숨김 */}
          {!readOnly && (
            <button
              className={styles.actionButton}
              onClick={handleUndo}
              disabled={!canUndo()}
              title="실행 취소 (Ctrl+Z)"
            >
              <Undo size={20} />
            </button>
          )}

          {/* Redo 버튼 - 읽기 전용 모드에서는 숨김 */}
          {!readOnly && (
            <button
              className={styles.actionButton}
              onClick={handleRedo}
              disabled={!canRedo()}
              title="다시 실행 (Ctrl+Y)"
            >
              <Redo size={20} />
            </button>
          )}

          {onNext && (
            <button className={styles.actionButton} onClick={onNext}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
              {t('common.finish')}
            </button>
          )}

          {onHelp && (
            <button className={styles.actionButton} onClick={onHelp}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="m9,9a3,3 0 1 1 5.83,1c0,2-3,3-3,3" stroke="currentColor" strokeWidth="2"/>
                <circle cx="12" cy="17" r="1" fill="currentColor"/>
              </svg>
              {t('common.help')}
            </button>
          )}

          {/* 조작법 버튼 */}
          <button className={styles.actionButton} onClick={handleHelpClick}>
            <FaRegKeyboard size={20} />
            {t('help.title')}
          </button>

          {/* 카메라 설정 드롭다운 */}
          <div className={styles.dropdownContainer} ref={cameraMenuRef}>
            <button
              className={styles.actionButton}
              onClick={() => setIsCameraMenuOpen(!isCameraMenuOpen)}
            >
              <HiViewfinderCircle size={20} />
              뷰모드
              <ChevronDown size={16} style={{ marginLeft: '4px' }} />
            </button>
            
            {isCameraMenuOpen && (
              <div className={styles.dropdownMenu}>
                <button
                  className={`${styles.dropdownItem} ${cameraMode === 'perspective' ? styles.active : ''}`}
                  onClick={() => {
                    setCameraMode('perspective');
                    setIsCameraMenuOpen(false);
                  }}
                >
                  <div style={{ marginRight: '8px', display: 'flex', alignItems: 'center' }}>
                    <PerspectiveCubeIcon size={20} />
                  </div>
                  <span className={styles.checkmark}>
                    {cameraMode === 'perspective' && '✓'}
                  </span>
                  Perspective
                </button>
                <button
                  className={`${styles.dropdownItem} ${cameraMode === 'orthographic' ? styles.active : ''}`}
                  onClick={() => {
                    setCameraMode('orthographic');
                    setIsCameraMenuOpen(false);
                  }}
                >
                  <div style={{ marginRight: '8px', display: 'flex', alignItems: 'center' }}>
                    <OrthographicCubeIcon size={20} />
                  </div>
                  <span className={styles.checkmark}>
                    {cameraMode === 'orthographic' && '✓'}
                  </span>
                  Orthographic
                </button>
              </div>
            )}
          </div>

          {/* 그림자 토글 스위치 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--theme-text-secondary)' }}>그림자</span>
            <div
              onClick={() => setShadowEnabled(!shadowEnabled)}
              style={{
                position: 'relative',
                width: '36px',
                height: '20px',
                backgroundColor: shadowEnabled ? 'var(--theme-primary)' : (theme.mode === 'dark' ? 'rgba(128,128,128,0.3)' : 'rgba(200,200,200,0.5)'),
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'background-color 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                padding: '2px'
              }}
              title={shadowEnabled ? '그림자 끄기' : '그림자 켜기'}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  backgroundColor: theme.mode === 'dark' ? '#1a1a1a' : '#ffffff',
                  borderRadius: '50%',
                  transition: 'transform 0.3s ease, background-color 0.3s ease',
                  transform: shadowEnabled ? 'translateX(16px)' : 'translateX(0)',
                  boxShadow: theme.mode === 'dark' ? '0 2px 4px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.2)'
                }}
              />
            </div>
          </div>
        </div>

        {/* 우측 액션 버튼들 */}
        <div className={styles.rightActions}>
          {/* 내보내기 버튼 - 읽기 전용 모드에서는 숨김 */}
          {!readOnly && onExportPDF && (
            <button
              className={styles.convertButton}
              onClick={() => {
                console.log('내보내기 버튼 클릭됨');
                onExportPDF(); // PDF 핸들러가 실제로는 ConvertModal을 열어줌
              }}
            >
              <TbTableExport size={20} style={{ marginRight: '4px' }} />
              {t('export.title')}
            </button>
          )}

          {/* CNC 옵티마이저 버튼 - 읽기 전용 모드에서는 숨김 */}
          {!readOnly && (
            <div className={styles.convertButtonContainer} ref={convertMenuRef}>
              <button
                className={styles.convertButton}
                onClick={() => setIsConvertMenuOpen(!isConvertMenuOpen)}
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

                      // 현재 전체 상태를 sessionStorage에 저장
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

                      // 프로젝트 ID, 디자인 파일 ID, 프로젝트명, 디자인 파일명을 URL 파라미터로 전달
                      const params = new URLSearchParams();
                      if (projectId) params.set('projectId', projectId);
                      if (designFileId) params.set('designFileId', designFileId);
                      if (projectName) params.set('projectName', encodeURIComponent(projectName));
                      if (designFileName) params.set('designFileName', encodeURIComponent(designFileName));
                      const queryString = params.toString();

                      console.log('🔗 CNC Optimizer로 전달하는 파라미터:', {
                        projectId,
                        designFileId,
                        projectName,
                        designFileName,
                        queryString
                      });

                      // state로 현재 페이지 정보 전달
                      navigate(`/cnc-optimizer${queryString ? `?${queryString}` : ''}`, {
                        state: { fromConfigurator: true }
                      });
                      setIsConvertMenuOpen(false);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
                      <rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="2"/>
                      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="2"/>
                      <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    {t('export.cuttingOptimizer')}
                  </button>

                  {onConvert && (
                    <button
                      className={styles.dropdownItem}
                      onClick={() => {
                        onConvert();
                        setIsConvertMenuOpen(false);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
                        <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
                        <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
                        <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
                        <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      {t('export.drawingEditor')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {user ? (
            <>
              {onLogout && (
                <button className={styles.logoutButton} onClick={onLogout}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2"/>
                    <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="2"/>
                    <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  {currentLanguage === 'ko' ? '로그아웃' : t('common.logout')}
                </button>
              )}

              {/* 프로필은 항상 표시 - onProfile이 없어도 표시 */}
              <div 
                ref={profileButtonRef}
                className={styles.userProfile} 
                onClick={onProfile ? handleProfileClick : undefined}
                style={{ cursor: onProfile ? 'pointer' : 'default' }}
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
                <span className={styles.userProfileName}>
                  {user?.displayName || user?.email?.split('@')[0] || '사용자'}
                </span>
              </div>
            </>
          ) : (
            <button 
              className={styles.loginButton} 
              onClick={() => navigate('/login')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="2"/>
                <polyline points="10 17 15 12 10 7" stroke="currentColor" strokeWidth="2"/>
                <line x1="15" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {currentLanguage === 'ko' ? '로그인' : t('common.login')}
            </button>
          )}
        </div>
      </div>

      {/* 저장 상태 표시 */}
      {saveStatus === 'success' && (
        <div className={styles.saveSuccess}>
          ✓ {t('messages.saveSuccess')}
        </div>
      )}
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
    </header>
  );
};

export default Header; 