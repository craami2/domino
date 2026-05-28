// CONEXIÓN MAESTRA A SUPABASE
const SUPABASE_URL = "https://cybkunnrqwilfzzyvrug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5Ymt1bm5ycXdpbGZ6enl2cnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODA5OTUsImV4cCI6MjA5NTU1Njk5NX0.nWdOVfjb_amwsvf0Fih-zpL8Ivc8zCijbNmRTwgoo-k";

let supabaseClient = null;

// ESTADO GLOBAL DEL JUEGO
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

// ELEMENTOS DE LA INTERFAZ
let screenLogin, screenLobby, screenGame;

// INICIALIZACIÓN SEGURA
window.addEventListener('DOMContentLoaded', async () => {
  console.log("DOM completamente cargado. Inicializando componentes...");
  
  screenLogin = document.getElementById('screen-login');
  screenLobby = document.getElementById('screen-lobby');
  screenGame = document.getElementById('screen-game');

  // Verificar y crear cliente Supabase
  if (window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data, error } = await supabaseClient.from('rooms').select('id').limit(1);
      if (error) throw error;
      console.log("✓ Supabase conectado exitosamente.");
    } catch (err) {
      console.error("❌ Error al conectar Supabase:", err);
      showNiceAlert("Error de conexión con Supabase. Recarga la página.");
      return;
    }
  } else {
    console.error("❌ Error crítico: La librería de Supabase no está cargada.");
    alert("Error: No se cargó la librería Supabase. Revisa las etiquetas <script> en el HTML.");
    return;
  }

  setupEventListeners();
  createCustomAlertDOM();
});

// ESCUCHADORES DE ACCIONES
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

