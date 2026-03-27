"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, ChevronLeft } from "lucide-react";
import { motion, useAnimation } from "motion/react";
import { useTheme } from "@/contexts/ThemeContext";
import { useResponsive } from "@/hooks/useResponsive";

/* ── Exported Props ── */
export interface SignInFloProps {
  onSubmit?: (data: {
    email: string;
    password: string;
    name?: string;
    isSignUp: boolean;
  }) => Promise<void> | void;
  onGoogleLogin?: () => Promise<void> | void;
  onNavigateHome?: () => void;
  error?: string | null;
  loading?: boolean;
  googleLoading?: boolean;
  title?: string;
  subtitle?: string;
  defaultSignUp?: boolean;
}

export const SignInFlo: React.FC<SignInFloProps> = ({
  onSubmit,
  onGoogleLogin,
  onNavigateHome,
  error: externalError,
  loading: externalLoading = false,
  googleLoading = false,
  title,
  subtitle,
  defaultSignUp = false,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(defaultSignUp);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animation states (from LandingPage)
  const [tttAnimating, setTttAnimating] = useState(false);
  const [craftAnimating, setCraftAnimating] = useState(false);
  const [tttHovered, setTttHovered] = useState(false);
  const [craftHovered, setCraftHovered] = useState(false);
  const craftControls = useAnimation();

  const nav = useNavigate();
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const { isMobile } = useResponsive();
  const loading = externalLoading || isSubmitting;

  // think thing thank: 3초 간격 자동 애니메이션
  useEffect(() => {
    const interval = setInterval(() => {
      setTttAnimating(true);
      setTimeout(() => setTttAnimating(false), 1600);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // CRAFT: 4초 간격 자동 애니메이션 (ttt와 엇갈리게)
  useEffect(() => {
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        setCraftAnimating(true);
        setTimeout(() => setCraftAnimating(false), 2000);
      }, 4000);
      return () => clearInterval(interval);
    }, 1500);
    return () => clearTimeout(timeout);
  }, []);

  const handleCraftHover = useCallback(() => {
    setCraftHovered(true);
    setCraftAnimating(true);
    craftControls.start({
      scale: [1, 1.03, 1],
      transition: { duration: 0.5, ease: 'easeOut' },
    });
  }, [craftControls]);

  const handleCraftLeave = useCallback(() => {
    setCraftHovered(false);
    setTimeout(() => setCraftAnimating(false), 800);
  }, []);

  const handleTttHover = () => {
    setTttHovered(true);
    setTttAnimating(true);
  };
  const handleTttLeave = () => {
    setTttHovered(false);
    setTimeout(() => setTttAnimating(false), 800);
  };

  const isTttActive = tttAnimating || tttHovered;
  const isCraftActive = craftAnimating || craftHovered;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ email, password, name: isSignUp ? name : undefined, isSignUp });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setEmail("");
    setPassword("");
    setName("");
    setShowPassword(false);
  };

  return (
    <div className="min-h-screen flex" style={{ flexDirection: isMobile ? 'column' : 'row', background: isDark ? '#000000' : '#ffffff' }}>
      {/* Left Panel - Animated Branding (desktop only) */}
      {!isMobile && (
      <div className="w-1/2 relative overflow-hidden flex flex-col"
        style={{
          background: isDark ? '#000000' : '#ffffff',
        }}
      >
        {/* Logo */}
        <header className="relative z-10 flex items-center px-8 sm:px-12 py-5">
          <div
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={onNavigateHome}
          >
            <div className="flex items-center gap-1">
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: isDark ? '#fff' : '#000' }} />
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: isDark ? '#fff' : '#000' }} />
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: isDark ? '#fff' : '#000' }} />
            </div>
            <span className="font-black text-lg ml-1" style={{ color: isDark ? '#fff' : '#000' }}>CRAFT</span>
          </div>
        </header>

        {/* Animated Content */}
        <div className="relative z-10 flex flex-col justify-center items-center flex-1">
          {/* Back Button - 도트 바로 위, 좌측 정렬 */}
          <div className="w-full max-w-md mb-4">
            <button
              type="button"
              onClick={onNavigateHome}
              className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: isDark ? '#a1a1aa' : '#111' }}
            >
              <span>←</span>
              <span>Back</span>
            </button>
          </div>

          {/* think thing thank */}
          <div
            className="flex items-center justify-center gap-3 sm:gap-4 mb-6 cursor-pointer"
            onMouseEnter={handleTttHover}
            onMouseLeave={handleTttLeave}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={`dot-${i}`}
                className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 rounded-full"
                style={{ background: isDark ? '#fff' : '#000' }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: isTttActive ? [1, 1.3, 0.9, 1] : 1,
                  opacity: 1,
                }}
                transition={{
                  scale: isTttActive
                    ? { duration: 0.8, delay: i * 0.12, times: [0, 0.3, 0.6, 1], ease: 'easeOut' }
                    : { duration: 0.5, delay: i * 0.1, ease: 'easeOut' },
                  opacity: { duration: 0.4, delay: i * 0.1 },
                }}
                whileHover={{ scale: 1.4, transition: { duration: 0.15 } }}
              />
            ))}
            <motion.span
              className="font-black text-xl sm:text-2xl md:text-3xl lg:text-4xl tracking-wide ml-6"
              style={{ display: 'inline-flex', color: isDark ? '#fff' : '#000' }}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            >
              {'think thing thank'.split('').map((char, i) => (
                <motion.span
                  key={i}
                  style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : undefined }}
                  animate={{
                    y: isTttActive ? [0, -6, 2, 0] : 0,
                    opacity: isTttActive ? [1, 1, 0.7, 1] : 1,
                  }}
                  transition={{
                    y: isTttActive
                      ? { duration: 1.2, delay: 0.3 + i * 0.035, times: [0, 0.25, 0.5, 1], ease: 'easeInOut' }
                      : { duration: 0.3 },
                    opacity: isTttActive
                      ? { duration: 1.2, delay: 0.3 + i * 0.035, times: [0, 0.25, 0.5, 1] }
                      : { duration: 0.3 },
                  }}
                  whileHover={{ y: -4, scale: 1.15, transition: { duration: 0.12 } }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </motion.span>
              ))}
            </motion.span>
          </div>

          {/* CRAFT */}
          <motion.div
            className="cursor-pointer"
            onMouseEnter={handleCraftHover}
            onMouseLeave={handleCraftLeave}
            animate={craftControls}
          >
            <motion.div
              className="font-black text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-tight"
              style={{ display: 'inline-flex', gap: '0.02em', color: isDark ? '#fff' : '#000' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
            >
              {'CRAFT'.split('').map((char, i) => (
                <motion.span
                  key={i}
                  style={{
                    display: 'inline-block',
                    textShadow: isCraftActive
                      ? isDark
                        ? '0 0 20px rgba(255,255,255,0.3), 0 0 60px rgba(255,255,255,0.1)'
                        : '0 0 20px rgba(0,0,0,0.12), 0 0 60px rgba(0,0,0,0.05)'
                      : 'none',
                    transition: 'text-shadow 0.4s ease',
                  }}
                  animate={{
                    y: isCraftActive ? [0, -8, 0] : 0,
                  }}
                  transition={{
                    y: isCraftActive
                      ? { duration: 1.4, delay: i * 0.07, times: [0, 0.3, 1], ease: 'easeInOut' }
                      : { duration: 0.3 },
                  }}
                  whileHover={{
                    y: -6,
                    transition: { duration: 0.2, ease: 'easeOut' },
                  }}
                >
                  {char}
                </motion.span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
      )}

      {/* Right Panel - Login Form */}
      <div className="w-full flex flex-col" style={{ width: isMobile ? '100%' : '50%' }}>

      {/* Mobile Header: Back + CRAFT logo */}
      {isMobile && (
        <header className="flex items-center px-4 py-3" style={{ background: isDark ? '#000000' : '#ffffff' }}>
          <button
            type="button"
            onClick={onNavigateHome}
            className="flex items-center justify-center w-10 h-10 rounded-full transition-colors"
            style={{ color: isDark ? '#a1a1aa' : '#111', background: 'transparent' }}
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-1.5 ml-2">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: isDark ? '#fff' : '#000' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: isDark ? '#fff' : '#000' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: isDark ? '#fff' : '#000' }} />
            </div>
            <span className="font-black text-base ml-1" style={{ color: isDark ? '#fff' : '#000' }}>CRAFT</span>
          </div>
        </header>
      )}

      {/* Google Loading Overlay */}
      {googleLoading && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-800 px-12 py-10 rounded-2xl text-center">
            <div className="w-10 h-10 border-2 border-zinc-700 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium">Google 로그인 중...</p>
            <p className="text-zinc-500 text-sm mt-1">팝업 창에서 계정을 선택해주세요</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-1 flex items-center justify-center ${isMobile ? 'px-4' : 'px-6'}`}
        style={isMobile ? { paddingBottom: 'env(safe-area-inset-bottom, 16px)' } : undefined}
      >
        <motion.div
          className={`w-full max-w-md ${isMobile ? 'p-5' : 'rounded-2xl p-10'}`}
          style={isMobile ? {
            border: 'none',
            background: 'transparent',
          } : {
            border: `1.5px solid ${isDark ? '#71717a' : '#000000'}`,
            background: isDark ? 'rgba(24,24,27,0.4)' : '#ffffff',
          }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {/* Title */}
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: isDark ? '#fff' : '#111' }}>
              {title ?? (isSignUp ? "Create Account" : "Start designing your furniture")}
            </h1>
            <p className="text-sm" style={{ color: isDark ? '#71717a' : '#333' }}>
              {subtitle ?? (isSignUp ? "Sign up to get started" : "Sign in to continue")}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: isDark ? '#71717a' : '#555' }} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full Name"
                  required
                  className={`w-full rounded-full pl-11 pr-5 py-3.5 focus:outline-none transition-colors ${isMobile ? 'text-base' : 'text-sm'}`}
                  style={{
                    background: isDark ? '#18181b' : '#f9fafb',
                    border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                    color: isDark ? '#fff' : '#111',
                    ...(isMobile ? { fontSize: '16px', minHeight: '48px' } : {}),
                  }}
                />
              </div>
            )}

            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: isDark ? '#71717a' : '#555' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                required
                className={`w-full rounded-full pl-11 pr-5 py-3.5 focus:outline-none transition-colors ${isMobile ? 'text-base' : 'text-sm'}`}
                style={{
                  background: isDark ? '#18181b' : '#f9fafb',
                  border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                  color: isDark ? '#fff' : '#111',
                  ...(isMobile ? { fontSize: '16px', minHeight: '48px' } : {}),
                }}
              />
            </div>

            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: isDark ? '#71717a' : '#555' }} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className={`w-full rounded-full pl-11 pr-11 py-3.5 focus:outline-none transition-colors ${isMobile ? 'text-base' : 'text-sm'}`}
                style={{
                  background: isDark ? '#18181b' : '#f9fafb',
                  border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                  color: isDark ? '#fff' : '#111',
                  ...(isMobile ? { fontSize: '16px', minHeight: '48px' } : {}),
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: isDark ? '#71717a' : '#555' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {!isSignUp && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs transition-colors"
                  style={{ color: isDark ? '#71717a' : '#333' }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {externalError && (
              <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {externalError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2 ${isMobile ? 'text-base min-h-[48px]' : 'text-sm'}`}
              style={{
                background: isDark ? '#fff' : '#111',
                color: isDark ? '#09090b' : '#fff',
              }}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto" />
              ) : (
                isSignUp ? "Create Account" : "Sign In"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full" style={{ borderTop: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}` }} />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-xs uppercase tracking-wider" style={{ background: isDark ? '#000000' : '#ffffff', color: isDark ? '#52525b' : '#555', ...(isMobile ? { background: isDark ? '#000000' : '#ffffff' } : {}) }}>
                Or continue with
              </span>
            </div>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={onGoogleLogin}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-3 py-3.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isMobile ? 'min-h-[48px]' : ''}`}
            style={{
              border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
              background: isDark ? '#18181b' : '#fff',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="text-sm font-medium" style={{ color: isDark ? '#d4d4d8' : '#111' }}>Google</span>
          </button>

          {/* Enterprise Button */}
          <button
            type="button"
            onClick={() => nav('/enterprise-signup')}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-full transition-colors mt-3 ${isMobile ? 'min-h-[48px]' : ''}`}
            style={{
              border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
              background: isDark ? '#18181b' : '#fff',
            }}
          >
            <span className="text-sm font-medium" style={{ color: isDark ? '#d4d4d8' : '#111' }}>기업계정 가입</span>
          </button>

          {/* Toggle */}
          <p className="mt-8 text-center text-sm" style={{ color: isDark ? '#52525b' : '#555' }}>
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={toggleMode}
              className="hover:underline font-medium"
              style={{ color: isDark ? '#fff' : '#111' }}
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </motion.div>
      </div>
      </div>
    </div>
  );
};

export default SignInFlo;
