import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BASE_URL, casesAPI, investigateAPI } from '../services/api.js';
import { buildCaseNotebook } from '../utils/investigationNotebook.js';
import '../styles/components/game.css';

const TONE_LABELS = {
  neutral: 'נייטרלי',
  empathetic: 'אמפתי',
  aggressive: 'אגרסיבי',
};

const DIFFICULTY_LABELS = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
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

const renderEvidenceAsset = (item = {}) => {
  const assetUrl = resolveEvidenceAssetUrl(item);

  if (!assetUrl) {
    return null;
  }

  if ((item.mimeType || '').startsWith('image/')) {
    return <img className="evidence-card__media" src={assetUrl} alt={item.description || 'ראיית זירה'} loading="lazy" />;
  }

  if ((item.mimeType || '').startsWith('audio/')) {
    return <audio className="evidence-card__audio" controls preload="none" src={assetUrl} />;
  }

  return (
    <a className="evidence-card__link" href={assetUrl} target="_blank" rel="noreferrer">
      פתח קובץ ראיה
    </a>
  );
};

const upsertInteraction = (caseData, entityType, entityName, nextMessages) => {
  const interactions = [...(caseData.interactions || [])];
  const index = interactions.findIndex(
    (item) => item.entityType === entityType && item.entityName === entityName,
  );

  const nextInteraction = { entityType, entityName, messages: nextMessages };

  if (index >= 0) {
    interactions[index] = nextInteraction;
  } else {
    interactions.push(nextInteraction);
  }

  return { ...caseData, interactions };
};

