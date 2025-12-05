module.exports = function (self) {
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
					required: true,
					minChoicesForSearch: 0
				}
			],
			callback: async (event) => {
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
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
					required: true,
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
					default: self.trackChoices[0].id,
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
		mute_track: {
			name: 'Track - Mute',
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
					// Invert current state
					// trackMutes is 1-based
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
					default: self.deviceChoices[0].id,
					required: true
				},
				{
					type: 'number',
					label: 'Parameter Index (Default 1 = On/Off)',
					id: 'parameter',
					min: 1,
					max: 1000,
					default: 1,
					required: true
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
				
				// Ensure we are listening to this parameter (Fix for "Toggle works only once")
				// We send this every time to be safe, it's cheap.
				self.sendOsc('/live/device/start_listen/parameter/value', [
					{ type: 'i', value: track },
					{ type: 'i', value: device },
					{ type: 'i', value: parameter }
				])

				if (state === 'toggle') {
					const current = self.deviceParameters[`${track + 1}_${device + 1}_${parameter + 1}`]
					// If current is undefined, assume it's on (1) so we turn it off, or vice versa. 
					// Safer to assume 0 if unknown? Or maybe we can't toggle if unknown.
					// Let's assume 0 if undefined.
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
					default: '50',
					required: true
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
					const varId = `device_param_${track + 1}_${device + 1}_${parameter + 1}`
					
					if (!self.monitoredDeviceParameters.has(varId)) {
						self.monitoredDeviceParameters.add(varId)
						
						const exists = self.variableDefinitions.find(v => v.variableId === varId)
						if (!exists) {
							const paramObj = self.knownParameters.find(p => p.id === paramId)
							const paramName = paramObj ? paramObj.label : `Device Param ${track + 1}-${device + 1}-${parameter + 1}`
							
							self.variableDefinitions.push({
								variableId: varId,
								name: paramName
							})
							self.setVariableDefinitions(self.variableDefinitions)
						}
						
						self.sendOsc('/live/device/start_listen/parameter/value', [
							{ type: 'i', value: track },
							{ type: 'i', value: device },
							{ type: 'i', value: parameter }
						])
						
						self.activeParameterListeners.add(`${track}_${device}_${parameter}`)
					}
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
					default: '1',
					required: true
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
				
				self.sendOsc('/live/device/start_listen/parameter/value', [
					{ type: 'i', value: track },
					{ type: 'i', value: device },
					{ type: 'i', value: parameter }
				])

				if (event.options.create_variable) {
					const varId = `device_param_${track + 1}_${device + 1}_${parameter + 1}`
					
					if (!self.monitoredDeviceParameters.has(varId)) {
						self.monitoredDeviceParameters.add(varId)
						
						const exists = self.variableDefinitions.find(v => v.variableId === varId)
						if (!exists) {
							const paramObj = self.knownParameters.find(p => p.id === paramId)
							const paramName = paramObj ? paramObj.label : `Device Param ${track + 1}-${device + 1}-${parameter + 1}`
							
							self.variableDefinitions.push({
								variableId: varId,
								name: paramName
							})
							self.setVariableDefinitions(self.variableDefinitions)
						}
						
						self.activeParameterListeners.add(`${track}_${device}_${parameter}`)
					}
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

				self.setVariableValues({
					selected_parameter_track: track,
					selected_parameter_device: device,
					selected_parameter_num: parameter,
					selected_parameter_value: '...', // Reset while fetching
					selected_parameter_name: paramName
				})

				// Handle custom variable creation
				if (event.options.createVariable) {
					// Sanitize name for variable ID (remove spaces, special chars)
					// We use the full label but sanitized
					// Actually, user asked for "variable with the name of the function and its value"
					// Let's create a variable named based on the parameter name, e.g. "param_Track_Device_ParamName"
					// But variable IDs should be simple. Let's stick to the ID based one for reliability: device_param_T_D_P
					// And maybe a friendly named one? No, dynamic variable names are hard to manage.
					// Let's use the standard ID we already support in main.js: device_param_T_D_P
					// We just need to ensure it's "monitored" so main.js updates it.
					
					const varId = `device_param_${track}_${device}_${parameter}`
					self.checkVariableDefinition(varId, paramName)
					
					// Add to monitored set so main.js updates it
					self.monitoredDeviceParameters.add(varId)
				}
				
				// Start listening
				self.sendOsc('/live/device/start_listen/parameter/value', [
					{ type: 'i', value: track - 1 },
					{ type: 'i', value: device - 1 },
					{ type: 'i', value: parameter - 1 }
				])
				
				// Request initial string value
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
					default: '1',
					required: true
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
					// If unknown, try to start listening again
					self.sendOsc('/live/device/start_listen/parameter/value', [
						{ type: 'i', value: track },
						{ type: 'i', value: device },
						{ type: 'i', value: parameter }
					])
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
					default: '50',
					required: true
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
					required: true,
					minChoicesForSearch: 0
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
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				const duration = event.options.duration

				const id = `clip_${track}_${clip}`
				
				if (!self.activeFades) self.activeFades = {}

				// Check for existing fade to interrupt
				const existingFade = self.activeFades[id]
				let targetVolume = undefined

				if (existingFade) {
					if (existingFade.interval) {
						clearInterval(existingFade.interval)
					}
					targetVolume = existingFade.startValue
				}
				
				self.activeFades[id] = {
					type: 'clip',
					direction: 'out',
					track,
					clip,
					duration,
					startTime: Date.now(),
					state: 'init',
					targetVolume: targetVolume
				}

				// Request current gain to start the process
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
					required: true,
					minChoicesForSearch: 0
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
				const [trackStr, clipStr] = event.options.clipId.split('_')
				const track = parseInt(trackStr) - 1
				const clip = parseInt(clipStr) - 1
				const duration = event.options.duration

				const id = `clip_${track}_${clip}`
				
				if (!self.activeFades) self.activeFades = {}

				// Check for existing fade to interrupt
				const existingFade = self.activeFades[id]
				let targetVolume = undefined

				if (existingFade) {
					if (existingFade.interval) {
						clearInterval(existingFade.interval)
					}
					targetVolume = existingFade.startValue
				}
				
				self.activeFades[id] = {
					type: 'clip',
					direction: 'in',
					track,
					clip,
					duration,
					startTime: Date.now(),
					state: 'init',
					targetVolume: targetVolume
				}

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
					default: self.trackChoices[0].id,
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

				// Check for existing fade to interrupt
				const existingFade = self.activeFades[id]
				let targetVolume = undefined

				if (existingFade) {
					if (existingFade.interval) {
						clearInterval(existingFade.interval)
					}
					targetVolume = existingFade.startValue
				}
				
				self.activeFades[id] = {
					type: 'track',
					direction: 'out',
					track,
					duration,
					startTime: Date.now(),
					state: 'init',
					targetVolume: targetVolume
				}

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
					default: self.trackChoices[0].id,
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

				// Check for existing fade to interrupt
				const existingFade = self.activeFades[id]
				let targetVolume = undefined

				if (existingFade) {
					if (existingFade.interval) {
						clearInterval(existingFade.interval)
					}
					targetVolume = existingFade.startValue
				}
				
				self.activeFades[id] = {
					type: 'track',
					direction: 'in',
					track,
					duration,
					startTime: Date.now(),
					state: 'init',
					targetVolume: targetVolume
				}

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
					default: self.trackChoices[0].id,
					required: true
				},
				{
					type: 'number',
					label: 'Hold time (ms)',
					id: 'hold_time',
					min: 0,
					max: 60000,
					default: 0,
					required: true
				},
				{
					type: 'number',
					label: 'Rise time (ms)',
					id: 'rise_time',
					min: 100,
					max: 60000,
					default: 750,
					required: true
				},
				{
					type: 'number',
					label: 'On time (ms)',
					id: 'on_time',
					min: 0,
					max: 60000,
					default: 500,
					required: true
				},
				{
					type: 'number',
					label: 'Fall time (ms)',
					id: 'fall_time',
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
				
				const riseTime = event.options.rise_time
				const fallTime = event.options.fall_time
				const onTime = event.options.on_time
				const holdTime = event.options.hold_time

				const id = `track_${track}`
				
				// Clear any pending delay (whether it was for In or Out)
				if (self.trackDelays && self.trackDelays[id]) {
					clearTimeout(self.trackDelays[id])
					delete self.trackDelays[id]
				}

				if (isTrue) {
					// FADE IN (Delayed by Hold Time)
					if (!self.trackDelays) self.trackDelays = {}

					if (holdTime > 0) {
						self.trackDelays[id] = setTimeout(() => {
							self.setupTrackToggleFade(track, 'in', riseTime)
							delete self.trackDelays[id]
						}, holdTime)
					} else {
						self.setupTrackToggleFade(track, 'in', riseTime)
					}
				} else {
					// FADE OUT (Delayed by On Time)
					if (!self.trackDelays) self.trackDelays = {}
					
					if (onTime > 0) {
						self.trackDelays[id] = setTimeout(() => {
							self.setupTrackToggleFade(track, 'out', fallTime)
							delete self.trackDelays[id]
						}, onTime)
					} else {
						self.setupTrackToggleFade(track, 'out', fallTime)
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
					required: true,
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
		}
	})
}
