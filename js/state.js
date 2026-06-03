export const state = {
    peer: null,
    localStream: null,
    isMuted: false,
    localName: '',
    hadParticipantsConnected: false,
    targetRoomCode: '',
    isHost: false,
    peers: new Map(), // peerId -> { conn, call, stream, audioElement, listItemElement, name }
    
    // Chat state
    activeTab: 'call', // 'call' | 'chat'
    unreadCount: 0
};

export const MAX_PARTICIPANTS = 8;
