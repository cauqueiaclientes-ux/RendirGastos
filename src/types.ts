/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Definición de tipos TypeScript para Rendiciones de Gastos y Auditoría
 */

export type UserRole = 'rendidor' | 'revisor' | 'contabilidad' | 'admin';

export interface UsuarioSesion {
  rut: string;
  nombre: string;
  rol: UserRole;
  centroCosto: string;
  rolTitulo: string;
  avatar?: string;
  fechaIngreso?: string;
}

export type RolUsuario = 'ADMIN' | 'REVISOR' | 'RENDIDOR';

export type EstadoRendicion = 'BORRADOR' | 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

export type EstadoSII = 'ACEPTADO' | 'RECHAZADO' | 'NO_ENCONTRADO' | 'PENDIENTE_VALIDACION';

export type TipoDocumento = 
  | 'FACTURA_ELECTRONICA' 
  | 'BOLETA_ELECTRONICA' 
  | 'BOLETA_EXENTA' 
  | 'BOLETA_HONORARIOS' 
  | 'OTRO';

export interface CentroCosto {
  id: string;
  codigo: string;
  nombre: string;
  division: string;
  presupuestoMensual: number;
}

export interface RendicionItem {
  id: string;
  folio: string;
  fecha: string;
  fechaCompleta: string;
  rendidor: string;
  rendidorCorto: string;
  rendidorAvatar: string;
  rutRendidor: string;
  centroCosto: string;
  centroCostoNombre: string;
  rutProveedor: string;
  razonSocial: string;
  giroProveedor?: string;
  glosa: string;
  montoBruto: number;
  montoNeto: number;
  montoIva: number;
  montoExento: number;
  estadoSii: EstadoSII;
  folioDte: number;
  tipoDte: string;
  estado: EstadoRendicion;
  estadoPago: 'Por Liquidar' | 'Pagado' | 'En Revisión' | 'Rechazado' | 'Borrador';
  imputacion: string;
  comprobanteUrl: string;
  timbreSiiHash: string;
  revisorObservacion?: string | null;
}

export interface OperadorAudit {
  id: string;
  nombre: string;
  rut: string;
  rol: 'rendidor' | 'revisor' | 'contador';
  rolEtiqueta: string;
  centroCosto: string;
  activo: boolean;
  tiempoRelativo: string;
  ultimaAccionIcon: string;
  ultimaAccionTexto: string;
  iniciales: string;
  avatarBg: string;
}

export interface FacturacionConsolidada {
  organizacion: string;
  rut: string;
  usuariosActivos: number;
  licenciasTotales: number;
  cuposDisponibles: number;
  tasaUso: string;
  rendicionesTramitadas: number;
  montoTotalRendidoClp: number;
  costoPorUsuarioUf: number;
  subtotalUf: number;
  subtotalClp: number;
  iva19Clp: number;
  totalFacturadoClp: number;
}
