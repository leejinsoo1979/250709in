import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { storage, auth } from './config';

// 프로필 사진 업로드
export const uploadProfileImage = async (file: File): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');

  // 파일 유효성 검사
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('JPEG, PNG, GIF, WebP만 지원됩니다.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('파일 크기는 5MB 이하여야 합니다.');
  }

  // Storage에 업로드
  const timestamp = Date.now();
  const storageRef = ref(storage, `profile-images/${user.uid}_${timestamp}`);
  await uploadBytes(storageRef, file);
  const photoURL = await getDownloadURL(storageRef);

  // Auth 프로필 업데이트
  await updateProfile(user, { photoURL });

  return photoURL;
};

// 프로필 사진 삭제
export const deleteProfileImage = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');

  await updateProfile(user, { photoURL: null });
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