// App State
let isCallActive = false;
let callStartTime = null;
let callTimerInterval = null;
let mediaRecorder = null;
let audioChunks = [];
let isMuted = false;
let isVideoOn = false;
let audioContext = null;
let analyser = null;
let voiceActivityInterval = null;

// DOM Elements
const chatView = document.getElementById('chatView');
const callView = document.getElementById('callView');
const startCallBtn = document.getElementById('startCallBtn');
const callBtn = document.getElementById('callBtn');
const endCallBtn = document.getElementById('endCallBtn');
const hangupBtn = document.getElementById('hangupBtn');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const speakerBtn = document.getElementById('speakerBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');
const transcriptionContent = document.getElementById('transcriptionContent');
const clearTranscription = document.getElementById('clearTranscription');
const callTimer = document.getElementById('callTimer');
const callStatus = document.getElementById('callStatus');
const voiceActivityLevel = document.getElementById('voiceActivityLevel');
const voiceActivityValue = document.getElementById('voiceActivityValue');
const languageSelect = document.getElementById('languageSelect');

// Chat Functions
function addMessage(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
    
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <img src="${isUser ? '/static/user-avatar.png' : '/static/ai-avatar.png'}" alt="${isUser ? 'User' : 'AI'}">
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-author">${isUser ? 'Você' : 'Assistente AI'}</span>
                ${!isUser ? '<span class="ai-label">ai</span>' : ''}
            </div>
            <div class="message-text">${text}</div>
            ${!isUser ? `
            <div class="message-actions">
                <button class="action-btn"><i class="fas fa-redo"></i></button>
                <button class="action-btn"><i class="fas fa-thumbs-down"></i></button>
                <button class="action-btn"><i class="fas fa-thumbs-up"></i></button>
                <button class="action-btn"><i class="fas fa-reply"></i></button>
            </div>
            ` : ''}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    
    addMessage(text, true);
    messageInput.value = '';
    
    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: text })
        });
        
        const data = await response.json();
        
        if (data.response) {
            addMessage(data.response, false);
        } else if (data.error) {
            addMessage('Erro ao processar mensagem: ' + data.error, false);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        addMessage('Erro de conexão. Tente novamente.', false);
    }
}

// Call Functions
function startCall() {
    isCallActive = true;
    callStartTime = Date.now();
    
    chatView.style.display = 'none';
    callView.style.display = 'flex';
    
    startCallTimer();
    callStatus.textContent = 'Em chamada';
    
    // Start audio recording for transcription
    startAudioRecording();
}

function endCall() {
    isCallActive = false;
    
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
    }
    
    if (transcriptionInterval) {
        clearInterval(transcriptionInterval);
    }
    
    if (voiceActivityInterval) {
        clearInterval(voiceActivityInterval);
    }
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    // Stop all audio tracks
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    // Close audio context
    if (audioContext) {
        audioContext.close();
    }
    
    // Reset voice activity UI
    voiceActivityLevel.style.width = '0%';
    voiceActivityValue.textContent = '0%';
    
    callView.style.display = 'none';
    chatView.style.display = 'flex';
    
    callTimer.textContent = '00:00';
    addTranscriptionItem('Chamada encerrada.', 'Sistema');
}

function startCallTimer() {
    callTimerInterval = setInterval(() => {
        const elapsed = Date.now() - callStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        callTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Audio Recording and Transcription
let transcriptionInterval = null;

async function startAudioRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];
        
        // Set up audio context for voice activity detection
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        
        // Start voice activity detection
        startVoiceActivityDetection();
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            if (audioChunks.length > 0) {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await transcribeAudio(audioBlob);
            }
        };
        
        mediaRecorder.start(1000); // Collect data every second
        
        // For real-time transcription, send chunks periodically
        transcriptionInterval = setInterval(async () => {
            if (mediaRecorder && mediaRecorder.state === 'recording' && audioChunks.length > 0) {
                const tempBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await transcribeAudio(tempBlob);
                audioChunks = []; // Clear chunks after sending
            }
        }, 5000); // Send every 5 seconds
        
        addTranscriptionItem('Gravação iniciada. Fale agora...', 'Sistema');
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        addTranscriptionItem('Erro ao acessar microfone: ' + error.message, 'Sistema');
    }
}

