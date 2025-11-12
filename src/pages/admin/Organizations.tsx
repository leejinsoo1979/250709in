import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { SearchIcon } from '@/components/common/Icons';
import styles from './Organizations.module.css';

interface OrganizationData {
  id: string;
  name: string;
  domain?: string;
  planId?: string;
  subscriptionStatus?: 'trial' | 'active' | 'expired' | 'cancelled';
  ownerId?: string;
  createdAt?: Date;
  memberCount?: number;
}

const Organizations = () => {
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Firebase organizations 컬렉션 실시간 구독
    const orgsQuery = query(
      collection(db, 'organizations'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(orgsQuery, (snapshot) => {
      const orgsData: OrganizationData[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as DocumentData;
        orgsData.push({
          id: doc.id,
          name: data.name || '이름 없음',
          domain: data.domain || '',
          planId: data.planId || 'free',
          subscriptionStatus: data.subscriptionStatus || 'trial',
          ownerId: data.ownerId || '',
          createdAt: data.createdAt?.toDate?.() || null,
          memberCount: data.memberCount || 0
        });
      });
      setOrganizations(orgsData);
      setLoading(false);
    }, (error) => {
      console.error('조직 데이터 가져오기 오류:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredOrganizations = organizations.filter(org => {
    const query = searchQuery.toLowerCase();
    return (
      org.name.toLowerCase().includes(query) ||
      org.domain?.toLowerCase().includes(query) ||
      org.id.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status?: string) => {
    const statusMap = {
      trial: { label: '체험판', className: styles.statusTrial },
      active: { label: '활성', className: styles.statusActive },
      expired: { label: '만료', className: styles.statusExpired },
      cancelled: { label: '취소', className: styles.statusCancelled }
    };

    const statusInfo = statusMap[status as keyof typeof statusMap] || statusMap.trial;

    return <span className={`${styles.statusBadge} ${statusInfo.className}`}>{statusInfo.label}</span>;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>조직 관리</h1>
          <p className={styles.subtitle}>전체 {organizations.length}개의 조직</p>
        </div>
      </div>

      {/* 검색 */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <SearchIcon size={20} />
          <input
            type="text"
            placeholder="조직명, 도메인, ID로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* 조직 테이블 */}
      <div className={styles.tableContainer}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>조직 목록을 불러오는 중...</p>
          </div>
        ) : filteredOrganizations.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{searchQuery ? '검색 결과가 없습니다.' : '조직이 없습니다.'}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>조직명</th>
                <th>도메인</th>
                <th>구독 상태</th>
                <th>플랜</th>
                <th>멤버 수</th>
                <th>생성일</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrganizations.map((org) => (
                <tr key={org.id}>
                  <td>
                    <div className={styles.orgInfo}>
                      <div className={styles.orgIcon}>
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                      <span className={styles.orgName}>{org.name}</span>
                    </div>
                  </td>
                  <td>{org.domain || '-'}</td>
                  <td>{getStatusBadge(org.subscriptionStatus)}</td>
                  <td>
                    <span className={styles.planBadge}>{org.planId?.toUpperCase() || 'FREE'}</span>
                  </td>
                  <td>{org.memberCount || 0}명</td>
                  <td>
                    {org.createdAt
                      ? org.createdAt.toLocaleDateString('ko-KR')
                      : '-'}
                  </td>
                  <td>
                    <button className={styles.actionButton}>상세</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Organizations;
