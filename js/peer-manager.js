import { state, MAX_PARTICIPANTS } from './state.js';
import { 
    errorMessage, 
    showCallView, 
    showSetupView, 
    addParticipantToList, 
    updateParticipantUI,
    appendChatMessage
} from './dom.js';
import { playSound, stopTitleBlink } from './audio.js';
import { generateRandomCode } from './utils.js';

// --- Reconnection State ---
let isReconnectingToHost = false;
let reconnectAttempts = 0;
let reconnectIntervalId = null;

// --- Chunked Media Transfer ---
const CHUNK_SIZE = 64 * 1024; // 64KB per chunk (safe for WebRTC DataChannel)
const incomingMediaChunks = new Map(); // transferId -> { chunks[], totalChunks, mimeType, senderName, senderId, text }

function generateTransferId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Send media in chunks over a DataChannel connection.
 * @param {RTCDataChannel|PeerJS.DataConnection} conn
 * @param {object} payload - { text, senderName, senderId, media: { dataUrl, mimeType } }
 */
function sendMediaInChunks(conn, payload) {
    const { text, senderName, senderId, media } = payload;
    const transferId = generateTransferId();
    const dataUrl = media.dataUrl;
    const totalChunks = Math.ceil(dataUrl.length / CHUNK_SIZE);

    // Send metadata first
    conn.send({
        type: 'media_start',
        transferId,
        totalChunks,
        mimeType: media.mimeType,
        senderName,
        senderId,
        text: text || '',
        messageId: payload.messageId || null
    });

    // Send chunks sequentially with small delay to avoid overwhelming the channel
    let chunkIndex = 0;
    function sendNextChunk() {
        if (chunkIndex >= totalChunks) return;
        const start = chunkIndex * CHUNK_SIZE;
        const chunk = dataUrl.slice(start, start + CHUNK_SIZE);
        conn.send({
            type: 'media_chunk',
            transferId,
            chunkIndex,
            chunk
        });
        chunkIndex++;
        // Small delay to prevent buffer overflow
        if (chunkIndex < totalChunks) {
            setTimeout(sendNextChunk, 10);
        }
    }
    sendNextChunk();
}

/**
 * Handle an incoming media_start message.
 */
function handleMediaStart(data) {
    incomingMediaChunks.set(data.transferId, {
        chunks: new Array(data.totalChunks),
        totalChunks: data.totalChunks,
        received: 0,
        mimeType: data.mimeType,
        senderName: data.senderName,
        senderId: data.senderId,
        text: data.text || '',
        messageId: data.messageId || null
    });
}

/**
 * Handle an incoming media_chunk message. Returns assembled media object when complete, or null.
 */
function handleMediaChunk(data) {
    const transfer = incomingMediaChunks.get(data.transferId);
    if (!transfer) return null;

    transfer.chunks[data.chunkIndex] = data.chunk;
    transfer.received++;

    if (transfer.received === transfer.totalChunks) {
        incomingMediaChunks.delete(data.transferId);
        const dataUrl = transfer.chunks.join('');
        return {
            senderName: transfer.senderName,
            senderId: transfer.senderId,
            text: transfer.text,
            media: { dataUrl, mimeType: transfer.mimeType },
            messageId: transfer.messageId || null
        };
    }
    return null;
}

export function createPeer(peerId) {
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || 
                    hostname === '127.0.0.1' || 
                    hostname.startsWith('192.168.') || 
                    hostname.startsWith('10.') || 
                    hostname.startsWith('172.');

    let options = {};
    if (isLocal) {
        options = {
            host: hostname,
            port: window.location.port || 9000,
            path: '/peer',
            debug: 1
        };
    }
    
    return peerId ? new Peer(peerId, options) : new Peer(options);
}

