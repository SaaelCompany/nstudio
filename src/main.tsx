import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import { Editor } from './editor/Editor'
import './editor/editor.css'

const root = document.getElementById('root')
if (!root) throw new Error('Не найден корневой элемент')

createRoot(root).render(
  <StrictMode>
    <Editor />
  </StrictMode>,
)
