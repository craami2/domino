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
let lastRoomSnapshot = null;
let isBotThinking = false;
let screenLogin, screenLobby, screenGame;

window.addEventListener('DOMContentLoaded', async () => {
  screenLogin = document.getElementById('screen-login');
  screenLobby = document.getElementById('screen-lobby');
  screenGame = document.getElementById('screen-game');

  createCustomAlertDOM();
  setupEventListeners();

  try {
    if (!window.supabase) {
      showNiceAlert("Error: la librería de Supabase no está cargada.");
      return;
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (err) {
    console.error(err);
    showNiceAlert("No se pudo inicializar Supabase.");
  }
});

function setupEventListeners() {
  const btnCreate = document.getElementById('btn-create-room');
  const btnJoin = document.getElementById('btn-join-room');
  const btnStart = document.getElementById('btn-start-game');

  if (btnCreate) btnCreate.onclick = (e) => { e.preventDefault(); createRoom(); };
  if (btnJoin) btnJoin.onclick = (e) => { e.preventDefault(); joinRoom(); };
  if (btnStart) btnStart.onclick = (e) => { e.preventDefault(); startGame(); };

  const dropZone = document.getElementById('drop-zone-mesa');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('bg-emerald-500/10', 'border-emerald-400');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('bg-emerald-500/10', 'border-emerald-400');
    });
    dropZone.addEventListener('drop', handleFichaDrop);
  }
}

function createCustomAlertDOM() {
  if (document.getElementById('custom-alert-bg')) return;
  const alertDiv = document.createElement('div');
  alertDiv.id = 'custom-alert-bg';
  alertDiv.className = 'hidden fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50';
  alertDiv.innerHTML = `
    <div class="bg-[#111827] border border-gray-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center">
      <div class="w-12 h-12 bg-indigo-950 text-indigo-400 border border-indigo-800 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">⚠️</div>
      <p id="custom-alert-text" class="text-sm text-gray-300 font-medium mb-5">Mensaje de error.</p>
      <button id="custom-alert-btn" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl text-sm cursor-pointer">Entendido</button>
    </div>
  `;
  document.body.appendChild(alertDiv);
  document.getElementById('custom-alert-btn').onclick = () => {
    document.getElementById('custom-alert-bg').classList.add('hidden');
  };
}

function showNiceAlert(message) {
  const txt = document.getElementById('custom-alert-text');
  const bg = document.getElementById('custom-alert-bg');
  if (txt && bg) {
    txt.innerText = message;
    bg.classList.remove('hidden');
  } else {
    alert(message);
  }
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function obtenerSiguienteAsiento(asientoActual) {
  let siguienteAsiento = asientoActual - 1;
  if (siguienteAsiento < 1) siguienteAsiento = 4;
  return siguienteAsiento;
}

function getDominoDotMap(value) {
  const maps = {
    0: [],
    1: [5],
    2: [3, 7],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
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
    return `<circle cx="${x}" cy="${y + offsetY}" r="7.5" fill="#111111"></circle>`;
  }).join('');

  return `
    <svg viewBox="0 0 100 200" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="1" width="98" height="198" rx="12" ry="12" fill="#ffffff" stroke="#111111" stroke-width="2"/>
      <line x1="12" y1="100" x2="88" y2="100" stroke="#111111" stroke-width="2"/>
      ${dotsMarkup(topDots, 0)}
      ${dotsMarkup(bottomDots, 100)}
    </svg>
  `;
}

function renderDominoTile(values, rotated = false, extraClass = "") {
  return `
    <div class="ficha-domino ${rotated ? 'ficha-rotada' : ''} ${extraClass}">
      ${createDominoSVG(values[0], values[1])}
    </div>
  `;
}

