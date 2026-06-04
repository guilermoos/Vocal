import { supabase } from './supabase-config.js';
import { cleanUsername } from './auth.js';

// --- Module State ---
let localProfile = null;
let contactsChannel = null;
let invitesChannel = null;
let presenceChannel = null;
let onlineUsers = new Set(); // set of user IDs currently online

// Callbacks for UI updates (set by main.js)
let onContactsUpdated = null;
let onInviteReceived = null;
let onInviteResponseReceived = null;

/**
 * Inicializar o módulo de contatos para o usuário logado.
 */
export function initContacts(profile, callbacks = {}) {
    localProfile = profile;
    onContactsUpdated = callbacks.onContactsUpdated || null;
    onInviteReceived = callbacks.onInviteReceived || null;
    onInviteResponseReceived = callbacks.onInviteResponseReceived || null;

    subscribeToContactChanges();
    subscribeToInviteChanges();
    subscribeToGlobalPresence();
}

/**
 * Desconectar de todos os canais de tempo real do módulo de contatos.
 */
export function cleanupContacts() {
    if (contactsChannel) {
        try { supabase.removeChannel(contactsChannel); } catch (e) {}
        contactsChannel = null;
    }
    if (invitesChannel) {
        try { supabase.removeChannel(invitesChannel); } catch (e) {}
        invitesChannel = null;
    }
    if (presenceChannel) {
        try { supabase.removeChannel(presenceChannel); } catch (e) {}
        presenceChannel = null;
    }
    localProfile = null;
    onlineUsers.clear();
}

// ==========================================
// === CONTACTS CRUD ========================
// ==========================================

/**
 * Buscar perfil de um usuário pelo @username.
 */
export async function findUserByUsername(username) {
    const clean = cleanUsername(username);
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', clean)
        .maybeSingle();

    if (error) {
        console.error('[Contacts] Erro ao buscar usuário:', error);
        return null;
    }
    return data;
}

/**
 * Enviar uma solicitação de contato para um usuário.
 */
export async function sendContactRequest(targetUserId) {
    if (!localProfile) throw new Error('Usuário não autenticado.');
    if (targetUserId === localProfile.id) throw new Error('Você não pode adicionar a si mesmo.');

    // Verificar se já existe uma relação entre os dois (em qualquer direção)
    const { data: existing } = await supabase
        .from('contacts')
        .select('*')
        .or(`and(sender_id.eq.${localProfile.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${localProfile.id})`);

    if (existing && existing.length > 0) {
        const rel = existing[0];
        if (rel.status === 'accepted') {
            throw new Error('Este usuário já está nos seus contatos.');
        }
        if (rel.sender_id === localProfile.id) {
            throw new Error('Você já enviou uma solicitação para este usuário.');
        }
        // Se o outro já nos enviou, aceitar automaticamente
        if (rel.sender_id === targetUserId && rel.status === 'pending') {
            await acceptContactRequest(rel.id);
            return 'accepted';
        }
    }

    const { error } = await supabase.from('contacts').insert([{
        sender_id: localProfile.id,
        receiver_id: targetUserId,
        status: 'pending'
    }]);

    if (error) {
        console.error('[Contacts] Erro ao enviar solicitação:', error);
        throw error;
    }

    return 'sent';
}

/**
 * Aceitar uma solicitação de contato recebida.
 */
export async function acceptContactRequest(contactId) {
    const { error } = await supabase
        .from('contacts')
        .update({ status: 'accepted' })
        .eq('id', contactId);

    if (error) {
        console.error('[Contacts] Erro ao aceitar solicitação:', error);
        throw error;
    }
}

/**
 * Rejeitar/remover uma solicitação ou contato.
 */
export async function removeContact(contactId) {
    const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId);

    if (error) {
        console.error('[Contacts] Erro ao remover contato:', error);
        throw error;
    }
}

/**
 * Carregar todos os contatos aceitos do usuário atual.
 */
