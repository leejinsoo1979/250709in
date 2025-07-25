import React, { useState, useEffect } from 'react';
import { UsersIcon, PlusIcon, SettingsIcon, UserIcon, ClockIcon, MailIcon } from '../common/Icons';
import { Team, TeamInvitation } from '../../firebase/types';
import { 
  getUserTeams, 
  createTeam, 
  getUserTeamInvitations,
  acceptTeamInvitation,
  declineTeamInvitation,
  inviteTeamMember,
  updateTeam,
  removeTeamMember,
  getTeam
} from '../../firebase/teams';
import { useAuth } from '../../auth/AuthProvider';
import styles from './CollaborationTabs.module.css';

interface TeamsTabProps {
  onTeamSelect?: (teamId: string) => void;
}

const TeamsTab: React.FC<TeamsTabProps> = ({ onTeamSelect }) => {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showTeamSettingsModal, setShowTeamSettingsModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer');
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamDescription, setEditTeamDescription] = useState('');

  // 팀 데이터 로드
  const loadTeamsData = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [teamsResult, invitationsResult] = await Promise.all([
        getUserTeams(),
        getUserTeamInvitations()
      ]);

      if (teamsResult.error) {
        setError(teamsResult.error);
      } else {
        setTeams(teamsResult.teams);
      }

      if (invitationsResult.error) {
        console.error('초대 목록 로드 에러:', invitationsResult.error);
      } else {
        setInvitations(invitationsResult.invitations);
      }
    } catch (err) {
      setError('팀 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeamsData();
  }, [user]);

  // 새 팀 생성
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      alert('팀 이름을 입력해주세요.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('🏗️ 팀 생성 시작:', { name: newTeamName, description: newTeamDescription });
      const { teamId, error } = await createTeam(newTeamName, newTeamDescription);
      
      if (error) {
        console.error('❌ 팀 생성 오류:', error);
        alert(`팀 생성 실패: ${error}`);
        setError(error);
      } else if (teamId) {
        console.log('✅ 팀 생성 성공:', teamId);
        alert('팀이 성공적으로 생성되었습니다!');
        setShowCreateTeamModal(false);
        setNewTeamName('');
        setNewTeamDescription('');
        
        // 약간의 지연 후 팀 목록 새로고침 (Firestore 동기화 시간 고려)
        setTimeout(() => {
          console.log('🔄 팀 목록 새로고침 중...');
          loadTeamsData();
        }, 1000);
      } else {
        console.error('❌ 팀 생성 실패: teamId가 없음');
        alert('팀 생성에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (err) {
      console.error('❌ 팀 생성 예외:', err);
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      alert(`팀 생성 중 오류가 발생했습니다: ${errorMessage}`);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 팀 초대 수락
  const handleAcceptInvitation = async (invitationId: string, token: string) => {
    try {
      const { error } = await acceptTeamInvitation(invitationId, token);
      if (error) {
        alert(error);
      } else {
        loadTeamsData(); // 새로고침
      }
    } catch (err) {
      alert('초대 수락 중 오류가 발생했습니다.');
    }
  };

  // 팀 초대 거절
  const handleDeclineInvitation = async (invitationId: string, token: string) => {
    try {
      const { error } = await declineTeamInvitation(invitationId, token);
      if (error) {
        alert(error);
      } else {
        loadTeamsData(); // 새로고침
      }
    } catch (err) {
      alert('초대 거절 중 오류가 발생했습니다.');
    }
  };

  // 팀원 초대
  const handleInviteMember = async () => {
    if (!selectedTeamId || !inviteEmail.trim()) return;
    
    try {
      const { invitationId, error } = await inviteTeamMember(selectedTeamId, inviteEmail, inviteRole);
      if (error) {
        alert(error);
      } else {
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteRole('viewer');
        setSelectedTeamId(null);
        alert('팀원 초대를 보냈습니다!');
      }
    } catch (err) {
      alert('팀원 초대 중 오류가 발생했습니다.');
    }
  };

  // 팀 설정 열기
  const handleOpenTeamSettings = async (teamId: string) => {
    try {
      const { team, error } = await getTeam(teamId);
      if (error || !team) {
        alert(error || '팀 정보를 불러올 수 없습니다.');
        return;
      }
      setSelectedTeam(team);
      setEditTeamName(team.name);
      setEditTeamDescription(team.description || '');
      setShowTeamSettingsModal(true);
    } catch (err) {
      alert('팀 정보를 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 팀 설정 업데이트
  const handleUpdateTeam = async () => {
    if (!selectedTeam || !editTeamName.trim()) return;
    
    try {
      const { error } = await updateTeam(selectedTeam.id, {
        name: editTeamName,
        description: editTeamDescription
      });
      if (error) {
        alert(error);
      } else {
        setShowTeamSettingsModal(false);
        setSelectedTeam(null);
        loadTeamsData();
        alert('팀 정보가 업데이트되었습니다.');
      }
    } catch (err) {
      alert('팀 업데이트 중 오류가 발생했습니다.');
    }
  };

  // 팀 멤버 목록 열기
  const handleOpenMembers = async (teamId: string) => {
    try {
      const { team, error } = await getTeam(teamId);
      if (error || !team) {
        alert(error || '팀 정보를 불러올 수 없습니다.');
        return;
      }
      setSelectedTeam(team);
      setShowMembersModal(true);
    } catch (err) {
      alert('팀 정보를 불러오는 중 오류가 발생했습니다.');
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'owner': return '소유자';
      case 'admin': return '관리자';
      case 'editor': return '편집자';
      case 'viewer': return '보기 전용';
      default: return role;
    }
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>
          <UsersIcon size={20} />
          팀 관리
        </h2>
        <button
          className={styles.createButton}
          onClick={() => setShowCreateTeamModal(true)}
        >
          <PlusIcon size={16} />
          새 팀 만들기
        </button>
      </div>

      {/* 팀 초대 알림 */}
      {invitations.length > 0 && (
        <div className={styles.invitationsSection}>
          <h3 className={styles.sectionTitle}>
            <MailIcon size={16} />
            팀 초대 ({invitations.length})
          </h3>
          <div className={styles.invitationsList}>
            {invitations.map((invitation) => (
              <div key={invitation.id} className={styles.invitationCard}>
                <div className={styles.invitationContent}>
                  <h4>{invitation.teamName}</h4>
                  <p>
                    {invitation.inviterDisplayName || invitation.inviterEmail}님이 
                    {getRoleDisplayName(invitation.role)} 권한으로 초대했습니다.
                  </p>
                  <div className={styles.invitationDate}>
                    <ClockIcon size={12} />
                    {invitation.createdAt.toDate().toLocaleDateString()}
                  </div>
                </div>
                <div className={styles.invitationActions}>
                  <button
                    className={styles.acceptButton}
                    onClick={() => handleAcceptInvitation(invitation.id, invitation.token)}
                  >
                    수락
                  </button>
                  <button 
                    className={styles.declineButton}
                    onClick={() => handleDeclineInvitation(invitation.id, invitation.token)}
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.contentArea}>
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>팀을 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className={styles.errorState}>
            <p className={styles.errorMessage}>{error}</p>
            <button onClick={loadTeamsData} className={styles.retryButton}>
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && teams.length === 0 && (
          <div className={styles.emptyState}>
            <UsersIcon size={48} />
            <h3>참여한 팀이 없습니다</h3>
            <p>새 팀을 만들거나 팀 초대를 받아보세요.</p>
            <button
              className={styles.createTeamButton}
              onClick={() => setShowCreateTeamModal(true)}
            >
              첫 번째 팀 만들기
            </button>
          </div>
        )}

        {!loading && !error && teams.length > 0 && (
          <div className={styles.teamsGrid}>
            {teams.map((team) => {
              const currentMember = team.members.find(member => member.userId === user?.uid);
              const isOwner = team.ownerId === user?.uid;
              
              return (
                <div
                  key={team.id}
                  className={styles.teamCard}
                  onClick={() => handleOpenMembers(team.id)}
                >
                  <div className={styles.teamHeader}>
                    <div className={styles.teamIcon}>
                      <UsersIcon size={20} />
                    </div>
                    {(isOwner || currentMember?.role === 'admin') && (
                      <div className={styles.teamActions}>
                        <button
                          className={styles.actionButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTeamId(team.id);
                            setShowInviteModal(true);
                          }}
                          title="팀원 초대"
                        >
                          <PlusIcon size={14} />
                        </button>
                        <button
                          className={styles.actionButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTeamSettings(team.id);
                          }}
                          title="팀 설정"
                        >
                          <SettingsIcon size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className={styles.teamContent}>
                    <h4 className={styles.teamName}>{team.name}</h4>
                    {team.description && (
                      <p className={styles.teamDescription}>{team.description}</p>
                    )}
                    
                    <div className={styles.teamMeta}>
                      <div className={styles.memberCount}>
                        <UserIcon size={14} />
                        <span>{team.members.length}명</span>
                      </div>
                      <div className={styles.userRole}>
                        <span className={`${styles.roleBadge} ${styles[currentMember?.role || 'viewer']}`}>
                          {getRoleDisplayName(currentMember?.role || 'viewer')}
                        </span>
                      </div>
                    </div>
                    
                    <div className={styles.teamDate}>
                      <ClockIcon size={12} />
                      <span>생성일: {team.createdAt.toDate().toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 새 팀 생성 모달 */}
      {showCreateTeamModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateTeamModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>새 팀 만들기</h3>
              <button onClick={() => setShowCreateTeamModal(false)}>×</button>
            </div>
            <div className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label>팀 이름</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="팀 이름을 입력하세요"
                />
              </div>
              <div className={styles.formGroup}>
                <label>설명 (선택사항)</label>
                <textarea
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  placeholder="팀 설명을 입력하세요"
                  rows={3}
                />
              </div>
            </div>
            {error && (
              <div className={styles.errorMessage}>
                {error}
              </div>
            )}
            <div className={styles.modalActions}>
              <button onClick={() => setShowCreateTeamModal(false)} disabled={loading}>
                취소
              </button>
              <button onClick={handleCreateTeam} disabled={!newTeamName.trim() || loading}>
                {loading ? '생성 중...' : '팀 만들기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 팀원 초대 모달 */}
      {showInviteModal && (
        <div className={styles.modalOverlay} onClick={() => setShowInviteModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>팀원 초대</h3>
              <button onClick={() => setShowInviteModal(false)}>×</button>
            </div>
            <div className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label>이메일 주소</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="초대할 사용자의 이메일을 입력하세요"
                />
              </div>
              <div className={styles.formGroup}>
                <label>권한</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'editor' | 'viewer')}
                >
                  <option value="viewer">보기 전용</option>
                  <option value="editor">편집자</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setShowInviteModal(false)}>
                취소
              </button>
              <button onClick={handleInviteMember} disabled={!inviteEmail.trim()}>
                초대 보내기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 팀 설정 모달 */}
      {showTeamSettingsModal && selectedTeam && (
        <div className={styles.modalOverlay} onClick={() => setShowTeamSettingsModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>팀 설정</h3>
              <button onClick={() => setShowTeamSettingsModal(false)}>×</button>
            </div>
            <div className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label>팀 이름</label>
                <input
                  type="text"
                  value={editTeamName}
                  onChange={(e) => setEditTeamName(e.target.value)}
                  placeholder="팀 이름을 입력하세요"
                />
              </div>
              <div className={styles.formGroup}>
                <label>설명</label>
                <textarea
                  value={editTeamDescription}
                  onChange={(e) => setEditTeamDescription(e.target.value)}
                  placeholder="팀 설명을 입력하세요"
                  rows={3}
                />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setShowTeamSettingsModal(false)}>
                취소
              </button>
              <button onClick={handleUpdateTeam} disabled={!editTeamName.trim()}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 팀 멤버 목록 모달 */}
      {showMembersModal && selectedTeam && (
        <div className={styles.modalOverlay} onClick={() => setShowMembersModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{selectedTeam.name} 멤버 목록</h3>
              <button onClick={() => setShowMembersModal(false)}>×</button>
            </div>
            <div className={styles.modalContent}>
              <div className={styles.membersList}>
                {selectedTeam.members.map((member) => (
                  <div key={member.userId} className={styles.memberItem}>
                    <div className={styles.memberInfo}>
                      <div className={styles.memberAvatar}>
                        {member.photoURL ? (
                          <img src={member.photoURL} alt="프로필" />
                        ) : (
                          <UserIcon size={20} />
                        )}
                      </div>
                      <div className={styles.memberDetails}>
                        <div className={styles.memberName}>
                          {member.displayName || member.email}
                        </div>
                        <div className={styles.memberEmail}>{member.email}</div>
                      </div>
                    </div>
                    <div className={styles.memberRole}>
                      <span className={`${styles.roleBadge} ${styles[member.role]}`}>
                        {getRoleDisplayName(member.role)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setShowMembersModal(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamsTab;