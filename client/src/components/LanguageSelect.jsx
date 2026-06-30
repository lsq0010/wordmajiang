import { useState } from "react";
import { t } from "../i18n";

const LANGUAGES = [
  // 东亚 East Asia
  { code: "zh-CN", name: "中文 (简体)" },
  { code: "zh-TW", name: "中文 (繁體)" },
  { code: "ja-JP", name: "日本語" },
  { code: "ko-KR", name: "한국어" },
  { code: "mn-MN", name: "Монгол" },
  // 东南亚 Southeast Asia
  { code: "vi-VN", name: "Tiếng Việt" },
  { code: "th-TH", name: "ไทย" },
  { code: "id-ID", name: "Bahasa Indonesia" },
  { code: "ms-MY", name: "Bahasa Melayu" },
  { code: "tl-PH", name: "Tagalog" },
  { code: "km-KH", name: "ភាសាខ្មែរ" },
  { code: "lo-LA", name: "ລາວ" },
  { code: "my-MM", name: "မြန်မာ" },
  // 南亚 South Asia
  { code: "hi-IN", name: "हिन्दी" },
  { code: "bn-IN", name: "বাংলা" },
  { code: "ta-IN", name: "தமிழ்" },
  { code: "te-IN", name: "తెలుగు" },
  { code: "mr-IN", name: "मराठी" },
  { code: "gu-IN", name: "ગુજરાતી" },
  { code: "kn-IN", name: "ಕನ್ನಡ" },
  { code: "ml-IN", name: "മലയാളം" },
  { code: "pa-IN", name: "ਪੰਜਾਬੀ" },
  { code: "ur-PK", name: "اردو" },
  { code: "si-LK", name: "සිංහල" },
  { code: "ne-NP", name: "नेपाली" },
  // 中东 / 中亚 Middle East & Central Asia
  { code: "ar-SA", name: "العربية" },
  { code: "he-IL", name: "עברית" },
  { code: "fa-IR", name: "فارسی" },
  { code: "tr-TR", name: "Türkçe" },
  { code: "kk-KZ", name: "Қазақша" },
  { code: "uz-UZ", name: "Oʻzbek" },
  { code: "az-AZ", name: "Azərbaycanca" },
  { code: "ka-GE", name: "ქართული" },
  { code: "hy-AM", name: "Հայերեն" },
  // 北欧 / 波罗的海 Nordic & Baltic
  { code: "sv-SE", name: "Svenska" },
  { code: "da-DK", name: "Dansk" },
  { code: "fi-FI", name: "Suomi" },
  { code: "no-NO", name: "Norsk" },
  { code: "is-IS", name: "Íslenska" },
  { code: "lt-LT", name: "Lietuvių" },
  { code: "lv-LV", name: "Latviešu" },
  { code: "et-EE", name: "Eesti" },
  // 西欧 Western Europe
  { code: "en-GB", name: "English (UK)" },
  { code: "fr-FR", name: "Français" },
  { code: "de-DE", name: "Deutsch" },
  { code: "nl-NL", name: "Nederlands" },
  { code: "nl-BE", name: "Vlaams" },
  { code: "ga-IE", name: "Gaeilge" },
  { code: "cy-GB", name: "Cymraeg" },
  // 南欧 Southern Europe
  { code: "es-ES", name: "Español" },
  { code: "it-IT", name: "Italiano" },
  { code: "pt-PT", name: "Português" },
  { code: "el-GR", name: "Ελληνικά" },
  { code: "sq-AL", name: "Shqip" },
  { code: "mt-MT", name: "Malti" },
  // 东欧 / 巴尔干 Eastern Europe & Balkans
  { code: "ru-RU", name: "Русский" },
  { code: "pl-PL", name: "Polski" },
  { code: "uk-UA", name: "Українська" },
  { code: "cs-CZ", name: "Čeština" },
  { code: "sk-SK", name: "Slovenčina" },
  { code: "hu-HU", name: "Magyar" },
  { code: "ro-RO", name: "Română" },
  { code: "bg-BG", name: "Български" },
  { code: "sr-RS", name: "Српски" },
  { code: "hr-HR", name: "Hrvatski" },
  { code: "sl-SI", name: "Slovenščina" },
  { code: "bs-BA", name: "Bosanski" },
  { code: "mk-MK", name: "Македонски" },
  // 非洲 Africa
  { code: "sw-KE", name: "Kiswahili" },
  { code: "am-ET", name: "አማርኛ" },
  { code: "af-ZA", name: "Afrikaans" },
  { code: "zu-ZA", name: "isiZulu" },
  { code: "xh-ZA", name: "isiXhosa" },
  { code: "ha-NG", name: "Hausa" },
  { code: "yo-NG", name: "Yorùbá" },
  { code: "ig-NG", name: "Igbo" },
  { code: "so-SO", name: "Soomaali" },
  { code: "rw-RW", name: "Ikinyarwanda" },
  { code: "tn-BW", name: "Setswana" },
  { code: "sn-ZW", name: "chiShona" },
  { code: "ny-MW", name: "Chichewa" },
  { code: "mg-MG", name: "Malagasy" },
  // 北美 / 拉美 Americas
  { code: "en-US", name: "English (US)" },
  { code: "es-MX", name: "Español (México)" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "fr-CA", name: "Français (Canada)" },
  { code: "qu-PE", name: "Runasimi" },
  // 大洋洲 Oceania
  { code: "en-AU", name: "English (Australia)" },
  { code: "mi-NZ", name: "Te Reo Māori" },
  { code: "sm-WS", name: "Gagana Samoa" },
  { code: "to-TO", name: "Lea Faka-Tonga" },
];

function langName(code) {
  const l = LANGUAGES.find(x => x.code === code);
  return l ? l.name : code;
}

export { langName, LANGUAGES };

export default function LanguageSelect({ nativeLang, targetLang, onConfirm, onCancel, uiLang }) {
  const [nat, setNat] = useState(nativeLang || "zh-CN");
  const [tgt, setTgt] = useState(targetLang || "en-US");
  const [search, setSearch] = useState("");

  const filtered = search
    ? LANGUAGES.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || l.code.includes(search))
    : LANGUAGES;

  return (
    <div className="lang-select-overlay" onClick={onCancel || (() => {})}>
      <div className="lang-select-card" onClick={e => e.stopPropagation()}>
        <h2 className="lang-select-title">{t(uiLang, "selectLang")}</h2>

        <div className="lang-field">
          <label className="lang-label">{t(uiLang, "nativeLang")}</label>
          <select className="lang-select" value={nat} onChange={e => setNat(e.target.value)}>
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="lang-field">
          <label className="lang-label">{t(uiLang, "targetLang")}</label>
          <select className="lang-select" value={tgt} onChange={e => setTgt(e.target.value)}>
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="lang-select-btns">
          {onCancel && (
            <button className="btn" onClick={onCancel}>{t(uiLang, "cancel")}</button>
          )}
          <button className="btn lang-confirm" onClick={() => onConfirm(nat, tgt)}>
            {t(uiLang, "confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
