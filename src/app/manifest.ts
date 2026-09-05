import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Unicall Blue - Operaciones de Call Center",
    short_name: "Unicall Blue",
    description:
      "Unicall Blue centraliza ventas, rechazos, jornadas, operadores y reportes de call center.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#1d4ed8",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-512-v3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512-v3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}