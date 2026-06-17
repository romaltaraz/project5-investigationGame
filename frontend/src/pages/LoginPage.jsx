import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api.js';
import InkReveal from '../components/InkReveal';
import '../styles/components/login.css';

const LOGIN_NOTES = [
  'גישה לתיקי החקירה האישיים שלך בלבד',
  'שמירה אוטומטית של ההתקדמות והשיחות',
  'מעבר מהיר בין חדר הבריפינג, החשודים והמפקד',
];

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const cursorRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authAPI.login(username, password);
      login(data.user, data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

        {/* Ink reveal canvas — sits above image, carves away on hover */}
        <InkReveal
          maskColor={[10, 9, 7]}
          brushSize={165}
          lifetime={900}
          rVary={0.52}
          maxStamps={220}
        />

        {/* Layers above the canvas (pointer-events:none so mouse reaches canvas) */}
        <div className="hero-vignette"   aria-hidden="true" />
        <div className="hero-scanlines"  aria-hidden="true" />
        <div className="hero-grain"      aria-hidden="true" />

        {/* CLASSIFIED stamp — top-left corner */}
        <div className="hero-stamp-wrap" aria-hidden="true">
          <span className="hero-classified">CLASSIFIED</span>
        </div>

        {/* Main atmospheric text */}
        <div className="hero-content">
          <div className="hero-meta">
            <span className="hero-unit-code">S.I.U — 2024</span>
            <span className="hero-meta-divider" />
            <span className="hero-case-count">03 תיקים פתוחים</span>
          </div>

          <h2 className="hero-title">
            <span>יחידת</span>
            <span>החקירות</span>
            <span>המיוחדת</span>
          </h2>

          <p className="hero-sub">כל תיק מחכה לחוקר הנכון</p>

          <div className="hero-case-badges">
            <span className="hero-badge-tag">תיק #001</span>
            <span className="hero-badge-tag hero-badge-active">תיק #002</span>
            <span className="hero-badge-tag">תיק #003</span>
          </div>
        </div>

        <p className="hero-hint">הזז עכבר לחשוף</p>

        {/* Custom cursor follows mouse */}
        <div ref={cursorRef} className="hero-cursor" aria-hidden="true" />
      </div>

      {/* ── FORM PANEL ── */}
      <div className="login-panel">
        <div className="login-card">

          <div className="login-header">
            <div className="logo-icon" aria-hidden="true">
              <svg
                width="26" height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <h1>כניסה לחוקרים</h1>
            <p>הזן את פרטיך, סוכן</p>
            <div className="badge">CLASSIFIED</div>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="login-username">שם סוכן / קוד זיהוי</label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="הזן שם קוד"
                autoComplete="username"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="login-password">סיסמה</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="error-message" role="alert">{error}</div>
            )}

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'מעבד...' : 'כניסה לחקירה'}
            </button>
          </form>

          <div className="auth-notes">
            {LOGIN_NOTES.map((note) => (
              <p key={note} className="auth-note">{note}</p>
            ))}
          </div>

          <div className="toggle-mode">
            <Link to="/register" className="toggle-btn">
              סוכן חדש? צור פרופיל
            </Link>
          </div>

        </div>
      </div>

    </div>
  );
};

export default LoginPage;
