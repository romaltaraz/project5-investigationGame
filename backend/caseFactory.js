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
const ROLES = ['מנהל תפעול', 'איש תחזוקה', 'חוקרת פנים', 'עד ראייה', 'יועץ חיצוני', 'אחראית משמרת', 'שותף עסקי', 'מתאמת מערכת'];
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

const buildAlibi = (name, location, role, index) => {
  const hours = ['20:15', '20:40', '21:05', '21:30', '21:50'];
  const spots = ['בחדר הבקרה', 'ליד המעלית', 'בכניסה האחורית', 'במשרד הצדדי', 'ליד אזור השירות'];
  return `${name.split(' ')[0]} טוען${role.endsWith('ת') ? 'ת' : ''} שבשעה ${hours[index % hours.length]} היה ${spots[index % spots.length]} בתוך ${location}.`;
};

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

const buildFallbackCaseData = (difficulty, commanderPersonality) => {
  const scenario = randomItem(CASE_SCENARIOS);
  const location = randomItem(LOCATIONS);
  const incidentTime = randomItem(INCIDENT_TIMES);
  const names = uniqueNames(5);
  const culpritIndex = Math.floor(Math.random() * names.length);
  const culprit = names[culpritIndex];

  const suspects = names.map((name, index) => {
    const role = randomItem(ROLES);

    return {
      name,
      role,
      involvementType: deriveInvolvementTypeFromRole(role),
      personality: randomItem(PERSONALITIES),
      alibi: buildAlibi(name, location, role, index),
      secret: SECRET_TEMPLATES[index % SECRET_TEMPLATES.length],
      isGuilty: index === culpritIndex,
    };
  });

  const method = randomItem(scenario.methodOptions);
  const motive = randomItem(scenario.motiveOptions);
  const evidence = buildEvidence(scenario, culprit, location);
  const briefingDetails = buildBriefingDetails(scenario, location, suspects, evidence, incidentTime);
  const narrativeContext = buildNarrativeContext({
    caseName: `${scenario.theme} ב-${location}`,
    briefingDetails,
    suspects,
    evidence,
  });

  return {
    caseName: `${scenario.theme} ב-${location}`,
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

const buildCasePrompt = (difficulty, commanderPersonality) => `צור תיק חקירה חדש, מקורי ולא שגרתי ברמת קושי ${difficulty}.
אישיות המפקד: ${commanderPersonality}.

החקירה לא חייבת להיות רצח. אפשר לבחור גם בהיעלמות, גניבה, חבלה, הדלפת מידע, סחיטה, הונאה או מוות חשוד.
בכל יצירה בחר זירה אחרת, דינמיקה אחרת בין הדמויות, וסוג תעלומה שונה ככל האפשר.
כתוב את כל התשובה בעברית טבעית, שוטפת, תקינה ועשירה, כאילו נכתבה בידי תסריטאי ישראלי מנוסה.
אסור לכתוב בעברית שבורה, מתורגמת מאנגלית, רובוטית, מקוטעת או כללית מדי.
כל שדה טקסטואלי חייב להכיל פרטים קונקרטיים מתוך המקרה עצמו: זמן, מקום, יחסים בין הדמויות, אינטרסים, סתירות, ומה המשמעות החקירתית שלהם.
אם ניסוח כלשהו נשמע גנרי, קצר מדי או לא טבעי, נסח אותו מחדש לפני ההחזרה.

החזר JSON תקין בלבד בפורמט:
{
  "caseName": "שם תיק",
  "commanderBrief": "בריף דרמטי קצר",
  "briefingDetails": {
    "incidentTime": "שעת האירוע או החלון הקריטי",
    "incidentLocation": "איפה בדיוק קרה הדבר",
    "incidentSummary": "מה בדיוק קרה במשפט חד וברור",
    "anomaly": "מה לא מסתדר ולמה זה חריג",
    "situation": "סיכום מפורט של מצב הפתיחה",
    "stakes": "למה המקרה דחוף ומה הסיכון אם לא נפעל נכון",
    "locationContext": "מה מיוחד בזירה ולמה זה חשוב",
    "timelineMarks": ["ציון זמן 1", "ציון זמן 2", "ציון זמן 3"],
    "fieldSignals": ["סימן זירה 1", "סימן זירה 2", "סימן זירה 3"],
    "knownFacts": ["עובדה 1", "עובדה 2", "עובדה 3"],
    "openingQuestions": ["שאלת פתיחה 1", "שאלת פתיחה 2", "שאלת פתיחה 3"]
  },
  "backstory": "רקע מלא וסודי",
  "solution": {
    "culprit": "שם",
    "method": "איך בוצע",
    "motive": "מניע",
    "explanation": "הסבר מלא"
  },
  "suspects": [
    {
      "name": "שם מלא",
      "role": "תפקיד",
      "involvementType": "suspect או witness",
      "personality": "אישיות חקירתית",
      "alibi": "אליבי",
      "secret": "סוד",
      "isGuilty": false,
      "truthProfile": {
        "liesAbout": ["נושא1"],
        "nervousTriggers": ["מילה1"],
        "truthLevel": 0.7
      },
      "stressMeter": 0,
      "breakingPoint": 70
    }
  ],
  "evidence": [
    {
      "type": "document",
      "description": "תיאור הראיה",
      "hiddenClue": "הרמז הנסתר",
      "isFound": false
    }
  ]
}

דרישות:
- לפחות 4 חשודים עם תפקידים שונים
- לפחות 4 ראיות
- commanderBrief חייב להיות באורך 3 עד 4 משפטים מלאים, מפורטים ודרמטיים, ולא משפט פתיחה קצר
- briefingDetails חייב להכיל פרטים עשירים וברורים, לא משפטים כלליים
- briefingDetails חייב לכלול במפורש שעה, מקום, תיאור חד של האירוע, הסבר מה חריג, ציר זמן פתיחה וסימני זירה
- anomaly, situation, stakes ו-locationContext חייבים להיות באורך 2 עד 3 משפטים מלאים כל אחד, עם פרטים אמיתיים מהמקרה
- backstory חייב להיות באורך 4 עד 6 משפטים מלאים, עם רקע קונקרטי ולא תקציר כללי
- solution.explanation חייב להיות באורך לפחות 2 משפטים מלאים שמסבירים למה דווקא האשם הזה
- personality, alibi ו-secret של כל חשוד חייבים להיות מנוסחים בעברית טבעית ולא במשפטים קצרים או טכניים
- involvementType של כל דמות חייב להיות suspect או witness, בהתאם לכך אם מדובר בחשוד/ה או בעד/ת ראייה
- סתירות עדינות בין הגרסאות
- זירה יצירתית ושונה ממקרי עבר
- אל תחזור על אותו משפט או ניסוח בכמה שדות שונים
- אל תשתמש בביטויים חלשים כמו "משהו קרה", "בעיה", "תיאור קצר", "לא ידוע" או "יש סתירה" בלי לפרט מהי
- type של evidence חייב להיות רק אחד מ: ${EVIDENCE_TYPES.join(', ')}`;

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

export { EVIDENCE_TYPES, buildFallbackCaseData, buildCasePrompt, enrichCaseText };