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
		this.trackStoredVolumes = {}
		this.variableDefinitions = []
		this.numTracks = 8
		this.numScenes = 8
		this.activeFades = {}
	}

	async init(config) {
		this.config = config

		this.updateStatus(InstanceStatus.Connecting)

		this.initOsc()
		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.initPresets()
	}


	async destroy() {
		// Stop all active fades
		for (const id in this.activeFades) {
			if (this.activeFades[id].interval) {
				clearInterval(this.activeFades[id].interval)
			}
		}
		this.activeFades = {}

		if (this.fetchTimeout) {
			clearTimeout(this.fetchTimeout)
			this.fetchTimeout = null
		}

		if (this.oscPort) {
			try {
				for (let t = 0; t < this.numTracks; t++) {
					this.sendOsc('/live/track/stop_listen/output_meter_left', [{ type: 'i', value: t }])
					this.sendOsc('/live/track/stop_listen/output_meter_right', [{ type: 'i', value: t }])
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

	startFade(id, startValue) {
		const fade = this.activeFades[id]
		if (!fade) return

		fade.state = 'fading'
		
		// Determine Peak/Target Volume logic for Toggle Fades
		let peakVolume = startValue
		
		if (fade.subtype === 'toggle') {
			if (fade.targetVolume !== undefined) {
				// We are interrupting, so we know the target
				peakVolume = fade.targetVolume
			} else {
				// First time or fresh fade
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
			}
			// For the math to work, we treat 'startValue' in the fade object as the Peak Volume
			fade.startValue = peakVolume
		} else {
			fade.startValue = startValue
		}

		fade.startTime = Date.now()

		// Calculate initial progress if we are interrupting (to avoid jumps)
		// If we are at 'startValue' (OSC volume) and we want to go to 'peakVolume' (fade.startValue)
		// We need to find the 'elapsed' time that corresponds to this position on the curve.
		
		let initialProgress = 0
		
		if (fade.subtype === 'toggle') {
			// Current Volume from OSC = startValue (argument)
			// Target Peak = fade.startValue
			
			if (fade.direction === 'out') {
				// Curve: val = peak * (remaining * remaining)
				// val / peak = remaining^2
				// remaining = sqrt(val / peak)
				// progress = 1 - remaining
				if (fade.startValue > 0.001) {
					const ratio = Math.max(0, Math.min(1, startValue / fade.startValue))
					const remaining = Math.sqrt(ratio)
					initialProgress = 1.0 - remaining
				}
			} else {
				// Curve: val = peak * (1 - p*p) where p = 1 - progress
				// val / peak = 1 - p*p
				// p*p = 1 - (val / peak)
				// p = sqrt(1 - ratio)
				// progress = 1 - p
				if (fade.startValue > 0.001) {
					const ratio = Math.max(0, Math.min(1, startValue / fade.startValue))
					const p = Math.sqrt(1.0 - ratio)
					initialProgress = 1.0 - p
				}
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
				if (fade.subtype !== 'toggle') {
					this.sendOsc('/live/track/set/volume', [
						{ type: 'i', value: fade.track },
						{ type: 'f', value: 0.0 }
					])
				}
			}
		}

		// Interval for updates (e.g. every 10ms for smoother fades)
		const intervalTime = 10
		
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

		} else if (address === '/live/clip/get/color') {
			// args: [track, clip, color]
			const track = args[0].value + 1
			const clip = args[1].value + 1
			const color = args[2].value
			
			this.clipColors[`${track}_${clip}`] = color
			this.checkFeedbacks('clip_color')

		} else if (address === '/live/track/get/name') {
			// args: [track, name]
			const track = args[0].value + 1
			const name = args[1].value
			
			const varId = `track_name_${track}`
			this.checkVariableDefinition(varId, `Track Name ${track}`)
			this.setVariableValues({ [varId]: name })

		} else if (address === '/live/track/get/output_meter_left' || address === '/live/track/get/output_meter_right') {
			// args: [track, level]
			const track = args[0].value + 1
			const level = args[1].value
			
			// Log level occasionally to debug "0 or 1" issue
			// if (Math.random() < 0.05) {
			// 	this.log('info', `Meter sample: Track ${track} Level ${level} (Type: ${typeof level})`)
			// }

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
			// We assume variable is defined during init or first pass to save CPU
			// this.checkVariableDefinition(varId, `Track Meter ${track}`)
			this.setVariableValues({ [varId]: maxLevel.toFixed(2) })
			
			this.checkFeedbacks('track_meter')
			this.checkFeedbacks('track_meter_visual')

		} else if (address === '/live/song/get/num_tracks') {
			this.numTracks = args[0].value
			this.initPresets()
			this.log('info', `Updated presets for ${this.numTracks} tracks`)
			this.fetchClipInfo()
		} else if (address === '/live/song/get/num_scenes') {
			this.numScenes = args[0].value
			this.initPresets()
			this.log('info', `Updated presets for ${this.numScenes} scenes`)
			this.fetchClipInfo()
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

				// Start listening to meters
				this.sendOsc('/live/track/start_listen/output_meter_left', [
					{ type: 'i', value: t }
				])
				this.sendOsc('/live/track/start_listen/output_meter_right', [
					{ type: 'i', value: t }
				])
				msgCount += 2

				// Ensure variable definition exists
				const varId = `track_meter_${t + 1}`
				this.checkVariableDefinition(varId, `Track Meter ${t + 1}`)

				for (let s = 0; s < sCount; s++) {
					// Request Name
					this.sendOsc('/live/clip/get/name', [
						{ type: 'i', value: t },
						{ type: 'i', value: s }
					])
					// Request Color
					this.sendOsc('/live/clip/get/color', [
						{ type: 'i', value: t },
						{ type: 'i', value: s }
					])
					msgCount += 2

					if (msgCount >= 20) {
						await new Promise(resolve => setTimeout(resolve, 10))
						msgCount = 0
					}
				}
			}
		}, 200)
	}

	checkVariableDefinition(id, name) {
		if (!this.variableDefinitions.find(v => v.variableId === id)) {
			this.variableDefinitions.push({ variableId: id, name: name })
			this.setVariableDefinitions(this.variableDefinitions)
		}
	}

	initActions() {
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

	sendOsc(address, args) {
		if (this.oscPort) {
			this.oscPort.send({
				address: address,
				args: args
			})
		}
	}
}

runEntrypoint(AbletonOSCInstance, [])
