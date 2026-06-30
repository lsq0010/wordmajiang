import { useRef, useState, useEffect, useCallback } from "react";

export default function HandwriteArea({ token, targetLang, t }) {
  const i18n = t || ((k) => k);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const longPressTimer = useRef(null);
  const clearTimer = useRef(null);
  const moved = useRef(false);

  const [doneWords, setDoneWords] = useState([]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
  }, []);

  useEffect(() => { initCanvas(); window.addEventListener("resize", initCanvas); return () => window.removeEventListener("resize", initCanvas); }, [initCanvas]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches[0];
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const handleStart = (e) => {
    e.preventDefault();
    drawing.current = true;
    moved.current = false;
    if (clearTimer.current) { clearTimeout(clearTimer.current); clearTimer.current = null; }
    const pos = getPos(e);
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(pos.x, pos.y);

    longPressTimer.current = setTimeout(() => {
      if (!moved.current) {
        clear();
        drawing.current = false;
      }
    }, 3000);
  };

  const handleMove = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const dx = pos.x - (ctxRef.current.lastX || 0);
    const dy = pos.y - (ctxRef.current.lastY || 0);
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved.current = true;
    if (longPressTimer.current && moved.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    ctxRef.current.lineTo(pos.x, pos.y);
    ctxRef.current.stroke();
    ctxRef.current.lastX = pos.x;
    ctxRef.current.lastY = pos.y;
  };

  const handleEnd = (e) => {
    e.preventDefault();
    drawing.current = false;
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!moved.current) return;
    clearTimer.current = setTimeout(async () => {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      clear();
      try {
        const r = await fetch("/api/recognize-handwriting", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ image: dataUrl, targetLang }),
        });
        const d = await r.json();
        const w = d.recognized;
        if (w && w !== "?") {
          setDoneWords(prev => [...prev.slice(-9), w]);
        }
      } catch {}
    }, 1000);
  };

  return (
    <div className="hw-wrap">
      <div className="hw-title">{i18n("practiceHandwriting")}</div>
      <div className="hw-top">
        {doneWords.length > 0 && (
          <div className="hw-done">{doneWords.map((w, i) => <span key={i} className="hw-done-word">{w}</span>)}</div>
        )}
      </div>
      <div className="hw-canvas-box">
        <canvas ref={canvasRef} className="hw-canvas"
          onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd} />
      </div>
    </div>
  );
}
