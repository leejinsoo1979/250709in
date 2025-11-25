import React from 'react';
import styles from './MobilePanel.module.css';
import { MobileTab } from './MobileBottomBar';
import MobileModuleCarousel from './MobileModuleCarousel';

interface MobilePanelProps {
    activeTab: MobileTab | null;
    isOpen: boolean;
}

const MobilePanel: React.FC<MobilePanelProps> = ({ activeTab, isOpen }) => {
    const [selectedCategory, setSelectedCategory] = React.useState<'tall' | 'upper' | 'lower'>('tall');

    if (!isOpen || !activeTab) return null;



    // 'modules' 탭일 때 모듈 카러셀과 카테고리 탭 표시
    if (activeTab === 'modules') {
        return (
            <div className={styles.panelContainer}>
                {/* 모듈 카테고리 탭 */}
                <div className={styles.categoryTabs}>
                    <button
                        className={`${styles.categoryTab} ${selectedCategory === 'tall' ? styles.active : ''}`}
                        onClick={() => setSelectedCategory('tall')}
                    >
                        키큰장
                    </button>
                    <button
                        className={`${styles.categoryTab} ${selectedCategory === 'upper' ? styles.active : ''}`}
                        onClick={() => setSelectedCategory('upper')}
                    >
                        상부장
                    </button>
                    <button
                        className={`${styles.categoryTab} ${selectedCategory === 'lower' ? styles.active : ''}`}
                        onClick={() => setSelectedCategory('lower')}
                    >
                        하부장
                    </button>
                </div>

                <MobileModuleCarousel category={selectedCategory} />
            </div>
        );
    }

    // 'column' 탭일 때 기둥 추가/관리 표시
    if (activeTab === 'column') {
        return (
            <div className={styles.panelContainer}>
                <div className={styles.panelContent}>
                    <div className={styles.sectionTitle}>기둥 추가</div>
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--theme-text-secondary)' }}>
                        기둥을 추가하려면 뷰어에서 원하는 위치를 탭하세요
                    </div>
                </div>
            </div>
        );
    }


    return null;
};

export default MobilePanel;
