import { state, MAX_PARTICIPANTS } from './state.js';
import {
    errorMessage,
    showCallView,
    showSetupView,
    addParticipantToList,
    updateParticipantUI,
    appendChatMessage,
    deleteMessageLocally,
    toggleHeartReactionLocally,
    setParticipantConnected,
    setParticipantReconnecting
} from './dom.js';
import { playSound, stopTitleBlink } from './audio.js';
import { supabase } from './supabase-config.js';
import { hashPassword } from './utils.js';

// --- Supabase Realtime Channels ---
let roomChannel = null;
let messagesChannel = null;
let localUserId = null;

function isLocalHost() {
    return state.isHost;
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
        console.log('PeerJS desconectado do servidor de sinalização. Reconectando silenciosamente...');
        if (state.peer) {
            state.peer.reconnect();
        }
    });

    state.peer.on('connection', (conn) => {
        console.log('Mesh: Recebeu canal de dados (ignorado):', conn.peer);
    });

    state.peer.on('call', (call) => {
        const incomingPeerId = call.peer;
        console.log('Recebendo chamada de áudio de:', incomingPeerId);

        if (!state.peers.has(incomingPeerId)) {
            state.peers.set(incomingPeerId, { conn: null, call: null, stream: null, name: '', joinTime: Date.now() });
            addParticipantToList(incomingPeerId);
        }

        const peerObj = state.peers.get(incomingPeerId);
        if (peerObj.call) {
            try { peerObj.call.close(); } catch (e) { }
        }
        peerObj.call = call;

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

    state.peer = createPeer(roomCode);

    state.peer.on('open', (id) => {
        console.log('Host: Criado e ouvindo sob ID da sala:', id);
        showCallView(roomCode, state.roomName);
        appendChatMessage(null, 'Você criou e entrou na sala', 'system');
        
        setupSupabaseRealtime(roomCode);
    });

    setupPeerCommonEvents();
}

export async function joinRoom(roomCode, nameToUse, passwordToUse) {
    errorMessage.innerText = '';
    state.localName = nameToUse;
    state.targetRoomCode = roomCode;
    state.roomPassword = passwordToUse;
    if (!state.localName || !state.targetRoomCode) return;

    try {
        if (!supabase) throw new Error('Supabase não inicializado.');

        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('code', roomCode)
            .maybeSingle();

        if (roomError) throw roomError;
        if (!room) {
            errorMessage.innerText = 'Sala não encontrada.';
            return;
        }

        if (room.is_private) {
            const clientHash = await hashPassword(passwordToUse);
            if (clientHash !== room.password_hash) {
                errorMessage.innerText = 'Senha incorreta.';
                return;
            }
        }

        await startMedia();
        state.isHost = false;
        state.roomName = room.name || '';
        state.joinTime = Date.now();

        // Guest cria seu próprio PeerJS com um ID aleatório
        state.peer = createPeer(null);

        state.peer.on('open', (id) => {
            console.log('Guest: ID de Peer criado:', id);
            showCallView(roomCode, state.roomName);
            appendChatMessage(null, 'Você entrou na sala', 'system');

            setupSupabaseRealtime(roomCode);
        });

        setupPeerCommonEvents();

    } catch (error) {
        console.error('Erro ao entrar na sala:', error);
        errorMessage.innerText = error.message || 'Erro ao entrar na sala.';
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

        peerObj.isReconnecting = false;
        setParticipantConnected(peerId);
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

export function removePeer(peerId) {
    if (!state.peers.has(peerId)) return;
    const peerObj = state.peers.get(peerId);

    console.log(`Chamada de áudio com ${peerId} encerrada.`);
    if (peerObj.call) {
        try { peerObj.call.close(); } catch (e) { }
        peerObj.call = null;
    }
    if (peerObj.audioElement) {
        try { peerObj.audioElement.remove(); } catch (e) { }
        peerObj.audioElement = null;
    }

    setParticipantReconnecting(peerId);
}

export function removePeerPermanently(peerId) {
    if (!state.peers.has(peerId)) return;
    console.log('Removendo participante permanentemente:', peerId);
    const peerObj = state.peers.get(peerId);

    if (peerObj.call) {
        try { peerObj.call.close(); } catch (e) { }
    }
    if (peerObj.audioElement) {
        try { peerObj.audioElement.remove(); } catch (e) { }
    }
    if (peerObj.listItemElement) {
        const item = peerObj.listItemElement;
        item.classList.add('fade-out');
        setTimeout(() => {
            try { item.remove(); } catch (e) { }
        }, 500);
    }

    const leavingName = peerObj.name || peerId.substring(0, 5);
    appendChatMessage(null, `${leavingName} saiu da sala`, 'system');

    state.peers.delete(peerId);
    updateParticipantUI();
    playSound('disconnect');
}

export function endCall() {
    state.voluntaryLeave = true;
    playSound('disconnect');
    stopTitleBlink();

    // Encerra canais do Supabase Realtime
    cleanupSupabaseRealtime();

    state.hadParticipantsConnected = false;

    // Fecha conexões e limpa áudios locais
    state.peers.forEach((peerObj) => {
        if (peerObj.call) {
            try { peerObj.call.close(); } catch (e) { }
        }
        if (peerObj.audioElement) {
            try { peerObj.audioElement.remove(); } catch (e) { }
        }
        if (peerObj.listItemElement) {
            try { peerObj.listItemElement.remove(); } catch (e) { }
        }
    });
    state.peers.clear();
    state.chatHistory = [];
    state.displayedMessageIds.clear();

    // Encerra microfone local
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) { }
        });
        state.localStream = null;
    }

    // Destrói o PeerJS local
    if (state.peer) {
        try {
            state.peer.disconnect();
            state.peer.destroy();
        } catch (e) { }
        state.peer = null;
    }

    showSetupView();
}

