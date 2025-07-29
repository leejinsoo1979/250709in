import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, Sparkles, ArrowRight, Loader2, Zap, Shield, Award, Fingerprint, Brain, Rocket, Star } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '@/firebase/auth';

// Particle component for background effects
const Particle = ({ index }: { index: number }) => {
  const randomX = Math.random() * 100;
  const randomY = Math.random() * 100;
  const randomDelay = Math.random() * 5;
  const randomDuration = 15 + Math.random() * 20;
  
  return (
    <motion.div
      className="absolute w-1 h-1 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full opacity-40"
      style={{ left: `${randomX}%`, top: `${randomY}%` }}
      animate={{
        y: [-20, -window.innerHeight - 20],
        opacity: [0, 1, 1, 0],
        scale: [0, 1.5, 1.5, 0],
      }}
      transition={{
        duration: randomDuration,
        delay: randomDelay,
        repeat: Infinity,
        ease: "linear"
      }}
    />
  );
};

// Floating shape component
const FloatingShape = ({ type, delay }: { type: 'circle' | 'hexagon' | 'triangle', delay: number }) => {
  const shapes = {
    circle: "rounded-full",
    hexagon: "clip-path-hexagon",
    triangle: "clip-path-triangle"
  };
  
  return (
    <motion.div
      className={`absolute w-24 h-24 bg-gradient-to-br from-purple-400/10 to-pink-400/10 backdrop-blur-xl ${shapes[type]}`}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0.3, 0.6, 0.3],
        scale: [1, 1.2, 1],
        rotate: [0, 180, 360],
        x: [0, 50, 0],
        y: [0, -30, 0],
      }}
      transition={{
        duration: 20,
        delay,
        repeat: Infinity,
        ease: "easeInOut"
      }}
      style={{
        left: `${Math.random() * 80}%`,
        top: `${Math.random() * 80}%`,
      }}
    />
  );
};

