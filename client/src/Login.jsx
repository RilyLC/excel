import React, { useState } from 'react';
import { api } from './api';
import { Loader2 } from 'lucide-react';

const USERNAME_REGEX = /^[\p{L}\p{N}_]{2,20}$/u;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[\S]{8,64}$/;

const validateRegisterUsername = (value) => {
    const u = (value || '').trim();
    if (!u) return '用户名是必填项';
    if (!USERNAME_REGEX.test(u)) return '用户名格式不正确（2-20位，仅允许字母/数字/下划线）';
    return '';
};

const validateRegisterPassword = (value) => {
    const p = value || '';
    if (!p) return '密码是必填项';
    if (!PASSWORD_REGEX.test(p)) return '密码格式不正确（8-64位，至少包含字母和数字，且不能包含空格）';
    return '';
};

const Login = ({ onSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const [touched, setTouched] = useState({ username: false, password: false });
    const [fieldErrors, setFieldErrors] = useState({ username: '', password: '' });

    const setRegisterFieldError = (field, value) => {
        if (isLogin) return;
        const next = { ...fieldErrors };
        if (field === 'username') next.username = validateRegisterUsername(value);
        if (field === 'password') next.password = validateRegisterPassword(value);
        setFieldErrors(next);
    };

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
                const usernameErr = validateRegisterUsername(username);
                const passwordErr = validateRegisterPassword(password);
                setTouched({ username: true, password: true });
                setFieldErrors({ username: usernameErr, password: passwordErr });

                if (usernameErr || passwordErr) {
                    setError(usernameErr || passwordErr);
                    return;
                }
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
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 relative overflow-hidden">
             {/* Background decorations */}
             <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-purple-200/30 blur-3xl"></div>
                <div className="absolute top-[20%] -right-[5%] w-[30%] h-[30%] rounded-full bg-blue-200/30 blur-3xl"></div>
                <div className="absolute -bottom-[10%] left-[20%] w-[35%] h-[35%] rounded-full bg-indigo-200/30 blur-3xl"></div>
             </div>

            <div className="relative bg-white/80 backdrop-blur-md p-8 sm:p-10 rounded-2xl shadow-xl w-full max-w-md border border-white/50">
                <div className="text-center mb-8">
                    <div className="mx-auto h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center mb-4 text-white shadow-lg shadow-blue-600/20">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-database"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                        {isLogin ? '数据管理平台' : '创建账户'}
                    </h2>
                    <p className="text-gray-500 mt-2 text-sm">
                        {isLogin ? '请输入您的账号密码进行登录' : '注册以开始管理您的数据'}
                    </p>
                </div>
                
                {error && (
                    <div className={`p-4 rounded-lg mb-6 text-sm flex items-start gap-3 ${error.includes('成功') ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                        <div className="mt-0.5 shrink-0">
                           {error.includes('成功') ? 
                             <div className="h-4 w-4 rounded-full bg-green-400/50" /> : 
                             <div className="h-4 w-4 rounded-full bg-red-400/50" />
                           }
                        </div>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">用户名</label>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={e => {
                                const v = e.target.value;
                                setUsername(v);
                                if (!isLogin && touched.username) setRegisterFieldError('username', v);
                            }}
                            onBlur={() => {
                                if (isLogin) return;
                                setTouched(prev => ({ ...prev, username: true }));
                                setRegisterFieldError('username', username);
                            }}
                            placeholder="请输入用户名"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                        />
                         {!isLogin && touched.username && fieldErrors.username && (
                            <div className="mt-1.5 text-xs text-red-500 ml-1">{fieldErrors.username}</div>
                        )}
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1.5 ml-1">
                            <label className="block text-sm font-semibold text-gray-700">密码</label>
                        </div>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={e => {
                                const v = e.target.value;
                                setPassword(v);
                                if (!isLogin && touched.password) setRegisterFieldError('password', v);
                            }}
                            onBlur={() => {
                                if (isLogin) return;
                                setTouched(prev => ({ ...prev, password: true }));
                                setRegisterFieldError('password', password);
                            }}
                            placeholder="请输入密码"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                        />
                         {!isLogin && (
                            <div className="mt-1.5 text-xs text-gray-400 ml-1">
                                8-64位，含字母和数字，无空格
                            </div>
                        )}
                        {!isLogin && touched.password && fieldErrors.password && (
                            <div className="mt-1.5 text-xs text-red-500 ml-1">{fieldErrors.password}</div>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-blue-600/30 hover:shadow-blue-600/40 transform active:scale-[0.98]"
                    >
                        {loading && <Loader2 className="animate-spin mr-2" size={20} />}
                        {isLogin ? '立即登录' : '注册账户'}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-sm text-gray-500">
                        {isLogin ? '还没有账号？' : '已有账号？'}
                        <button 
                            onClick={() => { setIsLogin(!isLogin); setError(''); }}
                            className="ml-1 text-blue-600 font-semibold hover:text-blue-700 hover:underline transition-colors focus:outline-none"
                        >
                            {isLogin ? '立即注册' : '直接登录'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
