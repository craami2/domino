// =====================================================
// DOMINÓ VENEZOLANO ONLINE - APP COMPLETA v2.0
// Con sonido, puntuación por rondas, equipos, bots opcionales
// =====================================================

const SUPABASE_URL = "https://cybkunnrqwilfzzyvrug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5Ymt1bm5ycXdpbGZ6enl2cnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODA5OTUsImV4cCI6MjA5NTU1Njk5NX0.nWdOVfjb_amwsvf0Fih-zpL8Ivc8zCijbNmRTwgoo-k";

let supabaseClient = null;
let myId = null;
let myNickname = "";
let currentRoomId = null;
let currentRoomCode = "";
let isHost = false;
let playersList = [];
let timerInterval = null;
let timeLeft = 60;
let maxPoints = 100;
let handRotations = {};
let currentTurnSeat = null;
let roomStatus = "LOBBY";
let boardState = [];
let currentLeftEnd = null;
let currentRightEnd = null;
let draggedTileData = null;
let isMuted = false;

let screenLogin, screenLobby, screenGame;

// =====================================================
// INICIALIZACIÓN
// =====================================================
window.addEventListener('DOMContentLoaded', async () => {
  screenLogin = document.getElementById('screen-login');
  screenLobby = document.getElementById('screen-lobby');
  screenGame = document.getElementById('screen-game');

  createCustomAlertDOM();
  setupEventListeners();

  try {
    if (!window.supabase) {
      showNiceAlert("Error: la librería de Supabase no está cargada. Recarga la página.");
      return;
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("%c[DOMINÓ] ✅ Supabase inicializado correctamente", "color:#10b981");
  } catch (err) {
    console.error(err);
    showNiceAlert("Error al conectar con el servidor. Intenta más tarde.");
  }
});

function setupEventListeners() {
  const btnCreate = document.getElementById('btn-create-room');
  const btnJoin = document.getElementById('btn-join-room');
  const btnStart = document.getElementById('btn-start-game');
  const selectMax = document.getElementById('select-max-points');

  if (btnCreate) btnCreate.onclick = createRoom;
  if (btnJoin) btnJoin.onclick = joinRoom;
  if (btnStart) btnStart.onclick = startGame;

  if (selectMax) {
    selectMax.onchange = async () => {
      if (!isHost || !currentRoomId) return;
      const newMax = parseInt(selectMax.value);
      await supabaseClient.from('rooms').update({ max_points: newMax }).eq('id', currentRoomId);
      maxPoints = newMax;
      document.getElementById('text-max-points').innerText = `${newMax} puntos`;
    };
  }

  // Drop zone
  const dropZone = document.getElementById('drop-zone-mesa');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      dropZone.classList.add('bg-emerald-500/10', 'border-emerald-400', 'drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('bg-emerald-500/10', 'border-emerald-400', 'drag-over');
    });
    dropZone.addEventListener('drop', handleFichaDrop);
  }

  // Mute button (se crea dinámicamente si no existe)
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm') toggleMute();
  });
}

// =====================================================
// SONIDOS (Web Audio API - sin archivos externos)
// =====================================================
function playSound(type) {
  if (isMuted) return;
  try {
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.value = 1800;

    switch (type) {
      case 'place': // Ficha colocada
        osc.type = 'sawtooth';
        osc.frequency.value = 620;
        gain.gain.value = 0.22;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audio.destination);
        osc.start();
        setTimeout(() => {
          gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
          setTimeout(() => osc.stop(), 400);
        }, 80);
        break;

      case 'turn': // Turno del jugador
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.value = 0.18;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audio.destination);
        osc.start();
        setTimeout(() => {
          gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.45);
          setTimeout(() => osc.stop(), 520);
        }, 110);
        break;

      case 'win': // Ganar ronda o partida
        osc.type = 'sine';
        osc.frequency.value = 780;
        gain.gain.value = 0.3;
        osc.connect(audio.destination);
        osc.start();
        setTimeout(() => { osc.frequency.value = 980; }, 180);
        setTimeout(() => {
          gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
          setTimeout(() => osc.stop(), 700);
        }, 420);
        break;

      case 'error':
        osc.type = 'sawtooth';
        osc.frequency.value = 180;
        gain.gain.value = 0.25;
        osc.connect(audio.destination);
        osc.start();
        setTimeout(() => {
          gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25);
          setTimeout(() => osc.stop(), 300);
        }, 60);
        break;

      case 'pass':
        osc.type = 'triangle';
        osc.frequency.value = 420;
        gain.gain.value = 0.2;
        osc.connect(audio.destination);
        osc.start();
        setTimeout(() => {
          gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
          setTimeout(() => osc.stop(), 380);
        }, 90);
        break;
    }
  } catch (e) {}
}