async function createRoom() {
  if (!supabaseClient) return showNiceAlert("Supabase no está listo.");
  const inputNick = document.getElementById('input-nickname');
  if (!inputNick) return;
  const nicknameInput = inputNick.value.trim();
  if (!nicknameInput) return showNiceAlert("Por favor escribe un nickname.");

  myNickname = nicknameInput;
  isHost = true;
  currentRoomCode = generateRoomCode();

  try {
    const { data: roomData, error: roomError } = await supabaseClient
      .from('rooms')
      .insert([{ room_code: currentRoomCode, max_points: maxPoints, current_turn_seat: 1, status: 'LOBBY' }])
      .select()
      .single();

    if (roomError) return showNiceAlert("Error creando sala: " + roomError.message);
    currentRoomId = roomData.id;

    const { data: playerData, error: playerError } = await supabaseClient
      .from('players')
      .insert([{ room_id: currentRoomId, nickname: myNickname, seat_position: 1, is_host: true, hand: [] }])
      .select()
      .single();

    if (playerError) return showNiceAlert("Error registrando jugador: " + playerError.message);

    myId = playerData.id;
    showLobbyScreen();
    listenToPlayersChanges();
  } catch (err) {
    console.error(err);
    showNiceAlert("Error creando sala.");
  }
}

async function joinRoom() {
  if (!supabaseClient) return showNiceAlert("Supabase no está listo.");
  const inputNick = document.getElementById('input-nickname');
  const inputCode = document.getElementById('input-room-code');
  if (!inputNick || !inputCode) return;

  const nicknameInput = inputNick.value.trim();
  const codeInput = inputCode.value.trim().toUpperCase();

  if (!nicknameInput) return showNiceAlert("Escribe tu nickname.");
  if (!codeInput) return showNiceAlert("Escribe el código de la sala.");

  myNickname = nicknameInput;

  try {
    const { data: roomData, error: roomError } = await supabaseClient
      .from('rooms')
      .select('*')
      .eq('room_code', codeInput)
      .single();

    if (roomError || !roomData) return showNiceAlert("No se encontró una sala con ese código.");
    if (roomData.status === 'PLAYING') return showNiceAlert("La partida ya comenzó.");

    currentRoomId = roomData.id;
    currentRoomCode = codeInput;

    const { data: existingPlayers, error: playersErr } = await supabaseClient
      .from('players')
      .select('seat_position')
      .eq('room_id', currentRoomId);

    if (playersErr) return showNiceAlert("Error leyendo jugadores.");
    if (existingPlayers.length >= 4) return showNiceAlert("La sala ya está llena.");

    const takenSeats = existingPlayers.map(p => p.seat_position);
    let assignedSeat = 1;
    for (let i = 1; i <= 4; i++) {
      if (!takenSeats.includes(i)) {
        assignedSeat = i;
        break;
      }
    }

    const { data: playerData, error: playerError } = await supabaseClient
      .from('players')
      .insert([{ room_id: currentRoomId, nickname: myNickname, seat_position: assignedSeat, is_host: false, hand: [] }])
      .select()
      .single();

    if (playerError) return showNiceAlert("Error al unirte: " + playerError.message);

    myId = playerData.id;
    isHost = false;
    showLobbyScreen();
    listenToPlayersChanges();
  } catch (err) {
    console.error(err);
    showNiceAlert("Error al unirte a la sala.");
  }
}

function showLobbyScreen() {
  if (screenLogin) screenLogin.classList.add('hidden');
  if (screenGame) screenGame.classList.add('hidden');
  if (screenLobby) screenLobby.classList.remove('hidden');

  const codeDisplay = document.getElementById('display-room-code');
  if (codeDisplay) codeDisplay.innerText = currentRoomCode;

  const hostSettings = document.getElementById('host-settings');
  const startGameBtn = document.getElementById('btn-start-game');

  if (isHost) {
    injectBotButton();
    if (startGameBtn) startGameBtn.style.setProperty('display', 'block', 'important');
    if (hostSettings) hostSettings.style.setProperty('display', 'block', 'important');

    const selectPoints = document.getElementById('select-max-points');
    if (selectPoints) {
      selectPoints.onchange = updateRoomRules;
      selectPoints.value = maxPoints;
    }
  } else {
    if (startGameBtn) startGameBtn.style.setProperty('display', 'none', 'important');
    if (hostSettings) hostSettings.style.setProperty('display', 'none', 'important');
    const botBtn = document.getElementById('btn-add-bots');
    if (botBtn) botBtn.style.setProperty('display', 'none', 'important');
  }
}

function injectBotButton() {
  if (document.getElementById('btn-add-bots')) return;
  const botBtn = document.createElement('button');
  botBtn.id = 'btn-add-bots';
  botBtn.className = "w-full mt-2 mb-2 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800 text-indigo-400 font-medium py-2 rounded-xl text-xs transition-colors cursor-pointer";
  botBtn.innerText = "🤖 Llenar mesa con 3 bots";
  botBtn.onclick = addSimulatedBots;
  const startBtn = document.getElementById('btn-start-game');
  if (startBtn && startBtn.parentNode) startBtn.parentNode.appendChild(botBtn);
}

