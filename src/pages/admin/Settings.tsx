import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { HiOutlineCog, HiOutlineKey, HiOutlineGlobe, HiOutlineCheckCircle, HiOutlineSave } from 'react-icons/hi';
import {
  DEFAULT_AGREEMENT_SETTINGS,
  getAgreementConsentSettings,
  saveAgreementConsentSettings,
  type AgreementConsentSettings,
  type AgreementPopupTheme
} from '@/firebase/agreementSettings';
import styles from './Settings.module.css';

interface SystemSettings {
  // 환경 변수
  env: {
    nodeEnv: string;
    apiUrl: string;
    cdnUrl: string;
  };
  // API 키
  apiKeys: {
    googleMapsKey: string;
    stripePublicKey: string;
    firebaseWebApiKey: string;
    openaiApiKey: string;
  };
  // Webhook 설정
  webhooks: {
    slackWebhookUrl: string;
    discordWebhookUrl: string;
    customWebhookUrl: string;
  };
  // 기타 설정
  general: {
    maintenanceMode: boolean;
    allowSignups: boolean;
    maxProjectsPerUser: number;
    sessionTimeout: number;
  };
  updatedAt?: any;
  updatedBy?: string;
}

const Settings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>({
    env: {
      nodeEnv: 'production',
      apiUrl: '',
      cdnUrl: '',
    },
    apiKeys: {
      googleMapsKey: '',
      stripePublicKey: '',
      firebaseWebApiKey: '',
      openaiApiKey: '',
    },
    webhooks: {
      slackWebhookUrl: '',
      discordWebhookUrl: '',
      customWebhookUrl: '',
    },
    general: {
      maintenanceMode: false,
      allowSignups: true,
      maxProjectsPerUser: 10,
      sessionTimeout: 30,
    },
  });
  const [agreementSettings, setAgreementSettings] = useState<AgreementConsentSettings>(DEFAULT_AGREEMENT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'env' | 'apiKeys' | 'webhooks' | 'general' | 'agreements'>('env');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const docRef = doc(db, 'systemSettings', 'config');
      const [docSnap, nextAgreementSettings] = await Promise.all([
        getDoc(docRef),
        getAgreementConsentSettings()
      ]);

      if (docSnap.exists()) {
        setSettings(docSnap.data() as SystemSettings);
      }
      setAgreementSettings(nextAgreementSettings);
    } catch (error) {
      console.error('설정 로드 실패:', error);
      alert('설정을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      setSaving(true);
      const docRef = doc(db, 'systemSettings', 'config');
      await setDoc(docRef, {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await saveAgreementConsentSettings(agreementSettings, user.uid);

      alert('설정이 저장되었습니다.');
    } catch (error) {
      console.error('설정 저장 실패:', error);
      alert('설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const updateEnv = (key: keyof SystemSettings['env'], value: string) => {
    setSettings({
      ...settings,
      env: { ...settings.env, [key]: value },
    });
  };

  const updateApiKey = (key: keyof SystemSettings['apiKeys'], value: string) => {
    setSettings({
      ...settings,
      apiKeys: { ...settings.apiKeys, [key]: value },
    });
  };

  const updateWebhook = (key: keyof SystemSettings['webhooks'], value: string) => {
    setSettings({
      ...settings,
      webhooks: { ...settings.webhooks, [key]: value },
    });
  };

  const updateGeneral = (key: keyof SystemSettings['general'], value: string | boolean | number) => {
    setSettings({
      ...settings,
      general: { ...settings.general, [key]: value },
    });
  };

  const updateAgreementRoot = <K extends keyof Pick<AgreementConsentSettings, 'enabled' | 'termsVersion' | 'privacyVersion'>>(
    key: K,
    value: AgreementConsentSettings[K]
  ) => {
    setAgreementSettings({
      ...agreementSettings,
      [key]: value,
    });
  };

  const updateAgreementPopup = <K extends keyof AgreementConsentSettings['popup']>(
    key: K,
    value: AgreementConsentSettings['popup'][K]
  ) => {
    setAgreementSettings({
      ...agreementSettings,
      popup: { ...agreementSettings.popup, [key]: value },
    });
  };

  const updateAgreementChecks = <K extends keyof AgreementConsentSettings['checks']>(
    key: K,
    value: AgreementConsentSettings['checks'][K]
  ) => {
    setAgreementSettings({
      ...agreementSettings,
      checks: { ...agreementSettings.checks, [key]: value },
    });
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>시스템 설정</h1>
          <p className={styles.subtitle}>환경 변수, API 키, Webhook 연동 등을 관리합니다.</p>
        </div>
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={saving}
        >
          <HiOutlineSave size={20} />
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      {/* 탭 메뉴 */}
      <div className={styles.tabs}>
        <button
          className={activeTab === 'env' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setActiveTab('env')}
        >
          <HiOutlineGlobe size={18} />
          환경 변수
        </button>
        <button
          className={activeTab === 'apiKeys' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setActiveTab('apiKeys')}
        >
          <HiOutlineKey size={18} />
          API 키
        </button>
        <button
          className={activeTab === 'webhooks' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setActiveTab('webhooks')}
        >
          <HiOutlineCheckCircle size={18} />
          Webhook
        </button>
        <button
          className={activeTab === 'general' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setActiveTab('general')}
        >
          <HiOutlineCog size={18} />
          일반 설정
        </button>
        <button
          className={activeTab === 'agreements' ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          onClick={() => setActiveTab('agreements')}
        >
          <HiOutlineCheckCircle size={18} />
          약관 동의
        </button>
      </div>

      <div className={styles.content}>
        {/* 환경 변수 */}
        {activeTab === 'env' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>환경 변수</h2>
            <div className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Node 환경</label>
                <select
                  value={settings.env.nodeEnv}
                  onChange={(e) => updateEnv('nodeEnv', e.target.value)}
                  className={styles.input}
                >
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>API URL</label>
                <input
                  type="text"
                  placeholder="https://api.example.com"
                  value={settings.env.apiUrl}
                  onChange={(e) => updateEnv('apiUrl', e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>CDN URL</label>
                <input
                  type="text"
                  placeholder="https://cdn.example.com"
                  value={settings.env.cdnUrl}
                  onChange={(e) => updateEnv('cdnUrl', e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>
          </div>
        )}

        {/* API 키 */}
        {activeTab === 'apiKeys' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>API 키</h2>
            <p className={styles.warning}>⚠️ API 키는 안전하게 보관하세요. 절대 외부에 노출하지 마세요.</p>
            <div className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Google Maps API Key</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={settings.apiKeys.googleMapsKey}
                  onChange={(e) => updateApiKey('googleMapsKey', e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Stripe Public Key</label>
                <input
                  type="password"
                  placeholder="pk_live_..."
                  value={settings.apiKeys.stripePublicKey}
                  onChange={(e) => updateApiKey('stripePublicKey', e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Firebase Web API Key</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={settings.apiKeys.firebaseWebApiKey}
                  onChange={(e) => updateApiKey('firebaseWebApiKey', e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>OpenAI API Key</label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={settings.apiKeys.openaiApiKey}
                  onChange={(e) => updateApiKey('openaiApiKey', e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>
          </div>
        )}

        {/* Webhook */}
        {activeTab === 'webhooks' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Webhook 연동</h2>
            <div className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Slack Webhook URL</label>
                <input
                  type="text"
                  placeholder="https://hooks.slack.com/services/..."
                  value={settings.webhooks.slackWebhookUrl}
                  onChange={(e) => updateWebhook('slackWebhookUrl', e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Discord Webhook URL</label>
                <input
                  type="text"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={settings.webhooks.discordWebhookUrl}
                  onChange={(e) => updateWebhook('discordWebhookUrl', e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Custom Webhook URL</label>
                <input
                  type="text"
                  placeholder="https://example.com/webhook"
                  value={settings.webhooks.customWebhookUrl}
                  onChange={(e) => updateWebhook('customWebhookUrl', e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>
          </div>
        )}

        {/* 일반 설정 */}
        {activeTab === 'general' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>일반 설정</h2>
            <div className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={settings.general.maintenanceMode}
                    onChange={(e) => updateGeneral('maintenanceMode', e.target.checked)}
                  />
                  <span>유지보수 모드 활성화</span>
                </label>
                <p className={styles.hint}>활성화 시 일반 사용자는 접근할 수 없습니다.</p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={settings.general.allowSignups}
                    onChange={(e) => updateGeneral('allowSignups', e.target.checked)}
                  />
                  <span>신규 회원가입 허용</span>
                </label>
                <p className={styles.hint}>비활성화 시 새로운 사용자가 가입할 수 없습니다.</p>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>사용자당 최대 프로젝트 수</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.general.maxProjectsPerUser}
                  onChange={(e) => updateGeneral('maxProjectsPerUser', parseInt(e.target.value))}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>세션 타임아웃 (분)</label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={settings.general.sessionTimeout}
                  onChange={(e) => updateGeneral('sessionTimeout', parseInt(e.target.value))}
                  className={styles.input}
                />
              </div>
            </div>
          </div>
        )}

        {/* 약관 동의 설정 */}
        {activeTab === 'agreements' && (
          <div className={styles.section}>
            <div>
              <h2 className={styles.sectionTitle}>약관 동의 화면 설정</h2>
              <p className={styles.hint}>로그인 사용자가 최신 약관 버전에 동의하지 않았을 때 표시되는 팝업을 설정합니다. 버전을 변경하면 기존 사용자에게 다시 동의를 받습니다.</p>
            </div>

            <div className={styles.settingsGrid}>
              <div className={styles.form}>
                <div className={styles.formGroup}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={agreementSettings.enabled}
                      onChange={(e) => updateAgreementRoot('enabled', e.target.checked)}
                    />
                    <span>약관 동의 게이트 활성화</span>
                  </label>
                  <p className={styles.hint}>비활성화하면 약관 미동의 사용자도 서비스에 진입할 수 있습니다.</p>
                </div>

                <div className={styles.twoColumn}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>이용약관 버전</label>
                    <input
                      type="text"
                      value={agreementSettings.termsVersion}
                      onChange={(e) => updateAgreementRoot('termsVersion', e.target.value)}
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>개인정보처리방침 버전</label>
                    <input
                      type="text"
                      value={agreementSettings.privacyVersion}
                      onChange={(e) => updateAgreementRoot('privacyVersion', e.target.value)}
                      className={styles.input}
                    />
                  </div>
                </div>

                <div className={styles.divider} />

                <div className={styles.twoColumn}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>브랜드 라벨</label>
                    <input
                      type="text"
                      value={agreementSettings.popup.brandLabel}
                      onChange={(e) => updateAgreementPopup('brandLabel', e.target.value)}
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>팝업 테마</label>
                    <select
                      value={agreementSettings.popup.theme}
                      onChange={(e) => updateAgreementPopup('theme', e.target.value as AgreementPopupTheme)}
                      className={styles.input}
                    >
                      <option value="light">Light</option>
                      <option value="brand">Brand</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>제목</label>
                  <input
                    type="text"
                    value={agreementSettings.popup.title}
                    onChange={(e) => updateAgreementPopup('title', e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>설명</label>
                  <textarea
                    value={agreementSettings.popup.description}
                    onChange={(e) => updateAgreementPopup('description', e.target.value)}
                    className={`${styles.input} ${styles.textarea}`}
                  />
                </div>

                <div className={styles.twoColumn}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>확인 버튼 문구</label>
                    <input
                      type="text"
                      value={agreementSettings.popup.primaryButtonText}
                      onChange={(e) => updateAgreementPopup('primaryButtonText', e.target.value)}
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>보조 버튼 문구</label>
                    <input
                      type="text"
                      value={agreementSettings.popup.secondaryButtonText}
                      onChange={(e) => updateAgreementPopup('secondaryButtonText', e.target.value)}
                      className={styles.input}
                    />
                  </div>
                </div>

                <div className={styles.switchGrid}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={agreementSettings.popup.showLogoMark}
                      onChange={(e) => updateAgreementPopup('showLogoMark', e.target.checked)}
                    />
                    <span>로고 마크 표시</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={agreementSettings.popup.showLogoutButton}
                      onChange={(e) => updateAgreementPopup('showLogoutButton', e.target.checked)}
                    />
                    <span>로그아웃 버튼 표시</span>
                  </label>
                </div>

                <div className={styles.divider} />

                <div className={styles.switchGrid}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={agreementSettings.checks.requireTerms}
                      onChange={(e) => updateAgreementChecks('requireTerms', e.target.checked)}
                    />
                    <span>이용약관 체크 필수</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={agreementSettings.checks.requirePrivacy}
                      onChange={(e) => updateAgreementChecks('requirePrivacy', e.target.checked)}
                    />
                    <span>개인정보 체크 필수</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={agreementSettings.checks.enableMarketing}
                      onChange={(e) => updateAgreementChecks('enableMarketing', e.target.checked)}
                    />
                    <span>마케팅 체크 표시</span>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={agreementSettings.checks.requireMarketing}
                      disabled={!agreementSettings.checks.enableMarketing}
                      onChange={(e) => updateAgreementChecks('requireMarketing', e.target.checked)}
                    />
                    <span>마케팅 체크 필수</span>
                  </label>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>마케팅 체크 문구</label>
                  <input
                    type="text"
                    value={agreementSettings.checks.marketingLabel}
                    onChange={(e) => updateAgreementChecks('marketingLabel', e.target.value)}
                    className={styles.input}
                    disabled={!agreementSettings.checks.enableMarketing}
                  />
                </div>
              </div>

              <div className={styles.previewPanel}>
                <div className={styles.previewTitle}>미리보기</div>
                <div className={`${styles.agreementPreview} ${styles[`preview_${agreementSettings.popup.theme}`]}`}>
                  <div className={styles.previewCard}>
                    {agreementSettings.popup.showLogoMark && (
                      <div className={styles.previewLogo} aria-hidden="true">
                        {[0, 1, 2, 3, 4, 5].map((index) => <span key={index} />)}
                      </div>
                    )}
                    <p>{agreementSettings.popup.brandLabel}</p>
                    <h3>{agreementSettings.popup.title}</h3>
                    <span>{agreementSettings.popup.description}</span>
                    <div className={styles.previewChecks}>
                      {agreementSettings.checks.requireTerms && <div>[필수] 이용약관에 동의합니다.</div>}
                      {agreementSettings.checks.requirePrivacy && <div>[필수] 개인정보처리방침 및 개인정보 수집·이용에 동의합니다.</div>}
                      {agreementSettings.checks.enableMarketing && <div>{agreementSettings.checks.marketingLabel}</div>}
                    </div>
                    <div className={styles.previewActions}>
                      <button>{agreementSettings.popup.primaryButtonText}</button>
                      {agreementSettings.popup.showLogoutButton && <button>{agreementSettings.popup.secondaryButtonText}</button>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
