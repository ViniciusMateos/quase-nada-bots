import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/Layout'
import VisaoGeral from './pages/VisaoGeral'
import Bots from './pages/Bots'
import Bot from './pages/Bot'
import EditModo from './pages/EditModo'
import Chats from './pages/Chats'
import Execucoes from './pages/Execucoes'
import Run from './pages/Run'
import Historico from './pages/Historico'
import Contas from './pages/Contas'
import CriarConta from './pages/CriarConta'
import RemoverContas from './pages/RemoverContas'
import Cronograma from './pages/Cronograma'
import Ajustes from './pages/Ajustes'

// Painel local (sem login): o token do backend vem do .env.local, igual o app.
export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/visao-geral" element={<VisaoGeral />} />
        <Route path="/bots" element={<Bots />} />
        <Route path="/bots/:botId" element={<Bot />} />
        <Route path="/bots/:botId/modos/:modo" element={<EditModo />} />
        <Route path="/bots/:botId/chats" element={<Chats />} />
        <Route path="/execucoes" element={<Execucoes />} />
        <Route path="/execucoes/:runId" element={<Run />} />
        <Route path="/historico" element={<Historico />} />
        <Route path="/contas" element={<Contas />} />
        <Route path="/contas/criar" element={<CriarConta />} />
        <Route path="/contas/remover" element={<RemoverContas />} />
        <Route path="/cronograma" element={<Cronograma />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="*" element={<Navigate to="/visao-geral" replace />} />
      </Route>
    </Routes>
  )
}
