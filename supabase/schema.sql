-- ============================================================================
-- IDIEM - Universidad de Chile
-- Plataforma SaaS de Rendición de Gastos y Auditoría Tributaria
-- Esquema de Base de Datos PostgreSQL / Supabase con RLS y Facturación
-- ============================================================================

-- 1. EXTENSIONES REQUERIDAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMs INSTITUCIONALES Y TRIBUTARIOS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario') THEN
        CREATE TYPE rol_usuario AS ENUM ('ADMIN', 'REVISOR', 'RENDIDOR');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_rendicion') THEN
        CREATE TYPE estado_rendicion AS ENUM ('BORRADOR', 'PENDIENTE', 'APROBADO', 'RECHAZADO');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_documento') THEN
        CREATE TYPE tipo_documento AS ENUM (
            'FACTURA_ELECTRONICA', 
            'BOLETA_ELECTRONICA', 
            'BOLETA_EXENTA', 
            'BOLETA_HONORARIOS', 
            'OTRO'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_sii') THEN
        CREATE TYPE estado_sii AS ENUM (
            'ACEPTADO', 
            'RECHAZADO', 
            'NO_ENCONTRADO', 
            'PENDIENTE_VALIDACION'
        );
    END IF;
END $$;

-- 3. TABLA: ORGANIZACIONES (Multi-tenant SaaS)
CREATE TABLE IF NOT EXISTS organizaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rut VARCHAR(12) NOT NULL UNIQUE,
    nombre VARCHAR(255) NOT NULL,
    razon_social VARCHAR(255) NOT NULL,
    direccion TEXT,
    telefono VARCHAR(50),
    contacto_email VARCHAR(255),
    limite_licencias INT DEFAULT 60,
    costo_por_usuario_uf NUMERIC(10, 2) DEFAULT 0.45,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABLA: CENTROS DE COSTO (CC IDIEM / UChile)
CREATE TABLE IF NOT EXISTS centros_costo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
    codigo VARCHAR(20) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    division VARCHAR(150),
    presupuesto_mensual NUMERIC(15, 2) DEFAULT 0,
    jefe_cc_id UUID, -- Referencia a usuarios
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organizacion_id, codigo)
);

-- 5. TABLA: USUARIOS (Perfiles asociados a auth.users de Supabase)
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organizacion_id UUID NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
    centro_costo_id UUID REFERENCES centros_costo(id) ON DELETE SET NULL,
    rut VARCHAR(12) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    apellidos VARCHAR(150),
    email VARCHAR(255) NOT NULL UNIQUE,
    cargo VARCHAR(150),
    rol rol_usuario NOT NULL DEFAULT 'RENDIDOR',
    avatar_url TEXT,
    activo BOOLEAN DEFAULT TRUE,
    ultimo_acceso TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asignar FK diferida de jefe de centro de costo
ALTER TABLE centros_costo 
    DROP CONSTRAINT IF EXISTS fk_centros_costo_jefe,
    ADD CONSTRAINT fk_centros_costo_jefe FOREIGN KEY (jefe_cc_id) REFERENCES usuarios(id) ON DELETE SET NULL;

-- 6. TABLA: RENDICIONES (Encabezados de rendición de fondos)
CREATE TABLE IF NOT EXISTS rendiciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    centro_costo_id UUID NOT NULL REFERENCES centros_costo(id) ON DELETE RESTRICT,
    folio_interno VARCHAR(50) NOT NULL,
    glosa TEXT NOT NULL,
    periodo_mes INT NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
    periodo_anio INT NOT NULL CHECK (periodo_anio >= 2020),
    estado estado_rendicion NOT NULL DEFAULT 'PENDIENTE',
    monto_total NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_neto NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_iva NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_exento NUMERIC(15, 2) NOT NULL DEFAULT 0,
    revisor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    observacion_revisor TEXT,
    fecha_revision TIMESTAMP WITH TIME ZONE,
    fecha_rendicion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organizacion_id, folio_interno)
);

-- 7. TABLA: DETALLES DE GASTOS (Líneas de comprobantes con DTE y Supabase Storage)
CREATE TABLE IF NOT EXISTS detalles_gastos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rendicion_id UUID NOT NULL REFERENCES rendiciones(id) ON DELETE CASCADE,
    tipo_documento tipo_documento NOT NULL DEFAULT 'BOLETA_ELECTRONICA',
    rut_emisor VARCHAR(12) NOT NULL,
    razon_social_emisor VARCHAR(255),
    folio_dte BIGINT NOT NULL,
    fecha_emision DATE NOT NULL,
    monto_neto NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_iva NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_exento NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_total NUMERIC(15, 2) NOT NULL,
    estado_sii estado_sii NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
    respuesta_sii JSONB,
    timbre_sii_hash VARCHAR(255),
    comprobante_url TEXT NOT NULL,
    comprobante_storage_path VARCHAR(500),
    comprobante_mime_type VARCHAR(100) DEFAULT 'image/jpeg',
    ocr_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. TABLA DE AUDITORÍA INMUTABLE (Trazabilidad ISO 9001 / Contraloría UChile)
