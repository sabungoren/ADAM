import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { useAlert } from '../context/AlertContext';
import { useLanguage } from '../context/LanguageContext';
import { verifyOtpCode, sendOtpToEmail } from '../services/otpService';
import { OtpInput } from '../components/OtpInput';
import { KeyRound, RotateCcw, ArrowLeft, ArrowRight } from 'lucide-react';
import './AuthPage.css';

export const VerifyOtpPage: React.FC = () => {
  const { registerWithEmail } = useAuth();
  const { navigate, routeState } = useRouter();
  const { toast } = useAlert();
  const { t } = useLanguage();

  const email = routeState?.email || '';
  const name = routeState?.name || '';
  const password = routeState?.password || '';
  const role = routeState?.role || 'user';
  const purpose = routeState?.purpose || 'REGISTER';

  const [otpCode, setOtpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);

  // Countdown timer for Resend OTP
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (resendTimer > 0) {
      timer = setTimeout(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendTimer]);

  // If no email in routeState, prompt to go to register or login
  useEffect(() => {
    if (!email) {
      toast.warning(t('toastOtpStartFirst'));
      navigate('/register');
    }
  }, [email]);

  // Handle Verify OTP & Complete Action
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      toast.warning(t('toastOtpRequired'));
      return;
    }

    setSubmitting(true);
    const check = verifyOtpCode(email, otpCode.trim(), purpose);
    if (!check.valid) {
      toast.error(check.error || t('toastOtpInvalid'));
      setSubmitting(false);
      return;
    }

    // OTP Verified Successfully!
    if (purpose === 'REGISTER') {
      const res = await registerWithEmail(name, email, password, role);
      if (res.success) {
        toast.success(t('toastRegisterSuccess'));
        navigate('/dashboard');
      } else {
        toast.error(res.error || t('toastRegisterFailed'));
      }
    } else {
      toast.success(t('toastOtpSent'));
      navigate('/login');
    }
    setSubmitting(false);
  };

  // Handle Resend OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0 || !email) return;
    try {
      const res = await sendOtpToEmail(email, name || 'Pengguna ADAM', purpose);
      if (res.success) {
        toast.success(t('toastOtpResentSuccess').replace('{email}', email));
        setResendTimer(60);
      } else {
        toast.error(t('toastOtpResendFailed'));
      }
    } catch (err: any) {
      toast.error(err.message || t('toastOtpResendFailed'));
    }
  };

  return (
    <div className="auth-page-container">
      {/* Header */}
      <div className="auth-header">
        <div className="auth-icon-badge">
          <KeyRound size={26} />
        </div>
        <h1 className="auth-title">{t('verifyOtpTitle')}</h1>
        <p className="auth-subtitle">
          {t('verifyOtpSubtitle')}
        </p>
        <span className="otp-email-highlight">{email || 'email-anda@domain.com'}</span>
      </div>

      {/* Form */}
      <form onSubmit={handleVerifyOtp} className="auth-form">
        <div className="form-group">
          <OtpInput
            length={6}
            value={otpCode}
            onChange={(val) => setOtpCode(val)}
            disabled={submitting}
          />
          <p className="otp-paste-hint">
            {t('verifyOtpHint')}
          </p>
        </div>

        <button
          type="submit"
          className="btn-submit-auth"
          disabled={submitting || otpCode.length !== 6}
          id="btn-verify-otp-submit"
        >
          <span>{submitting ? t('verifyOtpVerifying') : t('verifyOtpSubmitBtn')}</span>
          <ArrowRight size={18} />
        </button>

        {/* OTP Actions Column: 1 Komponen 1 Baris di Mobile */}
        <div className="otp-actions-column">
          <button
            type="button"
            className="btn-resend-otp"
            disabled={resendTimer > 0 || submitting}
            onClick={handleResendOtp}
            id="btn-resend-otp"
          >
            <RotateCcw size={15} />
            <span>
              {resendTimer > 0
                ? t('verifyOtpResendCountdown').replace('{sec}', String(resendTimer))
                : t('verifyOtpResendBtn')}
            </span>
          </button>

          <button
            type="button"
            className="btn-back-link"
            onClick={() => navigate('/login')}
            id="btn-back-to-login"
          >
            <ArrowLeft size={15} />
            <span>{t('verifyOtpBackToLogin')}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
export default VerifyOtpPage;
