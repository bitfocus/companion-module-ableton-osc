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
		if (this.oscPort) {
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
		fade.startValue = startValue
		fade.startTime = Date.now()

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
				this.sendOsc('/live/track/set/volume', [
					{ type: 'i', value: fade.track },
					{ type: 'f', value: 0.0 }
				])
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
						this.sendOsc('/live/track/stop_all_clips', [
							{ type: 'i', value: fade.track }
						])
						// Restore volume
						this.sendOsc('/live/track/set/volume', [
							{ type: 'i', value: fade.track },
							{ type: 'f', value: fade.startValue }
						])
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
					// Quadratic fade in (Ease-In: starts slow, speeds up)
					// This gives more resolution in the low range (0-75%)
					newValue = fade.startValue * (progress * progress)
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
		const address = msg.address
		const args = msg.args

		this.log('debug', `OSC Received: ${address} ${JSON.stringify(args)}`)
		this.setVariableValues({ last_message: address })

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
	}

	fetchClipInfo() {
		// Limit to avoid flooding if project is huge
		const maxTracks = 64
		const maxScenes = 64
		
		const tCount = Math.min(this.numTracks, maxTracks)
		const sCount = Math.min(this.numScenes, maxScenes)

		this.log('info', `Fetching info for ${tCount} tracks and ${sCount} scenes`)
		
		for (let t = 0; t < tCount; t++) {
			// Request Track Name
			this.sendOsc('/live/track/get/name', [
				{ type: 'i', value: t }
			])

			// Start listening to meters
			this.sendOsc('/live/track/start_listen/output_meter_left', [
				{ type: 'i', value: t }
			])
			this.sendOsc('/live/track/start_listen/output_meter_right', [
				{ type: 'i', value: t }
			])

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
			}
		}
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
