// --- Seleção de Elementos do DOM ---
const setupSection = document.getElementById('setup-section');
const callSection = document.getElementById('call-section');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const hangUpBtn = document.getElementById('hang-up-btn');
const remoteAudio = document.getElementById('remote-audio');
const roomIdDisplay = document.getElementById('room-id-display');
const statusDiv = document.getElementById('status');
const statusMessage = document.getElementById('status-message');
const errorMessage = document.getElementById('error-message');
const copyRoomIdBtn = document.getElementById('copy-room-id-btn');
// NOVO: Seleção dos elementos de mudo
const toggleMuteBtn = document.getElementById('toggle-mute-btn');
const muteBtnText = document.getElementById('mute-btn-text');


// --- Variáveis de Estado ---
let peer;
let localStream;
let currentCall;
let isMuted = false; // NOVO: Controla o estado do mudo

// --- Estado das Notificações ---
let audioCtx;
let incomingInterval = null;
let titleBlinkInterval = null;
const ORIGINAL_TITLE = document.title;


// --- Funções Auxiliares ---

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playNote(freq, startTime, duration, startGain = 0.2) {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(startGain, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
    } catch (err) {
        console.error('Erro ao reproduzir nota:', err);
    }
}

function playIncomingRing() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        playNote(440, now, 0.12, 0.15);
        playNote(440, now + 0.2, 0.12, 0.15);
    } catch (err) {
        console.error('Erro ao tocar chamada recebida:', err);
    }
}

function stopIncomingSound() {
    if (incomingInterval) {
        clearInterval(incomingInterval);
        incomingInterval = null;
    }
}

function playSound(type) {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        
        if (type === 'incoming') {
            stopIncomingSound();
            playIncomingRing();
            incomingInterval = setInterval(playIncomingRing, 1500);
        } else if (type === 'connect') {
            stopIncomingSound();
            playNote(523.25, now, 0.15, 0.15); // C5
            playNote(659.25, now + 0.08, 0.15, 0.15); // E5
            playNote(783.99, now + 0.16, 0.3, 0.15); // G5
        } else if (type === 'disconnect') {
            stopIncomingSound();
            
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.linearRampToValueAtTime(220, now + 0.25);
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.15, now + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    } catch (err) {
        console.error('Erro na função playSound:', err);
    }
}

function startTitleBlink(message) {
    if (titleBlinkInterval) clearInterval(titleBlinkInterval);
    let showMsg = true;
    document.title = message;
    titleBlinkInterval = setInterval(() => {
        showMsg = !showMsg;
        document.title = showMsg ? message : ORIGINAL_TITLE;
    }, 1000);
}

function stopTitleBlink() {
    if (titleBlinkInterval) {
        clearInterval(titleBlinkInterval);
        titleBlinkInterval = null;
    }
    document.title = "Vocal";
}

function generateRandomCode() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

async function startMedia() {
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
    } catch (err) {
        console.error('Falha ao obter stream de áudio', err);
        errorMessage.innerText = 'Permissão de microfone é necessária.';
        throw err;
    }
}


// --- Lógica do PeerJS ---

function initializePeer(peerId) {
    peer = new Peer(peerId);

    peer.on('open', (id) => {
        console.log('Meu ID de peer é: ' + id);
        showCallView(id);
    });

    peer.on('call', (call) => {
        if (!localStream) {
            console.error("Stream local não está pronta.");
            return;
        }
        
        console.log('Recebendo chamada...');
        playSound('incoming');
        startTitleBlink('🔔 Chamada entrando...');
        call.answer(localStream);
        setupCallHandlers(call);
    });

    peer.on('error', (err) => {
        console.error('Erro no PeerJS:', err);
        errorMessage.innerText = `Erro de conexão: ${err.message}. Tente outro código.`;
        showSetupView();
    });
}

function setupCallHandlers(call) {
    currentCall = call;

    call.on('stream', (remoteStream) => {
        console.log('Recebendo stream remoto.');
        playSound('connect');
        stopTitleBlink();
        statusDiv.classList.remove('status-waiting');
        statusDiv.classList.add('status-connected');
        statusMessage.innerText = 'Conectado!';
        remoteAudio.srcObject = remoteStream;
    });

    call.on('close', endCall);
    call.on('error', (err) => {
        console.error("Erro na chamada:", err);
        endCall();
    });
}


// --- Lógica dos Eventos de Botão ---

createRoomBtn.addEventListener('click', async () => {
    errorMessage.innerText = '';
    try {
        await startMedia();
        const roomCode = generateRandomCode();
        initializePeer(roomCode);
    } catch (error) {}
});

joinRoomBtn.addEventListener('click', async () => {
    errorMessage.innerText = '';
    const roomCode = roomCodeInput.value.trim();
    if (roomCode.length !== 5 || !/^\d{5}$/.test(roomCode)) {
        errorMessage.innerText = 'O código da sala deve ter 5 dígitos.';
        return;
    }
    
    try {
        await startMedia();
        peer = new Peer(); 
        peer.on('open', () => {
            const call = peer.call(roomCode, localStream);
            showCallView(roomCode);
            setupCallHandlers(call);
        });
        peer.on('error', (err) => {
            console.error('Erro no PeerJS:', err);
            errorMessage.innerText = 'Não foi possível conectar. Verifique o código.';
            showSetupView();
       });
    } catch (error) {}
});

hangUpBtn.addEventListener('click', endCall);

copyRoomIdBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(roomIdDisplay.innerText).then(() => {
        copyRoomIdBtn.classList.add('copied');
        setTimeout(() => {
            copyRoomIdBtn.classList.remove('copied');
        }, 2000);
    }).catch(err => console.error('Falha ao copiar:', err));
});

// NOVO: Lógica do botão de mutar
toggleMuteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    
    // Ativa ou desativa a faixa de áudio no stream local
    if (localStream) {
        localStream.getAudioTracks()[0].enabled = !isMuted;
    }
    
    // Atualiza a UI do botão
    updateMuteButtonUI();
});

// NOVO: Função para atualizar a aparência do botão de mudo
function updateMuteButtonUI() {
    toggleMuteBtn.classList.toggle('muted', isMuted);
    muteBtnText.innerText = isMuted ? 'Desmutar' : 'Mutar';
}


// --- Funções de Gerenciamento de UI ---

function endCall() {
    playSound('disconnect');
    stopTitleBlink();
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }
    if (peer) {
        peer.disconnect();
        peer.destroy();
        peer = null;
    }

    showSetupView();
}

function showView(viewToShow) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    viewToShow.classList.add('active');
}

function showCallView(roomId) {
    roomIdDisplay.innerText = roomId;
    // Reseta o estado do botão de mudo ao iniciar uma nova chamada
    isMuted = false;
    updateMuteButtonUI();
    showView(callSection);
    startTitleBlink('📞 Vocal');
}

function showSetupView() {
    statusDiv.classList.add('status-waiting');
    statusDiv.classList.remove('status-connected');
    statusMessage.innerText = 'Aguardando outro participante';
    remoteAudio.srcObject = null;
    roomCodeInput.value = '';
    showView(setupSection);
}