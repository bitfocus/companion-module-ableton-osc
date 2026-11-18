module.exports = function (self) {
	/**
	 * Expose a device parameter as a variable and subscribe to its value so it stays current.
	 * Indexes are 0-based, matching what AbletonOSC expects on the wire.
	 */
	const monitorDeviceParameter = (paramId, track, device, parameter) => {
		const varId = `device_param_${track + 1}_${device + 1}_${parameter + 1}`
		if (self.monitoredDeviceParameters.has(varId)) return

		self.monitoredDeviceParameters.add(varId)

		const paramObj = self.knownParameters.find((p) => p.id === paramId)
		const paramName = paramObj ? paramObj.label : `Device Param ${track + 1}-${device + 1}-${parameter + 1}`
		self.checkVariableDefinition(varId, paramName)

		self.listenToDeviceParameter(track, device, parameter)
	}

	self.setActionDefinitions({
		fire_clip: {
			name: 'Clip - Fire',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				
				// Cancel any active fade out on this track
				self.cancelFadeOutOnTrack(track)
				
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
			name: 'Clip - Stop',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
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
			name: 'Track - Stop',
			options: [
				{
					type: 'dropdown',
					label: 'Track',
					id: 'track',
					choices: self.trackChoices,
					default: self.trackChoices[0].id
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
		mute_track: {
			name: 'Track - Mute',
			options: [
				{
					type: 'dropdown',
					label: 'Track',
					id: 'track',
					choices: self.trackChoices,
					default: self.trackChoices[0].id
				},
				{
					type: 'dropdown',
					label: 'Mute State',
					id: 'mute',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'on', label: 'Mute' },
						{ id: 'off', label: 'Unmute' }
					]
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				let mute = event.options.mute
				
				if (mute === 'toggle') {
					// trackMutes is keyed 1-based and kept current by the /live/track/start_listen/mute subscription
					const current = self.trackMutes[event.options.track]
					mute = current ? 'off' : 'on'
				}
				
				const val = mute === 'on' ? 1 : 0
				
				self.sendOsc('/live/track/set/mute', [
					{
						type: 'i',
						value: track
					},
					{
						type: 'i',
						value: val
					}
				])
			}
		},
		device_toggle: {
			name: 'Device - Toggle',
			options: [
				{
					type: 'dropdown',
					label: 'Device',
					id: 'device',
					choices: self.deviceChoices,
					default: self.deviceChoices[0].id
				},
				{
					type: 'number',
					label: 'Parameter Index (Default 1 = On/Off)',
					id: 'parameter',
					min: 1,
					max: 1000,
					default: 1
				},
				{
					type: 'dropdown',
					label: 'State',
					id: 'state',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' }
					]
				}
			],
			callback: async (event) => {
				const [trackStr, deviceStr] = event.options.device.split('_')
				const track = parseInt(trackStr) - 1
				const device = parseInt(deviceStr) - 1
				const parameter = event.options.parameter - 1
				let state = event.options.state
				
				// Toggling reads the cached value, so re-arm the subscription on every press:
				// without it a listener Live has dropped leaves the cache frozen and the toggle
				// only ever works once
				self.listenToDeviceParameter(track, device, parameter, { force: true })

				if (state === 'toggle') {
					const current = self.deviceParameters[`${track + 1}_${device + 1}_${parameter + 1}`]
					// Default to 0 if value unknown
					const currentVal = current !== undefined ? current : 0
					state = currentVal > 0.5 ? 'off' : 'on'
				}
				
				const val = state === 'on' ? 1.0 : 0.0
				
				self.sendOsc('/live/device/set/parameter/value', [
					{ type: 'i', value: track },
					{ type: 'i', value: device },
					{ type: 'i', value: parameter },
					{ type: 'f', value: val }
				])
			}
		},
		device_set_parameter: {
			name: 'Device - Set Parameter Value',
			options: [
				{
					type: 'dropdown',
					label: 'Parameter (Scan project first)',
					id: 'parameterId',
					choices: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters : [{ id: '0_0_0', label: 'No parameters found - Scan Project' }],
					default: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters[0].id : '0_0_0',
					minChoicesForSearch: 0
				},
				{
					type: 'textinput',
					label: 'Value (0-100)',
					id: 'value',
					default: '50'
				},
				{
					type: 'checkbox',
					label: 'Create Variable for this parameter?',
					id: 'create_variable',
					default: false
				}
			],
			callback: async (event) => {
				const paramId = event.options.parameterId
				if (!paramId || paramId === '0_0_0') {
					self.log('warn', 'No parameter selected')
					return
				}
				const [trackStr, deviceStr, parameterStr] = paramId.split('_')
				const track = parseInt(trackStr) - 1
				const device = parseInt(deviceStr) - 1
				const parameter = parseInt(parameterStr) - 1
				const value = parseFloat(event.options.value) / 100.0

				if (event.options.create_variable) {
					monitorDeviceParameter(paramId, track, device, parameter)
				}

				self.sendOsc('/live/device/set/parameter/value', [
					{ type: 'i', value: track },
					{ type: 'i', value: device },
					{ type: 'i', value: parameter },
					{ type: 'f', value: value }
				])
			}
		},
		device_parameter_step: {
			name: 'Device - Step Parameter Value (Rotary/Button)',
			options: [
				{
					type: 'dropdown',
					label: 'Parameter (Scan project first)',
					id: 'parameterId',
					choices: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters : [{ id: '0_0_0', label: 'No parameters found - Scan Project' }],
					default: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters[0].id : '0_0_0',
					minChoicesForSearch: 0
				},
				{
					type: 'textinput',
					label: 'Step (e.g. 1, 5, -5) (Scale 0-100)',
					id: 'step',
					default: '1'
				},
				{
					type: 'checkbox',
					label: 'Create Variable for this parameter?',
					id: 'create_variable',
					default: false
				}
			],
			callback: async (event) => {
				const paramId = event.options.parameterId
				if (!paramId || paramId === '0_0_0') {
					self.log('warn', 'No parameter selected')
					return
				}
				const [trackStr, deviceStr, parameterStr] = paramId.split('_')
				const track = parseInt(trackStr) - 1
				const device = parseInt(deviceStr) - 1
				const parameter = parseInt(parameterStr) - 1
				const step = parseFloat(event.options.step) / 100.0

				// Stepping reads the cached value, so re-arm the subscription on every press
				self.listenToDeviceParameter(track, device, parameter, { force: true })

				if (event.options.create_variable) {
					monitorDeviceParameter(paramId, track, device, parameter)
				}

				const key = `${track + 1}_${device + 1}_${parameter + 1}`
				const current = self.deviceParameters[key]
				
				if (current !== undefined) {
					let newValue = current + step
					newValue = Math.max(0.0, Math.min(1.0, newValue))
					
					self.sendOsc('/live/device/set/parameter/value', [
						{ type: 'i', value: track },
						{ type: 'i', value: device },
						{ type: 'i', value: parameter },
						{ type: 'f', value: newValue }
					])
				} else {
					self.log('warn', `Parameter ${key} value unknown. Listening started. Try again.`)
				}
			}
		},
		select_device_parameter: {
			name: 'Device - Select Parameter',
			options: [
				{
					type: 'dropdown',
					label: 'Parameter (Scan project first)',
					id: 'parameterId',
					choices: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters : [{ id: '0_0_0', label: 'No parameters found - Scan Project' }],
					default: self.knownParameters && self.knownParameters.length > 0 ? self.knownParameters[0].id : '0_0_0',
					minChoicesForSearch: 0
				},
				{
					type: 'checkbox',
					label: 'Create Variable for this parameter?',
					id: 'createVariable',
					default: false
				}
			],
			callback: async (event) => {
				const paramId = event.options.parameterId
				if (!paramId || paramId === '0_0_0') {
					self.log('warn', 'No parameter selected')
					return
				}

				const [track, device, parameter] = paramId.split('_').map(Number)
				
				self.selectedParameter = { track, device, parameter }
				
				// Find the label to set the name variable
				const paramObj = self.knownParameters.find(p => p.id === paramId)
				const paramName = paramObj ? paramObj.label : `T${track} D${device} P${parameter}`

				// Labels are built as "Track > Device > Parameter": keep only the last
				// segment for the short variant used on small buttons
				const paramNameShort = paramName.split(' > ').pop()

				self.setVariableValues({
					selected_parameter_track: track,
					selected_parameter_device: device,
					selected_parameter_num: parameter,
					selected_parameter_value: '...', // Reset while fetching
					selected_parameter_name: paramName,
					selected_parameter_name_short: paramNameShort
				})

				// Optional dedicated variable, on top of the generic $(ableton:selected_parameter_*) ones.
				// The ID stays index-based (device_param_T_D_P) rather than derived from the parameter
				// name, so it survives a rename in Live.
				if (event.options.createVariable) {
					const varId = `device_param_${track}_${device}_${parameter}`
					self.checkVariableDefinition(varId, paramName)

					// Membership in this set is what makes main.js push updates to the variable
					self.monitoredDeviceParameters.add(varId)
				}

				// Start listening
				self.listenToDeviceParameter(track - 1, device - 1, parameter - 1)

				// Ask for both representations explicitly rather than relying on the subscription
				// echoing a value: the parameter may already be subscribed (device On/Off switches
				// are subscribed at scan time, and re-selecting a parameter subscribes nothing new),
				// in which case selecting it would send no OSC traffic at all and the variables
				// would keep showing the previously selected parameter.
				// Both are requested in parallel so neither display waits on the other's round trip.
				self.sendOsc('/live/device/get/parameter/value', [
					{ type: 'i', value: track - 1 },
					{ type: 'i', value: device - 1 },
					{ type: 'i', value: parameter - 1 }
				])
				self.sendOsc('/live/device/get/parameter/value_string', [
					{ type: 'i', value: track - 1 },
					{ type: 'i', value: device - 1 },
					{ type: 'i', value: parameter - 1 }
				])


				self.checkFeedbacks('selected_parameter_active')
			}
		},
		toggle_selected_device_parameter: {
			name: 'Selected Device Parameter - Toggle',
			options: [],
			callback: async (event) => {
				if (!self.selectedParameter) {
					self.log('warn', 'No parameter selected for toggling')
					return
				}
				
				const track = self.selectedParameter.track - 1
				const device = self.selectedParameter.device - 1
				const parameter = self.selectedParameter.parameter - 1
				
				// Use last known value or default to 0
				const current = self.selectedParameter.lastValue || 0
				
				// Toggle logic: if > 0.5 (50%), go to 0. Else go to 1 (100%)
				const newValue = current > 0.5 ? 0.0 : 1.0
				
				self.sendOsc('/live/device/set/parameter/value', [
					{ type: 'i', value: track },
					{ type: 'i', value: device },
					{ type: 'i', value: parameter },
					{ type: 'f', value: newValue }
				])
			}
		},
		step_selected_device_parameter: {
			name: 'Selected Device Parameter - Step (+/-)',
			options: [
				{
					type: 'textinput',
					label: 'Step (e.g. 1, 5, -5) (Scale 0-100)',
					id: 'step',
					default: '1'
				}
			],
			callback: async (event) => {
				if (!self.selectedParameter) {
					self.log('warn', 'No parameter selected for stepping')
					return
				}
				
				const track = self.selectedParameter.track - 1
				const device = self.selectedParameter.device - 1
				const parameter = self.selectedParameter.parameter - 1
				const step = parseFloat(event.options.step) / 100.0
				
				const key = `${self.selectedParameter.track}_${self.selectedParameter.device}_${self.selectedParameter.parameter}`
				const current = self.deviceParameters[key]
				
				if (current !== undefined) {
					let newValue = current + step
					newValue = Math.max(0.0, Math.min(1.0, newValue))
					
					self.sendOsc('/live/device/set/parameter/value', [
						{ type: 'i', value: track },
						{ type: 'i', value: device },
						{ type: 'i', value: parameter },
						{ type: 'f', value: newValue }
					])
				} else {
					// Value not known yet: (re)subscribe so the next press has something to step from
					self.listenToDeviceParameter(track, device, parameter, { force: true })
					self.log('warn', `Parameter ${key} value unknown. Listening started. Try again.`)
				}
			}
		},
		set_selected_device_parameter: {
			name: 'Selected Device Parameter - Set Value',
			options: [
				{
					type: 'textinput',
					label: 'Value (0-100)',
					id: 'value',
					default: '50'
				}
			],
			callback: async (event) => {
				if (!self.selectedParameter) {
					self.log('warn', 'No parameter selected for setting value')
					return
				}
				
				const track = self.selectedParameter.track - 1
				const device = self.selectedParameter.device - 1
				const parameter = self.selectedParameter.parameter - 1
				const value = parseFloat(event.options.value) / 100.0
				
				self.sendOsc('/live/device/set/parameter/value', [
					{ type: 'i', value: track },
					{ type: 'i', value: device },
					{ type: 'i', value: parameter },
					{ type: 'f', value: value }
				])
			}
		},
		fade_stop_clip: {
			name: 'Clip - Fade Out and Stop',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				},
				{
					type: 'number',
					label: 'Duration (ms)',
					id: 'duration',
					min: 100,
					max: 60000,
					default: 3500
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				const duration = event.options.duration

				const id = `clip_${track}_${clip}`

				// Interrupt any fade already running on this clip
				const existingFade = self.activeFades[id]
				if (existingFade && existingFade.interval) {
					clearInterval(existingFade.interval)
				}

				self.activeFades[id] = {
					type: 'clip',
					direction: 'out',
					track,
					clip,
					duration,
					startTime: Date.now(),
					state: 'init'
				}

				// The fade only starts once Live answers with the current gain (see startFade)
				self.sendOsc('/live/clip/get/gain', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		fade_fire_clip: {
			name: 'Clip - Fire and Fade In',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				},
				{
					type: 'number',
					label: 'Duration (ms)',
					id: 'duration',
					min: 100,
					max: 60000,
					default: 3500
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				const duration = event.options.duration

				const id = `clip_${track}_${clip}`

				// Interrupt any fade already running on this clip
				const existingFade = self.activeFades[id]
				if (existingFade && existingFade.interval) {
					clearInterval(existingFade.interval)
				}

				self.activeFades[id] = {
					type: 'clip',
					direction: 'in',
					track,
					clip,
					duration,
					startTime: Date.now(),
					state: 'init'
				}

				// The clip is fired by startFade, once Live answers with the current gain
				self.sendOsc('/live/clip/get/gain', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		fade_stop_track: {
			name: 'Track - Fade Out and Stop',
			options: [
				{
					type: 'dropdown',
					label: 'Track',
					id: 'track',
					choices: self.trackChoices,
					default: self.trackChoices[0].id
				},
				{
					type: 'number',
					label: 'Duration (ms)',
					id: 'duration',
					min: 100,
					max: 60000,
					default: 3500
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const duration = event.options.duration

				const id = `track_${track}`

				// Interrupt any fade already running on this track
				const existingFade = self.activeFades[id]
				if (existingFade && existingFade.interval) {
					clearInterval(existingFade.interval)
				}

				self.activeFades[id] = {
					type: 'track',
					direction: 'out',
					track,
					duration,
					startTime: Date.now(),
					state: 'init'
				}

				// The fade only starts once Live answers with the current volume (see startFade)
				self.sendOsc('/live/track/get/volume', [
					{ type: 'i', value: track }
				])
			}
		},
		fade_in_track: {
			name: 'Track - Fade In',
			options: [
				{
					type: 'dropdown',
					label: 'Track',
					id: 'track',
					choices: self.trackChoices,
					default: self.trackChoices[0].id
				},
				{
					type: 'number',
					label: 'Duration (ms)',
					id: 'duration',
					min: 100,
					max: 60000,
					default: 3500
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const duration = event.options.duration

				const id = `track_${track}`

				// Interrupt any fade already running on this track
				const existingFade = self.activeFades[id]
				if (existingFade && existingFade.interval) {
					clearInterval(existingFade.interval)
				}

				self.activeFades[id] = {
					type: 'track',
					direction: 'in',
					track,
					duration,
					startTime: Date.now(),
					state: 'init'
				}

				// The fade only starts once Live answers with the current volume (see startFade)
				self.sendOsc('/live/track/get/volume', [
					{ type: 'i', value: track }
				])
			}
		},
		fade_track_toggle: {
			name: 'Track - Fade by State of a variable',
			options: [
				{
					type: 'textinput',
					label: 'State (True/False)',
					id: 'state',
					default: 'false',
					useVariables: true
				},
				{
					type: 'dropdown',
					label: 'Track',
					id: 'track',
					choices: self.trackChoices,
					default: self.trackChoices[0].id
				},
				{
					type: 'number',
					label: 'Hold time (ms)',
					id: 'hold_time',
					min: 0,
					max: 60000,
					default: 0
				},
				{
					type: 'number',
					label: 'Rise time (ms)',
					id: 'rise_time',
					min: 100,
					max: 60000,
					default: 750
				},
				{
					type: 'number',
					label: 'On time (ms)',
					id: 'on_time',
					min: 0,
					max: 60000,
					default: 500
				},
				{
					type: 'number',
					label: 'Fall time (ms)',
					id: 'fall_time',
					min: 100,
					max: 60000,
					default: 3500
				},
				{
					type: 'number',
					label: 'On Level (0-100%)',
					id: 'on_level',
					min: 0,
					max: 100,
					default: 85
				},
				{
					type: 'number',
					label: 'Off Level (0-100%)',
					id: 'off_level',
					min: 0,
					max: 100,
					default: 0
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1

				// Companion resolves $(...) variables in this field before the callback runs
				let state = event.options.state
				if (typeof state === 'string') {
					state = state.toLowerCase().trim()
				}

				const isTrue = (state === 'true' || state === '1' || state === 'on')

				self.log('debug', `Fade by State: input="${event.options.state}" parsed="${state}" isTrue=${isTrue}`)
				
				const riseTime = event.options.rise_time
				const fallTime = event.options.fall_time
				const onTime = event.options.on_time
				const holdTime = event.options.hold_time
				const onLevel = event.options.on_level / 100  // Convert to 0-1 range
				const offLevel = event.options.off_level / 100  // Convert to 0-1 range

				const id = `track_${track}`

				// A state change always supersedes a pending delay, whatever its direction:
				// flipping back before Hold/On Time elapsed must not trigger the previous fade
				if (self.trackDelays[id]) {
					clearTimeout(self.trackDelays[id])
					delete self.trackDelays[id]
				}

				if (isTrue) {
					// FADE IN (Delayed by Hold Time)
					if (holdTime > 0) {
						self.trackDelays[id] = setTimeout(() => {
							self.setupTrackToggleFade(track, 'in', riseTime, onLevel, offLevel)
							delete self.trackDelays[id]
						}, holdTime)
					} else {
						self.setupTrackToggleFade(track, 'in', riseTime, onLevel, offLevel)
					}
				} else {
					// FADE OUT (Delayed by On Time)
					if (onTime > 0) {
						self.trackDelays[id] = setTimeout(() => {
							self.setupTrackToggleFade(track, 'out', fallTime, onLevel, offLevel)
							delete self.trackDelays[id]
						}, onTime)
					} else {
						self.setupTrackToggleFade(track, 'out', fallTime, onLevel, offLevel)
					}
				}
			}
		},
		refresh_clip_info: {
			name: 'Clip - Refresh Info',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				
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
			name: 'Project - Scan',
			options: [],
			callback: async (event) => {
				self.sendOsc('/live/song/get/num_tracks', [])
				self.sendOsc('/live/song/get/num_scenes', [])
			}
		},
		// ============================================================
		// CLIP LOOP & MARKER ACTIONS
		// ============================================================
		clip_set_loop_start_now: {
			name: 'Clip - Set Loop Start to Now',
			description: 'Sets the loop start point to the current playback position',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				
				// Store pending request to chain the commands
				self.pendingLoopSet = { track, clip, type: 'loop_start' }
				
				// Request current playing position
				self.sendOsc('/live/clip/get/playing_position', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		clip_set_loop_end_now: {
			name: 'Clip - Set Loop End to Now',
			description: 'Sets the loop end point to the current playback position',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				
				self.pendingLoopSet = { track, clip, type: 'loop_end' }
				
				self.sendOsc('/live/clip/get/playing_position', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		clip_set_start_marker_now: {
			name: 'Clip - Set Start Marker to Now',
			description: 'Sets the start marker to the current playback position',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				
				self.pendingLoopSet = { track, clip, type: 'start_marker' }
				
				self.sendOsc('/live/clip/get/playing_position', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		clip_set_end_marker_now: {
			name: 'Clip - Set End Marker to Now',
			description: 'Sets the end marker to the current playback position',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				
				self.pendingLoopSet = { track, clip, type: 'end_marker' }
				
				self.sendOsc('/live/clip/get/playing_position', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		clip_set_loop_start: {
			name: 'Clip - Set Loop Start (Value)',
			description: 'Sets the loop start point to a specific beat value',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				},
				{
					type: 'textinput',
					label: 'Beat Position',
					id: 'position',
					default: '0',
					tooltip: 'Position in beats (e.g., 4.0 for beat 4)'
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				const position = parseFloat(event.options.position) || 0
				
				self.sendOsc('/live/clip/set/loop_start', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip },
					{ type: 'f', value: position }
				])
			}
		},
		clip_set_loop_end: {
			name: 'Clip - Set Loop End (Value)',
			description: 'Sets the loop end point to a specific beat value',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				},
				{
					type: 'textinput',
					label: 'Beat Position',
					id: 'position',
					default: '16',
					tooltip: 'Position in beats (e.g., 16.0 for beat 16)'
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				const position = parseFloat(event.options.position) || 16
				
				self.sendOsc('/live/clip/set/loop_end', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip },
					{ type: 'f', value: position }
				])
			}
		},
		// ============================================================
		// CLIP WARPING
		// ============================================================
		clip_warping_toggle: {
			name: 'Clip - Warping Toggle',
			description: 'Toggles warping on/off for the clip',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				},
				{
					type: 'dropdown',
					label: 'Warping State',
					id: 'state',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' }
					]
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				const state = event.options.state
				
				if (state === 'toggle') {
					// Get current state first
					self.pendingWarpingToggle = { track, clip }
					self.sendOsc('/live/clip/get/warping', [
						{ type: 'i', value: track },
						{ type: 'i', value: clip }
					])
				} else {
					self.sendOsc('/live/clip/set/warping', [
						{ type: 'i', value: track },
						{ type: 'i', value: clip },
						{ type: 'i', value: state === 'on' ? 1 : 0 }
					])
				}
			}
		},
		// ============================================================
		// CLIP LOOPING
		// ============================================================
		clip_looping_toggle: {
			name: 'Clip - Looping Toggle',
			description: 'Toggles looping on/off for the clip',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				},
				{
					type: 'dropdown',
					label: 'Looping State',
					id: 'state',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' }
					]
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				const state = event.options.state
				
				if (state === 'toggle') {
					// Get current state first
					self.pendingLoopingToggle = { track, clip }
					self.sendOsc('/live/clip/get/looping', [
						{ type: 'i', value: track },
						{ type: 'i', value: clip }
					])
				} else {
					self.sendOsc('/live/clip/set/looping', [
						{ type: 'i', value: track },
						{ type: 'i', value: clip },
						{ type: 'i', value: state === 'on' ? 1 : 0 }
					])
				}
			}
		},
		clip_get_info: {
			name: 'Clip - Get Info (Loop/Warp)',
			description: 'Fetches current loop points, looping state, and warping state for the clip',
			options: [
				{
					type: 'dropdown',
					label: 'Clip',
					id: 'clipId',
					choices: self.clipChoices,
					default: self.clipChoices && self.clipChoices.length > 0 ? self.clipChoices[0].id : '1_1',
					minChoicesForSearch: 0
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				
				// Request all clip info
				self.sendOsc('/live/clip/get/loop_start', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
				self.sendOsc('/live/clip/get/loop_end', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
				self.sendOsc('/live/clip/get/start_marker', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
				self.sendOsc('/live/clip/get/end_marker', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
				self.sendOsc('/live/clip/get/looping', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
				self.sendOsc('/live/clip/get/warping', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		raw_osc: {
			name: 'OSC - Send Raw Command',
			description: 'Send a custom OSC message to AbletonOSC. Use this for commands not yet implemented in the module.',
			options: [
				{
					type: 'textinput',
					label: 'OSC Address',
					id: 'address',
					default: '/live/song/get/tempo',
					tooltip: 'The OSC address path (e.g., /live/song/set/tempo)'
				},
				{
					type: 'textinput',
					label: 'Arguments (comma-separated)',
					id: 'args',
					default: '',
					tooltip: 'Comma-separated arguments. Prefix with type: i:123 (int), f:1.5 (float), s:text (string). Without prefix, auto-detected.'
				}
			],
			callback: async (event) => {
				const address = event.options.address.trim()
				const argsStr = event.options.args?.trim() || ''
				
				let oscArgs = []
				
				if (argsStr.length > 0) {
					const parts = argsStr.split(',').map(p => p.trim())
					
					for (const part of parts) {
						if (part.startsWith('i:')) {
							// Explicit integer
							oscArgs.push({ type: 'i', value: parseInt(part.substring(2)) })
						} else if (part.startsWith('f:')) {
							// Explicit float
							oscArgs.push({ type: 'f', value: parseFloat(part.substring(2)) })
						} else if (part.startsWith('s:')) {
							// Explicit string
							oscArgs.push({ type: 's', value: part.substring(2) })
						} else {
							// Auto-detect type
							const num = Number(part)
							if (!isNaN(num)) {
								if (part.includes('.')) {
									oscArgs.push({ type: 'f', value: num })
								} else {
									oscArgs.push({ type: 'i', value: num })
								}
							} else {
								// Treat as string
								oscArgs.push({ type: 's', value: part })
							}
						}
					}
				}
				
				self.log('info', `Raw OSC: ${address} ${JSON.stringify(oscArgs)}`)
				self.sendOsc(address, oscArgs)
			}
		}
	})
}
