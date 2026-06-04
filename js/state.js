export const state = {
    peer: null,
    localStream: null,
    isMuted: false,
    localName: '',
    hadParticipantsConnected: false,
    targetRoomCode: '',
    isHost: false,
    peers: new Map(), // peerId -> { conn, call, stream, audioElement, listItemElement, name }
    
    // Configurações da sala
    roomPassword: '',
    roomType: 'public', // 'public' | 'private'
    voluntaryLeave: false,
    proxyPeer: null,    // Segundo objeto Peer se formos o host substituto
    joinTime: 0,        // Timestamp de entrada para eleger o novo host substituto
    chatHistory: [],    // Histórico de mensagens da sala
    
    // Chat state
    activeTab: 'call', // 'call' | 'chat'
    unreadCount: 0
};

export const MAX_PARTICIPANTS = 8;
