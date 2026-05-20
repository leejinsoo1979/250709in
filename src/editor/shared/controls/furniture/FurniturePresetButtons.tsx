import React, { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import type { PlacedModule } from '@/editor/shared/furniture/types';

// 같은 카테고리(full/upper/lower)끼리만 프리셋 주입 허용.
//   - 가구 폭/높이/깊이/슬롯/위치 등 가구별로 달라야 할 필드는 제외.
//   - 그룹별로 묶어서 사용자가 체크박스로 선택해 주입.
const FIELD_GROUPS: { id: string; label: string; fields: string[] }[] = [
  {
    id: 'door',
    label: '도어 설정 (상/하단갭, 확장량, 도어 옵션)',
    fields: [
      'doorTopGap', 'doorBottomGap',
      'doorWidthAdjustEnabled', 'doorWidthAdjustMm',
      'hasDoor', 'hingePosition',
    ],
  },
  {
    id: 'drawer',
    label: '마이다 / 서랍',
    fields: [
      'customMaidaHeights',
      'legraDrawerTypes',
    ],
  },
  {
    id: 'topBottom',
    label: '상부몰딩 / 걸레받이',
    fields: [
      'hasTopFrame', 'topFrameThickness', 'topFrameOffset', 'topFrameGap',
      'hasBase', 'baseFrameHeight', 'baseFrameOffset', 'baseFrameGap',
      'individualFloatHeight',
    ],
  },
  {
    id: 'backPanel',
    label: '백패널',
    fields: ['backPanelThickness'],
  },
  {
    id: 'endPanel',
    label: '엔드패널 (EP)',
    fields: ['hasLeftEndPanel', 'hasRightEndPanel', 'endPanelDepth'],
  },
  {
    id: 'shelfRod',
    label: '옷봉 / 선반 / 내부 구성',
    fields: ['customConfig', 'customSections'],
  },
  {
    id: 'rodShelf',
    label: '옷봉선반 옵션',
    fields: ['removeSafetyShelf'],
  },
  {
    id: 'materialColor',
    label: '재질 / 색상',
    fields: [
      'doorColor', 'doorTextureUrl', 'doorMaterial',
      'bodyColor', 'bodyTextureUrl', 'bodyMaterial',
      'interiorEdgeColor', 'doorEdgeColor',
    ],
  },
];

const getCategory = (m: PlacedModule | undefined, fallbackCategory?: string): 'full' | 'upper' | 'lower' | null => {
  if (!m) return null;
  const id = m.moduleId || '';
  if (fallbackCategory === 'upper' || id.includes('upper')) return 'upper';
  if (fallbackCategory === 'lower' || id.includes('lower')) return 'lower';
  if (fallbackCategory === 'full' || id.startsWith('dual-') || id.startsWith('single-') || id.includes('full')) return 'full';
  return 'full';
};

// 그룹별로 현재 가구 또는 프리셋 데이터에 의미 있는 값이 있는지 판단.
//   - 의미 없는 그룹(예: 도어 없는 가구의 도어 설정, 서랍 없는 가구의 마이다)은 모달에서 숨김.
//   - 프리셋이 있는 경우는 프리셋에 해당 필드가 들어있는지로 판단 (저장 시점 가구 기준).
const isGroupApplicable = (
  groupId: string,
  presetProps: Record<string, any> | undefined,
  targetModule: PlacedModule,
  category: 'full' | 'upper' | 'lower' | null,
): boolean => {
  const id = (targetModule.moduleId || '').toLowerCase();
  const mod = targetModule as any;
  const hasInPreset = (fields: string[]) =>
    !!presetProps && fields.some(f => presetProps[f] !== undefined);

  switch (groupId) {
    case 'door': {
      const targetHasDoor = mod.hasDoor !== false; // 기본 true
      return targetHasDoor && hasInPreset(['doorTopGap', 'doorBottomGap', 'doorWidthAdjustEnabled', 'doorWidthAdjustMm', 'hasDoor', 'hingePosition']);
    }
    case 'drawer': {
      // 마이다/서랍 모듈만
      const isDrawerType = /lower-drawer-|lower-induction-cabinet-|lower-door-lift-touch|lower-top-down-touch/.test(id);
      return isDrawerType && hasInPreset(['customMaidaHeights', 'legraDrawerTypes']);
    }
    case 'topBottom': {
      // 상부장은 상부몰딩/걸레받이 무관
      if (category === 'upper') return false;
      return hasInPreset(['hasTopFrame', 'topFrameThickness', 'topFrameOffset', 'topFrameGap', 'hasBase', 'baseFrameHeight', 'baseFrameOffset', 'baseFrameGap', 'individualFloatHeight']);
    }
    case 'backPanel':
      return hasInPreset(['backPanelThickness']);
    case 'endPanel': {
      // EP는 자유배치이거나 슬롯 끝 가구에서만 의미 있지만 단순화: 프리셋에 EP 필드 있으면 표시
      return hasInPreset(['hasLeftEndPanel', 'hasRightEndPanel', 'endPanelDepth']);
    }
    case 'shelfRod': {
      // 커스텀 가구 (customSections 보유) 또는 커스터마이즈 가능 가구만
      const isCustomizable = id.startsWith('customizable-') || !!mod.customSections || !!mod.customConfig;
      return isCustomizable && hasInPreset(['customConfig', 'customSections']);
    }
    case 'rodShelf':
      return hasInPreset(['removeSafetyShelf']);
    case 'materialColor':
      return hasInPreset(['doorColor', 'doorTextureUrl', 'doorMaterial', 'bodyColor', 'bodyTextureUrl', 'bodyMaterial', 'interiorEdgeColor', 'doorEdgeColor']);
    default:
      return false;
  }
};

interface FurniturePresetButtonsProps {
  placedModule: PlacedModule;
  moduleCategory?: string;
}

export const FurniturePresetButtons: React.FC<FurniturePresetButtonsProps> = ({ placedModule, moduleCategory }) => {
  const furniturePresets = useUIStore(state => state.furniturePresets);
  const setFurniturePreset = useUIStore(state => state.setFurniturePreset);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);

  const category = getCategory(placedModule, moduleCategory);
  const preset = category ? furniturePresets[category] : undefined;

  // 현재 가구에 적용 가능한 그룹만 노출 (의미 없는 도어/EP/마이다 등은 숨김)
  const applicableGroups = FIELD_GROUPS.filter(g =>
    isGroupApplicable(g.id, preset?.props, placedModule, category)
  );
  const applicableIds = applicableGroups.map(g => g.id);

  const [showInjectModal, setShowInjectModal] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(applicableIds);

  // 저장 가능한 모든 필드 수집
  const collectProps = (): Record<string, any> => {
    const allFields = FIELD_GROUPS.flatMap(g => g.fields);
    const props: Record<string, any> = {};
    const mod = placedModule as any;
    for (const f of allFields) {
      if (mod[f] !== undefined) props[f] = mod[f];
    }
    return props;
  };

  const handleSave = () => {
    if (!category) return;
    const props = collectProps();
    setFurniturePreset(category, props);
    alert(`옵션이 저장되었습니다 (${category === 'full' ? '키큰장' : category === 'upper' ? '상부장' : '하부장'}). 같은 카테고리 가구에서 "속성 주입" 버튼으로 적용할 수 있어요.`);
  };

  const handleInjectClick = () => {
    if (!preset) return;
    setSelectedGroups(applicableIds);
    setShowInjectModal(true);
  };

  const handleInjectConfirm = () => {
    if (!preset) return;
    const allowedFields = new Set(
      FIELD_GROUPS
        .filter(g => selectedGroups.includes(g.id))
        .flatMap(g => g.fields)
    );
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(preset.props)) {
      if (allowedFields.has(k)) updates[k] = v;
    }
    if (Object.keys(updates).length > 0) {
      updatePlacedModule(placedModule.id, updates as any);
    }
    setShowInjectModal(false);
  };

  const toggleGroup = (gid: string) => {
    setSelectedGroups(prev =>
      prev.includes(gid) ? prev.filter(x => x !== gid) : [...prev, gid]
    );
  };

  const categoryLabel = category === 'full' ? '키큰장' : category === 'upper' ? '상부장' : category === 'lower' ? '하부장' : '';

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--theme-border)', background: 'var(--theme-bg-secondary, #f5f5f5)' }}>
      <button
        type="button"
        onClick={handleSave}
        style={{
          padding: '6px 12px',
          background: 'var(--theme-primary, #4a90d9)',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
        title={`현재 가구의 옵션을 ${categoryLabel} 카테고리 프리셋으로 저장`}
      >
        옵션 저장
      </button>
      <button
        type="button"
        onClick={handleInjectClick}
        disabled={!preset}
        style={{
          padding: '6px 12px',
          background: preset ? 'var(--theme-primary, #4a90d9)' : 'var(--theme-disabled, #ccc)',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: preset ? 'pointer' : 'not-allowed',
          opacity: preset ? 1 : 0.6,
        }}
        title={preset ? `저장된 ${categoryLabel} 프리셋을 이 가구에 주입` : `먼저 ${categoryLabel} 가구에서 옵션 저장을 해주세요`}
      >
        속성 주입
      </button>
      {preset && (
        <span style={{ fontSize: '11px', color: 'var(--theme-text-tertiary)' }}>
          {categoryLabel} 프리셋 저장됨
        </span>
      )}

      {showInjectModal && preset && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
          }}
          onClick={() => setShowInjectModal(false)}
        >
          <div
            style={{
              background: 'var(--theme-bg-primary, white)', borderRadius: '10px',
              padding: '28px 32px', minWidth: '520px', maxWidth: '640px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', color: 'var(--theme-text-primary)' }}>
              속성 주입 — {categoryLabel}
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--theme-text-tertiary)', marginBottom: '18px', lineHeight: 1.5 }}>
              적용할 그룹을 선택하세요. 가구 폭/높이/깊이/위치는 항상 제외됩니다.<br />
              현재 가구에 의미 없는 그룹은 자동으로 숨김 처리됩니다.
            </div>
            {applicableGroups.length === 0 ? (
              <div style={{ padding: '20px', fontSize: '13px', color: 'var(--theme-text-tertiary)', textAlign: 'center', background: 'var(--theme-bg-secondary, #f5f5f5)', borderRadius: '6px', marginBottom: '18px' }}>
                저장된 프리셋 중 이 가구에 적용 가능한 속성이 없습니다.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxHeight: '380px', overflowY: 'auto' }}>
                {applicableGroups.map(g => (
                  <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--theme-text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedGroups.includes(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      style={{ accentColor: 'var(--theme-primary, #4a90d9)', cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    {g.label}
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowInjectModal(false)}
                style={{ padding: '6px 14px', background: 'var(--theme-bg-secondary, #eee)', color: 'var(--theme-text-primary)', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleInjectConfirm}
                disabled={selectedGroups.length === 0}
                style={{
                  padding: '6px 14px',
                  background: selectedGroups.length > 0 ? 'var(--theme-primary, #4a90d9)' : '#ccc',
                  color: 'white', border: 'none', borderRadius: '4px',
                  fontSize: '12px', fontWeight: 600,
                  cursor: selectedGroups.length > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                주입
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FurniturePresetButtons;
