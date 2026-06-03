// --- Seleção de Elementos do DOM ---
const setupSection = document.getElementById('setup-section');
const callSection = document.getElementById('call-section');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const hangUpBtn = document.getElementById('hang-up-btn');
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
let isMuted = false; // NOVO: Controla o estado do mudo

// --- Estado Multi-party Mesh ---
const peers = new Map(); // peerId -> { conn, call, stream, audioElement, listItemElement }
let isHost = false;
const MAX_PARTICIPANTS = 8;

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

function setupPeerCommonEvents() {
    peer.on('call', (call) => {
        const incomingPeerId = call.peer;
        console.log('Recebendo chamada de:', incomingPeerId);
        
        // Resolução de chamadas duplicadas
        if (peers.has(incomingPeerId) && peers.get(incomingPeerId).call) {
            if (peer.id > incomingPeerId) {
                console.log('Fechando chamada duplicada local para aceitar chamada de:', incomingPeerId);
                try {
                    peers.get(incomingPeerId).call.close();
                } catch (e) {}
                peers.get(incomingPeerId).call = call;
                playSound('incoming');
                startTitleBlink('🔔 Chamada entrando...');
                call.answer(localStream);
                setupCallHandlers(call);
            } else {
                console.log('Rejeitando chamada de entrada duplicada de:', incomingPeerId);
                call.close();
            }
            return;
        }
        
        if (!peers.has(incomingPeerId)) {
            peers.set(incomingPeerId, { conn: null, call: null, stream: null });
        }
        peers.get(incomingPeerId).call = call;
        
        playSound('incoming');
        startTitleBlink('🔔 Chamada entrando...');
        call.answer(localStream);
        setupCallHandlers(call);
    });

    peer.on('error', (err) => {
        console.error('Erro no PeerJS:', err);
        errorMessage.innerText = `Erro de conexão: ${err.message}.`;
        endCall();
    });
}

