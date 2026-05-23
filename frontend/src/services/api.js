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

const request = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...options,
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      const error = new Error(data.message || 'שגיאה בשרת');
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('לא ניתן להתחבר לשרת. ודא שהבקאנד פועל ושהכתובת תקינה.');
    }

    throw error;
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

  forgotPassword: (email, newPassword) =>
    request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, newPassword }),
    }),
};

// CASES

export const casesAPI = {
  // קבלת כל התיקים של המשתמש
  getAll: () => request('/api/cases'),

  // קבלת תיק ספציפי עם היסטוריית שיחה
  getById: (caseId) => request(`/api/cases/${caseId}`),

  // יצירת תיק חדש
  generate: (difficulty, commanderPersonality) =>
    request('/api/cases/generate', {
      method: 'POST',
      body: JSON.stringify({ difficulty, commanderPersonality }),
    }),

  updateNotes: (caseId, investigatorNotes) =>
    request(`/api/cases/${caseId}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ investigatorNotes }),
    }),
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