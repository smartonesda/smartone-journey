/* ======================================================
   game.js - SmartOne Finance (final: absolute pions)
   - Perbaikan: quiz modal, notifikasi di modal, klik dadu, safety listeners
====================================================== */

const diceEl = document.getElementById("dice");

// SmartOne Finance — Versi 4.0 (Sinkron 4-Sudut)
/* eslint-disable */
const boardEl = document.getElementById("board");
const rollBtn = document.getElementById("rollBtn");
const diceValueEl = document.getElementById("diceValue");
const turnInfoEl = document.getElementById("turnInfo");
const startBtn = document.getElementById("startBtn");
const playerCountGroup = document.getElementById("player-count-group");
const playerChoices = playerCountGroup.querySelectorAll(".btn-choice");

const quizModal = document.getElementById("quizModal");
const quizQuestion = document.getElementById("quizQuestion");
const quizChoices = document.getElementById("quizChoices");
const quizSubmit = document.getElementById("quizSubmit");
const modalNotif = document.getElementById("modalNotif"); // <<< tempat menampilkan hasil di modal

// --- MODIFIKASI 1: Ambil Elemen Baru ---
const playerInfoBoxes = [
  document.getElementById("player1-info"),
  document.getElementById("player2-info"),
  document.getElementById("player3-info"),
  document.getElementById("player4-info")
];
const diceOverlayEl = document.getElementById("diceOverlay");
const pionEls = [
  document.getElementById("pion1"),
  document.getElementById("pion2"),
  document.getElementById("pion3"),
  document.getElementById("pion4"),
];
const boardWrapper = document.getElementById("board-wrapper");
const notifPopup = document.getElementById("notifPopup"); // <<< fallback notifikasi di bawah layar
// --- Akhir Modifikasi 1 ---


/* ---------------- board shape & path (tidak diubah) ---------------- */
const gridSize = 6;
const path = [];
for (let c = 0; c < gridSize; c++) path.push([0, c]);
for (let r = 1; r < gridSize; r++) path.push([r, gridSize - 1]);
for (let c = gridSize - 2; c >= 0; c--) path.push([gridSize - 1, c]);
for (let r = gridSize - 2; r >= 1; r--) path.push([r, 0]);

const T = {
  START: "start",
  INCOME: "income",
  EXPENSE: "expense",
  TAX: "tax",
  SAVE: "save",
  BONUS: "bonus",
  PENALTY: "penalty",
};

/* ---------------- state global ---------------- */
let allGameData = null;
let currentTiles = [];
let currentQuizBank = [];        // fallback legacy
let currentQuizLevels = null;    // new: quizLevels
let currentEduText = {};

const tokenColors = ["#22d3ee", "#fbbf24", "#ef4444", "#22c55e"];
let players = [];
let turn = 0;
let started = false;


const LEVEL_THRESHOLDS = { 2: 130000, 3: 300000 };
const BONUS_BY_LEVEL = { 1: 15000, 2: 8000, 3: 5000 };

/* ---------------- load data ---------------- */
async function loadGameData() {
  try {
    const response = await fetch("data_game.json");
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    allGameData = await response.json();
    populateCategorySelect();
    startBtn.disabled = false;
    startBtn.textContent = "YOK Mulai"; // <-- Ganti teks tombol

  } catch (err) {
    console.error("Gagal memuat data_game.json:", err);
    turnInfoEl.textContent = "Error: Gagal memuat data. Coba refresh halaman.";
  }
}

// --- FUNGSI BARU: Mengisi Dropdown Kategori ---
function populateCategorySelect() {
  if (!allGameData) return;
  categorySel.innerHTML = "";
  const categories = Object.keys(allGameData.kategori);
  categories.forEach(key => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = allGameData.kategori[key].nama;
    categorySel.appendChild(option);
  });
}

/* ---------------- render board ---------------- */
function renderBoard() {
  boardEl.innerHTML = "";
  diceOverlayEl.style.display = 'none';
  const cells = new Map();
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = document.createElement("div");
      cell.className = "tile void";
      cell.dataset.pos = `${r}-${c}`;
      boardEl.appendChild(cell);
      cells.set(`${r}-${c}`, cell);
    }
  }
  path.forEach((coord, i) => {
    const [r, c] = coord;
    const cell = cells.get(`${r}-${c}`);
    const t = currentTiles[i % currentTiles.length] || { title: "?", effect: "", type: "income" };
    cell.className = `tile ${t.type}`;
    cell.innerHTML = `
      <div class="title">${t.title}</div>
      <div class="effect">${t.effect || ""}</div>
      <div class="tokens" data-idx="${i}"></div>`;
  });

  setTimeout(placeAllPions, 0);
  diceOverlayEl.style.display = 'flex';
}

