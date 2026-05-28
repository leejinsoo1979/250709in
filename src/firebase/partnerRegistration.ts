import { httpsCallable } from 'firebase/functions'
import { functions } from './config'

export interface PartnerRegistrationInput {
  message: string
}

export interface PartnerRegistrationResult {
  ok: boolean
  requestId: string
}

export async function sendPartnerRegistrationRequest(
  input: PartnerRegistrationInput
): Promise<PartnerRegistrationResult> {
  const fn = httpsCallable<PartnerRegistrationInput, PartnerRegistrationResult>(
    functions,
    'sendPartnerRegistrationRequest'
  )
  const result = await fn(input)
  return result.data
}
