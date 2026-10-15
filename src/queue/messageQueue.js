import { config } from '../config.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('queue');

// Per-user FIFO queues to guarantee ordered processing for a given user.
const userQueues = new Map(); // jid -> Promise chain tail
let activeGlobalRequests = 0;
const waitingForSlot = [];

function acquireGlobalSlot() {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (activeGlobalRequests < config.limits.maxConcurrentRequests) {
        activeGlobalRequests += 1;
        resolve();
      } else {
        waitingForSlot.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

function releaseGlobalSlot() {
  activeGlobalRequests = Math.max(0, activeGlobalRequests - 1);
  const next = waitingForSlot.shift();
  if (next) next();
}

/**
 * Enqueues a task for a given user JID, guaranteeing tasks for the same
 * user run strictly in order, one at a time, while also respecting a
 * global concurrency cap across all users.
 * @param {string} jid
 * @param {() => Promise<void>} task
 */
export function enqueueForUser(jid, task) {
  const previous = userQueues.get(jid) || Promise.resolve();

  const run = previous
    .catch(() => {}) // never let one failure break the chain
    .then(async () => {
      await acquireGlobalSlot();
      try {
        await task();
      } catch (err) {
        log.error({ jid, err: err.message }, 'Queued task failed');
      } finally {
        releaseGlobalSlot();
      }
    });

  userQueues.set(jid, run);

  // Cleanup: once this is the tail and it's done, remove to avoid memory growth.
  run.then(() => {
    if (userQueues.get(jid) === run) {
      userQueues.delete(jid);
    }
  });

  return run;
}

export function getQueueStats() {
  return {
    activeGlobalRequests,
    waitingForSlot: waitingForSlot.length,
    usersWithPendingQueue: userQueues.size,
  };
}
