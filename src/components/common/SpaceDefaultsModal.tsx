import React, { useState, useEffect } from 'react';
import { getSpaceConfigDefaults, updateSpaceConfigDefaults, SpaceConfigDefaults } from '@/firebase/userProfiles';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import commonStyles from '@/editor/shared/controls/styles/common.module.css';
import styles from './SpaceDefaultsModal.module.css';

interface SpaceDefaultsModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

const SYSTEM_DEFAULTS: Required<SpaceConfigDefaults> = {
  width: 3600,
  height: 2360,
  gapLeft: 1.5,
  gapRight: 1.5,
  frameTop: 30,
  frameTopOffset: 0,
  frameLeft: 18,
  frameRight: 18,
  baseHeight: 60,
  baseFrameOffset: 0,
  baseFrameGap: 0,
  furnitureSingleWidth: 500,
  furnitureDualWidth: 1000,
  furnitureDepthDefaults: {
    wardrobe: 580,
    shoe: 380,
    lowerBasic: 580,
    lowerDoorLift: 580,
    lowerTopDown: 580,
    upper: 300,
    tall: 580,
  },
  placementType: 'slot',
  surroundMode: 'full-surround',
  installType: 'builtin' as const,
  droppedCeilingMode: 'none',
  droppedCeilingWidth: 1300,
  droppedCeilingDropHeight: 200,
  curtainBoxMode: 'none',
  hasFloorFinish: false,
  floorFinishHeight: 15,
  // 상단몰딩
  topMoldingEnabled: true,
  topMoldingSize: 10,
  topMoldingOffset: 0,
  topMoldingGap: 0,
  // 걸래받이 — 키큰장 (기존)
  baseboardEnabled: true,
  baseboardSize: 60,
  baseboardOffset: 0,
  baseboardGap: 0,
  // 걸래받이 — 하부장 (별도)
  baseboardLowerEnabled: true,
  baseboardLowerSize: 100,
  baseboardLowerOffset: 0,
  baseboardLowerGap: 0,
  // 도어 셋팅 — 몸통 기준 / 천장·바닥 기준 별도 저장
  doorSettingEnabled: true,
  doorGapMode: 'body',
  doorTopGap: 5,            // 몸통 기준 상단갭
  doorBottomGap: 25,        // 몸통 기준 하단갭
  doorTopGapCf: 70,         // 천장·바닥 기준 상단갭
  doorBottomGapCf: 100,     // 천장·바닥 기준 하단갭
  // 가구재/백패널 두께
  panelThickness: 18,
  backPanelThickness: 9,
};

const SURROUND_OPTIONS: { id: NonNullable<SpaceConfigDefaults['surroundMode']>; label: string }[] = [
  { id: 'full-surround', label: '전체서라운드' },
  { id: 'sides-only', label: '양쪽서라운드' },
  { id: 'no-surround', label: '노서라운드' },
];

const INSTALL_OPTIONS: { id: NonNullable<SpaceConfigDefaults['installType']>; label: string }[] = [
  { id: 'builtin', label: '양쪽벽' },
  { id: 'semistanding-left', label: '좌측벽' },
  { id: 'semistanding-right', label: '우측벽' },
  { id: 'freestanding', label: '벽없음' },
];

/* ── NumberInput ── */
interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({ label, value, onChange, min, max, step = 1, unit = 'mm' }) => {
  const [localValue, setLocalValue] = useState<string>(String(value));

  // 외부 value 변경 시 로컬 동기화
  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  const commit = (raw: string) => {
    if (raw === '' || raw === '-') {
      setLocalValue(String(value));
      return;
    }
    const v = Number(raw);
    if (isNaN(v)) {
      setLocalValue(String(value));
      return;
    }
    const clamped = Math.max(lo, Math.min(hi, v));
    onChange(clamped);
    setLocalValue(String(clamped));
  };

  return (
    <div className={styles.numberInput}>
      <div className={styles.inputLabel}>{label}</div>
      <div className={styles.inputGroup}>
        <button type="button" className={styles.inputButton} onClick={() => onChange(Math.max(lo, value - step))} disabled={value <= lo}>−</button>
        <div className={styles.inputField}>
          <input
            type="text"
            inputMode="decimal"
            value={localValue}
            onChange={(e) => {
              const v = e.target.value;
              // 음수 입력 허용: 빈 문자열, '-' 단독, 숫자/소수점/마이너스 조합 허용
              if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) {
                setLocalValue(v);
              }
            }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
          />
          <span className={styles.inputUnit}>{unit}</span>
        </div>
        <button type="button" className={styles.inputButton} onClick={() => onChange(Math.min(hi, value + step))} disabled={value >= hi}>+</button>
      </div>
    </div>
  );
};

