import sharp from 'sharp';

// White background / black text on purpose - this is meant to be sent to a
// physical printer, not viewed in the app's dark theme.
export async function generatePickupLabel(pickupId: string, assignedToName: string): Promise<Buffer> {
  const width = 400;
  const height = 250;
  const shortId = pickupId.slice(0, 8).toUpperCase();
  const timestamp = new Date().toLocaleString();

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="white" stroke="black" stroke-width="2"/>
      <text x="20" y="35" font-family="sans-serif" font-weight="700" font-size="20" fill="black">PICKUP LABEL</text>
      <line x1="20" y1="50" x2="${width - 20}" y2="50" stroke="black" stroke-width="1"/>
      <text x="20" y="95" font-family="monospace" font-weight="700" font-size="32" fill="black">#${shortId}</text>
      <text x="20" y="135" font-family="sans-serif" font-size="18" fill="black">Assigned to: ${assignedToName}</text>
      <text x="20" y="165" font-family="sans-serif" font-size="14" fill="black">${timestamp}</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
