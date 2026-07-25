#!/usr/bin/env node
/**
 * Offline smoke test for the module - run with `yarn smoke`.
 *
 * Companion only reports a broken definition once the module is loaded in a live instance, and
 * several classes of mistake (removed option properties, a callback throwing on a path nobody
 * clicked) never show up locally otherwise. This script drives the real module class against a
 * fake instance context and a simulated Ableton project, then checks:
 *
 *   1. the definition rules the Companion host enforces at startup, so its log warnings appear
 *      here instead (see hasAnyOldRequiredProperties / hasAnyOldIsVisibleFunctions in
 *      bitfocus/companion-module-base, packages/host/src/internal/{actions,feedback}.ts);
 *   2. that every preset only references actions and feedbacks that exist;
 *   3. that every action and feedback callback runs without throwing, using its default options;
 *   4. that inbound OSC messages are processed without error.
 *
 * It does not open a socket and never talks to Ableton: `sendOsc` is captured instead.
 */

const AbletonOSCInstance = require('../main.js')

const problems = []
const fail = (msg) => problems.push(msg)

// ============================================================
// FAKE INSTANCE CONTEXT
// ============================================================

// InstanceBase delegates every set*Definitions call to the context it is constructed with, and
// refuses to be built without one. Providing a fake lets us instantiate the real module class,
// so the harness stays in sync with main.js instead of duplicating its constructor.
const captured = {}
const variableValues = {}

// Module logging goes through this global sink rather than the context, and the host replaces it
// the same way. Set it before constructing anything, InstanceBase logs from its constructor.
const logged = []
global.COMPANION_LOGGER = (_source, level, message) => logged.push({ level, message })

const context = {
	id: 'smoke',
	_isInstanceContext: true,
	updateStatus: () => {},
	setActionDefinitions: (actions) => (captured.actions = actions),
	setFeedbackDefinitions: (feedbacks) => (captured.feedbacks = feedbacks),
	setPresetDefinitions: (structure, presets) => (captured.presets = { structure, presets }),
	setVariableDefinitions: (variables) => (captured.variables = variables),
	setVariableValues: (values) => Object.assign(variableValues, values),
	getVariableValue: (id) => variableValues[id],
	checkFeedbacks: () => {},
	saveConfig: () => {},
}

const self = new AbletonOSCInstance(context)

// Capture OSC traffic rather than opening a socket
const sent = []
self.oscPort = { send: (message) => sent.push(message) }

// ============================================================
// SIMULATED PROJECT (as it would look after "Scan Project")
// ============================================================

self.numTracks = 2
self.numScenes = 2
variableValues.track_name_1 = 'Cam 1 Mic'
variableValues.track_name_2 = 'Music'
self.clipNames = { '1_1': 'Jingle', '1_2': 'Bed', '2_1': 'Song' }
self.clipSlotHasClip = { '1_1': true, '1_2': true, '2_1': true, '2_2': false }
self.deviceNames = { 1: ['Compressor'], 2: ['EQ Eight'] }
self.knownParameters = [
	{ id: '1_1_1', label: 'Cam 1 Mic > Compressor > Device On' },
	{ id: '1_1_2', label: 'Cam 1 Mic > Compressor > Threshold' },
]

// ============================================================
// CHECKS
// ============================================================

/**
 * Replicate the option validation the Companion host runs when definitions are registered.
 * Anything reported here is a warning the user would otherwise only see in the Companion log.
 */
function checkOptions(kind, id, options) {
	const seenIds = new Set()

	for (const option of options || []) {
		if (seenIds.has(option.id)) fail(`${kind} ${id}: duplicate option id "${option.id}"`)
		seenIds.add(option.id)

		if ('required' in option && typeof option.required === 'boolean') {
			fail(`${kind} ${id}: option "${option.id}" uses \`required\`, removed in API 2.x`)
		}
		if ('isVisible' in option && option.isVisible) {
			fail(`${kind} ${id}: option "${option.id}" uses the \`isVisible\` function, use isVisibleExpression`)
		}
		if (option.type === 'number' && (typeof option.min !== 'number' || typeof option.max !== 'number')) {
			fail(`${kind} ${id}: number option "${option.id}" is missing min/max, both are mandatory`)
		}
		if (option.type === 'dropdown' && !Array.isArray(option.choices)) {
			fail(`${kind} ${id}: dropdown option "${option.id}" has no choices array`)
		}
	}
}

