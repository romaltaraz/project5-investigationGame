import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCaseStream } from '../context/CaseStreamContext';
import { BASE_URL, casesAPI, investigateAPI } from '../services/api.js';
import { buildCaseNotebook } from '../utils/investigationNotebook.js';
import InvestigationLoader from '../components/InvestigationLoader';
import '../styles/components/game.css';

const SuspectPortrait = ({ name = '', size = 44 }) => {
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const v    = hash % 4;
  const hue  = (hash * 47) % 360;
  const silhouettes = [
    `<circle cx="22" cy="17" r="8" fill="rgba(255,220,150,.18)"/>
     <path d="M 5 44 Q 5 30 22 30 Q 39 30 39 44 Z" fill="rgba(255,220,150,.18)"/>`,
    `<polygon points="22,8 30,20 22,25 14,20" fill="rgba(255,220,150,.18)"/>
     <path d="M 6 44 Q 6 30 22 30 Q 38 30 38 44 Z" fill="rgba(255,220,150,.18)"/>`,
    `<ellipse cx="22" cy="17" rx="10" ry="8" fill="rgba(255,220,150,.18)"/>
     <path d="M 4 44 Q 4 30 22 30 Q 40 30 40 44 Z" fill="rgba(255,220,150,.18)"/>`,
    `<ellipse cx="22" cy="17" rx="6.5" ry="9" fill="rgba(255,220,150,.18)"/>
     <path d="M 8 44 Q 8 30 22 30 Q 36 30 36 44 Z" fill="rgba(255,220,150,.18)"/>`,
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none"
         xmlns="http://www.w3.org/2000/svg" style={{ display:'block', flexShrink:0, borderRadius:6 }}>
      <rect width="44" height="44" fill={`hsl(${hue},12%,9%)`}/>
      {[...Array(22)].map((_,i) => (
        <line key={i} x1="0" y1={i*2} x2="44" y2={i*2} stroke="rgba(0,0,0,.35)" strokeWidth="1"/>
      ))}
      <g dangerouslySetInnerHTML={{ __html: silhouettes[v] }}/>
      <rect width="44" height="44" fill="rgba(212,175,55,.04)"/>
      <path d="M2 2 L2 7 M2 2 L7 2"     stroke="rgba(212,175,55,.45)" strokeWidth="1" fill="none"/>
      <path d="M42 2 L37 2 M42 2 L42 7" stroke="rgba(212,175,55,.45)" strokeWidth="1" fill="none"/>
      <path d="M2 42 L2 37 M2 42 L7 42" stroke="rgba(212,175,55,.45)" strokeWidth="1" fill="none"/>
      <path d="M42 42 L37 42 M42 42 L42 37" stroke="rgba(212,175,55,.45)" strokeWidth="1" fill="none"/>
      <text x="22" y="41" textAnchor="middle" fontFamily="monospace" fontSize="4.5" fill="rgba(212,175,55,.35)">
        #{(hash % 9000 + 1000)}
      </text>
    </svg>
  );
};

const EkgMeter = ({ stress = 0 }) => {
  const pct   = Math.min(100, Math.max(0, stress));
  const color = pct < 40 ? '#55C878' : pct < 70 ? '#D4AF37' : '#FF4444';
  const w = 200, h = 18;
  const flatY = h / 2;
  const peak  = Math.round((pct / 100) * (h - 6));
  const mid   = w / 2;
  const d = [
    `M 0 ${flatY}`, `L ${mid-30} ${flatY}`,
    `L ${mid-10} ${flatY+4}`, `L ${mid-4} ${flatY-peak}`,
    `L ${mid+2} ${flatY+peak*.4}`, `L ${mid+8} ${flatY}`,
    `L ${w} ${flatY}`,
  ].join(' ');
  return (
    <div className="ekg-container">
      <svg className="ekg-svg" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeDasharray="600"
              style={{ animation: pct > 5 ? 'ekg-loop 2.2s linear infinite' : 'none', opacity: pct > 5 ? 1 : 0.2 }}/>
      </svg>
    </div>
  );
};

const IconSearch = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconMic = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

const IconFlag = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="22" x2="4" y2="2" />
    <path d="M4 4h14l-3 4 3 4H4" />
  </svg>
);

const IconCheck = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconX = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

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

