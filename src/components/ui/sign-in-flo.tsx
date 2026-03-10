"use client";

import React, { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";

interface FormFieldProps {
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: React.ReactNode;
  showToggle?: boolean;
  onToggle?: () => void;
  showPassword?: boolean;
  required?: boolean;
}

const AnimatedFormField: React.FC<FormFieldProps> = ({
  type,
  placeholder,
  value,
  onChange,
  icon,
  showToggle,
  onToggle,
  showPassword,
  required,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div className="relative group">
      <div
        className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 transition-all duration-300 ease-in-out focus-within:border-zinc-600"
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 transition-colors duration-200 group-focus-within:text-white">
          {icon}
        </div>

        <input
          type={type}
          value={value}
          onChange={onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          required={required}
          className="w-full bg-transparent pl-10 pr-12 py-3 text-white placeholder:text-transparent focus:outline-none text-sm"
          placeholder=""
        />

        <label
          className={`absolute left-10 transition-all duration-200 ease-in-out pointer-events-none ${
            isFocused || value
              ? "top-1.5 text-[10px] text-zinc-400 font-medium"
              : "top-1/2 -translate-y-1/2 text-sm text-zinc-600"
          }`}
        >
          {placeholder}
        </label>

        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}

        {isHovering && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(200px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255, 255, 255, 0.04) 0%, transparent 70%)`,
            }}
          />
        )}
      </div>
    </div>
  );
};

const FloatingParticles: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    setCanvasSize();
    window.addEventListener("resize", setCanvasSize);

    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.size = Math.random() * 1.5 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.3;
        this.speedY = (Math.random() - 0.5) * 0.3;
        this.opacity = Math.random() * 0.2;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas!.width) this.x = 0;
        if (this.x < 0) this.x = canvas!.width;
        if (this.y > canvas!.height) this.y = 0;
        if (this.y < 0) this.y = canvas!.height;
      }

      draw() {
        if (!ctx) return;
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const particles: Particle[] = [];
    for (let i = 0; i < 40; i++) {
      particles.push(new Particle());
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", setCanvasSize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
};

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
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      <FloatingParticles />

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

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center gap-2 cursor-pointer mb-6"
              onClick={onNavigateHome}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
              </div>
              <span className="text-white font-bold text-lg tracking-tight ml-1">
                think thing thank
              </span>
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">
              {title ?? (isSignUp ? "Create Account" : "Start designing your furniture")}
            </h1>
            <p className="text-zinc-500 text-sm">
              {subtitle ?? (isSignUp ? "Sign up to get started" : "Sign in to continue")}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <AnimatedFormField
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                icon={<User size={18} />}
                required
              />
            )}

            <AnimatedFormField
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={18} />}
              required
            />

            <AnimatedFormField
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock size={18} />}
              showToggle
              onToggle={() => setShowPassword(!showPassword)}
              showPassword={showPassword}
              required
            />

            {!isSignUp && (
              <div className="flex items-center justify-end">
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
              className="w-full relative group bg-white text-zinc-950 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              <span
                className={`transition-opacity duration-200 ${
                  loading ? "opacity-0" : "opacity-100"
                }`}
              >
                {isSignUp ? "Create Account" : "Sign In"}
              </span>

              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
            </button>
          </form>

          {/* Divider */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-zinc-900/60 text-zinc-600 uppercase tracking-wider">
                  Or continue with
                </span>
              </div>
            </div>

            {/* Google Button */}
            <div className="mt-5">
              <button
                type="button"
                onClick={onGoogleLogin}
                disabled={loading}
                className="w-full relative group flex items-center justify-center gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 transition-all duration-300 ease-in-out overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-red-500/10 to-yellow-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <svg width="18" height="18" viewBox="0 0 24 24" className="relative">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="relative text-zinc-300 text-sm font-medium">Google</span>
              </button>
            </div>
          </div>

          {/* Toggle */}
          <div className="mt-8 text-center">
            <p className="text-sm text-zinc-600">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={toggleMode}
                className="text-white hover:underline font-medium"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignInFlo;
