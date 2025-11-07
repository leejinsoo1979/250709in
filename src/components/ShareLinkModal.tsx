import React, { useState, useEffect } from 'react';
import { X, Link2, Copy, Check, Lock, Calendar, Users, Eye, Edit, Mail, Send } from 'lucide-react';
import { createShareLink, shareProjectWithEmail, type SharePermission, type ShareLink } from '@/firebase/shareLinks';
import { useAuth } from '@/auth/AuthProvider';
import styles from './ShareLinkModal.module.css';

interface ShareLinkModalProps {
  projectId: string;
  projectName: string;
  designFileId?: string | null; // 특정 디자인 파일 공유 시 사용
  designFileName?: string; // 특정 디자인 파일 공유 시 사용
  onClose: () => void;
}

type ShareMode = 'link' | 'email';

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  projectId,
  projectName,
  designFileId,
  designFileName,
  onClose,
}) => {
  const { user } = useAuth();
  const [shareMode, setShareMode] = useState<ShareMode>('email'); // 기본값을 이메일 초대로 변경
  const [permission, setPermission] = useState<SharePermission>('viewer');

  // 링크 공유 관련 상태
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [maxUsage, setMaxUsage] = useState<number | undefined>(undefined);
  const [useMaxUsage, setUseMaxUsage] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 이메일 초대 관련 상태
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState('');

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

  // 이메일 초대 처리
  const handleSendInvite = async () => {
    if (!user || !inviteEmail.trim()) {
      setInviteError('이메일을 입력해주세요.');
      return;
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      setInviteError('올바른 이메일 형식이 아닙니다.');
      return;
    }

    setIsSendingInvite(true);
    setInviteError('');

    try {
      const result = await shareProjectWithEmail(
        projectId,
        projectName,
        user.uid,
        user.displayName || user.email || '사용자',
        inviteEmail.trim(),
        permission
      );

      if (result.success) {
        setInviteSuccess(true);
        setInviteEmail(''); // 입력 필드 초기화
        setTimeout(() => {
          setInviteSuccess(false);
        }, 3000);
      } else {
        setInviteError(result.message);
      }
    } catch (error) {
      console.error('이메일 초대 실패:', error);
      setInviteError('초대 중 오류가 발생했습니다.');
    } finally {
      setIsSendingInvite(false);
    }
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

          {/* 공유 방식 선택 탭 */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            borderBottom: '1px solid #e0e0e0',
            paddingBottom: '0'
          }}>
            <button
              onClick={() => setShareMode('email')}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                background: shareMode === 'email' ? 'white' : 'transparent',
                borderBottom: shareMode === 'email' ? '2px solid #2563eb' : '2px solid transparent',
                color: shareMode === 'email' ? '#2563eb' : '#666',
                cursor: 'pointer',
                fontWeight: shareMode === 'email' ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <Mail size={18} />
              이메일로 초대
            </button>
            <button
              onClick={() => setShareMode('link')}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                background: shareMode === 'link' ? 'white' : 'transparent',
                borderBottom: shareMode === 'link' ? '2px solid #2563eb' : '2px solid transparent',
                color: shareMode === 'link' ? '#2563eb' : '#666',
                cursor: 'pointer',
                fontWeight: shareMode === 'link' ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <Link2 size={18} />
              링크로 공유
            </button>
          </div>

          {/* 이메일 초대 모드 */}
          {shareMode === 'email' && (
            <>
              {/* 권한 선택 */}
              <div className={styles.section}>
                <label className={styles.label}>
                  <Users size={18} />
                  초대할 사용자
                </label>
                <input
                  type="email"
                  className={styles.input}
                  placeholder="이메일 주소 입력"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteError('');
                  }}
                  disabled={isSendingInvite}
                  style={{
                    padding: '12px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
                {inviteError && (
                  <p style={{ color: '#ef4444', fontSize: '14px', marginTop: '8px' }}>
                    {inviteError}
                  </p>
                )}
                {inviteSuccess && (
                  <p style={{ color: '#10b981', fontSize: '14px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={16} />
                    초대를 전송했습니다!
                  </p>
                )}
              </div>

              {/* 권한 선택 */}
              <div className={styles.section}>
                <label className={styles.label}>
                  <Users size={18} />
                  권한 설정
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

              {/* 초대 버튼 */}
              <button
                className={styles.generateButton}
                onClick={handleSendInvite}
                disabled={isSendingInvite || !inviteEmail.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Send size={18} />
                {isSendingInvite ? '전송 중...' : '초대 전송'}
              </button>
            </>
          )}

          {/* 링크 공유 모드 - 링크가 생성되지 않았을 때 */}
          {shareMode === 'link' && !generatedLink && (
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

          {/* 링크 공유 모드 - 링크가 생성되었을 때 */}
          {shareMode === 'link' && generatedLink && (
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
