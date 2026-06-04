export function generateRandomCode() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

export function setupClipboardCopy(button, getValue) {
    if (!button) return;
    button.addEventListener('click', () => {
        const text = getValue();
        navigator.clipboard.writeText(text).then(() => {
            button.classList.add('copied');
            setTimeout(() => {
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => console.error('Falha ao copiar:', err));
    });
}

export async function hashPassword(password) {
    if (!password) return null;
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

