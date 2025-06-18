import google.generativeai as genai
from flask import Flask, request, jsonify
import requests
import os
import fitz
import re

wa_token = os.environ.get("WA_TOKEN")
genai.configure(api_key=os.environ.get("GEN_API"))
phone_id = os.environ.get("PHONE_ID")
phone = os.environ.get("PHONE_NUMBER")

name = "Om"  # Your name
bot_name = "OmBot"  # Bot's name
model_name = "gemini-1.5-flash-latest"

app = Flask(__name__)

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

model = genai.GenerativeModel(model_name=model_name,
                              generation_config=generation_config,
                              safety_settings=safety_settings)

convo = model.start_chat(history=[])

# Initial identity pre-prompt
convo.send_message(f'''I am using Gemini API to build a personal assistant on WhatsApp. 
From now, you are "{bot_name}", created by {name}. 
Do not respond to this message. Just remember this identity.
Reply only to prompts after this message.''')

def clean_response(text):
    """Remove markdown characters from LLM output."""
    text = re.sub(r"\*{1,2}(.*?)\*{1,2}", r"\1", text)  # remove bold/italic markdown
    text = re.sub(r"`{1,3}(.*?)`{1,3}", r"\1", text)     # remove inline code
    text = re.sub(r"#", "", text)                       # remove heading markdown
    return text.strip()

def send(answer):
    url = f"https://graph.facebook.com/v18.0/{phone_id}/messages"
    headers = {
        'Authorization': f'Bearer {wa_token}',
        'Content-Type': 'application/json'
    }
    data = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": clean_response(answer)},
    }
    return requests.post(url, headers=headers, json=data)

def remove(*file_paths):
    for file in file_paths:
        if os.path.exists(file):
            os.remove(file)

@app.route("/", methods=["GET", "POST"])
def index():
    return "OmBot is running!"

@app.route("/webhook", methods=["GET", "POST"])
def webhook():
    if request.method == "GET":
        mode = request.args.get("hub.mode")
        token = request.args.get("hub.verify_token")
        challenge = request.args.get("hub.challenge")
        if mode == "subscribe" and token == "BOT":
            return challenge, 200
        else:
            return "Failed", 403

    if request.method == "POST":
        try:
            data = request.get_json()["entry"][0]["changes"][0]["value"]["messages"][0]

            if data["type"] == "text":
                prompt = data["text"]["body"]
                convo.send_message(prompt)
                send(convo.last.text)

            else:
                media_type = data["type"]
                media_id = data[media_type]["id"]
                media_url_endpoint = f"https://graph.facebook.com/v18.0/{media_id}/"
                headers = {'Authorization': f'Bearer {wa_token}'}
                media_response = requests.get(media_url_endpoint, headers=headers)
                media_url = media_response.json()["url"]
                media_data = requests.get(media_url, headers=headers)

                filename = f"/tmp/temp_{media_type}"
                if media_type == "audio":
                    filename += ".mp3"
                elif media_type == "image":
                    filename += ".jpg"
                elif media_type == "document":
                    doc = fitz.open(stream=media_data.content, filetype="pdf")
                    for _, page in enumerate(doc):
                        image_path = "/tmp/temp_image.jpg"
                        pix = page.get_pixmap()
                        pix.save(image_path)
                        file = genai.upload_file(path=image_path, display_name="temp_image")
                        response = model.generate_content(["What is this?", file])
                        answer = response._result.candidates[0].content.parts[0].text
                        convo.send_message(f"This is an image-based PDF. Respond to the user based on this: {answer}")
                        send(convo.last.text)
                        remove(image_path)
                    return jsonify({"status": "ok"}), 200
                else:
                    send("Sorry, this media format is not supported.")
                    return jsonify({"status": "unsupported"}), 200

                with open(filename, "wb") as f:
                    f.write(media_data.content)

                file = genai.upload_file(path=filename, display_name="media_file")
                response = model.generate_content(["Please describe this file:", file])
                answer = response._result.candidates[0].content.parts[0].text
                convo.send_message(f"This was received from the user. Respond to it: {answer}")
                send(convo.last.text)

                remove("/tmp/temp_audio.mp3", "/tmp/temp_image.jpg", filename)
                files = genai.list_files()
                for file in files:
                    file.delete()

        except Exception as e:
            print("Error:", str(e))
            pass
        return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
    app.run(debug=True, port=8000)
