import React, { useState } from 'react';
import App from './App';
import Login from './Login';

const AuthApp = () => {
    const [token, setToken] = useState(localStorage.getItem('token'));

    const handleLoginSuccess = (token) => {
        setToken(token);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
    };

    if (!token) {
        return <Login onSuccess={handleLoginSuccess} />;
    }

    return <App onLogout={handleLogout} />;
};

export default AuthApp;
