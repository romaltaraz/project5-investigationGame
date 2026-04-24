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
  currentTone: { type: String, enum: ['neutral', 'empathetic', 'aggressive'], default: 'neutral' } // הטון שהחוקר בחר
});

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
    enum: ['active', 'solved', 'failed'],
    default: 'active'
  }
}, { timestamps: true }); // מוסיף אוטומטית createdAt ו-updatedAt

export default mongoose.model('Case', caseSchema);