// ALERTAS PERSONALIZADAS
function createCustomAlertDOM() {
  if (document.getElementById('custom-alert-bg')) return;
  const alertDiv = document.createElement('div');
  alertDiv.id = 'custom-alert-bg';
  alertDiv.className = 'hidden fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50';
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

function obtenerHtmlMitadPuntos(valor) {
  let html = `<div class="mitad-puntos p${valor}">`;
  for (let i = 1; i <= 9; i++) {
    html += `<span class="punto pt-${i}"></span>`;
  }
  html += `</div>`;
  return html;
}

function obtenerSiguienteAsiento(siguiente) {
  // Sentido ANTIHORARIO en dominó venezolano: 1 → 4 → 3 → 2 → 1
  let siguienteAsiento = siguiente - 1;
  if (siguienteAsiento < 1) siguienteAsiento = 4;
  return siguienteAsiento;
}

// CREAR SALA
async function createRoom() {
  console.log("🏠 Intentando crear sala...");
  const inputNick = document.getElementById('input-nickname');
  if (!inputNick) return console.error("No existe #input-nickname");

  const nicknameInput = inputNick.value.trim();
  if (!nicknameInput) return showNiceAlert("Por favor escribe un Nickname primero.");

  myNickname = nicknameInput;
  isHost = true;
  currentRoomCode = generateRoomCode();

  try {
    const { data: roomData, error: roomError } = await supabaseClient
      .from('rooms')
      .insert([{ room_code: currentRoomCode, max_points: maxPoints, current_turn_seat: 1, status: 'LOBBY' }])
      .select()
      .single();

    if (roomError) return showNiceAlert("Error al crear sala: " + roomError.message);
    currentRoomId = roomData.id;

    const { data: playerData, error: playerError } = await supabaseClient
      .from('players')
      .insert([{ room_id: currentRoomId, nickname: myNickname, seat_position: 1, is_host: true, hand: [] }])
      .select()
      .single();

    if (playerError) return showNiceAlert("Error al registrar jugador: " + playerError.message);
    
    myId = playerData.id;
    showLobbyScreen();
    listenToPlayersChanges();
  } catch (err) {
    console.error("Error en createRoom:", err);
    showNiceAlert("Error crítico: " + err.message);
  }
}

// UNIRSE A SALA
async function joinRoom() {
  console.log("🔗 Intentando unirse a sala...");
  const nicknameInput = document.getElementById('input-nickname').value.trim();
  const codeInput = document.getElementById('input-room-code').value.trim().toUpperCase();

  if (!nicknameInput) return showNiceAlert("Escribe tu Nickname primero.");
  if (!codeInput) return showNiceAlert("Coloca el código de la sala.");

  myNickname = nicknameInput;

  try {
    const { data: roomData, error: roomError } = await supabaseClient
      .from('rooms')
      .select('*')
      .eq('room_code', codeInput)
      .single();

    if (roomError || !roomData) return showNiceAlert("No se encontró sala con ese código.");
    if (roomData.status === 'PLAYING') return showNiceAlert("La partida ya empezó. Espera la siguiente.");

    currentRoomId = roomData.id;
    currentRoomCode = codeInput;

    const { data: existingPlayers } = await supabaseClient
      .from('players')
      .select('seat_position')
      .eq('room_id', currentRoomId);

    if (existingPlayers.length >= 4) return showNiceAlert("La sala está llena (máx 4 jugadores).");

    const takenSeats = existingPlayers.map(p => p.seat_position);
    let assignedSeat = 1;
    for (let i = 1; i <= 4; i++) {
      if (!takenSeats.includes(i)) { assignedSeat = i; break; }
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
    console.error("Error en joinRoom:", err);
    showNiceAlert("Error crítico: " + err.message);
  }
}

function showLobbyScreen() {
  if (screenLogin) screenLogin.classList.add('hidden');
  if (screenLobby) screenLobby.classList.remove('hidden');
  
  const codeDisplay = document.getElementById('display-room-code');
  if (codeDisplay) codeDisplay.innerText = currentRoomCode;
  
  const hostSettings = document.getElementById('host-settings');
  const startGameBtn = document.getElementById('btn-start-game');

  if (isHost) {
    injectBotButton();
    const botBtn = document.getElementById('btn-add-bots');
    if (startGameBtn) startGameBtn.style.setProperty('display', 'block', 'important');
    if (botBtn) botBtn.style.setProperty('display', 'block', 'important');
    if (hostSettings) hostSettings.style.setProperty('display', 'block', 'important');
    
    const selectPoints = document.getElementById('select-max-points');
    if (selectPoints) selectPoints.onchange = updateRoomRules;
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
  botBtn.innerText = "🤖 Llenar Mesa con 3 Bots (Modo Prueba)";
  botBtn.onclick = addSimulatedBots;
  const startBtn = document.getElementById('btn-start-game');
  if (startBtn && startBtn.parentNode) startBtn.parentNode.appendChild(botBtn);
}

async function addSimulatedBots() {
  if (playersList.length >= 4) return showNiceAlert("La mesa ya tiene 4 jugadores.");
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
  if (seatsToFill.length > 0) await supabaseClient.from('players').insert(seatsToFill);
}

async function updateRoomRules(e) {
  const selectedPoints = parseInt(e.target.value);
  await supabaseClient.from('rooms').update({ max_points: selectedPoints }).eq('id', currentRoomId);
}

async function fetchRoomRules() {
  const { data, error } = await supabaseClient.from('rooms').select('max_points, current_turn_seat, status').eq('id', currentRoomId).single();
  if (!error && data) {
    maxPoints = data.max_points;
    const ruleBadge = document.getElementById('text-max-points');
    if (ruleBadge) ruleBadge.innerText = `${maxPoints} pts`;
    if (isHost && document.getElementById('select-max-points')) {
      document.getElementById('select-max-points').value = maxPoints;
    }
    const jugadorActual = playersList.find(p => p.seat_position === data.current_turn_seat);
    const turnDisplay = document.getElementById('current-turn-player');
    if (turnDisplay) {
      if (jugadorActual) {
        turnDisplay.innerText = jugadorActual.id === myId ? "¡Tu Turno! 🫵" : `${jugadorActual.nickname} (Asiento ${data.current_turn_seat})`;
      } else {
        turnDisplay.innerText = "Calculando...";
      }
    }
  }
}

// COMENZAR PARTIDA
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
    const tieneDobleSeis = hand.some(f => f[0] === 6 && f[1] === 6);
    if (tieneDobleSeis) asientoConDobleSeis = i;
    await supabaseClient.from('players').update({ hand }).eq('id', player.id);
  }

  await supabaseClient.from('rooms').update({ status: 'PLAYING', current_turn_seat: asientoConDobleSeis }).eq('id', currentRoomId);
}

function showGameScreen() {
  clearInterval(timerInterval);
  if (screenLobby) screenLobby.classList.add('hidden');
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

  if (n2) n2.innerText = playerLeft ? `${playerLeft.nickname}` : "Vacío";
  if (n3) n3.innerText = playerFacing ? `${playerFacing.nickname} (Pareja)` : "Vacío";
  if (n4) n4.innerText = playerRight ? `${playerRight.nickname}` : "Vacío";

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
    const closedCard = document.createElement('div');
    if (orientation === 'vertical') {
      closedCard.className = "w-7 h-4 bg-gradient-to-b from-[#1e293b] to-[#0f172a] border border-slate-700/60 rounded-sm shadow-sm flex items-center justify-center text-[5px] text-slate-600/40";
      closedCard.innerText = "■";
    } else {
      closedCard.className = "w-4 h-7 bg-gradient-to-b from-[#1e293b] to-[#0f172a] border border-slate-700/60 rounded-sm shadow-sm flex items-center justify-center text-[5px] text-slate-600/40";
      closedCard.innerText = "■";
    }
    container.appendChild(closedCard);
  }
}

