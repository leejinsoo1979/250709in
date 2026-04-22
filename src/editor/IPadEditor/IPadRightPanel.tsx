// iPad 우측 패널 — 웹 UI 이미지 그대로 복제 (웹 컴포넌트 import 안 함)
import React, { useState } from 'react';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import webStyles from '@/editor/Configurator/style.module.css';
import { useSpaceInfoHandler } from './useSpaceInfoHandler';

const TC = {
  primary:   'var(--theme-primary, #7C5CFF)',
  primary50: 'var(--theme-primary-50, #F5F3FF)',
  bg:        'var(--theme-background, #FFFFFF)',
  bg2:       'var(--theme-background-secondary, #F0F0F0)',
  surface:   'var(--theme-surface, #FFFFFF)',
  ink:       'var(--theme-text, #111827)',
  ink2:      'var(--theme-text-secondary, #4B5563)',
  ink3:      'var(--theme-text-muted, #6B7280)',
  line:      'var(--theme-border, #D1D5DB)',
  line3:     'var(--theme-border-light, #F3F4F6)',
};

// 헬프 (? 원형 버튼)
const Help: React.FC = () => (
  <span style={{
    width: 15, height: 15, borderRadius: '50%',
    background: TC.bg2, color: TC.ink3, fontSize: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    marginLeft: 4, cursor: 'help',
  }}>?</span>
);

// 토글 버튼 그룹 (웹 .toggleButtonGroup 스타일)
const SegGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    display: 'flex', gap: 1, padding: 2,
    background: TC.bg2, borderRadius: 5,
  }}>{children}</div>
);

const SegBtn: React.FC<{ active: boolean; onClick?: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    flex: 1, minHeight: 24, padding: '4px 6px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: active ? 600 : 500,
    color: active ? TC.primary : TC.ink3,
    background: active ? TC.bg2 : 'transparent',
    border: active ? `1.5px solid ${TC.primary}` : 'none',
    borderRadius: 4, cursor: 'pointer',
    whiteSpace: 'nowrap', letterSpacing: '-0.01em',
    transition: 'all 0.15s ease',
  }}>{children}</button>
);

// 숫자 입력 +/- (웹 스타일)
const NumStepper: React.FC<{ value: number; onChange: (v: number) => void; step?: number }> = ({ value, onChange, step = 1 }) => (
  <div style={{
    display: 'flex', alignItems: 'center',
    border: `1px solid ${TC.line}`, borderRadius: 4,
    background: TC.surface, overflow: 'hidden',
  }}>
    <button onClick={() => onChange(value - step)} style={{
      width: 24, height: 24, border: 'none',
      background: TC.bg2, color: TC.ink2, fontSize: 12,
      cursor: 'pointer',
    }}>−</button>
    <input type="number" value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        flex: 1, border: 'none', outline: 'none',
        textAlign: 'center', fontSize: 11,
        background: TC.surface, color: TC.ink,
        padding: '0 4px', width: '100%',
      }}
    />
    <button onClick={() => onChange(value + step)} style={{
      width: 24, height: 24, border: 'none',
      background: TC.bg2, color: TC.ink2, fontSize: 12,
      cursor: 'pointer',
    }}>+</button>
  </div>
);

interface Props {
  spaceInfo: SpaceInfo;
  setSpaceInfo: (u: Partial<SpaceInfo>) => void;
}

