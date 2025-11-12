import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@/styles/theme.css'
import './index.css'
import '@/styles/global.css'
import './i18n' // i18n 초기화
// import { disableAllConsole } from './utils/disableConsole'

// 모든 console 메시지 비활성화 - 디버깅을 위해 임시 비활성화
// disableAllConsole()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)
