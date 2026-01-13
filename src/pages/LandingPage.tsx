import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import styles from './LandingPage.module.css';

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className={styles.container}>
      {/* Navigation */}
      <nav className={`${styles.nav} ${scrollY > 0 ? styles.navScrolled : styles.navTransparent}`}>
        <div className={styles.navContent}>
          <div className={styles.logo} onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <img src="/logo.png" alt="Logo" className={styles.logoImage} />
          </div>
          <div className={styles.navMenu}>
            {/* Product Dropdown */}
            <div
              className={styles.dropdown}
              onMouseEnter={() => setOpenDropdown('product')}
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <button className={styles.navLink}>
                Product
                <svg className={styles.chevron} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {openDropdown === 'product' && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.dropdownMenuInner}>
                    <a href="#features" className={styles.dropdownItem}>3D Editor</a>
                    <a href="#features" className={styles.dropdownItem}>Design Tools</a>
                  </div>
                </div>
              )}
            </div>

            {/* Solutions Dropdown */}
            <div
              className={styles.dropdown}
              onMouseEnter={() => setOpenDropdown('solutions')}
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <button className={styles.navLink}>
                Solutions
                <svg className={styles.chevron} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {openDropdown === 'solutions' && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.dropdownMenuInner}>
                    <a href="#features" className={styles.dropdownItem}>Configurators</a>
                    <a href="#features" className={styles.dropdownItem}>DXF Export</a>
                    <a href="#features" className={styles.dropdownItem}>Real-time Collaboration</a>
                  </div>
                </div>
              )}
            </div>

            {/* Resources Dropdown */}
            <div
              className={styles.dropdown}
              onMouseEnter={() => setOpenDropdown('resources')}
              onMouseLeave={() => setOpenDropdown(null)}
            >
              <button className={styles.navLink}>
                Resources
                <svg className={styles.chevron} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {openDropdown === 'resources' && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.dropdownMenuInner}>
                    <a href="#demo" className={styles.dropdownItem}>Demo</a>
                    <a href="#" className={styles.dropdownItem}>Help Center</a>
                    <a href="#" className={styles.dropdownItem}>Examples</a>
                  </div>
                </div>
              )}
            </div>

            <a href="#pricing" className={styles.navLink}>Pricing</a>
          </div>
          <div className={styles.navButtons}>
            <button onClick={() => navigate('/login')} className={styles.navButtonSecondary}>
              Login
            </button>
            <button onClick={() => navigate('/signup')} className={styles.navButton}>
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        {/* 풀스크린 배경 동영상 */}
        <div className={styles.heroVideoBackground}>
          <video
            className={styles.heroBackgroundVideo}
            autoPlay
            loop
            muted
            playsInline
          >
            <source src="/video/intro.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          {/* 어두운 오버레이 */}
          <div className={styles.heroVideoOverlay}></div>
        </div>

        {/* 중앙 배치된 콘텐츠 */}
        <div className={styles.heroContentCenter}>
          <h1 className={styles.heroTitle}>
            Design Your Perfect Furniture Space
          </h1>
          <p className={styles.heroSubtitle}>
            Professional 3D furniture design tool. Create, customize, and visualize your dream interior in real-time.
          </p>
          <div className={styles.heroButtons}>
            <button
              onClick={() => navigate('/dashboard')}
              className={styles.primaryButton}
            >
              Start Designing
              <svg className={styles.buttonIcon} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={() => navigate('/configurator')}
              className={styles.secondaryButton}
            >
              Demo
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className={styles.features}>
        <div className={styles.featuresContent}>
          <h2 className={styles.sectionTitle}>Everything you need to design</h2>
          <p className={styles.sectionSubtitle}>
            Professional-grade tools for creating stunning furniture designs
          </p>

          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none">
                <rect x="8" y="8" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M24 18 L24 30 M18 24 L30 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <h3 className={styles.featureTitle}>3D Real-time Editor</h3>
              <p className={styles.featureDesc}>
                Design and visualize your furniture in stunning 3D with instant updates
              </p>
            </div>

            <div className={styles.featureCard}>
              <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2"/>
                <path d="M24 8 A16 16 0 0 1 40 24" stroke="currentColor" strokeWidth="2" fill="none"/>
                <path d="M16 14 L24 24 L32 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <h3 className={styles.featureTitle}>Material Library</h3>
              <p className={styles.featureDesc}>
                Choose from hundreds of materials, colors, and textures
              </p>
            </div>

            <div className={styles.featureCard}>
              <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none">
                <path d="M12 36 L36 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 36 L18 30 M36 12 L30 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="24" cy="24" r="2" fill="currentColor"/>
              </svg>
              <h3 className={styles.featureTitle}>Precision Tools</h3>
              <p className={styles.featureDesc}>
                Accurate measurements and dimensions for professional results
              </p>
            </div>

            <div className={styles.featureCard}>
              <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none">
                <path d="M24 12 L24 28 M18 22 L24 28 L30 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 36 L34 36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <h3 className={styles.featureTitle}>DXF Export</h3>
              <p className={styles.featureDesc}>
                Export your designs in DXF format for manufacturing
              </p>
            </div>

            <div className={styles.featureCard}>
              <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none">
                <path d="M36 18 A12 12 0 1 1 24 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M36 18 L36 12 L30 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 30 A12 12 0 1 0 24 42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 30 L12 36 L18 36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <h3 className={styles.featureTitle}>Real-time Sync</h3>
              <p className={styles.featureDesc}>
                Collaborate with your team in real-time
              </p>
            </div>

            <div className={styles.featureCard}>
              <svg className={styles.featureIcon} viewBox="0 0 48 48" fill="none">
                <path d="M18 20 L18 14 C18 11 20 9 24 9 C28 9 30 11 30 14 L30 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <rect x="12" y="20" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
                <circle cx="24" cy="28" r="2" fill="currentColor"/>
              </svg>
              <h3 className={styles.featureTitle}>Cloud Storage</h3>
              <p className={styles.featureDesc}>
                Save and access your projects from anywhere
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className={styles.demo}>
        <div className={styles.demoContent}>
          <div className={styles.demoText}>
            <h2 className={styles.demoTitle}>See it in action</h2>
            <p className={styles.demoSubtitle}>
              Watch how easy it is to create beautiful furniture designs
            </p>
            <ul className={styles.demoList}>
              <li className={styles.demoListItem}>
                <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Drag and drop furniture modules
              </li>
              <li className={styles.demoListItem}>
                <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Customize colors and materials
              </li>
              <li className={styles.demoListItem}>
                <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                View in 2D and 3D modes
              </li>
              <li className={styles.demoListItem}>
                <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Export production-ready files
              </li>
            </ul>
            <button onClick={() => navigate('/dashboard')} className={styles.demoButton}>
              Try it now
            </button>
          </div>
          <div className={styles.demoVisual}>
            <div className={styles.demoWindow}>
              <div className={styles.demoWindowHeader}>
                <div className={styles.demoWindowDots}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
              <div className={styles.demoWindowContent}>
                <video
                  className={styles.demoVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                >
                  <source src="/video/intro.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className={styles.pricing}>
        <div className={styles.pricingContent}>
          <h2 className={styles.sectionTitle}>Simple, transparent pricing</h2>
          <p className={styles.sectionSubtitle}>
            Choose the plan that's right for you
          </p>

          {/* Billing Toggle */}
          <div className={styles.billingToggle}>
            <span className={billingCycle === 'monthly' ? styles.active : ''}>Monthly</span>
            <button
              className={styles.toggleSwitch}
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              aria-label="Toggle billing cycle"
            >
              <span className={billingCycle === 'yearly' ? styles.toggleActive : ''}></span>
            </button>
            <span className={billingCycle === 'yearly' ? styles.active : ''}>
              Yearly
              <span className={styles.discount}>Save 20%</span>
            </span>
          </div>

          {/* Pricing Cards */}
          <div className={styles.pricingGrid}>
            {/* Free Plan */}
            <div className={styles.pricingCard}>
              <div className={styles.pricingHeader}>
                <h3 className={styles.planName}>Free</h3>
                <div className={styles.planPrice}>
                  <span className={styles.currency}>$</span>
                  <span className={styles.amount}>0</span>
                  <span className={styles.period}>/month</span>
                </div>
                <p className={styles.planDesc}>Perfect for trying out</p>
              </div>
              <ul className={styles.featureList}>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Up to 3 projects
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Basic 3D editor
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Standard materials
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Community support
                </li>
              </ul>
              <button onClick={() => navigate('/dashboard')} className={styles.planButton}>
                Get Started
              </button>
            </div>

            {/* Pro Plan */}
            <div className={`${styles.pricingCard} ${styles.featured}`}>
              <div className={styles.popularBadge}>Most Popular</div>
              <div className={styles.pricingHeader}>
                <h3 className={styles.planName}>Pro</h3>
                <div className={styles.planPrice}>
                  <span className={styles.currency}>$</span>
                  <span className={styles.amount}>
                    {billingCycle === 'monthly' ? '29' : '24'}
                  </span>
                  <span className={styles.period}>/month</span>
                </div>
                <p className={styles.planDesc}>For professional designers</p>
              </div>
              <ul className={styles.featureList}>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Unlimited projects
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Advanced 3D editor
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Premium materials
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  DXF export
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Priority support
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Real-time collaboration
                </li>
              </ul>
              <button onClick={() => navigate('/dashboard')} className={styles.planButtonFeatured}>
                Start Free Trial
              </button>
            </div>

            {/* Enterprise Plan */}
            <div className={styles.pricingCard}>
              <div className={styles.pricingHeader}>
                <h3 className={styles.planName}>Enterprise</h3>
                <div className={styles.planPrice}>
                  <span className={styles.currency}>$</span>
                  <span className={styles.amount}>99</span>
                  <span className={styles.period}>/month</span>
                </div>
                <p className={styles.planDesc}>For large teams</p>
              </div>
              <ul className={styles.featureList}>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Everything in Pro
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Unlimited team members
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Custom integrations
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Advanced analytics
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Dedicated support
                </li>
                <li className={styles.featureItem}>
                  <svg className={styles.checkIcon} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  SLA guarantee
                </li>
              </ul>
              <button onClick={() => navigate('/dashboard')} className={styles.planButton}>
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.cta}>
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>Ready to start designing?</h2>
          <p className={styles.ctaSubtitle}>
            Join thousands of designers creating amazing furniture layouts
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className={styles.ctaButton}
          >
            Get Started for Free
            <svg className={styles.buttonIcon} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerSection}>
            <h4 className={styles.footerTitle}>FurnitureDesigner</h4>
            <p className={styles.footerText}>
              Professional 3D furniture design tool
            </p>
          </div>
          <div className={styles.footerSection}>
            <h4 className={styles.footerTitle}>Product</h4>
            <a href="#features" className={styles.footerLink}>Features</a>
            <a href="#demo" className={styles.footerLink}>Demo</a>
            <a href="#pricing" className={styles.footerLink}>Pricing</a>
          </div>
          <div className={styles.footerSection}>
            <h4 className={styles.footerTitle}>Company</h4>
            <a href="#" className={styles.footerLink}>About</a>
            <a href="#" className={styles.footerLink}>Contact</a>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p>© 2025 Uable Corporation. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
