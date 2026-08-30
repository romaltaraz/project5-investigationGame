// ============================================================================
//  vite.tunnel.config.ts  —  קובץ זמני להצגת האתר בטלפון דרך VSCode Dev Tunnel
// ============================================================================
//
//  הבעיה:
//  כשפותחים את האתר בטלפון דרך ה-tunnel, הקוד בפרונטאנד פונה ל-localhost:5000.
//  בטלפון "localhost" הוא הטלפון עצמו — אין שם שרת — ולכן נכשל (CORS / ERR_FAILED).
//
//  מה הקובץ הזה עושה (רק כשמריצים איתו — לא משנה כלום בברירת המחדל):
//   1. מאזין על כל הכתובות ומאשר את הדומיין של devtunnels.ms.
//   2. מעביר (proxy) את /api ו-/generated-evidence לשרת המקומי על פורט 5000.
//   3. גורם לפרונטאנד לפנות לכתובת של עצמו (window.location.origin) במקום
//      ל-localhost:5000 — כך הדפדפן מדבר רק מול פורט 5173, הכל same-origin,
//      אין CORS, והבאקאנד ממשיך לרוץ רגיל על פורט 5000 בלי שום שינוי.
//
//  ---------------------------------------------------------------------------
//  איך מריצים (במקום `npm run dev`):
//
//        cd frontend
//        npm run dev:tunnel
//
//  ובטרמינל שני, כרגיל:   cd backend && npm run dev      (באקאנד על פורט 5000)
//
//  ב-VSCode:  לשונית PORTS  →  הפורט 5173 קיים ומוגדר Public.
//
//  כשהשרת עולה חייבים לראות בטרמינל את הבאנר:
//        ✅ TUNNEL MODE ACTIVE  —  API → same-origin proxy → localhost:5000
//  אם לא רואים אותו — רץ `npm run dev` הרגיל, לא הקובץ הזה.
//  ---------------------------------------------------------------------------
//
//  סיימת עם ה-public? מוחקים את הקובץ הזה ואת השורה "dev:tunnel" מ-package.json.
//  שום דבר אחר לא נגעו בו — `npm run dev` הרגיל ממשיך לעבוד מול localhost:5000.
// ============================================================================

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const backend = 'http://localhost:5000'

// באנר + לוג לכל בקשה שעוברת ל-backend, כדי שיהיה ברור בטרמינל שהמצב הזה פעיל
// ושה-proxy באמת עובד.
const tunnelBanner = (): Plugin => ({
  name: 'tunnel-banner',
  configureServer(server) {
    const original = server.printUrls.bind(server)
    server.printUrls = () => {
      original()
      console.log(
        '\n  \x1b[42m\x1b[30m ✅ TUNNEL MODE ACTIVE \x1b[0m' +
          '  API → same-origin proxy → localhost:5000  (BASE_URL = window.location.origin)\n',
      )
    }
  },
})

const toBackend = {
  target: backend,
  changeOrigin: true,
  configure: (proxy: any) => {
    proxy.on('proxyReq', (_pr: any, req: any) => console.log(`  [proxy → backend] ${req.method} ${req.url}`))
    proxy.on('error', (err: any, req: any) => console.log(`  [proxy ERROR] ${req.url} — ${err.message}`))
  },
}

export default defineConfig({
  plugins: [react(), tunnelBanner()],

  // בזמן ריצה בדפדפן זה הופך לכתובת שממנה נטען העמוד (ה-tunnel), כך שכל
  // הקריאות הן same-origin ועוברות דרך ה-proxy שמוגדר למטה. אין CORS בכלל.
  define: {
    'import.meta.env.VITE_API_URL': 'window.location.origin',
  },

  server: {
    host: true,                       // מאזין על 0.0.0.0 כדי שה-tunnel יוכל להתחבר
    allowedHosts: ['.devtunnels.ms'], // מאשר כל כתובת של VSCode dev tunnel
    hmr: { clientPort: 443 },         // רק בשביל live-reload דרך ה-tunnel; אפשר להסיר אם מפריע
    proxy: {
      '/api': toBackend,
      '/generated-evidence': toBackend,
      '/login': toBackend,
      '/protected': toBackend,
      '/profile': toBackend,
    },
  },
})