export function setupPeerCommonEvents() {
    state.peer.on('disconnected', () => {
        console.log('PeerJS desconectado do servidor. Reconectando...');
        if (state.peer) {
            state.peer.reconnect();
        }
    });

    state.peer.on('call', (call) => {
        const incomingPeerId = call.peer;
        console.log('Recebendo chamada de:', incomingPeerId);
        
        // Se o peer já estava em reconexão, limpa o timer e re-estabelece
        if (state.peers.has(incomingPeerId)) {
            const peerObj = state.peers.get(incomingPeerId);
            if (peerObj.isReconnecting) {
                console.log(`Re-estabelecendo chamada com ${incomingPeerId}`);
                if (peerObj.reconnectTimeoutId) {
                    clearTimeout(peerObj.reconnectTimeoutId);
                    peerObj.reconnectTimeoutId = null;
                }
                peerObj.isReconnecting = false;
                if (peerObj.call) {
                    try { peerObj.call.close(); } catch (e) {}
                }
                peerObj.call = call;
                
                // Restaurar UI
                import('./dom.js').then(module => {
                    module.setParticipantConnected(incomingPeerId);
                });
                
                call.answer(state.localStream);
                setupCallHandlers(call);
                return;
            }
        }
        
        // Resolução de chamadas duplicadas
        if (state.peers.has(incomingPeerId) && state.peers.get(incomingPeerId).call) {
            if (state.peer.id > incomingPeerId) {
                console.log('Fechando chamada duplicada local para aceitar chamada de:', incomingPeerId);
                try {
                    state.peers.get(incomingPeerId).call.close();
                } catch (e) {}
                state.peers.get(incomingPeerId).call = call;
                playSound('incoming');
                call.answer(state.localStream);
                setupCallHandlers(call);
            } else {
                console.log('Rejeitando chamada de entrada duplicada de:', incomingPeerId);
                call.close();
            }
            return;
        }
        
        if (!state.peers.has(incomingPeerId)) {
            state.peers.set(incomingPeerId, { conn: null, call: null, stream: null });
        }
        state.peers.get(incomingPeerId).call = call;
        
        playSound('incoming');
        call.answer(state.localStream);
        setupCallHandlers(call);
    });

    state.peer.on('error', (err) => {
        console.error('Erro no PeerJS:', err);
        errorMessage.innerText = `Erro de conexão: ${err.message}.`;
        endCall();
    });
}

