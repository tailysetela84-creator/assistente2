// App State
let isCallActive = false;
let callStartTime = null;
let callTimerInterval = null;
let mediaRecorder = null;
let audioChunks = [];
let isMuted = false;
let isVideoOn = false;

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
    
    // Simulate AI response
    setTimeout(() => {
        addMessage('Recebi sua mensagem! Como posso ajudar?');
    }, 1000);
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
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    
    callView.style.display = 'none';
    chatView.style.display = 'flex';
    
    callTimer.textContent = '00:00';
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
async function startAudioRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
        };
        
        mediaRecorder.start();
        
        // For real-time transcription, send chunks periodically
        setInterval(async () => {
            if (mediaRecorder.state === 'recording' && audioChunks.length > 0) {
                const tempBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await transcribeAudio(tempBlob);
                audioChunks = []; // Clear chunks after sending
            }
        }, 5000); // Send every 5 seconds
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        addTranscriptionItem('Erro ao acessar microfone', 'Sistema');
    }
}

async function transcribeAudio(audioBlob) {
    try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        
        const response = await fetch('/transcribe', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.text) {
            addTranscriptionItem(data.text, 'Você');
        }
        
    } catch (error) {
        console.error('Error transcribing audio:', error);
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
