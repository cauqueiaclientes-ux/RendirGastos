/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Módulo de Autenticación y Control de Acceso por Roles (RBAC) sin contraseña
 * Diseño SaaS Moderno e Intuitivo
 */

import React, { useState, useEffect } from 'react';
import { UserRole, UsuarioSesion } from '../types';
import { formatearRut, limpiarRut, validarRutChileno } from '../utils/rutValidator';

interface LoginViewProps {
  onLoginSuccess: (usuario: UsuarioSesion) => void;
}

// Perfiles institucionales preconfigurados para auto-identificación
const PERFILES_PRECONFIGURADOS: Record<string, { rol: UserRole; rolTitulo: string; nombre: string; centroCosto: string; avatar: string }> = {
  '168923412': {
    rol: 'admin',
    rolTitulo: 'Administrador General IDIEM',
    nombre: 'Administrador Central IDIEM',
    centroCosto: 'CC-501',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDX2nizxPLkQzholIPJ7qIqYG6XhetelcnYj0fttxR0irYOm1p9rhAuHMvKL6tO5ONyn2wK0kT77W1yZmXpjGT2GaDELIKWh310KGiPwccIphpI1ZiUH7rr-SCdJoTo51lzlTSxuNgp5T6U_lbPl67Yd9_jsbK1CH12-ym4yQoetA8dHsN141XRvC_1aWiZXjMfKw4lAfbgyBCNSVMhKCxVc-PiiNEIOnSZ9PmWNwgAwkXyC9kgN90XPA',
  },
  '154208913': {
    rol: 'revisor',
    rolTitulo: 'Jefatura de Centro de Costos (Revisor)',
    nombre: 'Ing. Rodrigo Valenzuela M.',
    centroCosto: 'CC-402',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  '18634120K': {
    rol: 'contabilidad',
    rolTitulo: 'Auditor Contable & Fiscal',
    nombre: 'Carla Morales Fernández',
    centroCosto: 'CC-501',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  },
  '172945108': {
    rol: 'rendidor',
    rolTitulo: 'Trabajador Rendidor de Gastos',
    nombre: 'Sebastián Araya Silva',
    centroCosto: 'CC-402',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
};

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [rutInput, setRutInput] = useState('');
  const [nombreInput, setNombreInput] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('rendidor');
  const [selectedCC, setSelectedCC] = useState('CC-402');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAutoIdentified, setIsAutoIdentified] = useState(false);

  // Auto-identificación por RUT
  useEffect(() => {
    const rutLimpio = limpiarRut(rutInput);
    if (PERFILES_PRECONFIGURADOS[rutLimpio]) {
      const perfil = PERFILES_PRECONFIGURADOS[rutLimpio];
      setSelectedRole(perfil.rol);
      setSelectedCC(perfil.centroCosto);
      if (!nombreInput || isAutoIdentified) {
        setNombreInput(perfil.nombre);
      }
      setIsAutoIdentified(true);
    } else {
      setIsAutoIdentified(false);
    }
  }, [rutInput]);

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatearRut(raw);
    setRutInput(formatted);
    setErrorMsg(null);
  };

  const handlePresetSelect = (presetRut: string) => {
    const perfil = PERFILES_PRECONFIGURADOS[presetRut];
    if (perfil) {
      setRutInput(formatearRut(presetRut));
      setNombreInput(perfil.nombre);
      setSelectedRole(perfil.rol);
      setSelectedCC(perfil.centroCosto);
      setErrorMsg(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!rutInput.trim()) {
      setErrorMsg('Por favor ingresa tu RUT.');
      return;
    }

    if (!nombreInput.trim()) {
      setErrorMsg('Por favor ingresa tu Nombre Completo.');
      return;
    }

    const rutLimpio = limpiarRut(rutInput);
    if (rutLimpio.length < 8) {
      setErrorMsg('El RUT ingresado debe tener al menos 8 dígitos.');
      return;
    }

    // Título descriptivo según el rol
    let rolTitulo = 'Trabajador Rendidor';
    if (selectedRole === 'admin') rolTitulo = 'Administrador General IDIEM';
    if (selectedRole === 'revisor') rolTitulo = 'Jefatura Revisor / CC';
    if (selectedRole === 'contabilidad') rolTitulo = 'Contabilidad & Auditoría Fiscal';

    const usuarioSesion: UsuarioSesion = {
      rut: formatearRut(rutInput),
      nombre: nombreInput.trim(),
      rol: selectedRole,
      centroCosto: selectedCC,
      rolTitulo,
      fechaIngreso: new Date().toISOString(),
    };

    // Guardar en localStorage para persistencia de sesión
    try {
      localStorage.setItem('idiem_auth_session', JSON.stringify(usuarioSesion));
    } catch (_) {}

    onLoginSuccess(usuarioSesion);
  };

  return (
    <div className="min-h-screen bg-[#080d18] text-white flex flex-col justify-between relative overflow-hidden font-sans selection:bg-[#0038a8] selection:text-white">
      {/* Luces y Efectos de Fondo */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00236f]/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#1e3a8a]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-10 w-64 h-64 bg-[#006398]/15 rounded-full blur-2xl pointer-events-none" />

      {/* Header Superior con Logotipo Institucional */}
      <header className="relative z-10 w-full px-6 py-5 flex items-center justify-between border-b border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#00236f] text-white font-bold flex items-center justify-center shadow-lg border border-white/10">
            <span className="text-xl tracking-tighter">][</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-[#85f8c4] uppercase tracking-widest leading-tight">
              Universidad de Chile
            </span>
            <span className="text-[17px] font-bold text-white leading-tight">
              IDIEM Gastos · Plataforma SaaS
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-[#cbdbf5]">
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
          <span>Sistema Seguro · Acceso RBAC</span>
        </div>
      </header>

      {/* Tarjeta Principal de Login */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full flex flex-col gap-5">
          
          {/* Encabezado del Formulario */}
          <div className="text-center flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-2xl bg-[#00236f]/60 border border-[#b6c4ff]/30 text-[#85f8c4] flex items-center justify-center shadow-xl mb-1">
              <span className="material-symbols-outlined text-[28px]">lock_open</span>
            </div>
            <h1 className="text-[22px] sm:text-[24px] font-bold tracking-tight text-white">
              Iniciar Sesión Institucional
            </h1>
            <p className="text-[13px] text-[#9bb0d3] max-w-sm">
              Acceso sin contraseña. Ingresa tu RUT y Nombre para acceder a tu panel de trabajo según tu rol.
            </p>
          </div>

          {/* Formulario */}
          <form
            onSubmit={handleSubmit}
            className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-4"
          >
            {errorMsg && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-xl text-[12px] flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-rose-400">error</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Campo 1: RUT */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-[#cbd5e1] flex items-center justify-between">
                <span>RUT Institucional *</span>
                {isAutoIdentified && (
                  <span className="text-[10px] font-mono text-[#85f8c4] bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    ✓ Rol Detectado: {selectedRole.toUpperCase()}
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-3 text-[18px] text-[#64748b]">
                  badge
                </span>
                <input
                  type="text"
                  value={rutInput}
                  onChange={handleRutChange}
                  placeholder="Ej: 16.892.341-2"
                  className="w-full h-11 pl-10 pr-4 bg-[#1e293b]/70 text-white placeholder:text-[#64748b] text-[13px] font-mono font-semibold rounded-xl border border-white/10 focus:outline-none focus:border-[#85f8c4] focus:ring-1 focus:ring-[#85f8c4] transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Campo 2: Nombre Completo */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-[#cbd5e1]">
                Nombre Completo *
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-3 text-[18px] text-[#64748b]">
                  person
                </span>
                <input
                  type="text"
                  value={nombreInput}
                  onChange={(e) => setNombreInput(e.target.value)}
                  placeholder="Ej: Juan Morales Soto"
                  className="w-full h-11 pl-10 pr-4 bg-[#1e293b]/70 text-white placeholder:text-[#64748b] text-[13px] rounded-xl border border-white/10 focus:outline-none focus:border-[#85f8c4] focus:ring-1 focus:ring-[#85f8c4] transition-all"
                />
              </div>
            </div>

            {/* Selector de Rol y Centro de Costo (Auto o Manual) */}
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="text-[12px] font-semibold text-[#cbd5e1] flex items-center justify-between">
                <span>Rol Asignado & Alcance de Trabajo</span>
                <span className="text-[10px] text-[#94a3b8]">Control RBAC</span>
              </label>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRole('rendidor')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                    selectedRole === 'rendidor'
                      ? 'bg-[#00236f] border-[#85f8c4] text-white shadow-md'
                      : 'bg-[#1e293b]/50 border-white/5 text-[#94a3b8] hover:bg-[#1e293b]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] text-[#85f8c4]">
                    receipt_long
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[12px] font-bold">Rendidor</span>
                    <span className="text-[10px] opacity-75">Cargar boletas</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('revisor')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                    selectedRole === 'revisor'
                      ? 'bg-[#00236f] border-[#85f8c4] text-white shadow-md'
                      : 'bg-[#1e293b]/50 border-white/5 text-[#94a3b8] hover:bg-[#1e293b]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] text-[#5bb8fe]">
                    fact_check
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[12px] font-bold">Revisor / Jefe</span>
                    <span className="text-[10px] opacity-75">Cotejo y visación</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('contabilidad')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                    selectedRole === 'contabilidad'
                      ? 'bg-[#00236f] border-[#85f8c4] text-white shadow-md'
                      : 'bg-[#1e293b]/50 border-white/5 text-[#94a3b8] hover:bg-[#1e293b]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] text-[#85f8c4]">
                    account_balance
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[12px] font-bold">Contabilidad</span>
                    <span className="text-[10px] opacity-75">Reportes & Excel</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('admin')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                    selectedRole === 'admin'
                      ? 'bg-[#00236f] border-[#85f8c4] text-white shadow-md'
                      : 'bg-[#1e293b]/50 border-white/5 text-[#94a3b8] hover:bg-[#1e293b]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] text-amber-400">
                    admin_panel_settings
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[12px] font-bold">Administrador</span>
                    <span className="text-[10px] opacity-75">Acceso Total</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Botón de Ingreso Principal */}
            <button
              type="submit"
              className="w-full h-12 mt-2 bg-gradient-to-r from-[#0038a8] to-[#00236f] hover:from-[#0047cc] hover:to-[#002f94] text-white font-bold text-[14px] rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-[#00236f]/40 active:scale-[0.98] transition-all cursor-pointer border border-white/10"
            >
              <span>Ingresar al Sistema</span>
              <span className="material-symbols-outlined text-[20px] text-[#85f8c4]">
                arrow_forward
              </span>
            </button>
          </form>

          {/* Perfiles de Acceso Rápido (Presets para pruebas o demostración) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#9bb0d3] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-[#85f8c4]">bolt</span>
              Perfiles Rápidos Preconfigurados:
            </span>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handlePresetSelect('168923412')}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-left transition-colors border border-white/5 flex flex-col cursor-pointer"
              >
                <span className="font-bold text-white flex items-center justify-between">
                  <span>Administrador</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </span>
                <span className="text-[10px] text-[#94a3b8] font-mono">16.892.341-2</span>
              </button>

              <button
                type="button"
                onClick={() => handlePresetSelect('172945108')}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-left transition-colors border border-white/5 flex flex-col cursor-pointer"
              >
                <span className="font-bold text-white flex items-center justify-between">
                  <span>Rendidor (Trabajador)</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#85f8c4]" />
                </span>
                <span className="text-[10px] text-[#94a3b8] font-mono">17.294.510-8</span>
              </button>

              <button
                type="button"
                onClick={() => handlePresetSelect('154208913')}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-left transition-colors border border-white/5 flex flex-col cursor-pointer"
              >
                <span className="font-bold text-white flex items-center justify-between">
                  <span>Revisor (Jefe CC)</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5bb8fe]" />
                </span>
                <span className="text-[10px] text-[#94a3b8] font-mono">15.420.891-3</span>
              </button>

              <button
                type="button"
                onClick={() => handlePresetSelect('18634120K')}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-left transition-colors border border-white/5 flex flex-col cursor-pointer"
              >
                <span className="font-bold text-white flex items-center justify-between">
                  <span>Contabilidad</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                </span>
                <span className="text-[10px] text-[#94a3b8] font-mono">18.634.120-K</span>
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 px-6 text-center text-[11px] text-[#64748b] border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>IDIEM · Instituto de Investigaciones y Ensayes de Materiales · Universidad de Chile</span>
        <span className="font-mono text-[#94a3b8]">RUT 60.910.000-1 · v2.4 SaaS Production</span>
      </footer>
    </div>
  );
};

export default LoginView;
