/*
File: src\1_main.tsx
Responsible team member: He Linlin
Description: React entrypoint that mounts the application and loads global styles.
*/
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './1_App.tsx';
import './1_index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
