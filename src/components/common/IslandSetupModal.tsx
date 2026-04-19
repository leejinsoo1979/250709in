import React, { useEffect, useState } from 'react';
import styles from './IslandSetupModal.module.css';

export interface IslandSetupValues {
  name: string;
  width: number;
  depth: number;
  height: number;
}

interface IslandSetupModalProps {
  isOpen: boolean;
  mode?: 'create' | 'edit';
  initialValues?: Partial<IslandSetupValues>;
  onConfirm: (values: IslandSetupValues) => void;
  onCancel: () => void;
}

const DEFAULTS: IslandSetupValues = {
  name: '새 아일랜드',
  width: 1800,
  depth: 900,
  height: 900,
};

const IslandSetupModal: React.FC<IslandSetupModalProps> = ({
  isOpen,
  mode = 'create',
  initialValues,
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState(initialValues?.name ?? DEFAULTS.name);
  const [width, setWidth] = useState<number | ''>(initialValues?.width ?? DEFAULTS.width);
  const [depth, setDepth] = useState<number | ''>(initialValues?.depth ?? DEFAULTS.depth);
  const [height, setHeight] = useState<number | ''>(initialValues?.height ?? DEFAULTS.height);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialValues?.name ?? DEFAULTS.name);
      setWidth(initialValues?.width ?? DEFAULTS.width);
      setDepth(initialValues?.depth ?? DEFAULTS.depth);
      setHeight(initialValues?.height ?? DEFAULTS.height);
      setError(null);
    }
  }, [isOpen, initialValues]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('이름을 입력해주세요.');
      return;
    }
    const w = Number(width);
    const d = Number(depth);
    const h = Number(height);
    if (!w || !d || !h || w < 300 || d < 300 || h < 300) {
      setError('W / D / H는 300mm 이상이어야 합니다.');
      return;
    }
    if (w > 6000 || d > 2000 || h > 2400) {
      setError('크기가 허용 범위를 초과했습니다. (W ≤ 6000, D ≤ 2000, H ≤ 2400)');
      return;
    }
    onConfirm({ name: trimmed, width: w, depth: d, height: h });
  };

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            {mode === 'edit' ? '아일랜드 사이즈 편집' : '아일랜드 설계'}
          </h3>
        </div>
        <div className={styles.content}>
          {mode === 'create' && (
            <div className={styles.field}>
              <label className={styles.label}>가구 이름</label>
              <input
                className={styles.input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 주방 아일랜드"
                autoFocus
              />
            </div>
          )}
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>W (폭, mm)</label>
              <input
                className={styles.input}
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value === '' ? '' : Number(e.target.value))}
                min={300}
                max={6000}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>D (깊이, mm)</label>
              <input
                className={styles.input}
                type="number"
                value={depth}
                onChange={(e) => setDepth(e.target.value === '' ? '' : Number(e.target.value))}
                min={300}
                max={2000}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>H (높이, mm)</label>
              <input
                className={styles.input}
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value === '' ? '' : Number(e.target.value))}
                min={300}
                max={2400}
              />
            </div>
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </div>
        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onCancel}>
            취소
          </button>
          <button className={styles.confirmButton} onClick={handleConfirm}>
            {mode === 'edit' ? '적용' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IslandSetupModal;
