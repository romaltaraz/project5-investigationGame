import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { casesAPI } from '../services/api.js';
import '../styles/components/dashboard.css';

const DIFFICULTIES = [
  { value: 'easy', label: 'קל', desc: 'רמזים ברורים, חשודים פחות מתחמקים' },
  { value: 'medium', label: 'בינוני', desc: 'איזון טוב בין אתגר לרמזים' },
  { value: 'hard', label: 'קשה', desc: 'תשובות מעורפלות, חשודים משקרים הרבה' },
];

const PERSONALITIES = [
  { value: 'mentor', label: 'מנטור', desc: 'סבלני ומכוון' },
  { value: 'cold', label: 'קר', desc: 'תמציתי ומקצועי' },
  { value: 'aggressive', label: 'אגרסיבי', desc: 'לוחץ ודורשני' },
];

const STATUS_LABELS = {
  active: 'בחקירה',
  solved: 'נפתר',
  failed: 'נכשל',
};

const DIFFICULTY_LABELS = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
};

const formatDate = (date) => new Date(date).toLocaleDateString('he-IL');

const trimBrief = (text = '') => (text.length > 120 ? `${text.slice(0, 120).trim()}...` : text);
const getCaseId = (item = {}) => item.id || item._id || '';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [difficulty, setDifficulty] = useState('medium');
  const [commanderPersonality, setCommanderPersonality] = useState('mentor');
  const [generating, setGenerating] = useState(false);

  const activeCases = cases.filter((item) => item.status === 'active');
  const closedCases = cases.filter((item) => item.status !== 'active').slice(0, 3);
  const openSlots = Math.max(0, 3 - activeCases.length);

  useEffect(() => {
    fetchCases();
  }, []);

  const handleUnauthorized = () => {
    logout();
    navigate('/');
  };

  const fetchCases = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await casesAPI.getAll();
      setCases(data.cases || []);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleUnauthorized();
        return;
      }

      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createNewCase = async () => {
    if (openSlots === 0) {
      setShowModal(false);
      return;
    }

    setGenerating(true);
    try {
      const result = await casesAPI.generate(difficulty, commanderPersonality);
      navigate(`/briefing/${result.case.id}`);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleUnauthorized();
        return;
      }

      setError(err.message);
    } finally {
      setGenerating(false);
      setShowModal(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">חדר המבצעים</h1>
          <p className="dashboard-subtitle">ברוך הבא, סוכן {user?.name || user?.username}</p>
        </div>
        <div className="header-actions">
          <button
            onClick={() => setShowModal(true)}
            className="new-case-btn"
            disabled={openSlots === 0}
          >
            {openSlots === 0 ? 'מכסת תיקים מלאה' : '+ פתח תיק חקירה חדש'}
          </button>
          <button onClick={handleLogout} className="logout-btn">התנתק</button>
        </div>
      </div>

      <section className="dashboard-hero">
        <article className="hero-card hero-card--main">
          <span className="hero-label">תמונת מצב</span>
          <h2>המערכת מוכנה לחקירה הבאה שלך</h2>
          <p>
            כל תיק נשמר בנפרד, החשודים מגיבים לפי אישיות קבועה, והפתרון נשאר בשרת בלבד
            עד לרגע ההכרעה.
          </p>
        </article>

        <article className="hero-card hero-card--stats">
          <div className="stat-box">
            <strong>{activeCases.length}/3</strong>
            <span>תיקים פתוחים</span>
          </div>
          <div className="stat-box">
            <strong>{openSlots}</strong>
            <span>מקומות פנויים</span>
          </div>
          <div className="stat-box">
            <strong>{cases.filter((item) => item.status === 'solved').length}</strong>
            <span>תיקים שנפתרו</span>
          </div>
        </article>
      </section>

      {error && <div className="dashboard-error">{error}</div>}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>פתיחת תיק חדש</h2>
            <p className="modal-intro">ניתן לנהל עד שלושה תיקים פתוחים במקביל. בחר אופי חקירה שמתאים לך.</p>

            <p className="modal-label">רמת קושי</p>
            <div className="options-grid">
              {DIFFICULTIES.map((item) => (
                <div
                  key={item.value}
                  className={`option ${difficulty === item.value ? 'active' : ''}`}
                  onClick={() => setDifficulty(item.value)}
                >
                  <strong>{item.label}</strong>
                  <small>{item.desc}</small>
                </div>
              ))}
            </div>

            <p className="modal-label">אישיות המפקד</p>
            <div className="options-grid">
              {PERSONALITIES.map((item) => (
                <div
                  key={item.value}
                  className={`option ${commanderPersonality === item.value ? 'active' : ''}`}
                  onClick={() => setCommanderPersonality(item.value)}
                >
                  <strong>{item.label}</strong>
                  <small>{item.desc}</small>
                </div>
              ))}
            </div>

            <div className="modal-buttons">
              <button className="cancel-btn" onClick={() => setShowModal(false)}>
                ביטול
              </button>
              <button
                className="create-btn"
                onClick={createNewCase}
                disabled={generating || openSlots === 0}
              >
                {generating ? 'יוצר תיק...' : 'צור תיק חדש'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="section-head">
        <h2>תיקים פעילים ({activeCases.length})</h2>
        <p>{openSlots > 0 ? `אפשר לפתוח עוד ${openSlots} תיקים.` : 'כדי לפתוח תיק חדש צריך לסגור תיק קיים.'}</p>
      </div>

      {loading ? (
        <p className="dashboard-state">טוען תיקים...</p>
      ) : activeCases.length === 0 ? (
        <div className="empty-state">
          <p>אין תיקים פעילים</p>
          <p>פתח תיק חדש כדי להתחיל חקירה</p>
        </div>
      ) : (
        <div className="cases-grid">
          {activeCases.map((item) => (
            <div
              key={getCaseId(item)}
              className="case-card"
              onClick={() => navigate(`/briefing/${getCaseId(item)}`)}
            >
              <div className="case-card__top">
                <span className={`case-status status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
                <span className="case-difficulty">{DIFFICULTY_LABELS[item.difficulty] || item.difficulty}</span>
              </div>
              <div className="case-name">{item.caseName}</div>
              <p className="case-brief">{trimBrief(item.commanderBrief)}</p>
              <div className="case-info">
                <span>נוצר: {formatDate(item.createdAt)}</span>
                <span>מפקד: {PERSONALITIES.find((option) => option.value === item.commanderPersonality)?.label || 'מנטור'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {closedCases.length > 0 && (
        <section className="archive-section">
          <div className="section-head section-head--compact">
            <h2>תיקים אחרונים שנסגרו</h2>
            <p>תצוגה מהירה של ההכרעות האחרונות.</p>
          </div>

          <div className="archive-grid">
            {closedCases.map((item) => (
              <div key={getCaseId(item)} className="archive-card">
                <div className="archive-card__top">
                  <strong>{item.caseName}</strong>
                  <span className={`case-status status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
                </div>
                <p>{trimBrief(item.commanderBrief)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}