export function initializePeer(peerId) {
    state.isHost = true;
    state.peer = createPeer(peerId);

    state.peer.on('open', (id) => {
        console.log('Host: ID do peer criado:', id);
        showCallView(id);
    });

    setupPeerCommonEvents();

    state.peer.on('connection', (conn) => {
        console.log('Host: Recebeu conexão de dados de:', conn.peer);
        
        conn.on('data', (data) => {
            if (data.type === 'join') {
                const guestName = data.name || conn.peer.substring(0, 5);
                console.log(`Host: Novo peer se juntou: ${guestName} (${conn.peer})`);
                
                // --- Verificação de Reconexão ---
                if (state.peers.has(conn.peer)) {
                    const peerObj = state.peers.get(conn.peer);
                    if (peerObj.isReconnecting) {
                        console.log(`Host: Participante ${guestName} reconectou!`);
                        
                        if (peerObj.reconnectTimeoutId) {
                            clearTimeout(peerObj.reconnectTimeoutId);
                            peerObj.reconnectTimeoutId = null;
                        }
                        
                        peerObj.isReconnecting = false;
                        peerObj.conn = conn;
                        peerObj.name = guestName;
                        
                        import('./dom.js').then(module => {
                            module.setParticipantConnected(conn.peer);
                        });
                        
                        appendChatMessage(null, `${guestName} reconectou-se à sala`, 'system');
                        
                        const peersList = [{ id: state.peer.id, name: state.localName }];
                        state.peers.forEach((pObj, pId) => {
                            if (pId !== conn.peer) {
                                peersList.push({ id: pId, name: pObj.name });
                            }
                        });
                        conn.send({ type: 'peers_list', peers: peersList });
                        
                        state.peers.forEach((pObj, pId) => {
                            if (pId !== conn.peer && pObj.conn) {
                                try {
                                    pObj.conn.send({ type: 'novo_peer', id: conn.peer, name: guestName });
                                } catch (e) {}
                            }
                        });
                        
                        updateParticipantUI();
                        return;
                    }
                }
                
                // Verificar limite de participantes (máximo de 8 no total)
                if (state.peers.size + 1 >= MAX_PARTICIPANTS) {
                    console.log('Host: Sala cheia, rejeitando:', conn.peer);
                    conn.send({ type: 'sala_cheia' });
                    setTimeout(() => conn.close(), 1000);
                    return;
                }
                
                // Adicionar ao Map sem sobrescrever chamada/stream se eles já foram estabelecidos
                if (!state.peers.has(conn.peer)) {
                    state.peers.set(conn.peer, { conn, call: null, stream: null, name: guestName });
                } else {
                    const peerObj = state.peers.get(conn.peer);
                    peerObj.conn = conn;
                    peerObj.name = guestName;
                }
                
                // Enviar lista de IDs e nomes já conectados (incluindo o Host)
                const peersList = [{ id: state.peer.id, name: state.localName }];
                state.peers.forEach((peerObj, pId) => {
                    if (pId !== conn.peer) {
                        peersList.push({ id: pId, name: peerObj.name });
                    }
                });
                conn.send({ type: 'peers_list', peers: peersList });
                
                // Notificar outros peers sobre o novo participante
                state.peers.forEach((peerObj, pId) => {
                    if (pId !== conn.peer && peerObj.conn) {
                        try {
                            peerObj.conn.send({ type: 'novo_peer', id: conn.peer, name: guestName });
                        } catch (e) {}
                    }
                });
                
                addParticipantToList(conn.peer);
                updateParticipantUI();
                
                // Sistema: Notificar entrada no chat
                appendChatMessage(null, `${guestName} entrou na sala`, 'system');
            } else if (data.type === 'chat') {
                console.log('Host: Recebeu mensagem de chat:', data.senderName, data.text);
                appendChatMessage(data.senderName, data.text, 'user', conn.peer, null, data.messageId);
                
                // Encaminhar texto para todos os outros guests
                state.peers.forEach((peerObj, pId) => {
                    if (pId !== conn.peer && peerObj.conn) {
                        try {
                            peerObj.conn.send({ 
                                type: 'chat', 
                                text: data.text, 
                                senderName: data.senderName, 
                                senderId: conn.peer,
                                messageId: data.messageId
                            });
                        } catch (e) {}
                    }
                });
            } else if (data.type === 'media_start') {
                handleMediaStart(data);
            } else if (data.type === 'media_chunk') {
                const assembled = handleMediaChunk(data);
                if (assembled) {
                    console.log('Host: Mídia recebida de:', assembled.senderName);
                    appendChatMessage(assembled.senderName, assembled.text, 'user', conn.peer, assembled.media, assembled.messageId);
                    // Encaminhar mídia em chunks para todos os outros guests
                    state.peers.forEach((peerObj, pId) => {
                        if (pId !== conn.peer && peerObj.conn) {
                            try {
                                sendMediaInChunks(peerObj.conn, {
                                    text: assembled.text,
                                    senderName: assembled.senderName,
                                    senderId: conn.peer,
                                    media: assembled.media,
                                    messageId: assembled.messageId
                                });
                            } catch (e) {}
                        }
                    });
                }
            } else if (data.type === 'delete_message') {
                const wrapper = document.querySelector(`[data-message-id="${data.messageId}"]`);
                if (wrapper) {
                    import('./dom.js').then(module => {
                        module.deleteMessageLocally(wrapper);
                    });
                }
                // Encaminhar para todos os outros guests
                state.peers.forEach((peerObj, pId) => {
                    if (pId !== conn.peer && peerObj.conn) {
                        try {
                            peerObj.conn.send({ type: 'delete_message', messageId: data.messageId });
                        } catch (e) {}
                    }
                });
            } else if (data.type === 'react_message') {
                const wrapper = document.querySelector(`[data-message-id="${data.messageId}"]`);
                if (wrapper) {
                    import('./dom.js').then(module => {
                        module.toggleHeartReactionLocally(wrapper, data.hasReaction);
                    });
                }
                // Encaminhar para todos os outros guests
                state.peers.forEach((peerObj, pId) => {
                    if (pId !== conn.peer && peerObj.conn) {
                        try {
                            peerObj.conn.send({ type: 'react_message', messageId: data.messageId, hasReaction: data.hasReaction });
                        } catch (e) {}
                    }
                });
            }
        });

        conn.on('close', () => {
            removePeer(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Host: Erro na conexão de dados com:', conn.peer, err);
            removePeer(conn.peer);
        });
    });
}

export function initiateCall(targetPeerId) {
    if (!state.localStream) {
        console.error('Stream local não está disponível para iniciar chamada.');
        return;
    }
    if (state.peers.has(targetPeerId) && state.peers.get(targetPeerId).call) {
        return; // Já possui chamada ativa
    }
    
    console.log('Iniciando chamada para:', targetPeerId);
    const call = state.peer.call(targetPeerId, state.localStream);
    
    if (!state.peers.has(targetPeerId)) {
        state.peers.set(targetPeerId, { conn: null, call, stream: null });
    } else {
        state.peers.get(targetPeerId).call = call;
    }
    
    setupCallHandlers(call);
}

export function setupCallHandlers(call) {
    const peerId = call.peer;

    call.on('stream', (remoteStream) => {
        console.log('Recebendo stream remoto de:', peerId);
        
        if (!state.peers.has(peerId)) {
            state.peers.set(peerId, { conn: null, call, stream: remoteStream });
        } else {
            state.peers.get(peerId).stream = remoteStream;
            state.peers.get(peerId).call = call;
        }

        const peerObj = state.peers.get(peerId);
        
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
        removePeer(peerId);
    });

    call.on('error', (err) => {
        console.error('Erro na chamada com:', peerId, err);
        removePeer(peerId);
    });
}

function handleGuestReconnection() {
    if (isReconnectingToHost) return;
    if (!state.peer) return;

    isReconnectingToHost = true;
    reconnectAttempts = 0;
    
    console.log('Guest: Perda de conexão com o Host detectada. Iniciando reconexão automática...');
    appendChatMessage(null, 'Conexão perdida. Tentando reconectar ao Host...', 'system');
    
    const statusMsg = document.getElementById('status-message');
    if (statusMsg) {
        statusMsg.innerText = 'Conexão perdida. Reconectando...';
    }
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.className = 'status-waiting';
    }

    const tryReconnect = () => {
        if (!state.peer || !state.targetRoomCode) {
            clearInterval(reconnectIntervalId);
            return;
        }

        reconnectAttempts++;
        console.log(`Guest: Tentativa de reconexão ${reconnectAttempts}/5...`);

        if (state.peer.disconnected) {
            state.peer.reconnect();
        }

        const hostConn = state.peer.connect(state.targetRoomCode);
        
        const setupTimeout = setTimeout(() => {
            try { hostConn.close(); } catch (e) {}
        }, 4000);

        hostConn.on('open', () => {
            clearTimeout(setupTimeout);
            clearInterval(reconnectIntervalId);
            console.log('Guest: Reconectado ao Host com sucesso!');
            
            isReconnectingToHost = false;
            reconnectAttempts = 0;
            
            if (state.peers.has(state.targetRoomCode)) {
                state.peers.get(state.targetRoomCode).conn = hostConn;
            }
            
            hostConn.send({ type: 'join', name: state.localName });
            initiateCall(state.targetRoomCode);
        });
        
        if (reconnectAttempts >= 5) {
            clearInterval(reconnectIntervalId);
            console.log('Guest: Limite de tentativas de reconexão atingido. Encerrando chamada.');
            appendChatMessage(null, 'Falha ao reconectar. Encerrando chamada.', 'system');
            setTimeout(endCall, 2000);
        }
    };

    tryReconnect();
    reconnectIntervalId = setInterval(tryReconnect, 3500);
}

