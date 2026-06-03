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