function initializePeer(peerId) {
    isHost = true;
    peer = new Peer(peerId);

    peer.on('open', (id) => {
        console.log('Host: ID do peer criado:', id);
        showCallView(id);
    });

    setupPeerCommonEvents();

    peer.on('connection', (conn) => {
        console.log('Host: Recebeu conexão de dados de:', conn.peer);
        
        // Verificar limite de participantes (máximo de 8 no total)
        if (peers.size + 1 >= MAX_PARTICIPANTS) {
            console.log('Host: Sala cheia, rejeitando:', conn.peer);
            conn.on('open', () => {
                conn.send({ type: 'sala_cheia' });
                setTimeout(() => conn.close(), 1000);
            });
            return;
        }

        conn.on('open', () => {
            // Enviar lista de IDs já conectados
            const connectedIds = Array.from(peers.keys());
            conn.send({ type: 'peers_list', ids: connectedIds });

            // Adicionar ao Map
            if (!peers.has(conn.peer)) {
                peers.set(conn.peer, { conn, call: null, stream: null });
            } else {
                peers.get(conn.peer).conn = conn;
            }

            // Notificar outros peers sobre o novo participante
            peers.forEach((peerObj, pId) => {
                if (pId !== conn.peer && peerObj.conn) {
                    peerObj.conn.send({ type: 'novo_peer', id: conn.peer });
                }
            });

            addParticipantToList(conn.peer);
            updateParticipantUI();
        });

        conn.on('close', () => {
            handlePeerDisconnect(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Host: Erro na conexão de dados com:', conn.peer, err);
            handlePeerDisconnect(conn.peer);
        });
    });
}

function initiateCall(targetPeerId) {
    if (!localStream) {
        console.error('Stream local não está disponível para iniciar chamada.');
        return;
    }
    if (peers.has(targetPeerId) && peers.get(targetPeerId).call) {
        return; // Já possui chamada ativa
    }
    
    console.log('Iniciando chamada para:', targetPeerId);
    const call = peer.call(targetPeerId, localStream);
    
    if (!peers.has(targetPeerId)) {
        peers.set(targetPeerId, { conn: null, call, stream: null });
    } else {
        peers.get(targetPeerId).call = call;
    }
    
    setupCallHandlers(call);
}

function setupCallHandlers(call) {
    const peerId = call.peer;

    call.on('stream', (remoteStream) => {
        console.log('Recebendo stream remoto de:', peerId);
        
        if (!peers.has(peerId)) {
            peers.set(peerId, { conn: null, call, stream: remoteStream });
        } else {
            peers.get(peerId).stream = remoteStream;
            peers.get(peerId).call = call;
        }

        const peerObj = peers.get(peerId);
        
        // Criar elemento de áudio dinâmico se não existir
        if (!peerObj.audioElement) {
            const audio = document.createElement('audio');
            audio.autoplay = true;
            audio.srcObject = remoteStream;
            document.body.appendChild(audio);
            peerObj.audioElement = audio;
        } else {
            peerObj.audioElement.srcObject = remoteStream;
        }

        addParticipantToList(peerId);
        updateParticipantUI();
        playSound('connect');
    });

    call.on('close', () => {
        console.log('Chamada encerrada com:', peerId);
        handlePeerDisconnect(peerId);
    });

    call.on('error', (err) => {
        console.error('Erro na chamada com:', peerId, err);
        handlePeerDisconnect(peerId);
    });
}

function handlePeerDisconnect(peerId) {
    if (!peers.has(peerId)) return;
    console.log('Removendo participante da chamada:', peerId);
    const peerObj = peers.get(peerId);
    
    if (peerObj.call) {
        try { peerObj.call.close(); } catch (e) {}
    }
    if (peerObj.conn) {
        try { peerObj.conn.close(); } catch (e) {}
    }
    if (peerObj.audioElement) {
        try { peerObj.audioElement.remove(); } catch (e) {}
    }
    if (peerObj.listItemElement) {
        const item = peerObj.listItemElement;
        item.classList.add('fade-out');
        setTimeout(() => {
            try { item.remove(); } catch (e) {}
        }, 500);
    }
    
    peers.delete(peerId);
    updateParticipantUI();
    playSound('disconnect');
    
    // Se for o host, notificar todos os outros sobre a saída
    if (isHost) {
        peers.forEach((otherPeer) => {
            if (otherPeer.conn) {
                try {
                    otherPeer.conn.send({ type: 'peer_saida', id: peerId });
                } catch (e) {}
            }
        });
    }
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
        isHost = false;
        peer = new Peer(); // Random ID
        
        peer.on('open', (id) => {
            console.log('Guest: ID do peer criado:', id);
            showCallView(roomCode);
            
            // Conectar ao Host via DataChannel
            const hostConn = peer.connect(roomCode);
            
            // Adicionar o Host ao Map
            peers.set(roomCode, { conn: hostConn, call: null, stream: null });
            
            hostConn.on('open', () => {
                console.log('Guest: Conectado ao Host via DataChannel');
                addParticipantToList(roomCode);
                updateParticipantUI();
                initiateCall(roomCode);
            });
            
            hostConn.on('data', (data) => {
                if (data.type === 'peers_list') {
                    console.log('Guest: Recebeu lista de peers do Host:', data.ids);
                    data.ids.forEach(pId => {
                        initiateCall(pId);
                    });
                } else if (data.type === 'novo_peer') {
                    console.log('Guest: Recebeu novo peer:', data.id);
                    initiateCall(data.id);
                } else if (data.type === 'sala_cheia') {
                    console.log('Guest: Sala cheia, voltando ao setup.');
                    errorMessage.innerText = 'A sala está cheia (máximo de 8 participantes).';
                    endCall();
                } else if (data.type === 'peer_saida') {
                    console.log('Guest: Participante saiu da sala:', data.id);
                    handlePeerDisconnect(data.id);
                }
            });
            
            hostConn.on('close', () => {
                console.log('Guest: Conexão de dados com Host fechada.');
                endCall();
            });
            
            hostConn.on('error', (err) => {
                console.error('Guest: Erro na conexão de dados com Host:', err);
                endCall();
            });
        });
        
        setupPeerCommonEvents();
        
    } catch (error) {
        console.error('Erro ao entrar na sala:', error);
    }
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
    
    // Fechar todas as conexões e chamadas
    peers.forEach((peerObj) => {
        if (peerObj.call) {
            try { peerObj.call.close(); } catch (e) {}
        }
        if (peerObj.conn) {
            try { peerObj.conn.close(); } catch (e) {}
        }
        if (peerObj.audioElement) {
            try { peerObj.audioElement.remove(); } catch (e) {}
        }
        if (peerObj.listItemElement) {
            try { peerObj.listItemElement.remove(); } catch (e) {}
        }
    });
    peers.clear();

    // Parar streams locais
    if (localStream) {
        localStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
        });
        localStream = null;
    }

    // Destruir peer local
    if (peer) {
        try {
            peer.disconnect();
            peer.destroy();
        } catch (e) {}
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
    isMuted = false;
    updateMuteButtonUI();
    
    // Mostrar a seção de participantes
    const partSection = document.getElementById('participants-section');
    if (partSection) {
        partSection.style.display = 'block';
    }
    
    // Limpar lista de participantes e adicionar a si mesmo
    const list = document.getElementById('participant-list');
    if (list) {
        list.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'participant-item fade-in';
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        const text = document.createElement('span');
        const displayName = peer && peer.id ? peer.id.substring(0, 5) : 'Você';
        text.innerText = `${displayName} (Você)`;
        li.appendChild(dot);
        li.appendChild(text);
        list.appendChild(li);
    }
    
    showView(callSection);
    updateParticipantUI();
}

