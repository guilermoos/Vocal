let audioCtx;
let incomingInterval = null;
let titleBlinkInterval = null;
const ORIGINAL_TITLE = document.title;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

export function playNote(freq, startTime, duration, startGain = 0.2) {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(startGain, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
    } catch (err) {
        console.error('Erro ao reproduzir nota:', err);
    }
}

export function playIncomingRing() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        playNote(440, now, 0.12, 0.15);
        playNote(440, now + 0.2, 0.12, 0.15);
    } catch (err) {
        console.error('Erro ao tocar chamada recebida:', err);
    }
}

export function stopIncomingSound() {
    if (incomingInterval) {
        clearInterval(incomingInterval);
        incomingInterval = null;
    }
}

export function playSound(type) {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        
        if (type === 'incoming') {
            stopIncomingSound();
            playIncomingRing();
            incomingInterval = setInterval(playIncomingRing, 1500);
        } else if (type === 'connect') {
            stopIncomingSound();
            playNote(523.25, now, 0.15, 0.15); // C5
            playNote(659.25, now + 0.08, 0.15, 0.15); // E5
            playNote(783.99, now + 0.16, 0.3, 0.15); // G5
        } else if (type === 'disconnect') {
            stopIncomingSound();
            
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.linearRampToValueAtTime(220, now + 0.25);
            
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.15, now + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    } catch (err) {
        console.error('Erro na função playSound:', err);
    }
}

export function startTitleBlink(message) {
    if (titleBlinkInterval) clearInterval(titleBlinkInterval);
    let showMsg = true;
    document.title = message;
    titleBlinkInterval = setInterval(() => {
        showMsg = !showMsg;
        document.title = showMsg ? message : ORIGINAL_TITLE;
    }, 1000);
}

export function stopTitleBlink() {
    if (titleBlinkInterval) {
        clearInterval(titleBlinkInterval);
        titleBlinkInterval = null;
    }
    document.title = "Vocal";
}

export function playChatChime() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        playNote(587.33, now, 0.08, 0.08); // D5
        playNote(880, now + 0.06, 0.15, 0.08); // A5
    } catch (err) {
        console.error('Erro ao reproduzir chime do chat:', err);
    }
}

let visualizerRequestRef = null;
let visualizerSource = null;
let visualizerAnalyser = null;

export function startVoiceVisualizer(stream) {
    try {
        stopVoiceVisualizer(); // Ensure any existing loop is stopped
        
        const ctx = getAudioContext();
        
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        
        visualizerAnalyser = ctx.createAnalyser();
        visualizerAnalyser.fftSize = 32; // small FFT size for 7 bars
        
        visualizerSource = ctx.createMediaStreamSource(stream);
        visualizerSource.connect(visualizerAnalyser);
        
        const bufferLength = visualizerAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const bars = document.querySelectorAll('#voice-wave-bars .bar');
        if (bars.length === 0) return;
        
        function draw() {
            if (!visualizerAnalyser) return;
            visualizerRequestRef = requestAnimationFrame(draw);
            
            visualizerAnalyser.getByteFrequencyData(dataArray);
            
            for (let i = 0; i < bars.length; i++) {
                const dataIndex = Math.min(i + 1, bufferLength - 1);
                const value = dataArray[dataIndex];
                const percent = value / 255;
                const height = 6 + percent * 36; // scales from 6px to 42px
                bars[i].style.height = `${height}px`;
            }
        }
        
        draw();
    } catch (err) {
        console.error('Erro ao iniciar visualizador de voz:', err);
    }
}

export function stopVoiceVisualizer() {
    if (visualizerRequestRef) {
        cancelAnimationFrame(visualizerRequestRef);
        visualizerRequestRef = null;
    }
    
    if (visualizerSource) {
        try { visualizerSource.disconnect(); } catch (e) {}
        visualizerSource = null;
    }
    
    visualizerAnalyser = null;
    
    const bars = document.querySelectorAll('#voice-wave-bars .bar');
    bars.forEach(bar => {
        bar.style.height = '6px';
    });
}
