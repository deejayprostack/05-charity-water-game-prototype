// Water Wordle
// Guess a 5-letter water word in 6 tries before the jerry can runs dry.
// Score starts at 100. Letter matches add points. A total miss costs points.
// After 30 seconds, dirty water is the obstacle: it hides color clues and
// leaks 1 point every second.

const ROWS = 6;
const COLS = 5;
const START_SECONDS = 120;
const FLOOD_START = 30;
const START_SCORE = 100;
const FLIP_GAP = 90;

// ANSWERS and VALID come from words.js.
// ANSWERS is the secret-word list. VALID is every guess the game accepts.

const introEl = document.getElementById("intro");
const playEl = document.getElementById("play");
const boardEl = document.getElementById("board");
const floodEl = document.getElementById("flood");
const keyboardEl = document.getElementById("keyboard");
const messageEl = document.getElementById("message");
const scoreEl = document.getElementById("score");
const scorePill = document.getElementById("score-pill");
const meterEl = document.getElementById("meter");
const meterFill = document.getElementById("meter-fill");
const meterLabel = document.getElementById("meter-label");
const leakLabel = document.getElementById("leak-label");
const floodBanner = document.getElementById("flood-banner");
const endEl = document.getElementById("end");
const endTitle = document.getElementById("end-title");
const endCopy = document.getElementById("end-copy");
const confettiEl = document.getElementById("confetti");

let answer = "";
let lastAnswer = "";
let row = 0;
let col = 0;
let score = START_SCORE;
let secondsLeft = START_SECONDS;
let status = "intro";
let timerId = null;
let timerOrigin = 0;
let lock = false;
let round = 0;
let pendingWin = false;
let floodWarned = false;
let milestoneShown = false;
let pointsLeaked = 0;
let leakMarks = 0;

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function init() {
  buildBoard();
  buildKeyboard();

  document.getElementById("start-btn").addEventListener("click", startRound);
  document.getElementById("reset-btn").addEventListener("click", startRound);
  document.getElementById("again-btn").addEventListener("click", startRound);

  keyboardEl.addEventListener("click", function (event) {
    const key = event.target.closest("[data-key]");
    if (!key) return;
    handleKey(key.dataset.key);
    key.blur();
  });

  document.addEventListener("keydown", onKeyDown);

  boardEl.addEventListener("animationend", function (event) {
    event.target.classList.remove("pop", "shake", "flip");
  });

  showIdleTimer();
  renderScore();
  console.log("Water Wordle is ready.");
}

function buildBoard() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = String(r);
      tile.dataset.col = String(c);
      boardEl.appendChild(tile);
    }
  }
}

function buildKeyboard() {
  for (let r = 0; r < KEY_ROWS.length; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row";

    if (r === 2) {
      rowEl.appendChild(makeKey("enter", "Enter", true));
    }

    const letters = KEY_ROWS[r];
    for (let i = 0; i < letters.length; i++) {
      rowEl.appendChild(makeKey(letters[i], letters[i], false));
    }

    if (r === 2) {
      rowEl.appendChild(makeKey("backspace", "Del", true));
    }

    keyboardEl.appendChild(rowEl);
  }

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Tap the keys, or type on your keyboard.";
  keyboardEl.appendChild(hint);
}

function makeKey(value, label, wide) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = wide ? "key wide" : "key";
  button.dataset.key = value;
  button.textContent = label;
  return button;
}

function startRound() {
  round += 1;
  stopTimer();

  answer = pickAnswer();
  row = 0;
  col = 0;
  score = START_SCORE;
  secondsLeft = START_SECONDS;
  status = "playing";
  lock = false;
  pendingWin = false;
  floodWarned = false;
  milestoneShown = false;
  pointsLeaked = 0;
  leakMarks = 0;

  clearTiles();
  clearKeys();
  confettiEl.innerHTML = "";

  introEl.hidden = true;
  playEl.hidden = false;
  endEl.hidden = true;
  endEl.classList.remove("win", "lose");
  keyboardEl.hidden = false;
  floodBanner.hidden = true;
  keyboardEl.classList.remove("clues-hidden");

  updateFloodVisual(0);
  renderScore();
  markActiveRow();
  setMessage("Guess a 5-letter word.");

  timerOrigin = Date.now();
  timerId = setInterval(tick, 100);
  tick();
}

