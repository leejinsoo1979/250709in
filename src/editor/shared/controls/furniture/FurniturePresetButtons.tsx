import React, { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import type { PlacedModule } from '@/editor/shared/furniture/types';
import {
  buildFurniturePresetUpdates,
  collectFurniturePresetProps,
  getApplicableFurniturePresetGroups,
  getFurniturePresetCategory,
  getFurniturePresetCategoryLabel,
} from './furniturePresetTransfer';

interface FurniturePresetButtonsProps {
  placedModule: PlacedModule;
  moduleCategory?: string;
}

export const FurniturePresetButtons: React.FC<FurniturePresetButtonsProps> = ({ placedModule, moduleCategory }) => {
  const furniturePresets = useUIStore(state => state.furniturePresets);
  const setFurniturePreset = useUIStore(state => state.setFurniturePreset);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);

  const category = getFurniturePresetCategory(placedModule, moduleCategory);
  const preset = category ? furniturePresets[category] : undefined;

  // 현재 가구에 적용 가능한 그룹만 노출 (의미 없는 도어/EP/마이다 등은 숨김)
  const applicableGroups = getApplicableFurniturePresetGroups(preset?.props, placedModule, category);
  const applicableIds = applicableGroups.map(g => g.id);

  const [showInjectModal, setShowInjectModal] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(applicableIds);

  const handleSave = () => {
    if (!category) return;
    const props = collectFurniturePresetProps(placedModule);
    setFurniturePreset(category, props);
    alert(`속성이 저장되었습니다 (${category === 'full' ? '키큰장' : category === 'upper' ? '상부장' : '하부장'}). 같은 카테고리 가구에서 "속성 이식" 버튼으로 적용할 수 있어요.`);
  };

  const handleInjectClick = () => {
    if (!preset) return;
    setSelectedGroups(applicableIds);
    setShowInjectModal(true);
  };

  const handleInjectConfirm = () => {
    if (!preset) return;
    const updates = buildFurniturePresetUpdates(preset.props, selectedGroups, placedModule);
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

  const categoryLabel = getFurniturePresetCategoryLabel(category);

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
        title={`현재 가구의 속성을 ${categoryLabel} 카테고리 프리셋으로 저장`}
      >
        속성 저장
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
        title={preset ? `저장된 ${categoryLabel} 프리셋을 이 가구에 이식` : `먼저 ${categoryLabel} 가구에서 속성 저장을 해주세요`}
      >
        속성 이식
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
              속성 이식 — {categoryLabel}
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--theme-text-tertiary)', marginBottom: '18px', lineHeight: 1.5 }}>
              적용할 그룹을 선택하세요. 가구 폭/위치는 항상 제외됩니다.<br />
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
                이식
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FurniturePresetButtons;
