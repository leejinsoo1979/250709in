import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Lock, Mail, User } from 'lucide-react';
import { completeEmailSignupFromLink, getPendingEmailSignup } from '@/firebase/auth';

export default function CompleteEmailSignupPage() {
  const navigate = useNavigate();
  const pending = getPendingEmailSignup();
  const [email, setEmail] = useState(pending?.email || '');
  const [name, setName] = useState(pending?.displayName || '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pending?.email) setEmail(pending.email);
    if (pending?.displayName) setName(pending.displayName);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setSubmitting(true);
    const result = await completeEmailSignupFromLink(email, password, name);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6">
      <section className="w-full max-w-[440px]">
        {done ? (
          <div className="text-center">
            <div className="mb-10 text-[11px] font-semibold tracking-[0.34em] text-zinc-500">
              TTTCRAFT
            </div>
            <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white">
              <Check size={28} strokeWidth={1.8} />
            </div>
            <h1 className="text-[24px] font-semibold tracking-[-0.01em] mb-3">가입이 완료되었습니다</h1>
            <p className="text-sm leading-relaxed text-zinc-500 mb-9">
              이제 설정한 비밀번호로 로그인할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => navigate('/demo', { replace: true })}
              className="w-full rounded-full border border-white bg-white px-5 py-3.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              시작하기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-[28px] border border-white/10 bg-white/[0.035] p-8 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="mb-8 text-[11px] font-semibold tracking-[0.34em] text-zinc-500">
              TTTCRAFT
            </div>
            <h1 className="text-[24px] font-semibold tracking-[-0.01em] mb-2">비밀번호 설정</h1>
            <p className="text-sm text-zinc-500 mb-8">
              이메일 인증이 확인되었습니다. 사용할 비밀번호를 설정해주세요.
            </p>

            <div className="space-y-5">
              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">이메일</span>
                <div className="relative mt-2">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-2xl border border-white/10 bg-zinc-950/70 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-white/35"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">이름</span>
                <div className="relative mt-2">
                  <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-zinc-950/70 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-white/35"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">비밀번호</span>
                <div className="relative mt-2">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-white/10 bg-zinc-950/70 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-white/35"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">비밀번호 확인</span>
                <div className="relative mt-2">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-white/10 bg-zinc-950/70 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-white/35"
                  />
                </div>
              </label>
            </div>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-8 w-full rounded-full border border-white bg-white px-5 py-3.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '처리 중...' : '가입 완료'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
