// iPadRightPanel — 시안 Image #78 기준 우측 속성 패널 재작성
// 웹 Configurator/* 건드리지 않음
import React, { useState } from 'react';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useSpaceInfoHandler } from './useSpaceInfoHandler';

// ─── 디자인 토큰 ───────────────────────────────────────────────
const T = {
  primary:   '#3B82F6',
  primary50: '#EFF6FF',
  bg:        '#FFFFFF',
  bg2:       '#F9FAFB',
  bg3:       '#F3F4F6',
  surface:   '#FFFFFF',
  ink:       '#111827',
  ink2:      '#4B5563',
  ink3:      '#9CA3AF',
  line:      '#E5E7EB',
  line2:     '#F3F4F6',
  blueAct:   '#3B82F6',
};

// ─── 공용 컴포넌트 ─────────────────────────────────────────────

/** 섹션 헤더: ● 제목 (?) */
const SectionHeader: React.FC<{ title: string; help?: string }> = ({ title, help }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '14px 14px 8px',
    fontSize: 13, fontWeight: 600, color: T.ink,
  }}>
    <span style={{ width: 6, height: 6, borderRadius: 3, background: T.blueAct }}/>
    <span>{title}</span>
    {help && (
      <span style={{
        width: 15, height: 15, borderRadius: '50%',
        background: T.bg3, color: T.ink3, fontSize: 10,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginLeft: 2, cursor: 'help', fontWeight: 500,
      }} title={help}>?</span>
    )}
  </div>
);

/** 세그먼트 버튼 (시안 기준: 활성=파란배경/흰글자, 비활성=흰배경/회색글자+보더) */
const SegBtn: React.FC<{
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  flex?: boolean;
}> = ({ active, onClick, children, flex }) => (
  <button onClick={onClick} style={{
    flex: flex ? '1 1 0' : undefined,
    minWidth: 0, minHeight: 30,
    padding: '6px 10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? T.blueAct : T.surface,
    color: active ? '#fff' : T.ink2,
    border: `1px solid ${active ? T.blueAct : T.line}`,
    borderRadius: 6, cursor: 'pointer',
    fontSize: 12, fontWeight: active ? 600 : 500,
    whiteSpace: 'nowrap', transition: 'all 0.12s',
  }}>{children}</button>
);

/** 세그먼트 그룹 래퍼 */
const SegRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px' }}>{children}</div>
);

/** mm 단위 숫자 입력 (W/H 같은 박스 입력) */
const NumInput: React.FC<{
  label?: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  flex?: boolean;
}> = ({ label, value, onChange, suffix = 'mm', flex }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: flex ? '1 1 0' : undefined }}>
    {label && <span style={{ fontSize: 12, color: T.ink2, fontWeight: 600 }}>{label}</span>}
    <div style={{
      flex: 1, minWidth: 0,
      display: 'flex', alignItems: 'center',
      border: `1px solid ${T.line}`, borderRadius: 6,
      background: T.surface, overflow: 'hidden', height: 32,
    }}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          flex: 1, border: 'none', outline: 'none',
          textAlign: 'center', fontSize: 12,
          background: 'transparent', color: T.ink,
          padding: '0 4px', width: '100%',
        }}
      />
      {suffix && (
        <span style={{ padding: '0 8px', fontSize: 11, color: T.ink3 }}>{suffix}</span>
      )}
    </div>
  </div>
);

/** +/- 스테퍼 입력 */
const Stepper: React.FC<{
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}> = ({ value, onChange, step = 0.5, min = 0, max = 50 }) => (
  <div style={{
    display: 'flex', alignItems: 'center',
    border: `1px solid ${T.line}`, borderRadius: 6,
    background: T.surface, overflow: 'hidden', height: 30,
  }}>
    <button
      onClick={() => onChange(Math.max(min, value - step))}
      style={{
        width: 28, height: '100%', border: 'none',
        background: T.bg2, color: T.ink2, fontSize: 14,
        cursor: 'pointer', fontWeight: 600,
      }}
    >−</button>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        flex: 1, border: 'none', outline: 'none',
        textAlign: 'center', fontSize: 12,
        background: T.surface, color: T.ink,
        padding: '0 4px', width: '100%', minWidth: 0,
      }}
    />
    <button
      onClick={() => onChange(Math.min(max, value + step))}
      style={{
        width: 28, height: '100%', border: 'none',
        background: T.bg2, color: T.ink2, fontSize: 14,
        cursor: 'pointer', fontWeight: 600,
      }}
    >+</button>
  </div>
);