export function removePeerPermanently(peerId) {
    if (!state.peers.has(peerId)) return;
    console.log('Removendo participante permanentemente da chamada:', peerId);
    const peerObj = state.peers.get(peerId);
    
    if (peerObj.reconnectTimeoutId) {
        clearTimeout(peerObj.reconnectTimeoutId);
        peerObj.reconnectTimeoutId = null;
    }
    
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
    
    const leavingName = peerObj.name || peerId.substring(0, 5);
    appendChatMessage(null, `${leavingName} saiu da sala`, 'system');
    
    state.peers.delete(peerId);
    updateParticipantUI();
    playSound('disconnect');
    
    if (state.isHost) {
        state.peers.forEach((otherPeer) => {
            if (otherPeer.conn) {
                try {
                    otherPeer.conn.send({ type: 'peer_saiu', id: peerId });
                } catch (e) {}
            }
        });
    }
}

export function removePeer(peerId) {
    if (!state.peers.has(peerId)) return;
    const peerObj = state.peers.get(peerId);

    if (peerObj.isReconnecting) return;

    console.log(`Participante ${peerId} desconectado. Entrando em estado de reconexão...`);
    peerObj.isReconnecting = true;
    
    if (peerObj.conn) {
        try { peerObj.conn.close(); } catch (e) {}
        peerObj.conn = null;
    }
    if (peerObj.call) {
        try { peerObj.call.close(); } catch (e) {}
        peerObj.call = null;
    }
    if (peerObj.audioElement) {
        try { peerObj.audioElement.remove(); } catch (e) {}
        peerObj.audioElement = null;
    }

    const peerName = peerObj.name || peerId.substring(0, 5);
    appendChatMessage(null, `${peerName} perdeu a conexão. Aguardando reconexão...`, 'system');

    import('./dom.js').then(module => {
        module.setParticipantReconnecting(peerId);
    });

    if (peerObj.reconnectTimeoutId) {
        clearTimeout(peerObj.reconnectTimeoutId);
    }

    peerObj.reconnectTimeoutId = setTimeout(() => {
        console.log(`Tempo limite de reconexão esgotado para ${peerId}. Removendo permanentemente.`);
        removePeerPermanently(peerId);
    }, 15000);
}

