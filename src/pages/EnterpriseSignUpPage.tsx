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
  '1~5명', '6~20명', '21~50명', '51~100명', '100명 이상',
];

export default function EnterpriseSignUpPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<EnterpriseForm>({
    companyName: '', businessNumber: '', contactName: '',
    contactEmail: '', contactPhone: '', department: '',
    expectedUsers: '', message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof EnterpriseForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, 'enterprise_inquiries'), {
        ...form, status: 'pending', createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch {
      setError('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-zinc-950 border-b border-zinc-900 flex items-center justify-between px-8 sm:px-12 py-4">
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

      <div className="max-w-xl mx-auto px-6 py-12 sm:py-16">
        {submitted ? (
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
          </motion.div>
        ) : (
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">기업계정 가입</h1>
            <p className="text-zinc-500 text-sm mb-12">기업 정보를 입력해주시면 담당자가 안내드립니다</p>

            {/* 회사 정보 */}
            <section className="mb-10">
              <h2 className="text-white text-sm font-semibold mb-6 pb-2 border-b border-zinc-800">회사 정보</h2>
              <div className="space-y-5">
                <Field label="회사명" required>
                  <Input value={form.companyName} onChange={(v) => update('companyName', v)} placeholder="주식회사 예시" required />
                </Field>
                <Field label="사업자등록번호">
                  <Input value={form.businessNumber} onChange={(v) => update('businessNumber', v)} placeholder="000-00-00000" />
                </Field>
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

            {/* 담당자 정보 */}
            <section className="mb-10">
              <h2 className="text-white text-sm font-semibold mb-6 pb-2 border-b border-zinc-800">담당자 정보</h2>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="담당자명" required>
                    <Input value={form.contactName} onChange={(v) => update('contactName', v)} placeholder="홍길동" required />
                  </Field>
                  <Field label="부서/직책">
                    <Input value={form.department} onChange={(v) => update('department', v)} placeholder="디자인팀 / 팀장" />
                  </Field>
                </div>
                <Field label="이메일" required>
                  <Input type="email" value={form.contactEmail} onChange={(v) => update('contactEmail', v)} placeholder="email@company.com" required />
                </Field>
                <Field label="연락처" required>
                  <Input type="tel" value={form.contactPhone} onChange={(v) => update('contactPhone', v)} placeholder="010-0000-0000" required />
                </Field>
              </div>
            </section>

            {/* 문의 내용 */}
            <section className="mb-10">
              <Field label="문의 내용">
                <textarea
                  value={form.message}
                  onChange={(e) => update('message', e.target.value)}
                  placeholder="추가 요청사항이나 문의사항을 입력해주세요"
                  rows={4}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
                />
              </Field>
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
  value, onChange, placeholder, type = 'text', required,
}: {
  value: string; onChange: (v: string) => void; placeholder: string; type?: string; required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
    />
  );
}
