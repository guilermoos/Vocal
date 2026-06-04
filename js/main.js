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
    panelAuth,
} from './dom.js';
import { generateRandomCode, setupClipboardCopy } from './utils.js';
import { createPeer, initializePeer, joinRoom, startMedia, endCall, sendChatMessage } from './peer-manager.js';
import { signUp, signIn, signOut, getCurrentUser } from './auth.js';
import { supabase } from './supabase-config.js';

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
    joinCodeNextBtn.addEventListener('click', async () => {
        errorMessage.innerText = '';
        const roomCode = roomCodeInput.value.trim();
        joinCodeNextBtn.disabled = true;

        try {
            if (!supabase) throw new Error('Supabase não inicializado.');

            const { data, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('code', roomCode)
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                errorMessage.innerText = 'Sala não encontrada.';
                joinCodeNextBtn.disabled = false;
                return;
            }

            state.targetRoomCode = roomCode;
            state.roomName = data.name || '';
            joiningRoomCodeDisplay.innerText = roomCode;
            if (joiningRoomNameDisplay) {
                joiningRoomNameDisplay.innerText = data.name || 'Sem nome';
            }

            if (currentUserProfile) {
                joinNameInput.value = currentUserProfile.display_name;
            } else {
                joinNameInput.value = '';
            }
            if (joinPasswordInput) joinPasswordInput.value = '';

            if (data.is_private) {
                if (joinPasswordWrapper) joinPasswordWrapper.style.display = 'block';
            } else {
                if (joinPasswordWrapper) joinPasswordWrapper.style.display = 'none';
            }

            validateJoinForm();
            showPanel(panelJoinName);
            if (data.is_private) {
                if (joinPasswordInput) joinPasswordInput.focus();
            } else if (!currentUserProfile && joinNameInput) {
                joinNameInput.focus();
            }
        } catch (err) {
            console.error('Erro ao buscar sala:', err);
            errorMessage.innerText = 'Erro ao verificar existência da sala.';
        } finally {
            joinCodeNextBtn.disabled = false;
        }
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
        const roomCode = generateRandomCode();
        
        // Registrar a sala no Supabase
        const isPrivate = state.roomType === 'private';
        const { hashPassword } = await import('./utils.js');
        const passwordHash = isPrivate ? await hashPassword(state.roomPassword) : null;
        
        const { data: userData } = await supabase.auth.getUser();
        const hostId = userData?.user?.id || null;
        
        const { error: dbError } = await supabase.from('rooms').insert([
            {
                code: roomCode,
                name: state.roomName,
                is_private: isPrivate,
                password_hash: passwordHash,
                host_id: hostId
            }
        ]);
        
        if (dbError) throw dbError;
        
        initializePeer(roomCode);
    } catch (error) {
        console.error("Erro ao criar sala:", error);
        errorMessage.innerText = error.message || 'Falha ao criar sala no banco.';
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

// --- Inicialização e Checagem de URL ---

let currentUserProfile = null;

async function initializeRoomOrMainPanel() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoom = urlParams.get('room');

    if (urlRoom && /^\d{5}$/.test(urlRoom)) {
        try {
            if (!supabase) throw new Error('Supabase não inicializado.');

            const { data, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('code', urlRoom)
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                errorMessage.innerText = 'A sala deste link não foi encontrada.';
                showPanel(panelMain);
                return;
            }

            state.targetRoomCode = urlRoom;
            state.roomName = data.name || '';
            if (linkRoomCodeDisplay) {
                linkRoomCodeDisplay.innerText = urlRoom;
            }
            if (linkRoomNameDisplay) {
                linkRoomNameDisplay.innerText = data.name || 'Sem nome';
            }

            if (data.is_private) {
                if (linkPasswordWrapper) linkPasswordWrapper.style.display = 'block';
            } else {
                if (linkPasswordWrapper) linkPasswordWrapper.style.display = 'none';
            }

            if (currentUserProfile) {
                linkNameInput.value = currentUserProfile.display_name;
            } else {
                linkNameInput.value = '';
            }
            if (linkPasswordInput) linkPasswordInput.value = '';

            validateLinkForm();
            showPanel(panelLinkJoin);

            if (data.is_private) {
                if (linkPasswordInput) setTimeout(() => linkPasswordInput.focus(), 100);
            } else if (!currentUserProfile && linkNameInput) {
                setTimeout(() => linkNameInput.focus(), 100);
            }
        } catch (err) {
            console.error('Erro ao verificar sala por link:', err);
            errorMessage.innerText = 'Erro ao processar o link de acesso da sala.';
            showPanel(panelMain);
        }
    } else {
        showPanel(panelMain);
    }
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

// --- Lógica de Autenticação Supabase (Cadastro / Login / Logout) ---

const loginIdentifierInput = document.getElementById('login-identifier-input');
const loginPasswordInput = document.getElementById('login-password-input');
const btnLoginSubmit = document.getElementById('btn-login-submit');

const registerUsernameInput = document.getElementById('register-username-input');
const registerNameInput = document.getElementById('register-name-input');
const registerPasswordInput = document.getElementById('register-password-input');
const btnRegisterSubmit = document.getElementById('btn-register-submit');

const btnToggleAuth = document.getElementById('btn-toggle-auth');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authToggleText = document.getElementById('auth-toggle-text');
const loginFormFields = document.getElementById('login-form-fields');
const registerFormFields = document.getElementById('register-form-fields');
const btnLogout = document.getElementById('btn-logout');

let isRegisterMode = false;

if (btnToggleAuth) {
    btnToggleAuth.addEventListener('click', () => {
        isRegisterMode = !isRegisterMode;
        errorMessage.innerText = '';
        
        if (isRegisterMode) {
            authTitle.innerText = 'Crie sua Conta';
            authSubtitle.innerText = 'Cadastre-se para começar a usar o Vocal.';
            loginFormFields.style.display = 'none';
            registerFormFields.style.display = 'block';
            authToggleText.innerText = 'Já tem uma conta?';
            btnToggleAuth.innerText = 'Entrar';
        } else {
            authTitle.innerText = 'Acesse sua Conta';
            authSubtitle.innerText = 'Entre para criar ou participar de salas de áudio.';
            loginFormFields.style.display = 'block';
            registerFormFields.style.display = 'none';
            authToggleText.innerText = 'Não tem uma conta?';
            btnToggleAuth.innerText = 'Cadastre-se';
        }
    });
}

if (btnLoginSubmit) {
    btnLoginSubmit.addEventListener('click', async () => {
        const username = loginIdentifierInput.value.trim();
        const password = loginPasswordInput.value;
        
        if (!username || !password) {
            errorMessage.innerText = 'Por favor, preencha todos os campos.';
            return;
        }
        
        btnLoginSubmit.disabled = true;
        errorMessage.innerText = '';
        
        try {
            await signIn(username, password);
            console.log('Login efetuado com sucesso!');
            await checkAuthSession();
        } catch (err) {
            console.error('Erro no login:', err);
            errorMessage.innerText = err.message || 'Erro ao efetuar login.';
            btnLoginSubmit.disabled = false;
        }
    });
}

if (btnRegisterSubmit) {
    btnRegisterSubmit.addEventListener('click', async () => {
        const username = registerUsernameInput.value.trim();
        const name = registerNameInput.value.trim();
        const password = registerPasswordInput.value;
        
        if (!username || !name || !password) {
            errorMessage.innerText = 'Por favor, preencha todos os campos.';
            return;
        }
        
        btnRegisterSubmit.disabled = true;
        errorMessage.innerText = '';
        
        try {
            await signUp(username, name, password);
            alert('Conta criada com sucesso! Faça login para continuar.');
            if (btnToggleAuth) btnToggleAuth.click();
            registerUsernameInput.value = '';
            registerNameInput.value = '';
            registerPasswordInput.value = '';
        } catch (err) {
            console.error('Erro no cadastro:', err);
            errorMessage.innerText = err.message || 'Erro ao criar conta.';
        } finally {
            btnRegisterSubmit.disabled = false;
        }
    });
}

if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            await signOut();
            console.log('Logout efetuado com sucesso.');
            if (loginIdentifierInput) loginIdentifierInput.value = '';
            if (loginPasswordInput) loginPasswordInput.value = '';
            if (btnLoginSubmit) btnLoginSubmit.disabled = false;
            
            await checkAuthSession();
        } catch (err) {
            console.error('Erro ao deslogar:', err);
        }
    });
}

