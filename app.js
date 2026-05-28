// CONEXIÓN MAESTRA A SUPABASE (Corregido el conflicto de nombres con el objeto de la librería)
const SUPABASE_URL = "https://cybkunnrqwilfzzyvrug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5Ymt1bm5ycXdpbGZ6enl2cnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODA5OTUsImV4cCI6MjA5NTU1Njk5NX0.nWdOVfjb_amwsvf0Fih-zpL8Ivc8zCijbNmRTwgoo-k";

// Invocamos el cliente de forma segura utilizando el objeto global cargado por el CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ESTADO GLOBAL DEL JUEGO
let myId = null;
let myNickname = "";
let currentRoomId = null;
let currentRoomCode = "";
let isHost = false;
let playersList = [];
let timerInterval = null;
let timeLeft = 60;

// REGLAS Y PARAMETROS DE LA PARTIDA (Dominó Venezolano)
let maxPoints = 100;
let boardLeftValue = null;  // Punta izquierda abierta en el tablero
let boardRightValue = null; // Punta derecha abierta en el tablero

// ELEMENTOS DE LA INTERFAZ (DOM)
const screenLogin = document.getElementById('screen-login');
const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');

// AL CARGAR LA PÁGINA
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  createCustomAlertDOM(); // Inyectar las alertas estéticas modernas
});

// ESCUCHADORES DE ACCIONES DEL USUARIO
function setupEventListeners() {
  // Botón Crear Sala
  document.getElementById('btn-create-room').addEventListener('click', createRoom);
  // Botón Unirse a Sala
  document.getElementById('btn-join-room').addEventListener('click', joinRoom);
}

// COMPONENTE: Alertas estéticas personalizadas en Tailwind (Adiós a los alerts nativos)
function createCustomAlertDOM() {
  if (document.getElementById('custom-alert-bg')) return;
  const alertDiv = document.createElement('div');
  alertDiv.id = 'custom-alert-bg';
  alertDiv.className = 'hidden fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity duration-300';
  alertDiv.innerHTML = `
    <div class="bg-[#111827] border border-gray-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center transform scale-95 transition-transform duration-300">
      <div class="w-12 h-12 bg-indigo-950 text-indigo-400 border border-indigo-800 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">⚠️</div>
      <p id="custom-alert-text" class="text-sm text-gray-300 font-medium mb-5">Mensaje de error aquí.</p>
      <button id="custom-alert-btn" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl text-sm transition-colors cursor-pointer">Entendido</button>
    </div>
  `;
  document.body.appendChild(alertDiv);
  document.getElementById('custom-alert-btn').addEventListener('click', () => {
    document.getElementById('custom-alert-bg').classList.add('hidden');
  });
}

function showNiceAlert(message) {
  document.getElementById('custom-alert-text').innerText = message;
  document.getElementById('custom-alert-bg').classList.remove('hidden');
}

// GENERAR CÓDIGO ALEATORIO PARA LA SALA (Ej: XZTWQA)
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ACCIÓN: CREAR UNA SALA NUEVA
async function createRoom() {
  const nicknameInput = document.getElementById('input-nickname').value.trim();
  if (!nicknameInput) return showNiceAlert("Por favor escribe un Nickname primero.");

  myNickname = nicknameInput;
  isHost = true;
  currentRoomCode = generateRoomCode();

  // 1. Guardar la sala en Supabase con los puntos por defecto
  const { data: roomData, error: roomError } = await supabaseClient
    .from('rooms')
    .insert([{ room_code: currentRoomCode, max_points: maxPoints }])
    .select()
    .single();

  if (roomError) return showNiceAlert("Error al crear sala: " + roomError.message);

  currentRoomId = roomData.id;

  // 2. Registrarse como el jugador 1 (Host de la mesa)
  const { data: playerData, error: playerError } = await supabaseClient
    .from('players')
    .insert([{
      room_id: currentRoomId,
      nickname: myNickname,
      seat_position: 1,
      is_host: true
    }])
    .select()
    .single();

  if (playerError) return showNiceAlert("Error al registrar jugador: " + playerError.message);
  
  myId = playerData.id;
  
  showLobbyScreen();
  listenToPlayersChanges();
}

