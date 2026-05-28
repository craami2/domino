// CONEXIÓN MAESTRA A SUPABASE
const SUPABASE_URL = "https://cybkunnrqwilfzzyvrug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5Ymt1bm5ycXdpbGZ6enl2cnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODA5OTUsImV4cCI6MjA5NTU1Njk5NX0.nWdOVfjb_amwsvf0Fih-zpL8Ivc8zCijbNmRTwgoo-k";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ESTADO GLOBAL DEL JUEGO
let myId = null;
let myNickname = "";
let currentRoomId = null;
let currentRoomCode = "";
let isHost = false;
let playersList = [];
let timerInterval = null;
let timeLeft = 60;

// ELEMENTOS DE LA INTERFAZ (DOM)
const screenLogin = document.getElementById('screen-login');
const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');

// AL CARGAR LA PÁGINA
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});

// ESCUCHADORES DE ACCIONES DEL USUARIO
function setupEventListeners() {
  // Botón Crear Sala
  document.getElementById('btn-create-room').addEventListener('click', createRoom);
  // Botón Unirse a Sala
  document.getElementById('btn-join-room').addEventListener('click', joinRoom);
}

// GENERAR CÓDIGO ALEATORIO PARA LA SALA (Ej: XZTWQA)
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ACCIÓN: CREAR UNA SALA NUEVA
async function createRoom() {
  const nicknameInput = document.getElementById('input-nickname').value.trim();
  if (!nicknameInput) return alert("Por favor escribe un Nickname primero.");

  myNickname = nicknameInput;
  isHost = true;
  currentRoomCode = generateRoomCode();

  // 1. Guardar la sala en Supabase
  const { data: roomData, error: roomError } = await supabaseClient
    .from('rooms')
    .insert([{ room_code: currentRoomCode }])
    .select()
    .single();

  if (roomError) return alert("Error al crear sala: " + roomError.message);

  currentRoomId = roomData.id;

  // 2. Meterse como el jugador 1 (Host)
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

  if (playerError) return alert("Error al registrar jugador: " + playerError.message);
  
  myId = playerData.id;
  
  // Ir al lobby
  showLobbyScreen();
  listenToPlayersChanges();
}

// ACCIÓN: UNIRSE A UNA SALA EXISTENTE
async function joinRoom() {
  const nicknameInput = document.getElementById('input-nickname').value.trim();
  const codeInput = document.getElementById('input-room-code').value.trim().toUpperCase();

  if (!nicknameInput) return alert("Por favor escribe un Nickname.");
  if (!codeInput) return alert("Por favor coloca el código de la sala.");

  myNickname = nicknameInput;

  // 1. Buscar si la sala existe
  const { data: roomData, error: roomError } = await supabaseClient
    .from('rooms')
    .select('*')
    .eq('room_code', codeInput)
    .single();

  if (roomError || !roomData) return alert("No se encontró ninguna sala con ese código.");

  currentRoomId = roomData.id;
  currentRoomCode = codeInput;

  // 2. Ver cuántos jugadores hay para asignarle puesto automático libre
  const { data: existingPlayers } = await supabaseClient
    .from('players')
    .select('seat_position')
    .eq('room_id', currentRoomId);

  if (existingPlayers.length >= 4) return alert("La sala ya está llena (Máximo 4 jugadores).");

  // Encontrar el primer número de asiento del 1 al 4 que esté libre
  const takenSeats = existingPlayers.map(p => p.seat_position);
  let assignedSeat = 1;
  for (let i = 1; i <= 4; i++) {
    if (!takenSeats.includes(i)) {
      assignedSeat = i;
      break;
    }
  }

  // 3. Insertar al nuevo jugador
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

  if (playerError) return alert("Error al unirte: " + playerError.message);

  myId = playerData.id;
  isHost = false;

  showLobbyScreen();
  listenToPlayersChanges();
}

// MOSTRAR LA PANTALLA DEL LOBBY
function showLobbyScreen() {
  screenLogin.classList.add('hidden');
  screenLobby.classList.remove('hidden');
  document.getElementById('display-room-code').innerText = currentRoomCode;
  
  if (isHost) {
    document.getElementById('btn-start-game').classList.remove('hidden');
  }
}

// ESCUCHAR CAMBIOS EN TIEMPO REAL (REALTIME)
function listenToPlayersChanges() {
  // Cargar jugadores actuales al entrar
  fetchPlayers();

  // Suscribirse a cambios en la tabla 'players' usando el Realtime de Supabase
  supabaseClient
    .channel(`room-${currentRoomId}`)
    .on('postgres_changes', { event: '*', filter: `room_id=eq.${currentRoomId}`, schema: 'public', table: 'players' }, () => {
      fetchPlayers(); // Si alguien entra, sale o se mueve, recargamos la lista automáticamente
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

  // Mapeamos los 4 asientos posibles
  for (let i = 1; i <= 4; i++) {
    const playerInSeat = playersList.find(p => p.seat_position === i);
    
    // Identificar qué pareja es (1 y 3 contra 2 y 4)
    const teamName = (i === 1 || i === 3) ? "Pareja A" : "Pareja B";
    const teamBadgeColor = (i === 1 || i === 3) ? "bg-blue-900/30 text-blue-400 border-blue-800" : "bg-purple-900/30 text-purple-400 border-purple-800";

    const slotDiv = document.createElement('div');
    slotDiv.className = "player-slot flex items-center justify-between p-3 bg-[#1f2937] border border-gray-800 rounded-xl";

    if (playerInSeat) {
      // Si hay un jugador sentado en este puesto
      let actionButtons = "";
      
      // Si SOY EL HOST, puedo ver botones para reordenar / cambiar de puesto
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
      // Si el puesto está vacío
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

// FUNCIÓN DEL HOST: MOVER A UN JUGADOR DE PUESTO (INTERCAMBIAR ASIENTOS)
async function movePlayer(playerId, currentSeat, direction) {
  let targetSeat = currentSeat + direction;
  if (targetSeat < 1) targetSeat = 4;
  if (targetSeat > 4) targetSeat = 1;

  // Ver si hay alguien ya en ese puesto destino para intercambiarlo con él
  const playerInTarget = playersList.find(p => p.seat_position === targetSeat);

  if (playerInTarget) {
    // Intercambio de puestos seguro en Supabase
    await supabaseClient.from('players').update({ seat_position: 0 }).eq('id', playerInTarget.id); // Puesto temporal para evitar choque único
    await supabaseClient.from('players').update({ seat_position: targetSeat }).eq('id', playerId);
    await supabaseClient.from('players').update({ seat_position: currentSeat }).eq('id', playerInTarget.id);
  } else {
    // Si el puesto está libre, simplemente lo movemos
    await supabaseClient.from('players').update({ seat_position: targetSeat }).eq('id', playerId);
  }
  // El Realtime detectará esto y redibujará las parejas para todos los conectados al instante.
}

// ==========================================
// SECCIÓN: RELOJ / TIMER DE 1 MINUTO
// ==========================================
function startTurnTimer() {
  timeLeft = 60;
  document.getElementById('game-timer').innerText = timeLeft;
  document.getElementById('timer-bar').style.width = "100%";

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('game-timer').innerText = timeLeft;
    
    // Reducir la barra visualmente
    const percentage = (timeLeft / 60) * 100;
    document.getElementById('timer-bar').style.width = `${percentage}%`;

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      handleTimeout();
    }
  }, 1000);
}

// QUÉ PASA CUANDO SE LE ACABA EL MINUTO
function handleTimeout() {
  alert("¡Se te acabó el tiempo! El sistema jugará automáticamente la primera ficha válida que tengas.");
}