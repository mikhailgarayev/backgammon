/* app.js
 - ВАЖНО: внизу этого файла установи firebaseConfig = { ... } от твоего Firebase проекта.
 - Инструкции по созданию проекта и Realtime DB в README.md
*/

const firebaseConfig = {
  apiKey: "AIzaSyA-UlT-kEx2RPKxGRtmR4rKhPwSrpg6sVE",
  authDomain: "backgammon-c57ec.firebaseapp.com",
  databaseURL: "https://backgammon-c57ec-default-rtdb.firebaseio.com",
  projectId: "backgammon-c57ec",
  storageBucket: "backgammon-c57ec.firebasestorage.app",
  messagingSenderId: "856152245696",
  appId: "1:856152245696:web:863f57ae960cc21af3b425"
};

// ---------- Инициализация Firebase ----------
if (!firebaseConfig) {
  console.warn('Firebase config не установлен. Сигналинг через Firebase не будет работать до подстановки конфигурации.');
}
let app = null, db = null;
if (typeof firebase !== 'undefined' && firebaseConfig) {
  app = firebase.initializeApp(firebaseConfig);
  db = firebase.database();
}

// ---------- UI ----------
const statusText = id('statusText');
const roomInput = id('roomInput');
const createBtn = id('createBtn');
const joinBtn = id('joinBtn');
const roomLink = id('roomLink');
const linkWrap = id('linkWrap');
const copyLinkBtn = id('copyLink');
const rollBtn = id('rollBtn');
const diceVal = id('diceVal');
const turnPlayer = id('turnPlayer');
const resetBtn = id('resetBtn');
const logEl = id('log');

createBtn.onclick = createRoom;
joinBtn.onclick = joinRoom;
copyLinkBtn.onclick = () => {
  navigator.clipboard.writeText(roomLink.href).then(()=>alert('Скопировано в буфер обмена'));
};
resetBtn.onclick = () => {
  if (confirm('Сбросить игру?')) {
    localReset();
    sendState();
  }
};

// ---------- Canvas / Board ----------
const canvas = id('board');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const POINT_W = W/14;
const POINT_H = H/2 - 50;

let selected = null;
let playerColor = null; // 'white' или 'black' (white ходит первым)
let myId = randomId();
let peerConnected = false;

// Начальное расположение шашек — классическое
function initialBoard(){
  // Модель: массив 24 точек, каждая {count, color}
  // индексы 0..23 (1..24 по нардам)
  const b = Array.from({length:24},()=>({count:0,color:null}));
  b[0] = {count:2, color:'black'};
  b[11] = {count:5, color:'black'};
  b[16] = {count:3, color:'black'};
  b[18] = {count:5, color:'black'};

  b[23] = {count:2, color:'white'};
  b[12] = {count:5, color:'white'};
  b[7] = {count:3, color:'white'};
  b[5] = {count:5, color:'white'};
  return b;
}

let gameState = {
  board: initialBoard(),
  turn: 'white',
  dice: [0,0],
  movesLeft: [],
  createdAt: Date.now()
};

// ---------- Drawing ----------
function draw(){
  ctx.clearRect(0,0,W,H);
  drawBackground();
  drawPoints();
  drawCheckers();
  // draw selection highlight
  if (selected !== null) {
    highlightPoint(selected, 'rgba(0,180,255,0.25)');
  }
}
function drawBackground(){
  // рамка
  ctx.fillStyle = '#bfa46b';
  roundRect(ctx,0,0,W,H,14,true,false);
  // игровая внутренняя панель
  ctx.fillStyle = '#f7edd6';
  roundRect(ctx,6,6,W-12,H-12,10,true,false);
}
function drawPoints(){
  // 12 слева/справа на каждой половине
  for (let i=0;i<12;i++){
    // верхняя половина (0..11)
    let x = POINT_W/2 + i*POINT_W;
    drawTriangle(x,20,POINT_W,POINT_H, i%2===0 ? '#4a2b0b' : '#2b1a10');
    // нижняя - зеркально
    let xi = W - (POINT_W/2 + i*POINT_W);
    drawTriangle(xi,H-20-POINT_H,POINT_W,POINT_H, i%2===0 ? '#4a2b0b' : '#2b1a10', true);
  }
  // серединная панель для козыря/баров
  ctx.fillStyle = '#d9c5a0';
  ctx.fillRect(W/2 - POINT_W/2, H/2 - 40, POINT_W, 80);
}
function drawTriangle(x, y, w, h, color, down=false){
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w/2, down ? y + h : y - h);
  ctx.lineTo(x - w/2, down ? y + h : y - h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
function drawCheckers(){
  // draw by points 0..23
  for (let i=0;i<24;i++){
    let pos = pointToCoords(i);
    let cell = gameState.board[i];
    if (cell.count>0){
      let maxStack = 5;
      let stack = Math.min(cell.count, maxStack);
      for (let s=0;s<stack;s++){
        let cx = pos.x;
        let cy = pos.y + (cell.color==='white' ? -s*22 : s*22);
        drawChecker(cx,cy, cell.color);
      }
      if (cell.count>maxStack){
        // draw small number
        ctx.fillStyle = 'black';
        ctx.font = '14px Inter';
        ctx.fillText('+' + (cell.count - maxStack), pos.x - 10, pos.y + 6 * (cell.color==='white' ? -1 : 1));
      }
    }
  }
}
function highlightPoint(i, color){
  const pos = pointToCoords(i);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 28, 0, Math.PI*2);
  ctx.fillStyle = color;
  ctx.fill();
}
function drawChecker(x,y, color){
  ctx.beginPath();
  ctx.arc(x,y,20,0,Math.PI*2);
  ctx.fillStyle = color === 'white' ? '#fff' : '#111';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.stroke();
}

