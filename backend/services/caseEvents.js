// services/caseEvents.js
// ONE MongoDB change stream for the whole backend process, fanned out over SSE
// to every connected browser. The server owns the single stream; clients never
// open their own. This is what makes the case list live-sync with MongoDB even
// when a document is changed directly in Compass / the mongo shell, not only
// through our API.
//
// Requires a replica set or sharded cluster (MONGO_URI points at MongoDB Atlas,
// which is always a replica set). If the deployment is a bare standalone mongod
// the change stream can't open - we log exactly how to fix that rather than
// silently pretending real-time works.

import Case from '../models/Case.js';
import User from '../models/User.js';
import { serializeCaseForClient } from './caseSerializer.js';

// Set<{ userId: string, res: ServerResponse }>
const clients = new Set();

let changeStream = null;
let restartTimer = null;
let standaloneWarned = false;

const STANDALONE_HELP =
  '\n❌ Could not open a MongoDB change stream — live case sync is DISABLED.\n' +
  '   Change streams require a replica set or a sharded cluster. To fix the deployment:\n' +
  '     • MongoDB Atlas: it is already a replica set — make sure MONGO_URI is the\n' +
  '       full SRV / "replicaSet=..." connection string (not a single-host URI).\n' +
  '     • Local mongod: start it with `mongod --replSet rs0 --dbpath <path>` and run\n' +
  '       `rs.initiate()` once in `mongosh`, then restart this server.\n' +
  '   Underlying error: ';

const writeEvent = (res, event, data) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

// userId === '*' broadcasts to everyone (used for deletes, where the change
// event carries no userId). A client only ever holds its own cases, so a
// delete id it doesn't recognise is a harmless no-op on the frontend.
const broadcast = (userId, event, payload) => {
  for (const client of clients) {
    if (userId === '*' || client.userId === userId) {
      try {
        writeEvent(client.res, event, payload);
      } catch {
        // socket already dead; its own 'close' handler will remove it
      }
    }
  }
};

export const addCaseStreamClient = (userId, res) => {
  const client = { userId: String(userId), res };
  clients.add(client);
  return () => clients.delete(client);
};

export const getCaseStreamClientCount = () => clients.size;

const handleChange = (change) => {
  const { operationType } = change;

  if (operationType === 'insert' || operationType === 'update' || operationType === 'replace') {
    const doc = change.fullDocument;
    // 'updateLookup' can come back null if the doc was deleted in the gap
    // between the update and the lookup — a delete event will follow.
    if (!doc || !doc.userId) return;
    broadcast(String(doc.userId), `case:${operationType}`, { case: serializeCaseForClient(doc) });
    return;
  }

  if (operationType === 'delete') {
    broadcast('*', 'case:delete', { id: String(change.documentKey?._id || '') });
  }
};

const scheduleRestart = (reason) => {
  if (restartTimer) return;
  console.error(`⚠️ Case change stream ${reason}; reconnecting in 3s`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startCaseChangeStream();
  }, 3000);
};

export const startCaseChangeStream = () => {
  try {
    if (changeStream) {
      changeStream.removeAllListeners();
      changeStream.close().catch(() => {});
      changeStream = null;
    }

    changeStream = Case.watch([], { fullDocument: 'updateLookup' });

    changeStream.on('change', handleChange);

    changeStream.on('error', (err) => {
      const isStandalone = /only supported on replica sets|replica set|sharded cluster|standalone/i.test(err.message);
      if (isStandalone) {
        if (!standaloneWarned) {
          standaloneWarned = true;
          console.error(STANDALONE_HELP + err.message);
        }
        return; // retrying against a standalone deployment is pointless
      }
      console.error('Case change stream error:', err.message);
      scheduleRestart('errored');
    });

    changeStream.on('close', () => scheduleRestart('closed'));

    console.log('✅ Case change stream live — real-time MongoDB sync enabled');
  } catch (err) {
    console.error(STANDALONE_HELP + err.message);
  }
};

// On boot, any case left in 'generating' by a crashed / restarted process would
// otherwise show the loading UI forever. Mark clearly-stale ones as failed and
// free their slot; the change stream then pushes that to any open client.
export const sweepStuckGeneratingCases = async (maxAgeMs = 15 * 60 * 1000) => {
  try {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const stuck = await Case.find({ status: 'generating', createdAt: { $lt: cutoff } }).select('_id userId');

    for (const doc of stuck) {
      await Case.findByIdAndUpdate(doc._id, {
        status: 'failed',
        caseName: 'יצירת התיק נכשלה',
        commanderBrief: 'יצירת התיק לא הושלמה (השרת ככל הנראה הופעל מחדש באמצע). אפשר לנסות שוב.',
      });
      await User.findByIdAndUpdate(doc.userId, { $pull: { activeCases: doc._id } });
    }

    if (stuck.length) {
      console.log(`🧹 Marked ${stuck.length} stale 'generating' case(s) as failed`);
    }
  } catch (err) {
    console.error('⚠️ Stuck-case sweep failed:', err.message);
  }
};
