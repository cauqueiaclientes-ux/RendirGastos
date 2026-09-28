/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Barra de Navegación Inferior Móvil/Responsive
 */

import React from 'react';
import { UserRole } from '../types';

interface BottomNavProps {
  activeTab: 'rendidor' | 'revisor' | 'contabilidad';
  onTabChange: (tab: 'rendidor' | 'revisor' | 'contabilidad') => void;
  pendingReviewsCount?: number;
  userRole?: UserRole;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  pendingReviewsCount = 0,
  userRole = 'admin',
}) => {
  const allNavItems = [
    {
      key: 'rendidor' as const,
      label: 'Rendidor',
      icon: 'receipt_long',
      roles: ['admin', 'rendidor'] as UserRole[],
    },
    {
      key: 'revisor' as const,
      label: 'Revisor',
      icon: 'fact_check',
      badge: pendingReviewsCount > 0 ? pendingReviewsCount : undefined,
      roles: ['admin', 'revisor'] as UserRole[],
    },
    {
      key: 'contabilidad' as const,
      label: 'Contabilidad',
      icon: 'account_balance',
      roles: ['admin', 'contabilidad'] as UserRole[],
    },
  ];

  const visibleNavItems = allNavItems.filter(
    (item) => userRole === 'admin' || item.roles.includes(userRole)
  );

  // Si el usuario no es admin y solo tiene 1 sección, ocultamos la barra inferior para mayor limpieza
  if (userRole !== 'admin' && visibleNavItems.length <= 1) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 w-full z-50 pb-safe bg-white/95 backdrop-blur-xl shadow-[0_-2px_12px_rgba(0,0,0,0.05)] border-t border-[#e5eeff]">
      <div className="h-16 max-w-md mx-auto px-2 flex items-center justify-around">
        {visibleNavItems.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-w-[48px] min-h-[48px] flex flex-col items-center justify-center gap-1 flex-1 transition-colors relative active:scale-95 ${
                isActive
                  ? 'text-[#00236f] font-bold'
                  : 'text-[#444651] hover:text-[#0b1c30]'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <span className={`material-symbols-outlined text-[22px] ${isActive ? 'text-[#00236f]' : 'text-[#757682]'}`}>
                  {item.icon}
                </span>
                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 bg-[#ba1a1a] text-white font-mono text-[10px] w-4 h-4 rounded-full flex items-center justify-center leading-none shadow-xs">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-none tracking-tight">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
