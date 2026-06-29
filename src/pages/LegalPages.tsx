import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { signOutUser } from '@/firebase/auth'
import { useAuth } from '@/auth/AuthProvider'
import styles from './LegalPages.module.css'

function LegalHeader() {
  const navigate = useNavigate()

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <button className={styles.brand} onClick={() => navigate('/')}>
          made make material
        </button>
        <nav className={styles.nav}>
          <Link to="/terms">이용약관</Link>
          <Link to="/privacy">개인정보처리방침</Link>
        </nav>
      </div>
    </header>
  )
}

export function TermsPage() {
  return (
    <main className={styles.page}>
      <LegalHeader />
      <div className={styles.container}>
        <article className={styles.document}>
          <p className={styles.eyebrow}>MMM Craft</p>
          <h1>이용약관</h1>
          <p className={styles.updated}>시행일: 2026년 6월 29일</p>
          <p className={styles.notice}>
            이 문서는 서비스 운영을 위한 기본 약관 초안입니다. 사업자명, 대표자, 주소, 고객센터 이메일 등 운영자 정보는 실제 정보로 교체해야 합니다.
          </p>

          <section className={styles.section}>
            <h2>제1조 목적</h2>
            <p>본 약관은 MMM Craft가 제공하는 웹 기반 가구 설계, 프로젝트 관리, 도면 및 산출물 생성 서비스의 이용 조건과 권리, 의무 및 책임사항을 정합니다.</p>
          </section>

          <section className={styles.section}>
            <h2>제2조 계정 및 회원가입</h2>
            <ul>
              <li>회원은 이메일, Google 계정 등 회사가 제공하는 인증 수단으로 가입할 수 있습니다.</li>
              <li>회원은 정확한 정보를 제공해야 하며, 계정 관리 책임은 회원 본인에게 있습니다.</li>
              <li>타인의 계정을 사용하거나 허위 정보를 등록한 경우 서비스 이용이 제한될 수 있습니다.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>제3조 서비스 이용</h2>
            <ul>
              <li>회원은 서비스에서 가구 설계, 프로젝트 저장, 파일 내보내기, 공유 기능 등을 이용할 수 있습니다.</li>
              <li>일부 기능은 기업회원, 관리자, 유료 플랜 또는 승인된 계정에 한해 제공될 수 있습니다.</li>
              <li>회사는 안정적인 서비스 제공을 위해 기능, 화면, 정책을 변경할 수 있습니다.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>제4조 금지행위</h2>
            <ul>
              <li>법령 또는 공서양속에 반하는 행위</li>
              <li>서비스의 정상 운영을 방해하는 자동화, 침해, 우회 행위</li>
              <li>타인의 개인정보, 계정, 프로젝트를 무단으로 사용하거나 침해하는 행위</li>
              <li>회사의 사전 동의 없이 서비스를 복제, 판매, 재배포하는 행위</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>제5조 회원 콘텐츠</h2>
            <p>회원이 업로드하거나 생성한 프로젝트, 이미지, 도면, 설정값 등은 회원에게 귀속됩니다. 회사는 서비스 제공, 저장, 백업, 공유, 고객지원, 장애 대응에 필요한 범위에서 이를 처리할 수 있습니다.</p>
          </section>

          <section className={styles.section}>
            <h2>제6조 서비스 중단 및 제한</h2>
            <p>회사는 점검, 장애, 보안상 필요, 외부 서비스 장애, 천재지변 등 부득이한 사유가 있는 경우 서비스의 전부 또는 일부를 일시 중단할 수 있습니다.</p>
          </section>

          <section className={styles.section}>
            <h2>제7조 책임 제한</h2>
            <p>서비스에서 생성되는 도면, 견적, 최적화 결과, 치수 정보는 사용자가 최종 검토해야 합니다. 제작, 시공, 주문 등 실제 업무에 사용하기 전 회원은 결과의 정확성과 적합성을 확인해야 합니다.</p>
          </section>

          <section className={styles.section}>
            <h2>제8조 탈퇴 및 이용제한</h2>
            <p>회원은 언제든지 계정 삭제를 요청할 수 있습니다. 회사는 약관 위반, 보안 위험, 불법 행위가 확인된 경우 사전 통지 후 또는 긴급한 경우 즉시 이용을 제한할 수 있습니다.</p>
          </section>

          <section className={styles.section}>
            <h2>제9조 문의</h2>
            <p>운영자 정보: 주식회사 유에이블 코퍼레이션, 대표자 이진수, 서울특별시 강남구 언주로97길 7, 5F, sbbc212@gmail.com</p>
          </section>
        </article>
      </div>
    </main>
  )
}

