"use client";

import { useTranslation } from "react-i18next";

const IOS_URL     = "https://apps.apple.com/us/app/maritime-wallet/id6758638682";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.jimbothreetimes.MaritimeWallet";

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

function GooglePlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.18 23.76c.3.17.64.22.99.14l12.76-7.37-2.89-2.89-10.86 10.12zM.36 1.36C.13 1.67 0 2.1 0 2.64v18.72c0 .54.13.97.37 1.28l.07.07L10.58 12.5v-.23L.43 1.28l-.07.08zM20.67 10.53l-2.74-1.58-3.21 3.21 3.21 3.21 2.76-1.59c.79-.45.79-1.19-.02-1.65v-.6zM3.18.24l12.76 7.37-2.89 2.89L3.18.24z"/>
    </svg>
  );
}

export function GetWallet() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-1">{t("app.title")}</h2>
        <p className="text-gray-400 text-sm">{t("app.subtitle")}</p>
      </div>

      {/* Hero card */}
      <div className="bg-[#1E1E24] rounded-2xl overflow-hidden mb-6">
        <div className="px-8 py-12 flex flex-col items-center text-center">
          {/* App icon */}
          <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="black">
              <path d="M12 2L2 22H22L12 2ZM12 6L18 18H6L12 6Z" />
            </svg>
          </div>

          <h3 className="text-2xl font-bold mb-2">{t("app.appName")}</h3>
          <p className="text-gray-400 text-sm max-w-sm leading-relaxed mb-8">
            {t("app.appDesc")}
          </p>

          {/* Store buttons */}
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
            <a
              href={IOS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 flex-1 bg-white text-black font-bold py-3.5 px-5 rounded-2xl hover:bg-gray-100 transition-colors"
            >
              <AppleIcon />
              <div className="text-left">
                <p className="text-[10px] font-normal leading-none text-gray-600">{t("app.downloadOn")}</p>
                <p className="text-sm font-bold leading-tight">{t("app.appStore")}</p>
              </div>
            </a>

            <a
              href={ANDROID_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 flex-1 bg-white text-black font-bold py-3.5 px-5 rounded-2xl hover:bg-gray-100 transition-colors"
            >
              <GooglePlayIcon />
              <div className="text-left">
                <p className="text-[10px] font-normal leading-none text-gray-600">{t("app.getItOn")}</p>
                <p className="text-sm font-bold leading-tight">{t("app.googlePlay")}</p>
              </div>
            </a>
          </div>
        </div>
      </div>

      {/* Feature rows */}
      {[
        { emoji: "🔐", title: t("app.fullCustody"),      desc: t("app.fullCustodyDesc") },
        { emoji: "⚡",  title: t("app.instantExecution"), desc: t("app.instantExecutionDesc") },
        { emoji: "🔒", title: t("app.secure"),            desc: t("app.secureDesc") },
      ].map(f => (
        <div key={f.title} className="bg-[#1E1E24] rounded-2xl px-6 py-5 mb-3 flex items-center gap-4">
          <span className="text-2xl">{f.emoji}</span>
          <div>
            <p className="font-semibold text-sm">{f.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{f.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
