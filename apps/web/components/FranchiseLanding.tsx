'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, saveSession, type Session } from '../lib/api';

interface WorkspaceMembership {
  membershipId: string;
  tenantId: string;
  tenantName: string;
}

const benefits = [
  ['01', 'Centralized lead generation', 'Receive customer inquiries through one unified platform and focus on converting the right opportunities.'],
  ['02', 'Complete operational support', 'Get assistance with business operations, workflows and service delivery as you grow.'],
  ['03', 'Technology-powered platform', 'Manage leads, projects, teams, finances and performance from one place.'],
  ['04', 'Training and business development', 'Build confidence with structured onboarding, practical guidance and continuous learning.'],
  ['05', 'Marketing and brand support', 'Grow your local presence with centralized campaigns and promotional initiatives.'],
  ['06', 'Dedicated partner success team', 'Work with people who help resolve challenges and support your next stage.'],
];

const faqs = [
  ['Who can apply for a Ricoz franchise?', 'Entrepreneurs, business owners and professionals looking to start or expand a service-based business can apply. Prior industry experience is helpful, but not mandatory.'],
  ['What support does Ricoz provide?', 'Partners get operational guidance, training, technology, marketing resources and access to a dedicated partner success team.'],
  ['Is training provided before launch?', 'Yes. The onboarding process includes structured training and practical guidance to help you prepare for launch.'],
  ['How do customer leads reach franchise partners?', 'Customer inquiries are managed through the Ricoz platform and routed to the right service team or territory.'],
  ['Can I operate multiple service categories?', 'Available categories depend on your territory and partner plan. The team can review suitable options with you.'],
  ['How long does onboarding take?', 'Timing depends on your territory, service categories and readiness. A partner advisor can walk you through the expected steps.'],
];

function DashboardPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`fr-device ${compact ? 'fr-device-compact' : ''}`} aria-label="Ricoz partner dashboard preview">
      <div className="fr-window-bar" aria-hidden="true"><i /><i /><i /></div>
      <div className="fr-dashboard">
        <aside className="fr-dashboard-nav">
          <div className="fr-dashboard-brand"><b>R</b><span><strong>RICOZ</strong><small>Franchise Portal</small></span></div>
          <span className="fr-territory">Mumbai West</span>
          <span className="fr-dashboard-active">Dashboard</span>
          <small>OPERATIONS</small><span>Request Queue</span><span>Assignment Center</span><span>Live Jobs</span><span>Workforce</span><span>Finance</span>
        </aside>
        <div className="fr-dashboard-main">
          <div className="fr-dashboard-user"><span>Search...</span><b>AK</b><small>Amit Kumar<br />Franchise Admin</small></div>
          <div className="fr-dashboard-title"><strong>Dashboard</strong><span>Welcome back, Amit! Here&apos;s your operations overview</span></div>
          <div className="fr-kpis">
            <div><b>₹7,82,500</b><span>Monthly revenue</span><small>+24% from last month</small></div>
            <div><b>156</b><span>Tickets resolved</span><small>87.2% resolution rate</small></div>
            <div><b>23</b><span>Open tickets</span><small>5 critical</small></div>
            <div><b>94.5%</b><span>SLA compliance</span><small>Avg. response: 48 min</small></div>
          </div>
          <div className="fr-dashboard-bottom">
            <div><strong>Active work by category</strong><p><span>34<br />IT support</span><span>18<br />Network</span><span>12<br />Cloud</span><span>8<br />Security</span></p></div>
            <div><strong>Recent tickets</strong><p>Server maintenance <em>In progress</em></p><p>VPN setup <em>Completed</em></p><p>Data recovery <em>Pending</em></p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FranchiseLanding() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [newsletterMessage, setNewsletterMessage] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [pendingSession, setPendingSession] = useState<Session | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  useEffect(() => {
    setDarkMode(window.localStorage.getItem('ricoz-theme') === 'dark');
  }, []);

  useEffect(() => {
    if (!contactOpen && !loginOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContactOpen(false);
        setLoginOpen(false);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contactOpen, loginOpen]);

  function openContact() {
    setSubmitted(false);
    setLoginOpen(false);
    setContactOpen(true);
  }

  function openLogin() {
    setLoginError(null);
    setPendingSession(null);
    setMemberships([]);
    setLoginOpen(true);
  }

  function closeLogin() {
    setLoginOpen(false);
    setLoginPassword('');
    setLoginError(null);
    setPendingSession(null);
  }

  function toggleTheme() {
    setDarkMode((current) => {
      const next = !current;
      window.localStorage.setItem('ricoz-theme', next ? 'dark' : 'light');
      return next;
    });
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);

    if (pendingSession) {
      if (!selectedTenantId) {
        setLoginError('Choose a workspace to continue.');
        return;
      }
      saveSession({ ...pendingSession, tenantId: selectedTenantId });
      router.push('/admin/dashboard');
      return;
    }

    setLoginLoading(true);
    try {
      const result = await api<{
        accessToken: string;
        refreshToken?: string;
        user?: { email?: string };
      }>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        session: null,
      });
      const session: Session = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tenantId: '',
        email: result.user?.email ?? loginEmail,
        role: 'teacher',
      };
      const activeMemberships = await api<WorkspaceMembership[]>('/v1/me/memberships', {
        method: 'GET',
        session,
      });

      if (activeMemberships.length === 0) {
        throw new Error('This account has no active workspace. Contact your administrator.');
      }
      if (activeMemberships.length === 1) {
        saveSession({ ...session, tenantId: activeMemberships[0].tenantId });
        router.push('/admin/dashboard');
        return;
      }
      setPendingSession(session);
      setMemberships(activeMemberships);
      setSelectedTenantId(activeMemberships[0].tenantId);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoginLoading(false);
    }
  }

  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  function submitNewsletter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewsletterMessage('Newsletter signup is not connected in this preview.');
  }

  return (
    <div className="franchise-site" data-theme={darkMode ? 'dark' : 'light'}>
      <header className="fr-header">
        <div className="fr-header-inner">
          <Link className="fr-brand" href="/" aria-label="Ricoz home"><span className="fr-brand-mark">rZ</span><span>Ricoz</span></Link>
          <nav className="fr-nav" aria-label="Main navigation">
            <button className="fr-button fr-light" type="button" onClick={openContact}>Get in Touch</button>
            <button className="fr-button fr-red" type="button" onClick={openContact}>Become a Franchise Partner</button>
            <span className="fr-nav-divider" aria-hidden="true" />
            <button className="fr-button fr-outline" type="button" onClick={openLogin}>Franchise Login</button>
          </nav>
          <button className="fr-theme-toggle" type="button" onClick={toggleTheme} aria-pressed={darkMode} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
            {darkMode ? 'Light mode' : 'Dark mode'}
          </button>
          <details className="fr-mobile-nav">
            <summary aria-label="Open navigation"><span /><span /><span /></summary>
            <nav aria-label="Mobile navigation"><a href="#why">Why Ricoz</a><a href="#platform">Platform</a><a href="#faq">FAQs</a><button type="button" onClick={openContact}>Get in Touch</button><button type="button" onClick={openLogin}>Franchise Login</button></nav>
          </details>
        </div>
      </header>

      <div className="fr-main">
        <section className="fr-hero">
          <div className="fr-eyebrow">India&apos;s next generation franchise ecosystem</div>
          <h1>Building a business shouldn&apos;t mean starting alone. <span>Join ours.</span></h1>
          <p>Build your business with the backing of a complete ecosystem. From technology and operations to training, marketing and ongoing support, <strong>Ricoz</strong> helps you focus on growth while we simplify the journey.</p>
          <div className="fr-actions"><button className="fr-button fr-light" type="button" onClick={openContact}>Get in Touch</button><button className="fr-button fr-red" type="button" onClick={openContact}>Become a Franchise Partner</button></div>
          <div className="fr-hero-device"><DashboardPreview /></div>
        </section>

        <section className="fr-stats" aria-label="Ricoz at a glance">
          <p>Join a franchise ecosystem built to help entrepreneurs succeed at every stage of their journey.</p>
          <div><div><b>20+</b><span>Business Categories</span></div><div><b>100%</b><span>Operational Support</span></div><div><b>Dedicated</b><span>Partner Success Team</span></div><div><b>Pan India</b><span>Expansion Vision</span></div></div>
        </section>

        <section className="fr-section" id="why">
          <header className="fr-section-heading"><span className="fr-kicker">Why Ricoz</span><h2>Everything you need to build a successful franchise business</h2><p>Launch, manage and grow with a complete ecosystem designed for modern entrepreneurs.</p></header>
          <div className="fr-benefits">{benefits.map(([number, title, text]) => <article className="fr-benefit" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="fr-quote"><blockquote>&ldquo;The right support can change everything. Ricoz gave us the foundation to build and grow with confidence.&rdquo;</blockquote><div><span>RN</span><b>Franchise Partner</b><small>Ricoz Network</small></div></section>

        <section className="fr-section fr-platform" id="platform">
          <header className="fr-section-heading"><span className="fr-kicker">Franchise platform</span><h2>One platform. Complete franchise management.</h2><p>Manage leads, projects, finances, operations and performance from one connected dashboard.</p></header>
          <div className="fr-platform-preview"><div className="fr-phone"><b>Dashboard</b><small>Welcome back, Amit</small><span>Monthly revenue<strong>₹7,82,500</strong></span><span>Tickets resolved<strong>156</strong></span><span>Open tickets<strong>23</strong></span></div><DashboardPreview compact /></div>
          <div className="fr-platform-benefits"><article><span>01</span><h3>Lead and opportunity management</h3><p>Track inquiries and move the right opportunities forward.</p></article><article><span>02</span><h3>Operations and project control</h3><p>Organize teams, assignments and progress across every stage.</p></article><article><span>03</span><h3>Performance and business insights</h3><p>Use live reports and analytics to plan sustainable growth.</p></article></div>
        </section>

        <section className="fr-section fr-faq" id="faq">
          <header className="fr-section-heading"><h2>Frequently asked questions</h2><p>Everything you need to know about becoming a Ricoz franchise partner.</p></header>
          <div className="fr-faq-list">{faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
          <div className="fr-question-cta"><span>R</span><h3>Still have questions?</h3><p>Our franchise team can help you understand the opportunity, investment requirements and growth potential.</p><button className="fr-button fr-red" type="button" onClick={openContact}>Speak with our team</button></div>
        </section>

        <section className="fr-growth">
          <div><span className="fr-kicker">Grow with confidence</span><h2>Build a business backed by experience, technology and support</h2><p>Join a franchise ecosystem designed to help entrepreneurs launch faster, operate smarter and grow sustainably.</p><div className="fr-growth-stats"><div><b>20+</b><span>Business categories</span></div><div><b>100%</b><span>Operational support</span></div><div><b>Pan India</b><span>Expansion vision</span></div><div><b>Dedicated</b><span>Partner success team</span></div></div></div>
          <Image className="fr-growth-image" src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85" alt="Bright collaborative workspace with a shared planning table" width={1400} height={1050} unoptimized />
        </section>

        <section className="fr-final-cta" id="partner"><span className="fr-kicker">Your next chapter starts here</span><h2>Build your business with Ricoz</h2><p>Apply today and discover how technology, training and operational support can help you grow.</p><div className="fr-actions"><button className="fr-button fr-light" type="button" onClick={openContact}>Schedule a Consultation</button><button className="fr-button fr-red" type="button" onClick={openContact}>Become a Franchise Partner</button></div></section>
      </div>

      {loginOpen && <div className="fr-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeLogin(); }}><section className="fr-modal fr-login-modal" role="dialog" aria-modal="true" aria-labelledby="fr-login-title"><button className="fr-modal-close" type="button" aria-label="Close login" onClick={closeLogin}>×</button><h2 id="fr-login-title">Login to the <span>Ricoz Franchise Portal</span></h2>{pendingSession ? <form className="fr-login-form" onSubmit={submitLogin}><label>Workspace<select value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)} required>{memberships.map((membership) => <option key={membership.membershipId} value={membership.tenantId}>{membership.tenantName}</option>)}</select></label><button className="fr-button fr-red fr-submit" type="submit">Continue</button></form> : <form className="fr-login-form" onSubmit={submitLogin}><label>Email Address<input autoFocus name="email" type="email" autoComplete="username" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="Enter your franchise admin email address" /></label><label>Password<input name="password" type="password" autoComplete="current-password" minLength={12} required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Enter your password" /></label><button className="fr-button fr-red fr-submit" type="submit" disabled={loginLoading}>{loginLoading ? 'Signing in…' : 'Login'}</button></form>}{loginError && <p className="fr-login-error" role="alert">{loginError}</p>}<p className="fr-register-line">Don&apos;t have an account? <button type="button" onClick={openContact}>Register here</button></p></section></div>}

      <footer className="fr-footer" id="contact">
        <div className="fr-footer-main"><div><Link className="fr-brand fr-footer-brand" href="/"><span className="fr-brand-mark">rZ</span><span>Ricoz</span></Link><p>Empowering entrepreneurs with technology, operational support and business opportunities through a modern franchise ecosystem.</p><button type="button" onClick={openContact}>Talk with our team ↗</button></div><nav aria-label="Footer"><div><b>Franchise</b><a href="#partner">Become a partner</a><a href="#why">Business models</a><a href="#platform">Franchise platform</a><a href="#faq">FAQs</a></div><div><b>Explore</b><a href="#why">About Ricoz</a><button type="button" onClick={openContact}>Contact us</button><a href="#platform">Partner support</a></div><div><b>Information</b><a href="#contact">Privacy policy</a><a href="#contact">Terms and conditions</a><a href="#contact">Franchise agreement</a></div></nav></div>
        <div className="fr-newsletter"><h3>Stay updated</h3><p>Get franchise updates, business insights and growth opportunities.</p><form onSubmit={submitNewsletter}><label className="fr-sr-only" htmlFor="fr-newsletter-email">Email address</label><input id="fr-newsletter-email" type="email" placeholder="Enter your email" required /><button type="submit">Subscribe</button></form>{newsletterMessage && <small role="status">{newsletterMessage}</small>}</div>
        <div className="fr-footer-bottom"><span>Our presence: Mumbai · Delhi · Kolkata · Nagpur</span><span>© 2026 Ricoz. All rights reserved.</span></div>
      </footer>

      {contactOpen && <div className="fr-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setContactOpen(false); }}><section className="fr-modal" role="dialog" aria-modal="true" aria-labelledby="fr-modal-title"><button className="fr-modal-close" type="button" aria-label="Close enquiry form" onClick={() => setContactOpen(false)}>×</button>{submitted ? <div className="fr-modal-success"><span>R</span><h2 id="fr-modal-title">Thanks for your interest</h2><p>This preview does not send enquiries yet. Connect a lead service to receive submissions.</p><button className="fr-button fr-red" type="button" onClick={() => setContactOpen(false)}>Close</button></div> : <><h2 id="fr-modal-title">Let&apos;s talk about your <span>business goals</span></h2><p className="fr-modal-intro">Tell us a little about yourself and our franchise team can help you explore the opportunity.</p><form className="fr-contact-form" onSubmit={submitContact}><label>Full name *<input name="name" autoComplete="name" required placeholder="Full name" /></label><label>Mobile number *<input name="mobile" autoComplete="tel" type="tel" required placeholder="Mobile number" /></label><label>Email address *<input name="email" autoComplete="email" type="email" required placeholder="Enter your email address" /></label><label>Occupation *<select name="occupation" defaultValue="" required><option value="" disabled>Select</option><option>Business owner</option><option>Entrepreneur</option><option>Working professional</option><option>Other</option></select></label><div className="fr-form-row"><label>City *<input name="city" autoComplete="address-level2" required placeholder="Enter your city" /></label><label>State *<input name="state" autoComplete="address-level1" required placeholder="Enter your state" /></label></div><label>Additional message<textarea name="message" rows={3} placeholder="Any special query" /></label><button className="fr-button fr-red fr-submit" type="submit">Request a conversation</button></form></>}</section></div>}
    </div>
  );
}