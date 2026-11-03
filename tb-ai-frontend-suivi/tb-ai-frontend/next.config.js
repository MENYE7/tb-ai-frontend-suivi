/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // onnxruntime-web expose plusieurs variantes de build (browser/node) ;
    // laisser webpack l'empaqueter provoque une erreur de parsing sur son
    // fichier ort.node.min.mjs (variante Node, jamais censée être bundlée
    // pour le navigateur). Solution officiellement recommandée par le
    // paquet lui-même (cf. son README) : le déclarer externe et le
    // charger via un <script> CDN (window.ort global), pas via import —
    // exactement l'approche déjà validée dans l'outil HTML autonome.
    config.externals = config.externals || [];
    config.externals.push({ "onnxruntime-web": "ort" });
    return config;
  },
};
module.exports = nextConfig;
