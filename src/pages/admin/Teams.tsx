import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { collection, query, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { GoPeople } from 'react-icons/go';
import { HiOutlineUsers, HiOutlineFolder, HiOutlineCube, HiOutlinePhotograph, HiOutlineBriefcase } from 'react-icons/hi';
import styles from './Teams.module.css';

interface TeamData {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  memberCount: number;
  projectCount: number;
}

interface TeamMember {
  userId: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: string;
  joinedAt: Date | null;
  status: string;
}

const Teams = () => {
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // 팀 목록 가져오기
  useEffect(() => {
    if (!user) {
      console.log('🏢 Teams: user 없음');
      return;
    }

    const fetchTeams = async () => {
      try {
        setLoading(true);
        console.log('🏢 팀 목록 조회 중...');

        const teamsSnapshot = await getDocs(collection(db, 'teams'));
        console.log('🏢 팀 개수:', teamsSnapshot.size);

        // ⚡ 각 팀의 members/projects 서브컬렉션을 모두 병렬로 조회 (이전엔 직렬 → 무한 로딩)
        const subResults = await Promise.all(
          teamsSnapshot.docs.map(async (teamDoc) => {
            const [members, projects] = await Promise.all([
              getDocs(collection(db, 'teams', teamDoc.id, 'members')).catch(() => ({ size: 0 })),
              getDocs(collection(db, 'teams', teamDoc.id, 'projects')).catch(() => ({ size: 0 })),
            ]);
            return { id: teamDoc.id, memberCount: members.size, projectCount: projects.size };
          })
        );
        const subMap = new Map(subResults.map((r) => [r.id, r]));

        const teamsData: TeamData[] = teamsSnapshot.docs.map((teamDoc) => {
          const data = teamDoc.data();
          const sub = subMap.get(teamDoc.id);
          return {
            id: teamDoc.id,
            name: data.name || '이름 없음',
            description: data.description || '',
            ownerId: data.ownerId || '',
            createdAt: data.createdAt?.toDate?.() || null,
            updatedAt: data.updatedAt?.toDate?.() || null,
            memberCount: sub?.memberCount || 0,
            projectCount: sub?.projectCount || 0,
          };
        });

        console.log('🏢 팀 데이터:', teamsData.length, '건');
        setTeams(teamsData);
      } catch (error) {
        console.error('❌ 팀 목록 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, [user]);

  // 팀 멤버 조회
  const fetchTeamMembers = async (teamId: string) => {
    try {
      setMembersLoading(true);
      console.log('👥 팀 멤버 조회 중:', teamId);

      const membersSnapshot = await getDocs(collection(db, 'teams', teamId, 'members'));

      // ⚡ users 정보를 병렬 조회 (이전엔 멤버 1명당 직렬 → 멤버 많으면 느림)
      const membersData: TeamMember[] = await Promise.all(
        membersSnapshot.docs.map(async (memberDoc) => {
          const data = memberDoc.data();
          const userId = memberDoc.id;
          let photoURL = '';
          let displayName = data.displayName || '이름 없음';
          let email = data.email || '';
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              photoURL = userData.photoURL || '';
              displayName = userData.displayName || userData.name || displayName;
              email = userData.email || email;
            }
          } catch { /* ignore */ }
          return {
            userId,
            email,
            displayName,
            photoURL,
            role: data.role || 'member',
            joinedAt: data.joinedAt?.toDate?.() || null,
            status: data.status || 'active',
          };
        })
      );

      console.log('👥 멤버 데이터:', membersData.length, '명');
      setTeamMembers(membersData);
    } catch (error) {
      console.error('❌ 팀 멤버 조회 실패:', error);
      setTeamMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  // 팀 선택
  const handleTeamSelect = (teamId: string) => {
    setSelectedTeam(teamId);
    fetchTeamMembers(teamId);
  };

  // 검색 필터링
  const filteredTeams = teams.filter(team => {
    const query = searchQuery.toLowerCase();
    return (
      team.name?.toLowerCase().includes(query) ||
      team.description?.toLowerCase().includes(query) ||
      team.id.toLowerCase().includes(query)
    );
  });

  // 역할 배지 스타일
  const getRoleBadge = (role: string) => {
    const roleMap: { [key: string]: { label: string; className: string } } = {
      owner: { label: '오너', className: styles.roleOwner },
      admin: { label: '관리자', className: styles.roleAdmin },
      member: { label: '멤버', className: styles.roleMember },
      viewer: { label: '뷰어', className: styles.roleViewer }
    };
    return roleMap[role] || roleMap.member;
  };

  // 상태 배지
  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; className: string } } = {
      active: { label: '활성', className: styles.statusActive },
      inactive: { label: '비활성', className: styles.statusInactive },
      pending: { label: '대기', className: styles.statusPending }
    };
    return statusMap[status] || statusMap.active;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>팀 관리</h1>
          <p className={styles.subtitle}>전체 팀 및 멤버 관리</p>
        </div>
      </div>

      <div className={styles.content}>
        {/* 팀 목록 */}
        <div className={styles.teamsSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>팀 목록 ({teams.length})</h2>
            <input
              type="text"
              placeholder="팀 이름, 설명, ID로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <p>팀 목록을 불러오는 중...</p>
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className={styles.emptyState}>
              <GoPeople size={48} />
              <p>팀이 없습니다</p>
            </div>
          ) : (
            <div className={styles.teamsList}>
              {filteredTeams.map(team => (
                <div
                  key={team.id}
                  className={`${styles.teamCard} ${selectedTeam === team.id ? styles.teamCardActive : ''}`}
                  onClick={() => handleTeamSelect(team.id)}
                >
                  <div className={styles.teamCardHeader}>
                    <div className={styles.teamIcon}>
                      <GoPeople size={24} />
                    </div>
                    <div className={styles.teamInfo}>
                      <h3 className={styles.teamName}>{team.name}</h3>
                      {team.description && (
                        <p className={styles.teamDescription}>{team.description}</p>
                      )}
                    </div>
                  </div>

                  <div className={styles.teamStats}>
                    <div className={styles.stat}>
                      <HiOutlineUsers size={16} />
                      <span>{team.memberCount} 멤버</span>
                    </div>
                    <div className={styles.stat}>
                      <HiOutlineFolder size={16} />
                      <span>{team.projectCount} 프로젝트</span>
                    </div>
                  </div>

                  <div className={styles.teamMeta}>
                    <span className={styles.teamId}>ID: {team.id.slice(0, 8)}...</span>
                    {team.createdAt && (
                      <span className={styles.teamDate}>
                        {team.createdAt.toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 팀 상세 (멤버) */}
        {selectedTeam && (
          <div className={styles.detailSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                팀 멤버 ({teamMembers.length})
              </h2>
            </div>

            {membersLoading ? (
              <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>멤버 목록을 불러오는 중...</p>
              </div>
            ) : teamMembers.length === 0 ? (
              <div className={styles.emptyState}>
                <HiOutlineUsers size={48} />
                <p>멤버가 없습니다</p>
              </div>
            ) : (
              <div className={styles.membersTable}>
                <table>
                  <thead>
                    <tr>
                      <th>사용자</th>
                      <th>UID</th>
                      <th>이메일</th>
                      <th>역할</th>
                      <th>상태</th>
                      <th>가입일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map(member => {
                      const roleBadge = getRoleBadge(member.role);
                      const statusBadge = getStatusBadge(member.status);

                      return (
                        <tr key={member.userId}>
                          <td>
                            <div className={styles.memberInfo}>
                              <div className={styles.memberAvatar}>
                                {member.photoURL ? (
                                  <img src={member.photoURL} alt={member.displayName} />
                                ) : (
                                  <div className={styles.avatarPlaceholder}>
                                    {member.displayName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <span className={styles.memberName}>{member.displayName}</span>
                            </div>
                          </td>
                          <td>
                            <code className={styles.uid}>{member.userId.substring(0, 12)}...</code>
                          </td>
                          <td className={styles.memberEmail}>{member.email}</td>
                          <td>
                            <span className={`${styles.badge} ${roleBadge.className}`}>
                              {roleBadge.label}
                            </span>
                          </td>
                          <td>
                            <span className={`${styles.badge} ${statusBadge.className}`}>
                              {statusBadge.label}
                            </span>
                          </td>
                          <td className={styles.memberDate}>
                            {member.joinedAt
                              ? member.joinedAt.toLocaleDateString('ko-KR')
                              : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Teams;
