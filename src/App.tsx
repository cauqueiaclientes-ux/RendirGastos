/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Aplicación SaaS de Rendición de Gastos y Auditoría Fiscal SII
 */

import React, { useState, useMemo } from 'react';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import RendidorView from './components/RendidorView';
import RevisorView from './components/RevisorView';
import ContabilidadView from './components/ContabilidadView';
import LoginView from './components/LoginView';
import UsuariosActivosModal from './components/UsuariosActivosModal';
import SoporteWhatsAppButton from './components/SoporteWhatsAppButton';
import { INITIAL_RENDICIONES } from './data/initialData';
import { RendicionItem, UsuarioSesion, UserRole } from './types';

export function App() {
  const [usuarioSesion, setUsuarioSesion] = useState<UsuarioSesion | null>(() => {
    try {
      const stored = localStorage.getItem('idiem_auth_session');
      return stored ? JSON.parse(stored) : null;
    } catch (_) {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<'rendidor' | 'revisor' | 'contabilidad'>('rendidor');
  const [rendiciones, setRendiciones] = useState<RendicionItem[]>(INITIAL_RENDICIONES);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showUsuariosActivosModal, setShowUsuariosActivosModal] = useState<boolean>(false);

  // Modal de motivo de rechazo
  const [rejectModalInfo, setRejectModalInfo] = useState<{ folio: string; observacion: string } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleLoginSuccess = (usuario: UsuarioSesion) => {
    setUsuarioSesion(usuario);
    // Redirigir automáticamente a la sección correspondiente de su rol
    if (usuario.rol === 'rendidor') {
      setActiveTab('rendidor');
    } else if (usuario.rol === 'revisor') {
      setActiveTab('revisor');
    } else if (usuario.rol === 'contabilidad') {
      setActiveTab('contabilidad');
    } else {
      setActiveTab('rendidor');
    }
    showToast(`Bienvenido ${usuario.nombre} (${usuario.rolTitulo})`);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('idiem_auth_session');
    } catch (_) {}
    setUsuarioSesion(null);
    showToast('Has cerrado sesión correctamente.');
  };

  const handleNuevaRendicion = (nueva: RendicionItem) => {
    setRendiciones((prev) => [nueva, ...prev]);
  };

  const handleActualizarEstado = (id: string, nuevoEstado: 'APROBADO' | 'RECHAZADO', observacion: string) => {
    setRendiciones((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              estado: nuevoEstado,
              estadoPago: nuevoEstado === 'APROBADO' ? 'Por Liquidar' : 'Rechazado',
              revisorObservacion: observacion || item.revisorObservacion,
            }
          : item
      )
    );
  };

  const handleVerMotivoRechazo = (observacion: string, folio: string) => {
    setRejectModalInfo({ folio, observacion });
  };

  const pendingCount = rendiciones.filter((r) => r.estado === 'PENDIENTE').length;

  // Conteo de usuarios únicos activos en el mes (1 usuario con 1 o 20 boletas = 1 activo)
  const uniqueActiveUsersCount = useMemo(() => {
    if (rendiciones.length === 0) return 0;
    const ruts = new Set(rendiciones.map((r) => r.rutRendidor || '16.892.341-2'));
    return ruts.size;
  }, [rendiciones]);

  // Si no está autenticado, mostrar pantalla de Login RBAC
  if (!usuarioSesion) {
    return (
      <>
        <LoginView onLoginSuccess={handleLoginSuccess} />
        {/* Botón Flotante de Soporte WhatsApp */}
        <SoporteWhatsAppButton />
      </>
    );
  }

  // Control estricto de vistas según el rol del usuario logueado (RBAC)
  const userRole = usuarioSesion.rol;
  const showRendidor = userRole === 'admin' ? activeTab === 'rendidor' : userRole === 'rendidor';
  const showRevisor = userRole === 'admin' ? activeTab === 'revisor' : userRole === 'revisor';
  const showContabilidad = userRole === 'admin' ? activeTab === 'contabilidad' : userRole === 'contabilidad';

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] flex flex-col antialiased selection:bg-[#00236f] selection:text-white">
      {/* Encabezado Superior con Identidad y Logout */}
      <Header
        currentTab={activeTab}
        onSelectRole={userRole === 'admin' ? setActiveTab : undefined}
        onOpenUsuariosActivos={() => setShowUsuariosActivosModal(true)}
        usuariosActivosCount={uniqueActiveUsersCount}
        usuarioSesion={usuarioSesion}
        onLogout={handleLogout}
      />

      {/* Contenido Principal según Roles y Permisos */}
      <main className="flex-1 w-full pt-14 flex flex-col">
        {showRendidor && (
          <RendidorView
            rendiciones={rendiciones}
            onNuevaRendicion={handleNuevaRendicion}
            onVerMotivoRechazo={handleVerMotivoRechazo}
            onShowToast={showToast}
          />
        )}

        {showRevisor && (
          <RevisorView
            rendiciones={rendiciones}
            onActualizarEstado={handleActualizarEstado}
            onShowToast={showToast}
          />
        )}

        {showContabilidad && (
          <ContabilidadView
            rendiciones={rendiciones}
            onShowToast={showToast}
            onOpenUsuariosActivos={() => setShowUsuariosActivosModal(true)}
            usuariosActivosCount={uniqueActiveUsersCount}
          />
        )}
      </main>

      {/* Modal de Control de Usuarios Activos al Mes */}
      <UsuariosActivosModal
        isOpen={showUsuariosActivosModal}
        onClose={() => setShowUsuariosActivosModal(false)}
        rendiciones={rendiciones}
      />

      {/* Barra de Navegación Inferior con filtrado por rol */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingReviewsCount={pendingCount}
        userRole={userRole}
      />

      {/* Notificación Toast Flotante */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-sm w-11/12 bg-[#0b1c30] text-white text-[12px] font-medium px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-white/10 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="material-symbols-outlined text-[#85f8c4] text-[18px]">
            check_circle
          </span>
          <span className="flex-1 leading-snug">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-[#757682] hover:text-white"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Botón Flotante de Soporte WhatsApp */}
      <SoporteWhatsAppButton />

      {/* Modal de Detalle de Rechazo */}
      {rejectModalInfo && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-4 max-w-sm w-full shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#eff4ff]">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                </span>
                <div>
                  <h3 className="text-[14px] font-bold text-[#0b1c30]">
                    Motivo de Rechazo {rejectModalInfo.folio}
                  </h3>
                  <span className="text-[11px] text-[#757682]">Dictamen de Jefatura</span>
                </div>
              </div>
              <button
                onClick={() => setRejectModalInfo(null)}
                className="w-7 h-7 rounded-full bg-[#eff4ff] flex items-center justify-center text-[#757682]"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div className="bg-[#ffdad6]/30 p-3 rounded-xl border border-[#ffdad6] text-[12px] text-[#410002] leading-relaxed">
              {rejectModalInfo.observacion}
            </div>

            <p className="text-[11px] text-[#757682]">
              Para apelar o corregir el comprobante, por favor adjunte el informe técnico solicitado o comuníquese con su revisor asignado.
            </p>

            <button
              onClick={() => setRejectModalInfo(null)}
              className="w-full h-10 bg-[#00236f] text-white font-bold rounded-xl active:scale-98 transition-all text-[12px]"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