CREATE TABLE IF NOT EXISTS bitacora_auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizacion_id UUID NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    rendicion_id UUID REFERENCES rendiciones(id) ON DELETE CASCADE,
    accion VARCHAR(100) NOT NULL,
    descripcion TEXT NOT NULL,
    ip_origen VARCHAR(45),
    hash_sha256 VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 9. POLÍTICAS DE RLS (ROW LEVEL SECURITY)
-- Aislamiento estricto multi-tenant por organización y roles (ADMIN, REVISOR, RENDIDOR)
-- ============================================================================

ALTER TABLE organizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE centros_costo ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendiciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalles_gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora_auditoria ENABLE ROW LEVEL SECURITY;

-- Funciones Helper para RLS
CREATE OR REPLACE FUNCTION get_auth_usuario_id() 
RETURNS UUID AS $$
    SELECT auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_auth_organizacion_id() 
RETURNS UUID AS $$
    SELECT organizacion_id FROM usuarios WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_auth_rol() 
RETURNS rol_usuario AS $$
    SELECT rol FROM usuarios WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- RLS: Organizaciones (Ver solo su propia organización)
CREATE POLICY rls_organizaciones_select ON organizaciones
    FOR SELECT USING (id = get_auth_organizacion_id());

-- RLS: Centros de Costo (Ver todos los CC de su organización)
CREATE POLICY rls_centros_costo_select ON centros_costo
    FOR SELECT USING (organizacion_id = get_auth_organizacion_id());

-- RLS: Usuarios (Ver usuarios de su organización)
CREATE POLICY rls_usuarios_select ON usuarios
    FOR SELECT USING (organizacion_id = get_auth_organizacion_id());

CREATE POLICY rls_usuarios_update_self ON usuarios
    FOR UPDATE USING (id = get_auth_usuario_id());

-- RLS: Rendiciones
-- RENDIDOR: Solo puede ver y crear sus propias rendiciones
-- REVISOR: Puede ver las de su organización/CC y actualizar estado
-- ADMIN: Acceso total a las rendiciones de su organización
CREATE POLICY rls_rendiciones_select ON rendiciones
    FOR SELECT USING (
        organizacion_id = get_auth_organizacion_id() AND (
            get_auth_rol() IN ('ADMIN', 'REVISOR') OR
            usuario_id = get_auth_usuario_id()
        )
    );

CREATE POLICY rls_rendiciones_insert ON rendiciones
    FOR INSERT WITH CHECK (
        organizacion_id = get_auth_organizacion_id() AND
        usuario_id = get_auth_usuario_id()
    );

CREATE POLICY rls_rendiciones_update ON rendiciones
    FOR UPDATE USING (
        organizacion_id = get_auth_organizacion_id() AND (
            (get_auth_rol() = 'RENDIDOR' AND usuario_id = get_auth_usuario_id() AND estado = 'BORRADOR') OR
            (get_auth_rol() IN ('ADMIN', 'REVISOR'))
        )
    );

-- RLS: Detalles de Gastos (Heredan permisos de la rendición padre)
CREATE POLICY rls_detalles_gastos_select ON detalles_gastos
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM rendiciones r
            WHERE r.id = detalles_gastos.rendicion_id
            AND r.organizacion_id = get_auth_organizacion_id()
            AND (get_auth_rol() IN ('ADMIN', 'REVISOR') OR r.usuario_id = get_auth_usuario_id())
        )
    );

CREATE POLICY rls_detalles_gastos_insert ON detalles_gastos
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM rendiciones r
            WHERE r.id = detalles_gastos.rendicion_id
            AND r.organizacion_id = get_auth_organizacion_id()
            AND r.usuario_id = get_auth_usuario_id()
            AND r.estado = 'BORRADOR'
        )
    );

-- RLS: Bitácora de Auditoría
CREATE POLICY rls_bitacora_select ON bitacora_auditoria
    FOR SELECT USING (
        organizacion_id = get_auth_organizacion_id() AND
        get_auth_rol() IN ('ADMIN', 'REVISOR')
    );

CREATE POLICY rls_bitacora_insert ON bitacora_auditoria
    FOR INSERT WITH CHECK (
        organizacion_id = get_auth_organizacion_id()
    );

