import mongoose from 'mongoose';    

// 1. סכמה לחשודים - כולל מד לחץ ושכבות אמת
const suspectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, default: 'חשוד' },
  involvementType: { type: String, enum: ['suspect', 'witness'], default: 'suspect' },
  personality: { type: String, required: true }, // תיאור ל-AI איך להתנהג
  alibi: String,
  secret: String, // המידע שהם מסתירים
  isGuilty: { type: Boolean, default: false },
  truthProfile: {
    liesAbout: [String], // נושאים שהם ישקרו לגביהם
    nervousTriggers: [String], // מילים שיעלו את מד הלחץ
    truthLevel: { type: Number, min: 0, max: 1, default: 0.7 }
  },
  stressMeter: { type: Number, default: 0, min: 0, max: 100 },
  breakingPoint: { type: Number, default: 70 }, // הנקודה שבה הם נשברים ומודים
  currentTone: { type: String, enum: ['neutral', 'empathetic', 'aggressive'], default: 'neutral' }, // הטון שהחוקר בחר

  // פרופיל כתב יד — משמש ליצירת ראיות מסמך בכתב יד עקבי לאותה דמות בין כמה ראיות
  writingProfile: {
    isHandwritten: { type: Boolean, default: true },
    style: String, // למשל: "כתב יד קטן ומסודר"
    pressure: String, // "קלה" | "בינונית" | "חזקה"
    spacing: String, // "צפופה" | "רגילה" | "מרווחת"
    consistency: String, // "גבוהה" | "בינונית" | "נמוכה"
  },

  // ── Character identity profiles (structured, optional, backward-compatible) ──
  // נקבעים פעם אחת ביצירת התיק ולא משתנים בין ראיות — כל ראיה עתידית
  // (תמונה/הקלטה) שמערבת את הדמות הזו מפנה לאותו פרופיל, לא ממציאה חדש.
  // ערכים באנגלית מבנית בכוונה: אלה מטא-דאטה לצריכה ע"י מחוללי FLUX/TTS
  // עתידיים, לא טקסט שמוצג לשחקן (בדיוק כמו writingProfile/secret היום).
  appearanceProfile: {
    age: Number,
    gender: String,
    hair: String,
    eyes: String,
    skinTone: String,
    bodyType: String,
    clothingStyle: String,
    distinctiveFeatures: [String],
  },
  voiceProfile: {
    age: Number,
    gender: String,
    pitch: String,
    speed: String,
    tone: String,
    accent: String,
    personality: String,
    // TTS provider identity - resolved once (deterministically, from the
    // character's name) the first time a recording needs this character's
    // voice, then reused. Optional/additive: cases generated before TTS
    // existed simply have these unset.
    provider: String,
    voiceId: String,
  },
});

// עותק (לא הפניה) של פרופיל הקול של דמות, מוצמד לראיה ספציפית שבה היא
// מדברת. שמור בנפרד מ-suspects כדי שראיית אודיו עתידית תהיה עצמאית -
// לא צריך לחבר בין evidence ל-suspects שוב בזמן יצירת השמע.
const evidenceVoiceProfileSchema = new mongoose.Schema({
  name: String,
  voiceProfile: {
    age: Number,
    gender: String,
    pitch: String,
    speed: String,
    tone: String,
    accent: String,
    personality: String,
    // TTS provider identity - resolved once (deterministically, from the
    // character's name) the first time a recording needs this character's
    // voice, then reused. Optional/additive: cases generated before TTS
    // existed simply have these unset.
    provider: String,
    voiceId: String,
  },
}, { _id: false });

