/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Encabezado Institucional con Logotipo Oficial y Selector de Perfil
 */

import React, { useState } from 'react';
import { UserRole, UsuarioSesion } from '../types';

interface HeaderProps {
  currentTab: 'rendidor' | 'revisor' | 'contabilidad';
  onSelectRole?: (role: 'rendidor' | 'revisor' | 'contabilidad') => void;
  onOpenUsuariosActivos?: () => void;
  usuariosActivosCount?: number;
  usuarioSesion?: UsuarioSesion | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectRole,
  onOpenUsuariosActivos,
  usuariosActivosCount = 0,
  usuarioSesion,
  onLogout,
}) => {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const getRoleBadge = (rol?: UserRole) => {
    switch (rol) {
      case 'admin':
        return {
          bg: 'bg-amber-100 text-amber-900 border-amber-300',
          label: 'Administrador',
          color: '#d97706',
        };
      case 'revisor':
        return {
          bg: 'bg-blue-100 text-blue-900 border-blue-300',
          label: 'Revisor / CC',
          color: '#2563eb',
        };
      case 'contabilidad':
        return {
          bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          label: 'Contabilidad',
          color: '#059669',
        };
      case 'rendidor':
      default:
        return {
          bg: 'bg-[#eff4ff] text-[#00236f] border-[#b6c4ff]',
          label: 'Rendidor',
          color: '#00236f',
        };
    }
  };

  const rolInfo = getRoleBadge(usuarioSesion?.rol);
  const initials = usuarioSesion?.nombre
    ? usuarioSesion.nombre
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'ID';

  return (
    <header className="fixed top-0 w-full z-50 pt-safe bg-[#ffffff]/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-[#e5eeff]">
      <div className="h-14 px-3 sm:px-4 max-w-5xl mx-auto flex items-center justify-between">
        {/* Logotipo IDIEM Universidad de Chile */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => onSelectRole && onSelectRole('rendidor')}
        >
          {/* Isotipo azul IDIEM */}
          <div className="w-8 h-8 rounded-lg bg-[#00236f] text-white font-bold flex items-center justify-center shadow-xs">
            <span className="text-lg tracking-tighter">][</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-[#006398] uppercase tracking-wider leading-tight">
              Universidad de Chile
            </span>
            <span className="text-[15px] font-bold text-[#00236f] leading-none">
              IDIEM Gastos
            </span>
          </div>
        </div>

        {/* Si el usuario es Administrador: Selector rápido de pestañas en desktop */}
        {usuarioSesion?.rol === 'admin' && onSelectRole && (
          <div className="hidden md:flex items-center gap-1 bg-[#eff4ff] p-1 rounded-xl border border-[#d3e4fe]">
            <button
              onClick={() => onSelectRole('rendidor')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                currentTab === 'rendidor'
                  ? 'bg-[#00236f] text-white shadow-xs'
                  : 'text-[#444651] hover:text-[#00236f]'
              }`}
            >
              Rendidor
            </button>
            <button
              onClick={() => onSelectRole('revisor')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                currentTab === 'revisor'
                  ? 'bg-[#00236f] text-white shadow-xs'
                  : 'text-[#444651] hover:text-[#00236f]'
              }`}
            >
              Revisor
            </button>
            <button
              onClick={() => onSelectRole('contabilidad')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                currentTab === 'contabilidad'
                  ? 'bg-[#00236f] text-white shadow-xs'
                  : 'text-[#444651] hover:text-[#00236f]'
              }`}
            >
              Contabilidad
            </button>
          </div>
        )}

        {/* Acciones de Administración, Perfil y Logout */}
        <div className="flex items-center gap-2">
          {/* Botón de Usuarios Activos Mes (para Contabilidad y Admin) */}
          {(usuarioSesion?.rol === 'admin' || usuarioSesion?.rol === 'contabilidad') && onOpenUsuariosActivos && (
            <button
              onClick={onOpenUsuariosActivos}
              className="h-8 px-2.5 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#00236f] border border-[#b6c4ff] flex items-center gap-1.5 text-[11px] font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              title="Control de Usuarios Activos al Mes & Fee SaaS"
            >
              <span className="material-symbols-outlined text-[16px] text-[#006398]">
                group_work
              </span>
              <span className="hidden sm:inline">Usuarios Activos</span>
              <span className="bg-[#00236f] text-white font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {usuariosActivosCount}
              </span>
            </button>
          )}

          {/* Pastilla de Perfil del Usuario Activo */}
          <div className="relative">
            <div
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-2 p-1 pl-2 rounded-full bg-[#f8faff] hover:bg-[#eff4ff] border border-[#e5eeff] transition-all cursor-pointer shadow-2xs"
            >
              <div className="text-right hidden sm:flex flex-col mr-0.5">
                <span className="text-[11px] font-bold text-[#0b1c30] leading-tight truncate max-w-[140px]">
                  {usuarioSesion?.nombre || 'Usuario IDIEM'}
                </span>
                <div className="flex items-center gap-1 text-[9px] font-mono text-[#006398] justify-end">
                  <span>{usuarioSesion?.rut || '16.892.341-2'}</span>
                  <span>•</span>
                  <span className={`px-1 rounded border font-bold uppercase ${rolInfo.bg}`}>
                    {rolInfo.label}
                  </span>
                </div>
              </div>

              <div
                className="relative min-w-[32px] min-h-[32px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center rounded-full bg-[#00236f] text-white font-bold text-[12px] shadow-sm"
                title={`Sesión activa: ${usuarioSesion?.nombre} (${usuarioSesion?.rol})`}
              >
                <span>{initials}</span>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#10b981] rounded-full ring-2 ring-white" />
              </div>
            </div>

            {/* Menú Desplegable de Sesión */}
            {profileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div className="absolute right-0 top-12 z-50 bg-white rounded-2xl shadow-xl border border-[#b6c4ff] w-64 p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95">
                  <div className="flex items-center gap-2.5 pb-2 border-b border-[#eff4ff]">
                    <div className="w-10 h-10 rounded-full bg-[#00236f] text-white flex items-center justify-center font-bold text-[14px]">
                      {initials}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold text-[#0b1c30] leading-tight">
                        {usuarioSesion?.nombre}
                      </span>
                      <span className="text-[10px] font-mono text-[#006398]">
                        RUT: {usuarioSesion?.rut}
                      </span>
                      <span className="text-[10px] text-[#444651]">
                        {usuarioSesion?.centroCosto || 'CC-402'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] px-1">
                    <span className="text-[#757682]">Rol de Acceso:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${rolInfo.bg}`}>
                      {rolInfo.label}
                    </span>
                  </div>

                  {onLogout && (
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full h-9 rounded-xl bg-[#ffdad6] hover:bg-[#ffb4ab] text-[#ba1a1a] text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">logout</span>
                      <span>Cerrar Sesión</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Botón directo de Cerrar Sesión en Header */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-8 h-8 rounded-lg bg-[#eff4ff] hover:bg-[#ffdad6] text-[#757682] hover:text-[#ba1a1a] flex items-center justify-center transition-colors cursor-pointer"
              title="Cerrar sesión"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

