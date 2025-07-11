import React, { useState, useMemo } from 'react';
import { HsvColorPicker } from 'react-colorful';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import styles from './MaterialPanel.module.css';

type MaterialTab = 'interior' | 'door';

// 헥스 코드를 HSV로 변환 (투명도 제거)
const hexToHsv = (hex: string) => {
  // null safety: undefined나 null일 경우 기본값으로 흰색 사용
  if (!hex || typeof hex !== 'string') {
    hex = '#FFFFFF';
  }
  
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  const s = max === 0 ? 0 : diff / max;
  const v = max;

  if (diff !== 0) {
    if (max === r) {
      h = ((g - b) / diff) % 6;
    } else if (max === g) {
      h = (b - r) / diff + 2;
    } else {
      h = (r - g) / diff + 4;
    }
  }

  h = h * 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, v: v * 100 };
};

// HSV를 헥스 코드로 변환 (투명도 제거)
const hsvToHex = (hsv: { h: number; s: number; v: number }) => {
  const { h, s, v } = hsv;
  const sNorm = s / 100;
  const vNorm = v / 100;
  
  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = vNorm - c;
  
  let r, g, b;
  
  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }
  
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const MaterialPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MaterialTab>('interior');
  
  // Store에서 재질 설정과 업데이트 함수 가져오기
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const materialConfig = spaceInfo.materialConfig || { interiorColor: '#FFFFFF', doorColor: '#FFFFFF' };

  // 현재 스토어의 색상 (추가 안전성 확보)
  const currentStoreColor = activeTab === 'interior' 
    ? (materialConfig.interiorColor || '#FFFFFF')
    : (materialConfig.doorColor || '#FFFFFF');
  
  // 드래그 중 로컬 상태 (스토어 색상으로 초기화)
  const [localHsv, setLocalHsv] = useState(() => hexToHsv(currentStoreColor));
  
  // 드래그 상태 관리
  const [isDragging, setIsDragging] = useState(false);
  
  // 탭 변경 시 로컬 상태를 새로운 탭의 색상으로 동기화
  useMemo(() => {
    const newHsv = hexToHsv(currentStoreColor);
    setLocalHsv(newHsv);
  }, [currentStoreColor]);

  // 스토어 업데이트 함수 (드래그 완료 시에만 호출)
  const updateStoreColor = (color: string) => {
    const propertyKey = activeTab === 'interior' ? 'interiorColor' : 'doorColor';
    const newMaterialConfig = {
      ...materialConfig,
      [propertyKey]: color
    };
    
    console.log('🎨 MaterialPanel 색상 업데이트 시작:', {
      activeTab,
      propertyKey,
      oldColor: materialConfig[propertyKey],
      newColor: color,
      oldMaterialConfig: materialConfig,
      newMaterialConfig
    });
    
    setSpaceInfo({
      materialConfig: newMaterialConfig
    });
    
    // 업데이트 후 Store 상태 확인
    setTimeout(() => {
      const updatedSpaceInfo = useSpaceConfigStore.getState().spaceInfo;
      console.log('🎨 MaterialPanel 업데이트 후 Store 상태:', {
        updatedMaterialConfig: updatedSpaceInfo.materialConfig,
        expectedColor: color,
        actualColor: updatedSpaceInfo.materialConfig?.[propertyKey]
      });
    }, 100);
  };

  // 드래그 중 색상 변경 (로컬 상태만)
  const handleColorChange = (hsv: { h: number; s: number; v: number }) => {
    setLocalHsv(hsv);
  };

  // 마우스 이벤트로 드래그 완료 감지
  const handleMouseDown = () => {
    console.log('🎨 MaterialPanel 드래그 시작:', { activeTab });
    setIsDragging(true);
  };
  
  const handleMouseUp = () => {
    console.log('🎨 MaterialPanel 드래그 완료:', { 
      isDragging, 
      activeTab, 
      localHsv 
    });
    
    if (isDragging) {
      const hexColor = hsvToHex(localHsv);
      console.log('🎨 MaterialPanel HSV → HEX 변환:', { 
        localHsv, 
        hexColor,
        activeTab 
      });
      updateStoreColor(hexColor);
      setIsDragging(false);
    }
  };

  // 저장된 색상 클릭 핸들러
  const handleColorSelect = (color: string) => {
    console.log('🎨 MaterialPanel 색상 선택:', { 
      color, 
      activeTab 
    });
    
    const newHsv = hexToHsv(color);
    setLocalHsv(newHsv);
    updateStoreColor(color);
  };

  const tabs = [
    { id: 'interior' as MaterialTab, label: '내부', icon: '🟫' },
    { id: 'door' as MaterialTab, label: '도어', icon: '🚪' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'interior':
        return (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>내부 색상</h4>
              <p className={styles.sectionDescription}>
                모든 가구의 내부 색상이 동일하게 적용됩니다.
              </p>
              
              {/* 현재 선택된 색상 표시 */}
              <div className={styles.currentColor}>
                <label className={styles.controlLabel}>현재 색상</label>
                <div className={styles.currentColorDisplay}>
                  <div 
                    className={styles.colorPreview}
                    style={{ backgroundColor: currentStoreColor }}
                  />
                  <span className={styles.colorCode}>{currentStoreColor}</span>
                </div>
              </div>
              
              <div className={styles.colorSection}>
                {/* react-colorful 색상 피커 */}
                <div className={styles.colorPicker}>
                  <HsvColorPicker
                    color={localHsv}
                    onChange={handleColorChange}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                  />
                </div>
                
                {/* 저장된 색상 팔레트 */}
                <div className={styles.colorPalette}>
                  <label className={styles.controlLabel}>저장된 색상</label>
                  <div className={styles.savedColors}>
                    {['#333333', '#666666', '#999999', '#CCCCCC', '#F5F5F5', '#FFFFFF'].map((color, index) => (
                      <button
                        key={index}
                        className={`${styles.colorButton} ${currentStoreColor === color ? styles.selectedColor : ''}`}
                        style={{ backgroundColor: color }}
                        title={color}
                        onClick={() => handleColorSelect(color)}
                      />
                    ))}
                    <button className={styles.addColorButton} title="색상 추가">
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'door':
        return (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>도어 색상</h4>
              <p className={styles.sectionDescription}>
                모든 가구의 도어 색상이 동일하게 적용됩니다.
              </p>
              
              {/* 현재 선택된 색상 표시 */}
              <div className={styles.currentColor}>
                <label className={styles.controlLabel}>현재 색상</label>
                <div className={styles.currentColorDisplay}>
                  <div 
                    className={styles.colorPreview}
                    style={{ backgroundColor: currentStoreColor }}
                  />
                  <span className={styles.colorCode}>{currentStoreColor}</span>
                </div>
              </div>
              
              <div className={styles.colorSection}>
                {/* react-colorful 색상 피커 */}
                <div className={styles.colorPicker}>
                  <HsvColorPicker
                    color={localHsv}
                    onChange={handleColorChange}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                  />
                </div>
                
                {/* 도어 저장된 색상 팔레트 */}
                <div className={styles.colorPalette}>
                  <label className={styles.controlLabel}>저장된 색상</label>
                  <div className={styles.savedColors}>
                    {['#000000', '#8B4513', '#654321', '#D2691E', '#F4A460', '#DEB887'].map((color, index) => (
                      <button
                        key={index}
                        className={`${styles.colorButton} ${currentStoreColor === color ? styles.selectedColor : ''}`}
                        style={{ backgroundColor: color }}
                        title={color}
                        onClick={() => handleColorSelect(color)}
                      />
                    ))}
                    <button className={styles.addColorButton} title="색상 추가">
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>재질</h3>
      </div>
      
      {/* 탭 네비게이션 */}
      <div className={styles.tabNavigation}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
            onClick={() => {
              console.log('🎨 MaterialPanel 탭 변경:', { 
                from: activeTab, 
                to: tab.id,
                currentMaterialConfig: materialConfig
              });
              setActiveTab(tab.id);
            }}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div className={styles.content}>
        {renderTabContent()}
      </div>
    </div>
  );
};

export default MaterialPanel; 