function checkDefinitions() {
	for (const [id, def] of Object.entries(captured.actions)) {
		checkOptions('action', id, def.options)
		if ('optionsToIgnoreForSubscribe' in def) {
			fail(`action ${id}: \`optionsToIgnoreForSubscribe\` was removed, use optionsToMonitorForSubscribe`)
		}
	}

	for (const [id, def] of Object.entries(captured.feedbacks)) {
		checkOptions('feedback', id, def.options)
		// Feedbacks kept `unsubscribe` but lost `subscribe` in API 2.x: set subscriptions up in the callback
		if (typeof def.subscribe === 'function') fail(`feedback ${id}: \`subscribe\` is no longer supported`)
		if (def.type === 'advanced' && !Array.isArray(def.affectedProperties)) {
			fail(`feedback ${id}: advanced feedback must declare \`affectedProperties\``)
		}
		if (typeof def.description === 'string' && def.description.match(/change style/)) {
			fail(`feedback ${id}: description mentions "change style", which the host flags`)
		}
	}
}

function checkPresets() {
	const { structure, presets } = captured.presets

	for (const [presetId, preset] of Object.entries(presets)) {
		for (const step of preset.steps || []) {
			for (const action of [...(step.down || []), ...(step.up || [])]) {
				if (!captured.actions[action.actionId]) {
					fail(`preset ${presetId}: references unknown action "${action.actionId}"`)
				}
			}
		}

		for (const feedback of preset.feedbacks || []) {
			if (!captured.feedbacks[feedback.feedbackId]) {
				fail(`preset ${presetId}: references unknown feedback "${feedback.feedbackId}"`)
			}

			// A raw value here is silently dropped by the host, taking the whole feedback with it
			for (const override of feedback.styleOverrides || []) {
				if (typeof override.override !== 'object' || typeof override.override.isExpression !== 'boolean') {
					fail(`preset ${presetId}: styleOverride on "${feedback.feedbackId}" must be {isExpression, value}`)
				}
			}
		}

		// Grouping moved into the structure argument, a leftover category would be ignored
		if (preset.category !== undefined) fail(`preset ${presetId}: still carries a \`category\` field`)
	}

	for (const section of structure) {
		for (const presetId of section.definitions) {
			if (!presets[presetId]) fail(`section "${section.id}": references unknown preset "${presetId}"`)
		}
	}
}

async function runCallbacks() {
	const defaultOptions = (def) => Object.fromEntries((def.options || []).map((o) => [o.id, o.default]))

	for (const [id, def] of Object.entries(captured.actions)) {
		try {
			await def.callback({ actionId: id, options: defaultOptions(def) })
		} catch (e) {
			fail(`action ${id}: callback threw - ${e.message}`)
		}
	}

	for (const [id, def] of Object.entries(captured.feedbacks)) {
		try {
			def.callback({ feedbackId: id, type: def.type, id: 'x', controlId: 'y', options: defaultOptions(def) })
		} catch (e) {
			fail(`feedback ${id}: callback threw - ${e.message}`)
		}
	}

	// The "Create Variable for this parameter?" paths touch variableDefinitions, whose shape
	// changed in API 2.x - they are not reached by the default options above
	try {
		await captured.actions.device_set_parameter.callback({
			options: { parameterId: '1_1_2', value: '75', create_variable: true },
		})
		await captured.actions.device_parameter_step.callback({
			options: { parameterId: '1_1_2', step: '5', create_variable: true },
		})
		await captured.actions.select_device_parameter.callback({
			options: { parameterId: '1_1_1', createVariable: true },
		})
	} catch (e) {
		fail(`create-variable path threw - ${e.message}`)
	}
}

