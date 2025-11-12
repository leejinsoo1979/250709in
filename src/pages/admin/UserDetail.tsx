import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { PLANS } from '@/firebase/plans';
import styles from './UserDetail.module.css';

interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  createdAt: any;
  lastLoginAt: any;
  disabled: boolean;
  plan?: string;
  organization?: string;
  teams?: string[];
  role?: string;
  projectCount?: number;
  storageUsed?: number;
}

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) {
        setError('사용자 ID가 없습니다.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const userDoc = await getDoc(doc(db, 'users', userId));

        if (!userDoc.exists()) {
          setError('사용자를 찾을 수 없습니다.');
          setLoading(false);
          return;
        }

        const userData = userDoc.data() as UserData;
        setUser({ ...userData, uid: userDoc.id });
        setError(null);
      } catch (err) {
        console.error('사용자 정보 로딩 실패:', err);
        setError('사용자 정보를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>로딩 중...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error || '사용자를 찾을 수 없습니다.'}</p>
          <button onClick={() => navigate('/admin/users')} className={styles.backButton}>
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/admin/users')} className={styles.backButton}>
          ← 목록으로
        </button>
        <h1>사용자 상세 정보</h1>
      </div>

      <div className={styles.content}>
        {/* 기본 정보 */}
        <section className={styles.section}>
          <h2>기본 정보</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <label>이메일</label>
              <div>{user.email || '-'}</div>
            </div>
            <div className={styles.infoItem}>
              <label>이름</label>
              <div>{user.displayName || '-'}</div>
            </div>
            <div className={styles.infoItem}>
              <label>사용자 ID</label>
              <div className={styles.monospace}>{user.uid}</div>
            </div>
            <div className={styles.infoItem}>
              <label>상태</label>
              <div>
                {user.disabled ? (
                  <span className={styles.statusBadge} data-status="disabled">비활성</span>
                ) : (
                  <span className={styles.statusBadge} data-status="active">활성</span>
                )}
              </div>
            </div>
            <div className={styles.infoItem}>
              <label>이메일 인증</label>
              <div>
                {user.emailVerified ? (
                  <span className={styles.statusBadge} data-status="verified">인증됨</span>
                ) : (
                  <span className={styles.statusBadge} data-status="unverified">미인증</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 플랜 정보 */}
        <section className={styles.section}>
          <h2>플랜 정보</h2>
          <div className={styles.planInfo}>
            <span
              className={styles.planBadge}
              style={{ backgroundColor: PLANS[user.plan || 'free'].color }}
            >
              {PLANS[user.plan || 'free'].name}
            </span>
            <div className={styles.planFeatures}>
              <div>최대 프로젝트: {PLANS[user.plan || 'free'].maxProjects}개</div>
              <div>스토리지: {PLANS[user.plan || 'free'].storageLimit}GB</div>
            </div>
          </div>
        </section>

        {/* 소속 정보 */}
        <section className={styles.section}>
          <h2>소속 정보</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <label>조직</label>
              <div>{user.organization || '-'}</div>
            </div>
            <div className={styles.infoItem}>
              <label>역할</label>
              <div>{user.role || '-'}</div>
            </div>
            <div className={styles.infoItem}>
              <label>팀</label>
              <div>
                {user.teams && user.teams.length > 0
                  ? user.teams.join(', ')
                  : '-'}
              </div>
            </div>
          </div>
        </section>

        {/* 사용 현황 */}
        <section className={styles.section}>
          <h2>사용 현황</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <label>프로젝트 수</label>
              <div>{user.projectCount || 0}개</div>
            </div>
            <div className={styles.infoItem}>
              <label>스토리지 사용량</label>
              <div>{user.storageUsed ? `${(user.storageUsed / 1024 / 1024).toFixed(2)} MB` : '0 MB'}</div>
            </div>
          </div>
        </section>

        {/* 계정 활동 */}
        <section className={styles.section}>
          <h2>계정 활동</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <label>가입일</label>
              <div>
                {user.createdAt
                  ? new Date(user.createdAt.toMillis()).toLocaleString('ko-KR')
                  : '-'}
              </div>
            </div>
            <div className={styles.infoItem}>
              <label>마지막 로그인</label>
              <div>
                {user.lastLoginAt
                  ? new Date(user.lastLoginAt.toMillis()).toLocaleString('ko-KR')
                  : '-'}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
