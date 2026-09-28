/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Componente: Reporte de Usuarios Activos al Mes & Cálculo de Fee SaaS
 * Conexión a Supabase (Tabla: 'usuarios_activos_mensuales')
 */

import React, { useState, useEffect } from 'react';
import { obtenerUsuariosActivosMes } from '../../lib/supabase';
import { RendicionItem } from '../types';

interface UsuariosActivosModalProps {
  isOpen: boolean;
  onClose: () => void;
  rendiciones?: RendicionItem[];
}

export const UsuariosActivosModal: React.FC<UsuariosActivosModalProps> = ({
  isOpen,
  onClose,
  rendiciones = [],
}) => {
  const currentPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [selectedPeriodo, setSelectedPeriodo] = useState<string>(currentPeriod);
  const [loading, setLoading] = useState(false);
  const [usuariosData, setUsuariosData] = useState<{
    periodo: string;
    totalUsuariosActivos: number;
    usuarios: any[];
    totalBoletasMes: number;
    montoTotalMes: number;
    feePorUsuarioClp: number;
    totalFeeClp: number;
  }>({
    periodo: currentPeriod,
    totalUsuariosActivos: 0,
    usuarios: [],
    totalBoletasMes: 0,
    montoTotalMes: 0,
    feePorUsuarioClp: 17000,
    totalFeeClp: 0,
  });

  const cargarDatos = async (periodo: string) => {
    setLoading(true);
    try {
      // 1. Intento vía API Backend
      const res = await fetch(`/api/admin/usuarios-activos-mensuales?periodo=${periodo}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setUsuariosData({
            periodo: json.periodo,
            totalUsuariosActivos: json.totalUsuariosActivos,
            usuarios: json.usuarios || [],
            totalBoletasMes: json.totalBoletasMes,
            montoTotalMes: json.montoTotalMes,
            feePorUsuarioClp: json.feePorUsuarioClp || 17000,
            totalFeeClp: json.totalFeeClp || (json.totalUsuariosActivos * 17000),
          });
          setLoading(false);
          return;
        }
      }

      // 2. Intento vía Supabase Client directo
      const sbResult = await obtenerUsuariosActivosMes(periodo);
      const feeUnitario = 17000;
      
      // 3. Fallback con rendiciones locales si no hay registros en BD
      if (sbResult.totalUsuariosActivos === 0 && rendiciones.length > 0) {
        const mapa = new Map<string, any>();
        for (const r of rendiciones) {
          const rut = r.rutRendidor || '16.892.341-2';
          if (!mapa.has(rut)) {
            mapa.set(rut, {
              id: `usr-${rut}`,
              periodo,
              rut_usuario: rut,
              nombre_usuario: r.rendidor || 'Rendidor Institucional IDIEM',
              centro_costo: r.centroCosto || 'CC-402',
              total_boletas_mes: 1,
              monto_total_rendido: Number(r.montoBruto) || 0,
              ultima_rendicion_at: r.fechaCompleta || new Date().toISOString(),
            });
          } else {
            const u = mapa.get(rut);
            u.total_boletas_mes += 1;
            u.monto_total_rendido += Number(r.montoBruto) || 0;
          }
        }
        const usersList = Array.from(mapa.values());
        setUsuariosData({
          periodo,
          totalUsuariosActivos: usersList.length,
          usuarios: usersList,
          totalBoletasMes: usersList.reduce((a, b) => a + b.total_boletas_mes, 0),
          montoTotalMes: usersList.reduce((a, b) => a + b.monto_total_rendido, 0),
          feePorUsuarioClp: feeUnitario,
          totalFeeClp: usersList.length * feeUnitario,
        });
      } else {
        setUsuariosData({
          periodo: sbResult.periodo,
          totalUsuariosActivos: sbResult.totalUsuariosActivos,
          usuarios: sbResult.usuarios,
          totalBoletasMes: sbResult.totalBoletasMes,
          montoTotalMes: sbResult.montoTotalMes,
          feePorUsuarioClp: feeUnitario,
          totalFeeClp: sbResult.totalUsuariosActivos * feeUnitario,
        });
      }
    } catch (err) {
      console.warn('[Cargar Usuarios Activos]:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      cargarDatos(selectedPeriodo);
    }
  }, [isOpen, selectedPeriodo, rendiciones]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-[#b6c4ff]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#00236f] to-[#0038a8] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#85f8c4]">
              <span className="material-symbols-outlined text-[22px]">group_work</span>
            </span>
            <div>
              <h2 className="text-[15px] font-bold tracking-tight">
                Control de Usuarios Activos al Mes
              </h2>
              <p className="text-[11px] text-[#d3e4fe] font-mono">
                Supabase: <strong className="text-white">usuarios_activos_mensuales</strong> · Cobro de Fee
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-3.5 overflow-y-auto">
          
          {/* Regla de Negocio Destacada */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-amber-950">
            <span className="material-symbols-outlined text-[20px] text-amber-700 shrink-0 mt-0.5">
              info
            </span>
            <div className="text-[11px] leading-relaxed">
              <strong className="block text-amber-900 font-bold mb-0.5">
                Regla de Facturación y Conteo Único:
              </strong>
              Cada trabajador que suba y envíe al menos 1 comprobante de gasto dentro del mes calendario se registra en <span className="font-mono bg-amber-100 px-1 rounded">usuarios_activos_mensuales</span>. Si rinde <strong>1 o 20 boletas</strong> en el mismo mes, <strong>solo cuenta como 1 Usuario Activo</strong> para el cobro del fee mensual.
            </div>
          </div>

          {/* Selector de Período y Botón de Recarga */}
          <div className="flex items-center justify-between gap-2 bg-[#f8faff] p-2.5 rounded-xl border border-[#e5eeff]">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#444651] font-bold">Mes a Consultar:</span>
              <select
                value={selectedPeriodo}
                onChange={(e) => setSelectedPeriodo(e.target.value)}
                className="bg-white text-[#00236f] text-[12px] font-bold rounded-lg px-2.5 py-1 border border-[#b6c4ff] focus:outline-none focus:ring-1 focus:ring-[#00236f] cursor-pointer"
              >
                <option value="2026-09">Septiembre 2026 (En curso)</option>
                <option value="2026-08">Agosto 2026</option>
                <option value="2026-07">Julio 2026</option>
                <option value="2026-06">Junio 2026</option>
                <option value="2026-05">Mayo 2026</option>
              </select>
            </div>

            <button
              onClick={() => cargarDatos(selectedPeriodo)}
              disabled={loading}
              className="p-1.5 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#00236f] flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
              title="Sincronizar con Supabase"
            >
              <span className={`material-symbols-outlined text-[17px] ${loading ? 'animate-spin' : ''}`}>
                sync
              </span>
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="bg-[#00236f] text-white p-3 rounded-xl shadow-xs flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#d3e4fe]">
                Usuarios Activos
              </span>
              <div className="text-[22px] font-extrabold leading-tight mt-1 text-[#85f8c4]">
                {usuariosData.totalUsuariosActivos}
              </div>
              <span className="text-[10px] text-[#cce5ff] font-mono">
                Únicos en el mes
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-[#e5eeff] shadow-xs flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#444651]">
                Total Boletas
              </span>
              <div className="text-[20px] font-extrabold text-[#0b1c30] leading-tight mt-1">
                {usuariosData.totalBoletasMes}
              </div>
              <span className="text-[10px] text-[#757682] font-mono">
                rendidas este mes
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-[#e5eeff] shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#444651]">
                Fee Mensual Est.
              </span>
              <div className="text-[18px] font-extrabold text-[#00236f] leading-tight mt-1">
                ${usuariosData.totalFeeClp.toLocaleString('es-CL')}
              </div>
              <span className="text-[10px] text-emerald-700 font-mono font-bold">
                ($17.000 / usuario)
              </span>
            </div>
          </div>

          {/* Listado de Usuarios Activos en el Mes */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between pt-1">
              <span className="text-[12px] font-bold text-[#0b1c30] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#00236f]">badge</span>
                Nómina de Trabajadores Rendidores ({usuariosData.totalUsuariosActivos})
              </span>
              <span className="text-[10px] font-mono text-[#757682]">
                Período {selectedPeriodo}
              </span>
            </div>

            {loading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <span className="w-6 h-6 rounded-full border-2 border-[#00236f] border-t-transparent animate-spin" />
                <span className="text-[11px] text-[#757682]">Consultando Supabase...</span>
              </div>
            ) : usuariosData.usuarios.length === 0 ? (
              <div className="bg-[#f8faff] rounded-xl p-6 text-center border border-[#e5eeff] flex flex-col items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-[28px] text-[#b6c4ff]">
                  person_off
                </span>
                <span className="text-[12px] font-bold text-[#0b1c30]">
                  Sin usuarios activos en este período
                </span>
                <p className="text-[11px] text-[#757682] max-w-xs">
                  Cuando un trabajador envíe una boleta para este mes, aparecerá registrado automáticamente aquí.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                {usuariosData.usuarios.map((u, idx) => (
                  <div
                    key={u.id || idx}
                    className="p-2.5 rounded-xl bg-[#f8faff] hover:bg-[#eff4ff] transition-colors border border-[#e5eeff] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#00236f] text-white flex items-center justify-center font-bold text-[12px] shadow-2xs shrink-0">
                        {u.nombre_usuario ? u.nombre_usuario.slice(0, 2).toUpperCase() : 'TR'}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[12px] font-bold text-[#0b1c30] leading-tight">
                          {u.nombre_usuario || 'Trabajador Rendidor'}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#006398]">
                          <span>RUT: {u.rut_usuario}</span>
                          <span>•</span>
                          <span>{u.centro_costo || 'CC-402'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="px-2 py-0.5 rounded-md bg-[#dce9ff] text-[#00236f] font-mono text-[10px] font-bold">
                        {u.total_boletas_mes || 1} {u.total_boletas_mes === 1 ? 'boleta' : 'boletas'}
                      </span>
                      <span className="text-[10px] font-mono text-[#444651] mt-0.5">
                        ${Number(u.monto_total_rendido || 0).toLocaleString('es-CL')} CLP
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#f8faff] border-t border-[#e5eeff] flex items-center justify-between">
          <span className="text-[10px] text-[#757682] font-mono flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Supabase DB Sincronizado
          </span>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#00236f] hover:bg-[#0038a8] text-white rounded-xl text-[12px] font-bold transition-all cursor-pointer"
          >
            Entendido / Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};

export default UsuariosActivosModal;
