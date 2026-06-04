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

// --- Reconnection State ---
let isReconnectingToHost = false;
let reconnectAttempts = 0;
let reconnectIntervalId = null;

// --- Chunked Media Transfer ---
const CHUNK_SIZE = 64 * 1024; // 64KB per chunk (safe for WebRTC DataChannel)
const incomingMediaChunks = new Map(); // transferId -> { chunks[], totalChunks, mimeType, senderName, senderId, text }

function isLocalHost() {
    return state.isHost || state.proxyPeer !== null;
}

export function broadcastRoomState() {
    if (!isLocalHost()) return;
    
    const participants = [
        { id: state.peer.id, name: state.localName, joinTime: state.joinTime }
    ];
    
    state.peers.forEach((peerObj, peerId) => {
        participants.push({
            id: peerId,
            name: peerObj.name,
            joinTime: peerObj.joinTime
        });
    });
    
    state.peers.forEach((peerObj) => {
        if (peerObj.conn && peerObj.conn.open) {
            try {
                peerObj.conn.send({
                    type: 'room_state',
                    participants
                });
            } catch (e) {
                console.error('Erro ao enviar room_state:', e);
            }
        }
    });
}

export function sendMessageToPeer(peerId, message) {
    const peerObj = state.peers.get(peerId);
    if (peerObj && peerObj.conn && peerObj.conn.open) {
        try {
            peerObj.conn.send(message);
            return;
        } catch (e) {
            console.error(`Erro ao enviar mensagem direta para ${peerId}. Tentando via Host relay.`, e);
        }
    }
    
    // Fallback: relay via Host
    if (!isLocalHost() && peerId !== state.targetRoomCode) {
        const hostObj = state.peers.get(state.targetRoomCode);
        if (hostObj && hostObj.conn && hostObj.conn.open) {
            try {
                hostObj.conn.send({
                    type: 'relay_message',
                    targetId: peerId,
                    payload: message
                });
                console.log(`Relay: Mensagem para ${peerId} enviada via Host.`);
            } catch (e) {
                console.error(`Relay: Falha ao enviar via Host para ${peerId}`, e);
            }
        }
    }
}

function syncChatHistory(history) {
    const receivedHistory = history || [];
    receivedHistory.forEach(msg => {
        const localMsg = state.chatHistory.find(m => m.messageId === msg.messageId);
        if (!localMsg) {
            state.chatHistory.push(msg);
            const isMe = msg.senderName === state.localName;
            appendChatMessage(
                msg.senderName,
                msg.text,
                'user',
                isMe ? 'me' : 'other',
                msg.media,
                msg.messageId
            );
            if (msg.hasHeart) {
                const wrapper = document.querySelector(`[data-message-id="${msg.messageId}"]`);
                if (wrapper) {
                    import('./dom.js').then(module => {
                        module.toggleHeartReactionLocally(wrapper, true);
                    });
                }
            }
        } else {
            const wrapper = document.querySelector(`[data-message-id="${msg.messageId}"]`);
            if (msg.text === 'Mensagem apagada' && localMsg.text !== 'Mensagem apagada') {
                localMsg.text = 'Mensagem apagada';
                delete localMsg.media;
                if (wrapper) {
                    import('./dom.js').then(module => {
                        module.deleteMessageLocally(wrapper);
                    });
                }
            }
            if (msg.hasHeart !== localMsg.hasHeart) {
                localMsg.hasHeart = msg.hasHeart;
                if (wrapper) {
                    import('./dom.js').then(module => {
                        module.toggleHeartReactionLocally(wrapper, msg.hasHeart);
                    });
                }
            }
        }
    });
}

function generateTransferId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Send media in chunks over a DataChannel connection.
 */
