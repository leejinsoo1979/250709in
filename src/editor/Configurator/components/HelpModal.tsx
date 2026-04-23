import React, { useMemo } from 'react';
import styles from './HelpModal.module.css';
import { useTranslation } from '@/i18n/useTranslation';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Row = {
  action: string;
  win: string;
  mac: string;
};

type Section = {
  title: string;
  rows: Row[];
};

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  // 현재 환경이 macOS인지 감지 (헤더에 현재 환경 표시용)
  const isMac = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
      /Mac/.test(navigator.userAgent);
  }, []);

  if (!isOpen) return null;

  const sections: Section[] = [
    {
      title: '뷰어 카메라',
      rows: [
        { action: '3D 카메라 회전',           win: '마우스 휠버튼 드래그', mac: '마우스 휠버튼 드래그 / 트랙패드 두 손가락 드래그' },
        { action: '화면 이동 (팬)',           win: 'Shift + 마우스 드래그', mac: 'Shift + 마우스 드래그 / 트랙패드 두 손가락 드래그' },
        { action: '줌 인 / 아웃',             win: '마우스 휠',             mac: '트랙패드 핀치 / 마우스 휠' },
        { action: '카메라 초기 위치로 리셋',  win: 'Space',                 mac: 'Space' },
        { action: '2D ↔ 3D 뷰 전환',          win: '상단 툴바 2D / 3D 버튼', mac: '상단 툴바 2D / 3D 버튼' },
      ],
    },
    {
      title: '가구 배치 / 편집',
      rows: [
        { action: '가구 배치',                 win: '좌측 목록 → 뷰어로 드래그', mac: '좌측 목록 → 뷰어로 드래그' },
        { action: '가구 선택',                 win: '클릭',                      mac: '클릭' },
        { action: '가구 편집 모드 진입',       win: '더블 클릭',                 mac: '더블 클릭' },
        { action: '가구 미세 이동',            win: '←  →  ↑  ↓',                mac: '←  →  ↑  ↓' },
        { action: '가구 삭제',                 win: 'Delete / Backspace',        mac: 'Delete / Backspace' },
        { action: '편집 모드 종료',            win: 'Esc',                       mac: 'Esc' },
        { action: '가구 복사',                 win: 'Ctrl + C',                  mac: '⌘ + C' },
        { action: '가구 붙여넣기',             win: 'Ctrl + V',                  mac: '⌘ + V' },
      ],
    },
    {
      title: '히스토리 / 저장',
      rows: [
        { action: '실행 취소 (Undo)',          win: 'Ctrl + Z',        mac: '⌘ + Z' },
        { action: '다시 실행 (Redo)',          win: 'Ctrl + Shift + Z', mac: '⌘ + Shift + Z' },
        { action: '저장',                       win: 'Ctrl + S',        mac: '⌘ + S' },
        { action: '다른 이름으로 저장',         win: 'Ctrl + Shift + S', mac: '⌘ + Shift + S' },
      ],
    },
    {
      title: '기타',
      rows: [
        { action: '가구/기둥 드래그 시',       win: '자동 정면뷰 전환', mac: '자동 정면뷰 전환' },
        { action: '기둥 편집',                  win: '기둥 클릭 → 편집 팝업', mac: '기둥 클릭 → 편집 팝업' },
        { action: '도어 설치 토글',            win: '상단 Open / Close 토글', mac: '상단 Open / Close 토글' },
      ],
    },
  ];

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t('help.title') || '조작법'}</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          <div style={{ fontSize: 12, color: 'var(--theme-text-secondary, #666)', marginBottom: 12 }}>
            현재 환경: <strong>{isMac ? 'macOS' : 'Windows'}</strong>
          </div>

          {sections.map((sec, sIdx) => (
            <div key={sIdx} style={{ marginBottom: 20 }}>
              <h4 style={{
                margin: '0 0 10px',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--theme-primary, #121212)',
              }}>{sec.title}</h4>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
                background: 'var(--theme-surface, #fff)',
                borderRadius: 6,
                overflow: 'hidden',
                border: '1px solid var(--theme-border, #e0e0e0)',
              }}>
                <thead>
                  <tr style={{ background: 'var(--theme-background, #fafafa)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--theme-border, #e0e0e0)', fontWeight: 600 }}>동작</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--theme-border, #e0e0e0)', fontWeight: 600, width: '30%' }}>Windows</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--theme-border, #e0e0e0)', fontWeight: 600, width: '30%' }}>macOS</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((r, rIdx) => (
                    <tr key={rIdx} style={{ borderTop: rIdx === 0 ? 'none' : '1px solid var(--theme-border, #eee)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--theme-text, #121212)' }}>{r.action}</td>
                      <td style={{
                        padding: '8px 10px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        color: !isMac ? 'var(--theme-primary, #121212)' : 'var(--theme-text-secondary, #666)',
                        fontWeight: !isMac ? 600 : 400,
                      }}>{r.win}</td>
                      <td style={{
                        padding: '8px 10px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        color: isMac ? 'var(--theme-primary, #121212)' : 'var(--theme-text-secondary, #666)',
                        fontWeight: isMac ? 600 : 400,
                      }}>{r.mac}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div className={styles.tips}>
            <h4>{t('help.tips.title') || '팁'}</h4>
            <ul>
              <li>좌측 가구 목록에서 항목을 빈 슬롯으로 드래그하면 자동 배치됩니다.</li>
              <li>배치된 가구를 더블 클릭하면 편집 팝업이 열립니다.</li>
              <li>기둥을 클릭하면 기둥 편집 팝업이 열립니다.</li>
              <li>도어 설치는 상단 Open / Close 토글로 바꿀 수 있습니다.</li>
              <li>Space 키로 뷰가 이상해졌을 때 카메라를 초기 위치로 되돌릴 수 있습니다.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
