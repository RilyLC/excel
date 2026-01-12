const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Secret key for JWT (should be in env vars in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';

const register = (username, password) => {
    // Check if user exists
    const stmt = db.prepare('SELECT id FROM users WHERE username = ?');
    const user = stmt.get(username);
    if (user) {
        throw new Error('User already exists');
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const insert = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    const info = insert.run(username, hashedPassword);
    
    return { id: info.lastInsertRowid, username };
};

const login = (username, password) => {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(username);

    if (!user) {
        throw new Error('Invalid username or password');
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
        throw new Error('Invalid username or password');
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    return { token, user: { id: user.id, username: user.username } };
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        throw new Error('Invalid token');
    }
};

module.exports = {
    register,
    login,
    verifyToken
};