function toggleMute() {
  isMuted = !isMuted;
  const btn = document.getElementById('btn-mute');
  if (btn) btn.innerText = isMuted ? '🔇' : '🔊';
  showNiceAlert(isMuted ? "Sonido desactivado" : "Sonido activado");
}

// =====================================================
// ALERTAS BONITAS
// =====================================================
function createCustomAlertDOM() {
  if (document.getElementById('custom-alert-bg')) return;
  const alertDiv = document.createElement('div');
  alertDiv.id = 'custom-alert-bg';
  alertDiv.className = 'hidden fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100]';
  alertDiv.innerHTML = `
    <div class="bg-[#111827] border border-gray-700 p-7 rounded-3xl shadow-2xl max-w-sm w-full text-center">
      <div class="w-14 h-14 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">🎲</div>
      <p id="custom-alert-text" class="text-sm text-gray-200 font-medium mb-6 leading-snug"></p>
      <button id="custom-alert-btn" 
        class="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold py-3 rounded-2xl text-sm transition-all">
        Entendido
      </button>
    </div>
  `;
  document.body.appendChild(alertDiv);
  document.getElementById('custom-alert-btn').onclick = () => {
    document.getElementById('custom-alert-bg').classList.add('hidden');
  };
}

function showNiceAlert(message, duration = 4200) {
  const txt = document.getElementById('custom-alert-text');
  const bg = document.getElementById('custom-alert-bg');
  if (txt && bg) {
    txt.innerHTML = message;
    bg.classList.remove('hidden');
    if (duration > 0) {
      setTimeout(() => {
        if (!bg.classList.contains('hidden')) bg.classList.add('hidden');
      }, duration);
    }
  } else {
    alert(message.replace(/<[^>]*>?/gm, ''));
  }
}

// =====================================================
// UTILIDADES
// =====================================================
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function obtenerSiguienteAsiento(asientoActual) {
  // Sentido anti-horario (común en dominó venezolano)
  let siguiente = asientoActual - 1;
  if (siguiente < 1) siguiente = 4;
  return siguiente;
}

function getDominoDotMap(value) {
  const maps = {
    0: [], 1: [5], 2: [3, 7], 3: [1, 5, 9],
    4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9]
  };
  return maps[value] || [];
}

function createDominoSVG(top, bottom) {
  const topDots = getDominoDotMap(top);
  const bottomDots = getDominoDotMap(bottom);
  const dotPositions = {
    1: [18, 18], 2: [50, 18], 3: [82, 18],
    4: [18, 44], 5: [50, 44], 6: [82, 44],
    7: [18, 70], 8: [50, 70], 9: [82, 70]
  };
  const dotsMarkup = (dots, offsetY) => dots.map(n => {
    const [x, y] = dotPositions[n];
    return `<circle cx="${x}" cy="${y + offsetY}" r="7.2" fill="#111827"></circle>`;
  }).join('');

  return `
    <svg viewBox="0 0 100 200" preserveAspectRatio="none">
      <rect x="1" y="1" width="98" height="198" rx="14" ry="14" fill="#fefce8" stroke="#1f2937" stroke-width="3.5"/>
      <line x1="14" y1="100" x2="86" y2="100" stroke="#1f2937" stroke-width="3"/>
      ${dotsMarkup(topDots, 0)}
      ${dotsMarkup(bottomDots, 100)}
    </svg>
  `;
}

function validatePlay(ficha, leftEnd, rightEnd) {
  if (leftEnd === null && rightEnd === null) {
    return { isValid: true, newLeft: ficha[0], newRight: ficha[1] };
  }
  if (ficha[0] === leftEnd) return { isValid: true, newLeft: ficha[1], newRight: rightEnd };
  if (ficha[1] === leftEnd) return { isValid: true, newLeft: ficha[0], newRight: rightEnd };
  if (ficha[0] === rightEnd) return { isValid: true, newLeft: leftEnd, newRight: ficha[1] };
  if (ficha[1] === rightEnd) return { isValid: true, newLeft: leftEnd, newRight: ficha[0] };
  return { isValid: false };
}

function hasValidMove(hand, leftEnd, rightEnd) {
  if (!hand || hand.length === 0) return false;
  for (let f of hand) {
    if (validatePlay(f, leftEnd, rightEnd).isValid) return true;
  }
  return false;
}