/* ---------------- player management ---------------- */
function createPlayers(n = 2) {
  players = Array.from({ length: n }).map((_, i) => ({
    id: i,
    name: `P${i + 1}`,
    color: tokenColors[i % tokenColors.length],
    pos: 0,
    points: 50000,
    savingsPoints: 0,
    laps: 0,
    level: 1,
    usedQuestions: { 1: new Set(), 2: new Set(), 3: new Set() }
  }));
  updatePlayersPanel();
  placeAllPions();
}

function updatePlayersPanel() {
  playerInfoBoxes.forEach(box => box.style.display = 'none');
  players.forEach((p, index) => {
    const box = playerInfoBoxes[index];
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = `
      <strong>${p.name}</strong><br>
      Level: ${p.level} <br>
      Skor: ${fmt(p.points)}<br>
      Tabungan: ${fmt(p.savingsPoints)}<br>
      Putaran: ${p.laps}`;
    box.style.borderColor = p.color;
  });
}

function currentPlayer() { return players[turn % players.length]; }
function nextTurn() { turn = (turn + 1) % players.length; setTurnInfo(); }
function setTurnInfo() {
  const p = currentPlayer();
  turnInfoEl.textContent = `Giliran: ${p.name} — Skor ${fmt(p.points)} | Tabungan ${fmt(p.savingsPoints)}`;
}

/* ---------------- pion absolute helpers ---------------- */
function tileElementAt(r, c) {
  return boardEl.querySelector(`.tile[data-pos="${r}-${c}"]`);
}

function updatePionPosition(player) {
  const pion = pionEls[player.id];
  if (!pion || !boardEl) return;
  const idx = player.pos % path.length;
  const [r, c] = path[idx];
  const tile = tileElementAt(r, c);
  if (!tile) {
    pion.style.left = `0px`;
    pion.style.top = `0px`;
    return;
  }
  const boardRect = boardEl.getBoundingClientRect();
  const tileRect = tile.getBoundingClientRect();
  const left = tileRect.left - boardRect.left + tileRect.width / 2 - (pion.offsetWidth || 18) / 2;
  const top = tileRect.top - boardRect.top + tileRect.height / 2 - (pion.offsetHeight || 18) / 2;
  pion.style.left = `${Math.round(left)}px`;
  pion.style.top = `${Math.round(top)}px`;
}

// --- FUNGSI BARU: Listener untuk Tombol Pilihan Pemain ---
playerChoices.forEach(button => {
  button.addEventListener("click", () => {
    // Hapus 'selected' dari semua tombol
    playerChoices.forEach(btn => btn.classList.remove("selected"));
    // Tambah 'selected' ke tombol yg diklik
    button.classList.add("selected");
    // Simpan nilainya
    selectedPlayerCount = Number(button.dataset.value);
  });
});

playerChoices.forEach(button => {
  button.addEventListener("click", () => {
    playerChoices.forEach(btn => btn.classList.remove("selected"));
    button.classList.add("selected");
    selectedPlayerCount = Number(button.dataset.value);
  });
});

function placeAllPions() {
  players.forEach((p) => {
    const el = pionEls[p.id];
    if (el) { el.style.background = p.color; el.style.display = 'block'; }
    updatePionPosition(p);
  });
  for (let i = players.length; i < pionEls.length; i++) {
    const el = pionEls[i];
    if (el) el.style.display = 'none';
  }
}

window.addEventListener("resize", () => {
  if (typeof window._pionResizeTimeout !== "undefined") clearTimeout(window._pionResizeTimeout);
  window._pionResizeTimeout = setTimeout(() => placeAllPions(), 120);
});

/* ---------------- gameplay / movement ---------------- */
function rollDice() { return Math.floor(Math.random() * 6) + 1; }
function applyStartBonus(player) { player.points += 10000; showInModalOrNotif(`${player.name} melewati START: +10.000 Poin`); }

function resolveTile(player) {
  const tile = currentTiles[player.pos % currentTiles.length];
  showEdu(tile.type);
  switch (tile.type) {
    case T.INCOME:
      player.points += tile.points;
      showInModalOrNotif(`${player.name}: ${tile.title} ${toPoinStr(tile.points)}`);
      break;
    case T.EXPENSE:
      player.points += tile.points;
      showInModalOrNotif(`${player.name}: ${tile.title} ${toPoinStr(tile.points)}`);
      break;
    case T.TAX: {
      const cut = Math.floor(player.points * (tile.percent / 100));
      player.points -= cut;
      showInModalOrNotif(`${player.name}: Bayar ${tile.title} ${toPoinStr(-cut)}`);
      break;
    }
    case T.SAVE:
      if (player.points >= tile.points) {
        player.points -= tile.points;
        player.savingsPoints += tile.points;
        showInModalOrNotif(`${player.name}: Menabung ${toPoinStr(tile.points)}`);
      } else {
        showInModalOrNotif(`${player.name}: Poin kurang untuk menabung.`);
      }
      break;
    case T.BONUS:
      showInModalOrNotif(`${player.name}: ${tile.title}!`);
      handleQuiz(player);
      break;
    case T.PENALTY:
      player.points += tile.points;
      showInModalOrNotif(`${player.name}: Denda ${tile.title} ${toPoinStr(tile.points)}`);
      break;
    case T.START:
      showInModalOrNotif(`${player.name} di START.`);
  }
  updatePlayerLevel(player);
  updatePlayersPanel();
}

