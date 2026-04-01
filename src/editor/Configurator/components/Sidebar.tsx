import React from 'react';
import styles from './Sidebar.module.css';
import { useTheme } from '@/contexts/ThemeContext';
import { HiOutlineColorSwatch } from 'react-icons/hi';
import { TbBoxAlignRight } from 'react-icons/tb';
import { MdOutlineDashboardCustomize } from 'react-icons/md';
import { Sun, Moon } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';

export type SidebarTab = 'module' | 'material' | 'structure' | 'etc' | 'upload' | 'myCabinet';

interface SidebarProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
  isOpen: boolean;
  onToggle: () => void;
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
  onSave,
  readOnly = false,
  owner,
  collaborators = [],
  onAddCollaborator,
  onFileTreeToggle,
  isFileTreeOpen,
}) => {
  const { theme, toggleMode } = useTheme();
  const { t } = useTranslation();

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
      id: 'myCabinet' as SidebarTab,
      icon: <MdOutlineDashboardCustomize size={22} />,
      label: '커스텀'
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

      {/* Bottom action buttons - 나가기는 헤더로 이동됨 */}
    </aside>
  );
};

export default Sidebar;
