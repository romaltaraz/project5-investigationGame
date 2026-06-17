import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/components/navbar.css';

export default function Navbar({ onNewCase, openSlots = 0, activeCaseCount = 0 }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const initial = (user?.name || user?.username || '?')[0].toUpperCase();
  const slotsLeft = Math.max(0, openSlots);
  const isFull = slotsLeft === 0;

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`} role="navigation" aria-label="ניווט ראשי">
      {/* Gold scan line at very top */}
      <div className="navbar__topline" aria-hidden="true" />

      <div className="navbar__inner">

        {/* ── Brand (RTL: right side) ── */}
        <div className="navbar__brand">
          <div className="navbar__logo" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <div className="navbar__brand-text">
            <span className="navbar__unit">S.I.U</span>
            <span className="navbar__title">חדר המבצעים</span>
          </div>
          <div className="navbar__classified-badge" aria-label="Classified">CLS</div>
        </div>

        {/* ── Center status ticker ── */}
        <div className="navbar__center" aria-live="polite" aria-atomic="true">
          <span className="navbar__status-dot" aria-hidden="true" />
          <span className="navbar__status-text">
            {isFull
              ? 'כל המשבצות תפוסות'
              : `${activeCaseCount} ${activeCaseCount === 1 ? 'תיק פעיל' : 'תיקים פעילים'} · ${slotsLeft} מקומות פנויים`}
          </span>
        </div>

        {/* ── Actions (RTL: left side) ── */}
        <div className="navbar__actions">

          {/* New case button */}
          <button
            className="navbar__new-case"
            onClick={onNewCase}
            disabled={isFull}
            title={isFull ? 'מכסת תיקים מלאה' : 'פתח תיק חקירה חדש'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>תיק חדש</span>
          </button>

          {/* Agent menu trigger */}
          <div className="navbar__agent-wrap" ref={menuRef}>
            <button
              className={`navbar__agent ${menuOpen ? 'navbar__agent--open' : ''}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-label="תפריט סוכן"
            >
              <span className="navbar__avatar" aria-hidden="true">{initial}</span>
              <span className="navbar__agent-name">{user?.name || user?.username}</span>
              <svg
                className={`navbar__chevron ${menuOpen ? 'navbar__chevron--open' : ''}`}
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {menuOpen && (
              <div className="navbar__dropdown" role="menu">
                <div className="navbar__dropdown-header">
                  <span className="navbar__dropdown-initial" aria-hidden="true">{initial}</span>
                  <div>
                    <p className="navbar__dropdown-name">{user?.name || user?.username}</p>
                    <p className="navbar__dropdown-role">סוכן פעיל</p>
                  </div>
                </div>
                <div className="navbar__dropdown-divider" />
                <div className="navbar__dropdown-stats">
                  <div>
                    <strong>{activeCaseCount}</strong>
                    <span>תיקים פעילים</span>
                  </div>
                  <div>
                    <strong style={{ color: isFull ? '#f1a3a3' : '#88d488' }}>{slotsLeft}</strong>
                    <span>מקומות</span>
                  </div>
                </div>
                <div className="navbar__dropdown-divider" />
                <button
                  className="navbar__dropdown-item navbar__dropdown-item--logout"
                  role="menuitem"
                  onClick={handleLogout}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  התנתק
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </nav>
  );
}
