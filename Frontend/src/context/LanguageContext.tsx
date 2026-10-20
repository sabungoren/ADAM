import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { translations } from '../i18n/translations';

interface LanguageContextType {
  lang: 'id' | 'en';
  setLang: (lang: 'id' | 'en') => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'id',
  setLang: () => {},
  toggleLanguage: () => {},
  t: (key: string) => key,
});

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<'id' | 'en'>(() => {
    const saved = localStorage.getItem('adam_lang');
    return saved === 'en' ? 'en' : 'id';
  });

  useEffect(() => {
    localStorage.setItem('adam_lang', lang);
  }, [lang]);

  const toggleLanguage = () => {
    setLang(prev => (prev === 'id' ? 'en' : 'id'));
  };

  const t = (key: string): string => {
    const dict = translations[lang] || translations['id'];
    return dict[key] || translations['id'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
