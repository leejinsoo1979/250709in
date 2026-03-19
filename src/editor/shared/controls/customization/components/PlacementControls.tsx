import React from 'react';
import { BaseConfig } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import styles from '../../styles/common.module.css';

interface PlacementControlsProps {
  baseConfig?: BaseConfig;
  baseHeight: string;
  baseDepth: string;
  onHeightChange: (value: string) => void;
  onDepthChange: (value: string) => void;
  onHeightBlur: () => void;
  onDepthBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onDepthKeyDown: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
}

const PlacementControls: React.FC<PlacementControlsProps> = ({
  baseHeight,
  baseDepth,
  onHeightChange,
  onDepthChange,
  onHeightBlur,
  onDepthBlur,
  onKeyDown,
  onDepthKeyDown,
  disabled = false
}) => {
  const { setHighlightedFrame } = useUIStore();

  const handleInputFocus = () => {
    setHighlightedFrame('base');
  };

  const handleInputBlur = () => {
    setHighlightedFrame(null);
    onHeightBlur();
  };

  const handleDepthInputBlur = () => {
    setHighlightedFrame(null);
    onDepthBlur();
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <span className={styles.inputLabel} style={{ flexShrink: 0, margin: 0 }}>높이</span>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--theme-background-secondary, #f9fafb)',
        border: '1px solid var(--theme-border)',
        borderRadius: '6px', overflow: 'hidden', flex: 1
      }}>
        <input
          type="text"
          value={baseHeight}
          onChange={(e) => onHeightChange(e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={onKeyDown}
          style={{
            border: 'none', background: 'transparent', textAlign: 'center',
            fontSize: '11px', fontWeight: 600, color: 'var(--theme-text)',
            padding: 0, width: '100%', height: '24px', outline: 'none'
          }}
          placeholder="65"
          disabled={disabled}
        />
      </div>
      <span className={styles.inputLabel} style={{ flexShrink: 0, margin: 0 }}>깊이</span>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--theme-background-secondary, #f9fafb)',
        border: '1px solid var(--theme-border)',
        borderRadius: '6px', overflow: 'hidden', flex: 1
      }}>
        <input
          type="text"
          value={baseDepth}
          onChange={(e) => onDepthChange(e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleDepthInputBlur}
          onKeyDown={onDepthKeyDown}
          style={{
            border: 'none', background: 'transparent', textAlign: 'center',
            fontSize: '11px', fontWeight: 600, color: 'var(--theme-text)',
            padding: 0, width: '100%', height: '24px', outline: 'none'
          }}
          placeholder="0"
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default PlacementControls;