function renderMyHandPremium(myData) {
  const handContainer = document.getElementById('my-hand');
  if (!handContainer || !myData || !myData.hand) return;
  handContainer.innerHTML = "";

  myData.hand.forEach((ficha, index) => {
    if (handRotations[index] === undefined) handRotations[index] = 0;
    const currentRotation = handRotations[index];
    const fichaDiv = document.createElement('div');
    fichaDiv.setAttribute('draggable', 'true');
    fichaDiv.className = "ficha-domino !w-[68px] !h-[124px] transform origin-center";
    fichaDiv.style.transform = currentRotation === 0 ? `rotate(0deg)` : `rotate(${currentRotation}deg)`;
    if (currentRotation === 0) fichaDiv.classList.add('hover:-translate-y-4');
    else fichaDiv.classList.add('hover:scale-105');

    fichaDiv.innerHTML = `${obtenerHtmlMitadPuntos(ficha[0])}<div class="linea-central"></div>${obtenerHtmlMitadPuntos(ficha[1])}`;

    fichaDiv.onclick = (e) => {
      e.stopPropagation();
      handRotations[index] = handRotations[index] === 0 ? 90 : 0;
      renderMyHandPremium(myData);
    };

    fichaDiv.addEventListener('dragstart', (e) => {
      fichaDiv.classList.add('opacity-40');
      e.dataTransfer.setData('text/plain', JSON.stringify({ index, values: ficha, rotation: currentRotation }));
    });

    fichaDiv.addEventListener('dragend', () => fichaDiv.classList.remove('opacity-40'));
    handContainer.appendChild(fichaDiv);
  });
}

async function handleFichaDrop(e) {
  e.preventDefault();
  const dropZone = document.getElementById('drop-zone-mesa');
  if (!dropZone) return;
  dropZone.classList.remove('bg-emerald-500/10', 'border-emerald-400');

  const { data: currentRoom } = await supabaseClient.from('rooms').select('current_turn_seat, status').eq('id', currentRoomId).single();
  const me = playersList.find(p => p.id === myId);

  if (!me || !currentRoom) return showNiceAlert("Error de conexión.");
  if (currentRoom.status !== 'PLAYING') return showNiceAlert("La partida aún no empieza.");
  if (currentRoom.current_turn_seat !== me.seat_position) return showNiceAlert("¡No es tu turno! Espera tu vez.");

  try {
    const dataString = e.dataTransfer.getData('text/plain');
    if (!dataString) return;
    const data = JSON.parse(dataString);
    const placeholder = document.getElementById('placeholder-mesa');
    if (placeholder) placeholder.classList.add('hidden');

    const playedCard = document.createElement('div');
    playedCard.className = "ficha-domino shadow-md !w-[54px] !h-[98px] transform origin-center m-1";
    playedCard.style.transform = `rotate(${data.rotation}deg)`;
    playedCard.innerHTML = `${obtenerHtmlMitadPuntos(data.values[0])}<div class="linea-central"></div>${obtenerHtmlMitadPuntos(data.values[1])}`;
    dropZone.appendChild(playedCard);

    const updatedHand = me.hand.filter((_, idx) => idx !== data.index);
    await supabaseClient.from('players').update({ hand: updatedHand }).eq('id', myId);

    const siguienteAsiento = obtenerSiguienteAsiento(me.seat_position);
    await supabaseClient.from('rooms').update({ current_turn_seat: siguienteAsiento }).eq('id', currentRoomId);

    // Verificar victoria
    if (updatedHand.length === 0) {
      await supabaseClient.from('rooms').update({ status: 'FINISHED', winner_seat: me.seat_position }).eq('id', currentRoomId);
      showNiceAlert(`🎉 ¡${me.nickname} GANÓ LA PARTIDA! 🎉`);
      clearInterval(timerInterval);
      return;
    }

    startTurnTimer();
  } catch (err) {
    console.error("Error en drop:", err);
    showNiceAlert("Error al jugar: " + err.message);
  }
}