function calculatePointsFromHands(players) {
  let total = 0;
  players.forEach(p => {
    if (p.hand && Array.isArray(p.hand)) {
      p.hand.forEach(f => { total += (f[0] + f[1]); });
    }
  });
  return total;
}

// =====================================================
// CREAR / UNIRSE A SALA
// =====================================================
async function createRoom() {
  if (!supabaseClient) return showNiceAlert("Error de conexión.");
  const nicknameInput = document.getElementById('input-nickname').value.trim();
  if (!nicknameInput) return showNiceAlert("Escribe un nickname.");

  myNickname = nicknameInput;
  isHost = true;
  currentRoomCode = generateRoomCode();

  const { data: roomData, error } = await supabaseClient.from('rooms').insert([{
    room_code: currentRoomCode,
    max_points: 100,
    current_turn_seat: 1,
    status: 'LOBBY',
    board: [],
    left_end: null,
    right_end: null,
    scores: { "1": 0, "2": 0, "3": 0, "4": 0 },
    round_number: 1
  }]).select().single();

  if (error) return showNiceAlert("Error al crear la sala.");

  currentRoomId = roomData.id;

  const { data: playerData } = await supabaseClient.from('players').insert([{
    room_id: currentRoomId,
    nickname: myNickname,
    seat_position: 1,
    is_host: true,
    hand: [],
    is_bot: false
  }]).select().single();

  myId = playerData.id;
  showLobbyScreen();
  listenToRoomChanges();
}

async function joinRoom() {
  if (!supabaseClient) return;
  const nicknameInput = document.getElementById('input-nickname').value.trim();
  const codeInput = document.getElementById('input-room-code').value.trim().toUpperCase();
  if (!nicknameInput || !codeInput) return showNiceAlert("Completa nickname y código.");

  myNickname = nicknameInput;

  const { data: roomData, error } = await supabaseClient.from('rooms')
    .select('*').eq('room_code', codeInput).single();

  if (error || !roomData || roomData.status === 'PLAYING' || roomData.status === 'FINISHED') {
    return showNiceAlert("Sala no disponible o ya en juego.");
  }

  currentRoomId = roomData.id;
  currentRoomCode = codeInput;

  const { data: existing } = await supabaseClient.from('players')
    .select('seat_position').eq('room_id', currentRoomId);
  const taken = existing.map(p => p.seat_position);

  let seat = 1;
  for (let i = 1; i <= 4; i++) if (!taken.includes(i)) { seat = i; break; }

  const { data: playerData } = await supabaseClient.from('players').insert([{
    room_id: currentRoomId,
    nickname: myNickname,
    seat_position: seat,
    is_host: false,
    hand: [],
    is_bot: false
  }]).select().single();

  myId = playerData.id;
  isHost = false;
  showLobbyScreen();
  listenToRoomChanges();
}

// =====================================================
// LOBBY
// =====================================================
function showLobbyScreen() {
  screenLogin.classList.add('hidden');
  screenGame.classList.add('hidden');
  screenLobby.classList.remove('hidden');

  const codeDisplay = document.getElementById('display-room-code');
  if (codeDisplay) codeDisplay.innerText = currentRoomCode;

  const startBtn = document.getElementById('btn-start-game');
  const hostSettings = document.getElementById('host-settings');

  if (isHost) {
    if (startBtn) startBtn.style.display = 'block';
    if (hostSettings) hostSettings.style.display = 'block';
  } else {
    if (startBtn) startBtn.style.display = 'none';
    if (hostSettings) hostSettings.style.display = 'none';
  }

  fetchPlayers();
}

async function fetchPlayers() {
  if (!currentRoomId) return;
  const { data } = await supabaseClient.from('players')
    .select('*').eq('room_id', currentRoomId).order('seat_position');

  if (data) {
    playersList = data;
    renderLobbyPlayers();
    if (!screenGame.classList.contains('hidden')) {
      renderTableLayout();
    }
  }
}

