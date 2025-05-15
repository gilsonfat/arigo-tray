import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';

// Lazy load pages (mantém o lazy loading)
const HomePage = lazy(() => import('./pages/Home'));
const ConnectionsPage = lazy(() => import('./pages/Connections'));
const QueriesPage = lazy(() => import('./pages/Queries'));
const TasksPage = lazy(() => import('./pages/Tasks'));
const LogsPage = lazy(() => import('./pages/Logs'));

// Define os itens do menu e seus caminhos
const menuItems = [
  { path: '/', label: 'Home', element: <HomePage /> },
  { path: '/connections', label: 'Conexoes', element: <ConnectionsPage /> },
  { path: '/queries', label: 'Consultas', element: <QueriesPage /> },
  { path: '/tasks', label: 'Tarefas', element: <TasksPage /> },
  { path: '/logs', label: 'Logs', element: <LogsPage /> },
];

function App() {
  return (
    // Passa os menuItems para o Layout poder gerar os links
    <Layout menuItems={menuItems}>
      <Suspense fallback={<LoadingSpinner message="Carregando página..." />}>
        {/* Define as rotas da aplicação */}
        <Routes>
          {menuItems.map(item => (
             <Route key={item.path} path={item.path} element={item.element} />
          ))}
          {/* Rota fallback, redireciona para Home se nenhuma outra corresponder */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default App; 