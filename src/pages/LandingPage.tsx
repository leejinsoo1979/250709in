import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronRight, Box, Palette, Ruler, Download, Cloud, Zap } from 'lucide-react';
import { Navbar1 } from '@/components/blocks/navbar1';
import { useTheme } from '@/contexts/ThemeContext';

const navbarData = {
  logo: {
    url: "/",
    title: "FurnitureDesigner",
  },
  menu: [
    { title: "Features", url: "#features" },
    {
      title: "Products",
      url: "#",
      items: [
        {
          title: "3D Editor",
          description: "Design and visualize furniture in stunning 3D",
          icon: <Box className="size-5 shrink-0" />,
          url: "/configurator",
        },
        {
          title: "Material Library",
          description: "Hundreds of materials, colors, and textures",
          icon: <Palette className="size-5 shrink-0" />,
          url: "#features",
        },
        {
          title: "Precision Tools",
          description: "Accurate measurements for professional results",
          icon: <Ruler className="size-5 shrink-0" />,
          url: "#features",
        },
        {
          title: "DXF Export",
          description: "Export designs in DXF format for manufacturing",
          icon: <Download className="size-5 shrink-0" />,
          url: "#features",
        },
      ],
    },
    {
      title: "Resources",
      url: "#",
      items: [
        {
          title: "Help Center",
          description: "Get all the answers you need right here",
          icon: <Zap className="size-5 shrink-0" />,
          url: "#",
        },
        {
          title: "Cloud Storage",
          description: "Save and access your projects from anywhere",
          icon: <Cloud className="size-5 shrink-0" />,
          url: "#",
        },
      ],
    },
    { title: "Demo", url: "#demo" },
    { title: "Pricing", url: "#pricing" },
  ],
  mobileExtraLinks: [
    { name: "About", url: "#" },
    { name: "Contact", url: "#" },
    { name: "Privacy", url: "#" },
    { name: "Terms", url: "#" },
  ],
  auth: {
    login: { text: "Login", url: "/login" },
    signup: { text: "Sign Up", url: "/signup" },
  },
};

