import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import User from './models/User.js';
import caseRoutes from './routes/cases.js';
import investigateRoutes from './routes/investigate.js';
import { authenticateToken } from './middleware/auth.js';
import { sendPasswordResetCode } from './utils/mailer.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Generated evidence files must live at a stable path regardless of whether
// this process runs from source (`node index.js`) or from the compiled
// output (`node dist/index.js`, used by the nodemon dev pipeline) - __dirname
// differs between those two, but npm always launches this script with the
// backend/ package directory as the working directory, so process.cwd() is
// the one anchor that's consistent either way.
const GENERATED_EVIDENCE_DIR = path.join(process.cwd(), 'generated-evidence');

// Mounted before helmet() so these static responses never receive its CSP
// header - the served HTML evidence files (WhatsApp/document/recording
// renderers) contain a small inline <script> for iframe auto-resizing, which
// a 'self'-only script-src would silently block. They're always embedded in
// a sandboxed iframe (see GamePage.jsx), so that sandbox - not this header -
// is the real security boundary for this route.
app.use('/generated-evidence', express.static(GENERATED_EVIDENCE_DIR));

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      frameAncestors: ["'self'", 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    },
  },
}));
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); //לא צריך bodyParser כי כבר כולל פונקציונליות דומה עם express.json()

// Rate Limiting
const generalLimiter = rateLimit({ //מגביל את כל השרת ל-100 בקשות כל 15 דקות.
  windowMs: 15 * 60 * 1000, // 15 דקות
  max: 100,
  message: { message: 'יותר מדי בקשות, נסי שוב מאוחר יותר' }
});

const aiLimiter = rateLimit({ //מגביל רק את החקירה (שאלות ל-AI) ל-40 בקשות לשעה
  windowMs: 60 * 60 * 1000, // שעה
  max: 40, // הגבלה סבירה ל-AI
  message: { message: 'הגעת למכסת השאלות לשעה. נסי שוב מאוחר יותר.' }
});

const resetLimiter = rateLimit({ //מגביל בקשת קוד ואימות קוד לאיפוס סיסמה, כדי למנוע ניחוש הקוד בכוח גס
  windowMs: 15 * 60 * 1000, // 15 דקות
  max: 5,
  message: { message: 'יותר מדי ניסיונות, נסי שוב מאוחר יותר' }
});

app.use(generalLimiter);

// Routes
app.get('/', (req, res) => {
  res.send('Hello World with Express and TypeScript!');
});

app.use('/api/cases', caseRoutes);
app.use('/api/investigate',aiLimiter, investigateRoutes);

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, email } = req.body;
    const normalizedUsername = username?.trim();
    const normalizedEmail = email?.trim().toLowerCase();
    
    if (!normalizedUsername || !password || !normalizedEmail) {
      return res.status(400).json({ message: 'שם משתמש, מייל וסיסמה הם שדות חובה' });
    }
    
    const existingUsername = await User.findOne({ username: normalizedUsername });
    if (existingUsername) {
      return res.status(400).json({ message: 'שם המשתמש כבר תפוס' });
    }

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({ message: 'כתובת המייל כבר רשומה במערכת' });
    }

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password, // מוצפן אוטומטית ב-pre-save hook שב-User.js
      name: name || normalizedUsername
    });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'הרשמה בוצעה בהצלחה',
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        name: user.name 
      }
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const firstValidationError = Object.values(error.errors || {})[0];
      return res.status(400).json({ message: firstValidationError?.message || 'פרטי ההרשמה אינם תקינים' });
    }

    if (error?.code === 11000) {
      if (error.keyPattern?.username) {
        return res.status(400).json({ message: 'שם המשתמש כבר תפוס' });
      }

      if (error.keyPattern?.email) {
        return res.status(400).json({ message: 'כתובת המייל כבר רשומה במערכת' });
      }
    }

    res.status(500).json({ message: 'שגיאה בשרת', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = req.body.username; //זהו שם המשתמש שנשלח בבקשת ה-POST
    const password = req.body.password; //זהו הסיסמה שנשלחה בבקשת ה-POST
    // Here you would normally validate the username and password against a database
    if (!username || !password){
      return res.status(400).json({ message: 'שם משתמש וסיסמה הם שדות חובה' });
    }
    
    const user = await User.findOne({ username });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ 
        message: 'שם משתמש או סיסמה שגויים' 
      });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        name: user.name,
        activeCases: user.activeCases 
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בשרת', error: error.message });
  }
});

app.post('/api/auth/forgot-password/request', resetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'מייל הוא שדה חובה' });
    }

    const genericResponse = { message: 'אם קיים חשבון עם המייל הזה, נשלח אליו קוד אימות' };
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.json(genericResponse); // לא חושפים אם המשתמש קיים
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const salt = await bcrypt.genSalt(10);
    user.resetCodeHash = await bcrypt.hash(code, salt);
    user.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 דקות
    user.resetCodeAttempts = 0;
    await user.save();

    await sendPasswordResetCode(normalizedEmail, code);

    res.json(genericResponse);
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בשרת', error: error.message });
  }
});

app.post('/api/auth/forgot-password/verify', resetLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !code || !newPassword) {
      return res.status(400).json({ message: 'מייל, קוד וסיסמה חדשה הם שדות חובה' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'הסיסמה החדשה חייבת להיות לפחות 6 תווים' });
    }

    const invalidCodeResponse = { message: 'קוד שגוי או שפג תוקפו' };
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.resetCodeHash || !user.resetCodeExpires || user.resetCodeExpires < new Date()) {
      return res.status(400).json(invalidCodeResponse);
    }

    if (user.resetCodeAttempts >= 5) {
      user.resetCodeHash = null;
      user.resetCodeExpires = null;
      await user.save();
      return res.status(400).json({ message: 'יותר מדי ניסיונות שגויים, יש לבקש קוד חדש' });
    }

    const isCodeValid = await bcrypt.compare(code, user.resetCodeHash);

    if (!isCodeValid) {
      user.resetCodeAttempts += 1;
      await user.save();
      return res.status(400).json(invalidCodeResponse);
    }

    user.password = newPassword;
    user.resetCodeHash = null;
    user.resetCodeExpires = null;
    user.resetCodeAttempts = 0;
    await user.save();

    res.json({ message: 'הסיסמה אופסה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.' });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בשרת', error: error.message });
  }
});

app.get('/profile', authenticateToken, (req, res) => {
    res.json({ user: req.user });
  });
  
// MongoDB + Start Server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

