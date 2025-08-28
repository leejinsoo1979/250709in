import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@/styles/theme.css'
import './index.css'
import '@/styles/global.css'
import '@/styles/hotfix.light.css'
import './i18n' // i18n 초기화

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
