import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Menu, X, ChevronRight } from 'lucide-react';

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
    <div className="bg-zinc-950">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
        <nav className="max-w-[1400px] mx-auto px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <Logo />
            </Link>

            <ul className="hidden md:flex items-center gap-8">
              {menuItems.map((item, index) => (
                <li key={index}>
                  <a
                    href={item.href}
                    className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>

            <div className="hidden md:flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-white hover:bg-zinc-800"
                onClick={() => navigate('/login')}>
                Login
              </Button>
              <Button
                size="sm"
                className="bg-white text-zinc-900 hover:bg-zinc-200"
                onClick={() => navigate('/signup')}>
                Sign Up
              </Button>
            </div>

            <button
              onClick={() => setMenuState(!menuState)}
              className="md:hidden p-2 -mr-2 text-zinc-400">
              {menuState ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {menuState && (
            <div className="md:hidden py-4 border-t border-zinc-800">
              <ul className="space-y-4 mb-4">
                {menuItems.map((item, index) => (
                  <li key={index}>
                    <a
                      href={item.href}
                      className="block text-zinc-400 hover:text-white"
                      onClick={() => setMenuState(false)}>
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="border-zinc-700 text-zinc-300"
                  onClick={() => navigate('/login')}>
                  Login
                </Button>
                <Button
                  className="bg-white text-zinc-900"
                  onClick={() => navigate('/signup')}>
                  Sign Up
                </Button>
              </div>
            </div>
          )}
        </nav>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 px-8">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-zinc-400 text-sm">Professional Furniture Design Tool</span>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </div>

            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium text-white mb-8 max-w-4xl"
              style={{
                letterSpacing: "-0.0325em",
                lineHeight: 1.1,
              }}>
              Design Your Perfect Furniture Space
            </h1>

            <p className="text-zinc-400 text-lg max-w-xl mb-12">
              <span className="text-white font-medium">Create stunning 3D furniture layouts.</span>{' '}
              Professional design tools for visualizing, customizing, and exporting production-ready furniture designs.
            </p>

            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                className="bg-white text-zinc-900 hover:bg-zinc-200"
                onClick={() => navigate('/dashboard')}>
                Start Designing
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={() => navigate('/configurator')}>
                View Demo
              </Button>
            </div>
          </div>

          {/* Hero Video with 3D Effect */}
          <div className="max-w-[1600px] mx-auto mt-20 px-4">
            <div style={{ perspective: "1200px" }}>
              <div
                className="rounded-2xl overflow-hidden border border-zinc-700/50 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)]"
                style={{
                  transform: "rotateX(6deg) rotateZ(-12deg)",
                  transformOrigin: "center center",
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
        </section>

        {/* Features Section */}
        <section id="features" className="relative py-32 px-8">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
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

        {/* Demo Section - Project Timeline Style */}
        <section id="demo" className="relative py-32 px-8">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-zinc-400 text-sm">Design Workflow</span>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </div>

            <h2
              className="text-3xl sm:text-4xl md:text-5xl font-medium text-white mb-8 max-w-3xl"
              style={{ letterSpacing: "-0.0325em", lineHeight: 1.1 }}>
              Streamline your design process
            </h2>

            <p className="text-zinc-400 text-lg max-w-md mb-16">
              <span className="text-white font-medium">From concept to production.</span>{' '}
              Manage your furniture design projects with our visual planning tools.
            </p>

            {/* 3D Timeline Visualization */}
            <div
              className="relative w-full mb-16"
              style={{ perspective: "1200px" }}>
              <div
                className="relative"
                style={{
                  transform: "rotateX(50deg) rotateZ(-35deg)",
                  transformStyle: "preserve-3d",
                  transformOrigin: "center center",
                }}>
                <div className="relative h-[350px]">
                  {/* Diagonal dashed line */}
                  <div
                    className="absolute w-[1px] bg-zinc-600/50"
                    style={{
                      height: "500px",
                      left: "55%",
                      top: "-50px",
                      backgroundImage:
                        "repeating-linear-gradient(to bottom, transparent, transparent 4px, rgba(113, 113, 122, 0.5) 4px, rgba(113, 113, 122, 0.5) 8px)",
                    }}
                  />

                  {/* Phase labels */}
                  <div className="absolute text-zinc-500 text-sm" style={{ left: "8%", top: "60px" }}>
                    Week 1
                  </div>
                  <div className="absolute text-zinc-500 text-sm" style={{ left: "25%", top: "40px" }}>
                    Week 2
                  </div>
                  <div className="absolute text-zinc-500 text-sm" style={{ left: "45%", top: "20px" }}>
                    Week 3
                  </div>
                  <div
                    className="absolute px-3 py-1 rounded-md bg-zinc-700/80 text-zinc-300 text-sm font-medium"
                    style={{ left: "60%", top: "0px" }}>
                    Delivery
                  </div>

                  {/* Project bars */}
                  <div
                    className="absolute rounded-lg bg-zinc-800/90 border border-zinc-700/50 px-4 py-3 flex items-center gap-3"
                    style={{ left: "5%", top: "90px", width: "50%", height: "48px" }}>
                    <div className="w-4 h-4 rotate-45 bg-purple-500/60" />
                    <span className="text-zinc-300 text-sm font-medium">Space Configuration</span>
                    <div
                      className="absolute w-5 h-5 rotate-45 border-2 border-green-500 bg-transparent"
                      style={{ right: "15%", top: "50%", transform: "translateY(-50%) rotate(45deg)" }}
                    />
                  </div>

                  <div
                    className="absolute rounded-lg bg-zinc-800/70 border border-zinc-700/40 px-4 py-3 flex items-center gap-3"
                    style={{ left: "15%", top: "145px", width: "30%", height: "44px" }}>
                    <div className="w-3 h-3 rotate-45 bg-zinc-600/60" />
                    <span className="text-zinc-500 text-sm">Material Selection</span>
                  </div>

                  <div
                    className="absolute rounded-lg bg-zinc-800/90 border border-zinc-700/50 px-4 py-3 flex items-center justify-between"
                    style={{ left: "40%", top: "145px", width: "50%", height: "48px" }}>
                    <span className="text-zinc-400 text-sm">Module Placement</span>
                    <div className="flex gap-0.5">
                      <div className="w-2.5 h-2.5 rotate-45 bg-green-500/60" />
                      <div className="w-2.5 h-2.5 rotate-45 bg-green-500/60" />
                      <div className="w-2.5 h-2.5 rotate-45 bg-green-500/60" />
                    </div>
                  </div>

                  <div
                    className="absolute rounded-lg bg-zinc-800/70 border border-zinc-700/40 px-4 py-3 flex items-center justify-between"
                    style={{ left: "55%", top: "200px", width: "35%", height: "48px" }}>
                    <span className="text-zinc-400 text-sm">DXF Export</span>
                    <div className="flex gap-0.5">
                      <div className="w-2.5 h-2.5 rotate-45 bg-zinc-500/60" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom two-column section */}
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="border-t border-r border-b border-zinc-800 pt-10 pr-10 pb-16">
                <h3 className="text-xl font-medium text-zinc-200 mb-3">Manage projects end-to-end</h3>
                <p className="text-zinc-500 text-base leading-relaxed mb-8">
                  Configure dimensions, materials, and modules in one centralized workspace.
                </p>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                  <h4 className="text-lg font-medium text-zinc-200 mb-5">Project Overview</h4>

                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-zinc-500 text-sm w-20">Status</span>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        In Progress
                      </span>
                      <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs">
                        3D Mode
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-zinc-500 text-sm w-20">Dimensions</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs">
                        2400 x 600 x 2100mm
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <span className="text-zinc-500 text-sm w-20 pt-1">Modules</span>
                    <div className="flex flex-col gap-2">
                      <span className="flex items-center gap-2 text-zinc-300 text-sm">
                        <span className="w-2.5 h-2.5 rotate-45 bg-purple-500" />
                        Cabinet Units <span className="text-zinc-500">4</span>
                      </span>
                      <span className="flex items-center gap-2 text-zinc-300 text-sm">
                        <span className="w-2.5 h-2.5 rotate-45 bg-purple-500" />
                        Drawer Units <span className="text-zinc-500">2</span>
                      </span>
                      <span className="flex items-center gap-2 text-zinc-400 text-sm">
                        <span className="w-2.5 h-2.5 rotate-45 border border-zinc-500 bg-transparent" />
                        Shelves <span className="text-zinc-500">6</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-b border-zinc-800 pt-10 pl-10 pb-16">
                <h3 className="text-xl font-medium text-zinc-200 mb-3">Export & Production</h3>
                <p className="text-zinc-500 text-base leading-relaxed mb-8">
                  Generate production-ready DXF files for manufacturing.
                </p>

                <div className="relative h-48">
                  <div
                    className="absolute rounded-lg bg-zinc-800/40 border border-zinc-700/30 px-4 py-2"
                    style={{ top: 0, left: "10%", width: "80%" }}>
                    <span className="flex items-center gap-2 text-zinc-500 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      PDF Export
                    </span>
                  </div>

                  <div
                    className="absolute rounded-lg bg-zinc-800/60 border border-zinc-700/40 px-4 py-2"
                    style={{ top: "30px", left: "5%", width: "85%" }}>
                    <span className="flex items-center gap-2 text-zinc-400 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                      Image Export
                    </span>
                  </div>

                  <div
                    className="absolute rounded-xl bg-zinc-800/90 border border-zinc-700/50 px-5 py-4"
                    style={{ top: "60px", left: 0, width: "95%" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                        <svg className="w-3 h-3 text-green-500" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                        </svg>
                      </span>
                      <span className="text-green-500 font-medium text-sm">DXF Ready</span>
                    </div>
                    <p className="text-zinc-300 text-sm mb-3">Production-ready files for CNC machines</p>
                    <span className="text-zinc-500 text-xs">All panels • Cut lists • Assembly guides</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom feature grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-16">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="10" cy="10" r="8" />
                    <circle cx="10" cy="10" r="4" />
                    <circle cx="10" cy="10" r="1" fill="currentColor" />
                  </svg>
                  <span className="text-zinc-200 font-medium">Precision</span>
                </div>
                <p className="text-zinc-500 text-sm leading-relaxed">Millimeter-accurate measurements for perfect fits.</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="10" cy="10" r="8" />
                    <path d="M2 10h16M10 2a15 15 0 010 16M10 2a15 15 0 000 16" />
                  </svg>
                  <span className="text-zinc-200 font-medium">Collaboration</span>
                </div>
                <p className="text-zinc-500 text-sm leading-relaxed">Work together with your team in real-time.</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 rotate-45 bg-zinc-400" />
                  <span className="text-zinc-200 font-medium">Materials</span>
                </div>
                <p className="text-zinc-500 text-sm leading-relaxed">Extensive library of textures and finishes.</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                    <rect x="2" y="10" width="3" height="8" rx="1" />
                    <rect x="7" y="6" width="3" height="12" rx="1" />
                    <rect x="12" y="8" width="3" height="10" rx="1" />
                  </svg>
                  <span className="text-zinc-200 font-medium">Analytics</span>
                </div>
                <p className="text-zinc-500 text-sm leading-relaxed">Track materials and costs automatically.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-32 px-8">
          <div className="max-w-[1400px] mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
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
                className={cn(
                  "relative w-14 h-7 rounded-full transition-colors",
                  billingCycle === 'yearly' ? 'bg-green-500' : 'bg-zinc-700'
                )}>
                <span
                  className={cn(
                    "absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    billingCycle === 'yearly' ? 'translate-x-8' : 'translate-x-1'
                  )}
                />
              </button>
              <span className={billingCycle === 'yearly' ? 'text-white font-medium' : 'text-zinc-500'}>
                Yearly
                <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">
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
              className="bg-white text-zinc-900 hover:bg-zinc-200"
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
                <Logo className="mb-4" />
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
const Logo = ({ className }: { className?: string }) => {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold">
        F
      </div>
      <span className="font-semibold text-lg text-white">FurnitureDesigner</span>
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
          ? 'border-green-500/50 bg-zinc-900 relative'
          : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
      )}>
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-semibold px-4 py-1 rounded-full">
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
            <CheckIcon />
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

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-green-500 shrink-0">
    <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" clipRule="evenodd" />
  </svg>
);