function fmt(n) { return n.toLocaleString("id-ID"); }
function toPoinStr(n) { return (n < 0 ? "-" : "+") + " " + Math.abs(n).toLocaleString("id-ID") + " Poin"; }

/* ---------------- notifications ---------------- */
/* showNotif: bottom fallback (existing) */
function showNotif(msg, time = 1800) {
  notifPopup.textContent = msg;
  notifPopup.classList.add("show");
  clearTimeout(notifPopup._t);
  notifPopup._t = setTimeout(() => notifPopup.classList.remove("show"), time);
}

/* showInModalOrNotif:
   - if quizModal is open, show message inside modalNotif (ke atas)
   - otherwise fallback to bottom notification */
function showInModalOrNotif(msg, time = 1600) {
  if (quizModal.open) {
    modalNotif.textContent = msg;
    modalNotif.classList.add("show");

    clearTimeout(modalNotif._t);
    modalNotif._t = setTimeout(() => {
      modalNotif.classList.remove("show");
    }, time);

  } else {
    showNotif(msg);
  }
}


/* ---------------- education popup ---------------- */
function showEdu(type) {
  const popup = document.getElementById("eduPopup");
  const msg = currentEduText[type];
  if (!msg) return;
  popup.textContent = msg;
  popup.classList.add("show");
  setTimeout(() => popup.classList.remove("show"), 4200);
}

/* ---------------- quiz system (FIXED) ---------------- */
/*
 askQuiz(bank)
  - Menampilkan modal, membangun opsi
  - Menampilkan hasil (benar/salah) DI DALAM MODAL sebelum menutup
  - Mengembalikan { answer, correct, item }
*/
function askQuiz(bank, playerLevel = 1) {
  return new Promise((resolve) => {
    const item = bank[Math.floor(Math.random() * bank.length)];
    if (!item) {
      showInModalOrNotif("Tidak ada kuis tersedia.");
      return resolve({ answer: null, correct: false, item: null });
    }

    // reset notif modal
    modalNotif.classList.remove("show");
    modalNotif.textContent = "";

    // Set soal
    quizQuestion.textContent = item.q;
    quizChoices.innerHTML = "";

    item.choices.forEach((c, idx) => {
      const wrapper = document.createElement("label");
      wrapper.className = "quiz-option";
      wrapper.innerHTML = `
        <input type="radio" name="quizOpt" value="${idx}">
        <span>${c}</span>
      `;
      quizChoices.appendChild(wrapper);
    });

    // handler submit
    quizSubmit.onclick = async (ev) => {
      ev.preventDefault();
      const selected = quizChoices.querySelector("input[name='quizOpt']:checked");
      const answer = selected ? Number(selected.value) : null;
      const correct = (answer === item.correct);

      // tampilkan notif di dalam modal
      modalNotif.textContent = correct ? "Jawaban benar!" : "Jawaban salah.";
      modalNotif.classList.add("show");

      // beri waktu pemain melihat notif sebelum modal ditutup
      await new Promise(r => setTimeout(r, 1100));

      try { quizModal.close(); } catch (e) {}
      modalNotif.classList.remove("show");

      resolve({ answer, correct, item });
    };

    // tampilkan modal
    try { quizModal.showModal(); } catch (e) {}
  });
}


/* ---------------- roll & move animations ---------------- */
function rollDiceAnimated() {
  return new Promise((resolve) => {
    playDiceSound();
    const result = Math.floor(Math.random() * 6) + 1;
    diceEl.classList.add("roll");
    setTimeout(() => {
      diceEl.classList.remove("roll");
      diceEl.textContent = result;
      resolve(result);
    }, 450);
  });
}

async function movePlayerAnimated(player, steps) {
  const ringLen = path.length;
  for (let i = 0; i < steps; i++) {
    const oldPos = player.pos;
    player.pos = (player.pos + 1) % ringLen;
    if (player.pos === 0 && oldPos !== 0) {
      player.laps++;
      applyStartBonus(player);
      updatePlayersPanel();
    }
    updatePionPosition(player);
    await new Promise((r) => setTimeout(r, 220));
  }
  highlightLanding(player.pos);
  resolveTile(player);
  updatePlayersPanel();
}