function renderLobbyPlayers() {
  const container = document.getElementById('lobby-players-list');
  if (!container) return;
  container.innerHTML = '';

  const seats = [1,2,3,4];
  const teamColors = {1: 'team-1-3', 2: 'team-2-4', 3: 'team-1-3', 4: 'team-2-4'};

  seats.forEach(seatNum => {
    const player = playersList.find(p => p.seat_position === seatNum);
    const isMe = player && player.id === myId;

    const div = document.createElement('div');
    div.className = `seat-row flex items-center justify-between bg-[#1f2937] border border-gray-700 rounded-2xl px-4 py-3 ${player ? 'opacity-100' : 'opacity-70'}`;

    let html = `
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black border ${seatNum === 1 || seatNum === 3 ? 'bg-emerald-950 border-emerald-700 text-emerald-400' : 'bg-rose-950 border-rose-700 text-rose-400'}">
          ${seatNum}
        </div>
        <div>
          <div class="font-bold text-sm ${player ? teamColors[seatNum] : 'text-gray-500'}">
            ${player ? player.nickname : 'Esperando jugador...'}
          </div>
          <div class="text-[10px] text-gray-500">${seatNum === 1 || seatNum === 3 ? 'Equipo A' : 'Equipo B'}</div>
        </div>
      </div>
    `;

    if (player && isHost && !isMe) {
      html += `
        <button onclick="movePlayer(${player.seat_position}, ${player.seat_position === 1 ? 2 : 1})" 
          class="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-600 text-gray-400">
          Mover
        </button>`;
    }

    if (player && isMe) {
      html += `<span class="text-emerald-400 text-xs font-bold px-2.5 py-0.5 bg-emerald-950/60 rounded-full">TÚ</span>`;
    }

    div.innerHTML = html;
    container.appendChild(div);
  });
}

window.movePlayer = async function(fromSeat, toSeat) {
  if (!isHost) return;
  const player = playersList.find(p => p.seat_position === fromSeat);
  if (!player) return;

  const target = playersList.find(p => p.seat_position === toSeat);
  if (target) {
    await supabaseClient.from('players').update({ seat_position: fromSeat }).eq('id', target.id);
  }
  await supabaseClient.from('players').update({ seat_position: toSeat }).eq('id', player.id);
  fetchPlayers();
};

// =====================================================
// INICIAR PARTIDA + REPARTIR
// =====================================================
async function startGame() {
  if (!isHost) return;
  if (playersList.length < 4) return showNiceAlert("Necesitas 4 jugadores para empezar.");

  // Barajar todas las fichas
  let pool = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) pool.push([i, j]);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  let asientoConDobleSeis = 1;
  for (let i = 1; i <= 4; i++) {
    const player = playersList.find(p => p.seat_position === i);
    if (!player) continue;
    const hand = pool.splice(0, 7);
    if (hand.some(f => f[0] === 6 && f[1] === 6)) asientoConDobleSeis = i;

    await supabaseClient.from('players').update({ hand }).eq('id', player.id);
  }

  await supabaseClient.from('rooms').update({
    status: 'PLAYING',
    current_turn_seat: asientoConDobleSeis,
    board: [],
    left_end: null,
    right_end: null,
    round_number: 1,
    scores: { "1": 0, "2": 0, "3": 0, "4": 0 }
  }).eq('id', currentRoomId);

  await fetchPlayers();
  showGameScreen();
  startTurnTimer();
  playBotTurnIfNeeded();
}

// =====================================================
// PANTALLA DE JUEGO
// =====================================================
function showGameScreen() {
  screenLobby.classList.add('hidden');
  screenLogin.classList.add('hidden');
  screenGame.classList.remove('hidden');

  document.getElementById('game-display-code').innerText = currentRoomCode;

  // Botón mute
  let muteBtn = document.getElementById('btn-mute');
  if (!muteBtn) {
    muteBtn = document.createElement('button');
    muteBtn.id = 'btn-mute';
    muteBtn.className = 'absolute top-3 right-3 z-50 bg-[#111827] border border-gray-700 text-lg px-3 py-1 rounded-2xl';
    muteBtn.innerText = '🔊';
    muteBtn.onclick = toggleMute;
    document.getElementById('screen-game').appendChild(muteBtn);
  }

  renderTableLayout();
  startTurnTimer();
}

