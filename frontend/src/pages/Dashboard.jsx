import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCaseStream } from '../context/CaseStreamContext';
import { casesAPI } from '../services/api.js';
import '../styles/components/dashboard.css';
import DashboardMapHero from '../components/DashboardMapHero';
import InvestigationLoader from '../components/InvestigationLoader';

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
  generating: 'בהכנה',
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

  // התיקים מגיעים מפיד ה-SSE (CaseStreamProvider) - נשארים מסונכרנים עם MongoDB
  // בזמן אמת, כולל שינויים שנעשו ישירות ב-Compass. אין כאן יותר fetch/polling.
  const { cases, connected, ready } = useCaseStream();

  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [difficulty, setDifficulty] = useState('medium');
  const [commanderPersonality, setCommanderPersonality] = useState('mentor');
  const [generating, setGenerating] = useState(false);

  // תיק בסטטוס 'generating' תופס סלוט (כמו 'active') אבל אינו ניתן למשחק עדיין,
  // ולכן מוצג בנפרד עם תמונת הטעינה, לא כתיק פעיל וגם לא כתיק סגור/ארכיון.
  const activeCases = cases.filter((item) => item.status === 'active');
  const generatingCases = cases.filter((item) => item.status === 'generating');
  const occupiedSlots = cases.filter((item) => item.status === 'active' || item.status === 'generating').length;
  const closedCases = cases.filter((item) => item.status === 'solved' || item.status === 'failed').slice(0, 4);
  const openSlots = Math.max(0, 3 - occupiedSlots);

  const handleUnauthorized = () => {
    logout();
    navigate('/');
  };

  const createNewCase = async () => {
    if (openSlots === 0) {
      setShowModal(false);
      return;
    }
    setGenerating(true);
    setError('');
    try {
      // חוזר מיד עם התיק במצב 'generating'. מעבר לתדריך שמציג את תמונת הטעינה
      // ומחליף אותה לבד ברגע שהסטטוס הופך ל-'active' (דרך פיד ה-SSE).
      const result = await casesAPI.generate(difficulty, commanderPersonality);
      setShowModal(false);
      navigate(`/briefing/${result.case.id}`);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleUnauthorized();
        return;
      }
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const retryFailedCase = async (caseId) => {
    setError('');
    try {
      await casesAPI.remove(caseId);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleUnauthorized();
        return;
      }
      setError(err.message);
      return;
    }
    setShowModal(true);
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
          <span className={`sync-pill ${connected ? 'is-live' : 'is-offline'}`}>
            {connected ? 'סנכרון חי' : 'מתחבר מחדש…'}
          </span>
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

      <div className="dashboard-body">
      <DashboardMapHero
        activeCases={activeCases.length}
        solvedCases={cases.filter((item) => item.status === 'solved').length}
        openSlots={openSlots}
      />

      {error && <div className="dashboard-error">{error}</div>}

      {showModal && (
        <div className="modal-overlay" onClick={() => !generating && setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {generating ? (
              <InvestigationLoader label="בונה תיק חקירה חדש..." />
            ) : (
              <>
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
                    צור תיק חדש
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="section-head">
        <h2>תיקים פעילים ({activeCases.length})</h2>
        <p>{openSlots > 0 ? `אפשר לפתוח עוד ${openSlots} תיקים.` : 'כדי לפתוח תיק חדש צריך לסגור תיק קיים.'}</p>
      </div>

      {generatingCases.length > 0 && (
        <div className="cases-grid">
          {generatingCases.map((item) => (
            <div key={getCaseId(item)} className="case-card case-card--generating">
              <div className="case-card__top">
                <span className="case-status status-generating">{STATUS_LABELS.generating}</span>
                <span className="case-difficulty">{DIFFICULTY_LABELS[item.difficulty] || item.difficulty}</span>
              </div>
              <InvestigationLoader label="בונה את תיק החקירה… זה יכול לקחת כמה דקות." />
              <p className="case-brief">התיק ייפתח אוטומטית ברגע שהיצירה תסתיים. אפשר להמתין כאן או להיכנס לתדריך.</p>
              <button className="case-link-btn" onClick={() => navigate(`/briefing/${getCaseId(item)}`)}>
                מעבר לתדריך
              </button>
            </div>
          ))}
        </div>
      )}

      {!ready ? (
        <InvestigationLoader label="טוען תיקים..." />
      ) : activeCases.length === 0 ? (
        generatingCases.length === 0 && (
          <div className="empty-state">
            <p>אין תיקים פעילים</p>
            <p>פתח תיק חדש כדי להתחיל חקירה</p>
          </div>
        )
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
                {item.status === 'failed' && (
                  <button className="case-link-btn" onClick={() => retryFailedCase(getCaseId(item))}>
                    נסה שוב
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
