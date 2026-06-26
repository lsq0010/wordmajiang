import { useState } from "react";

export default function LogoutModal({ onConfirm }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn logout-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>Logout</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-msg">确认退出登录？</div>
            <div className="modal-btns">
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn modal-danger" onClick={() => { setOpen(false); onConfirm(); }}>Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
