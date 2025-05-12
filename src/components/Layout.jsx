import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const Layout = ({ children, menuItems = [] }) => {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 text-white flex flex-col flex-shrink-0">
        <div className="p-4 text-xl font-semibold border-b border-gray-700">
          CLI Tray Agent
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `block w-full text-left px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              {item.label.charAt(0).toUpperCase() + item.label.slice(1)}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700 text-xs text-gray-400">
          Versão: {import.meta.env.VITE_APP_VERSION || 'dev'}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto bg-gray-100">
        {children}
      </main>
    </div>
  );
};

export default Layout; 