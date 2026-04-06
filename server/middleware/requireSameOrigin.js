const { requestMatchesAppOrigin } = require('../services/originService');

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requireSameOrigin() {
  return (req, res, next) => {
    if (!req.path.startsWith('/api') || !STATE_CHANGING_METHODS.has(req.method)) {
      next();
      return;
    }

    if (requestMatchesAppOrigin(req)) {
      next();
      return;
    }

    res.status(403).json({ message: 'Invalid request origin.' });
  };
}

module.exports = requireSameOrigin;
