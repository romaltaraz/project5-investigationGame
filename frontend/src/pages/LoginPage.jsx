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
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

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

        <form className="login-form" onSubmit={handleSubmit}>
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

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'מעבד...' : 'התחבר לחקירה'}
          </button>
        </form>

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