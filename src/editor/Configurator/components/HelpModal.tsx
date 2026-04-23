import React, { useMemo, useRef, useState } from 'react';
import styles from './HelpModal.module.css';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Platform = 'mac' | 'win';

const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'win';
  const s = `${navigator.userAgent || ''}`;
  return /Mac|iPhone|iPad|iPod/.test(s) ? 'mac' : 'win';
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const detected = useMemo(detectPlatform, []);
  const [platform, setPlatform] = useState<Platform>(detected);

  // 줌/팬 상태
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const imageSrc = platform === 'mac' ? '/help/shortcuts-mac.png' : '/help/shortcuts-win.png';
  // 이미지 원본 비율 (mac: 1196x1315, win: 1148x1370)
  const aspect = platform === 'mac' ? 1196 / 1315 : 1148 / 1370;

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const zoomIn = () => setZoom(z => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => {
    setZoom(z => {
      const next = Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(z => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2)));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({ x: dragStartRef.current.ox + dx, y: dragStartRef.current.oy + dy });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const changePlatform = (p: Platform) => {
    setPlatform(p);
    resetView();
  };

  const zoomPct = Math.round(zoom * 100);

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} style={{ aspectRatio: String(aspect) }}>
        <div className={styles.header}>
          <h3 className={styles.title}>조작법</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="닫기">✕</button>
        </div>

        {/* 플랫폼 토글 + 줌 컨트롤 */}
        <div className={styles.envBar}>
          <div className={styles.envCurrent}>
            현재 환경
            <span className={styles.envBadge}>{detected === 'mac' ? 'macOS' : 'Windows'}</span>
          </div>
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {/* 줌 컨트롤 */}
            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 4 }}>
              <button
                type="button"
                className={styles.key}
                onClick={zoomOut}
                disabled={zoom <= MIN_ZOOM}
                title="축소"
                style={{ cursor: zoom <= MIN_ZOOM ? 'not-allowed' : 'pointer', opacity: zoom <= MIN_ZOOM ? 0.4 : 1, padding: '3px 10px', fontSize: 13 }}
              >−</button>
              <span style={{ minWidth: 44, textAlign: 'center', fontSize: 11, color: 'var(--theme-text-secondary, #666)', fontVariantNumeric: 'tabular-nums' }}>
                {zoomPct}%
              </span>
              <button
                type="button"
                className={styles.key}
                onClick={zoomIn}
                disabled={zoom >= MAX_ZOOM}
                title="확대"
                style={{ cursor: zoom >= MAX_ZOOM ? 'not-allowed' : 'pointer', opacity: zoom >= MAX_ZOOM ? 0.4 : 1, padding: '3px 10px', fontSize: 13 }}
              >+</button>
              <button
                type="button"
                className={styles.key}
                onClick={resetView}
                title="원래 크기"
                style={{ cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
              >원본</button>
            </div>

            {/* 플랫폼 토글 */}
            <button
              type="button"
              className={styles.key}
              onClick={() => changePlatform('win')}
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
              onClick={() => changePlatform('mac')}
              style={{
                cursor: 'pointer',
                background: platform === 'mac' ? 'var(--theme-primary, #121212)' : undefined,
                color: platform === 'mac' ? '#fff' : undefined,
                borderColor: platform === 'mac' ? 'var(--theme-primary, #121212)' : undefined,
              }}
            >macOS</button>
          </div>
        </div>

        {/* 이미지 (줌 + 드래그 가능) */}
        <div
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            background: '#fff',
            padding: 8,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: zoom > 1 ? (isDraggingRef.current ? 'grabbing' : 'grab') : 'default',
            userSelect: 'none',
          }}
        >
          <img
            src={imageSrc}
            alt={platform === 'mac' ? 'macOS 조작법' : 'Windows 조작법'}
            draggable={false}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              borderRadius: 6,
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDraggingRef.current ? 'none' : 'transform 0.15s ease-out',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
