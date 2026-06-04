import { state } from './state.js';
import { stopTitleBlink, startTitleBlink, playChatChime, startVoiceVisualizer, stopVoiceVisualizer } from './audio.js';

// --- Seleção de Elementos do DOM ---
export const setupSection = document.getElementById('setup-section');
export const callSection = document.getElementById('call-section');
export const callRoomTitle = document.getElementById('call-room-title');
export const createRoomBtn = document.getElementById('create-room-btn');
export const joinRoomBtn = document.getElementById('join-room-btn');
export const roomCodeInput = document.getElementById('room-code-input');
export const hangUpBtn = document.getElementById('hang-up-btn');
export const roomIdDisplay = document.getElementById('room-id-display');
export const statusDiv = document.getElementById('status');
export const statusMessage = document.getElementById('status-message');
export const errorMessage = document.getElementById('error-message');
export const copyRoomIdBtn = document.getElementById('copy-room-id-btn');
export const toggleMuteBtn = document.getElementById('toggle-mute-btn');
export const muteBtnText = document.getElementById('mute-btn-text');

// Wizard Panels
export const panelMain = document.getElementById('panel-main');
export const panelCreate = document.getElementById('panel-create');
export const panelJoinCode = document.getElementById('panel-join-code');
export const panelJoinName = document.getElementById('panel-join-name');
export const panelLinkJoin = document.getElementById('panel-link-join');
export const panelAuth = document.getElementById('panel-auth');

// Inputs
export const createRoomNameInput = document.getElementById('create-room-name-input');
export const createNameInput = document.getElementById('create-name-input');
export const joinNameInput = document.getElementById('join-name-input');
export const linkNameInput = document.getElementById('link-name-input');
export const privacyPublicBtn = document.getElementById('privacy-public-btn');
export const privacyPrivateBtn = document.getElementById('privacy-private-btn');
export const createPasswordWrapper = document.getElementById('create-password-wrapper');
export const createPasswordInput = document.getElementById('create-password-input');
export const joinPasswordWrapper = document.getElementById('join-password-wrapper');
export const joinPasswordInput = document.getElementById('join-password-input');
export const linkPasswordWrapper = document.getElementById('link-password-wrapper');
export const linkPasswordInput = document.getElementById('link-password-input');

// Wizard Buttons
export const btnGoCreate = document.getElementById('btn-go-create');
export const btnGoJoin = document.getElementById('btn-go-join');
export const btnBackToMainFromCreate = document.getElementById('btn-back-to-main-from-create');
export const btnBackToMainFromJoin = document.getElementById('btn-back-to-main-from-join');
export const btnBackToCode = document.getElementById('btn-back-to-code');
export const btnCancelLinkJoin = document.getElementById('btn-cancel-link-join');
export const joinCodeNextBtn = document.getElementById('join-code-next-btn');
export const linkJoinConfirmBtn = document.getElementById('link-join-confirm-btn');

// Displays
export const joiningRoomNameDisplay = document.getElementById('joining-room-name-display');
export const joiningRoomCodeDisplay = document.getElementById('joining-room-code-display');
export const linkRoomNameDisplay = document.getElementById('link-room-name-display');
export const linkRoomCodeDisplay = document.getElementById('link-room-code-display');
export const shareLinkDisplay = document.getElementById('share-link-display');
export const copyShareLinkBtn = document.getElementById('copy-share-link-btn');

// Chat Elements
export const tabCallBtn = document.getElementById('tab-call-btn');
export const tabChatBtn = document.getElementById('tab-chat-btn');
export const chatBadge = document.getElementById('chat-badge');
export const callTabContent = document.getElementById('call-tab-content');
export const chatTabContent = document.getElementById('chat-tab-content');
export const chatMessages = document.getElementById('chat-messages');
export const chatMessageInput = document.getElementById('chat-message-input');
export const sendChatBtn = document.getElementById('send-chat-btn');

// Media Elements
export const attachMediaBtn = document.getElementById('attach-media-btn');
export const mediaFileInput = document.getElementById('media-file-input');
export const mediaPreviewContainer = document.getElementById('media-preview-container');
export const mediaPreviewImg = document.getElementById('media-preview-img');
export const mediaPreviewVideo = document.getElementById('media-preview-video');
export const cancelMediaBtn = document.getElementById('cancel-media-btn');

// --- Funções de UI ---

export function showPanel(panel) {
    [panelMain, panelCreate, panelJoinCode, panelJoinName, panelLinkJoin, panelAuth].forEach(p => {
        if (p) p.style.display = 'none';
    });
    if (panel) panel.style.display = 'block';
    errorMessage.innerText = '';
}

