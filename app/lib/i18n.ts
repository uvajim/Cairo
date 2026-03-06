import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "../locales/en.json";
import zh from "../locales/zh.json";
import fr from "../locales/fr.json";
import es from "../locales/es.json";
import ar from "../locales/ar.json";
import pt from "../locales/pt.json";
import ru from "../locales/ru.json";

export const LANGUAGES: Record<string, string> = {
  en: "EN",
  zh: "中文",
  fr: "FR",
  es: "ES",
  ar: "العربية",
  pt: "PT",
  ru: "РУС",
};

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, zh: { translation: zh }, fr: { translation: fr }, es: { translation: es }, ar: { translation: ar }, pt: { translation: pt }, ru: { translation: ru } },
    lng: (typeof localStorage !== "undefined" && localStorage.getItem("lang")) || "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

i18n.on("languageChanged", (lng) => {
  if (typeof localStorage !== "undefined") localStorage.setItem("lang", lng);
});

export default i18n;
