import { InstanceBase, Regex, InstanceStatus } from '@companion-module/base'
import osc from 'osc'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpdatePresets } from './presets.js'

export { UpgradeScripts }

// ============================================================
// ABLETON OSC INSTANCE
// ============================================================

export default class AbletonOSCInstance extends InstanceBase {
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
		// Pending end-of-fade restores, so destroy() can cancel them
		this.restoreTimers = new Set()

		// Connection state. Binding the UDP port says nothing about Live, so the status only turns
		// OK once AbletonOSC answers, and goes back to Disconnected when it stays silent.
		this.livenessTimer = null
		this.lastReceivedAt = 0
		this.liveReachable = false
		this.probeOutstanding = false
		this.livenessProbeAddress = '/live/application/get/version'
		this.livenessProbeInterval = 2000
		this.livenessTimeout = 5000
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
		this.meterUpdateInterval = 50
		this.meterFlushTimer = null
		this.pendingMeterValues = {}

		// Scan limits: the project scan stops there, and so do the clip dropdowns
		this.maxScanTracks = 64
		this.maxScanScenes = 64
		// Choices the action/feedback definitions were last built from (see scheduleUiUpdate)
		this.definitionsSignature = ''
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
		this.stopLivenessCheck()

		// Stop all active fades
		for (const id in this.activeFades) {
			if (this.activeFades[id].interval) {
				clearInterval(this.activeFades[id].interval)
			}
		}
		this.activeFades = {}

		for (const timer of this.restoreTimers) {
			clearTimeout(timer)
		}
		this.restoreTimers.clear()

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

