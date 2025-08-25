const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors')({ 
  origin: [
    'http://localhost:5173',
    'https://250709in.vercel.app',
    'https://250709in-*.vercel.app'
  ],
  credentials: true
});

// Firebase Admin 초기화
admin.initializeApp();

// 네이버 OAuth 설정
const NAVER_CLIENT_ID = 'TPFfNX1VqHFaIaVCpeIF';
const NAVER_CLIENT_SECRET = functions.config().naver?.client_secret || process.env.NAVER_CLIENT_SECRET;

/**
 * 네이버 로그인 토큰 검증 및 Firebase Custom Token 발급
 */
exports.naverAuth = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { accessToken } = req.body;

      if (!accessToken) {
        return res.status(400).json({ error: 'Access token is required' });
      }

      // 네이버 사용자 정보 조회
      const userInfoResponse = await axios.get('https://openapi.naver.com/v1/nid/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const naverUser = userInfoResponse.data.response;
      
      if (!naverUser || !naverUser.id) {
        return res.status(401).json({ error: 'Failed to get user info from Naver' });
      }

      // Firebase Custom Token 생성을 위한 UID
      const uid = `naver:${naverUser.id}`;
      
      // Firebase에 사용자 생성 또는 업데이트
      let firebaseUser;
      try {
        firebaseUser = await admin.auth().getUser(uid);
        // 사용자 정보 업데이트
        await admin.auth().updateUser(uid, {
          displayName: naverUser.name || naverUser.nickname,
          email: naverUser.email,
          photoURL: naverUser.profile_image
        });
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          // 새 사용자 생성
          firebaseUser = await admin.auth().createUser({
            uid: uid,
            displayName: naverUser.name || naverUser.nickname,
            email: naverUser.email,
            photoURL: naverUser.profile_image,
            emailVerified: true
          });
        } else {
          throw error;
        }
      }

      // Firestore에 사용자 프로필 저장
      const userProfile = {
        uid: uid,
        provider: 'naver',
        naverId: naverUser.id,
        email: naverUser.email,
        displayName: naverUser.name || naverUser.nickname,
        photoURL: naverUser.profile_image,
        phoneNumber: naverUser.mobile,
        birthday: naverUser.birthday,
        birthyear: naverUser.birthyear,
        gender: naverUser.gender,
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await admin.firestore()
        .collection('users')
        .doc(uid)
        .set(userProfile, { merge: true });

      // Custom Token 생성
      const customToken = await admin.auth().createCustomToken(uid, {
        provider: 'naver',
        naverId: naverUser.id
      });

      console.log('✅ Naver auth successful for user:', naverUser.email);

      return res.status(200).json({
        success: true,
        customToken,
        user: {
          uid,
          email: naverUser.email,
          displayName: naverUser.name || naverUser.nickname,
          photoURL: naverUser.profile_image
        }
      });

    } catch (error) {
      console.error('❌ Naver auth error:', error);
      return res.status(500).json({ 
        error: 'Authentication failed',
        details: error.message 
      });
    }
  });
});

/**
 * 네이버 액세스 토큰 획득 (Authorization Code 방식)
 */
exports.naverToken = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { code, state } = req.body;

      if (!code || !state) {
        return res.status(400).json({ error: 'Code and state are required' });
      }

      if (!NAVER_CLIENT_SECRET) {
        console.error('❌ Naver client secret is not configured');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      // 네이버 액세스 토큰 요청
      const tokenResponse = await axios.get('https://nid.naver.com/oauth2.0/token', {
        params: {
          grant_type: 'authorization_code',
          client_id: NAVER_CLIENT_ID,
          client_secret: NAVER_CLIENT_SECRET,
          code: code,
          state: state
        }
      });

      const { access_token, refresh_token, token_type, expires_in } = tokenResponse.data;

      if (!access_token) {
        return res.status(401).json({ error: 'Failed to get access token' });
      }

      return res.status(200).json({
        success: true,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenType: token_type,
        expiresIn: expires_in
      });

    } catch (error) {
      console.error('❌ Naver token error:', error);
      return res.status(500).json({ 
        error: 'Failed to get access token',
        details: error.message 
      });
    }
  });
});