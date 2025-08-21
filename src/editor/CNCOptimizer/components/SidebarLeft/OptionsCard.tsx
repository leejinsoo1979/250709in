import React, { useState } from 'react';
import { useCNCStore } from '../../store';
import { Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './SidebarLeft.module.css';

interface OptionsCardProps {
  onSettingsChange?: () => void;
}

export default function OptionsCard({ onSettingsChange }: OptionsCardProps = {}){
  const { t } = useTranslation();
  const { settings, setSettings } = useCNCStore();
  const [showGapSettings, setShowGapSettings] = useState(false);

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <Settings size={16} />
        <h3>{t('settings.title')}</h3>
      </div>
      
      <div className={styles.options}>
        <div className={styles.optionGroup}>
          <label className={styles.inlineNumberInput}>
            <span>{t('cnc.bladeThickness')}</span>
            <div className={styles.inputWrapper}>
              <input 
                type="number" 
                value={settings.kerf}
                onChange={e => setSettings({ kerf: Number(e.target.value) })}
                onKeyDown={e => {
                  if (e.key === 'Enter' && onSettingsChange) {
                    onSettingsChange();
                  }
                }}
                min="0"
                max="10"
                step="0.5"
              />
              <span className={styles.unit}>mm</span>
            </div>
          </label>
        </div>

        <button 
          className={styles.gapToggleButton}
          onClick={() => setShowGapSettings(!showGapSettings)}
        >
          {t('cnc.edgeGapSettings')}
          {showGapSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showGapSettings && (
          <div className={styles.marginGrid}>
            <div className={styles.marginRow}>
              <label className={styles.numberInputCompact}>
                <span>{t('cnc.top')}</span>
              <div className={styles.inputWrapper}>
                <input 
                  type="number" 
                  value={settings.trimTop ?? 5}
                  onChange={e => setSettings({ trimTop: Number(e.target.value) })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && onSettingsChange) {
                      onSettingsChange();
                    }
                  }}
                  min="0"
                  max="50"
                />
                <span className={styles.unit}>mm</span>
              </div>
            </label>
            <label className={styles.numberInputCompact}>
              <span>{t('cnc.bottom')}</span>
              <div className={styles.inputWrapper}>
                <input 
                  type="number" 
                  value={settings.trimBottom ?? 5}
                  onChange={e => setSettings({ trimBottom: Number(e.target.value) })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && onSettingsChange) {
                      onSettingsChange();
                    }
                  }}
                  min="0"
                  max="50"
                />
                <span className={styles.unit}>mm</span>
              </div>
            </label>
          </div>
          <div className={styles.marginRow}>
            <label className={styles.numberInputCompact}>
              <span>{t('cnc.left')}</span>
              <div className={styles.inputWrapper}>
                <input 
                  type="number" 
                  value={settings.trimLeft ?? 5}
                  onChange={e => setSettings({ trimLeft: Number(e.target.value) })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && onSettingsChange) {
                      onSettingsChange();
                    }
                  }}
                  min="0"
                  max="50"
                />
                <span className={styles.unit}>mm</span>
              </div>
            </label>
            <label className={styles.numberInputCompact}>
              <span>{t('cnc.right')}</span>
              <div className={styles.inputWrapper}>
                <input 
                  type="number" 
                  value={settings.trimRight ?? 5}
                  onChange={e => setSettings({ trimRight: Number(e.target.value) })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && onSettingsChange) {
                      onSettingsChange();
                    }
                  }}
                  min="0"
                  max="50"
                />
                <span className={styles.unit}>mm</span>
              </div>
            </label>
            </div>
          </div>
        )}

        <div className={styles.checkboxGrid}>
          <div className={styles.checkboxRow}>
            <label className={styles.checkboxCompact}>
              <input 
                type="checkbox"
                checked={settings.considerGrain}
                onChange={e => setSettings({ considerGrain: e.target.checked })}
              />
              <span>{t('cnc.considerGrain')}</span>
            </label>
            <label className={styles.checkboxCompact}>
              <input 
                type="checkbox"
                checked={settings.considerMaterial}
                onChange={e => setSettings({ considerMaterial: e.target.checked })}
              />
              <span>{t('cnc.groupByMaterial')}</span>
            </label>
          </div>
          <div className={styles.checkboxRow}>
            <label className={styles.checkboxCompact}>
              <input 
                type="checkbox"
                checked={settings.labelsOnPanels}
                onChange={e => setSettings({ labelsOnPanels: e.target.checked })}
              />
              <span>{t('cnc.showPanelLabels')}</span>
            </label>
            <label className={styles.checkboxCompact}>
              <input 
                type="checkbox"
                checked={settings.edgeBanding}
                onChange={e => setSettings({ edgeBanding: e.target.checked })}
              />
              <span>{t('cnc.considerEdgeBanding')}</span>
            </label>
          </div>
          <div className={styles.checkboxRow}>
            <label className={styles.checkboxCompact}>
              <input 
                type="checkbox"
                checked={settings.singleSheetOnly}
                onChange={e => setSettings({ singleSheetOnly: e.target.checked })}
              />
              <span>{t('cnc.singleSheetOnly')}</span>
            </label>
            <label className={styles.checkboxCompact}>
              <input 
                type="checkbox"
                checked={settings.alignVerticalCuts !== false}
                onChange={e => setSettings({ alignVerticalCuts: e.target.checked })}
              />
              <span>{t('cnc.alignVerticalCuts')}</span>
            </label>
          </div>
        </div>

        <div className={styles.resetLink}>
          <button 
            className={styles.link}
            onClick={() => {
              if (onSettingsChange) {
                onSettingsChange();
              }
            }}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}