export async function loadAcceptedContacts() {
    if (!localProfile) return [];

    const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${localProfile.id},receiver_id.eq.${localProfile.id}`);

    if (error) {
        console.error('[Contacts] Erro ao carregar contatos:', error);
        return [];
    }

    // Para cada contato, buscar o perfil da "outra pessoa"
    const contacts = await enrichContacts(data || []);
    return contacts;
}

/**
 * Carregar solicitações pendentes recebidas pelo usuário.
 */
export async function loadPendingRequests() {
    if (!localProfile) return [];

    const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('status', 'pending')
        .eq('receiver_id', localProfile.id);

    if (error) {
        console.error('[Contacts] Erro ao carregar solicitações:', error);
        return [];
    }

    const contacts = await enrichContacts(data || []);
    return contacts;
}

/**
 * Enriquecer registros de contacts com o perfil da "outra pessoa".
 */
async function enrichContacts(contactRecords) {
    if (!localProfile || contactRecords.length === 0) return [];

    const otherIds = contactRecords.map(c =>
        c.sender_id === localProfile.id ? c.receiver_id : c.sender_id
    );

    // Buscar todos os perfis de uma vez
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .in('id', otherIds);

    if (error) {
        console.error('[Contacts] Erro ao buscar perfis:', error);
        return contactRecords.map(c => ({ ...c, otherProfile: null, isOnline: false }));
    }

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    return contactRecords.map(c => {
        const otherId = c.sender_id === localProfile.id ? c.receiver_id : c.sender_id;
        return {
            ...c,
            otherProfile: profileMap[otherId] || null,
            isOnline: onlineUsers.has(otherId)
        };
    });
}

// ==========================================
// === ROOM INVITES =========================
// ==========================================

/**
 * Convidar um contato para a sala atual ou criar uma sala temporária.
 */
export async function inviteContactToRoom(targetUserId, roomCode) {
    if (!localProfile) throw new Error('Usuário não autenticado.');

    // Limpar convites antigos do remetente para este destinatário
    await supabase
        .from('room_invites')
        .delete()
        .eq('sender_id', localProfile.id)
        .eq('receiver_id', targetUserId)
        .eq('status', 'pending');

    const { error } = await supabase.from('room_invites').insert([{
        sender_id: localProfile.id,
        receiver_id: targetUserId,
        room_code: roomCode,
        status: 'pending'
    }]);

    if (error) {
        console.error('[Invites] Erro ao enviar convite:', error);
        throw error;
    }

    console.log('[Invites] ✅ Convite enviado para', targetUserId, 'na sala', roomCode);
}

/**
 * Aceitar um convite de sala.
 */
export async function acceptRoomInvite(inviteId) {
    const { error } = await supabase
        .from('room_invites')
        .update({ status: 'accepted' })
        .eq('id', inviteId);

    if (error) {
        console.error('[Invites] Erro ao aceitar convite:', error);
        throw error;
    }
}

/**
 * Recusar um convite de sala.
 */
export async function declineRoomInvite(inviteId) {
    const { error } = await supabase
        .from('room_invites')
        .update({ status: 'rejected' })
        .eq('id', inviteId);

    if (error) {
        console.error('[Invites] Erro ao recusar convite:', error);
        throw error;
    }
}

// ==========================================
// === REALTIME SUBSCRIPTIONS ===============
// ==========================================

/**
 * Inscrever-se em mudanças de contatos (novas solicitações, aceitações, remoções).
 */
function subscribeToContactChanges() {
    if (!localProfile) return;

    contactsChannel = supabase.channel('contacts-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'contacts',
            filter: `sender_id=eq.${localProfile.id}`
        }, () => {
            console.log('[Contacts RT] Mudança detectada (como sender)');
            if (onContactsUpdated) onContactsUpdated();
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'contacts',
            filter: `receiver_id=eq.${localProfile.id}`
        }, () => {
            console.log('[Contacts RT] Mudança detectada (como receiver)');
            if (onContactsUpdated) onContactsUpdated();
        })
        .subscribe((status) => {
            console.log('[Contacts RT] Status inscrição:', status);
        });
}

/**
 * Inscrever-se em convites de sala em tempo real.
 */
function subscribeToInviteChanges() {
    if (!localProfile) return;

    invitesChannel = supabase.channel('invite-changes')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'room_invites',
            filter: `receiver_id=eq.${localProfile.id}`
        }, async (payload) => {
            console.log('[Invites RT] Novo convite recebido:', payload.new);
            const invite = payload.new;
            if (invite.status === 'pending') {
                // Buscar perfil do remetente
                const { data: senderProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', invite.sender_id)
                    .maybeSingle();

                if (onInviteReceived) {
                    onInviteReceived({
                        ...invite,
                        senderProfile
                    });
                }
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'room_invites',
            filter: `sender_id=eq.${localProfile.id}`
        }, (payload) => {
            console.log('[Invites RT] Resposta ao convite:', payload.new);
            if (onInviteResponseReceived) {
                onInviteResponseReceived(payload.new);
            }
        })
        .subscribe((status) => {
            console.log('[Invites RT] Status inscrição:', status);
        });
}

/**
 * Inscrever-se no canal de presença global para acompanhar quem está online.
 */
function subscribeToGlobalPresence() {
    if (!localProfile) return;

    presenceChannel = supabase.channel('vocal-global-presence');
    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const presState = presenceChannel.presenceState();
            onlineUsers.clear();
            for (const key in presState) {
                presState[key].forEach(p => {
                    if (p.userId) {
                        onlineUsers.add(p.userId);
                    }
                });
            }
            console.log('[Presence] Usuários online:', onlineUsers.size);
            if (onContactsUpdated) onContactsUpdated();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track({
                    userId: localProfile.id,
                    username: localProfile.username,
                    displayName: localProfile.display_name
                });
            }
        });
}

/**
 * Verificar se um user ID está online.
 */
export function isUserOnline(userId) {
    return onlineUsers.has(userId);
}