export function showView(viewToShow) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    viewToShow.classList.add('active');
}

export function updateMuteButtonUI() {
    toggleMuteBtn.classList.toggle('muted', state.isMuted);
    muteBtnText.innerText = state.isMuted ? 'Desmutar' : 'Mutar';
    
    const muteIcon = document.getElementById('mute-icon');
    if (muteIcon) {
        muteIcon.innerText = state.isMuted ? 'mic_off' : 'mic';
    }
    
    const localNameSpan = document.getElementById('local-participant-name');
    if (localNameSpan) {
        localNameSpan.innerText = state.isMuted ? `Você (${state.localName}) (Mutado)` : `Você (${state.localName})`;
    }
}

export function showCallView(roomId, roomName) {
    // Resetar abas e mensagens do chat
    showTab('call');
    if (chatMessages) chatMessages.innerHTML = '';
    state.unreadCount = 0;
    updateChatBadgeUI();

    roomIdDisplay.innerText = roomId;
    if (callRoomTitle) {
        callRoomTitle.innerText = roomName || 'Em chamada';
    }
    state.isMuted = false;
    updateMuteButtonUI();
    
    // Gerar e exibir o link de compartilhamento
    if (shareLinkDisplay) {
        const shareLink = window.location.origin + window.location.pathname + '?room=' + roomId;
        shareLinkDisplay.innerText = shareLink;
    }
    
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
        text.id = 'local-participant-name';
        text.innerText = `Você (${state.localName})`;
        li.appendChild(dot);
        li.appendChild(text);
        list.appendChild(li);
    }
    
    showView(callSection);
    updateParticipantUI();
    if (state.localStream) {
        startVoiceVisualizer(state.localStream);
    }
}

export function showSetupView() {
    statusDiv.classList.add('status-waiting');
    statusDiv.classList.remove('status-connected');
    statusMessage.innerText = 'Aguardando outro participante';
    
    // Esconder seção de participantes
    const partSection = document.getElementById('participants-section');
    if (partSection) {
        partSection.style.display = 'none';
    }
    
    // Resetar inputs e botões do setup (wizard)
    if (createRoomNameInput) createRoomNameInput.value = '';
    if (createNameInput) createNameInput.value = '';
    if (joinNameInput) joinNameInput.value = '';
    if (roomCodeInput) roomCodeInput.value = '';
    if (linkNameInput) linkNameInput.value = '';
    if (createPasswordInput) createPasswordInput.value = '';
    if (joinPasswordInput) joinPasswordInput.value = '';
    if (linkPasswordInput) linkPasswordInput.value = '';
    
    if (createPasswordWrapper) createPasswordWrapper.style.display = 'none';
    if (joinPasswordWrapper) joinPasswordWrapper.style.display = 'none';
    if (linkPasswordWrapper) linkPasswordWrapper.style.display = 'none';
    
    if (privacyPublicBtn) privacyPublicBtn.classList.add('active');
    if (privacyPrivateBtn) privacyPrivateBtn.classList.remove('active');
    
    state.roomType = 'public';
    state.roomPassword = '';
    state.voluntaryLeave = false;
    
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
    joinCodeNextBtn.disabled = true;
    linkJoinConfirmBtn.disabled = true;
    
    const hangUpTextSpan = document.getElementById('hang-up-btn-text');
    if (hangUpTextSpan) {
        hangUpTextSpan.innerText = 'Desligar';
    }
    
    // Limpar o parâmetro de busca na URL ao voltar para a tela inicial
    window.history.replaceState({}, document.title, window.location.pathname);
    
    stopVoiceVisualizer();
    showPanel(panelMain);
    showView(setupSection);
}

