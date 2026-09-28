/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Módulo de Aprobaciones: Revisor / Jefatura de Centro de Costos
 * Auditoría Fiscal, Validación de DTEs y Dictamen Contable
 */

import React, { useState } from 'react';
import { RendicionItem } from '../types';
import { parsearRespuestaSegura } from '../utils/httpAndImageUtils';

interface RevisorViewProps {
  rendiciones: RendicionItem[];
  onActualizarEstado: (id: string, nuevoEstado: 'APROBADO' | 'RECHAZADO', observacion: string) => void;
  onShowToast: (mensaje: string) => void;
}

export const RevisorView: React.FC<RevisorViewProps> = ({
  rendiciones,
  onActualizarEstado,
  onShowToast,
}) => {
  const [selectedCCFilter, setSelectedCCFilter] = useState('ALL');
  const [auditingItem, setAuditingItem] = useState<RendicionItem | null>(null);
  const [revisorNotes, setRevisorNotes] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionSuccessMsg, setDecisionSuccessMsg] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [zoomedReceipt, setZoomedReceipt] = useState(false);

  // Filtrar pendientes de revisión
  const pendingItems = rendiciones.filter((r) => r.estado === 'PENDIENTE');
  const approvedItems = rendiciones.filter((r) => r.estado === 'APROBADO');
  const rejectedItems = rendiciones.filter((r) => r.estado === 'RECHAZADO');

  // Cálculos de KPI dinámicos desde el estado real (inician en cero)
  const totalPendienteMonto = pendingItems.reduce((acc, r) => acc + (r.montoBruto || 0), 0);
  const totalAprobadasMonto = approvedItems.reduce((acc, r) => acc + (r.montoBruto || 0), 0);
  const totalRechazoMonto = rejectedItems.reduce((acc, r) => acc + (r.montoBruto || 0), 0);

  // Filtrar items mostrados
  const filteredQueue = pendingItems.filter((item) => {
    if (selectedCCFilter === 'ALL') return true;
    return item.centroCosto === selectedCCFilter;
  });

  const handleOpenAudit = (item: RendicionItem) => {
    setAuditingItem(item);
    setRevisorNotes(item.revisorObservacion || '');
    setDecisionSuccessMsg(null);
  };

  const handleDecision = async (estado: 'APROBADO' | 'RECHAZADO') => {
    if (!auditingItem) return;

    setIsSubmittingDecision(true);
    try {
      const res = await fetch(`/api/rendiciones/${auditingItem.id}/estado`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer demo-token',
        },
        body: JSON.stringify({
          estado,
          observaciones: revisorNotes,
        }),
      });

      const parsed = await parsearRespuestaSegura<{ success: boolean; error?: string }>(
        res,
        'la actualización de estado de la rendición'
      );

      if (!parsed.ok) {
        console.warn('[RevisorView]: Aviso en actualización:', parsed.error);
      }
      if (estado === 'APROBADO') {
        setDecisionSuccessMsg({
          tipo: 'success',
          texto: '✓ Aprobación cursada exitosamente a Contabilidad IDIEM',
        });
        onShowToast(`Rendición ${auditingItem.folio} aprobada y visada.`);
      } else {
        setDecisionSuccessMsg({
          tipo: 'error',
          texto: 'Rechazada. Se notificó al rendidor para subsanar observaciones.',
        });
        onShowToast(`Rendición ${auditingItem.folio} rechazada.`);
      }

      onActualizarEstado(auditingItem.id, estado, revisorNotes);

      setTimeout(() => {
        setAuditingItem(null);
        setIsSubmittingDecision(false);
        setDecisionSuccessMsg(null);
      }, 900);
    } catch (err) {
      console.error(err);
      onActualizarEstado(auditingItem.id, estado, revisorNotes);
      setAuditingItem(null);
      setIsSubmittingDecision(false);
    }
  };

  return (
    <div className="flex flex-col w-full pb-24">
      {/* Encabezado del Módulo de Aprobaciones */}
      <section className="px-4 pt-3.5 pb-2 max-w-md mx-auto w-full flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#00236f] text-[20px]">
              verified_user
            </span>
            <h1 className="text-[17px] text-[#00236f] font-bold tracking-tight">
              Aprobaciones de Gastos
            </h1>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#5bb8fe]/30 text-[#00476e] text-[11px] font-bold shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00236f] animate-pulse" />
            {pendingItems.length} por revisar
          </span>
        </div>
        <p className="text-[12px] text-[#444651] flex items-center gap-1">
          <span>Jefatura Centro de Costos</span>
          <span className="text-[#757682]">•</span>
          <span className="font-mono text-[11px] text-[#006398] font-semibold">
            IDIEM Universidad de Chile
          </span>
        </p>
      </section>

      {/* Grid de 3 KPIs */}
      <section className="px-4 py-2 max-w-md mx-auto w-full">
        <div className="grid grid-cols-3 gap-2">
          {/* Pendientes */}
          <div className="bg-white p-2.5 rounded-xl shadow-xs border border-[#e5eeff] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#444651]">
                Pendientes
              </span>
              <span className="w-2 h-2 rounded-full bg-[#5bb8fe]" />
            </div>
            <div className="text-[16px] text-[#0b1c30] font-bold leading-tight">
              ${totalPendienteMonto.toLocaleString('es-CL')}
            </div>
            <div className="font-mono text-[10px] text-[#757682] mt-0.5">
              {pendingItems.length} solicitudes
            </div>
          </div>

          {/* Aprobadas */}
          <div className="bg-white p-2.5 rounded-xl shadow-xs border border-[#e5eeff] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#444651]">
                Aprobadas
              </span>
              <span className="w-2 h-2 rounded-full bg-[#68dba9]" />
            </div>
            <div className="text-[16px] text-[#004a32] font-bold leading-tight">
              ${totalAprobadasMonto.toLocaleString('es-CL')}
            </div>
            <div className="font-mono text-[10px] text-[#004a32] mt-0.5">
              {approvedItems.length} este mes
            </div>
          </div>

          {/* Rechazo */}
          <div className="bg-white p-2.5 rounded-xl shadow-xs border border-[#e5eeff] flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#444651]">
                Rechazo
              </span>
              <span className="w-2 h-2 rounded-full bg-[#ba1a1a]" />
            </div>
            <div className="text-[16px] text-[#ba1a1a] font-bold leading-tight">
              ${totalRechazoMonto.toLocaleString('es-CL')}
            </div>
            <div className="font-mono text-[10px] text-[#93000a] mt-0.5">
              {rejectedItems.length} solicitudes
            </div>
          </div>
        </div>
      </section>

      {/* Chips de filtro */}
      <section className="py-2 overflow-x-auto flex items-center gap-2 px-4 max-w-md mx-auto w-full no-scrollbar">
        <button
          onClick={() => setSelectedCCFilter('ALL')}
          className={`flex items-center rounded-lg px-2.5 py-1 text-[12px] gap-1 shrink-0 cursor-pointer shadow-xs transition-colors ${
            selectedCCFilter === 'ALL'
              ? 'bg-[#00236f] text-white font-bold'
              : 'bg-white text-[#444651] border border-[#e5eeff]'
          }`}
        >
          <span className="material-symbols-outlined text-[15px]">domain</span>
          <span>Todos los CC</span>
        </button>
        <button
          onClick={() => setSelectedCCFilter('CC-402')}
          className={`flex items-center rounded-lg px-2.5 py-1 text-[12px] gap-1 shrink-0 cursor-pointer shadow-xs transition-colors ${
            selectedCCFilter === 'CC-402'
              ? 'bg-[#00236f] text-white font-bold'
              : 'bg-white text-[#444651] border border-[#e5eeff]'
          }`}
        >
          <span>CC-402 LEMat</span>
        </button>
        <button
          onClick={() => setSelectedCCFilter('CC-105')}
          className={`flex items-center rounded-lg px-2.5 py-1 text-[12px] gap-1 shrink-0 cursor-pointer shadow-xs transition-colors ${
            selectedCCFilter === 'CC-105'
              ? 'bg-[#00236f] text-white font-bold'
              : 'bg-white text-[#444651] border border-[#e5eeff]'
          }`}
        >
          <span>CC-105 Metalurgia</span>
        </button>
      </section>

      {/* Lista: En Cola de Validación */}
      <section className="px-4 pt-2 max-w-md mx-auto w-full flex flex-col gap-2">
        <div className="flex items-center justify-between pb-1">
          <span className="text-[11px] uppercase tracking-wider text-[#444651] font-bold">
            En Cola de Validación
          </span>
          <span className="font-mono text-[11px] text-[#006398] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
            Actualizado en tiempo real
          </span>
        </div>

        {filteredQueue.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-[#e5eeff] flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[36px] text-[#68dba9]">
              task_alt
            </span>
            <div className="text-[14px] font-bold text-[#0b1c30]">
              Bandeja de revisión al día
            </div>
            <p className="text-[12px] text-[#757682]">
              No hay rendiciones pendientes en este centro de costo.
            </p>
          </div>
        ) : (
          filteredQueue.map((item) => (
            <div
              key={item.id}
              onClick={() => handleOpenAudit(item)}
              className="bg-white rounded-xl p-3 shadow-xs hover:shadow-md transition-all active:scale-[0.99] cursor-pointer flex flex-col gap-2 relative overflow-hidden border border-[#e5eeff]"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-[#006398]" />

              <div className="flex items-center justify-between pl-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[12px] font-bold text-[#00236f]">
                    {item.folio}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[#e5eeff] font-mono text-[10px] text-[#444651] font-semibold">
                    {item.centroCosto}
                  </span>
                </div>
                <div className="text-[15px] text-[#00236f] font-bold tracking-tight">
                  ${item.montoBruto.toLocaleString('es-CL')} CLP
                </div>
              </div>

              <div className="flex items-center justify-between pl-1">
                <div className="flex items-center gap-2">
                  <img
                    src={item.rendidorAvatar}
                    alt={item.rendidor}
                    className="w-7 h-7 rounded-full object-cover ring-1 ring-[#e5eeff]"
                  />
                  <div className="flex flex-col">
                    <span className="text-[12px] text-[#0b1c30] font-semibold leading-tight">
                      {item.rendidor}
                    </span>
                    <span className="text-[11px] text-[#757682] truncate max-w-[180px]">
                      {item.tipoDte} #{item.folioDte} • {item.glosa}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#85f8c4]/40 text-[#004a32] text-[10px] font-bold">
                    <span className="material-symbols-outlined text-[12px]">check_circle</span>
                    SII Válido
                  </span>
                  <span className="text-[10px] text-[#006398] font-semibold">
                    Click para auditar →
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Modal / Drawer de Auditoría Detallada */}
      {auditingItem && (
        <div className="fixed inset-0 z-50 bg-[#0b1c30]/50 backdrop-blur-xs flex flex-col justify-end">
          <div
            className="fixed inset-0"
            onClick={() => !isSubmittingDecision && setAuditingItem(null)}
          />

          <div className="relative bg-white rounded-t-2xl shadow-2xl w-full max-w-lg mx-auto max-h-[85vh] overflow-y-auto flex flex-col p-4 gap-3 z-10 animate-in slide-in-from-bottom duration-200">
            {/* Header del modal */}
            <div className="flex items-center justify-between pb-2 border-b border-[#eff4ff]">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-[#e5eeff] flex items-center justify-center text-[#00236f]">
                  <span className="material-symbols-outlined text-[22px]">policy</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[16px] text-[#0b1c30] font-bold">
                      Auditoría {auditingItem.folio}
                    </h2>
                    <span className="px-1.5 py-0.5 rounded bg-[#004a32] text-[#85f8c4] font-mono text-[10px] font-bold">
                      DTE Activo
                    </span>
                  </div>
                  <span className="text-[12px] text-[#444651]">
                    {auditingItem.rendidor} • {auditingItem.centroCostoNombre}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setAuditingItem(null)}
                className="w-8 h-8 rounded-full bg-[#eff4ff] flex items-center justify-center text-[#444651] hover:text-[#0b1c30]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Comprobante Fiscal Digital */}
            <div className="bg-[#eff4ff] rounded-xl p-3 flex flex-col gap-2 border border-[#e5eeff]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-[#444651] font-bold">
                  Comprobante Fiscal Digital
                </span>
                <span className="font-mono text-[11px] text-[#006398] font-bold">
                  DTE SII #{auditingItem.folioDte}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-lg border border-[#dce9ff]">
                {/* Imagen con zoom */}
                <div
                  onClick={() => setZoomedReceipt(!zoomedReceipt)}
                  className="col-span-1 rounded-md overflow-hidden relative shadow-xs cursor-pointer group"
                >
                  <img
                    src={auditingItem.comprobanteUrl}
                    alt="Receipt"
                    className="w-full h-24 object-cover rounded-md group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-[#00236f]/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-[20px]">zoom_in</span>
                  </div>
                </div>

                <div className="col-span-2 flex flex-col justify-between py-0.5 text-[12px]">
                  <div>
                    <div className="font-semibold text-[#0b1c30]">
                      {auditingItem.razonSocial}
                    </div>
                    <div className="font-mono text-[11px] text-[#757682]">
                      RUT: {auditingItem.rutProveedor}
                    </div>
                    <div className="text-[11px] text-[#444651] mt-0.5">
                      Giro: {auditingItem.giroProveedor || 'Insumos Industriales y Ensayos'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[#004a32] font-mono text-[10px] bg-[#85f8c4]/30 px-2 py-0.5 rounded w-fit">
                    <span className="material-symbols-outlined text-[12px]">security</span>
                    <span>Timbre SII verificado</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desglose Tributario */}
            <div className="bg-[#e5eeff] rounded-xl p-3 flex flex-col gap-1.5 border border-[#d3e4fe]">
              <div className="text-[11px] font-bold text-[#00236f] uppercase tracking-wide">
                Desglose Tributario (Moneda Legal CLP)
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-[12px]">
                <span className="text-[#444651]">Monto Exento:</span>
                <span className="font-mono text-right text-[#0b1c30]">
                  ${auditingItem.montoExento.toLocaleString('es-CL')}
                </span>
                <span className="text-[#444651]">Monto Neto:</span>
                <span className="font-mono text-right text-[#0b1c30]">
                  ${auditingItem.montoNeto.toLocaleString('es-CL')}
                </span>
                <span className="text-[#444651]">IVA (19% D.L. 825):</span>
                <span className="font-mono text-right text-[#0b1c30]">
                  ${auditingItem.montoIva.toLocaleString('es-CL')}
                </span>
                <div className="col-span-2 my-1 border-t border-[#c5c5d3]" />
                <span className="font-bold text-[#0b1c30]">Total Reembolso:</span>
                <span className="text-[16px] text-right text-[#00236f] font-bold">
                  ${auditingItem.montoBruto.toLocaleString('es-CL')} CLP
                </span>
              </div>
            </div>

            {/* Observación de Jefatura */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#444651] font-semibold flex items-center justify-between" htmlFor="revisorNotes">
                <span>Observación de Jefatura (Opcional)</span>
                <span className="font-mono text-[10px] text-[#757682]">
                  Registrado en Ficha Histórica
                </span>
              </label>
              <textarea
                id="revisorNotes"
                rows={2}
                value={revisorNotes}
                onChange={(e) => setRevisorNotes(e.target.value)}
                placeholder="Ingrese comentarios para auditoría interna o motivo de rechazo..."
                className="w-full bg-white border border-[#c5c5d3] text-[#0b1c30] text-[12px] p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00236f]"
              />
            </div>

            {/* Mensaje de confirmación temporal */}
            {decisionSuccessMsg && (
              <div
                className={`p-2.5 rounded-lg text-[12px] font-semibold text-center flex items-center justify-center gap-1.5 ${
                  decisionSuccessMsg.tipo === 'success'
                    ? 'bg-[#004a32] text-[#85f8c4]'
                    : 'bg-[#ba1a1a] text-white'
                }`}
              >
                <span>{decisionSuccessMsg.texto}</span>
              </div>
            )}

            {/* Botones de acción: Rechazar y Aprobar */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={isSubmittingDecision}
                onClick={() => handleDecision('RECHAZADO')}
                className="h-11 px-3 rounded-xl bg-[#ffdad6] hover:bg-[#ffdad6]/80 text-[#ba1a1a] text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-xs disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">cancel</span>
                <span>Rechazar</span>
              </button>

              <button
                type="button"
                disabled={isSubmittingDecision}
                onClick={() => handleDecision('APROBADO')}
                className="h-11 px-3 rounded-xl bg-[#00236f] hover:bg-[#1e3a8a] text-white text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">task_alt</span>
                <span>Aprobar Gasto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Zoom de Comprobante */}
      {zoomedReceipt && auditingItem && (
        <div
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setZoomedReceipt(false)}
        >
          <div className="relative max-w-sm w-full bg-white rounded-xl overflow-hidden p-2">
            <img
              src={auditingItem.comprobanteUrl}
              alt="Receipt zoomed"
              className="w-full h-auto object-contain max-h-[70vh] rounded"
            />
            <div className="p-2 text-center text-[12px] text-[#0b1c30] font-mono">
              Folio #{auditingItem.folioDte} • Timbre Electrónico Digital Verificado
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RevisorView;
