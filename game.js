const SYMBOLS = [
  { id: "cherry", glyph: "●", label: "ВИШНЯ", weight: 26, payout: 2 },
  { id: "lemon", glyph: "◆", label: "ЛИМОН", weight: 22, payout: 3 },
  { id: "bell", glyph: "♛", label: "КОРОНА", weight: 17, payout: 5 },
  { id: "diamond", glyph: "◇", label: "АЛМАЗ", weight: 11, payout: 12 },
  { id: "seven", glyph: "7", label: "СЕМЁРКА", weight: 7, payout: 20 },
  { id: "wild", glyph: "W", label: "WILD", weight: 7, payout: 25 },
  { id: "scatter", glyph: "ϟ", label: "РАЗРЯД", weight: 10, payout: 0 },
];

const PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
];

const BETS = [10, 25, 50, 100, 250, 500];
const formatter = new Intl.NumberFormat("ru-RU");

const state = {
  balance: 1500,
  bet: 50,
  win: 0,
  pendingWin: 0,
  streak: 0,
  heat: 0,
  freeSpins: 0,
  spins: 0,
  spinning: false,
  riskBusy: false,
  sound: true,
  grid: [],
};

const els = {
  reels: document.querySelector("#reels"),
  balance: document.querySelector("#balanceValue"),
  bet: document.querySelector("#betValue"),
  win: document.querySelector("#winValue"),
  multiplier: document.querySelector("#multiplierValue"),
  heatFill: document.querySelector("#heatFill"),
  heatLabel: document.querySelector("#heatLabel"),
  streak: document.querySelector("#streakValue"),
  streakDots: [...document.querySelectorAll("#streakDots i")],
  message: document.querySelector("#message"),
  spin: document.querySelector("#spinButton"),
  betMinus: document.querySelector("#betMinus"),
  betPlus: document.querySelector("#betPlus"),
  max: document.querySelector("#maxButton"),
  riskCard: document.querySelector("#riskCard"),
  riskStatus: document.querySelector("#riskStatus"),
  riskPot: document.querySelector("#riskPot"),
  mysteryCard: document.querySelector("#mysteryCard"),
  red: document.querySelector("#redButton"),
  black: document.querySelector("#blackButton"),
  collect: document.querySelector("#collectButton"),
  modeBanner: document.querySelector("#modeBanner"),
  slotShell: document.querySelector("#slotShell"),
  jackpot: document.querySelector("#jackpotValue"),
  sound: document.querySelector("#soundButton"),
  reset: document.querySelector("#resetButton"),
  spins: document.querySelector("#sessionSpins"),
  toast: document.querySelector("#toast"),
  canvas: document.querySelector("#confettiCanvas"),
};

let audioContext;
let toastTimer;
let confettiPieces = [];

function weightedSymbol() {
  const total = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
  let roll = random() * total;
  for (const symbol of SYMBOLS) {
    roll -= symbol.weight;
    if (roll <= 0) return symbol;
  }
  return SYMBOLS[0];
}

function random() {
  if (window.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0] / 4294967296;
  }
  return Math.random();
}

function buildGrid() {
  return Array.from({ length: 5 }, () => Array.from({ length: 3 }, weightedSymbol));
}

function symbolNode(symbol, reelIndex, rowIndex) {
  const item = document.createElement("div");
  item.className = `symbol ${symbol.id}`;
  item.dataset.reel = reelIndex;
  item.dataset.row = rowIndex;
  item.dataset.label = symbol.label;
  item.textContent = symbol.glyph;
  return item;
}

function renderGrid(grid, spinningReel = -1) {
  if (!els.reels.children.length) {
    grid.forEach((column, reelIndex) => {
      const reel = document.createElement("div");
      reel.className = "reel";
      reel.dataset.reel = reelIndex;
      column.forEach((symbol, rowIndex) => reel.appendChild(symbolNode(symbol, reelIndex, rowIndex)));
      els.reels.appendChild(reel);
    });
    return;
  }

  grid.forEach((column, reelIndex) => {
    const reel = els.reels.children[reelIndex];
    reel.classList.toggle("spinning", reelIndex <= spinningReel);
    column.forEach((symbol, rowIndex) => {
      const node = reel.children[rowIndex];
      node.className = `symbol ${symbol.id}`;
      node.dataset.label = symbol.label;
      node.textContent = symbol.glyph;
    });
  });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("midnightJackpotV1"));
    if (!saved) return;
    for (const key of ["balance", "bet", "streak", "heat", "freeSpins", "spins", "sound"]) {
      if (saved[key] !== undefined) state[key] = saved[key];
    }
  } catch (_) {
    localStorage.removeItem("midnightJackpotV1");
  }
}

