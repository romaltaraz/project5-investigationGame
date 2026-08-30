import {
  DOCUMENT_ARTIFACT_TYPES, resolveGender, HEBREW_QUALITY_CORE, HEBREW_REGISTER, runHebrewQa,
} from './services/evidenceBlueprint.js';

// Single source of truth for the text-generation model used by case/premise
// generation (routes/cases.js) - override via env without touching code.
// Was hardcoded to meta/llama-3.3-70b-instruct in multiple call sites; that
// model is left as-is for evidence generation (services/evidenceAssets.js)
// and interrogation (routes/investigate.js), which are out of scope here.
const NVIDIA_TEXT_MODEL = process.env.NVIDIA_TEXT_MODEL || 'openai/gpt-oss-120b';

const EVIDENCE_TYPES = ['message', 'photo', 'document', 'recording'];
const INCIDENT_TIMES = ['19:40', '20:15', '20:55', '21:20', '22:10', '23:05'];

const CASE_SCENARIOS = [
  {
    theme: 'היעלמות מסתורית',
    incident: 'אדם מרכזי נעלם רגע לפני פגישה קריטית',
    objective: 'לגלות מי העלים אותו ולמה',
    methodOptions: ['הובלה למקום מסתור תחת תירוץ מקצועי', 'בידוד מכוון אחרי פגישה פרטית', 'מלכודת מתוזמנת שהרחיקה אותו מהזירה'],
    motiveOptions: ['השתקת מידע מסוכן', 'סחיטה שנכשלה', 'נקמה על חשיפה מתקרבת'],
  },
  {
    theme: 'גניבה מתוחכמת',
    incident: 'פריט רגיש נעלם מאזור מאובטח בלי סימני פריצה',
    objective: 'לגלות מי לקח אותו ואיך',
    methodOptions: ['שימוש בהרשאה פנימית מזויפת', 'החלפת הפריט בעותק מטעה', 'שיבוש מצלמות קצר ומתוזמן'],
    motiveOptions: ['רווח כספי', 'מחיקת ראיה מפלילה', 'העברת נכס לצד שלישי'],
  },
  {
    theme: 'חבלה פנימית',
    incident: 'מערכת קריטית קרסה בדיוק ברגע הרגיש ביותר',
    objective: 'לאתר את מי שחיבל ולמה',
    methodOptions: ['החדרת פקודה שקטה למערכת', 'ניתוק רכיב מפתח לזמן קצר', 'הטעיית איש תחזוקה כדי לפתוח גישה'],
    motiveOptions: ['נקמה מקצועית', 'טיוח כשל קודם', 'יצירת כאוס כדי להסיט תשומת לב'],
  },
  {
    theme: 'הדלפת מידע',
    incident: 'מידע חסוי דלף החוצה שעות לפני הכרזה רגישה',
    objective: 'לגלות מי הדליף ולמי',
    methodOptions: ['צילום מסמך מתוך חדר פנימי', 'שליחת מסר מוצפן מגישה פנימית', 'שיחה מוקלטת שהועברה לגורם זר'],
    motiveOptions: ['כסף', 'נאמנות כפולה', 'ניסיון להציל את עצמו מחשיפה'],
  },
  {
    theme: 'מוות חשוד',
    incident: 'אדם נמצא מת בנסיבות שלא מסתדרות עם הגרסאות סביבו',
    objective: 'להבין מי אחראי ומה באמת קרה',
    methodOptions: ['עימות שהידרדר', 'הרעלה שקדמה לאירוע המרכזי', 'דחיפה שלובשה כתאונה'],
    motiveOptions: ['חוב ישן', 'קנאה מקצועית', 'חשש מחשיפת סוד הרסני'],
  },
];

const LOCATIONS = ['מגדל משרדים מאובטח', 'מלון בוטיק', 'מעבדת מחקר פרטית', 'נמל יבשתי', 'גלריה סגורה', 'חדר בקרה עירוני'];
const FIRST_NAMES = ['מאיה', 'אדם', 'דניאל', 'נועה', 'יונתן', 'ליה', 'רועי', 'תמר', 'איתן', 'יעל'];
const LAST_NAMES = ['רוזן', 'לוי', 'ברק', 'קדם', 'שלו', 'גבע', 'ארז', 'סלע', 'נבו', 'דרור'];
// Each role concept keeps its own grammatically masculine/feminine form -
// Hebrew role nouns are gendered, so a single string can't correctly serve
// both. `resolveRoleForGender` below picks the matching form from the
// suspect's already-resolved gender (never from guessing at the string
// itself, e.g. "does it end in ת"). A `neutral` field is supported for a
// future role concept that turns out not to need gendering, but none of
// the current concepts qualify - every one below has a natural, idiomatic
// pair in Hebrew.
const ROLE_DEFINITIONS = [
  { male: 'מנהל תפעול', female: 'מנהלת תפעול' },
  { male: 'איש תחזוקה', female: 'אשת תחזוקה' },
  { male: 'חוקר פנים', female: 'חוקרת פנים' },
  { male: 'עד ראייה', female: 'עדת ראייה' },
  { male: 'יועץ חיצוני', female: 'יועצת חיצונית' },
  { male: 'אחראי משמרת', female: 'אחראית משמרת' },
  { male: 'שותף עסקי', female: 'שותפה עסקית' },
  { male: 'מתאם מערכת', female: 'מתאמת מערכת' },
];

const resolveRoleForGender = (roleDefinition, gender) => (
  roleDefinition.neutral || (gender === 'female' ? roleDefinition.female : roleDefinition.male)
);
const PERSONALITIES = [
  'מחושב, מדבר מעט, בוחר כל מילה בזהירות.',
  'לחוץ, קופץ בין פרטים ומנסה להישמע בטוח יותר ממה שהוא.',
  'חד, תוקפני כשמערערים עליו, אבל שומר על חזות מקצועית.',
  'שקט, מסתכל הצידה לפני תשובות, ונמנע מזמנים מדויקים.',
  'כריזמטי, יודע לדבר יפה, ומחליק שאלות מסוכנות בחיוך.',
];
const SECRET_TEMPLATES = [
  'מסתיר פגישה פרטית עם הדמות המרכזית שעות לפני האירוע.',
  'מחזיק מידע על קשר אישי שלא נחשף רשמית.',
  'שינה פרט קטן בדו"ח כדי להגן על עצמו.',
  'מוחק מעורבות צדדית שעלולה להיראות מפלילה.',
  'היה במקום קרוב יותר ממה שהוא מוכן להודות.',
];
const FIELD_SIGNAL_TEMPLATES = [
  'מצלמה אחת בדיוק בקו הראייה החשוב ביותר הפסיקה לתעד לכמה דקות.',
  'שני אנשי צוות מתארים את אותה דקה בצורה שלא יכולה להתקיים יחד.',
  'רישום גישה פנימי מצביע על תנועה שלא מופיעה בשום גרסה אנושית.',
  'פריט שגרתי בזירה הוזז בלי סיבה נראית לעין, כאילו מישהו חיפש משהו בלחץ.',
  'יש פער בין מה שנאמר על סדר הפעולות לבין מה שהמערכת תיעדה בפועל.',
];

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const normalizeText = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const deriveInvolvementTypeFromRole = (role = '') => (/עד/.test(normalizeText(role)) ? 'witness' : 'suspect');

const pickDistinctItems = (items, count) => {
  const pool = [...items];
  const selected = [];

  while (pool.length > 0 && selected.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }

  return selected;
};

const hasRichNarrative = (value, minLength = 90) => normalizeText(value).length >= minLength;

const hasRichList = (items, minItems = 3, minLength = 36) => (
  Array.isArray(items)
  && items.length >= minItems
  && items.slice(0, minItems).every((item) => normalizeText(item).length >= minLength)
);

const buildSuspectRoster = (suspects = []) => suspects
  .slice(0, 3)
  .map((suspect) => `${suspect.name} (${suspect.role})`)
  .join(', ');

const buildEvidenceSnapshot = (evidence = []) => evidence
  .slice(0, 2)
  .map((item) => normalizeText(item.description))
  .filter(Boolean)
  .join(' ');

const buildNarrativeContext = (caseData = {}) => {
  const briefingDetails = caseData.briefingDetails || {};
  const suspects = Array.isArray(caseData.suspects) ? caseData.suspects : [];
  const evidence = Array.isArray(caseData.evidence) ? caseData.evidence : [];
  const incidentSummary = normalizeText(briefingDetails.incidentSummary) || 'אירוע חריג שהידרדר במהירות';
  const incidentTime = normalizeText(briefingDetails.incidentTime) || 'חלון הזמן הקריטי';
  const incidentLocation = normalizeText(briefingDetails.incidentLocation) || normalizeText(caseData.caseName) || 'הזירה המרכזית';

  return {
    caseName: normalizeText(caseData.caseName) || 'תיק חקירה',
    incidentSummary,
    incidentTime,
    incidentLocation,
    suspects,
    evidence,
    suspectCount: suspects.length,
    evidenceCount: evidence.length,
    suspectRoster: buildSuspectRoster(suspects),
    evidenceSnapshot: buildEvidenceSnapshot(evidence),
    leadNames: suspects.slice(0, 3).map((suspect) => suspect.name.split(' ')[0]).filter(Boolean),
  };
};

