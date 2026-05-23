# Investigation Game

Investigation Game is an AI-driven detective experience where players open a case, receive an operational briefing, interrogate suspects and witnesses, review evidence, consult a commanding officer, and submit a final accusation.

The project is built as a full-stack application with a React + Vite frontend and a Node.js + Express + MongoDB backend. AI is used both to generate case files and to power live interrogation dialogue.

## Overview

- User registration and login secured with JWT authentication.
- Dynamic case generation based on difficulty level and commander personality.
- Structured case briefings with timeline markers, known facts, and opening leads.
- Real-time suspect and witness interrogation powered by AI.
- Stress-based response behavior influenced by questioning style and tone.
- Commander consultation flow that provides guidance without revealing the solution.
- Evidence assets, including generated visual or audio files, stored under `backend/generated-evidence`.
- Persistent investigator notes saved on the backend.
- Final solve flow for closing a case with reasoning.

## Tech Stack

### Frontend

- React 19
- Vite
- React Router
- Fetch API

### Backend

- Node.js
- Express
- MongoDB with Mongoose
- JWT authentication
- OpenAI SDK via NVIDIA Integrate API
- PDFKit for evidence asset generation

## Project Structure

```text
project5-investigationGame/
├── backend/
│   ├── generated-evidence/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── caseFactory.js
│   └── index.js
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── pages/
│       ├── services/
│       ├── styles/
│       └── utils/
└── README.md
```

## Prerequisites

- Node.js 18 or later
- npm
- MongoDB local instance or MongoDB Atlas
- API key for an OpenAI-compatible endpoint through NVIDIA Integrate

## Installation

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure backend environment variables

Create a `.env` file inside `backend/`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/investigation-game
JWT_SECRET=replace-with-a-strong-secret
OPENAI_API_KEY=your-api-key
```

### 3. Configure the frontend API URL

The frontend defaults to `http://localhost:5000`.

If needed, create a `.env` file inside `frontend/`:

```env
VITE_API_URL=http://localhost:5000
```

## Running Locally

Use two terminal windows.

### Terminal 1 - Backend

```bash
cd backend
npm start
```

The API server typically runs at `http://localhost:5000`.

### Terminal 2 - Frontend

```bash
cd frontend
npm run dev
```

The client application typically runs at `http://localhost:5173`.

## Available Scripts

### Backend

```bash
npm start
npm run dev
```

### Frontend

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## User Flow

1. Register or sign in.
2. Generate a new case from the dashboard.
3. Review the briefing and initial investigation context.
4. Select a suspect or witness and interrogate them using neutral, empathetic, or aggressive tone.
5. Review evidence, track inconsistencies, and save investigator notes.
6. Consult the commander for indirect guidance.
7. Submit a final accusation with supporting reasoning.

## Core API Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

### Cases

- `POST /api/cases/generate`
- `GET /api/cases`
- `GET /api/cases/:id`
- `PUT /api/cases/:id/notes`

### Investigation

- `POST /api/investigate/:id/ask`
- `POST /api/investigate/:id/consult`
- `POST /api/investigate/:id/solve`

## Operational Notes

- The backend applies rate limiting globally and on AI-heavy investigation routes.
- Each user can keep up to 3 active cases at the same time.
- Generated evidence assets are stored locally under `backend/generated-evidence/`.
- The backend requires valid `MONGO_URI`, `JWT_SECRET`, and `OPENAI_API_KEY` values to operate correctly.

## Build

To verify that the frontend builds successfully:

```bash
cd frontend
npm run build
```

## Future Improvements

- Add automated tests for both frontend and backend.
- Introduce admin tooling or case analytics.
- Expand progress tracking across long investigations.
- Strengthen user and permissions management.
