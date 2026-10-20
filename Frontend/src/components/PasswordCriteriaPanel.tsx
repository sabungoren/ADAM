import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { CheckCircle2, AlertCircle, ShieldCheck, ShieldAlert } from 'lucide-react';

export interface PasswordCriteriaState {
  length: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export const evaluatePasswordCriteria = (pwd: string): PasswordCriteriaState => ({
  length: pwd.length >= 6 && pwd.length <= 32,
  hasUpper: /[A-Z]/.test(pwd),
  hasLower: /[a-z]/.test(pwd),
  hasNumber: /[0-9]/.test(pwd),
  hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(pwd),
});

export const isPasswordCriteriaMet = (criteria: PasswordCriteriaState): boolean =>
  criteria.length &&
  criteria.hasUpper &&
  criteria.hasLower &&
  criteria.hasNumber &&
  criteria.hasSpecial;

interface PasswordCriteriaPanelProps {
  password: string;
}

export const PasswordCriteriaPanel: React.FC<PasswordCriteriaPanelProps> = ({ password }) => {
  const { t } = useLanguage();

  if (!password) {
    return null;
  }

  const criteria = evaluatePasswordCriteria(password);
  const isComplete = isPasswordCriteriaMet(criteria);

  const items = [
    { key: 'length', label: t('passwordReqLength'), met: criteria.length },
    { key: 'upper', label: t('passwordReqUpper'), met: criteria.hasUpper },
    { key: 'lower', label: t('passwordReqLower'), met: criteria.hasLower },
    { key: 'number', label: t('passwordReqNumber'), met: criteria.hasNumber },
    { key: 'special', label: t('passwordReqSpecial'), met: criteria.hasSpecial },
  ];

  return (
    <div
      className={`password-criteria-panel ${isComplete ? 'complete' : 'incomplete'}`}
      id="password-criteria-panel"
      role="region"
      aria-label={t('passwordReqTitle')}
    >
      <div className="criteria-header">
        <span className="criteria-header-title">{t('passwordReqTitle')}</span>
        <span className={`criteria-header-badge ${isComplete ? 'complete' : 'incomplete'}`}>
          {isComplete ? (
            <>
              <ShieldCheck size={13} />
              <span>{t('passwordReqComplete')}</span>
            </>
          ) : (
            <>
              <ShieldAlert size={13} />
              <span>{t('passwordReqIncomplete')}</span>
            </>
          )}
        </span>
      </div>

      <div className="criteria-grid">
        {items.map((item) => (
          <div
            key={item.key}
            className={`criteria-chip ${item.met ? 'met' : 'unmet'}`}
            title={`${item.label}: ${item.met ? 'Terpenuhi (Hijau)' : 'Belum Terpenuhi (Kuning)'}`}
          >
            {item.met ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasswordCriteriaPanel;
