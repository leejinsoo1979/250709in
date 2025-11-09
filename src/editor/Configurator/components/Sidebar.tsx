import React from 'react';
import styles from './Sidebar.module.css';
import { LogOut, Settings, UserIcon } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/contexts/ThemeContext';
import { PaletteIcon, StructureIcon } from '@/components/common/Icons';
import { HiOutlineColorSwatch } from 'react-icons/hi';
import { TbBoxAlignRight, TbBrandAsana } from 'react-icons/tb';
import { PiShareNetworkLight } from "react-icons/pi";
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

export type SidebarTab = 'module' | 'material' | 'structure' | 'etc';

interface SidebarProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
  isOpen: boolean;
  onToggle: () => void; // 폴딩 버튼 핸들러 추가
  onResetUnsavedChanges?: React.MutableRefObject<(() => void) | null>; // 저장 완료 후 상태 리셋을 위한 ref
  onSave?: () => Promise<void>; // 저장 함수 추가
  readOnly?: boolean; // 읽기 전용 모드 (viewer 권한)
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabClick,
  isOpen,
  onToggle,
  onResetUnsavedChanges,
  onSave,
  readOnly = false
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

  // 현재 상태를 초기 상태로 저장하는 함수
  const saveCurrentStateAsInitial = useCallback(() => {
    // Store의 최신 상태를 가져오기 위해 직접 접근
    const currentProject = useProjectStore.getState();
    const currentSpaceConfig = useSpaceConfigStore.getState();
    const currentFurniture = useFurnitureStore.getState();
    
    const state = {
      project: {
        basicInfo: currentProject.basicInfo
        // updatedAt를 제외 - 이 필드는 저장 시 서버에서 자동 업데이트되므로 비교에서 제외
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

  // Save initial state when component mounts or when project data changes significantly
  useEffect(() => {
    // 약간의 지연을 두어 데이터가 로드된 후 초기 상태를 저장
    const timer = setTimeout(() => {
      saveCurrentStateAsInitial();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [saveCurrentStateAsInitial]);

  // 외부에서 호출할 수 있도록 ref에 함수 등록
  useEffect(() => {
    if (onResetUnsavedChanges && onResetUnsavedChanges.current !== undefined) {
      onResetUnsavedChanges.current = saveCurrentStateAsInitial;
    }
  }, [onResetUnsavedChanges]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (!initialState) return false;
    
    // Store의 최신 상태를 가져오기
    const currentProject = useProjectStore.getState();
    const currentSpaceConfig = useSpaceConfigStore.getState();
    const currentFurniture = useFurnitureStore.getState();
    
    const currentState = {
      project: {
        basicInfo: currentProject.basicInfo
        // updatedAt를 제외 - 이 필드는 저장 시 서버에서 자동 업데이트되므로 비교에서 제외
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
    
    const hasChanges = JSON.stringify(initialState) !== JSON.stringify(currentState);
    return hasChanges;
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
  
  const allTabs = [
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
      icon: <HiOutlineColorSwatch size={20} />,
      label: t('sidebar.material')
    },
    {
      id: 'structure' as SidebarTab,
      icon: <TbBoxAlignRight size={20} />,
      label: '기둥'
    },
    {
      id: 'etc' as SidebarTab,
      icon: <TbBrandAsana size={20} />,
      label: t('sidebar.etc')
    }
  ];

  // 읽기 전용 모드에서는 재질 탭만 보이게
  const tabs = readOnly ? allTabs.filter(tab => tab.id === 'material') : allTabs;

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

      {/* 공유하기 버튼 */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--theme-border)', display: 'flex', justifyContent: 'center' }}>
        <button
          className={styles.settingsButton}
          title="공유하기"
          onClick={() => {
            // 공유하기 기능 (추후 구현)
            alert('공유하기 기능은 준비 중입니다.');
          }}
        >
          <PiShareNetworkLight size={20} />
        </button>
      </div>

      {/* 설정 버튼 */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--theme-border)', display: 'flex', justifyContent: 'center' }}>
        <button
          className={styles.settingsButton}
          title="설정"
          onClick={() => {
            // 설정 패널 열기 이벤트 발생
            window.dispatchEvent(new CustomEvent('openSettingsPanel'));
          }}
        >
          <Settings size={20} />
        </button>
      </div>


      {/* 하단 나가기 버튼 - 읽기 전용 모드에서는 숨김 */}
      {!readOnly && (
        <div className={styles.userSection}>
          <button
            className={styles.settingsButton}
            title={t('sidebar.exitToDashboard')}
            onClick={handleExitClick}
          >
            <LogOut size={20} style={{ transform: 'scaleX(-1)' }} />
          </button>
        </div>
      )}
      
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
                onClick={async () => {
                  setShowExitConfirm(false);
                  // 저장하고 나가기 - 실제 저장 함수 호출
                  console.log('💾 저장하고 나가기 시작');
                  if (onSave) {
                    try {
                      await onSave();
                      console.log('✅ 저장 완료 - 대시보드로 이동');
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