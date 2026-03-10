import React from 'react';
import styles from './Sidebar.module.css';
import { LogOut, Menu, Settings, User } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/contexts/ThemeContext';
import { HiOutlineColorSwatch } from 'react-icons/hi';
import { TbBoxAlignRight, TbBrandAsana } from 'react-icons/tb';
import { MdOutlineDashboardCustomize } from 'react-icons/md';
import { PiCrownDuotone } from "react-icons/pi";
import { GoPersonAdd } from "react-icons/go";
import { ProjectCollaborator } from '@/firebase/shareLinks';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

export type SidebarTab = 'module' | 'material' | 'structure' | 'etc' | 'upload' | 'myCabinet';

interface SidebarProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
  isOpen: boolean;
  onToggle: () => void;
  onResetUnsavedChanges?: React.MutableRefObject<(() => void) | null>;
  onSave?: () => Promise<void>;
  readOnly?: boolean;
  owner?: { userId: string; name: string; photoURL?: string } | null;
  collaborators?: ProjectCollaborator[];
  onAddCollaborator?: () => void;
  onFileTreeToggle?: () => void;
  isFileTreeOpen?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabClick,
  isOpen,
  onToggle,
  onResetUnsavedChanges,
  onSave,
  readOnly = false,
  owner,
  collaborators = [],
  onAddCollaborator,
  onFileTreeToggle,
  isFileTreeOpen,
}) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { t, currentLanguage } = useTranslation();

  const projectStore = useProjectStore();
  const spaceConfigStore = useSpaceConfigStore();
  const furnitureStore = useFurnitureStore();

  const [initialState, setInitialState] = useState<any>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const saveCurrentStateAsInitial = useCallback(() => {
    const currentProject = useProjectStore.getState();
    const currentSpaceConfig = useSpaceConfigStore.getState();
    const currentFurniture = useFurnitureStore.getState();

    const state = {
      project: {
        basicInfo: currentProject.basicInfo
      },
      spaceConfig: {
        spaceInfo: currentSpaceConfig.spaceInfo,
        materialConfig: currentSpaceConfig.materialConfig,
        columns: currentSpaceConfig.columns
      },
      furniture: {
        placedModules: currentFurniture.placedModules
      }
    };
    setInitialState(JSON.parse(JSON.stringify(state)));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveCurrentStateAsInitial();
    }, 500);
    return () => clearTimeout(timer);
  }, [saveCurrentStateAsInitial]);

  useEffect(() => {
    if (onResetUnsavedChanges && onResetUnsavedChanges.current !== undefined) {
      onResetUnsavedChanges.current = saveCurrentStateAsInitial;
    }
  }, [onResetUnsavedChanges]);

  const hasUnsavedChanges = () => {
    if (!initialState) return false;
    const currentProject = useProjectStore.getState();
    const currentSpaceConfig = useSpaceConfigStore.getState();
    const currentFurniture = useFurnitureStore.getState();

    const currentState = {
      project: { basicInfo: currentProject.basicInfo },
      spaceConfig: {
        spaceInfo: currentSpaceConfig.spaceInfo,
        materialConfig: currentSpaceConfig.materialConfig,
        columns: currentSpaceConfig.columns
      },
      furniture: { placedModules: currentFurniture.placedModules }
    };

    return JSON.stringify(initialState) !== JSON.stringify(currentState);
  };

  const handleExitClick = () => {
    if (hasUnsavedChanges()) {
      setShowExitConfirm(true);
    } else {
      navigate('/dashboard');
    }
  };

  const allTabs = [
    {
      id: 'module' as SidebarTab,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        </svg>
      ),
      label: t('sidebar.module')
    },
    {
      id: 'material' as SidebarTab,
      icon: <HiOutlineColorSwatch size={22} />,
      label: t('sidebar.material')
    },
    {
      id: 'structure' as SidebarTab,
      icon: <TbBoxAlignRight size={22} />,
      label: '기둥'
    },
    {
      id: 'etc' as SidebarTab,
      icon: <TbBrandAsana size={22} />,
      label: t('sidebar.etc')
    },
    {
      id: 'myCabinet' as SidebarTab,
      icon: <MdOutlineDashboardCustomize size={22} />,
      label: '커스텀'
    }
  ];

  const tabs = readOnly ? allTabs.filter(tab => tab.id === 'material') : allTabs;

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      {/* 햄버거 메뉴 버튼 */}
      {!readOnly && onFileTreeToggle && (
        <button
          className={`${styles.hamburgerButton} ${isFileTreeOpen ? styles.active : ''}`}
          onClick={onFileTreeToggle}
          title="파일 트리 열기/닫기"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Navigation tabs */}
      <nav className={styles.tabList}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => onTabClick(tab.id)}
            data-tooltip={tab.label}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom action buttons */}
      <div className={styles.actionGroup}>
        {/* 소유자/협업자 아바타 */}
        {owner && (
          <div
            className={styles.actionButton}
            data-tooltip={owner.name}
            style={{ position: 'relative' }}
          >
            <PiCrownDuotone size={10} style={{ position: 'absolute', top: 2, right: 2, color: '#facc15' }} />
            <div style={{
              width: 24, height: 24, borderRadius: '50%', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: theme.mode === 'dark' ? '#2a2a2a' : '#e5e5e5'
            }}>
              {owner.photoURL ? (
                <img src={owner.photoURL} alt={owner.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={14} />
              )}
            </div>
          </div>
        )}

        {collaborators.map((collab, i) => (
          <div
            key={`${collab.userId}-${i}`}
            className={styles.actionButton}
            data-tooltip={collab.userName || collab.userEmail}
          >
            <div style={{
              width: 24, height: 24, borderRadius: '50%', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: theme.mode === 'dark' ? '#2a2a2a' : '#e5e5e5'
            }}>
              {collab.photoURL ? (
                <img src={collab.photoURL} alt={collab.userName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={14} />
              )}
            </div>
          </div>
        ))}

        {!readOnly && user?.uid === owner?.userId && onAddCollaborator && (
          <button
            className={styles.actionButton}
            onClick={onAddCollaborator}
            data-tooltip="협업자 추가"
          >
            <GoPersonAdd size={17} />
          </button>
        )}

        <div style={{ borderTop: '1px solid var(--theme-border, rgba(255,255,255,0.1))', width: '60%', margin: '4px auto' }} />

        <button
          className={styles.actionButton}
          onClick={() => window.dispatchEvent(new CustomEvent('openSettingsPanel'))}
          data-tooltip="설정"
        >
          <Settings size={17} strokeWidth={1.8} />
        </button>

        {!readOnly && (
          <button
            className={styles.actionButton}
            onClick={handleExitClick}
            data-tooltip={t('sidebar.exitToDashboard')}
          >
            <LogOut size={17} strokeWidth={1.8} style={{ transform: 'scaleX(-1)' }} />
          </button>
        )}
      </div>

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className={styles.modalTitle}>
              {t('messages.unsavedChanges')}
            </h3>
            <p className={styles.modalDescription}>
              {t('messages.exitConfirm')}
              <br />
              {t('messages.loseChanges')}
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalButtonSecondary}
                onClick={async () => {
                  setShowExitConfirm(false);
                  if (onSave) {
                    try {
                      await onSave();
                    } catch (error) {
                      console.error('❌ 저장 실패:', error);
                      alert('저장에 실패했습니다. 다시 시도해주세요.');
                      return;
                    }
                  }
                  navigate('/dashboard');
                }}
              >
                {t('messages.exitWithSaving')}
              </button>
              <button
                className={styles.modalButtonDanger}
                onClick={() => {
                  setShowExitConfirm(false);
                  navigate('/dashboard');
                }}
              >
                {t('messages.exitWithoutSaving')}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
