// src/pages/RegisterPage.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api.js';
import '../styles/components/login.css';

const RegisterPage = () => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

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
      const data = await authAPI.register(username, password, name);
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
            <span className="logo-emoji">🕵️</span>
          </div>
          <h1>גיוס סוכן חדש</h1>
          <p>הצטרף ליחידת החקירות המיוחדת</p>
          <div className="badge">NEW RECRUIT</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>שם מלא (אופציונלי)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="הזן שמך המלא"
              autoComplete="name"
            />
          </div>

          <div className="input-group">
            <label>שם קוד / סוכן</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="בחר שם קוד ייחודי"
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
              placeholder="לפחות 6 תווים"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="input-group">
            <label>אימות סיסמה</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="הזן שוב את הסיסמה"
              autoComplete="new-password"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'מעבד...' : 'צור פרופיל סוכן'}
          </button>
        </form>

        <div className="toggle-mode">
          <Link to="/" className="toggle-btn">
            כבר סוכן? התחבר למשימה
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