export async function sendChatMessage(text, media = null) {
    const trimmed = text ? text.trim() : '';
    if (!trimmed && !media) {
        console.warn('[Chat SEND] Ignorado: texto vazio e sem mídia.');
        return;
    }

    console.log('[Chat SEND] Iniciando envio...', { text: trimmed, hasMedia: !!media, roomCode: state.targetRoomCode });

    try {
        const { getCurrentUser } = await import('./auth.js');
        const sessionData = await getCurrentUser();
        if (!sessionData) {
            console.error('[Chat SEND] FALHA: Nenhuma sessão ativa. Mensagem não enviada.');
            return;
        }
        const profile = sessionData.profile;
        console.log('[Chat SEND] Sessão OK.', { senderId: profile.id, senderName: profile.display_name });

        let mediaUrl = null;
        let mimeType = null;

        // Se houver mídia, faz upload para o Supabase Storage primeiro
        if (media && media.dataUrl) {
            mimeType = media.mimeType;
            console.log('[Chat SEND] Fazendo upload da mídia para o Storage...', { mimeType });

            try {
                // Converter base64 dataUrl para Blob
                const response = await fetch(media.dataUrl);
                const blob = await response.blob();

                // Gerar nome de arquivo único
                const ext = mimeType.split('/')[1] || 'bin';
                const fileName = `${state.targetRoomCode}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(fileName, blob, {
                        contentType: mimeType,
                        upsert: false
                    });

                if (uploadError) {
                    console.error('[Chat SEND] ERRO no upload da mídia:', uploadError);
                    throw uploadError;
                }

                // Obter URL pública
                const { data: urlData } = supabase.storage
                    .from('media')
                    .getPublicUrl(uploadData.path);

                mediaUrl = urlData.publicUrl;
                console.log('[Chat SEND] ✅ Upload da mídia concluído:', mediaUrl);
            } catch (uploadErr) {
                console.error('[Chat SEND] EXCEÇÃO no upload da mídia:', uploadErr);
                // Continua sem mídia se o upload falhar
            }
        }

        const insertPayload = {
            room_code: state.targetRoomCode,
            sender_id: profile.id,
            sender_name: profile.display_name,
            text: trimmed || null,
            media_url: mediaUrl,
            mime_type: mimeType
        };

        console.log('[Chat SEND] Inserindo mensagem no banco...');
        const { data, error } = await supabase.from('messages').insert([insertPayload]).select();

        if (error) {
            console.error('[Chat SEND] ERRO no INSERT do Supabase:', error);
            throw error;
        }
        console.log('[Chat SEND] ✅ Mensagem salva no banco com sucesso:', data);
    } catch (err) {
        console.error('[Chat SEND] EXCEÇÃO ao enviar mensagem:', err);
    }
}

export async function notifyDeleteMessage(messageId) {
    try {
        const { error } = await supabase
            .from('messages')
            .update({
                is_deleted: true,
                text: 'Mensagem apagada',
                media_url: null,
                mime_type: null
            })
            .eq('id', messageId);

        if (error) throw error;
    } catch (err) {
        console.error('Erro ao apagar mensagem:', err);
    }
}

export async function notifyReactMessage(messageId, hasReaction) {
    try {
        const { error } = await supabase
            .from('messages')
            .update({ has_heart: hasReaction })
            .eq('id', messageId);

        if (error) throw error;
    } catch (err) {
        console.error('Erro ao reagir a mensagem:', err);
    }
}

// --- Supabase Realtime Handlers ---

async function setupSupabaseRealtime(roomCode) {
    cleanupSupabaseRealtime();

    const { getCurrentUser } = await import('./auth.js');
    const sessionData = await getCurrentUser();
    if (!sessionData) {
        console.error('Realtime Setup: Nenhum usuário autenticado encontrado.');
        return;
    }
    const profile = sessionData.profile;
    localUserId = profile ? profile.id : null;

    // Buscar histórico de chat
    console.log('[Realtime Setup] Buscando histórico de mensagens para sala:', roomCode);
    try {
        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .eq('room_code', roomCode)
            .order('created_at', { ascending: true });

        if (error) throw error;
        console.log(`[Realtime Setup] Histórico carregado: ${messages ? messages.length : 0} mensagens`);
        if (messages && messages.length > 0) {
            syncChatHistory(messages);
        }
    } catch (err) {
        console.error('[Realtime Setup] ERRO ao buscar histórico de chat:', err);
    }

    // Ouvinte em tempo real para novas mensagens / alterações
    console.log('[Realtime Setup] Inscrevendo-se no canal de mensagens postgres_changes...');
    messagesChannel = supabase.channel(`room-messages:${roomCode}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `room_code=eq.${roomCode}`
        }, (payload) => {
            console.log('[Realtime MSG] ⚡ Evento recebido:', payload.eventType, payload);
            handleSupabaseMessageChange(payload, profile.id);
        })
        .subscribe((status) => {
            console.log('[Realtime MSG] Status da inscrição:', status);
        });

    // Rastreamento de Presença
    roomChannel = supabase.channel(`room:${roomCode}`);
    roomChannel
        .on('presence', { event: 'sync' }, () => {
            const presenceState = roomChannel.presenceState();
            handlePresenceSync(presenceState);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                state.joinTime = state.joinTime || Date.now();
                await roomChannel.track({
                    peerId: state.peer.id,
                    userId: profile.id,
                    username: profile.username,
                    displayName: profile.display_name,
                    joinTime: state.joinTime
                });
            }
        });
}

