// Vocab Builder · 词牌带翻译注释，按顺序拼句
const HAND_SIZE = 10;
const HAND_MAX = 14;
const OK_SCORE = 10;
const BAD_PENALTY = 5;

const el = (id) => document.getElementById(id);
const $score = el("score"), $handCount = el("handCount"), $deckCount = el("deckCount");
const $slots = el("sentenceSlots"), $hand = el("hand"), $feedback = el("feedback"), $tip = el("tip");
const $target = el("targetHint");
const $clear = el("clearBtn"), $draw = el("drawBtn"), $restart = el("restartBtn");
const $level = el("levelSel");

const state = {
  bank: [], hand: [], sentence: [], score: 0, busy: false,
  targetWords: [], glossary: {}, progress: 0
};

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

async function loadPool(){
  const level = $level.value;
  setTip("Generating...");
  const r = await fetch(`/api/deal?level=${level}`);
  const d = await r.json();
  if(d.error){ setTip("Failed: " + d.error); return false; }
  state.bank = d.pool;
  state.targetWords = d.targetWords;
  state.glossary = d.glossary || {};
  return true;
}

function deal(n){
  while(n-- > 0 && state.bank.length > 0 && state.hand.length < HAND_MAX){
    state.hand.push(state.bank.pop());
  }
}

function start(){
  state.hand = []; state.sentence = []; state.score = 0; state.busy = false;
  state.bank = []; state.targetWords = []; state.glossary = {}; state.progress = 0;
  setFeedback("", "");
  render();
  loadPool().then(ok=>{
    if(!ok){ render(); return; }
    deal(HAND_SIZE);
    render();
    setTip("Tap the next word to build the sentence");
  });
}

function setTip(t){ $tip.textContent = t; }
function setFeedback(cls, html){ $feedback.className = "feedback " + cls; $feedback.innerHTML = html; }

// Build a tile element with word / translation / note
function makeTile(word, isHand, idx, handler){
  const g = state.glossary[word.toLowerCase()] || {};
  const cn = g.cn || "";
  const note = g.note || "";
  const div = document.createElement("div");
  div.className = "p-tile";
  div.title = isHand ? "Tap to place" : "Tap to remove";
  const wordEl = document.createElement("span");
  wordEl.className = "t-word"; wordEl.textContent = word;
  const cnEl = document.createElement("span");
  cnEl.className = "t-cn"; cnEl.textContent = cn;
  const noteEl = document.createElement("span");
  noteEl.className = "t-note"; noteEl.textContent = note;
  div.appendChild(wordEl);
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
      $slots.appendChild(makeTile(w, false, i, () => removeFromSentence(i)));
    });
  }

  // Hand
  $hand.innerHTML = "";
  state.hand.forEach((w, idx) => {
    $hand.appendChild(makeTile(w, true, idx, () => playTile(idx)));
  });

  $draw.disabled = state.bank.length === 0 || state.hand.length >= HAND_MAX || state.busy;
}

function playTile(idx){
  if(state.busy) return;
  if(state.progress >= state.targetWords.length) return;

  const word = state.hand[idx];
  const expected = state.targetWords[state.progress];

  if(word.toLowerCase() === expected.toLowerCase()){
    state.hand.splice(idx, 1);
    state.sentence.push(word);
    state.progress++;
    state.score += OK_SCORE;

    if(state.progress >= state.targetWords.length){
      setFeedback("ok", `✓ Complete! +${OK_SCORE} pts<br><span class="corr">${state.sentence.join(" ")}</span>`);
      setTimeout(() => {
        state.sentence = [];
        state.progress = 0;
        deal(state.targetWords.length);
        render();
      }, 1800);
    } else {
      setFeedback("ok", `✓ +${OK_SCORE}`);
    }
  } else {
    state.score -= BAD_PENALTY;
    setFeedback("bad", `✗ Expected "${expected}", -${BAD_PENALTY}`);
  }
  render();
}

function removeFromSentence(pos){
  if(state.busy) return;
  state.hand.push(state.sentence[pos]);
  state.sentence.splice(pos, 1);
  state.progress = state.sentence.length;
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
$level.onchange = () => { if(confirm("Changing difficulty restarts. Confirm?")) start(); };

start();