async function addSimulatedBots() {
  if (playersList.length >= 4) return showNiceAlert("La mesa ya está llena.");
  const botNames = ["Bot Pancho 🇻🇪", "Bot Chuo 🤖", "Bot Catire 🤖"];
  const seatsToFill = [];
  const takenSeats = playersList.map(p => p.seat_position);
  let nameIndex = 0;

  for (let i = 1; i <= 4; i++) {
    if (!takenSeats.includes(i)) {
      seatsToFill.push({ room_id: currentRoomId, nickname: botNames[nameIndex] || `Bot ${i}`, seat_position: i, is_host: false, hand: [] });
      nameIndex++;
    }
  }

  if (seatsToFill.length > 0) {
    await supabaseClient.from('players').insert(seatsToFill);
    await fetchPlayers();
  }
}

async function updateRoomRules(e) {
  maxPoints = parseInt(e.target.value);
  await supabaseClient.from('rooms').update({ max_points: maxPoints }).eq('id', currentRoomId);
}

async function fetchRoomRules() {
  const { data, error } = await supabaseClient
    .from('rooms')
    .select('max_points, current_turn_seat, status, winner_seat')
    .eq('id', currentRoomId)
    .single();

  if (!error && data) {
    maxPoints = data.max_points;
    currentTurnSeat = data.current_turn_seat;
    roomStatus = data.status;
    lastRoomSnapshot = data;

    const ruleBadge = document.getElementById('text-max-points');
    if (ruleBadge) ruleBadge.innerText = `${maxPoints} pts`;

    if (isHost && document.getElementById('select-max-points')) {
      document.getElementById('select-max-points').value = maxPoints;
    }

    const jugadorActual = playersList.find(p => p.seat_position === currentTurnSeat);
    const turnDisplay = document.getElementById('current-turn-player');
    if (turnDisplay) {
      turnDisplay.innerText = jugadorActual
        ? (jugadorActual.id === myId ? "¡Tu turno! 🫵" : `${jugadorActual.nickname} (Asiento ${currentTurnSeat})`)
        : "Calculando...";
    }
  }
}

async function startGame() {
  if (playersList.length < 4) return showNiceAlert("Necesitas 4 jugadores para iniciar.");
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

  await supabaseClient.from('rooms').update({ status: 'PLAYING', current_turn_seat: asientoConDobleSeis }).eq('id', currentRoomId);
  await fetchPlayers();
}

function showGameScreen() {
  clearInterval(timerInterval);
  if (screenLobby) screenLobby.classList.add('hidden');
  if (screenLogin) screenLogin.classList.add('hidden');
  if (screenGame) screenGame.classList.remove('hidden');
  const gameCode = document.getElementById('game-display-code');
  if (gameCode) gameCode.innerText = currentRoomCode;
  renderTableLayout();
  startTurnTimer();
}

function renderTableLayout() {
  const me = playersList.find(p => p.id === myId);
  if (!me) return;

  const myNameDisp = document.getElementById('my-name-display');
  if (myNameDisp) myNameDisp.innerText = `Tu Mano: ${me.nickname} (Asiento ${me.seat_position})`;

  const posLeft = (me.seat_position % 4) + 1;
  const posFacing = ((me.seat_position + 1) % 4) + 1;
  const posRight = ((me.seat_position + 2) % 4) + 1;

  const playerLeft = playersList.find(p => p.seat_position === posLeft);
  const playerFacing = playersList.find(p => p.seat_position === posFacing);
  const playerRight = playersList.find(p => p.seat_position === posRight);

  const n2 = document.getElementById('name-player-2');
  const n3 = document.getElementById('name-player-3');
  const n4 = document.getElementById('name-player-4');

  if (n2) n2.innerText = playerLeft ? `${playerLeft.nickname}` : "Puesto Vacío";
  if (n3) n3.innerText = playerFacing ? `${playerFacing.nickname} (Pareja)` : "Pareja Vacía";
  if (n4) n4.innerText = playerRight ? `${playerRight.nickname}` : "Puesto Vacío";

  renderOpaqueOpponentHand('hand-player-2', playerLeft?.hand?.length || (playerLeft ? 7 : 0), 'vertical');
  renderOpaqueOpponentHand('hand-player-3', playerFacing?.hand?.length || (playerFacing ? 7 : 0), 'horizontal');
  renderOpaqueOpponentHand('hand-player-4', playerRight?.hand?.length || (playerRight ? 7 : 0), 'vertical');

  renderMyHandPremium(me);
}

