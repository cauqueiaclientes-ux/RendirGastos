/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * IDIEM - Universidad de Chile
 * Botón Flotante de Soporte WhatsApp
 * Redirección directa a WhatsApp (+569 87567519) con mensaje predeterminado
 */

import React, { useState } from 'react';

export const SoporteWhatsAppButton: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);
  const numeroTelefono = '56987567519';
  const mensajePredeterminado = encodeURIComponent(
    'Hola, necesito soporte con la plataforma de rendiciones de IDIEM.'
  );
  const whatsappUrl = `https://wa.me/${numeroTelefono}?text=${mensajePredeterminado}`;

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-20 sm:right-6 z-40 flex items-center group">
      {/* Tooltip discreto al hacer hover */}
      <div
        className={`mr-2.5 px-3 py-1.5 bg-[#0b1c30] text-white text-[11px] font-semibold rounded-xl shadow-lg border border-white/10 whitespace-nowrap transition-all duration-200 pointer-events-none ${
          isHovered
            ? 'opacity-100 translate-x-0'
            : 'opacity-0 translate-x-2'
        }`}
      >
        <span>¿Necesitas ayuda? Soporte IDIEM</span>
      </div>

      {/* Botón flotante WhatsApp */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center justify-center shadow-[0_4px_16px_rgba(37,211,102,0.35)] hover:shadow-[0_6px_20px_rgba(37,211,102,0.5)] transition-all duration-300 active:scale-95 cursor-pointer relative"
        title="Contactar soporte vía WhatsApp (+569 87567519)"
        aria-label="Contactar soporte WhatsApp"
      >
        {/* SVG Oficial de WhatsApp */}
        <svg
          className="w-6 h-6 sm:w-7 sm:h-7 fill-current"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.507 14.307l-.009.075c-.239.873-.834 1.62-1.636 2.053-.701.378-1.579.544-2.482.351-.839-.179-2.025-.722-3.411-2.107-1.385-1.385-1.928-2.571-2.107-3.41-.193-.903-.027-1.781.351-2.482.433-.802 1.18-1.397 2.053-1.636l.075-.009c.28-.035.567.042.787.214l1.32 1.032c.328.256.452.697.303 1.077l-.462 1.18c-.069.176-.046.376.062.531.428.614 1.034 1.22 1.648 1.648.155.108.355.131.531.062l1.18-.462c.38-.149.821-.025 1.077.303l1.032 1.32c.172.22.249.507.214.787z" />
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.055 21.4c-.114.377.22.711.597.597l4.232-1.383C8.34 21.475 10.11 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.643 0-3.177-.478-4.476-1.303a.625.625 0 00-.458-.084l-3.328 1.088 1.088-3.328a.625.625 0 00-.084-.458C3.922 14.623 3.444 13.089 3.444 11.444 3.444 6.72 7.276 2.889 12 2.889s8.556 3.831 8.556 8.555C20.556 16.169 16.724 20 12 20z" />
        </svg>

        {/* Punto verde de conexión activa */}
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 border-2 border-white rounded-full" />
      </a>
    </div>
  );
};

export default SoporteWhatsAppButton;
