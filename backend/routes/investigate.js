// routes/investigate.js
import express from 'express';
import Case from '../models/Case.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import OpenAI from 'openai';

const router = express.Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const normalizeText = (value = '') => value
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (value = '') => normalizeText(value)
  .split(' ')
  .filter((token) => token.length >= 2);

const buildKeywordSet = (values = []) => new Set(
  values
    .flatMap((value) => tokenize(value))
    .filter(Boolean),
);

const countSetMatches = (questionTokens, keywords) => questionTokens.reduce(
  (count, token) => count + (keywords.has(token) ? 1 : 0),
  0,
);

const includesPhrase = (questionText, values = []) => values.some((value) => {
  const normalizedValue = normalizeText(value);
  return normalizedValue && questionText.includes(normalizedValue);
});

const deriveInvolvementType = (suspect = {}) => {
  if (suspect?.involvementType === 'suspect' || suspect?.involvementType === 'witness') {
    return suspect.involvementType;
  }

  return /עד/.test(suspect?.role || '') ? 'witness' : 'suspect';
};

const getRecentUserQuestions = (interaction) => (interaction?.messages || [])
  .filter((message) => message.role === 'user')
  .slice(-4)
  .map((message) => message.content);

const assessStressDelta = ({ question, tone, suspect, interaction, evidence = [] }) => {
  const normalizedQuestion = normalizeText(question);
  const questionTokens = tokenize(question);
  const liesAbout = Array.isArray(suspect.truthProfile?.liesAbout) ? suspect.truthProfile.liesAbout : [];
  const nervousTriggers = Array.isArray(suspect.truthProfile?.nervousTriggers) ? suspect.truthProfile.nervousTriggers : [];
  const secretKeywords = buildKeywordSet([suspect.secret || '']);
  const alibiKeywords = buildKeywordSet([suspect.alibi || '']);
  const lieKeywords = buildKeywordSet(liesAbout);
  const triggerKeywords = buildKeywordSet(nervousTriggers);
  const evidenceKeywords = buildKeywordSet(evidence.flatMap((item) => [item.description, item.hiddenClue]));
  const previousQuestions = getRecentUserQuestions(interaction);
  const previousQuestionKeywords = buildKeywordSet(previousQuestions);

  const contradictionPatterns = [
    'אמרת',
    'קודם',
    'לפני רגע',
    'זה לא מסתדר',
    'אתה סותר',
    'את משקר',
    'אתה משקר',
    'יש לי ראיה',
    'מצאנו',
    'הוכחה',
  ];
  const accusationPatterns = [
    'זה אתה',
    'זאת את',
    'אתה עשית',
    'את עשית',
    'אתה אחראי',
    'את אחראית',
    'למה עשית',
    'למה עשית את זה',
  ];
  const pressurePatterns = [
    'אליבי',
    'איפה היית',
    'עם מי היית',
    'בשעה',
    'מתי בדיוק',
    'למה הסתרת',
    'מה אתה מסתיר',
    'מה את מסתירה',
  ];

  const lieMatches = countSetMatches(questionTokens, lieKeywords);
  const triggerMatches = countSetMatches(questionTokens, triggerKeywords);
  const secretMatches = countSetMatches(questionTokens, secretKeywords);
  const alibiMatches = countSetMatches(questionTokens, alibiKeywords);
  const evidenceMatches = countSetMatches(questionTokens, evidenceKeywords);
  const repeatedPressure = countSetMatches(questionTokens, previousQuestionKeywords);
  const contradictionPressure = contradictionPatterns.filter((pattern) => normalizedQuestion.includes(pattern)).length;
  const accusationPressure = accusationPatterns.filter((pattern) => normalizedQuestion.includes(pattern)).length;
  const directPressure = pressurePatterns.filter((pattern) => normalizedQuestion.includes(pattern)).length;
  const phraseTriggerHit = includesPhrase(normalizedQuestion, nervousTriggers) ? 1 : 0;
  const phraseLieHit = includesPhrase(normalizedQuestion, liesAbout) ? 1 : 0;

  let stressDelta = 0;

  stressDelta += Math.min(12, (lieMatches * 4) + (phraseLieHit * 5));
  stressDelta += Math.min(12, (triggerMatches * 3) + (phraseTriggerHit * 5));
  stressDelta += Math.min(10, secretMatches * 3);
  stressDelta += Math.min(8, alibiMatches * 2);
  stressDelta += Math.min(10, evidenceMatches * 2);
  stressDelta += Math.min(7, contradictionPressure * 4);
  stressDelta += Math.min(10, accusationPressure * 6);
  stressDelta += Math.min(6, directPressure * 2);

  if (repeatedPressure >= 2) {
    stressDelta += Math.min(6, repeatedPressure);
  }

  if (tone === 'aggressive' && stressDelta > 0) {
    stressDelta += 4;
  }

  if (tone === 'aggressive' && accusationPressure > 0) {
    stressDelta += 2;
  }

  if (tone === 'empathetic' && stressDelta > 0) {
    stressDelta = Math.max(0, stressDelta - 2);
  }

  if (stressDelta === 0 && tone === 'aggressive' && directPressure > 0) {
    stressDelta = 2;
  }

  return Math.min(24, stressDelta);
};

