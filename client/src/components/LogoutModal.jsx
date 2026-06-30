import { useState } from "react";
import { t } from "../i18n";

export default function LogoutModal({ onConfirm, uiLang }) {
  const lang = uiLang || "zh-CN";
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn logout-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>{t(lang, "logout")}</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-msg">{t(lang, "confirmLogout")}</div>
            <div className="modal-btns">
              <button className="btn" onClick={() => setOpen(false)}>{t(lang, "cancel")}</button>
              <button className="btn modal-danger" onClick={() => { setOpen(false); onConfirm(); }}>{t(lang, "logout")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
