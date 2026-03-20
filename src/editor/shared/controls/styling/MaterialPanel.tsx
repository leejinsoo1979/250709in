import React, { useState, useEffect } from 'react';
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
  // 메라톤
  { id: "m1", name: "4319", category: "메라톤", color: "#FFFFFF", texture: "image", image: "/materials/solid/MELATONE_4319.png" },
  { id: "m2", name: "8832", category: "메라톤", color: "#FFFFFF", texture: "image", image: "/materials/solid/MELATONE_8832.png" },
  { id: "m3", name: "Oyster", category: "메라톤", color: "#FFFFFF", texture: "image", image: "/materials/solid/MELATONE_OYSTER.png" },
  { id: "m4", name: "Taupe", category: "메라톤", color: "#FFFFFF", texture: "image", image: "/materials/solid/MELATONE_TAUPE.png" },

  // 한솔
  { id: "h1", name: "HSB117006", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB117006.png" },
  { id: "h2", name: "HSB120002", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB120002.png" },
  { id: "h3", name: "HSB120512", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB120512.png" },
  { id: "h4", name: "HSB120516", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB120516.png" },
  { id: "h5", name: "HSB121004", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB121004.png" },

  // 예림
  { id: "y1", name: "SM-21", category: "예림", color: "#FFFFFF", texture: "image", image: "/materials/solid/YERIM_SM-21.png" },

  // 커스텀
  { id: "o1", name: "Cream", category: "커스텀", color: "#f5f5f0" },
  { id: "o2", name: "Light Beige", category: "커스텀", color: "#d8d3c0" },
  { id: "o3", name: "Beige", category: "커스텀", color: "#d5c6ad" },
  { id: "o4", name: "Tan", category: "커스텀", color: "#c8b89b" },
  { id: "o5", name: "Terracotta", category: "커스텀", color: "#b15f4c" },
  { id: "o6", name: "Slate Blue", category: "커스텀", color: "#6a869c" },
  { id: "o7", name: "Light Sage", category: "커스텀", color: "#b9bea7" },
  { id: "o8", name: "Olive", category: "커스텀", color: "#697a50" },
  { id: "o9", name: "Sage", category: "커스텀", color: "#a3a78c" },
  { id: "o10", name: "Charcoal", category: "커스텀", color: "#4b4b4b" },
  { id: "o11", name: "Black", category: "커스텀", color: "#212121" },
  { id: "o12", name: "Dark Gray", category: "커스텀", color: "#706e6c" },
  { id: "o13", name: "Gray", category: "커스텀", color: "#a4a4a4" },
  { id: "o14", name: "MDF", category: "커스텀", color: "#e9e5dc" },
  { id: "o15", name: "Light Gray", category: "커스텀", color: "#d3d3d3" },
  { id: "i1", name: "Dark Walnut", category: "커스텀", color: "#43302e", texture: "wood" },
  { id: "i2", name: "Black Oak", category: "커스텀", color: "#211f1c", texture: "wood" },
  { id: "i3", name: "Walnut", category: "커스텀", color: "#755541", texture: "wood" },
  { id: "i4", name: "Medium Oak", category: "커스텀", color: "#b28968", texture: "wood" },
  { id: "i5", name: "Natural Oak", category: "커스텀", color: "#c7ae7f", texture: "wood" },
  { id: "i7", name: "Cherry", category: "커스텀", color: "#6e4239", texture: "wood" },
  { id: "i6", name: "Oak", category: "커스텀", color: "#d4bd94", texture: "image", image: "/materials/oak/Poliigon_WoodVeneerOak_7760_BaseColor.jpg" },
  { id: "i8", name: "Cabinet Texture1", category: "커스텀", color: "#FFFFFF", texture: "image", image: "/materials/solid/cabinet texture1.jpeg" },
];

// 필터 탭 고정 순서
const categories = ['메라톤', '한솔', '예림', '커스텀'] as const;

const MaterialPanel: React.FC = () => {
  const { t } = useTranslation();
  const [materialTab, setMaterialTab] = useState<MaterialTab>('interior');
  const [selectedMaterial, setSelectedMaterial] = useState("Oak");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

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

  const isMaterialSelected = (materialName: string) => {
    return selectedMaterial === materialName;
  };

  const filteredMaterials = categoryFilter
    ? materialSwatches.filter(m => m.category === categoryFilter)
    : materialSwatches;

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

      {/* 카테고리 필터 */}
      <div className={styles.filterBar}>
        <button
          className={cn(styles.filterChip, categoryFilter === null && styles.filterChipActive)}
          onClick={() => setCategoryFilter(null)}
        >
          전체
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={cn(styles.filterChip, categoryFilter === cat && styles.filterChipActive)}
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div className={styles.content}>
        <div className={styles.tabContent}>
          {/* 재질 카드 그리드 */}
          <div className={styles.materialGrid}>
            {filteredMaterials.map((material) => (
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
        </div>
      </div>
    </div>
  );
};

export default MaterialPanel;