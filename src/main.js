const { InstanceBase, Regex, InstanceStatus } = require('@companion-module/base')
const osc = require('osc')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariables = require('./variables')
const UpdatePresets = require('./presets')

// ============================================================
// ABLETON OSC INSTANCE
// ============================================================

class AbletonOSCInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		
		// State storage
		this.clipColors = {}
		this.trackLevels = {}
		this.trackLevelsLeft = {}
		this.trackLevelsRight = {}
		this.trackMutes = {}
		this.deviceParameters = {}
		this.deviceNames = {}
		this.clipPlaying = {}
		this.trackDelays = {}
		this.clipNames = {}
		this.clipSlotHasClip = {}
		
		// Configuration
		this.variableDefinitions = {}
		this.numTracks = 8
		this.numScenes = 8
		this.knownParameters = []
		
		// Runtime state
		// Delay (ms) between stopping a clip/track at the end of a fade-out and restoring its
		// volume/gain to the original value, so Live has time to actually stop playback before
		// the fader jumps back up (avoids an audible "pop")
		this.fadeStopRestoreDelay = 80
		this.activeFades = {}
		this.blinkState = false
		this.variableIds = new Set()
		this.activeParameterListeners = new Set()
		this.monitoredDeviceParameters = new Set()
		this.selectedParameter = null
		this.lastPresetsHash = ''
		this.isScanning = false
		
		// Timers and throttling
		this.blinkInterval = null
		this.fetchTimeout = null
		this.updateDebounceTimer = null
		this.lastMeterUpdate = 0
		this.meterUpdateInterval = 50
		this.variableDefinitionsDirty = false
		this.variableDefinitionsTimer = null
	}

	// ============================================================
	// LIFECYCLE
	// ============================================================

	async init(config) {
		this.config = config

		this.updateStatus(InstanceStatus.Connecting)

		const startTime = Date.now()
		this.log('debug', 'Starting module initialization...')

		this.initOsc()
		this.log('debug', `initOsc: ${Date.now() - startTime}ms`)
		
		this.initActions()
		this.log('debug', `initActions: ${Date.now() - startTime}ms`)
		
		this.initFeedbacks()
		this.log('debug', `initFeedbacks: ${Date.now() - startTime}ms`)
		
		this.initVariables()
		this.log('debug', `initVariables: ${Date.now() - startTime}ms`)
		
		this.initPresets()
		this.log('debug', `initPresets: ${Date.now() - startTime}ms`)
		
		this.startBlink()
		this.log('info', `Module initialization complete in ${Date.now() - startTime}ms`)
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

		if (this.variableDefinitionsTimer) {
			clearTimeout(this.variableDefinitionsTimer)
			this.variableDefinitionsTimer = null
		}

		if (this.oscPort) {
			// Release every subscription so Live stops streaming to a port nobody listens on.
			// Best effort only: the socket may already be gone, which must not block teardown.
			try {
				for (let t = 0; t < this.numTracks; t++) {
					this.sendOsc('/live/track/stop_listen/output_meter_left', [{ type: 'i', value: t }])
					this.sendOsc('/live/track/stop_listen/output_meter_right', [{ type: 'i', value: t }])
					this.sendOsc('/live/track/stop_listen/volume', [{ type: 'i', value: t }])
					this.sendOsc('/live/track/stop_listen/mute', [{ type: 'i', value: t }])
					this.sendOsc('/live/track/stop_listen/playing_slot_index', [{ type: 'i', value: t }])
				}

				for (const key of this.activeParameterListeners) {
					const [track, device, parameter] = key.split('_').map(Number)
					this.sendOsc('/live/device/stop_listen/parameter/value', [
						{ type: 'i', value: track },
						{ type: 'i', value: device },
						{ type: 'i', value: parameter }
					])
				}
			} catch (e) {}

			this.activeParameterListeners.clear()

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
				
				// The port was re-created (config change or reconnect): Live no longer knows where
				// to push values, so replay every device parameter subscription
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

	// ============================================================
	// FADE MANAGEMENT
	// ============================================================

	/**
	 * Cancel a fade out running on a track and restore its volume.
	 * Called when a clip is fired on that track, either from an action or because Live reported
	 * a new playing slot: without this the new clip would inherit the fading-out volume.
	 *
	 * "Fade by State" fades (subtype 'toggle') are excluded: they are driven by an external
	 * variable, which stays the authority on the track level.
	 *
	 * @param {number} trackIndex - Track index (0-based)
	 * @returns {boolean} true if a fade was actually cancelled
	 */
	cancelFadeOutOnTrack(trackIndex) {
		const fadeId = `track_${trackIndex}`
		const activeFade = this.activeFades[fadeId]

		if (activeFade && activeFade.direction === 'out' && activeFade.subtype !== 'toggle') {
			if (activeFade.interval) {
				clearInterval(activeFade.interval)
			}

			// Back to the level the fade started from
			this.sendOsc('/live/track/set/volume', [
				{ type: 'i', value: trackIndex },
				{ type: 'f', value: activeFade.fromVolume }
			])
			
			delete this.activeFades[fadeId]
			this.log('info', `Fade Out cancelled on track ${trackIndex + 1} - clip fired, volume restored`)
			return true
		}
		return false
	}

	/**
	 * Arm a toggle fade (Fade by State). The fade itself only starts once Live answers with the
	 * track's current volume, which lets startFade() pick up mid-way when interrupting.
	 *
	 * @param {number} track - Track index (0-based)
	 * @param {string} direction - 'in' or 'out'
	 * @param {number} duration - Fade duration in ms
	 * @param {number} onLevel - Target volume when ON (0-1)
	 * @param {number} offLevel - Target volume when OFF (0-1)
	 */
	setupTrackToggleFade(track, direction, duration, onLevel, offLevel) {
		const id = `track_${track}`

		const existingFade = this.activeFades[id]
		if (existingFade && existingFade.interval) {
			clearInterval(existingFade.interval)
		}
		
		this.activeFades[id] = {
			type: 'track',
			subtype: 'toggle',
			direction: direction,
			track,
			duration,
			startTime: Date.now(),
			state: 'init',
			onLevel: onLevel,
			offLevel: offLevel
		}

		this.sendOsc('/live/track/get/volume', [
			{ type: 'i', value: track }
		])
	}

	/**
	 * Run the fade animation, once Live has answered with the current volume/gain.
	 *
	 * @param {string} id - Fade key, `track_<i>` or `clip_<t>_<c>`
	 * @param {number} startValue - Current volume/gain reported by Live (0-1)
	 */
	startFade(id, startValue) {
		const fade = this.activeFades[id]
		if (!fade) return

		fade.state = 'fading'

		let fromVolume, toVolume
		
		if (fade.subtype === 'toggle') {
			// Toggle fade: use explicit onLevel and offLevel
			if (fade.direction === 'out') {
				fromVolume = fade.onLevel
				toVolume = fade.offLevel
			} else {
				fromVolume = fade.offLevel
				toVolume = fade.onLevel
			}
			
			// Calculate initial progress based on actual current volume
			// Enables smooth transitions when interrupting a fade
			const range = Math.abs(toVolume - fromVolume)
			if (range > 0.001) {
				let currentProgress
				if (toVolume > fromVolume) {
					currentProgress = (startValue - fromVolume) / (toVolume - fromVolume)
				} else {
					currentProgress = (fromVolume - startValue) / (fromVolume - toVolume)
				}
				currentProgress = Math.min(1, Math.max(0, currentProgress))
				fade.startTime -= (currentProgress * fade.duration)
				
				this.log('debug', `Fade ${id}: Starting from ${(startValue * 100).toFixed(1)}% (progress: ${(currentProgress * 100).toFixed(1)}%)`)
			}
		} else {
			// Standard Fade (clip gain, etc.)
			if (fade.direction === 'out') {
				fromVolume = startValue
				toVolume = 0
			} else {
				fromVolume = 0
				toVolume = startValue
			}
		}
		
		fade.fromVolume = fromVolume
		fade.toVolume = toVolume
		
		// A standard fade in must start from silence, so drop the level before the clip is fired
		// (firing first would let the first frames through at full level)
		if (fade.direction === 'in' && fade.subtype !== 'toggle') {
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
				this.sendOsc('/live/track/set/volume', [
					{ type: 'i', value: fade.track },
					{ type: 'f', value: 0.0 }
				])
			}
		}

		// Interval for updates (30ms is smooth enough while reducing OSC traffic)
		const intervalTime = 30
		
		if (fade.interval) clearInterval(fade.interval)

		fade.interval = setInterval(() => {
			const now = Date.now()
			const elapsed = now - fade.startTime
			const progress = Math.min(elapsed / fade.duration, 1.0)
			
			let newValue

			if (fade.subtype === 'toggle') {
				// Interpolate between the explicit On/Off levels with a quadratic easing
				let easedProgress
				if (fade.direction === 'out') {
					// Ease-In: holds the level, then drops - keeps speech intelligible longer
					easedProgress = progress * progress
				} else {
					// Ease-Out: opens quickly, then settles
					easedProgress = 1 - (1 - progress) * (1 - progress)
				}
				newValue = fade.fromVolume + (fade.toVolume - fade.fromVolume) * easedProgress
			} else {
				// Standard fades run between the current level and silence, quadratic ease-out
				// in both directions
				if (fade.direction === 'out') {
					const remaining = 1.0 - progress
					newValue = fade.fromVolume * (remaining * remaining)
				} else {
					const p = 1.0 - progress
					newValue = fade.toVolume * (1.0 - p * p)
				}
			}

			if (progress >= 1.0) {
				// Finished
				clearInterval(fade.interval)
				
				if (fade.type === 'clip') {
					if (fade.direction === 'out') {
						this.sendOsc('/live/clip/stop', [
							{ type: 'i', value: fade.track },
							{ type: 'i', value: fade.clip }
						])
						// Restore gain for clips, slightly delayed so Live has time to actually
						// stop the clip first - otherwise the gain jumps back up before playback
						// stops and produces an audible "pop"
						setTimeout(() => {
							this.sendOsc('/live/clip/set/gain', [
								{ type: 'i', value: fade.track },
								{ type: 'i', value: fade.clip },
								{ type: 'f', value: fade.fromVolume }
							])
						}, this.fadeStopRestoreDelay)
					} else {
						this.sendOsc('/live/clip/set/gain', [
							{ type: 'i', value: fade.track },
							{ type: 'i', value: fade.clip },
							{ type: 'f', value: fade.toVolume }
						])
					}
				} else if (fade.type === 'track') {
					if (fade.subtype === 'toggle') {
						// Toggle fade: set to exact target level
						this.sendOsc('/live/track/set/volume', [
							{ type: 'i', value: fade.track },
							{ type: 'f', value: fade.toVolume }
						])
					} else {
						// Standard track fade
						if (fade.direction === 'out') {
							// Stop clips first
							this.sendOsc('/live/track/stop_all_clips', [
								{ type: 'i', value: fade.track }
							])
							// Restore volume slightly delayed so the clips actually stop before
							// the fader jumps back up - otherwise the volume rises before playback
							// stops and produces an audible "pop"
							setTimeout(() => {
								this.sendOsc('/live/track/set/volume', [
									{ type: 'i', value: fade.track },
									{ type: 'f', value: fade.fromVolume }
								])
							}, this.fadeStopRestoreDelay)
						} else {
							// Fade in: ensure we hit target exactly
							this.sendOsc('/live/track/set/volume', [
								{ type: 'i', value: fade.track },
								{ type: 'f', value: fade.toVolume }
							])
						}
					}
				}
				
				delete this.activeFades[id]
			} else {
				// Send intermediate value
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

	// ============================================================
	// OSC MESSAGE PROCESSING
	// ============================================================

	processOscMessage(msg) {
		try {
			const address = msg.address
			const args = msg.args

			// Filter out meter messages from debug log to prevent flooding
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

			// Keep the volume gauge variable current (this also fires continuously via start_listen)
			this.setVariableValues({ [`track_volume_${track + 1}`]: volume.toFixed(3) })

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

			// Clips beyond the 8x8 default grid have no definition yet, create it on the fly
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
			const trackIndex = args[0].value  // 0-based
			const track = trackIndex + 1      // 1-based for display
			const playingClipIndex = args[1].value // 0-based index of playing clip, or -1 if none
			
			// A clip starting playback cancels any fade out still running on this track
			if (playingClipIndex >= 0) {
				this.cancelFadeOutOnTrack(trackIndex)
			}

			// A single message describes the whole track: at most one slot plays at a time,
			// so refresh the playing state of every scene on that track
			for (let s = 1; s <= this.numScenes; s++) {
				this.clipPlaying[`${track}_${s}`] = (s - 1) === playingClipIndex
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

			this.clipSlotHasClip[`${track + 1}_${clip + 1}`] = hasClip

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

		// ============================================================
		// CLIP LOOP, MARKER & WARPING HANDLERS
		// ============================================================
		} else if (address === '/live/clip/get/playing_position') {
			// args: [track, clip, position]
			const track = args[0].value
			const clip = args[1].value
			const position = args[2].value
			
			// Check if we have a pending loop/marker set operation
			if (this.pendingLoopSet && 
				this.pendingLoopSet.track === track && 
				this.pendingLoopSet.clip === clip) {
				
				const setType = this.pendingLoopSet.type
				let oscAddress = ''
				
				switch (setType) {
					case 'loop_start':
						oscAddress = '/live/clip/set/loop_start'
						break
					case 'loop_end':
						oscAddress = '/live/clip/set/loop_end'
						break
					case 'start_marker':
						oscAddress = '/live/clip/set/start_marker'
						break
					case 'end_marker':
						oscAddress = '/live/clip/set/end_marker'
						break
				}
				
				if (oscAddress) {
					this.sendOsc(oscAddress, [
						{ type: 'i', value: track },
						{ type: 'i', value: clip },
						{ type: 'f', value: position }
					])
					this.log('info', `Set ${setType} to ${position.toFixed(2)} beats for clip ${track + 1}_${clip + 1}`)
				}
				
				this.pendingLoopSet = null
			}
			
			// Update variable
			const varId = `clip_position_${track + 1}_${clip + 1}`
			this.checkVariableDefinition(varId, `Clip Position ${track + 1}-${clip + 1}`)
			this.setVariableValues({ [varId]: position.toFixed(2) })

		} else if (address === '/live/clip/get/loop_start') {
			// args: [track, clip, loop_start]
			const track = args[0].value + 1
			const clip = args[1].value + 1
			const loopStart = args[2].value
			
			const varId = `clip_loop_start_${track}_${clip}`
			this.checkVariableDefinition(varId, `Clip Loop Start ${track}-${clip}`)
			this.setVariableValues({ [varId]: loopStart.toFixed(2) })

		} else if (address === '/live/clip/get/loop_end') {
			// args: [track, clip, loop_end]
			const track = args[0].value + 1
			const clip = args[1].value + 1
			const loopEnd = args[2].value
			
			const varId = `clip_loop_end_${track}_${clip}`
			this.checkVariableDefinition(varId, `Clip Loop End ${track}-${clip}`)
			this.setVariableValues({ [varId]: loopEnd.toFixed(2) })

		} else if (address === '/live/clip/get/start_marker') {
			// args: [track, clip, start_marker]
			const track = args[0].value + 1
			const clip = args[1].value + 1
			const startMarker = args[2].value
			
			const varId = `clip_start_marker_${track}_${clip}`
			this.checkVariableDefinition(varId, `Clip Start Marker ${track}-${clip}`)
			this.setVariableValues({ [varId]: startMarker.toFixed(2) })

		} else if (address === '/live/clip/get/end_marker') {
			// args: [track, clip, end_marker]
			const track = args[0].value + 1
			const clip = args[1].value + 1
			const endMarker = args[2].value
			
			const varId = `clip_end_marker_${track}_${clip}`
			this.checkVariableDefinition(varId, `Clip End Marker ${track}-${clip}`)
			this.setVariableValues({ [varId]: endMarker.toFixed(2) })

		} else if (address === '/live/clip/get/warping') {
			// args: [track, clip, warping]
			const track = args[0].value
			const clip = args[1].value
			const warping = args[2].value === 1 || args[2].value === true
			
			const varId = `clip_warping_${track + 1}_${clip + 1}`
			this.checkVariableDefinition(varId, `Clip Warping ${track + 1}-${clip + 1}`)
			
			// Check if we have a pending toggle operation
			if (this.pendingWarpingToggle && 
				this.pendingWarpingToggle.track === track && 
				this.pendingWarpingToggle.clip === clip) {
				
				// Toggle the current state and update variable immediately
				const newState = !warping
				this.sendOsc('/live/clip/set/warping', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip },
					{ type: 'i', value: newState ? 1 : 0 }
				])
				this.setVariableValues({ [varId]: newState ? 'On' : 'Off' })
				this.pendingWarpingToggle = null
			} else {
				// Normal update from GET request
				this.setVariableValues({ [varId]: warping ? 'On' : 'Off' })
			}
			
			this.checkFeedbacks('clip_warping')

		} else if (address === '/live/clip/get/looping') {
			// args: [track, clip, looping]
			const track = args[0].value
			const clip = args[1].value
			const looping = args[2].value === 1 || args[2].value === true
			
			const varId = `clip_looping_${track + 1}_${clip + 1}`
			this.checkVariableDefinition(varId, `Clip Looping ${track + 1}-${clip + 1}`)
			
			// Check if we have a pending toggle operation
			if (this.pendingLoopingToggle && 
				this.pendingLoopingToggle.track === track && 
				this.pendingLoopingToggle.clip === clip) {
				
				// Toggle the current state and update variable immediately
				const newState = !looping
				this.sendOsc('/live/clip/set/looping', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip },
					{ type: 'i', value: newState ? 1 : 0 }
				])
				this.setVariableValues({ [varId]: newState ? 'On' : 'Off' })
				this.pendingLoopingToggle = null
			} else {
				// Normal update from GET request
				this.setVariableValues({ [varId]: looping ? 'On' : 'Off' })
			}
			
			this.checkFeedbacks('clip_looping')

		} else if (address === '/live/track/get/mute') {
			// args: [track, mute]
			const track = args[0].value + 1
			// Live sends either an int (0/1) or a bool depending on the message source
			const mute = args[1].value === 1 || args[1].value === true

			this.trackMutes[track] = mute
			this.setVariableValues({ [`track_mute_${track}`]: mute ? 1 : 0 })
			this.checkFeedbacks('track_mute')

		} else if (address === '/live/device/get/parameter/value') {
			// args: [track, device, param, value]
			const track = args[0].value + 1
			const device = args[1].value + 1
			const param = args[2].value + 1
			const value = args[3].value
			
			this.deviceParameters[`${track}_${device}_${param}`] = value
			this.checkFeedbacks('device_active')

			const isSelected = this.selectedParameter !== null &&
				this.selectedParameter.track === track &&
				this.selectedParameter.device === device &&
				this.selectedParameter.parameter === param

			// Keep the selected parameter state current, the Toggle action relies on it
			if (isSelected) {
				this.selectedParameter.lastValue = value
				// Raw value is 0-1 normalized; expose as 0-100 for the ring gauge
				this.setVariableValues({ selected_parameter_value_percent: (value * 100).toFixed(1) })
			}

			// The numeric value carries no unit: ask for the display string Live shows in its UI
			const varId = `device_param_${track}_${device}_${param}`
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
			this.setVariableValues({
				[varId]: maxLevel.toFixed(2),
				[`track_meter_left_${track}`]: left.toFixed(2),
				[`track_meter_right_${track}`]: right.toFixed(2)
			})

			// Throttle feedback updates to reduce CPU load
			const now = Date.now()
			if (now - this.lastMeterUpdate >= this.meterUpdateInterval) {
				this.lastMeterUpdate = now
				this.checkFeedbacks('track_meter')
			}

		} else if (address === '/live/song/get/num_tracks') {
			this.numTracks = args[0].value
			this.isScanning = true
			this.log('info', `Scanning ${this.numTracks} tracks...`)
			this.fetchClipInfo()
		} else if (address === '/live/song/get/num_scenes') {
			this.numScenes = args[0].value
			this.isScanning = true
			this.log('info', `Scanning ${this.numScenes} scenes...`)
			this.fetchClipInfo()

		} else if (address === '/live/track/get/devices/name') {
			// args: [track_id, name1, name2, ...]
			const track = args[0].value + 1
			const names = []
			for (let i = 1; i < args.length; i++) {
				names.push(args[i].value)
			}
			this.deviceNames[track] = names
			
			// Schedule UI update (batched) instead of immediate initPresets
			this.scheduleUiUpdate()

			// Parameter 0 is the Device On/Off switch: listen to it right away so the
			// "Device (Plugin) Active" feedback lights up without any further user action
			for (let i = 0; i < names.length; i++) {
				this.listenToDeviceParameter(track - 1, i, 0)
			}

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
			
			// Remove existing parameters for this device to avoid duplicates on re-scan
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

		} else if (address === '/live/error') {
			// AbletonOSC error response - log but don't create variables
			const errorMsg = args.length > 0 ? args[0].value : 'Unknown error'
			this.log('warn', `AbletonOSC Error: ${errorMsg}`)

		} else {
			// Generic handler for unhandled OSC responses
			this.handleRawOscResponse(address, args)
		}
		} catch (e) {
			this.log('error', `Error processing OSC message: ${e.message}`)
		}
	}

	// ============================================================
	// RAW OSC HANDLING
	// ============================================================

	/**
	 * Handle unrecognized OSC responses and store them as variables
	 */
	handleRawOscResponse(address, args) {
		const varName = 'raw_' + address.replace(/^\//,'').replace(/\//g, '_')
		
		let displayValue = ''
		if (args.length === 0) {
			displayValue = '(no value)'
		} else if (args.length === 1) {
			displayValue = String(args[0].value)
		} else {
			displayValue = args.map(a => String(a.value)).join(', ')
		}
		
		const fullValue = args.map(a => `${a.type}:${a.value}`).join(', ')
		
		this.checkVariableDefinition(varName, `Raw: ${address}`)
		this.checkVariableDefinition(varName + '_full', `Raw Full: ${address}`)
		
		this.setVariableValues({
			[varName]: displayValue,
			[varName + '_full']: fullValue
		})
		
		this.setVariableValues({
			'last_raw_response': displayValue,
			'last_raw_address': address
		})
		
		this.log('debug', `Raw OSC Response: ${address} = ${displayValue}`)
	}

	// ============================================================
	// CLIP & PROJECT SCANNING
	// ============================================================

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

				// Start listening to volume (for the volume gauge)
				this.sendOsc('/live/track/start_listen/volume', [
					{ type: 'i', value: t }
				])
				msgCount++

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

				// Note: Device parameter listeners are set up when we receive the devices/name response
				// This avoids "Index out of range" errors from requesting non-existent devices

				// Ensure variable definitions exist
				this.checkVariableDefinition(`track_meter_${t + 1}`, `Track Meter ${t + 1}`)
				this.checkVariableDefinition(`track_meter_left_${t + 1}`, `Track Meter Left ${t + 1}`)
				this.checkVariableDefinition(`track_meter_right_${t + 1}`, `Track Meter Right ${t + 1}`)
				this.checkVariableDefinition(`track_volume_${t + 1}`, `Track Volume ${t + 1}`)
				this.checkVariableDefinition(`track_mute_${t + 1}`, `Track Mute ${t + 1}`)

				for (let s = 0; s < sCount; s++) {
					// First check if the slot holds a clip (the response triggers the name/color fetch)
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
		}, 200)
	}

	// ============================================================
	// VARIABLE MANAGEMENT
	// ============================================================

	/**
	 * Ensure a variable definition exists, creating it if needed
	 * Updates are batched to avoid performance issues
	 */
	checkVariableDefinition(id, name) {
		if (!this.variableIds.has(id)) {
			this.variableIds.add(id)
			this.variableDefinitions[id] = { name: name }
			this.variableDefinitionsDirty = true
			
			if (!this.variableDefinitionsTimer) {
				this.variableDefinitionsTimer = setTimeout(() => {
					if (this.variableDefinitionsDirty) {
						this.setVariableDefinitions(this.variableDefinitions)
						this.variableDefinitionsDirty = false
					}
					this.variableDefinitionsTimer = null
				}, 100)
			}
		}
	}

	// ============================================================
	// UI INITIALIZATION
	// ============================================================

	initActions() {
		// Generate Track Choices
		this.trackChoices = []
		for (let i = 1; i <= this.numTracks; i++) {
			const name = this.getVariableValue(`track_name_${i}`) || `Track ${i}`
			this.trackChoices.push({ id: i, label: `${i}: ${name}` })
		}

		// Generate Clip Choices
		// A slot is identified by track and scene (the Session View row it sits on). Empty slots
		// are listed too, so that a button can target a slot that will be filled later.
		this.clipChoices = []
		for (let t = 1; t <= this.numTracks; t++) {
			const trackName = this.getVariableValue(`track_name_${t}`) || `Track ${t}`
			for (let s = 1; s <= this.numScenes; s++) {
				const slotName = this.clipNames[`${t}_${s}`] || `Scene ${s}`
				this.clipChoices.push({ id: `${t}_${s}`, label: `${trackName} - ${slotName}` })
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

	// ============================================================
	// DEVICE PARAMETER SUBSCRIPTIONS
	// ============================================================

	/**
	 * Subscribe to a device parameter so Live pushes its value on every change.
	 * Indexes are 0-based, as expected by AbletonOSC.
	 *
	 * Subscriptions are never released: several feedbacks and actions can watch the same
	 * parameter, so unsubscribing would need reference counting for a negligible gain.
	 * They are replayed on reconnect (see initOsc) and dropped when the instance is destroyed.
	 *
	 * By default an already-known subscription is not re-sent, because feedback callbacks call
	 * this on every evaluation. Pass `force` from button presses instead: AbletonOSC replaces a
	 * duplicate listener rather than stacking one, and answers with the current value, so a
	 * re-send costs nothing and recovers from a subscription Live silently lost (another set
	 * loaded, Live restarted) - which our bookkeeping alone cannot detect.
	 *
	 * @param {number} track - Track index (0-based)
	 * @param {number} device - Device index (0-based)
	 * @param {number} parameter - Parameter index (0-based)
	 * @param {{ force?: boolean }} [options]
	 */
	listenToDeviceParameter(track, device, parameter, { force = false } = {}) {
		const key = `${track}_${device}_${parameter}`
		if (this.activeParameterListeners.has(key) && !force) return

		this.activeParameterListeners.add(key)
		this.log('debug', `Subscribing to device parameter: ${key}`)

		this.sendOsc('/live/device/start_listen/parameter/value', [
			{ type: 'i', value: track },
			{ type: 'i', value: device },
			{ type: 'i', value: parameter }
		])
	}

	// ============================================================
	// UTILITIES
	// ============================================================

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

	/**
	 * Schedule a debounced UI update
	 * Uses longer delay during scanning to batch all updates
	 */
	scheduleUiUpdate() {
		if (this.updateDebounceTimer) {
			clearTimeout(this.updateDebounceTimer)
		}
		
		const delay = this.isScanning ? 1000 : 250
		
		this.updateDebounceTimer = setTimeout(() => {
			const startTime = Date.now()
			
			this.initActions()
			this.initFeedbacks()
			this.initPresets()
			
			const elapsed = Date.now() - startTime
			this.log('debug', `UI update completed in ${elapsed}ms`)
			
			if (this.isScanning) {
				this.isScanning = false
				this.log('info', `Scan complete. ${this.numTracks} tracks, ${this.numScenes} scenes.`)
			}
			
			this.updateDebounceTimer = null
		}, delay)
	}
}

module.exports = AbletonOSCInstance
