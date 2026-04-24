import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BASE_URL, casesAPI } from '../services/api.js';
import '../styles/components/briefing.css';

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
  situation: caseDoc.commanderBrief,
  stakes: 'אם לא תצליח לבודד מהר את הגרסאות החלשות, מישהו יספיק לעצב עבורך את הסיפור לפני שהאמת תתגבש.',
  locationContext: `התיק הזה מתרחש סביב ${caseDoc.caseName}, ולכן כל תנועה, זמן או קשר בין הדמויות יכולים להפוך למפתח.`,
  timelineMarks: [
    'שלב פתיחה: הצוות בשטח אסף גרסאות ראשונות ועדיין אין ציר זמן יציב.',
    'שלב ביניים: עולות סתירות ראשונות בין תנועה, שהות וקשרים אישיים.',
    'שלב חקירה: צריך לבדוק מי משחיז את הגרסה שלו רק כששואלים על דקות קריטיות.',
  ],
  fieldSignals: [
    'יש פרט בזירה שנראה קטן מדי בשביל תשומת הלב שהוא מקבל.',
    'לפחות גרסה אחת נשמעת מהוקצעת מדי ביחס ללחץ שאמור להיות בשטח.',
    'אחד המעורבים מנסה לקבע מסגרת זמן לפני שבכלל נשאל עליה לעומק.',
  ],
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
          <p className="briefing-summary">לפני הכניסה לחקירה, קבל תמונה מלאה של המקרה, הדמויות והחומרים שכבר זמינים בתיק.</p>
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

          <div className="mission-list">
            <article>
              <strong>מה ידוע כרגע</strong>
              <p>{briefingDetails?.situation}</p>
            </article>
            <article>
              <strong>למה זה דחוף</strong>
              <p>{briefingDetails?.stakes}</p>
            </article>
            <article>
              <strong>על הזירה</strong>
              <p>{briefingDetails?.locationContext}</p>
            </article>
          </div>

          <section className="briefing-subsection">
            <strong className="briefing-subsection__title">ציר זמן לפתיחה</strong>
            <div className="briefing-bullets">
              {(briefingDetails?.timelineMarks || []).map((point) => (
                <p key={point}>{point}</p>
              ))}
            </div>
          </section>

          <section className="briefing-subsection">
            <strong className="briefing-subsection__title">מה בולט כבר מהשטח</strong>
            <div className="briefing-bullets">
              {(briefingDetails?.fieldSignals || []).map((signal) => (
                <p key={signal}>{signal}</p>
              ))}
            </div>
          </section>

          <section className="briefing-subsection">
            <strong className="briefing-subsection__title">עובדות פתיחה</strong>
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
                    <strong>{suspect.name}</strong>
                    <span className={`briefing-person-tag briefing-person-tag--${getInvolvementType(suspect)}`}>
                      {INVOLVEMENT_LABELS[getInvolvementType(suspect)]}
                    </span>
                  </div>
                  <p className="briefing-suspect__meta">תפקיד: {suspect.role}</p>
                  <p>{suspect.personality}</p>
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
                  {item.assetTranscript && <small className="briefing-evidence__transcript">תמלול: {item.assetTranscript}</small>}
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