function pickAnswer() {
  let next = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
  if (ANSWERS.length > 1) {
    while (next === lastAnswer) {
      next = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    }
  }
  lastAnswer = next;
  return next;
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function tick() {
  if (status !== "playing") return;

  const elapsedMs = Date.now() - timerOrigin;
  secondsLeft = START_SECONDS - elapsedMs / 1000;
  if (secondsLeft < 0) secondsLeft = 0;

  applyLeak();
  updateTimerUI();
  updateFlood();

  if (secondsLeft <= 0) {
    if (pendingWin) endGame(true);
    else endGame(false, "time");
  }
}

function showIdleTimer() {
  secondsLeft = START_SECONDS;
  pointsLeaked = 0;
  updateTimerUI();
  updateFloodVisual(0);
}

function updateTimerUI() {
  const ratio = secondsLeft / START_SECONDS;
  meterFill.style.transform = `scaleX(${ratio})`;
  meterEl.setAttribute("aria-valuenow", String(Math.ceil(secondsLeft)));
  meterLabel.textContent = `Water left ${formatTime(secondsLeft)}`;
  meterEl.classList.toggle("is-low", secondsLeft <= 60 && secondsLeft > 30);
  meterEl.classList.toggle("is-critical", secondsLeft <= 30);

  const elapsed = START_SECONDS - secondsLeft;
  if (elapsed < FLOOD_START) {
    leakLabel.textContent = `Dirty water in ${formatTime(FLOOD_START - elapsed)}`;
    leakLabel.classList.remove("is-leaking");
  } else if (pointsLeaked > 0) {
    leakLabel.textContent = `Obstacle: leaked ${pointsLeaked}`;
    leakLabel.classList.add("is-leaking");
  } else {
    leakLabel.textContent = "Obstacle: leaking 1/sec";
    leakLabel.classList.add("is-leaking");
  }
}

function updateFlood() {
  const elapsed = START_SECONDS - secondsLeft;
  let ratio = 0;
  if (elapsed > FLOOD_START) {
    ratio = (elapsed - FLOOD_START) / (START_SECONDS - FLOOD_START);
    if (ratio > 1) ratio = 1;
  }

  updateFloodVisual(ratio);

  const flooding = ratio > 0 && status === "playing";
  floodBanner.hidden = !flooding;
  keyboardEl.classList.toggle("clues-hidden", flooding);

  if (flooding && !floodWarned) {
    floodWarned = true;
    setMessage("Dirty water is up. Color clues are hidden, and your score is leaking.");
  }
}

function updateFloodVisual(ratio) {
  floodEl.style.height = `${ratio * 100}%`;
  const covered = Math.ceil(ratio * ROWS - 0.0001);
  const tiles = document.querySelectorAll(".tile");
  for (let i = 0; i < tiles.length; i++) {
    const tileRow = Number(tiles[i].dataset.row);
    const fromBottom = ROWS - 1 - tileRow;
    tiles[i].classList.toggle("underwater", fromBottom < covered);
  }
}

// The leak is the score obstacle. One point leaves for each second the
// dirty water has been on the board.
function applyLeak() {
  if (status !== "playing") return;
  const elapsed = START_SECONDS - secondsLeft;
  if (elapsed < FLOOD_START) return;

  const marks = Math.floor(elapsed - FLOOD_START);
  const delta = marks - leakMarks;
  if (delta <= 0) return;

  leakMarks = marks;
  const before = score;
  score = Math.max(0, score - delta);
  pointsLeaked += before - score;
  if (before !== score) renderScore("down");
}

function onKeyDown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.repeat) return;

  const typed = event.key.toLowerCase();

  if (typed === "enter") {
    event.preventDefault();
    if (status === "intro" || status === "won" || status === "lost") startRound();
    else handleKey("enter");
    return;
  }

  if (typed === "backspace") {
    event.preventDefault();
    handleKey("backspace");
    return;
  }

  if (typed === " ") {
    event.preventDefault();
    return;
  }

  if (/^[a-z]$/.test(typed)) {
    event.preventDefault();
    handleKey(typed);
  }
}

