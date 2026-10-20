import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { useAlert } from '../context/AlertContext';
import { useLanguage } from '../context/LanguageContext';
import { Mail, Lock, LogIn, ArrowRight, Eye, EyeOff } from 'lucide-react';
import './AuthPage.css';

export const LoginPage: React.FC = () => {
  const { loginWithGoogle, loginWithEmail, isLoading } = useAuth();
  const { navigate } = useRouter();
  const { toast } = useAlert();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Handle Google Login
  const handleGoogleLogin = async () => {
    try {
      setSubmitting(true);
      await loginWithGoogle();
      toast.success(t('toastLoginSuccess') || 'Mengalihkan ke akun Google...');
    } catch (err: any) {
      toast.error(
        err.message || 'Layanan masuk dengan Google tidak dapat diproses saat ini. Silakan gunakan email dan kata sandi.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Email & Password Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.warning('Harap lengkapi email dan kata sandi.');
      return;
    }
    if (password.length < 6) {
      toast.warning(t('passwordMinLength'));
      return;
    }
    if (password.length > 32) {
      toast.warning(t('passwordMaxLength'));
      return;
    }

    setSubmitting(true);
    const res = await loginWithEmail(email.trim(), password);
    if (res.success) {
      toast.success(t('toastLoginSuccess'));
      navigate('/dashboard');
    } else {
      toast.error(res.error || 'Email atau kata sandi tidak sesuai.');
    }
    setSubmitting(false);
  };

  return (
    <div className="auth-page-container">
      {/* Page Header */}
      <div className="auth-header">
        <div className="auth-icon-badge">
          <LogIn size={26} />
        </div>
        <h1 className="auth-title">{t('loginTitle')}</h1>
        <p className="auth-subtitle">{t('loginSubtitle')}</p>
      </div>

      {/* Google OAuth Button */}
      <div className="auth-oauth-section">
        <button
          type="button"
          className="btn-google-oauth"
          onClick={handleGoogleLogin}
          disabled={submitting || isLoading}
          id="btn-google-login"
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{t('loginWithGoogle')}</span>
        </button>
      </div>

      {/* Divider */}
      <div className="auth-divider">
        <span>{t('orLoginWithEmail')}</span>
      </div>

      {/* Login Form */}
      <form onSubmit={handleLoginSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="auth-email-input" className="form-label">
            <Mail size={15} />
            <span>{t('emailLabel')}</span>
          </label>
          <div className="input-wrapper">
            <input
              id="auth-email-input"
              type="email"
              className="auth-input"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <div className="form-label-row">
            <label htmlFor="auth-password-input" className="form-label">
              <Lock size={15} />
              <span>{t('passwordLabel')}</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className={`char-counter-badge ${
                  password.length >= 32 ? 'max' : password.length >= 26 ? 'warn' : ''
                }`}
                title={`${password.length}/32 ${t('charLimitLabel')}`}
              >
                {password.length}/32
              </span>
              <button
                type="button"
                className="btn-forgot-password-link"
                onClick={() => navigate('/forgot-password')}
                id="btn-forgot-password"
              >
                {t('forgotPasswordLink')}
              </button>
            </div>
          </div>
          <div className="input-wrapper">
            <input
              id="auth-password-input"
              type={showPassword ? 'text' : 'password'}
              className="auth-input has-toggle"
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={32}
              required
            />
            <button
              type="button"
              className="btn-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? t('hidePassword') : t('showPassword')}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="btn-submit-auth"
          disabled={submitting || isLoading}
          id="btn-auth-submit"
        >
          <span>{submitting ? t('processingBtn') : t('loginSubmitBtn')}</span>
          <ArrowRight size={18} />
        </button>
      </form>

      {/* Bottom Switch to Register */}
      <div className="auth-footer-switch">
        <span>{t('noAccountYet')}</span>
        <button
          type="button"
          className="btn-switch-link"
          onClick={() => navigate('/register')}
          id="btn-goto-register"
        >
          {t('registerHereLink')}
        </button>
      </div>
    </div>
  );
};
export default LoginPage;
