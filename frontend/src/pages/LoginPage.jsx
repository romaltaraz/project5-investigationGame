// src/pages/LoginPage.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api.js';
import '../styles/components/login.css';

const LOGIN_NOTES = [
  'גישה לתיקי החקירה האישיים שלך בלבד',
  'שמירה אוטומטית של ההתקדמות והשיחות',
  'מעבר מהיר בין חדר הבריפינג, החשודים והמפקד',
];

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
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

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (resetPassword !== confirmResetPassword) {
      setError('הסיסמאות החדשות אינן תואמות');
      return;
    }

    if (resetPassword.length < 6) {
      setError('הסיסמה החדשה חייבת להיות לפחות 6 תווים');
      return;
    }

    if (!resetEmail.includes('@')) {
      setError('יש להזין כתובת מייל תקינה');
      return;
    }

    setLoading(true);

    try {
      const data = await authAPI.forgotPassword(resetEmail, resetPassword);
      setSuccess(data.message);
      setPassword('');
      setResetEmail('');
      setResetPassword('');
      setConfirmResetPassword('');
      setResetMode(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleResetMode = () => {
    setError('');
    setSuccess('');
    setResetEmail('');
    setResetPassword('');
    setConfirmResetPassword('');
    setResetMode((currentMode) => !currentMode);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-icon">
            <span className="logo-emoji">🔍</span>
          </div>
          <h1>יחידת החקירות המיוחדת</h1>
          <p>הזן את פרטיך, סוכן</p>
          <div className="badge">CLASSIFIED</div>
        </div>

        <form className="login-form" onSubmit={resetMode ? handleResetPassword : handleSubmit}>
          {resetMode ? (
            <div className="input-group">
              <label>מייל</label>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="הזן את המייל שאיתו נרשמת"
                autoComplete="email"
                required
              />
            </div>
          ) : (
            <div className="input-group">
              <label>שם סוכן / קוד זיהוי</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="הזן שם קוד"
                autoComplete="username"
                required
              />
            </div>
          )}

          {resetMode ? (
            <>
              <div className="input-group">
                <label>סיסמה חדשה</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="לפחות 6 תווים"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="input-group">
                <label>אימות סיסמה חדשה</label>
                <input
                  type="password"
                  value={confirmResetPassword}
                  onChange={(e) => setConfirmResetPassword(e.target.value)}
                  placeholder="הזן שוב את הסיסמה החדשה"
                  autoComplete="new-password"
                  required
                />
              </div>
            </>
          ) : (
            <div className="input-group">
              <label>סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'מעבד...' : resetMode ? 'אפס סיסמה' : 'התחבר לחקירה'}
          </button>
        </form>

        <div className="login-actions">
          <button type="button" className="toggle-btn toggle-btn--inline" onClick={toggleResetMode}>
            {resetMode ? 'חזרה להתחברות' : 'שכחתי סיסמה'}
          </button>
        </div>

        <div className="auth-notes">
          {LOGIN_NOTES.map((note) => (
            <p key={note} className="auth-note">
              {note}
            </p>
          ))}
        </div>

        <div className="toggle-mode">
          <Link to="/register" className="toggle-btn">
            סוכן חדש? צור פרופיל
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;