function handleKey(key) {
  if (status !== "playing" || lock) return;

  if (key === "enter") {
    submitGuess();
    return;
  }

  if (key === "backspace") {
    if (col === 0) return;
    col -= 1;
    const tile = getTile(row, col);
    tile.textContent = "";
    tile.classList.remove("filled", "pop");
    return;
  }

  if (!/^[a-z]$/.test(key)) return;
  if (col >= COLS) return;

  const tile = getTile(row, col);
  tile.textContent = key.toUpperCase();
  tile.classList.add("filled", "pop");
  col += 1;
}

function submitGuess() {
  if (lock || status !== "playing") return;

  if (col < COLS) {
    setMessage("Not enough letters.");
    shakeRow(row);
    return;
  }

  const guess = currentGuess();
  if (!VALID.has(guess)) {
    setMessage("Not in the word list.");
    shakeRow(row);
    return;
  }

  const result = grade(guess, answer);
  const thisRound = round;
  const scoredRow = row;
  lock = true;

  let delta = 0;
  let matches = 0;
  for (let i = 0; i < COLS; i++) {
    if (result[i] === "correct") {
      delta += 20;
      matches += 1;
    }
    if (result[i] === "present") {
      delta += 10;
      matches += 1;
    }

    const tile = getTile(scoredRow, i);
    setTimeout(function () {
      if (thisRound !== round) return;
      tile.classList.add(result[i], "flip");
    }, i * FLIP_GAP);

    paintKey(guess[i], result[i]);
  }

  const won = guess === answer;
  if (won) {
    pendingWin = true;
    delta += 50 + Math.ceil(secondsLeft);
  } else if (matches === 0) {
    delta -= 15;
  }

  score = Math.max(0, score + delta);
  if (delta > 0) renderScore("up");
  else if (delta < 0) renderScore("down");
  else renderScore();

  if (won) {
    milestoneShown = true;
    setMessage("Clean water. You found the word.");
  } else if (!milestoneShown && score >= 150) {
    milestoneShown = true;
    setMessage(`Milestone: ${score} points. ${guessMessage(result)}`);
  } else {
    setMessage(guessMessage(result));
  }

  row += 1;
  col = 0;
  markActiveRow();

  setTimeout(function () {
    if (thisRound !== round) return;
    lock = false;
    if (won) endGame(true);
    else if (row >= ROWS) endGame(false, "rows");
  }, FLIP_GAP * COLS + 40);
}

function currentGuess() {
  let text = "";
  for (let c = 0; c < COLS; c++) {
    text += getTile(row, c).textContent.toLowerCase();
  }
  return text;
}

// Two passes so duplicate letters are scored the way Wordle scores them.
// Greens are counted first, then leftover letters can be yellow.
function grade(guess, target) {
  const result = ["absent", "absent", "absent", "absent", "absent"];
  const counts = {};

  for (let i = 0; i < COLS; i++) {
    const letter = target[i];
    if (counts[letter]) counts[letter] += 1;
    else counts[letter] = 1;
  }

  for (let i = 0; i < COLS; i++) {
    if (guess[i] === target[i]) {
      result[i] = "correct";
      counts[guess[i]] -= 1;
    }
  }

  for (let i = 0; i < COLS; i++) {
    if (result[i] === "correct") continue;
    if (counts[guess[i]] > 0) {
      result[i] = "present";
      counts[guess[i]] -= 1;
    }
  }

  return result;
}

function guessMessage(result) {
  let rightSpot = 0;
  let wrongSpot = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === "correct") rightSpot += 1;
    if (result[i] === "present") wrongSpot += 1;
  }
  if (rightSpot === 0 && wrongSpot === 0) return "No matches. Lost 15 points.";
  return `${rightSpot} in the right spot, ${wrongSpot} in the wrong spot.`;
}