function saveState() {
  localStorage.setItem("midnightJackpotV1", JSON.stringify({
    balance: state.balance,
    bet: state.bet,
    streak: state.streak,
    heat: state.heat,
    freeSpins: state.freeSpins,
    spins: state.spins,
    sound: state.sound,
  }));
}

function updateUI() {
  els.balance.textContent = formatter.format(state.balance);
  els.bet.textContent = formatter.format(state.bet);
  els.win.textContent = formatter.format(state.pendingWin || state.win);
  els.heatFill.style.width = `${state.heat}%`;
  els.heatLabel.textContent = `${state.heat}%`;
  els.streak.textContent = state.streak;
  els.streakDots.forEach((dot, index) => dot.classList.toggle("active", index < Math.min(state.streak, 5)));
  const streakMultiplier = getStreakMultiplier();
  const totalMultiplier = state.freeSpins > 0 ? streakMultiplier * 2 : streakMultiplier;
  els.multiplier.textContent = `множитель ×${totalMultiplier}`;
  els.spins.textContent = `СПИНОВ: ${state.spins}`;
  els.sound.textContent = state.sound ? "♪" : "×";
  els.sound.setAttribute("aria-label", state.sound ? "Выключить звук" : "Включить звук");
  els.modeBanner.classList.toggle("active", state.freeSpins > 0);
  if (state.freeSpins > 0) {
    els.modeBanner.innerHTML = `<span class="mode-icon">⚡</span><span><strong>РЕЖИМ ЖАРА ×2</strong> · бесплатных вращений: ${state.freeSpins}</span>`;
  } else {
    els.modeBanner.innerHTML = '<span class="mode-icon">⚡</span><span><strong>НЕОНОВЫЙ РАЗГОН</strong> · заполни шкалу жара и получи 5 бесплатных спинов ×2</span>';
  }
  updateRiskUI();
  saveState();
}

function getStreakMultiplier() {
  if (state.streak >= 5) return 3;
  if (state.streak >= 3) return 2;
  if (state.streak >= 2) return 1.5;
  return 1;
}

function setMessage(kicker, main, winner = false) {
  els.message.classList.toggle("win-message", winner);
  els.message.innerHTML = `<span class="message-kicker">${kicker}</span><strong>${main}</strong>`;
}

function evaluateGrid(grid) {
  let baseMultiplier = 0;
  const winningCells = new Set();
  let winningLines = 0;

  for (const line of PAYLINES) {
    const symbols = line.map((row, reel) => grid[reel][row]);
    const firstRegular = symbols.find(symbol => symbol.id !== "wild" && symbol.id !== "scatter");
    const target = firstRegular?.id || "wild";
    let count = 0;

    for (const symbol of symbols) {
      if (symbol.id === target || symbol.id === "wild") count += 1;
      else break;
    }

    if (count >= 3 && target !== "scatter") {
      const payoutSymbol = SYMBOLS.find(symbol => symbol.id === target) || SYMBOLS.find(symbol => symbol.id === "wild");
      const lengthBonus = count === 5 ? 3 : count === 4 ? 1.7 : 1;
      baseMultiplier += payoutSymbol.payout * lengthBonus;
      winningLines += 1;
      for (let reel = 0; reel < count; reel += 1) winningCells.add(`${reel}-${line[reel]}`);
    }
  }

  const scatters = grid.flat().filter(symbol => symbol.id === "scatter").length;
  const scatterBonus = scatters >= 3 ? scatters * 2 : 0;
  return { baseMultiplier: baseMultiplier + scatterBonus, winningCells, winningLines, scatters };
}

function highlightWinners(winningCells) {
  document.querySelectorAll(".symbol").forEach(node => {
    const key = `${node.dataset.reel}-${node.dataset.row}`;
    node.classList.toggle("winner", winningCells.has(key));
    node.classList.toggle("dim", winningCells.size > 0 && !winningCells.has(key));
  });
}

async function spin() {
  if (state.spinning || state.riskBusy) return;
  if (state.pendingWin > 0) collectWin(false);
  const isFree = state.freeSpins > 0;

  if (!isFree && state.balance < state.bet) {
    setMessage("НЕДОСТАТОЧНО ФИШЕК", "Сбрось игру или уменьши ставку");
    showToast("Фишек не хватает");
    playTone(110, .15, "sawtooth");
    return;
  }

  state.spinning = true;
  state.win = 0;
  if (isFree) state.freeSpins -= 1;
  else state.balance -= state.bet;
  state.spins += 1;
  state.heat = Math.min(100, state.heat + 7);
  els.spin.disabled = true;
  els.slotShell.classList.remove("big-win");
  highlightWinners(new Set());
  setMessage(isFree ? "БЕСПЛАТНОЕ ВРАЩЕНИЕ ×2" : "БАРАБАНЫ В ДВИЖЕНИИ", "Лови нужный ритм…");
  playSpinSound();
  updateUI();

  const finalGrid = buildGrid();
  const start = performance.now();
  const stopTimes = [760, 940, 1120, 1300, 1480];
  let lastTick = 0;

  await new Promise(resolve => {
    function animate(now) {
      const elapsed = now - start;
      if (now - lastTick > 58) {
        state.grid = state.grid.map((column, reel) => elapsed >= stopTimes[reel] ? finalGrid[reel] : column.map(weightedSymbol));
        const activeReel = stopTimes.findLastIndex(time => elapsed < time);
        renderGrid(state.grid, activeReel);
        lastTick = now;
      }
      if (elapsed < stopTimes[4] + 100) requestAnimationFrame(animate);
      else resolve();
    }
    requestAnimationFrame(animate);
  });

  state.grid = finalGrid;
  renderGrid(state.grid, -1);
  await finishSpin(isFree);
}

