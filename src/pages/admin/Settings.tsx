import { useState, useEffect } from 'react';
import { collection, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { HiOutlineCog, HiOutlineKey, HiOutlineGlobe, HiOutlineCheckCircle, HiOutlineSave } from 'react-icons/hi';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'env' | 'apiKeys' | 'webhooks' | 'general'>('env');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const docRef = doc(db, 'systemSettings', 'config');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setSettings(docSnap.data() as SystemSettings);
      }
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
      </div>
    </div>
  );
};

export default Settings;
