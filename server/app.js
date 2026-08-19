const express = require('express');
const path = require('path');
const { toNodeHandler } = require('better-auth/node');

const initializeDatabase = require('./db/init');
const securityHeaders = require('./middleware/securityHeaders');
const requireSameOrigin = require('./middleware/requireSameOrigin');
const requireSession = require('./middleware/requireSession');
const noStore = require('./middleware/noStore');
const betterAuthSession = require('./middleware/betterAuthSession');
const createApiRoutes = require('./routes/api');
const createPageRoutes = require('./routes/pages');

async function createApp() {
  await initializeDatabase();

  const { auth } = await import('../dist/src/infrastructure/auth/betterAuth.mjs');

  const app = express();
  const publicDir = path.join(__dirname, '..', 'public');
  const isProduction = process.env.NODE_ENV === 'production';
  const rawTrustProxy = typeof process.env.TRUST_PROXY === 'string'
    ? process.env.TRUST_PROXY.trim()
    : '';
  let trustProxy = null;

  if (rawTrustProxy) {
    if (rawTrustProxy === 'true') {
      trustProxy = 1;
    } else if (rawTrustProxy === 'false') {
      trustProxy = 0;
    } else {
      trustProxy = Number(rawTrustProxy);
    }
  }

  app.disable('x-powered-by');

  if (trustProxy !== null && trustProxy !== 0 && !Number.isNaN(trustProxy)) {
    app.set('trust proxy', trustProxy);
  }

  app.use(securityHeaders({ isProduction }));
  app.use(requireSameOrigin());
  app.get('/healthz', (req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()) });
  });

  // Better Auth's handler must see the raw request body itself, so it is mounted
  // ahead of express.json() (calling express.json() first hangs its handler).
  app.all('/api/auth/*', toNodeHandler(auth));

  app.use(express.json({ limit: '2mb' }));
  app.use(betterAuthSession(auth));
  app.use(noStore());

  const staticOptions = {
    etag: true,
    maxAge: isProduction ? '1d' : 0
  };

  app.use('/css', express.static(path.join(publicDir, 'css'), staticOptions));
  app.use('/js', express.static(path.join(publicDir, 'js'), staticOptions));
  app.use('/images', express.static(path.join(publicDir, 'images'), staticOptions));

  app.use(requireSession());
  app.use(createPageRoutes(path.join(publicDir, 'views')));
  app.use('/api', createApiRoutes());

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ message: 'Not found.' });
      return;
    }

    res.status(404).send('Not found.');
  });

  app.use((err, req, res, next) => {
    console.error(err);

    if (req.path.startsWith('/api')) {
      res.status(500).json({ message: 'Something went wrong.' });
      return;
    }

    res.status(500).send('Something went wrong.');
  });

  return app;
}

module.exports = createApp;
