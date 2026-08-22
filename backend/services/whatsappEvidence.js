// services/whatsappEvidence.js
//
// AI generates structured chat content (messageData: participants +
// ordered messages with sender/timestamp/status/deleted flags). Senders
// and participants must be exact matches against real case suspects —
// never invented, never silently swapped. Invalid output triggers one
// corrective retry, then signals the caller to fall back to the
// pre-existing generic renderer.

import { namesAreValid, parseAiJson } from './evidenceBlueprint.js';

const escapeHtml = (value = '') => `${value}`
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildMessageDataPrompt = ({ evidence, participantA, participantB, briefingDetails, validNames }) => {
  const nameList = [...validNames].join(', ');
  return {
    system: 'אתה כותב תוכן מובנה (JSON בלבד) עבור שיחת ווטסאפ פיקטיבית במשחק חקירה בעברית. אסור בהחלט להמציא שם של דמות שלא נמסרה לך.',
    user: `שיחה בין ${participantA.name} (${participantA.role}) לבין ${participantB.name} (${participantB.role}).
מיקום/שעת האירוע בתיק: ${briefingDetails.incidentLocation || ''} ${briefingDetails.incidentTime || ''}.
נושא הראיה: ${evidence.description || ''}.
מטרת הראיה: ${evidence.purpose || ''}.
הרמז המרכזי שחייב לעלות מהשיחה בעדינות, בלי לומר אותו במפורש: ${evidence.hiddenClue || ''}.
רמז משני (אופציונלי): ${evidence.secondaryClue || ''}.
דמויות קיימות בתיק (אסור להשתמש בשם אחר): ${nameList}.

כתוב שיחה טבעית ואמינה של 6 עד 10 הודעות, בעברית מדוברת (לא ספרותית), שמשקפת את היחסים והאישיות של השניים.
החזר אך ורק JSON בפורמט:
{
  "messages": [
    { "sender": "שם מדויק מהרשימה", "text": "תוכן ההודעה", "timestamp": "21:08", "status": "read", "deleted": false }
  ]
}
"status" הוא אחד מ: sent, delivered, read. "deleted" true רק אם ההודעה נמחקה ולכן אין לכתוב לה טקסט אמיתי (השאר text ריק במקרה הזה).
כל ה-"sender" חייבים להיות בדיוק ${participantA.name} או ${participantB.name}, אין אפשרות שלישית.`,
  };
};

const validateMessageData = (messageData, validNameSet) => {
  if (!messageData || !Array.isArray(messageData.messages) || messageData.messages.length === 0) return false;
  const senders = messageData.messages.map((message) => message.sender);
  return namesAreValid(senders, validNameSet);
};

const generateMessageData = async ({ generateAiText, evidence, participantA, participantB, briefingDetails, validNameSet }) => {
  const { system, user } = buildMessageDataPrompt({ evidence, participantA, participantB, briefingDetails, validNames: validNameSet });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await generateAiText(
        system,
        attempt === 0
          ? user
          : `${user}\n\nתשומת לב: הניסיון הקודם השתמש בשם ששולח שלא קיים בתיק. מותר להשתמש אך ורק ב: ${participantA.name}, ${participantB.name}.`,
      );
      const messageData = parseAiJson(raw);
      if (validateMessageData(messageData, validNameSet)) {
        return {
          participants: [
            { name: participantA.name, role: participantA.role },
            { name: participantB.name, role: participantB.role },
          ],
          messages: messageData.messages,
        };
      }
    } catch {
      // fall through to retry / fallback
    }
  }

  return null;
};

const STATUS_TICKS = {
  sent: '<span class="tick">✓</span>',
  delivered: '<span class="tick">✓✓</span>',
  read: '<span class="tick tick--read">✓✓</span>',
};

