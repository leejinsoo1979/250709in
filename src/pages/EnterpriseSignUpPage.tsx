import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';

interface EnterpriseForm {
  companyName: string;
  businessNumber: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  department: string;
  expectedUsers: string;
  message: string;
}

const EXPECTED_USERS_OPTIONS = [
  '1~5명',
  '6~20명',
  '21~50명',
  '51~100명',
  '100명 이상',
];

export default function EnterpriseSignUpPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<EnterpriseForm>({
    companyName: '',
    businessNumber: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    department: '',
    expectedUsers: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof EnterpriseForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await addDoc(collection(db, 'enterprise_inquiries'), {
        ...form,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch {
      setError('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full bg-zinc-900 border border-zinc-700 rounded-full pl-5 pr-5 py-3.5 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors';
  const labelClass = 'block text-zinc-400 text-xs font-medium mb-1.5 ml-1';

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 sm:px-12 py-5">
        <img
          src="/images/ttt_logo/tttlogo4.png"
          alt="think thing thank"
          className="h-8 sm:h-9 w-auto cursor-pointer"
          onClick={() => navigate('/')}
        />
        <button
          className="text-sm text-zinc-400 hover:text-white transition-colors"
          onClick={() => navigate('/login')}
        >
          로그인으로 돌아가기
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <motion.div
          className="w-full max-w-lg border border-zinc-600 rounded-2xl bg-zinc-900/40 p-10"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {submitted ? (
            /* 제출 완료 */
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">신청이 완료되었습니다</h2>
              <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                담당자가 확인 후 입력하신 이메일로<br />연락드리겠습니다.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="bg-white text-zinc-950 py-3 px-8 rounded-full font-semibold text-sm hover:bg-zinc-200 transition-colors"
              >
                로그인 페이지로 이동
              </button>
            </div>
          ) : (
            <>
              {/* Title */}
              <div className="text-center mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">기업계정 가입</h1>
                <p className="text-zinc-500 text-sm">기업 정보를 입력해주시면 담당자가 안내드립니다</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* 회사 정보 */}
                <div className="space-y-4">
                  <p className="text-white text-sm font-semibold border-b border-zinc-800 pb-2">회사 정보</p>

                  <div>
                    <label className={labelClass}>회사명 <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={form.companyName}
                      onChange={(e) => update('companyName', e.target.value)}
                      placeholder="주식회사 예시"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>사업자등록번호</label>
                    <input
                      type="text"
                      value={form.businessNumber}
                      onChange={(e) => update('businessNumber', e.target.value)}
                      placeholder="000-00-00000"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>예상 사용 인원</label>
                    <div className="flex flex-wrap gap-2">
                      {EXPECTED_USERS_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => update('expectedUsers', opt)}
                          className={`px-4 py-2 rounded-full text-xs font-medium border transition-colors ${
                            form.expectedUsers === opt
                              ? 'bg-white text-zinc-950 border-white'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 담당자 정보 */}
                <div className="space-y-4">
                  <p className="text-white text-sm font-semibold border-b border-zinc-800 pb-2">담당자 정보</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>담당자명 <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        value={form.contactName}
                        onChange={(e) => update('contactName', e.target.value)}
                        placeholder="홍길동"
                        required
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>부서/직책</label>
                      <input
                        type="text"
                        value={form.department}
                        onChange={(e) => update('department', e.target.value)}
                        placeholder="디자인팀 / 팀장"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>이메일 <span className="text-red-400">*</span></label>
                    <input
                      type="email"
                      value={form.contactEmail}
                      onChange={(e) => update('contactEmail', e.target.value)}
                      placeholder="email@company.com"
                      required
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>연락처 <span className="text-red-400">*</span></label>
                    <input
                      type="tel"
                      value={form.contactPhone}
                      onChange={(e) => update('contactPhone', e.target.value)}
                      placeholder="010-0000-0000"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* 문의 내용 */}
                <div>
                  <label className={labelClass}>문의 내용</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => update('message', e.target.value)}
                    placeholder="추가 요청사항이나 문의사항을 입력해주세요"
                    rows={3}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3.5 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
                  />
                </div>

                {error && (
                  <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-white text-zinc-950 py-3.5 rounded-full font-semibold text-sm hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto" />
                  ) : (
                    '가입 신청하기'
                  )}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