function cleanupSupabaseRealtime() {
    if (roomChannel) {
        try { supabase.removeChannel(roomChannel); } catch (e) { }
        roomChannel = null;
    }
    if (messagesChannel) {
        try { supabase.removeChannel(messagesChannel); } catch (e) { }
        messagesChannel = null;
    }
}

function handleSupabaseMessageChange(payload, localUserId) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    console.log(`[Chat RECEIVE] Processando evento '${eventType}':`, { newRecord, localUserId });

    if (eventType === 'INSERT') {
        const msg = newRecord;
        console.log(`[Chat RENDER] Nova mensagem INSERT:`, { id: msg.id, sender: msg.sender_name, text: msg.text, hasMedia: !!msg.media_url });

        const alreadyInHistory = state.chatHistory.some(m => m.messageId === msg.id);
        if (!alreadyInHistory) {
            state.chatHistory.push({
                messageId: msg.id,
                senderName: msg.sender_name,
                text: msg.text,
                media: msg.media_url ? { dataUrl: msg.media_url, mimeType: msg.mime_type } : null,
                hasHeart: msg.has_heart || false
            });
        } else {
            console.log(`[Chat RENDER] Mensagem ${msg.id} já estava no histórico local.`);
        }

        const isMe = msg.sender_id === localUserId;
        console.log(`[Chat RENDER] Chamando appendChatMessage (isMe=${isMe}, msgId=${msg.id})`);
        appendChatMessage(
            msg.sender_name,
            msg.text || '',
            'user',
            isMe ? 'me' : 'other',
            msg.media_url ? { dataUrl: msg.media_url, mimeType: msg.mime_type } : null,
            msg.id
        );

        if (msg.has_heart) {
            const wrapper = document.querySelector(`[data-message-id="${msg.id}"]`);
            if (wrapper) {
                toggleHeartReactionLocally(wrapper, true);
            }
        }
    } else if (eventType === 'UPDATE') {
        const msg = newRecord;
        const localMsg = state.chatHistory.find(m => m.messageId === msg.id);
        if (localMsg) {
            localMsg.hasHeart = msg.has_heart;
            localMsg.text = msg.text;
        }

        const wrapper = document.querySelector(`[data-message-id="${msg.id}"]`);
        if (wrapper) {
            if (msg.is_deleted) {
                deleteMessageLocally(wrapper);
                if (localMsg) {
                    delete localMsg.media;
                }
            } else {
                toggleHeartReactionLocally(wrapper, msg.has_heart);
            }
        }
    }
}

