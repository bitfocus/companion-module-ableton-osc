module.exports = function (self) {
	self.setActionDefinitions({
		fire_clip: {
			name: 'Fire Clip',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Clip Index',
					id: 'clip',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const clip = event.options.clip - 1
				self.sendOsc('/live/clip_slot/fire', [
					{
						type: 'i',
						value: track
					},
					{
						type: 'i',
						value: clip
					}
				])
			}
		},
		stop_clip: {
			name: 'Stop Clip',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Clip Index',
					id: 'clip',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const clip = event.options.clip - 1
				self.sendOsc('/live/clip/stop', [
					{
						type: 'i',
						value: track
					},
					{
						type: 'i',
						value: clip
					}
				])
			}
		},
		stop_track: {
			name: 'Stop Track',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				self.sendOsc('/live/track/stop_all_clips', [
					{
						type: 'i',
						value: track
					}
				])
			}
		},
		fade_stop_clip: {
			name: 'Fade Out and Stop Clip',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Clip Index',
					id: 'clip',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Duration (ms)',
					id: 'duration',
					min: 100,
					max: 60000,
					default: 3500,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const clip = event.options.clip - 1
				const duration = event.options.duration

				const id = `clip_${track}_${clip}`
				
				// Initialize fade state
				if (!self.activeFades) self.activeFades = {}
				
				self.activeFades[id] = {
					type: 'clip',
					direction: 'out',
					track,
					clip,
					duration,
					startTime: Date.now(),
					state: 'init'
				}

				// Request current gain to start the process
				self.sendOsc('/live/clip/get/gain', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		fade_fire_clip: {
			name: 'Fade In and Fire Clip',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Clip Index',
					id: 'clip',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Duration (ms)',
					id: 'duration',
					min: 100,
					max: 60000,
					default: 3500,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const clip = event.options.clip - 1
				const duration = event.options.duration

				const id = `clip_${track}_${clip}`
				
				if (!self.activeFades) self.activeFades = {}
				
				self.activeFades[id] = {
					type: 'clip',
					direction: 'in',
					track,
					clip,
					duration,
					startTime: Date.now(),
					state: 'init'
				}

				self.sendOsc('/live/clip/get/gain', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		fade_stop_track: {
			name: 'Fade Out and Stop Track',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Duration (ms)',
					id: 'duration',
					min: 100,
					max: 60000,
					default: 3500,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const duration = event.options.duration

				const id = `track_${track}`
				
				if (!self.activeFades) self.activeFades = {}
				
				self.activeFades[id] = {
					type: 'track',
					direction: 'out',
					track,
					duration,
					startTime: Date.now(),
					state: 'init'
				}

				self.sendOsc('/live/track/get/volume', [
					{ type: 'i', value: track }
				])
			}
		},
		fade_in_track: {
			name: 'Fade In Track Volume',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Duration (ms)',
					id: 'duration',
					min: 100,
					max: 60000,
					default: 3500,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const duration = event.options.duration

				const id = `track_${track}`
				
				if (!self.activeFades) self.activeFades = {}
				
				self.activeFades[id] = {
					type: 'track',
					direction: 'in',
					track,
					duration,
					startTime: Date.now(),
					state: 'init'
				}

				self.sendOsc('/live/track/get/volume', [
					{ type: 'i', value: track }
				])
			}
		},
		fade_track_toggle: {
			name: 'Fade Track by State (Variable)',
			options: [
				{
					type: 'textinput',
					label: 'State (True/False)',
					id: 'state',
					default: 'false',
					useVariables: true
				},
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Duration In (ms)',
					id: 'duration_in',
					min: 100,
					max: 60000,
					default: 2000,
					required: true
				},
				{
					type: 'number',
					label: 'Duration Out (ms)',
					id: 'duration_out',
					min: 100,
					max: 60000,
					default: 3500,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				
				// Parse state
				let state = await self.parseVariablesInString(event.options.state)
				if (typeof state === 'string') {
					state = state.toLowerCase().trim()
				}
				
				const isTrue = (state === 'true' || state === '1' || state === 'on')
				const direction = isTrue ? 'in' : 'out'
				const duration = isTrue ? event.options.duration_in : event.options.duration_out

				const id = `track_${track}`
				
				if (!self.activeFades) self.activeFades = {}

				// Check for existing fade to interrupt
				const existingFade = self.activeFades[id]
				let targetVolume = undefined

				if (existingFade) {
					if (existingFade.interval) {
						clearInterval(existingFade.interval)
					}
					// If we interrupt, we try to preserve the peak volume
					// If interrupting a Fade Out, startValue was the peak.
					// If interrupting a Fade In, startValue was the peak.
					targetVolume = existingFade.startValue
				}
				
				self.activeFades[id] = {
					type: 'track',
					subtype: 'toggle',
					direction: direction,
					track,
					duration,
					startTime: Date.now(),
					state: 'init',
					stopClips: false,
					targetVolume: targetVolume
				}

				self.sendOsc('/live/track/get/volume', [
					{ type: 'i', value: track }
				])
			}
		},
		refresh_clip_info: {
			name: 'Refresh Clip Info',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Clip Index',
					id: 'clip',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const clip = event.options.clip - 1
				
				// Request Name
				self.sendOsc('/live/clip/get/name', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])

				// Request Color
				self.sendOsc('/live/clip/get/color', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		scan_project: {
			name: 'Scan Project',
			options: [],
			callback: async (event) => {
				self.sendOsc('/live/song/get/num_tracks', [])
				self.sendOsc('/live/song/get/num_scenes', [])
			}
		}
	})
}
