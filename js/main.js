import { state } from './state.js';
import { 
    // Elements
    createRoomBtn,
    joinRoomBtn,
    roomCodeInput,
    hangUpBtn,
    roomIdDisplay,
    errorMessage,
    copyRoomIdBtn,
    toggleMuteBtn,
    panelCreate,
    panelJoinCode,
    panelJoinName,
    panelLinkJoin,
    panelMain,
    createNameInput,
    joinNameInput,
    linkNameInput,
    btnGoCreate,
    btnGoJoin,
    btnBackToMainFromCreate,
    btnBackToMainFromJoin,
    btnBackToCode,
    btnCancelLinkJoin,
    joinCodeNextBtn,
    linkJoinConfirmBtn,
    joiningRoomCodeDisplay,
    linkRoomCodeDisplay,
    shareLinkDisplay,
    copyShareLinkBtn,
    
    // Functions
    showPanel,
    updateMuteButtonUI
} from './dom.js';
import { generateRandomCode, setupClipboardCopy } from './utils.js';
import { initializePeer, joinRoom, startMedia, endCall } from './peer-manager.js';

// --- Listeners de Input para Validar/Habilitar Botões ---

if (createNameInput) {
    createNameInput.addEventListener('input', () => {
        const hasName = createNameInput.value.trim().length > 0;
        createRoomBtn.disabled = !hasName;
    });
}

if (roomCodeInput) {
    roomCodeInput.addEventListener('input', () => {
        const code = roomCodeInput.value.trim();
        const isValidCode = code.length === 5 && /^\d{5}$/.test(code);
        joinCodeNextBtn.disabled = !isValidCode;
    });
}

if (joinNameInput) {
    joinNameInput.addEventListener('input', () => {
        const hasName = joinNameInput.value.trim().length > 0;
        joinRoomBtn.disabled = !hasName;
    });
}

if (linkNameInput) {
    linkNameInput.addEventListener('input', () => {
        const hasName = linkNameInput.value.trim().length > 0;
        linkJoinConfirmBtn.disabled = !hasName;
    });
}

// --- Listeners de Navegação entre Painéis ---

if (btnGoCreate) {
    btnGoCreate.addEventListener('click', () => {
        createNameInput.value = '';
        createRoomBtn.disabled = true;
        showPanel(panelCreate);
        createNameInput.focus();
    });
}

if (btnGoJoin) {
    btnGoJoin.addEventListener('click', () => {
        roomCodeInput.value = '';
        joinCodeNextBtn.disabled = true;
        showPanel(panelJoinCode);
        roomCodeInput.focus();
    });
}

if (btnBackToMainFromCreate) {
    btnBackToMainFromCreate.addEventListener('click', () => {
        showPanel(panelMain);
    });
}

if (btnBackToMainFromJoin) {
    btnBackToMainFromJoin.addEventListener('click', () => {
        showPanel(panelMain);
    });
}

if (joinCodeNextBtn) {
    joinCodeNextBtn.addEventListener('click', () => {
        state.targetRoomCode = roomCodeInput.value.trim();
        joiningRoomCodeDisplay.innerText = state.targetRoomCode;
        joinNameInput.value = '';
        joinRoomBtn.disabled = true;
        showPanel(panelJoinName);
        joinNameInput.focus();
    });
}

if (btnBackToCode) {
    btnBackToCode.addEventListener('click', () => {
        showPanel(panelJoinCode);
    });
}

if (btnCancelLinkJoin) {
    btnCancelLinkJoin.addEventListener('click', () => {
        window.history.replaceState({}, document.title, window.location.pathname);
        showPanel(panelMain);
    });
}

// --- Listeners de Ações ---

createRoomBtn.addEventListener('click', async () => {
    errorMessage.innerText = '';
    state.localName = createNameInput.value.trim();
    if (!state.localName) return;
    try {
        await startMedia();
        const roomCode = generateRandomCode();
        initializePeer(roomCode);
    } catch (error) {
        console.error("Erro ao criar sala:", error);
    }
});

joinRoomBtn.addEventListener('click', () => {
    const name = joinNameInput.value.trim();
    joinRoom(state.targetRoomCode, name);
});

linkJoinConfirmBtn.addEventListener('click', () => {
    const name = linkNameInput.value.trim();
    joinRoom(state.targetRoomCode, name);
});

hangUpBtn.addEventListener('click', endCall);

toggleMuteBtn.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    
    // Ativa ou desativa a faixa de áudio no stream local
    if (state.localStream) {
        state.localStream.getAudioTracks()[0].enabled = !state.isMuted;
    }
    
    updateMuteButtonUI();
});

// Configurar utilitário de cópia para área de transferência
setupClipboardCopy(copyRoomIdBtn, () => roomIdDisplay.innerText);
setupClipboardCopy(copyShareLinkBtn, () => shareLinkDisplay.innerText);

// --- Inicialização e Checagem de URL ---

const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');

if (urlRoom && /^\d{5}$/.test(urlRoom)) {
    state.targetRoomCode = urlRoom;
    if (linkRoomCodeDisplay) {
        linkRoomCodeDisplay.innerText = urlRoom;
    }
    showPanel(panelLinkJoin);
    if (linkNameInput) {
        setTimeout(() => linkNameInput.focus(), 100);
    }
} else {
    showPanel(panelMain);
}

// --- Registro do Service Worker ---

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado com sucesso:', reg.scope))
            .catch(err => console.error('Erro ao registrar Service Worker:', err));
    });
}
