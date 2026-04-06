function requireSession() {
  const publicPages = new Set(['/', '/login', '/register']);
  const publicApiRoutes = new Set([
    '/api/login',
    '/api/register/request-otp',
    '/api/register/verify-otp'
  ]);

  return (req, res, next) => {
    if (req.path.startsWith('/api')) {
      if (publicApiRoutes.has(req.path)) {
        next();
        return;
      }

      if (!req.session.userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      next();
      return;
    }

    if (publicPages.has(req.path)) {
      next();
      return;
    }

    if (!req.session.userId) {
      res.redirect('/login');
      return;
    }

    next();
  };
}

module.exports = requireSession;
