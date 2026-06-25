// Vocab Builder · 自适应难度：计时 + 轨迹追踪 + 错词重点练
const HAND_SIZE = 12;
const HAND_MAX = 16;
const OK_SCORE = 10;
const BAD_PENALTY = 5;

const el = (id) => document.getElementById(id);
const $score = el("score"), $handCount = el("handCount"), $deckCount = el("deckCount");
const $slots = el("sentenceSlots"), $hand = el("hand"), $feedback = el("feedback"), $tip = el("tip");
const $target = el("targetHint"), $level = el("levelBadge");
const $clear = el("clearBtn"), $draw = el("drawBtn"), $restart = el("restartBtn");

const state = {
  bank: [], hand: [], sentence: [], score: 0, busy: false,
  targetWords: [], glossary: {}, progress: 0,
  roundStart: 0,        // 当前句子开始时间
  actionLog: [],         // [{word, correct, timeMs}]
};

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

async function loadPool(){
  setTip("Generating...");
  const r = await fetch("/api/deal", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ score: state.score })
  });
  const d = await r.json();
  if(d.error){ setTip("Failed: " + d.error); return false; }
  state.bank = d.pool;
  state.targetWords = d.targetWords;
  state.glossary = d.glossary || {};
  if(d.level) $level.textContent = "Lv." + d.level;
  return true;
}

async function fetchModel(){
  try {
    const r = await fetch("/api/model");
    const d = await r.json();
    if(d.level) $level.textContent = "Lv." + d.level;
  } catch(e){}
}

function deal(n){
  while(n-- > 0 && state.bank.length > 0 && state.hand.length < HAND_MAX){
    state.hand.push(state.bank.pop());
  }
}

function start(){
  state.hand = []; state.sentence = []; state.score = 0; state.busy = false;
  state.bank = []; state.targetWords = []; state.glossary = {}; state.progress = 0;
  state.roundStart = 0; state.actionLog = [];
  setFeedback("", "");
  render();
  fetchModel();
  loadPool().then(ok=>{
    if(!ok){ render(); return; }
    deal(HAND_SIZE);
    state.roundStart = performance.now();
    state.actionLog = [];
    render();
    setTip("Tap the next word to build the sentence");
  });
}

function setTip(t){ $tip.textContent = t; }
function setFeedback(cls, html){ $feedback.className = "feedback " + cls; $feedback.innerHTML = html; }

function makeTile(word, handler){
  const g = state.glossary[word.toLowerCase()] || {};
  const ipa = g.ipa || "";
  const cn = g.cn || "";
  const note = g.note || "";
  const div = document.createElement("div");
  div.className = "p-tile";
  div.title = handler ? "Tap to place" : "Tap to remove";
  const wordEl = document.createElement("span");
  wordEl.className = "t-word"; wordEl.textContent = word;
  const ipaEl = document.createElement("span");
  ipaEl.className = "t-ipa"; ipaEl.textContent = ipa;
  const cnEl = document.createElement("span");
  cnEl.className = "t-cn"; cnEl.textContent = cn;
  const noteEl = document.createElement("span");
  noteEl.className = "t-note"; noteEl.textContent = note;
  div.appendChild(wordEl);
  if(ipa) div.appendChild(ipaEl);
  if(cn) div.appendChild(cnEl);
  if(note) div.appendChild(noteEl);
  if(handler) div.onclick = handler;
  return div;
}

function render(){
  $score.textContent = state.score;
  $handCount.textContent = state.hand.length;
  $deckCount.textContent = state.bank.length;

  // Target hint
  if(state.targetWords.length > 0){
    $target.innerHTML = state.targetWords.map((w,i) =>
      i < state.sentence.length ? `<b>${w}</b>` : w
    ).join(" ");
    $target.style.display = "block";
  } else {
    $target.style.display = "none";
  }

  // Sentence area
  $slots.innerHTML = "";
  if(state.sentence.length === 0){
    const hint = document.createElement("div");
    hint.className = "empty-hint";
    hint.textContent = "Tap a word below to place it";
    $slots.appendChild(hint);
  } else {
    state.sentence.forEach((w, i) => {
      $slots.appendChild(makeTile(w, () => removeFromSentence(i)));
    });
  }

  // Hand
  $hand.innerHTML = "";
  state.hand.forEach((w, idx) => {
    $hand.appendChild(makeTile(w, () => playTile(idx)));
  });

  $draw.disabled = state.bank.length === 0 || state.hand.length >= HAND_MAX || state.busy;
}

async function submitStats(){
  if(state.actionLog.length === 0) return;
  const totalTime = state.actionLog.reduce((s,a) => s + (a.timeMs||0), 0);
  try {
    await fetch("/api/stats", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        words: state.actionLog.map(a => ({
          word: a.word,
          correct: a.correct,
          timeMs: a.timeMs || 0,
          action: a.action || "play",
          timestamp: a.timestamp
        })),
        totalTimeMs: totalTime,
        score: state.score
      })
    });
    fetchModel();
  } catch(e){}
}

function playTile(idx){
  if(state.busy) return;
  if(state.progress >= state.targetWords.length) return;

  const now = performance.now();
  const elapsed = state.actionLog.length > 0
    ? now - state.actionLog[state.actionLog.length-1].timestamp
    : (state.roundStart > 0 ? now - state.roundStart : 1000);

  const word = state.hand[idx];
  const expected = state.targetWords[state.progress];

  if(word.toLowerCase() === expected.toLowerCase()){
    state.hand.splice(idx, 1);
    state.sentence.push(word);
    state.progress++;
    state.score += OK_SCORE;
    state.actionLog.push({ word, correct: true, timeMs: Math.round(elapsed), timestamp: now });

    if(state.progress >= state.targetWords.length){
      submitStats();
      setFeedback("ok", `✓ Complete! +${OK_SCORE} pts<br><span class="corr">${state.sentence.join(" ")}</span>`);
      setTimeout(async () => {
        state.sentence = [];
        state.progress = 0;
        state.roundStart = performance.now();
        state.actionLog = [];
        const ok = await loadPool();
        if(!ok){ render(); return; }
        deal(HAND_SIZE);
        render();
      }, 1500);
    } else {
      setFeedback("ok", `✓ +${OK_SCORE}`);
    }
  } else {
    state.score -= BAD_PENALTY;
    state.actionLog.push({ word, correct: false, timeMs: Math.round(elapsed), timestamp: now });
    setFeedback("bad", `✗ Expected "${expected}", -${BAD_PENALTY}`);
  }
  render();
}

function removeFromSentence(pos){
  if(state.busy) return;
  const word = state.sentence[pos];
  state.hand.push(word);
  state.sentence.splice(pos, 1);
  state.progress = state.sentence.length;
  // Record removal as hesitation (negative signal for that word)
  state.actionLog.push({ word, correct: false, timeMs: 0, action: "remove", timestamp: performance.now() });
  setFeedback("", "");
  render();
}

function clearSentence(){
  if(state.busy) return;
  while(state.sentence.length > 0) state.hand.push(state.sentence.pop());
  state.progress = 0;
  setFeedback("", "");
  render();
}

function drawTile(){
  if(state.hand.length >= HAND_MAX){ setTip("Hand full"); return; }
  deal(1);
  render();
}

$clear.onclick = clearSentence;
$draw.onclick = drawTile;
$restart.onclick = () => { if(confirm("Restart?")) start(); };

start();