const buildCommanderBriefText = (context) => {
  const rosterLine = context.suspectRoster
    ? `כרגע נמצאים על הלוח ${context.suspectCount} מעורבים מרכזיים, בהם ${context.suspectRoster}, וכל אחד מהם מחזיק חתיכה אחרת מהסיפור.`
    : 'כמה מעורבים מרכזיים כבר מספקים גרסאות חלקיות וסותרות על מה שהתרחש בזירה.';
  const evidenceLine = context.evidenceCount > 0
    ? `כבר נאספו ${context.evidenceCount} פריטי חומר ראשוניים, והם לא מתיישבים עם הגרסה הישרה שמנסים למכור מהשטח.`
    : 'גם בלי חומר מלא, כבר ברור שיש יותר מדי פערים בזמנים, בתנועה וביחסים בין המעורבים כדי לקרוא לזה צירוף מקרים.';

  return `יש לנו מקרה שבו ${context.incidentSummary} בתוך ${context.incidentLocation}, ובשעה ${context.incidentTime} כבר היה ברור שהאירוע הזה לא נולד מטעות תמימה אחת. ${rosterLine} ${evidenceLine} המשימה שלך היא לפרק את ציר הזמן, להבין מי הרוויח מהכאוס, ולבודד את האדם שבנה לעצמו גרסת כיסוי לפני שהשאר יישרו איתו קו.`;
};

const buildAnomalyText = (context) => `החריגה המרכזית כאן היא שלא מדובר רק בפער קטן בגרסאות אלא בצירוף של כמה סימנים בעייתיים באותו חלון זמן. סביב ${context.incidentTime} מופיעים גם חוסר התאמה בין מה שתועד בזירה לבין מה שנאמר בעל פה, גם נוכחות שנעלמת בדיוק בנקודות הקריטיות, וגם ניסיון מוקדם מדי לקבע סיפור אחד מסודר. כששלוש חריגות כאלה מתכנסות יחד, זה כבר נראה כמו מהלך שנבנה מראש ולא כמו בלבול רגעי.`;

const buildSituationText = (context) => {
  const rosterLine = context.suspectRoster
    ? `המעורבים הראשיים שנמצאים כרגע תחת זכוכית מגדלת הם ${context.suspectRoster}.`
    : 'יש כמה מעורבים מרכזיים שלכל אחד מהם גישה אחרת לזירה וסיבה משלו לספר רק חלק מהאמת.';
  const evidenceLine = context.evidenceSnapshot
    ? `בין החומרים הראשונים שכבר נמצאים בתיק בולטים במיוחד: ${context.evidenceSnapshot}`
    : 'כבר בשלב הראשוני הצטבר מספיק חומר כדי להבין שהגרסאות לא יושבות טוב על ציר זמן אחד.';

  return `נכון לפתיחת החקירה, התיק נבנה סביב מקרה שבו ${context.incidentSummary} בתוך ${context.incidentLocation}. ${rosterLine} ${evidenceLine} הצעד הראשון שלך הוא לבדוק מי נשמע יציב כשמדברים באופן כללי, אבל מתחיל להסתבך דווקא כשנכנסים לדקות, למסלולים ולקשרים האישיים סביב הזירה.`;
};

const buildStakesText = (context) => `אם לא תייצב במהירות את ציר הזמן סביב ${context.incidentTime}, אחד המעורבים ירוויח מספיק זמן כדי למחוק עקבות, לתאם גרסאות או להציג טעות תפעולית כאילו היא ההסבר המלא לאירוע. מעבר לפתרון עצמו, יש כאן מאבק על השליטה בנרטיב: מי שיקבע ראשון מה נראה סביר, יקשה אחר כך לחשוף מה באמת קרה. לכן כל שעה שעוברת בלי הצלבה מדויקת פועלת לטובת האדם שמושך בחוטים.`;

const buildLocationContextText = (context) => `הזירה ${context.incidentLocation} היא לא מקום ניטרלי אלא סביבה שבה לכל תנועה יש משמעות: מי רשאי להיכנס, מי יכול להיעלם לדקה, ומי יודע לנצל נהלים או עיוורון מערכתי בלי לבלוט מיד. דווקא במקומות כאלה העקבות לא תמיד צועקות, אבל הן מצטברות לדפוס ברור כשבודקים הרשאות, סדר פעולות וקשרים מוקדמים בין האנשים שנכחו שם. לכן הפרשנות של הזירה חשובה כאן כמעט כמו איסוף החומר עצמו.`;

const buildFieldSignals = (context) => {
  const seededSignals = pickDistinctItems(FIELD_SIGNAL_TEMPLATES, 2);

  return [
    `${seededSignals[0]} החריגה הזאת מתחברת ישירות לחלון הזמן סביב ${context.incidentTime}.`,
    `${seededSignals[1]} זה לא נראה כמו טעות אנוש בודדת אלא כמו מישהו שציפה מראש לאן יופנה המבט.`,
    context.evidenceSnapshot
      ? `גם החומר הראשוני שכבר בתיק מרמז על לחץ לא טבעי בזירה: ${context.evidenceSnapshot}`
      : 'יש בזירה סימנים ללחץ נקודתי ומדויק, כאילו מישהו ידע בדיוק איזה פרט צריך להזיז ואיזה פרט אפשר להשאיר מאחור.',
  ];
};

const buildKnownFacts = (context) => [
  `יש כרגע ${context.suspectCount || 'כמה'} מעורבים מרכזיים שלכל אחד מהם גישה אחרת לזירה, אינטרס אחר, וסיבה טובה להסתיר לפחות חלק מהתמונה.`,
  `כבר נאספו ${context.evidenceCount || 'מספר'} פריטי חומר ראשוניים, ולכן התיק לא נשען רק על תחושות בטן אלא גם על נקודות עיגון שאפשר להצליב.`,
  `הסתירות הראשונות צפויות להופיע סביב ${context.incidentTime}, בדיוק במקום שבו מישהו היה צריך גם להיות נוכח וגם להיראות כאילו לא היה לו קשר.`,
];

const buildOpeningQuestions = (context) => {
  const [firstLead = 'אחד המעורבים', secondLead = 'מעורב נוסף'] = context.leadNames;

  return [
    `מי מרוויח מכך ש-${context.incidentSummary} ייראה כמו תקלה, בלבול רגעי או צירוף מקרים ולא כמו מהלך מכוון?`,
    `איזו תנועה סביב ${context.incidentTime} עדיין לא קיבלה הסבר נקי שמחזיק גם מול הזירה וגם מול העדויות?`,
    `האם הקשר בין ${firstLead} ל-${secondLead} מוצג בכוונה כחלש או טכני מדי ביחס למה שהשטח והחומר כבר מרמזים עליו?`,
  ];
};

const buildBackstoryText = (context, solution = {}) => {
  const culprit = normalizeText(solution.culprit) || 'האחראי האמיתי';
  const method = normalizeText(solution.method) || 'מהלך קצר, מדויק ומתוזמן';
  const motive = normalizeText(solution.motive) || 'מניע אישי עמוק';

  return `מאחורי הקלעים, המקרה שבו ${context.incidentSummary} לא נולד ברגע אחד אלא מתוך מתחים קודמים, קשרים מוסתרים וחלון הזדמנות שנפתח בתוך ${context.incidentLocation}. מי שאחראי הבין שהזירה עמוסה מספיק כדי שכל אחד מהנוכחים יחשוב קודם כול על ההגנה העצמית שלו, ולכן אפשר יהיה לבנות סביב האירוע שכבות של חצאי אמיתות. ${culprit} ניצל את הרגע הזה כדי לפעול דרך ${method}, מתוך ${motive}, ובמקביל דאג שלכמה אנשים סביבו יהיו סיבות משלהם לשקר גם אם אינם האשמים המרכזיים. לכן רוב הסתירות בתיק הזה לא נועדו רק להסתיר את האמת, אלא גם למשוך את החקירה לכיוונים נוחים יותר למי שיזם את המהלך.`;
};

const buildSolutionExplanationText = (context, solution = {}) => {
  const culprit = normalizeText(solution.culprit) || 'האחראי';
  const method = normalizeText(solution.method) || 'מהלך מדויק ומתוזמן';
  const motive = normalizeText(solution.motive) || 'מניע משמעותי';

  return `${culprit} הוא האחראי לאירוע משום שהיה לו גם מניע ברור, גם אפשרות אמיתית לפעול בתוך ${context.incidentLocation}, וגם יתרון בזמן סביב ${context.incidentTime}. הוא השתמש ב-${method} כדי לגרום למקרה להיראות בתחילה כמו בלבול, תקלה או עימות נקודתי, ולא כמו פעולה מכוונת. המניע המרכזי היה ${motive}, אבל מה שמפליל אותו באמת הוא החיבור בין ציר הזמן, הגישה לזירה והדרך שבה כמה סתירות קטנות מסתדרות לכדי דפוס אחד עקבי של הכנה מוקדמת וטשטוש עקבות.`;
};

const uniqueNames = (count) => {
  const names = new Set();

  while (names.size < count) {
    names.add(`${randomItem(FIRST_NAMES)} ${randomItem(LAST_NAMES)}`);
  }

  return [...names];
};

