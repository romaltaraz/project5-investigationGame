const TIME_PATTERN = /(?:\b\d{1,2}[:.]\d{2}\b|(?:בשעה|בסביבות|סביב|אחרי|לפני)\s+\d{1,2}(?::\d{2})?)/g;
const LOCATION_PATTERN = /(?:ב|אצל|ליד|מול)\s+[א-ת][א-ת"'\-]*(?:\s+[א-ת][א-ת"'\-]*){0,2}/g;
const TIME_WORD_PATTERN = /(בבוקר|בצהריים|אחר הצהריים|בערב|בלילה|לפנות בוקר|מוקדם|מאוחר)/g;
const CLOSE_RELATION_PATTERN = /(חבר(?:ה)?|קרוב(?:ה)?|בן זוג|בת זוג|שותף(?:ה)?|אח(?:ות)?|משפחה|עבדנו יחד|סומך עליו|סומכת עליה)/;
const DISTANT_RELATION_PATTERN = /(בקושי מכיר|בקושי מכירה|לא ממש מכיר|אין לי קשר|לא קרוב|לא קרובה|רק עובד איתו|רק עובדת איתה|לא דיברתי איתו|לא דיברתי איתה)/;
const TOPIC_PATTERNS = {
  time: /(מתי|שעה|זמן|לפני|אחרי|באיזו שעה)/,
  location: /(איפה|מיקום|מקום|היית|נכחת|הלכת)/,
  people: /(עם מי|מי היה|מי ראה|את מי|עם מי דיברת|מי היה איתך)/,
  relationship: /(מכיר|קשר|יחסים|רבת|ריב|חבר|שותף|קרוב|עבדת|עבדת עם|הכרת)/,
};

const unique = (items) => [...new Set(items.filter(Boolean))];

const normalizeValue = (value = '') => value.replace(/\s+/g, ' ').trim();

const collectMatches = (text, pattern) => unique((text.match(pattern) || []).map(normalizeValue));

const detectQuestionTopics = (question = '') => Object.entries(TOPIC_PATTERNS)
  .filter(([, pattern]) => pattern.test(question))
  .map(([topic]) => topic);

const collectKnownNames = (text = '', suspectNames = [], excludeName = '') => unique(
  suspectNames
    .filter((name) => name !== excludeName)
    .filter((name) => text.includes(name)),
);

const detectRelationshipTone = (text = '') => {
  const tones = [];

  if (CLOSE_RELATION_PATTERN.test(text)) {
    tones.push('close');
  }

  if (DISTANT_RELATION_PATTERN.test(text)) {
    tones.push('distant');
  }

  return tones;
};

const toNotebookItems = (messages = []) => {
  const notes = [];

  for (let index = 0; index < messages.length; index += 2) {
    const question = messages[index];
    const answer = messages[index + 1];

    if (question?.role !== 'user') {
      continue;
    }

    notes.push({
      question: question.content,
      answer: answer?.content || 'ממתין לתשובה...',
    });
  }

  return notes.reverse();
};

const collectStatements = (caseDoc) => {
  const suspectMap = new Map((caseDoc?.suspects || []).map((suspect) => [suspect.name, suspect]));
  const suspectNames = (caseDoc?.suspects || []).map((suspect) => suspect.name);

  return (caseDoc?.interactions || [])
    .filter((item) => item.entityType === 'suspect')
    .flatMap((interaction) => {
      const suspect = suspectMap.get(interaction.entityName);
      const notes = toNotebookItems(interaction.messages);

      return notes.map((note) => ({
        suspectName: interaction.entityName,
        question: note.question,
        answer: note.answer,
        topics: detectQuestionTopics(note.question),
        times: unique([...collectMatches(note.answer, TIME_PATTERN), ...collectMatches(note.answer, TIME_WORD_PATTERN)]),
        locations: collectMatches(note.answer, LOCATION_PATTERN),
        mentionedNames: collectKnownNames(note.answer, suspectNames, interaction.entityName),
        relationshipTones: detectRelationshipTone(note.answer),
        alibi: suspect?.alibi || '',
        alibiTimes: unique([
          ...collectMatches(suspect?.alibi || '', TIME_PATTERN),
          ...collectMatches(suspect?.alibi || '', TIME_WORD_PATTERN),
        ]),
        alibiLocations: collectMatches(suspect?.alibi || '', LOCATION_PATTERN),
        alibiNames: collectKnownNames(suspect?.alibi || '', suspectNames, interaction.entityName),
      }));
    });
};

const detectContradictions = (caseDoc) => {
  const statements = collectStatements(caseDoc);
  const bySuspect = new Map();
  const contradictions = [];

  statements.forEach((statement) => {
    const current = bySuspect.get(statement.suspectName) || [];
    current.push(statement);
    bySuspect.set(statement.suspectName, current);
  });

  bySuspect.forEach((items, suspectName) => {
    const timeValues = unique(items.filter((item) => item.topics.includes('time')).flatMap((item) => item.times));

    if (timeValues.length > 1) {
      contradictions.push({
        id: `${suspectName}-times`,
        title: `רצף הזמנים של ${suspectName} נשמע קצת זז`,
        detail: `הופיעו כמה נקודות זמן שונות: ${timeValues.slice(0, 3).join(' , ')}.`,
      });
    }

    const alibiTimes = unique(items.flatMap((item) => item.alibiTimes));

    if (alibiTimes.length > 0 && timeValues.length > 0) {
      const overlap = alibiTimes.some((value) => timeValues.includes(value));

      if (!overlap) {
        contradictions.push({
          id: `${suspectName}-alibi-time`,
          title: `הזמן של ${suspectName} לא יושב לגמרי על האליבי`,
          detail: `באליבי הופיע ${alibiTimes[0]}, אבל בתשובות עלו גם ${timeValues.slice(0, 2).join(' ו-')}.`,
        });
      }
    }

    const alibiLocations = unique(items.flatMap((item) => item.alibiLocations));
    const answerLocations = unique(items.filter((item) => item.topics.includes('location')).flatMap((item) => item.locations));

    if (alibiLocations.length > 0 && answerLocations.length > 0) {
      const overlap = alibiLocations.some((value) => answerLocations.includes(value));

      if (!overlap) {
        contradictions.push({
          id: `${suspectName}-alibi-location`,
          title: `המיקום של ${suspectName} שווה בדיקה נוספת`,
          detail: `באליבי עלה ${alibiLocations[0]}, אבל בתשובות עלו גם ${answerLocations.slice(0, 2).join(' ו-')}.`,
        });
      }
    }

    const peopleValues = unique(items.filter((item) => item.topics.includes('people')).flatMap((item) => item.mentionedNames));
    const alibiNames = unique(items.flatMap((item) => item.alibiNames));

    if (peopleValues.length > 1) {
      contradictions.push({
        id: `${suspectName}-people`,
        title: `הגרסה של ${suspectName} לגבי מי היה בסביבה דורשת עוד שאלה`,
        detail: `עלו כמה שמות שונים סביב אותה שרשרת אירועים: ${peopleValues.slice(0, 3).join(', ')}.`,
      });
    }

    if (alibiNames.length > 0 && peopleValues.length > 0) {
      const overlap = alibiNames.some((value) => peopleValues.includes(value));

      if (!overlap) {
        contradictions.push({
          id: `${suspectName}-alibi-people`,
          title: `השמות ש-${suspectName} מזכיר לא מתיישבים לגמרי עם האליבי`,
          detail: `באליבי הוזכר ${alibiNames[0]}, אבל בתשובות חזרו גם ${peopleValues.slice(0, 2).join(' ו-')}.`,
        });
      }
    }

    const relationshipByName = new Map();

    items
      .filter((item) => item.topics.includes('relationship') && item.mentionedNames.length > 0)
      .forEach((item) => {
        item.mentionedNames.forEach((name) => {
          const current = relationshipByName.get(name) || [];
          relationshipByName.set(name, [...current, ...item.relationshipTones]);
        });
      });

    relationshipByName.forEach((tones, name) => {
      const uniqueTones = unique(tones);

      if (uniqueTones.includes('close') && uniqueTones.includes('distant')) {
        contradictions.push({
          id: `${suspectName}-${name}-relationship`,
          title: `הקשר בין ${suspectName} ל-${name} נשמע פעם קרוב ופעם מרוחק`,
          detail: `בחלק מהתשובות היחסים תוארו כקרובים, ובחלק אחר כמעט לא קיימים.`,
        });
      }
    });
  });

  return contradictions.slice(0, 4);
};

const buildEvidenceBoard = (caseDoc) => {
  const evidenceEntries = (caseDoc?.evidence || []).map((item, index) => ({
    id: `evidence-${index}`,
    type: 'evidence',
    label: `ראיה ${index + 1}`,
    meta: item.type,
    content: item.description,
  }));

  const alibiEntries = (caseDoc?.suspects || []).map((suspect) => ({
    id: `alibi-${suspect.name}`,
    type: 'alibi',
    label: suspect.name,
    meta: 'אליבי',
    content: suspect.alibi || 'עדיין לא נרשם אליבי ברור.',
  }));

  const interactionEntries = (caseDoc?.interactions || [])
    .filter((item) => item.entityType === 'suspect')
    .map((interaction) => {
      const notes = toNotebookItems(interaction.messages);
      const latest = notes[0];

      return {
        id: `statement-${interaction.entityName}`,
        type: 'statement',
        label: interaction.entityName,
        meta: 'אמירה אחרונה',
        content: latest?.answer || 'עדיין אין עדות מתועדת.',
      };
    });

  return [...evidenceEntries, ...alibiEntries, ...interactionEntries];
};

const buildCaseNotebook = (caseDoc, selectedSuspectName) => {
  const selectedInteraction = (caseDoc?.interactions || []).find(
    (item) => item.entityType === 'suspect' && item.entityName === selectedSuspectName,
  );

  return {
    selectedNotes: toNotebookItems(selectedInteraction?.messages).slice(0, 4),
    contradictions: detectContradictions(caseDoc),
    evidenceBoard: buildEvidenceBoard(caseDoc),
    investigatorNotes: caseDoc?.investigatorNotes || '',
  };
};

export { buildCaseNotebook };