const buildSuspectSystemPrompt = ({ suspect, caseDoc, tone, stressDelta }) => {
  const incidentSummary = caseDoc.briefingDetails?.incidentSummary || 'אירוע פלילי חמור';
  const incidentLocation = caseDoc.briefingDetails?.incidentLocation || 'הזירה המרכזית';
  const incidentTime = caseDoc.briefingDetails?.incidentTime || 'חלון הזמן הקריטי';
  const involvementType = deriveInvolvementType(suspect);
  const investigationStatusLabel = involvementType === 'witness' ? 'נחקר כעד ראייה' : 'נחקר כחשוד';
  const investigationStatusInstruction = involvementType === 'witness'
    ? 'מבחינת החוקרים אתה נחקר כעד ראייה, אבל כל אי-דיוק או הסתרה עלולים לגרום להם לחשוב שאתה יודע הרבה יותר ממה שאתה אומר.'
    : 'מבחינת החוקרים אתה נחקר כחשוד, ולכן כל תשובה שלך נבחנת גם כסימן למעורבות ישירה באירוע.';
  const toneInstructions = {
    neutral: 'החוקר מדבר רשמי וענייני. שמור על שליטה עצמית, אבל אל תהיה רובוטי.',
    empathetic: 'החוקר מדבר ברוך יחסי. אם אין איום ישיר, אתה יכול להיפתח מעט בלי לוותר על ההגנות שלך.',
    aggressive: 'החוקר לוחץ, קוטע ומנסה לשבור אותך. אם השאלה רגישה אתה עלול להתגונן, להיעלב, להתחמק או להתפרץ.',
  };
  const guiltInstruction = suspect.isGuilty
    ? 'אתה יודע שאתה מעורב ישירות במה שקרה, ולכן אתה מגן על עצמך באופן פעיל ומנסה לא לחשוף את החלק שלך.'
    : 'אתה לא האחראי הישיר למה שקרה, אבל אתה בהחלט מסתיר משהו משלך וחושש שידביקו לך את המקרה אם תדבר לא נכון.';

  return `אתה ${suspect.name}, נחקר כעת בחדר חקירות משטרתי במסגרת חקירה פלילית חמורה.
תפקיד במערכת: ${suspect.role}
סטטוס חקירה: ${investigationStatusLabel}
אישיות: ${suspect.personality}
המקרה הנחקר: ${incidentSummary}
מיקום האירוע: ${incidentLocation}
שעת/חלון הזמן הקריטי: ${incidentTime}
האליבי שאתה מציג: ${suspect.alibi}
הסוד שאתה מסתיר: ${suspect.secret}
רמת לחץ נוכחית: ${suspect.stressMeter}/100
השאלה האחרונה העלתה את מד הלחץ ב-${stressDelta} נקודות.
${investigationStatusInstruction}
${guiltInstruction}
${suspect.stressMeter >= (suspect.breakingPoint || 70) ? 'אתה קרוב מאוד לשבירה, וכל שאלה רגישה מרגישה לך מסוכנת.' : 'אתה עדיין מנסה להחזיק קו ולא לאבד שליטה.'}

חוקי משחק קריטיים:
- אתה מודע היטב למה קרה, למה זימנו אותך לחקירה, ולכך שאתה נבדק כמי שיכול לדעת משהו מהותי או להיות מעורב.
- זכור לאורך כל התשובה שאתה ${investigationStatusLabel}, וזה צריך להישמע בדרך שבה אתה מתגונן, מוסר מידע או בולם שאלות.
- אל תישמע כאילו אינך מבין את הסיטואציה, אל תשאל בתמימות "מה קרה בכלל" אלא אם זו התחמקות מחושבת וספציפית.
- דבר כמו אדם אמיתי שנמצא בחקירת משטרה, לא כמו AI ולא כמו שיחה רגילה.
- אל תחזור בסוף כל תשובה על משפטים קבועים כמו "אני לא רוצה להגיד" או "אני רק רוצה למצוא מי עשה את זה".
- אם אתה מתחמק, עשה זאת באופן טבעי ומגוון: חצי תשובה, הסטת נושא, הקטנת עניין, זעם, תיקון ניסוח, זיכרון מע模ם, שאלה נגדית, או ניסיון לקנות זמן.
- אם השאלה לא נוגעת בנקודה רגישה, תן תשובה עניינית וקונקרטית מתוך נקודת המבט שלך.
- אם השאלה רגישה, אתה יכול לשקר, להצטמצם, להיעלב, להילחץ או להישבר בהתאם לרמת הלחץ.
- אל תגלה את הסוד שלך בקלות.
- אל תודה בפשע שלא ביצעת. אם אינך האשם, שמור על האמת המרכזית הזאת.
- מותר לך לדבר על מה שראית, שמעת, עשית או ניסית להסתיר, אבל רק באופן שתואם את האינטרס שלך.
- שלב שפת גוף רק לפעמים ובאופן עדין, למשל: (מסתכל הצידה), (מכווץ את הלסת), (קול ננעל), (נושף בכבדות).
- ${toneInstructions[tone]}
- ענה בעברית טבעית, חדה ואנושית. בדרך כלל 1 עד 4 משפטים, לא נאום ארוך.

ענה רק בתור ${suspect.name}.`;
};

