import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BASE_URL, casesAPI } from '../services/api.js';
import '../styles/components/briefing.css';

const SuspectPortrait = ({ name = '', size = 52 }) => {
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const v    = hash % 4;
  const hue  = (hash * 47) % 360;
  const silhouettes = [
    `<circle cx="24" cy="18" r="9" fill="rgba(255,220,150,.18)"/>
     <path d="M 6 52 Q 6 34 24 34 Q 42 34 42 52 Z" fill="rgba(255,220,150,.18)"/>`,
    `<polygon points="24,9 33,22 24,28 15,22" fill="rgba(255,220,150,.18)"/>
     <path d="M 8 52 Q 8 34 24 34 Q 40 34 40 52 Z" fill="rgba(255,220,150,.18)"/>`,
    `<ellipse cx="24" cy="19" rx="11" ry="9" fill="rgba(255,220,150,.18)"/>
     <path d="M 4 52 Q 4 34 24 34 Q 44 34 44 52 Z" fill="rgba(255,220,150,.18)"/>`,
    `<ellipse cx="24" cy="18" rx="7" ry="10" fill="rgba(255,220,150,.18)"/>
     <path d="M 10 52 Q 10 34 24 34 Q 38 34 38 52 Z" fill="rgba(255,220,150,.18)"/>`,
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 48 52" fill="none" xmlns="http://www.w3.org/2000/svg"
         style={{ display:'block', flexShrink:0, borderRadius:8 }}>
      <rect width="48" height="52" fill={`hsl(${hue},15%,8%)`}/>
      {[...Array(26)].map((_,i) => (
        <line key={i} x1="0" y1={i*2} x2="48" y2={i*2} stroke="rgba(0,0,0,.35)" strokeWidth="1"/>
      ))}
      <g dangerouslySetInnerHTML={{ __html: silhouettes[v] }}/>
      <rect width="48" height="52" fill="rgba(212,175,55,.04)"/>
      <path d="M2 2 L2 8 M2 2 L8 2"     stroke="rgba(212,175,55,.5)" strokeWidth="1" fill="none"/>
      <path d="M46 2 L40 2 M46 2 L46 8" stroke="rgba(212,175,55,.5)" strokeWidth="1" fill="none"/>
      <path d="M2 50 L2 44 M2 50 L8 50" stroke="rgba(212,175,55,.5)" strokeWidth="1" fill="none"/>
      <path d="M46 50 L40 50 M46 50 L46 44" stroke="rgba(212,175,55,.5)" strokeWidth="1" fill="none"/>
      <text x="24" y="47" textAnchor="middle" fontFamily="monospace" fontSize="5" fill="rgba(212,175,55,.4)">
        #{(hash % 9000 + 1000)}
      </text>
    </svg>
  );
};

const DIFFICULTY_LABELS = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
};

const COMMANDER_LABELS = {
  mentor: 'מפקד מנטורי',
  cold: 'מפקד קר ומדויק',
  aggressive: 'מפקד לוחץ',
};

const EVIDENCE_LABELS = {
  document: 'מסמך מבצעי',
  message: 'הודעה שנאספה',
  photo: 'צילום זירה',
  recording: 'הקלטת שמע',
};

const INVOLVEMENT_LABELS = {
  suspect: 'חשוד/ה',
  witness: 'עד/ת ראייה',
};

const getInvolvementType = (person = {}) => {
  if (person.involvementType === 'suspect' || person.involvementType === 'witness') {
    return person.involvementType;
  }

  return /עד/.test(person.role || '') ? 'witness' : 'suspect';
};

const resolveEvidenceAssetUrl = (item = {}) => {
  if (!item?.fileUrl) {
    return '';
  }

  return /^https?:\/\//i.test(item.fileUrl) ? item.fileUrl : `${BASE_URL}${item.fileUrl}`;
};

const getEvidenceViewerType = (item = {}) => {
  const mimeType = item.mimeType || '';

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  if (mimeType.includes('html') || mimeType.includes('pdf')) {
    return 'document';
  }

  return 'text';
};

const renderEvidenceCardPreview = (item = {}) => {
  const assetUrl = resolveEvidenceAssetUrl(item);

  if (!assetUrl) {
    return <small className="briefing-evidence__hint">אין קובץ זמין עדיין. מוצג תיאור טקסטואלי בלבד.</small>;
  }

  if (getEvidenceViewerType(item) === 'image') {
    return <img className="briefing-evidence__media" src={assetUrl} alt={item.description || 'ראיית זירה'} loading="lazy" />;
  }

  if (getEvidenceViewerType(item) === 'audio') {
    return <div className="briefing-evidence__hint">לחץ לפתיחת נגן ההקלטה</div>;
  }

  return <div className="briefing-evidence__hint">לחץ לצפייה בראיה המלאה</div>;
};

