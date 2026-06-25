// English Word Mahjong · Build sentences to learn English (pre-computed plan: zero-latency local lookup)
const HAND_SIZE = 10;
const HAND_MAX = 14;
const INSERT_OK = 5;
const COMPLETE_BASE = 10;
const COMPLETE_PER_CHAR = 2;
const BAD_PENALTY = 5;

const el = (id) => document.getElementById(id);
const $score = el("score"), $handCount = el("handCount"), $deckCount = el("deckCount");
const $slots = el("sentenceSlots"), $hand = el("hand"), $feedback = el("feedback"), $tip = el("tip");
const $clear = el("clearBtn"), $draw = el("drawBtn"), $restart = el("restartBtn");
const $level = el("levelSel");

const state = {
  bank: [],
  hand: [],
  sentence: [],
  score: 0,
  busy: false,
  solution: [],
  target: "",
  progress: 0
};

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

async function loadPool(){
  const level = $level.value;
  setTip("Generating board (one-time network call)...");
  const r = await fetch(`/api/deal?level=${level}`);
  const d = await r.json();
  if(d.error){ setTip("Generation failed: " + d.error); return false; }
  state.bank = d.pool;
  state.solution = d.solution;
  state.target = d.target;
  state.progress = 0;
  return true;
}

function deal(n){
  while(n-- > 0 && state.bank.length > 0 && state.hand.length < HAND_MAX){
    state.hand.push(state.bank.pop());
  }
}

function start(){
  state.hand = []; state.sentence = []; state.score = 0; state.busy = false;
  state.bank = []; state.solution = []; state.target = ""; state.progress = 0;
  setFeedback("", "");
  render();
  loadPool().then(ok=>{
    if(!ok){ render(); return; }
    deal(HAND_SIZE);
    render();
    setTip("Tap a word card to auto-insert; tap a placed word to remove");
  });
}

function setTip(t){ $tip.textContent = t; }
function setFeedback(cls, html){ $feedback.className = "feedback " + cls; $feedback.innerHTML = html; }

function render(){
  $score.textContent = state.score;
  $handCount.textContent = state.hand.length;
  $deckCount.textContent = state.bank.length;

  // Sentence area
  $slots.innerHTML = "";
  if(state.sentence.length === 0){
    const hint = document.createElement("div");
    hint.className = "empty-hint";
    hint.textContent = "Empty · tap a word card below to auto-insert";
    $slots.appendChild(hint);
  } else {
    state.sentence.forEach((w, i) => {
      const t = document.createElement("div");
      t.className = "s-tile";
      t.textContent = w;
      t.title = "Tap to remove back to hand";
      t.onclick = () => removeFromSentence(i);
      $slots.appendChild(t);
    });
  }

  // Hand
  $hand.innerHTML = "";
  state.hand.forEach((w, idx) => {
    const t = document.createElement("div");
    t.className = "p-tile";
    t.textContent = w;
    t.title = "Tap to auto-insert into sentence";
    t.onclick = () => playTile(idx);
    $hand.appendChild(t);
  });

  $draw.disabled = state.bank.length === 0 || state.hand.length >= HAND_MAX || state.busy;
}

// Tap a word card: pure local lookup against the solution table
function playTile(idx){
  if(state.busy) return;
  const word = state.hand[idx];
  if(state.progress >= state.solution.length){
    state.score -= BAD_PENALTY;
    state.hand.splice(idx, 1);
    setFeedback("bad", `✗ Sentence complete, "${word}" is extra -${BAD_PENALTY}`);
    render();
    return;
  }
  const expected = state.solution[state.progress];
  if(word === expected.char){
    state.hand.splice(idx, 1);
    state.sentence.splice(expected.position, 0, word);
    state.progress++;
    state.score += INSERT_OK;
    if(state.progress >= state.solution.length){
      const len = state.sentence.length;
      const gain = COMPLETE_BASE + len * COMPLETE_PER_CHAR;
      state.score += gain;
      setFeedback("ok",
        `✓ Correct! Completion bonus +${gain} (base ${COMPLETE_BASE} + ${len}×${COMPLETE_PER_CHAR})` +
        `<br><span class="corr">Sentence: ${state.sentence.join(" ")}</span>`);
      setTimeout(() => {
        state.sentence = [];
        deal(len);
        render();
      }, 1500);
    } else {
      setFeedback("ok", `✓ Correct +${INSERT_OK} (${state.progress}/${state.solution.length})`);
    }
  } else {
    state.score -= BAD_PENALTY;
    setFeedback("bad", `✗ "${word}" doesn't fit here -${BAD_PENALTY}`);
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
  while(state.sentence.length > 0){
    state.hand.push(state.sentence.pop());
  }
  state.progress = 0;
  setFeedback("", "");
  render();
}

function drawTile(){
  if(state.hand.length >= HAND_MAX){ setTip("Hand is full"); return; }
  deal(1);
  render();
}

$clear.onclick = clearSentence;
$draw.onclick = drawTile;
$restart.onclick = () => { if(confirm("Restart? Score will be reset.")) start(); };
$level.onchange = () => { if(confirm("Changing difficulty restarts. Confirm?")) start(); };

start();