export default function GamePage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const [caseDoc, setCaseDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedSuspectName, setSelectedSuspectName] = useState('');
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [tone, setTone] = useState('neutral');
  const [asking, setAsking] = useState(false);

  const [showConsult, setShowConsult] = useState(false);
  const [suspicion, setSuspicion] = useState('');
  const [commanderResponse, setCommanderResponse] = useState('');
  const [consulting, setConsulting] = useState(false);

  const [showSolve, setShowSolve] = useState(false);
  const [accusedName, setAccusedName] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [result, setResult] = useState(null);
  const [solving, setSolving] = useState(false);
  const [investigatorNotes, setInvestigatorNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesStatus, setNotesStatus] = useState('');

  const messagesContainerRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const selectedSuspect = caseDoc?.suspects?.find((suspect) => suspect.name === selectedSuspectName) || null;
  const commanderMessages = caseDoc?.interactions?.find((item) => item.entityType === 'commander')?.messages || [];
  const lastCommanderReply = [...commanderMessages].reverse().find((item) => item.role === 'assistant');
  const notebook = buildCaseNotebook(caseDoc, selectedSuspectName);
  const notesDirty = investigatorNotes !== (caseDoc?.investigatorNotes || '');

  const scrollMessagesToBottom = (behavior = 'auto') => {
    const container = messagesContainerRef.current;

    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  };

  useEffect(() => { fetchCase(); }, [caseId]);
  useEffect(() => {
    if (!caseId) {
      setLoading(false);
      setError('מזהה תיק חסר. חזרי לתדרוך ובחרי תיק תקין.');
    }
  }, [caseId]);
  useEffect(() => {
    if (!messagesContainerRef.current) return;

    if (shouldStickToBottomRef.current) {
      scrollMessagesToBottom(messages.length > 0 ? 'smooth' : 'auto');
    }
  }, [messages, selectedSuspectName]);

  const handleUnauthorized = () => {
    logout();
    navigate('/');
  };

  const fetchCase = async () => {
    if (!caseId) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await casesAPI.getById(caseId); // ✅ דרך api.js
      setCaseDoc(data.case);
      setInvestigatorNotes(data.case.investigatorNotes || '');
      setNotesStatus('');

      if (data.case.suspects?.length > 0) {
        const requestedSuspect = location.state?.selectedSuspectName;
        const matchedSuspect = data.case.suspects.find((suspect) => suspect.name === requestedSuspect);
        const initialSuspect = matchedSuspect || data.case.suspects[0];

        setSelectedSuspectName(initialSuspect.name);
        loadSuspectHistory(data.case, initialSuspect.name);
      }
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

  const handleSaveNotes = async () => {
    if (!caseDoc || savingNotes || !notesDirty) return;

    setSavingNotes(true);
    setNotesStatus('');

    try {
      const data = await casesAPI.updateNotes(caseId, investigatorNotes);
      setCaseDoc((currentCase) => ({
        ...currentCase,
        investigatorNotes: data.investigatorNotes,
      }));
      setInvestigatorNotes(data.investigatorNotes);
      setNotesStatus('הערות החוקר נשמרו בתיק.');
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleUnauthorized();
        return;
      }

      setNotesStatus(err.message || 'לא הצלחנו לשמור את ההערות כרגע.');
    } finally {
      setSavingNotes(false);
    }
  };

  const loadSuspectHistory = (caseData, suspectName) => {
    const interaction = caseData.interactions?.find(
      (item) => item.entityType === 'suspect' && item.entityName === suspectName,
    );
    shouldStickToBottomRef.current = true;
    setMessages(interaction?.messages || []);
  };

  const handleSelectSuspect = (suspect) => {
    shouldStickToBottomRef.current = true;
    setSelectedSuspectName(suspect.name);
    loadSuspectHistory(caseDoc, suspect.name);
    setQuestion('');
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;

    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 48;
  };

  const handleAsk = async () => {
    if (!question.trim() || !selectedSuspect || asking) return;

    const suspectName = selectedSuspect.name;
    const q = question.trim();
    const userMessage = { role: 'user', content: q };
    const pendingMessages = [...messages, userMessage];

    setQuestion('');
    setAsking(true);
    setMessages(pendingMessages);

    try {
      const data = await investigateAPI.ask(caseId, suspectName, q, tone);
      const nextMessages = [...pendingMessages, { role: 'assistant', content: data.answer }];

      setMessages(nextMessages);
      setCaseDoc((currentCase) => {
        const withHistory = upsertInteraction(currentCase, 'suspect', suspectName, nextMessages);

        return {
          ...withHistory,
          suspects: withHistory.suspects.map((suspect) => (
            suspect.name === suspectName
              ? { ...suspect, stressMeter: data.stressMeter }
              : suspect
          )),
        };
      });
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleUnauthorized();
        return;
      }

      setMessages([...pendingMessages, { role: 'assistant', content: err.message || 'שגיאה בתקשורת עם החשוד.' }]);
    } finally {
      setAsking(false);
    }
  };

  const handleConsult = async () => {
    if (!suspicion.trim() || consulting) return;

    setConsulting(true);
    setCommanderResponse('');

    try {
      const data = await investigateAPI.consult(caseId, suspicion);
      setCommanderResponse(data.response);
      setCaseDoc((currentCase) => upsertInteraction(
        currentCase,
        'commander',
        'commander',
        [...commanderMessages, { role: 'user', content: suspicion }, { role: 'assistant', content: data.response }],
      ));
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleUnauthorized();
        return;
      }

      setCommanderResponse(err.message || 'שגיאה בתקשורת עם המפקד.');
    } finally {
      setConsulting(false);
    }
  };

  const handleSolve = async () => {
    if (!accusedName.trim() || solving) return;

    setSolving(true);

    try {
      const data = await investigateAPI.solve(caseId, accusedName, reasoning);
      setResult(data);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        handleUnauthorized();
        return;
      }

      setError(err.message);
    } finally {
      setSolving(false);
    }
  };

  if (loading) return <div className="loading">טוען תיק חקירה...</div>;
  if (error && !caseDoc) return <div className="loading">{error}</div>;
  if (!caseDoc) return <div className="loading">תיק לא נמצא</div>;

  return (
    <div className="game-container">
      <div className="sidebar">
        <button className="back-btn" onClick={() => navigate(`/briefing/${caseId}`)}>← חזור לתדרוך</button>

        <div className="sidebar-brief">
          <div className="sidebar-brief__chips">
            <span className="case-chip">{DIFFICULTY_LABELS[caseDoc.difficulty] || caseDoc.difficulty}</span>
            <span className={`case-chip case-chip--status case-chip--${caseDoc.status}`}>{caseDoc.status === 'active' ? 'פתוח' : 'סגור'}</span>
          </div>
          <h2 className="case-title">{caseDoc.caseName}</h2>
          <p className="brief-text">{caseDoc.commanderBrief}</p>
        </div>

        <p className="side-label">חשודים</p>
        {caseDoc.suspects.map((suspect) => (
          <div
            key={suspect.name}
            className={`suspect-card ${selectedSuspectName === suspect.name ? 'active' : ''}`}
            onClick={() => handleSelectSuspect(suspect)}
          >
            <div className="suspect-name-row">
              <div className="suspect-name">{suspect.name}</div>
              <span className={`person-badge person-badge--${getInvolvementType(suspect)}`}>
                {INVOLVEMENT_LABELS[getInvolvementType(suspect)]}
              </span>
            </div>
            <div className="suspect-role">תפקיד: {suspect.role}</div>
            <div className="stress-bar">
              <div className="stress-fill" style={{ width: `${suspect.stressMeter || 0}%` }} />
            </div>
            <div className="stress-label">לחץ: {suspect.stressMeter || 0}%</div>
          </div>
        ))}

        <div className="evidence-panel">
          <p className="side-label">ראיות זמינות</p>
          {(caseDoc.evidence || []).map((item, index) => (
            <div key={`${item.type}-${index}`} className="evidence-card">
              <span>{EVIDENCE_LABELS[item.type] || item.type}</span>
              <p>{item.description}</p>
              {renderEvidenceAsset(item)}
              {item.assetTranscript && <p className="evidence-card__transcript">תמלול: {item.assetTranscript}</p>}
            </div>
          ))}
        </div>

        <div className="action-buttons">
          <button className="action-btn" onClick={() => setShowConsult(true)}>🎙️ התייעץ עם המפקד</button>
          <button className="action-btn solve" onClick={() => setShowSolve(true)}>🏁 הגש פתרון</button>
        </div>
      </div>

      <div className="chat-area">
        {selectedSuspect && (
          <div className="chat-header">
            <div className="chat-header__info">
              <div className="chat-title-row">
                <span className="chat-name">{selectedSuspect.name}</span>
                <span className="chat-role">תפקיד: {selectedSuspect.role}</span>
                <span className={`person-badge person-badge--${getInvolvementType(selectedSuspect)}`}>
                  {INVOLVEMENT_LABELS[getInvolvementType(selectedSuspect)]}
                </span>
              </div>
              <p className="chat-personality">{selectedSuspect.personality}</p>
              {selectedSuspect.alibi && <p className="chat-alibi">אליבי נטען: {selectedSuspect.alibi}</p>}
            </div>
            <div className="tone-row">
              {Object.keys(TONE_LABELS).map((item) => (
                <button
                  key={item}
                  className={`tone-btn ${tone === item ? 'active' : ''}`}
                  onClick={() => setTone(item)}
                >
                  {TONE_LABELS[item]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          ref={messagesContainerRef}
          className="messages"
          onScroll={handleMessagesScroll}
        >
          {error && <div className="inline-error">{error}</div>}
          {messages.length === 0 && (
            <p className="empty-chat">בחר חשוד ושאל שאלה חכמה כדי להתחיל את החקירה</p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role === 'user' ? 'user-message' : 'assistant-message'}`}>
              {msg.content}
            </div>
          ))}
          {asking && <div className="message assistant-message typing">...</div>}
        </div>

        <div className="input-area">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAsk();
              }
            }}
            placeholder={`שאל את ${selectedSuspect?.name || 'החשוד'}...`}
            disabled={asking}
          />
          <button onClick={handleAsk} disabled={asking || !question.trim()}>שלח</button>
        </div>

        <section className="notebook-panel">
          <div className="notebook-panel__head">
            <div>
              <span className="side-label">מחברת חקירה</span>
              <h3>סיכום חקירה, ריכוז ממצאים וסתירות</h3>
            </div>
            <span className="notebook-counter">{notebook.evidenceBoard.length} פריטים</span>
          </div>

          <div className="notebook-section">
            <div className="notebook-section__head">
              <strong>סיכום שיחה</strong>
              <span>{selectedSuspect?.name || 'ללא בחירה'}</span>
            </div>

            {!notebook.conversationSummary ? (
              <p className="notebook-empty">עדיין אין שיחה. ברגע שתתחיל לשאול יופיע כאן סיכום.</p>
            ) : (
              <div className="notebook-summary">
                <p className="notebook-summary__count">
                  {notebook.conversationSummary.questionCount === 1
                    ? 'שאלה אחת נשאלה עד כה.'
                    : `${notebook.conversationSummary.questionCount} שאלות נשאלו עד כה.`}
                </p>
                <div className="notebook-messages-list">
                  {notebook.conversationSummary.messages.map((item, i) => (
                    <article key={i} className="notebook-message">
                      <span className="notebook-message__q">{item.question}</span>
                      <p className="notebook-message__a">{item.cleanAnswer}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="notebook-section">
            <div className="notebook-section__head">
              <strong>מרכז עדויות</strong>
              <span>ראיות, אליביים ואמירות אחרונות</span>
            </div>

            <div className="evidence-board-grid">
              {notebook.evidenceBoard.map((entry) => (
                <article key={entry.id} className={`notebook-item notebook-item--${entry.type}`}>
                  <div className="notebook-item__meta">
                    <strong>{entry.label}</strong>
                    <span>{entry.meta}</span>
                  </div>
                  <p>{entry.content}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="notebook-section">
            <div className="notebook-section__head">
              <strong>דברים ששווה לבדוק שוב</strong>
              <span>בלי לקבוע מסקנה</span>
            </div>

            {notebook.contradictions.length === 0 ? (
              <p className="notebook-empty">עדיין לא עלו סתירות בולטות. המשך לאסוף עוד פרטים.</p>
            ) : (
              <div className="notebook-list">
                {notebook.contradictions.map((item) => (
                  <article key={item.id} className="notebook-item notebook-item--warning">
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="notebook-section">
            <div className="notebook-section__head">
              <strong>הערות החוקר</strong>
              <span>נשמרות בתוך התיק</span>
            </div>

            <div className="investigator-notes">
              <textarea
                className="notebook-textarea"
                value={investigatorNotes}
                onChange={(event) => {
                  setInvestigatorNotes(event.target.value);
                  if (notesStatus) {
                    setNotesStatus('');
                  }
                }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    handleSaveNotes();
                  }
                }}
                placeholder="כתוב כאן כיווני חקירה, סתירות ששמת לב אליהן, או שמות שצריך לחזור אליהם..."
                rows={6}
              />

              <div className="notebook-save-row">
                <span className={`notebook-save-status ${notesDirty ? 'is-dirty' : ''}`}>{notesStatus || (notesDirty ? 'יש שינויים שלא נשמרו.' : 'כל ההערות שמורות.')}</span>
                <button className="confirm-btn" onClick={handleSaveNotes} disabled={savingNotes || !notesDirty}>
                  {savingNotes ? 'שומר...' : 'שמור הערות'}
                </button>
              </div>
            </div>
          </div>

          {lastCommanderReply && (
            <div className="commander-hint">
              <strong>הכוונה אחרונה מהמפקד</strong>
              <p>{lastCommanderReply.content}</p>
            </div>
          )}
        </section>
      </div>

      {showConsult && (
        <div className="overlay" onClick={() => { setShowConsult(false); setCommanderResponse(''); setSuspicion(''); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🎙️ התייעצות עם המפקד</h2>
            <p className="modal-subtitle">שתף את המפקד בחשד שלך — הוא יכוון, לא יגלה</p>
            <textarea
              value={suspicion}
              onChange={(e) => setSuspicion(e.target.value)}
              placeholder="אני חושד/ת ש..."
              rows={3}
            />
            {commanderResponse && (
              <div className="commander-response">
                <strong>המפקד:</strong>
                <p>{commanderResponse}</p>
              </div>
            )}
            <div className="modal-buttons">
              <button className="cancel-btn" onClick={() => { setShowConsult(false); setCommanderResponse(''); setSuspicion(''); }}>סגור</button>
              <button className="confirm-btn" onClick={handleConsult} disabled={consulting || !suspicion.trim()}>
                {consulting ? 'שואל...' : 'שלח למפקד'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSolve && !result && (
        <div className="overlay" onClick={() => setShowSolve(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🏁 הגשת פתרון</h2>
            <p className="modal-subtitle">מי לדעתך ביצע את הפשע?</p>
            <select value={accusedName} onChange={(e) => setAccusedName(e.target.value)}>
              <option value="">בחר חשוד</option>
              {caseDoc.suspects.map((suspect) => (
                <option key={suspect.name} value={suspect.name}>{suspect.name}</option>
              ))}
            </select>
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder="הסבר את ההיגיון שלך..."
              rows={3}
            />
            <div className="modal-buttons">
              <button className="cancel-btn" onClick={() => setShowSolve(false)}>ביטול</button>
              <button className="confirm-btn" onClick={handleSolve} disabled={solving || !accusedName}>
                {solving ? 'בודק...' : 'הגש פתרון'}
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="overlay">
          <div className={`modal result-modal ${result.isCorrect ? 'success' : 'failure'}`}>
            <h2>{result.isCorrect ? '✅ פתרת את התעלומה!' : '❌ טעית'}</h2>
            <p>{result.isCorrect ? 'עבודה מרשימה, סוכן.' : `האשם האמיתי היה: ${result.correctCulprit}`}</p>
            <button className="confirm-btn" onClick={() => navigate('/dashboard')}>חזור לדשבורד</button>
          </div>
        </div>
      )}

    </div>
  );
}