import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { AlertProvider } from './context/AlertContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { RouterProvider } from './context/RouterContext.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <AlertProvider>
          <AuthProvider>
            <RouterProvider>
              <App />
            </RouterProvider>
          </AuthProvider>
        </AlertProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);