function renderTableLayout() {
  const me = playersList.find(p => p.id === myId);
  if (!me) return;

  document.getElementById('my-name-display').innerText = 
    `Tu Mano: ${me.nickname} (Asiento ${me.seat_position}) • ${me.seat_position % 2 === 1 ? 'Equipo A' : 'Equipo B'}`;

  // Calcular posiciones relativas (tú siempre abajo)
  const mySeat = me.seat_position;
  const leftSeat = mySeat === 1 ? 4 : mySeat - 1;
  const rightSeat = mySeat === 4 ? 1 : mySeat + 1;
  const topSeat = mySeat === 1 ? 3 : mySeat === 2 ? 4 : mySeat === 3 ? 1 : 2;

  const pLeft = playersList.find(p => p.seat_position === leftSeat);
  const pTop = playersList.find(p => p.seat_position === topSeat);
  const pRight = playersList.find(p => p.seat_position === rightSeat);

  document.getElementById('name-player-2').innerHTML = pLeft ? 
    `${pLeft.nickname} <span class="text-xs opacity-60">(Izq)</span>` : "Esperando...";
  document.getElementById('name-player-3').innerHTML = pTop ? 
    `${pTop.nickname} <span class="text-xs opacity-60">(Pareja)</span>` : "Esperando...";
  document.getElementById('name-player-4').innerHTML = pRight ? 
    `${pRight.nickname} <span class="text-xs opacity-60">(Der)</span>` : "Esperando...";

  // Actualizar nombre del turno actual
  const turnPlayer = playersList.find(p => p.seat_position === currentTurnSeat);
  const turnEl = document.getElementById('current-turn-player');
  if (turnEl) {
    if (turnPlayer) {
      turnEl.innerHTML = `${turnPlayer.nickname} <span class="text-xs text-gray-400">(Asiento ${currentTurnSeat})</span>`;
      turnEl.style.color = (currentTurnSeat === me.seat_position) ? '#34d399' : '#f59e0b';
    } else {
      turnEl.innerText = 'Esperando...';
    }
  }

  renderOpaqueOpponentHand('hand-player-2', pLeft?.hand?.length || 0, 'vertical');
  renderOpaqueOpponentHand('hand-player-3', pTop?.hand?.length || 0, 'horizontal');
  renderOpaqueOpponentHand('hand-player-4', pRight?.hand?.length || 0, 'vertical');

  renderMyHandPremium(me);
  renderBoard();
}

function renderMyHandPremium(myData) {
  const container = document.getElementById('my-hand');
  container.innerHTML = '';

  const canPlay = currentTurnSeat === myData.seat_position && roomStatus === 'PLAYING';

  myData.hand.forEach((ficha, index) => {
    if (handRotations[index] === undefined) handRotations[index] = 0;
    const rot = handRotations[index];

    const div = document.createElement('div');
    div.setAttribute('draggable', canPlay ? 'true' : 'false');
    div.className = `ficha-domino ${rot === 180 ? 'ficha-rotada' : ''} ${canPlay ? '' : 'opacity-75'}`;
    div.innerHTML = createDominoSVG(ficha[0], ficha[1]);

    if (canPlay) {
      div.onclick = () => {
        handRotations[index] = rot === 0 ? 180 : 0;
        renderMyHandPremium(myData);
      };

      div.addEventListener('dragstart', (e) => {
        const payload = JSON.stringify({ index, values: ficha, rotation: rot });
        e.dataTransfer.setData('text/plain', payload);
        draggedTileData = payload;
      });
    }
    container.appendChild(div);
  });

  // Botón PASAR si no hay jugadas válidas
  const passContainer = document.getElementById('pass-container') || createPassButton();
  const hasMove = hasValidMove(myData.hand, currentLeftEnd, currentRightEnd);
  passContainer.style.display = (canPlay && !hasMove) ? 'block' : 'none';
}

function createPassButton() {
  const container = document.createElement('div');
  container.id = 'pass-container';
  container.className = 'mt-3 flex justify-center';
  container.innerHTML = `
    <button onclick="passTurn()" 
      class="bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-sm font-bold px-8 py-2.5 rounded-2xl shadow-lg flex items-center gap-2">
      <span>⏭️</span> <span>PASAR TURNO</span>
    </button>
  `;
  document.getElementById('my-hand').parentElement.appendChild(container);
  return container;
}

async function passTurn() {
  const me = playersList.find(p => p.id === myId);
  if (!me || currentTurnSeat !== me.seat_position) return;

  playSound('pass');
  const next = obtenerSiguienteAsiento(me.seat_position);
  await supabaseClient.from('rooms').update({ current_turn_seat: next }).eq('id', currentRoomId);
  showNiceAlert("Pasaste el turno.");
}

