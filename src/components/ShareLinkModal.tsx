import React, { useState, useEffect } from 'react';
import { X, Link2, Copy, Check, Lock, Calendar, Users, Eye, Edit } from 'lucide-react';
import { createShareLink, type SharePermission, type ShareLink } from '@/firebase/shareLinks';
import { useAuth } from '@/auth/AuthProvider';
import styles from './ShareLinkModal.module.css';

interface ShareLinkModalProps {
  projectId: string;
  projectName: string;
  designFileId?: string | null; // 특정 디자인 파일 공유 시 사용
  designFileName?: string; // 특정 디자인 파일 공유 시 사용
  onClose: () => void;
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  projectId,
  projectName,
  designFileId,
  designFileName,
  onClose,
}) => {
  const { user } = useAuth();
  const [permission, setPermission] = useState<SharePermission>('viewer');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [maxUsage, setMaxUsage] = useState<number | undefined>(undefined);
  const [useMaxUsage, setUseMaxUsage] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const shareUrl = generatedLink
    ? `${window.location.origin}/share/${generatedLink.token}`
    : '';

  const handleGenerateLink = async () => {
    if (!user) return;

    setIsGenerating(true);
    try {
      const link = await createShareLink(
        projectId,
        projectName,
        user.uid,
        user.displayName || user.email || '사용자',
        permission,
        expiresInDays,
        usePassword ? password : undefined,
        useMaxUsage ? maxUsage : undefined,
        designFileId || undefined,
        designFileName || undefined
      );

      setGeneratedLink(link);
    } catch (error) {
      console.error('링크 생성 실패:', error);
      alert('링크 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('복사 실패:', error);
    }
  };

  const getPermissionText = (perm: SharePermission) => {
    return perm === 'viewer' ? '조회만 가능' : '편집 가능';
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Link2 size={24} />
            <h2>설계도면 공유</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {designFileName ? (
            <p className={styles.description}>
              <strong>"{designFileName}"</strong> 디자인 파일을 공유합니다.
            </p>
          ) : (
            <p className={styles.description}>
              다양한 권한을 설정하여 설계도면을 공유할 수 있습니다.
            </p>
          )}

          {/* 링크가 생성되지 않았을 때 */}
          {!generatedLink && (
            <>
              {/* 권한 선택 */}
              <div className={styles.section}>
                <label className={styles.label}>
                  <Users size={18} />
                  모든 링크 소지자 조회 가능
                </label>
                <div className={styles.permissionButtons}>
                  <button
                    className={`${styles.permissionButton} ${
                      permission === 'viewer' ? styles.active : ''
                    }`}
                    onClick={() => setPermission('viewer')}
                  >
                    <Eye size={18} />
                    <div>
                      <div className={styles.permissionTitle}>조회 권한</div>
                      <div className={styles.permissionDesc}>
                        설계도면을 볼 수만 있습니다
                      </div>
                    </div>
                  </button>
                  <button
                    className={`${styles.permissionButton} ${
                      permission === 'editor' ? styles.active : ''
                    }`}
                    onClick={() => setPermission('editor')}
                  >
                    <Edit size={18} />
                    <div>
                      <div className={styles.permissionTitle}>편집 권한</div>
                      <div className={styles.permissionDesc}>
                        설계도면을 수정할 수 있습니다
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* 유효 기간 */}
              <div className={styles.section}>
                <label className={styles.label}>
                  <Calendar size={18} />
                  유효 기간
                </label>
                <div className={styles.expiryButtons}>
                  {[1, 3, 7, 30].map((days) => (
                    <button
                      key={days}
                      className={`${styles.expiryButton} ${
                        expiresInDays === days ? styles.active : ''
                      }`}
                      onClick={() => setExpiresInDays(days)}
                    >
                      {days}일
                    </button>
                  ))}
                </div>
              </div>

              {/* 고급 옵션 */}
              <div className={styles.section}>
                <button
                  className={styles.advancedToggle}
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  {showAdvanced ? '고급 옵션 숨기기' : '고급 옵션 보기'} ▼
                </button>

                {showAdvanced && (
                  <div className={styles.advancedOptions}>
                    {/* 비밀번호 보호 */}
                    <div className={styles.optionGroup}>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={usePassword}
                          onChange={(e) => setUsePassword(e.target.checked)}
                        />
                        <Lock size={16} />
                        비밀번호 보호
                      </label>
                      {usePassword && (
                        <input
                          type="password"
                          className={styles.input}
                          placeholder="비밀번호 입력"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      )}
                    </div>

                    {/* 사용 횟수 제한 */}
                    <div className={styles.optionGroup}>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={useMaxUsage}
                          onChange={(e) => setUseMaxUsage(e.target.checked)}
                        />
                        <Users size={16} />
                        사용 횟수 제한
                      </label>
                      {useMaxUsage && (
                        <input
                          type="number"
                          className={styles.input}
                          placeholder="최대 사용 횟수"
                          min="1"
                          value={maxUsage || ''}
                          onChange={(e) =>
                            setMaxUsage(
                              e.target.value ? parseInt(e.target.value) : undefined
                            )
                          }
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 생성 버튼 */}
              <button
                className={styles.generateButton}
                onClick={handleGenerateLink}
                disabled={isGenerating}
              >
                {isGenerating ? '링크 생성 중...' : '링크 생성'}
              </button>
            </>
          )}

          {/* 링크가 생성되었을 때 */}
          {generatedLink && (
            <>
              <div className={styles.successSection}>
                <div className={styles.successIcon}>
                  <Check size={32} />
                </div>
                <h3 className={styles.successTitle}>링크 생성 완료!</h3>
                <p className={styles.successDesc}>
                  아래 링크를 복사하여 공유하세요
                </p>
              </div>

              {/* 링크 복사 */}
              <div className={styles.linkSection}>
                <input
                  type="text"
                  className={styles.linkInput}
                  value={shareUrl}
                  readOnly
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  className={`${styles.copyButton} ${copied ? styles.copied : ''}`}
                  onClick={handleCopyLink}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  {copied ? '복사됨' : '링크 복사'}
                </button>
              </div>

              {/* 링크 정보 */}
              <div className={styles.linkInfo}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>권한:</span>
                  <span className={styles.infoValue}>
                    {getPermissionText(generatedLink.permission)}
                  </span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>유효 기간:</span>
                  <span className={styles.infoValue}>
                    {generatedLink.expiresAt.toDate().toLocaleDateString('ko-KR')}까지
                  </span>
                </div>
                {generatedLink.password && (
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>보안:</span>
                    <span className={styles.infoValue}>비밀번호 보호됨</span>
                  </div>
                )}
                {generatedLink.maxUsage && (
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>사용 제한:</span>
                    <span className={styles.infoValue}>
                      최대 {generatedLink.maxUsage}회
                    </span>
                  </div>
                )}
              </div>

              {/* 새 링크 생성 */}
              <button
                className={styles.newLinkButton}
                onClick={() => setGeneratedLink(null)}
              >
                새 링크 생성
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
