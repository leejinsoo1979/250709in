import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from './config'

export const CURRENT_TERMS_VERSION = '2026-06-29'
export const CURRENT_PRIVACY_VERSION = '2026-06-29'

export interface AgreementStatus {
  accepted: boolean
  termsVersion?: string
  privacyVersion?: string
}

const isLatestAgreementAccepted = (data: Record<string, any> | undefined): boolean => {
  if (!data) return false

  return Boolean(
    data.termsAcceptedAt &&
    data.privacyAcceptedAt &&
    data.termsVersion === CURRENT_TERMS_VERSION &&
    data.privacyVersion === CURRENT_PRIVACY_VERSION
  )
}

export async function getAgreementStatus(uid: string): Promise<AgreementStatus> {
  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)
  const data = userSnap.exists() ? userSnap.data() : undefined

  return {
    accepted: isLatestAgreementAccepted(data),
    termsVersion: data?.termsVersion,
    privacyVersion: data?.privacyVersion
  }
}

export async function acceptLatestAgreements(user: User): Promise<void> {
  const userRef = doc(db, 'users', user.uid)
  const acceptedAt = serverTimestamp()

  await setDoc(userRef, {
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    termsAcceptedAt: acceptedAt,
    privacyAcceptedAt: acceptedAt,
    agreementsAcceptedAt: acceptedAt,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    updatedAt: serverTimestamp()
  }, { merge: true })
}
