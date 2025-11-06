import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lock, CheckCircle, XCircle, Loader } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import {
  validateShareLink,
  grantProjectAccessViaLink,
  type ShareLink,
} from '@/firebase/shareLinks';
import { createProjectSharedNotification } from '@/firebase/notifications';
import styles from './ShareLinkAccess.module.css';

export const ShareLinkAccess: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [link, setLink] = useState<ShareLink | null>(null);
  const [password, setPassword] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const [isGranting, setIsGranting] = useState(false);
  const [error, setError] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  // 초기 링크 검증
  useEffect(() => {
    if (!token) {
      setError('유효하지 않은 링크입니다.');
      setIsValidating(false);
      return;
    }

    const validateLink = async () => {
      try {
        const validation = await validateShareLink(token);

        if (!validation.valid) {
          setError(validation.reason || '유효하지 않은 링크입니다.');
          setIsValidating(false);
          return;
        }

        if (validation.link) {
          setLink(validation.link);

          // 비밀번호가 필요한 경우
          if (validation.link.password) {
            setRequiresPassword(true);
            setIsValidating(false);
            return;
          }

          // 조회 권한(viewer)이면 비회원도 바로 프로젝트로 이동
          if (validation.link.permission === 'viewer') {
            console.log('👁️ 조회 권한 - 비회원 접근 허용, 프로젝트로 이동');
            setSuccess(true);
            setTimeout(() => {
              let url = `/configurator?projectId=${validation.link.projectId}&mode=readonly`;
              if (validation.link.designFileId) {
                url += `&designFileId=${validation.link.designFileId}`;
              }
              if (validation.link.designFileName) {
                url += `&designFileName=${encodeURIComponent(validation.link.designFileName)}`;
              }
              navigate(url);
            }, 2000);
            setIsValidating(false);
            return;
          }

          // 편집 권한(editor)이고 로그인 안 되어 있으면 로그인 요구
          if (validation.link.permission === 'editor' && !user && !authLoading) {
            setIsValidating(false);
            return;
          }
        }

        setIsValidating(false);
      } catch (err) {
        console.error('링크 검증 실패:', err);
        setError('링크 검증 중 오류가 발생했습니다.');
        setIsValidating(false);
      }
    };

    validateLink();
  }, [token, user, authLoading]);

  // 편집 권한 - 로그인 후 자동 권한 부여 (비밀번호 없는 경우)
  useEffect(() => {
    if (user && link && link.permission === 'editor' && !link.password && !success && !isGranting && !error) {
      console.log('✏️ 편집 권한 - 로그인 확인됨, 자동 권한 부여 시작');
      handleGrantAccess();
    }
  }, [user, link, success, isGranting, error]);

  // 권한 부여 처리
  const handleGrantAccess = async () => {
    if (!user || !token || !link) return;

    setIsGranting(true);
    setError('');

    try {
      const result = await grantProjectAccessViaLink(
        token,
        user.uid,
        user.displayName || user.email || '사용자',
        user.email || '',
        password || undefined
      );

      if (result.success && result.projectId) {
        // 알림 생성
        await createProjectSharedNotification(
          user.uid,
          result.projectId,
          link.projectName,
          link.createdBy,
          link.createdByName,
          result.permission || 'viewer'
        );

        setSuccess(true);

        // 3초 후 프로젝트로 이동
        setTimeout(() => {
          const url = `/configurator?projectId=${result.projectId}${link.designFileName ? `&designFileName=${encodeURIComponent(link.designFileName)}` : ''}`;
          navigate(url);
        }, 3000);
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error('권한 부여 실패:', err);
      setError('권한 부여 중 오류가 발생했습니다.');
    } finally {
      setIsGranting(false);
    }
  };

  // 비밀번호 제출
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    // 비밀번호 확인
    if (link && link.password !== password) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    // viewer 권한이면 바로 프로젝트로 이동 (로그인 불필요)
    if (link && link.permission === 'viewer') {
      console.log('👁️ 조회 권한 + 비밀번호 확인 완료 - 프로젝트로 이동');
      setSuccess(true);
      setTimeout(() => {
        const url = `/configurator?projectId=${link.projectId}${link.designFileName ? `&designFileName=${encodeURIComponent(link.designFileName)}` : ''}`;
        navigate(url);
      }, 2000);
      return;
    }

    // editor 권한이면 권한 부여 필요
    await handleGrantAccess();
  };

  // 홈페이지로 이동 (로그인 필요)
  const handleGoToLogin = () => {
    // 현재 링크를 localStorage에 저장
    if (token) {
      localStorage.setItem('pendingShareLink', `/share/${token}`);
    }
    // 홈페이지로 이동하면 로그인 화면이 표시됨
    navigate('/');
  };

  // 로그인 후 자동으로 링크 처리
  useEffect(() => {
    const pendingLink = localStorage.getItem('pendingShareLink');
    if (pendingLink && user) {
      localStorage.removeItem('pendingShareLink');
      // 현재 링크와 저장된 링크가 같으면 권한 부여 진행
      if (pendingLink === `/share/${token}`) {
        // 이미 validateLink에서 처리됨
      }
    }
  }, [user, token]);

  // 로딩 화면
  if (authLoading || isValidating) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <Loader className={styles.spinIcon} size={48} />
          <h2 className={styles.title}>링크 확인 중...</h2>
          <p className={styles.description}>잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  // 성공 화면
  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <CheckCircle className={styles.successIcon} size={64} />
          <h2 className={styles.title}>
            {link?.permission === 'viewer'
              ? '프로젝트를 조회합니다!'
              : '프로젝트 접근 권한이 부여되었습니다!'}
          </h2>
          <p className={styles.description}>
            곧 프로젝트로 이동합니다...
          </p>
          {link && (
            <div className={styles.projectInfo}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>프로젝트:</span>
                <span className={styles.infoValue}>{link.projectName}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>공유자:</span>
                <span className={styles.infoValue}>{link.createdByName}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>권한:</span>
                <span className={styles.infoValue}>
                  {link.permission === 'viewer' ? '조회만 가능' : '편집 가능'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 에러 화면
  if (error && !requiresPassword) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <XCircle className={styles.errorIcon} size={64} />
          <h2 className={styles.title}>링크 접근 실패</h2>
          <p className={styles.description}>{error}</p>
          <button className={styles.button} onClick={() => navigate('/')}>
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 비밀번호 입력 필요 (viewer는 비로그인 가능, editor는 로그인 필요)
  if (requiresPassword) {
    // editor 권한이고 로그인 안 되어 있으면 먼저 로그인 요구
    if (link?.permission === 'editor' && !user) {
      return (
        <div className={styles.container}>
          <div className={styles.card}>
            <div className={styles.iconWrapper}>
              <Lock size={48} />
            </div>
            <h2 className={styles.title}>로그인이 필요합니다</h2>
            <p className={styles.description}>
              이 프로젝트는 비밀번호로 보호되어 있으며, 편집 권한이 필요합니다. 먼저 로그인해주세요.
            </p>
            {link && (
              <div className={styles.projectInfo}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>프로젝트:</span>
                  <span className={styles.infoValue}>{link.projectName}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>공유자:</span>
                  <span className={styles.infoValue}>{link.createdByName}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>권한:</span>
                  <span className={styles.infoValue}>편집 가능</span>
                </div>
              </div>
            )}
            <button className={styles.button} onClick={handleGoToLogin}>
              로그인하기
            </button>
          </div>
        </div>
      );
    }

    // viewer 권한이거나 editor + 로그인 완료: 비밀번호 입력
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <Lock size={48} />
          </div>
          <h2 className={styles.title}>비밀번호가 필요합니다</h2>
          <p className={styles.description}>
            이 프로젝트는 비밀번호로 보호되어 있습니다
          </p>
          {link && (
            <div className={styles.projectInfo}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>프로젝트:</span>
                <span className={styles.infoValue}>{link.projectName}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>공유자:</span>
                <span className={styles.infoValue}>{link.createdByName}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>권한:</span>
                <span className={styles.infoValue}>
                  {link.permission === 'viewer' ? '조회만 가능' : '편집 가능'}
                </span>
              </div>
            </div>
          )}
          <form onSubmit={handlePasswordSubmit} className={styles.form}>
            <input
              type="password"
              className={styles.input}
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isGranting}
            />
            {error && <p className={styles.errorText}>{error}</p>}
            <button
              type="submit"
              className={styles.button}
              disabled={isGranting || !password.trim()}
            >
              {isGranting ? '확인 중...' : '확인'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 로그인 필요 (편집 권한이고 로그인하지 않은 경우)
  if (!user && link && link.permission === 'editor') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <Lock size={48} />
          </div>
          <h2 className={styles.title}>로그인이 필요합니다</h2>
          <p className={styles.description}>
            {requiresPassword
              ? '이 프로젝트는 비밀번호로 보호되어 있습니다. 먼저 로그인해주세요.'
              : '편집 권한으로 프로젝트에 접근하려면 로그인해주세요'
            }
          </p>
          {link && (
            <div className={styles.projectInfo}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>프로젝트:</span>
                <span className={styles.infoValue}>{link.projectName}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>공유자:</span>
                <span className={styles.infoValue}>{link.createdByName}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>권한:</span>
                <span className={styles.infoValue}>편집 가능</span>
              </div>
            </div>
          )}
          <button className={styles.button} onClick={handleGoToLogin}>
            로그인하기
          </button>
        </div>
      </div>
    );
  }

  // 모든 조건을 통과하지 못한 경우 (에러 처리)
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <XCircle className={styles.errorIcon} size={64} />
        <h2 className={styles.title}>페이지를 표시할 수 없습니다</h2>
        <p className={styles.description}>
          링크가 유효하지 않거나 페이지를 로드하는 중 문제가 발생했습니다.
        </p>
        <button className={styles.button} onClick={() => navigate('/')}>
          홈으로 돌아가기
        </button>
      </div>
    </div>
  );
};
