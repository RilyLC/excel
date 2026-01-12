const authService = require('../services/authService');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        const user = authService.verifyToken(token);
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

module.exports = { authenticateToken };
