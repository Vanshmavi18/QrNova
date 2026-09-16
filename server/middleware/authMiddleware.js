const jwt = require('jsonwebtoken');

const authMiddleware = (required = true) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
    }

    if (!token) {
      if (required) {
        return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
      }
      req.user = null;
      return next();
    }

    try {
      const secret = process.env.JWT_SECRET || 'qrnova_jwt_secret_dev_key_849204928402';
      const decoded = jwt.verify(token, secret);
      req.user = decoded;
      next();
    } catch (err) {
      if (required) {
        return res.status(401).json({ success: false, error: 'Invalid or expired authentication session.' });
      }
      req.user = null;
      next();
    }
  };
};

module.exports = authMiddleware;