// ACCIÓN: UNIRSE A UNA SALA EXISTENTE
async function joinRoom() {
  const nicknameInput = document.getElementById('input-nickname').value.trim();
  const codeInput = document.getElementById('input-room-code').value.trim().toUpperCase();

  if (!nicknameInput) return showNiceAlert("Por favor escribe tu Nickname para poder ingresar.");
  if (!codeInput) return showNiceAlert("Por favor coloca el código de la sala.");

  myNickname = nicknameInput;

  // 1. Buscar si la sala existe activa
  const { data: roomData, error: roomError } = await supabaseClient
    .from('rooms')
    .select('*')
    .eq('room_code', codeInput)
    .single();

  if (roomError || !roomData) return showNiceAlert("No se encontró ninguna sala activa con ese código.");

  currentRoomId = roomData.id;
  currentRoomCode = codeInput;

  // 2. Validar aforo y asignar asiento disponible (del 1 al 4)
  const { data: existingPlayers } = await supabaseClient
    .from('players')
    .select('seat_position')
    .eq('room_id', currentRoomId);

  if (existingPlayers.length >= 4) return showNiceAlert("La sala ya está llena (Máximo 4 jugadores).");

  const takenSeats = existingPlayers.map(p => p.seat_position);
  let assignedSeat = 1;
  for (let i = 1; i <= 4; i++) {
    if (!takenSeats.includes(i)) {
      assignedSeat = i;
      break;
    }
  }

  // 3. Insertar al nuevo integrante en la mesa
  const { data: playerData, error: playerError } = await supabaseClient
    .from('players')
    .insert([{
      room_id: currentRoomId,
      nickname: myNickname,
      seat_position: assignedSeat,
      is_host: false
    }])
    .select()
    .single();

  if (playerError) return showNiceAlert("Error al unirte: " + playerError.message);

  myId = playerData.id;
  isHost = false;

  showLobbyScreen();
  listenToPlayersChanges();
}

// MOSTRAR LA PANTALLA DEL LOBBY Y CONFIGURAR VISTAS
function showLobbyScreen() {
  screenLogin.classList.add('hidden');
  screenLobby.classList.remove('hidden');
  document.getElementById('display-room-code').innerText = currentRoomCode;
  
  const hostSettings = document.getElementById('host-settings');
  
  if (isHost) {
    document.getElementById('btn-start-game').classList.remove('hidden');
    if (hostSettings) hostSettings.classList.remove('hidden');
    
    // Escuchar modificaciones dinámicas del límite de puntos en el select
    document.getElementById('select-max-points').addEventListener('change', updateRoomRules);
    
    // Inyectar el botón simulador de bots para pruebas rápidas
    injectBotButton();
  } else {
    if (hostSettings) hostSettings.classList.add('hidden');
  }
}

// CONFIGURACIÓN: Guardar reglas modificadas en la base de datos
async function updateRoomRules(e) {
  const selectedPoints = parseInt(e.target.value);
  const { error } = await supabaseClient
    .from('rooms')
    .update({ max_points: selectedPoints })
    .eq('id', currentRoomId);

  if (error) console.error("Error al actualizar reglas:", error.message);
}

// TRAER REGLAS DESDE LA BASE DE DATOS
async function fetchRoomRules() {
  const { data, error } = await supabaseClient
    .from('rooms')
    .select('max_points')
    .eq('id', currentRoomId)
    .single();

  if (!error && data) {
    maxPoints = data.max_points;
    document.getElementById('text-max-points').innerText = `${maxPoints} puntos`;
    if (isHost) {
      document.getElementById('select-max-points').value = maxPoints;
    }
  }
}

// SIMULADOR: Inyectar botón de bots en la interfaz del Host
function injectBotButton() {
  if (document.getElementById('btn-add-bots')) return;
  const botBtn = document.createElement('button');
  botBtn.id = 'btn-add-bots';
  botBtn.className = "w-full mt-2 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800 text-indigo-400 font-medium py-2 rounded-xl text-xs transition-colors cursor-pointer";
  botBtn.innerText = "🤖 Llenar Mesa con 3 Bots (Modo Prueba)";
  botBtn.addEventListener('click', addSimulatedBots);
  
  const startBtn = document.getElementById('btn-start-game');
  startBtn.parentNode.insertBefore(botBtn, startBtn);
}

// SIMULADOR: Guardar bots automatizados en los asientos libres de Supabase
async function addSimulatedBots() {
  if (playersList.length >= 4) return showNiceAlert("La mesa ya tiene los 4 integrantes.");
  const botNames = ["Bot Pancho 🇻🇪", "Bot Chuo 🤖", "Bot Catire 🤖"];
  const seatsToFill = [];
  const takenSeats = playersList.map(p => p.seat_position);
  let nameIndex = 0;

  for (let i = 1; i <= 4; i++) {
    if (!takenSeats.includes(i)) {
      seatsToFill.push({
        room_id: currentRoomId,
        nickname: botNames[nameIndex] || `Bot Extra ${i}`,
        seat_position: i,
        is_host: false
      });
      nameIndex++;
    }
  }
  if (seatsToFill.length > 0) {
    const { error } = await supabaseClient.from('players').insert(seatsToFill);
    if (error) console.error("Error agregando bots:", error.message);
  }
}

// REGLA VENEZOLANA: Prohibido pasarse si tienes fichas válidas para las puntas del tablero
function canPlayerPlay(myHandFichas) {
  // Si la mesa está vacía (salida), cualquier ficha es legal
  if (boardLeftValue === null && boardRightValue === null) return true;

  for (let ficha of myHandFichas) {
    let v1 = ficha[0];
    let v2 = ficha[1];
    if (v1 === boardLeftValue || v2 === boardLeftValue || v1 === boardRightValue || v2 === boardRightValue) {
      return true; // Ficha jugable detectada, el sistema bloqueará el "paso"
    }
  }
  return false; // El jugador no lleva ninguna y se ve forzado a pasar
}

