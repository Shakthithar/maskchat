// DOM Elements
const entryScreen = document.getElementById('entryScreen');
const chatScreen = document.getElementById('chatScreen');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const keyInput = document.getElementById('keyInput');
const joinBtn = document.getElementById('joinBtn');

const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const status = document.getElementById('status');
const roomLabel = document.getElementById('roomLabel');

// State
let socket;
let lastTypingTime;
const TYPING_TIMEOUT = 2000;
let currentKey;

// Join Chat
joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const room = roomInput.value.trim();
  const key = keyInput.value.trim();

  if (!name || !room || !key) {
    alert("All fields are required!");
    return;
  }

  currentKey = key;

  socket = io();
  socket.emit('join', { name, room });

  roomLabel.textContent = `Room: ${room}`;
  entryScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');

  setupChatEvents();
});

function setupChatEvents() {
  // Send message
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Typing indicator
  messageInput.addEventListener('input', () => {
    socket.emit('typing', {});
    lastTypingTime = Date.now();
  });

  setInterval(() => {
    if (messageInput.value && Date.now() - lastTypingTime < TYPING_TIMEOUT) {
      // Still typing
    } else {
      typingIndicator.textContent = '';
    }
  }, 500);

  // Socket Listeners
  socket.on('message', (data) => {
    const { sender, ciphertext, timestamp } = data;
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let plaintext;
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, currentKey);
      plaintext = bytes.toString(CryptoJS.enc.Utf8);
      if (!plaintext) throw new Error("Decryption failed");
    } catch (e) {
      plaintext = "❌ Unable to decrypt – wrong key?";
    }

    addMessage(sender, plaintext, time, sender === 'You');
  });

  socket.on('peer_joined', (data) => {
    addSystemMessage(`${data.name} joined`);
    status.textContent = 'Online';
  });

  socket.on('peer_left', (data) => {
    addSystemMessage(`${data.name} left`);
    status.textContent = 'Offline';
  });

  socket.on('online', (data) => {
    status.textContent = 'Online';
  });

  socket.on('typing', (data) => {
    typingIndicator.textContent = `${data.name} is typing...`;
  });
}

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  const timestamp = Date.now();
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Encrypt message
  const ciphertext = CryptoJS.AES.encrypt(text, currentKey).toString();

  socket.emit('message', { ciphertext, timestamp });
  addMessage('You', text, time, true);
  messageInput.value = '';
}

function addMessage(sender, text, time, isSelf) {
  const bubbleClass = isSelf
    ? 'bg-blue-600 text-white self-end'
    : 'bg-white text-gray-800 self-start shadow';

  const msg = document.createElement('div');
  msg.className = 'max-w-xs mx-2 my-1 rounded-lg px-4 py-2 break-words ' + bubbleClass;

  const senderEl = document.createElement('div');
  senderEl.className = 'text-xs opacity-80 mb-1';
  senderEl.textContent = `${sender} • ${time}`;

  const textEl = document.createElement('div');
  textEl.textContent = text;

  msg.appendChild(senderEl);
  msg.appendChild(textEl);

  messagesDiv.appendChild(msg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Clear typing
  typingIndicator.textContent = '';
}

function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'text-xs text-center text-gray-500 my-2';
  el.textContent = text;
  messagesDiv.appendChild(el);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}