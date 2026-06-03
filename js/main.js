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
    updateMuteButtonUI,
    showTab,
    tabCallBtn,
    tabChatBtn,
    chatMessageInput,
    sendChatBtn,

    // Media
    attachMediaBtn,
    mediaFileInput,
    mediaPreviewContainer,
    mediaPreviewImg,
    mediaPreviewVideo,
    cancelMediaBtn,
} from './dom.js';
import { generateRandomCode, setupClipboardCopy } from './utils.js';
import { initializePeer, joinRoom, startMedia, endCall, sendChatMessage } from './peer-manager.js';

// --- Media State ---
let pendingMedia = null; // { dataUrl, mimeType }

function clearPendingMedia() {
    pendingMedia = null;
    if (mediaPreviewContainer) mediaPreviewContainer.style.display = 'none';
    if (mediaPreviewImg) { mediaPreviewImg.style.display = 'none'; mediaPreviewImg.src = ''; }
    if (mediaPreviewVideo) { mediaPreviewVideo.style.display = 'none'; mediaPreviewVideo.src = ''; }
    if (mediaFileInput) mediaFileInput.value = '';
    updateSendBtnState();
}

function updateSendBtnState() {
    const hasText = chatMessageInput && chatMessageInput.value.trim().length > 0;
    if (sendChatBtn) sendChatBtn.disabled = !hasText && !pendingMedia;
}

// --- Media Attach Menu Logic ---

const mediaCameraInput = document.getElementById('media-camera-input');
const attachMenu = document.getElementById('attach-menu');
const attachGalleryBtn = document.getElementById('attach-gallery-btn');
const attachCameraBtn = document.getElementById('attach-camera-btn');

/** Detect if user is on a touch/mobile device */
const isMobileDevice = () => {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
};

function toggleAttachMenu() {
    if (!attachMenu) return;
    const isVisible = attachMenu.style.display === 'flex';
    attachMenu.style.display = isVisible ? 'none' : 'flex';
}

function closeAttachMenu() {
    if (attachMenu) attachMenu.style.display = 'none';
}

if (attachMediaBtn) {
    attachMediaBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isMobileDevice()) {
            // Mobile: show picker menu
            toggleAttachMenu();
        } else {
            // Desktop: open file picker directly
            closeAttachMenu();
            if (mediaFileInput) mediaFileInput.click();
        }
    });
}

if (attachGalleryBtn) {
    attachGalleryBtn.addEventListener('click', () => {
        closeAttachMenu();
        if (mediaFileInput) mediaFileInput.click();
    });
}

if (attachCameraBtn) {
    attachCameraBtn.addEventListener('click', () => {
        closeAttachMenu();
        if (mediaCameraInput) mediaCameraInput.click();
    });
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (attachMenu && attachMenu.style.display === 'flex') {
        if (!attachMenu.contains(e.target) && e.target !== attachMediaBtn) {
            closeAttachMenu();
        }
    }
});

if (cancelMediaBtn) {
    cancelMediaBtn.addEventListener('click', () => clearPendingMedia());
}

function processSelectedFile(file) {
    if (!file) return;

    const MAX_SIZE_MB = 10;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        alert(`O arquivo é muito grande. Limite: ${MAX_SIZE_MB}MB.`);
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        pendingMedia = { dataUrl: e.target.result, mimeType: file.type };
        const isVideo = file.type.startsWith('video/');

        if (mediaPreviewContainer) mediaPreviewContainer.style.display = 'block';

        if (isVideo) {
            if (mediaPreviewImg) mediaPreviewImg.style.display = 'none';
            if (mediaPreviewVideo) {
                mediaPreviewVideo.src = e.target.result;
                mediaPreviewVideo.style.display = 'block';
            }
        } else {
            if (mediaPreviewVideo) mediaPreviewVideo.style.display = 'none';
            if (mediaPreviewImg) {
                mediaPreviewImg.src = e.target.result;
                mediaPreviewImg.style.display = 'block';
            }
        }
        updateSendBtnState();
    };
    reader.readAsDataURL(file);
}

if (mediaFileInput) {
    mediaFileInput.addEventListener('change', () => {
        processSelectedFile(mediaFileInput.files[0]);
        mediaFileInput.value = '';
    });
}

if (mediaCameraInput) {
    mediaCameraInput.addEventListener('change', () => {
        processSelectedFile(mediaCameraInput.files[0]);
        mediaCameraInput.value = '';
    });
}

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

// --- Listeners de Eventos do Chat ---

if (tabCallBtn) {
    tabCallBtn.addEventListener('click', () => showTab('call'));
}

if (tabChatBtn) {
    tabChatBtn.addEventListener('click', () => showTab('chat'));
}

if (chatMessageInput) {
    chatMessageInput.addEventListener('input', () => {
        updateSendBtnState();
    });
}

const performSendChat = () => {
    const text = chatMessageInput ? chatMessageInput.value : '';
    if (!text.trim() && !pendingMedia) return;
    const mediaToSend = pendingMedia;
    sendChatMessage(text, mediaToSend);
    if (chatMessageInput) chatMessageInput.value = '';
    clearPendingMedia();
};

if (sendChatBtn) {
    sendChatBtn.addEventListener('click', performSendChat);
}

if (chatMessageInput) {
    chatMessageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSendChat();
        }
    });
}

// --- Registro do Service Worker ---

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado com sucesso:', reg.scope))
            .catch(err => console.error('Erro ao registrar Service Worker:', err));
    });
}
