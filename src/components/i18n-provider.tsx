import { useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext, readLocale, type Locale } from "@/lib/i18n";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fi");
  useEffect(() => {
    const l = readLocale();
    setLocaleState(l);
    document.documentElement.lang = l;
  }, []);
  const value = useMemo(
    () => ({
      locale,
      setLocale: (l: Locale) => {
        setLocaleState(l);
        try {
          window.localStorage.setItem("norf-locale", l);
          document.documentElement.lang = l;
        } catch {
          /* ignore */
        }
      },
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