// ESCUCHAR CAMBIOS EN TIEMPO REAL (REALTIME)
function listenToPlayersChanges() {
  fetchPlayers();
  fetchRoomRules();

  // Escuchar entrada, salida o reordenamientos de jugadores en la mesa
  supabaseClient
    .channel(`room-${currentRoomId}`)
    .on('postgres_changes', { event: '*', filter: `room_id=eq.${currentRoomId}`, schema: 'public', table: 'players' }, () => {
      fetchPlayers();
    })
    .subscribe();

  // Escuchar si el Host modifica las reglas del límite de puntos
  supabaseClient
    .channel(`room-rules-${currentRoomId}`)
    .on('postgres_changes', { event: 'UPDATE', filter: `id=eq.${currentRoomId}`, schema: 'public', table: 'rooms' }, () => {
      fetchRoomRules();
    })
    .subscribe();
}

// TRAER LISTA ACTUALIZADA DE JUGADORES
async function fetchPlayers() {
  const { data, error } = await supabaseClient
    .from('players')
    .select('*')
    .eq('room_id', currentRoomId)
    .order('seat_position', { ascending: true });

  if (!error && data) {
    playersList = data;
    renderLobbyPlayers();
  }
}

// DIBUJAR LOS JUGADORES EN LOS ASIENTOS DEL LOBBY
function renderLobbyPlayers() {
  const container = document.getElementById('lobby-players-list');
  container.innerHTML = "";

  for (let i = 1; i <= 4; i++) {
    const playerInSeat = playersList.find(p => p.seat_position === i);
    const teamName = (i === 1 || i === 3) ? "Pareja A" : "Pareja B";
    const teamBadgeColor = (i === 1 || i === 3) ? "bg-blue-900/30 text-blue-400 border-blue-800" : "bg-purple-900/30 text-purple-400 border-purple-800";

    const slotDiv = document.createElement('div');
    slotDiv.className = "player-slot flex items-center justify-between p-3 bg-[#1f2937] border border-gray-800 rounded-xl";

    if (playerInSeat) {
      let actionButtons = "";
      if (isHost) {
        actionButtons = `
          <div class="flex space-x-1">
            <button onclick="movePlayer('${playerInSeat.id}', ${i}, -1)" class="p-1 text-gray-400 hover:text-white cursor-pointer bg-gray-800 rounded">▲</button>
            <button onclick="movePlayer('${playerInSeat.id}', ${i}, 1)" class="p-1 text-gray-400 hover:text-white cursor-pointer bg-gray-800 rounded font-bold">▼</button>
          </div>
        `;
      }

      slotDiv.innerHTML = `
        <div class="flex items-center space-x-3">
          <span class="w-6 h-6 flex items-center justify-center bg-gray-700 text-xs font-bold rounded-full">${i}</span>
          <span class="font-medium ${playerInSeat.id === myId ? 'text-indigo-400 font-bold' : 'text-white'}">
            ${playerInSeat.nickname} ${playerInSeat.is_host ? '👑' : ''}
          </span>
          <span class="text-[10px] border px-2 py-0.5 rounded-md font-semibold tracking-wider ${teamBadgeColor}">${teamName}</span>
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

// FUNCIÓN DEL HOST: INTERCAMBIAR O MOVER JUGADORES DE PUESTO
async function movePlayer(playerId, currentSeat, direction) {
  let targetSeat = currentSeat + direction;
  if (targetSeat < 1) targetSeat = 4;
  if (targetSeat > 4) targetSeat = 1;

  const playerInTarget = playersList.find(p => p.seat_position === targetSeat);

  if (playerInTarget) {
    // Intercambio seguro mitigando choques de restricciones de unicidad únicas en Supabase
    await supabaseClient.from('players').update({ seat_position: 0 }).eq('id', playerInTarget.id);
    await supabaseClient.from('players').update({ seat_position: targetSeat }).eq('id', playerId);
    await supabaseClient.from('players').update({ seat_position: currentSeat }).eq('id', playerInTarget.id);
  } else {
    await supabaseClient.from('players').update({ seat_position: targetSeat }).eq('id', playerId);
  }
}

// TIMING CONTROL: Cuenta regresiva de turnos de 1 minuto
function startTurnTimer() {
  timeLeft = 60;
  document.getElementById('game-timer').innerText = timeLeft;
  document.getElementById('timer-bar').style.width = "100%";

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('game-timer').innerText = timeLeft;
    const percentage = (timeLeft / 60) * 100;
    document.getElementById('timer-bar').style.width = `${percentage}%`;

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      handleTimeout();
    }
  }, 1000);
}

function handleTimeout() {
  showNiceAlert("¡Se acabó el tiempo de tu turno! Tu ficha se jugará automáticamente.");
}