const session = require('express-session');

const { get, run } = require('../db/connection');

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 8;

function resolveSessionExpiry(sess) {
  if (sess && sess.cookie && sess.cookie.expires) {
    const expiresAt = new Date(sess.cookie.expires).getTime();

    if (!Number.isNaN(expiresAt)) {
      return expiresAt;
    }
  }

  if (sess && sess.cookie && Number.isFinite(sess.cookie.maxAge)) {
    return Date.now() + Number(sess.cookie.maxAge);
  }

  return Date.now() + DEFAULT_SESSION_TTL_MS;
}

class PostgresSessionStore extends session.Store {
  get(sid, callback) {
    get('SELECT sess, expires_at FROM sessions WHERE sid = ?', [sid])
      .then(async (row) => {
        if (!row) {
          callback(null, null);
          return;
        }

        if (Number(row.expires_at) <= Date.now()) {
          await run('DELETE FROM sessions WHERE sid = ?', [sid]);
          callback(null, null);
          return;
        }

        callback(null, JSON.parse(row.sess));
      })
      .catch((error) => callback(error));
  }

  set(sid, sess, callback) {
    run(
      `INSERT INTO sessions (sid, sess, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT (sid) DO UPDATE SET
         sess = EXCLUDED.sess,
         expires_at = EXCLUDED.expires_at`,
      [sid, JSON.stringify(sess), resolveSessionExpiry(sess)]
    )
      .then(() => callback && callback())
      .catch((error) => callback && callback(error));
  }

  touch(sid, sess, callback) {
    run(
      'UPDATE sessions SET sess = ?, expires_at = ? WHERE sid = ?',
      [JSON.stringify(sess), resolveSessionExpiry(sess), sid]
    )
      .then(() => callback && callback())
      .catch((error) => callback && callback(error));
  }

  destroy(sid, callback) {
    run('DELETE FROM sessions WHERE sid = ?', [sid])
      .then(() => callback && callback())
      .catch((error) => callback && callback(error));
  }
}

module.exports = PostgresSessionStore;
