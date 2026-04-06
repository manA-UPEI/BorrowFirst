const express = require('express');
const path = require('path');
const session = require('express-session');

const initializeDatabase = require('./db/init');
const securityHeaders = require('./middleware/securityHeaders');
const requireSameOrigin = require('./middleware/requireSameOrigin');
const requireSession = require('./middleware/requireSession');
const noStore = require('./middleware/noStore');
const createApiRoutes = require('./routes/api');
const createPageRoutes = require('./routes/pages');
const PostgresSessionStore = require('./services/postgresSessionStore');

async function createApp() {
  await initializeDatabase();

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

  app.use(express.json({ limit: '2mb' }));
  app.use(securityHeaders({ isProduction }));
  app.use(requireSameOrigin());
  app.get('/healthz', (req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()) });
  });
  app.use(
    session({
      name: process.env.SESSION_NAME || 'borrowfirst.sid',
      secret: process.env.SESSION_SECRET,
      store: new PostgresSessionStore(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      unset: 'destroy',
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction,
        path: '/',
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );
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
