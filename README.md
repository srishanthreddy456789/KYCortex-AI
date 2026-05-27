# 🚀 KYCortex AI

### AI-Powered Video KYC & Loan Onboarding System

KYCortex AI is a real-time, AI-driven KYC (Know Your Customer) platform that enables seamless identity verification using **live video, face detection, document capture with OCR, and an interactive AI agent**.

---

## Snapshot
<img src="Screenshot (1024).png"/>

---

## 🧠 Key Features

* 🎥 **Live Video Verification**
  * Real-time camera stream
  * Face detection using MediaPipe
  * Liveness scoring with bounding box overlay

* 🤖 **Cortex AI Agent**
  * Real-time WebSocket-based conversation
  * Voice-enabled interaction (Text-to-Speech + Speech Recognition)
  * Step-guided KYC flow: Welcome → Face Check → ID Capture → Confirm → Done

* 🪪 **ID Capture & OCR Extraction**
  * Capture ID directly from live video or upload a file
  * Send image to backend for OCR processing
  * Extracts: Name, Date of Birth, ID Number, Address, Gender, PIN Code
  * Supports: Aadhaar, PAN, Driving License, Passport, Voter ID

* ⚡ **Real-Time Communication**
  * WebSocket-based interaction
  * Instant AI responses with typing indicator

* 🔊 **Voice Interaction**
  * AI speaks instructions
  * User can respond via microphone (Web Speech API)

* 💰 **Loan Eligibility Check**
  * Automatic eligibility assessment after KYC completion

---

## 🏗️ Tech Stack

### Frontend

* React + TypeScript
* Vite
* Tailwind CSS + ShadCN UI
* MediaPipe (Face Detection)
* Web Speech API (Voice)

### Backend

* FastAPI (Python)
* WebSockets (real-time AI agent)
* pytesseract + OpenCV (OCR)
* PIL / Pillow (image processing)
* Session-based state management (in-memory)

---

## 📁 Project Structure

```
KYCortex-AI/
│
├── backend/
│   ├── app.py                    # FastAPI entry point
│   ├── requirements.txt
│   ├── routes/
│   │    ├── kyc.py               # /kyc/start, /kyc/status, WebSocket /kyc/ws
│   │    ├── ocr.py               # POST /ocr/extract
│   │    ├── face.py              # POST /face/verify
│   │    └── loan.py              # POST /loan/check
│   ├── services/
│   │    ├── ocr_service.py       # pytesseract + regex field extraction
│   │    ├── face_service.py      # face confidence validator
│   │    ├── llm_service.py       # step-based AI agent messages
│   │    └── session_service.py   # in-memory session store
│   ├── websocket/
│   │    └── ws_manager.py        # WebSocket connection manager
│   └── utils/
│        └── helpers.py           # base64 decode, image preprocessing
│
├── frontend/
│   ├── src/
│   │    ├── components/
│   │    │    ├── VideoCapture.tsx  # Live camera + MediaPipe face detection
│   │    │    ├── ChatAgent.tsx     # AI agent chat with real WebSocket
│   │    │    └── IDCapture.tsx     # ID capture + OCR results display
│   │    └── pages/
│   │         └── Index.tsx         # Main page with session management
```

---

## ⚙️ Setup Instructions

### 🔹 Prerequisites

1. **Python 3.10+**
2. **Tesseract OCR** (required for document text extraction)
   - **Windows:** Download from https://github.com/UB-Mannheim/tesseract/wiki
   - Install to: `C:\Program Files\Tesseract-OCR\`
   - Linux: `sudo apt install tesseract-ocr`
   - macOS: `brew install tesseract`

---

### 🔹 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Backend runs on: `http://127.0.0.1:8000`

> Verify Tesseract is working: `GET http://localhost:8000/health`

**API Documentation:** `http://localhost:8000/docs`

---

### 🔹 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: `http://localhost:8080` (or `http://localhost:5173`)

---

## 🔌 How It Works

### Step-by-step Flow:

1. User opens the app
2. Frontend starts a session (`POST /kyc/start`) → gets `session_id`
3. WebSocket connection established (`WS /kyc/ws/{session_id}`)
4. AI agent sends welcome message and begins face check
5. Face detection runs in real-time using MediaPipe; confidence sent to backend
6. Once face is verified, agent asks user to capture ID
7. User captures ID from camera or uploads file
8. Image sent to `POST /ocr/extract` → extracted fields displayed
9. Agent confirms details and guides to submission
10. `POST /loan/check` evaluates eligibility

---

## 🔄 WebSocket Events

### 📤 From Frontend → Backend

```json
{ "type": "FACE_UPDATE", "confidence": 0.72 }
{ "type": "ID_CAPTURED", "image": "base64-image" }
{ "type": "USER_MESSAGE", "text": "Hello" }
{ "type": "SUBMIT_KYC" }
```

### 📥 From Backend → Frontend

```json
{ "type": "AGENT_MESSAGE", "step": "welcome", "message": "Welcome to KYCortex AI..." }
{ "type": "STEP_CHANGE", "step": "face_check", "message": "Face detected! Stay still..." }
{ "type": "OCR_RESULT", "data": { "name": "...", "dob": "...", "id_number": "..." } }
{ "type": "FACE_STATUS", "verified": false, "confidence": 45.2 }
{ "type": "ERROR", "message": "..." }
```

---

## 🔊 Voice System

* **Speech-to-Text:** Browser Web Speech API
* **Text-to-Speech:** SpeechSynthesis API

No external APIs required ✅

---

## 📄 OCR Field Extraction

The backend extracts the following fields from documents:

| Field | Supported Documents |
|---|---|
| Name | All |
| Date of Birth | Aadhaar, DL, Passport |
| ID Number | Aadhaar (XXXX XXXX XXXX), PAN (ABCDE1234F), DL, Passport |
| Address | Aadhaar, DL |
| Gender | Aadhaar, Passport |
| PIN Code | Aadhaar |
| Document Type | Auto-detected |

---

## 🧪 Testing

1. Install Tesseract OCR
2. Start backend: `uvicorn app:app --reload` (from `backend/`)
3. Start frontend: `npm run dev` (from `frontend/`)
4. Open browser at `http://localhost:8080`
5. Allow camera + mic permissions
6. Wait for face detection to kick in
7. Capture your ID or upload an image
8. Click **Analyze** → see extracted fields
9. Click **Submit KYC**

---

## ⚠️ Known Limitations

* OCR accuracy depends on image quality and lighting
* No database — sessions stored in memory (cleared on restart)
* Face verification is confidence-based (not biometric matching)
* No authentication layer

---

## 🚀 Future Improvements

* 🧠 LLM integration (GPT/Gemini) for smarter agent
* 🧾 Deep ID validation (checksum for Aadhaar/PAN)
* 🗃️ Database persistence (PostgreSQL/MongoDB)
* ☁️ Cloud deployment (AWS/GCP)
* 🔐 Auth + encryption layer
* 🌍 Multi-language OCR support

---

## 🤝 Contribution

Feel free to fork, improve, and submit PRs.

---

## 📜 License

This project is open-source and available under the MIT License.

---

## 💡 Author

Built with ❤️ by **Srishanth**
Backend developed by **KYCortex AI Team**
