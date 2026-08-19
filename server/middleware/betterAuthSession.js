const { fromNodeHeaders } = require('better-auth/node');

// Resolves the Better Auth session cookie into the same req.session.userId shape
// express-session used to provide, so every other controller and requireSession
// keep working unchanged.
function betterAuthSession(auth) {
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      req.session = session ? { userId: Number(session.user.id) } : {};
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = betterAuthSession;
