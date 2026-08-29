# Local AI Agent

A desktop-oriented local AI assistant with a cinematic HUD, browser automation, desktop app interaction, and a lightweight backend for task orchestration.

## Overview

This project combines:

- React + Vite frontend with a futuristic interface
- Node/Express backend for agent orchestration and websocket events
- desktop automation tools for app launching, browser actions, and system interactions
- safety checks for risky actions and request validation
- tool-based planning for autonomous task execution

It is intended as a local personal assistant prototype and experimentation platform.

## Features

- voice-ready UI shell and animated 3D HUD
- AI task planning and execution loop
- browser and desktop action tools
- safety gates and request validation
- TTS integration support
- model routing with local/remote AI providers

## Project Structure

```text
.
├── src/                 # Frontend React application
├── server/              # Backend, planning, tools, safety, router
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy the environment example file:

```bash
copy .env.example .env
```

3. Fill in your local values if you use optional AI/TTS integrations.

4. Start the project:

```bash
npm run dev -- --host 0.0.0.0
```

5. Start the backend server in another terminal:

```bash
npm run server:watch
```

Or run both together:

```bash
npm run dev:all
```

## Production build

```bash
npm run build
```

## Tests

```bash
npm test
```

## Security notes

- Never commit real API keys or secrets.
- Use the local environment file only for development.
- Keep tool execution restricted to approved actions and validated inputs.
- The repository intentionally does not expose internal credentials or private system details.

## License

This project is for local experimentation and personal development use. See your project policy or repository rules for distribution requirements.