function showSetupView() {
    statusDiv.classList.add('status-waiting');
    statusDiv.classList.remove('status-connected');
    statusMessage.innerText = 'Aguardando outro participante';
    
    // Esconder seção de participantes
    const partSection = document.getElementById('participants-section');
    if (partSection) {
        partSection.style.display = 'none';
    }
    
    roomCodeInput.value = '';
    showView(setupSection);
}

// --- Funções Auxiliares de UI da Lista de Participantes ---

function addParticipantToList(peerId) {
    if (!peers.has(peerId)) return;
    const peerObj = peers.get(peerId);
    if (peerObj.listItemElement) return; // Já está na lista
    
    const list = document.getElementById('participant-list');
    if (!list) return;
    
    const li = document.createElement('li');
    li.className = 'participant-item';
    
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    
    const text = document.createElement('span');
    const displayName = peerId.substring(0, 5);
    text.innerText = displayName;
    
    li.appendChild(dot);
    li.appendChild(text);
    list.appendChild(li);
    
    peerObj.listItemElement = li;
    
    // Iniciar animação fade-in
    setTimeout(() => {
        li.classList.add('fade-in');
    }, 50);
}

function updateParticipantUI() {
    const totalParticipants = peers.size + 1;
    const countDiv = document.getElementById('participant-count');
    if (countDiv) {
        countDiv.innerText = `${totalParticipants} / 8 participantes`;
    }
    
    if (totalParticipants > 1) {
        statusDiv.classList.remove('status-waiting');
        statusDiv.classList.add('status-connected');
        statusMessage.innerText = 'Conectado!';
        stopTitleBlink();
    } else {
        statusDiv.classList.add('status-waiting');
        statusDiv.classList.remove('status-connected');
        statusMessage.innerText = 'Aguardando outro participante';
        startTitleBlink('📞 Vocal');
    }
}

// --- Registro do Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado com sucesso:', reg.scope))
            .catch(err => console.error('Erro ao registrar Service Worker:', err));
    });
}