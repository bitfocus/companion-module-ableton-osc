const { combineRgb } = require('@companion-module/base')
const { getMeterPng } = require('./meter')

module.exports = async function (self) {
	self.setFeedbackDefinitions({
		clip_color: {
			type: 'advanced',
			name: 'Clip Color',
			description: 'Change button color to match Ableton Clip Color',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					default: 1,
					min: 1
				},
				{
					type: 'number',
					label: 'Clip Index',
					id: 'clip',
					default: 1,
					min: 1
				}
			],
			callback: (feedback) => {
				const track = feedback.options.track
				const clip = feedback.options.clip
				const color = self.clipColors[`${track}_${clip}`]
				
				if (color !== undefined) {
					// Ableton color is likely an integer. 
					// If it's a standard RGB int (0xRRGGBB), we can use it directly if we mask alpha.
					// Or it might be a color index. 
					// For this implementation, we assume it's a raw RGB integer or we might need to process it.
					// If it's a signed int (Java/Processing style), we might need to convert.
					
					// Let's assume it's a standard RGB integer for now.
					return { bgcolor: color }
				}
				return {}
			}
		},
		track_meter: {
			type: 'boolean',
			name: 'Track Meter Level',
			description: 'Change color if track level is above threshold',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0)
			},
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					default: 1,
					min: 1
				},
				{
					type: 'number',
					label: 'Threshold (0.0 - 1.0)',
					id: 'threshold',
					default: 0.8,
					step: 0.01
				}
			],
			callback: (feedback) => {
				const track = feedback.options.track
				const level = self.trackLevels[track] || 0
				return level >= feedback.options.threshold
			}
		},
		track_meter_visual: {
			type: 'advanced',
			name: 'Track Meter Visual',
			description: 'Show a visual meter bar on the button',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					default: 1,
					min: 1
				},
				{
					type: 'dropdown',
					label: 'Position',
					id: 'position',
					default: 'stereoRight',
					choices: [
						{ id: 'stereoRight', label: 'Right Bar (Stereo)' },
						{ id: 'stereoLeft', label: 'Left Bar (Stereo)' },
						{ id: 'full', label: 'Full Button (Stereo)' }
					]
				}
			],
			callback: async (feedback) => {
				const track = feedback.options.track
				const position = feedback.options.position || 'stereoRight'
				
				const levelL = self.trackLevelsLeft[track] || 0
				const levelR = self.trackLevelsRight[track] || 0
				
				// self.log('info', `Feedback check: Track ${track} Level ${level} Position ${position}`)
				// if (Math.random() < 0.05) {
				// 	self.log('info', `Feedback render: Track ${track} L:${levelL} R:${levelR} Pos ${position}`)
				// }

				const pngBuffer = await getMeterPng(levelL, levelR, position)
				
				if (pngBuffer) {
					return {
						png64: pngBuffer.toString('base64'),
						bgcolor: combineRgb(0, 0, 0) // Ensure black background
					}
				}
				return {}
			}
		}
	})
}
