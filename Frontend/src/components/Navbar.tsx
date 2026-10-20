import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { useAlert } from '../context/AlertContext';
import {
  LayoutDashboard,
  Network,
  History,
  Sun,
  Moon,
  Globe,
  LogIn,
  LogOut,
  Shield,
  User,
  Menu,
  X,
  UserPlus,
  Wifi,
} from 'lucide-react';
import { FleetConnectionModal } from './FleetConnectionModal';
import './Navbar.css';

interface NavbarProps {
  isOnline: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ isOnline }) => {
  const { isDark, toggleTheme } = useTheme();
  const { lang, toggleLanguage, t } = useLanguage();
  const { user, role, isAuthenticated, logout } = useAuth();
  const { currentPath, navigate } = useRouter();
  const { toast } = useAlert();

  // Mobile menu toggle state & element refs
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFleetModalOpen, setIsFleetModalOpen] = useState(false);
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const hamburgerBtnRef = useRef<HTMLButtonElement>(null);

  // Automatically close mobile menu when clicking or tapping outside of menuDropdownRef
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleOutsideInteraction = (event: MouseEvent | TouchEvent | PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // If click/touch is inside the mobile dropdown list area, do not close
      if (menuDropdownRef.current && menuDropdownRef.current.contains(target)) {
        return;
      }

      // If click/touch is on the hamburger button itself, let the button's toggle handler manage it
      if (hamburgerBtnRef.current && hamburgerBtnRef.current.contains(target)) {
        return;
      }

      // Any click/touch outside the navbar list area automatically closes the mobile menu
      setIsMobileMenuOpen(false);
    };

    // Use capture phase on pointerdown for immediate, zero-delay touch/mouse responsiveness
    document.addEventListener('pointerdown', handleOutsideInteraction, { capture: true });
    document.addEventListener('touchstart', handleOutsideInteraction, { capture: true, passive: true });

    // Keyboard support: Escape closes the menu
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // If window is resized to desktop width, close the mobile menu
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('pointerdown', handleOutsideInteraction, { capture: true });
      document.removeEventListener('touchstart', handleOutsideInteraction, { capture: true });
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [isMobileMenuOpen]);

  // Normalize active route helper
  const isDashboardActive = currentPath === '/' || currentPath === '/dashboard';
  const isEditorActive = currentPath === '/editor';
  const isLogsActive = currentPath === '/logs';
  const isAuthActive =
    currentPath === '/login' ||
    currentPath === '/register' ||
    currentPath === '/verify-otp' ||
    currentPath === '/forgot-password';

  const handleEditorClick = () => {
    setIsMobileMenuOpen(false);
    if (role !== 'admin') {
      toast.warning(
        'Akses Terbatas: Graph Editor memerlukan Role ADMIN. Silakan masuk sebagai akun Admin.'
      );
    }
    navigate('/editor');
  };

  const handleNavClick = (path: string) => {
    setIsMobileMenuOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    await logout();
    toast.info('Anda telah keluar dari akun.');
    setIsMobileMenuOpen(false);
    navigate('/dashboard');
  };

  return (
    <header className="navbar-container">
      <div className="navbar-inner">
        {/* Brand & Subtitle */}
        <div
          className="navbar-brand"
          onClick={() => handleNavClick('/dashboard')}
          style={{ cursor: 'pointer' }}
          id="navbar-brand-logo"
        >
          <div className="brand-icon-box">
            <img
              src="/adam_logo.svg"
              alt="ADAM Logo"
              className="brand-logo-img"
              width="28"
              height="28"
              style={{ borderRadius: '6px', objectFit: 'contain' }}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div className="brand-text">
            <div className="brand-title-row">
              <span className="brand-title">{t('brandTitle')}</span>
              <span className="group-badge">{t('groupLabel')}</span>
            </div>
            <span className="brand-subtitle">{t('brandSubtitle')}</span>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav className="navbar-links desktop-only" aria-label="Main Navigation">
          <button
            className={`nav-tab-btn ${isDashboardActive ? 'active' : ''}`}
            onClick={() => handleNavClick('/dashboard')}
            id="nav-tab-dashboard"
          >
            <LayoutDashboard size={18} />
            <span>{t('navDashboard')}</span>
          </button>

          {role === 'admin' && (
            <button
              className={`nav-tab-btn ${isEditorActive ? 'active' : ''}`}
              onClick={handleEditorClick}
              id="nav-tab-editor"
              title="Editor Peta Lintasan"
            >
              <Network size={18} />
              <span>{t('navGraphEditor')}</span>
            </button>
          )}

          <button
            className={`nav-tab-btn ${isLogsActive ? 'active' : ''}`}
            onClick={() => handleNavClick('/logs')}
            id="nav-tab-logs"
          >
            <History size={18} />
            <span>{t('navLogs')}</span>
          </button>
        </nav>

        {/* Desktop Controls & Auth */}
        <div className="navbar-controls desktop-only">
          {isAuthenticated ? (
            <div className="navbar-user-section">
              <div
                className={`user-badge ${role === 'admin' ? 'admin' : 'user'}`}
                title={`Profil: ${user?.name} (${role.toUpperCase()})`}
              >
                {role === 'admin' ? <Shield size={14} /> : <User size={14} />}
                <span className="user-name">{user?.name || user?.email?.split('@')[0]}</span>
                <span className="role-tag">{role === 'admin' ? t('roleAdmin') : t('roleUser')}</span>
              </div>
              <button
                className="control-icon-btn logout-btn"
                onClick={handleLogout}
                title={t('navLogout')}
                aria-label="Logout"
                id="navbar-logout-btn"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="navbar-guest-actions">
              <button
                className={`nav-auth-btn ${isAuthActive ? 'active' : ''}`}
                onClick={() => handleNavClick('/login')}
                id="navbar-login-btn"
              >
                <LogIn size={15} />
                <span>Masuk</span>
              </button>
              <button
                className="nav-register-btn"
                onClick={() => handleNavClick('/register')}
                id="navbar-register-btn"
              >
                <UserPlus size={15} />
                <span>Daftar</span>
              </button>
            </div>
          )}

          {/* Connection status badge (Hanya tampil jika user sudah login) */}
          {isAuthenticated && (
            <div
              className={`connection-badge ${isOnline ? 'online' : 'offline'} cursor-pointer`}
              onClick={() => setIsFleetModalOpen(true)}
              title={t('fleetTooltipNavbar')}
              id="navbar-fleet-status-badge"
            >
              <Wifi size={13} className="conn-icon" />
              <span>{isOnline ? t('fleetBadgeOnline') : t('statusOffline')}</span>
            </div>
          )}

          {/* Theme Toggle */}
          <button
            className="control-icon-btn"
            onClick={toggleTheme}
            title={isDark ? t('themeLight') : t('themeDark')}
            aria-label="Toggle Theme"
            id="theme-toggle-btn"
          >
            {isDark ? <Sun size={18} className="theme-icon sun" /> : <Moon size={18} className="theme-icon moon" />}
          </button>

          {/* Language Toggle */}
          <button
            className="lang-pill-btn"
            onClick={toggleLanguage}
            title={t('languageToggle')}
            aria-label="Switch Language"
            id="lang-toggle-btn"
          >
            <Globe size={15} />
            <span className="lang-code">{lang.toUpperCase()}</span>
          </button>
        </div>

        {/* Mobile Header Right Controls: Theme Toggle & Hamburger */}
        <div className="mobile-header-actions mobile-only">
          <button
            className="control-icon-btn"
            onClick={toggleTheme}
            title={isDark ? t('themeLight') : t('themeDark')}
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            ref={hamburgerBtnRef}
            className={`hamburger-btn ${isMobileMenuOpen ? 'open' : ''}`}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle Navigation Menu"
            id="mobile-menu-toggle-btn"
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* ===================================================================
          STANDARD MOBILE HAMBURGER DROPDOWN (Bebas Scrollbar, Rapi Seperti Website Umum)
          =================================================================== */}
      {isMobileMenuOpen && (
        <>
          {/* Full viewport backdrop click catcher */}
          <div
            className="mobile-menu-backdrop"
            onClick={() => setIsMobileMenuOpen(false)}
            onTouchEnd={() => setIsMobileMenuOpen(false)}
            aria-label="Tutup Menu"
          />

          {/* Actual Dropdown Navigation List Area */}
          <div
            ref={menuDropdownRef}
            className="mobile-menu-dropdown"
            id="mobile-nav-dropdown-area"
          >
            <nav className="mobile-nav-list">
              <button
                className={`mobile-nav-item ${isDashboardActive ? 'active' : ''}`}
                onClick={() => handleNavClick('/dashboard')}
              >
                <LayoutDashboard size={19} />
                <span>{t('navDashboard')}</span>
              </button>

              {role === 'admin' && (
                <button
                  className={`mobile-nav-item ${isEditorActive ? 'active' : ''}`}
                  onClick={handleEditorClick}
                >
                  <Network size={19} />
                  <span>{t('navGraphEditor')}</span>
                </button>
              )}

              <button
                className={`mobile-nav-item ${isLogsActive ? 'active' : ''}`}
                onClick={() => handleNavClick('/logs')}
              >
                <History size={19} />
                <span>{t('navLogs')}</span>
              </button>
            </nav>

            {/* Mobile Auth / Profile Item */}
            <div className="mobile-user-section">
              {isAuthenticated ? (
                <div className="mobile-logged-user">
                  <div className={`user-badge ${role === 'admin' ? 'admin' : 'user'} full-width`}>
                    {role === 'admin' ? <Shield size={16} /> : <User size={16} />}
                    <span className="user-name">{user?.name || user?.email}</span>
                    <span className="role-tag">{role === 'admin' ? t('roleAdmin') : t('roleUser')}</span>
                  </div>
                  <button className="mobile-logout-btn" onClick={handleLogout}>
                    <LogOut size={16} />
                    <span>{t('navLogout')}</span>
                  </button>
                </div>
              ) : (
                <div className="mobile-guest-buttons">
                  <button
                    className="mobile-login-btn"
                    onClick={() => handleNavClick('/login')}
                  >
                    <LogIn size={18} />
                    <span>Masuk ke Akun</span>
                  </button>
                  <button
                    className="mobile-register-btn"
                    onClick={() => handleNavClick('/register')}
                  >
                    <UserPlus size={18} />
                    <span>Daftar Akun Baru</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Status & Lang Footer */}
            <div className="mobile-dropdown-footer">
              {isAuthenticated && (
                <div
                  className={`connection-badge ${isOnline ? 'online' : 'offline'} cursor-pointer`}
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsFleetModalOpen(true);
                  }}
                  id="mobile-fleet-status-badge"
                >
                  <Wifi size={14} className="conn-icon" />
                  <span>{isOnline ? t('fleetBadgeOnline') : t('statusOffline')}</span>
                </div>
              )}

              <button className="lang-pill-btn" onClick={toggleLanguage}>
                <Globe size={16} />
                <span>{lang === 'id' ? 'Bahasa Indonesia' : 'English (US)'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Fleet Wi-Fi & MQTT Armada Connection Modal */}
      <FleetConnectionModal
        isOpen={isFleetModalOpen}
        onClose={() => setIsFleetModalOpen(false)}
      />
    </header>
  );
};
export default Navbar;
