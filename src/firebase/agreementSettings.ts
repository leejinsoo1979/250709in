import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './config'

export type AgreementPopupTheme = 'light' | 'brand' | 'dark'

export interface AgreementConsentSettings {
  enabled: boolean
  termsVersion: string
  privacyVersion: string
  popup: {
    brandLabel: string
    title: string
    description: string
    primaryButtonText: string
    secondaryButtonText: string
    theme: AgreementPopupTheme
    showLogoutButton: boolean
  }
  checks: {
    enableAllCheck: boolean
    allCheckLabel: string
    requireTerms: boolean
    requirePrivacy: boolean
    enableMarketing: boolean
    requireMarketing: boolean
    marketingLabel: string
  }
}

export const DEFAULT_AGREEMENT_SETTINGS: AgreementConsentSettings = {
  enabled: true,
  termsVersion: '2026-06-29',
  privacyVersion: '2026-06-29',
  popup: {
    brandLabel: 'MMM Craft',
    title: '약관 동의가 필요합니다',
    description: '정식 서비스 이용을 위해 이용약관과 개인정보 수집 및 이용에 동의해 주세요. 동의 기록은 계정에 저장됩니다.',
    primaryButtonText: '동의하고 계속',
    secondaryButtonText: '로그아웃',
    theme: 'light',
    showLogoutButton: false
  },
  checks: {
    enableAllCheck: true,
    allCheckLabel: '전체 동의',
    requireTerms: true,
    requirePrivacy: true,
    enableMarketing: false,
    requireMarketing: false,
    marketingLabel: '[선택] 서비스 소식 및 마케팅 정보 수신에 동의합니다.'
  }
}

const SETTINGS_REF = doc(db, 'publicSettings', 'agreementConsent')

const mergeAgreementSettings = (raw: Partial<AgreementConsentSettings> | undefined): AgreementConsentSettings => ({
  ...DEFAULT_AGREEMENT_SETTINGS,
  ...raw,
  popup: {
    ...DEFAULT_AGREEMENT_SETTINGS.popup,
    ...(raw?.popup || {})
  },
  checks: {
    ...DEFAULT_AGREEMENT_SETTINGS.checks,
    ...(raw?.checks || {})
  }
})

export async function getAgreementConsentSettings(): Promise<AgreementConsentSettings> {
  try {
    const snap = await getDoc(SETTINGS_REF)
    if (!snap.exists()) return DEFAULT_AGREEMENT_SETTINGS
    return mergeAgreementSettings(snap.data() as Partial<AgreementConsentSettings>)
  } catch (error) {
    console.warn('약관 동의 설정을 불러오지 못해 기본값을 사용합니다:', error)
    return DEFAULT_AGREEMENT_SETTINGS
  }
}

export async function saveAgreementConsentSettings(
  settings: AgreementConsentSettings,
  updatedBy: string
): Promise<void> {
  await setDoc(SETTINGS_REF, {
    ...settings,
    updatedAt: serverTimestamp(),
    updatedBy
  }, { merge: true })
}
