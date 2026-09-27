// src/context/CaseStreamContext.jsx
// ONE app-wide EventSource to /api/cases/stream. The backend owns a single
// MongoDB change stream and fans changes out here; every page reads the live
// case list from this context instead of polling. On each (re)connect we also
// do a full GET /api/cases resync, so a dropped connection self-heals without a
// page refresh (any events missed while offline are covered by that resync).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { casesAPI } from '../services/api.js';
import { useAuth } from './AuthContext';

const CaseStreamContext = createContext(null);

const idOf = (c) => c?.id || c?._id || '';
const byCreatedDesc = (a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);

export function CaseStreamProvider({ children }) {
  const { isAuthenticated, token } = useAuth();

  const [casesById, setCasesById] = useState({});
  const [connected, setConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const esRef = useRef(null);

  const resync = useCallback(async () => {
    try {
      const data = await casesAPI.getAll();
      const next = {};
      (data.cases || []).forEach((c) => { next[idOf(c)] = c; });
      setCasesById(next);
      setLastSyncAt(Date.now());
    } catch (err) {
      // Keep whatever we already have on screen; the next reconnect/resync
      // (or a later event) will bring us back in sync.
      console.warn('case resync failed:', err?.message || err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setCasesById({});
      setConnected(false);
      setLastSyncAt(0);
      return undefined;
    }

    let disposed = false;

    const applyUpsert = (event) => {
      try {
        const { case: c } = JSON.parse(event.data);
        if (!c || !idOf(c)) return;
        setCasesById((prev) => ({ ...prev, [idOf(c)]: c }));
      } catch {
        /* ignore a malformed frame */
      }
    };

    const applyDelete = (event) => {
      try {
        const { id } = JSON.parse(event.data);
        setCasesById((prev) => {
          if (!id || !prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch {
        /* ignore */
      }
    };

    // Seed immediately, then open the live stream.
    resync();

    const es = new EventSource(casesAPI.streamUrl(token));
    esRef.current = es;

    es.addEventListener('open', () => {
      if (disposed) return;
      setConnected(true);
      // Reconnect (or first connect) → pull a fresh full snapshot.
      resync();
    });

    es.addEventListener('error', () => {
      // The browser reconnects EventSource on its own; just reflect the state.
      if (!disposed) setConnected(false);
    });

    es.addEventListener('case:insert', applyUpsert);
    es.addEventListener('case:update', applyUpsert);
    es.addEventListener('case:replace', applyUpsert);
    es.addEventListener('case:delete', applyDelete);

    return () => {
      disposed = true;
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [isAuthenticated, token, resync]);

  const value = useMemo(() => ({
    cases: Object.values(casesById).sort(byCreatedDesc),
    casesById,
    connected,
    lastSyncAt,
    ready: lastSyncAt > 0,
    resync,
    getCase: (id) => (id ? casesById[id] : undefined),
  }), [casesById, connected, lastSyncAt, resync]);

  return (
    <CaseStreamContext.Provider value={value}>
      {children}
    </CaseStreamContext.Provider>
  );
}

export function useCaseStream() {
  const ctx = useContext(CaseStreamContext);
  if (!ctx) {
    throw new Error('useCaseStream must be used within a CaseStreamProvider');
  }
  return ctx;
}
