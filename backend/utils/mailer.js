import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendPasswordResetCode = async (email, code) => {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: 'קוד לאיפוס סיסמה',
    html: `
      <div dir="rtl" style="font-family: sans-serif; text-align: right;">
        <p>קיבלת בקשה לאיפוס סיסמה. הקוד שלך:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>הקוד תקף ל-10 דקות. אם לא ביקשת איפוס סיסמה, אפשר להתעלם מהמייל הזה.</p>
      </div>
    `,
  });
};
