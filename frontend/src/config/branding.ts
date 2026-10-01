/**
 * Branding del restaurante para el frontend.
 *
 * Los valores DEFAULT viven aquí. El script `personalizar.py` (raíz del proyecto)
 * los reescribe automáticamente leyendo `restaurant.config.json`.
 *
 * En tiempo de ejecución, el backend también expone /api/v1/system/branding,
 * que sobreescribe estos defaults si el cliente quiere editar nombre/NIT/etc.
 * desde el panel sin reconstruir el frontend.
 */

export const BRANDING = {
  // ─── Identidad ─────────────────────────────────────────────
  name: "Rancho La Kamelia",
  shortName: "Kamelia",
  tagline: "¡Sabor, parrilla y un buen trago... así se vive el Rancho!",

  // ─── Datos fiscales / contacto ─────────────────────────────
  nit: "900000000-0",
  phone: "3125833249",
  address: "Rancho La Kamelia",
  city: "Cundinamarca",
  country: "Colombia",
  currencySymbol: "$",

  // ─── Login defaults (autocompletado del campo email) ───────
  emailDomain: "rancholakamelia.com",
  get adminEmailPlaceholder() {
    return `admin@${this.emailDomain}`
  },

  // ─── Assets ────────────────────────────────────────────────
  logoPath: "/logos/logo.jpg",
  faviconPath: "/favicon.png",

  // ─── Textos UI ─────────────────────────────────────────────
  watermarkText: "RANCHO LA KAMELIA",
  kitchenBannerText: "COCINA — RANCHO LA KAMELIA",

  // ─── Licencia (footer/factura) ─────────────────────────────
  licenseClient: "Rancho La Kamelia",
  licenseContact: "Software Titanova - 3013896861",
} as const

export type Branding = typeof BRANDING
