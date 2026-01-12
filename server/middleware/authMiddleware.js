const authService = require('../services/authService');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: '未授权访问' });
    }

    try {
        const user = authService.verifyToken(token);
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: '无效的 token' });
    }
};

module.exports = { authenticateToken };
