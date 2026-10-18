import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LaunchScreen } from './LaunchScreen';
import './style.css';
import './app-design.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'launch' ? (
      <LaunchScreen ready={false} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
