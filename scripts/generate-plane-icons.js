/**
 * Script to generate plane PNG icons from SVG
 * 
 * Usage:
 *   node scripts/generate-plane-icons.js
 * 
 * Requires: sharp (install with: npm install sharp --save-dev)
 * Or: Use the HTML generator at /public/icons/generate-pngs.html
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, '..', 'public', 'icons');

const leaderSVG = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="leaderGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4f46e5;stop-opacity:1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <ellipse cx="128" cy="128" rx="8" ry="60" fill="url(#leaderGrad)" filter="url(#glow)"/>
  <ellipse cx="128" cy="128" rx="45" ry="12" fill="url(#leaderGrad)" opacity="0.9"/>
  <path d="M 128 68 L 115 85 L 128 85 Z" fill="url(#leaderGrad)" opacity="0.9"/>
  <ellipse cx="128" cy="88" rx="5" ry="15" fill="#818cf8" opacity="0.6"/>
  <circle cx="100" cy="125" r="4" fill="#1e293b"/>
  <circle cx="156" cy="125" r="4" fill="#1e293b"/>
</svg>`;

const followerSVG = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="followerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#8b5cf6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7c3aed;stop-opacity:1" />
    </linearGradient>
    <filter id="glow2">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <ellipse cx="128" cy="128" rx="7" ry="55" fill="url(#followerGrad)" filter="url(#glow2)"/>
  <ellipse cx="128" cy="128" rx="40" ry="11" fill="url(#followerGrad)" opacity="0.9"/>
  <path d="M 128 72 L 117 86 L 128 86 Z" fill="url(#followerGrad)" opacity="0.9"/>
  <ellipse cx="128" cy="92" rx="4" ry="14" fill="#a78bfa" opacity="0.6"/>
  <circle cx="100" cy="126" r="3.5" fill="#1e293b"/>
  <circle cx="156" cy="126" r="3.5" fill="#1e293b"/>
</svg>`;

async function generateWithSharp() {
  try {
    const sharp = (await import('sharp')).default;
    
    // Ensure icons directory exists
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir, { recursive: true });
    }

    // Generate leader icon
    const leaderBuffer = Buffer.from(leaderSVG);
    await sharp(leaderBuffer)
      .png()
      .toFile(path.join(iconsDir, 'plane_leader.png'));
    console.log('✓ Generated plane_leader.png');

    // Generate follower icon
    const followerBuffer = Buffer.from(followerSVG);
    await sharp(followerBuffer)
      .png()
      .toFile(path.join(iconsDir, 'plane_follower.png'));
    console.log('✓ Generated plane_follower.png');

    console.log('\n✅ All icons generated successfully!');
    console.log(`📁 Icons saved to: ${iconsDir}`);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('❌ Error: sharp package not found.');
      console.log('\n📦 Install it with: npm install sharp --save-dev');
      console.log('\n🌐 Alternative: Use the HTML generator at /public/icons/generate-pngs.html');
      process.exit(1);
    } else {
      throw error;
    }
  }
}

// Try to use sharp, fallback to instructions
generateWithSharp().catch((error) => {
  console.error('❌ Error generating icons:', error.message);
  console.log('\n💡 Alternative options:');
  console.log('   1. Install sharp: npm install sharp --save-dev');
  console.log('   2. Use HTML generator: open /public/icons/generate-pngs.html in browser');
  console.log('   3. Convert SVG to PNG using any image editor');
  process.exit(1);
});