// координаты для точки i
function pointToCoords(i){
  // точки 0..11 сверху слева->центр, 12..23 снизу центр->право->лево
  // упрощаем расположение: используем по 12 точек слева и справа
  let col, x, y;
  if (i < 12){
    // верхняя панель, от 0 (левая верх) до 11 (правая верх)
    const idx = 11 - i; // разворачиваем, чтобы точка 0 была в левом краю
    x = POINT_W/2 + idx*POINT_W;
    y = 50 + 30;
  } else {
    const idx = i - 12; // 0..11
    x = POINT_W/2 + idx*POINT_W;
    y = H - 50 - 30;
  }
  return {x,y};
}

// ---------- Interaction ----------
canvas.addEventListener('click', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const clicked = coordsToPoint(mx,my);
  if (clicked === null) return;
  if (!playerColor) {
    log('Сначала подключись к комнате и дождись игрока.');
    return;
  }
  if (gameState.turn !== playerColor) {
    log('Сейчас не твой ход.');
    return;
  }
  // если не выбран — выбрать
  if (selected === null){
    if (gameState.board[clicked].count > 0 && gameState.board[clicked].color === playerColor){
      selected = clicked;
      draw();
    } else {
      log('Выбери свою шашку.');
    }
  } else {
    // сделать ход selected -> clicked
    const move = {from:selected, to:clicked};
    applyMoveLocal(move, true);
    selected = null;
    draw();
  }
});

// обратное преобразование координат -> номер точки (приближённо)
function coordsToPoint(mx,my){
  // берем ближайшую по x, и по половине определяем верх/низ
  const leftEdge = POINT_W/2;
  if (mx < leftEdge - POINT_W) return null;
  let idx = Math.floor((mx - leftEdge) / POINT_W);
  if (idx < 0) idx = 0;
  if (idx > 11) idx = 11;
  if (my < H/2) {
    // верхняя - соответствие 11 - idx
    return 11 - idx;
  } else {
    return 12 + idx;
  }
}

// ---------- Game logic ----------
function canMove(move){
  // базовая валидация: from has player's checker
  const f = move.from, t = move.to;
  if (f<0||f>23||t<0||t>23) return false;
  const fcell = gameState.board[f];
  if (fcell.count<=0 || fcell.color !== playerColor) return false;
  // простейшая проверка: нельзя ходить на точку, где 2+ чужих шашек
  const tcell = gameState.board[t];
  if (tcell.count >=2 && tcell.color !== playerColor) return false;
  return true;
}

function applyMoveLocal(move, emit=false){
  if (!canMove(move)) {
    log('Недопустимый ход');
    return false;
  }
  const f = move.from, t = move.to;
  const fcell = gameState.board[f];
  const tcell = gameState.board[t];
  // снять с from
  fcell.count -= 1;
  if (fcell.count === 0) fcell.color = null;
  // если на to стоит 1 чужая — побьем (простая логика: отправляем на bar не реализовано — уменьшаем count и ставим ours)
  if (tcell.count === 1 && tcell.color !== playerColor){
    // сбиваем чужую шашку — возвращаем её на некоторую точку (упрощение: кладём в запас и ставим 1 нашей)
    // Для простоты: уменьшаем чужие и увеличиваем наши
    tcell.count = 0;
    tcell.color = null;
    // (в реальных правилах шашка уходит на бар; здесь просто убираем)
  }
  // положить на to
  if (tcell.count === 0){
    tcell.color = playerColor;
    tcell.count = 1;
  } else {
    tcell.count += 1;
  }
  // смена хода
  gameState.turn = (gameState.turn === 'white') ? 'black' : 'white';
  updateUI();
  draw();
  if (emit) sendState();
  return true;
}

