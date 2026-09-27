import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/User.js';
dotenv.config();

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // EventSource (the SSE case feed) cannot set an Authorization header, so the
  // JWT may also arrive as ?token=... on the query string. Header wins.
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (typeof req.query?.token === 'string' && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // ה-JWT עצמו נשאר תקף גם אם המשתמש נמחק ישירות מה-DB (למשל דרך Mongo Compass) -
    // בלי הבדיקה הזו, מחיקת משתמש לא הייתה משתקפת באתר עד שפג תוקף הטוקן (עד 7 ימים).
    const userExists = await User.exists({ _id: payload.userId });
    if (!userExists) {
      return res.status(401).json({ success: false, message: 'המשתמש לא נמצא, יש להתחבר מחדש' });
    }

    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(403).json({
      success: false,
      message: 'Invalid token'
    });
  }
};