import { createRoot } from 'react-dom/client'
import '../styles.css'
import './studio.css'
import StudioApp from './StudioApp'

createRoot(document.getElementById('root')!).render(<StudioApp />)
