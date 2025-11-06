import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import styles from './LandingPage.module.css';

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className={styles.container}>
      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🪑</span>
            <span className={styles.logoText}>FurnitureDesigner</span>
          </div>
          <div className={styles.navLinks}>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#demo" className={styles.navLink}>Demo</a>
            <a href="#pricing" className={styles.navLink}>Pricing</a>
            <button onClick={() => navigate('/auth')} className={styles.navButton}>
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div
          className={styles.heroBackground}
          style={{ transform: `translateY(${scrollY * 0.5}px)` }}
        />
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>
            Design Your Perfect
            <span className={styles.heroTitleGradient}> Furniture Space</span>
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
              onClick={() => navigate('/viewer/demo')}
              className={styles.secondaryButton}
            >
              View Demo
            </button>
          </div>

          {/* Trusted By Section */}
          <div className={styles.trustedBy}>
            <p className={styles.trustedByText}>Trusted by professionals</p>
            <div className={styles.trustedByLogos}>
              <div className={styles.trustLogo}>🏢</div>
              <div className={styles.trustLogo}>🏭</div>
              <div className={styles.trustLogo}>🏗️</div>
              <div className={styles.trustLogo}>🏪</div>
            </div>
          </div>
        </div>

        {/* 3D Floating Elements */}
        <div className={styles.floatingElements}>
          <div className={styles.floatingCard} style={{ animationDelay: '0s' }}>
            <div className={styles.cardIcon}>📐</div>
            <div className={styles.cardText}>Real-time 3D</div>
          </div>
          <div className={styles.floatingCard} style={{ animationDelay: '0.5s' }}>
            <div className={styles.cardIcon}>🎨</div>
            <div className={styles.cardText}>Custom Colors</div>
          </div>
          <div className={styles.floatingCard} style={{ animationDelay: '1s' }}>
            <div className={styles.cardIcon}>📏</div>
            <div className={styles.cardText}>Precise Measurements</div>
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
              <div className={styles.featureIcon}>🎯</div>
              <h3 className={styles.featureTitle}>3D Real-time Editor</h3>
              <p className={styles.featureDesc}>
                Design and visualize your furniture in stunning 3D with instant updates
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🎨</div>
              <h3 className={styles.featureTitle}>Material Library</h3>
              <p className={styles.featureDesc}>
                Choose from hundreds of materials, colors, and textures
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📐</div>
              <h3 className={styles.featureTitle}>Precision Tools</h3>
              <p className={styles.featureDesc}>
                Accurate measurements and dimensions for professional results
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📥</div>
              <h3 className={styles.featureTitle}>DXF Export</h3>
              <p className={styles.featureDesc}>
                Export your designs in DXF format for manufacturing
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🔄</div>
              <h3 className={styles.featureTitle}>Real-time Sync</h3>
              <p className={styles.featureDesc}>
                Collaborate with your team in real-time
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>💾</div>
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
                <div className={styles.demoPreview}>🛋️</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="pricing" className={styles.cta}>
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
          <p>© 2025 FurnitureDesigner. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
