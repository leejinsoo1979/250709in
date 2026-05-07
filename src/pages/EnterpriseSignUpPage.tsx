import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { db, storage, auth, functions } from '@/firebase/config';
import { signUpWithEmail } from '@/firebase/auth';
import { useAuth } from '@/auth/AuthProvider';
import { Eye, EyeOff, Upload, X, FileText, Check, AlertCircle, Loader2 } from 'lucide-react';
import {
  formatBusinessNumber,
  getDigitsOnly,
  isValidBusinessNumberFormat,
} from '@/utils/businessNumber';

interface EnterpriseForm {
  companyName: string;
  businessNumber: string;
  businessType: string;
  businessCategory: string;
  loginEmail: string;
  password: string;
  passwordConfirm: string;
  contactName: string;
  contactPhone: string;
  expectedUsers: string;
}

const EXPECTED_USERS_OPTIONS = [
  '1~5명', '6~20명', '21~50명', '51~100명', '100명 이상',
];


export default function EnterpriseSignUpPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  // 구글 등 소셜로 이미 로그인된 사용자 여부 (이메일/비밀번호 provider만 있는 경우는 제외)
  const isSocialLoggedIn =
    !!currentUser &&
    currentUser.providerData.length > 0 &&
    !currentUser.providerData.some((p) => p.providerId === 'password');

  const [form, setForm] = useState<EnterpriseForm>({
    companyName: '', businessNumber: '', businessType: '', businessCategory: '',
    loginEmail: '', password: '', passwordConfirm: '',
    contactName: '', contactPhone: '',
    expectedUsers: '',
  });
  const [businessLicenseFile, setBusinessLicenseFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // 소셜 로그인 사용자가 비밀번호도 설정할지 선택 (기본: 미설정 = 구글 로그인만 사용)
  const [setExtraPassword, setSetExtraPassword] = useState(false);

  // 사업자등록번호 검증 상태
  type BizVerifyStatus = 'idle' | 'verifying' | 'active' | 'inactive' | 'closed' | 'not_found' | 'error';
  const [bizVerify, setBizVerify] = useState<{
    status: BizVerifyStatus;
    message: string;
    verifiedNumber: string; // 검증 완료된 사업자번호 (입력값과 비교용 - 변경되면 재검증 필요)
  }>({ status: 'idle', message: '', verifiedNumber: '' });

  // 기존 가입 신청 조회 (이미 신청한 경우 폼 대신 상태 안내 화면 표시)
  type ExistingStatus = 'pending' | 'approved' | 'on_hold' | 'rejected';
  const [existingInquiry, setExistingInquiry] = useState<{
    status: ExistingStatus;
    companyName?: string;
    reasonText?: string;
    createdAt?: Date | null;
  } | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);
  // 거절/보류 사용자가 재신청 선택 시 폼 표시
  const [forceShowForm, setForceShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser?.uid) {
        setCheckingExisting(false);
        return;
      }
      try {
        // ⚠️ orderBy + where는 복합 인덱스 필요 → 인덱스 없으면 쿼리 실패하여
        //   사용자가 가입 폼을 또 보게 되는 버그가 있었음.
        //   → where만 사용하고 클라이언트에서 정렬
        const q = query(
          collection(db, 'enterprise_inquiries'),
          where('uid', '==', currentUser.uid)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        if (!snap.empty) {
          // 가장 최근 createdAt 1건 선택
          const docs = snap.docs.slice().sort((a, b) => {
            const ta = (a.data().createdAt?.toMillis?.() ?? 0) as number;
            const tb = (b.data().createdAt?.toMillis?.() ?? 0) as number;
            return tb - ta;
          });
          const data = docs[0].data() as {
            status?: ExistingStatus;
            companyName?: string;
            reasonText?: string;
            createdAt?: { toDate?: () => Date };
          };
          setExistingInquiry({
            status: (data.status as ExistingStatus) || 'pending',
            companyName: data.companyName,
            reasonText: data.reasonText,
            createdAt: data.createdAt?.toDate?.() || null,
          });
        }
      } catch (err) {
        console.error('기존 신청 조회 실패:', err);
      } finally {
        if (!cancelled) setCheckingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.uid]);

  // 소셜 로그인 사용자: 이메일/대표자명 자동 입력
  useEffect(() => {
    if (!currentUser) return;
    setForm((prev) => ({
      ...prev,
      loginEmail: prev.loginEmail || currentUser.email || '',
      contactName: prev.contactName || currentUser.displayName || '',
    }));
  }, [currentUser]);

  const update = (field: keyof EnterpriseForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // 사업자등록번호 입력 핸들러 (자동 포맷팅)
  const handleBizNumberChange = (value: string) => {
    const formatted = formatBusinessNumber(value);
    update('businessNumber', formatted);
    // 입력이 바뀌면 이전 검증 결과 초기화
    if (bizVerify.status !== 'idle') {
      setBizVerify({ status: 'idle', message: '', verifiedNumber: '' });
    }
  };

  // 국세청 API 호출 - 사업자등록번호 진위/영업상태 검증
  const handleVerifyBizNumber = async () => {
    const digits = getDigitsOnly(form.businessNumber);
    if (digits.length !== 10) {
      setBizVerify({ status: 'error', message: '사업자등록번호 10자리를 입력해주세요.', verifiedNumber: '' });
      return;
    }
    if (!isValidBusinessNumberFormat(digits)) {
      setBizVerify({ status: 'error', message: '잘못된 사업자등록번호 형식입니다.', verifiedNumber: '' });
      return;
    }

    setBizVerify({ status: 'verifying', message: '국세청에 조회 중...', verifiedNumber: '' });

    try {
      const verifyFn = httpsCallable<
        { businessNumber: string },
        { ok: boolean; status: string; statusText: string; taxType: string }
      >(functions, 'verifyBusinessNumber');
      const result = await verifyFn({ businessNumber: digits });
      const data = result.data;

      const messageMap: Record<string, string> = {
        active: `유효한 사업자입니다 (${data.statusText || '계속사업자'}${data.taxType ? ` · ${data.taxType}` : ''})`,
        inactive: `휴업 상태인 사업자입니다.`,
        closed: `폐업한 사업자입니다.`,
        not_found: '국세청에 등록되지 않은 사업자번호입니다.',
      };

      setBizVerify({
        status: (data.status as BizVerifyStatus) || 'error',
        message: messageMap[data.status] || data.statusText || '확인할 수 없는 상태입니다.',
        verifiedNumber: data.ok ? digits : '',
      });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error('사업자번호 검증 실패:', e);
      setBizVerify({
        status: 'error',
        message: e?.message || '국세청 조회 중 오류가 발생했습니다.',
        verifiedNumber: '',
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 10MB 제한
    if (file.size > 10 * 1024 * 1024) {
      setError('파일 크기는 10MB 이하여야 합니다.');
      return;
    }
    // 허용 형식: 이미지, PDF
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setError('이미지(JPG, PNG) 또는 PDF 파일만 업로드 가능합니다.');
      return;
    }
    setError(null);
    setBusinessLicenseFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // 비밀번호 검증: 소셜 로그인 사용자는 setExtraPassword=true일 때만, 신규 가입자는 항상
    const passwordRequired = !isSocialLoggedIn || setExtraPassword;
    if (passwordRequired) {
      if (form.password !== form.passwordConfirm) {
        setError('비밀번호가 일치하지 않습니다.');
        setSubmitting(false);
        return;
      }
      if (form.password.length < 6) {
        setError('비밀번호는 6자 이상이어야 합니다.');
        setSubmitting(false);
        return;
      }
    }
    if (!businessLicenseFile) {
      setError('사업자등록증을 첨부해주세요.');
      setSubmitting(false);
      return;
    }

    // 사업자등록번호 검증 가드
    const bizDigits = getDigitsOnly(form.businessNumber);
    if (!isValidBusinessNumberFormat(bizDigits)) {
      setError('사업자등록번호가 올바르지 않습니다.');
      setSubmitting(false);
      return;
    }
    // 국세청 검증을 통과하지 않았거나, 통과 후 번호가 바뀐 경우
    if (bizVerify.status !== 'active' || bizVerify.verifiedNumber !== bizDigits) {
      setError('사업자등록번호 검증을 완료해주세요. (검증 버튼 클릭)');
      setSubmitting(false);
      return;
    }

    try {
      // 1. Firebase Auth 계정 처리
      // - 소셜 로그인 상태: 기존 계정 그대로 사용 (선택적으로 이메일/비밀번호 자격증명 link)
      // - 비로그인 상태: 새 이메일/비밀번호 계정 생성
      let user: { uid: string; email: string | null } | null = null;

      if (isSocialLoggedIn && currentUser) {
        user = { uid: currentUser.uid, email: currentUser.email };

        // 사용자가 비밀번호 설정을 선택한 경우: 이메일/비밀번호 자격증명을 추가로 link
        if (setExtraPassword && currentUser.email && auth.currentUser) {
          try {
            const credential = EmailAuthProvider.credential(
              currentUser.email,
              form.password
            );
            await linkWithCredential(auth.currentUser, credential);
          } catch (linkErr: unknown) {
            const code = (linkErr as { code?: string })?.code;
            if (code === 'auth/provider-already-linked') {
              // 이미 link된 상태 - 무시
            } else if (code === 'auth/credential-already-in-use') {
              setError('해당 이메일에 이미 다른 계정이 연결되어 있습니다.');
              setSubmitting(false);
              return;
            } else if (code === 'auth/weak-password') {
              setError('비밀번호가 너무 약합니다. 6자 이상 입력해주세요.');
              setSubmitting(false);
              return;
            } else {
              setError('비밀번호 설정 중 오류가 발생했습니다.');
              setSubmitting(false);
              return;
            }
          }
        }
      } else {
        const { user: createdUser, error: authError } = await signUpWithEmail(
          form.loginEmail, form.password, form.contactName
        );
        if (authError || !createdUser) {
          if (authError?.includes('email-already-in-use')) {
            setError('이미 사용 중인 이메일입니다.');
          } else if (authError?.includes('invalid-email')) {
            setError('올바르지 않은 이메일 형식입니다.');
          } else if (authError?.includes('weak-password')) {
            setError('비밀번호가 너무 약합니다. 6자 이상 입력해주세요.');
          } else {
            setError(authError || '계정 생성 중 오류가 발생했습니다.');
          }
          setSubmitting(false);
          return;
        }
        user = { uid: createdUser.uid, email: createdUser.email };
      }

      if (!user) {
        setError('계정 정보를 확인할 수 없습니다.');
        setSubmitting(false);
        return;
      }

      // 2. 사업자등록증 파일을 Firebase Storage에 업로드
      const ext = businessLicenseFile.name.split('.').pop() || 'pdf';
      const timestamp = Date.now();
      const storageRef = ref(
        storage,
        `business-licenses/${user.uid}/${timestamp}.${ext}`
      );
      await uploadBytes(storageRef, businessLicenseFile);
      const businessLicenseUrl = await getDownloadURL(storageRef);

      // 3. Firestore에 기업 정보 저장 (승인 대기 상태)
      const { password: _pw, passwordConfirm: _pwc, ...formData } = form;
      const inquiryRef = await addDoc(collection(db, 'enterprise_inquiries'), {
        ...formData,
        businessLicenseUrl,
        businessLicenseFileName: businessLicenseFile.name,
        uid: user.uid,
        status: 'pending',
        accountType: 'enterprise',
        // 국세청 검증 결과 함께 저장 (승인 검토용)
        ntsVerified: bizVerify.status === 'active',
        ntsStatus: bizVerify.status,
        ntsMessage: bizVerify.message,
        createdAt: serverTimestamp(),
      });

      // 4. 텔레그램으로 승인 요청 전송 (사업자등록증 사진 + InlineKeyboard 3버튼)
      const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
      const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID;
      if (botToken && chatId) {
        const time = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        const caption = [
          '🏢 *기업계정 가입 신청*',
          '',
          `👤 대표자: ${form.contactName}`,
          `📧 이메일: ${form.loginEmail}`,
          `🏢 회사명: ${form.companyName}`,
          `📋 사업자번호: ${form.businessNumber}`,
          `🏭 업종: ${form.businessType}`,
          `📂 업태: ${form.businessCategory}`,
          `👥 예상인원: ${form.expectedUsers || '미입력'}`,
          `📱 연락처: ${form.contactPhone || '미입력'}`,
          `🔍 국세청 검증: ${bizVerify.status === 'active' ? '✅ 정상' : bizVerify.message}`,
          `🕐 신청시간: ${time}`,
        ].join('\n');

        const inlineKeyboard = {
          inline_keyboard: [[
            { text: '✅ 승인', callback_data: `approve:${inquiryRef.id}:${user.uid}` },
            { text: '⏸ 보류', callback_data: `hold_menu:${inquiryRef.id}:${user.uid}` },
            { text: '❌ 거절', callback_data: `reject_menu:${inquiryRef.id}:${user.uid}` },
          ]],
        };

        // 이미지면 sendPhoto, PDF면 sendDocument
        const isImage = /^image\//i.test(businessLicenseFile.type);
        const apiMethod = isImage ? 'sendPhoto' : 'sendDocument';
        const photoBody: any = {
          chat_id: chatId,
          [isImage ? 'photo' : 'document']: businessLicenseUrl,
          caption,
          reply_markup: inlineKeyboard,
        };

        fetch(`https://api.telegram.org/bot${botToken}/${apiMethod}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(photoBody),
        }).catch(() => {
          // sendPhoto 실패 시 일반 메시지로 fallback
          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: caption + `\n\n📎 사업자등록증: ${businessLicenseUrl}`,
              reply_markup: inlineKeyboard,
            }),
          }).catch(() => {/* 무시 */});
        });
      }

      setSubmitted(true);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error('❌ 기업가입 제출 에러:', e);
      // 어디서 발생했는지 파악할 수 있도록 메시지 노출
      const detail = e?.code || e?.message || String(err);
      setError(`제출 중 오류가 발생했습니다: ${detail}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-zinc-950 border-b border-zinc-900 flex items-center justify-between px-8 sm:px-12 py-4">
        <div
          className="flex items-center gap-1.5 cursor-pointer"
          onClick={() => navigate('/')}
        >
          <div className="flex items-center gap-1">
            <div className="w-3.5 h-3.5 rounded-full bg-white" />
            <div className="w-3.5 h-3.5 rounded-full bg-white" />
            <div className="w-3.5 h-3.5 rounded-full bg-white" />
          </div>
          <span className="text-white font-black text-lg ml-1">CRAFT</span>
        </div>
        <button
          className="text-sm text-zinc-400 hover:text-white transition-colors"
          onClick={() => navigate('/login')}
        >
          로그인으로 돌아가기
        </button>
      </header>

      <div className="max-w-xl mx-auto px-6 py-12 sm:py-16">
        {checkingExisting ? (
          <div className="text-center py-32 text-zinc-500 text-sm">신청 정보 확인 중...</div>
        ) : existingInquiry && !forceShowForm && !submitted ? (
          // 이미 신청한 사용자: 상태별 안내 화면
          (() => {
            const s = existingInquiry.status;
            const isPending = s === 'pending';
            const isApproved = s === 'approved';
            // on_hold/rejected 둘 다 '추가 확인 필요'로 사용자에게 표시

            const title = isApproved
              ? '이미 기업회원으로 승인되었습니다'
              : isPending
              ? '승인 대기 중입니다'
              : '보류 중입니다';
            const body = isApproved
              ? `${existingInquiry.companyName ? existingInquiry.companyName + ' 님의 ' : ''}기업계정이 활성화되어 있습니다.\n로그인 후 모든 기능을 이용하실 수 있습니다.`
              : isPending
              ? '관리자가 신청 내용을 검토하고 있습니다.\n신청 후 약 10~20분 이내에 처리됩니다.\n처리 결과는 다음 로그인 시 안내됩니다.'
              : '관리자 메모를 확인하신 후 보완하여 다시 신청해 주십시오.';

            return (
              <motion.div
                className="text-center py-20"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>
                <p className="text-zinc-400 text-sm mb-6 leading-relaxed whitespace-pre-line">{body}</p>

                {existingInquiry.companyName && (
                  <div className="mb-4 text-zinc-500 text-xs">
                    회사명: <span className="text-zinc-300">{existingInquiry.companyName}</span>
                  </div>
                )}
                {existingInquiry.createdAt && (
                  <div className="mb-6 text-zinc-500 text-xs">
                    신청일: <span className="text-zinc-300">{existingInquiry.createdAt.toLocaleString('ko-KR')}</span>
                  </div>
                )}

                {/* 관리자 메모 — 테마 primary 톤 */}
                {!isApproved && existingInquiry.reasonText && (
                  <div
                    className="mb-6 mx-auto max-w-md text-left rounded-xl px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: 'rgba(102, 126, 234, 0.10)',
                      border: '1px solid rgba(102, 126, 234, 0.30)',
                      color: '#ffffff',
                    }}
                  >
                    <div style={{ color: 'var(--theme-primary, #667eea)', fontWeight: 600, marginBottom: 4, fontSize: 12 }}>관리자 메모</div>
                    <div>{existingInquiry.reasonText}</div>
                  </div>
                )}

                <div className="flex gap-3 justify-center flex-wrap">
                  <button
                    onClick={() => navigate('/demo')}
                    style={{
                      padding: '12px 24px',
                      borderRadius: 999,
                      border: '1px solid rgba(102, 126, 234, 0.5)',
                      background: 'transparent',
                      color: '#ffffff',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    데모로 돌아가기
                  </button>
                  {isApproved && (
                    <button
                      onClick={() => navigate('/login')}
                      style={{
                        padding: '12px 24px',
                        borderRadius: 999,
                        border: 'none',
                        background: '#ffffff',
                        color: '#09090b',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      로그인하러 가기
                    </button>
                  )}
                  {/* on_hold / rejected 만 보완 후 재신청 가능 (pending은 검토 중이라 불필요) */}
                  {!isApproved && !isPending && (
                    <button
                      onClick={() => setForceShowForm(true)}
                      style={{
                        padding: '12px 24px',
                        borderRadius: 999,
                        border: 'none',
                        background: '#ffffff',
                        color: '#09090b',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      보완 후 재신청
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })()
        ) : submitted ? (
          <motion.div
            className="text-center py-20"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">가입 신청이 완료되었습니다</h2>
            <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
              관리자가 신청 내용을 검토 후 승인합니다.<br />
              빠르면 10분, 늦어도 20분 이내에 처리됩니다.<br />
              검토 결과(승인 / 보류 / 거절)는 다음 로그인 시 자동으로 안내됩니다.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/demo')}
                className="border border-white/30 text-white py-3 px-6 rounded-full font-semibold text-sm hover:bg-white/10 transition-colors"
              >
                데모 체험 계속하기
              </button>
              <button
                onClick={() => navigate('/login')}
                className="bg-white text-zinc-950 py-3 px-6 rounded-full font-semibold text-sm hover:bg-zinc-200 transition-colors"
              >
                로그인 페이지로 이동
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">기업계정 가입</h1>
            <p className="text-zinc-500 text-sm mb-12">기업 정보를 입력하고 계정을 생성하세요</p>

            {/* 로그인 계정 정보 */}
            <section className="mb-10">
              <h2 className="text-white text-sm font-semibold mb-6 pb-2 border-b border-white/30">로그인 계정 정보</h2>

              {isSocialLoggedIn && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs leading-relaxed">
                  현재 <b>{currentUser?.email}</b> 구글 계정으로 로그인되어 있습니다.<br />
                  이 계정으로 기업회원 신청이 진행되며, 이후에도 동일한 구글 로그인을 사용할 수 있습니다.
                </div>
              )}

              <div className="space-y-5">
                <Field label="로그인 이메일" required>
                  <Input
                    type="email"
                    value={form.loginEmail}
                    onChange={(v) => update('loginEmail', v)}
                    placeholder="login@company.com"
                    required
                    readOnly={isSocialLoggedIn}
                  />
                </Field>

                {/* 소셜 로그인 사용자: 비밀번호 추가 설정 옵션 */}
                {isSocialLoggedIn && (
                  <div className="rounded-xl bg-zinc-900 border border-white/30 px-4 py-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={setExtraPassword}
                        onChange={(e) => setSetExtraPassword(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-emerald-500"
                      />
                      <div>
                        <div className="text-white text-sm font-medium">이메일/비밀번호 로그인도 추가로 사용</div>
                        <div className="text-zinc-500 text-xs mt-1 leading-relaxed">
                          체크 시 입력한 비밀번호로 이메일 로그인이 가능해집니다.
                          미체크 시 구글 로그인만 사용합니다.
                        </div>
                      </div>
                    </label>
                  </div>
                )}

                {/* 비밀번호 입력 필드: 비로그인 신규 가입자이거나, 소셜 로그인 사용자가 비밀번호 설정을 선택한 경우 */}
                {(!isSocialLoggedIn || setExtraPassword) && (() => {
                  // 실시간 검증 상태
                  const pwLength = form.password.length;
                  const pwLengthOk = pwLength >= 6;
                  const pwTouched = pwLength > 0;
                  const confirmTouched = form.passwordConfirm.length > 0;
                  const pwMatch = form.password === form.passwordConfirm;

                  // 비밀번호 강도: 길이/문자 종류 기반
                  const hasLetter = /[a-zA-Z]/.test(form.password);
                  const hasNumber = /[0-9]/.test(form.password);
                  const hasSymbol = /[^a-zA-Z0-9]/.test(form.password);
                  const strengthScore = (pwLength >= 6 ? 1 : 0) + (pwLength >= 10 ? 1 : 0) + (hasLetter && hasNumber ? 1 : 0) + (hasSymbol ? 1 : 0);
                  // 0~1: 약함, 2: 보통, 3~4: 강함
                  const strengthLabel = !pwTouched ? '' : strengthScore <= 1 ? '약함' : strengthScore === 2 ? '보통' : '강함';
                  const strengthColor = strengthScore <= 1 ? 'bg-red-500' : strengthScore === 2 ? 'bg-amber-500' : 'bg-emerald-500';
                  const strengthTextColor = strengthScore <= 1 ? 'text-red-400' : strengthScore === 2 ? 'text-amber-400' : 'text-emerald-400';
                  const strengthWidthPct = Math.min(100, strengthScore * 25);

                  return (
                    <>
                      <Field label="비밀번호" required>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={form.password}
                            onChange={(e) => update('password', e.target.value)}
                            placeholder="6자 이상 입력"
                            required
                            className={`w-full bg-zinc-900 border rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none transition-colors pr-11 ${
                              !pwTouched
                                ? 'border-white/30 focus:border-zinc-500'
                                : pwLengthOk
                                ? 'border-emerald-500/60 focus:border-emerald-500'
                                : 'border-red-500/60 focus:border-red-500'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {/* 길이 검증 */}
                        {pwTouched && (
                          <div className={`mt-2 flex items-center gap-1.5 text-xs ${pwLengthOk ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pwLengthOk ? <Check size={14} /> : <AlertCircle size={14} />}
                            {pwLengthOk ? '6자 이상 충족' : `6자 이상 입력해주세요 (${pwLength}/6)`}
                          </div>
                        )}
                        {/* 강도 표시 */}
                        {pwTouched && (
                          <div className="mt-2">
                            <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className={`h-full ${strengthColor} transition-all duration-200`}
                                style={{ width: `${strengthWidthPct}%` }}
                              />
                            </div>
                            <div className={`mt-1 text-xs ${strengthTextColor}`}>강도: {strengthLabel}</div>
                          </div>
                        )}
                      </Field>
                      <Field label="비밀번호 확인" required>
                        <div className="relative">
                          <input
                            type={showPasswordConfirm ? 'text' : 'password'}
                            value={form.passwordConfirm}
                            onChange={(e) => update('passwordConfirm', e.target.value)}
                            placeholder="비밀번호 재입력"
                            required
                            className={`w-full bg-zinc-900 border rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none transition-colors pr-11 ${
                              !confirmTouched
                                ? 'border-white/30 focus:border-zinc-500'
                                : pwMatch
                                ? 'border-emerald-500/60 focus:border-emerald-500'
                                : 'border-red-500/60 focus:border-red-500'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            {showPasswordConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {/* 일치 여부 */}
                        {confirmTouched && (
                          <div className={`mt-2 flex items-center gap-1.5 text-xs ${pwMatch ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pwMatch ? <Check size={14} /> : <AlertCircle size={14} />}
                            {pwMatch ? '비밀번호가 일치합니다' : '비밀번호가 일치하지 않습니다'}
                          </div>
                        )}
                      </Field>
                    </>
                  );
                })()}
              </div>
            </section>

            {/* 회사 정보 */}
            <section className="mb-10">
              <h2 className="text-white text-sm font-semibold mb-6 pb-2 border-b border-white/30">회사 정보</h2>
              <div className="space-y-5">
                <Field label="회사명" required>
                  <Input value={form.companyName} onChange={(v) => update('companyName', v)} placeholder="주식회사 예시" required />
                </Field>
                <Field label="사업자등록번호" required>
                  {(() => {
                    const digits = getDigitsOnly(form.businessNumber);
                    const formatOk = digits.length === 10 && isValidBusinessNumberFormat(digits);
                    const formatTouched = digits.length > 0;
                    const verifying = bizVerify.status === 'verifying';
                    const verifiedOk = bizVerify.status === 'active' && bizVerify.verifiedNumber === digits;

                    return (
                      <>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={form.businessNumber}
                            onChange={(e) => handleBizNumberChange(e.target.value)}
                            placeholder="000-00-00000"
                            required
                            inputMode="numeric"
                            maxLength={12}
                            className={`flex-1 bg-zinc-900 border rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none transition-colors ${
                              !formatTouched
                                ? 'border-white/30 focus:border-zinc-500'
                                : verifiedOk
                                ? 'border-emerald-500/60 focus:border-emerald-500'
                                : formatOk
                                ? 'border-zinc-500 focus:border-zinc-400'
                                : 'border-red-500/60 focus:border-red-500'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={handleVerifyBizNumber}
                            disabled={!formatOk || verifying || verifiedOk}
                            className={`px-4 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                              verifiedOk
                                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 cursor-default'
                                : !formatOk || verifying
                                ? 'bg-zinc-800 border border-white/10 text-zinc-600 cursor-not-allowed'
                                : 'bg-white text-zinc-950 hover:bg-zinc-200'
                            }`}
                          >
                            {verifying ? (
                              <span className="flex items-center gap-1.5">
                                <Loader2 size={14} className="animate-spin" />
                                검증 중
                              </span>
                            ) : verifiedOk ? (
                              <span className="flex items-center gap-1.5">
                                <Check size={14} />
                                검증완료
                              </span>
                            ) : (
                              '검증'
                            )}
                          </button>
                        </div>

                        {/* 형식 검증 결과 */}
                        {formatTouched && !formatOk && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                            <AlertCircle size={14} />
                            올바르지 않은 사업자등록번호입니다 ({digits.length}/10)
                          </div>
                        )}
                        {formatTouched && formatOk && bizVerify.status === 'idle' && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                            <AlertCircle size={14} />
                            검증 버튼을 눌러 국세청 등록 여부를 확인해주세요
                          </div>
                        )}

                        {/* 국세청 검증 결과 */}
                        {bizVerify.status !== 'idle' && bizVerify.status !== 'verifying' && (
                          <div
                            className={`mt-2 flex items-start gap-1.5 text-xs ${
                              bizVerify.status === 'active'
                                ? 'text-emerald-400'
                                : bizVerify.status === 'inactive'
                                ? 'text-amber-400'
                                : 'text-red-400'
                            }`}
                          >
                            {bizVerify.status === 'active' ? <Check size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
                            <span>{bizVerify.message}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </Field>
                <Field label="사업자등록증 첨부" required>
                  {businessLicenseFile ? (
                    <div className="flex items-center justify-between bg-zinc-900 border border-white/30 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={18} className="text-emerald-400 shrink-0" />
                        <span className="text-white text-sm truncate">{businessLicenseFile.name}</span>
                        <span className="text-zinc-500 text-xs shrink-0">
                          {(businessLicenseFile.size / 1024 / 1024).toFixed(2)}MB
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBusinessLicenseFile(null)}
                        className="text-zinc-500 hover:text-red-400 transition-colors shrink-0 ml-2"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 bg-zinc-900 border border-dashed border-white/30 rounded-xl px-4 py-6 cursor-pointer hover:border-zinc-500 transition-colors">
                      <Upload size={20} className="text-zinc-400" />
                      <span className="text-zinc-400 text-sm">파일 선택 (이미지 또는 PDF)</span>
                      <span className="text-zinc-600 text-xs">최대 10MB</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-6">
                  <Field label="업종" required>
                    <Input value={form.businessType} onChange={(v) => update('businessType', v)} placeholder="예: 제조업, 건설업" required />
                  </Field>
                  <Field label="업태" required>
                    <Input value={form.businessCategory} onChange={(v) => update('businessCategory', v)} placeholder="예: 가구제조, 인테리어" required />
                  </Field>
                </div>
                <Field label="예상 사용 인원">
                  <div className="flex flex-wrap gap-2">
                    {EXPECTED_USERS_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => update('expectedUsers', opt)}
                        className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                          form.expectedUsers === opt
                            ? 'bg-white text-zinc-950 border-white'
                            : 'text-zinc-400 border-zinc-700 hover:border-zinc-500'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </section>

            {/* 대표자 정보 */}
            <section className="mb-10">
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-6">
                  <Field label="대표자명" required>
                    <Input value={form.contactName} onChange={(v) => update('contactName', v)} placeholder="홍길동" required />
                  </Field>
                  <Field label="연락처">
                    <Input type="tel" value={form.contactPhone} onChange={(v) => update('contactPhone', v)} placeholder="010-0000-0000 (선택)" />
                  </Field>
                </div>
              </div>
            </section>

            {error && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-white text-zinc-950 py-4 rounded-full font-semibold text-base hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto" />
              ) : (
                '가입 신청하기'
              )}
            </button>
          </motion.form>
        )}
      </div>
    </div>
  );
}

/* ── 서브 컴포넌트 ── */

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-zinc-400 text-xs font-medium mb-2">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', required, readOnly,
}: {
  value: string; onChange: (v: string) => void; placeholder: string; type?: string; required?: boolean; readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      readOnly={readOnly}
      className={`w-full bg-zinc-900 border border-white/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
    />
  );
}
