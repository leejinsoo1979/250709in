import React from 'react';
import { useCNCStore } from '../../store';
import { Settings, RotateCw } from 'lucide-react';
import styles from './SidebarLeft.module.css';

interface OptionsCardProps {
  onSettingsChange?: () => void;
}

export default function OptionsCard({ onSettingsChange }: OptionsCardProps = {}){
  const { settings, setSettings } = useCNCStore();

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <Settings size={16} />
        <h3>설정</h3>
      </div>
      
      <div className={styles.options}>
        <div className={styles.optionGroup}>
          <label className={styles.numberInput}>
            <span>톱날 두께</span>
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

        <div className={styles.optionGroup}>
          <label className={styles.numberInput}>
            <span>상단 여백</span>
            <div className={styles.inputWrapper}>
              <input 
                type="number" 
                value={settings.trimTop ?? 10}
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
        </div>

        <div className={styles.optionGroup}>
          <label className={styles.numberInput}>
            <span>하단 여백</span>
            <div className={styles.inputWrapper}>
              <input 
                type="number" 
                value={settings.trimBottom ?? 10}
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

        <div className={styles.optionGroup}>
          <label className={styles.numberInput}>
            <span>좌측 여백</span>
            <div className={styles.inputWrapper}>
              <input 
                type="number" 
                value={settings.trimLeft ?? 10}
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
        </div>

        <div className={styles.optionGroup}>
          <label className={styles.numberInput}>
            <span>우측 여백</span>
            <div className={styles.inputWrapper}>
              <input 
                type="number" 
                value={settings.trimRight ?? 10}
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

        <div className={styles.optionGroup}>
          <label>
            <input 
              type="checkbox"
              checked={settings.considerGrain}
              onChange={e => setSettings({ considerGrain: e.target.checked })}
            />
            <span>결 방향 고려</span>
          </label>
        </div>

        <div className={styles.optionGroup}>
          <label>
            <input 
              type="checkbox"
              checked={settings.considerMaterial}
              onChange={e => setSettings({ considerMaterial: e.target.checked })}
            />
            <span>재질별 그룹화</span>
          </label>
        </div>

        <div className={styles.optionGroup}>
          <label>
            <input 
              type="checkbox"
              checked={settings.labelsOnPanels}
              onChange={e => setSettings({ labelsOnPanels: e.target.checked })}
            />
            <span>패널 라벨 표시</span>
          </label>
        </div>

        <div className={styles.optionGroup}>
          <label>
            <input 
              type="checkbox"
              checked={settings.edgeBanding}
              onChange={e => setSettings({ edgeBanding: e.target.checked })}
            />
            <span>엣지밴드 고려</span>
          </label>
        </div>

        <div className={styles.optionGroup}>
          <label>
            <input 
              type="checkbox"
              checked={settings.singleSheetOnly}
              onChange={e => setSettings({ singleSheetOnly: e.target.checked })}
            />
            <span>단일 시트만 사용</span>
          </label>
        </div>

        <div className={styles.optionGroup}>
          <label>
            <input 
              type="checkbox"
              checked={settings.alignVerticalCuts !== false}
              onChange={e => setSettings({ alignVerticalCuts: e.target.checked })}
            />
            <span>세로 컷팅 정렬</span>
          </label>
        </div>

        <div className={styles.resetLink}>
          <button 
            className={styles.link}
            onClick={() => setSettings({
              kerf: 5,
              trimTop: 10,
              trimBottom: 10,
              trimLeft: 10,
              trimRight: 10,
              considerGrain: true,
              considerMaterial: true,
              labelsOnPanels: true,
              edgeBanding: false,
              singleSheetOnly: false,
              alignVerticalCuts: true
            })}
          >
            <RotateCw size={12} />
            기본값으로 재설정
          </button>
        </div>
      </div>
    </div>
  );
}