// ======================
// POST /api/investigate/:id/ask   ← שאלה לחשוד
// ======================
router.post('/:id/ask', authenticateToken, async (req, res) => {
  try {
    const { suspectName, question, tone = 'neutral' } = req.body;
    const caseDoc = await Case.findOne({ _id: req.params.id, userId: req.user.userId });

    if (!caseDoc) return res.status(404).json({ message: 'תיק לא נמצא' });
    if (caseDoc.status !== 'active') return res.status(400).json({ message: 'התיק כבר נסגר' });

    const suspect = caseDoc.suspects.find(s => s.name === suspectName);
    if (!suspect) return res.status(404).json({ message: 'חשוד לא נמצא' });

    // מציאת/יצירת interaction
    let interaction = caseDoc.interactions.find(
      i => i.entityType === 'suspect' && i.entityName === suspectName
    );

    if (!interaction) {
      interaction = { entityType: 'suspect', entityName: suspectName, messages: [] };
      caseDoc.interactions.push(interaction);
    }

    const stressDelta = assessStressDelta({
      question,
      tone,
      suspect,
      interaction,
      evidence: caseDoc.evidence || [],
    });

    suspect.stressMeter = Math.min(
      100,
      Math.max(0, (suspect.stressMeter || 0) + stressDelta),
    );

    const systemPrompt = buildSuspectSystemPrompt({
      suspect,
      caseDoc,
      tone,
      stressDelta,
    });

    const aiResponse = await openai.chat.completions.create({
      model: 'meta/llama-3.3-70b-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        ...interaction.messages,
        { role: 'user', content: question }
      ]
    });

    const answer = aiResponse.choices[0].message.content;

    interaction.messages.push({ role: 'user', content: question });
    interaction.messages.push({ role: 'assistant', content: answer });

    suspect.currentTone = tone;
    await caseDoc.save();

    res.json({
      answer,
      stressMeter: suspect.stressMeter
    });

  } catch (error) {
    res.status(500).json({ message: 'שגיאה בחקירה', error: error.message });
  }
});