export default function LandingPage() {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = React.useState<'monthly' | 'yearly'>('monthly');
  const { theme } = useTheme();

  // 테마 색상 맵
  const themeColorMap: Record<string, string> = {
    green: '#10b981',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    vivid: '#a25378',
    red: '#D2042D',
    pink: '#ec4899',
    indigo: '#6366f1',
    teal: '#14b8a6',
    yellow: '#eab308',
    gray: '#6b7280',
    cyan: '#06b6d4',
    lime: '#84cc16',
    black: '#1a1a1a',
    wine: '#845EC2',
    gold: '#d97706',
    navy: '#1e3a8a',
    emerald: '#059669',
    violet: '#C128D7',
    mint: '#0CBA80',
    neon: '#18CF23',
    rust: '#FF7438',
    white: '#D65DB1',
    plum: '#790963',
    brown: '#5A2B1D',
    darkgray: '#2C3844',
    maroon: '#3F0D0D',
    turquoise: '#003A7A',
    slate: '#2E3A47',
    copper: '#AD4F34',
    forest: '#1B3924',
    olive: '#4C462C'
  };

  const primaryColor = themeColorMap[theme.color] || '#3b82f6';

  return (
    <div className="bg-zinc-950">
      {/* Header */}
      <Navbar1 {...navbarData} />

      <main>
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 px-8">
          <div className="max-w-[1400px] mx-auto text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: primaryColor }} />
              <span className="text-zinc-400 text-sm ml-1">Professional Furniture Design Tool</span>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </div>

            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium text-white mb-8 max-w-4xl mx-auto"
              style={{
                letterSpacing: "-0.0325em",
                lineHeight: 1.1,
              }}>
              Design Your Perfect Furniture Space
            </h1>

            <p className="text-zinc-400 text-lg max-w-xl mb-12 mx-auto">
              <span className="text-white font-medium">Create stunning 3D furniture layouts.</span>{' '}
              Professional design tools for visualizing, customizing, and exporting production-ready furniture designs.
            </p>

            <div className="flex flex-wrap gap-6 justify-center">
              <Button
                size="lg"
                className="text-white hover:opacity-90 rounded-full px-8"
                style={{ backgroundColor: primaryColor }}
                onClick={() => navigate('/dashboard')}>
                Start Designing
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="hover:bg-zinc-800/50 rounded-full px-8"
                style={{ border: `1px solid ${primaryColor}`, color: primaryColor }}
                onClick={() => navigate('/configurator')}>
                View Demo
              </Button>
            </div>
          </div>

          {/* Hero Video with 3D Effect */}
          <div className="relative max-w-[1300px] mt-20 px-4 ml-auto mr-auto translate-x-[10%]">
            <div style={{ perspective: "1200px" }}>
              <div
                className="overflow-hidden"
                style={{
                  transform: "rotateX(35deg) rotateY(14deg) rotateZ(-26deg)",
                  transformOrigin: "center center",
                  maskImage: "radial-gradient(ellipse 80% 75% at center, black 40%, transparent 90%)",
                  WebkitMaskImage: "radial-gradient(ellipse 80% 75% at center, black 40%, transparent 90%)",
                }}>
                <video
                  className="w-full block"
                  autoPlay
                  loop
                  muted
                  playsInline>
                  <source src="/video/intro.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>
          {/* Video bottom fade - full width transition to Features section */}
          <div
            className="absolute bottom-0 left-0 right-0 h-72 pointer-events-none"
            style={{
              background: "linear-gradient(to bottom, transparent, rgb(9, 9, 11))"
            }}
          />
        </section>

        {/* Features Section */}
        <section id="features" className="relative py-32 px-8">
          {/* Top fade - transition from video */}
          <div
            className="absolute top-0 left-0 right-0 h-48 pointer-events-none"
            style={{
              background: "linear-gradient(to top, transparent, rgb(9, 9, 11))"
            }}
          />
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: primaryColor }} />
              <span className="text-zinc-400 text-sm">Powerful Features</span>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </div>

            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-medium text-white mb-8 max-w-3xl"
              style={{ letterSpacing: "-0.0325em", lineHeight: 1.1 }}>
              Everything you need to design
            </h2>

            <p className="text-zinc-400 text-lg max-w-md mb-16">
              <span className="text-white font-medium">Professional-grade tools.</span>{' '}
              Create stunning furniture designs with our comprehensive feature set.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={<BoxIcon />}
                title="3D Real-time Editor"
                description="Design and visualize your furniture in stunning 3D with instant updates"
              />
              <FeatureCard
                icon={<PaletteIcon />}
                title="Material Library"
                description="Choose from hundreds of materials, colors, and textures"
              />
              <FeatureCard
                icon={<RulerIcon />}
                title="Precision Tools"
                description="Accurate measurements and dimensions for professional results"
              />
              <FeatureCard
                icon={<DownloadIcon />}
                title="DXF Export"
                description="Export your designs in DXF format for manufacturing"
              />
              <FeatureCard
                icon={<SyncIcon />}
                title="Real-time Sync"
                description="Collaborate with your team in real-time"
              />
              <FeatureCard
                icon={<CloudIcon />}
                title="Cloud Storage"
                description="Save and access your projects from anywhere"
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-32 px-8">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: primaryColor }} />
              <span className="text-zinc-400 text-sm">Pricing</span>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </div>

            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-medium text-white mb-8 max-w-3xl"
              style={{ letterSpacing: "-0.0325em", lineHeight: 1.1 }}>
              Simple, transparent pricing
            </h2>

            <p className="text-zinc-400 text-lg max-w-md mb-12">
              <span className="text-white font-medium">Choose the plan that fits your needs.</span>{' '}
              All plans include core features with no hidden fees.
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center gap-4 mb-12">
              <span className={billingCycle === 'monthly' ? 'text-white font-medium' : 'text-zinc-500'}>
                Monthly
              </span>
              <button
                onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                className="relative w-14 h-7 rounded-full transition-colors"
                style={{ backgroundColor: billingCycle === 'yearly' ? primaryColor : 'rgb(63, 63, 70)' }}
              >
                <span
                  className={cn(
                    "absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    billingCycle === 'yearly' ? 'translate-x-8' : 'translate-x-1'
                  )}
                />
              </button>
              <span className={billingCycle === 'yearly' ? 'text-white font-medium' : 'text-zinc-500'}>
                Yearly
                <span className="ml-2 text-xs text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: primaryColor }}>
                  Save 20%
                </span>
              </span>
            </div>

            {/* Pricing Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <PricingCard
                name="Free"
                price="0"
                description="Perfect for trying out"
                features={[
                  'Up to 3 projects',
                  'Basic 3D editor',
                  'Standard materials',
                  'Community support',
                ]}
                onSelect={() => navigate('/dashboard')}
                buttonText="Get Started"
                primaryColor={primaryColor}
              />
              <PricingCard
                name="Pro"
                price={billingCycle === 'monthly' ? '29' : '24'}
                description="For professional designers"
                features={[
                  'Unlimited projects',
                  'Advanced 3D editor',
                  'Premium materials',
                  'DXF export',
                  'Priority support',
                  'Real-time collaboration',
                ]}
                featured
                onSelect={() => navigate('/dashboard')}
                buttonText="Start Free Trial"
                primaryColor={primaryColor}
              />
              <PricingCard
                name="Enterprise"
                price="99"
                description="For large teams"
                features={[
                  'Everything in Pro',
                  'Unlimited team members',
                  'Custom integrations',
                  'Advanced analytics',
                  'Dedicated support',
                  'SLA guarantee',
                ]}
                onSelect={() => navigate('/dashboard')}
                buttonText="Contact Sales"
                primaryColor={primaryColor}
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 px-8 border-t border-zinc-800">
          <div className="max-w-[1400px] mx-auto text-center">
            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-medium text-white mb-6"
              style={{ letterSpacing: "-0.0325em", lineHeight: 1.1 }}>
              Ready to start designing?
            </h2>
            <p className="text-zinc-400 text-lg mb-10 max-w-lg mx-auto">
              Join thousands of designers creating amazing furniture layouts with our professional tools.
            </p>
            <Button
              size="lg"
              className="text-white hover:opacity-90 rounded-full px-8"
              style={{ backgroundColor: primaryColor }}
              onClick={() => navigate('/dashboard')}>
              Get Started for Free
            </Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-zinc-800 py-12 px-8">
          <div className="max-w-[1400px] mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div>
                <Logo className="mb-4" primaryColor={primaryColor} />
                <p className="text-zinc-500 text-sm">
                  Professional 3D furniture design tool
                </p>
              </div>
              <div>
                <h4 className="text-zinc-200 font-medium mb-4">Product</h4>
                <ul className="space-y-2 text-sm text-zinc-500">
                  <li><a href="#features" className="hover:text-white transition">Features</a></li>
                  <li><a href="#demo" className="hover:text-white transition">Demo</a></li>
                  <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-zinc-200 font-medium mb-4">Company</h4>
                <ul className="space-y-2 text-sm text-zinc-500">
                  <li><a href="#" className="hover:text-white transition">About</a></li>
                  <li><a href="#" className="hover:text-white transition">Contact</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-zinc-200 font-medium mb-4">Legal</h4>
                <ul className="space-y-2 text-sm text-zinc-500">
                  <li><a href="#" className="hover:text-white transition">Privacy</a></li>
                  <li><a href="#" className="hover:text-white transition">Terms</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-zinc-800 pt-8 text-center text-zinc-500 text-sm">
              <p>&copy; 2025 Uable Corporation. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

// Logo Component
const Logo = ({ className, primaryColor = '#3b82f6' }: { className?: string; primaryColor?: string }) => {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="w-9 h-9 flex items-center justify-center text-white font-bold text-3xl leading-none"
        style={{ backgroundColor: primaryColor, fontFamily: '"Nunito", "Quicksand", "Varela Round", system-ui, sans-serif', borderRadius: '10px' }}
      >
        m
      </div>
      <span style={{ color: primaryColor }} className="font-semibold text-2xl tracking-wide">
        LOGO
      </span>
    </div>
  );
};

// Feature Card Component (Dark Theme)
const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => {
  return (
    <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors">
      <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center mb-4 text-zinc-400">
        {icon}
      </div>
      <h3 className="font-medium text-zinc-200 mb-2">{title}</h3>
      <p className="text-zinc-500 text-sm">{description}</p>
    </div>
  );
};

// Pricing Card Component (Dark Theme)
const PricingCard = ({
  name,
  price,
  description,
  features,
  featured,
  onSelect,
  buttonText,
  primaryColor = '#10b981',
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  featured?: boolean;
  onSelect: () => void;
  buttonText: string;
  primaryColor?: string;
}) => {
  return (
    <div
      className={cn(
        'p-6 rounded-xl border transition-all',
        featured
          ? 'bg-zinc-900 relative'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
      )}
      style={featured ? { borderColor: `${primaryColor}80` } : undefined}
    >
      {featured && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-xs font-semibold px-4 py-1 rounded-full"
          style={{ backgroundColor: primaryColor }}
        >
          Most Popular
        </div>
      )}
      <h3 className="font-semibold text-xl text-zinc-200 mb-1">{name}</h3>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-zinc-500">$</span>
        <span className="text-4xl font-bold text-white">{price}</span>
        <span className="text-zinc-500">/month</span>
      </div>
      <p className="text-zinc-500 text-sm mb-6">{description}</p>
      <ul className="space-y-3 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-2 text-sm text-zinc-400">
            <CheckIcon color={primaryColor} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Button
        className={cn(
          "w-full",
          featured
            ? "bg-white text-zinc-900 hover:bg-zinc-200"
            : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
        )}
        onClick={onSelect}>
        {buttonText}
      </Button>
    </div>
  );
};

// Icons
const BoxIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

const PaletteIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="8" r="2" />
    <circle cx="8" cy="14" r="2" />
    <circle cx="16" cy="14" r="2" />
  </svg>
);

const RulerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 20L20 4M12 12l2-2M8 16l2-2M16 8l2-2" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 15V3M12 15l-4-4M12 15l4-4M4 21h16" />
  </svg>
);

const SyncIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12A9 9 0 0 0 12 3M3 12a9 9 0 0 0 9 9" />
    <path d="M21 12l-3-3M21 12l-3 3M3 12l3 3M3 12l3-3" />
  </svg>
);

const CloudIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </svg>
);

const CheckIcon = ({ color = 'var(--theme-primary)' }: { color?: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill={color} className="shrink-0">
    <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" clipRule="evenodd" />
  </svg>
);
