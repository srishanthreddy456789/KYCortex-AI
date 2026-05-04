# 🚀 KYCortex AI

### AI-Powered Video KYC & Loan Onboarding System

KYCortex AI is a real-time, AI-driven KYC (Know Your Customer) platform that enables seamless identity verification using **live video, face detection, document capture, and an interactive AI agent**.

---

##Snapshot
<img src="Screenshot (1024).png"/>

## 🧠 Key Features

* 🎥 **Live Video Verification**

  * Real-time camera stream
  * Face detection using MediaPipe

* 🤖 **Cortex AI Agent**

  * Conversational UI
  * Voice-enabled interaction (Text-to-Speech + Speech Recognition)

* 🪪 **ID Capture**

  * Capture ID directly from live video
  * Send image to backend for processing

* ⚡ **Real-Time Communication**

  * WebSocket-based interaction
  * Instant AI responses

* 🔊 **Voice Interaction**

  * AI speaks instructions
  * User can respond via microphone

---

## 🏗️ Tech Stack

### Frontend

* React + TypeScript
* Vite
* Tailwind CSS
* MediaPipe (Face Detection)
* Web Speech API (Voice)

### Backend

* FastAPI (Python)
* WebSockets
* Session-based state management

---

## 📁 Project Structure

```
KYCortex-AI/
│
├── backend/
│   ├── app.py
│   ├── routes/
│   │    └── kyc.py
│   ├── services/
│   │    ├── agent_service.py
│   │    ├── session_service.py
│   ├── websocket/
│   │    └── ws_manager.py
│
├── frontend/
│   ├── src/
│   │    ├── components/
│   │    │    ├── VideoCapture.tsx
│   │    │    ├── ChatAgent.tsx
│   │    │    ├── IDCapture.tsx
│   │    ├── pages/
│   │    │    └── Index.tsx
```

---

## ⚙️ Setup Instructions

### 🔹 1. Backend Setup

```bash
cd backend
pip install fastapi uvicorn
uvicorn app:app --reload
```

Backend runs on:

```
http://127.0.0.1:8000
```

---

### 🔹 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```
http://localhost:8080
```

---

## 🔌 How It Works

### Step-by-step Flow:

1. User opens the app
2. Frontend starts a session (`/kyc/start`)
3. WebSocket connection is established
4. AI agent begins interaction
5. Face detection runs in real-time
6. User captures ID
7. Backend processes data
8. AI agent guides user through steps

---

## 🔄 WebSocket Events

### 📤 From Frontend → Backend

```json
{
  "type": "FACE_UPDATE",
  "confidence": 0.72
}
```

```json
{
  "type": "ID_CAPTURED",
  "image": "base64-image"
}
```

---

### 📥 From Backend → Frontend

```json
{
  "message": "Now capture your ID"
}
```

---

## 🔊 Voice System

* **Speech-to-Text:** Browser Web Speech API
* **Text-to-Speech:** SpeechSynthesis API

No external APIs required ✅

---

## 🧪 Testing

1. Start backend
2. Start frontend
3. Open browser
4. Allow camera + mic permissions
5. Interact with AI agent

---

## ⚠️ Known Limitations

* OCR not implemented yet
* Face verification is basic (confidence-based)
* No database (session stored in memory)

---

## 🚀 Future Improvements

* 📄 OCR (Tesseract)
* 🧠 Smarter AI agent (LLM integration)
* 🧾 ID validation (Aadhaar, PAN, etc.)
* ☁️ Cloud deployment
* 🔐 Authentication & security layer

---

## 🤝 Contribution

Feel free to fork, improve, and submit PRs.

---

## 📜 License

This project is open-source and available under the MIT License.

---

## 💡 Author

Built with ❤️ by **Srishanth**
