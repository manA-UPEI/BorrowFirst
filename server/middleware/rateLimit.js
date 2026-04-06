const { get, run, withTransaction } = require('../db/connection');

function createRateLimit({ windowMs, max, prefix = 'global', key = null }) {
  return async (req, res, next) => {
    const now = Date.now();
    const keyValue = typeof key === 'function' ? key(req) : (req.ip || 'unknown');
    const rateKey = `${prefix}:${keyValue || 'unknown'}`;

    try {
      const state = await withTransaction(async () => {
        await run('DELETE FROM rate_limits WHERE reset_at <= ?', [now]);

        const current = await get(
          'SELECT count, reset_at FROM rate_limits WHERE rate_key = ?',
          [rateKey]
        );

        if (!current || current.reset_at <= now) {
          await run(
            `INSERT INTO rate_limits (rate_key, count, reset_at)
             VALUES (?, ?, ?)
             ON CONFLICT(rate_key) DO UPDATE SET
               count = excluded.count,
               reset_at = excluded.reset_at`,
            [rateKey, 1, now + windowMs]
          );

          return { allowed: true };
        }

        if (current.count >= max) {
          return {
            allowed: false,
            retryAfterMs: current.reset_at - now
          };
        }

        await run('UPDATE rate_limits SET count = count + 1 WHERE rate_key = ?', [rateKey]);
        return { allowed: true };
      });

      if (!state.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil(state.retryAfterMs / 1000));
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({ message: 'Too many requests. Please try again later.' });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = createRateLimit;
