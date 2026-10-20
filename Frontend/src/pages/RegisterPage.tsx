import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { useAlert } from '../context/AlertContext';
import { useLanguage } from '../context/LanguageContext';
import { sendOtpToEmail } from '../services/otpService';
import {
  PasswordCriteriaPanel,
  evaluatePasswordCriteria,
  isPasswordCriteriaMet,
} from '../components/PasswordCriteriaPanel';
import {
  Mail,
  Lock,
  User as UserIcon,
  UserPlus,
  Shield,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import './AuthPage.css';

export const RegisterPage: React.FC = () => {
  const { loginWithGoogle, isLoading } = useAuth();
  const { navigate } = useRouter();
  const { toast } = useAlert();
  const { t } = useLanguage();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Real-time password criteria evaluation
  const passwordCriteria = evaluatePasswordCriteria(password);
  const isPasswordValid = isPasswordCriteriaMet(passwordCriteria);

  // Smart Admin Recognition
  const isSpecialAdmin = email.trim().toLowerCase() === 'stanvision1534@gmail.com';

  // Handle Google OAuth
  const handleGoogleRegister = async () => {
    try {
      setSubmitting(true);
      await loginWithGoogle();
      toast.success(t('toastLoginSuccess') || 'Mengalihkan ke pendaftaran Google...');
    } catch (err: any) {
      toast.error(
        err.message || 'Layanan pendaftaran dengan Google tidak dapat diproses saat ini. Silakan gunakan formulir email di bawah.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Register & Dispatch OTP
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (!cleanName || !cleanEmail || !password.trim() || !confirmPassword.trim()) {
      toast.warning('Harap lengkapi seluruh kolom formulir termasuk konfirmasi kata sandi.');
      return;
    }
    if (!isPasswordValid) {
      toast.warning(t('toastPasswordCriteriaError'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      // Dispatch 6-digit OTP to user's email
      const result = await sendOtpToEmail(cleanEmail, cleanName, 'REGISTER');
      if (result.success) {
        toast.success(`${t('toastOtpSent')} (${cleanEmail})`);
        // Navigate to dedicated OTP verification page with registration data
        navigate('/verify-otp', {
          email: cleanEmail,
          name: cleanName,
          password: password,
          role: isSpecialAdmin ? 'admin' : 'user',
          purpose: 'REGISTER',
        });
      } else {
        toast.error('Gagal mengirimkan kode OTP. Silakan coba lagi.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan saat memproses pendaftaran.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page-container">
      {/* Page Header */}
      <div className="auth-header">
        <div className="auth-icon-badge">
          <UserPlus size={26} />
        </div>
        <h1 className="auth-title">{t('registerTitle')}</h1>
        <p className="auth-subtitle">{t('registerSubtitle')}</p>
      </div>

      {/* Google OAuth Button */}
      <div className="auth-oauth-section">
        <button
          type="button"
          className="btn-google-oauth"
          onClick={handleGoogleRegister}
          disabled={submitting || isLoading}
          id="btn-google-register"
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
          <span>{t('registerWithGoogle')}</span>
        </button>
      </div>

      {/* Divider */}
      <div className="auth-divider">
        <span>{t('orRegisterWithEmail')}</span>
      </div>

      {/* Form */}
      <form onSubmit={handleRegisterSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="reg-name-input" className="form-label">
            <UserIcon size={15} />
            <span>{t('fullNameLabel')}</span>
          </label>
          <div className="input-wrapper">
            <input
              id="reg-name-input"
              type="text"
              className="auth-input"
              placeholder={t('fullNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="reg-email-input" className="form-label">
            <Mail size={15} />
            <span>{t('emailLabel')}</span>
          </label>
          <div className="input-wrapper">
            <input
              id="reg-email-input"
              type="email"
              className="auth-input"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Smart Admin Recognition Badge */}
          {isSpecialAdmin && (
            <div className="smart-admin-badge">
              <Shield size={14} />
              <span>{t('adminBadgeDetected')}</span>
            </div>
          )}
        </div>

        {/* Password Field with Eye Toggle & Char Limit */}
        <div className="form-group">
          <div className="form-label-row">
            <label htmlFor="reg-password-input" className="form-label">
              <Lock size={15} />
              <span>{t('newPasswordLabel')}</span>
            </label>
            <span
              className={`char-counter-badge ${
                password.length >= 32 ? 'max' : password.length >= 26 ? 'warn' : ''
              }`}
              title={`${password.length}/32 ${t('charLimitLabel')}`}
            >
              {password.length}/32
            </span>
          </div>
          <div className="input-wrapper">
            <input
              id="reg-password-input"
              type={showPassword ? 'text' : 'password'}
              className={`auth-input has-toggle ${
                password ? (isPasswordValid ? 'status-green' : 'status-yellow') : ''
              }`}
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              maxLength={32}
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

          {/* Real-time Password Complexity Rules (Yellow incomplete / Green complete) */}
          <PasswordCriteriaPanel password={password} />
        </div>

        {/* Confirm Password Field with Eye Toggle & Char Limit */}
        <div className="form-group">
          <div className="form-label-row">
            <label htmlFor="reg-confirm-password-input" className="form-label">
              <Lock size={15} />
              <span>{t('confirmPasswordLabel')}</span>
            </label>
            <span
              className={`char-counter-badge ${
                confirmPassword.length >= 32 ? 'max' : confirmPassword.length >= 26 ? 'warn' : ''
              }`}
              title={`${confirmPassword.length}/32 ${t('charLimitLabel')}`}
            >
              {confirmPassword.length}/32
            </span>
          </div>
          <div className="input-wrapper">
            <input
              id="reg-confirm-password-input"
              type={showConfirmPassword ? 'text' : 'password'}
              className={`auth-input has-toggle ${
                confirmPassword
                  ? password === confirmPassword
                    ? 'status-green'
                    : 'status-yellow'
                  : ''
              }`}
              placeholder={t('confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              maxLength={32}
            />
            <button
              type="button"
              className="btn-password-toggle"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              title={showConfirmPassword ? t('hidePassword') : t('showPassword')}
              aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Real-time Match Feedback */}
          {confirmPassword.length > 0 && (
            password === confirmPassword ? (
              <div className="password-match-success">
                <CheckCircle2 size={14} />
                <span>{t('passwordMatched')}</span>
              </div>
            ) : (
              <div className="password-mismatch-warning">
                <AlertCircle size={14} />
                <span>{t('passwordMismatch')}</span>
              </div>
            )
          )}
        </div>

        <button
          type="submit"
          className="btn-submit-auth"
          disabled={submitting || isLoading}
          id="btn-register-submit"
        >
          <span>{submitting ? t('sendingOtpBtn') : t('continueToOtp')}</span>
          <ArrowRight size={18} />
        </button>
      </form>

      {/* Bottom Switch to Login */}
      <div className="auth-footer-switch">
        <span>{t('alreadyHaveAccount')}</span>
        <button
          type="button"
          className="btn-switch-link"
          onClick={() => navigate('/login')}
          id="btn-goto-login"
        >
          {t('loginHereLink')}
        </button>
      </div>
    </div>
  );
};
export default RegisterPage;
