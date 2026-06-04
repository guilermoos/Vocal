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
    createRoomNameInput,
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
    joiningRoomNameDisplay,
    joiningRoomCodeDisplay,
    linkRoomNameDisplay,
    linkRoomCodeDisplay,
    shareLinkDisplay,
    copyShareLinkBtn,
    privacyPublicBtn,
    privacyPrivateBtn,
    createPasswordWrapper,
    createPasswordInput,
    joinPasswordWrapper,
    joinPasswordInput,
    linkPasswordWrapper,
    linkPasswordInput,
    
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
import { createPeer, initializePeer, joinRoom, startMedia, endCall, sendChatMessage } from './peer-manager.js';

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

// --- Validadores de Formulários ---

function validateCreateForm() {
    const roomName = createRoomNameInput ? createRoomNameInput.value.trim() : '';
    const name = createNameInput.value.trim();
    const hasRoomName = roomName.length > 0;
    const hasName = name.length > 0;
    
    if (state.roomType === 'public') {
        createRoomBtn.disabled = !hasName || !hasRoomName;
    } else {
        const password = createPasswordInput.value;
        const hasValidPassword = password.length >= 4;
        createRoomBtn.disabled = !hasName || !hasRoomName || !hasValidPassword;
    }
}

function validateJoinForm() {
    const name = joinNameInput.value.trim();
    const hasName = name.length > 0;
    
    const isPrivate = joinPasswordWrapper && joinPasswordWrapper.style.display === 'block';
    if (isPrivate) {
        const hasPassword = joinPasswordInput && joinPasswordInput.value.length > 0;
        joinRoomBtn.disabled = !hasName || !hasPassword;
    } else {
        joinRoomBtn.disabled = !hasName;
    }
}

function validateLinkForm() {
    const name = linkNameInput.value.trim();
    const hasName = name.length > 0;
    
    const isPrivate = linkPasswordWrapper && linkPasswordWrapper.style.display === 'block';
    if (isPrivate) {
        const hasPassword = linkPasswordInput && linkPasswordInput.value.length > 0;
        linkJoinConfirmBtn.disabled = !hasName || !hasPassword;
    } else {
        linkJoinConfirmBtn.disabled = !hasName;
    }
}

// --- Listeners de Input para Validar/Habilitar Botões ---

if (createRoomNameInput) {
    createRoomNameInput.addEventListener('input', validateCreateForm);
}

if (createNameInput) {
    createNameInput.addEventListener('input', validateCreateForm);
}

if (createPasswordInput) {
    createPasswordInput.addEventListener('input', validateCreateForm);
}

if (roomCodeInput) {
    roomCodeInput.addEventListener('input', () => {
        const code = roomCodeInput.value.trim();
        const isValidCode = code.length === 5 && /^\d{5}$/.test(code);
        joinCodeNextBtn.disabled = !isValidCode;
    });
}

if (joinNameInput) {
    joinNameInput.addEventListener('input', validateJoinForm);
}

if (joinPasswordInput) {
    joinPasswordInput.addEventListener('input', validateJoinForm);
}

if (linkNameInput) {
    linkNameInput.addEventListener('input', validateLinkForm);
}

if (linkPasswordInput) {
    linkPasswordInput.addEventListener('input', validateLinkForm);
}

// --- Listeners de Configuração de Privacidade ---

if (privacyPublicBtn) {
    privacyPublicBtn.addEventListener('click', () => {
        state.roomType = 'public';
        privacyPublicBtn.classList.add('active');
        if (privacyPrivateBtn) privacyPrivateBtn.classList.remove('active');
        if (createPasswordWrapper) createPasswordWrapper.style.display = 'none';
        if (createPasswordInput) createPasswordInput.value = '';
        validateCreateForm();
    });
}

if (privacyPrivateBtn) {
    privacyPrivateBtn.addEventListener('click', () => {
        state.roomType = 'private';
        privacyPrivateBtn.classList.add('active');
        if (privacyPublicBtn) privacyPublicBtn.classList.remove('active');
        if (createPasswordWrapper) {
            createPasswordWrapper.style.display = 'block';
            if (createPasswordInput) createPasswordInput.focus();
        }
        validateCreateForm();
    });
}

// --- Listeners de Navegação entre Painéis ---

