import React from 'react';
import styles from './MobilePanel.module.css';
import { MobileTab } from './MobileBottomBar';
import MobileModuleCarousel from './MobileModuleCarousel';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';

interface MobilePanelProps {
    activeTab: MobileTab | null;
    isOpen: boolean;
}

const MobilePanel: React.FC<MobilePanelProps> = ({ activeTab, isOpen }) => {
    const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
    const [selectedCategory, setSelectedCategory] = React.useState<'tall' | 'upper' | 'lower'>('tall');

    if (!isOpen || !activeTab) return null;

    const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const width = parseInt(e.target.value) || 0;
        setSpaceInfo({ ...spaceInfo, width });
    };

    const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const height = parseInt(e.target.value) || 0;
        setSpaceInfo({ ...spaceInfo, height });
    };



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

    // 'others' 탭일 때 공간 설정 등 기타 옵션 표시
    if (activeTab === 'others') {
        return (
            <div className={styles.panelContainer}>
                <div className={styles.panelContent}>
                    {/* 공간 설정 */}
                    <div className={styles.sectionTitle}>공간 설정</div>
                    <div className={styles.inputGroup}>
                        <div className={styles.inputWrapper}>
                            <span className={styles.inputLabel}>W</span>
                            <input
                                type="number"
                                className={styles.input}
                                value={spaceInfo.width}
                                onChange={handleWidthChange}
                            />
                            <span className={styles.inputUnit}>mm</span>
                        </div>
                        <div className={styles.inputWrapper}>
                            <span className={styles.inputLabel}>H</span>
                            <input
                                type="number"
                                className={styles.input}
                                value={spaceInfo.height}
                                onChange={handleHeightChange}
                            />
                            <span className={styles.inputUnit}>mm</span>
                        </div>
                    </div>

                    {/* 공간 유형 */}
                    <div className={styles.sectionTitle}>공간 유형</div>
                    <div className={styles.typeButtons}>
                        <button
                            className={`${styles.typeButton} ${spaceInfo.installType === 'builtin' ? styles.active : ''}`}
                            onClick={() => setSpaceInfo({ ...spaceInfo, installType: 'builtin' })}
                        >
                            양쪽벽
                        </button>
                        <button
                            className={`${styles.typeButton} ${spaceInfo.installType === 'semistanding' ? styles.active : ''}`}
                            onClick={() => setSpaceInfo({ ...spaceInfo, installType: 'semistanding' })}
                        >
                            한쪽벽
                        </button>
                        <button
                            className={`${styles.typeButton} ${spaceInfo.installType === 'freestanding' ? styles.active : ''}`}
                            onClick={() => setSpaceInfo({ ...spaceInfo, installType: 'freestanding' })}
                        >
                            벽없음
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default MobilePanel;
