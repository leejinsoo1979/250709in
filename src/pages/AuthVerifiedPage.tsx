import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, MailCheck } from 'lucide-react';
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
    <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6">
      <section className="w-full max-w-[420px] text-center">
        <div className="mb-10 text-[11px] font-semibold tracking-[0.34em] text-zinc-500">
          TTTCRAFT
        </div>
        <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white">
          {verified ? <Check size={28} strokeWidth={1.8} /> : <MailCheck size={28} strokeWidth={1.8} />}
        </div>
        <h1 className="text-[24px] font-semibold tracking-[-0.01em] mb-3">이메일 인증이 완료되었습니다</h1>
        <p className="text-sm leading-relaxed text-zinc-500 mb-9">
          이제 가입한 이메일과 비밀번호로 로그인할 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="w-full rounded-full border border-white bg-white px-5 py-3.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
        >
          로그인하기
        </button>
      </section>
    </main>
  );
}