/**
 * Selecting a parameter must refresh every selected_parameter_* variable, including when that
 * parameter is already subscribed. AbletonOSC only echoes a value when a listener is first
 * created, so a selection that emits no request would leave the previous parameter's values on
 * screen. Device On/Off parameters are subscribed during the scan, so this is the common case.
 */
async function checkParameterSelectionRefresh() {
	self.listenToDeviceParameter(0, 0, 0)

	const before = sent.length
	await captured.actions.select_device_parameter.callback({
		options: { parameterId: '1_1_1', createVariable: false },
	})
	const requested = sent.slice(before).map((message) => message.address)

	for (const address of ['/live/device/get/parameter/value', '/live/device/get/parameter/value_string']) {
		if (!requested.includes(address)) {
			fail(`select_device_parameter on an already-subscribed parameter did not request ${address}`)
		}
	}
}

function replayOscMessages() {
	// Minimal type tagging: only the values matter to processOscMessage
	const rx = (address, values) =>
		self.processOscMessage({
			address,
			args: values.map((value) => ({ type: typeof value === 'string' ? 's' : 'f', value })),
		})

	rx('/live/track/get/mute', [0, 1])
	rx('/live/track/get/volume', [0, 0.7])
	rx('/live/clip_slot/get/has_clip', [0, 0, 1])
	rx('/live/clip/get/name', [0, 0, 'Jingle'])
	rx('/live/clip/get/color', [0, 0, 16711680])
	rx('/live/track/get/name', [0, 'Cam 1 Mic'])
	rx('/live/track/get/playing_slot_index', [0, 0])
	rx('/live/clip/get/looping', [0, 0, 1])
	rx('/live/clip/get/warping', [0, 0, 0])
	rx('/live/device/get/parameter/value', [0, 0, 0, 0.9])
	rx('/live/device/get/parameter/value_string', [0, 0, 0, '-6.0 dB'])
	rx('/live/track/get/output_meter_left', [0, 0.4])
	rx('/live/track/get/output_meter_right', [0, 0.3])
	rx('/live/error', ['Index out of range'])
	rx('/live/song/get/tempo', [120])

	// processOscMessage swallows exceptions into an error log, so inspect those too
	for (const { level, message } of logged) {
		if (level === 'error') fail(`OSC processing logged an error - ${message}`)
	}
}

function teardown() {
	if (self.blinkInterval) clearInterval(self.blinkInterval)
	if (self.fetchTimeout) clearTimeout(self.fetchTimeout)
	if (self.updateDebounceTimer) clearTimeout(self.updateDebounceTimer)
	if (self.variableDefinitionsTimer) clearTimeout(self.variableDefinitionsTimer)
	for (const id in self.trackDelays) clearTimeout(self.trackDelays[id])
	for (const id in self.activeFades) {
		if (self.activeFades[id].interval) clearInterval(self.activeFades[id].interval)
	}
}

// ============================================================
// RUN
// ============================================================

async function main() {
	self.initActions()
	self.initFeedbacks()
	self.initVariables()
	self.initPresets()

	// The Update* modules are async functions, let their microtasks settle
	await new Promise((resolve) => setImmediate(resolve))

	checkDefinitions()
	checkPresets()
	await runCallbacks()
	await checkParameterSelectionRefresh()
	replayOscMessages()
	teardown()

	console.log(`actions:   ${Object.keys(captured.actions).length}`)
	console.log(`feedbacks: ${Object.keys(captured.feedbacks).length}`)
	console.log(`variables: ${Object.keys(captured.variables).length}`)
	console.log(`presets:   ${Object.keys(captured.presets.presets).length} in ${captured.presets.structure.length} sections`)
	console.log(`OSC sent:  ${sent.length} messages`)

	if (problems.length > 0) {
		console.error(`\n${problems.length} problem(s) found:`)
		for (const problem of problems) console.error(`  - ${problem}`)
		process.exit(1)
	}

	console.log('\nSmoke test passed.')
}

main().catch((e) => {
	console.error('Smoke test crashed:', e)
	process.exit(1)
})