function updateUI(){
  turnPlayer.textContent = gameState.turn;
  diceVal.textContent = gameState.dice[0] + ' & ' + gameState.dice[1];
}

// ломаем игру локально
function localReset(){
  gameState = {
    board: initialBoard(),
    turn: 'white',
    dice: [0,0],
    movesLeft: [],
    createdAt: Date.now()
  };
  updateUI();
  draw();
}

// ---------- Networking: WebRTC + Firebase signaling ----------
let pc = null;
let dataChannel = null;
let roomId = null;
let isCaller = false;

async function createRoom(){
  roomId = roomInput.value.trim() || randomId(6);
  isCaller = true;
  playerColor = 'white'; // создатель — белые
  status('Создаю комнату: ' + roomId);
  if (!db) {
    status('Firebase не настроен. Никакого сетевого режима.');
    log('Чтобы играть онлайн, нужно подставить firebaseConfig в app.js и включить Realtime DB (см. README).');
    return;
  }
  // очистим room path
  await db.ref('rooms/' + roomId).remove();
  await setupConnection();
  // show link
  const url = location.origin + location.pathname + '?room=' + roomId;
  roomLink.href = url;
  roomLink.textContent = url;
  linkWrap.classList.remove('hidden');
  status('Комната создана, жди подключения второго игрока...');
  // записываем что мы есть
  await db.ref('rooms/' + roomId + '/meta').set({host: myId, createdAt: Date.now()});
}

async function joinRoom(){
  roomId = roomInput.value.trim() || null;
  if (!roomId){
    // try parse from url
    const uparams = new URLSearchParams(location.search);
    roomId = uparams.get('room');
  }
  if (!roomId){
    alert('Укажи ID комнаты или открой ссылку комнаты.');
    return;
  }
  isCaller = false;
  playerColor = 'black'; // второй игрок — черные
  status('Присоединяюсь к комнате: ' + roomId);
  if (!db) {
    status('Firebase не настроен. Никакого сетевого режима.');
    return;
  }
  await setupConnection();
  linkWrap.classList.remove('hidden');
  const url = location.origin + location.pathname + '?room=' + roomId;
  roomLink.href = url;
  roomLink.textContent = url;
}

async function setupConnection(){
  pc = new RTCPeerConnection({
    iceServers: [{urls:['stun:stun.l.google.com:19302']}]
  });

  pc.onicecandidate = (ev) => {
    if (ev.candidate && db && roomId) {
      const path = 'rooms/' + roomId + '/candidates/' + myId + '-' + Date.now();
      db.ref(path).set(ev.candidate.toJSON());
    }
  };

  pc.ondatachannel = (ev) => {
    dataChannel = ev.channel;
    attachDataChannel();
  };

  if (isCaller){
    dataChannel = pc.createDataChannel('game');
    attachDataChannel();
  }

  // Firebase listeners
  const candidatesRef = db.ref('rooms/' + roomId + '/candidates');
  candidatesRef.on('child_added', (snap) => {
    const c = snap.val();
    if (!c) return;
    // avoid applying our own candidate (we generate own with myId in key)
    if (snap.key && snap.key.startsWith(myId)) return;
    pc.addIceCandidate(c).catch(console.error);
  });

  const offerRef = db.ref('rooms/' + roomId + '/offer');
  const answerRef = db.ref('rooms/' + roomId + '/answer');

  if (isCaller){
    // create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await offerRef.set({sdp: offer.sdp, type: offer.type});
    status('Оффер отправлен, ждём ответ...');
    // listen for answer
    answerRef.on('value', async (snap)=>{
      const val = snap.val();
      if (!val) return;
      await pc.setRemoteDescription(val);
      status('Ответ получен, соединение устанавливается...');
    });
  } else {
    // waiting for offer
    offerRef.on('value', async (snap)=>{
      const val = snap.val();
      if (!val) return;
      await pc.setRemoteDescription(val);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await answerRef.set({sdp: answer.sdp, type: answer.type});
      status('Ответ отправлен, устанавливаем соединение...');
    });
  }

  // initial state sync via DB meta (who started)
  const stateRef = db.ref('rooms/' + roomId + '/state');
  stateRef.on('value', (snap)=>{
    const val = snap.val();
    if (val && !peerConnected) {
      // другая сторона прислала state — ничего не делаем, будем синхронизироваться через dataChannel
    }
  });

  pc.onconnectionstatechange = ()=> {
    console.log('PC state', pc.connectionState);
    if (pc.connectionState === 'connected'){
      peerConnected = true;
      status('P2P соединение установлено');
      log('Игрок подключился, можно играть!');
      // send our initial state
      sendState();
    } else if (['disconnected','failed','closed'].includes(pc.connectionState)){
      peerConnected = false;
      status('Соединение потеряно: ' + pc.connectionState);
    }
  };
}