export const UltraModernLoginForm: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  // Mouse tracking for interactive effects
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Smooth spring animations for mouse movement
  const springConfig = { damping: 25, stiffness: 200 };
  const mouseXSpring = useSpring(mouseX, springConfig);
  const mouseYSpring = useSpring(mouseY, springConfig);
  
  // Transform values for 3D tilt effect
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["17.5deg", "-17.5deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-17.5deg", "17.5deg"]);
  
  // Background gradient that follows mouse
  const backgroundX = useTransform(mouseXSpring, [-0.5, 0.5], ["0%", "100%"]);
  const backgroundY = useTransform(mouseYSpring, [-0.5, 0.5], ["0%", "100%"]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      const x = (clientX / innerWidth) - 0.5;
      const y = (clientY / innerHeight) - 0.5;
      mouseX.set(x);
      mouseY.set(y);
      setMousePosition({ x: clientX, y: clientY });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = isSignUp 
        ? await signUpWithEmail(email, password, displayName)
        : await signInWithEmail(email, password);

      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        navigate('/');
      }
    } catch (err) {
      setError('예상치 못한 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await signInWithGoogle();
      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        navigate('/');
      }
    } catch (err) {
      setError('구글 로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: <Zap className="w-5 h-5" />, text: "초고속 3D 렌더링", color: "from-yellow-400 to-orange-400" },
    { icon: <Shield className="w-5 h-5" />, text: "안전한 데이터 보호", color: "from-blue-400 to-cyan-400" },
    { icon: <Award className="w-5 h-5" />, text: "프리미엄 디자인 템플릿", color: "from-purple-400 to-pink-400" },
    { icon: <Brain className="w-5 h-5" />, text: "AI 기반 추천 시스템", color: "from-green-400 to-emerald-400" },
  ];

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-black">
      {/* Animated gradient background */}
      <motion.div 
        className="absolute inset-0 opacity-50"
        style={{
          background: `radial-gradient(circle at ${backgroundX}% ${backgroundY}%, rgba(168, 85, 247, 0.4) 0%, transparent 50%)`,
        }}
      />
      
      {/* Particle effects */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(50)].map((_, i) => (
          <Particle key={i} index={i} />
        ))}
      </div>
      
      {/* Floating shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <FloatingShape type="circle" delay={0} />
        <FloatingShape type="hexagon" delay={2} />
        <FloatingShape type="triangle" delay={4} />
      </div>

      {/* Left Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        {/* Glassmorphism card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            rotateX,
            rotateY,
            transformStyle: "preserve-3d",
          }}
          className="relative w-full max-w-md"
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-3xl blur-xl"
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          
          <div className="relative bg-gray-900/40 backdrop-blur-xl rounded-3xl p-8 border border-gray-800/50 shadow-2xl">
            {/* Logo with animation */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="text-center mb-8"
            >
              <div className="inline-flex items-center space-x-3 mb-6">
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.1, rotate: 360 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-2xl">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <motion.div
                    className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-900"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </motion.div>
                <span className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  MOHEIM
                </span>
              </div>
              
              <motion.h1
                className="text-3xl font-bold text-white mb-2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {isSignUp ? '미래를 디자인하세요' : '다시 만나서 반가워요'}
              </motion.h1>
              <motion.p
                className="text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                {isSignUp ? 'AI와 함께하는 인테리어 혁명' : '당신만의 공간이 기다리고 있습니다'}
              </motion.p>
            </motion.div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <AnimatePresence mode="wait">
                {isSignUp && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="relative group">
                      <Fingerprint className={`absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 transition-all duration-300 ${
                        focusedField === 'name' ? 'text-purple-400' : 'text-gray-500'
                      }`} />
                      <input
                        type="text"
                        placeholder="이름"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        onFocus={() => setFocusedField('name')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full pl-14 pr-5 py-4 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl focus:outline-none focus:border-purple-500 transition-all duration-300 text-white placeholder-gray-500"
                        required
                      />
                      <motion.div
                        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 pointer-events-none"
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Email Input with floating label */}
              <div className="relative group">
                <Mail className={`absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 transition-all duration-300 ${
                  focusedField === 'email' || email ? 'text-purple-400' : 'text-gray-500'
                }`} />
                <input
                  type="email"
                  placeholder=" "
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  className="peer w-full pl-14 pr-5 py-4 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl focus:outline-none focus:border-purple-500 transition-all duration-300 text-white placeholder-transparent"
                  required
                />
                <label className="absolute left-14 top-4 text-gray-500 transition-all duration-300 peer-placeholder-shown:top-4 peer-focus:top-1 peer-focus:text-xs peer-focus:text-purple-400 peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:text-xs pointer-events-none">
                  이메일 주소
                </label>
                <motion.div
                  className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 pointer-events-none"
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Password Input with strength indicator */}
              <div className="relative group">
                <Lock className={`absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 transition-all duration-300 ${
                  focusedField === 'password' || password ? 'text-purple-400' : 'text-gray-500'
                }`} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder=" "
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className="peer w-full pl-14 pr-14 py-4 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl focus:outline-none focus:border-purple-500 transition-all duration-300 text-white placeholder-transparent"
                  required
                />
                <label className="absolute left-14 top-4 text-gray-500 transition-all duration-300 peer-placeholder-shown:top-4 peer-focus:top-1 peer-focus:text-xs peer-focus:text-purple-400 peer-[:not(:placeholder-shown)]:top-1 peer-[:not(:placeholder-shown)]:text-xs pointer-events-none">
                  비밀번호
                </label>
                <motion.button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-purple-400 transition-colors duration-300"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </motion.button>
                <motion.div
                  className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 pointer-events-none"
                  transition={{ duration: 0.3 }}
                />
                
                {/* Password strength indicator */}
                {password && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-6 left-0 right-0 flex space-x-1"
                  >
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          i < (password.length > 12 ? 4 : password.length > 8 ? 3 : password.length > 5 ? 2 : 1)
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                            : 'bg-gray-700'
                        }`}
                      />
                    ))}
                  </motion.div>
                )}
              </div>

              {/* Remember & Forgot with modern styling */}
              <div className="flex items-center justify-between text-sm pt-2">
                <label className="flex items-center space-x-2 cursor-pointer group">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                    />
                    <div className="w-5 h-5 bg-gray-800 border border-gray-600 rounded-md peer-checked:bg-gradient-to-br peer-checked:from-purple-500 peer-checked:to-pink-500 peer-checked:border-transparent transition-all duration-300">
                      <svg className="w-3 h-3 text-white absolute top-1 left-1 opacity-0 peer-checked:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <span className="text-gray-400 group-hover:text-gray-300 transition-colors select-none">로그인 상태 유지</span>
                </label>
                <motion.a
                  href="#"
                  className="text-purple-400 hover:text-pink-400 font-medium transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  비밀번호 찾기
                </motion.a>
              </div>

              {/* Error Message with animation */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="p-4 bg-red-500/10 backdrop-blur-sm border border-red-500/50 rounded-xl text-red-400 text-sm flex items-center space-x-2"
                  >
                    <div className="w-5 h-5 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-red-400 font-bold">!</span>
                    </div>
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Button with liquid effect */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="relative w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
              >
                {/* Liquid animation effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500"
                  animate={{
                    x: ["0%", "100%", "0%"],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                  style={{ width: "200%" }}
                />
                
                <div className="relative flex items-center justify-center space-x-2">
                  {loading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <>
                      {isSignUp ? <Rocket className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                      <span>{isSignUp ? '시작하기' : '로그인'}</span>
                    </>
                  )}
                </div>
                
                {/* Ripple effect on hover */}
                <motion.div
                  className="absolute inset-0 bg-white/20 rounded-2xl"
                  initial={{ scale: 0, opacity: 1 }}
                  whileHover={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                />
              </motion.button>
            </form>

            {/* Divider with animation */}
            <div className="relative my-8">
              <motion.div
                className="absolute inset-0 flex items-center"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <div className="w-full border-t border-gray-700"></div>
              </motion.div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-gray-900/40 backdrop-blur-sm text-gray-500">또는</span>
              </div>
            </div>

            {/* Social Login with enhanced effects */}
            <div className="space-y-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center space-x-3 py-4 bg-white/10 backdrop-blur-sm border border-gray-700 rounded-2xl hover:bg-white/20 hover:border-gray-600 transition-all duration-300 group"
              >
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </motion.div>
                <span className="text-gray-300 font-medium group-hover:text-white transition-colors">Google로 계속하기</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/configurator')}
                className="w-full flex items-center justify-center space-x-3 py-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-sm border border-purple-500/50 rounded-2xl hover:from-purple-500/30 hover:to-pink-500/30 transition-all duration-300 group"
              >
                <motion.div
                  className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg"
                  whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  <Sparkles className="w-5 h-5 text-white" />
                </motion.div>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 font-semibold">
                  데모 체험하기
                </span>
                <ArrowRight className="w-4 h-4 text-purple-400 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </div>

            {/* Switch Form with animation */}
            <motion.div
              className="mt-8 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <p className="text-gray-400">
                {isSignUp ? '이미 계정이 있으신가요?' : '처음 오셨나요?'}{' '}
                <motion.button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-purple-400 hover:text-pink-400 font-semibold transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isSignUp ? '로그인' : '가입하기'}
                </motion.button>
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Right Side - Interactive Feature Showcase */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-purple-900/50 to-pink-900/50 backdrop-blur-sm items-center justify-center p-12 relative overflow-hidden">
        {/* Animated grid background */}
        <div className="absolute inset-0 opacity-20">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(rgba(168, 85, 247, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(168, 85, 247, 0.3) 1px, transparent 1px)`,
              backgroundSize: '50px 50px',
              transform: `translate(${mousePosition.x * 0.05}px, ${mousePosition.y * 0.05}px)`,
            }}
          />
        </div>

        {/* 3D rotating logo */}
        <motion.div
          className="absolute top-20 right-20"
          animate={{
            rotateY: [0, 360],
            rotateZ: [0, 10, 0, -10, 0],
          }}
          transition={{
            rotateY: { duration: 20, repeat: Infinity, ease: "linear" },
            rotateZ: { duration: 5, repeat: Infinity, ease: "easeInOut" },
          }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className="w-32 h-32 bg-gradient-to-br from-purple-500/30 to-pink-500/30 backdrop-blur-md rounded-2xl flex items-center justify-center">
            <Sparkles className="w-16 h-16 text-white/50" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="relative z-10 max-w-lg"
        >
          <motion.h2
            className="text-5xl font-bold text-white mb-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            AI가 만드는<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              완벽한 공간
            </span>
          </motion.h2>
          
          <motion.p
            className="text-xl text-gray-300 mb-12"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
          >
            최첨단 3D 기술과 인공지능이 결합된<br />
            차세대 인테리어 디자인 플랫폼
          </motion.p>

          {/* Interactive Features with enhanced animations */}
          <div className="space-y-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
                whileHover={{ x: 10, scale: 1.05 }}
                className="flex items-center space-x-4 cursor-pointer"
              >
                <motion.div
                  className={`w-14 h-14 bg-gradient-to-br ${feature.color} rounded-xl flex items-center justify-center shadow-lg`}
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="text-white">{feature.icon}</div>
                </motion.div>
                <div>
                  <span className="text-white text-lg font-medium">{feature.text}</span>
                  <motion.div
                    className="h-0.5 bg-gradient-to-r from-purple-400 to-pink-400 mt-1"
                    initial={{ width: 0 }}
                    whileHover={{ width: "100%" }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Animated stats */}
          <motion.div
            className="mt-12 grid grid-cols-3 gap-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
          >
            {[
              { value: "10K+", label: "활성 사용자" },
              { value: "50K+", label: "디자인 완성" },
              { value: "99%", label: "만족도" },
            ].map((stat, index) => (
              <motion.div
                key={index}
                className="text-center"
                whileHover={{ scale: 1.1 }}
              >
                <motion.div
                  className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.2 + index * 0.1, type: "spring" }}
                >
                  {stat.value}
                </motion.div>
                <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* Floating elements with physics */}
        <motion.div
          className="absolute bottom-20 left-20"
          animate={{
            y: [0, -30, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <Star className="w-8 h-8 text-purple-400/50" />
        </motion.div>
      </div>

      {/* Custom styles */}
      <style jsx>{`
        .clip-path-hexagon {
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        }
        .clip-path-triangle {
          clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        }
      `}</style>
    </div>
  );
};