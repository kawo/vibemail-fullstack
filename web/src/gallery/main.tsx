import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import './gallery.css';
import { ComposeGallery } from './ComposeGallery';

/** Dev page: `npm run dev`, then open /gallery.html. Not part of the app build. */
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ComposeGallery />
    </StrictMode>,
  );
}