function sendMediaInChunks(peerId, payload) {
    const { text, senderName, senderId, media } = payload;
    const transferId = generateTransferId();
    const dataUrl = media.dataUrl;
    const totalChunks = Math.ceil(dataUrl.length / CHUNK_SIZE);

    // Send metadata first
    sendMessageToPeer(peerId, {
        type: 'media_start',
        transferId,
        totalChunks,
        mimeType: media.mimeType,
        senderName,
        senderId,
        text: text || '',
        messageId: payload.messageId || null
    });

    // Send chunks sequentially
    let chunkIndex = 0;
    function sendNextChunk() {
        if (!state.peers.has(peerId)) return;
        if (chunkIndex >= totalChunks) return;
        const start = chunkIndex * CHUNK_SIZE;
        const chunk = dataUrl.slice(start, start + CHUNK_SIZE);
        sendMessageToPeer(peerId, {
            type: 'media_chunk',
            transferId,
            chunkIndex,
            chunk
        });
        chunkIndex++;
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
 * Handle an incoming media_chunk message.
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

// Configura conexões de dados recebidas ou criadas (symmetrical mesh)
export function setupDataConnection(conn) {
    const peerId = conn.peer;
    console.log('Mesh: Configurando canal de dados com:', peerId);

    conn.on('data', (data) => {
        handleIncomingData(conn, data);
    });

    conn.on('close', () => {
        console.log('Mesh: Conexão de dados fechada com:', peerId);
        removePeer(peerId);
    });

    conn.on('error', (err) => {
        console.error('Mesh: Erro no canal de dados com:', peerId, err);
        removePeer(peerId);
    });
}

// Trata todos os dados recebidos via canal de dados WebRTC (symmetrical mesh)
function handleIncomingData(conn, data) {
    const peerId = conn.peer;

    if (data.type === 'query_privacy') {
        console.log('P2P Handshake: Respondendo consulta de privacidade');
        conn.send({
            type: 'privacy_response',
            roomType: state.roomType,
            roomName: state.roomName
        });

    } else if (data.type === 'join') {
        // Validação de senha no lado do Host / Proxy Host
        if (state.roomType === 'private' && data.password !== state.roomPassword) {
            conn.send({ type: 'join_error', message: 'Senha incorreta.' });
            setTimeout(() => conn.close(), 1000);
            return;
        }

        // Validação do limite de participantes
        const totalPeers = state.peers.size + 1; // peers + local
        if (totalPeers >= MAX_PARTICIPANTS) {
            conn.send({ type: 'join_error', message: 'A sala está cheia (máximo de 8 participantes).' });
            setTimeout(() => conn.close(), 1000);
            return;
        }

        const guestName = data.name || peerId.substring(0, 5);
        const guestJoinTime = data.joinTime || Date.now();
        console.log(`Mesh: Aceitou entrada do participante ${guestName} (${peerId})`);

        // Adiciona à lista de peers local
        let peerObj = state.peers.get(peerId);
        if (!peerObj) {
            state.peers.set(peerId, { conn, call: null, stream: null, name: guestName, joinTime: guestJoinTime });
            peerObj = state.peers.get(peerId);
        } else {
            peerObj.conn = conn;
            peerObj.name = guestName;
            peerObj.joinTime = guestJoinTime;
        }

        peerObj.isReconnecting = false;
        if (peerObj.reconnectTimeoutId) {
            clearTimeout(peerObj.reconnectTimeoutId);
            peerObj.reconnectTimeoutId = null;
        }
        import('./dom.js').then(module => {
            module.setParticipantConnected(peerId);
        });

        // Envia confirmação contendo todos os outros participantes ativos e histórico de chat
        const peersList = [{ id: state.peer.id, name: state.localName, joinTime: state.joinTime }];
        state.peers.forEach((pObj, pId) => {
            if (pId !== peerId) {
                peersList.push({ id: pId, name: pObj.name, joinTime: pObj.joinTime });
            }
        });

        conn.send({
            type: 'join_success',
            peers: peersList,
            history: state.chatHistory,
            joinTime: guestJoinTime,
            password: state.roomPassword,
            roomType: state.roomType,
            roomName: state.roomName
        });

        // Notifica todos os demais participantes ativos sobre o novo peer via room_state
        broadcastRoomState();

        addParticipantToList(peerId);
        updateParticipantUI();
        appendChatMessage(null, `${guestName} entrou na sala`, 'system');

    } else if (data.type === 'room_state') {
        console.log('Room State Sync: Recebido room_state atualizado do Host:', data.participants);
        
        // 1. Identificar quem saiu (está no nosso state.peers mas não no room_state)
        const currentPeerIds = Array.from(state.peers.keys());
        currentPeerIds.forEach((pId) => {
            if (pId === state.targetRoomCode) return; // Não removemos o Host
            
            const stillInRoom = data.participants.some(p => p.id === pId);
            if (!stillInRoom) {
                console.log(`Room State Sync: Removendo peer ${pId} que não está mais no room_state`);
                removePeerPermanently(pId);
            }
        });
        
        // 2. Identificar novos peers e sincronizar/conectar
        data.participants.forEach((p) => {
            if (p.id === state.peer.id) return; // Ignora o próprio cliente
            if (p.id === state.targetRoomCode) return; // Ignora o host original (já temos conexão dedicada)
            
            const existingPeer = state.peers.get(p.id);
            if (!existingPeer) {
                console.log(`Room State Sync: Novo participante no room_state: ${p.name} (${p.id})`);
                state.peers.set(p.id, { conn: null, call: null, stream: null, name: p.name, joinTime: p.joinTime });
                addParticipantToList(p.id);
                updateParticipantUI();
                appendChatMessage(null, `${p.name} entrou na sala`, 'system');
                
                if (state.peer.id < p.id) {
                    const conn = state.peer.connect(p.id);
                    setupDataConnection(conn);
                    conn.on('open', () => {
                        conn.send({ type: 'join', name: state.localName, joinTime: state.joinTime });
                    });
                    initiateCall(p.id);
                }
            } else {
                existingPeer.name = p.name;
                existingPeer.joinTime = p.joinTime;
                
                // Se a conexão caiu e somos o iniciador, tenta reconectar
                if ((!existingPeer.conn || !existingPeer.conn.open) && state.peer.id < p.id) {
                    console.log(`Room State Sync: Reconectando com ${p.name} (${p.id})`);
                    if (existingPeer.conn) {
                        try { existingPeer.conn.close(); } catch(e) {}
                    }
                    const conn = state.peer.connect(p.id);
                    existingPeer.conn = conn;
                    setupDataConnection(conn);
                    conn.on('open', () => {
                        conn.send({ type: 'join', name: state.localName, joinTime: state.joinTime });
                    });
                    initiateCall(p.id);
                }
            }
        });

    } else if (data.type === 'relay_message') {
        const targetId = data.targetId;
        const targetObj = state.peers.get(targetId);
        if (targetObj && targetObj.conn && targetObj.conn.open) {
            try {
                targetObj.conn.send(data.payload);
                console.log(`Relay: Repassando mensagem de ${peerId} para ${targetId}`);
            } catch (e) {
                console.error(`Relay: Erro ao repassar mensagem de ${peerId} para ${targetId}`, e);
            }
        }

    } else if (data.type === 'chat') {
        console.log('Mesh: Mensagem de chat recebida:', data.senderName, data.text);
        appendChatMessage(data.senderName, data.text, 'user', peerId, null, data.messageId);
        
        // Salva localmente no histórico
        state.chatHistory.push({
            messageId: data.messageId,
            senderName: data.senderName,
            text: data.text,
            hasHeart: false
        });

    } else if (data.type === 'media_start') {
        handleMediaStart(data);

    } else if (data.type === 'media_chunk') {
        const assembled = handleMediaChunk(data);
        if (assembled) {
            console.log('Mesh: Mídia recebida:', assembled.senderName);
            appendChatMessage(assembled.senderName, assembled.text, 'user', peerId, assembled.media, assembled.messageId);
            
            // Salva localmente no histórico
            state.chatHistory.push({
                messageId: assembled.messageId,
                senderName: assembled.senderName,
                text: assembled.text,
                media: assembled.media,
                hasHeart: false
            });
        }

    } else if (data.type === 'delete_message') {
        const wrapper = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (wrapper) {
            import('./dom.js').then(module => {
                module.deleteMessageLocally(wrapper);
            });
        }
        // Atualiza histórico local
        const msg = state.chatHistory.find(m => m.messageId === data.messageId);
        if (msg) {
            msg.text = 'Mensagem apagada';
            delete msg.media;
        }

    } else if (data.type === 'react_message') {
        const wrapper = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (wrapper) {
            import('./dom.js').then(module => {
                module.toggleHeartReactionLocally(wrapper, data.hasReaction);
            });
        }
        // Atualiza histórico local
        const msg = state.chatHistory.find(m => m.messageId === data.messageId);
        if (msg) {
            msg.hasHeart = data.hasReaction;
        }

    } else if (data.type === 'leave') {
        console.log(`Mesh: Participante ${peerId} saiu voluntariamente.`);
        removePeerPermanently(peerId);
    }
}

export function setupPeerCommonEvents() {
    state.peer.on('disconnected', () => {
        console.log('PeerJS desconectado do servidor de sinalização. Reconectando silenciosamente...');
        if (state.peer) {
            state.peer.reconnect();
        }
    });

    // Aceita conexões de dados recebidas de novos participantes na malha mesh
    state.peer.on('connection', (conn) => {
        console.log('Mesh: Recebeu tentativa de DataChannel de:', conn.peer);
        setupDataConnection(conn);
    });

    // Aceita chamadas de áudio recebidas
    state.peer.on('call', (call) => {
        const incomingPeerId = call.peer;
        console.log('Recebendo chamada de áudio de:', incomingPeerId);
        
        if (state.peers.has(incomingPeerId)) {
            const peerObj = state.peers.get(incomingPeerId);
            if (peerObj.isReconnecting) {
                console.log(`Re-estabelecendo chamada de áudio com ${incomingPeerId}`);
                if (peerObj.reconnectTimeoutId) {
                    clearTimeout(peerObj.reconnectTimeoutId);
                    peerObj.reconnectTimeoutId = null;
                }
                peerObj.isReconnecting = false;
                if (peerObj.call) {
                    try { peerObj.call.close(); } catch (e) {}
                }
                peerObj.call = call;
                
                import('./dom.js').then(module => {
                    module.setParticipantConnected(incomingPeerId);
                });
                
                call.answer(state.localStream);
                setupCallHandlers(call);
                return;
            }
        }
        
        if (!state.peers.has(incomingPeerId)) {
            state.peers.set(incomingPeerId, { conn: null, call: null, stream: null, name: '', joinTime: Date.now() });
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

export function initializePeer(roomCode) {
    state.isHost = true;
    state.targetRoomCode = roomCode;
    state.joinTime = 1; // O host original tem joinTime inicial

    // Cria o peer principal do Host com o próprio ID do código da sala
    state.peer = createPeer(roomCode);

    state.peer.on('open', (id) => {
        console.log('Host: Criado e ouvindo sob ID da sala:', id);
        showCallView(roomCode, state.roomName);
        appendChatMessage(null, 'Você criou e entrou na sala', 'system');
    });

    setupPeerCommonEvents();
}

export function initiateCall(targetPeerId) {
    if (!state.localStream) {
        console.error('Stream local não está disponível para iniciar chamada.');
        return;
    }
    if (state.peers.has(targetPeerId) && state.peers.get(targetPeerId).call) {
        return; 
    }
    
    console.log('Mesh: Iniciando chamada de áudio para:', targetPeerId);
    const call = state.peer.call(targetPeerId, state.localStream);
    
    if (!state.peers.has(targetPeerId)) {
        state.peers.set(targetPeerId, { conn: null, call, stream: null, name: '', joinTime: Date.now() });
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
            state.peers.set(peerId, { conn: null, call, stream: remoteStream, name: '', joinTime: Date.now() });
        } else {
            state.peers.get(peerId).stream = remoteStream;
            state.peers.get(peerId).call = call;
        }

        const peerObj = state.peers.get(peerId);
        
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
        console.log('Chamada de áudio encerrada com:', peerId);
        removePeer(peerId);
    });

    call.on('error', (err) => {
        console.error('Erro na chamada de áudio com:', peerId, err);
        removePeer(peerId);
    });
}

// Tentativa de reconexão automática em caso de queda de rede real
function handleGuestReconnection() {
    if (isReconnectingToHost) return;
    if (!state.peer) return;
    if (state.voluntaryLeave) return; // Não reconecta se a saída foi voluntária

    isReconnectingToHost = true;
    reconnectAttempts = 0;
    
    console.log('Perda de conexão detectada. Tentando se reconectar à sala...');
    appendChatMessage(null, 'Conexão perdida. Tentando se reconectar à sala...', 'system');
    
    const statusMsg = document.getElementById('status-message');
    if (statusMsg) {
        statusMsg.innerText = 'Conexão perdida. Reconectando...';
    }
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.className = 'status-waiting';
    }

    const tryReconnect = () => {
        if (!state.peer || !state.targetRoomCode || state.voluntaryLeave) {
            clearInterval(reconnectIntervalId);
            return;
        }

        reconnectAttempts++;
        console.log(`Reconexão: Tentativa ${reconnectAttempts}/5...`);

        if (state.peer.disconnected) {
            state.peer.reconnect();
        }

        // Tenta se conectar novamente ao Host / Proxy Host
        const hostConn = state.peer.connect(state.targetRoomCode);
        
        const setupTimeout = setTimeout(() => {
            try { hostConn.close(); } catch (e) {}
        }, 4000);

        hostConn.on('open', () => {
            clearTimeout(setupTimeout);
            clearInterval(reconnectIntervalId);
            console.log('Reconectado com sucesso ao Host/Proxy da sala!');
            appendChatMessage(null, 'Reconectado com sucesso!', 'system');
            
            isReconnectingToHost = false;
            reconnectAttempts = 0;
            
            // Re-envia handshake de entrada
            hostConn.send({
                type: 'join',
                name: state.localName,
                password: state.roomPassword,
                joinTime: state.joinTime
            });
        });

        hostConn.on('data', (data) => {
            if (data.type === 'join_success') {
                console.log('Reconexão: Recebido join_success do Host.');
                state.joinTime = data.joinTime;
                state.roomPassword = data.password;
                state.roomType = data.roomType;
                state.roomName = data.roomName || '';
                
                const callRoomTitleElement = document.getElementById('call-room-title');
                if (callRoomTitleElement) {
                    callRoomTitleElement.innerText = state.roomName || 'Em chamada';
                }
                
                // Atualiza a conexão do Host
                if (state.peers.has(state.targetRoomCode)) {
                    state.peers.get(state.targetRoomCode).conn = hostConn;
                    state.peers.get(state.targetRoomCode).isReconnecting = false;
                    if (state.peers.get(state.targetRoomCode).reconnectTimeoutId) {
                        clearTimeout(state.peers.get(state.targetRoomCode).reconnectTimeoutId);
                        state.peers.get(state.targetRoomCode).reconnectTimeoutId = null;
                    }
                } else {
                    state.peers.set(state.targetRoomCode, { conn: hostConn, call: null, stream: null, name: 'Host', joinTime: 1 });
                }
                initiateCall(state.targetRoomCode);

                // Sincronizar histórico do chat recebido
                syncChatHistory(data.history);

                // Reconecta aos demais participantes se necessário
                if (data.peers) {
                    data.peers.forEach(p => {
                        if (p.id !== state.targetRoomCode) {
                            const existingPeer = state.peers.get(p.id);
                            if (existingPeer && existingPeer.conn && existingPeer.conn.open) {
                                return;
                            }
                            
                            if (!state.peers.has(p.id)) {
                                state.peers.set(p.id, { conn: null, call: null, stream: null, name: p.name, joinTime: p.joinTime });
                            } else {
                                state.peers.get(p.id).name = p.name;
                                state.peers.get(p.id).joinTime = p.joinTime;
                            }
                            
                            addParticipantToList(p.id);
                            
                            // Só conecta se o nosso ID for lexicograficamente menor para evitar glare
                            if (state.peer.id < p.id) {
                                const conn = state.peer.connect(p.id);
                                setupDataConnection(conn);
                                state.peers.get(p.id).conn = conn;
                                state.peers.get(p.id).isReconnecting = false;
                                if (state.peers.get(p.id).reconnectTimeoutId) {
                                    clearTimeout(state.peers.get(p.id).reconnectTimeoutId);
                                    state.peers.get(p.id).reconnectTimeoutId = null;
                                }
                                
                                conn.on('open', () => {
                                    conn.send({
                                        type: 'join',
                                        name: state.localName,
                                        joinTime: state.joinTime
                                    });
                                });

                                initiateCall(p.id);
                            }
                        }
                    });
                }
                updateParticipantUI();
            } else if (data.type === 'join_error') {
                console.error('Reconexão: Recebido erro do Host:', data.message);
                endCall();
            } else {
                handleIncomingData(hostConn, data);
            }
        });

        hostConn.on('close', () => {
            console.log('Guest (Reconexão): Conexão com Host encerrada.');
            handleGuestReconnection();
        });

        hostConn.on('error', (err) => {
            console.error('Guest (Reconexão): Erro na conexão com Host:', err);
            handleGuestReconnection();
        });

        if (reconnectAttempts >= 5) {
            clearInterval(reconnectIntervalId);
            console.log('Limite de reconexão excedido.');
            appendChatMessage(null, 'Falha ao reconectar. Encerrando chamada.', 'system');
            setTimeout(endCall, 2000);
        }
    };

    tryReconnect();
    reconnectIntervalId = setInterval(tryReconnect, 3500);
}

export function removePeerPermanently(peerId) {
    if (!state.peers.has(peerId)) return;
    console.log('Removendo participante permanentemente:', peerId);
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

    // Se formos o Host/Proxy, notificamos todos os demais sobre a saída
    if (isLocalHost()) {
        broadcastRoomState();
    }

    // Aciona a verificação para promoção automática do Proxy Host (takeover)
    checkHostTakeover();
}

export function removePeer(peerId) {
    if (!state.peers.has(peerId)) return;
    const peerObj = state.peers.get(peerId);

    if (peerObj.isReconnecting) return;
    if (state.voluntaryLeave) return; // Não inicia reconexão se nós saímos voluntariamente

    console.log(`Mesh: Participante ${peerId} desconectado. Entrando em estado temporário de reconexão...`);
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

    // Apenas o Host inicia o timeout de remoção permanente da sala
    if (isLocalHost()) {
        peerObj.reconnectTimeoutId = setTimeout(() => {
            console.log(`Host: Tempo esgotado para reconexão de ${peerId}. Removendo permanentemente.`);
            removePeerPermanently(peerId);
        }, 15000);
    }
}

// Algoritmo de eleição de Host Proxy baseada no tempo de permanência (joinTime)
export function checkHostTakeover() {
    if (state.voluntaryLeave) return;
    if (state.proxyPeer) return; // Já somos o Host Proxy ativo

    const activePeers = [];

    // Adiciona o próprio cliente
    activePeers.push({
        id: state.peer ? state.peer.id : '',
        joinTime: state.joinTime,
        isMe: true
    });

    // Adiciona os demais peers que estão ativos e conectados
    state.peers.forEach((peerObj, pId) => {
        // Exclui o ID do Host original e peers no limbo de reconexão
        if (pId !== state.targetRoomCode && !peerObj.isReconnecting) {
            activePeers.push({
                id: pId,
                joinTime: peerObj.joinTime || Infinity,
                isMe: false
            });
        }
    });

    const validPeers = activePeers.filter(p => p.id);
    if (validPeers.length === 0) return;

    // Ordena pelo joinTime de forma ascendente (o mais antigo primeiro)
    validPeers.sort((a, b) => a.joinTime - b.joinTime);

    console.log('Mesh Takeover Evaluation:', validPeers);

    // Se o cliente local for o primeiro da lista, assume a responsabilidade do código da sala
    if (validPeers[0].isMe) {
        console.log(`Mesh: Somos o participante mais antigo ativo. Assumindo Proxy Host para ${state.targetRoomCode}`);
        initializeProxyHost(state.targetRoomCode);
    }
}

// Inicializa a escuta secundária no ID da sala (Proxy Host)
function initializeProxyHost(roomCode) {
    if (state.proxyPeer) return;

    state.proxyPeer = createPeer(roomCode);

    state.proxyPeer.on('open', (id) => {
        console.log('ProxyHost: Ativo sob código da sala:', id);
    });

    state.proxyPeer.on('connection', (conn) => {
        console.log('ProxyHost: Recebeu canal de handshake de:', conn.peer);
        
        conn.on('data', (data) => {
            if (data.type === 'query_privacy') {
                conn.send({
                    type: 'privacy_response',
                    roomType: state.roomType,
                    roomName: state.roomName
                });
            } else if (data.type === 'join') {
                // Valida senha
                if (state.roomType === 'private' && data.password !== state.roomPassword) {
                    conn.send({ type: 'join_error', message: 'Senha incorreta.' });
                    setTimeout(() => conn.close(), 1000);
                    return;
                }

                // Valida limite de participantes
                const activePeersCount = state.peers.size + 1;
                if (activePeersCount >= MAX_PARTICIPANTS) {
                    conn.send({ type: 'join_error', message: 'A sala está cheia (máximo de 8 participantes).' });
                    setTimeout(() => conn.close(), 1000);
                    return;
                }

                const guestName = data.name || conn.peer.substring(0, 5);
                const guestJoinTime = Date.now();
                console.log(`ProxyHost: Aceitou entrada de ${guestName} (${conn.peer})`);

                // Monta a lista com os IDs reais dos participantes
                const peersList = [{ id: state.peer.id, name: state.localName, joinTime: state.joinTime }];
                state.peers.forEach((pObj, pId) => {
                    peersList.push({ id: pId, name: pObj.name, joinTime: pObj.joinTime });
                });

                conn.send({
                    type: 'join_success',
                    peers: peersList,
                    history: state.chatHistory,
                    joinTime: guestJoinTime,
                    password: state.roomPassword,
                    roomType: state.roomType,
                    roomName: state.roomName
                });
            }
        });
    });

    state.proxyPeer.on('error', (err) => {
        console.error('ProxyHost: Erro no peer proxy:', err);
        if (err.type === 'id-taken') {
            try { state.proxyPeer.destroy(); } catch(e) {}
            state.proxyPeer = null;
        }
    });
}

export async function joinRoom(roomCode, nameToUse, passwordToUse) {
    errorMessage.innerText = '';
    state.localName = nameToUse;
    state.targetRoomCode = roomCode;
    state.roomPassword = passwordToUse;
    if (!state.localName || !state.targetRoomCode) return;
    
    try {
        await startMedia();
        state.isHost = false;
        // Guest cria seu próprio PeerJS com um ID aleatório
        state.peer = createPeer(null);
        
        state.peer.on('open', (id) => {
            console.log('Guest: ID de Peer criado:', id);
            
            // Conectar ao Host/Proxy para autenticação e troca de peers
            const hostConn = state.peer.connect(roomCode);
            
            hostConn.on('open', () => {
                console.log('Guest: Conectado ao Host. Enviando handshake de entrada...');
                hostConn.send({
                    type: 'join',
                    name: state.localName,
                    password: state.roomPassword,
                    joinTime: Date.now()
                });
            });
            
            hostConn.on('data', (data) => {
                if (data.type === 'join_success') {
                    state.roomName = data.roomName || '';
                    showCallView(roomCode, state.roomName);
                    
                    state.joinTime = data.joinTime;
                    state.roomPassword = data.password;
                    state.roomType = data.roomType;

                    // Sincronizar histórico do chat recebido
                    syncChatHistory(data.history);

                    appendChatMessage(null, 'Você entrou na sala', 'system');
                    
                    // Conectar a todos os outros participantes diretamente ( Full-Mesh P2P )
                    console.log('Guest: Conectando aos demais participantes:', data.peers);
                    data.peers.forEach(p => {
                        // Se o ID for o código da sala, significa que é o host original que já estamos conectados!
                        if (p.id === roomCode) {
                            if (!state.peers.has(p.id)) {
                                state.peers.set(p.id, { conn: hostConn, call: null, stream: null, name: p.name, joinTime: p.joinTime });
                            }
                            initiateCall(p.id);
                        } else {
                            if (!state.peers.has(p.id)) {
                                state.peers.set(p.id, { conn: null, call: null, stream: null, name: p.name, joinTime: p.joinTime });
                            }
                            addParticipantToList(p.id);
                            
                            // Só conecta se o nosso ID for lexicograficamente menor para evitar glare
                            if (state.peer.id < p.id) {
                                const conn = state.peer.connect(p.id);
                                setupDataConnection(conn);
                                state.peers.get(p.id).conn = conn;

                                conn.on('open', () => {
                                    conn.send({
                                        type: 'join',
                                        name: state.localName,
                                        joinTime: state.joinTime
                                    });
                                });

                                initiateCall(p.id);
                            }
                        }
                    });
                    updateParticipantUI();

                } else if (data.type === 'join_error') {
                    console.error('Guest: Erro na autenticação de entrada:', data.message);
                    errorMessage.innerText = data.message;
                    endCall();
                } else {
                    handleIncomingData(hostConn, data);
                }
            });
            
            hostConn.on('close', () => {
                console.log('Guest: Conexão com Host encerrada.');
                handleGuestReconnection();
            });
            
            hostConn.on('error', (err) => {
                console.error('Guest: Erro de sinalização com Host:', err);
                handleGuestReconnection();
            });
        });
        
        setupPeerCommonEvents();
        
    } catch (error) {
        console.error('Erro ao entrar na sala:', error);
        errorMessage.innerText = 'Erro ao acessar o microfone.';
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
    state.voluntaryLeave = true;
    playSound('disconnect');
    stopTitleBlink();
    
    // Notifica os outros peers diretamente via DataChannel sobre nossa saída voluntária
    if (state.peer) {
        state.peers.forEach((peerObj) => {
            if (peerObj.conn) {
                try {
                    peerObj.conn.send({ type: 'leave' });
                } catch (e) {}
            }
        });
    }

    state.hadParticipantsConnected = false;
    
    if (reconnectIntervalId) {
        clearInterval(reconnectIntervalId);
        reconnectIntervalId = null;
    }
    isReconnectingToHost = false;
    reconnectAttempts = 0;
    
    // Fecha o Host Proxy ativo (se houver)
    if (state.proxyPeer) {
        try {
            state.proxyPeer.disconnect();
            state.proxyPeer.destroy();
        } catch (e) {}
        state.proxyPeer = null;
    }

    // Fecha conexões e limpa áudios locais
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
    state.chatHistory = [];
    state.displayedMessageIds.clear();

    // Encerra microfone local
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
        });
        state.localStream = null;
    }

    // Destrói o PeerJS local
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
    
    // 1. Exibir localmente e salvar no histórico local
    appendChatMessage(state.localName, trimmed, 'user', 'me', media, msgId);
    state.chatHistory.push({
        messageId: msgId,
        senderName: state.localName,
        text: trimmed,
        media,
        hasHeart: false
    });

    // 2. Enviar em tempo real para todos os outros participantes da sala
    state.peers.forEach((peerObj, peerId) => {
        if (media && media.dataUrl) {
            sendMediaInChunks(peerId, {
                text: trimmed,
                senderName: state.localName,
                senderId: state.peer.id,
                media,
                messageId: msgId
            });
        } else {
            sendMessageToPeer(peerId, {
                type: 'chat',
                text: trimmed,
                senderName: state.localName,
                senderId: state.peer.id,
                messageId: msgId
            });
        }
    });
}

export function notifyDeleteMessage(messageId) {
    // 1. Excluir no histórico local
    const msg = state.chatHistory.find(m => m.messageId === messageId);
    if (msg) {
        msg.text = 'Mensagem apagada';
        delete msg.media;
    }

    // 2. Notificar todos os peers em tempo real
    state.peers.forEach((peerObj, peerId) => {
        sendMessageToPeer(peerId, { type: 'delete_message', messageId });
    });
}

export function notifyReactMessage(messageId, hasReaction) {
    // 1. Registrar no histórico local
    const msg = state.chatHistory.find(m => m.messageId === messageId);
    if (msg) {
        msg.hasHeart = hasReaction;
    }

    // 2. Notificar todos os peers em tempo real
    state.peers.forEach((peerObj, peerId) => {
        sendMessageToPeer(peerId, { type: 'react_message', messageId, hasReaction });
    });
}

// --- Loop de Reconciliação Periódica ---
setInterval(() => {
    if (!state.peer || state.peer.destroyed || state.voluntaryLeave) return;
    
    // O Host não precisa rodar o loop de reconciliação de conexões com os convidados
    if (isLocalHost()) return;

    state.peers.forEach((peerObj, peerId) => {
        // Ignora a conexão com o Host (ela é cuidada pelo handleGuestReconnection)
        if (peerId === state.targetRoomCode) return;

        // Se a conexão não está aberta e somos o iniciador (id menor)
        if ((!peerObj.conn || !peerObj.conn.open) && state.peer.id < peerId) {
            console.log(`Reconciliation Loop: Restabelecendo conexão com ${peerObj.name || peerId}`);
            if (peerObj.conn) {
                try { peerObj.conn.close(); } catch (e) {}
            }
            
            const conn = state.peer.connect(peerId);
            peerObj.conn = conn;
            setupDataConnection(conn);
            conn.on('open', () => {
                conn.send({ type: 'join', name: state.localName, joinTime: state.joinTime });
            });
            
            // Re-inicia chamada de áudio se necessário
            initiateCall(peerId);
        }
    });
}, 5000);
