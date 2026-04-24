import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import User from './models/User.js';
import caseRoutes from './routes/cases.js';
import investigateRoutes from './routes/investigate.js';
import { authenticateToken } from './middleware/auth.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      frameAncestors: ["'self'", 'http://localhost:5173', 'http://localhost:3000'],
    },
  },
}));
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],   // הוספנו את הפורט של Vite
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); //לא צריך bodyParser כי כבר כולל פונקציונליות דומה עם express.json()
app.use('/generated-evidence', express.static(path.join(__dirname, 'generated-evidence')));

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

app.use(generalLimiter);

// Routes
app.get('/', (req, res) => {
  res.send('Hello World with Express and TypeScript!');
});

app.use('/api/cases', caseRoutes);
app.use('/api/investigate',aiLimiter, investigateRoutes);

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'שם משתמש וסיסמה הם שדות חובה' });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'שם המשתמש כבר תפוס' });
    }

    const user = await User.create({
      username,
      password, // מוצפן אוטומטית ב-pre-save hook שב-User.js
      name: name || username
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

