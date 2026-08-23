import {
  DOCUMENT_ARTIFACT_TYPES, resolveGender, HEBREW_QUALITY_CORE, HEBREW_REGISTER, runHebrewQa,
} from './services/evidenceBlueprint.js';

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

const buildCommanderAndBackstoryPrompt = (skeleton, difficulty, commanderPersonality) => `צור עבור תיק חקירה ברמת קושי ${difficulty} שלושה טקסטים דרמטיים בעברית.
אישיות המפקד: ${commanderPersonality}.

הקשר התיק (קבוע, אל תשנה אותו): הזירה היא ${skeleton.location}, האירוע הוא "${skeleton.scenario.incident}", חלון הזמן הקריטי הוא ${skeleton.incidentTime}.
המעורבים המרכזיים: ${buildSuspectRosterLine(skeleton)}.
מאחורי הקלעים (סודי, לשימוש פנימי בלבד): האחראי בפועל הוא ${skeleton.culprit}, שפעל באמצעות "${skeleton.method}", מתוך מניע של "${skeleton.motive}".

${STYLE_INSTRUCTIONS}

החזר JSON בפורמט:
{
  "commanderBrief": "בריף דרמטי קצר מהמפקד לחוקר/ת, 3 עד 4 משפטים מלאים ומפורטים - חייב לרתק ולתאר את הדחיפות בלי לרמוז מיהו האחראי בפועל",
  "backstory": "רקע מלא וסודי על מה שבאמת קרה מאחורי הקלעים, 4 עד 6 משפטים מלאים עם פרטים קונקרטיים",
  "solutionExplanation": "לפחות 2 משפטים מלאים שמסבירים בפירוט למה דווקא ${skeleton.culprit} אחראי/ת, בהתבסס על השיטה והמניע שניתנו"
}`;

const buildBriefingDetailsPrompt = (skeleton, difficulty) => `צור עבור תיק חקירה ברמת קושי ${difficulty} את פרטי התדריך הפתיחתי לחוקר/ת, בעברית.

הקשר התיק (קבוע, אל תשנה אותו): הזירה היא ${skeleton.location}, האירוע הוא "${skeleton.scenario.incident}", חלון הזמן הקריטי הוא ${skeleton.incidentTime}.
המעורבים המרכזיים: ${buildSuspectRosterLine(skeleton)}.

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

const buildSuspectsDetailPrompt = (skeleton, difficulty) => `צור עבור תיק חקירה ברמת קושי ${difficulty} פרופיל חקירתי לכל אחד מהמעורבים הבאים, בעברית, באותו סדר שניתן.

הקשר התיק (קבוע, אל תשנה אותו): הזירה היא ${skeleton.location}, האירוע הוא "${skeleton.scenario.incident}", חלון הזמן הקריטי הוא ${skeleton.incidentTime}.
רשימת המעורבים לפי הסדר (סודי, לשימוש פנימי בלבד - אל תחשוף מי מהם אשם בטקסט עצמו):
${skeleton.baseSuspects.map((suspect, index) => `${index + 1}. ${suspect.name}, תפקיד: ${suspect.role}, מגדר: ${suspect.gender === 'female' ? 'אישה' : 'גבר'}, ${suspect.isGuilty ? 'זהו האחראי בפועל לאירוע' : 'לא אחראי/ת לאירוע'}`).join('\n')}

${STYLE_INSTRUCTIONS}

חשוב לגבי מגדר: כתוב את personality/alibi/secret של כל דמות בהתאמה דקדוקית מלאה למגדר שצוין לה למעלה (גוף ראשון ושלישי כאחד - פעלים, כינויי גוף, שמות תואר). בשדות appearanceProfile.gender ו-voiceProfile.gender החזר בדיוק את אותו מגדר שצוין למעלה (female או male בלבד) - אל תסטה ממנו ואל תבחר מגדר שונה בין שני השדות.

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

const buildEvidencePrompt = (skeleton, difficulty) => `צור עבור תיק חקירה ברמת קושי ${difficulty} לפחות 4 ולכל היותר 6 פריטי ראיה, בעברית.

הקשר התיק (קבוע, אל תשנה אותו): הזירה היא ${skeleton.location}, האירוע הוא "${skeleton.scenario.incident}".
מאחורי הקלעים (סודי, לשימוש פנימי בלבד): האחראי בפועל הוא ${skeleton.culprit}.
הדמויות הקיימות בתיק (אסור בהחלט להמציא דמות נוספת או שם נוסף מעבר לרשימה הזאת): ${buildSuspectRosterLine(skeleton)}.

כלל מחייב: חובה שיהיה בדיוק פריט אחד מכל אחד מהסוגים message, photo, document, recording (ארבעת הסוגים חייבים להופיע, כל אחד פעם אחת). אם אתה יוצר פריט חמישי או שישי, בחר עבורו סוג נוסף לפי שיקולך — אבל אסור שיהיו שני פריטים מאותו סוג לפני שכל ארבעת הסוגים כבר מיוצגים.

לכל פריט הוסף גם:
- "purpose": מה תפקיד הראיה בחקירה (למשל "לסתור את האליבי של X")
- "primaryClue": הרמז המרכזי העובדתי שהשחקן אמור לגלות מהראיה הזאת, מנוסח כעובדה קונקרטיות (מי, מה, איפה, מתי) - זה מקור האמת של הראיה, לא תיאור כללי
- "secondaryClue": רמז משני, עדין יותר, שהופך לשימושי בשילוב עם ראיות אחרות (אופציונלי, אפשר מחרוזת ריקה)
- "participants": מערך של 0 עד 2 שמות מתוך רשימת הדמויות הקיימות בלבד, של מי שקשור ישירות לראיה הזאת (למשל שני הצדדים לשיחה, או מי שכתב/חתום על מסמך). אסור לשים שם שלא ברשימת הדמויות.
- "location": תת-מיקום מדויק בתוך ${skeleton.location} שבו הראיה הזאת מתרחשת (למשל "מסדרון שירות בקומה השלישית"), לא סתם חזרה על שם הזירה הכללית
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
      "location": "תת-מיקום מדויק בתוך ${skeleton.location}",
      "time": "שעה משוערת, פורמט HH:MM",
      "visualDetails": ["עובדה חזותית ספציפית לסצנה 1", "עובדה חזותית ספציפית לסצנה 2", "עובדה חזותית ספציפית לסצנה 3"],
      "artifactType": "רק לפריטים מסוג document — אחד מהרשימה שניתנה"
    }
  ]
}`;

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
  buildCaseSkeleton,
  buildFallbackCaseData,
  enrichCaseText,
  buildCommanderAndBackstoryPrompt,
  buildBriefingDetailsPrompt,
  buildSuspectsDetailPrompt,
  buildEvidencePrompt,
};