// Gender comes from the resolved suspect gender (deterministic-by-name
// fallback when the AI hasn't assigned one yet - see resolveGender), never
// from guessing at the role string's spelling.
const buildAlibi = (name, location, role, index, gender) => {
  const hours = ['20:15', '20:40', '21:05', '21:30', '21:50'];
  const spots = ['בחדר הבקרה', 'ליד המעלית', 'בכניסה האחורית', 'במשרד הצדדי', 'ליד אזור השירות'];
  const claimVerb = gender === 'female' ? 'טוענת' : 'טוען';
  const wasVerb = gender === 'female' ? 'הייתה' : 'היה';
  return `${name.split(' ')[0]} ${claimVerb} שבשעה ${hours[index % hours.length]} ${wasVerb} ${spots[index % spots.length]} בתוך ${location}.`;
};

// Correction-only Hebrew QA over each suspect's alibi text specifically -
// reuses the exact same runHebrewQa surgical-edit pass already used for
// WhatsApp/recording/document text, just pointed at a new field. Only the
// alibi string and the suspect's own name/gender are sent - never role,
// secret, truthProfile, or anything solution-related - so there is nothing
// in the QA's input a rewrite could leak or a correction could touch
// beyond that one sentence. Independent per-suspect calls (not one batched
// call for all suspects) so one suspect's QA failing can never cost the
// others their correction - same isolation the other QA call sites rely on.
export const applySuspectAlibiHebrewQa = async ({ generateAiText, suspects }) => Promise.all(
  (suspects || []).map(async (suspect) => {
    const alibi = `${suspect?.alibi || ''}`.trim();
    if (!alibi) return suspect;

    const [corrected] = await runHebrewQa({
      generateAiText,
      items: [{ speaker: suspect.name, text: alibi }],
      registerBlock: HEBREW_REGISTER.suspectAlibi,
      speakerGenders: { [suspect.name]: resolveGender(suspect) },
    });

    return { ...suspect, alibi: corrected?.text ?? suspect.alibi };
  }),
);

const buildEvidence = (scenario, guiltyName, location) => [
  {
    type: 'document',
    description: `דו"ח פנימי מתוך ${location} שמכיל שינוי ידני סמוך לשעת האירוע.`,
    hiddenClue: `השינוי קשור למסלול של ${guiltyName}.`,
    isFound: false,
  },
  {
    type: 'message',
    description: `הודעה דחופה שנשלחה דקות לפני שהתגלה כי ${scenario.incident}.`,
    hiddenClue: 'הטון בהודעה אישי יותר ממה שסופר.',
    isFound: false,
  },
  {
    type: 'photo',
    description: `צילום מטושטש מאזור רגיש בתוך ${location}.`,
    hiddenClue: 'פריט לבוש בולט מחבר בין שתי גרסאות סותרות.',
    isFound: false,
  },
  {
    type: 'recording',
    description: 'הקלטת אודיו קצרה עם שבריר שיחה שנקטעה בפתאומיות.',
    hiddenClue: `נשמע שם שנקשר ישירות ל-${guiltyName}.`,
    isFound: false,
  },
];

const buildTimelineMarks = (incidentTime, suspects) => {
  const [hours, minutes] = incidentTime.split(':').map(Number);
  const baseMinutes = (hours * 60) + minutes;
  const formatTime = (offset) => {
    const total = baseMinutes + offset;
    const normalizedHours = String(Math.floor(total / 60)).padStart(2, '0');
    const normalizedMinutes = String(total % 60).padStart(2, '0');
    return `${normalizedHours}:${normalizedMinutes}`;
  };

  return [
    `${formatTime(-35)}: המעורבים עדיין מפוזרים בזירה, אבל כבר מתחיל להיבנות פער בין מי שטוען שנשאר בשגרה לבין מי שזוכר תנועה חריגה או היעדרות קצרה מדי להסבר נקי.`,
    `${formatTime(-10)}: מופיע הסימן הראשון לכך שמשהו לא מתקדם לפי הנהלים הרגילים, בדרך כלל דרך גישה לא מוסברת, שיחה לחוצה או שינוי קטן בסדר הפעולות.`,
    `${incidentTime}: ${suspects[0]?.name || 'אחד המעורבים'} מזהה את הרגע שבו ברור שהאירוע כבר עבר את נקודת האל-חזור, אבל גם כאן לא כולם מסכימים מה בדיוק קרה קודם ולמה.`,
    `${formatTime(18)}: מתחילות להופיע גרסאות שלא יושבות זו עם זו על זמן, כיוון תנועה, סדר עדיפויות וקשרים שהמעורבים מעדיפים להצניע בשלב הראשון.`,
  ];
};

const buildBriefingDetails = (scenario, location, suspects, evidence, incidentTime) => {
  const context = buildNarrativeContext({
    caseName: `${scenario.theme} ב-${location}`,
    briefingDetails: {
      incidentTime,
      incidentLocation: location,
      incidentSummary: scenario.incident,
    },
    suspects,
    evidence,
  });

  return {
    incidentTime,
    incidentLocation: location,
    incidentSummary: scenario.incident,
    anomaly: buildAnomalyText(context),
    situation: buildSituationText(context),
    stakes: buildStakesText(context),
    locationContext: buildLocationContextText(context),
    timelineMarks: buildTimelineMarks(incidentTime, suspects),
    fieldSignals: buildFieldSignals(context),
    knownFacts: buildKnownFacts(context),
    openingQuestions: buildOpeningQuestions(context),
  };
};

const buildCaseSkeleton = () => {
  const scenario = randomItem(CASE_SCENARIOS);
  const location = randomItem(LOCATIONS);
  const incidentTime = randomItem(INCIDENT_TIMES);
  const names = uniqueNames(5);
  const culpritIndex = Math.floor(Math.random() * names.length);
  const culprit = names[culpritIndex];
  const method = randomItem(scenario.methodOptions);
  const motive = randomItem(scenario.motiveOptions);

  const baseSuspects = names.map((name, index) => {
    // Gender resolved BEFORE the role, so the role's grammatical form is
    // always picked to match it - never guessed from the role string
    // afterward. Deterministic-by-name at this point (no AI-assigned
    // profile exists yet) - the same derivation resolveGender falls back
    // to everywhere else, so this stays consistent with the suspect's
    // final gender.
    const gender = resolveGender({ name });
    const role = resolveRoleForGender(randomItem(ROLE_DEFINITIONS), gender);

    return {
      name,
      role,
      involvementType: deriveInvolvementTypeFromRole(role),
      isGuilty: index === culpritIndex,
      gender,
    };
  });

  return {
    scenario,
    location,
    incidentTime,
    names,
    culpritIndex,
    culprit,
    method,
    motive,
    baseSuspects,
    caseName: `${scenario.theme} ב-${location}`,
    source: 'fallback-skeleton',
  };
};

// ── AI-driven premise generation ────────────────────────────────────────
// Replaces buildCaseSkeleton()'s fixed-menu random pick as the PRIMARY path:
// an AI call invents the premise/title/location/relationships/culprit
// instead of sampling CASE_SCENARIOS/LOCATIONS/ROLE_DEFINITIONS. Those pools
// stay completely unchanged and keep serving their original role as the
// deterministic disaster-fallback (used only if the AI premise call fails
// or returns something unusable - see buildSkeletonFromPremise below and
// its caller in routes/cases.js).
//
// buildSkeletonFromPremise() repairs/validates the AI's JSON into EXACTLY
// the same shape buildCaseSkeleton() produces (scenario.incident, location,
// incidentTime, culprit, method, motive, baseSuspects, caseName), plus a
// few additive optional fields (additionalLocations, layers, redHerringPlan,
// conceptSignature) that the prompt builders below treat as optional -
// absent entirely when the disaster-fallback skeleton is used instead, with
// no crash and no degraded output beyond losing that extra richness.
const normalizeTag = (value = '') => `${value}`.trim().toLowerCase();

// Two coarse, cheap (no extra AI call) similarity signals used to decide
// whether a freshly generated premise is too close to the player's recent
// cases: an identical self-tagged mystery type, or a location type that
// repeats together with the same relationship structure. Deliberately not
// exact-string-only (see buildRecentCaseAvoidanceBlock, which already tries
// to steer the AI away proactively) - this is just the cheap local backstop
// that decides whether one retry is worth it.
export const conceptSignatureCollides = (a, b) => {
  if (!a || !b) return false;
  const premiseMatch = normalizeTag(a.premiseType) && normalizeTag(a.premiseType) === normalizeTag(b.premiseType);
  const locationAndRelationshipMatch = normalizeTag(a.locationType)
    && normalizeTag(a.locationType) === normalizeTag(b.locationType)
    && normalizeTag(a.relationshipStructure) === normalizeTag(b.relationshipStructure);
  return Boolean(premiseMatch || locationAndRelationshipMatch);
};

const isValidGender = (value) => value === 'female' || value === 'male';

