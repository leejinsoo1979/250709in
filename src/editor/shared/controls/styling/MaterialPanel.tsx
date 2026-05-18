import React, { useState, useEffect } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './MaterialPanel.module.css';

type MaterialTab = 'interior' | 'door' | 'countertop' | 'edge';

// cn utility 함수
const cn = (...classes: (string | undefined | null | false)[]) => {
  return classes.filter(Boolean).join(' ');
};

// 재질 데이터 정의
const materialSwatches = [
  // 메라톤
  { id: "m1", name: "4319", type: "HPL컴팩트", category: "메라톤", color: "#FFFFFF", texture: "image", image: "/materials/solid/MELATONE_4319.png" },
  { id: "m2", name: "8832", type: "HPL컴팩트", category: "메라톤", color: "#FFFFFF", texture: "image", image: "/materials/solid/MELATONE_8832.png" },
  { id: "m3", name: "Oyster", type: "HPL컴팩트", category: "메라톤", color: "#FFFFFF", texture: "image", image: "/materials/solid/MELATONE_OYSTER.png" },
  { id: "m4", name: "Taupe", type: "HPL컴팩트", category: "메라톤", color: "#FFFFFF", texture: "image", image: "/materials/solid/MELATONE_TAUPE.png" },

  // 한솔
  { id: "h1", name: "HSB117006", type: "HPL컴팩트", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB117006.png" },
  { id: "h2", name: "HSB120002", type: "HPL컴팩트", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB120002.png" },
  { id: "h3", name: "HSB120512", type: "HPL컴팩트", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB120512.png" },
  { id: "h4", name: "HSB120516", type: "HPL컴팩트", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB120516.png" },
  { id: "h5", name: "HSB121004", type: "HPL컴팩트", category: "한솔", color: "#FFFFFF", texture: "image", image: "/materials/solid/HANSOL_HSB121004.png" },

  // 예림
  { id: "y1", name: "SM-21", type: "HPL컴팩트", category: "예림", color: "#FFFFFF", texture: "image", image: "/materials/solid/YERIM_SM-21.png" },

  // 커스텀
  { id: "o1", name: "Cream", type: "솔리드", category: "커스텀", color: "#f5f5f0" },
  { id: "o2", name: "Light Beige", type: "솔리드", category: "커스텀", color: "#d8d3c0" },
  { id: "o3", name: "Beige", type: "솔리드", category: "커스텀", color: "#d5c6ad" },
  { id: "o4", name: "Tan", type: "솔리드", category: "커스텀", color: "#c8b89b" },
  { id: "o5", name: "Terracotta", type: "솔리드", category: "커스텀", color: "#b15f4c" },
  { id: "o6", name: "Slate Blue", type: "솔리드", category: "커스텀", color: "#6a869c" },
  { id: "o7", name: "Light Sage", type: "솔리드", category: "커스텀", color: "#b9bea7" },
  { id: "o8", name: "Olive", type: "솔리드", category: "커스텀", color: "#697a50" },
  { id: "o9", name: "Sage", type: "솔리드", category: "커스텀", color: "#a3a78c" },
  { id: "o10", name: "Charcoal", type: "솔리드", category: "커스텀", color: "#4b4b4b" },
  { id: "o11", name: "Black", type: "솔리드", category: "커스텀", color: "#212121" },
  { id: "o12", name: "Dark Gray", type: "솔리드", category: "커스텀", color: "#706e6c" },
  { id: "o13", name: "Gray", type: "솔리드", category: "커스텀", color: "#a4a4a4" },
  { id: "o14", name: "MDF", type: "솔리드", category: "커스텀", color: "#e9e5dc" },
  { id: "o15", name: "Light Gray", type: "솔리드", category: "커스텀", color: "#d3d3d3" },
  { id: "i1", name: "Dark Walnut", type: "우드", category: "커스텀", color: "#43302e", texture: "wood" },
  { id: "i2", name: "Black Oak", type: "우드", category: "커스텀", color: "#211f1c", texture: "wood" },
  { id: "i3", name: "Walnut", type: "우드", category: "커스텀", color: "#755541", texture: "wood" },
  { id: "i4", name: "Medium Oak", type: "우드", category: "커스텀", color: "#b28968", texture: "wood" },
  { id: "i5", name: "Natural Oak", type: "우드", category: "커스텀", color: "#c7ae7f", texture: "wood" },
  { id: "i7", name: "Cherry", type: "우드", category: "커스텀", color: "#6e4239", texture: "wood" },
  { id: "i6", name: "Oak", type: "우드", category: "커스텀", color: "#d4bd94", texture: "image", image: "/materials/oak/Poliigon_WoodVeneerOak_7760_BaseColor.jpg" },
  { id: "i8", name: "Cabinet Texture1", type: "텍스처", category: "커스텀", color: "#FFFFFF", texture: "image", image: "/materials/solid/cabinet texture1.jpeg" },
];

// 상판 재질 데이터
const countertopSwatches = [
  // 현대칸스톤
  { id: "ct1", name: "루나쉐도우", type: "인조대리석", category: "현대칸스톤", color: "#FFFFFF", texture: "image", image: "/materials/countertop/luna_shadow_hanwha.png" },
  { id: "ct2", name: "루나화이트", type: "인조대리석", category: "현대칸스톤", color: "#FFFFFF", texture: "image", image: "/materials/countertop/luna_white_hanwha.png" },
  { id: "ct3", name: "애쉬콘크리트", type: "인조대리석", category: "현대칸스톤", color: "#FFFFFF", texture: "image", image: "/materials/countertop/ash_concrete_hanwha.png" },

  // 사일스톤(AAM)
  { id: "ct4", name: "노리타", type: "인조대리석", category: "사일스톤", color: "#FFFFFF", texture: "image", image: "/materials/countertop/norita_silestone.png" },
  { id: "ct5", name: "시포트", type: "인조대리석", category: "사일스톤", color: "#FFFFFF", texture: "image", image: "/materials/countertop/siport_silestone.png" },
  { id: "ct6", name: "퍼블레노", type: "인조대리석", category: "사일스톤", color: "#FFFFFF", texture: "image", image: "/materials/countertop/publeno_silestone.png" },

  // LX하이막스
  { id: "ct7", name: "스노우콘크리트", type: "인조대리석", category: "LX하이막스", color: "#FFFFFF", texture: "image", image: "/materials/countertop/snow_concrete_lx.png" },
  { id: "ct8", name: "어반콘크리트", type: "인조대리석", category: "LX하이막스", color: "#FFFFFF", texture: "image", image: "/materials/countertop/urban_concrete_lx.png" },
  { id: "ct9", name: "클라우드콘크리트", type: "인조대리석", category: "LX하이막스", color: "#FFFFFF", texture: "image", image: "/materials/countertop/cloud_concrete_lx.png" },
];

// 필터 탭 고정 순서
const categories = ['메라톤', '한솔', '예림', '커스텀'] as const;
const countertopCategories = ['현대칸스톤', '사일스톤', 'LX하이막스'] as const;

const MaterialPanel: React.FC = () => {
  const { t } = useTranslation();
  const [materialTab, setMaterialTab] = useState<MaterialTab>('interior');
  const [selectedMaterial, setSelectedMaterial] = useState("Oak");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Store에서 재질 설정과 업데이트 함수 가져오기
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const materialConfig = spaceInfo.materialConfig || { interiorColor: '#FFFFFF', doorColor: '#E0E0E0', frameColor: '#E0E0E0' };
  
  // UI Store에서 도어 상태 가져오기
  const { doorsOpen, setDoorsOpen, setIsInteriorMaterialMode } = useUIStore();

  // materialTab 변경 시 도어 자동 열기/닫기 (마운트 시점 포함)
  useEffect(() => {
    if (materialTab === 'interior') {
      setDoorsOpen(true);
      setIsInteriorMaterialMode(true);
    } else {
      setDoorsOpen(false);
      setIsInteriorMaterialMode(false);
    }
    // 상판 탭: 도어 닫기, 속장 모드 해제
    // 언마운트 시 개별 상태로 복원
    return () => {
      setDoorsOpen(null);
      setIsInteriorMaterialMode(false);
    };
  }, [materialTab]);


  const handleSelectMaterial = (name: string, color: string, material?: any) => {
    setSelectedMaterial(name);

    const isTexture = material?.texture === 'image' && material?.image;

    if (materialTab === 'interior') {
      // 속장: interiorColor/interiorTexture만 변경
      const newMaterialConfig = {
        ...materialConfig,
        interiorColor: color,
        interiorTexture: isTexture ? material.image : undefined
      };
      setSpaceInfo({ materialConfig: newMaterialConfig });
    } else if (materialTab === 'countertop') {
      // 상판: countertopColor/countertopTexture만 변경
      const newMaterialConfig = {
        ...materialConfig,
        countertopColor: color,
        countertopTexture: isTexture ? material.image : undefined
      };
      setSpaceInfo({ materialConfig: newMaterialConfig });
    } else {
      // 도어: doorColor/doorTexture + frameColor/frameTexture 동시 변경
      const newMaterialConfig = {
        ...materialConfig,
        doorColor: color,
        doorTexture: isTexture ? material.image : undefined,
        frameColor: color,
        frameTexture: isTexture ? material.image : undefined
      };
      setSpaceInfo({ materialConfig: newMaterialConfig });
    }
  };

  const isMaterialSelected = (materialName: string) => {
    return selectedMaterial === materialName;
  };

  const currentSwatches = materialTab === 'countertop' ? countertopSwatches : materialSwatches;
  const currentCategories = materialTab === 'countertop' ? countertopCategories : categories;

  const filteredMaterials = categoryFilter
    ? currentSwatches.filter(m => m.category === categoryFilter)
    : currentSwatches;

  return (
    <div className={styles.container}>
      {/* 탭 네비게이션 */}
      <div className={styles.tabNavigation}>
        <button
          className={cn(styles.tab, materialTab === 'interior' && styles.activeTab)}
          onClick={() => {
            setMaterialTab('interior');
            setCategoryFilter(null);
          }}
        >
          <span className={styles.tabLabel}>{t('material.interior')}</span>
        </button>
        <button
          className={cn(styles.tab, materialTab === 'door' && styles.activeTab)}
          onClick={() => {
            setMaterialTab('door');
            setCategoryFilter(null);
          }}
        >
          <span className={styles.tabLabel}>{t('material.door')}</span>
        </button>
        <button
          className={cn(styles.tab, materialTab === 'countertop' && styles.activeTab)}
          onClick={() => {
            setMaterialTab('countertop');
            setCategoryFilter(null);
          }}
        >
          <span className={styles.tabLabel}>상판</span>
        </button>
        <button
          className={cn(styles.tab, materialTab === 'edge' && styles.activeTab)}
          onClick={() => {
            setMaterialTab('edge');
            setCategoryFilter(null);
          }}
        >
          <span className={styles.tabLabel}>엣지</span>
        </button>
      </div>

      {/* 카테고리 필터 (엣지 탭에서는 숨김) */}
      <div className={styles.filterBar} style={materialTab === 'edge' ? { display: 'none' } : undefined}>
        <button
          className={cn(styles.filterChip, categoryFilter === null && styles.filterChipActive)}
          onClick={() => setCategoryFilter(null)}
        >
          전체
        </button>
        {currentCategories.map((cat) => (
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
        {materialTab === 'edge' ? (
          <div className={styles.tabContent} style={{ padding: '8px 12px' }}>
            {(['interior', 'door'] as const).map((target) => {
              const edgeKey = target === 'interior' ? 'interiorEdgeColor' : 'doorEdgeColor';
              const currentEdge = (materialConfig as any)[edgeKey] || '#FFFFFF';
              const label = target === 'interior' ? '속장 엣지' : '도어 엣지';
              return (
                <div
                  key={edgeKey}
                  style={{
                    padding: '14px 0',
                    borderBottom: '1px solid var(--theme-border, #e5e7eb)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--theme-text-primary, #111827)', fontWeight: 600, minWidth: 80 }}>
                    {label}
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="color"
                      value={currentEdge}
                      onChange={(e) => {
                        const newColor = e.target.value;
                        setSpaceInfo({
                          materialConfig: { ...materialConfig, [edgeKey]: newColor },
                        });
                      }}
                      style={{
                        width: 40,
                        height: 32,
                        border: '1px solid var(--theme-border, #d1d5db)',
                        borderRadius: 6,
                        padding: 0,
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                    />
                    <span style={{
                      fontSize: 12,
                      color: 'var(--theme-text-secondary, #6b7280)',
                      fontFamily: 'SF Mono, Menlo, monospace',
                    }}>
                      {currentEdge.toUpperCase()}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      // store가 materialConfig를 deep merge하므로 명시적으로 undefined를 보내야 키가 제거됨
                      setSpaceInfo({
                        materialConfig: { ...materialConfig, [edgeKey]: undefined as any },
                      });
                    }}
                    style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--theme-border, #d1d5db)',
                      background: 'transparent',
                      color: 'var(--theme-text-secondary, #6b7280)',
                      cursor: 'pointer',
                    }}
                  >
                    초기화
                  </button>
                </div>
              );
            })}
            <p style={{
              marginTop: 16,
              fontSize: 12,
              color: 'var(--theme-text-secondary, #6b7280)',
              lineHeight: 1.5,
            }}>
              패널 단면(엣지밴딩)에 표시될 색상을 지정합니다. 색을 지정하지 않으면 패널 본체 재질과 동일하게 표시됩니다.
            </p>
          </div>
        ) : (
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
                  {materialTab !== 'countertop' && <span className={styles.materialType}>{material.type}</span>}
                  <span className={styles.materialName}>{material.name}</span>
                  <span className={styles.materialManufacturer}>{material.category}</span>
                </div>
              </div>
            ))}
          </div>

        </div>
        )}
      </div>
    </div>
  );
};

export default MaterialPanel;
