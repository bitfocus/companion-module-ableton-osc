const { Jimp } = require('jimp')
const MIME_PNG = 'image/png'

const width = 72
const height = 72
const steps = 20 // Reduced for performance (still smooth enough)

// Lazy cache - images are generated on first request only
const cache = {
	stereoLeft: {},
	stereoRight: {},
	full: {}
}

// Helper to get color based on position (vertical gradient)
const getColor = (y) => {
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
			if (bx === x || bx === x + w - 1 || by === 0 || by === height - 1) {
				img.setPixelColor(borderColor, bx, by)
			} else {
				img.setPixelColor(bgColor, bx, by)
			}
		}
	}

	// Draw Level
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

// Generate a single meter image on demand
async function generateMeter(idxL, idxR, position) {
	const levelL = idxL / steps
	const levelR = idxR / steps
	
	const img = new Jimp({ width: width, height: height, color: 0x00000000 })
	
	if (position === 'stereoLeft') {
		drawBar(img, 0, 4, levelL)
		drawBar(img, 6, 4, levelR)
	} else if (position === 'stereoRight') {
		const xBase = width - 10
		drawBar(img, xBase, 4, levelL)
		drawBar(img, xBase + 6, 4, levelR)
	} else if (position === 'full') {
		drawBar(img, 23, 12, levelL)
		drawBar(img, 37, 12, levelR)
	}
	
	return await img.getBuffer(MIME_PNG)
}

module.exports = {
	getMeterPng: async function (levelL, levelR, position = 'stereoRight') {
		// Clamp levels
		if (levelL < 0) levelL = 0
		if (levelL > 1) levelL = 1
		if (levelR < 0) levelR = 0
		if (levelR > 1) levelR = 1

		const idxL = Math.floor(levelL * steps)
		const idxR = Math.floor(levelR * steps)
		const key = `${idxL}_${idxR}`
		
		// Select the right cache based on position
		let posCache
		if (position === 'stereoLeft') {
			posCache = cache.stereoLeft
		} else if (position === 'full') {
			posCache = cache.full
		} else {
			posCache = cache.stereoRight
		}
		
		// Generate on demand if not cached
		if (!posCache[key]) {
			posCache[key] = await generateMeter(idxL, idxR, position)
		}
		
		return posCache[key]
	}
}

