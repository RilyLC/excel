import React, { useState } from 'react';
import { api } from './api';
import { Loader2 } from 'lucide-react';

const Login = ({ onSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                const res = await api.login(username, password);
                // Store token
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('user', JSON.stringify(res.data.user)); // Optional: store user info
                // Trigger success
                onSuccess(res.data.token);
            } else {
                await api.register(username, password);
                setError('注册成功！请登录。');
                setIsLogin(true);
            }
        } catch (err) {
            // Translate common error messages if needed, or just show backend error
            const msg = err.response?.data?.error;
            if (msg === 'User already exists') setError('用户已存在');
            else if (msg === 'Invalid username or password') setError('用户名或密码错误');
            else setError(msg || '操作失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
                <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
                    {isLogin ? '登录' : '注册'}
                </h2>
                
                {error && (
                    <div className={`p-3 rounded mb-4 text-sm ${error.includes('成功') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="请输入用户名"
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="请输入密码"
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors flex items-center justify-center disabled:opacity-50"
                    >
                        {loading && <Loader2 className="animate-spin mr-2" size={16} />}
                        {isLogin ? '登录' : '注册'}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm">
                    <button 
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="text-blue-600 hover:underline"
                    >
                        {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
