const { combineRgb } = require('@companion-module/base')
const { getMeterPng } = require('./meter')

// ============================================================
// FEEDBACK DEFINITIONS
// ============================================================

module.exports = async function (self) {
	self.setFeedbackDefinitions({

		// ============================================================
		// CLIP FEEDBACKS
		// ============================================================

		clip_color: {
			type: 'advanced',
			name: 'Clip Color',
			description: 'Change button color to match Ableton Clip Color',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					required: true,
					minChoicesForSearch: 0
				}
			],
			callback: (feedback) => {
				const [trackStr, clipStr] = feedback.options.clipId.split('_')
				const track = parseInt(trackStr)
				const clip = parseInt(clipStr)
				const color = self.clipColors[`${track}_${clip}`]
				
				if (color !== undefined) {
					return { bgcolor: color }
				}
				return {}
			}
		},

		clip_playing: {
			type: 'boolean',
			name: 'Clip Playing (Blink)',
			description: 'Blinks when clip is playing',
			defaultStyle: {
				bgcolor: combineRgb(0, 0, 0),
				color: combineRgb(255, 255, 255)
			},
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					required: true,
					minChoicesForSearch: 0
				}
			],
			callback: (feedback) => {
				const [trackStr, clipStr] = feedback.options.clipId.split('_')
				const track = parseInt(trackStr)
				const clip = parseInt(clipStr)
				const isPlaying = self.clipPlaying[`${track}_${clip}`] === true || self.clipPlaying[`${track}_${clip}`] === 1
				return isPlaying && self.blinkState
			}
		},

		clip_warping: {
			type: 'boolean',
			name: 'Clip Warping',
			description: 'Change color when clip warping is enabled',
			defaultStyle: {
				bgcolor: combineRgb(255, 173, 86)
			},
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					required: true,
					minChoicesForSearch: 0
				}
			],
			callback: (feedback) => {
				const [trackStr, clipStr] = feedback.options.clipId.split('_')
				const track = parseInt(trackStr)
				const clip = parseInt(clipStr)
				const varId = `clip_warping_${track}_${clip}`
				return self.getVariableValue(varId) === 'On'
			}
		},

		clip_looping: {
			type: 'boolean',
			name: 'Clip Looping',
			description: 'Change color when clip looping is enabled',
			defaultStyle: {
				bgcolor: combineRgb(255, 173, 86)
			},
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					required: true,
					minChoicesForSearch: 0
				}
			],
			callback: (feedback) => {
				const [trackStr, clipStr] = feedback.options.clipId.split('_')
				const track = parseInt(trackStr)
				const clip = parseInt(clipStr)
				const varId = `clip_looping_${track}_${clip}`
				return self.getVariableValue(varId) === 'On'
			}
		},

		// ============================================================
		// TRACK FEEDBACKS
		// ============================================================

		track_meter: {
			type: 'boolean',
			name: 'Track Meter Level',
			description: 'Change color if track level is above threshold',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0)
			},
			options: [
				{
					type: 'dropdown',
					label: 'Track',
					id: 'track',
					choices: self.trackChoices,
					default: self.trackChoices[0].id,
					required: true
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

		track_mute: {
			type: 'boolean',
			name: 'Track Mute',
			description: 'Change color if track is muted',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0)
			},
			options: [
				{
					type: 'dropdown',
					label: 'Track',
					id: 'track',
					choices: self.trackChoices,
					default: self.trackChoices[0].id,
					required: true
				}
			],
			callback: (feedback) => {
				const track = feedback.options.track
				return self.trackMutes[track] === true || self.trackMutes[track] === 1
			}
		},

		track_meter_visual: {
			type: 'advanced',
			name: 'Track Meter Visual',
			description: 'Show a visual meter bar on the button',
			options: [
				{
					type: 'dropdown',
					label: 'Track',
					id: 'track',
					choices: self.trackChoices,
					default: self.trackChoices[0].id,
					required: true
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
				
				const pngBuffer = await getMeterPng(levelL, levelR, position)
				
				if (pngBuffer) {
					return { png64: pngBuffer.toString('base64') }
				}
				return {}
			}
		},

		// ============================================================
		// DEVICE FEEDBACKS
		// ============================================================

		device_active: {
			type: 'boolean',
			name: 'Device (Plugin) Active',
			description: 'Change color if device parameter is active (> 0.5)',
			defaultStyle: {
				bgcolor: combineRgb(0, 255, 0),
				color: combineRgb(0, 0, 0)
			},
			options: [
				{
					type: 'dropdown',
					label: 'Parameter (Scan project first)',
					id: 'parameterId',
					choices: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters : [{ id: '0_0_0', label: 'No parameters found' }],
					default: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters[0].id : '0_0_0',
					minChoicesForSearch: 0
				}
			],
			callback: (feedback) => {
				if (!feedback.options.parameterId || feedback.options.parameterId === '0_0_0') return false
				const value = self.deviceParameters[feedback.options.parameterId]
				return value > 0.5
			}
		},

		selected_parameter_active: {
			type: 'boolean',
			name: 'Selected Parameter Active',
			description: 'Change color if this parameter is currently selected for control',
			defaultStyle: {
				bgcolor: combineRgb(255, 165, 0)
			},
			options: [
				{
					type: 'dropdown',
					label: 'Parameter',
					id: 'parameterId',
					choices: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters : [{ id: '0_0_0', label: 'No parameters found' }],
					default: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters[0].id : '0_0_0',
					minChoicesForSearch: 0
				}
			],
			callback: (feedback) => {
				if (!self.selectedParameter || !feedback.options.parameterId) return false
				
				const [track, device, parameter] = feedback.options.parameterId.split('_').map(Number)
				
				return (
					self.selectedParameter.track === track &&
					self.selectedParameter.device === device &&
					self.selectedParameter.parameter === parameter
				)
			}
		}
	})
}