function syncChatHistory(history) {
    const receivedHistory = history || [];
    receivedHistory.forEach(msg => {
        const messageId = msg.id || msg.messageId;
        const senderName = msg.sender_name || msg.senderName;
        const text = msg.text;
        const media = msg.media_url ? { dataUrl: msg.media_url, mimeType: msg.mime_type } : msg.media;
        const hasHeart = msg.has_heart !== undefined ? msg.has_heart : msg.hasHeart;
        const isDeleted = msg.is_deleted !== undefined ? msg.is_deleted : (text === 'Mensagem apagada');

        let localMsg = state.chatHistory.find(m => m.messageId === messageId);
        if (!localMsg) {
            localMsg = {
                messageId,
                senderName,
                text: isDeleted ? 'Mensagem apagada' : text,
                media: isDeleted ? null : media,
                hasHeart: hasHeart || false
            };
            state.chatHistory.push(localMsg);

            // Determina se a mensagem é nossa
            const isMe = msg.sender_id ? (msg.sender_id === localUserId) : (senderName === state.localName);
            appendChatMessage(
                senderName,
                localMsg.text,
                'user',
                isMe ? 'me' : 'other',
                localMsg.media,
                messageId
            );

            if (localMsg.hasHeart) {
                const wrapper = document.querySelector(`[data-message-id="${messageId}"]`);
                if (wrapper) {
                    toggleHeartReactionLocally(wrapper, true);
                }
            }
        }
    });
}

function handlePresenceSync(presenceState) {
    const activePeers = new Map();

    for (const key in presenceState) {
        presenceState[key].forEach(p => {
            if (p.peerId && p.peerId !== state.peer.id) {
                activePeers.set(p.peerId, p);
            }
        });
    }

    // 1. Remover participantes que se desconectaram
    state.peers.forEach((peerObj, peerId) => {
        if (!activePeers.has(peerId)) {
            console.log(`Presence Sync: Participante ${peerObj.name || peerId} desconectado.`);
            removePeerPermanently(peerId);
        }
    });

    // 2. Adicionar novos participantes
    activePeers.forEach((p, peerId) => {
        const existing = state.peers.get(peerId);
        if (!existing) {
            console.log(`Presence Sync: Novo participante: ${p.displayName} (${peerId})`);
            state.peers.set(peerId, {
                conn: null,
                call: null,
                stream: null,
                name: p.displayName,
                joinTime: p.joinTime
            });

            addParticipantToList(peerId);
            setParticipantConnected(peerId);
            updateParticipantUI();
            appendChatMessage(null, `${p.displayName} entrou na sala`, 'system');
            playSound('connect');

            if (state.peer.id < peerId) {
                initiateCall(peerId);
            }
        } else {
            existing.name = p.displayName;
            existing.joinTime = p.joinTime;
            setParticipantConnected(peerId);

            if (!existing.call && state.peer.id < peerId) {
                console.log(`Presence Sync: Rediscando para ${p.displayName}`);
                initiateCall(peerId);
            }
        }
    });

    updateParticipantUI();
}