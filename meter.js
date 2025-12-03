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
				
				// Left Channel Bar (4px wide)
				const barHL = Math.floor(levelL * height)
				if (barHL > 0) {
					const yStart = height - barHL
					for (let y = yStart; y < height; y++) {
						const color = getColor(y)
						for (let x = xBase; x < xBase + 4; x++) {
							img.setPixelColor(color, x, y)
						}
					}
				}

				// Right Channel Bar (4px wide, offset by 6px)
				const barHR = Math.floor(levelR * height)
				if (barHR > 0) {
					const yStart = height - barHR
					for (let y = yStart; y < height; y++) {
						const color = getColor(y)
						for (let x = xBase + 6; x < xBase + 10; x++) {
							img.setPixelColor(color, x, y)
						}
					}
				}
				cache.stereoLeft[i][j] = await img.getBuffer(MIME_PNG)
			}

			// STEREO RIGHT (Right side 10px: L(4px) Gap(2px) R(4px))
			{
				const img = new Jimp({ width: width, height: height, color: 0x00000000 })
				const xBase = width - 10
				
				// Left Channel Bar (4px wide)
				const barHL = Math.floor(levelL * height)
				if (barHL > 0) {
					const yStart = height - barHL
					for (let y = yStart; y < height; y++) {
						const color = getColor(y)
						for (let x = xBase; x < xBase + 4; x++) {
							img.setPixelColor(color, x, y)
						}
					}
				}

				// Right Channel Bar (4px wide, offset by 6px)
				const barHR = Math.floor(levelR * height)
				if (barHR > 0) {
					const yStart = height - barHR
					for (let y = yStart; y < height; y++) {
						const color = getColor(y)
						for (let x = xBase + 6; x < xBase + 10; x++) {
							img.setPixelColor(color, x, y)
						}
					}
				}
				cache.stereoRight[i][j] = await img.getBuffer(MIME_PNG)
			}

			// STEREO FULL (Split middle: L(35px) Gap(2px) R(35px))
			{
				const img = new Jimp({ width: width, height: height, color: 0x00000000 })
				
				// Left Channel
				const barHL = Math.floor(levelL * height)
				if (barHL > 0) {
					const yStart = height - barHL
					for (let y = yStart; y < height; y++) {
						const color = getColor(y)
						for (let x = 0; x < 35; x++) {
							img.setPixelColor(color, x, y)
						}
					}
				}

				// Right Channel
				const barHR = Math.floor(levelR * height)
				if (barHR > 0) {
					const yStart = height - barHR
					for (let y = yStart; y < height; y++) {
						const color = getColor(y)
						for (let x = 37; x < 72; x++) {
							img.setPixelColor(color, x, y)
						}
					}
				}
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

