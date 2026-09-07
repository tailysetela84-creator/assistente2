import os
from flask import Flask, request, jsonify, render_template
import whisper
from werkzeug.utils import secure_filename
import tempfile
from openai import OpenAI

app = Flask(__name__, template_folder='templates', static_folder='static')

# Configuration
UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'm4a', 'ogg', 'webm'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Load Whisper model (using base model by default)
model_name = os.environ.get('WHISPER_MODEL', 'base')
model = whisper.load_model(model_name)

# Initialize OpenAI client
openai_api_key = os.environ.get('OPENAI_API_KEY')
if openai_api_key:
    openai_client = OpenAI(api_key=openai_api_key)
else:
    openai_client = None

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def home():
    return render_template('dashboard.html')

@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'model': model_name})

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    file = request.files['audio']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400
    
    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Transcribe audio
        result = model.transcribe(filepath)
        
        # Clean up
        os.remove(filepath)
        
        return jsonify({
            'text': result['text'],
            'language': result.get('language', 'unknown'),
            'segments': result.get('segments', [])
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat():
    data = request.get_json()
    message = data.get('message', '').strip()
    
    if not message:
        return jsonify({'error': 'No message provided'}), 400
    
    try:
        # Use OpenAI API if available, otherwise fallback to simple responses
        if openai_client:
            response = generate_llm_response(message)
        else:
            response = generate_ai_response(message)
        
        return jsonify({
            'response': response
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def generate_llm_response(message):
    """Generate AI response using OpenAI LLM"""
    try:
        completion = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": "Você é um assistente de IA útil e amigável que responde em português. Você tem conhecimento sobre transcrição de áudio e pode ajudar com diversos assuntos."
                },
                {
                    "role": "user",
                    "content": message
                }
            ],
            max_tokens=500,
            temperature=0.7
        )
        
        return completion.choices[0].message.content
    except Exception as e:
        print(f"OpenAI API error: {e}")
        return generate_ai_response(message)

def generate_ai_response(message):
    """Generate AI response based on message content (fallback)"""
    message_lower = message.lower()
    
    # Simple keyword-based responses (can be replaced with actual AI)
    if 'agricultura' in message_lower or 'fazenda' in message_lower or 'planta' in message_lower:
        return "A agricultura é a prática de cultivar plantas e criar animais para alimentação, fibra e outros produtos. Inclui técnicas como rotação de culturas, irrigação e uso de fertilizantes para aumentar a produtividade. A agricultura sustentável busca equilibrar produção com preservação ambiental."
    elif 'transcrição' in message_lower or 'transcrever' in message_lower:
        return "Posso ajudar você a transcrever áudios em tempo real! Basta clicar no ícone de telefone para iniciar uma chamada e tudo que for falado será transcrito automaticamente usando o modelo Whisper da OpenAI."
    elif 'olá' in message_lower or 'oi' in message_lower:
        return "Olá! Como posso ajudar você hoje? Posso transcrever áudios, responder perguntas ou conversar sobre diversos temas."
    elif 'ajuda' in message_lower or 'help' in message_lower:
        return "Claro! Estou aqui para ajudar. Posso transcrever áudios em tempo real durante chamadas, responder perguntas e conversar. Use o chat para digitar mensagens ou o botão de telefone para chamadas com transcrição."
    elif 'obrigado' in message_lower or 'thanks' in message_lower:
        return "De nada! Se precisar de mais alguma coisa, é só chamar."
    else:
        return f"Entendi sua mensagem sobre \"{message}\". Como sou um assistente focado em transcrição de áudio, posso ajudar melhor com chamadas e transcrições. Quer que eu explique mais sobre como funciona a transcrição em tempo real?"

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
