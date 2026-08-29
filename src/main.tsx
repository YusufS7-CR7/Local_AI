import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary
      fallbackTitle="JARVIS SYSTEM INITIALIZATION ERROR"
      fallbackMessage="An unhandled exception occurred during application startup."
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
