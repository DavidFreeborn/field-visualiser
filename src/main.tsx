import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Expected #root element to exist.');
}

const searchParams = new URLSearchParams(window.location.search);
const embedded = searchParams.get('embed') === '1';

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App embedded={embedded} />
  </React.StrictMode>,
);
