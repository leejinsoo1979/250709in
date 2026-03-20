import React, { useState, useRef, useEffect } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './MaterialPanel.module.css';

type MaterialTab = 'interior' | 'door' | 'frame';

// cn utility 함수
const cn = (...classes: (string | undefined | null | false)[]) => {
  return classes.filter(Boolean).join(' ');
};

// 재질 데이터 정의
const materialSwatches = [
  // 솔리드 컬러 (카테고리: 색상)
  { id: "o1", name: "Cream", category: "색상", color: "#f5f5f0" },
  { id: "o2", name: "Light Beige", category: "색상", color: "#d8d3c0" },
  { id: "o3", name: "Beige", category: "색상", color: "#d5c6ad" },
  { id: "o4", name: "Tan", category: "색상", color: "#c8b89b" },
  { id: "o5", name: "Terracotta", category: "색상", color: "#b15f4c" },
  { id: "o6", name: "Slate Blue", category: "색상", color: "#6a869c" },
  { id: "o7", name: "Light Sage", category: "색상", color: "#b9bea7" },
  { id: "o8", name: "Olive", category: "색상", color: "#697a50" },
  { id: "o9", name: "Sage", category: "색상", color: "#a3a78c" },
  { id: "o10", name: "Charcoal", category: "색상", color: "#4b4b4b" },
  { id: "o11", name: "Black", category: "색상", color: "#212121" },
  { id: "o12", name: "Dark Gray", category: "색상", color: "#706e6c" },
  { id: "o13", name: "Gray", category: "색상", color: "#a4a4a4" },
  { id: "o14", name: "MDF", category: "색상", color: "#e9e5dc" },
  { id: "o15", name: "Light Gray", category: "색상", color: "#d3d3d3" },

  // 우드 텍스처 (카테고리: 필름)
  { id: "i1", name: "Dark Walnut", category: "필름", color: "#43302e", texture: "wood" },
  { id: "i2", name: "Black Oak", category: "필름", color: "#211f1c", texture: "wood" },
  { id: "i3", name: "Walnut", category: "필름", color: "#755541", texture: "wood" },
  { id: "i4", name: "Medium Oak", category: "필름", color: "#b28968", texture: "wood" },
  { id: "i5", name: "Natural Oak", category: "필름", color: "#c7ae7f", texture: "wood" },
  { id: "i7", name: "Cherry", category: "필름", color: "#6e4239", texture: "wood" },

  // 이미지 텍스처 (카테고리: 마루/타일)
  { id: "i6", name: "Oak", category: "마루", color: "#d4bd94", texture: "image", image: "/materials/oak/Poliigon_WoodVeneerOak_7760_BaseColor.jpg" },
  { id: "i8", name: "Cabinet Texture1", category: "타일", color: "#FFFFFF", texture: "image", image: "/materials/solid/cabinet texture1.jpeg" },
];

