import React from 'react';
import styles from './Sidebar.module.css';
import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/contexts/ThemeContext';
import { HiOutlineColorSwatch } from 'react-icons/hi';
import { HiPencilSquare } from 'react-icons/hi2';
import { TbBoxAlignRight, TbBrandAsana, TbUpload } from 'react-icons/tb';
import { PiShareNetworkLight } from "react-icons/pi";
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

export type SidebarTab = 'module' | 'material' | 'structure' | 'etc' | 'custom' | 'upload';

interface SidebarProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
  isOpen: boolean;
  onToggle: () => void;
  onResetUnsavedChanges?: React.MutableRefObject<(() => void) | null>;
  onSave?: () => Promise<void>;
  readOnly?: boolean;
  onShare?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabClick,
  isOpen,
  onToggle,
  onResetUnsavedChanges,
  onSave,
  readOnly = false,
  onShare
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
      id: 'custom' as SidebarTab,
      icon: <HiPencilSquare size={22} />,
      label: '커스텀'
    },
    {
      id: 'upload' as SidebarTab,
      icon: <TbUpload size={22} />,
      label: '업로드'
    }
  ];

  const tabs = readOnly ? allTabs.filter(tab => tab.id === 'material') : allTabs;

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
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
        <button
          className={styles.actionButton}
          onClick={() => onShare?.()}
          data-tooltip={readOnly ? "읽기 전용 링크 복사" : "공유하기"}
        >
          <PiShareNetworkLight size={17} />
        </button>

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
