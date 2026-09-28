<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/aca5c3f5-cc2d-40df-8bcf-036dba508306

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## OCR de comprobantes

El flujo de lectura usa un único endpoint interno: `POST /api/ocr`.

- El navegador puede tomar una foto desde celular o seleccionar/arrastrar una imagen desde PC.
- La imagen se envía al servidor Express.
- El servidor consulta Gemini Vision usando `GEMINI_API_KEY`, que nunca se expone al navegador.
- La respuesta contiene únicamente datos realmente detectados; no se generan RUT, folios ni montos ficticios.
- Los campos dudosos quedan marcados para revisión manual.
- El RUT se valida con Módulo 11 y los montos se comprueban cuando existen Neto + IVA + Total.

### Variables de entorno

Configura `GEMINI_API_KEY` en `.env.local` o en las variables de entorno del servidor. Opcionalmente puedes definir `GEMINI_MODEL` (por defecto `gemini-2.5-flash`).

**Importante:** no uses `VITE_GEMINI_API_KEY`, `VITE_GROQ_API_KEY` ni `VITE_OPENROUTER_API_KEY`. Las claves de IA deben permanecer del lado servidor.