/* ---------------- handleQuiz: menggunakan askQuiz yang baru ---------------- */
async function handleQuiz(player) {
  const level = player.level || 1; // default level 1
  const bank = currentQuizLevels[level];

  if (!bank || bank.length === 0) {
    toast("Tidak ada soal untuk level ini.");
    return;
  }

  // --- PANGGIL SYSTEM QUIZ BARU ---
  const result = await askQuiz(bank, level);

  // Jika user tidak memilih jawaban
  if (!result || result.answer === null) {
    showNotif(`${player.name}: Tidak menjawab. Tidak ada bonus.`);
    return;
  }

  const item = bank.find(q => q.q === quizQuestion.textContent);

  if (!item) {
    toast("Soal tidak ditemukan.");
    return;
  }

  if (ans === item.correct) {
    // bonus berdasarkan level
    const bonus = level === 1 ? 15000 : level === 2 ? 8000 : 5000;
    player.points += bonus;

    // tampilkan notifikasi setelah modal tutup
    showNotif(`${player.name}: Jawaban benar! +${bonus.toLocaleString("id-ID")} Poin`);
  }

  // --- JAWABAN SALAH ---
  else {
    showNotif(`${player.name}: Jawaban salah.`);
  }

  updatePlayersPanel();
  updatePlayerLevel(player);
}




/* ---------------- highlight landing ---------------- */
function highlightLanding(index) {
  const tile = boardEl.querySelector(`.tokens[data-idx="${index}"]`)?.closest(".tile");
  if (!tile) return;
  tile.classList.add("highlight");
  setTimeout(() => tile.classList.remove("highlight"), 1200);
}

/* ---------------- audio ---------------- */
function playDiceSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(120, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
  } catch (e) { /* ignore */ }
}

/* ---------------- scrolling helpers ---------------- */
function scrollToBoard() { if (window.innerWidth > 768) return; boardEl.scrollIntoView({ behavior: "smooth", block: "center" }); }
function scrollToTurnPanel() { if (window.innerWidth > 768) return; turnInfoEl.scrollIntoView({ behavior: "smooth", block: "center" }); }

/* ---------------- events: roll button & dice click ---------------- */
rollBtn.addEventListener("click", async () => {
  if (!started) return;
  rollBtn.disabled = true;
  const p = currentPlayer();
  scrollToBoard();
  const d = await rollDiceAnimated();
  diceValueEl.textContent = `${p.name} melempar dadu: ${d}`;
  await movePlayerAnimated(p, d);
  nextTurn();
  setTimeout(scrollToTurnPanel, 1000);
  rollBtn.disabled = false;
});

// <<< new: klik pada dadu juga melempar (sama logic dg tombol) >>>
diceEl.addEventListener("click", async () => {
  if (!started) return;
  // disable untuk mencegah double click
  rollBtn.disabled = true;
  diceEl.setAttribute("aria-disabled", "true");
  const p = currentPlayer();
  scrollToBoard();
  const d = await rollDiceAnimated();
  diceValueEl.textContent = `${p.name} melempar dadu: ${d}`;
  await movePlayerAnimated(p, d);
  nextTurn();
  setTimeout(scrollToTurnPanel, 1000);
  rollBtn.disabled = false;
  diceEl.removeAttribute("aria-disabled");
});

/* ---------------- start button (setup -> game) ---------------- */
startBtn.addEventListener("click", () => {
  // 1. Ambil nilai dari SEMUA pilihan setup
  const n = Math.max(2, Math.min(4, Number(playerCountSel.value || 2)));
  const categoryKey = categorySel.value;

  // 2. Set data global berdasarkan kategori yg dipilih
  const selectedCategory = allGameData.kategori[categoryKey];
  currentTiles = selectedCategory.tiles || [];
  currentQuizLevels = selectedCategory.quizLevels || null;
  currentQuizBank = selectedCategory.quizBank || [];
  currentEduText = selectedCategory.eduText || {};

  renderBoard();
  createPlayers(n);
  turn = 0;
  started = true;
  setTurnInfo();
  rollBtn.disabled = false;

  const screenSetup = document.getElementById("screen-setup");
  const screenGame = document.getElementById("screen-game");
  screenSetup.classList.remove("active");
  screenGame.classList.add("active");

  setTimeout(placeAllPions, 150);
});

/* ---------------- level update ---------------- */
function updatePlayerLevel(player) {
  const oldLevel = player.level;
  if (player.points >= LEVEL_THRESHOLDS[3]) player.level = 3;
  else if (player.points >= LEVEL_THRESHOLDS[2]) player.level = 2;
  else player.level = 1;
  if (player.level !== oldLevel) showInModalOrNotif(`${player.name} naik ke LEVEL ${player.level}!`, 1800);
}

/* ---------------- init ---------------- */
loadGameData();