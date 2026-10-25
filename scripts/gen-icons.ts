import sharp from 'sharp';

const src = 'apps/web/public/brand/logo-mark.png';
const out = 'apps/web/public/icons';

async function main() {
  const meta = await sharp(src).metadata();

  await Promise.all([
    sharp(src).resize(32, 32).png().toFile(`${out}/favicon-32.png`),
    sharp(src).resize(180, 180).png().toFile(`${out}/apple-touch-180.png`),
    sharp(src).resize(192, 192).png().toFile(`${out}/pwa-192.png`),
    sharp(src).resize(512, 512).png().toFile(`${out}/pwa-512.png`),
    sharp(src)
      .resize(410, 410, { fit: 'contain', background: { r: 245, g: 241, b: 234, alpha: 1 } })
      .flatten({ background: { r: 245, g: 241, b: 234, alpha: 1 } })
      .png()
      .toFile(`${out}/maskable-512.png`),
  ]);

  console.log('icons generated from', src, `${meta.width}x${meta.height}`);
}

void main();