export async function checkAuthSession() {
    try {
        const sessionData = await getCurrentUser();
        if (sessionData) {
            currentUserProfile = sessionData.profile;
            console.log('Sessão ativa para:', currentUserProfile);
            
            state.localName = currentUserProfile.display_name;
            if (createNameInput) createNameInput.value = currentUserProfile.display_name;
            if (joinNameInput) joinNameInput.value = currentUserProfile.display_name;
            if (linkNameInput) linkNameInput.value = currentUserProfile.display_name;
            
            const createNameWrapper = document.getElementById('create-name-wrapper');
            const joinNameWrapper = document.getElementById('join-name-wrapper');
            const linkNameWrapper = document.getElementById('link-name-wrapper');
            if (createNameWrapper) createNameWrapper.style.display = 'none';
            if (joinNameWrapper) joinNameWrapper.style.display = 'none';
            if (linkNameWrapper) linkNameWrapper.style.display = 'none';
            
            const profileBar = document.getElementById('user-profile-bar');
            const avatar = document.getElementById('user-profile-avatar');
            const pName = document.getElementById('user-profile-name');
            const pUser = document.getElementById('user-profile-username');
            
            if (profileBar) profileBar.style.display = 'flex';
            if (avatar) avatar.innerText = currentUserProfile.display_name.substring(0, 1).toUpperCase();
            if (pName) pName.innerText = currentUserProfile.display_name;
            if (pUser) pUser.innerText = `@${currentUserProfile.username}`;
            
            initializeRoomOrMainPanel();
        } else {
            currentUserProfile = null;
            
            const profileBar = document.getElementById('user-profile-bar');
            if (profileBar) profileBar.style.display = 'none';
            
            showPanel(panelAuth);
        }
    } catch (e) {
        console.error('Erro na validação de sessão:', e);
    }
}

// Iniciar checagem de sessão no carregamento da página
checkAuthSession();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado com sucesso:', reg.scope))
            .catch(err => console.error('Erro ao registrar Service Worker:', err));
    });
}
