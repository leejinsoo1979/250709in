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
    label: '도어 설정 (갭, 확장량, 경첩, 도어 분할/확장)',
    fields: [
      'hasDoor',
      'doorTopGap', 'doorBottomGap',
      'doorWidthAdjustEnabled', 'doorWidthAdjustMm',
      'hingePosition', 'hingeType',
      'hingePositionsMm', 'upperDoorHingePositionsMm', 'lowerDoorHingePositionsMm',
      'doorSettingMode', 'doorOverlayLeft', 'doorOverlayRight', 'doorOverlayTop', 'doorOverlayBottom',
      'doorSplit',
    ],
  },
  {
    id: 'drawer',
    label: '마이다 / 서랍 (개별 높이, 레그라 종류)',
    fields: [
      'customMaidaHeights',
      'legraDrawerTypes',
      'glassDrawerOffsetMm',
    ],
  },
  {
    id: 'topBottom',
    label: '상부몰딩 / 걸레받이 (사이즈, 옵셋, 갭, 띄움)',
    fields: [
      'hasTopFrame', 'topFrameThickness', 'topFrameOffset', 'topFrameGap',
      'hasBase', 'hasBottomFrame', 'baseFrameHeight', 'baseFrameOffset', 'baseFrameGap',
      'individualFloatHeight',
      'cabinetBodyHeight',
    ],
  },
  {
    id: 'backPanel',
    label: '백패널 (두께, 갭 백패널, 뒷벽 이격)',
    fields: [
      'backPanelThickness',
      'hasBackPanel', 'hasGapBackPanel',
      'backWallGap',
    ],
  },
  {
    id: 'endPanel',
    label: '엔드패널 (좌/우 EP, 두께, 깊이, 옵셋, 높이 모드)',
    fields: [
      'hasLeftEndPanel', 'hasRightEndPanel',
      'endPanelThickness', 'endPanelDepth', 'endPanelDepthDirection',
      'endPanelOffset',
      'leftEndPanelOffset', 'rightEndPanelOffset',
      'leftEndPanelBackOffset', 'rightEndPanelBackOffset',
      'endPanelHeightMode', 'endPanelTopOffset', 'endPanelBottomOffset',
    ],
  },
  {
    id: 'shelfRod',
    label: '옷봉 / 선반 / 내부 구성 (커스텀 섹션)',
    fields: ['customConfig', 'customSections'],
  },
  {
    id: 'rodShelf',
    label: '옷봉선반 옵션 (안전선반 제거, 상부 선반 갭)',
    fields: [
      'removeUpperSafetyShelf',
      'upperShelfTopGap',
      'insertFrontInsetMm',
    ],
  },
  {
    id: 'topNotch',
    label: '상판 따내기 / 상판설치 (인조대리석/PET)',
    fields: [
      'topPanelNotchSize', 'topPanelNotchSide',
      'stoneTopMaterial', 'stoneTopThickness',
      'stoneTopFrontOffset', 'stoneTopBackOffset', 'stoneTopLeftOffset', 'stoneTopRightOffset',
      'stoneTopBackLip', 'stoneTopBackLipThickness',
      'stoneTopBackLipDepthOffset', 'stoneTopBackLipTopOffset', 'stoneTopBackLipTopBackOffset',
      'stoneTopBackLipFullFill', 'stoneTopBackLipFillHeight',
    ],
  },
  {
    id: 'materialColor',
    label: '재질 / 색상 (속장/도어/엣지/결방향)',
    fields: [
      'doorColor', 'doorTextureUrl', 'doorMaterial',
      'bodyColor', 'bodyTextureUrl', 'bodyMaterial',
      'interiorEdgeColor', 'doorEdgeColor',
      'panelGrainDirections',
      'panelExclusions',
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

// 그룹별로 현재 가구에 적용 가능한지 판단 (가구 종류 기반).
//   - 프리셋에 해당 필드가 없어도 가구가 이 옵션을 가질 수 있으면 표시 (적용 가능).
//   - 저장 시점에 사용자가 어떤 값이든 변경했을 수 있으므로 너무 엄격하게 판단하면 안 됨.
const isGroupApplicable = (
  groupId: string,
  _presetProps: Record<string, any> | undefined,
  targetModule: PlacedModule,
  category: 'full' | 'upper' | 'lower' | null,
): boolean => {
  const id = (targetModule.moduleId || '').toLowerCase();
  const mod = targetModule as any;

  switch (groupId) {
    case 'door': {
      // 도어 가질 수 있는 가구만 (insert-frame 같은 채움재는 제외)
      if (id.includes('insert-frame')) return false;
      return mod.hasDoor !== false; // hasDoor가 명시적 false가 아니면 표시
    }
    case 'drawer': {
      // 마이다/서랍 가구만
      return /lower-drawer-|lower-induction-cabinet-|lower-door-lift-touch|lower-top-down-touch/.test(id);
    }
    case 'topBottom': {
      // 상부장은 상부몰딩/걸레받이 무관
      return category !== 'upper';
    }
    case 'backPanel':
      // 거의 모든 가구가 가짐
      return !id.includes('insert-frame');
    case 'endPanel':
      // 자유배치이거나 EP 옵션이 있는 가구 (사실상 모든 가구)
      return !id.includes('insert-frame');
    case 'shelfRod': {
      // 커스텀/커스터마이즈 가능 가구만
      return id.startsWith('customizable-') || !!mod.customSections || !!mod.customConfig;
    }
    case 'rodShelf': {
      // 옷봉/선반 있는 가구 (코트장, 붙박이장 시리즈, 키큰장 일부) — 상부 안전선반 옵션
      // 너무 엄격하지 않게: 상부장 제외하고 표시
      return category !== 'upper' && !id.includes('insert-frame');
    }
    case 'topNotch': {
      // 상부장 코너 노치, 하부장 상판설치
      return category === 'upper' || category === 'lower';
    }
    case 'materialColor':
      // 모든 가구
      return true;
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
    alert(`속성이 저장되었습니다 (${category === 'full' ? '키큰장' : category === 'upper' ? '상부장' : '하부장'}). 같은 카테고리 가구에서 "속성 이식" 버튼으로 적용할 수 있어요.`);
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