// ======================
// POST /api/investigate/:id/consult   ← התייעצות עם המפקד
// ======================
router.post('/:id/consult', authenticateToken, async (req, res) => {
  try {
    const { suspicion } = req.body;
    const caseDoc = await Case.findOne({ _id: req.params.id, userId: req.user.userId });

    if (!caseDoc) return res.status(404).json({ message: 'תיק לא נמצא' });

    let interaction = caseDoc.interactions.find(i => i.entityType === 'commander');
    if (!interaction) {
      interaction = { entityType: 'commander', entityName: 'commander', messages: [] };
      caseDoc.interactions.push(interaction);
    }

    const personalityMap = {
      cold: 'קר ומחושב, עונה קצר ותמציתי',
      aggressive: 'אגרסיבי ולוחץ',
      mentor: 'סבלני, חכם, מנטורי — לא נותן תשובות ישירות'
    };

    const systemPrompt = `אתה המפקד הבכיר.
אישיות: ${personalityMap[caseDoc.commanderPersonality]}
אתה יודע את כל הפרטים הסודיים של התיק.
חוקים קריטיים:
- אף פעם אל תגלה מי האשם
- אל תאשר או תשלול ישירות
- תן רק הכוונה ורמזים עקיפים
ענה בעברית בלבד.`;

    const aiResponse = await openai.chat.completions.create({
      model: 'meta/llama-3.3-70b-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        ...interaction.messages,
        { role: 'user', content: suspicion }
      ]
    });

    const response = aiResponse.choices[0].message.content;

    interaction.messages.push({ role: 'user', content: suspicion });
    interaction.messages.push({ role: 'assistant', content: response });

    await caseDoc.save();

    res.json({ response });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בהתייעצות', error: error.message });
  }
});

// ======================
// POST /api/investigate/:id/solve   ← הגשת פתרון סופי
// ======================
router.post('/:id/solve', authenticateToken, async (req, res) => {
  try {
    const { accusedName, reasoning } = req.body;
    const caseDoc = await Case.findOne({ _id: req.params.id, userId: req.user.userId });

    if (!caseDoc) return res.status(404).json({ message: 'תיק לא נמצא' });
    if (caseDoc.status !== 'active') return res.status(400).json({ message: 'התיק כבר נסגר' });

    const isCorrect = accusedName.trim().toLowerCase() === caseDoc.solution.culprit.trim().toLowerCase();

    caseDoc.status = isCorrect ? 'solved' : 'failed';
    await caseDoc.save();

    // הסרת התיק מה-activeCases
    await User.findByIdAndUpdate(req.user.userId, {
      $pull: { activeCases: caseDoc._id }
    });

    res.json({
      isCorrect,
      message: isCorrect ? 'פתרת את התעלומה בהצלחה!' : 'האשמה שגויה',
      correctCulprit: isCorrect ? null : caseDoc.solution.culprit
    });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בהגשת הפתרון', error: error.message });
  }
});

export default router;