const renderWhatsappHtml = ({ caseName, messageData }) => {
  const { participants, messages } = messageData;
  const selfName = participants[1]?.name;
  const contactName = participants[0]?.name || participants[1]?.name || '???';

  let lastSender = null;
  const bubbles = messages.map((message) => {
    const isSelf = message.sender === selfName;
    const cls = isSelf ? 'bubble--self' : 'bubble--other';
    const showSender = message.sender !== lastSender;
    lastSender = message.sender;

    const body = message.deleted
      ? '<span class="deleted">🚫 הודעה זו נמחקה</span>'
      : escapeHtml(message.text || '');

    return `<div class="bubble ${cls}">
        ${showSender ? `<span class="sender">${escapeHtml(message.sender)}</span>` : ''}
        <span class="text">${body}</span>
        <span class="time">${escapeHtml(message.timestamp || '')} ${isSelf && !message.deleted ? (STATUS_TICKS[message.status] || '') : ''}</span>
      </div>`;
  }).join('\n      ');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(caseName)} — שיחת WhatsApp</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html{scrollbar-width:thin;scrollbar-color:rgba(212,173,99,.7) rgba(255,255,255,.04)}
    ::-webkit-scrollbar{width:10px}
    ::-webkit-scrollbar-track{background:rgba(255,255,255,.04);border-radius:999px}
    ::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(212,173,99,.9),rgba(196,107,58,.9));border:2px solid rgba(17,13,11,.85);border-radius:999px}
    ::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#e2bb73,#cf7645)}
    body{font-family:'Segoe UI',sans-serif;background:#0a1014;padding:24px}
    .phone{width:min(400px,100%);margin:0 auto;background:#111b21;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
    .topbar{background:#1f2c34;padding:14px 18px;display:flex;align-items:center;gap:12px}
    .avatar{width:38px;height:38px;border-radius:50%;background:#2a3f4a;display:flex;align-items:center;justify-content:center;font-size:16px}
    .contact{color:#e9edef;font-size:14px;font-weight:600}
    .status{color:#8696a0;font-size:11px}
    .body{padding:12px 10px;display:flex;flex-direction:column;gap:6px;max-height:420px;overflow-y:auto;background:#0b141a}
    .bubble{padding:8px 12px;border-radius:10px;max-width:82%;font-size:14px;line-height:1.45;color:#e9edef;display:flex;flex-direction:column}
    .bubble--other{background:#202c33;align-self:flex-start;border-bottom-right-radius:4px}
    .bubble--self{background:#005c4b;align-self:flex-end;border-bottom-left-radius:4px}
    .sender{display:block;font-size:10px;color:#8fd3c4;margin-bottom:2px;letter-spacing:0.5px;font-weight:600}
    .bubble--other .sender{color:#7fb3c9}
    .deleted{font-style:italic;color:#8696a0}
    .time{font-size:10px;color:#8696a0;margin-top:3px;align-self:flex-start}
    .bubble--self .time{align-self:flex-end}
    .tick{color:#8696a0;margin-inline-start:4px}
    .tick--read{color:#53bdeb}
  </style>
</head>
<body>
  <div class="phone">
    <div class="topbar">
      <div class="avatar">💬</div>
      <div>
        <div class="contact">${escapeHtml(contactName)}</div>
        <div class="status">מוצפן מקצה לקצה</div>
      </div>
    </div>
    <div class="body">
      ${bubbles}
    </div>
  </div>
  <script>
    (function () {
      function reportHeight() {
        var h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        window.parent.postMessage({ source: 'evidence-frame', height: h }, '*');
      }
      window.addEventListener('load', reportHeight);
      window.addEventListener('resize', reportHeight);
    })();
  </script>
</body>
</html>`;
};

export const generateStructuredMessage = async ({
  generateAiText, evidence, suspects, briefingDetails, validNameSet, caseName,
}) => {
  const declaredParticipants = Array.isArray(evidence.participants) ? evidence.participants : [];
  const validDeclared = declaredParticipants.filter((name) => validNameSet.has(name));

  const [participantA, participantB] = validDeclared.length >= 2
    ? validDeclared.slice(0, 2).map((name) => suspects.find((suspect) => suspect.name === name))
    : (suspects || []).slice(0, 2);

  if (!participantA || !participantB) {
    return null;
  }

  const messageData = await generateMessageData({
    generateAiText, evidence, participantA, participantB, briefingDetails, validNameSet,
  });

  if (!messageData) {
    return null;
  }

  return {
    messageData,
    rendered: {
      content: renderWhatsappHtml({ caseName, messageData }),
      mimeType: 'text/html; charset=utf-8',
      extension: 'html',
    },
  };
};