// =====================================================
// RENDER TABLERO MEJORADO
// =====================================================
function renderBoard() {
  const zone = document.getElementById('drop-zone-mesa');
  const placeholder = document.getElementById('placeholder-mesa');
  if (!zone) return;

  if (boardState.length > 0 && placeholder) placeholder.classList.add('hidden');
  else if (placeholder) placeholder.classList.remove('hidden');

  // Limpiar fichas anteriores (mantener placeholder)
  Array.from(zone.children).forEach(c => { if (c.id !== 'placeholder-mesa') c.remove(); });

  // Mostrar extremos actuales
  if (currentLeftEnd !== null && currentRightEnd !== null) {
    const endsDiv = document.createElement('div');
    endsDiv.className = 'absolute top-3 right-3 bg-black/60 text-emerald-400 text-xs px-3 py-1 rounded-full font-mono border border-emerald-800';
    endsDiv.innerHTML = `EXTREMOS: <strong>${currentLeftEnd}</strong> — <strong>${currentRightEnd}</strong>`;
    zone.appendChild(endsDiv);
  }

  boardState.forEach((f, idx) => {
    const d = document.createElement('div');
    d.className = `ficha-domino played inline-block mx-1 mb-1.5 ${idx === boardState.length - 1 ? 'ring-2 ring-emerald-400' : ''}`;
    d.style.transform = "scale(0.78)";
    d.innerHTML = createDominoSVG(f[0], f[1]);
    zone.appendChild(d);
  });
}

// =====================================================
// JUGAR FICHA (DROP)
// =====================================================
async function handleFichaDrop(e) {
  e.preventDefault();
  const dropZone = document.getElementById('drop-zone-mesa');
  dropZone.classList.remove('bg-emerald-500/10', 'border-emerald-400', 'drag-over');

  const me = playersList.find(p => p.id === myId);
  if (!me || !Array.isArray(me.hand)) return;

  const { data: currentRoom } = await supabaseClient.from('rooms')
    .select('*').eq('id', currentRoomId).single();

  if (!currentRoom || currentRoom.status !== 'PLAYING' || currentRoom.current_turn_seat !== me.seat_position) {
    playSound('error');
    return showNiceAlert("No es tu turno o la partida no está activa.");
  }

  try {
    let dataString = e.dataTransfer.getData('text/plain') || draggedTileData;
    if (!dataString) return showNiceAlert("Error al leer la ficha.");
    draggedTileData = null;

    const data = JSON.parse(dataString);
    const fichaJugada = data.values;

    const validation = validatePlay(fichaJugada, currentRoom.left_end, currentRoom.right_end);
    if (!validation.isValid) {
      playSound('error');
      return showNiceAlert(`Ficha inválida. Necesitas un ${currentRoom.left_end} o ${currentRoom.right_end}.`);
    }

    // Actualizar mano del jugador
    const updatedHand = me.hand.filter((_, idx) => idx !== data.index);
    await supabaseClient.from('players').update({ hand: updatedHand }).eq('id', myId);

    // Actualizar sala
    const newBoard = [...(currentRoom.board || []), fichaJugada];
    const siguienteAsiento = obtenerSiguienteAsiento(me.seat_position);

    await supabaseClient.from('rooms').update({
      board: newBoard,
      left_end: validation.newLeft,
      right_end: validation.newRight,
      current_turn_seat: updatedHand.length === 0 ? null : siguienteAsiento
    }).eq('id', currentRoomId);

    playSound('place');
    boardState = newBoard;
    currentLeftEnd = validation.newLeft;
    currentRightEnd = validation.newRight;
    renderBoard();
    handRotations = {};

    // === FIN DE RONDA ===
    if (updatedHand.length === 0) {
      await endRound(me.seat_position, currentRoom);
      return;
    }

    await fetchPlayers();
    startTurnTimer();
    playBotTurnIfNeeded();

  } catch (err) {
    console.error(err);
    playSound('error');
    showNiceAlert("Error al jugar la ficha.");
  }
}