function renderOpaqueOpponentHand(containerId, count, orientation) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const closed = document.createElement('div');
    closed.className = orientation === 'vertical' ? "ficha-domino" : "ficha-domino";
    closed.innerHTML = createDominoSVG(0, 0);
    container.appendChild(closed);
  }
}

function getDominoDotMap(value) {
  const maps = {
    0: [],
    1: [5],
    2: [3, 7],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
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
    return `<circle cx="${x}" cy="${y + offsetY}" r="7.5" fill="#111111"></circle>`;
  }).join('');

  return `
    <svg viewBox="0 0 100 200" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="1" width="98" height="198" rx="12" ry="12" fill="#ffffff" stroke="#111111" stroke-width="2"/>
      <line x1="12" y1="100" x2="88" y2="100" stroke="#111111" stroke-width="2"/>
      ${dotsMarkup(topDots, 0)}
      ${dotsMarkup(bottomDots, 100)}
    </svg>
  `;
}

function renderMyHandPremium(myData) {
  const handContainer = document.getElementById('my-hand');
  if (!handContainer || !myData || !Array.isArray(myData.hand)) return;
  handContainer.innerHTML = "";

  myData.hand.forEach((ficha, index) => {
    if (handRotations[index] === undefined) handRotations[index] = 0;
    const currentRotation = handRotations[index];

    const fichaDiv = document.createElement('div');
    fichaDiv.setAttribute('draggable', 'true');
    fichaDiv.className = "ficha-domino";
    if (currentRotation === 180) fichaDiv.classList.add('ficha-rotada');
    fichaDiv.innerHTML = createDominoSVG(ficha[0], ficha[1]);

    fichaDiv.onclick = (e) => {
      e.stopPropagation();
      handRotations[index] = handRotations[index] === 0 ? 180 : 0;
      renderMyHandPremium(myData);
    };

    fichaDiv.addEventListener('dragstart', (e) => {
      fichaDiv.classList.add('opacity-40');
      e.dataTransfer.setData('text/plain', JSON.stringify({ index, values: ficha, rotation: currentRotation }));
    });

    fichaDiv.addEventListener('dragend', () => {
      fichaDiv.classList.remove('opacity-40');
    });

    handContainer.appendChild(fichaDiv);
  });
}

async function handleFichaDrop(e) {
  e.preventDefault();
  const dropZone = document.getElementById('drop-zone-mesa');
  if (!dropZone) return;
  dropZone.classList.remove('bg-emerald-500/10', 'border-emerald-400');

  const me = playersList.find(p => p.id === myId);
  if (!me || !Array.isArray(me.hand)) return;

  const { data: currentRoom, error: roomErr } = await supabaseClient
    .from('rooms')
    .select('current_turn_seat, status')
    .eq('id', currentRoomId)
    .single();

  if (roomErr || !currentRoom) return showNiceAlert("No se pudo leer la sala.");
  if (currentRoom.status !== 'PLAYING') return showNiceAlert("La partida no ha comenzado.");
  if (currentRoom.current_turn_seat !== me.seat_position) return showNiceAlert("¡No es tu turno!");

  try {
    const dataString = e.dataTransfer.getData('text/plain');
    if (!dataString) return;
    const data = JSON.parse(dataString);

    const placeholder = document.getElementById('placeholder-mesa');
    if (placeholder) placeholder.classList.add('hidden');

    const playedCard = document.createElement('div');
    playedCard.className = "ficha-domino";
    if (data.rotation === 180) playedCard.classList.add('ficha-rotada');
    playedCard.innerHTML = createDominoSVG(data.values[0], data.values[1]);
    dropZone.appendChild(playedCard);

    const updatedHand = me.hand.filter((_, idx) => idx !== data.index);
    await supabaseClient.from('players').update({ hand: updatedHand }).eq('id', myId);

    const siguienteAsiento = obtenerSiguienteAsiento(me.seat_position);
    await supabaseClient.from('rooms').update({ current_turn_seat: siguienteAsiento }).eq('id', currentRoomId);

    handRotations = {};

    if (updatedHand.length === 0) {
      await supabaseClient.from('rooms').update({ status: 'FINISHED', winner_seat: me.seat_position }).eq('id', currentRoomId);
      clearInterval(timerInterval);
      showNiceAlert(`🎉 ¡${me.nickname} ganó la partida!`);
      await fetchPlayers();
      return;
    }

    await fetchPlayers();
    renderTableLayout();
    startTurnTimer();
  } catch (err) {
    console.error(err);
    showNiceAlert("Error al jugar la ficha.");
  }
}