export async function joinRoom(roomCode, nameToUse) {
    errorMessage.innerText = '';
    state.localName = nameToUse;
    state.targetRoomCode = roomCode;
    if (!state.localName || !state.targetRoomCode) return;
    
    try {
        await startMedia();
        state.isHost = false;
        state.peer = createPeer(); // Random ID
        
        state.peer.on('open', (id) => {
            console.log('Guest: ID do peer criado:', id);
            showCallView(state.targetRoomCode);
            
            // Conectar ao Host via DataChannel
            const hostConn = state.peer.connect(state.targetRoomCode);
            
            // Adicionar o Host ao Map (nome será atualizado após receber peers_list)
            state.peers.set(state.targetRoomCode, { conn: hostConn, call: null, stream: null, name: '' });
            
            hostConn.on('open', () => {
                console.log('Guest: Conectado ao Host via DataChannel');
                // Enviar sinalização de entrada com o nome local
                hostConn.send({ type: 'join', name: state.localName });
            });
            
            hostConn.on('data', (data) => {
                if (data.type === 'peers_list') {
                    console.log('Guest: Recebeu lista de peers do Host:', data.peers);
                    data.peers.forEach(p => {
                        if (!state.peers.has(p.id)) {
                            state.peers.set(p.id, { conn: null, call: null, stream: null, name: p.name });
                        } else {
                            state.peers.get(p.id).name = p.name;
                        }
                        addParticipantToList(p.id);
                        initiateCall(p.id);
                    });
                    updateParticipantUI();
                    
                    // Sistema: Notificar entrada no chat
                    appendChatMessage(null, 'Você entrou na sala', 'system');
                } else if (data.type === 'novo_peer') {
                    console.log('Guest: Recebeu novo peer:', data.id, data.name);
                    const peerId = data.id;
                    const peerName = data.name;
                    if (!state.peers.has(peerId)) {
                        state.peers.set(peerId, { conn: null, call: null, stream: null, name: peerName });
                    } else {
                        state.peers.get(peerId).name = peerName;
                    }
                    addParticipantToList(peerId);
                    updateParticipantUI();
                    initiateCall(peerId);
                    
                    // Sistema: Notificar entrada no chat
                    appendChatMessage(null, `${peerName} entrou na sala`, 'system');
                } else if (data.type === 'sala_cheia') {
                    console.log('Guest: Sala cheia, voltando ao setup.');
                    errorMessage.innerText = 'A sala está cheia (máximo de 8 participantes).';
                    endCall();
                } else if (data.type === 'peer_saiu') {
                    console.log('Guest: Participante saiu da sala:', data.id);
                    removePeer(data.id);
                } else if (data.type === 'chat') {
                    console.log('Guest: Recebeu mensagem de chat:', data.senderName, data.text);
                    appendChatMessage(data.senderName, data.text, 'user', data.senderId, null, data.messageId);
                } else if (data.type === 'media_start') {
                    handleMediaStart(data);
                } else if (data.type === 'media_chunk') {
                    const assembled = handleMediaChunk(data);
                    if (assembled) {
                        console.log('Guest: Mídia recebida de:', assembled.senderName);
                        appendChatMessage(assembled.senderName, assembled.text, 'user', assembled.senderId, assembled.media, assembled.messageId);
                    }
                } else if (data.type === 'delete_message') {
                    const wrapper = document.querySelector(`[data-message-id="${data.messageId}"]`);
                    if (wrapper) {
                        import('./dom.js').then(module => {
                            module.deleteMessageLocally(wrapper);
                        });
                    }
                } else if (data.type === 'react_message') {
                    const wrapper = document.querySelector(`[data-message-id="${data.messageId}"]`);
                    if (wrapper) {
                        import('./dom.js').then(module => {
                            module.toggleHeartReactionLocally(wrapper, data.hasReaction);
                        });
                    }
                }
            });
            
            hostConn.on('close', () => {
                console.log('Guest: Conexão de dados com Host fechada.');
                handleGuestReconnection();
            });
            
            hostConn.on('error', (err) => {
                console.error('Guest: Erro na conexão de dados com Host:', err);
                handleGuestReconnection();
            });
        });
        
        setupPeerCommonEvents();
        
    } catch (error) {
        console.error('Erro ao entrar na sala:', error);
        errorMessage.innerText = 'Erro ao acessar o microfone ou conectar.';
    }
}

