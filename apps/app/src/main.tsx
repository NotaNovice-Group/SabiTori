import { createRoot } from 'react-dom/client';
import './fonts/andika.css';
import './styles/app.css';
import { App } from './App';
import { registerServiceWorker } from './lib/sw';

createRoot(document.getElementById('root')!).render(<App />);
registerServiceWorker();
