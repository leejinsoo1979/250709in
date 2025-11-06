import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { storage } from './config';
import { getCurrentUserAsync } from './auth';

// 프로필 사진 업로드
export const uploadProfileImage = async (
  file: File
): Promise<{ photoURL: string | null; error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { photoURL: null, error: '로그인이 필요합니다.' };
    }

    // 파일 유효성 검사
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return { photoURL: null, error: '지원되지 않는 파일 형식입니다. (JPEG, PNG, GIF, WebP만 지원)' };
    }

    // 파일 크기 검사 (5MB 제한)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return { photoURL: null, error: '파일 크기가 너무 큽니다. (최대 5MB)' };
    }

    // 기존 프로필 사진 삭제 (있다면)
    // Storage의 오래된 파일들은 정리하지 않고 새 파일만 업로드
    // (오래된 파일은 Storage 정리 작업으로 별도 처리)

    // 새로운 파일 업로드 (캐시 버스팅을 위해 timestamp 추가)
    const timestamp = Date.now();
    const imageRef = ref(storage, `profile-images/${user.uid}_${timestamp}`);
    const snapshot = await uploadBytes(imageRef, file);
    let photoURL = await getDownloadURL(snapshot.ref);

    // 캐시 방지를 위해 URL에 timestamp 쿼리 파라미터 추가
    photoURL = `${photoURL}?t=${timestamp}`;

    console.log('📸 프로필 사진 업로드 완료:', photoURL);

    // Firebase Auth 프로필 업데이트
    await updateProfile(user, { photoURL });
    console.log('✅ Auth 프로필 업데이트 완료');

    // Auth 상태 새로고침으로 UI에 즉시 반영
    await user.reload();
    console.log('🔄 Auth 상태 새로고침 완료');

    return { photoURL, error: null };
  } catch (error) {
    console.error('프로필 사진 업로드 에러:', error);
    return { photoURL: null, error: '프로필 사진 업로드 중 오류가 발생했습니다.' };
  }
};

// 프로필 사진 삭제
export const deleteProfileImage = async (): Promise<{ error: string | null }> => {
  try {
    const user = await getCurrentUserAsync();
    if (!user) {
      return { error: '로그인이 필요합니다.' };
    }

    // Storage에서 파일 삭제
    if (user.photoURL) {
      const imageRef = ref(storage, `profile-images/${user.uid}`);
      await deleteObject(imageRef);
    }

    // Firebase Auth 프로필에서 photoURL 제거
    await updateProfile(user, { photoURL: null });

    // Auth 상태 새로고침으로 UI에 즉시 반영
    await user.reload();

    return { error: null };
  } catch (error) {
    console.error('프로필 사진 삭제 에러:', error);
    return { error: '프로필 사진 삭제 중 오류가 발생했습니다.' };
  }
};

// 이미지 파일 압축 (선택적)
export const compressImage = (
  file: File,
  maxWidth: number = 400,
  quality: number = 0.8
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Canvas context를 가져올 수 없습니다.');
      resolve(file); // Canvas 실패시 원본 반환
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        // 비율 유지하면서 크기 조정
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;

        // 이미지 그리기
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 압축된 이미지를 Blob으로 변환 (JPEG로 통일 - 모든 브라우저 지원)
        canvas.toBlob(
          (blob) => {
            // 메모리 정리
            URL.revokeObjectURL(objectUrl);

            if (blob) {
              // 파일명 확장자를 .jpg로 변경
              const originalName = file.name.replace(/\.[^/.]+$/, '');
              const compressedFile = new File([blob], `${originalName}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              console.log('이미지 압축 완료:', {
                original: `${(file.size / 1024).toFixed(2)}KB`,
                compressed: `${(blob.size / 1024).toFixed(2)}KB`,
                ratio: `${((blob.size / file.size) * 100).toFixed(0)}%`
              });
              resolve(compressedFile);
            } else {
              console.error('Blob 생성 실패, 원본 파일 사용');
              resolve(file);
            }
          },
          'image/jpeg', // JPEG로 강제 변환 (모든 브라우저 지원)
          quality
        );
      } catch (error) {
        console.error('이미지 압축 중 오류:', error);
        URL.revokeObjectURL(objectUrl);
        resolve(file); // 오류 발생시 원본 반환
      }
    };

    img.onerror = (error) => {
      console.error('이미지 로드 실패:', error);
      URL.revokeObjectURL(objectUrl);
      resolve(file); // 로드 실패시 원본 반환
    };

    img.src = objectUrl;
  });
};