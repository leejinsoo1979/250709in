import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Lock, Mail, User } from 'lucide-react';
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
    <main className="min-h-screen bg-white text-zinc-950 flex items-center justify-center px-6">
      <section className="w-full max-w-md">
        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle size={34} />
            </div>
            <h1 className="text-2xl font-bold mb-3">가입이 완료되었습니다</h1>
            <p className="text-sm leading-relaxed text-zinc-500 mb-8">
              이제 설정한 비밀번호로 로그인할 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => navigate('/demo', { replace: true })}
              className="w-full rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
            >
              시작하기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold mb-2">비밀번호 설정</h1>
            <p className="text-sm text-zinc-500 mb-8">
              이메일 인증이 확인되었습니다. 사용할 비밀번호를 설정해주세요.
            </p>

            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">이메일</span>
                <div className="relative mt-2">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-zinc-500"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">이름</span>
                <div className="relative mt-2">
                  <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-zinc-500"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">비밀번호</span>
                <div className="relative mt-2">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-zinc-500"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">비밀번호 확인</span>
                <div className="relative mt-2">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-zinc-500"
                  />
                </div>
              </label>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-7 w-full rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '처리 중...' : '가입 완료'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