/** iOS 스타일 토글 스위치 (파란색) */
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <button
    className="ipad-toggle-switch"
    onClick={() => onChange(!checked)}
    style={{
      width: 36, height: 20, borderRadius: 12,
      background: checked ? T.blueAct : T.bg3,
      border: 'none', cursor: 'pointer', padding: 0,
      position: 'relative', transition: 'background 0.2s',
      flexShrink: 0,
    }}
  >
    <span style={{
      position: 'absolute',
      top: 2, left: checked ? 18 : 2,
      width: 16, height: 16, borderRadius: '50%',
      background: '#fff',
      transition: 'left 0.2s',
      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
    }}/>
  </button>
);

/** 프레임 행: [라벨 | 토글] [size | input] [옵션 | input]
 * 공간이 좁을 때 겹치지 않도록 충분한 최소 폭 보장 */
const FrameRow: React.FC<{
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  sizeValue: number;
  onSizeChange: (v: number) => void;
  optionValue: number;
  onOptionChange: (v: number) => void;
}> = ({ label, enabled, onToggle, sizeValue, onSizeChange, optionValue, onOptionChange }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
  }}>
    {/* 라벨 + 토글 그룹 */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      flexShrink: 0, minWidth: 80,
    }}>
      <span style={{ fontSize: 12, color: T.ink2, fontWeight: 500, minWidth: 34 }}>{label}</span>
      <Toggle checked={enabled} onChange={onToggle} />
    </div>

    {/* size 그룹 */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 0', minWidth: 0 }}>
      <span style={{ fontSize: 11, color: T.ink3, flexShrink: 0 }}>size</span>
      <input
        type="number"
        value={sizeValue}
        onChange={(e) => onSizeChange(Number(e.target.value))}
        disabled={!enabled}
        style={{
          flex: 1, minWidth: 0,
          height: 28, border: `1px solid ${T.line}`, borderRadius: 5,
          outline: 'none', fontSize: 12, textAlign: 'center',
          background: enabled ? T.surface : T.bg2,
          color: enabled ? T.ink : T.ink3,
          padding: '0 4px',
        }}
      />
    </div>

    {/* 옵션 그룹 */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 0', minWidth: 0 }}>
      <span style={{ fontSize: 11, color: T.ink3, flexShrink: 0 }}>옵션</span>
      <input
        type="number"
        value={optionValue}
        onChange={(e) => onOptionChange(Number(e.target.value))}
        disabled={!enabled}
        style={{
          flex: 1, minWidth: 0,
          height: 28, border: `1px solid ${T.line}`, borderRadius: 5,
          outline: 'none', fontSize: 12, textAlign: 'center',
          background: enabled ? T.surface : T.bg2,
          color: enabled ? T.ink : T.ink3,
          padding: '0 4px',
        }}
      />
    </div>
  </div>
);

// ─── Main Panel ────────────────────────────────────────────────

interface IPadRightPanelProps {
  spaceInfo: SpaceInfo;
  setSpaceInfo: (updates: Partial<SpaceInfo>) => void;
}

const IPadRightPanel: React.FC<IPadRightPanelProps> = ({ spaceInfo }) => {
  const { handleSpaceInfoUpdate } = useSpaceInfoHandler();
  const [previewOpen, setPreviewOpen] = useState(false);

  // 공간 유형 매핑
  const installType = spaceInfo.installType || 'builtin';
  const wallConfig = spaceInfo.wallConfig || { left: true, right: true };
  const getSpaceType = (): 'both' | 'left' | 'right' | 'none' => {
    if (installType === 'freestanding') return 'none';
    if (installType === 'builtin') return 'both';
    if (wallConfig.left && !wallConfig.right) return 'left';
    if (!wallConfig.left && wallConfig.right) return 'right';
    return 'both';
  };
  const setSpaceType = (t: 'both' | 'left' | 'right' | 'none') => {
    if (t === 'both') handleSpaceInfoUpdate({ installType: 'builtin', wallConfig: { left: true, right: true } });
    else if (t === 'left') handleSpaceInfoUpdate({ installType: 'semistanding', wallConfig: { left: true, right: false } });
    else if (t === 'right') handleSpaceInfoUpdate({ installType: 'semistanding', wallConfig: { left: false, right: true } });
    else handleSpaceInfoUpdate({ installType: 'freestanding', wallConfig: { left: false, right: false } });
  };

  // 단내림
  const dropEnabled = !!spaceInfo.droppedCeiling?.enabled;
  const dropPos = spaceInfo.droppedCeiling?.position || 'left';
  const getDrop = (): 'none' | 'left' | 'right' => {
    if (!dropEnabled) return 'none';
    return dropPos as 'left' | 'right';
  };
  const setDrop = (d: 'none' | 'left' | 'right') => {
    if (d === 'none') handleSpaceInfoUpdate({ droppedCeiling: { ...(spaceInfo.droppedCeiling ?? {}), enabled: false } as any });
    else handleSpaceInfoUpdate({ droppedCeiling: { ...(spaceInfo.droppedCeiling ?? {}), enabled: true, position: d, dropHeight: spaceInfo.droppedCeiling?.dropHeight ?? 200 } as any });
  };

  // 커튼박스
  const curtain = (spaceInfo.curtainBox?.enabled ? (spaceInfo.curtainBox.position || 'left') : 'none') as 'none' | 'left' | 'right';
  const setCurtain = (c: 'none' | 'left' | 'right') => {
    if (c === 'none') handleSpaceInfoUpdate({ curtainBox: { ...(spaceInfo.curtainBox ?? {}), enabled: false } as any });
    else handleSpaceInfoUpdate({ curtainBox: { ...(spaceInfo.curtainBox ?? {}), enabled: true, position: c } as any });
  };

  // 서라운드
  const surround = (spaceInfo.surroundType || 'no-surround') as 'surround' | 'both-surround' | 'no-surround';
  const setSurround = (s: 'surround' | 'both-surround' | 'no-surround') => {
    handleSpaceInfoUpdate({ surroundType: s as any });
  };

  // 이격
  const leftGap = spaceInfo.gapConfig?.left ?? 1.5;
  const rightGap = spaceInfo.gapConfig?.right ?? 1.5;
  const setLeftGap = (v: number) => handleSpaceInfoUpdate({ gapConfig: { ...(spaceInfo.gapConfig ?? {}), left: v } as any });
  const setRightGap = (v: number) => handleSpaceInfoUpdate({ gapConfig: { ...(spaceInfo.gapConfig ?? {}), right: v } as any });

  // 상/하부 프레임
  const frameSize = spaceInfo.frameSize || { top: 30, bottom: 0, left: 50, right: 50 };
  const topEnabled = frameSize.top > 0;
  const bottomEnabled = (spaceInfo.baseConfig?.type === 'floor');
  const topSize = frameSize.top ?? 30;
  const bottomSize = spaceInfo.baseConfig?.height ?? 65;
  const setTopSize = (v: number) => handleSpaceInfoUpdate({ frameSize: { ...frameSize, top: v } });
  const setTopEnabled = (v: boolean) => handleSpaceInfoUpdate({ frameSize: { ...frameSize, top: v ? (topSize || 30) : 0 } });
  const setBottomSize = (v: number) => handleSpaceInfoUpdate({ baseConfig: { ...(spaceInfo.baseConfig ?? {}), type: 'floor', height: v } as any });
  const setBottomEnabled = (v: boolean) => handleSpaceInfoUpdate({ baseConfig: { ...(spaceInfo.baseConfig ?? {}), type: v ? 'floor' : 'stand', height: v ? (bottomSize || 65) : 0 } as any });

  // 옵션 (상/하부 offset) — 임시로 로컬 state 저장 (SpaceInfo 스키마 확장 전까지)
  const [topOffset, setTopOffsetLocal] = useState(0);
  const [bottomOffset, setBottomOffsetLocal] = useState(0);
  const setTopOffset = (v: number) => setTopOffsetLocal(v);
  const setBottomOffset = (v: number) => setBottomOffsetLocal(v);

  // 도어 설치 — 전역 토글
  const placedModules = useFurnitureStore((s) => s.placedModules);
  const setAllDoors = useFurnitureStore((s) => s.setAllDoors);
  const hasDoorsInstalled = placedModules.some((m) => m.hasDoor);
  const handleDoorToggle = (v: boolean) => {
    setAllDoors(v);
    useUIStore.getState().setDoorInstallIntent(v);
  };

  return (
    <div style={{
      width: '100%', height: '100%', overflow: 'auto',
      background: T.surface,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif',
    }}>

      {/* ─ 2D 미리보기 (접힘 토글) ─ */}
      <button
        onClick={() => setPreviewOpen(!previewOpen)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 14px',
          background: 'none', border: 'none', borderBottom: `1px solid ${T.line2}`,
          cursor: 'pointer', color: T.ink, fontSize: 13, fontWeight: 600,
          textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: previewOpen ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
          fontSize: 10, color: T.ink2,
        }}>▶</span>
        <span>2D 미리보기</span>
        <div style={{ flex: 1 }}/>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h6v6M10 14L21 3M21 14v7H3V3h7"/>
        </svg>
      </button>

      {/* ─ 공간 설정 ─ */}
      <SectionHeader title="공간 설정" help="공간 치수 입력" />
      <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8 }}>
        <NumInput label="W" value={spaceInfo.width || 0} onChange={(v) => handleSpaceInfoUpdate({ width: v })} flex />
        <NumInput label="H" value={spaceInfo.height || 0} onChange={(v) => handleSpaceInfoUpdate({ height: v })} flex />
      </div>

      {/* ─ 공간 유형 ─ */}
      <SectionHeader title="공간 유형" />
      <SegRow>
        <SegBtn flex active={getSpaceType() === 'both'}  onClick={() => setSpaceType('both')}>양쪽벽</SegBtn>
        <SegBtn flex active={getSpaceType() === 'left'}  onClick={() => setSpaceType('left')}>좌측벽</SegBtn>
        <SegBtn flex active={getSpaceType() === 'right'} onClick={() => setSpaceType('right')}>우측벽</SegBtn>
        <SegBtn flex active={getSpaceType() === 'none'}  onClick={() => setSpaceType('none')}>벽없음</SegBtn>
      </SegRow>

      {/* ─ 단내림 ─ */}
      <SectionHeader title="단내림" />
      <SegRow>
        <SegBtn flex active={getDrop() === 'none'}  onClick={() => setDrop('none')}>없음</SegBtn>
        <SegBtn flex active={getDrop() === 'left'}  onClick={() => setDrop('left')}>좌단내림</SegBtn>
        <SegBtn flex active={getDrop() === 'right'} onClick={() => setDrop('right')}>우단내림</SegBtn>
      </SegRow>
      {/* 단내림 하위 옵션 — 활성 시에만 표시 */}
      {dropEnabled && (
        <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: T.ink3, marginBottom: 4 }}>너비(mm)</div>
            <NumInput
              value={spaceInfo.droppedCeiling?.width ?? 900}
              onChange={(v) => handleSpaceInfoUpdate({ droppedCeiling: { ...(spaceInfo.droppedCeiling ?? {}), width: v } as any })}
              flex
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.ink3, marginBottom: 4 }}>내림 높이(mm)</div>
            <NumInput
              value={spaceInfo.droppedCeiling?.dropHeight ?? 200}
              onChange={(v) => handleSpaceInfoUpdate({ droppedCeiling: { ...(spaceInfo.droppedCeiling ?? {}), dropHeight: v } as any })}
              flex
            />
          </div>
        </div>
      )}

      {/* ─ 커튼박스 ─ */}
      <SectionHeader title="커튼박스" />
      <SegRow>
        <SegBtn flex active={curtain === 'none'}  onClick={() => setCurtain('none')}>없음</SegBtn>
        <SegBtn flex active={curtain === 'left'}  onClick={() => setCurtain('left')}>좌측</SegBtn>
        <SegBtn flex active={curtain === 'right'} onClick={() => setCurtain('right')}>우측</SegBtn>
      </SegRow>
      {/* 커튼박스 하위 옵션 — 활성 시에만 표시 */}
      {curtain !== 'none' && (
        <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: T.ink3, marginBottom: 4 }}>너비(mm)</div>
            <NumInput
              value={(spaceInfo.curtainBox as any)?.width ?? 200}
              onChange={(v) => handleSpaceInfoUpdate({ curtainBox: { ...(spaceInfo.curtainBox ?? {}), width: v } as any })}
              flex
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.ink3, marginBottom: 4 }}>깊이(mm)</div>
            <NumInput
              value={(spaceInfo.curtainBox as any)?.depth ?? 200}
              onChange={(v) => handleSpaceInfoUpdate({ curtainBox: { ...(spaceInfo.curtainBox ?? {}), depth: v } as any })}
              flex
            />
          </div>
        </div>
      )}

      {/* ─ 프레임 및 이격설정 (자유배치 전용 — 슬롯배치에는 해당 없음) ─ */}
      {spaceInfo.layoutMode === 'free-placement' && (
        <>
          <SectionHeader title="프레임 및 이격설정" help="서라운드 / 노서라운드" />
          <SegRow>
            <SegBtn flex active={surround === 'surround'}       onClick={() => setSurround('surround')}>전체서라운드</SegBtn>
            <SegBtn flex active={surround === 'both-surround' as any} onClick={() => setSurround('both-surround')}>양쪽서라운드</SegBtn>
            <SegBtn flex active={surround === 'no-surround'}    onClick={() => setSurround('no-surround')}>노서라운드</SegBtn>
          </SegRow>

          {/* 좌이격 / 우이격 */}
          <div style={{ padding: '0 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: T.ink3, marginBottom: 4, textAlign: 'center' }}>좌이격</div>
              <Stepper value={leftGap} onChange={setLeftGap} step={0.5} min={0} max={20} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.ink3, marginBottom: 4, textAlign: 'center' }}>우이격</div>
              <Stepper value={rightGap} onChange={setRightGap} step={0.5} min={0} max={20} />
            </div>
          </div>
        </>
      )}

      {/* ─ 상,하부프레임 (시안: A/B/C 상 + A/B/C 하) ─ */}
      <SectionHeader title="상,하부프레임" help="각 프레임의 size / 옵션" />
      <FrameRow label="A(상)" enabled={topEnabled}    onToggle={setTopEnabled}    sizeValue={topSize}    onSizeChange={setTopSize}    optionValue={topOffset}    onOptionChange={setTopOffset} />
      <FrameRow label="B(상)" enabled={topEnabled}    onToggle={setTopEnabled}    sizeValue={topSize}    onSizeChange={setTopSize}    optionValue={topOffset}    onOptionChange={setTopOffset} />
      <FrameRow label="C(상)" enabled={topEnabled}    onToggle={setTopEnabled}    sizeValue={topSize}    onSizeChange={setTopSize}    optionValue={topOffset}    onOptionChange={setTopOffset} />
      <div style={{ height: 8 }}/>
      <FrameRow label="A(하)" enabled={bottomEnabled} onToggle={setBottomEnabled} sizeValue={bottomSize} onSizeChange={setBottomSize} optionValue={bottomOffset} onOptionChange={setBottomOffset} />
      <FrameRow label="B(하)" enabled={bottomEnabled} onToggle={setBottomEnabled} sizeValue={bottomSize} onSizeChange={setBottomSize} optionValue={bottomOffset} onOptionChange={setBottomOffset} />
      <FrameRow label="C(하)" enabled={bottomEnabled} onToggle={setBottomEnabled} sizeValue={bottomSize} onSizeChange={setBottomSize} optionValue={bottomOffset} onOptionChange={setBottomOffset} />

      {/* ─ 도어 설치 ─ */}
      <SectionHeader title="도어 설치" help="배치된 모든 가구에 도어 일괄 설치/제거" />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 14px 14px',
      }}>
        <span style={{ fontSize: 12, color: T.ink2, fontWeight: 500 }}>
          도어 일괄 설치
        </span>
        <Toggle checked={hasDoorsInstalled} onChange={handleDoorToggle} />
      </div>

      <div style={{ height: 24 }}/>
    </div>
  );
};

export default IPadRightPanel;
