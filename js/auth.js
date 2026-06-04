import { supabase } from './supabase-config.js';

/**
 * Clean username to remove '@' and trim/lowercase it.
 */
export function cleanUsername(username) {
    return username.replace(/^@/, '').trim().toLowerCase();
}

/**
 * Cadastrar um novo usuário no Supabase Auth e criar seu perfil em profiles.
 */
export async function signUp(username, displayName, password) {
    if (!supabase) throw new Error('Supabase não inicializado.');
    
    const userClean = cleanUsername(username);
    if (userClean.length < 3) {
        throw new Error('O nome de usuário deve ter pelo menos 3 caracteres.');
    }
    if (password.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres.');
    }

    // 1. Verificar se o username já está em uso na tabela de perfis
    const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', userClean)
        .maybeSingle();

    if (existingProfile) {
        throw new Error('Este nome de usuário (@' + userClean + ') já está em uso.');
    }

    // 2. Criar e-mail dummy para o Supabase Auth (ex: user@vocalapp.com)
    const email = `${userClean}@vocalapp.com`;

    // 3. Cadastrar no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Falha ao criar usuário.');

    // 4. Criar perfil na tabela profiles
    const { error: profileError } = await supabase
        .from('profiles')
        .insert([
            {
                id: authData.user.id,
                username: userClean,
                display_name: displayName.trim() || userClean
            }
        ]);

    if (profileError) {
        // Se falhar o perfil, tenta deletar ou limpar para não deixar órfão
        console.error('Erro ao criar perfil:', profileError);
        throw profileError;
    }

    return authData.user;
}

/**
 * Entrar com nome de usuário (@usuario) e senha.
 */
export async function signIn(username, password) {
    if (!supabase) throw new Error('Supabase não inicializado.');

    const userClean = cleanUsername(username);
    const email = `${userClean}@vocalapp.com`;

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        if (error.message === 'Invalid login credentials') {
            throw new Error('Usuário ou senha incorretos.');
        }
        throw error;
    }

    // Carrega perfil para confirmar
    const profile = await getUserProfile(data.user.id);
    return { user: data.user, profile };
}

/**
 * Sair da conta e limpar sessão.
 */
export async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
}

/**
 * Retorna o perfil do usuário logado na tabela profiles.
 */
export async function getUserProfile(userId) {
    if (!supabase) return null;
    
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
        
    if (error) {
        console.error('Erro ao buscar perfil:', error);
        return null;
    }
    return data;
}

/**
 * Obter a sessão e o perfil do usuário atualmente autenticado.
 */
export async function getCurrentUser() {
    if (!supabase) return null;

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;

    const profile = await getUserProfile(session.user.id);
    return {
        user: session.user,
        profile
    };
}
