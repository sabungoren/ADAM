import React from 'react';
import { useAlert } from '../../context/AlertContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import './ToastContainer.css';
import { ToastType } from '../../types';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast, modal, closeModal } = useAlert();

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="toast-icon success" size={20} />;
      case 'warning':
        return <AlertTriangle className="toast-icon warning" size={20} />;
      case 'error':
        return <AlertCircle className="toast-icon error" size={20} />;
      default:
        return <Info className="toast-icon info" size={20} />;
    }
  };

  return (
    <>
      {/* Toast Notifications Stack */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-card ${toast.type}`}>
            <div className="toast-content">
              <div className="toast-icon-wrapper">{getIcon(toast.type)}</div>
              <div className="toast-text-wrapper">
                {toast.title && <div className="toast-title">{toast.title}</div>}
                <div className="toast-message">{toast.message}</div>
              </div>
              <button
                className="toast-close-btn"
                onClick={() => removeToast(toast.id)}
                aria-label="Close notification"
              >
                <X size={16} />
              </button>
            </div>
            {toast.duration && toast.duration > 0 && (
              <div
                className="toast-progress-bar"
                style={{ animationDuration: `${toast.duration}ms` }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Luxury Modal Overlay */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-dialog glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className={`modal-header ${modal.type || 'info'}`}>
              <div className="modal-icon-circle">{getIcon(modal.type || 'info')}</div>
              <h3 className="modal-title">{modal.title || 'Konfirmasi'}</h3>
            </div>
            <div className="modal-body">
              <p>{modal.message}</p>
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  if (modal.onCancel) modal.onCancel();
                  closeModal();
                }}
              >
                {modal.cancelText || 'Batal'}
              </button>
              <button
                className={`btn-primary ${modal.type === 'error' ? 'btn-danger' : ''}`}
                onClick={() => {
                  if (modal.onConfirm) modal.onConfirm();
                  closeModal();
                }}
              >
                {modal.confirmText || 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