function listenToPlayersChanges() {
  fetchPlayers();
  fetchRoomRules();

  supabaseClient.channel(`room-${currentRoomId}`)
    .on('postgres_changes', { event: '*', filter: `room_id=eq.${currentRoomId}`, schema: 'public', table: 'players' }, () => fetchPlayers())
    .subscribe();

  supabaseClient.channel(`room-rules-${currentRoomId}`)
    .on('postgres_changes', { event: 'UPDATE', filter: `id=eq.${currentRoomId}`, schema: 'public', table: 'rooms' }, (payload) => {
      fetchRoomRules();
      if (payload.new && payload.new.status === 'PLAYING') {
        fetchPlayers().then(() => showGameScreen());
      }
      if (payload.new && payload.new.status === 'FINISHED') {
        clearInterval(timerInterval);
        const winner = playersList.find(p => p.seat_position === payload.new.winner_seat);
        showNiceAlert(`🏆 ¡Partida terminada! Ganador: ${winner?.nickname || 'Desconocido'}`);
      }
    })
    .subscribe();
}

async function fetchPlayers() {
  const { data, error } = await supabaseClient.from('players').select('*').eq('room_id', currentRoomId).order('seat_position', { ascending: true });
  if (!error && data) {
    playersList = data;
    renderLobbyPlayers();
    if (screenGame && !screenGame.classList.contains('hidden')) renderTableLayout();
  }
}

function renderLobbyPlayers() {
  const container = document.getElementById('lobby-players-list');
  if (!container) return;
  container.innerHTML = "";

  for (let i = 1; i <= 4; i++) {
    const playerInSeat = playersList.find(p => p.seat_position === i);
    const teamName = (i === 1 || i === 3) ? "Pareja A" : "Pareja B";
    const teamBadgeColor = (i === 1 || i === 3) ? "bg-blue-900/30 text-blue-400 border-blue-800" : "bg-purple-900/30 text-purple-400 border-purple-800";

    const slotDiv = document.createElement('div');
    slotDiv.className = "player-slot flex items-center justify-between p-3 bg-[#1f2937] border border-gray-800 rounded-xl";

    if (playerInSeat) {
      let actionButtons = isHost ? `<div class="flex space-x-1"><button onclick="movePlayer('${playerInSeat.id}', ${i}, -1)" class="p-1 text-gray-400 hover:text-white bg-gray-800 rounded">▲</button><button onclick="movePlayer('${playerInSeat.id}', ${i}, 1)" class="p-1 text-gray-400 hover:text-white bg-gray-800 rounded font-bold">▼</button></div>` : "";
      slotDiv.innerHTML = `<div class="flex items-center space-x-3"><span class="w-6 h-6 flex items-center justify-center bg-gray-700 text-xs font-bold rounded-full">${i}</span><span class="font-medium ${playerInSeat.id === myId ? 'text-indigo-400 font-bold' : 'text-white'}">${playerInSeat.nickname} ${playerInSeat.is_host ? '👑' : ''}</span><span class="text-[10px] border px-2 py-0.5 rounded-md font-semibold tracking-wider ${teamBadgeColor}">${teamName}</span></div>${actionButtons}`;
    } else {
      slotDiv.innerHTML = `<div class="flex items-center space-x-3 text-gray-600 italic"><span class="w-6 h-6 flex items-center justify-center bg-gray-900 text-xs rounded-full">${i}</span><span class="text-xs">Puesto vacío</span></div>`;
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
  showNiceAlert("⏰ ¡Tiempo agotado! Tu turno fue pasado.");
  // Pasar turno automáticamente
  const me = playersList.find(p => p.id === myId);
  if (me) {
    const siguienteAsiento = obtenerSiguienteAsiento(me.seat_position);
    supabaseClient.from('rooms').update({ current_turn_seat: siguienteAsiento }).eq('id', currentRoomId);
  }
}