// 2. סכמה לראיות (מסמכים, הקלטות וכו')
const evidenceSchema = new mongoose.Schema({
  type: { type: String, enum: ['message', 'photo', 'document', 'recording'] },
  description: String,
  hiddenClue: String, // הרמז שמתגלה רק כשחוקרים את הראיה, לא נשלח ל-client
  isFound: { type: Boolean, default: false }, // האם המשתמש כבר מצא את זה?
  fileUrl: String,
  mimeType: String,
  assetType: String,
  assetStatus: { type: String, enum: ['ready', 'missing'], default: 'missing' },
  assetGeneratedAt: Date,
  assetTranscript: String,

  // ── Evidence blueprint (structured, optional, backward-compatible) ──
  // מטרת הראיה, הרמז המשני, המעורבים והזמן — נשלטים תמיד מתוך נתוני התיק
  // הקיימים, ולא ממציאים דמויות/עובדות חדשות. שדות אלה אופציונליים כדי
  // שראיות ישנות בלי המבנה החדש ימשיכו לעבוד בלי מיגרציה.
  //
  // primaryClue הוא הרמז המרכזי (המבנה החדש, מקור האמת) - description/
  // hiddenClue נשארים כשדות legacy ומתמלאים מ-primaryClue/purpose/
  // secondaryClue כשה-AI לא סיפק אותם ישירות. hiddenClue ממשיך לא להיחשף
  // ללקוח (ראה serializeEvidenceForClient) - אותה גבולת אבטחה כמו קודם.
  purpose: String,
  primaryClue: String,
  secondaryClue: String,
  participants: [String],
  // מיקום ספציפי של הראיה הזו (יכול להיות תת-מיקום מדויק יותר מתוך
  // briefingDetails.incidentLocation, למשל "מסדרון שירות בקומה השלישית").
  location: String,
  timeline: {
    time: String,
  },
  // עובדות חזותיות קונקרטיות וספציפיות לסצנה של הראיה הזו (לא המראה הקבוע
  // של הדמות - זה כבר ב-suspect.appearanceProfile וייכלל בזמן צריכה עתידי
  // ע"י FLUX, לא כפול כאן). מיועד ל-buildImagePrompt(evidence, caseData)
  // עתידי שישלב: appearanceProfile + visualDetails + location + time + primaryClue.
  visualDetails: [String],
  // פרופיל קול לכל דמות שמדברת בראיה הזו (בעיקר recording/message), נגזר
  // תמיד מ-suspect.voiceProfile הקיים - אף פעם לא ממציא פרופיל חדש. מיועד
  // לצריכה ע"י TTS עתידי.
  voiceProfiles: [evidenceVoiceProfileSchema],
  // ה"סוג פיזי" הספציפי של ראיית מסמך (בכתב יד, דו"ח רשמי, רישום גישה וכו').
  // נפרד מ-type כדי שהרנדור יוכל להשתנות (כולל בעתיד ליצירת תמונה ב-FLUX)
  // מבלי לשנות את מודל הנתונים.
  artifactType: String,
  // תוכן מובנה שנוצר ע"י ה-AI לפני רינדור: הודעות ווטסאפ / תוכן מסמך /
  // דיאלוג הקלטה (turns עם speaker/text/emotion/pace/pauseAfterMs/
  // startTime/endTime בפועל - ראה services/recordingEvidence.js).
  // ה-AI אחראי על התוכן, שכבת הרינדור אחראית על האמנות הסופית.
  messageData: mongoose.Schema.Types.Mixed,
  documentData: mongoose.Schema.Types.Mixed,
  recordingData: mongoose.Schema.Types.Mixed,
});

const briefingDetailsSchema = new mongoose.Schema({
  incidentTime: String,
  incidentLocation: String,
  incidentSummary: String,
  anomaly: String,
  situation: String,
  stakes: String,
  locationContext: String,
  timelineMarks: [String],
  fieldSignals: [String],
  knownFacts: [String],
  openingQuestions: [String],
}, { _id: false });

// 3. הסכמה הראשית של תיק החקירה
const caseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  caseName: { type: String, required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  commanderBrief: { type: String, required: true }, // מה שהמפקד אומר בפתיחה
  briefingDetails: { type: briefingDetailsSchema, default: () => ({}) },
  commanderPersonality: { 
    type: String, 
    enum: ['cold', 'aggressive', 'mentor'], 
    default: 'mentor' 
  }, // אישיות המפקד שהמשתמש בחר

  // מידע סודי לשרת בלבד
  backstory: String, 
  solution: {
    culprit: String,
    method: String,
    motive: String,
    explanation: String
  },
  
  suspects: [suspectSchema],
  evidence: [evidenceSchema],
  
  // היסטוריית אינטראקציות - מופרדת לפי יעד (חשוד מסוים או מפקד)
  interactions: [{
    entityType: { type: String, enum: ['suspect', 'commander'] },
    entityName: String, // שם החשוד או "Commander"
    messages: [{
      role: { type: String, enum: ['user', 'assistant'] }, // assistant מתאים ל-OpenAI API
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    }]
  }],

  investigatorNotes: {
    type: String,
    default: '',
    maxlength: 5000
  },
  
  status: {
    type: String,
    // 'generating' = פלייסהולדר שנשמר עם הזמנת סלוט אטומית, לפני שה-AI סיים לייצר את התיק.
    // תופס סלוט פעיל בדיוק כמו 'active', אבל לא ניתן למשחק עד שהיצירה מסתיימת ומעדכנת
    // את אותו מסמך לסטטוס 'active'.
    enum: ['generating', 'active', 'solved', 'failed'],
    default: 'active'
  }
}, { timestamps: true }); // מוסיף אוטומטית createdAt ו-updatedAt

export default mongoose.model('Case', caseSchema);