/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Consola Central de Contabilidad & Auditoría (Módulo Fiscal)
 * Cierre Mensual, Libro de Rendiciones, Cruce SII y Conciliación Bancaria
 */

import React, { useState } from 'react';
import { RendicionItem } from '../types';
import { exportarExcelAuditoria, exportarPdfAuditoria } from '../utils/exportAuditoria';

interface ContabilidadViewProps {
  rendiciones: RendicionItem[];
  onShowToast: (mensaje: string) => void;
  onOpenUsuariosActivos?: () => void;
  usuariosActivosCount?: number;
}

export const ContabilidadView: React.FC<ContabilidadViewProps> = ({
  rendiciones,
  onShowToast,
  onOpenUsuariosActivos,
  usuariosActivosCount = 0,
}) => {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [conciliacionBancariaActiva, setConciliacionBancariaActiva] = useState(true);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'filtered' | 'all'>('filtered');

  // Filtros
  const [filterRendidor, setFilterRendidor] = useState('all');
  const [filterPeriodo, setFilterPeriodo] = useState('2026');
  const [filterSii, setFilterSii] = useState('all');
  const [filterCC, setFilterCC] = useState('all');

  const getNombrePeriodo = (codigo: string) => {
    if (codigo === 'all') return 'Todos los Años';
    return `Año ${codigo}`;
  };

  const handleResetFilters = () => {
    setFilterRendidor('all');
    setFilterPeriodo('2026');
    setFilterSii('all');
    setFilterCC('all');
    onShowToast('Filtros de auditoría contable restablecidos');
  };

  // Filtrado de registros
  const filteredRendiciones = rendiciones.filter((item) => {
    if (filterCC !== 'all' && item.centroCosto !== filterCC) return false;
    if (filterRendidor !== 'all' && !item.rendidorCorto.toLowerCase().includes(filterRendidor)) return false;
    if (filterSii === 'valido' && item.estadoSii !== 'ACEPTADO') return false;
    if (filterSii === 'observado' && item.estadoSii === 'ACEPTADO') return false;
    return true;
  });

  // Métricas financieras calculadas dinámicamente desde el estado real
  const totalMontoAcumulado = filteredRendiciones.reduce((acc, curr) => acc + (curr.montoBruto || 0), 0);
  const totalIvaAcumulado = filteredRendiciones.reduce((acc, curr) => acc + (curr.montoIva || 0), 0);
  const totalDocumentos = filteredRendiciones.length;
  const documentosAprobados = filteredRendiciones.filter((r) => r.estadoSii === 'ACEPTADO').length;
  const porcentajeCumplimiento = totalDocumentos > 0
    ? ((documentosAprobados / totalDocumentos) * 100).toFixed(1)
    : '100';

  const handleExport = (tipo: 'xlsx' | 'pdf') => {
    setExportMenuOpen(false);
    setIsExporting(tipo);

    const dataToExport = exportScope === 'all' ? rendiciones : filteredRendiciones;
    const periodo = getNombrePeriodo(filterPeriodo);

    try {
      if (tipo === 'xlsx') {
        onShowToast(`Generando y descargando Libro de Rendiciones Excel (.xlsx) para ${periodo}...`);
        setTimeout(() => {
          exportarExcelAuditoria(dataToExport, periodo);
          setIsExporting(null);
          onShowToast(`✓ Libro Excel descargado con éxito (${dataToExport.length} registros).`);
        }, 150);
      } else {
        onShowToast(`Generando Reporte Foliado Oficial en PDF con membrete IDIEM para ${periodo}...`);
        setTimeout(() => {
          exportarPdfAuditoria(dataToExport, periodo);
          setIsExporting(null);
          onShowToast(`✓ Reporte PDF de Auditoría generado y descargado.`);
        }, 150);
      }
    } catch (err: any) {
      console.error('Error al exportar reporte:', err);
      setIsExporting(null);
      onShowToast(`Error al exportar archivo: ${err?.message || 'Error inesperado'}`);
    }
  };

  return (
    <div className="flex flex-col w-full pb-24">
      {/* Encabezado del Módulo Fiscal */}
      <div className="px-4 pt-3.5 pb-2 max-w-md mx-auto w-full flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#1e3a8a] text-white">
              <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#006398]">
              Contabilidad IDIEM · Módulo Fiscal
            </span>
          </div>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#d3e4fe] text-[#0b1c30] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#68dba9]" />
            Sincronizado SII
          </span>
        </div>

        <div className="flex flex-col">
          <h1 className="text-[18px] font-bold text-[#00236f] tracking-tight">
            Consola Central de Contabilidad & Auditoría
          </h1>
          <p className="text-[12px] text-[#444651]">
            Cierre fiscal mensual, auditoría tributaria y conciliación contable de gastos.
          </p>
        </div>

        {/* Barra de Acciones: Exportar y Filtros */}
        <div className="relative mt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-[#00236f] hover:bg-[#1e3a8a] text-white text-[13px] font-bold shadow-xs flex items-center justify-between active:scale-[0.98] transition-all"
            >
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">ios_share</span>
                Exportar Reporte Contable
              </span>
              <span
                className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${
                  exportMenuOpen ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </button>

            <button
              onClick={() => setFilterPanelOpen(!filterPanelOpen)}
              className="min-w-[40px] min-h-[40px] px-2 rounded-xl bg-[#e5eeff] text-[#0b1c30] flex items-center justify-center active:scale-95 shadow-xs transition-colors hover:bg-[#dce9ff]"
              title="Alternar Filtros"
            >
              <span className="material-symbols-outlined text-[20px] text-[#00236f]">filter_alt</span>
            </button>
          </div>

          {/* Menú de Exportación */}
          {exportMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setExportMenuOpen(false)} />
              <div className="absolute left-0 right-0 top-12 z-40 bg-white rounded-xl shadow-xl border border-[#e5eeff] overflow-hidden py-1 animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-[#eff4ff] flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#757682] uppercase tracking-wider">
                    Formatos de Cierre Certificados
                  </span>
                  <span className="text-[10px] font-mono text-[#00236f] bg-[#e5eeff] px-1.5 py-0.5 rounded font-bold">
                    {filteredRendiciones.length} ítems
                  </span>
                </div>

                <button
                  onClick={() => handleExport('xlsx')}
                  disabled={isExporting !== null}
                  className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[#eff4ff] transition-colors group cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                      <span className="material-symbols-outlined text-[18px]">table_view</span>
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold text-[#0b1c30] flex items-center gap-1">
                        Descargar Excel (.xlsx)
                        {isExporting === 'xlsx' && (
                          <span className="w-3 h-3 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
                        )}
                      </span>
                      <span className="text-[10px] text-[#444651]">Libro multi-hoja con fórmulas SII y balance por CC</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-emerald-700 text-[18px]">download</span>
                </button>

                <button
                  onClick={() => handleExport('pdf')}
                  disabled={isExporting !== null}
                  className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[#eff4ff] transition-colors group cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-800 group-hover:bg-rose-700 group-hover:text-white transition-colors">
                      <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold text-[#0b1c30] flex items-center gap-1">
                        Exportar Libro PDF Foliado
                        {isExporting === 'pdf' && (
                          <span className="w-3 h-3 rounded-full border-2 border-rose-600 border-t-transparent animate-spin" />
                        )}
                      </span>
                      <span className="text-[10px] text-[#444651]">Formato oficial con membrete U. de Chile y timbre TED</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-rose-700 text-[18px]">download</span>
                </button>

                <div className="border-t border-[#eff4ff] pt-1">
                  <button
                    onClick={() => {
                      setExportMenuOpen(false);
                      setAuditModalOpen(true);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[11px] text-[#00236f] font-bold hover:bg-[#e5eeff] transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">tune</span>
                    <span>Personalizar Reporte de Auditoría...</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Panel: Parámetros de Auditoría */}
      {filterPanelOpen && (
        <div className="px-4 py-2 max-w-md mx-auto w-full">
          <div className="bg-[#eff4ff] p-3 rounded-xl border border-[#e5eeff] shadow-xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#00236f] font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">tune</span>
                Parámetros de Auditoría
              </span>
              <button
                onClick={handleResetFilters}
                className="text-[11px] text-[#006398] font-bold hover:underline"
              >
                Restablecer
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[12px]">
              {/* Centro de Costo */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-[#444651] font-semibold">Centro de Costo IDIEM</label>
                <select
                  value={filterCC}
                  onChange={(e) => setFilterCC(e.target.value)}
                  className="w-full bg-white text-[#0b1c30] text-[11px] rounded-lg py-1.5 px-2 border border-[#d3e4fe] focus:outline-none"
                >
                  <option value="all">Todos los Centros (CC)</option>
                  <option value="CC-402">CC-402 · LEMat</option>
                  <option value="CC-101">CC-101 · Geotecnia</option>
                  <option value="CC-205">CC-205 · Asfaltos</option>
                  <option value="CC-303">CC-303 · Metrología</option>
                </select>
              </div>

              {/* Período Contable - Solo Años */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-[#444651] font-semibold">Período Contable</label>
                <select
                  value={filterPeriodo}
                  onChange={(e) => setFilterPeriodo(e.target.value)}
                  className="w-full bg-white text-[#0b1c30] text-[11px] rounded-lg py-1.5 px-2 border border-[#d3e4fe] focus:outline-none"
                >
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                  <option value="all">Todos los Años</option>
                </select>
              </div>

              {/* Validación Tributaria SII */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-[#444651] font-semibold">Validación Tributaria SII</label>
                <select
                  value={filterSii}
                  onChange={(e) => setFilterSii(e.target.value)}
                  className="w-full bg-white text-[#0b1c30] text-[11px] rounded-lg py-1.5 px-2 border border-[#d3e4fe] focus:outline-none"
                >
                  <option value="all">Todos los estados SII</option>
                  <option value="valido">✓ Timbre Electrónico Válido</option>
                  <option value="observado">⚠️ Observado / Pendiente</option>
                  <option value="exento">Exento de Impuestos</option>
                </select>
              </div>

              {/* Centro de Costo */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-[#444651] font-semibold">Centro de Costo (CC)</label>
                <select
                  value={filterCC}
                  onChange={(e) => setFilterCC(e.target.value)}
                  className="w-full bg-white text-[#0b1c30] text-[11px] rounded-lg py-1.5 px-2 border border-[#d3e4fe] focus:outline-none"
                >
                  <option value="all">Todas las Unidades IDIEM</option>
                  <option value="CC-402">CC-402 · Ensayos Hormigones</option>
                  <option value="CC-105">CC-105 · Mecánica de Suelos</option>
                  <option value="CC-208">CC-208 · Metalurgia & Soldadura</option>
                  <option value="CC-501">CC-501 · Calibración Central</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner de Control de Usuarios Activos al Mes (Cobro de Fee SaaS) */}
      <div className="px-4 pt-2 max-w-md mx-auto w-full">
        <div
          onClick={onOpenUsuariosActivos}
          className="bg-gradient-to-r from-[#eff4ff] to-[#f5f8ff] p-3 rounded-xl border border-[#b6c4ff] shadow-xs flex items-center justify-between cursor-pointer hover:border-[#00236f] transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#00236f] text-white flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px] text-[#85f8c4]">
                group_work
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[12px] font-bold text-[#00236f] flex items-center gap-1">
                Usuarios Activos del Mes
                <span className="text-[10px] font-mono text-[#006398] font-normal">
                  (Fee SaaS)
                </span>
              </span>
              <span className="text-[10px] text-[#444651]">
                1 usuario con 1 o 20 boletas = 1 activo
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[16px] font-extrabold text-[#00236f] font-mono">
              {usuariosActivosCount}
            </span>
            <span className="text-[10px] text-[#757682] font-mono">activos</span>
            <span className="material-symbols-outlined text-[16px] text-[#00236f]">
              chevron_right
            </span>
          </div>
        </div>
      </div>

      {/* Balance Fiscal Consolidado (Tarjeta Marina Oficial) */}
      <div className="px-4 py-2 max-w-md mx-auto w-full">
        <div className="bg-[#00236f] text-white rounded-xl p-4 shadow-md relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-[#1e3a8a] rounded-full opacity-40 pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold tracking-wider text-[#dce1ff]">
                Balance Fiscal Consolidado
              </span>
              <span className="font-mono text-[10px] text-[#85f8c4] bg-[#003120] px-2 py-0.5 rounded font-bold">
                {getNombrePeriodo(filterPeriodo)}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="flex flex-col">
                <span className="text-[26px] font-bold tracking-tight text-white">
                  ${totalMontoAcumulado.toLocaleString('es-CL')}
                </span>
                <span className="text-[11px] text-[#d3e4fe]">
                  Monto Bruto Total Acumulado
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono text-[10px] text-[#cce5ff]">IVA Débito/Crédito</span>
                <div className="text-[16px] text-[#85f8c4] font-bold">
                  ${totalIvaAcumulado.toLocaleString('es-CL')}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 bg-[#1e3a8a]/40 p-2 rounded-lg border border-white/10">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#5bb8fe]">
                  receipt
                </span>
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#cbdbf5]">{totalDocumentos} Documentos</span>
                  <span className="font-mono text-[11px] text-white font-bold">
                    {totalDocumentos > 0 ? '100% Digitalizados' : '0 Digitalizados'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="material-symbols-outlined text-[18px] text-[#85f8c4]">
                  task_alt
                </span>
                <div className="flex flex-col text-right">
                  <span className="text-[10px] text-[#cbdbf5]">Cumplimiento SII</span>
                  <span className="font-mono text-[11px] text-[#85f8c4] font-bold">
                    {porcentajeCumplimiento}% Timbrados
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Encabezado de la Tabla con Botones de Exportación Rápida */}
      <div className="px-4 pt-3 pb-1 max-w-md mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-bold text-[#0b1c30]">
            Libro de Rendiciones
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#cce5ff] text-[#001d31] font-mono text-[11px] font-bold">
            {filteredRendiciones.length}
          </span>
        </div>

        {/* Micro-acciones de exportación directa */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleExport('xlsx')}
            disabled={isExporting !== null}
            title="Exportar tabla actual a Excel"
            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md font-mono text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[13px]">table_view</span>
            <span>Excel</span>
          </button>

          <button
            onClick={() => handleExport('pdf')}
            disabled={isExporting !== null}
            title="Exportar tabla actual a PDF oficial"
            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-md font-mono text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[13px]">picture_as_pdf</span>
            <span>PDF</span>
          </button>

          <button
            onClick={() => setAuditModalOpen(true)}
            title="Abrir consola de auditoría mensual"
            className="p-1 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#00236f] border border-[#b6c4ff] rounded-md transition-all cursor-pointer flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[15px]">tune</span>
          </button>
        </div>
      </div>

      {/* Tabla Deslizable de Rendiciones */}
      <div className="w-full px-4 max-w-md mx-auto">
        <div className="w-full overflow-x-auto rounded-xl shadow-xs bg-white border border-[#e5eeff]">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="bg-[#eff4ff] text-[#444651] text-[10px] font-bold uppercase tracking-wider border-b border-[#e5eeff]">
                <th className="py-2.5 pl-3 pr-1">Folio / ID</th>
                <th className="py-2.5 px-1.5">Fecha</th>
                <th className="py-2.5 px-1.5">Rendidor</th>
                <th className="py-2.5 px-1.5">C. Costo</th>
                <th className="py-2.5 px-1.5">RUT Proveedor</th>
                <th className="py-2.5 px-1.5 text-right">Monto Bruto</th>
                <th className="py-2.5 px-1.5 text-right">IVA Crédito</th>
                <th className="py-2.5 px-1.5 text-center">Estado SII</th>
                <th className="py-2.5 pr-3 pl-1.5 text-center">Estado Pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff4ff] text-[12px] text-[#0b1c30]">
              {filteredRendiciones.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#757682]">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-[28px] text-[#b6c4ff]">
                        receipt_long
                      </span>
                      <span className="font-semibold text-[#0b1c30]">
                        No hay rendiciones registradas para este período
                      </span>
                      <span className="text-[11px] text-[#757682]">
                        Los nuevos comprobantes rendidos aparecerán aquí automáticamente
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRendiciones.map((item) => {
                  const isExpanded = expandedRowId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                    <tr
                      onClick={() => setExpandedRowId(isExpanded ? null : item.id)}
                      className="hover:bg-[#f8f9ff] transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 pl-3 pr-1 font-mono text-[11px] text-[#00236f] font-bold">
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-[#757682]">
                            {isExpanded ? 'unfold_less' : 'unfold_more'}
                          </span>
                          {item.folio}
                        </div>
                      </td>
                      <td className="py-2.5 px-1.5 font-mono text-[11px] text-[#757682]">
                        {item.fecha}
                      </td>
                      <td className="py-2.5 px-1.5 font-semibold">
                        {item.rendidorCorto}
                      </td>
                      <td className="py-2.5 px-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-[#e5eeff] text-[#0b1c30] font-mono text-[10px] font-bold">
                          {item.centroCosto}
                        </span>
                      </td>
                      <td className="py-2.5 px-1.5 font-mono text-[10px] text-[#757682]">
                        {item.rutProveedor}
                      </td>
                      <td className="py-2.5 px-1.5 text-right font-mono font-bold text-[#0b1c30]">
                        ${item.montoBruto.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-1.5 text-right font-mono text-[#006398]">
                        ${item.montoIva.toLocaleString('es-CL')}
                      </td>
                      <td className="py-2.5 px-1.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#85f8c4] text-[#002114] text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#003120]" />
                          ✓ Válido SII
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 pl-1.5 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.estadoPago === 'Pagado'
                              ? 'bg-[#003120] text-white'
                              : item.estadoPago === 'Por Liquidar'
                              ? 'bg-[#cce5ff] text-[#004b73]'
                              : 'bg-[#d3e4fe] text-[#00236f]'
                          }`}
                        >
                          {item.estadoPago === 'Pagado' ? '✓ Pagado' : item.estadoPago}
                        </span>
                      </td>
                    </tr>

                    {/* Fila expandible con detalle DTE e imputación */}
                    {isExpanded && (
                      <tr className="bg-[#eff4ff]">
                        <td colSpan={9} className="p-3">
                          <div className="bg-white p-3 rounded-lg flex flex-col gap-2 shadow-xs border border-[#dce9ff]">
                            <div className="flex items-center justify-between text-[#444651] text-[11px]">
                              <span>
                                <strong>Detalle de {item.tipoDte}:</strong> {item.razonSocial}
                              </span>
                              <span className="font-mono text-[#00236f] font-bold">
                                DTE Folio: #{item.folioDte}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 font-mono text-[11px] pt-1">
                              <div className="p-1.5 rounded bg-[#eff4ff] text-center">
                                Neto: ${item.montoNeto.toLocaleString('es-CL')}
                              </div>
                              <div className="p-1.5 rounded bg-[#eff4ff] text-center">
                                IVA 19%: ${item.montoIva.toLocaleString('es-CL')}
                              </div>
                              <div className="p-1.5 rounded bg-[#e5eeff] font-bold text-[#00236f] text-center">
                                Total: ${item.montoBruto.toLocaleString('es-CL')}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1 text-[11px]">
                              <span className="text-[#757682] truncate max-w-[280px]">
                                Imputación: {item.imputacion}
                              </span>
                              <button
                                onClick={() => onShowToast(`Abriendo comprobante tributario DTE #${item.folioDte}`)}
                                className="text-[#00236f] font-bold flex items-center gap-1 hover:underline shrink-0 ml-2"
                              >
                                <span className="material-symbols-outlined text-[14px]">visibility</span>
                                Ver Documento DTE
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Switch de Conciliación Bancaria Automática y Paginación */}
      <div className="px-4 pt-3 max-w-md mx-auto w-full flex flex-col gap-3">
        <div className="bg-white p-3 rounded-xl border border-[#e5eeff] shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#e5eeff] flex items-center justify-center text-[#00236f]">
              <span className="material-symbols-outlined text-[18px]">sync_alt</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[12px] font-bold text-[#0b1c30]">
                Conciliación Bancaria Automática
              </span>
              <span className="text-[10px] text-[#444651]">
                Cruce directo Cartola Banco de Chile
              </span>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={conciliacionBancariaActiva}
              onChange={() => {
                setConciliacionBancariaActiva(!conciliacionBancariaActiva);
                onShowToast(
                  !conciliacionBancariaActiva
                    ? 'Conciliación Automática con Banco de Chile activada'
                    : 'Conciliación Automática pausada'
                );
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#d3e4fe] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00236f]" />
          </label>
        </div>

        <div className="flex items-center justify-between py-1 text-[11px] text-[#444651]">
          <span className="font-mono">
            {filteredRendiciones.length > 0 ? (
              <>
                Mostrando <strong className="text-[#0b1c30]">1 - {filteredRendiciones.length}</strong> de{' '}
                <strong className="text-[#0b1c30]">{filteredRendiciones.length}</strong> registros
              </>
            ) : (
              <>Mostrando <strong className="text-[#0b1c30]">0</strong> registros</>
            )}
          </span>

          <div className="flex items-center gap-1">
            <button
              disabled
              className="min-w-[32px] min-h-[32px] rounded-lg bg-white border border-[#e5eeff] text-[#757682] flex items-center justify-center cursor-not-allowed opacity-60"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <span className="font-mono px-2.5 py-1 rounded bg-[#00236f] text-white font-bold">
              1
            </span>
            <button
              disabled={filteredRendiciones.length === 0}
              onClick={() => onShowToast('Mostrando siguientes registros del libro auxiliar')}
              className="min-w-[32px] min-h-[32px] rounded-lg bg-white border border-[#e5eeff] text-[#0b1c30] flex items-center justify-center hover:bg-[#eff4ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Configuración y Exportación de Auditoría */}
      {auditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col">
            {/* Header del Modal */}
            <div className="bg-[#00236f] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px] text-[#85f8c4]">
                  assignment_turned_in
                </span>
                <div>
                  <h3 className="text-[15px] font-bold">
                    Reporte de Auditoría & Rendiciones IDIEM
                  </h3>
                  <p className="text-[11px] text-[#d3e4fe]">
                    Universidad de Chile · RUT 60.910.000-1 · Cierre Fiscal
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAuditModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Cerrar modal"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Contenido del Modal */}
            <div className="p-4 flex flex-col gap-3.5 max-h-[80vh] overflow-y-auto">
              {/* Opciones de Período y Alcance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="text-[11px] text-[#444651] font-bold block mb-1">
                    Período Contable a Auditar:
                  </label>
                  <select
                    value={filterPeriodo}
                    onChange={(e) => setFilterPeriodo(e.target.value)}
                    className="w-full bg-white text-[#0b1c30] text-[12px] font-semibold rounded-lg p-2 border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#00236f]"
                  >
                    <option value="2026">Año 2026 (En curso)</option>
                    <option value="2025">Año 2025</option>
                    <option value="2024">Año 2024</option>
                    <option value="all">Todos los Años</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-[#444651] font-bold block mb-1">
                    Alcance de los Datos:
                  </label>
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <label className="flex items-center gap-1.5 text-[11px] text-[#0b1c30] font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="exportScope"
                        checked={exportScope === 'filtered'}
                        onChange={() => setExportScope('filtered')}
                        className="text-[#00236f]"
                      />
                      <span>Filtros actuales ({filteredRendiciones.length} ítems)</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-[#0b1c30] font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="exportScope"
                        checked={exportScope === 'all'}
                        onChange={() => setExportScope('all')}
                        className="text-[#00236f]"
                      />
                      <span>Total general ({rendiciones.length} ítems)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Indicadores Clave del Reporte a Generar */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-mono uppercase font-bold text-[#757682]">
                  Resumen de Valores Consolidados para Auditoría
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-[#eff4ff] p-2 rounded-lg border border-[#dce9ff] flex flex-col">
                    <span className="text-[10px] text-[#006398] font-bold">Comprobantes</span>
                    <span className="text-[14px] font-extrabold text-[#00236f]">
                      {exportScope === 'all' ? rendiciones.length : filteredRendiciones.length}
                    </span>
                  </div>

                  <div className="bg-[#eff4ff] p-2 rounded-lg border border-[#dce9ff] flex flex-col">
                    <span className="text-[10px] text-[#006398] font-bold">Monto Neto</span>
                    <span className="text-[13px] font-extrabold text-[#00236f]">
                      ${(exportScope === 'all' ? rendiciones : filteredRendiciones)
                        .reduce((a, b) => a + (b.montoNeto || 0), 0)
                        .toLocaleString('es-CL')}
                    </span>
                  </div>

                  <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200 flex flex-col">
                    <span className="text-[10px] text-emerald-800 font-bold">IVA Crédito Fiscal</span>
                    <span className="text-[13px] font-extrabold text-emerald-900">
                      ${(exportScope === 'all' ? rendiciones : filteredRendiciones)
                        .reduce((a, b) => a + (b.montoIva || 0), 0)
                        .toLocaleString('es-CL')}
                    </span>
                  </div>

                  <div className="bg-blue-50 p-2 rounded-lg border border-blue-200 flex flex-col">
                    <span className="text-[10px] text-blue-800 font-bold">Total Auditado</span>
                    <span className="text-[13px] font-extrabold text-[#00236f]">
                      ${(exportScope === 'all' ? rendiciones : filteredRendiciones)
                        .reduce((a, b) => a + (b.montoBruto || 0), 0)
                        .toLocaleString('es-CL')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botones de Descarga en Ambos Formatos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Opción Excel */}
                <button
                  onClick={() => handleExport('xlsx')}
                  disabled={isExporting !== null}
                  className="p-3.5 rounded-xl border-2 border-emerald-500 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-950 flex flex-col gap-1 text-left transition-all shadow-xs cursor-pointer disabled:opacity-50 group"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-1.5 font-bold text-[13px] text-emerald-900">
                      <span className="material-symbols-outlined text-[20px] text-emerald-700">
                        table_view
                      </span>
                      Libro Excel (.xlsx)
                    </span>
                    <span className="material-symbols-outlined text-[18px] text-emerald-700 group-hover:translate-y-0.5 transition-transform">
                      download
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Incluye 3 hojas: Detalle completo de rendiciones, resumen por CC y conciliación tributaria SII.
                  </p>
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold self-start">
                    ✓ Fórmulas y Columnas Formateadas
                  </span>
                </button>

                {/* Opción PDF */}
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={isExporting !== null}
                  className="p-3.5 rounded-xl border-2 border-rose-500 bg-rose-50 hover:bg-rose-100/80 text-rose-950 flex flex-col gap-1 text-left transition-all shadow-xs cursor-pointer disabled:opacity-50 group"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-1.5 font-bold text-[13px] text-rose-900">
                      <span className="material-symbols-outlined text-[20px] text-rose-700">
                        picture_as_pdf
                      </span>
                      Reporte PDF Foliado
                    </span>
                    <span className="material-symbols-outlined text-[18px] text-rose-700 group-hover:translate-y-0.5 transition-transform">
                      download
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-800">
                    Formato oficial para Contraloría y Auditoría Interna con membrete institucional de la Universidad de Chile.
                  </p>
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono bg-rose-200 text-rose-900 px-1.5 py-0.5 rounded font-bold self-start">
                    ✓ Timbre TED y Numeración Foliada
                  </span>
                </button>
              </div>

              {/* Mensaje de conformidad */}
              <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-lg text-[11px] text-slate-600">
                <span className="material-symbols-outlined text-[16px] text-[#00236f]">verified</span>
                <span>
                  Los reportes cumplen con la normativa del Servicio de Impuestos Internos (SII) y los estándares de rendición del IDIEM.
                </span>
              </div>
            </div>

            {/* Footer del Modal */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">print</span>
                <span>Imprimir Vista</span>
              </button>

              <button
                type="button"
                onClick={() => setAuditModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[12px] font-bold rounded-lg transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContabilidadView;
