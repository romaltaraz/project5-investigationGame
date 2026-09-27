// services/api.js
// כל הקריאות לבאקאנד במקום אחד — ככה אם ה-URL משתנה, משנים רק פה

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : {};
};

const DEFAULT_TIMEOUT_MS = 30000;

const request = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchOptions.headers,
      },
      signal: controller.signal,
      ...fetchOptions,
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      const error = new Error(data.message || 'שגיאה בשרת');
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('הבקשה לקחה יותר מדי זמן ובוטלה. נסה שוב.');
    }

    if (error instanceof TypeError) {
      throw new Error('לא ניתן להתחבר לשרת. ודא שהבקאנד פועל ושהכתובת תקינה.');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const authAPI = {
  register: (username, email, password, name) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, name }),
    }),

  login: (username, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  requestPasswordReset: (email) =>
    request('/api/auth/forgot-password/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  confirmPasswordReset: (email, code, newPassword) =>
    request('/api/auth/forgot-password/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    }),
};

// CASES

export const casesAPI = {
  // קבלת כל התיקים של המשתמש
  getAll: () => request('/api/cases'),

  // קבלת תיק ספציפי עם היסטוריית שיחה
  getById: (caseId) => request(`/api/cases/${caseId}`),

  // יצירת תיק חדש. הבקשה חוזרת מיד (202) עם התיק במצב 'generating' -
  // כל היצירה הכבדה רצה ברקע בשרת, וההתקדמות מגיעה דרך פיד ה-SSE (streamUrl).
  // ה-timeout כאן מכסה רק את הזמן להירשם לתור, לא את משך היצירה.
  generate: (difficulty, commanderPersonality) =>
    request('/api/cases/generate', {
      method: 'POST',
      body: JSON.stringify({ difficulty, commanderPersonality }),
      timeoutMs: 20000,
    }),

  // מחיקת תיק (משמש ל"נסה שוב" על תיק שנכשל, ולניקוי כללי)
  remove: (caseId) =>
    request(`/api/cases/${caseId}`, { method: 'DELETE' }),

  updateNotes: (caseId, investigatorNotes) =>
    request(`/api/cases/${caseId}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ investigatorNotes }),
    }),

  // כתובת פיד ה-SSE של שינויי התיקים. EventSource לא יכול לשלוח כותרת
  // Authorization, ולכן הטוקן עובר ב-query (ה-middleware מקבל גם ?token=).
  streamUrl: (token) => `${BASE_URL}/api/cases/stream?token=${encodeURIComponent(token || '')}`,
};

// INVESTIGATION

export const investigateAPI = {
  // שאלה לחשוד
  ask: (caseId, suspectName, question, tone = 'neutral') =>
    request(`/api/investigate/${caseId}/ask`, {
      method: 'POST',
      body: JSON.stringify({ suspectName, question, tone }),
    }),

  // התייעצות עם המפקד
  consult: (caseId, suspicion) =>
    request(`/api/investigate/${caseId}/consult`, {
      method: 'POST',
      body: JSON.stringify({ suspicion }),
    }),

  // הגשת פתרון סופי
  solve: (caseId, accusedName, reasoning) =>
    request(`/api/investigate/${caseId}/solve`, {
      method: 'POST',
      body: JSON.stringify({ accusedName, reasoning }),
    }),
};