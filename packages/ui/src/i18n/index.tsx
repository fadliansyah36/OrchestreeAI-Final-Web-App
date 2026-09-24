'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import idMessages from './messages/id.json';
import enMessages from './messages/en.json';

export type AppLocale = 'id' | 'en';

interface LocaleContextType {
  locale: AppLocale;
  setLocale: (loc: AppLocale) => void;
  toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'id',
  setLocale: () => {},
  toggleLocale: () => {},
});

export const useLocaleContext = () => useContext(LocaleContext);

const MESSAGES_MAP: Record<AppLocale, any> = {
  id: idMessages,
  en: enMessages,
};

export const OrchIntlProvider: React.FC<{
  children: React.ReactNode;
  defaultLocale?: AppLocale;
}> = ({ children, defaultLocale = 'id' }) => {
  const [locale, setLocaleState] = useState<AppLocale>(defaultLocale);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('orchestree_locale') as AppLocale;
      if (saved === 'id' || saved === 'en') {
        setLocaleState(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      // Ignore if localStorage unavailable
    }
  }, []);

  const setLocale = (newLoc: AppLocale) => {
    setLocaleState(newLoc);
    try {
      localStorage.setItem('orchestree_locale', newLoc);
      document.documentElement.lang = newLoc;
    } catch {
      // Ignore
    }
  };

  const toggleLocale = () => {
    setLocale(locale === 'id' ? 'en' : 'id');
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, toggleLocale }}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES_MAP[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
};

export { idMessages, enMessages };
export { useTranslations } from 'next-intl';