const buildFallbackBriefingDetails = (caseDoc) => ({
  incidentTime: 'לא נמסר עדיין',
  incidentLocation: caseDoc.caseName,
  incidentSummary: caseDoc.commanderBrief,
  anomaly: 'יש פער בין מה שנראה על פני השטח לבין האופן שבו המעורבים מתארים את מה שקרה.',
  knownFacts: [
    `יש כרגע ${(caseDoc.suspects || []).length} מעורבים מרכזיים לבחינה.`,
    `כבר נאספו ${(caseDoc.evidence || []).length} פריטי חומר ראשוניים.`,
    'השלב הראשון הוא לייצב ציר זמן ולבדוק מי משנה את הסיפור שלו כשנכנסים לפרטים.',
  ],
  openingQuestions: [
    'מי מספק גרסה מלוטשת מדי לעומת שאר המעורבים?',
    'איזו ראיה נראית שולית אבל עשויה לשבור את ציר הזמן?',
    'מי מנסה להקטין קשר עם דמות אחרת למרות שיש סימנים שהיה ביניהם יותר מזה?',
  ],
});

export default function BriefingPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [caseDoc, setCaseDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typedBrief, setTypedBrief] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  const briefingDetails = useMemo(
    () => caseDoc?.briefingDetails || (caseDoc ? buildFallbackBriefingDetails(caseDoc) : null),
    [caseDoc],
  );

  useEffect(() => {
    if (!caseId) {
      setLoading(false);
      setError('מזהה תיק חסר. חזרי לחדר המבצעים ובחרי תיק תקין.');
      return;
    }

    fetchCase();
  }, [caseId]);

  useEffect(() => {
    if (!caseDoc?.commanderBrief) {
      setTypedBrief('');
      return undefined;
    }

    setTypedBrief('');
    let index = 0;
    const fullText = caseDoc.commanderBrief;
    const timer = window.setInterval(() => {
      index += 1;
      setTypedBrief(fullText.slice(0, index));

      if (index >= fullText.length) {
        window.clearInterval(timer);
      }
    }, 24);

    return () => window.clearInterval(timer);
  }, [caseDoc?.commanderBrief]);

  useEffect(() => {
    if (!selectedEvidence) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedEvidence(null);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedEvidence]);

  const handleUnauthorized = () => {
    logout();
    navigate('/');
  };

  const fetchCase = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await casesAPI.getById(caseId);
      setCaseDoc(data.case);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleUnauthorized();
        return;
      }

      setError(err.message || 'לא הצלחנו לטעון את פרטי התיק.');
    } finally {
      setLoading(false);
    }
  };

  const enterInvestigation = (selectedSuspectName = '') => {
    navigate(`/game/${caseId}`, {
      state: selectedSuspectName ? { selectedSuspectName } : null,
    });
  };

  const openEvidenceViewer = (item, index) => {
    setSelectedEvidence({ ...item, viewerIndex: index });
  };

  const closeEvidenceViewer = () => {
    setSelectedEvidence(null);
  };

  const renderEvidenceViewerContent = (item = {}) => {
    const assetUrl = resolveEvidenceAssetUrl(item);
    const viewerType = getEvidenceViewerType(item);

    if (!assetUrl) {
      return (
        <div className="briefing-viewer__fallback">
          <p>לראיה הזו עדיין אין קובץ אמיתי, לכן מוצג התיאור הטקסטואלי שנשמר בתיק.</p>
          <p>{item.description}</p>
        </div>
      );
    }

    if (viewerType === 'image') {
      return <img className="briefing-viewer__image" src={assetUrl} alt={item.description || 'ראיית זירה'} />;
    }

    if (viewerType === 'audio') {
      return <audio className="briefing-viewer__audio" controls autoPlay preload="metadata" src={assetUrl} />;
    }

    if (viewerType === 'document') {
      return <iframe className="briefing-viewer__frame" src={assetUrl} title={item.description || 'קובץ ראיה'} />;
    }

    return (
      <div className="briefing-viewer__fallback">
        <p>{item.description}</p>
        <a className="briefing-evidence__link" href={assetUrl} target="_blank" rel="noreferrer">פתח קובץ ראיה</a>
      </div>
    );
  };

  if (loading) {
    return <div className="briefing-shell briefing-shell--state">טוען תדרוך מפקד...</div>;
  }

  if (error || !caseDoc) {
    return <div className="briefing-shell briefing-shell--state">{error || 'התיק לא נמצא.'}</div>;
  }

  return (
    <div className={`briefing-shell ${selectedEvidence ? 'briefing-shell--viewer-open' : ''}`}>
      <header className="briefing-hero">
        <button className="briefing-back" onClick={() => navigate('/dashboard')}>חזור לחדר המבצעים</button>

        <div className="briefing-hero__content">
          <div className="briefing-hero__meta">
            <span>{DIFFICULTY_LABELS[caseDoc.difficulty] || caseDoc.difficulty}</span>
            <span>{COMMANDER_LABELS[caseDoc.commanderPersonality] || 'מפקד תיק'}</span>
            <span>{caseDoc.status === 'active' ? 'תיק פתוח' : 'תיק סגור'}</span>
          </div>

          <p className="briefing-eyebrow">תדרוך מפקד</p>
          <h1>{caseDoc.caseName}</h1>
          <p className="briefing-summary">כל מה שצריך כדי להיכנס לחקירה בלי עומס מיותר.</p>
        </div>
      </header>

      <main className="briefing-grid">
        <section className="briefing-card briefing-card--main">
          <p className="briefing-label">פקודת משימה</p>
          <h2>דברי המפקד</h2>
          <p className="briefing-quote briefing-quote--typed">{typedBrief}<span className="briefing-caret" aria-hidden="true" /></p>

          <section className="briefing-snapshot">
            <article>
              <strong>שעת אירוע</strong>
              <p>{briefingDetails?.incidentTime}</p>
            </article>
            <article>
              <strong>מיקום</strong>
              <p>{briefingDetails?.incidentLocation}</p>
            </article>
            <article>
              <strong>מה קרה</strong>
              <p>{briefingDetails?.incidentSummary}</p>
            </article>
            <article>
              <strong>מה חריג כאן</strong>
              <p>{briefingDetails?.anomaly}</p>
            </article>
          </section>

          <section className="briefing-subsection">
            <strong className="briefing-subsection__title">מה לקחת איתך לחקירה</strong>
            <div className="briefing-bullets">
              {(briefingDetails?.knownFacts || []).map((fact) => (
                <p key={fact}>{fact}</p>
              ))}
            </div>
          </section>

          <section className="briefing-subsection">
            <strong className="briefing-subsection__title">שאלות שהמפקד רוצה על השולחן</strong>
            <div className="briefing-bullets">
              {(briefingDetails?.openingQuestions || []).map((question) => (
                <p key={question}>{question}</p>
              ))}
            </div>
          </section>

          <div className="briefing-actions">
            <button className="briefing-primary" onClick={() => enterInvestigation(caseDoc.suspects?.[0]?.name || '')}>
              התחל חקירה
            </button>
            <button className="briefing-secondary" onClick={() => navigate('/dashboard')}>
              חזור לחדר המבצעים
            </button>
          </div>
        </section>

        <div className="briefing-side-column">
          <section className="briefing-card">
            <p className="briefing-label">חשודים ומעורבים</p>
            <h2>במי כדאי לפתוח</h2>

            <div className="briefing-suspects">
              {(caseDoc.suspects || []).map((suspect) => (
                <article key={suspect.name} className="briefing-suspect">
                  <div className="briefing-suspect__head">
                    <SuspectPortrait name={suspect.name} size={52}/>
                    <strong>{suspect.name}</strong>
                    <span className={`briefing-person-tag briefing-person-tag--${getInvolvementType(suspect)}`}>
                      {INVOLVEMENT_LABELS[getInvolvementType(suspect)]}
                    </span>
                  </div>
                  <p className="briefing-suspect__meta">תפקיד: {suspect.role}</p>
                  {suspect.alibi && <small>אליבי ראשוני: {suspect.alibi}</small>}
                  <button className="briefing-link" onClick={() => enterInvestigation(suspect.name)}>
                    פתח חקירה עם {suspect.name}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="briefing-card">
            <p className="briefing-label">חומר זמין</p>
            <h2>ראיות ראשוניות</h2>

            <div className="briefing-evidence">
              {(caseDoc.evidence || []).map((item, index) => (
                <article
                  key={`${item.type}-${index}`}
                  className="briefing-evidence__item briefing-evidence__item--interactive"
                  onClick={() => openEvidenceViewer(item, index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openEvidenceViewer(item, index);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <strong>{EVIDENCE_LABELS[item.type] || item.type}</strong>
                  <p>{item.description}</p>
                  {renderEvidenceCardPreview(item)}
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>

      {selectedEvidence && (
        <div className="briefing-viewer-backdrop" onClick={closeEvidenceViewer}>
          <section className="briefing-viewer" onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog">
            <div className="briefing-viewer__header">
              <div>
                <p className="briefing-label">צפייה בראיה</p>
                <h3>{EVIDENCE_LABELS[selectedEvidence.type] || selectedEvidence.type}</h3>
              </div>
              <button className="briefing-viewer__close" onClick={closeEvidenceViewer} aria-label="סגור צפייה בראיה">
                ×
              </button>
            </div>

            <p className="briefing-viewer__description">{selectedEvidence.description}</p>

            <div className="briefing-viewer__body">
              {renderEvidenceViewerContent(selectedEvidence)}
            </div>

            {selectedEvidence.assetTranscript && (
              <div className="briefing-viewer__transcript">
                <strong>תמלול נלווה</strong>
                <p>{selectedEvidence.assetTranscript}</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}