function getPlayableBotMove(bot) {
  if (!bot || !Array.isArray(bot.hand)) return null;
  const idx = Math.floor(Math.random() * bot.hand.length);
  return { index: idx, values: bot.hand[idx], rotation: 0 };
}

async function playBotTurnIfNeeded() {
  if (isBotThinking) return;
  if (roomStatus !== 'PLAYING') return;

  const currentPlayer = playersList.find(p => p.seat_position === currentTurnSeat);
  if (!currentPlayer) return;

  const isBot = currentPlayer.nickname.toLowerCase().includes('bot');
  if (!isBot) return;

  isBotThinking = true;
  setTimeout(async () => {
    try {
      await fetchPlayers();
      const bot = playersList.find(p => p.id === currentPlayer.id);
      if (!bot || !Array.isArray(bot.hand) || bot.hand.length === 0) {
        const nextSeat = obtenerSiguienteAsiento(bot?.seat_position || currentTurnSeat);
        await supabaseClient.from('rooms').update({ current_turn_seat: nextSeat }).eq('id', currentRoomId);
        isBotThinking = false;
        return;
      }

      const move = getPlayableBotMove(bot);
      if (!move) {
        isBotThinking = false;
        return;
      }

      const updatedHand = bot.hand.filter((_, idx) => idx !== move.index);
      await supabaseClient.from('players').update({ hand: updatedHand }).eq('id', bot.id);

      const mesa = document.getElementById('drop-zone-mesa');
      const placeholder = document.getElementById('placeholder-mesa');
      if (placeholder) placeholder.classList.add('hidden');
      if (mesa) {
        const playedCard = document.createElement('div');
        playedCard.className = "ficha-domino";
        playedCard.innerHTML = createDominoSVG(move.values[0], move.values[1]);
        mesa.appendChild(playedCard);
      }

      if (updatedHand.length === 0) {
        await supabaseClient.from('rooms').update({ status: 'FINISHED', winner_seat: bot.seat_position }).eq('id', currentRoomId);
        clearInterval(timerInterval);
        showNiceAlert(`🏆 Ganó ${bot.nickname}`);
        isBotThinking = false;
        return;
      }

      const nextSeat = obtenerSiguienteAsiento(bot.seat_position);
      await supabaseClient.from('rooms').update({ current_turn_seat: nextSeat }).eq('id', currentRoomId);
      await fetchPlayers();
      renderTableLayout();
      startTurnTimer();
    } catch (err) {
      console.error(err);
    } finally {
      isBotThinking = false;
    }
  }, 700);
}

