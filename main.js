const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const osc = require('osc')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariables = require('./variables')

const UpdatePresets = require('./presets')

class AbletonOSCInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		
		this.clipColors = {}
		this.trackLevels = {}
		this.trackLevelsLeft = {}
		this.trackLevelsRight = {}
		this.trackMutes = {}
		this.deviceParameters = {}
		this.deviceNames = {}
		this.clipPlaying = {}
		this.trackStoredVolumes = {}
		this.trackDelays = {}
		this.variableDefinitions = []
		this.numTracks = 8
		this.numScenes = 8
		this.activeFades = {}
		this.blinkState = false
		this.variableIds = new Set()
		this.activeParameterListeners = new Set()
		this.monitoredDeviceParameters = new Set()
		this.selectedParameter = null
		this.knownParameters = [] // Array of { id: 't_d_p', label: '...' }
		this.sceneNames = {} // Store scene names
		this.clipNames = {} // Store clip names
		this.clipSlotHasClip = {} // Track which slots have clips
		this.pendingClipInfoRequests = new Set() // Pending has_clip requests
		this.updateDebounceTimer = null // Debounce timer for UI updates
		this.lastMeterUpdate = 0 // Throttle meter feedback updates
		this.meterUpdateInterval = 50 // Minimum ms between meter feedback updates
	}

	async init(config) {
		this.config = config

		this.updateStatus(InstanceStatus.Connecting)

		this.initOsc()
		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.initPresets()
		this.startBlink()
	}


	async destroy() {
		if (this.blinkInterval) clearInterval(this.blinkInterval)

		// Stop all active fades
		for (const id in this.activeFades) {
			if (this.activeFades[id].interval) {
				clearInterval(this.activeFades[id].interval)
			}
		}
		this.activeFades = {}

		// Clear all track delays
		for (const id in this.trackDelays) {
			clearTimeout(this.trackDelays[id])
		}
		this.trackDelays = {}

		if (this.fetchTimeout) {
			clearTimeout(this.fetchTimeout)
			this.fetchTimeout = null
		}

		if (this.updateDebounceTimer) {
			clearTimeout(this.updateDebounceTimer)
			this.updateDebounceTimer = null
		}

		if (this.oscPort) {
			try {
				for (let t = 0; t < this.numTracks; t++) {
					this.sendOsc('/live/track/stop_listen/output_meter_left', [{ type: 'i', value: t }])
					this.sendOsc('/live/track/stop_listen/output_meter_right', [{ type: 'i', value: t }])
					this.sendOsc('/live/track/stop_listen/mute', [{ type: 'i', value: t }])
					this.sendOsc('/live/track/stop_listen/playing_slot_index', [{ type: 'i', value: t }])
				}
			} catch (e) {}

			this.oscPort.close()
			delete this.oscPort
		}
	}

	async configUpdated(config) {
		this.config = config
		this.initOsc()
	}

	getConfigFields() {
		return [
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 8,
				regex: Regex.IP,
				default: '127.0.0.1'
			},
			{
				type: 'number',
				id: 'port',
				label: 'Target Port (Send)',
				width: 4,
				min: 1,
				max: 65535,
				default: 11000
			},
			{
				type: 'number',
				id: 'receivePort',
				label: 'Receive Port (Listen)',
				width: 4,
				min: 1,
				max: 65535,
				default: 11001
			}
		]
	}

	initOsc() {
		if (this.oscPort) {
			this.oscPort.close()
			delete this.oscPort
		}

		this.updateStatus(InstanceStatus.Connecting)

		if (this.config.host && this.config.port) {
			this.oscPort = new osc.UDPPort({
				localAddress: "0.0.0.0",
				localPort: this.config.receivePort,
				remoteAddress: this.config.host,
				remotePort: this.config.port,
				metadata: true
			})

			this.oscPort.on("ready", () => {
				this.updateStatus(InstanceStatus.Ok)
				this.log('info', 'OSC Ready')
				
				// Re-send subscriptions if any
				for (const key of this.activeParameterListeners) {
					const [track, device, parameter] = key.split('_').map(Number)
					this.sendOsc('/live/device/start_listen/parameter/value', [
						{ type: 'i', value: track },
						{ type: 'i', value: device },
						{ type: 'i', value: parameter }
					])
				}
			})

			this.oscPort.on("error", (err) => {
				this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
				this.log('error', 'OSC Error: ' + err.message)
			})

			this.oscPort.on("message", (oscMsg) => {
				this.processOscMessage(oscMsg)
			})

			this.oscPort.open()
		} else {
			this.updateStatus(InstanceStatus.BadConfig)
		}
	}

	setupTrackToggleFade(track, direction, duration) {
		const id = `track_${track}`
		
		if (!this.activeFades) this.activeFades = {}

		// Check for existing fade to interrupt
		const existingFade = this.activeFades[id]
		let targetVolume = undefined

		if (existingFade) {
			if (existingFade.interval) {
				clearInterval(existingFade.interval)
			}
			// If we interrupt, we try to preserve the peak volume
			targetVolume = existingFade.startValue
		}
		
		this.activeFades[id] = {
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

		this.sendOsc('/live/track/get/volume', [
			{ type: 'i', value: track }
		])
	}

	startFade(id, startValue) {
		const fade = this.activeFades[id]
		if (!fade) return

		fade.state = 'fading'
		
		// Determine Peak/Target Volume logic
		let peakVolume = startValue
		
		if (fade.targetVolume !== undefined) {
			// We are interrupting, so we know the target
			peakVolume = fade.targetVolume
		} else {
			// Fresh start
			if (fade.subtype === 'toggle') {
				if (fade.direction === 'out') {
					// We are fading out from current level. Current level is the peak.
					peakVolume = startValue
					// Store it for future Fade Ins
					this.trackStoredVolumes[fade.track] = startValue
				} else {
					// Fade In
					// We want to go to the stored volume, or default to 0.85 (approx 0dB)
					if (this.trackStoredVolumes[fade.track] !== undefined) {
						peakVolume = this.trackStoredVolumes[fade.track]
					} else {
						peakVolume = 0.85
					}
				}
			} else {
				// Standard Fade
				// For Fade Out: startValue is the peak (current volume)
				// For Fade In: startValue is the peak (target volume set by fader)
				peakVolume = startValue
			}
		}
		
		// For the math to work, we treat 'startValue' in the fade object as the Peak Volume
		fade.startValue = peakVolume
		fade.startTime = Date.now()

		// Calculate initial progress if we are interrupting (to avoid jumps)
		// If we are at 'startValue' (OSC volume) and we want to go to 'peakVolume' (fade.startValue)
		// We need to find the 'elapsed' time that corresponds to this position on the curve.
		
		let initialProgress = 0
		
		// We calculate progress if:
		// 1. We are interrupting (targetVolume defined)
		// 2. OR it's a toggle (which might be resuming/calculating from current state)
		// 3. OR it's a standard fade where we are not at the target yet (e.g. Fade Out from 0.5 when peak is 0.85)
		
		// Special case: Fresh Manual Fade In.
		// direction='in', targetVolume=undefined, subtype!='toggle'.
		// In this case, OSC returns the target volume (e.g. 0.85). We want to start at 0.
		// If we calculate progress, val=peak -> progress=1. It thinks it's finished!
		// So we skip progress calculation for this specific case.
		
		const isFreshManualFadeIn = (fade.direction === 'in' && fade.targetVolume === undefined && fade.subtype !== 'toggle')
		
		if (!isFreshManualFadeIn && fade.startValue > 0.001) {
			if (fade.direction === 'out') {
				// Curve: val = peak * (remaining * remaining)
				// val / peak = remaining^2
				// remaining = sqrt(val / peak)
				// progress = 1 - remaining
				const ratio = Math.max(0, Math.min(1, startValue / fade.startValue))
				const remaining = Math.sqrt(ratio)
				initialProgress = 1.0 - remaining
			} else {
				// Curve: val = peak * (1 - p*p) where p = 1 - progress
				// val / peak = 1 - p*p
				// p*p = 1 - (val / peak)
				// p = sqrt(1 - ratio)
				// progress = 1 - p
				const ratio = Math.max(0, Math.min(1, startValue / fade.startValue))
				const p = Math.sqrt(1.0 - ratio)
				initialProgress = 1.0 - p
			}
			
			// Adjust startTime to fake the elapsed time
			fade.startTime -= (initialProgress * fade.duration)
		}

		// If fading in, set value to 0 and fire/start
		if (fade.direction === 'in') {
			if (fade.type === 'clip') {
				this.sendOsc('/live/clip/set/gain', [
					{ type: 'i', value: fade.track },
					{ type: 'i', value: fade.clip },
					{ type: 'f', value: 0.0 }
				])
				this.sendOsc('/live/clip/fire', [
					{ type: 'i', value: fade.track },
					{ type: 'i', value: fade.clip }
				])
			} else if (fade.type === 'track') {
				// Only force to 0 if NOT a toggle (standard behavior) or if we are starting from scratch
				// AND if we are NOT interrupting.
				if (fade.subtype !== 'toggle' && fade.targetVolume === undefined) {
					this.sendOsc('/live/track/set/volume', [
						{ type: 'i', value: fade.track },
						{ type: 'f', value: 0.0 }
					])
				}
			}
		}

		// Interval for updates (30ms is smooth enough while reducing OSC traffic)
		const intervalTime = 30
		
		if (fade.interval) clearInterval(fade.interval)

		fade.interval = setInterval(() => {
			const now = Date.now()
			const elapsed = now - fade.startTime
			const progress = Math.min(elapsed / fade.duration, 1.0)
			
			if (progress >= 1.0) {
				// Finished
				clearInterval(fade.interval)
				
				if (fade.direction === 'out') {
					// Stop and restore
					if (fade.type === 'clip') {
						this.sendOsc('/live/clip/stop', [
							{ type: 'i', value: fade.track },
							{ type: 'i', value: fade.clip }
						])
						// Restore gain
						this.sendOsc('/live/clip/set/gain', [
							{ type: 'i', value: fade.track },
							{ type: 'i', value: fade.clip },
							{ type: 'f', value: fade.startValue }
						])
					} else if (fade.type === 'track') {
						if (fade.stopClips !== false) {
							this.sendOsc('/live/track/stop_all_clips', [
								{ type: 'i', value: fade.track }
							])
							// Restore volume
							this.sendOsc('/live/track/set/volume', [
								{ type: 'i', value: fade.track },
								{ type: 'f', value: fade.startValue }
							])
						} else {
							// For toggle fade out, we ensure we hit 0 exactly and stay there
							this.sendOsc('/live/track/set/volume', [
								{ type: 'i', value: fade.track },
								{ type: 'f', value: 0.0 }
							])
						}
					}
				} else {
					// Fade In Finished - Ensure we hit target exactly
					if (fade.type === 'clip') {
						this.sendOsc('/live/clip/set/gain', [
							{ type: 'i', value: fade.track },
							{ type: 'i', value: fade.clip },
							{ type: 'f', value: fade.startValue }
						])
					} else if (fade.type === 'track') {
						this.sendOsc('/live/track/set/volume', [
							{ type: 'i', value: fade.track },
							{ type: 'f', value: fade.startValue }
						])
					}
				}
				
				delete this.activeFades[id]
			} else {
				// Calculate new value
				let newValue
				
				if (fade.direction === 'out') {
					// Quadratic fade out (Ease-In: starts slow, speeds up drop)
					const remaining = 1.0 - progress
					newValue = fade.startValue * (remaining * remaining)
				} else {
					// Quadratic fade in (Ease-Out: starts fast, slows down at end)
					const p = 1.0 - progress
					newValue = fade.startValue * (1.0 - p * p)
				}
				
				if (fade.type === 'clip') {
					this.sendOsc('/live/clip/set/gain', [
						{ type: 'i', value: fade.track },
						{ type: 'i', value: fade.clip },
						{ type: 'f', value: newValue }
					])
				} else if (fade.type === 'track') {
					this.sendOsc('/live/track/set/volume', [
						{ type: 'i', value: fade.track },
						{ type: 'f', value: newValue }
					])
				}
			}
		}, intervalTime)
	}

	processOscMessage(msg) {
		try {
			const address = msg.address
			const args = msg.args

			// Filter out meter messages from debug log and variable update to prevent flooding
			if (!address.includes('output_meter')) {
				this.log('debug', `OSC Received: ${address} ${JSON.stringify(args)}`)
				this.setVariableValues({ last_message: address })
			}

			if (address === '/live/clip/get/gain') {
			// args: [track, clip, gain]
			const track = args[0].value
			const clip = args[1].value
			const gain = args[2].value
			
			const id = `clip_${track}_${clip}`
			if (this.activeFades[id] && this.activeFades[id].state === 'init') {
				this.startFade(id, gain)
			}

		} else if (address === '/live/track/get/volume') {
			// args: [track, volume]
			const track = args[0].value
			const volume = args[1].value
			
			const id = `track_${track}`
			if (this.activeFades[id] && this.activeFades[id].state === 'init') {
				this.startFade(id, volume)
			}

		} else if (address === '/live/clip/get/name') {
			// args: [track, clip, name]
			const track = args[0].value + 1
			const clip = args[1].value + 1
			const name = args[2].value
			
			const varId = `clip_name_${track}_${clip}`
			
			// Optionally add to definitions if not exists (simplified here)
			this.checkVariableDefinition(varId, `Clip Name ${track}-${clip}`)
			this.setVariableValues({ [varId]: name })
			
			// Store for dropdowns
			this.clipNames[`${track}_${clip}`] = name
			
			// Update actions to refresh clip choices (debounced)
			this.scheduleUiUpdate()

		} else if (address === '/live/clip/get/color') {
			// args: [track, clip, color]
			const track = args[0].value + 1
			const clip = args[1].value + 1
			const color = args[2].value
			this.clipColors[`${track}_${clip}`] = color
			this.checkFeedbacks('clip_color')

		} else if (address === '/live/track/get/playing_slot_index') {
			// args: [track, clip_index]
			const track = args[0].value + 1
			const playingClipIndex = args[1].value // 0-based index of playing clip, or -1 if none
			
			// Update all clips for this track
			// We iterate through known scenes (or up to numScenes)
			for (let s = 1; s <= this.numScenes; s++) {
				const isPlaying = (s - 1) === playingClipIndex
				const clipId = `${track}_${s}`
				
				// Only update if changed to avoid flooding
				if (this.clipPlaying[clipId] !== isPlaying) {
					this.clipPlaying[clipId] = isPlaying
				}
			}
			
			this.checkFeedbacks('clip_playing')

		} else if (address === '/live/track/get/name') {
			// args: [track, name]
			const track = args[0].value + 1
			const name = args[1].value
			
			const varId = `track_name_${track}`
			this.checkVariableDefinition(varId, `Track Name ${track}`)
			this.setVariableValues({ [varId]: name })

		} else if (address === '/live/clip_slot/get/has_clip') {
			// args: [track, clip, has_clip]
			const track = args[0].value
			const clip = args[1].value
			const hasClip = args[2].value === 1 || args[2].value === true
			
			const key = `${track + 1}_${clip + 1}`
			this.clipSlotHasClip[key] = hasClip
			this.pendingClipInfoRequests.delete(key)
			
			// Only request clip info if there's actually a clip
			if (hasClip) {
				this.sendOsc('/live/clip/get/name', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
				this.sendOsc('/live/clip/get/color', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}

		} else if (address === '/live/scene/get/name') {
			// args: [scene, name]
			const scene = args[0].value + 1
			const name = args[1].value
			
			this.sceneNames[scene] = name
			
			// Update actions to refresh scene choices (debounced)
			this.scheduleUiUpdate()

		} else if (address === '/live/track/get/mute') {
			// args: [track, mute]
			const track = args[0].value + 1
			const mute = args[1].value
			
			this.trackMutes[track] = mute
			this.checkFeedbacks('track_mute')

		} else if (address === '/live/device/get/parameter/value') {
			// args: [track, device, param, value]
			const track = args[0].value + 1
			const device = args[1].value + 1
			const param = args[2].value + 1
			const value = args[3].value
			
			this.deviceParameters[`${track}_${device}_${param}`] = value
			this.checkFeedbacks('device_active')

			// Update selected parameter state for toggle logic
			if (this.selectedParameter && 
				this.selectedParameter.track === track && 
				this.selectedParameter.device === device && 
				this.selectedParameter.parameter === param) {
				this.selectedParameter.lastValue = value
			}

			// Request value_string to ensure we get the display value
			const varId = `device_param_${track}_${device}_${param}`
			const isSelected = this.selectedParameter && 
				this.selectedParameter.track === track && 
				this.selectedParameter.device === device && 
				this.selectedParameter.parameter === param

			if (this.monitoredDeviceParameters.has(varId) || isSelected) {
				this.sendOsc('/live/device/get/parameter/value_string', [
					{ type: 'i', value: track - 1 },
					{ type: 'i', value: device - 1 },
					{ type: 'i', value: param - 1 }
				])
			}

		} else if (address === '/live/device/get/parameter/value_string') {
			// args: [track, device, param, value_string]
			const track = args[0].value + 1
			const device = args[1].value + 1
			const param = args[2].value + 1
			const value = args[3].value
			
			const varId = `device_param_${track}_${device}_${param}`
			if (this.monitoredDeviceParameters.has(varId)) {
				this.setVariableValues({ [varId]: value })
			}

			if (this.selectedParameter && 
				this.selectedParameter.track === track && 
				this.selectedParameter.device === device && 
				this.selectedParameter.parameter === param) {
				this.setVariableValues({ selected_parameter_value: value })
			}

		} else if (address === '/live/track/get/output_meter_left' || address === '/live/track/get/output_meter_right') {
			// args: [track, level]
			const track = args[0].value + 1
			const level = args[1].value
			
			if (address.endsWith('left')) {
				this.trackLevelsLeft[track] = level
			} else {
				this.trackLevelsRight[track] = level
			}

			const left = this.trackLevelsLeft[track] || 0
			const right = this.trackLevelsRight[track] || 0
			const maxLevel = Math.max(left, right)
			
			this.trackLevels[track] = maxLevel
			
			const varId = `track_meter_${track}`
			this.setVariableValues({ [varId]: maxLevel.toFixed(2) })
			
			// Throttle feedback updates to reduce CPU load
			const now = Date.now()
			if (now - this.lastMeterUpdate >= this.meterUpdateInterval) {
				this.lastMeterUpdate = now
				this.checkFeedbacks('track_meter', 'track_meter_visual')
			}

		} else if (address === '/live/song/get/num_tracks') {
			this.numTracks = args[0].value
			this.initVariables()
			this.initPresets()
			this.log('info', `Updated presets for ${this.numTracks} tracks`)
			this.fetchClipInfo()
		} else if (address === '/live/song/get/num_scenes') {
			this.numScenes = args[0].value
			this.initVariables()
			this.initPresets()
			this.log('info', `Updated presets for ${this.numScenes} scenes`)
			this.fetchClipInfo()

		} else if (address === '/live/track/get/devices/name') {
			// args: [track_id, name1, name2, ...]
			const track = args[0].value + 1
			const names = []
			for (let i = 1; i < args.length; i++) {
				names.push(args[i].value)
			}
			this.deviceNames[track] = names
			
			// Update presets to include these devices
			this.initPresets()

			// Fetch parameters for these devices
			for (let i = 0; i < names.length; i++) {
				this.sendOsc('/live/device/get/parameters/name', [
					{ type: 'i', value: track - 1 },
					{ type: 'i', value: i }
				])
			}

		} else if (address === '/live/device/get/parameters/name') {
			// args: [track, device, name1, name2, ...]
			const track = args[0].value + 1
			const device = args[1].value + 1
			
			// We need to store these to build the dropdown
			// We can append to this.knownParameters
			
			// First, remove existing parameters for this device to avoid duplicates if re-scanned
			const prefix = `${track}_${device}_`
			this.knownParameters = this.knownParameters.filter(p => !p.id.startsWith(prefix))
			
			const trackName = this.getVariableValue(`track_name_${track}`) || `Track ${track}`
			const deviceName = (this.deviceNames[track] && this.deviceNames[track][device - 1]) || `Device ${device}`

			for (let i = 2; i < args.length; i++) {
				const paramName = args[i].value
				const paramIndex = i - 1 // args starts at 2 for param 1
				
				// Skip "Num" or empty names if any
				if (!paramName) continue

				this.knownParameters.push({
					id: `${track}_${device}_${paramIndex}`,
					label: `${trackName} > ${deviceName} > ${paramName}`
				})
			}
			
			// Update actions to refresh the dropdown (debounced)
			this.scheduleUiUpdate()

		}
		} catch (e) {
			this.log('error', `Error processing OSC message: ${e.message}`)
		}
	}

	fetchClipInfo() {
		if (this.fetchTimeout) clearTimeout(this.fetchTimeout)

		this.fetchTimeout = setTimeout(async () => {
			// Limit to avoid flooding if project is huge
			const maxTracks = 64
			const maxScenes = 64
			
			const tCount = Math.min(this.numTracks, maxTracks)
			const sCount = Math.min(this.numScenes, maxScenes)

			this.log('info', `Fetching info for ${tCount} tracks and ${sCount} scenes`)
			
			let msgCount = 0

			for (let t = 0; t < tCount; t++) {
				// Request Track Name
				this.sendOsc('/live/track/get/name', [
					{ type: 'i', value: t }
				])
				msgCount++

				// Request Device Names
				this.sendOsc('/live/track/get/devices/name', [
					{ type: 'i', value: t }
				])
				msgCount++

				// Start listening to meters
				this.sendOsc('/live/track/start_listen/output_meter_left', [
					{ type: 'i', value: t }
				])
				this.sendOsc('/live/track/start_listen/output_meter_right', [
					{ type: 'i', value: t }
				])
				msgCount += 2

				// Start listening to playing slot (much more efficient than listening to each clip)
				this.sendOsc('/live/track/start_listen/playing_slot_index', [
					{ type: 'i', value: t }
				])
				msgCount++

				// Start listening to mute
				this.sendOsc('/live/track/start_listen/mute', [
					{ type: 'i', value: t }
				])
				msgCount++

				// Start listening to device parameter 0 (Device On/Off) for first 5 devices
				const maxDevices = 5
				for (let d = 0; d < maxDevices; d++) {
					this.sendOsc('/live/device/start_listen/parameter/value', [
						{ type: 'i', value: t },
						{ type: 'i', value: d },
						{ type: 'i', value: 0 } // Parameter 0 is usually Device On/Off
					])
					msgCount++
				}

				// Ensure variable definition exists
				const varId = `track_meter_${t + 1}`
				this.checkVariableDefinition(varId, `Track Meter ${t + 1}`)

				for (let s = 0; s < sCount; s++) {
					// First check if slot has a clip (response will trigger name/color fetch)
					const key = `${t + 1}_${s + 1}`
					this.pendingClipInfoRequests.add(key)
					this.sendOsc('/live/clip_slot/get/has_clip', [
						{ type: 'i', value: t },
						{ type: 'i', value: s }
					])
					msgCount++

					if (msgCount >= 100) {
						await new Promise(resolve => setTimeout(resolve, 10))
						msgCount = 0
					}
				}
			}

			// Fetch Scene Names
			for (let s = 0; s < sCount; s++) {
				this.sendOsc('/live/scene/get/name', [
					{ type: 'i', value: s }
				])
				msgCount++
			}
		}, 200)
	}

	checkVariableDefinition(id, name) {
		if (!this.variableIds.has(id)) {
			this.variableIds.add(id)
			this.variableDefinitions.push({ variableId: id, name: name })
			this.setVariableDefinitions(this.variableDefinitions)
		}
	}

	initActions() {
		// Generate Track Choices
		this.trackChoices = []
		for (let i = 1; i <= this.numTracks; i++) {
			const name = this.getVariableValue(`track_name_${i}`) || `Track ${i}`
			this.trackChoices.push({ id: i, label: `${i}: ${name}` })
		}

		// Generate Scene Choices
		this.sceneChoices = []
		for (let i = 1; i <= this.numScenes; i++) {
			const name = this.sceneNames[i] || `Scene ${i}`
			this.sceneChoices.push({ id: i, label: `${i}: ${name}` })
		}

		// Generate Clip Choices (Combined Track + Clip)
		this.clipChoices = []
		// We iterate over tracks and scenes to build a flat list of clips
		// This might be large, but it's the only way to show specific clip names
		for (let t = 1; t <= this.numTracks; t++) {
			const trackName = this.getVariableValue(`track_name_${t}`) || `Track ${t}`
			for (let s = 1; s <= this.numScenes; s++) {
				const clipName = this.clipNames[`${t}_${s}`]
				// Only add if we have a name or just add all?
				// Adding all 8x8 = 64 is fine. 100x100 = 10000 is too much.
				// Let's limit to what we scanned.
				// If clipName is undefined, it might be empty slot or not scanned.
				// We'll add it anyway as "Track X - Scene Y" if no name.
				const label = clipName ? `${trackName} - ${clipName}` : `${trackName} - Scene ${s}`
				this.clipChoices.push({ id: `${t}_${s}`, label: label })
			}
		}

		// Generate Device Choices
		this.deviceChoices = []
		for (const [trackId, names] of Object.entries(this.deviceNames)) {
			if (names && Array.isArray(names)) {
				names.forEach((name, index) => {
					const deviceIndex = index + 1
					this.deviceChoices.push({ 
						id: `${trackId}_${deviceIndex}`, 
						label: `T${trackId} > D${deviceIndex}: ${name}` 
					})
				})
			}
		}
		
		// Fallback if empty
		if (this.trackChoices.length === 0) this.trackChoices.push({ id: 1, label: 'Track 1' })
		if (this.sceneChoices.length === 0) this.sceneChoices.push({ id: 1, label: 'Scene 1' })
		if (this.deviceChoices.length === 0) this.deviceChoices.push({ id: '1_1', label: 'T1 > D1' })

		UpdateActions(this)
	}

	initFeedbacks() {
		UpdateFeedbacks(this)
	}

	initVariables() {
		UpdateVariables(this)
	}

	initPresets() {
		UpdatePresets(this)
	}

	subscribe(feedback) {
		if (feedback.type === 'device_active') {
			const track = (feedback.options.track || 1) - 1
			const device = (feedback.options.device || 1) - 1
			const parameter = (feedback.options.parameter || 1) - 1
			
			const key = `${track}_${device}_${parameter}`
			
			this.log('debug', `Subscribing to device parameter: ${key}`)

			// We could count subscribers, but for now just ensure we listen
			if (!this.activeParameterListeners.has(key)) {
				this.activeParameterListeners.add(key)
				
				// Only send if OSC is ready
				if (this.oscPort) {
					this.sendOsc('/live/device/start_listen/parameter/value', [
						{ type: 'i', value: track },
						{ type: 'i', value: device },
						{ type: 'i', value: parameter }
					])
				}
			}
		}
	}

	unsubscribe(feedback) {
		// Optional: Implement reference counting to stop listening when no feedbacks use this parameter
	}

	startBlink() {
		if (this.blinkInterval) clearInterval(this.blinkInterval)
		this.blinkInterval = setInterval(() => {
			this.blinkState = !this.blinkState
			this.checkFeedbacks('clip_playing')
		}, 500)
	}

	sendOsc(address, args) {
		if (this.oscPort) {
			this.oscPort.send({
				address: address,
				args: args
			})
		}
	}

	// Debounced UI update to avoid flooding initActions/initFeedbacks calls
	scheduleUiUpdate() {
		if (this.updateDebounceTimer) {
			clearTimeout(this.updateDebounceTimer)
		}
		this.updateDebounceTimer = setTimeout(() => {
			this.initActions()
			this.initFeedbacks()
			this.initPresets()
			this.updateDebounceTimer = null
		}, 250) // Wait 250ms after last update before refreshing UI
	}
}

runEntrypoint(AbletonOSCInstance, [])