// Defensive on purpose: this parses free-form AI JSON, so every field is
// optional-chained/defaulted rather than assumed present. Never throws -
// worst case it falls back to the same deterministic pools buildCaseSkeleton()
// already uses (ROLE_DEFINITIONS/LOCATIONS/INCIDENT_TIMES/uniqueNames), so a
// malformed AI premise degrades to skeleton-equivalent quality, never a crash.
export const buildSkeletonFromPremise = (premise = {}) => {
  const rawSuspects = Array.isArray(premise?.suspects) ? premise.suspects : [];

  const seen = new Set();
  const cleanedSuspects = [];
  for (const raw of rawSuspects) {
    const name = normalizeText(raw?.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    cleanedSuspects.push({ ...raw, name });
    if (cleanedSuspects.length === 5) break;
  }

  const paddingNames = uniqueNames(10).filter((name) => !seen.has(name));
  let paddingIndex = 0;
  while (cleanedSuspects.length < 5) {
    const fallbackName = paddingNames[paddingIndex] || `חשוד ${cleanedSuspects.length + 1}`;
    paddingIndex += 1;
    seen.add(fallbackName);
    cleanedSuspects.push({ name: fallbackName });
  }

  const culpritName = normalizeText(premise?.culpritName);
  let culpritIndex = cleanedSuspects.findIndex((s) => s.name === culpritName && s.isGuilty !== false);
  if (culpritIndex === -1) culpritIndex = cleanedSuspects.findIndex((s) => s.isGuilty === true);
  if (culpritIndex === -1) culpritIndex = Math.floor(Math.random() * cleanedSuspects.length);

  const baseSuspects = cleanedSuspects.map((suspect, index) => {
    const gender = isValidGender(suspect.gender) ? suspect.gender : resolveGender({ name: suspect.name });
    const role = normalizeText(suspect.role) || resolveRoleForGender(randomItem(ROLE_DEFINITIONS), gender);
    const involvementType = (suspect.involvementType === 'witness' || suspect.involvementType === 'suspect')
      ? suspect.involvementType
      : deriveInvolvementTypeFromRole(role);

    return {
      name: suspect.name,
      role,
      involvementType,
      isGuilty: index === culpritIndex,
      gender,
      relationshipNote: normalizeText(suspect.relationshipNote),
    };
  });

  const culprit = baseSuspects[culpritIndex].name;
  const location = normalizeText(premise?.location) || randomItem(LOCATIONS);
  const incidentTimeCandidate = normalizeText(premise?.incidentTime);
  const incidentTime = /^\d{2}:\d{2}$/.test(incidentTimeCandidate) ? incidentTimeCandidate : randomItem(INCIDENT_TIMES);
  const incident = normalizeText(premise?.premiseSummary) || 'אירוע חריג שדורש בירור מיידי';
  const method = normalizeText(premise?.method) || 'מהלך מדויק ומתוזמן';
  const motive = normalizeText(premise?.motive) || 'מניע אישי עמוק';

  const additionalLocations = Array.isArray(premise?.additionalLocations)
    ? premise.additionalLocations.map((item) => normalizeText(item)).filter(Boolean).slice(0, 2)
    : [];

  const rawLayers = premise?.mysteryLayers;
  const layers = rawLayers && typeof rawLayers === 'object'
    ? {
      surface: normalizeText(rawLayers.surface),
      contradiction: normalizeText(rawLayers.contradiction),
      hiddenMotivation: normalizeText(rawLayers.hiddenMotivation),
      deeperTruth: normalizeText(rawLayers.deeperTruth),
    }
    : null;

  const redHerringPlan = normalizeText(premise?.redHerringPlan);

  const rawSignature = premise?.conceptSignature;
  const conceptSignature = rawSignature && typeof rawSignature === 'object'
    ? {
      premiseType: normalizeText(rawSignature.premiseType).slice(0, 80),
      locationType: normalizeText(rawSignature.locationType).slice(0, 80),
      relationshipStructure: normalizeText(rawSignature.relationshipStructure).slice(0, 80),
      evidencePattern: normalizeText(rawSignature.evidencePattern).slice(0, 80),
      titleStyle: normalizeText(rawSignature.titleStyle).slice(0, 80),
    }
    : null;

  const caseName = normalizeText(premise?.caseName) || `תיק חקירה ב-${location}`;

  return {
    scenario: { theme: conceptSignature?.premiseType || 'תיק ייחודי', incident },
    location,
    additionalLocations,
    incidentTime,
    names: baseSuspects.map((suspect) => suspect.name),
    culpritIndex,
    culprit,
    method,
    motive,
    baseSuspects,
    caseName,
    layers,
    redHerringPlan,
    conceptSignature,
    source: 'ai-premise',
  };
};

const buildFallbackCaseData = (difficulty, commanderPersonality, skeleton = buildCaseSkeleton()) => {
  const { scenario, location, incidentTime, culprit, method, motive, baseSuspects, caseName } = skeleton;

  const suspects = baseSuspects.map((suspect, index) => ({
    ...suspect,
    personality: randomItem(PERSONALITIES),
    alibi: buildAlibi(suspect.name, location, suspect.role, index, suspect.gender),
    secret: SECRET_TEMPLATES[index % SECRET_TEMPLATES.length],
  }));

  const evidence = buildEvidence(scenario, culprit, location);
  const briefingDetails = buildBriefingDetails(scenario, location, suspects, evidence, incidentTime);
  const narrativeContext = buildNarrativeContext({
    caseName,
    briefingDetails,
    suspects,
    evidence,
  });

  return {
    caseName,
    commanderBrief: buildCommanderBriefText(narrativeContext),
    briefingDetails,
    backstory: buildBackstoryText(narrativeContext, { culprit, method, motive }),
    solution: {
      culprit,
      method,
      motive,
      explanation: buildSolutionExplanationText(narrativeContext, { culprit, method, motive }),
    },
    commanderPersonality,
    suspects,
    evidence,
  };
};

const STYLE_INSTRUCTIONS = `כתוב הכול בעברית טבעית, שוטפת, תקינה ועשירה, כאילו נכתבה בידי תסריטאי ישראלי מנוסה.
אסור לכתוב בעברית שבורה, מתורגמת מאנגלית, רובוטית, מקוטעת או כללית מדי.
כל שדה טקסטואלי חייב להכיל פרטים קונקרטיים מתוך המקרה עצמו: זמן, מקום, יחסים בין הדמויות, אינטרסים וסתירות.
אם ניסוח כלשהו נשמע גנרי, קצר מדי או לא טבעי, נסח אותו מחדש לפני ההחזרה.
אל תשתמש בביטויים חלשים כמו "משהו קרה", "בעיה", "תיאור קצר", "לא ידוע" או "יש סתירה" בלי לפרט מהי.
${HEBREW_QUALITY_CORE}
החזר רק JSON תקין ללא טקסט נוסף, ובלי גרשיים (") בתוך ערכי מחרוזות (במקום ד"ר כתוב ד׳ר).`;

const buildSuspectRosterLine = (skeleton) => skeleton.baseSuspects
  .map((suspect) => `${suspect.name} (${suspect.role})`)
  .join(', ');

// ── Premise prompt: invents the case instead of picking from a fixed menu ──
// Deliberately gives the AI categories of investigative THINKING (per the
// product brief) rather than a list of case types to select from - the
// prompt says so explicitly, and none of the guidance below is a closed
// enum the AI could latch onto as a menu.
const PREMISE_DIFFICULTY_GUIDANCE = {
  easy: `- מספר נמוך של חשודים עם מניע חופף אמיתי - רוב החשודים מתבררים כלא-רלוונטיים בבירור יחסית מהיר.
- הסתירה המרכזית ניכרת בהשוואה ישירה בין שתי ראיות, בלי צורך בכמה שלבי הסקה.
- הסבר-כיסוי אחד לכל היותר, קל להסביר לאחר גילויו.`,
  medium: `- כמה חשודים סבירים עם אינטרסים שונים, לא כולם מתבררים כתמימים בבירור ראשון.
- לפחות שכבת סתירה אחת שדורשת חיבור בין שתי ראיות ולא רק קריאה שלהן בנפרד.
- הסבר-כיסוי אחד לפחות שנשען על ראיה אמיתית ומוסבר בסוף בהיגיון מלא.`,
  hard: `- כמה חשודים עם מניעים חופפים ממש, כולל כאלה שקרובים להיראות אשמים בלי להיות.
- הפתרון האמיתי נחשף רק כשמצליבים לפחות 3 ראיות שונות.
- ציר זמן מורכב יותר, עם יותר מרגע קריטי אחד.
- לפחות הסבר-כיסוי משכנע אחד שנתמך בראיה אמיתית ומוסבר לגמרי בסוף - לעולם לא תפר לוגי.`,
};

// Steers the AI away from what THIS player has already investigated, using
// the short self-tags each past premise generated (see conceptSignature in
// buildSkeletonFromPremise) - proactive diversity, not a post-hoc reject/retry
// loop. forceMoreDifferent strengthens the wording for the one allowed retry
// (see conceptSignatureCollides / its caller in routes/cases.js).
const buildRecentCaseAvoidanceBlock = (recentSignatures = [], forceMoreDifferent = false) => {
  const lines = recentSignatures
    .map((entry, index) => {
      const sig = entry?.conceptSignature || {};
      const parts = [
        entry?.caseName ? `כותרת: "${entry.caseName}"` : '',
        sig.premiseType ? `סוג תעלומה: ${sig.premiseType}` : '',
        sig.locationType ? `קטגוריית זירה: ${sig.locationType}` : '',
        sig.relationshipStructure ? `מבנה יחסים: ${sig.relationshipStructure}` : '',
        sig.evidencePattern ? `אסטרטגיית הסבר-כיסוי: ${sig.evidencePattern}` : '',
      ].filter(Boolean).join(' | ');
      return parts ? `${index + 1}. ${parts}` : '';
    })
    .filter(Boolean);

  // Flattened, deduped pool of character names already used across those same
  // recent cases (same source/filter as `lines` above - no separate state).
  // Kept apart from the per-case lines because it's a flat "don't reuse any of
  // these" list, not a per-case fact.
  const usedNames = [...new Set(
    recentSignatures.flatMap((entry) => (Array.isArray(entry?.suspects) ? entry.suspects : [])).filter(Boolean)
  )];

  // Same pattern as usedNames: raw motive text from those same recent cases,
  // handed to the AI as soft context (not a hard rule) so it can judge for
  // itself whether it's about to reuse the same motive shape again.
  const recentMotives = recentSignatures.map((entry) => entry?.motive).filter(Boolean);

  if (lines.length === 0 && usedNames.length === 0 && recentMotives.length === 0) return '';

  const insistence = forceMoreDifferent
    ? '\nחשוב: ניסיון קודם ליצור תיק חדש היה קרוב מדי לאחד מהתיקים האלה. הפעם חובה לבחור סוג תעלומה, קטגוריית זירה ומבנה יחסים ששונים מהותית מכל מה שמופיע למטה - לא רק שינוי שמות.'
    : '';

  const casesBlock = lines.length > 0
    ? `\n\nהשחקן/ית הזה/ו כבר חקר/ה לאחרונה את התיקים הבאים - התיק החדש חייב להיות שונה באופן מהותי מכולם (לא רק בשמות דמויות, אלא בסוג התעלומה, בקטגוריית הזירה, במבנה היחסים ובאסטרטגיית הסבר-הכיסוי):\n${lines.join('\n')}${insistence}\n\nבהשוואה לתיקים האלה, שפוט/שפטי לפי משמעות, משפחה ושורש רעיוני - לא לפי מילים זהות בלבד. לדוגמה: "ספר מסתורי", "חתימה מסתורית", "דג מסתורין" ו"תעלומת הארכיון" הם כולם אותו מוטיב כותרת ("X מסתורי/ה") גם אם המילים שונות; ו"תקלת חיישן", "אתחול מחדש", "באג בתוכנה" ו"כשל אזעקה" הם כולם אותה משפחת הסבר-כיסוי טכני-סביבתי. ניסוח שונה שמסתתר מאחוריו אותו רעיון לא נחשב לגיוון אמיתי.`
    : '';

  const namesBlock = usedNames.length > 0
    ? `\n\nשמות שכבר שימשו דמויות בתיקים האחרונים של השחקן/ית - אסור להשתמש שוב באף שם פרטי+משפחה מהרשימה הזו לאף דמות בתיק החדש, כולל דמויות משנה: ${usedNames.join(', ')}. המצא/י שמות חדשים ומשכנעים, והימנע/י מלחזור על אותו מאגר שמות קטן מתיק לתיק - תוך שמירה על התאמה נכונה בין השם, המגדר והתפקיד.`
    : '';

  // Soft preference, not a rule: the AI weighs this itself rather than being
  // hard-blocked, unlike the cases/names blocks above which are phrased as
  // requirements. Deliberately not fed into conceptSignatureCollides.
  const motivesBlock = recentMotives.length > 0
    ? `\n\nמניעים ששימשו בתיקים האחרונים של השחקן/ית (רק לצורך גיוון, לא איסור מוחלט): ${recentMotives.map((m, i) => `${i + 1}. "${m}"`).join(' ')}. אם זה מתאים לעלילה, עדיף/י הפעם משפחת מניע שונה מהמניעים האלה - למשל נקמה, פחד מחשיפה, נאמנות או הגנה על מישהו, קנאה, אמונה אידאולוגית, לחץ משפחתי, כפייה/סחיטה, אובססיה אישית, שמירה על מוניטין, תחרות, מעורבות מקרית ואחריה טיוח, ירושה/רכוש, או הצדקה מוסרית - אלה דוגמאות בלבד. מניע כלכלי עדיין לגיטימי כשהוא באמת הכי מתאים לתעלומה הספציפית.`
    : '';

  return `${casesBlock}${namesBlock}${motivesBlock}`;
};

const buildCasePremisePrompt = (difficulty, recentSignatures = [], forceMoreDifferent = false) => {
  const guidance = PREMISE_DIFFICULTY_GUIDANCE[difficulty] || PREMISE_DIFFICULTY_GUIDANCE.medium;
  const avoidanceBlock = buildRecentCaseAvoidanceBlock(recentSignatures, forceMoreDifferent);

  return {
    system: `אתה סופר/ת בלשי/ת ישראלי/ת יוצר/ת עתיר/ת דמיון, שממציא/ה תעלומות חקירה מקוריות לגמרי לכל תיק.
אתה לא בוחר/ת מתוך רשימה סגורה של סוגי תיקים - בכל קריאה אתה/את ממציא/ה תרחיש חדש, שונה מהותית מכל תיק קודם.
החזר רק JSON תקין ללא טקסט נוסף, ובלי גרשיים (") בתוך ערכי מחרוזות (במקום ד"ר כתוב ד׳ר).`,
    user: `המצא/י תעלומת חקירה מקורית לגמרי, ברמת קושי ${difficulty}, בעברית.

עקרונות חובה ליצירת התעלומה (אלה כיווני חשיבה בלבד, לא תפריט לבחירה - המצא/י תרחיש חדש שמתאים לעקרונות, לעולם אל תעתיק אף דוגמה כמות שהיא):

1. התעלומה לא חייבת להתחיל בפשע. היא יכולה להיות: משהו שנראה בלתי אפשרי, כמה גרסאות סותרות לאותו אירוע, אירוע לא מוסבר, צירוף מקרים חשוד, סוד ששומרים עליו, מצב מבוים, זהות שנויה במחלוקת, רישום מזויף או מסולף, קשר לא צפוי בין אנשים, סכסוך מקצועי, אירוע תמים למראה שמסתיר הסבר אחר, פרשנות שמשתנה ככל שמתגלות ראיות, או משהו מהעבר שהופך פתאום רלוונטי.
   דוגמאות לסוג החשיבה הרצוי (השראה בלבד, אל תעתיק): "מה באמת קרה כאן?", "למה שלושה אנשים מתארים את אותה דקה בגרסאות שלא יכולות להתקיים יחד?", "למה תמונה שנראית שגרתית סותרת את כל ציר הזמן?", "מישהו ניסה בכוונה להפוך אירוע תמים לחשוד - למה?".
   חשוב לגוון גם את השאלה המרכזית שהחוקר/ת בעצם מנסה לפענח - לא כל תיק חייב להיות "מי עשה את זה". דוגמאות לשאלות מרכזיות אפשריות (השראה בלבד): מי ביצע את המעשה, האם בכלל התרחש פשע, מה באמת קרה כאן, למה הקורבן-לכאורה מת, מי משקר ועל מה בדיוק, באיזה סדר באמת קרו הדברים, האם הראיה שהוצגה אותנטית, למה מישהו ביים מצב מסוים, מי נהנה מההסבר הרשמי והמתקבל על הדעת, איזה קשר נסתר מחבר בין החשודים, או האם החשוד המתבקש מאליו באמת אחראי. בכל מקרה הפתרון הסופי חייב להישאר הגיוני לחלוטין וניתן לפענוח על ידי השחקן/ית - אל תקריב/י פתירות תמורת מקוריות.

2. הכותרת (caseName) חייבת להיות מסקרנת ולא גנרית - אסור בהחלט תבנית "ה[תקרית] ב[מקום]" (למשל "ההיעלמות במלון"). מותר ורצוי: כותרת פיוטית, אירונית, מטאפורית, מבוססת חפץ, מבוססת סתירה, מבוססת משפט זכיר, או מבוססת פרט שנראה זניח - אבל הדימוי, המילה או הרעיון המרכזי בכותרת חייבים לנבוע מפרט קונקרטי שבאמת קיים בתיק הזה (חפץ, אירוע, רמז, מנגנון, או פרט מהעלילה), ולא להיבחר רק כי הוא נשמע מסתורי. הימנע/י ממוטיבים אווירתיים גנריים כמו "צליל", "שקט", "דממה", "צללים" וכדומה, אלא אם המוטיב הזה באמת קשור לאירוע, לרמז, לחפץ או למנגנון מרכזי בתעלומה עצמה. אם מופיעות בהמשך ההנחיה כותרות של תיקים קודמים, הימנע/י מלחזור על אותה מילת-מפתח מרכזית, שורש מילולי, או מוטיב חושי דומיננטי - גם כשהנושא שונה. הכותרת צריכה לעורר סקרנות בלי להטעות את השחקן/ית לגבי מהות החקירה, ואסור שתחשוף את החשוד/ה האשמ/ה, המניע או הפתרון.

3. הזירה חייבת לנבוע מהסיפור עצמו, לא מרשימה - אבל חשוב לגוון גם את קטגוריית הזירה, לא רק את שם הבניין הספציפי. קטגוריות לדוגמה בלבד (לא רשימה סגורה, ואין צורך לכסות את כולן): מגורים/ביתי, מסחרי, מסעדנות/אירוח, מקום עבודה, בית חולים/רפואי, בית ספר/חינוכי, תחבורה, שטח פתוח/ציבורי, מרחב דיגיטלי, תעשייתי, תרבותי, אקדמי, ממשלתי/ציבורי-אזרחי, פיננסי, בידור/פנאי. אם מופיעות בהמשך ההנחיה קטגוריות זירה שכבר שימשו בתיקים אחרונים, עדיף/י הפעם קטגוריה שלא הופיעה ביניהן על פני עוד גרסה של אותה קטגוריה עם שם מקום אחר. הימנע/י ממלון, דירה, בית או משרד גנרי אלא אם זה ממש נובע מהעלילה.

4. בין החשודים חייב להתקיים מבנה יחסים משמעותי, לא סתם אנשים שנקרו בסביבה - למשל יריבות מקצועית, יחסי מנטור-חניך, עמיתים לשעבר, מתח משפחתי, תלות כלכלית, בני זוג לשעבר, יחסי סמכות-כפיפות, אנשים שחושבים שהם מכירים זה את זה אך טועים, מישהו שמגן על מישהו אחר, מערכת יחסים רומנטית, בגידה בחברות, שותפים עסקיים, סכסוך שכנים, מחלוקת ירושה, מטפל/ת ומטופל/ת התלוי/ה בו/בה, עיתונאי/ת ומקור, מורה ותלמיד/ה, ארגונים יריבים, זר/ה עם קשר נסתר, יחסי סחיטה, או קורבן ושותף/ה לשעבר לפשע. לכל חשוד/ה מרכזי/ת חייבת להיות סיבה אמיתית להיות רלוונטי/ת לחקירה. הימנע/י לחזור שוב ושוב על אותו שילוב של זירה מוסדית + יריבות מקצועית + מניע כלכלי/קידום + מניפולציה פנימית של ראיות, אלא אם העלילה הספציפית הזו מצדיקה זאת.

5. בנה/י את התעלומה בשכבות כשמתאים: הסבר פני השטח (מה נראה שקרה כלפי חוץ), סתירה (מה לא מסתדר), מניע נסתר (למה מישהו משקר או מסתיר מידע), אמת עמוקה יותר (מה באמת קרה). לא כל תיק חייב בדיוק 4 שכבות.

6. תכנן/י גם הסבר-כיסוי אחד (red herring) שנשען על ראיה אמיתית ונשמע סביר, אך יתברר בסוף כטעות פרשנות ולא כשקר של המשחק כלפי השחקן/ית. חשוב לגוון את סוג אסטרטגיית ההטעיה עצמה, לא רק את הפרטים שלה - למשל: אליבי שגוי, פרשנות מוטעית של עדות, סוד תמים שגורם למישהו להיראות אשם, ראיה שתוכננה/הושתלה, מניע מטעה, חשוד שגוי בגלל ראיות נסיבתיות, זירה מבוימת, ציר זמן שגוי, אי-הבנה טכנולוגית, טעות בזיהוי, תאונה שנראית מכוונת (או להפך), הודאת שווא, צירוף מקרים, עדויות עדים סותרות, או התנהגות חשודה אמיתית שאינה קשורה בפועל לפשע. אלה דוגמאות ולא רשימה סגורה - בחר/י אסטרטגיה שמתאימה לתעלומה הספציפית. שים/י לב: חיישן תקול, באג בתוכנה, אתחול מחדש של מערכת, כשל אזעקה, תקלת ציוד, וכל "הסבר טכני/סביבתי תמים שמתברר כשגוי או כטיוח" - כל אלה הם ביטויים שונים של אותה משפחת אסטרטגיה אחת, גם כשהניסוח שונה, ולא כמה אסטרטגיות נפרדות. אם בתיקים האחרונים המפורטים למטה כבר הופיעה גרסה כלשהי של המשפחה הזו, עדיף/י הפעם משפחת הטעיה אחרת מהרשימה למעלה, אלא אם היא ממש הכי מתאימה לתעלומה הספציפית - הטעיה טכנית עדיין לגיטימית כשהיא באמת הכי מתאימה, זו העדפה לגיוון ולא איסור.

7. שמות הדמויות חייבים להיות שמות עבריים חדשים ומשכנעים בכל תיק - הימנע/י מלחזור באופן קבוע על אותו מאגר שמות קטן מתיק לתיק, ושמור/שמרי תמיד על התאמה נכונה בין השם, המגדר שצוין והתפקיד.

איך רמת הקושי צריכה להשפיע על מבנה התעלומה עצמה (לא רק על ניסוח הראיות בהמשך):
${guidance}${avoidanceBlock}

חובה: בדיוק 5 חשודים/עדים, בדיוק אחד/ת מהם אשם/ה בפועל.

${STYLE_INSTRUCTIONS}

החזר JSON בפורמט הבא בדיוק:
{
  "caseName": "כותרת מסקרנת ולא גנרית",
  "premiseSummary": "2 עד 3 משפטים שמתארים את האירוע המרכזי כפי שהוא נראה כלפי חוץ בתחילת החקירה",
  "location": "הזירה המרכזית, ספציפית לסיפור",
  "additionalLocations": ["זירה נוספת אם הסיפור באמת נע בין כמה מקומות, אחרת מערך ריק"],
  "incidentTime": "שעה בפורמט HH:MM",
  "suspects": [
    { "name": "שם מלא בעברית", "gender": "female או male", "role": "תפקיד/זהות בהתאמה דקדוקית למגדר שצוין", "involvementType": "suspect או witness", "relationshipNote": "היחס של הדמות הזאת לשאר המעורבים ולמה זה רלוונטי לחקירה", "isGuilty": true או false }
  ],
  "culpritName": "השם המדויק של החשוד/ה האשמ/ה בפועל, זהה לחלוטין לשם שברשימה למעלה",
  "method": "השיטה שבה בוצע המהלך",
  "motive": "המניע האמיתי",
  "mysteryLayers": { "surface": "...", "contradiction": "...", "hiddenMotivation": "...", "deeperTruth": "..." },
  "redHerringPlan": "תיאור קצר של הסבר-הכיסוי המתוכנן, ולמה הוא בסוף מוסבר בהיגיון מלא",
  "conceptSignature": { "premiseType": "תיוג קצר של סוג התעלומה (2-4 מילים)", "locationType": "תיוג קצר של קטגוריית הזירה (למשל: ביתי, מסחרי, מקום עבודה, רפואי, חינוכי, תחבורה, ציבורי/פתוח, דיגיטלי, תעשייתי, תרבותי, אקדמי, ממשלתי, פיננסי, בידור) - לא שם המקום הספציפי", "relationshipStructure": "תיוג קצר של מבנה היחסים המרכזי", "evidencePattern": "תיוג קצר של אסטרטגיית הסבר-הכיסוי (red herring) שנבחרה בתיק הזה", "titleStyle": "תיוג קצר של סגנון הכותרת" }
}

מערך suspects חייב להכיל בדיוק 5 איברים.`,
  };
};

const buildCommanderAndBackstoryPrompt = (skeleton, difficulty, commanderPersonality) => {
  const layersBlock = skeleton.layers?.hiddenMotivation || skeleton.layers?.deeperTruth
    ? `\nשכבות התעלומה (סודי, לשימוש פנימי - שלב אותן בעדינות בתוך הרקע, אל תסביר אותן במפורש כרשימה): פני השטח - ${skeleton.layers.surface || ''}; הסתירה - ${skeleton.layers.contradiction || ''}; המניע הנסתר - ${skeleton.layers.hiddenMotivation || ''}; האמת העמוקה - ${skeleton.layers.deeperTruth || ''}.`
    : '';

  return `צור עבור תיק חקירה ברמת קושי ${difficulty} שלושה טקסטים דרמטיים בעברית.
אישיות המפקד: ${commanderPersonality}.

הקשר התיק (קבוע, אל תשנה אותו): הזירה היא ${skeleton.location}, האירוע הוא "${skeleton.scenario.incident}", חלון הזמן הקריטי הוא ${skeleton.incidentTime}.
המעורבים המרכזיים: ${buildSuspectRosterLine(skeleton)}.
מאחורי הקלעים (סודי, לשימוש פנימי בלבד): האחראי בפועל הוא ${skeleton.culprit}, שפעל באמצעות "${skeleton.method}", מתוך מניע של "${skeleton.motive}".${layersBlock}

${STYLE_INSTRUCTIONS}

החזר JSON בפורמט:
{
  "commanderBrief": "בריף דרמטי קצר מהמפקד לחוקר/ת, 3 עד 4 משפטים מלאים ומפורטים - חייב לרתק ולתאר את הדחיפות בלי לרמוז מיהו האחראי בפועל",
  "backstory": "רקע מלא וסודי על מה שבאמת קרה מאחורי הקלעים, 4 עד 6 משפטים מלאים עם פרטים קונקרטיים",
  "solutionExplanation": "לפחות 2 משפטים מלאים שמסבירים בפירוט למה דווקא ${skeleton.culprit} אחראי/ת, בהתבסס על השיטה והמניע שניתנו"
}`;
};

const buildBriefingDetailsPrompt = (skeleton, difficulty) => {
  const contradictionHint = skeleton.layers?.contradiction
    ? `\nרמז לסתירה שכבר מתוכננת בתיק (סודי, לשימוש פנימי - השתמש בו כהשראה ל-anomaly בלי לחשוף את הפתרון): ${skeleton.layers.contradiction}`
    : '';

  return `צור עבור תיק חקירה ברמת קושי ${difficulty} את פרטי התדריך הפתיחתי לחוקר/ת, בעברית.

הקשר התיק (קבוע, אל תשנה אותו): הזירה היא ${skeleton.location}, האירוע הוא "${skeleton.scenario.incident}", חלון הזמן הקריטי הוא ${skeleton.incidentTime}.
המעורבים המרכזיים: ${buildSuspectRosterLine(skeleton)}.${contradictionHint}

${STYLE_INSTRUCTIONS}

החזר JSON בפורמט:
{
  "anomaly": "2 עד 3 משפטים מלאים על מה לא מסתדר ולמה זה חריג",
  "situation": "2 עד 3 משפטים מלאים שמסכמים את מצב הפתיחה",
  "stakes": "2 עד 3 משפטים מלאים על למה המקרה דחוף ומה הסיכון אם לא נפעל נכון",
  "locationContext": "2 עד 3 משפטים מלאים על מה מיוחד בזירה ולמה זה חשוב",
  "timelineMarks": ["ציון זמן 1 מפורט", "ציון זמן 2 מפורט", "ציון זמן 3 מפורט", "ציון זמן 4 מפורט"],
  "fieldSignals": ["סימן זירה 1 מפורט", "סימן זירה 2 מפורט", "סימן זירה 3 מפורט"],
  "knownFacts": ["עובדה 1 מפורטת", "עובדה 2 מפורטת", "עובדה 3 מפורטת"],
  "openingQuestions": ["שאלת פתיחה 1", "שאלת פתיחה 2", "שאלת פתיחה 3"]
}`;
};

const buildSuspectsDetailPrompt = (skeleton, difficulty) => `צור עבור תיק חקירה ברמת קושי ${difficulty} פרופיל חקירתי לכל אחד מהמעורבים הבאים, בעברית, באותו סדר שניתן.

הקשר התיק (קבוע, אל תשנה אותו): הזירה היא ${skeleton.location}, האירוע הוא "${skeleton.scenario.incident}", חלון הזמן הקריטי הוא ${skeleton.incidentTime}.
רשימת המעורבים לפי הסדר (סודי, לשימוש פנימי בלבד - אל תחשוף מי מהם אשם בטקסט עצמו):
${skeleton.baseSuspects.map((suspect, index) => `${index + 1}. ${suspect.name}, תפקיד: ${suspect.role}, מגדר: ${suspect.gender === 'female' ? 'אישה' : 'גבר'}, ${suspect.isGuilty ? 'זהו האחראי בפועל לאירוע' : 'לא אחראי/ת לאירוע'}${suspect.relationshipNote ? `, יחס לשאר המעורבים: ${suspect.relationshipNote}` : ''}`).join('\n')}

${STYLE_INSTRUCTIONS}

חשוב לגבי מגדר: כתוב את personality/alibi/secret של כל דמות בהתאמה דקדוקית מלאה למגדר שצוין לה למעלה (גוף ראשון ושלישי כאחד - פעלים, כינויי גוף, שמות תואר). בשדות appearanceProfile.gender ו-voiceProfile.gender החזר בדיוק את אותו מגדר שצוין למעלה (female או male בלבד) - אל תסטה ממנו ואל תבחר מגדר שונה בין שני השדות.
אם ניתן "יחס לשאר המעורבים" לדמות מסוימת, שלב אותו בעדינות בתוך ה-personality וה-secret שלה כך שהיחס בין הדמויות ירגיש אמיתי ולא מקרי - בלי לחזור על הניסוח מילה במילה.

לכל דמות הוסף גם appearanceProfile ו-voiceProfile: פרופיל זהות קבוע שישמש בעתיד ליצירת תמונות והקלטות עקביות לאותה דמות. כתוב את הערכים באנגלית מבנית קצרה (לא עברית, לא משפטים) - זו מטא-דאטה טכנית, לא טקסט שהשחקן רואה. שמור על עקביות פנימית (לדוגמה גיל שמתאים לתפקיד).

החזר JSON בפורמט (מערך suspects חייב להכיל בדיוק ${skeleton.baseSuspects.length} איברים, באותו סדר בדיוק כמו הרשימה למעלה):
{
  "suspects": [
    {
      "personality": "אישיות חקירתית מנוסחת בעברית טבעית, לא במשפט קצר או טכני",
      "alibi": "אליבי מנוסח בעברית טבעית עם פרטי זמן ומקום קונקרטיים",
      "secret": "סוד אישי מנוסח בעברית טבעית שהדמות מסתירה",
      "truthProfile": { "liesAbout": ["נושא1"], "nervousTriggers": ["מילה1", "מילה2"], "truthLevel": 0.7 },
      "writingProfile": { "style": "תיאור כתב היד (למשל: כתב יד קטן ומסודר)", "pressure": "קלה/בינונית/חזקה", "spacing": "צפופה/רגילה/מרווחת", "consistency": "גבוהה/בינונית/נמוכה" },
      "appearanceProfile": { "age": 34, "gender": "female/male", "hair": "e.g. long brown hair", "eyes": "e.g. brown", "skinTone": "e.g. light", "bodyType": "e.g. slim", "clothingStyle": "e.g. casual elegant", "distinctiveFeatures": ["e.g. silver bracelet"] },
      "voiceProfile": { "age": 34, "gender": "female/male", "pitch": "low/medium/high", "speed": "slow/normal/fast", "tone": "e.g. calm", "accent": "e.g. Israeli", "personality": "e.g. confident but slightly nervous" }
    }
  ]
}`;

// Difficulty here controls how much the blueprint's OWN text fields
// (primaryClue/secondaryClue) demand cross-referencing between evidence
// items - independent of, and additive to, the existing difficulty→visual-
// prominence mapping already in fluxImage.js (CLUE_VISIBILITY_BY_DIFFICULTY)
// and the existing dialogue-directness mapping in recordingEvidence.js
// (DIFFICULTY_GUIDANCE). Neither of those is touched or duplicated here.
const EVIDENCE_DIFFICULTY_GUIDANCE = {
  easy: 'ברוב הראיות ה-primaryClue ברור וניתן לזיהוי כבר בקריאה/צפייה ראשונה, עם מעט מאוד צורך להצליב בין ראיות.',
  medium: 'בחלק מהראיות ה-primaryClue מקבל את מלוא המשמעות שלו רק כשמשווים אותו מול ראיה נוספת, לא רק בקריאה בודדת.',
  hard: 'ברוב הראיות ה-primaryClue מקבל משמעות מלאה רק כשמצליבים אותו עם ראיה נוספת בתיק, ולפחות secondaryClue אחד נראה זניח או לא קשור עד שמשווים אותו לראיה אחרת.',
};

const resolveEvidenceDifficultyGuidance = (difficulty) => EVIDENCE_DIFFICULTY_GUIDANCE[difficulty] || EVIDENCE_DIFFICULTY_GUIDANCE.medium;

const buildEvidencePrompt = (skeleton, difficulty) => {
  const locationInstruction = skeleton.additionalLocations?.length
    ? `תת-מיקום מדויק בתוך ${skeleton.location} או באחת הזירות הנוספות של התיק (${skeleton.additionalLocations.join(', ')}), לפי מה שהגיוני לתוכן הראיה הזאת (למשל "מסדרון שירות בקומה השלישית")`
    : `תת-מיקום מדויק בתוך ${skeleton.location} שבו הראיה הזאת מתרחשת (למשל "מסדרון שירות בקומה השלישית"), לא סתם חזרה על שם הזירה הכללית`;

  const layersBlock = skeleton.layers?.contradiction || skeleton.layers?.deeperTruth
    ? `\n\nשכבות התעלומה שכבר הוגדרו לתיק הזה (סודי, לשימוש פנימי - אל תחשוף אותן במפורש בטקסט הראיה):
- פני השטח: ${skeleton.layers.surface || ''}
- הסתירה: ${skeleton.layers.contradiction || ''}
- המניע הנסתר: ${skeleton.layers.hiddenMotivation || ''}
- האמת העמוקה: ${skeleton.layers.deeperTruth || ''}
חלק את הרמזים בין הראיות כך שכל שכבה נתמכת בלפחות ראיה אחת - אין צורך שראיה בודדת תחשוף הכול.`
    : '';

  const redHerringBlock = skeleton.redHerringPlan
    ? `\n\nהסבר-כיסוי מתוכנן לתיק (red herring, סודי, לשימוש פנימי): ${skeleton.redHerringPlan}\nלפחות ראיה אחת צריכה לתמוך בהסבר-הכיסוי הזה בצורה אמינה - כזו שתתפרש נכון רק בסוף החקירה, ולעולם לא כשקר של המשחק כלפי השחקן/ית.`
    : '';

  return `צור עבור תיק חקירה ברמת קושי ${difficulty} לפחות 4 ולכל היותר 6 פריטי ראיה, בעברית.

הקשר התיק (קבוע, אל תשנה אותו): הזירה היא ${skeleton.location}, האירוע הוא "${skeleton.scenario.incident}".
מאחורי הקלעים (סודי, לשימוש פנימי בלבד): האחראי בפועל הוא ${skeleton.culprit}.
הדמויות הקיימות בתיק (אסור בהחלט להמציא דמות נוספת או שם נוסף מעבר לרשימה הזאת): ${buildSuspectRosterLine(skeleton)}.${layersBlock}${redHerringBlock}

לפני שאתה כותב את הראיות בפועל, תכנן/י בראש איך הן מתחברות זו לזו כרשת אחת ולא כפריטים נפרדים: איזו ראיה קובעת עובדה או ציר זמן בסיסי, איזו ראיה נראית לא קשורה אבל בעצם סותרת אותו, איזו ראיה מסבירה מדוע קיימת הסתירה, ואיזו ראיה חושפת מי היה בעל ההזדמנות ליצור אותה. לכל ראיה בפועל חייבת להיות סיבה אמיתית להתקיים בזירה הזאת - אל תיצור ראיה רק כי "צריך עוד סוג אחד".

כלל מחייב: חובה שיהיה בדיוק פריט אחד מכל אחד מהסוגים message, photo, document, recording (ארבעת הסוגים חייבים להופיע, כל אחד פעם אחת). אם אתה יוצר פריט חמישי או שישי, בחר עבורו סוג נוסף לפי שיקולך — אבל אסור שיהיו שני פריטים מאותו סוג לפני שכל ארבעת הסוגים כבר מיוצגים.

רמת קושי ומידת הגילוי של הרמזים: ${resolveEvidenceDifficultyGuidance(difficulty)} בכל מקרה, כל רמז חייב להיות ניתן לגילוי ע"י חוקר/ת קשוב/ה - לעולם לא בלתי אפשרי לזהות, גם ברמת קושי קשה.

לגבי ראיות מסוג photo במיוחד: אל תניח כברירת מחדל שחייב להופיע חשוד בתמונה. קודם תחשוב/י מה השאלה החקירתית שהתמונה אמורה לענות עליה, ורק אז תחליט/י מה הכי הגיוני לצלם - זירה, חפץ, פרט זעיר, עקבה של פעולה, משהו שהוזז, השתקפות, או פרט שנראה תמים עד שמשווים אותו לראיה אחרת. participants יכול להיות מערך ריק כשזה נכון לתוכן התמונה.

לכל פריט הוסף גם:
- "purpose": מה תפקיד הראיה בחקירה (למשל "לסתור את האליבי של X")
- "primaryClue": הרמז המרכזי העובדתי שהשחקן אמור לגלות מהראיה הזאת, מנוסח כעובדה קונקרטיות (מי, מה, איפה, מתי) - זה מקור האמת של הראיה, לא תיאור כללי
- "secondaryClue": רמז משני, עדין יותר, שהופך לשימושי בשילוב עם ראיות אחרות (אופציונלי, אפשר מחרוזת ריקה)
- "participants": מערך של 0 עד 2 שמות מתוך רשימת הדמויות הקיימות בלבד, של מי שקשור ישירות לראיה הזאת (למשל שני הצדדים לשיחה, או מי שכתב/חתום על מסמך). אסור לשים שם שלא ברשימת הדמויות.
- "location": ${locationInstruction}
- "time": שעה משוערת (פורמט HH:MM) שבה האירוע שמתועד בראיה הזאת קרה, בדרך כלל קרוב לחלון הזמן הקריטי ${skeleton.incidentTime}
- "visualDetails": מערך של 3 עד 5 עובדות חזותיות קונקרטיות וספציפיות לסצנה הזו בלבד (חפצים, תנוחה, תאורה, מיקום מדויק) - אסור לתאר כאן את המראה הקבוע של הדמות עצמה (שיער, גובה וכו'), רק מה שקורה/נראה בסצנה הספציפית הזו

לפריטים מסוג "document" בלבד, הוסף גם:
- "artifactType": אחד מ: ${DOCUMENT_ARTIFACT_TYPES.join(', ')}. בחר את הסוג שהכי הגיוני לתוכן ולסיפור (למשל פתק שהושאר בכיס → handwritten_note, רישום גישה למקום מאובטח → security_access_log, מייל שהודפס → printed_email). אל תבחר תמיד official_report.

${STYLE_INSTRUCTIONS}

החזר JSON בפורמט:
{
  "evidence": [
    {
      "type": "אחד מ: ${EVIDENCE_TYPES.join(', ')}",
      "description": "תיאור הראיה בעברית טבעית, עם פרטים קונקרטיים מהזירה",
      "hiddenClue": "הרמז הנסתר שמקשר בעדינות בין הראיה לבין ${skeleton.culprit}, בלי להיות חד מדי",
      "purpose": "תפקיד הראיה בחקירה",
      "primaryClue": "הרמז המרכזי העובדתי, קונקרטי (מי/מה/איפה/מתי)",
      "secondaryClue": "רמז משני עדין או מחרוזת ריקה",
      "participants": ["שם מדויק מרשימת הדמויות"],
      "location": "תת-מיקום מדויק",
      "time": "שעה משוערת, פורמט HH:MM",
      "visualDetails": ["עובדה חזותית ספציפית לסצנה 1", "עובדה חזותית ספציפית לסצנה 2", "עובדה חזותית ספציפית לסצנה 3"],
      "artifactType": "רק לפריטים מסוג document — אחד מהרשימה שניתנה"
    }
  ]
}`;
};

const enrichCaseText = (caseData = {}, fallbackCase = {}) => {
  const mergedCase = {
    ...fallbackCase,
    ...caseData,
    briefingDetails: {
      ...(fallbackCase.briefingDetails || {}),
      ...(caseData.briefingDetails || {}),
    },
    solution: {
      ...(fallbackCase.solution || {}),
      ...(caseData.solution || {}),
    },
    suspects: Array.isArray(caseData.suspects) && caseData.suspects.length > 0
      ? caseData.suspects
      : (fallbackCase.suspects || []),
    evidence: Array.isArray(caseData.evidence) && caseData.evidence.length > 0
      ? caseData.evidence
      : (fallbackCase.evidence || []),
  };

  const context = buildNarrativeContext(mergedCase);

  return {
    ...mergedCase,
    commanderBrief: hasRichNarrative(mergedCase.commanderBrief, 220)
      ? normalizeText(mergedCase.commanderBrief)
      : buildCommanderBriefText(context),
    briefingDetails: {
      incidentTime: normalizeText(mergedCase.briefingDetails.incidentTime) || context.incidentTime,
      incidentLocation: normalizeText(mergedCase.briefingDetails.incidentLocation) || context.incidentLocation,
      incidentSummary: normalizeText(mergedCase.briefingDetails.incidentSummary) || context.incidentSummary,
      anomaly: hasRichNarrative(mergedCase.briefingDetails.anomaly, 150)
        ? normalizeText(mergedCase.briefingDetails.anomaly)
        : buildAnomalyText(context),
      situation: hasRichNarrative(mergedCase.briefingDetails.situation, 170)
        ? normalizeText(mergedCase.briefingDetails.situation)
        : buildSituationText(context),
      stakes: hasRichNarrative(mergedCase.briefingDetails.stakes, 150)
        ? normalizeText(mergedCase.briefingDetails.stakes)
        : buildStakesText(context),
      locationContext: hasRichNarrative(mergedCase.briefingDetails.locationContext, 150)
        ? normalizeText(mergedCase.briefingDetails.locationContext)
        : buildLocationContextText(context),
      timelineMarks: hasRichList(mergedCase.briefingDetails.timelineMarks, 4, 54)
        ? mergedCase.briefingDetails.timelineMarks.map((item) => normalizeText(item))
        : buildTimelineMarks(context.incidentTime, context.suspects),
      fieldSignals: hasRichList(mergedCase.briefingDetails.fieldSignals, 3, 52)
        ? mergedCase.briefingDetails.fieldSignals.map((item) => normalizeText(item))
        : buildFieldSignals(context),
      knownFacts: hasRichList(mergedCase.briefingDetails.knownFacts, 3, 52)
        ? mergedCase.briefingDetails.knownFacts.map((item) => normalizeText(item))
        : buildKnownFacts(context),
      openingQuestions: hasRichList(mergedCase.briefingDetails.openingQuestions, 3, 52)
        ? mergedCase.briefingDetails.openingQuestions.map((item) => normalizeText(item))
        : buildOpeningQuestions(context),
    },
    backstory: hasRichNarrative(mergedCase.backstory, 240)
      ? normalizeText(mergedCase.backstory)
      : buildBackstoryText(context, mergedCase.solution),
    solution: {
      ...mergedCase.solution,
      explanation: hasRichNarrative(mergedCase.solution.explanation, 190)
        ? normalizeText(mergedCase.solution.explanation)
        : buildSolutionExplanationText(context, mergedCase.solution),
    },
  };
};

export {
  EVIDENCE_TYPES,
  NVIDIA_TEXT_MODEL,
  buildCaseSkeleton,
  buildFallbackCaseData,
  enrichCaseText,
  buildCommanderAndBackstoryPrompt,
  buildBriefingDetailsPrompt,
  buildSuspectsDetailPrompt,
  buildEvidencePrompt,
  buildCasePremisePrompt,
};