import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// פונקציה שבודקת שלא יעברו 3 תיקים פעילים
const arrayLimit = (val) => val.length <= 3;

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: [3, 'שם משתמש חייב להיות לפחות 3 תווים'],
    maxlength: [20, 'שם משתמש לא יכול להיות ארוך מ-20 תווים'],
    match: [/^[\p{L}\p{N}_]+$/u, 'שם משתמש יכול להכיל רק אותיות, מספרים וקו תחתון']
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'יש להזין כתובת מייל תקינה']
  },
  password: {
    type: String,
    required: true,
    minlength: [6, 'סיסמה חייבת להיות לפחות 6 תווים']
  },
  name: { 
    type: String,
    trim: true,
    default: ''
  },
  activeCases: {
    type: [{ // רשימת התיקים הפעילים של המשתמש
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case'
    }],
    default: [],
    validate: [arrayLimit, 'לא ניתן לנהל יותר מ-3 תיקים במקביל']
  },
}, { timestamps: true });// מוסיף אוטומטית createdAt ו-updatedAt שמוסיפים תאריכים של יצירת ועדכון המשתמש

// Hash password before save
userSchema.pre('save', async function () { // לפני שמירת המשתמש, נבדוק אם הסיסמה שונתה
  if (!this.isModified('password')) return; // אם הסיסמה לא שונתה, נמשיך בלי לעשות כלום
  const salt = await bcrypt.genSalt(10); // יצירת מלח עם 10 סיבובים (ככל שהמספר גבוה יותר, ההאשטה תהיה חזקה יותר אך גם איטית יותר)
  this.password = await bcrypt.hash(this.password, salt); // הצפנת הסיסמה עם המלח שנוצר
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;