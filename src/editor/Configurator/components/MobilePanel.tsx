import React from 'react';
import styles from './MobilePanel.module.css';
import { MobileTab } from './MobileBottomBar';
import MobileModuleCarousel from './MobileModuleCarousel';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';

interface MobilePanelProps {
    activeTab: MobileTab | null;
    isOpen: boolean;
}

const MobilePanel: React.FC<MobilePanelProps> = ({ activeTab, isOpen }) => {
    const [selectedCategory, setSelectedCategory] = React.useState<'tall' | 'upper' | 'lower'>('tall');
    const spaceInfo = useSpaceConfigStore(s => s.spaceInfo);
    const setSpaceInfo = useSpaceConfigStore(s => s.setSpaceInfo);
    const placedModules = useFurnitureStore(s => s.placedModules);
    const clearAllModules = useFurnitureStore(s => s.clearAllModules);

    const layoutMode = spaceInfo.layoutMode || 'equal-division';
    const isFreePlacement = layoutMode === 'free-placement';

    const handleLayoutModeChange = (mode: 'equal-division' | 'free-placement') => {
        if (layoutMode === mode) return;
        if (placedModules.length > 0) {
            if (!window.confirm('배치 방식을 변경하면 배치된 가구가 모두 초기화됩니다. 계속하시겠습니까?')) return;
            clearAllModules();
            setSpaceInfo({ freeSurround: undefined });
        }
        const updates: Record<string, unknown> = { layoutMode: mode };
        if (spaceInfo.surroundType === 'no-surround') {
            const wc = spaceInfo.wallConfig || { left: true, right: true };
            updates.gapConfig = {
                left: wc.left ? 1.5 : 0,
                right: wc.right ? 1.5 : 0,
                middle: 1.5,
            };
        }
        if (mode === 'equal-division') {
            if (spaceInfo.droppedCeiling?.enabled) {
                updates.droppedCeiling = { enabled: false, position: 'right', width: 150, dropHeight: 20 };
            }
            updates.curtainBox = { enabled: false, position: 'right', width: 150, dropHeight: 20 };
        }
        setSpaceInfo(updates);
    };

    if (!isOpen || !activeTab) return null;

    // 'modules' 탭일 때 모듈 카러셀과 카테고리 탭 표시
    if (activeTab === 'modules') {
        return (
            <div className={styles.panelContainer}>
                {/* 배치 모드 토글 + 카테고리 탭을 한 줄에 */}
                <div className={styles.topRow}>
                    <div className={styles.layoutToggle}>
                        <button
                            className={`${styles.layoutBtn} ${!isFreePlacement ? styles.layoutActive : ''}`}
                            onClick={() => handleLayoutModeChange('equal-division')}
                        >
                            슬롯배치
                        </button>
                        <button
                            className={`${styles.layoutBtn} ${isFreePlacement ? styles.layoutActive : ''}`}
                            onClick={() => handleLayoutModeChange('free-placement')}
                        >
                            자유배치
                        </button>
                    </div>
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