function paintKey(letter, state) {
  const key = keyboardEl.querySelector(`[data-key="${letter}"]`);
  if (!key) return;
  const rank = { absent: 1, present: 2, correct: 3 };
  const current = key.dataset.state || "";
  const currentRank = rank[current] || 0;
  if (rank[state] <= currentRank) return;
  key.classList.remove("absent", "present", "correct");
  key.classList.add(state);
  key.dataset.state = state;
}

function endGame(won, reason) {
  if (status === "won" || status === "lost") return;
  status = won ? "won" : "lost";
  stopTimer();
  lock = false;
  keyboardEl.hidden = true;
  floodBanner.hidden = true;
  keyboardEl.classList.remove("clues-hidden");
  leakLabel.classList.remove("is-leaking");
  endEl.hidden = false;
  endEl.classList.remove("win", "lose");
  endEl.classList.add(won ? "win" : "lose");

  const tiles = document.querySelectorAll(".tile");
  for (let i = 0; i < tiles.length; i++) {
    tiles[i].classList.remove("active");
    if (won) tiles[i].classList.remove("underwater");
  }
  if (won) floodEl.style.height = "0%";

  const word = answer.toUpperCase();
  const leakNote = pointsLeaked > 0 ? ` Dirty water leaked ${pointsLeaked} points.` : "";
  if (won) {
    endTitle.textContent = "Clean water found";
    endCopy.textContent = `You spelled ${word}. Score ${score}. Time left became a clean-water bonus.${leakNote}`;
    setMessage("You won. Clean water, secured.");
    celebrate();
  } else if (reason === "time") {
    endTitle.textContent = "The water ran out";
    endCopy.textContent = `The word was ${word}. Score ${score}. The timer emptied before the well was found.${leakNote}`;
    setMessage(`Time's up. The word was ${word}.`);
  } else {
    endTitle.textContent = "No tries left";
    endCopy.textContent = `The word was ${word}. Score ${score}. Six guesses, and the well is still waiting.${leakNote}`;
    setMessage(`The word was ${word}.`);
  }
}

function celebrate() {
  confettiEl.innerHTML = "";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  const colors = ["#FFC907", "#77A8BB", "#003366", "#FED8C1", "#BF6C46", "#FFF7E1"];
  for (let i = 0; i < 70; i++) {
    const piece = document.createElement("span");
    piece.className = "piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.35}s`;
    piece.style.animationDuration = `${1.5 + Math.random() * 1.4}s`;
    if (i % 3 === 0) piece.style.borderRadius = "50%";
    if (i % 4 === 0) piece.style.width = "8px";
    confettiEl.appendChild(piece);
  }
}

function clearTiles() {
  const tiles = document.querySelectorAll(".tile");
  for (let i = 0; i < tiles.length; i++) {
    tiles[i].textContent = "";
    tiles[i].className = "tile";
  }
}

function clearKeys() {
  const keys = document.querySelectorAll(".key");
  for (let i = 0; i < keys.length; i++) {
    keys[i].classList.remove("absent", "present", "correct");
    keys[i].dataset.state = "";
  }
}

function markActiveRow() {
  const tiles = document.querySelectorAll(".tile");
  for (let i = 0; i < tiles.length; i++) {
    const tileRow = Number(tiles[i].dataset.row);
    tiles[i].classList.toggle("active", status === "playing" && tileRow === row && row < ROWS);
  }
}

function shakeRow(r) {
  for (let c = 0; c < COLS; c++) {
    const tile = getTile(r, c);
    tile.classList.remove("shake");
    void tile.offsetWidth;
    tile.classList.add("shake");
  }
}

function getTile(r, c) {
  return boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function renderScore(direction) {
  scoreEl.textContent = String(score);
  if (!direction) return;
  scorePill.classList.remove("up", "down");
  void scorePill.offsetWidth;
  scorePill.classList.add(direction);
}

function setMessage(text) {
  messageEl.textContent = text;
}

function formatTime(totalSeconds) {
  let whole = Math.ceil(totalSeconds);
  if (whole < 0) whole = 0;
  if (whole > START_SECONDS) whole = START_SECONDS;
  const minutes = Math.floor(whole / 60);
  let secs = whole % 60;
  if (secs < 10) secs = `0${secs}`;
  return `${minutes}:${secs}`;
}

init();
