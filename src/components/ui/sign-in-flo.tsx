"use client";

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { motion } from "motion/react";

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

  const nav = useNavigate();
  const loading = externalLoading || isSubmitting;

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
    <div className="min-h-screen bg-zinc-950 flex flex-row">
      {/* Left Panel - Branding */}
      <div className="w-1/2 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(107,94,255,0.15) 0%, #09090b 50%, rgba(99,102,241,0.08) 100%)',
        }}
      >
        {/* Subtle grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
        {/* Glow orbs */}
        <div className="absolute" style={{ top: '15%', left: '20%', width: 300, height: 300, background: 'radial-gradient(circle, rgba(107,94,255,0.12) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(60px)' }} />
        <div className="absolute" style={{ bottom: '20%', right: '15%', width: 400, height: 400, background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(80px)' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center h-full px-16">
          {/* Logo */}
          <div
            className="flex items-center gap-1.5 cursor-pointer mb-12"
            onClick={onNavigateHome}
          >
            <div className="flex items-center gap-1">
              <div className="w-3.5 h-3.5 rounded-full bg-white" />
              <div className="w-3.5 h-3.5 rounded-full bg-white" />
              <div className="w-3.5 h-3.5 rounded-full bg-white" />
            </div>
            <span className="text-white font-black text-lg ml-1">CRAFT</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Start designing your<br />furniture
          </h1>
          <p className="text-zinc-500 text-base leading-relaxed">
            맞춤 가구 설계부터 CNC 커팅 최적화까지,<br />
            원스톱 가구 제작 플랫폼
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full flex flex-col" style={{ width: '50%' }}>
        {/* Header (mobile only - hidden on desktop via media query) */}
        <header className="flex items-center justify-between px-8 sm:px-12 py-5" style={{ display: 'none' }}>
          <div
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={onNavigateHome}
          >
            <div className="flex items-center gap-1">
              <div className="w-3.5 h-3.5 rounded-full bg-white" />
              <div className="w-3.5 h-3.5 rounded-full bg-white" />
              <div className="w-3.5 h-3.5 rounded-full bg-white" />
            </div>
            <span className="text-white font-black text-lg ml-1">CRAFT</span>
          </div>
          <div className="w-20" />
        </header>

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
      <div className="flex-1 flex items-center justify-center px-6">
        <motion.div
          className="w-full max-w-md border border-zinc-600 rounded-2xl bg-zinc-900/40 p-10"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {/* Title */}
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              {title ?? (isSignUp ? "Create Account" : "Start designing your furniture")}
            </h1>
            <p className="text-zinc-500 text-sm">
              {subtitle ?? (isSignUp ? "Sign up to get started" : "Sign in to continue")}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full Name"
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-11 pr-5 py-3.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                />
              </div>
            )}

            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                required
                className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-11 pr-5 py-3.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-11 pr-11 py-3.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {!isSignUp && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs text-zinc-500 hover:text-white transition-colors"
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
              className="w-full bg-white text-zinc-950 py-3.5 rounded-full font-semibold text-sm hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
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
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-zinc-950 text-zinc-600 text-xs uppercase tracking-wider">
                Or continue with
              </span>
            </div>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={onGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="text-zinc-300 text-sm font-medium">Google</span>
          </button>

          {/* Enterprise Button */}
          <button
            type="button"
            onClick={() => nav('/enterprise-signup')}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors mt-3"
          >
            <span className="text-zinc-300 text-sm font-medium">기업계정 가입</span>
          </button>

          {/* Toggle */}
          <p className="mt-8 text-center text-sm text-zinc-600">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={toggleMode}
              className="text-white hover:underline font-medium"
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