/* ── ToggleGroup ── */
const Toggle: React.FC<{ options: { id: string; label: string }[]; selected: string; onChange: (id: string) => void }> = ({ options, selected, onChange }) => (
  <div className={commonStyles.toggleButtonGroup}>
    {options.map(opt => (
      <button type="button" key={opt.id} className={`${commonStyles.toggleButton} ${selected === opt.id ? commonStyles.toggleButtonActive : ''}`} onClick={() => onChange(opt.id)}>
        {opt.label}
      </button>
    ))}
  </div>
);

/* ── Main Modal ── */
const SpaceDefaultsModal: React.FC<SpaceDefaultsModalProps> = ({ onClose, onSaved }) => {
  const [values, setValues] = useState<Required<SpaceConfigDefaults>>(SYSTEM_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'space' | 'furniture'>('space');

  useEffect(() => {
    const load = async () => {
      const defaults = await getSpaceConfigDefaults();
      if (defaults) {
        const cleanDefaults = Object.fromEntries(Object.entries(defaults).filter(([, v]) => v !== undefined));
        setValues(prev => ({
          ...prev,
          ...cleanDefaults,
          furnitureDepthDefaults: {
            ...prev.furnitureDepthDefaults,
            ...defaults.furnitureDepthDefaults,
          },
        }));
      }
      setLoading(false);
    };
    load();
  }, []);

  const set = <K extends keyof SpaceConfigDefaults>(key: K, value: SpaceConfigDefaults[K]) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const h = (key: keyof SpaceConfigDefaults) => (v: number) => set(key, v);

  const hDepth = (key: keyof NonNullable<SpaceConfigDefaults['furnitureDepthDefaults']>) => (v: number) => {
    setValues(prev => ({
      ...prev,
      furnitureDepthDefaults: {
        ...prev.furnitureDepthDefaults,
        [key]: v,
      },
    }));
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    // 새 필드(topMoldingSize/baseboardSize)를 옛 필드(frameTop/baseHeight)에도 동기화
    // → 모든 컴포넌트가 어느 필드를 읽든 같은 값 반영됨
    const synced = {
      ...values,
      frameTop: values.topMoldingEnabled ? values.topMoldingSize : 0,
      frameTopOffset: values.topMoldingOffset,
      baseHeight: values.baseboardEnabled ? values.baseboardSize : 0,
      baseFrameOffset: values.baseboardOffset,
      baseFrameGap: values.baseboardGap,
    };
    const { error } = await updateSpaceConfigDefaults(synced);
    setSaving(false);
    if (error) {
      setMessage({ text: error, type: 'error' });
    } else {
      const spaceState = useSpaceConfigStore.getState();
      const curFrameSize = spaceState.spaceInfo.frameSize ?? { top: 30, left: 18, right: 18 };
      const curBaseConfig = spaceState.spaceInfo.baseConfig ?? { type: 'floor', height: 65 };
      spaceState.setSpaceInfo({
        frameSize: {
          ...curFrameSize,
          top: synced.frameTop,
          topOffset: synced.frameTopOffset,
          topGap: synced.topMoldingGap ?? 0,
        } as any,
        baseConfig: {
          ...curBaseConfig,
          type: synced.baseHeight > 0 ? 'floor' : curBaseConfig?.type ?? 'floor',
          height: synced.baseHeight,
          offset: synced.baseFrameOffset,
          gap: synced.baseFrameGap ?? 0,
        } as any,
        doorTopGap: synced.doorTopGap,
        doorBottomGap: synced.doorBottomGap,
        furnitureDepthDefaults: values.furnitureDepthDefaults,
      });
      console.log('[SpaceDefaultsModal] saved & applied:', {
        topMoldingEnabled: values.topMoldingEnabled,
        topMoldingGap: values.topMoldingGap,
        frameTop: synced.frameTop,
        frameSize_topGap: synced.topMoldingGap,
      });
      useUIStore.getState().setDoorGapDisplayMode(synced.doorGapMode);
      const cb = onSaved;
      onClose();
      if (cb) cb();
    }
  };

  if (loading) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>공간설정 기본값</h3>
          <button type="button" className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {/* 탭 바 */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--theme-border)',
            background: 'var(--theme-surface, transparent)',
          }}
        >
          {[
            { id: 'space' as const, label: '공간' },
            { id: 'furniture' as const, label: '가구' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? '2px solid var(--theme-primary)' : '2px solid transparent',
                  color: active ? 'var(--theme-primary)' : 'var(--theme-text-secondary, #7a7f9a)',
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className={styles.body}>
          <div className={styles.notice}>새 프로젝트에서부터 적용됩니다.</div>

          {activeTab === 'space' && (<>

          {/* 공간유형 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>공간유형</div>
            <Toggle options={INSTALL_OPTIONS} selected={values.installType} onChange={(id) => set('installType', id as any)} />
          </div>

          {/* 공간 크기 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>공간 크기</div>
            <div className={styles.row}>
              <NumberInput label="너비 (W)" value={values.width} onChange={h('width')} min={1000} max={8000} step={100} />
              <NumberInput label="높이 (H)" value={values.height} onChange={h('height')} min={2000} max={3000} step={100} />
            </div>
          </div>

          {/* 단내림 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>단내림</div>
            <Toggle
              options={[{ id: 'none', label: '없음' }, { id: 'left', label: '좌단내림' }, { id: 'right', label: '우단내림' }]}
              selected={values.droppedCeilingMode}
              onChange={(id) => set('droppedCeilingMode', id as any)}
            />
            {values.droppedCeilingMode !== 'none' && (
              <div className={styles.row}>
                <NumberInput label="내림높이" value={values.droppedCeilingDropHeight} onChange={h('droppedCeilingDropHeight')} min={50} max={500} step={10} />
                <NumberInput label="단내림 너비" value={values.droppedCeilingWidth} onChange={h('droppedCeilingWidth')} min={600} max={2400} step={100} />
              </div>
            )}
          </div>

          {/* 커튼박스 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>커튼박스</div>
            <Toggle
              options={[{ id: 'none', label: '없음' }, { id: 'left', label: '좌측' }, { id: 'right', label: '우측' }]}
              selected={values.curtainBoxMode}
              onChange={(id) => set('curtainBoxMode', id as any)}
            />
          </div>

          {/* 이격거리 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>이격거리</div>
            <div className={styles.row}>
              <NumberInput label="좌측" value={values.gapLeft} onChange={h('gapLeft')} min={0} max={100} step={0.5} />
              <NumberInput label="우측" value={values.gapRight} onChange={h('gapRight')} min={0} max={100} step={0.5} />
            </div>
          </div>

          {/* 프레임 타입 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>프레임 타입</div>
            <Toggle options={SURROUND_OPTIONS} selected={values.surroundMode} onChange={(id) => set('surroundMode', id as any)} />
          </div>

          {/* 배치타입 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>배치타입</div>
            <Toggle
              options={[{ id: 'slot', label: '슬롯 배치' }, { id: 'free', label: '자유 배치' }]}
              selected={values.placementType}
              onChange={(id) => set('placementType', id as any)}
            />
          </div>

          {/* 카테고리별 기본 깊이 — 가구 탭으로 이동됨 */}
          <div className={styles.section} style={{ display: 'none' }}>
            <div className={styles.sectionLabel}>카테고리별 기본 깊이</div>
            <div className={styles.row}>
              <NumberInput label="의류장" value={values.furnitureDepthDefaults.wardrobe ?? 580} onChange={hDepth('wardrobe')} min={100} max={1200} step={10} />
              <NumberInput label="신발장" value={values.furnitureDepthDefaults.shoe ?? 380} onChange={hDepth('shoe')} min={100} max={1200} step={10} />
            </div>
            <div className={styles.row}>
              <NumberInput label="기본하부장" value={values.furnitureDepthDefaults.lowerBasic ?? 580} onChange={hDepth('lowerBasic')} min={100} max={1200} step={10} />
              <NumberInput label="도어올림하부장" value={values.furnitureDepthDefaults.lowerDoorLift ?? 580} onChange={hDepth('lowerDoorLift')} min={100} max={1200} step={10} />
            </div>
            <div className={styles.row}>
              <NumberInput label="상판내림하부장" value={values.furnitureDepthDefaults.lowerTopDown ?? 580} onChange={hDepth('lowerTopDown')} min={100} max={1200} step={10} />
              <NumberInput label="상부장" value={values.furnitureDepthDefaults.upper ?? 300} onChange={hDepth('upper')} min={100} max={1200} step={10} />
            </div>
            <div className={styles.row}>
              <NumberInput label="키큰장" value={values.furnitureDepthDefaults.tall ?? 580} onChange={hDepth('tall')} min={100} max={1200} step={10} />
            </div>
          </div>

          {/* 바닥마감재 상태 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>바닥마감재 상태</div>
            <Toggle
              options={[{ id: 'finished', label: '바닥재 시공완료' }, { id: 'pending', label: '시공예정' }]}
              selected={values.hasFloorFinish ? 'pending' : 'finished'}
              onChange={(id) => set('hasFloorFinish', id === 'pending')}
            />
            {values.hasFloorFinish && (
              <div className={styles.row}>
                <NumberInput label="두께" value={values.floorFinishHeight} onChange={h('floorFinishHeight')} min={5} max={100} step={1} />
              </div>
            )}
          </div>

          {/* 상단몰딩 */}
          {/* 가구재 두께 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>가구재 두께</div>
            <Toggle
              options={[
                { id: '15', label: '15mm' },
                { id: '15.5', label: '15.5mm' },
                { id: '18', label: '18mm' },
                { id: '18.5', label: '18.5mm' },
              ]}
              selected={String(values.panelThickness ?? 18)}
              onChange={(id) => set('panelThickness', Number(id) as any)}
            />
          </div>

          {/* 백패널 두께 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>백패널 두께</div>
            <Toggle
              options={[
                { id: '3', label: '3mm' },
                { id: '4.5', label: '4.5mm' },
                { id: '6', label: '6mm' },
                { id: '9', label: '9mm' },
              ]}
              selected={String(values.backPanelThickness ?? 9)}
              onChange={(id) => set('backPanelThickness', Number(id) as any)}
            />
          </div>

          </>)}

          {activeTab === 'furniture' && (<>

          {/* 카테고리별 기본 깊이 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>카테고리별 기본 깊이</div>
            <div className={styles.row}>
              <NumberInput label="의류장" value={values.furnitureDepthDefaults.wardrobe ?? 580} onChange={hDepth('wardrobe')} min={100} max={1200} step={10} />
              <NumberInput label="신발장" value={values.furnitureDepthDefaults.shoe ?? 380} onChange={hDepth('shoe')} min={100} max={1200} step={10} />
            </div>
            <div className={styles.row}>
              <NumberInput label="기본하부장" value={values.furnitureDepthDefaults.lowerBasic ?? 580} onChange={hDepth('lowerBasic')} min={100} max={1200} step={10} />
              <NumberInput label="도어올림하부장" value={values.furnitureDepthDefaults.lowerDoorLift ?? 580} onChange={hDepth('lowerDoorLift')} min={100} max={1200} step={10} />
            </div>
            <div className={styles.row}>
              <NumberInput label="상판내림하부장" value={values.furnitureDepthDefaults.lowerTopDown ?? 580} onChange={hDepth('lowerTopDown')} min={100} max={1200} step={10} />
              <NumberInput label="상부장" value={values.furnitureDepthDefaults.upper ?? 300} onChange={hDepth('upper')} min={100} max={1200} step={10} />
            </div>
            <div className={styles.row}>
              <NumberInput label="키큰장" value={values.furnitureDepthDefaults.tall ?? 580} onChange={hDepth('tall')} min={100} max={1200} step={10} />
            </div>
          </div>

          {/* 상단몰딩 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!values.topMoldingEnabled}
                  onChange={(e) => set('topMoldingEnabled', e.target.checked)}
                  style={{ accentColor: 'var(--theme-primary)' }}
                />
                상단몰딩
              </label>
            </div>
            {values.topMoldingEnabled ? (
              <div className={styles.row} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <NumberInput label="size" value={values.topMoldingSize} onChange={h('topMoldingSize')} min={0} max={200} step={1} />
                <NumberInput label="옵셋" value={values.topMoldingOffset} onChange={h('topMoldingOffset')} min={-200} max={200} step={1} />
                <NumberInput label="갭" value={values.topMoldingGap} onChange={h('topMoldingGap')} min={0} max={200} step={1} />
              </div>
            ) : (
              <div className={styles.row}>
                <NumberInput label="상단갭" value={values.topMoldingGap} onChange={h('topMoldingGap')} min={0} max={2000} step={1} />
              </div>
            )}
          </div>

          {/* 걸래받이 — 키큰장 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!values.baseboardEnabled}
                  onChange={(e) => set('baseboardEnabled', e.target.checked)}
                  style={{ accentColor: 'var(--theme-primary)' }}
                />
                걸래받이 — 키큰장
              </label>
            </div>
            {values.baseboardEnabled ? (
              <div className={styles.row} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <NumberInput label="size" value={values.baseboardSize} onChange={h('baseboardSize')} min={0} max={300} step={1} />
                <NumberInput label="옵셋" value={values.baseboardOffset} onChange={h('baseboardOffset')} min={-200} max={200} step={1} />
                <NumberInput label="갭" value={values.baseboardGap} onChange={h('baseboardGap')} min={0} max={200} step={1} />
              </div>
            ) : (
              <div className={styles.row}>
                <NumberInput label="띄움높이" value={values.baseboardGap} onChange={h('baseboardGap')} min={0} max={2000} step={1} />
              </div>
            )}
          </div>

          {/* 걸래받이 — 하부장 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!values.baseboardLowerEnabled}
                  onChange={(e) => set('baseboardLowerEnabled', e.target.checked)}
                  style={{ accentColor: 'var(--theme-primary)' }}
                />
                걸래받이 — 하부장
              </label>
            </div>
            {values.baseboardLowerEnabled ? (
              <div className={styles.row} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <NumberInput label="size" value={values.baseboardLowerSize} onChange={h('baseboardLowerSize')} min={0} max={300} step={1} />
                <NumberInput label="옵셋" value={values.baseboardLowerOffset} onChange={h('baseboardLowerOffset')} min={-200} max={200} step={1} />
                <NumberInput label="갭" value={values.baseboardLowerGap} onChange={h('baseboardLowerGap')} min={0} max={200} step={1} />
              </div>
            ) : (
              <div className={styles.row}>
                <NumberInput label="띄움높이" value={values.baseboardLowerGap} onChange={h('baseboardLowerGap')} min={0} max={2000} step={1} />
              </div>
            )}
          </div>

          {/* 도어 셋팅 — 몸통 기준 고정 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!values.doorSettingEnabled}
                  onChange={(e) => set('doorSettingEnabled', e.target.checked)}
                  style={{ accentColor: 'var(--theme-primary)' }}
                />
                도어 셋팅
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--theme-text-muted)' }}>(몸통기준)</span>
              </label>
            </div>
            {values.doorSettingEnabled && (
              <div className={styles.row}>
                <NumberInput label="상단갭" value={values.doorTopGap} onChange={h('doorTopGap')} min={0} max={200} step={1} />
                <NumberInput label="하단갭" value={values.doorBottomGap} onChange={h('doorBottomGap')} min={0} max={200} step={1} />
              </div>
            )}
          </div>

          {/* 가구 배치 기본 너비 (자유배치일 때만) */}
          {values.placementType === 'free' && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>가구 배치 기본 너비</div>
              <div className={styles.row}>
                <NumberInput label="싱글" value={values.furnitureSingleWidth} onChange={h('furnitureSingleWidth')} min={200} max={1200} step={10} />
                <NumberInput label="듀얼" value={values.furnitureDualWidth} onChange={h('furnitureDualWidth')} min={400} max={2400} step={10} />
              </div>
            </div>
          )}

          </>)}
        </div>

        {/* 푸터 */}
        <div className={styles.footer}>
          {message && (
            <span className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`}>
              {message.text}
            </span>
          )}
          <div className={styles.footerButtons}>
            <button type="button" className={styles.resetButton} onClick={() => { setValues(SYSTEM_DEFAULTS); setMessage(null); }}>초기화</button>
            <button type="button" className={styles.saveButton} onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpaceDefaultsModal;
