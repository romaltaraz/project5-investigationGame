const TIME_PATTERN = /(?:\b\d{1,2}:\d{2}\b|(?:בשעה|בסביבות|סביב)\s+\d{1,2}(?::\d{2})?)/g;
const LOCATION_PATTERN = /(?:(?:ליד|אצל|מול)\s+[א-ת][א-ת"'\-]*(?:\s+[א-ת][א-ת"'\-]*){0,1}|ב[א-ת]{3,}[א-ת"'\-]*)/g;
const TIME_WORD_PATTERN = /(בבוקר|בצהריים|אחר הצהריים|בערב|בלילה|לפנות בוקר|מוקדם|מאוחר)/g;
const CLOSE_RELATION_PATTERN = /(חבר(?:ה)?|קרוב(?:ה)?|בן זוג|בת זוג|שותף(?:ה)?|אח(?:ות)?|משפחה|עבדנו יחד|סומך עליו|סומכת עליה)/;
const DISTANT_RELATION_PATTERN = /(בקושי מכיר|בקושי מכירה|לא ממש מכיר|אין לי קשר|לא קרוב|לא קרובה|רק עובד איתו|רק עובדת איתה|לא דיברתי איתו|לא דיברתי איתה)/;
const ALONE_PATTERN = /(הייתי לבד|לבדי|לא היה איתי אף אחד|לא היה שם אף אחד|הייתי בעצמי)/;
const WITH_OTHERS_PATTERN = /(היינו יחד|הייתי עם|ישבנו|נפגשנו|היו איתי)/;
const DENIAL_PATTERN = /(לא ידעתי|לא ראיתי|לא הייתי שם|לא הכרתי|לא דיברתי|לא נוכחתי|לא שמעתי כלום)/;

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

const stripStageDirections = (text = '') =>
  text
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*\.\.\.\s*){2,}/g, '...')
    .replace(/^\s*[,.…\u2026]\s*/g, '')
    .replace(/\s+([,.])/g, '$1')
    .trim();

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

    // time inconsistency across conversation (restored & improved)
    const timeAnswerItems = items.filter((item) => item.topics.includes('time') && item.times.length > 0);
    if (timeAnswerItems.length >= 2) {
      const distinctTimes = unique(timeAnswerItems.flatMap((item) => item.times));
      if (distinctTimes.length >= 2) {
        contradictions.push({
          id: `${suspectName}-time-inconsistency`,
          title: `ציר הזמן של ${suspectName} מצריך בדיקה`,
          detail: `בתשובות לשאלות על זמן עלו שעות שונות: ${distinctTimes.slice(0, 3).join(', ')} — כדאי לבדוק אם הן מתיישבות.`,
        });
      }
    }

    // multiple people in people-related answers (restored & improved)
    const peopleAnswerItems = items.filter((item) => item.topics.includes('people') && item.mentionedNames.length > 0);
    if (peopleAnswerItems.length >= 2) {
      const distinctPeople = unique(peopleAnswerItems.flatMap((item) => item.mentionedNames));
      if (distinctPeople.length >= 2) {
        contradictions.push({
          id: `${suspectName}-people-inconsistency`,
          title: `הגרסה של ${suspectName} לגבי מי היה שם לא ברורה`,
          detail: `בשאלות על נוכחות הוזכרו שמות שונים: ${distinctPeople.slice(0, 3).join(', ')} — כדאי לברר מה בדיוק קרה.`,
        });
      }
    }

    // alone vs. with others
    const aloneItems = items.filter((item) => ALONE_PATTERN.test(item.answer));
    const withOthersItems = items.filter((item) => WITH_OTHERS_PATTERN.test(item.answer));

    if (aloneItems.length > 0 && withOthersItems.length > 0) {
      contradictions.push({
        id: `${suspectName}-alone-vs-others`,
        title: `${suspectName} אמר/ה שהיה/ה לבד — אבל לא ממש`,
        detail: `בתשובה אחת עלה שהיה/ה לבד, אבל בתשובה אחרת הוזכרה נוכחות של מישהו נוסף.`,
      });
    }

    // denial + continued knowledge
    const denialItems = items.filter((item) => DENIAL_PATTERN.test(item.answer));
    denialItems.forEach((denialItem) => {
      denialItem.mentionedNames.forEach((name) => {
        const appearsElsewhere = items
          .filter((item) => item !== denialItem && !DENIAL_PATTERN.test(item.answer))
          .some((item) => item.answer.includes(name));
        if (appearsElsewhere) {
          contradictions.push({
            id: `${suspectName}-denial-${name}`,
            title: `${suspectName} הכחיש/ה — אבל ${name} כבר הוזכר/ה קודם`,
            detail: `השם "${name}" עלה בתשובות אחרות, אבל בהמשך עלתה הכחשה או ריחוק מאותו קשר.`,
          });
        }
      });
    });

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
        content: stripStageDirections(latest?.answer || '') || 'עדיין אין עדות מתועדת.',
      };
    });

  return [...evidenceEntries, ...alibiEntries, ...interactionEntries];
};

const buildConversationSummary = (interaction) => {
  if (!interaction?.messages?.length) return null;

  const pairs = [];
  const msgs = interaction.messages;

  for (let i = 0; i < msgs.length; i += 2) {
    const q = msgs[i];
    const a = msgs[i + 1];
    if (q?.role === 'user') {
      const cleanAnswer = stripStageDirections(a?.content || '');
      if (cleanAnswer.length > 3) {
        pairs.push({ question: q.content, cleanAnswer });
      }
    }
  }

  if (pairs.length === 0) return null;

  return { questionCount: pairs.length, messages: pairs };
};

const buildCaseNotebook = (caseDoc, selectedSuspectName) => {
  const selectedInteraction = (caseDoc?.interactions || []).find(
    (item) => item.entityType === 'suspect' && item.entityName === selectedSuspectName,
  );

  return {
    conversationSummary: buildConversationSummary(selectedInteraction),
    contradictions: detectContradictions(caseDoc),
    evidenceBoard: buildEvidenceBoard(caseDoc),
    investigatorNotes: caseDoc?.investigatorNotes || '',
  };
};

export { buildCaseNotebook };