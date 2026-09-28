/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Datos Iniciales Institucionales para Rendiciones de Gastos
 * Modo Producción Real (Sin registros de prueba)
 */

import { RendicionItem, OperadorAudit, CentroCosto } from '../types';

export const CENTROS_COSTO_IDIEM: CentroCosto[] = [
  {
    id: 'cc-402',
    codigo: 'CC-402',
    nombre: 'Laboratorio de Estructuras y Materiales (LEMat)',
    division: 'Ingeniería Civil UChile',
    presupuestoMensual: 580000,
  },
  {
    id: 'cc-105',
    codigo: 'CC-105',
    nombre: 'División Metalurgia & Ensayos Mecánicos',
    division: 'Ingeniería Metalúrgica',
    presupuestoMensual: 450000,
  },
  {
    id: 'cc-208',
    codigo: 'CC-208',
    nombre: 'Geotecnia y Mecánica de Suelos',
    division: 'Geociencias Aplicadas',
    presupuestoMensual: 420000,
  },
  {
    id: 'cc-501',
    codigo: 'CC-501',
    nombre: 'Administración y Finanzas Central IDIEM',
    division: 'Rectoría / IDIEM Central',
    presupuestoMensual: 950000,
  },
];

// Arreglo inicial completamente limpio y listo para producción real
export const INITIAL_RENDICIONES: RendicionItem[] = [];

export const OPERADORES_IDIEM: OperadorAudit[] = [
  {
    id: 'op-admin',
    nombre: 'Administrador / Rendidor General',
    rut: '16.892.341-2',
    rol: 'rendidor',
    rolEtiqueta: 'Rendidor / Admin',
    centroCosto: 'CC-402 LEMat',
    activo: true,
    tiempoRelativo: 'En línea',
    ultimaAccionIcon: 'verified_user',
    ultimaAccionTexto: 'Sesión activa en producción',
    iniciales: 'AD',
    avatarBg: 'bg-[#00236f] text-white',
  },
];