export async function startMedia() {
    try {
        if (!state.localStream) {
            state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
    } catch (err) {
        console.error('Falha ao obter stream de áudio', err);
        errorMessage.innerText = 'Permissão de microfone é necessária.';
        throw err;
    }
}

export function endCall() {
    playSound('disconnect');
    stopTitleBlink();
    
    state.hadParticipantsConnected = false;
    
    if (reconnectIntervalId) {
        clearInterval(reconnectIntervalId);
        reconnectIntervalId = null;
    }
    isReconnectingToHost = false;
    reconnectAttempts = 0;
    
    // Fechar todas as conexões e chamadas
    state.peers.forEach((peerObj) => {
        if (peerObj.reconnectTimeoutId) {
            clearTimeout(peerObj.reconnectTimeoutId);
        }
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
    state.peers.clear();

    // Parar streams locais
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
        });
        state.localStream = null;
    }

    // Destruir peer local
    if (state.peer) {
        try {
            state.peer.disconnect();
            state.peer.destroy();
        } catch (e) {}
        state.peer = null;
    }

    showSetupView();
}

export function sendChatMessage(text, media = null) {
    const trimmed = text ? text.trim() : '';
    if (!trimmed && !media) return;
    
    const msgId = 'msg-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    
    // Exibir localmente sempre
    appendChatMessage(state.localName, trimmed, 'user', 'me', media, msgId);

    if (state.isHost) {
        // Enviar para todos os convidados
        state.peers.forEach((peerObj) => {
            if (peerObj.conn) {
                try {
                    if (media && media.dataUrl) {
                        // Enviar mídia em chunks (texto incluso no media_start)
                        sendMediaInChunks(peerObj.conn, {
                            text: trimmed,
                            senderName: state.localName,
                            senderId: state.peer.id,
                            media,
                            messageId: msgId
                        });
                    } else {
                        peerObj.conn.send({
                            type: 'chat',
                            text: trimmed,
                            senderName: state.localName,
                            senderId: state.peer.id,
                            messageId: msgId
                        });
                    }
                } catch (e) {
                    console.error('Erro ao enviar mensagem:', e);
                }
            }
        });
    } else {
        // Enviar para o host
        const hostPeerObj = state.peers.get(state.targetRoomCode);
        if (hostPeerObj && hostPeerObj.conn) {
            try {
                if (media && media.dataUrl) {
                    sendMediaInChunks(hostPeerObj.conn, {
                        text: trimmed,
                        senderName: state.localName,
                        senderId: state.peer?.id,
                        media,
                        messageId: msgId
                    });
                } else {
                    hostPeerObj.conn.send({
                        type: 'chat',
                        text: trimmed,
                        senderName: state.localName,
                        messageId: msgId
                    });
                }
            } catch (e) {
                console.error('Erro ao enviar mensagem:', e);
            }
        }
    }
}

/**
 * Notifica a remoção de uma mensagem para os outros participantes da sala.
 */
export function notifyDeleteMessage(messageId) {
    if (state.isHost) {
        state.peers.forEach((peerObj) => {
            if (peerObj.conn) {
                try {
                    peerObj.conn.send({ type: 'delete_message', messageId });
                } catch (e) {}
            }
        });
    } else {
        const hostPeerObj = state.peers.get(state.targetRoomCode);
        if (hostPeerObj && hostPeerObj.conn) {
            try {
                hostPeerObj.conn.send({ type: 'delete_message', messageId });
            } catch (e) {}
        }
    }
}

/**
 * Notifica a reação a uma mensagem para os outros participantes da sala.
 */
export function notifyReactMessage(messageId, hasReaction) {
    if (state.isHost) {
        state.peers.forEach((peerObj) => {
            if (peerObj.conn) {
                try {
                    peerObj.conn.send({ type: 'react_message', messageId, hasReaction });
                } catch (e) {}
            }
        });
    } else {
        const hostPeerObj = state.peers.get(state.targetRoomCode);
        if (hostPeerObj && hostPeerObj.conn) {
            try {
                hostPeerObj.conn.send({ type: 'react_message', messageId, hasReaction });
            } catch (e) {}
        }
    }
}