// =====================================================
// FIN DE RONDA + PUNTUACIÓN VENEZOLANA
// =====================================================
async function endRound(winnerSeat, roomData) {
  clearInterval(timerInterval);

  const winner = playersList.find(p => p.seat_position === winnerSeat);
  const teamA = playersList.filter(p => p.seat_position === 1 || p.seat_position === 3);
  const teamB = playersList.filter(p => p.seat_position === 2 || p.seat_position === 4);

  let points = 0;
  let winningTeam = (winnerSeat === 1 || winnerSeat === 3) ? 'A' : 'B';

  if (winningTeam === 'A') {
    points = calculatePointsFromHands(teamB);
  } else {
    points = calculatePointsFromHands(teamA);
  }

  // Actualizar scores
  const newScores = { ...roomData.scores };
  if (winningTeam === 'A') {
    newScores["1"] = (newScores["1"] || 0) + points;
    newScores["3"] = (newScores["3"] || 0) + points;
  } else {
    newScores["2"] = (newScores["2"] || 0) + points;
    newScores["4"] = (newScores["4"] || 0) + points;
  }

  const teamAScore = newScores["1"] + newScores["3"];
  const teamBScore = newScores["2"] + newScores["4"];

  let gameFinished = false;
  let finalMessage = `🎉 ¡${winner.nickname} vació su mano!<br>Equipo ${winningTeam} gana <strong>${points} puntos</strong> esta ronda.`;

  if (teamAScore >= roomData.max_points || teamBScore >= roomData.max_points) {
    gameFinished = true;
    const winningTeamName = teamAScore >= roomData.max_points ? 'A' : 'B';
    finalMessage += `<br><br><strong class="text-emerald-400 text-lg">¡PARTIDA TERMINADA!</strong><br>Equipo ${winningTeamName} gana la partida.`;
    await supabaseClient.from('rooms').update({
      status: 'FINISHED',
      scores: newScores,
      winner_seat: winnerSeat
    }).eq('id', currentRoomId);
  } else {
    await supabaseClient.from('rooms').update({
      status: 'ROUND_END',
      scores: newScores,
      winner_seat: winnerSeat
    }).eq('id', currentRoomId);
  }

  playSound('win');
  showNiceAlert(finalMessage, 8000);

  // Mostrar botón de siguiente ronda si es host
  if (isHost && !gameFinished) {
    setTimeout(() => {
      const btn = document.createElement('button');
      btn.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-10 py-3.5 rounded-3xl shadow-xl z-[90]';
      btn.innerHTML = '▶️ INICIAR SIGUIENTE RONDA';
      btn.onclick = startNextRound;
      document.body.appendChild(btn);
    }, 1200);
  }

  await fetchPlayers();
}

