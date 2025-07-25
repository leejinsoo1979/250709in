import React, { useState, useEffect, useRef } from 'react';
import { UserIcon, BellIcon, LockIcon, SaveIcon, CameraIcon, TrashIcon } from '../common/Icons';
import { UserProfile } from '../../firebase/types';
import { 
  getUserProfile, 
  updateUserProfile, 
  updateNotificationSettings, 
  updatePrivacySettings 
} from '../../firebase/userProfiles';
import { uploadProfileImage, deleteProfileImage, compressImage } from '../../firebase/storage';
import { useAuth } from '../../auth/AuthProvider';
import styles from './CollaborationTabs.module.css';

const ProfileTab: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'profile' | 'notifications' | 'privacy'>('profile');
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 프로필 데이터
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');

  // 알림 설정
  const [teamNotifications, setTeamNotifications] = useState(true);
  const [shareNotifications, setShareNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);

  // 개인정보 설정
  const [isPublicProfile, setIsPublicProfile] = useState(false);
  const [allowTeamInvitations, setAllowTeamInvitations] = useState(true);

  // 프로필 로드
  const loadProfile = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { profile: fetchedProfile, error: fetchError } = await getUserProfile();
      if (fetchError) {
        setError(fetchError);
      } else if (fetchedProfile) {
        setProfile(fetchedProfile);
        setDisplayName(fetchedProfile.displayName || '');
        setBio(fetchedProfile.bio || '');
        setCompany(fetchedProfile.company || '');
        setWebsite(fetchedProfile.website || '');
        setLocation(fetchedProfile.location || '');
        setTeamNotifications(fetchedProfile.teamNotifications);
        setShareNotifications(fetchedProfile.shareNotifications);
        setEmailNotifications(fetchedProfile.emailNotifications);
        setIsPublicProfile(fetchedProfile.isPublicProfile);
        setAllowTeamInvitations(fetchedProfile.allowTeamInvitations);
      }
    } catch (err) {
      setError('프로필을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [user]);

  // 프로필 정보 저장
  const handleSaveProfile = async () => {
    setSaving(true);
    
    try {
      const { error } = await updateUserProfile({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        company: company.trim() || undefined,
        website: website.trim() || undefined,
        location: location.trim() || undefined
      });
      
      if (error) {
        alert(error);
      } else {
        alert('프로필이 저장되었습니다.');
        loadProfile(); // 새로고침
      }
    } catch (err) {
      alert('프로필 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 알림 설정 저장
  const handleSaveNotifications = async () => {
    setSaving(true);
    
    try {
      const { error } = await updateNotificationSettings({
        teamNotifications,
        shareNotifications,
        emailNotifications
      });
      
      if (error) {
        alert(error);
      } else {
        alert('알림 설정이 저장되었습니다.');
      }
    } catch (err) {
      alert('알림 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 개인정보 설정 저장
  const handleSavePrivacy = async () => {
    setSaving(true);
    
    try {
      const { error } = await updatePrivacySettings({
        isPublicProfile,
        allowTeamInvitations
      });
      
      if (error) {
        alert(error);
      } else {
        alert('개인정보 설정이 저장되었습니다.');
      }
    } catch (err) {
      alert('개인정보 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 프로필 사진 업로드
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      // 임리 압축
      const compressedFile = await compressImage(file, 400, 0.8);
      
      const { photoURL, error } = await uploadProfileImage(compressedFile);
      if (error) {
        alert(error);
      } else {
        alert('프로필 사진이 업데이트되었습니다.');
        // 프로필 데이터 새로고침
        loadProfile();
      }
    } catch (err) {
      alert('프로필 사진 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploadingImage(false);
      // 입력 배드로 스위트
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 프로필 사진 삭제
  const handleImageDelete = async () => {
    if (!user?.photoURL) return;
    
    if (!confirm('프로필 사진을 삭제하시겠습니까?')) return;

    setUploadingImage(true);
    try {
      const { error } = await deleteProfileImage();
      if (error) {
        alert(error);
      } else {
        alert('프로필 사진이 삭제되었습니다.');
        // 프로필 데이터 새로고침
        loadProfile();
      }
    } catch (err) {
      alert('프로필 사진 삭제 중 오류가 발생했습니다.');
    } finally {
      setUploadingImage(false);
    }
  };

  // 파일 선택 대화상자 열기
  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>
          <UserIcon size={20} />
          내 정보 관리
        </h2>
        
        <div className={styles.profileSections}>
          <button
            className={`${styles.sectionTab} ${activeSection === 'profile' ? styles.active : ''}`}
            onClick={() => setActiveSection('profile')}
          >
            <UserIcon size={16} />
            프로필
          </button>
          <button
            className={`${styles.sectionTab} ${activeSection === 'notifications' ? styles.active : ''}`}
            onClick={() => setActiveSection('notifications')}
          >
            <BellIcon size={16} />
            알림
          </button>
          <button
            className={`${styles.sectionTab} ${activeSection === 'privacy' ? styles.active : ''}`}
            onClick={() => setActiveSection('privacy')}
          >
            <LockIcon size={16} />
            개인정보
          </button>
        </div>
      </div>

      <div className={styles.contentArea}>
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>프로필을 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className={styles.errorState}>
            <p className={styles.errorMessage}>{error}</p>
            <button onClick={loadProfile} className={styles.retryButton}>
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* 프로필 정보 섹션 */}
            {activeSection === 'profile' && (
              <div className={styles.profileSection}>
                <div className={styles.profileHeader}>
                  <div className={styles.profileAvatarContainer}>
                    <div className={styles.profileAvatar}>
                      {user?.photoURL ? (
                        <img src={user.photoURL} alt="프로필" />
                      ) : (
                        <UserIcon size={48} />
                      )}
                      {uploadingImage && (
                        <div className={styles.uploadingOverlay}>
                          <div className={styles.spinner} />
                        </div>
                      )}
                    </div>
                    <div className={styles.avatarActions}>
                      <button
                        className={styles.avatarActionButton}
                        onClick={handleImageButtonClick}
                        disabled={uploadingImage}
                        title="프로필 사진 변경"
                      >
                        <CameraIcon size={16} />
                      </button>
                      {user?.photoURL && (
                        <button
                          className={styles.avatarActionButton}
                          onClick={handleImageDelete}
                          disabled={uploadingImage}
                          title="프로필 사진 삭제"
                        >
                          <TrashIcon size={16} />
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                    />
                  </div>
                  <div className={styles.profileBasicInfo}>
                    <h3>{user?.displayName || user?.email}</h3>
                    <p className={styles.profileEmail}>{user?.email}</p>
                  </div>
                </div>

                <div className={styles.profileForm}>
                  <div className={styles.formGroup}>
                    <label>표시 이름</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="표시 이름을 입력하세요"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>소개</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="자신을 소개해보세요"
                      rows={3}
                    />
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>회사/조직</label>
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="회사명을 입력하세요"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>위치</label>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="위치를 입력하세요"
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label>웹사이트</label>
                    <input
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>

                  <div className={styles.formActions}>
                    <button
                      className={styles.saveButton}
                      onClick={handleSaveProfile}
                      disabled={saving}
                    >
                      <SaveIcon size={16} />
                      {saving ? '저장 중...' : '프로필 저장'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 알림 설정 섹션 */}
            {activeSection === 'notifications' && (
              <div className={styles.notificationsSection}>
                <h3>알림 설정</h3>
                <p className={styles.sectionDescription}>
                  받고 싶은 알림을 선택하세요.
                </p>

                <div className={styles.settingsGroup}>
                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <h4>팀 관련 알림</h4>
                      <p>팀 초대, 멤버 변경 등의 알림을 받습니다.</p>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={teamNotifications}
                        onChange={(e) => setTeamNotifications(e.target.checked)}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <h4>공유 관련 알림</h4>
                      <p>프로젝트 공유, 권한 변경 등의 알림을 받습니다.</p>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={shareNotifications}
                        onChange={(e) => setShareNotifications(e.target.checked)}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <h4>이메일 알림</h4>
                      <p>중요한 알림을 이메일로도 받습니다.</p>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={emailNotifications}
                        onChange={(e) => setEmailNotifications(e.target.checked)}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button
                    className={styles.saveButton}
                    onClick={handleSaveNotifications}
                    disabled={saving}
                  >
                    <SaveIcon size={16} />
                    {saving ? '저장 중...' : '알림 설정 저장'}
                  </button>
                </div>
              </div>
            )}

            {/* 개인정보 설정 섹션 */}
            {activeSection === 'privacy' && (
              <div className={styles.privacySection}>
                <h3>개인정보 설정</h3>
                <p className={styles.sectionDescription}>
                  프로필 공개 범위와 권한을 설정하세요.
                </p>

                <div className={styles.settingsGroup}>
                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <h4>공개 프로필</h4>
                      <p>다른 사용자가 내 프로필을 볼 수 있습니다.</p>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={isPublicProfile}
                        onChange={(e) => setIsPublicProfile(e.target.checked)}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>

                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <h4>팀 초대 허용</h4>
                      <p>다른 사용자가 나를 팀에 초대할 수 있습니다.</p>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={allowTeamInvitations}
                        onChange={(e) => setAllowTeamInvitations(e.target.checked)}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button
                    className={styles.saveButton}
                    onClick={handleSavePrivacy}
                    disabled={saving}
                  >
                    <SaveIcon size={16} />
                    {saving ? '저장 중...' : '개인정보 설정 저장'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProfileTab;