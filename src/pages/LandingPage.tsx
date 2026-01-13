import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

const menuItems = [
  { name: 'Features', href: '#features' },
  { name: 'Demo', href: '#demo' },
  { name: 'Pricing', href: '#pricing' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [menuState, setMenuState] = React.useState(false);
  const [billingCycle, setBillingCycle] = React.useState<'monthly' | 'yearly'>('monthly');

  return (
    <div>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
        <nav className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* 로고 */}
            <Link to="/" className="flex items-center">
              <Logo />
            </Link>

            {/* 데스크톱 메뉴 */}
            <ul className="hidden md:flex items-center gap-8">
              {menuItems.map((item, index) => (
                <li key={index}>
                  <a
                    href={item.href}
                    className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors">
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>

            {/* 버튼 */}
            <div className="hidden md:flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/login')}>
                Login
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/signup')}>
                Sign Up
              </Button>
            </div>

            {/* 모바일 메뉴 버튼 */}
            <button
              onClick={() => setMenuState(!menuState)}
              className="md:hidden p-2 -mr-2">
              {menuState ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* 모바일 메뉴 */}
          {menuState && (
            <div className="md:hidden py-4 border-t border-zinc-200">
              <ul className="space-y-4 mb-4">
                {menuItems.map((item, index) => (
                  <li key={index}>
                    <a
                      href={item.href}
                      className="block text-zinc-600 hover:text-zinc-900"
                      onClick={() => setMenuState(false)}>
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate('/login')}>
                  Login
                </Button>
                <Button onClick={() => navigate('/signup')}>
                  Sign Up
                </Button>
              </div>
            </div>
          )}
        </nav>
      </header>

      <main>
        {/* Background Decorations */}
        <div
          aria-hidden
          className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block">
          <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
          <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
        </div>

        {/* Hero Section */}
        <section className="overflow-hidden bg-white pt-16">
          <div className="relative mx-auto max-w-5xl px-6 py-20 lg:py-24">
            <div className="relative z-10 mx-auto max-w-2xl text-center">
              <h1 className="text-balance text-4xl font-semibold md:text-5xl lg:text-6xl">
                Design Your Perfect Furniture Space
              </h1>
              <p className="mx-auto my-8 max-w-2xl text-xl text-muted-foreground">
                Professional 3D furniture design tool. Create, customize, and visualize your dream interior in real-time.
              </p>

              <div className="flex justify-center gap-4">
                <Button
                  size="lg"
                  onClick={() => navigate('/dashboard')}>
                  <span>Start Designing</span>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => navigate('/configurator')}>
                  <span>Demo</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Hero Image with Perspective Effect */}
          <div className="mx-auto -mt-16 max-w-7xl [mask-image:linear-gradient(to_bottom,black_50%,transparent_100%)]">
            <div className="[perspective:1200px] [mask-image:linear-gradient(to_right,black_50%,transparent_100%)] -mr-16 pl-16 lg:-mr-56 lg:pl-56">
              <div className="[transform:rotateX(20deg);]">
                <div className="lg:h-[44rem] relative skew-x-[.36rad]">
                  <video
                    className="rounded-xl z-[2] relative border"
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{ width: '100%', height: 'auto' }}>
                    <source src="/video/intro.mp4" type="video/mp4" />
                  </video>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="bg-background relative z-10 py-16">
          <div className="m-auto max-w-5xl px-6">
            <h2 className="text-center text-3xl font-semibold mb-4">Everything you need to design</h2>
            <p className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto">
              Professional-grade tools for creating stunning furniture designs
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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

        {/* Demo Section */}
        <section id="demo" className="py-16 bg-white">
          <div className="m-auto max-w-5xl px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-semibold mb-4">See it in action</h2>
                <p className="text-muted-foreground mb-8">
                  Watch how easy it is to create beautiful furniture designs
                </p>
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3">
                    <CheckIcon />
                    <span>Drag and drop furniture modules</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckIcon />
                    <span>Customize colors and materials</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckIcon />
                    <span>View in 2D and 3D modes</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckIcon />
                    <span>Export production-ready files</span>
                  </li>
                </ul>
                <Button onClick={() => navigate('/dashboard')}>
                  Try it now
                </Button>
              </div>
              <div className="bg-zinc-100 rounded-xl overflow-hidden shadow-lg">
                <div className="bg-zinc-200 p-3 flex gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <video
                  className="w-full"
                  autoPlay
                  loop
                  muted
                  playsInline>
                  <source src="/video/intro.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-16 bg-background">
          <div className="m-auto max-w-5xl px-6">
            <h2 className="text-center text-3xl font-semibold mb-4">Simple, transparent pricing</h2>
            <p className="text-center text-muted-foreground mb-8">
              Choose the plan that's right for you
            </p>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mb-12">
              <span className={billingCycle === 'monthly' ? 'font-semibold' : 'text-muted-foreground'}>
                Monthly
              </span>
              <button
                onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                className={cn(
                  "relative w-14 h-7 rounded-full transition-colors",
                  billingCycle === 'yearly' ? 'bg-primary' : 'bg-zinc-200'
                )}>
                <span
                  className={cn(
                    "absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    billingCycle === 'yearly' ? 'translate-x-8' : 'translate-x-1'
                  )}
                />
              </button>
              <span className={billingCycle === 'yearly' ? 'font-semibold' : 'text-muted-foreground'}>
                Yearly
                <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
                  Save 20%
                </span>
              </span>
            </div>

            {/* Pricing Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-primary text-primary-foreground">
          <div className="m-auto max-w-5xl px-6 text-center">
            <h2 className="text-3xl font-semibold mb-4">Ready to start designing?</h2>
            <p className="mb-8 opacity-90">
              Join thousands of designers creating amazing furniture layouts
            </p>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => navigate('/dashboard')}>
              Get Started for Free
            </Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-zinc-950 text-white py-12">
          <div className="m-auto max-w-5xl px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
              <div>
                <h4 className="font-semibold mb-4">FurnitureDesigner</h4>
                <p className="text-zinc-400 text-sm">
                  Professional 3D furniture design tool
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Product</h4>
                <ul className="space-y-2 text-sm text-zinc-400">
                  <li><a href="#features" className="hover:text-white transition">Features</a></li>
                  <li><a href="#demo" className="hover:text-white transition">Demo</a></li>
                  <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Company</h4>
                <ul className="space-y-2 text-sm text-zinc-400">
                  <li><a href="#" className="hover:text-white transition">About</a></li>
                  <li><a href="#" className="hover:text-white transition">Contact</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-zinc-800 pt-8 text-center text-zinc-400 text-sm">
              <p>&copy; 2025 Uable Corporation. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

// Logo Component
const Logo = ({ className }: { className?: string }) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="w-8 h-8 bg-brand-purple rounded-md flex items-center justify-center text-white font-bold">
        m
      </div>
      <span className="font-semibold text-lg">logo</span>
    </div>
  );
};

// Feature Card Component
const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => {
  return (
    <div className="p-6 rounded-xl border bg-white hover:shadow-lg transition-shadow">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
};

// Pricing Card Component
const PricingCard = ({
  name,
  price,
  description,
  features,
  featured,
  onSelect,
  buttonText,
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  featured?: boolean;
  onSelect: () => void;
  buttonText: string;
}) => {
  return (
    <div
      className={cn(
        'p-6 rounded-xl border transition-all',
        featured
          ? 'border-primary shadow-lg scale-105 bg-white relative'
          : 'bg-white hover:border-primary/50'
      )}>
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-full">
          Most Popular
        </div>
      )}
      <h3 className="font-semibold text-xl mb-1">{name}</h3>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-muted-foreground">$</span>
        <span className="text-4xl font-bold">{price}</span>
        <span className="text-muted-foreground">/month</span>
      </div>
      <p className="text-muted-foreground text-sm mb-6">{description}</p>
      <ul className="space-y-3 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            <CheckIcon />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Button
        className="w-full"
        variant={featured ? 'default' : 'outline'}
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

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-green-500 shrink-0">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);