async function finishSpin(wasFreeSpin) {
  const result = evaluateGrid(state.grid);
  const multiplier = getStreakMultiplier() * (wasFreeSpin ? 2 : 1);
  const rawWin = Math.round(state.bet * result.baseMultiplier * multiplier);

  if (result.scatters >= 3) {
    state.heat = Math.min(100, state.heat + 25);
    showToast(`${result.scatters} разряда: +25% жара`);
  }

  if (rawWin > 0) {
    state.streak += 1;
    state.win = rawWin;
    state.pendingWin = rawWin;
    state.heat = Math.min(100, state.heat + Math.min(22, 5 + result.winningLines * 5));
    highlightWinners(result.winningCells);
    const label = rawWin >= state.bet * 20 ? "МЕГА-КУШ" : result.winningLines > 1 ? `${result.winningLines} ЛИНИИ` : "ЛИНИЯ СОШЛАСЬ";
    setMessage(label, `+ ${formatter.format(rawWin)} фишек`, true);
    unlockRisk();
    playWinSound(rawWin >= state.bet * 20);
    if (rawWin >= state.bet * 20) {
      els.slotShell.classList.add("big-win");
      launchConfetti(rawWin >= state.bet * 50 ? 130 : 70);
    }
  } else {
    state.streak = 0;
    setMessage("МИМО", randomMissMessage());
    playTone(145, .11, "triangle", .035);
  }

  if (state.heat >= 100 && state.freeSpins === 0) {
    state.heat = 0;
    state.freeSpins = 5;
    setTimeout(() => {
      showToast("РЕЖИМ ЖАРА: 5 бесплатных спинов ×2");
      playWinSound(true);
    }, 350);
  }

  state.spinning = false;
  els.spin.disabled = false;
  updateUI();

  if (wasFreeSpin && state.freeSpins > 0 && state.pendingWin === 0) {
    setTimeout(spin, 650);
  }
}

function randomMissMessage() {
  const lines = ["Неон моргнул, но куш ускользнул", "Почти. Следующий ритм может быть твоим", "Холодный спин. Разогреваем дальше", "Система любит смелых. Иногда"];
  return lines[Math.floor(random() * lines.length)];
}

function unlockRisk() {
  els.riskCard.classList.add("unlocked");
  els.riskStatus.textContent = "ОТКРЫТ";
}

function updateRiskUI() {
  const active = state.pendingWin > 0 && !state.spinning && !state.riskBusy;
  els.riskPot.textContent = formatter.format(state.pendingWin);
  els.red.disabled = !active;
  els.black.disabled = !active;
  els.collect.disabled = !active;
  if (!state.pendingWin) {
    els.riskCard.classList.remove("unlocked");
    els.riskStatus.textContent = "ЗАКРЫТ";
    els.mysteryCard.innerHTML = "<span>?</span>";
    els.mysteryCard.style.color = "";
  }
}

async function gamble(color) {
  if (!state.pendingWin || state.riskBusy) return;
  state.riskBusy = true;
  updateRiskUI();
  els.mysteryCard.classList.add("reveal");
  playTone(260, .12, "square", .025);
  await wait(520);
  const result = random() < .5 ? "red" : "black";
  const red = result === "red";
  els.mysteryCard.innerHTML = `<span>${red ? "♥" : "♠"}</span>`;
  els.mysteryCard.style.color = red ? "#ff416c" : "#f8f7ff";

  if (result === color) {
    state.pendingWin *= 2;
    state.win = state.pendingWin;
    setMessage("ЦВЕТ УГАДАН", `Риск оправдался: ${formatter.format(state.pendingWin)}`, true);
    showToast("Выигрыш удвоен");
    playWinSound(state.pendingWin >= state.bet * 40);
    if (state.pendingWin >= state.bet * 40) launchConfetti(80);
  } else {
    state.pendingWin = 0;
    state.win = 0;
    state.streak = 0;
    setMessage("СТОЛ ЗАБРАЛ СТАВКУ", "В этот раз цвет был другим");
    playTone(90, .32, "sawtooth", .045);
  }

  await wait(750);
  els.mysteryCard.classList.remove("reveal");
  state.riskBusy = false;
  updateUI();
}

