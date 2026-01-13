const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Secret key for JWT (should be in env vars in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';

// Define Default Permissions for Roles
const ROLE_PERMISSIONS = {
    admin: {
        can_delete: true,
        can_edit: true,
        view_all: true,
        can_manage_users: true
    },
    user: {
        can_delete: false,  // Disabled for normal users
        can_edit: true,     // Default enabled, pre-reserved control
        view_all: false,
        can_manage_users: false
    }
};

const USERNAME_REGEX = /^[\p{L}\p{N}_]{2,20}$/u; // 2-20: 字母/数字/下划线（含中文等字母类）
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[\S]{8,64}$/; // 8-64: 至少1字母+1数字，且不含空白

const normalizeUsername = (username) => String(username || '').trim();

const validateUsername = (username) => {
    const u = normalizeUsername(username);
    if (!u) throw new Error('用户名是必填项');
    if (!USERNAME_REGEX.test(u)) {
        throw new Error('用户名格式不正确（2-20位，仅允许字母/数字/下划线）');
    }
    return u;
};

const validatePassword = (password) => {
    const p = String(password || '');
    if (!p) throw new Error('密码是必填项');
    if (!PASSWORD_REGEX.test(p)) {
        throw new Error('密码格式不正确（8-64位，至少包含字母和数字）');
    }
    return p;
};

// const register = (username, password) => {
//     const normalizedUsername = validateUsername(username);
//     const normalizedPassword = validatePassword(password);

//     // Check if user exists
//     const stmt = db.prepare('SELECT id FROM users WHERE username = ?');
//     const user = stmt.get(normalizedUsername);
//     if (user) {
//         throw new Error('用户已存在');
//     }

//     const hashedPassword = bcrypt.hashSync(normalizedPassword, 10);
//     const insert = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
//     const info = insert.run(normalizedUsername, hashedPassword);
    
//     return { id: info.lastInsertRowid, username: normalizedUsername };
// };

const login = (username, password) => {
    const normalizedUsername = normalizeUsername(username);
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(normalizedUsername);

    if (!user) {
        throw new Error('无效的用户名或密码');
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        throw new Error('无效的用户名或密码');
    }

    // Merge stored permissions with role defaults (stored overrides defaults)
    const role = user.role || 'user';
    const storedPerms = user.permissions ? JSON.parse(user.permissions) : {};
    const effectivePermissions = { ...ROLE_PERMISSIONS[role], ...storedPerms };

    const payload = { 
        id: user.id, 
        username: user.username, 
        role: role,
        permissions: effectivePermissions
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    return { token, user: payload };
};

const changePassword = (userId, oldPassword, newPassword) => {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) throw new Error('无效的用户ID');

    const oldP = String(oldPassword || '');
    const newP = validatePassword(newPassword);
    if (!oldP) throw new Error('原密码是必填项');
    if (oldP === newP) throw new Error('新密码不能与原密码相同');

    const user = db.prepare('SELECT id, password FROM users WHERE id = ?').get(uid);
    if (!user) throw new Error('用户不存在');

    const ok = bcrypt.compareSync(oldP, user.password);
    if (!ok) throw new Error('原密码错误');

    const hashed = bcrypt.hashSync(newP, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, uid);
    return { success: true };
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        throw new Error('无效的 token');
    }
};

module.exports = {
    // register,
    login,
    verifyToken,
    changePassword
};
