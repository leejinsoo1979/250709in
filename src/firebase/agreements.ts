import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from './config'
import { getAgreementConsentSettings } from './agreementSettings'

export interface AgreementStatus {
  accepted: boolean
  termsVersion?: string
  privacyVersion?: string
}

export interface AgreementAcceptanceOptions {
  marketingAccepted?: boolean
  termsVersion?: string
  privacyVersion?: string
}

const isLatestAgreementAccepted = (
  data: Record<string, any> | undefined,
  termsVersion: string,
  privacyVersion: string
): boolean => {
  if (!data) return false

  return Boolean(
    data.termsAcceptedAt &&
    data.privacyAcceptedAt &&
    data.termsVersion === termsVersion &&
    data.privacyVersion === privacyVersion
  )
}

export async function getAgreementStatus(uid: string): Promise<AgreementStatus> {
  const settings = await getAgreementConsentSettings()
  if (!settings.enabled) {
    return {
      accepted: true,
      termsVersion: settings.termsVersion,
      privacyVersion: settings.privacyVersion
    }
  }

  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)
  const data = userSnap.exists() ? userSnap.data() : undefined

  return {
    accepted: isLatestAgreementAccepted(data, settings.termsVersion, settings.privacyVersion),
    termsVersion: data?.termsVersion,
    privacyVersion: data?.privacyVersion
  }
}

export async function acceptLatestAgreements(
  user: User,
  options: AgreementAcceptanceOptions = {}
): Promise<void> {
  const settings = options.termsVersion && options.privacyVersion
    ? {
        termsVersion: options.termsVersion,
        privacyVersion: options.privacyVersion
      }
    : await getAgreementConsentSettings()
  const userRef = doc(db, 'users', user.uid)
  const acceptedAt = serverTimestamp()

  await setDoc(userRef, {
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    termsAcceptedAt: acceptedAt,
    privacyAcceptedAt: acceptedAt,
    agreementsAcceptedAt: acceptedAt,
    termsVersion: settings.termsVersion,
    privacyVersion: settings.privacyVersion,
    marketingAccepted: Boolean(options.marketingAccepted),
    marketingAcceptedAt: options.marketingAccepted ? acceptedAt : null,
    updatedAt: serverTimestamp()
  }, { merge: true })
}
