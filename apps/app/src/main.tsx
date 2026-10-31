import { createRoot } from 'react-dom/client';
import '@fontsource/andika/latin-400.css';
import '@fontsource/andika/latin-ext-400.css';
import '@fontsource/andika/latin-700.css';
import '@fontsource/andika/latin-ext-700.css';
import './styles/app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
