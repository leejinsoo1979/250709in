import React, { useMemo, useState } from 'react';
import styles from './HelpModal.module.css';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Platform = 'mac' | 'win';

type Keys = {
  mac: string[];   // 예: ['⌘', 'S']  또는 ['Space']  또는 ['←', '→', '↑', '↓']
  win: string[];   // 예: ['Ctrl', 'S']
};

type Row = {
  action: string;
  keys?: Keys;           // 키 조합 (공통이거나 플랫폼별 다를 수 있음)
  text?: string;         // 키가 아닌 동작 설명 (예: "마우스 휠", "상단 툴바 2D/3D 버튼")
};

type Section = {
  title: string;
  rows: Row[];
};

const SECTIONS: Section[] = [
  {
    title: '뷰어 · 카메라',
    rows: [
      { action: '3D 카메라 회전',         text: '마우스 휠버튼 드래그' },
      { action: '화면 이동 (팬)',         keys: { win: ['Shift'], mac: ['Shift'] }, text: '+ 드래그' },
      { action: '줌 인 / 아웃',           text: '마우스 휠 / 트랙패드 핀치' },
      { action: '카메라 초기화',          keys: { win: ['Space'], mac: ['Space'] } },
      { action: '2D ↔ 3D 전환',           text: '상단 툴바 2D / 3D 버튼' },
    ],
  },
  {
    title: '가구 배치 · 편집',
    rows: [
      { action: '가구 선택',              text: '좌측 목록에서 가구 썸네일 클릭 (또는 더블 클릭)' },
      { action: '슬롯에 배치',            text: '뷰어의 슬롯 + 아이콘 클릭' },
      { action: '배치 취소',              keys: { win: ['Esc'], mac: ['Esc'] } },
      { action: '배치된 가구 선택',       text: '가구 클릭' },
      { action: '편집 모드 진입',         text: '배치된 가구 더블 클릭' },
      { action: '미세 이동',              keys: { win: ['←', '→', '↑', '↓'], mac: ['←', '→', '↑', '↓'] } },
      { action: '가구 삭제',              keys: { win: ['Delete'], mac: ['Delete'] } },
      { action: '편집 모드 종료',         keys: { win: ['Esc'], mac: ['Esc'] } },
      { action: '가구 복사',              keys: { win: ['Ctrl', 'C'], mac: ['⌘', 'C'] } },
      { action: '가구 붙여넣기',          keys: { win: ['Ctrl', 'V'], mac: ['⌘', 'V'] } },
    ],
  },
  {
    title: '히스토리 · 저장',
    rows: [
      { action: '실행 취소',              keys: { win: ['Ctrl', 'Z'], mac: ['⌘', 'Z'] } },
      { action: '다시 실행',              keys: { win: ['Ctrl', 'Shift', 'Z'], mac: ['⌘', 'Shift', 'Z'] } },
      { action: '저장',                    keys: { win: ['Ctrl', 'S'], mac: ['⌘', 'S'] } },
      { action: '다른 이름으로 저장',      keys: { win: ['Ctrl', 'Shift', 'S'], mac: ['⌘', 'Shift', 'S'] } },
    ],
  },
  {
    title: '기타',
    rows: [
      { action: '가구·기둥 드래그 시',     text: '자동 정면뷰 전환' },
      { action: '기둥 편집',               text: '기둥 클릭 → 편집 팝업' },
      { action: '도어 Open / Close',       text: '상단 Open / Close 토글' },
    ],
  },
];

const TIPS = [
  '좌측 가구 목록에서 썸네일을 클릭하면 배치 모드로 진입합니다. 이어서 뷰어의 슬롯 + 아이콘을 클릭해 원하는 위치에 배치하세요.',
  '배치된 가구를 더블 클릭하면 편집 팝업이 열립니다.',
  '기둥을 클릭하면 기둥 편집 팝업이 열립니다.',
  '도어 설치는 상단 Open / Close 토글로 변경하실 수 있습니다.',
  '뷰가 이상해졌을 때 Space 키로 카메라를 초기 위치로 되돌릴 수 있습니다.',
];

const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'win';
  const s = `${navigator.platform || ''} ${navigator.userAgent || ''}`;
  return /Mac|iPhone|iPad|iPod/.test(s) ? 'mac' : 'win';
};

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const detected = useMemo(detectPlatform, []);
  const [platform, setPlatform] = useState<Platform>(detected);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const renderKeys = (keys: string[]) => (
    <span className={styles.keyGroup}>
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className={styles.plus}>+</span>}
          <span className={styles.key}>{k}</span>
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>조작법</h3>
          <button className={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        {/* 현재 환경 + 플랫폼 토글 */}
        <div className={styles.envBar}>
          <div className={styles.envCurrent}>
            현재 환경
            <span className={styles.envBadge}>{detected === 'mac' ? 'macOS' : 'Windows'}</span>
          </div>
          <div style={{ display: 'inline-flex', gap: 4 }}>
            <button
              type="button"
              className={styles.key}
              onClick={() => setPlatform('win')}
              style={{
                cursor: 'pointer',
                background: platform === 'win' ? 'var(--theme-primary, #121212)' : undefined,
                color: platform === 'win' ? '#fff' : undefined,
                borderColor: platform === 'win' ? 'var(--theme-primary, #121212)' : undefined,
              }}
            >Windows</button>
            <button
              type="button"
              className={styles.key}
              onClick={() => setPlatform('mac')}
              style={{
                cursor: 'pointer',
                background: platform === 'mac' ? 'var(--theme-primary, #121212)' : undefined,
                color: platform === 'mac' ? '#fff' : undefined,
                borderColor: platform === 'mac' ? 'var(--theme-primary, #121212)' : undefined,
              }}
            >macOS</button>
          </div>
        </div>

        {/* 섹션 카드 그리드 */}
        <div className={styles.content}>
          {SECTIONS.map((sec, sIdx) => (
            <div key={sIdx} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardDot} />
                {sec.title}
              </div>
              {sec.rows.map((r, rIdx) => {
                const keys = r.keys ? (platform === 'mac' ? r.keys.mac : r.keys.win) : null;
                return (
                  <div key={rIdx} className={styles.row}>
                    <span className={styles.rowAction}>{r.action}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {keys && renderKeys(keys)}
                      {r.text && <span className={styles.muted}>{r.text}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          <div className={styles.tipsCard}>
            <h4 className={styles.tipsTitle}>자주 쓰는 팁</h4>
            <ul className={styles.tipsList}>
              {TIPS.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