function collectWin(show = true) {
  if (!state.pendingWin) return;
  const amount = state.pendingWin;
  state.balance += amount;
  state.pendingWin = 0;
  if (show) {
    setMessage("ВЫИГРЫШ ЗАЧИСЛЕН", `+ ${formatter.format(amount)} к балансу`, true);
    showToast("Фишки в кармане");
    playTone(620, .15, "sine", .04);
  }
  updateUI();
}

function changeBet(direction) {
  if (state.spinning || state.pendingWin) return;
  let index = BETS.indexOf(state.bet);
  index = Math.max(0, Math.min(BETS.length - 1, index + direction));
  state.bet = BETS[index];
  playTone(350 + index * 35, .05, "sine", .025);
  updateUI();
}

function showToast(text) {
  clearTimeout(toastTimer);
  els.toast.textContent = text;
  els.toast.classList.add("visible");
  toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 2300);
}

function getAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  return audioContext;
}

function playTone(frequency, duration, type = "sine", volume = .04, delay = 0) {
  if (!state.sound) return;
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, ctx.currentTime + delay);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + .015);
  gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + delay + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(ctx.currentTime + delay);
  oscillator.stop(ctx.currentTime + delay + duration + .02);
}

function playSpinSound() {
  [0, .11, .22, .33, .44].forEach((delay, index) => playTone(180 + index * 28, .09, "square", .018, delay));
}

function playWinSound(big) {
  const notes = big ? [330, 440, 550, 660, 880] : [440, 554, 659];
  notes.forEach((note, index) => playTone(note, .2, "sine", .045, index * .09));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function launchConfetti(count) {
  const canvas = els.canvas;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const colors = ["#c9ff4a", "#ff4fd8", "#9b6cff", "#58e6ff", "#ffffff"];
  confettiPieces = Array.from({ length: count }, () => ({
    x: window.innerWidth / 2 + (random() - .5) * 220,
    y: window.innerHeight * .34,
    vx: (random() - .5) * 12,
    vy: -random() * 10 - 3,
    size: random() * 6 + 3,
    color: colors[Math.floor(random() * colors.length)],
    angle: random() * Math.PI,
    spin: (random() - .5) * .3,
    life: 1,
  }));

  function frame() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    confettiPieces.forEach(piece => {
      piece.x += piece.vx;
      piece.vy += .2;
      piece.y += piece.vy;
      piece.angle += piece.spin;
      piece.life -= .009;
      ctx.save();
      ctx.globalAlpha = Math.max(0, piece.life);
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.angle);
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      ctx.restore();
    });
    confettiPieces = confettiPieces.filter(piece => piece.life > 0 && piece.y < window.innerHeight + 30);
    if (confettiPieces.length) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
  requestAnimationFrame(frame);
}

function resetGame() {
  if (state.spinning) return;
  const confirmed = window.confirm("Сбросить баланс и весь прогресс?");
  if (!confirmed) return;
  Object.assign(state, { balance: 1500, bet: 50, win: 0, pendingWin: 0, streak: 0, heat: 0, freeSpins: 0, spins: 0, riskBusy: false });
  state.grid = buildGrid();
  renderGrid(state.grid);
  highlightWinners(new Set());
  setMessage("СИСТЕМА ПЕРЕЗАПУЩЕНА", "Баланс снова заряжен");
  showToast("Новая игра");
  updateUI();
}

els.spin.addEventListener("click", spin);
els.betMinus.addEventListener("click", () => changeBet(-1));
els.betPlus.addEventListener("click", () => changeBet(1));
els.max.addEventListener("click", () => {
  if (state.spinning || state.pendingWin) return;
  state.bet = 500;
  updateUI();
  playTone(520, .08, "sine", .03);
});
els.red.addEventListener("click", () => gamble("red"));
els.black.addEventListener("click", () => gamble("black"));
els.collect.addEventListener("click", () => collectWin(true));
els.sound.addEventListener("click", () => {
  state.sound = !state.sound;
  updateUI();
  if (state.sound) playTone(540, .12, "sine", .035);
});
els.reset.addEventListener("click", resetGame);
document.addEventListener("keydown", event => {
  if (event.code === "Space" && !event.repeat && !["BUTTON", "INPUT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    spin();
  }
});

loadState();
state.grid = buildGrid();
renderGrid(state.grid);
updateUI();

let jackpot = 48750 + state.spins * 37;
setInterval(() => {
  jackpot += Math.floor(random() * 14) + 3;
  els.jackpot.textContent = `₽ ${formatter.format(jackpot)}`;
}, 2300);
