import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, MailCheck } from 'lucide-react';
import { auth } from '@/firebase/auth';

export default function AuthVerifiedPage() {
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let mounted = true;
    auth.currentUser?.reload()
      .then(() => {
        if (!mounted) return;
        setVerified(!!auth.currentUser?.emailVerified);
      })
      .catch(() => {
        if (!mounted) return;
        setVerified(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-white text-zinc-950 flex items-center justify-center px-6">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          {verified ? <CheckCircle size={34} /> : <MailCheck size={34} />}
        </div>
        <h1 className="text-2xl font-bold mb-3">이메일 인증이 완료되었습니다</h1>
        <p className="text-sm leading-relaxed text-zinc-500 mb-8">
          이제 가입한 이메일과 비밀번호로 로그인할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="w-full rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          로그인하기
        </button>
      </section>
    </main>
  );
}