const ARTIFACT_TYPE_LABELS = {
  handwritten_note: 'פתק בכתב יד',
  handwritten_letter: 'מכתב בכתב יד',
  diary_page: 'דף יומן',
  physical_letter: 'מכתב פיזי',
  threat_note: 'פתק איום',
  personal_note: 'פתק אישי',
  official_report: 'דו"ח רשמי',
  security_access_log: 'רישום גישה מאובטח',
  system_log: 'יומן מערכת',
  meeting_record: 'סיכום פגישה',
  medical_report: 'דו"ח רפואי',
  employee_record: 'תיק עובד',
  investigation_report: 'דו"ח חקירה',
  internal_memo: 'תזכיר פנימי',
  invoice: 'חשבונית',
  receipt: 'קבלה',
  printed_email: 'הודעת דוא"ל מודפסת',
  old_fax: 'פקס ישן',
  scanned_document: 'מסמך סרוק',
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

const getEvidencePreviewMeta = (item = {}) => {
  const mimeType = item.mimeType || '';

  if (mimeType.startsWith('image/')) {
    return { type: 'image', label: 'לחץ לצפייה בתמונה' };
  }

  if (mimeType.startsWith('audio/')) {
    return { type: 'audio', label: 'לחץ להאזנה להקלטה' };
  }

  if (mimeType.startsWith('text/html') || mimeType.startsWith('application/pdf')) {
    return { type: 'document', label: 'לחץ לצפייה במסמך' };
  }

  return { type: 'link', label: 'לחץ לצפייה בראיה' };
};

const renderEvidenceCardPreview = (item = {}, onOpen) => {
  const assetUrl = resolveEvidenceAssetUrl(item);

  if (!assetUrl) {
    return null;
  }

  const { type, label } = getEvidencePreviewMeta(item);

  return (
    <button
      type="button"
      className="evidence-card__media-locked"
      onClick={() => onOpen?.({ type, src: assetUrl, alt: item.description, mimeType: item.mimeType })}
    >
      <span className="evidence-card__media-locked-icon"><IconSearch size={18} /></span>
      <span>{label}</span>
    </button>
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
  const { getCase } = useCaseStream();

  const [caseDoc, setCaseDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Live view from the shared SSE feed - keeps status / evidence in sync with
  // MongoDB (including direct Compass edits) without a page refresh.
  const liveCase = getCase(caseId);
  const lastSyncedRef = useRef('');

  const [mobileView, setMobileView] = useState('chat');
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
  const [evidenceViewer, setEvidenceViewer] = useState(null);

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

      lastSyncedRef.current = `${data.case?.status || ''}:${data.case?.updatedAt || ''}`;
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

  // Surgical refresh when the SSE feed reports this case changed (status flip,
  // late evidence assets, direct Compass edit). Only replaces caseDoc - never
  // touches the selected suspect, the open chat, or unsaved notes.
  const syncCaseDoc = async () => {
    try {
      const data = await casesAPI.getById(caseId);
      setCaseDoc(data.case);
      lastSyncedRef.current = `${data.case?.status || ''}:${data.case?.updatedAt || ''}`;
    } catch {
      /* keep the current view; the next event / reconnect will resync */
    }
  };

  useEffect(() => {
    if (!liveCase) return;
    const signature = `${liveCase.status || ''}:${liveCase.updatedAt || ''}`;
    if (lastSyncedRef.current && signature !== lastSyncedRef.current) {
      lastSyncedRef.current = signature;
      syncCaseDoc();
    }
  }, [liveCase?.status, liveCase?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setMobileView('chat');
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

  if (loading) return <InvestigationLoader fullPage label="טוען תיק חקירה..." />;
  if (caseDoc && caseDoc.status === 'generating') {
    return <InvestigationLoader fullPage label="התיק עדיין בהכנה… הוא ייפתח אוטומטית כשיהיה מוכן." />;
  }
  if (error && !caseDoc) return <div className="loading">{error}</div>;
  if (!caseDoc) return <div className="loading">תיק לא נמצא</div>;

  return (
    <div className="game-container">
      <div className="mobile-tabs">
        <button
          type="button"
          className={`mobile-tab-btn ${mobileView === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileView('chat')}
        >
          שיחת חקירה
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileView === 'notebook' ? 'active' : ''}`}
          onClick={() => setMobileView('notebook')}
        >
          ריכוז עדויות
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileView === 'case' ? 'active' : ''}`}
          onClick={() => setMobileView('case')}
        >
          תיק, חשודים וראיות
        </button>
      </div>

      <div className={`sidebar ${mobileView === 'case' ? 'is-active-mobile' : ''}`}>
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
            <div className="suspect-card__top">
              <SuspectPortrait name={suspect.name} size={34}/>
              <div className="suspect-card__id">
                <div className="suspect-name-row">
                  <div className="suspect-name">{suspect.name}</div>
                  <span className={`person-badge person-badge--${getInvolvementType(suspect)}`}>
                    {INVOLVEMENT_LABELS[getInvolvementType(suspect)]}
                  </span>
                </div>
                <div className="suspect-role">תפקיד: {suspect.role}</div>
              </div>
            </div>
            <div className="suspect-card__stress">
              <EkgMeter stress={suspect.stressMeter || 0}/>
              <span className="stress-label">{suspect.stressMeter || 0}%</span>
            </div>
          </div>
        ))}

        <div className="evidence-panel">
          <p className="side-label">ראיות זמינות</p>
          {(caseDoc.evidence || []).map((item, index) => (
            <div key={`${item.type}-${index}`} className="evidence-card">
              <span>
                {EVIDENCE_LABELS[item.type] || item.type}
                {ARTIFACT_TYPE_LABELS[item.artifactType] && ` · ${ARTIFACT_TYPE_LABELS[item.artifactType]}`}
              </span>
              <p>{item.description}</p>
              {renderEvidenceCardPreview(item, setEvidenceViewer)}
              {item.assetTranscript && <p className="evidence-card__transcript">תמלול: {item.assetTranscript}</p>}
            </div>
          ))}
        </div>

        <div className="action-buttons">
          <button className="action-btn" onClick={() => setShowConsult(true)}><IconMic size={15} /> התייעץ עם המפקד</button>
          <button className="action-btn solve" onClick={() => setShowSolve(true)}><IconFlag size={15} /> הגש פתרון</button>
        </div>
      </div>

      <div className={`chat-area ${mobileView === 'chat' || mobileView === 'notebook' ? 'is-active-mobile' : ''}`}>
        <div className={`chat-thread ${mobileView === 'notebook' ? 'is-hidden-mobile' : ''}`}>
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
        </div>

        <section className={`notebook-panel ${mobileView === 'notebook' ? 'is-active-mobile' : ''}`}>
          <div className="notebook-panel__head">
            <div>
              <span className="side-label">מחברת חקירה</span>
              <h3>ריכוז עדויות, ציטוטים וסתירות רכות</h3>
            </div>
            <span className="notebook-counter">{notebook.evidenceBoard.length} פריטים</span>
          </div>

          <div className="notebook-section">
            <div className="notebook-section__head">
              <strong>תיעוד מהחשוד הנבחר</strong>
              <span>{selectedSuspect?.name || 'ללא בחירה'}</span>
            </div>

            {notebook.selectedNotes.length === 0 ? (
              <p className="notebook-empty">עדיין אין תיעוד. ברגע שתתחיל לשאול, התשובות האחרונות יופיעו כאן.</p>
            ) : (
              <div className="notebook-list">
                {notebook.selectedNotes.map((entry) => (
                  <article key={entry.question} className="notebook-item">
                    <strong>שאלה:</strong>
                    <p>{entry.question}</p>
                    <strong>תגובה:</strong>
                    <p>{entry.answer}</p>
                  </article>
                ))}
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
            <h2><IconMic size={18} /> התייעצות עם המפקד</h2>
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
            <h2><IconFlag size={18} /> הגשת פתרון</h2>
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
            <h2>{result.isCorrect ? <><IconCheck size={22} /> פתרת את התעלומה!</> : <><IconX size={22} /> טעית</>}</h2>
            <p>{result.isCorrect ? 'עבודה מרשימה, סוכן.' : `האשם האמיתי היה: ${result.correctCulprit}`}</p>
            <button className="confirm-btn" onClick={() => navigate('/dashboard')}>חזור לדשבורד</button>
          </div>
        </div>
      )}

      {evidenceViewer && (
        <div className="overlay overlay--evidence" onClick={() => setEvidenceViewer(null)}>
          <div className="image-lightbox" onClick={(e) => e.stopPropagation()}>
            {evidenceViewer.type === 'image' && (
              <img className="image-lightbox__img" src={evidenceViewer.src} alt={evidenceViewer.alt || 'ראיית זירה'} />
            )}

            {evidenceViewer.type === 'audio' && (
              <audio className="image-lightbox__audio" controls autoPlay preload="metadata" src={evidenceViewer.src} />
            )}

            {evidenceViewer.type === 'document' && (
              <iframe
                className="image-lightbox__frame"
                src={evidenceViewer.src}
                title={evidenceViewer.alt || 'קובץ ראיה'}
                sandbox="allow-scripts allow-same-origin"
              />
            )}

            {evidenceViewer.type === 'link' && (
              <p className="image-lightbox__fallback-text">{evidenceViewer.alt}</p>
            )}

            {(evidenceViewer.type === 'link' || evidenceViewer.mimeType === 'application/pdf') && (
              <a className="evidence-card__link" href={evidenceViewer.src} target="_blank" rel="noreferrer">
                {evidenceViewer.mimeType === 'application/pdf' ? 'הורד/פתח כקובץ PDF' : 'פתח קובץ ראיה'}
              </a>
            )}

            <button className="image-lightbox__close" onClick={() => setEvidenceViewer(null)}>✕ סגור</button>
          </div>
        </div>
      )}

    </div>
  );
}