export function PrivacyPage() {
  return (
    <main className={styles.page}>
      <LegalHeader />
      <div className={styles.container}>
        <article className={styles.document}>
          <p className={styles.eyebrow}>MMM Craft</p>
          <h1>개인정보처리방침</h1>
          <p className={styles.updated}>시행일: 2026년 6월 29일</p>
          <p className={styles.notice}>
            이 문서는 서비스 운영을 위한 기본 개인정보처리방침 초안입니다. 실제 사업자 정보, 담당자 연락처, 위탁업체, 보관기간은 운영 상황에 맞게 보완해야 합니다.
          </p>

          <section className={styles.section}>
            <h2>1. 수집하는 개인정보</h2>
            <ul>
              <li>회원가입 및 로그인: 이메일, 이름 또는 표시 이름, 프로필 이미지, Firebase UID, 로그인 제공자 정보</li>
              <li>기업회원 신청: 회사명, 담당자명, 연락처, 사업자등록번호, 사업자등록증, 주소 등 신청자가 입력한 정보</li>
              <li>서비스 이용: 프로젝트, 디자인 파일, 도면, 이미지, 설정값, 공유 기록, 주문 및 문의 내용</li>
              <li>자동 수집 정보: 접속 로그, 접속 IP, 브라우저 및 기기 정보, 서비스 이용 기록</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>2. 개인정보 이용 목적</h2>
            <ul>
              <li>회원 식별, 로그인, 계정 관리</li>
              <li>프로젝트 저장, 공유, 도면 생성, 주문 및 고객지원 제공</li>
              <li>기업회원 승인, 권한 관리, 부정 이용 방지</li>
              <li>서비스 안정성 확보, 장애 대응, 보안 관리</li>
              <li>공지사항, 문의 답변, 약관 및 정책 변경 안내</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>3. 보관 및 파기</h2>
            <p>개인정보는 수집 및 이용 목적 달성 시 지체 없이 파기합니다. 다만 관련 법령에 따라 보관이 필요한 정보는 해당 기간 동안 보관할 수 있습니다. 회원이 계정 삭제를 요청하면 법령상 보관이 필요한 정보를 제외하고 삭제 또는 비식별 처리합니다.</p>
          </section>

          <section className={styles.section}>
            <h2>4. 제3자 제공</h2>
            <p>회사는 회원의 동의가 있거나 법령상 근거가 있는 경우를 제외하고 개인정보를 외부에 제공하지 않습니다.</p>
          </section>

          <section className={styles.section}>
            <h2>5. 처리 위탁 및 외부 서비스</h2>
            <p>서비스 제공을 위해 Firebase, Google Authentication, Firebase Hosting, Firestore, Cloud Storage 등 클라우드 및 인증 서비스를 사용할 수 있습니다. 실제 운영 시 사용하는 외부 서비스와 위탁 내용을 최신 상태로 공개합니다.</p>
          </section>

          <section className={styles.section}>
            <h2>6. 이용자의 권리</h2>
            <p>회원은 자신의 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다. 서비스 내 계정 설정 또는 고객센터를 통해 요청할 수 있으며, 회사는 법령에 따라 처리합니다.</p>
          </section>

          <section className={styles.section}>
            <h2>7. 개인정보 보호 조치</h2>
            <p>회사는 접근 권한 관리, 인증, 전송 구간 암호화, 보안 규칙 적용 등 개인정보 보호를 위한 기술적·관리적 조치를 시행합니다.</p>
          </section>

          <section className={styles.section}>
            <h2>8. 문의처</h2>
            <p>개인정보 보호책임자 및 고객센터: 이진수, sbbc212@gmail.com, 010-8983-6637</p>
          </section>
        </article>
      </div>
    </main>
  )
}

export function TermsConsentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading, agreementLoading, agreementAccepted, acceptAgreements } = useAuth()
  const [termsChecked, setTermsChecked] = useState(false)
  const [privacyChecked, setPrivacyChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from || '/demo'

  if (!loading && !user) {
    return <Navigate to="/login" replace />
  }

  if (!agreementLoading && agreementAccepted) {
    return <Navigate to={from} replace />
  }

  const canSubmit = termsChecked && privacyChecked && !submitting

  const handleAccept = async () => {
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    const result = await acceptAgreements()
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    navigate(from, { replace: true })
  }

  const handleSignOut = async () => {
    await signOutUser()
    navigate('/', { replace: true })
  }

  return (
    <main className={styles.consentShell}>
      <section className={styles.consentCard}>
        <p className={styles.eyebrow}>MMM Craft</p>
        <h1>약관 동의가 필요합니다</h1>
        <p>
          정식 서비스 이용을 위해 이용약관과 개인정보 수집 및 이용에 동의해 주세요.
          동의 기록은 계정에 저장됩니다.
        </p>

        <div className={styles.checks}>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={termsChecked}
              onChange={(event) => setTermsChecked(event.target.checked)}
            />
            <span className={styles.checkText}>
              [필수] <Link to="/terms" target="_blank" rel="noreferrer">이용약관</Link>에 동의합니다.
            </span>
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={privacyChecked}
              onChange={(event) => setPrivacyChecked(event.target.checked)}
            />
            <span className={styles.checkText}>
              [필수] <Link to="/privacy" target="_blank" rel="noreferrer">개인정보처리방침</Link> 및 개인정보 수집·이용에 동의합니다.
            </span>
          </label>
        </div>

        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={handleAccept} disabled={!canSubmit}>
            {submitting ? '저장 중' : '동의하고 계속'}
          </button>
          <button className={styles.secondaryButton} onClick={handleSignOut}>
            로그아웃
          </button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </section>
    </main>
  )
}