function attachDataChannel(){
  dataChannel.onopen = ()=> {
    log('DataChannel открыт');
  };
  dataChannel.onmessage = (ev)=> {
    try {
      const msg = JSON.parse(ev.data);
      handleRemoteMessage(msg);
    } catch(e){ console.error(e) }
  };
  dataChannel.onclose = ()=> {
    log('DataChannel закрыт');
  };
}

function sendMessage(msg){
  if (dataChannel && dataChannel.readyState === 'open'){
    dataChannel.send(JSON.stringify(msg));
  } else {
    // fallback: записать state в Firebase (для старой совместимости)
    if (db && roomId){
      db.ref('rooms/' + roomId + '/lastState').set({msg, ts: Date.now()});
    }
  }
}

function sendState(){
  const msg = {type:'state', state: gameState, from: myId};
  sendMessage(msg);
  // также пишем в DB (so other side can catch if DC not open yet)
  if (db && roomId){
    db.ref('rooms/' + roomId + '/state').set({state:gameState, updatedAt: Date.now()});
  }
}

function handleRemoteMessage(msg){
  if (!msg || !msg.type) return;
  if (msg.type === 'state'){
    // принять состояние соперника — если с ним конфликт, используем более позднее по createdAt
    if (!msg.state) return;
    if (msg.state.createdAt > (gameState.createdAt || 0)){
      gameState = msg.state;
      updateUI();
      draw();
      log('Получено состояние игры от соперника.');
    }
  } else if (msg.type === 'move'){
    // apply move
    if (msg.move){
      // сменим perspective: соперник сделал ход — применим
      applyMoveRemote(msg.move);
    }
  } else if (msg.type === 'dice'){
    gameState.dice = msg.dice;
    gameState.createdAt = Date.now();
    updateUI();
    draw();
  }
}

function applyMoveRemote(move){
  // for remote move, determine which color moved (opponent)
  // just apply inverted color moves (since gameState stored absolute)
  // we accept remote move and set turn accordingly
  // apply without emit
  // NOTE: move validated by remote side; still check
  if (!canMove(move)){
    // remote may move own color — we'll still attempt
  }
  // swap perspective: since both sides share same gameState we apply straightforwardly
  applyMoveLocal(move, false);
  sendState(); // sync back
}

// when local player moves and emits
function emitMove(move){
  sendMessage({type:'move', move, from: myId});
}

// Dice
rollBtn.onclick = ()=>{
  if (gameState.turn !== playerColor) { log('Не ваш ход — кубы бросать нельзя'); return; }
  const a = Math.floor(Math.random()*6)+1;
  const b = Math.floor(Math.random()*6)+1;
  gameState.dice = [a,b];
  gameState.createdAt = Date.now();
  updateUI();
  sendMessage({type:'dice', dice: gameState.dice, from: myId});
};

// Hook applyMoveLocal to emit if it's our move and connected
const originalApply = applyMoveLocal;
applyMoveLocal = function(move, emit){
  const ok = originalApply(move, false);
  if (!ok) return false;
  updateUI();
  draw();
  if (emit) {
    emitMove(move);
    sendState();
  }
  return true;
};

// ---------- Helpers ----------
function id(s) { return document.getElementById(s); }
function randomId(len=8){
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function status(txt){ statusText.textContent = txt; }
function log(txt){
  const el = document.createElement('div');
  el.textContent = '[' + (new Date()).toLocaleTimeString() + '] ' + txt;
  logEl.prepend(el);
}

// small util
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (typeof stroke === 'undefined') stroke = true;
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ---------- Init ----------
localReset();
draw();

// If room in URL — suggest auto join
(function tryAutoJoin(){
  const params = new URLSearchParams(location.search);
  const r = params.get('room');
  if (r){
    roomInput.value = r;
    // не автоматически присоединяем — жмёт пользователь Join
    // можно автоподключение, но оставим контроль пользователю
  }
})();

// NOTE: place your firebase config here if you prefer to modify inline instead of in app.js top
// firebaseConfig = { apiKey: "...", authDomain: "...", databaseURL: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." };
