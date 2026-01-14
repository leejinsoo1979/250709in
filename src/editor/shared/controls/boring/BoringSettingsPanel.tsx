/**
 * 보링 설정 패널
 * 힌지, 캠락, 선반핀, 서랍레일 설정 관리
 */

import React, { useState } from 'react';
import { useBoringStore } from '@/store/boringStore';
import { DRAWER_RAIL_SETTINGS } from '@/domain/boring/constants';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './BoringSettingsPanel.module.css';
import commonStyles from '../styles/common.module.css';

type SettingsTab = 'hinge' | 'camLock' | 'shelfPin' | 'drawerRail' | 'adjustableFoot';

const BoringSettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('hinge');

  const {
    settings,
    updateHingeSettings,
    updateCamLockSettings,
    updateShelfPinSettings,
    updateDrawerRailSettings,
    updateAdjustableFootSettings,
    resetToDefaults,
  } = useBoringStore();

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'hinge', label: '힌지' },
    { id: 'camLock', label: '캠락' },
    { id: 'shelfPin', label: '선반핀' },
    { id: 'drawerRail', label: '서랍레일' },
    { id: 'adjustableFoot', label: '조절발' },
  ];

  const drawerRailTypes = [
    { id: 'tandem', label: 'TANDEM' },
    { id: 'movento', label: 'MOVENTO' },
    { id: 'legrabox', label: 'LEGRABOX' },
    { id: 'metabox', label: 'METABOX' },
  ];

  const renderHingeSettings = () => (
    <div className={styles.settingsSection}>
      <h4 className={styles.sectionTitle}>Blum CLIP top BLUMOTION</h4>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>컵홀 설정</h5>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>컵 직경</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.hinge.cupDiameter}
                onChange={(e) => updateHingeSettings({ cupDiameter: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>컵 깊이</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.hinge.cupDepth}
                onChange={(e) => updateHingeSettings({ cupDepth: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
        <div className={commonStyles.inputWrapper}>
          <label className={commonStyles.inputLabel}>가장자리 거리</label>
          <div className={commonStyles.inputWithUnit}>
            <input
              type="number"
              value={settings.hinge.cupEdgeDistance}
              onChange={(e) => updateHingeSettings({ cupEdgeDistance: Number(e.target.value) })}
              className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
            />
            <span className={commonStyles.unit}>mm</span>
          </div>
        </div>
      </div>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>나사홀 설정</h5>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>나사 직경</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                step="0.1"
                value={settings.hinge.screwDiameter}
                onChange={(e) => updateHingeSettings({ screwDiameter: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>나사 깊이</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.hinge.screwDepth}
                onChange={(e) => updateHingeSettings({ screwDepth: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>나사홀 간격</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.hinge.screwHoleSpacing}
                onChange={(e) => updateHingeSettings({ screwHoleSpacing: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>열 거리</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.hinge.screwRowDistance}
                onChange={(e) => updateHingeSettings({ screwRowDistance: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>힌지 위치</h5>
        <div className={commonStyles.inputWrapper}>
          <label className={commonStyles.inputLabel}>상하 여백</label>
          <div className={commonStyles.inputWithUnit}>
            <input
              type="number"
              value={settings.hinge.topBottomMargin}
              onChange={(e) => updateHingeSettings({ topBottomMargin: Number(e.target.value) })}
              className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
            />
            <span className={commonStyles.unit}>mm</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCamLockSettings = () => (
    <div className={styles.settingsSection}>
      <h4 className={styles.sectionTitle}>캠락 설정 (Ø15mm)</h4>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>하우징</h5>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>직경</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.camLock.housingDiameter}
                onChange={(e) => updateCamLockSettings({ housingDiameter: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>깊이</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.camLock.housingDepth}
                onChange={(e) => updateCamLockSettings({ housingDepth: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>볼트</h5>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>직경</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.camLock.boltDiameter}
                onChange={(e) => updateCamLockSettings({ boltDiameter: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>깊이</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.camLock.boltDepth}
                onChange={(e) => updateCamLockSettings({ boltDepth: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
        <div className={commonStyles.inputWrapper}>
          <label className={commonStyles.inputLabel}>가장자리 거리</label>
          <div className={commonStyles.inputWithUnit}>
            <input
              type="number"
              value={settings.camLock.boltEdgeDistance}
              onChange={(e) => updateCamLockSettings({ boltEdgeDistance: Number(e.target.value) })}
              className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
            />
            <span className={commonStyles.unit}>mm</span>
          </div>
        </div>
      </div>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>위치</h5>
        <div className={commonStyles.inputWrapper}>
          <label className={commonStyles.inputLabel}>가장자리 거리</label>
          <div className={commonStyles.inputWithUnit}>
            <input
              type="number"
              value={settings.camLock.edgeDistance}
              onChange={(e) => updateCamLockSettings({ edgeDistance: Number(e.target.value) })}
              className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
            />
            <span className={commonStyles.unit}>mm</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderShelfPinSettings = () => (
    <div className={styles.settingsSection}>
      <h4 className={styles.sectionTitle}>선반핀 설정</h4>

      <div className={styles.settingsGroup}>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>직경</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.shelfPin.diameter}
                onChange={(e) => updateShelfPinSettings({ diameter: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>깊이</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.shelfPin.depth}
                onChange={(e) => updateShelfPinSettings({ depth: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>32mm 시스템</h5>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>피치</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.shelfPin.pitch}
                onChange={(e) => updateShelfPinSettings({ pitch: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>시작 높이</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.shelfPin.startHeight}
                onChange={(e) => updateShelfPinSettings({ startHeight: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>열 위치</h5>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>앞쪽 열 위치</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.shelfPin.frontRowPosition}
                onChange={(e) => updateShelfPinSettings({ frontRowPosition: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>뒷쪽 열 위치</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.shelfPin.backRowPosition}
                onChange={(e) => updateShelfPinSettings({ backRowPosition: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDrawerRailSettings = () => (
    <div className={styles.settingsSection}>
      <h4 className={styles.sectionTitle}>Blum 서랍 레일 설정</h4>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>레일 타입</h5>
        <div className={styles.drawerRailTypeGrid}>
          {drawerRailTypes.map((type) => (
            <button
              key={type.id}
              className={`${styles.drawerRailTypeButton} ${
                settings.drawerRail.type === type.id ? styles.drawerRailTypeButtonActive : ''
              }`}
              onClick={() => updateDrawerRailSettings(DRAWER_RAIL_SETTINGS[type.id])}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>앞쪽 홀</h5>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>직경</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                step="0.1"
                value={settings.drawerRail.frontHoleDiameter}
                onChange={(e) => updateDrawerRailSettings({ frontHoleDiameter: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>거리</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.drawerRail.frontHoleDistance}
                onChange={(e) => updateDrawerRailSettings({ frontHoleDistance: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.settingsGroup}>
        <h5 className={styles.groupTitle}>뒷쪽 홀</h5>
        <div className={styles.rearHoleType}>
          <span className={styles.rearHoleTypeLabel}>타입:</span>
          <span className={styles.rearHoleTypeValue}>
            {settings.drawerRail.rearHoleType === 'slot' ? '장공 (Slot)' : '원형'}
          </span>
        </div>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>직경</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                step="0.1"
                value={settings.drawerRail.rearHoleDiameter}
                onChange={(e) => updateDrawerRailSettings({ rearHoleDiameter: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>거리</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.drawerRail.rearHoleDistance}
                onChange={(e) => updateDrawerRailSettings({ rearHoleDistance: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
        {settings.drawerRail.rearHoleType === 'slot' && settings.drawerRail.slotWidth && (
          <div className={commonStyles.inputGroupTwoColumns}>
            <div className={commonStyles.inputWrapper}>
              <label className={commonStyles.inputLabel}>장공 너비</label>
              <div className={commonStyles.inputWithUnit}>
                <input
                  type="number"
                  value={settings.drawerRail.slotWidth}
                  onChange={(e) => updateDrawerRailSettings({ slotWidth: Number(e.target.value) })}
                  className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
                />
                <span className={commonStyles.unit}>mm</span>
              </div>
            </div>
            <div className={commonStyles.inputWrapper}>
              <label className={commonStyles.inputLabel}>장공 높이</label>
              <div className={commonStyles.inputWithUnit}>
                <input
                  type="number"
                  value={settings.drawerRail.slotHeight}
                  onChange={(e) => updateDrawerRailSettings({ slotHeight: Number(e.target.value) })}
                  className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
                />
                <span className={commonStyles.unit}>mm</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderAdjustableFootSettings = () => (
    <div className={styles.settingsSection}>
      <h4 className={styles.sectionTitle}>조절발 설정</h4>

      <div className={styles.settingsGroup}>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>직경</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.adjustableFoot.diameter}
                onChange={(e) => updateAdjustableFootSettings({ diameter: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>깊이</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.adjustableFoot.depth}
                onChange={(e) => updateAdjustableFootSettings({ depth: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
        </div>
        <div className={commonStyles.inputGroupTwoColumns}>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>가장자리 거리</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                value={settings.adjustableFoot.insetFromEdge}
                onChange={(e) => updateAdjustableFootSettings({ insetFromEdge: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>mm</span>
            </div>
          </div>
          <div className={commonStyles.inputWrapper}>
            <label className={commonStyles.inputLabel}>개수</label>
            <div className={commonStyles.inputWithUnit}>
              <input
                type="number"
                min="2"
                max="6"
                value={settings.adjustableFoot.count}
                onChange={(e) => updateAdjustableFootSettings({ count: Number(e.target.value) })}
                className={`${commonStyles.input} ${commonStyles.inputWithUnitField}`}
              />
              <span className={commonStyles.unit}>개</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'hinge':
        return renderHingeSettings();
      case 'camLock':
        return renderCamLockSettings();
      case 'shelfPin':
        return renderShelfPinSettings();
      case 'drawerRail':
        return renderDrawerRailSettings();
      case 'adjustableFoot':
        return renderAdjustableFootSettings();
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>보링 설정</h3>
        <button className={styles.resetButton} onClick={resetToDefaults}>
          기본값 복원
        </button>
      </div>

      <div className={styles.tabNavigation}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>{renderTabContent()}</div>
    </div>
  );
};

export default BoringSettingsPanel;
