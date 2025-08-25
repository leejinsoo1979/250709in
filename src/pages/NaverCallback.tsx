import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { handleNaverCallback } from '@/firebase/naverAuth';
import styles from './NaverCallback.module.css';

const NaverCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // 네이버에서 에러 반환한 경우
      if (error) {
        console.error('❌ 네이버 로그인 에러:', error, errorDescription);
        setError(errorDescription || '네이버 로그인에 실패했습니다.');
        setLoading(false);
        
        // 3초 후 로그인 페이지로 리다이렉트
        setTimeout(() => {
          navigate('/auth');
        }, 3000);
        return;
      }

      // code와 state가 없는 경우
      if (!code || !state) {
        setError('잘못된 요청입니다.');
        setLoading(false);
        
        setTimeout(() => {
          navigate('/auth');
        }, 3000);
        return;
      }

      // 네이버 인증 처리
      const result = await handleNaverCallback(code, state);

      if (result.success) {
        console.log('✅ 네이버 로그인 성공!');
        // 홈페이지로 리다이렉트
        navigate('/');
      } else {
        setError(result.error || '로그인에 실패했습니다.');
        setLoading(false);
        
        // 3초 후 로그인 페이지로 리다이렉트
        setTimeout(() => {
          navigate('/auth');
        }, 3000);
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {loading && !error && (
          <>
            <div className={styles.spinner}></div>
            <h2>네이버 로그인 처리 중...</h2>
            <p>잠시만 기다려 주세요.</p>
          </>
        )}
        
        {error && (
          <>
            <div className={styles.errorIcon}>❌</div>
            <h2>로그인 실패</h2>
            <p className={styles.error}>{error}</p>
            <p className={styles.redirect}>3초 후 로그인 페이지로 이동합니다...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default NaverCallback;