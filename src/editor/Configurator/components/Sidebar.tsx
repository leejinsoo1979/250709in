import React from 'react';
import styles from './Sidebar.module.css';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PaletteIcon, StructureIcon } from '@/components/common/Icons';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useState, useEffect, useRef } from 'react';

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
  const navigate = useNavigate();
  
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
      label: '모듈'
    },

    {
      id: 'material' as SidebarTab,
      icon: <PaletteIcon size={20} />,
      label: '재질'
    },
    {
      id: 'structure' as SidebarTab,
      icon: <StructureIcon size={20} />,
      label: '구조물'
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
      label: '기타'
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
          title="대시보드로 나가기"
          onClick={handleExitClick}
        >
          <LogOut size={24} style={{ transform: 'scaleX(-1)' }} />
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
              저장하지 않은 변경사항이 있습니다
            </h3>
            <p className={styles.modalDescription}>
              변경사항을 저장하지 않고 나가시겠습니까?
              <br />
              저장하지 않은 내용은 잃어버리게 됩니다.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalButtonCancel}
                onClick={() => setShowExitConfirm(false)}
              >
                취소
              </button>
              <button
                className={styles.modalButtonConfirm}
                onClick={() => {
                  setShowExitConfirm(false);
                  navigate('/dashboard');
                }}
              >
                저장하지 않고 나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar; 