		if (this.meterFlushTimer) {
			clearTimeout(this.meterFlushTimer)
			this.meterFlushTimer = null
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
						{ type: 'i', value: parameter },
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
				default: '127.0.0.1',
			},
			{
				type: 'number',
				id: 'port',
				label: 'Target Port (Send)',
				width: 4,
				min: 1,
				max: 65535,
				default: 11000,
			},
			{
				type: 'number',
				id: 'receivePort',
				label: 'Receive Port (Listen)',
				width: 4,
				min: 1,
				max: 65535,
				default: 11001,
			},
		]
	}

	initOsc() {
		this.stopLivenessCheck()

		if (this.oscPort) {
			this.oscPort.close()
			delete this.oscPort
		}

		this.updateStatus(InstanceStatus.Connecting)

		if (!this.config.host || !this.config.port || !this.config.receivePort) {
			// Without a receive port osc.js would silently bind its default port (57121)
			this.updateStatus(InstanceStatus.BadConfig, 'Target IP, Target Port and Receive Port are required')
			return
		}

		this.oscPort = new osc.UDPPort({
			localAddress: '0.0.0.0',
			localPort: this.config.receivePort,
			remoteAddress: this.config.host,
			remotePort: this.config.port,
			metadata: true,
		})

		this.oscPort.on('ready', () => {
			this.log('info', `OSC port ${this.config.receivePort} open, waiting for AbletonOSC`)
			this.updateStatus(InstanceStatus.Connecting, 'Waiting for Ableton Live')

			// The port was re-created (config change or reconnect): Live no longer knows where
			// to push values, so replay every device parameter subscription
			this.replayParameterListeners()

			this.startLivenessCheck()
		})

		this.oscPort.on('error', (err) => {
			if (err.code) {
				// Socket error (port already in use, permission denied, ...): the connection is broken
				this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
				this.log('error', 'OSC Error: ' + err.message)
			} else {
				// osc.js reports packets it cannot encode or decode through the same event, but the
				// socket still works: log it without marking the connection as failed
				this.log('warn', 'OSC packet error: ' + err.message)
			}
		})

		this.oscPort.on('message', (oscMsg) => {
			this.markLiveReachable()

			// Our own liveness probe: keep it out of last_message and the debug log
			if (oscMsg.address === this.livenessProbeAddress && this.probeOutstanding) {
				this.probeOutstanding = false
				return
			}

			if (oscMsg.address === '/live/startup') {
				// AbletonOSC (re)started with Live: it forgot every subscription
				this.log('info', 'AbletonOSC started')
				this.replayParameterListeners()
			}

			this.processOscMessage(oscMsg)
		})

		this.oscPort.open()
	}

	/**
	 * Re-subscribe every device parameter listener, after Live lost them (new port, Live restart).
	 */
	replayParameterListeners() {
		for (const key of this.activeParameterListeners) {
			const [track, device, parameter] = key.split('_').map(Number)
			this.sendOsc('/live/device/start_listen/parameter/value', [
				{ type: 'i', value: track },
				{ type: 'i', value: device },
				{ type: 'i', value: parameter },
			])
		}
	}

	// ============================================================
	// CONNECTION STATUS
	// ============================================================

	/**
	 * Watch whether AbletonOSC answers. Any message from Live counts as a sign of life; when Live
	 * has been quiet for a while, a silent query is sent (/live/test would show a message in Live).
	 */
	startLivenessCheck() {
		this.stopLivenessCheck()
		this.liveReachable = false
		this.lastReceivedAt = 0
		this.livenessStartedAt = Date.now()
		this.sendLivenessProbe()

		this.livenessTimer = setInterval(() => {
			const now = Date.now()
			const quietSince = Math.max(this.lastReceivedAt, this.livenessStartedAt)

			if (now - quietSince >= this.livenessTimeout) {
				if (this.liveReachable || this.lastReceivedAt === 0) {
					this.liveReachable = false
					this.lastReceivedAt = -1 // report it only once until Live answers again
					this.updateStatus(
						InstanceStatus.Disconnected,
						`No reply from AbletonOSC at ${this.config.host}:${this.config.port}`,
					)
					this.log('warn', `No reply from AbletonOSC at ${this.config.host}:${this.config.port}`)
				}
			}

			if (now - quietSince >= this.livenessProbeInterval) {
				this.sendLivenessProbe()
			}
		}, this.livenessProbeInterval)
	}

	stopLivenessCheck() {
		if (this.livenessTimer) {
			clearInterval(this.livenessTimer)
			this.livenessTimer = null
		}
		this.probeOutstanding = false
	}

	sendLivenessProbe() {
		this.probeOutstanding = true
		this.sendOsc(this.livenessProbeAddress, [])
	}

	markLiveReachable() {
		this.lastReceivedAt = Date.now()
		if (!this.liveReachable) {
			this.liveReachable = true
			this.updateStatus(InstanceStatus.Ok)
			this.log('info', 'AbletonOSC is answering')
		}
	}

	// ============================================================
	// FADE MANAGEMENT
	// ============================================================

	/**
	 * Arm a standard fade (clip gain or track volume, in or out), replacing any fade already
	 * running on the same clip/track. The fade itself starts once Live answers with the current
	 * level (see startFade), so the caller then sends the matching get request.
	 *
	 * The level the clip/track had before any fade started (baseLevel) is handed over from the
	 * interrupted fade: otherwise the new fade would take the half-faded level as the original
	 * one, and the volume/gain would end up permanently lower.
	 *
	 * @param {string} id - Fade key, `track_<i>` or `clip_<t>_<c>`
	 * @param {object} fade - type, direction, track, clip (clip fades only) and duration
	 */
	armFade(id, fade) {
		const existingFade = this.activeFades[id]
		if (existingFade && existingFade.interval) {
			clearInterval(existingFade.interval)
		}

		// A "Fade by State" fade has no base level of its own: its On level is the track's normal
		// level, so a standard fade taking over resumes from the current level towards it
		let baseLevel
		if (existingFade) {
			baseLevel = existingFade.subtype === 'toggle' ? existingFade.onLevel : existingFade.baseLevel
		}

		this.activeFades[id] = {
			...fade,
			baseLevel,
			startTime: Date.now(),
			state: 'init',
		}
	}

	/**
	 * Run a callback after fadeStopRestoreDelay, keeping the timer so destroy() can cancel it.
	 *
	 * @param {function} callback
	 */
	scheduleFadeRestore(callback) {
		const timer = setTimeout(() => {
			this.restoreTimers.delete(timer)
			callback()
		}, this.fadeStopRestoreDelay)
		this.restoreTimers.add(timer)
	}

	/**
	 * Cancel every fade out running on a track (the track fade and any clip fade on it) and
	 * restore the level they started from.
	 * Called when a clip is fired on that track, either from an action or because Live reported
	 * a new playing slot: without this the new clip would inherit the fading-out volume, or a
	 * fading clip that was fired again would keep fading and then be stopped.
	 *
	 * "Fade by State" fades (subtype 'toggle') are excluded: they are driven by an external
	 * variable, which stays the authority on the track level.
	 *
	 * @param {number} trackIndex - Track index (0-based)
	 * @returns {boolean} true if a fade was actually cancelled
	 */
	cancelFadeOutOnTrack(trackIndex) {
		let cancelled = false

		for (const [id, fade] of Object.entries(this.activeFades)) {
			if (fade.track !== trackIndex || fade.direction !== 'out' || fade.subtype === 'toggle') continue

			if (fade.interval) {
				clearInterval(fade.interval)
			}
			delete this.activeFades[id]
			cancelled = true

			// A fade still waiting for Live's answer has not moved the level yet: nothing to restore
			if (typeof fade.baseLevel !== 'number') continue

			if (fade.type === 'clip') {
				this.sendOsc('/live/clip/set/gain', [
					{ type: 'i', value: fade.track },
					{ type: 'i', value: fade.clip },
					{ type: 'f', value: fade.baseLevel },
				])
				this.log('info', `Fade Out cancelled on clip ${fade.track + 1}-${fade.clip + 1} - clip fired, gain restored`)
			} else {
				this.sendOsc('/live/track/set/volume', [
					{ type: 'i', value: fade.track },
					{ type: 'f', value: fade.baseLevel },
				])
				this.log('info', `Fade Out cancelled on track ${trackIndex + 1} - clip fired, volume restored`)
			}
		}

		return cancelled
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
			offLevel: offLevel,
		}

		this.sendOsc('/live/track/get/volume', [{ type: 'i', value: track }])
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
				fade.startTime -= currentProgress * fade.duration

				this.log(
					'debug',
					`Fade ${id}: Starting from ${(startValue * 100).toFixed(1)}% (progress: ${(currentProgress * 100).toFixed(1)}%)`,
				)
			}
		} else {
			// Standard fade (clip gain or track volume). baseLevel is the level before any fade
			// started; an interrupted fade hands it over (see armFade), otherwise it is the level
			// Live reports now
			const interrupted = typeof fade.baseLevel === 'number'
			if (!interrupted) fade.baseLevel = startValue

			if (fade.direction === 'out') {
				// From wherever the level is now down to silence; baseLevel is restored at the end
				fromVolume = startValue
				toVolume = 0
			} else {
				// A clip fade in re-fires the clip, and a fresh track fade in starts from silence.
				// A track fade in that interrupts another fade resumes from the current level.
				fromVolume = fade.type === 'track' && interrupted ? startValue : 0
				toVolume = fade.baseLevel
			}
		}

		fade.fromVolume = fromVolume
		fade.toVolume = toVolume

		// A standard fade in from silence must drop the level first, before the clip is fired
		// (firing first would let the first frames through at full level)
		if (fade.direction === 'in' && fade.subtype !== 'toggle' && fromVolume === 0) {
			if (fade.type === 'clip') {
				this.sendOsc('/live/clip/set/gain', [
					{ type: 'i', value: fade.track },
					{ type: 'i', value: fade.clip },
					{ type: 'f', value: 0.0 },
				])
				this.sendOsc('/live/clip/fire', [
					{ type: 'i', value: fade.track },
					{ type: 'i', value: fade.clip },
				])
			} else if (fade.type === 'track') {
				this.sendOsc('/live/track/set/volume', [
					{ type: 'i', value: fade.track },
					{ type: 'f', value: 0.0 },
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
				// Standard fades: quadratic ease-out in both directions
				const remaining = 1.0 - progress
				if (fade.direction === 'out') {
					newValue = fade.fromVolume * (remaining * remaining)
				} else {
					newValue = fade.fromVolume + (fade.toVolume - fade.fromVolume) * (1.0 - remaining * remaining)
				}
			}

			if (progress >= 1.0) {
				// Finished
				clearInterval(fade.interval)

				if (fade.type === 'clip') {
					if (fade.direction === 'out') {
						this.sendOsc('/live/clip/stop', [
							{ type: 'i', value: fade.track },
							{ type: 'i', value: fade.clip },
						])
						// Restore the pre-fade gain, slightly delayed so Live has time to actually
						// stop the clip first - otherwise the gain jumps back up before playback
						// stops and produces an audible "pop"
						this.scheduleFadeRestore(() => {
							this.sendOsc('/live/clip/set/gain', [
								{ type: 'i', value: fade.track },
								{ type: 'i', value: fade.clip },
								{ type: 'f', value: fade.baseLevel },
							])
						})
					} else {
						this.sendOsc('/live/clip/set/gain', [
							{ type: 'i', value: fade.track },
							{ type: 'i', value: fade.clip },
							{ type: 'f', value: fade.toVolume },
						])
					}
				} else if (fade.type === 'track') {
					if (fade.subtype === 'toggle') {
						// Toggle fade: set to exact target level
						this.sendOsc('/live/track/set/volume', [
							{ type: 'i', value: fade.track },
							{ type: 'f', value: fade.toVolume },
						])
					} else {
						// Standard track fade
						if (fade.direction === 'out') {
							// Stop clips first
							this.sendOsc('/live/track/stop_all_clips', [{ type: 'i', value: fade.track }])
							// Restore the pre-fade volume slightly delayed so the clips actually stop
							// before the fader jumps back up - otherwise the volume rises before
							// playback stops and produces an audible "pop"
							this.scheduleFadeRestore(() => {
								this.sendOsc('/live/track/set/volume', [
									{ type: 'i', value: fade.track },
									{ type: 'f', value: fade.baseLevel },
								])
							})
						} else {
							// Fade in: ensure we hit target exactly
							this.sendOsc('/live/track/set/volume', [
								{ type: 'i', value: fade.track },
								{ type: 'f', value: fade.toVolume },
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
						{ type: 'f', value: newValue },
					])
				} else if (fade.type === 'track') {
					this.sendOsc('/live/track/set/volume', [
						{ type: 'i', value: fade.track },
						{ type: 'f', value: newValue },
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
				const trackIndex = args[0].value // 0-based
				const track = trackIndex + 1 // 1-based for display
				const playingClipIndex = args[1].value // 0-based index of playing clip, or -1 if none

				// A clip starting playback cancels any fade out still running on this track
				if (playingClipIndex >= 0) {
					this.cancelFadeOutOnTrack(trackIndex)
				}

				// A single message describes the whole track: at most one slot plays at a time,
				// so refresh the playing state of every scene on that track
				for (let s = 1; s <= this.numScenes; s++) {
					this.clipPlaying[`${track}_${s}`] = s - 1 === playingClipIndex
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
						{ type: 'i', value: clip },
					])
					this.sendOsc('/live/clip/get/color', [
						{ type: 'i', value: track },
						{ type: 'i', value: clip },
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
				if (this.pendingLoopSet && this.pendingLoopSet.track === track && this.pendingLoopSet.clip === clip) {
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
							{ type: 'f', value: position },
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
				if (
					this.pendingWarpingToggle &&
					this.pendingWarpingToggle.track === track &&
					this.pendingWarpingToggle.clip === clip
				) {
					// Toggle the current state and update variable immediately
					const newState = !warping
					this.sendOsc('/live/clip/set/warping', [
						{ type: 'i', value: track },
						{ type: 'i', value: clip },
						{ type: 'i', value: newState ? 1 : 0 },
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
				if (
					this.pendingLoopingToggle &&
					this.pendingLoopingToggle.track === track &&
					this.pendingLoopingToggle.clip === clip
				) {
					// Toggle the current state and update variable immediately
					const newState = !looping
					this.sendOsc('/live/clip/set/looping', [
						{ type: 'i', value: track },
						{ type: 'i', value: clip },
						{ type: 'i', value: newState ? 1 : 0 },
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

				const isSelected =
					this.selectedParameter !== null &&
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
						{ type: 'i', value: param - 1 },
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

				if (
					this.selectedParameter &&
					this.selectedParameter.track === track &&
					this.selectedParameter.device === device &&
					this.selectedParameter.parameter === param
				) {
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

				// Live sends both channels of every track about 30 times a second: buffer the values
				// and push them, with the feedback check, at most once per meterUpdateInterval. The
				// flush runs after the last message too, so a meter falling back to 0 is never missed.
				this.pendingMeterValues[`track_meter_${track}`] = maxLevel.toFixed(2)
				this.pendingMeterValues[`track_meter_left_${track}`] = left.toFixed(2)
				this.pendingMeterValues[`track_meter_right_${track}`] = right.toFixed(2)

				if (!this.meterFlushTimer) {
					this.meterFlushTimer = setTimeout(() => {
						this.meterFlushTimer = null
						this.setVariableValues(this.pendingMeterValues)
						this.pendingMeterValues = {}
						this.checkFeedbacks('track_meter')
					}, this.meterUpdateInterval)
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
						{ type: 'i', value: i },
					])
				}
			} else if (address === '/live/device/get/parameters/name') {
				// args: [track, device, name1, name2, ...]
				const track = args[0].value + 1
				const device = args[1].value + 1

				// Remove existing parameters for this device to avoid duplicates on re-scan
				const prefix = `${track}_${device}_`
				this.knownParameters = this.knownParameters.filter((p) => !p.id.startsWith(prefix))

				const trackName = this.getVariableValue(`track_name_${track}`) || `Track ${track}`
				const deviceName = (this.deviceNames[track] && this.deviceNames[track][device - 1]) || `Device ${device}`

				for (let i = 2; i < args.length; i++) {
					const paramName = args[i].value
					const paramIndex = i - 1 // args starts at 2 for param 1

					// Skip "Num" or empty names if any
					if (!paramName) continue

					this.knownParameters.push({
						id: `${track}_${device}_${paramIndex}`,
						label: `${trackName} > ${deviceName} > ${paramName}`,
					})
				}

				// Update actions to refresh the dropdown (debounced)
				this.scheduleUiUpdate()
			} else if (address === '/live/error') {
				// AbletonOSC error response - log but don't create variables
				const errorMsg = args.length > 0 ? args[0].value : 'Unknown error'
				this.log('warn', `AbletonOSC Error: ${errorMsg}`)
			} else if (address === '/live/startup' || address === '/live/application/get/average_process_usage') {
				// AbletonOSC announces itself with these two messages when it starts (handled in
				// initOsc): they are not answers to a raw command, so they get no raw_ variable
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
		const varName = 'raw_' + address.replace(/^\//, '').replace(/\//g, '_')

		let displayValue = ''
		if (args.length === 0) {
			displayValue = '(no value)'
		} else if (args.length === 1) {
			displayValue = String(args[0].value)
		} else {
			displayValue = args.map((a) => String(a.value)).join(', ')
		}

		const fullValue = args.map((a) => `${a.type}:${a.value}`).join(', ')

		this.checkVariableDefinition(varName, `Raw: ${address}`)
		this.checkVariableDefinition(varName + '_full', `Raw Full: ${address}`)

		this.setVariableValues({
			[varName]: displayValue,
			[varName + '_full']: fullValue,
		})

		this.setVariableValues({
			last_raw_response: displayValue,
			last_raw_address: address,
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
			const tCount = Math.min(this.numTracks, this.maxScanTracks)
			const sCount = Math.min(this.numScenes, this.maxScanScenes)

			this.log('info', `Fetching info for ${tCount} tracks and ${sCount} scenes`)

			let msgCount = 0

			for (let t = 0; t < tCount; t++) {
				// Request Track Name
				this.sendOsc('/live/track/get/name', [{ type: 'i', value: t }])
				msgCount++

				// Request Device Names
				this.sendOsc('/live/track/get/devices/name', [{ type: 'i', value: t }])
				msgCount++

				// Start listening to meters
				this.sendOsc('/live/track/start_listen/output_meter_left', [{ type: 'i', value: t }])
				this.sendOsc('/live/track/start_listen/output_meter_right', [{ type: 'i', value: t }])
				msgCount += 2

				// Start listening to volume (for the volume gauge)
				this.sendOsc('/live/track/start_listen/volume', [{ type: 'i', value: t }])
				msgCount++

				// Start listening to playing slot (much more efficient than listening to each clip)
				this.sendOsc('/live/track/start_listen/playing_slot_index', [{ type: 'i', value: t }])
				msgCount++

				// Start listening to mute
				this.sendOsc('/live/track/start_listen/mute', [{ type: 'i', value: t }])
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
						{ type: 'i', value: s },
					])
					msgCount++

					if (msgCount >= 100) {
						await new Promise((resolve) => setTimeout(resolve, 10))
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
		this.buildChoices()
		this.definitionsSignature = this.choicesSignature()
		UpdateActions(this)
	}

	/**
	 * Everything the action and feedback definitions are built from: when it hasn't changed,
	 * re-sending the definitions is pointless.
	 */
	choicesSignature() {
		return JSON.stringify([this.trackChoices, this.clipChoices, this.deviceChoices, this.knownParameters])
	}

	buildChoices() {
		// Generate Track Choices
		this.trackChoices = []
		for (let i = 1; i <= this.numTracks; i++) {
			const name = this.getVariableValue(`track_name_${i}`) || `Track ${i}`
			this.trackChoices.push({ id: i, label: `${i}: ${name}` })
		}

		// Generate Clip Choices
		// A slot is identified by track and scene (the Session View row it sits on). Empty slots
		// are listed too, so that a button can target a slot that will be filled later. The list
		// stops at the scan limits: beyond them a large set would put thousands of entries in
		// every clip dropdown.
		this.clipChoices = []
		const choiceTracks = Math.min(this.numTracks, this.maxScanTracks)
		const choiceScenes = Math.min(this.numScenes, this.maxScanScenes)
		for (let t = 1; t <= choiceTracks; t++) {
			const trackName = this.getVariableValue(`track_name_${t}`) || `Track ${t}`
			for (let s = 1; s <= choiceScenes; s++) {
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
						label: `T${trackId} > D${deviceIndex}: ${name}`,
					})
				})
			}
		}

		// Fallback if empty
		if (this.trackChoices.length === 0) this.trackChoices.push({ id: 1, label: 'Track 1' })
		if (this.deviceChoices.length === 0) this.deviceChoices.push({ id: '1_1', label: 'T1 > D1' })
	}

	initFeedbacks() {
		UpdateFeedbacks(this)
	}

	initVariables() {
		UpdateVariableDefinitions(this)
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
			{ type: 'i', value: parameter },
		])
	}

	// ============================================================
	// UTILITIES
	// ============================================================

	startBlink() {
		if (this.blinkInterval) clearInterval(this.blinkInterval)
		this.blinkInterval = setInterval(() => {
			this.blinkState = !this.blinkState
			// Only playing clips blink; a clip stopping is already re-evaluated by the
			// playing_slot_index handler
			if (Object.values(this.clipPlaying).some((playing) => playing === true || playing === 1)) {
				this.checkFeedbacks('clip_playing')
			}
		}, 500)
	}

	sendOsc(address, args) {
		if (!this.oscPort) return

		try {
			this.oscPort.send({
				address: address,
				args: args,
			})
		} catch (e) {
			// osc.js has already reported an encode error through the 'error' event; it then throws
			// while sending the missing buffer, which must not escape into an action callback
			this.log('warn', `Could not send OSC ${address}: ${e.message}`)
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

			// Clip names, devices and parameters keep arriving during a scan, but most of them
			// don't change any dropdown: only re-send the definitions when the choices changed
			this.buildChoices()
			const signature = this.choicesSignature()
			if (signature !== this.definitionsSignature) {
				this.definitionsSignature = signature
				UpdateActions(this)
				this.initFeedbacks()
			}
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
