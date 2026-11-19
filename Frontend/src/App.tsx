import React, { useState } from 'react';
import { TelemetryProvider, useTelemetry } from './context/TelemetryContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { GraphEditor } from './pages/GraphEditor';
import { Admin } from './pages/Admin';
import { CheckCircle2, X } from 'lucide-react';

const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'home' | 'editor' | 'admin'>('home');
  const { callResult, clearCallResult } = useTelemetry();
  const { isAdmin } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-dark-950 text-gray-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navbar */}
      <Navbar currentTab={currentTab} onSelectTab={(tab: any) => setCurrentTab(tab)} />

      {/* Floating Global Call Result Toast */}
      {callResult && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-dark-900 border border-cyan-500/40 rounded-2xl p-4 shadow-2xl flex items-start space-x-3">
          <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs space-y-1">
            <h5 className="font-bold text-white">Status Permintaan #{callResult.request_id}</h5>
            <p className="text-gray-300">{callResult.message}</p>
          </div>
          <button onClick={clearCallResult} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {currentTab === 'home' && (
          <Home onGoToEditor={() => {
            if (!isAdmin) {
              setCurrentTab('admin');
            } else {
              setCurrentTab('editor');
            }
          }} />
        )}
        {currentTab === 'editor' && <GraphEditor onGoToAdmin={() => setCurrentTab('admin')} />}
        {currentTab === 'admin' && <Admin onGoToEditor={() => setCurrentTab('editor')} />}
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-dark-800 bg-dark-950 py-3 text-center text-xs text-gray-500">
        <p>Project A.D.A.M &bull; Automated Dustbin And Management &bull; IoT AMR Line-Follower Platform</p>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <TelemetryProvider>
        <AppContent />
      </TelemetryProvider>
    </AuthProvider>
  );
};

export default App;