function startVoiceActivityDetection() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    voiceActivityInterval = setInterval(() => {
        if (!isCallActive) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;
        
        // Convert to percentage (0-100)
        const percentage = Math.min(100, Math.round((average / 128) * 100));
        
        // Update UI
        voiceActivityLevel.style.width = percentage + '%';
        voiceActivityValue.textContent = percentage + '%';
        
        // Change color based on activity level
        if (percentage > 50) {
            voiceActivityLevel.style.background = 'linear-gradient(90deg, #4ade80, #22c55e)';
        } else if (percentage > 20) {
            voiceActivityLevel.style.background = 'linear-gradient(90deg, #4a90e2, #6ab7ff)';
        } else {
            voiceActivityLevel.style.background = 'linear-gradient(90deg, #6b7280, #9ca3af)';
        }
    }, 100);
}

async function transcribeAudio(audioBlob) {
    try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        
        const language = languageSelect.value;
        if (language && language !== 'auto') {
            formData.append('language', language);
        }
        
        const response = await fetch('/transcribe', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.text) {
            addTranscriptionItem(data.text, 'Você');
            
            // Get AI response and speak it
            if (data.text.trim()) {
                await getAIResponseAndSpeak(data.text);
            }
        }
        
    } catch (error) {
        console.error('Error transcribing audio:', error);
    }
}

async function getAIResponseAndSpeak(text) {
    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: text })
        });
        
        const data = await response.json();
        
        if (data.response) {
            addTranscriptionItem(data.response, 'Assistente AI');
            
            // Speak the response
            await speakResponse(data.response);
        }
    } catch (error) {
        console.error('Error getting AI response:', error);
    }
}

async function speakResponse(text) {
    try {
        const response = await fetch('/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                text: text,
                language: languageSelect.value || 'pt'
            })
        });
        
        if (response.ok) {
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
        }
    } catch (error) {
        console.error('Error playing TTS:', error);
    }
}

function addTranscriptionItem(text, speaker) {
    // Remove placeholder if exists
    const placeholder = transcriptionContent.querySelector('.transcription-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    const item = document.createElement('div');
    item.className = 'transcription-item';
    
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    item.innerHTML = `
        <div class="transcription-speaker">${speaker}</div>
        <div class="transcription-text">${text}</div>
        <div class="transcription-time">${time}</div>
    `;
    
    transcriptionContent.appendChild(item);
    transcriptionContent.scrollTop = transcriptionContent.scrollHeight;
}

function clearTranscriptionArea() {
    transcriptionContent.innerHTML = `
        <div class="transcription-placeholder">
            A transcrição aparecerá aqui durante a chamada...
        </div>
    `;
}

// Control Functions
function toggleMute() {
    isMuted = !isMuted;
    muteBtn.classList.toggle('active', isMuted);
    muteBtn.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    
    if (mediaRecorder) {
        if (isMuted) {
            mediaRecorder.pause();
        } else {
            mediaRecorder.resume();
        }
    }
}

function toggleVideo() {
    isVideoOn = !isVideoOn;
    videoBtn.classList.toggle('active', isVideoOn);
    // Video functionality would be implemented here
}

function toggleSpeaker() {
    speakerBtn.classList.toggle('active');
    // Speaker functionality would be implemented here
}

// Event Listeners
startCallBtn.addEventListener('click', startCall);
callBtn.addEventListener('click', startCall);
endCallBtn.addEventListener('click', endCall);
hangupBtn.addEventListener('click', endCall);
muteBtn.addEventListener('click', toggleMute);
videoBtn.addEventListener('click', toggleVideo);
speakerBtn.addEventListener('click', toggleSpeaker);

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

clearTranscription.addEventListener('click', clearTranscriptionArea);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Create placeholder avatars if images don't exist
    const avatarImages = document.querySelectorAll('.avatar img, .ai-avatar img, .user-avatar img, .message-avatar img');
    avatarImages.forEach(img => {
        img.onerror = function() {
            this.style.display = 'none';
            this.parentElement.style.background = '#3a3a3a';
        };
    });
});
