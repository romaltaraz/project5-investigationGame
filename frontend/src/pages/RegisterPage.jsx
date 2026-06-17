// src/pages/RegisterPage.jsx
import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api.js';
import InkReveal from '../components/InkReveal';
import '../styles/components/login.css';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80';

const REGISTER_NOTES = [
  'הסוכנות שומרת על אנונימיות מלאה — שם הקוד שלך לא ייחשף',
  'כל תיק חקירה נשמר אוטומטית בשרתי היחידה',
  'גישה לכל הרמות — מרגע ההצטרפות',
];

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const SpinnerIcon = () => (
  <svg className="btn-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

const getPasswordStrength = (pwd) => {
  if (!pwd) return null;
  if (pwd.length < 6) return { level: 1, label: 'חלשה מדי', color: '#e74c3c' };
  const score =
    (pwd.length >= 10 ? 1 : 0) +
    (/[A-Z]/.test(pwd) ? 1 : 0) +
    (/[0-9]/.test(pwd) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pwd) ? 1 : 0);
  if (score <= 1) return { level: 1, label: 'חלשה', color: '#e67e22' };
  if (score === 2) return { level: 2, label: 'בינונית', color: '#f1c40f' };
  if (score === 3) return { level: 3, label: 'חזקה', color: '#2ecc71' };
  return { level: 4, label: 'חזקה מאוד', color: '#27ae60' };
};

const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const cursorRef = useRef(null);

  const strength = getPasswordStrength(password);
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleHeroMouseMove = (e) => {
    if (!cursorRef.current || !heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    cursorRef.current.style.left = `${e.clientX - rect.left}px`;
    cursorRef.current.style.top = `${e.clientY - rect.top}px`;
    cursorRef.current.style.opacity = '1';
  };

  const handleHeroMouseLeave = () => {
    if (cursorRef.current) cursorRef.current.style.opacity = '0';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    if (password.length < 6) {
      setError('הסיסמה חייבת להיות לפחות 6 תווים');
      return;
    }

    setLoading(true);

    try {
      const data = await authAPI.register(username, email, password, name);
      login(data.user, data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">

      {/* ── HERO PANEL ── */}
      <div
        className="login-hero"
        ref={heroRef}
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
      >
        <img
          className="hero-bg"
          src={HERO_IMAGE}
          alt=""
          loading="lazy"
          draggable="false"
        />

        <InkReveal
          maskColor={[10, 9, 7]}
          brushSize={165}
          lifetime={900}
          rVary={0.52}
          maxStamps={220}
        />

        <div className="hero-vignette"  aria-hidden="true" />
        <div className="hero-scanlines" aria-hidden="true" />
        <div className="hero-grain"     aria-hidden="true" />

        <div className="hero-stamp-wrap" aria-hidden="true">
          <span className="hero-classified">NEW RECRUIT</span>
        </div>

        <div className="hero-content">
          <div className="hero-meta">
            <span className="hero-unit-code">S.I.U — INTAKE</span>
            <span className="hero-meta-divider" />
            <span className="hero-case-count">גיוס סוכנים חדשים</span>
          </div>

          <h2 className="hero-title">
            <span>הצטרף</span>
            <span>ליחידת</span>
            <span>הבלשים</span>
          </h2>

          <p className="hero-sub">כל חוקר גדול התחיל מאפס</p>

          <div className="hero-case-badges">
            <span className="hero-badge-tag">ACCESS LEVEL 0</span>
            <span className="hero-badge-tag hero-badge-active">INTAKE OPEN</span>
            <span className="hero-badge-tag">תיק ראשון</span>
          </div>
        </div>

        <p className="hero-hint">הזז עכבר לחשוף</p>
        <div ref={cursorRef} className="hero-cursor" aria-hidden="true" />
      </div>

      {/* ── FORM PANEL ── */}
      <div className="login-panel">
        <div className="login-card">

          <div className="login-header">
            <div className="logo-icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
            </div>
            <h1>גיוס סוכן חדש</h1>
            <p>הצטרף ליחידת החקירות המיוחדת</p>
            <div className="badge">NEW RECRUIT</div>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>

            <div className="input-group">
              <label htmlFor="reg-name">שם מלא (אופציונלי)</label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="הזן שמך המלא"
                autoComplete="name"
              />
            </div>

            <div className="input-group">
              <label htmlFor="reg-email">כתובת מייל</label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="reg-username">שם קוד / סוכן</label>
              <input
                id="reg-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="בחר שם קוד ייחודי"
                autoComplete="username"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="reg-password">סיסמה</label>
              <div className="password-wrapper">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="לפחות 6 תווים"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {strength && (
                <div className="password-strength">
                  <div className="password-strength__bars">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="password-strength__bar"
                        style={{
                          background: i <= strength.level ? strength.color : undefined,
                          opacity:    i <= strength.level ? 1 : 0.18,
                        }}
                      />
                    ))}
                  </div>
                  <span className="password-strength__label" style={{ color: strength.color }}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            <div className={`input-group${passwordMismatch ? ' input-group--error' : ''}`}>
              <label htmlFor="reg-confirm">אימות סיסמה</label>
              <div className="password-wrapper">
                <input
                  id="reg-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="הזן שוב את הסיסמה"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'הסתר סיסמה' : 'הצג סיסמה'}
                >
                  {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {passwordMismatch && (
                <span className="input-hint input-hint--error">הסיסמאות אינן תואמות</span>
              )}
            </div>

            {error && (
              <div className="error-message" role="alert">{error}</div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading || passwordMismatch}
            >
              {loading ? (
                <span className="login-button__inner">
                  <SpinnerIcon />
                  מעבד...
                </span>
              ) : 'צור פרופיל סוכן'}
            </button>
          </form>

          <div className="auth-notes">
            {REGISTER_NOTES.map((note) => (
              <p key={note} className="auth-note">{note}</p>
            ))}
          </div>

          <div className="toggle-mode">
            <Link to="/" className="toggle-btn">
              כבר סוכן? התחבר למשימה
            </Link>
          </div>

        </div>
      </div>

    </div>
  );
};

export default RegisterPage;