function listenToPlayersChanges() {
  fetchPlayers();
  fetchRoomRules();

  supabaseClient
    .channel(`room-${currentRoomId}`)
    .on('postgres_changes', {
      event: '*',
      filter: `room_id=eq.${currentRoomId}`,
      schema: 'public',
      table: 'players'
    }, () => {
      fetchPlayers();
    })
    .subscribe();

  supabaseClient
    .channel(`room-rules-${currentRoomId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      filter: `id=eq.${currentRoomId}`,
      schema: 'public',
      table: 'rooms'
    }, (payload) => {
      fetchRoomRules();

      if (payload.new && payload.new.status === 'PLAYING') {
        fetchPlayers().then(() => {
          showGameScreen();
          playBotTurnIfNeeded();
        });
      }

      if (payload.new && payload.new.status === 'FINISHED') {
        clearInterval(timerInterval);
        const winner = playersList.find(p => p.seat_position === payload.new.winner_seat);
        showNiceAlert(`🏆 Partida terminada. Ganador: ${winner?.nickname || 'Desconocido'}`);
      }
    })
    .subscribe();
}

async function fetchPlayers() {
  const { data, error } = await supabaseClient
    .from('players')
    .select('*')
    .eq('room_id', currentRoomId)
    .order('seat_position', { ascending: true });

  if (!error && data) {
    playersList = data;
    renderLobbyPlayers();
    if (screenGame && !screenGame.classList.contains('hidden')) {
      renderTableLayout();
      playBotTurnIfNeeded();
    }
  }
}

function renderLobbyPlayers() {
  const container = document.getElementById('lobby-players-list');
  if (!container) return;
  container.innerHTML = "";

  for (let i = 1; i <= 4; i++) {
    const playerInSeat = playersList.find(p => p.seat_position === i);
    const teamName = (i === 1 || i === 3) ? "Pareja A" : "Pareja B";
    const teamBadgeColor = (i === 1 || i === 3)
      ? "bg-blue-900/30 text-blue-400 border-blue-800"
      : "bg-purple-900/30 text-purple-400 border-purple-800";

    const slotDiv = document.createElement('div');
    slotDiv.className = "player-slot flex items-center justify-between p-3 bg-[#1f2937] border border-gray-800 rounded-xl";

    if (playerInSeat) {
      const handCount = Array.isArray(playerInSeat.hand) ? playerInSeat.hand.length : 0;
      const actionButtons = isHost ? `
        <div class="flex space-x-1">
          <button onclick="movePlayer('${playerInSeat.id}', ${i}, -1)" class="p-1 text-gray-400 hover:text-white bg-gray-800 rounded">▲</button>
          <button onclick="movePlayer('${playerInSeat.id}', ${i}, 1)" class="p-1 text-gray-400 hover:text-white bg-gray-800 rounded font-bold">▼</button>
        </div>
      ` : "";

      slotDiv.innerHTML = `
        <div class="flex items-center space-x-3 flex-wrap">
          <span class="w-6 h-6 flex items-center justify-center bg-gray-700 text-xs font-bold rounded-full">${i}</span>
          <span class="font-medium ${playerInSeat.id === myId ? 'text-indigo-400 font-bold' : 'text-white'}">${playerInSeat.nickname} ${playerInSeat.is_host ? '👑' : ''}</span>
          <span class="text-[10px] border px-2 py-0.5 rounded-md font-semibold tracking-wider ${teamBadgeColor}">${teamName}</span>
          <span class="player-count">${handCount} fichas</span>
        </div>
        ${actionButtons}
      `;
    } else {
      slotDiv.innerHTML = `
        <div class="flex items-center space-x-3 text-gray-600 italic">
          <span class="w-6 h-6 flex items-center justify-center bg-gray-900 text-xs rounded-full">${i}</span>
          <span class="text-xs">Puesto vacío</span>
        </div>
      `;
    }

    container.appendChild(slotDiv);
  }
}

async function movePlayer(playerId, currentSeat, direction) {
  let targetSeat = currentSeat + direction;
  if (targetSeat < 1) targetSeat = 4;
  if (targetSeat > 4) targetSeat = 1;

  const playerInTarget = playersList.find(p => p.seat_position === targetSeat);

  if (playerInTarget) {
    await supabaseClient.from('players').update({ seat_position: 0 }).eq('id', playerInTarget.id);
    await supabaseClient.from('players').update({ seat_position: targetSeat }).eq('id', playerId);
    await supabaseClient.from('players').update({ seat_position: currentSeat }).eq('id', playerInTarget.id);
  } else {
    await supabaseClient.from('players').update({ seat_position: targetSeat }).eq('id', playerId);
  }
}
window.movePlayer = movePlayer;

function startTurnTimer() {
  timeLeft = 60;
  const timerText = document.getElementById('game-timer');
  if (timerText) timerText.innerText = timeLeft;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    const tText = document.getElementById('game-timer');
    const tBar = document.getElementById('timer-bar');

    if (tText) tText.innerText = timeLeft;
    if (tBar) tBar.style.width = `${(timeLeft / 60) * 100}%`;

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      handleTimeout();
    }
  }, 1000);
}

function handleTimeout() {
  showNiceAlert("⏰ ¡Tiempo agotado!");
  const me = playersList.find(p => p.id === myId);
  if (me && currentTurnSeat === me.seat_position) {
    const nextSeat = obtenerSiguienteAsiento(me.seat_position);
    supabaseClient.from('rooms').update({ current_turn_seat: nextSeat }).eq('id', currentRoomId);
  }
}