-- ============================================================================
-- 10. FUNCIÓN POSTGRESQL: FACTURACIÓN MENSUAL POR USUARIO ACTIVO (MANDATORIA)
-- `obtener_usuarios_activos_mes(p_mes INT, p_anio INT)`
-- ============================================================================

CREATE OR REPLACE FUNCTION obtener_usuarios_activos_mes(
    p_mes INT,
    p_anio INT
)
RETURNS TABLE (
    organizacion_id UUID,
    nombre_organizacion VARCHAR,
    rut_organizacion VARCHAR,
    total_usuarios_activos BIGINT,
    total_rendiciones_tramitadas BIGINT,
    monto_total_rendido NUMERIC,
    costo_unitario_uf NUMERIC,
    subtotal_facturacion_uf NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH usuarios_con_actividad AS (
        -- Usuarios que crearon o actualizaron rendiciones en el mes especificado
        SELECT DISTINCT 
            r.organizacion_id, 
            r.usuario_id AS usuario_activo_id
        FROM rendiciones r
        WHERE r.periodo_mes = p_mes 
          AND r.periodo_anio = p_anio

        UNION

        -- Revisores que dictaminaron gastos en el período
        SELECT DISTINCT 
            r.organizacion_id, 
            r.revisor_id AS usuario_activo_id
        FROM rendiciones r
        WHERE r.revisor_id IS NOT NULL
          AND EXTRACT(MONTH FROM r.fecha_revision) = p_mes
          AND EXTRACT(YEAR FROM r.fecha_revision) = p_anio
    ),
    metricas_rendiciones AS (
        SELECT 
            r.organizacion_id,
            COUNT(r.id) AS rendiciones_count,
            COALESCE(SUM(r.monto_total), 0) AS suma_montos
        FROM rendiciones r
        WHERE r.periodo_mes = p_mes 
          AND r.periodo_anio = p_anio
        GROUP BY r.organizacion_id
    )
    SELECT 
        o.id AS organizacion_id,
        o.nombre AS nombre_organizacion,
        o.rut AS rut_organizacion,
        COUNT(DISTINCT uca.usuario_activo_id) AS total_usuarios_activos,
        COALESCE(mr.rendiciones_count, 0) AS total_rendiciones_tramitadas,
        COALESCE(mr.suma_montos, 0) AS monto_total_rendido,
        o.costo_por_usuario_uf AS costo_unitario_uf,
        ROUND((COUNT(DISTINCT uca.usuario_activo_id) * o.costo_por_usuario_uf), 2) AS subtotal_facturacion_uf
    FROM organizaciones o
    LEFT JOIN usuarios_con_actividad uca ON uca.organizacion_id = o.id
    LEFT JOIN metricas_rendiciones mr ON mr.organizacion_id = o.id
    WHERE o.activo = TRUE
    GROUP BY o.id, o.nombre, o.rut, o.costo_por_usuario_uf, mr.rendiciones_count, mr.suma_montos;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 11. DATOS SEMILLA INSTITUCIONALES (IDIEM - U. de Chile)
-- ============================================================================
INSERT INTO organizaciones (id, rut, nombre, razon_social, direccion, limite_licencias, costo_por_usuario_uf)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    '60.910.000-1',
    'IDIEM Universidad de Chile',
    'Instituto de Investigaciones y Ensayos de Materiales - Universidad de Chile',
    'Plaza Ercilla 883, Santiago, Región Metropolitana',
    60,
    0.45
) ON CONFLICT (rut) DO NOTHING;

INSERT INTO centros_costo (id, organizacion_id, codigo, nombre, division, presupuesto_mensual)
VALUES 
    ('c0000000-0000-0000-0000-000000000402', 'a0000000-0000-0000-0000-000000000001', 'CC-402', 'Laboratorio de Estructuras y Materiales (LEMat)', 'Ingeniería Civil', 5800000),
    ('c0000000-0000-0000-0000-000000000105', 'a0000000-0000-0000-0000-000000000001', 'CC-105', 'División Metalurgia & Ensayos Mecánicos', 'Ingeniería Metalúrgica', 4200000),
    ('c0000000-0000-0000-0000-000000000208', 'a0000000-0000-0000-0000-000000000001', 'CC-208', 'Geotecnia y Mecánica de Suelos', 'Geociencias', 3900000),
    ('c0000000-0000-0000-0000-000000000501', 'a0000000-0000-0000-0000-000000000001', 'CC-501', 'Administración y Finanzas Central', 'Rectoría / IDIEM', 8500000)
ON CONFLICT (organizacion_id, codigo) DO NOTHING;
