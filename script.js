// --- Seleção de Elementos do DOM ---
const setupSection = document.getElementById('setup-section');
const callSection = document.getElementById('call-section');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const hangUpBtn = document.getElementById('hang-up-btn');
const remoteAudio = document.getElementById('remote-audio');
const roomIdDisplay = document.getElementById('room-id-display');
const statusDiv = document.getElementById('status');
const statusMessage = document.getElementById('status-message');
const errorMessage = document.getElementById('error-message');
const copyRoomIdBtn = document.getElementById('copy-room-id-btn');

let peer;
let localStream;
let currentCall;

// --- Funções Auxiliares ---

// Gera um código aleatório de 5 dígitos para a sala
function generateRandomCode() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

// Inicia o acesso ao microfone do usuário
async function startMedia() {
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }
    } catch (err) {
        console.error('Falha ao obter stream de áudio', err);
        errorMessage.innerText = 'Permissão de microfone é necessária.';
        throw err; // Lança o erro para interromper a execução
    }
}

// --- Lógica do PeerJS ---

// Inicializa a conexão Peer e configura os listeners de eventos
function initializePeer(peerId) {
    peer = new Peer(peerId);

    peer.on('open', (id) => {
        console.log('Meu ID de peer é: ' + id);
        showCallView(id);
    });

    peer.on('call', (call) => {
        if (!localStream) {
            console.error("Stream local não está pronta.");
            return;
        }
        
        console.log('Recebendo chamada...');
        call.answer(localStream); // Atende a chamada com nosso áudio
        setupCallHandlers(call);
    });

    peer.on('error', (err) => {
        console.error('Erro no PeerJS:', err);
        errorMessage.innerText = `Erro de conexão: ${err.message}. Tente outro código.`;
        showSetupView();
    });
}

// Configura os handlers para uma chamada (tanto para quem liga quanto para quem recebe)
function setupCallHandlers(call) {
    currentCall = call;

    call.on('stream', (remoteStream) => {
        console.log('Recebendo stream remoto.');
        statusDiv.classList.remove('status-waiting');
        statusDiv.classList.add('status-connected');
        statusMessage.innerText = 'Conectado!';
        remoteAudio.srcObject = remoteStream;
    });

    call.on('close', endCall);
    call.on('error', (err) => {
        console.error("Erro na chamada:", err);
        endCall();
    });
}


// --- Lógica dos Eventos de Botão ---

createRoomBtn.addEventListener('click', async () => {
    errorMessage.innerText = '';
    try {
        await startMedia();
        const roomCode = generateRandomCode();
        initializePeer(roomCode);
    } catch (error) {
        // O erro já é tratado em startMedia
    }
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
        // Inicializa um peer anônimo
        peer = new Peer(); 
        peer.on('open', () => {
            const call = peer.call(roomCode, localStream);
            showCallView(roomCode);
            setupCallHandlers(call);
        });
        peer.on('error', (err) => {
            console.error('Erro no PeerJS:', err);
            errorMessage.innerText = 'Não foi possível conectar. Verifique o código.';
            showSetupView();
       });
    } catch (error) {
        // O erro já é tratado em startMedia
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


// --- Funções de Gerenciamento de UI ---

function endCall() {
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }
    // peer.destroy() pode ser muito agressivo, desconectar é mais suave
    if (peer) {
        peer.disconnect();
        peer.destroy();
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
    showView(callSection);
}

function showSetupView() {
    statusDiv.classList.add('status-waiting');
    statusDiv.classList.remove('status-connected');
    statusMessage.innerText = 'Aguardando outro participante';
    remoteAudio.srcObject = null;
    roomCodeInput.value = '';
    showView(setupSection);
}