if (btnGoCreate) {
    btnGoCreate.addEventListener('click', () => {
        if (createRoomNameInput) createRoomNameInput.value = '';
        createNameInput.value = '';
        if (createPasswordInput) createPasswordInput.value = '';
        state.roomType = 'public';
        if (privacyPublicBtn) privacyPublicBtn.classList.add('active');
        if (privacyPrivateBtn) privacyPrivateBtn.classList.remove('active');
        if (createPasswordWrapper) createPasswordWrapper.style.display = 'none';
        createRoomBtn.disabled = true;
        showPanel(panelCreate);
        if (createRoomNameInput) {
            createRoomNameInput.focus();
        } else {
            createNameInput.focus();
        }
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
        errorMessage.innerText = '';
        const roomCode = roomCodeInput.value.trim();
        joinCodeNextBtn.disabled = true;
        
        // P2P: Criamos um peer temporário para interrogar o Host da sala
        const tempPeer = createPeer(null);
        if (!tempPeer) {
            errorMessage.innerText = 'Erro ao instanciar conexão temporária.';
            joinCodeNextBtn.disabled = false;
            return;
        }

        const cleanup = () => {
            try { tempPeer.disconnect(); tempPeer.destroy(); } catch(e) {}
            joinCodeNextBtn.disabled = false;
        };

        const timeoutId = setTimeout(() => {
            errorMessage.innerText = 'Sala não encontrada ou vazia.';
            cleanup();
        }, 6000);

        tempPeer.on('open', () => {
            console.log('TempPeer: Conectando ao código P2P:', roomCode);
            const conn = tempPeer.connect(roomCode);
            
            conn.on('open', () => {
                clearTimeout(timeoutId);
                conn.send({ type: 'query_privacy' });
            });

            conn.on('data', (data) => {
                if (data.type === 'privacy_response') {
                    clearTimeout(timeoutId);
                    state.targetRoomCode = roomCode;
                    state.roomName = data.roomName || '';
                    joiningRoomCodeDisplay.innerText = roomCode;
                    if (joiningRoomNameDisplay) {
                        joiningRoomNameDisplay.innerText = data.roomName || 'Sem nome';
                    }
                    joinNameInput.value = '';
                    if (joinPasswordInput) joinPasswordInput.value = '';
                    
                    if (data.roomType === 'private') {
                        if (joinPasswordWrapper) joinPasswordWrapper.style.display = 'block';
                    } else {
                        if (joinPasswordWrapper) joinPasswordWrapper.style.display = 'none';
                    }
                    
                    joinRoomBtn.disabled = true;
                    showPanel(panelJoinName);
                    joinNameInput.focus();
                    cleanup();
                }
            });

            conn.on('error', (err) => {
                clearTimeout(timeoutId);
                console.error('TempPeer: Erro na conexão:', err);
                errorMessage.innerText = 'Sala não encontrada ou vazia.';
                cleanup();
            });
        });

        tempPeer.on('error', (err) => {
            clearTimeout(timeoutId);
            console.error('TempPeer: Erro no peer:', err);
            errorMessage.innerText = 'Sala não encontrada ou vazia.';
            cleanup();
        });
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
    state.roomName = createRoomNameInput ? createRoomNameInput.value.trim() : '';
    state.roomPassword = createPasswordInput ? createPasswordInput.value : '';
    if (!state.localName || !state.roomName) return;
    
    createRoomBtn.disabled = true;
    try {
        await startMedia();
        // P2P pura: geramos o código numérico de 5 dígitos no próprio cliente
        const roomCode = generateRandomCode();
        // Inicializamos o PeerJS utilizando o código da sala como o Peer ID
        initializePeer(roomCode);
    } catch (error) {
        console.error("Erro ao criar sala:", error);
        errorMessage.innerText = 'Falha no acesso de mídia.';
        createRoomBtn.disabled = false;
    }
});

joinRoomBtn.addEventListener('click', () => {
    const name = joinNameInput.value.trim();
    const password = joinPasswordInput ? joinPasswordInput.value : '';
    joinRoom(state.targetRoomCode, name, password);
});

linkJoinConfirmBtn.addEventListener('click', () => {
    const name = linkNameInput.value.trim();
    const password = linkPasswordInput ? linkPasswordInput.value : '';
    joinRoom(state.targetRoomCode, name, password);
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
    const checkUrlRoomP2P = () => {
        const tempPeer = createPeer(null);
        
        const cleanup = () => {
            try { tempPeer.disconnect(); tempPeer.destroy(); } catch(e) {}
        };

        const timeoutId = setTimeout(() => {
            errorMessage.innerText = 'A sala deste link não foi encontrada ou está vazia.';
            showPanel(panelMain);
            cleanup();
        }, 6000);

        tempPeer.on('open', () => {
            console.log('TempPeer: Conectando via link ao código P2P:', urlRoom);
            const conn = tempPeer.connect(urlRoom);
            
            conn.on('open', () => {
                clearTimeout(timeoutId);
                conn.send({ type: 'query_privacy' });
            });

            conn.on('data', (data) => {
                if (data.type === 'privacy_response') {
                    clearTimeout(timeoutId);
                    state.targetRoomCode = urlRoom;
                    state.roomName = data.roomName || '';
                    if (linkRoomCodeDisplay) {
                        linkRoomCodeDisplay.innerText = urlRoom;
                    }
                    if (linkRoomNameDisplay) {
                        linkRoomNameDisplay.innerText = data.roomName || 'Sem nome';
                    }
                    if (data.roomType === 'private') {
                        if (linkPasswordWrapper) linkPasswordWrapper.style.display = 'block';
                    } else {
                        if (linkPasswordWrapper) linkPasswordWrapper.style.display = 'none';
                    }
                    linkNameInput.value = '';
                    if (linkPasswordInput) linkPasswordInput.value = '';
                    linkJoinConfirmBtn.disabled = true;
                    showPanel(panelLinkJoin);
                    if (linkNameInput) {
                        setTimeout(() => linkNameInput.focus(), 100);
                    }
                    cleanup();
                }
            });

            conn.on('error', (err) => {
                clearTimeout(timeoutId);
                errorMessage.innerText = 'A sala deste link não foi encontrada ou está vazia.';
                showPanel(panelMain);
                cleanup();
            });
        });

        tempPeer.on('error', (err) => {
            clearTimeout(timeoutId);
            errorMessage.innerText = 'A sala deste link não foi encontrada ou está vazia.';
            showPanel(panelMain);
            cleanup();
        });
    };
    checkUrlRoomP2P();
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
