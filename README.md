# Real-time Live Speech-to-Text Web App

A full-stack web application that allows real-time speech-to-text transcription with multilingual support.

## Features

- Admin can start/stop voice recording from their browser
- Real-time transcriptions for connected users
- Multilingual support with language selection
- WebSocket-based communication for instant updates
- Role-based access (Admin/Listener)

## Tech Stack

- **Frontend**: React.js, Bootstrap, Socket.io Client
- **Backend**: Node.js, Express, Socket.io
- **Speech Recognition**: Google Speech-to-Text API

## Prerequisites

- Node.js (v14 or higher)
- Google Cloud account with Speech-to-Text API enabled
- Google Cloud credentials JSON file

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/realtime-AI-tts.git
cd realtime-AI-tts
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file from example
cp .env-example .env
```

Update the `.env` file with your Google Cloud credentials path:

```
GOOGLE_APPLICATION_CREDENTIALS=./your-credentials-file.json
```

Download your Google Cloud credentials JSON file and place it in the backend directory, then update the .env file with the correct path.

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install
```

### 4. Start the application

In one terminal, start the backend:

```bash
cd backend
npm run dev
```

In another terminal, start the frontend:

```bash
cd frontend
npm start
```

The application will be available at http://localhost:3000

## Usage

1. Open the application in your browser
2. Choose your role (Admin or Listener)
3. If you're an Admin, you can start/stop recording
4. If you're a Listener, select your preferred language and wait for the Admin to speak
5. View real-time transcriptions as the Admin speaks

## License

MIT

## Notes for Production

- Set proper CORS restrictions in the backend
- Use environment variables for sensitive information
- Consider adding authentication for the Admin role
- Deploy frontend and backend to separate services
- Set up proper error handling and logging