const IPadRightPanel: React.FC<Props> = ({ spaceInfo, setSpaceInfo: _noop }) => {
  const { handleSpaceInfoUpdate: setSpaceInfo } = useSpaceInfoHandler();
  const [baseSize, setBaseSize] = useState(100);
  const [baseOffset, setBaseOffset] = useState(65);
  const [doorTopGap, setDoorTopGap] = useState(-80);
  const [doorBottomGap, setDoorBottomGap] = useState(5);
  const [allBase, setAllBase] = useState(true);
  const [baseEnabled, setBaseEnabled] = useState(true);
  const [gapL, setGapL] = useState(1.5);
  const [gapR, setGapR] = useState(1.5);

  // 현재 공간 유형
  const spaceType: 'both' | 'left' | 'right' | 'none' =
    spaceInfo.installType === 'builtin' ? 'both'
    : spaceInfo.installType === 'freestanding' ? 'none'
    : spaceInfo.wallConfig?.left ? 'left' : 'right';

  const setSpaceType = (t: 'both' | 'left' | 'right' | 'none') => {
    const map: Record<typeof t, Partial<SpaceInfo>> = {
      both: { installType: 'builtin', wallConfig: { left: true, right: true } },
      left: { installType: 'semistanding', wallConfig: { left: true, right: false } },
      right: { installType: 'semistanding', wallConfig: { left: false, right: true } },
      none: { installType: 'freestanding', wallConfig: { left: false, right: false } },
    };
    setSpaceInfo(map[t]);
  };

  // 단내림
  const dc = spaceInfo.droppedCeiling;
  const dcState: 'none' | 'left' | 'right' = !dc?.enabled ? 'none' : (dc.position || 'right');
  const setDcState = (s: 'none' | 'left' | 'right') => {
    if (s === 'none') setSpaceInfo({ droppedCeiling: { ...dc, enabled: false } as any });
    else setSpaceInfo({ droppedCeiling: { ...dc, enabled: true, position: s } as any });
  };

  // 커튼박스
  const cb: any = (spaceInfo as any).curtainBox;
  const cbState: 'none' | 'left' | 'right' = !cb?.enabled ? 'none' : (cb.position || 'right');
  const setCbState = (s: 'none' | 'left' | 'right') => {
    if (s === 'none') setSpaceInfo({ curtainBox: { ...cb, enabled: false } } as any);
    else setSpaceInfo({ curtainBox: { ...cb, enabled: true, position: s } } as any);
  };

  // 컬럼수
  const columnCount = spaceInfo.customColumnCount || 6;
  const setColumnCount = (n: number) => setSpaceInfo({ customColumnCount: n } as any);

  // 서라운드
  const surroundType = spaceInfo.surroundType || 'surround';

  // 바닥마감재
  const floorFinish = spaceInfo.hasFloorFinish ? 'done' : 'planned';

  return (
    <div style={{
      padding: '14px 14px 24px',
      overflowY: 'auto', overflowX: 'hidden',
      height: '100%', width: '100%', boxSizing: 'border-box',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif',
      color: TC.ink, background: TC.surface,
    }}>
      {/* 3D 미리보기 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: TC.ink3 }}>▸</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: TC.ink }}>3D 미리보기</span>
        </div>
        <button style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: TC.ink3, fontSize: 12,
        }}>↗</button>
      </div>

      {/* 공간 설정 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader}>
          <span className={webStyles.sectionDot}/>
          <h3 className={webStyles.sectionTitle}>공간 설정</h3>
          <Help/>
        </div>
        <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: TC.primary, fontWeight: 700, flexShrink: 0 }}>W</span>
            <input type="number" value={spaceInfo.width}
              onChange={(e) => setSpaceInfo({ width: Number(e.target.value) })}
              style={{
                flex: 1, minWidth: 0, padding: '4px 6px', fontSize: 11, textAlign: 'right',
                border: `1px solid ${TC.line}`, borderRadius: 4,
                background: TC.surface, color: TC.ink, outline: 'none',
              }}/>
            <span style={{ fontSize: 9, color: TC.ink3, flexShrink: 0 }}>mm</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: TC.primary, fontWeight: 700, flexShrink: 0 }}>H</span>
            <input type="number" value={spaceInfo.height}
              onChange={(e) => setSpaceInfo({ height: Number(e.target.value) })}
              style={{
                flex: 1, minWidth: 0, padding: '4px 6px', fontSize: 11, textAlign: 'right',
                border: `1px solid ${TC.line}`, borderRadius: 4,
                background: TC.surface, color: TC.ink, outline: 'none',
              }}/>
            <span style={{ fontSize: 9, color: TC.ink3, flexShrink: 0 }}>mm</span>
          </div>
        </div>
      </div>

      {/* 공간 유형 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader}>
          <span className={webStyles.sectionDot}/>
          <h3 className={webStyles.sectionTitle}>공간 유형</h3>
          <Help/>
        </div>
        <SegGroup>
          <SegBtn active={spaceType === 'both'} onClick={() => setSpaceType('both')}>양쪽벽</SegBtn>
          <SegBtn active={spaceType === 'left'} onClick={() => setSpaceType('left')}>좌측벽</SegBtn>
          <SegBtn active={spaceType === 'right'} onClick={() => setSpaceType('right')}>우측벽</SegBtn>
          <SegBtn active={spaceType === 'none'} onClick={() => setSpaceType('none')}>벽없음</SegBtn>
        </SegGroup>
      </div>

      {/* 단내림 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader}>
          <span className={webStyles.sectionDot}/>
          <h3 className={webStyles.sectionTitle}>단내림</h3>
          <Help/>
        </div>
        <SegGroup>
          <SegBtn active={dcState === 'none'} onClick={() => setDcState('none')}>없음</SegBtn>
          <SegBtn active={dcState === 'left'} onClick={() => setDcState('left')}>좌단내림</SegBtn>
          <SegBtn active={dcState === 'right'} onClick={() => setDcState('right')}>우단내림</SegBtn>
        </SegGroup>
      </div>

      {/* 커튼박스 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader}>
          <span className={webStyles.sectionDot}/>
          <h3 className={webStyles.sectionTitle}>커튼박스</h3>
          <Help/>
        </div>
        <SegGroup>
          <SegBtn active={cbState === 'none'} onClick={() => setCbState('none')}>없음</SegBtn>
          <SegBtn active={cbState === 'left'} onClick={() => setCbState('left')}>좌측</SegBtn>
          <SegBtn active={cbState === 'right'} onClick={() => setCbState('right')}>우측</SegBtn>
        </SegGroup>
      </div>

      {/* 컬럼수 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader}>
          <span className={webStyles.sectionDot}/>
          <h3 className={webStyles.sectionTitle}>컬럼수</h3>
          <Help/>
        </div>
        <SegGroup>
          {[6, 7, 8].map(n => (
            <SegBtn key={n} active={columnCount === n} onClick={() => setColumnCount(n)}>{n}</SegBtn>
          ))}
        </SegGroup>
      </div>

      {/* 프레임 및 이격설정 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader}>
          <span className={webStyles.sectionDot}/>
          <h3 className={webStyles.sectionTitle}>프레임 및 이격설정</h3>
          <Help/>
        </div>
        <SegGroup>
          <SegBtn active={surroundType === 'surround'} onClick={() => setSpaceInfo({ surroundType: 'surround' })}>전체서라운드</SegBtn>
          <SegBtn active={(surroundType as any) === 'semi-surround'} onClick={() => setSpaceInfo({ surroundType: 'semi-surround' } as any)}>양쪽서라운드</SegBtn>
          <SegBtn active={surroundType === 'no-surround'} onClick={() => setSpaceInfo({ surroundType: 'no-surround' })}>노서라운드</SegBtn>
        </SegGroup>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: TC.ink3, marginBottom: 3, textAlign: 'center' }}>좌이격</div>
            <NumStepper value={gapL} onChange={setGapL} step={0.5}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: TC.ink3, marginBottom: 3, textAlign: 'center' }}>우이격</div>
            <NumStepper value={gapR} onChange={setGapR} step={0.5}/>
          </div>
        </div>
      </div>

      {/* 상,하부프레임 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader} style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className={webStyles.sectionDot}/>
            <h3 className={webStyles.sectionTitle}>상,하부프레임</h3>
            <Help/>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: TC.ink2, cursor: 'pointer' }}>
            <input type="checkbox" checked={allBase} onChange={(e) => setAllBase(e.target.checked)}/>
            <span>전체</span>
            <span style={{ fontSize: 10, color: TC.ink3, marginLeft: 2 }}>{allBase ? '▲' : '▼'}</span>
          </label>
        </div>
        {allBase && (
          <>
            <div style={{ fontSize: 11, color: TC.ink2, marginBottom: 4 }}>상부프레임</div>
            <div style={{ fontSize: 11, color: TC.ink2, marginBottom: 4 }}>하부프레임</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: TC.ink2 }}>A(하)</span>
              <button onClick={() => setBaseEnabled(!baseEnabled)}
                style={{
                  width: 32, height: 18, borderRadius: 10, border: 'none',
                  background: baseEnabled ? TC.primary : TC.line,
                  position: 'relative', cursor: 'pointer',
                }}>
                <span style={{
                  position: 'absolute', top: 2, left: baseEnabled ? 16 : 2,
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#FFF', transition: 'left 0.15s',
                }}/>
              </button>
              <span style={{ fontSize: 10, color: TC.ink3 }}>size</span>
              <input type="number" value={baseSize} onChange={(e) => setBaseSize(Number(e.target.value))}
                style={{
                  width: 50, padding: '4px 6px', fontSize: 11, textAlign: 'right',
                  border: `1px solid ${TC.line}`, borderRadius: 4,
                  background: TC.surface, color: TC.ink, outline: 'none',
                }}/>
              <span style={{ fontSize: 10, color: TC.ink3 }}>옵셋</span>
              <input type="number" value={baseOffset} onChange={(e) => setBaseOffset(Number(e.target.value))}
                style={{
                  width: 50, padding: '4px 6px', fontSize: 11, textAlign: 'right',
                  border: `1px solid ${TC.line}`, borderRadius: 4,
                  background: TC.surface, color: TC.ink, outline: 'none',
                }}/>
            </div>
          </>
        )}
      </div>

      {/* 도어 셋팅 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader}>
          <span className={webStyles.sectionDot}/>
          <h3 className={webStyles.sectionTitle}>도어 셋팅</h3>
          <Help/>
        </div>
        <div style={{ fontSize: 11, color: TC.ink2, textAlign: 'center', marginBottom: 6 }}>도어 1(하)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: TC.ink2, minWidth: 40 }}>상단갭</span>
          <input type="number" value={doorTopGap} onChange={(e) => setDoorTopGap(Number(e.target.value))}
            style={{
              flex: 1, padding: '5px 8px', fontSize: 11, textAlign: 'right',
              border: `1px solid ${TC.line}`, borderRadius: 4,
              background: TC.surface, color: TC.ink, outline: 'none',
            }}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: TC.ink2, minWidth: 40 }}>하단갭</span>
          <input type="number" value={doorBottomGap} onChange={(e) => setDoorBottomGap(Number(e.target.value))}
            style={{
              flex: 1, padding: '5px 8px', fontSize: 11, textAlign: 'right',
              border: `1px solid ${TC.line}`, borderRadius: 4,
              background: TC.surface, color: TC.ink, outline: 'none',
            }}/>
        </div>
      </div>

      {/* 바닥마감재 상태 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader}>
          <span className={webStyles.sectionDot}/>
          <h3 className={webStyles.sectionTitle}>바닥마감재 상태</h3>
          <Help/>
        </div>
        <SegGroup>
          <SegBtn active={floorFinish === 'done'} onClick={() => setSpaceInfo({ hasFloorFinish: true })}>바닥재 시공완료</SegBtn>
          <SegBtn active={floorFinish === 'planned'} onClick={() => setSpaceInfo({ hasFloorFinish: false })}>시공예정</SegBtn>
        </SegGroup>
      </div>

      {/* 가구재 두께 */}
      <div className={webStyles.configSection}>
        <div className={webStyles.sectionHeader}>
          <span className={webStyles.sectionDot}/>
          <h3 className={webStyles.sectionTitle}>가구재 두께</h3>
        </div>
        <SegGroup>
          <SegBtn active={true}>18T</SegBtn>
          <SegBtn active={false}>15T</SegBtn>
          <SegBtn active={false}>9T</SegBtn>
        </SegGroup>
      </div>
    </div>
  );
};

export default IPadRightPanel;