const MaterialPanel: React.FC = () => {
  const { t } = useTranslation();
  const [materialTab, setMaterialTab] = useState<MaterialTab>('interior');
  const [selectedMaterial, setSelectedMaterial] = useState("Oak");
  const [selectedColor, setSelectedColor] = useState("#FFFFFF");
  const [colorOpacity, setColorOpacity] = useState(50);
  const [savedColors, setSavedColors] = useState([
    { id: '1', hex: '#FF5252' },
    { id: '2', hex: '#7C4DFF' },
    { id: '3', hex: '#40C4FF' },
    { id: '4', hex: '#69F0AE' },
    { id: '5', hex: '#FFFF00' }
  ]);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverColor, setHoverColor] = useState<{color: string, x: number, y: number} | null>(null);

  const colorWheelRef = useRef<HTMLDivElement>(null);
  const colorUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Store에서 재질 설정과 업데이트 함수 가져오기
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const materialConfig = spaceInfo.materialConfig || { interiorColor: '#FFFFFF', doorColor: '#E0E0E0', frameColor: '#E0E0E0' };
  
  // UI Store에서 도어 상태 가져오기
  const { doorsOpen, setDoorsOpen } = useUIStore();

  // materialTab 변경 시 도어 자동 열기/닫기 (마운트 시점 포함)
  useEffect(() => {
    if (materialTab === 'interior') {
      setDoorsOpen(true);
    } else if (materialTab === 'door') {
      setDoorsOpen(false);
    } else {
      setDoorsOpen(null);
    }
    // 언마운트 시 개별 상태로 복원
    return () => {
      setDoorsOpen(null);
    };
  }, [materialTab]);


  // 현재 스토어의 색상
  const currentStoreColor = materialTab === 'interior'
    ? (materialConfig.interiorColor || '#FFFFFF')
    : materialTab === 'door'
    ? (materialConfig.doorColor || '#E0E0E0')
    : (materialConfig.frameColor || '#E0E0E0');

  // 스토어 업데이트 함수
  const updateStoreColor = (color: string) => {
    const propertyKey = materialTab === 'interior' ? 'interiorColor' : materialTab === 'door' ? 'doorColor' : 'frameColor';
    const textureKey = materialTab === 'interior' ? 'interiorTexture' : materialTab === 'door' ? 'doorTexture' : 'frameTexture';
    const newMaterialConfig = {
      ...materialConfig,
      [propertyKey]: color,
      [textureKey]: undefined  // 색상 직접 변경 시 텍스처 해제
    };

    setSpaceInfo({
      materialConfig: newMaterialConfig
    });
  };

  // Color wheel functions
  const updateColorSelection = (e: React.MouseEvent) => {
    if (colorWheelRef.current) {
      e.stopPropagation();
      
      const rect = colorWheelRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      const dx = clickX - centerX;
      const dy = clickY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = Math.min(rect.width, rect.height) / 2;
      
      let finalX = clickX;
      let finalY = clickY;
      
      if (distance > radius) {
        const ratio = radius / distance;
        finalX = centerX + dx * ratio;
        finalY = centerY + dy * ratio;
      }
      
      const relativeX = (finalX / rect.width) * 100;
      const relativeY = (finalY / rect.height) * 100;
      
      const adjustedDx = finalX - centerX;
      const adjustedDy = finalY - centerY;
      
      let hue = Math.atan2(adjustedDy, adjustedDx) * (180 / Math.PI);
      if (hue < 0) hue += 360;
      
      const adjustedDistance = Math.sqrt(adjustedDx * adjustedDx + adjustedDy * adjustedDy);
      const saturation = Math.min(adjustedDistance / radius, 1) * 100;
      
      const minLightness = 10;
      const maxLightness = 90;
      const range = maxLightness - minLightness;
      const lightness = minLightness + (range * colorOpacity / 100);
      
      const newColor = hslToHex(hue, saturation, lightness);
      
      if (newColor !== selectedColor) {
        setSelectedColor(newColor);
        
        const selectorElement = document.getElementById('color-selector');
        if (selectorElement) {
          selectorElement.style.left = `${relativeX}%`;
          selectorElement.style.top = `${relativeY}%`;
        }
        
        setHoverColor(null);
        
        if (colorUpdateTimerRef.current) {
          clearTimeout(colorUpdateTimerRef.current);
        }
        
        colorUpdateTimerRef.current = setTimeout(() => {
          updateStoreColor(newColor);
          colorUpdateTimerRef.current = null;
        }, 300);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    updateColorSelection(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging) {
      updateColorSelection(e);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleColorPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (colorWheelRef.current && !isDragging) {
      const rect = colorWheelRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius = Math.min(rect.width, rect.height) / 2;
      
      if (distance <= radius) {
        let hue = Math.atan2(dy, dx) * (180 / Math.PI);
        if (hue < 0) hue += 360;
        
        const saturation = Math.min(distance / radius, 1) * 100;
        
        const minLightness = 10;
        const maxLightness = 90;
        const range = maxLightness - minLightness;
        const lightness = minLightness + (range * colorOpacity / 100);
        
        const previewColor = hslToHex(hue, saturation, lightness);
        
        const relativeX = (mouseX / rect.width) * 100;
        const relativeY = (mouseY / rect.height) * 100;
        
        setHoverColor({
          color: previewColor,
          x: relativeX,
          y: relativeY
        });
      } else {
        setHoverColor(null);
      }
    }
  };

  const handleColorPreviewEnd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHoverColor(null);
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newOpacity = parseInt(e.target.value);
    setColorOpacity(newOpacity);
    
    if (selectedColor) {
      const { h, s } = hexToHsl(selectedColor);
      
      const minLightness = 10;
      const maxLightness = 90;
      const range = maxLightness - minLightness;
      const adjustedL = minLightness + (range * newOpacity / 100);
      
      const adjustedColor = hslToHex(h, s, adjustedL);
      setSelectedColor(adjustedColor);
      
      updateStoreColor(adjustedColor);
    }
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase();
    
    if (!value.startsWith('#')) {
      value = '#' + value;
    }
    
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (hexRegex.test(value)) {
      setSelectedColor(value);
      
      const { h, s, l } = hexToHsl(value);
      setColorOpacity(Math.round((l - 10) / 80 * 100));
      
      if (colorWheelRef.current) {
        const radius = Math.min(colorWheelRef.current.offsetWidth, colorWheelRef.current.offsetHeight) / 2;
        const saturationDistance = (s / 100) * radius;
        const angle = (h * Math.PI) / 180;
        
        const centerX = radius;
        const centerY = radius;
        const x = centerX + saturationDistance * Math.cos(angle);
        const y = centerY + saturationDistance * Math.sin(angle);
        
        const relativeX = (x / (radius * 2)) * 100;
        const relativeY = (y / (radius * 2)) * 100;
        
        const selectorElement = document.getElementById('color-selector');
        if (selectorElement) {
          selectorElement.style.left = `${relativeX}%`;
          selectorElement.style.top = `${relativeY}%`;
        }
      }
      
      updateStoreColor(value);
    }
  };

  const handleSelectMaterial = (name: string, color: string, material?: any) => {
    setSelectedMaterial(name);

    // 이미지 텍스처인 경우 텍스처 경로도 함께 저장
    if (material?.texture === 'image' && material?.image) {
      // 모든 이미지 텍스처는 현재 선택된 탭에만 적용
      const textureProperty = materialTab === 'interior' ? 'interiorTexture' : materialTab === 'door' ? 'doorTexture' : 'frameTexture';
      const colorProperty = materialTab === 'interior' ? 'interiorColor' : materialTab === 'door' ? 'doorColor' : 'frameColor';
      const newMaterialConfig = {
        ...materialConfig,
        [colorProperty]: color,
        [textureProperty]: material.image
      };

      console.log('🎨 MaterialPanel 재질 선택 (텍스처):', {
        materialTab,
        name,
        textureProperty,
        textureValue: material.image,
        prevTexture: materialConfig[textureProperty],
        newMaterialConfig
      });

      setSpaceInfo({
        materialConfig: newMaterialConfig
      });
    } else {
      // 일반 색상 재질인 경우 텍스처 제거
      const textureProperty = materialTab === 'interior' ? 'interiorTexture' : materialTab === 'door' ? 'doorTexture' : 'frameTexture';
      const colorProperty = materialTab === 'interior' ? 'interiorColor' : materialTab === 'door' ? 'doorColor' : 'frameColor';
      const newMaterialConfig = {
        ...materialConfig,
        [colorProperty]: color,
        [textureProperty]: undefined
      };

      console.log('🎨 MaterialPanel 재질 선택 (색상):', {
        materialTab,
        name,
        colorProperty,
        colorValue: color,
        textureProperty,
        newMaterialConfig
      });

      setSpaceInfo({
        materialConfig: newMaterialConfig
      });
    }
  };

  const handleSaveColor = () => {
    const newColor = { id: `${savedColors.length + 1}`, hex: selectedColor };
    setSavedColors([...savedColors, newColor]);
  };

  const handleRemoveColor = (idToRemove: string) => {
    setSavedColors(savedColors.filter(color => color.id !== idToRemove));
  };

  const handleSelectSavedColor = (hex: string) => {
    setSelectedColor(hex);
    updateStoreColor(hex);
  };

  // Helper functions
  const hexToHsl = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { h: 0, s: 0, l: 0 };
    
    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        default: h = 0;
      }
      h *= 60;
    }
    
    return { h, s: s * 100, l: l * 100 };
  };

  const hslToHex = (h: number, s: number, l: number) => {
    h = h % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - chroma / 2;
    
    let r, g, b;
    
    if (h >= 0 && h < 60) {
      [r, g, b] = [chroma, x, 0];
    } else if (h >= 60 && h < 120) {
      [r, g, b] = [x, chroma, 0];
    } else if (h >= 120 && h < 180) {
      [r, g, b] = [0, chroma, x];
    } else if (h >= 180 && h < 240) {
      [r, g, b] = [0, x, chroma];
    } else if (h >= 240 && h < 300) {
      [r, g, b] = [x, 0, chroma];
    } else {
      [r, g, b] = [chroma, 0, x];
    }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  };

  const isMaterialSelected = (materialName: string) => {
    return selectedMaterial === materialName;
  };

  // Global mouse up event
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  return (
    <div className={styles.container}>
      {/* 탭 네비게이션 */}
      <div className={styles.tabNavigation}>
        <button
          className={cn(styles.tab, materialTab === 'interior' && styles.activeTab)}
          onClick={() => {
            setMaterialTab('interior');
          }}
        >
          <span className={styles.tabLabel}>{t('material.interior')}</span>
        </button>
        <button
          className={cn(styles.tab, materialTab === 'door' && styles.activeTab)}
          onClick={() => {
            setMaterialTab('door');
          }}
        >
          <span className={styles.tabLabel}>{t('material.door')}</span>
        </button>
        <button
          className={cn(styles.tab, materialTab === 'frame' && styles.activeTab)}
          onClick={() => {
            setMaterialTab('frame');
          }}
        >
          <span className={styles.tabLabel}>마감판</span>
        </button>
      </div>

      {/* 탭 컨텐츠 */}
      <div className={styles.content}>
        <div className={styles.tabContent}>
          {/* 재질 카드 그리드 */}
          <div className={styles.materialGrid}>
            {materialSwatches.map((material) => (
              <div
                key={material.id}
                className={cn(
                  styles.materialCard,
                  isMaterialSelected(material.name) && styles.materialCardSelected
                )}
                onClick={() => handleSelectMaterial(material.name, material.color, material)}
              >
                <div className={styles.materialThumbnail}>
                  {material.texture === 'image' && material.image ? (
                    <img src={material.image} alt={material.name} className={styles.materialImage} />
                  ) : (
                    <div
                      className={styles.materialColorSwatch}
                      style={{ backgroundColor: material.color }}
                    />
                  )}
                </div>
                <div className={styles.materialInfo}>
                  <span className={styles.materialCategory}>{material.category}</span>
                  <span className={styles.materialName}>{material.name}</span>
                </div>
              </div>
            ))}
          </div>
          
          {/* 색상 지정하기 섹션 */}
          <div className={styles.colorSection}>
            <div className={styles.colorSectionTitle}>{t('material.colorPicker')}</div>
            
            {/* 색상 휠 */}
            <div 
              ref={colorWheelRef}
              id="color-wheel"
              className={styles.colorWheel}
              onClick={updateColorSelection}
              onMouseDown={handleMouseDown}
              onMouseMove={(e) => {
                handleMouseMove(e);
                handleColorPreview(e);
              }}
              onMouseOver={handleColorPreview}
              onMouseLeave={handleColorPreviewEnd}
              onMouseUp={handleMouseUp}
            >
              <div className={styles.colorWheelGradient}></div>
              <div className={styles.colorWheelCenter}></div>
              
              {/* 색상 미리보기 포인터 */}
              {hoverColor && !isDragging && (
                <div 
                  className={styles.hoverPointer}
                  style={{ 
                    left: `${hoverColor.x}%`, 
                    top: `${hoverColor.y}%`,
                    backgroundColor: hoverColor.color
                  }}
                ></div>
              )}
              
              {/* 색상 선택 포인터 */}
              <div 
                id="color-selector"
                className={styles.colorSelector}
                style={{ 
                  left: "75%", 
                  top: "65%",
                  backgroundColor: selectedColor
                }}
              ></div>
            </div>
            
            {/* 밝기 슬라이더 */}
            <div className={styles.opacitySection}>
              <div className={styles.opacityHeader}>
                <span className={styles.opacityLabel}>{t('material.brightnessAdjust')}</span>
                <span className={styles.opacityValue}>{colorOpacity}%</span>
              </div>
              <div className={styles.opacitySliderContainer}>
                <div 
                  className={styles.opacitySliderBackground}
                  style={{
                    background: `linear-gradient(to right, 
                      ${hslToHex(hexToHsl(selectedColor).h, hexToHsl(selectedColor).s, 10)}, 
                      ${hslToHex(hexToHsl(selectedColor).h, hexToHsl(selectedColor).s, 50)}, 
                      ${hslToHex(hexToHsl(selectedColor).h, hexToHsl(selectedColor).s, 90)})`
                  }}
                ></div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={colorOpacity}
                  onChange={handleOpacityChange}
                  className={styles.opacitySlider}
                />
                <div 
                  className={styles.opacityHandle}
                  style={{ left: `calc(${colorOpacity}% - 8px)` }}
                ></div>
              </div>
            </div>
            
            {/* HEX 값 입력 */}
            <div className={styles.hexSection}>
              <div className={styles.hexPreview} style={{ backgroundColor: selectedColor }}></div>
              <div className={styles.hexInputContainer}>
                <span className={styles.hexPrefix}>#</span>
                <input
                  type="text"
                  value={selectedColor.replace('#', '')}
                  onChange={handleHexChange}
                  className={styles.hexInput}
                  maxLength={6}
                  placeholder="RRGGBB"
                />
              </div>
            </div>
            
            {/* 저장된 색상 */}
            <div className={styles.savedColorsSection}>
              <div className={styles.savedColorsHeader}>
                <span className={styles.savedColorsLabel}>{t('material.savedColors')}</span>
                <span className={styles.savedColorsHint}>{t('material.addColorHint')}</span>
              </div>
              <div className={styles.savedColorsGrid}>
                {savedColors.map((color) => (
                  <div
                    key={color.id}
                    className={cn(
                      styles.savedColorButton,
                      selectedColor === color.hex && styles.selectedSavedColor
                    )}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => handleSelectSavedColor(color.hex)}
                  >
                    {selectedColor === color.hex && (
                      <div className={styles.selectedSavedColorIndicator}></div>
                    )}
                    <div className={styles.savedColorRemove}>
                      <button 
                        className={styles.savedColorRemoveButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveColor(color.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                <div
                  className={styles.addColorButton}
                  onClick={handleSaveColor}
                >
                  <span className={styles.addColorButtonText}>+</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaterialPanel;