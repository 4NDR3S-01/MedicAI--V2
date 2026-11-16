export const SITE_URL = "https://medicai.lat";

// Mientras la app no esté en Google Play se instala con el APK de producción
// (build `production` de EAS). Se publica como archivo `MedicAI.apk` en un
// release de GitHub: `latest/download` siempre apunta al release más reciente,
// así que al subir una versión nueva no hay que tocar la web.
// Cuando salga en Play: https://play.google.com/store/apps/details?id=com.william20.medicai
export const APK_URL = "https://github.com/4NDR3S-01/MedicAI--V2/releases/latest/download/MedicAI.apk";

// Página con el botón del APK y los pasos para instalarlo.
export const DOWNLOAD_PATH = "/descargar";

export const SUPPORT_EMAIL = "soporte@medicai.lat";

// Preferencia «texto grande» (localStorage). La lee también el script de layout.tsx.
export const TEXT_SIZE_KEY = "medicai_text_size";
