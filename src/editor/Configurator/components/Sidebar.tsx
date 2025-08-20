import React from 'react';
import styles from './Sidebar.module.css';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/contexts/ThemeContext';
import { PaletteIcon, StructureIcon } from '@/components/common/Icons';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

export type SidebarTab = 'module' | 'material' | 'structure' | 'etc';

interface SidebarProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
  isOpen: boolean;
  onToggle: () => void; // 폴딩 버튼 핸들러 추가
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabClick,
  isOpen,
  onToggle
}) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { t, currentLanguage } = useTranslation();
  
  // Store hooks for checking unsaved changes
  const projectStore = useProjectStore();
  const spaceConfigStore = useSpaceConfigStore();
  const furnitureStore = useFurnitureStore();
  
  // Track initial state
  const [initialState, setInitialState] = useState<any>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  // Save initial state when component mounts
  useEffect(() => {
    const state = {
      project: {
        basicInfo: projectStore.basicInfo,
        updatedAt: projectStore.updatedAt
      },
      spaceConfig: {
        spaceInfo: spaceConfigStore.spaceInfo,
        materialConfig: spaceConfigStore.materialConfig,
        columns: spaceConfigStore.columns
      },
      furniture: {
        placedModules: furnitureStore.placedModules
      }
    };
    setInitialState(JSON.parse(JSON.stringify(state)));
  }, []);
  
  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (!initialState) return false;
    
    const currentState = {
      project: {
        basicInfo: projectStore.basicInfo,
        updatedAt: projectStore.updatedAt
      },
      spaceConfig: {
        spaceInfo: spaceConfigStore.spaceInfo,
        materialConfig: spaceConfigStore.materialConfig,
        columns: spaceConfigStore.columns
      },
      furniture: {
        placedModules: furnitureStore.placedModules
      }
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
  
  // 테마 색상 맵
  const themeColorMap = {
    green: '#10b981',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    vivid: '#a25378',
    red: '#D2042D',
    pink: '#ec4899',
    indigo: '#6366f1',
    teal: '#14b8a6',
    yellow: '#eab308',
    gray: '#6b7280',
    cyan: '#06b6d4',
    lime: '#84cc16',
    black: '#1a1a1a',
    wine: '#845EC2',
    gold: '#d97706',
    navy: '#1e3a8a',
    emerald: '#059669',
    violet: '#C128D7',
    mint: '#0CBA80',
    neon: '#18CF23',
    rust: '#FF7438',
    white: '#D65DB1',
    plum: '#790963',
    brown: '#5A2B1D',
    darkgray: '#2C3844',
    maroon: '#3F0D0D',
    turquoise: '#003A7A',
    slate: '#2E3A47',
    copper: '#AD4F34',
    forest: '#1B3924',
    olive: '#4C462C'
  };
  
  const themeColor = themeColorMap[theme.color] || '#10b981';
  
  const tabs = [
    {
      id: 'module' as SidebarTab,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
          <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
          <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
          <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ),
      label: t('sidebar.module')
    },

    {
      id: 'material' as SidebarTab,
      icon: <PaletteIcon size={20} />,
      label: t('sidebar.material')
    },
    {
      id: 'structure' as SidebarTab,
      icon: <StructureIcon size={20} />,
      label: t('sidebar.structure')
    },
    {
      id: 'etc' as SidebarTab,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="12" r="1" stroke="currentColor" strokeWidth="2"/>
          <circle cx="12" cy="12" r="1" stroke="currentColor" strokeWidth="2"/>
          <circle cx="19" cy="12" r="1" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ),
      label: t('sidebar.etc')
    }
  ];

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      {/* 탭 리스트 */}
      <div className={styles.tabList}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => onTabClick(tab.id)}
            title={tab.label}
          >
                        {tab.icon && <div className={styles.tabIcon}>{tab.icon}</div>}
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 하단 나가기 버튼 */}
      <div className={styles.userSection}>
        <button 
          className={styles.settingsButton} 
          title={t('sidebar.exitToDashboard')}
          onClick={handleExitClick}
        >
          <LogOut size={24} style={{ transform: 'scaleX(-1)' }} color={themeColor} />
        </button>
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
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                className={styles.modalButtonCancel}
                onClick={() => setShowExitConfirm(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                className={styles.modalButtonConfirm}
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