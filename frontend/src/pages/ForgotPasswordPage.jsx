import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../services/api.js';
import '../styles/components/login.css';

const ForgotPasswordPage = () => {
  const [step, setStep] = useState('request'); // 'request' | 'verify'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const data = await authAPI.requestPasswordReset(email);
      setMessage(data.message);
      setStep('verify');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    setLoading(true);
    try {
      const data = await authAPI.confirmPasswordReset(email, code, newPassword);
      setMessage(data.message);
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-panel" style={{ width: '100%' }}>
        <div className="login-card">
          <div className="login-header">
            <h1>איפוס סיסמה</h1>
            <p>
              {step === 'request'
                ? 'הזן את כתובת המייל שלך ונשלח קוד אימות'
                : 'הזן את הקוד שקיבלת ובחר סיסמה חדשה'}
            </p>
            <div className="badge">CLASSIFIED</div>
          </div>

          {step === 'request' ? (
            <form className="login-form" onSubmit={handleRequestCode}>
              <div className="input-group">
                <label htmlFor="reset-email">כתובת מייל</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="agent@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              {error && <div className="error-message" role="alert">{error}</div>}

              <button type="submit" className="login-button" disabled={loading}>
                {loading ? 'שולח...' : 'שלח קוד אימות'}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleVerifyCode}>
              {message && <div className="auth-note">{message}</div>}

              <div className="input-group">
                <label htmlFor="reset-code">קוד אימות</label>
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="reset-new-password">סיסמה חדשה</label>
                <input
                  id="reset-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="reset-confirm-password">אימות סיסמה חדשה</label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && <div className="error-message" role="alert">{error}</div>}

              <button type="submit" className="login-button" disabled={loading}>
                {loading ? 'מעבד...' : 'אפס סיסמה'}
              </button>

              <div className="toggle-mode">
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => { setStep('request'); setMessage(''); setError(''); }}
                >
                  לא קיבלת קוד? שלח שוב
                </button>
              </div>
            </form>
          )}

          <div className="toggle-mode">
            <Link to="/" className="toggle-btn">
              חזרה לכניסה
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
