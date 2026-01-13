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

const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: '未登录' });
        
        // Check permission strictly
        if (req.user.permissions && req.user.permissions[permission] === true) {
            next();
        } else {
            res.status(403).json({ error: `权限不足: 需要 [${permission}] 权限` });
        }
    };
};

module.exports = { authenticateToken, requirePermission };
