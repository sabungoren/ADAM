import React, { useState } from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import { useAuth } from '../context/AuthContext';
import { 
  Compass, 
  PenTool, 
  ShieldCheck, 
  Wifi, 
  WifiOff, 
  Battery, 
  BatteryWarning, 
  Navigation,
  Menu,
  X,
  Lock
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab }) => {
  const { telemetry } = useTelemetry();
  const { isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dynamic battery icon and styling
  const getBatteryStyle = () => {
    if (telemetry.battery <= 20) {
      return {
        icon: <BatteryWarning className="w-4 h-4 text-rose-400 animate-pulse" />,
        badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      };
    }
    if (telemetry.battery <= 50) {
      return {
        icon: <Battery className="w-4 h-4 text-amber-400" />,
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      };
    }
    return {
      icon: <Battery className="w-4 h-4 text-emerald-400" />,
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    };
  };

  const handleSelectTab = (tab: string) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-dark-900 border-b border-dark-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Ujung Kiri: Logo & Nama Project */}
          <div 
            className="flex items-center space-x-2 sm:space-x-2.5 cursor-pointer select-none"
            onClick={() => handleSelectTab('home')}
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Navigation className="w-4 h-4" />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="hidden sm:inline font-extrabold text-sm sm:text-base tracking-wide text-white">Project A.D.A.M</span>
            </div>
          </div>

          {/* Navigasi Desktop (Tengah) */}
          <nav className="hidden md:flex items-center space-x-1 bg-dark-950 p-1 rounded-xl border border-dark-800">
            <button
              onClick={() => handleSelectTab('home')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentTab === 'home'
                  ? 'bg-cyan-500 text-dark-950 shadow-sm font-bold'
                  : 'text-gray-300 hover:text-white hover:bg-dark-800'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Peta & Panggilan</span>
            </button>

            <button
              onClick={() => {
                if (!isAdmin) {
                  handleSelectTab('admin');
                } else {
                  handleSelectTab('editor');
                }
              }}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentTab === 'editor'
                  ? 'bg-cyan-500 text-dark-950 shadow-sm font-bold'
                  : 'text-gray-300 hover:text-white hover:bg-dark-800'
              }`}
              title={!isAdmin ? 'Akses Khusus Administrator (Perlu Login)' : 'Graph Editor'}
            >
              <PenTool className="w-4 h-4" />
              <span>Graph Editor</span>
              {!isAdmin && <Lock className="w-3 h-3 text-amber-400" />}
            </button>

            <button
              onClick={() => handleSelectTab('admin')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                currentTab === 'admin'
                  ? 'bg-cyan-500 text-dark-950 shadow-sm font-bold'
                  : 'text-gray-300 hover:text-white hover:bg-dark-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Admin Panel</span>
            </button>
          </nav>

          {/* Sisi Kanan: Icon WiFi, Icon Baterai, dan Hamburger Menu */}
          <div className="flex items-center space-x-2 sm:space-x-2.5">
            {/* 1. Icon WiFi (Online / Stale / Offline) */}
            <div
              className={`flex items-center justify-center w-8 h-8 sm:w-auto sm:px-2.5 sm:py-1 rounded-lg text-xs border ${
                telemetry.online && telemetry.fresh
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : telemetry.online
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              }`}
              title={
                telemetry.online && telemetry.fresh
                  ? 'Armada Online'
                  : telemetry.online
                  ? 'Sinyal Stale (>30s)'
                  : 'Armada Offline'
              }
            >
              {telemetry.online && telemetry.fresh ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
              <span className="hidden sm:inline font-bold ml-1.5">
                {telemetry.online && telemetry.fresh ? 'Online' : telemetry.online ? 'Stale' : 'Offline'}
              </span>
            </div>

            {/* 2. Icon Baterai Dinamis */}
            {(() => {
              const bStyle = getBatteryStyle();
              return (
                <div 
                  className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs border font-mono font-bold transition-colors ${bStyle.badge}`}
                  title={`Daya Baterai Robot: ${telemetry.battery}%`}
                >
                  {bStyle.icon}
                  <span>{telemetry.battery}%</span>
                </div>
              );
            })()}

            {/* 3. Hamburger Menu Button (Ujung Kanan di Mobile) */}
            <div className="md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="w-8 h-8 rounded-lg bg-dark-950 text-gray-200 border border-dark-800 flex items-center justify-center hover:text-white hover:border-gray-700 transition"
                aria-label="Toggle Menu"
              >
                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dropdown Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-dark-900 border-b border-dark-800 px-4 py-3 space-y-2 animate-fadeIn">
          <button
            onClick={() => handleSelectTab('home')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition text-left ${
              currentTab === 'home'
                ? 'bg-cyan-500 text-dark-950 shadow-sm'
                : 'text-gray-300 bg-dark-950 hover:bg-dark-800'
            }`}
          >
            <Compass className="w-4 h-4 flex-shrink-0" />
            <span>Peta & Panggilan Armada</span>
          </button>

          <button
            onClick={() => {
              if (!isAdmin) {
                handleSelectTab('admin');
              } else {
                handleSelectTab('editor');
              }
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition text-left ${
              currentTab === 'editor'
                ? 'bg-cyan-500 text-dark-950 shadow-sm'
                : 'text-gray-300 bg-dark-950 hover:bg-dark-800'
            }`}
          >
            <div className="flex items-center space-x-3">
              <PenTool className="w-4 h-4 flex-shrink-0" />
              <span>Graph Editor (Desain Peta)</span>
            </div>
            {!isAdmin && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
                <Lock className="w-3 h-3" />
                <span>Admin</span>
              </span>
            )}
          </button>

          <button
            onClick={() => handleSelectTab('admin')}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition text-left ${
              currentTab === 'admin'
                ? 'bg-cyan-500 text-dark-950 shadow-sm'
                : 'text-gray-300 bg-dark-950 hover:bg-dark-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>Dashboard Admin</span>
          </button>
        </div>
      )}
    </header>
  );
};
