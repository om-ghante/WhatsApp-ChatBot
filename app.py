import google.generativeai as genai
from flask import Flask, request, jsonify
import requests
import os
import fitz
import logging

# Initialize logging
logging.basicConfig(level=logging.INFO)

# Environment variables
wa_token = os.environ.get("WA_TOKEN")
genai.configure(api_key=os.environ.get("GEN_API"))
phone_id = os.environ.get("PHONE_ID")
phone = os.environ.get("PHONE_NUMBER")
name = "Your name or nickname"
bot_name = "Your Bot Name"
model_name = "gemini-1.5-flash-latest"

app = Flask(__name__)

# Gemini configuration
generation_config = {
    "temperature": 1,
    "top_p": 0.95,
    "top_k": 0,
    "max_output_tokens": 8192,
}

safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
]

# Initialize model once
model = genai.GenerativeModel(
    model_name=model_name,
    generation_config=generation_config,
    safety_settings=safety_settings
)

def send_whatsapp_message(answer):
    """Send message through WhatsApp API"""
    url = f"https://graph.facebook.com/v18.0/{phone_id}/messages"
    headers = {
        'Authorization': f'Bearer {wa_token}',
        'Content-Type': 'application/json'
    }
    data = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": answer},
    }
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        return response
    except requests.exceptions.RequestException as e:
        logging.error(f"WhatsApp API error: {str(e)}")
        return None

def download_media(media_id):
    """Download media from WhatsApp servers"""
    url = f'https://graph.facebook.com/v18.0/{media_id}/'
    headers = {'Authorization': f'Bearer {wa_token}'}
    try:
        media_response = requests.get(url, headers=headers)
        media_response.raise_for_status()
        media_url = media_response.json().get("url")
        
        media_download = requests.get(media_url, headers=headers)
        media_download.raise_for_status()
        return media_download.content
    except requests.exceptions.RequestException as e:
        logging.error(f"Media download error: {str(e)}")
        return None

def process_pdf(content):
    """Convert first PDF page to image"""
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        pix = doc[0].get_pixmap()
        image_path = "/tmp/temp_image.jpg"
        pix.save(image_path)
        return image_path
    except Exception as e:
        logging.error(f"PDF processing error: {str(e)}")
        return None

def analyze_file(file_path, prompt_text):
    """Analyze file with Gemini"""
    try:
        file = genai.upload_file(file_path, display_name="tempfile")
        response = model.generate_content([prompt_text, file])
        file.delete()
        return response.text
    except Exception as e:
        logging.error(f"Gemini analysis error: {str(e)}")
        return "❌ Error processing file"

@app.route("/", methods=["GET"])
def index():
    return "WhatsApp Bot is Running"

@app.route("/webhook", methods=["GET", "POST"])
def webhook():
    if request.method == "GET":
        mode = request.args.get("hub.mode")
        token = request.args.get("hub.verify_token")
        challenge = request.args.get("hub.challenge")
        if mode == "subscribe" and token == "BOT":
            return challenge, 200
        return "Verification failed", 403

    # POST request handling
    try:
        data = request.get_json()
        message = data["entry"][0]["changes"][0]["value"]["messages"][0]
        msg_type = message["type"]
        
        # Start new conversation for each request
        convo = model.start_chat(history=[])
        convo.send_message(
            f"You are {bot_name}, created by {name}. "
            f"Respond helpfully and concisely to user queries."
        )

        if msg_type == "text":
            prompt = message["text"]["body"]
            convo.send_message(prompt)
            send_whatsapp_message(convo.last.text)
            
        elif msg_type in ["image", "audio", "document"]:
            media_id = message[msg_type]["id"]
            media_content = download_media(media_id)
            
            if not media_content:
                send_whatsapp_message("❌ Failed to download media")
                return jsonify({"status": "error"}), 400

            # Handle PDF documents
            if msg_type == "document":
                mime_type = message["document"].get("mime_type", "")
                if "pdf" not in mime_type:
                    send_whatsapp_message("❌ Only PDF documents are supported")
                    return jsonify({"status": "ok"}), 200
                    
                image_path = process_pdf(media_content)
                if not image_path:
                    send_whatsapp_message("❌ PDF processing failed")
                    return jsonify({"status": "error"}), 500
                    
                analysis = analyze_file(image_path, "Describe this document:")
                os.remove(image_path)
                send_whatsapp_message(f"📄 Document analysis:\n\n{analysis}")
            
            # Handle images
            elif msg_type == "image":
                image_path = "/tmp/temp_image.jpg"
                with open(image_path, "wb") as img_file:
                    img_file.write(media_content)
                
                analysis = analyze_file(image_path, "What's in this image?")
                os.remove(image_path)
                send_whatsapp_message(f"🖼️ Image analysis:\n\n{analysis}")
            
            # Handle audio
            elif msg_type == "audio":
                audio_path = "/tmp/temp_audio.mp3"
                with open(audio_path, "wb") as audio_file:
                    audio_file.write(media_content)
                
                analysis = analyze_file(audio_path, "Transcribe this audio:")
                os.remove(audio_path)
                send_whatsapp_message(f"🎧 Audio transcription:\n\n{analysis}")
                
        else:
            send_whatsapp_message("⚠️ Unsupported message type")

    except Exception as e:
        logging.error(f"Webhook processing error: {str(e)}")
        return jsonify({"status": "error"}), 500

    return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=False)