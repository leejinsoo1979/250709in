import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { HiOutlineKey, HiOutlinePlus, HiOutlineTrash, HiOutlineClipboard, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import styles from './AllApiKeys.module.css';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  scope: 'all' | 'configurator' | 'optimizer';
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  lastUsed?: Timestamp;
}

const AllApiKeys = () => {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [keyScope, setKeyScope] = useState<'all' | 'configurator' | 'optimizer'>('all');
  const [expiryDays, setExpiryDays] = useState<number>(0); // 0 = 무제한
  const [customDays, setCustomDays] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadApiKeys();
  }, [user]);

  const loadApiKeys = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const keysQuery = query(
        collection(db, 'apiKeys'),
        where('userId', '==', user.uid)
      );
      const snapshot = await getDocs(keysQuery);
      const keysList: ApiKey[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        keysList.push({
          id: doc.id,
          name: data.name,
          key: data.key,
          scope: data.scope || 'all',
          userId: data.userId,
          userName: data.userName,
          userEmail: data.userEmail,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          lastUsed: data.lastUsed,
        });
      });

      // 최신순 정렬
      keysList.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      setApiKeys(keysList);
    } catch (error) {
      console.error('API 키 로드 실패:', error);
      alert('API 키를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const generateApiKey = (scope: 'all' | 'configurator' | 'optimizer') => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let prefix = 'all_';
    if (scope === 'configurator') prefix = 'cfg_';
    if (scope === 'optimizer') prefix = 'opt_';

    let key = prefix;
    for (let i = 0; i < 48; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const handleCreateKey = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (!newKeyName.trim()) {
      alert('API 키 이름을 입력해주세요.');
      return;
    }

    try {
      const newKey = generateApiKey(keyScope);

      // 유효기간 계산
      let expiresAt = null;
      if (expiryDays > 0) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + expiryDays);
        expiresAt = Timestamp.fromDate(expiryDate);
      }

      await addDoc(collection(db, 'apiKeys'), {
        name: newKeyName.trim(),
        key: newKey,
        scope: keyScope,
        userId: user.uid,
        userName: user.displayName || '',
        userEmail: user.email || '',
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
      });

      alert('API 키가 생성되었습니다.\n\n⚠️ 키를 안전한 곳에 보관하세요. 다시 확인할 수 없습니다.');
      setNewKeyName('');
      setKeyScope('all');
      setExpiryDays(0);
      setCustomDays('');
      setShowDropdown(false);
      setIsAdding(false);
      loadApiKeys();
    } catch (error) {
      console.error('API 키 생성 실패:', error);
      alert('API 키 생성에 실패했습니다.');
    }
  };

  const handleDeleteKey = async (id: string, name: string) => {
    if (!confirm(`"${name}" API 키를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 이 키를 사용하는 모든 요청이 실패하게 됩니다.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'apiKeys', id));
      alert('API 키가 삭제되었습니다.');
      loadApiKeys();
    } catch (error) {
      console.error('API 키 삭제 실패:', error);
      alert('API 키 삭제에 실패했습니다.');
    }
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    alert('API 키가 클립보드에 복사되었습니다.');
  };

  const toggleKeyVisibility = (keyId: string) => {
    const newVisibleKeys = new Set(visibleKeys);
    if (newVisibleKeys.has(keyId)) {
      newVisibleKeys.delete(keyId);
    } else {
      newVisibleKeys.add(keyId);
    }
    setVisibleKeys(newVisibleKeys);
  };

  const maskKey = (key: string) => {
    return key.substring(0, 7) + '••••••••••••••••••••••••••••••••••••••••••' + key.substring(key.length - 4);
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
          <h1 className={styles.title}>API 키 관리</h1>
          <p className={styles.subtitle}>애플리케이션에서 사용할 API 키를 생성하고 관리합니다.</p>
        </div>
        <button
          className={styles.createButton}
          onClick={() => setIsAdding(!isAdding)}
        >
          <HiOutlinePlus size={20} />
          API 키 생성
        </button>
      </div>

      {/* API 키 생성 폼 */}
      {isAdding && (
        <div className={styles.createForm}>
          <div className={styles.formGroup}>
            <label className={styles.label}>API 키 이름</label>
            <input
              type="text"
              placeholder="예: Production Server, Mobile App"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className={styles.input}
              autoFocus
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>API 범위</label>
            <div className={styles.radioGroup}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="keyScope"
                  checked={keyScope === 'all'}
                  onChange={() => setKeyScope('all')}
                />
                <span>전체 (all_)</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="keyScope"
                  checked={keyScope === 'configurator'}
                  onChange={() => setKeyScope('configurator')}
                />
                <span>컨피규레이터 (cfg_)</span>
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="keyScope"
                  checked={keyScope === 'optimizer'}
                  onChange={() => setKeyScope('optimizer')}
                />
                <span>옵티마이저 (opt_)</span>
              </label>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>유효기간</label>
            <div className={styles.customSelect}>
              <div
                className={styles.selectTrigger}
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <span>
                  {expiryDays === 0 ? '무제한' :
                   expiryDays === 30 ? '30일' :
                   expiryDays === 90 ? '90일' :
                   expiryDays === 180 ? '180일' :
                   expiryDays === 365 ? '1년' :
                   `${expiryDays}일`}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 8L2 4h8L6 8z" />
                </svg>
              </div>
              {showDropdown && (
                <div className={styles.selectDropdown}>
                  <div
                    className={styles.selectOption}
                    onClick={() => {
                      setExpiryDays(0);
                      setCustomDays('');
                      setShowDropdown(false);
                    }}
                  >
                    무제한
                  </div>
                  <div
                    className={styles.selectOption}
                    onClick={() => {
                      setExpiryDays(30);
                      setCustomDays('');
                      setShowDropdown(false);
                    }}
                  >
                    30일
                  </div>
                  <div
                    className={styles.selectOption}
                    onClick={() => {
                      setExpiryDays(90);
                      setCustomDays('');
                      setShowDropdown(false);
                    }}
                  >
                    90일
                  </div>
                  <div
                    className={styles.selectOption}
                    onClick={() => {
                      setExpiryDays(180);
                      setCustomDays('');
                      setShowDropdown(false);
                    }}
                  >
                    180일
                  </div>
                  <div
                    className={styles.selectOption}
                    onClick={() => {
                      setExpiryDays(365);
                      setCustomDays('');
                      setShowDropdown(false);
                    }}
                  >
                    1년
                  </div>
                  <div className={styles.selectDivider}></div>
                  <div className={styles.customInputWrapper}>
                    <input
                      type="number"
                      placeholder="직접 입력 (일)"
                      value={customDays}
                      onChange={(e) => {
                        setCustomDays(e.target.value);
                        const days = Number(e.target.value);
                        if (days > 0) {
                          setExpiryDays(days);
                        }
                      }}
                      className={styles.customInput}
                      min="1"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className={styles.formActions}>
            <button className={styles.cancelButton} onClick={() => setIsAdding(false)}>
              취소
            </button>
            <button className={styles.submitButton} onClick={handleCreateKey}>
              생성
            </button>
          </div>
        </div>
      )}

      {/* 안내 메시지 */}
      <div className={styles.notice}>
        <HiOutlineKey size={20} />
        <div>
          <p className={styles.noticeTitle}>API 키 보안 주의사항</p>
          <p className={styles.noticeText}>
            • API 키는 생성 직후에만 전체 내용을 확인할 수 있습니다.<br/>
            • 키를 안전한 곳에 보관하고, 절대 코드에 직접 포함하지 마세요.<br/>
            • 키가 노출되었다면 즉시 삭제하고 새로운 키를 생성하세요.
          </p>
        </div>
      </div>

      {/* API 키 목록 */}
      <div className={styles.keysList}>
        {apiKeys.length === 0 ? (
          <div className={styles.emptyState}>
            <HiOutlineKey size={48} />
            <p>생성된 API 키가 없습니다.</p>
            <button className={styles.emptyButton} onClick={() => setIsAdding(true)}>
              <HiOutlinePlus size={18} />
              첫 번째 API 키 생성하기
            </button>
          </div>
        ) : (
          apiKeys.map((apiKey) => (
            <div key={apiKey.id} className={styles.keyCard}>
              <div className={styles.keyHeader}>
                <div className={styles.keyInfo}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <h3 className={styles.keyName}>{apiKey.name}</h3>
                    <span className={styles.scopeBadge} data-scope={apiKey.scope}>
                      {apiKey.scope === 'all' ? '전체' : apiKey.scope === 'configurator' ? '컨피규레이터' : '옵티마이저'}
                    </span>
                  </div>
                  <div className={styles.keyDates}>
                    <span className={styles.keyDate}>
                      생성: {new Date(apiKey.createdAt.toMillis()).toLocaleString('ko-KR')}
                    </span>
                    {apiKey.expiresAt && (
                      <span className={styles.keyExpiry}>
                        만료: {new Date(apiKey.expiresAt.toMillis()).toLocaleString('ko-KR')}
                        {apiKey.expiresAt.toMillis() < Date.now() && (
                          <span className={styles.expiredBadge}> (만료됨)</span>
                        )}
                      </span>
                    )}
                    {!apiKey.expiresAt && (
                      <span className={styles.keyExpiry}>
                        유효기간: 무제한
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className={styles.deleteButton}
                  onClick={() => handleDeleteKey(apiKey.id, apiKey.name)}
                  title="삭제"
                >
                  <HiOutlineTrash size={18} />
                </button>
              </div>

              <div className={styles.keyContent}>
                <div className={styles.keyValue}>
                  <code className={styles.keyCode}>
                    {visibleKeys.has(apiKey.id) ? apiKey.key : maskKey(apiKey.key)}
                  </code>
                </div>
                <div className={styles.keyActions}>
                  <button
                    className={styles.actionButton}
                    onClick={() => toggleKeyVisibility(apiKey.id)}
                    title={visibleKeys.has(apiKey.id) ? '숨기기' : '보기'}
                  >
                    {visibleKeys.has(apiKey.id) ? (
                      <HiOutlineEyeOff size={18} />
                    ) : (
                      <HiOutlineEye size={18} />
                    )}
                  </button>
                  <button
                    className={styles.actionButton}
                    onClick={() => copyToClipboard(apiKey.key)}
                    title="복사"
                  >
                    <HiOutlineClipboard size={18} />
                  </button>
                </div>
              </div>

              {apiKey.lastUsed && (
                <div className={styles.keyFooter}>
                  마지막 사용: {new Date(apiKey.lastUsed.toMillis()).toLocaleString('ko-KR')}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AllApiKeys;
