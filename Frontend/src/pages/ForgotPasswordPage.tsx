import React, { useState } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAlert } from '../context/AlertContext';
import { sendOtpToEmail, updatePasswordWithVerifiedOtp } from '../services/otpService';
import { useLanguage } from '../context/LanguageContext';
import { OtpInput } from '../components/OtpInput';
import {
  PasswordCriteriaPanel,
  evaluatePasswordCriteria,
  isPasswordCriteriaMet,
} from '../components/PasswordCriteriaPanel';
import { KeyRound, Mail, Lock, ArrowLeft, ArrowRight, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import './AuthPage.css';

export const ForgotPasswordPage: React.FC = () => {
  const { navigate } = useRouter();
  const { toast } = useAlert();
  const { t } = useLanguage();

  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Real-time password criteria evaluation
  const newPasswordCriteria = evaluatePasswordCriteria(newPassword);
  const isNewPasswordValid = isPasswordCriteriaMet(newPasswordCriteria);

  // Step 1: Request OTP for password reset
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.warning('Harap masukkan alamat email Anda.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await sendOtpToEmail(email.trim(), 'Pengguna ADAM', 'FORGOT_PASSWORD');
      if (res.success) {
        toast.success(`Kode OTP reset kata sandi telah dikirim ke ${email}`);
        setStep('verify');
      } else {
        toast.error('Gagal mengirimkan kode OTP reset kata sandi.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan saat memproses permintaan.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: Verify OTP and save new password
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      toast.warning('Harap masukkan 6-digit kode OTP.');
      return;
    }
    if (!isNewPasswordValid) {
      toast.warning(t('toastPasswordCriteriaError'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warning(t('passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await updatePasswordWithVerifiedOtp(email.trim(), otpCode.trim(), newPassword);
      if (res.success) {
        toast.success('Kata sandi berhasil diperbarui! Silakan masuk dengan kata sandi baru.');
        navigate('/login');
      } else {
        toast.error(res.error || 'Gagal mengatur ulang kata sandi.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Terjadi kesalahan saat menyimpan kata sandi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page-container">
      {/* Header */}
      <div className="auth-header">
        <div className="auth-icon-badge">
          <KeyRound size={26} />
        </div>
        <h1 className="auth-title">
          {step === 'request' ? 'Lupa Kata Sandi' : 'Atur Ulang Kata Sandi'}
        </h1>
        <p className="auth-subtitle">
          {step === 'request'
            ? 'Masukkan email Anda untuk menerima kode OTP pemulihan kata sandi'
            : `Masukkan kode OTP dan kata sandi baru untuk akun ${email}`}
        </p>
      </div>

      {step === 'request' ? (
        /* Form Step 1: Input Email */
        <form onSubmit={handleRequestOtp} className="auth-form">
          <div className="form-group">
            <label htmlFor="forgot-email-input" className="form-label">
              <Mail size={15} />
              <span>Alamat Email Terdaftar</span>
            </label>
            <div className="input-wrapper">
              <input
                id="forgot-email-input"
                type="email"
                className="auth-input"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-submit-auth"
            disabled={submitting}
            id="btn-request-otp"
          >
            <span>{submitting ? 'Mengirim OTP...' : 'Kirim Kode OTP Pemulihan'}</span>
            <ArrowRight size={18} />
          </button>

          <button
            type="button"
            className="btn-back-link"
            onClick={() => navigate('/login')}
            id="btn-back-to-login"
          >
            <ArrowLeft size={15} />
            <span>Kembali ke Halaman Masuk</span>
          </button>
        </form>
      ) : (
        /* Form Step 2: Input OTP & New Password */
        <form onSubmit={handleResetSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">
              <span>Kode OTP 6 Digit</span>
            </label>
            <OtpInput
              length={6}
              value={otpCode}
              onChange={(val) => setOtpCode(val)}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="new-password-input" className="form-label">
                <Lock size={15} />
                <span>{t('newPasswordLabel')}</span>
              </label>
              <span
                className={`char-counter-badge ${
                  newPassword.length >= 32 ? 'max' : newPassword.length >= 26 ? 'warn' : ''
                }`}
                title={`${newPassword.length}/32 ${t('charLimitLabel')}`}
              >
                {newPassword.length}/32
              </span>
            </div>
            <div className="input-wrapper">
              <input
                id="new-password-input"
                type={showNewPassword ? 'text' : 'password'}
                className={`auth-input has-toggle ${
                  newPassword ? (isNewPasswordValid ? 'status-green' : 'status-yellow') : ''
                }`}
                placeholder={t('passwordPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                maxLength={32}
              />
              <button
                type="button"
                className="btn-password-toggle"
                onClick={() => setShowNewPassword(!showNewPassword)}
                title={showNewPassword ? t('hidePassword') : t('showPassword')}
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Real-time Password Complexity Rules (Yellow incomplete / Green complete) */}
            <PasswordCriteriaPanel password={newPassword} />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="confirm-password-input" className="form-label">
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
                id="confirm-password-input"
                type={showConfirmPassword ? 'text' : 'password'}
                className={`auth-input has-toggle ${
                  confirmPassword
                    ? newPassword === confirmPassword
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
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Match Validation Indicator */}
            {confirmPassword.length > 0 && (
              newPassword === confirmPassword ? (
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
            disabled={submitting || otpCode.length !== 6}
            id="btn-reset-password-submit"
          >
            <span>{submitting ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}</span>
            <ArrowRight size={18} />
          </button>

          <button
            type="button"
            className="btn-back-link"
            onClick={() => setStep('request')}
          >
            <ArrowLeft size={15} />
            <span>Ganti Alamat Email</span>
          </button>
        </form>
      )}
    </div>
  );
};
export default ForgotPasswordPage;
