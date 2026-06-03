import { state } from './state.js';
import { stopTitleBlink, startTitleBlink } from './audio.js';

// --- Seleção de Elementos do DOM ---
export const setupSection = document.getElementById('setup-section');
export const callSection = document.getElementById('call-section');
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

// Inputs
export const createNameInput = document.getElementById('create-name-input');
export const joinNameInput = document.getElementById('join-name-input');
export const linkNameInput = document.getElementById('link-name-input');

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
export const joiningRoomCodeDisplay = document.getElementById('joining-room-code-display');
export const linkRoomCodeDisplay = document.getElementById('link-room-code-display');
export const shareLinkDisplay = document.getElementById('share-link-display');
export const copyShareLinkBtn = document.getElementById('copy-share-link-btn');

// --- Funções de UI ---

export function showPanel(panel) {
    [panelMain, panelCreate, panelJoinCode, panelJoinName, panelLinkJoin].forEach(p => {
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

export function showCallView(roomId) {
    roomIdDisplay.innerText = roomId;
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
    if (createNameInput) createNameInput.value = '';
    if (joinNameInput) joinNameInput.value = '';
    if (roomCodeInput) roomCodeInput.value = '';
    if (linkNameInput) linkNameInput.value = '';
    
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