export function addParticipantToList(peerId) {
    if (!state.peers.has(peerId)) return;
    const peerObj = state.peers.get(peerId);
    
    // Se já está na lista, garante que o nome exibido esteja atualizado
    if (peerObj.listItemElement) {
        const textSpan = peerObj.listItemElement.querySelector('span:not(.status-dot)');
        if (textSpan) {
            textSpan.innerText = peerObj.name || peerId.substring(0, 5);
        }
        return;
    }
    
    const list = document.getElementById('participant-list');
    if (!list) return;
    
    const li = document.createElement('li');
    li.className = 'participant-item';
    
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    
    const text = document.createElement('span');
    const displayName = peerObj.name || peerId.substring(0, 5);
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

export function updateParticipantUI() {
    const totalParticipants = state.peers.size + 1;
    const countDiv = document.getElementById('participant-count');
    if (countDiv) {
        countDiv.innerText = `${totalParticipants} / 8 participantes`;
    }
    
    const hangUpTextSpan = document.getElementById('hang-up-btn-text');
    
    if (totalParticipants > 1) {
        state.hadParticipantsConnected = true;
        statusDiv.classList.remove('status-waiting');
        statusDiv.classList.add('status-connected');
        statusMessage.innerText = 'Conectado!';
        if (hangUpTextSpan) {
            hangUpTextSpan.innerText = 'Desligar';
        }
        stopTitleBlink();
    } else {
        statusDiv.classList.add('status-waiting');
        statusDiv.classList.remove('status-connected');
        
        if (state.hadParticipantsConnected) {
            statusMessage.innerText = 'Todos saíram da sala';
            if (hangUpTextSpan) {
                hangUpTextSpan.innerText = 'Encerrar Sala';
            }
        } else {
            statusMessage.innerText = 'Aguardando outro participante';
            if (hangUpTextSpan) {
                hangUpTextSpan.innerText = 'Desligar';
            }
        }
        startTitleBlink('Aguardando - Vocal');
    }
}

// --- Funções do Chat ---

export function showTab(tabName) {
    state.activeTab = tabName;
    if (tabName === 'call') {
        tabCallBtn.classList.add('active');
        tabChatBtn.classList.remove('active');
        callTabContent.style.display = 'flex';
        chatTabContent.style.display = 'none';
    } else if (tabName === 'chat') {
        tabCallBtn.classList.remove('active');
        tabChatBtn.classList.add('active');
        callTabContent.style.display = 'none';
        chatTabContent.style.display = 'flex';
        
        // Limpar notificações do badge ao abrir o chat
        state.unreadCount = 0;
        updateChatBadgeUI();
        
        // Focar no campo de entrada do chat
        if (chatMessageInput) {
            setTimeout(() => chatMessageInput.focus(), 50);
        }
    }
}

export function updateChatBadgeUI() {
    if (!chatBadge) return;
    chatBadge.style.display = state.unreadCount > 0 ? 'block' : 'none';
}

export function appendChatMessage(senderName, text, type = 'user', senderId = null, media = null, messageId = null) {
    if (!chatMessages) return;
    
    if (type === 'system') {
        const sysDiv = document.createElement('div');
        sysDiv.className = 'message-system';
        sysDiv.innerText = text;
        chatMessages.appendChild(sysDiv);
    } else {
        const isOutgoing = senderId === state.peer?.id || senderId === 'me';
        
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`;
        
        // Atribui o ID da mensagem para sincronização
        const msgId = messageId || 'msg-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        
        if (state.displayedMessageIds.has(msgId)) {
            return;
        }
        state.displayedMessageIds.add(msgId);
        
        wrapper.dataset.messageId = msgId;
        
        if (!isOutgoing && senderName) {
            const senderDiv = document.createElement('div');
            senderDiv.className = 'message-sender';
            senderDiv.innerText = senderName;
            wrapper.appendChild(senderDiv);
        }

        // Render media if present
        if (media && media.dataUrl) {
            const isVideo = media.mimeType && media.mimeType.startsWith('video/');
            const mediaEl = document.createElement(isVideo ? 'video' : 'img');
            mediaEl.src = media.dataUrl;
            mediaEl.className = isVideo ? 'message-media-video' : 'message-media-img';
            if (isVideo) {
                mediaEl.controls = true;
                mediaEl.muted = false;
                mediaEl.playsInline = true;
            }
            mediaEl.addEventListener('click', () => openMediaLightbox(media.dataUrl, isVideo));
            wrapper.appendChild(mediaEl);
        }

        // Render text bubble if there's text
        if (text && text.trim()) {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            bubble.innerText = text;
            wrapper.appendChild(bubble);
        }
        
        chatMessages.appendChild(wrapper);

        // --- Delete interaction (long press on outgoing messages) ---
        if (isOutgoing) {
            setupDeleteInteraction(wrapper);
        }

        // --- Heart reaction (double tap on incoming messages) ---
        if (!isOutgoing) {
            setupHeartReaction(wrapper);
        }
        
        // Notificar se a mensagem veio de outra pessoa
        if (!isOutgoing) {
            if (state.activeTab === 'call') {
                state.unreadCount++;
                updateChatBadgeUI();
            }
            playChatChime();
        }
    }
    
    // Auto-scroll: rola sempre se for mensagem nossa (outgoing),
    // senão faz auto-scroll inteligente (se estiver perto do fim)
    const isOutgoingMsg = senderId === state.peer?.id || senderId === 'me';
    if (isOutgoingMsg && type !== 'system') {
        scrollToBottom();
    } else {
        scrollToBottomIfNear();
    }
}

/**
 * Rola para o final do chat imediatamente.
 */
function scrollToBottom() {
    if (!chatMessages) return;
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

/**
 * Rola para o final do chat somente se o usuário estiver a menos de 80px do fim.
 * Isso evita interromper o scroll manual quando o usuário está lendo mensagens antigas.
 */
function scrollToBottomIfNear() {
    if (!chatMessages) return;
    const threshold = 80;
    const distanceFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
    if (distanceFromBottom <= threshold) {
        chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
    }
}

/**
 * Configura o gesto de pressionar e segurar (long press) ou clique com botão direito (context menu) para apagar mensagens enviadas.
 */
function setupDeleteInteraction(wrapper) {
    let pressTimer = null;
    let didLongPress = false;

    const startPress = (e) => {
        didLongPress = false;
        pressTimer = setTimeout(() => {
            didLongPress = true;
            showDeletePopup(wrapper, e);
        }, 500);
    };

    const cancelPress = () => {
        clearTimeout(pressTimer);
    };

    // Touch (mobile)
    wrapper.addEventListener('touchstart', startPress, { passive: true });
    wrapper.addEventListener('touchend', cancelPress);
    wrapper.addEventListener('touchmove', cancelPress, { passive: true });

    // Mouse (desktop - clique esquerdo longo)
    wrapper.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            startPress(e);
        }
    });
    wrapper.addEventListener('mouseup', cancelPress);
    wrapper.addEventListener('mouseleave', cancelPress);

    // Clique com botão direito (desktop context menu) ou long press nativo no mobile
    wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showDeletePopup(wrapper, e);
    });
}

/**
 * Exibe o popup de confirmação de exclusão acima da mensagem (ou abaixo, se estiver muito próximo ao topo).
 */
function showDeletePopup(wrapper, triggerEvent) {
    // Evitar duplicatas
    if (document.querySelector('.delete-popup')) return;

    const popup = document.createElement('div');
    popup.className = 'delete-popup';

    // Se estiver muito próximo ao topo do container de chat, posiciona abaixo para não ser cortado
    if (chatMessages) {
        const rect = wrapper.getBoundingClientRect();
        const chatRect = chatMessages.getBoundingClientRect();
        const spaceAbove = rect.top - chatRect.top;
        if (spaceAbove < 60) {
            popup.classList.add('position-below');
        }
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-popup-btn';
    deleteBtn.innerHTML = '<span class="material-symbols-rounded">delete</span> Apagar mensagem';

    deleteBtn.addEventListener('click', () => {
        deleteMessage(wrapper);
        popup.remove();
    });

    popup.appendChild(deleteBtn);
    wrapper.style.position = 'relative';
    wrapper.appendChild(popup);

    // Fechar ao clicar fora
    const closeOnOutside = (e) => {
        if (!popup.contains(e.target) && e.target !== wrapper) {
            popup.remove();
            document.removeEventListener('click', closeOnOutside, true);
            document.removeEventListener('touchstart', closeOnOutside, true);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeOnOutside, true);
        document.addEventListener('touchstart', closeOnOutside, true);
    }, 50);
}

/**
 * Remove visualmente o conteúdo de uma mensagem e substitui por "Mensagem apagada" localmente.
 */
export function deleteMessageLocally(wrapper) {
    // Remover conteúdo existente (sender, mídia, bubble, popup), mas manter o wrapper e a reação
    Array.from(wrapper.children).forEach(child => {
        if (!child.classList.contains('message-sender') && !child.classList.contains('message-reaction') && !child.classList.contains('delete-popup')) {
            child.classList.add('deleting');
            setTimeout(() => child.remove(), 200);
        }
    });

    // Remover qualquer popup de deleção pendente
    const popup = wrapper.querySelector('.delete-popup');
    if (popup) popup.remove();

    setTimeout(() => {
        if (!wrapper.querySelector('.message-deleted')) {
            const deleted = document.createElement('div');
            deleted.className = 'message-bubble message-deleted';
            deleted.innerHTML = '<span class="material-symbols-rounded">do_not_disturb_on</span> Mensagem apagada';
            wrapper.appendChild(deleted);
        }
    }, 220);
}

/**
 * Apaga a mensagem localmente e notifica os outros participantes.
 */
function deleteMessage(wrapper) {
    deleteMessageLocally(wrapper);
    
    // Notifica via peer connection usando importação dinâmica
    const messageId = wrapper.dataset.messageId;
    if (messageId) {
        import('./peer-manager.js').then(module => {
            module.notifyDeleteMessage(messageId);
        });
    }
}

/**
 * Configura reação de coração com duplo clique/toque em mensagens recebidas.
 */
function setupHeartReaction(wrapper) {
    let lastTap = 0;
    let tapTimeout = null;

    const handleDoubleTap = (e) => {
        const now = Date.now();
        const timeSinceLastTap = now - lastTap;

        if (timeSinceLastTap < 350 && timeSinceLastTap > 0) {
            // Double tap detected
            clearTimeout(tapTimeout);
            e.preventDefault();
            toggleHeartReaction(wrapper);
        } else {
            tapTimeout = setTimeout(() => {}, 350);
        }
        lastTap = now;
    };

    wrapper.addEventListener('touchend', handleDoubleTap);
    wrapper.addEventListener('dblclick', (e) => {
        e.preventDefault();
        toggleHeartReaction(wrapper);
    });

    // Evita seleção de texto no duplo clique (melhora a experiência no desktop)
    wrapper.addEventListener('mousedown', (e) => {
        if (e.detail > 1) {
            e.preventDefault();
        }
    });
}

/**
 * Altera o estado visual da reação de coração localmente.
 */
export function toggleHeartReactionLocally(wrapper, forceState = null) {
    const existing = wrapper.querySelector('.message-reaction');
    
    if (forceState === true && existing) return;
    if (forceState === false && !existing) return;

    if (existing) {
        existing.classList.add('reaction-removing');
        setTimeout(() => existing.remove(), 250);
        return;
    }

    const reaction = document.createElement('div');
    reaction.className = 'message-reaction';
    reaction.textContent = '❤️';
    wrapper.appendChild(reaction);

    // Animação de entrada com pop
    requestAnimationFrame(() => {
        reaction.classList.add('reaction-visible');
    });
}

/**
 * Adiciona ou remove a reação de coração numa mensagem e notifica os outros participantes.
 */
function toggleHeartReaction(wrapper) {
    const existing = wrapper.querySelector('.message-reaction');
    const hasReaction = !existing;

    toggleHeartReactionLocally(wrapper);

    const messageId = wrapper.dataset.messageId;
    if (messageId) {
        import('./peer-manager.js').then(module => {
            module.notifyReactMessage(messageId, hasReaction);
        });
    }
}

/**
 * Define o estado visual do participante como reconectando.
 */
export function setParticipantReconnecting(peerId) {
    if (!state.peers.has(peerId)) return;
    const peerObj = state.peers.get(peerId);
    if (peerObj.listItemElement) {
        peerObj.listItemElement.classList.add('reconnecting');
        const textSpan = peerObj.listItemElement.querySelector('span:not(.status-dot)');
        if (textSpan) {
            textSpan.innerText = `${peerObj.name || peerId.substring(0, 5)} (Reconectando...)`;
        }
    }
}

/**
 * Remove o estado visual de reconexão do participante.
 */
export function setParticipantConnected(peerId) {
    if (!state.peers.has(peerId)) return;
    const peerObj = state.peers.get(peerId);
    if (peerObj.listItemElement) {
        peerObj.listItemElement.classList.remove('reconnecting');
        const textSpan = peerObj.listItemElement.querySelector('span:not(.status-dot)');
        if (textSpan) {
            textSpan.innerText = peerObj.name || peerId.substring(0, 5);
        }
    }
}

function openMediaLightbox(src, isVideo) {
    const overlay = document.createElement('div');
    overlay.className = 'media-lightbox';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'media-lightbox-close';
    closeBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';
    closeBtn.addEventListener('click', () => overlay.remove());

    const mediaEl = document.createElement(isVideo ? 'video' : 'img');
    mediaEl.src = src;
    if (isVideo) {
        mediaEl.controls = true;
        mediaEl.autoplay = true;
        mediaEl.playsInline = true;
    }
    mediaEl.addEventListener('click', (e) => e.stopPropagation());

    overlay.addEventListener('click', () => overlay.remove());
    overlay.appendChild(closeBtn);
    overlay.appendChild(mediaEl);
    document.body.appendChild(overlay);
}
