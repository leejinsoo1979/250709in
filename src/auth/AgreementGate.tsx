import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'

interface AgreementGateProps {
  children: React.ReactNode
}

const AGREEMENT_ALLOWED_PATHS = new Set([
  '/terms',
  '/privacy',
  '/terms-consent',
  '/login',
  '/signup',
  '/auth',
  '/auth/gradient',
  '/auth/ultra',
  '/auth/modern',
  '/auth/classic',
  '/auth/verified',
  '/auth/complete-signup',
  '/sketchup-oauth'
])

const isAgreementAllowedPath = (pathname: string): boolean => {
  if (AGREEMENT_ALLOWED_PATHS.has(pathname)) return true
  return pathname.startsWith('/share/') || pathname.startsWith('/viewer/')
}

export default function AgreementGate({ children }: AgreementGateProps) {
  const location = useLocation()
  const { user, loading, agreementLoading, agreementAccepted } = useAuth()

  if (
    user &&
    !loading &&
    !agreementLoading &&
    agreementAccepted === false &&
    !isAgreementAllowedPath(location.pathname)
  ) {
    return (
      <Navigate
        to="/terms-consent"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
  }

  return <>{children}</>
}
