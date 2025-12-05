const { Jimp } = require('jimp')
const MIME_PNG = 'image/png'

const width = 72
const height = 72
const steps = 50 // Number of cached steps

// Cache structure
const cache = {
	stereoLeft: [],  // Stereo on left side (10px total: 4px L, 2px gap, 4px R)
	stereoRight: [], // Stereo on right side (10px total: 4px L, 2px gap, 4px R)
	full: []         // Stereo full (split in middle)
}

async function generateCache() {
	// Initialize 2D arrays for stereo
	for (let i = 0; i <= steps; i++) {
		cache.stereoLeft[i] = []
		cache.stereoRight[i] = []
		cache.full[i] = []
	}

	// Helper to get color based on position (vertical gradient)
	const getColor = (y) => {
		// Vertical gradient (Bottom to Top)
		const h = (height - 1 - y) / height
		if (h > 0.85) return 0xFF0000FF // Red
		if (h > 0.60) return 0xFFFF00FF // Yellow
		return 0x00FF00FF // Green
	}

	const borderColor = 0x666666FF
	const bgColor = 0x000000FF

	// Helper to draw a bordered bar
	const drawBar = (img, x, w, level) => {
		// Draw Border
		for (let by = 0; by < height; by++) {
			for (let bx = x; bx < x + w; bx++) {
				// Border logic: edges of the rect
				if (bx === x || bx === x + w - 1 || by === 0 || by === height - 1) {
					img.setPixelColor(borderColor, bx, by)
				} else {
					img.setPixelColor(bgColor, bx, by)
				}
			}
		}

		// Draw Level
		// Inner area: x+1, y+1, w-2, h-2
		const innerH = height - 2
		const barH = Math.floor(level * innerH)
		
		if (barH > 0) {
			const yStart = (height - 1) - barH
			for (let y = yStart; y < height - 1; y++) {
				const color = getColor(y)
				for (let bx = x + 1; bx < x + w - 1; bx++) {
					img.setPixelColor(color, bx, y)
				}
			}
		}
	}

	// Generate cached images
	for (let i = 0; i <= steps; i++) {
		const level = i / steps
		
		// --- STEREO GENERATION (Nested Loop) ---
		// We only generate stereo for i (Left) against all j (Right)
		for (let j = 0; j <= steps; j++) {
			const levelL = i / steps
			const levelR = j / steps

			// STEREO LEFT (Left side 10px: L(4px) Gap(2px) R(4px))
			{
				const img = new Jimp({ width: width, height: height, color: 0x00000000 })
				const xBase = 0
				
				drawBar(img, xBase, 4, levelL)
				drawBar(img, xBase + 6, 4, levelR)
				
				cache.stereoLeft[i][j] = await img.getBuffer(MIME_PNG)
			}

			// STEREO RIGHT (Right side 10px: L(4px) Gap(2px) R(4px))
			{
				const img = new Jimp({ width: width, height: height, color: 0x00000000 })
				const xBase = width - 10
				
				drawBar(img, xBase, 4, levelL)
				drawBar(img, xBase + 6, 4, levelR)

				cache.stereoRight[i][j] = await img.getBuffer(MIME_PNG)
			}

			// STEREO FULL (Centered, narrower bars)
			// Left Bar: x=23, w=12 (Inner 10px)
			// Right Bar: x=37, w=12 (Inner 10px)
			{
				const img = new Jimp({ width: width, height: height, color: 0x00000000 })
				
				drawBar(img, 23, 12, levelL)
				drawBar(img, 37, 12, levelR)

				cache.full[i][j] = await img.getBuffer(MIME_PNG)
			}
		}
	}
}

// Start generation immediately
generateCache()
	.then(() => console.log('Meter cache generated successfully'))
	.catch(err => console.error('Error generating meter cache:', err))

module.exports = {
	getMeterPng: async function (levelL, levelR, position = 'stereoRight') {
		// Clamp levels
		if (levelL < 0) levelL = 0
		if (levelL > 1) levelL = 1
		if (levelR < 0) levelR = 0
		if (levelR > 1) levelR = 1

		const idxL = Math.floor(levelL * steps)
		const idxR = Math.floor(levelR * steps)

		if (position === 'stereoLeft') {
			if (cache.stereoLeft[idxL]) return cache.stereoLeft[idxL][idxR]
		} else if (position === 'stereoRight') {
			if (cache.stereoRight[idxL]) return cache.stereoRight[idxL][idxR]
		} else if (position === 'full') {
			if (cache.full[idxL]) return cache.full[idxL][idxR]
		} else {
			// Default to stereoRight
			if (cache.stereoRight[idxL]) return cache.stereoRight[idxL][idxR]
		}
		return null
	}
}