// =====================================================
// SIGUIENTE RONDA
// =====================================================
async function startNextRound() {
  // Quitar botón
  document.querySelectorAll('button').forEach(b => {
    if (b.innerText.includes('SIGUIENTE RONDA')) b.remove();
  });

  if (!isHost) return;

  // Repartir de nuevo
  let pool = [];
  for (let i = 0; i <= 6; i++) for (let j = i; j <= 6; j++) pool.push([i, j]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  let asientoConDobleSeis = 1;
  for (let i = 1; i <= 4; i++) {
    const player = playersList.find(p => p.seat_position === i);
    if (!player) continue;
    const hand = pool.splice(0, 7);
    if (hand.some(f => f[0] === 6 && f[1] === 6)) asientoConDobleSeis = i;
    await supabaseClient.from('players').update({ hand }).eq('id', player.id);
  }

  const { data: room } = await supabaseClient.from('rooms').select('round_number').eq('id', currentRoomId).single();

  await supabaseClient.from('rooms').update({
    status: 'PLAYING',
    current_turn_seat: asientoConDobleSeis,
    board: [],
    left_end: null,
    right_end: null,
    round_number: (room?.round_number || 1) + 1
  }).eq('id', currentRoomId);

  await fetchPlayers();
  showGameScreen();
  startTurnTimer();
  playBotTurnIfNeeded();
}

// =====================================================
// TIMER
// =====================================================
function startTurnTimer() {
  clearInterval(timerInterval);
  timeLeft = 60;
  const timerEl = document.getElementById('game-timer');
  const bar = document.getElementById('timer-bar');

  if (timerEl) timerEl.innerText = timeLeft;
  if (bar) {
    bar.style.width = '100%';
    bar.style.background = 'linear-gradient(to right, #10b981, #34d399)';
  }

  timerInterval = setInterval(async () => {
    timeLeft--;
    if (timerEl) timerEl.innerText = timeLeft;
    if (bar) {
      const pct = (timeLeft / 60) * 100;
      bar.style.width = `${pct}%`;
      if (timeLeft <= 15) bar.style.background = 'linear-gradient(to right, #f59e0b, #ef4444)';
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      const me = playersList.find(p => p.id === myId);
      if (me && currentTurnSeat === me.seat_position) {
        const next = obtenerSiguienteAsiento(me.seat_position);
        await supabaseClient.from('rooms').update({ current_turn_seat: next }).eq('id', currentRoomId);
        showNiceAlert("Se acabó el tiempo. Turno pasado automáticamente.");
      }
    }
  }, 1000);
}

// =====================================================
// BOTS (lógica simple para pruebas)
// =====================================================
async function playBotTurnIfNeeded() {
  // Por ahora solo pasa si es bot (puedes expandir con IA real)
  setTimeout(async () => {
    const currentPlayer = playersList.find(p => p.seat_position === currentTurnSeat);
    if (!currentPlayer || !currentPlayer.is_bot) return;

    // Lógica muy básica de bot: jugar primera ficha válida o pasar
    const room = await supabaseClient.from('rooms').select('*').eq('id', currentRoomId).single();
    if (!room.data || room.data.status !== 'PLAYING') return;

    const hand = currentPlayer.hand || [];
    let played = false;

    for (let i = 0; i < hand.length; i++) {
      const f = hand[i];
      const val = validatePlay(f, room.data.left_end, room.data.right_end);
      if (val.isValid) {
        const newHand = hand.filter((_, idx) => idx !== i);
        await supabaseClient.from('players').update({ hand: newHand }).eq('id', currentPlayer.id);

        const newBoard = [...(room.data.board || []), f];
        const nextSeat = obtenerSiguienteAsiento(currentPlayer.seat_position);

        await supabaseClient.from('rooms').update({
          board: newBoard,
          left_end: val.newLeft,
          right_end: val.newRight,
          current_turn_seat: newHand.length === 0 ? null : nextSeat
        }).eq('id', currentRoomId);

        played = true;
        break;
      }
    }

    if (!played) {
      const next = obtenerSiguienteAsiento(currentPlayer.seat_position);
      await supabaseClient.from('rooms').update({ current_turn_seat: next }).eq('id', currentRoomId);
    }

    await fetchPlayers();
  }, 1400);
}

// =====================================================
// REALTIME + FETCH ROOM
// =====================================================
async function listenToRoomChanges() {
  await fetchPlayers();

  // Escuchar cambios en jugadores
  supabaseClient
    .channel(`players-${currentRoomId}`)
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'players', 
      filter: `room_id=eq.${currentRoomId}` 
    }, fetchPlayers)
    .subscribe();

  // Escuchar cambios en la sala (tablero, turno, estado)
  supabaseClient
    .channel(`room-${currentRoomId}`)
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'rooms', 
      filter: `id=eq.${currentRoomId}` 
    }, async (payload) => {
      const newRoom = payload.new;
      roomStatus = newRoom.status;
      currentTurnSeat = newRoom.current_turn_seat;
      boardState = newRoom.board || [];
      currentLeftEnd = newRoom.left_end;
      currentRightEnd = newRoom.right_end;
      maxPoints = newRoom.max_points || 100;

      renderBoard();

      const me = playersList.find(p => p.id === myId);
      if (me && currentTurnSeat === me.seat_position && roomStatus === 'PLAYING') {
        playSound('turn');
      }

      if (newRoom.status === 'PLAYING' && screenGame.classList.contains('hidden')) {
        showGameScreen();
      }

      if (newRoom.status === 'ROUND_END' || newRoom.status === 'FINISHED') {
        clearInterval(timerInterval);
      }

      // Actualizar puntuación de equipos en tiempo real
      if (newRoom.scores) {
        const scoreA = (newRoom.scores["1"] || 0) + (newRoom.scores["3"] || 0);
        const scoreB = (newRoom.scores["2"] || 0) + (newRoom.scores["4"] || 0);
        const scoreAEl = document.getElementById('score-a');
        const scoreBEl = document.getElementById('score-b');
        if (scoreAEl) scoreAEl.innerText = scoreA;
        if (scoreBEl) scoreBEl.innerText = scoreB;
      }
    })
    .subscribe();
}

async function fetchRoomRules() {
  if (!currentRoomId) return;
  const { data } = await supabaseClient.from('rooms').select('*').eq('id', currentRoomId).single();
  if (!data) return;

  roomStatus = data.status;
  currentTurnSeat = data.current_turn_seat;
  boardState = data.board || [];
  currentLeftEnd = data.left_end;
  currentRightEnd = data.right_end;
  maxPoints = data.max_points || 100;

  renderBoard();

  if (data.status === 'PLAYING' && screenGame.classList.contains('hidden')) {
    showGameScreen();
  }
}

// =====================================================
// INICIALIZAR TODO
// =====================================================
// =====================================================
// FUNCIONES GLOBALES ADICIONALES
// =====================================================
window.showRulesModal = function() {
  const modal = document.getElementById('rules-modal');
  if (modal) modal.classList.remove('hidden');
};

console.log("%c[DOMINÓ VENEZOLANO] ✅ Juego cargado completamente. ¡Listo para jugar con amigos!", "color:#34d399");