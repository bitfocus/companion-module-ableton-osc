const { combineRgb } = require('@companion-module/base')

module.exports = async function (self) {
	const startTime = Date.now()
	const presets = {}

	const numTracks = self.numTracks || 8
	const numScenes = self.numScenes || 8

	// Skip generating clip presets if no scan data yet (speeds up initial load)
	const hasClipData = Object.keys(self.clipSlotHasClip || {}).length > 0

	// Helper to get track name
	const getTrackName = (t) => self.getVariableValue(`track_name_${t}`) || `Track ${t}`

	// Helper to get clip name
	const getClipName = (t, s) => self.clipNames?.[`${t}_${s}`] || `Scene ${s}`

	// Helper to check if clip exists
	const hasClip = (t, s) => self.clipSlotHasClip?.[`${t}_${s}`] === true

	// Helper to build a simple Background + Text layered preset (all buttons use `type: 'layered'`
	// with just these two elements - no Image/Image Buffers layer, unlike the auto-converted
	// legacy 'simple' style)
	const boxTextElements = (text, bgColor, textColor) => [
		{
			type: 'box',
			id: 'bg',
			name: 'Box',
			opacity: 100,
			x: 0, y: 0, width: 100, height: 100,
			color: bgColor
		},
		{
			type: 'text',
			id: 'label',
			name: 'Text',
			opacity: 100,
			x: 0, y: 0, width: 100, height: 100,
			text: text,
			fontsize: 30,
			fontsizeAllowShrink: true,
			color: textColor,
			halign: 'center',
			valign: 'center',
			outlineColor: 0xff000000
		}
	]

	// ============================================================
	// CLIPS / FIRE
	// ============================================================
	for (let t = 1; t <= numTracks; t++) {
		const trackName = getTrackName(t)
		for (let s = 1; s <= numScenes; s++) {
			// Skip if no scan data yet, or if clip doesn't exist
			if (!hasClipData || !hasClip(t, s)) {
				continue
			}

			const clipName = getClipName(t, s)

			presets[`clip_fire_${t}_${s}`] = {
				type: 'layered',
				category: `Clips / Fire / ${trackName}`,
				name: `Fire ${clipName}`,
				elements: boxTextElements(`$(ableton:clip_name_${t}_${s})`, combineRgb(0, 0, 0), combineRgb(255, 255, 255)),
				steps: [
					{
						down: [
							{
								actionId: 'fire_clip',
								options: { clipId: `${t}_${s}` }
							}
						],
						up: []
					}
				],
				feedbacks: [
					{
						feedbackId: 'clip_color',
						options: { clipId: `${t}_${s}` },
						styleOverrides: [
							{ elementId: 'bg', elementProperty: 'color', override: { isExpression: false, value: 'bgcolor' } }
						]
					},
					{
						feedbackId: 'clip_playing',
						options: { clipId: `${t}_${s}` },
						styleOverrides: [
							{ elementId: 'bg', elementProperty: 'color', override: { isExpression: false, value: combineRgb(0, 0, 0) } },
							{ elementId: 'label', elementProperty: 'color', override: { isExpression: false, value: combineRgb(255, 255, 255) } }
						]
					}
				]
			}
		}
	}

	// ============================================================
	// CLIPS / STOP
	// ============================================================
	for (let t = 1; t <= numTracks; t++) {
		const trackName = getTrackName(t)
		for (let s = 1; s <= numScenes; s++) {
			// Skip if no scan data yet, or if clip doesn't exist
			if (!hasClipData || !hasClip(t, s)) {
				continue
			}

			const clipName = getClipName(t, s)

			presets[`clip_stop_${t}_${s}`] = {
				type: 'layered',
				category: `Clips / Stop / ${trackName}`,
				name: `Stop ${clipName}`,
				elements: boxTextElements(`⏹️\\n$(ableton:clip_name_${t}_${s})`, combineRgb(100, 0, 0), combineRgb(255, 255, 255)),
				steps: [
					{
						down: [
							{
								actionId: 'stop_clip',
								options: { clipId: `${t}_${s}` }
							}
						],
						up: []
					}
				],
				feedbacks: []
			}
		}
	}

	// ============================================================
	// CLIPS / FADE
	// ============================================================
	for (let t = 1; t <= numTracks; t++) {
		const trackName = getTrackName(t)
		for (let s = 1; s <= numScenes; s++) {
			// Skip if no scan data yet, or if clip doesn't exist
			if (!hasClipData || !hasClip(t, s)) {
				continue
			}

			const clipName = getClipName(t, s)

			// Fade In Clip
			presets[`clip_fade_in_${t}_${s}`] = {
				type: 'layered',
				category: `Clips / Fade / ${trackName}`,
				name: `Fade In ${clipName}`,
				elements: boxTextElements(`📈\\n$(ableton:clip_name_${t}_${s})`, combineRgb(0, 0, 0), combineRgb(255, 255, 255)),
				steps: [
					{
						down: [
							{
								actionId: 'fade_fire_clip',
								options: { clipId: `${t}_${s}`, duration: 1500 }
							}
						],
						up: []
					}
				],
				feedbacks: [
					{
						feedbackId: 'clip_color',
						options: { clipId: `${t}_${s}` },
						styleOverrides: [
							{ elementId: 'bg', elementProperty: 'color', override: { isExpression: false, value: 'bgcolor' } }
						]
					}
				]
			}

			// Fade Out Clip
			presets[`clip_fade_out_${t}_${s}`] = {
				type: 'layered',
				category: `Clips / Fade / ${trackName}`,
				name: `Fade Out ${clipName}`,
				elements: boxTextElements(`📉\\n$(ableton:clip_name_${t}_${s})`, combineRgb(0, 0, 0), combineRgb(255, 255, 255)),
				steps: [
					{
						down: [
							{
								actionId: 'fade_stop_clip',
								options: { clipId: `${t}_${s}`, duration: 3500 }
							}
						],
						up: []
					}
				],
				feedbacks: [
					{
						feedbackId: 'clip_color',
						options: { clipId: `${t}_${s}` },
						styleOverrides: [
							{ elementId: 'bg', elementProperty: 'color', override: { isExpression: false, value: 'bgcolor' } }
						]
					}
				]
			}
		}
	}

	// ============================================================
	// TRACKS / CONTROLS
	// ============================================================
	// Only generate track presets if we have track name data (after scan)
	const trackName1 = self.getVariableValue('track_name_1')
	const hasTrackData = trackName1 !== undefined && trackName1 !== null && trackName1 !== ''

	for (let t = 1; t <= numTracks; t++) {
		// Skip if no scan data yet
		if (!hasTrackData) {
			break // Exit loop entirely, not just continue
		}

		const trackName = getTrackName(t)

		// Stop All Clips
		presets[`track_stop_${t}`] = {
			type: 'layered',
			category: `Tracks / ${trackName}`,
			name: `Stop All Clips`,
			elements: boxTextElements(`⏹️ STOP\\n$(ableton:track_name_${t})`, combineRgb(128, 0, 0), combineRgb(255, 255, 255)),
			steps: [
				{
					down: [
						{
							actionId: 'stop_track',
							options: { track: t }
						}
					],
					up: []
				}
			],
			feedbacks: []
		}

		// Mute + stereo VU-meter + volume fader, combined on a single button (native gauges,
		// bound directly to the meter/volume variables - layout matches todo/buttons_template.companionconfig)
		presets[`track_mute_${t}`] = {
			type: 'layered',
			category: `Tracks / ${trackName}`,
			name: `Mute`,
			elements: [
				{
					type: 'box',
					id: 'bg',
					name: 'Box',
					opacity: 100,
					x: 0, y: 0, width: 100, height: 100,
					color: combineRgb(0, 0, 0)
				},
				{
					type: 'gauge',
					id: 'meter_left',
					name: 'Track meter left',
					opacity: 100,
					x: 3, y: 4, width: 8, height: 92,
					orientation: 'vertical',
					min: 0,
					max: 1,
					value: { isExpression: true, value: `$(ableton:track_meter_left_${t})` },
					stops: [
						{ value: 0, color: combineRgb(0, 200, 0), gradient: false },
						{ value: 0.6, color: combineRgb(255, 255, 0), gradient: false },
						{ value: 0.85, color: combineRgb(255, 0, 0), gradient: false }
					],
					roundedEnds: true,
					fillEnabled: true,
					multiColour: true,
					markerEnabled: true,
					markerColor: combineRgb(255, 255, 255),
					markerWidth: 15,
					trackStyle: 'transparent',
					trackAmount: 70,
					trackWidth: 100
				},
				{
					type: 'gauge',
					id: 'meter_right',
					name: 'Track meter right',
					opacity: 100,
					x: 12, y: 4, width: 8, height: 92,
					orientation: 'vertical',
					min: 0,
					max: 1,
					value: { isExpression: true, value: `$(ableton:track_meter_right_${t})` },
					stops: [
						{ value: 0, color: combineRgb(0, 200, 0), gradient: false },
						{ value: 0.6, color: combineRgb(255, 255, 0), gradient: false },
						{ value: 0.85, color: combineRgb(255, 0, 0), gradient: false }
					],
					roundedEnds: true,
					fillEnabled: true,
					multiColour: true,
					markerEnabled: true,
					markerColor: combineRgb(255, 255, 255),
					markerWidth: 15,
					trackStyle: 'transparent',
					trackAmount: 70,
					trackWidth: 100
				},
				{
					type: 'gauge',
					id: 'volume',
					name: 'Track fader level',
					opacity: 100,
					x: 90, y: 4, width: 8, height: 92,
					orientation: 'vertical',
					min: 0,
					max: 1,
					value: { isExpression: true, value: `$(ableton:track_volume_${t})` },
					stops: [
						{ value: 0, color: combineRgb(0, 150, 255), gradient: false }
					],
					roundedEnds: true,
					fillEnabled: true,
					multiColour: true,
					markerEnabled: true,
					markerColor: combineRgb(255, 255, 255),
					markerWidth: 15,
					trackStyle: 'transparent',
					trackAmount: 70,
					trackWidth: 100
				},
				{
					type: 'text',
					id: 'label',
					name: 'Track name',
					opacity: 100,
					x: 20, y: 0, width: 70, height: 100,
					text: `$(ableton:track_name_${t})`,
					fontsize: 30,
					fontsizeAllowShrink: true,
					color: combineRgb(255, 255, 255),
					halign: 'center',
					valign: 'center',
					outlineColor: 0xff000000
				}
			],
			steps: [
				{
					down: [
						{
							actionId: 'mute_track',
							options: { track: t, mute: 'toggle' }
						}
					],
					up: []
				}
			],
			feedbacks: [
				{
					feedbackId: 'track_mute',
					options: { track: t },
					styleOverrides: [
						{
							elementId: 'bg',
							elementProperty: 'color',
							override: { isExpression: false, value: combineRgb(255, 0, 0) }
						}
					]
				}
			]
		}

		// Fade In Track
		presets[`track_fade_in_${t}`] = {
			type: 'layered',
			category: `Tracks / ${trackName}`,
			name: `Fade In`,
			elements: boxTextElements(`📈 FADE IN\\n$(ableton:track_name_${t})`, combineRgb(0, 100, 0), combineRgb(255, 255, 255)),
			steps: [
				{
					down: [
						{
							actionId: 'fade_in_track',
							options: { track: t, duration: 1500 }
						}
					],
					up: []
				}
			],
			feedbacks: []
		}

		// Fade Out Track
		presets[`track_fade_out_${t}`] = {
			type: 'layered',
			category: `Tracks / ${trackName}`,
			name: `Fade Out`,
			elements: boxTextElements(`📉 FADE OUT\\n$(ableton:track_name_${t})`, combineRgb(100, 0, 0), combineRgb(255, 255, 255)),
			steps: [
				{
					down: [
						{
							actionId: 'fade_stop_track',
							options: { track: t, duration: 3500 }
						}
					],
					up: []
				}
			],
			feedbacks: []
		}
	}

	// ============================================================
	// DEVICES / TOGGLE
	// ============================================================
	for (let t = 1; t <= numTracks; t++) {
		const trackName = getTrackName(t)

		if (self.deviceNames && self.deviceNames[t]) {
			const devices = self.deviceNames[t]
			for (let d = 0; d < devices.length; d++) {
				const deviceName = devices[d]
				const deviceIndex = d + 1

				presets[`device_toggle_${t}_${deviceIndex}`] = {
					type: 'layered',
					category: `Devices / Toggle / ${trackName}`,
					name: deviceName,
					elements: boxTextElements(`${deviceName}\\n$(ableton:track_name_${t})`, combineRgb(0, 0, 0), combineRgb(255, 255, 255)),
					steps: [
						{
							down: [
								{
									actionId: 'device_toggle',
									options: {
										device: `${t}_${deviceIndex}`,
										parameter: 1,  // Explicitly set parameter to 1 (Device On/Off)
										state: 'toggle'
									}
								}
							],
							up: []
						}
					],
					feedbacks: [
						{
							feedbackId: 'device_active',
							options: { parameterId: `${t}_${deviceIndex}_1` },
							styleOverrides: [
								{ elementId: 'bg', elementProperty: 'color', override: { isExpression: false, value: combineRgb(0, 255, 0) } },
								{ elementId: 'label', elementProperty: 'color', override: { isExpression: false, value: combineRgb(0, 0, 0) } }
							]
						}
					]
				}
			}
		}
	}

	// ============================================================
	// DEVICE PARAMS (organized by Track > Device)
	// ============================================================
	if (self.knownParameters && self.knownParameters.length > 0) {
		self.knownParameters.forEach(param => {
			const parts = param.label.split(' > ')
			const shortName = parts.length > 0 ? parts[parts.length - 1] : param.label

			let category = 'Device Params'
			if (parts.length >= 2) {
				const trackName = parts[0] || 'Unknown Track'
				const deviceName = parts[1] || 'Unknown Device'
				category = `Device Params / ${trackName} / ${deviceName}`
			}

			presets[`param_select_${param.id}`] = {
				type: 'layered',
				category: category,
				name: param.label,
				elements: boxTextElements(shortName, combineRgb(0, 0, 0), combineRgb(255, 255, 255)),
				steps: [
					{
						down: [
							{
								actionId: 'select_device_parameter',
								options: { parameterId: param.id }
							}
						],
						up: []
					}
				],
				feedbacks: [
					{
						feedbackId: 'selected_parameter_active',
						options: { parameterId: param.id },
						styleOverrides: [
							{ elementId: 'bg', elementProperty: 'color', override: { isExpression: false, value: combineRgb(255, 165, 0) } }
						]
					}
				]
			}
		})
	}

	// ============================================================
	// CONTROLS (Global device parameter controls)
	// ============================================================
	presets['control_step_minus'] = {
		type: 'layered',
		category: 'Controls',
		name: 'Step Down (-)',
		elements: boxTextElements('➖', combineRgb(0, 0, 0), combineRgb(255, 255, 255)),
		steps: [
			{
				down: [
					{
						actionId: 'step_selected_device_parameter',
						options: { step: '-5' }
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['control_step_plus'] = {
		type: 'layered',
		category: 'Controls',
		name: 'Step Up (+)',
		elements: boxTextElements('➕', combineRgb(0, 0, 0), combineRgb(255, 255, 255)),
		steps: [
			{
				down: [
					{
						actionId: 'step_selected_device_parameter',
						options: { step: '5' }
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['control_on'] = {
		type: 'layered',
		category: 'Controls',
		name: 'Set ON (100%)',
		elements: boxTextElements('ON', combineRgb(0, 100, 0), combineRgb(255, 255, 255)),
		steps: [
			{
				down: [
					{
						actionId: 'set_selected_device_parameter',
						options: { value: '100' }
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['control_off'] = {
		type: 'layered',
		category: 'Controls',
		name: 'Set OFF (0%)',
		elements: boxTextElements('OFF', combineRgb(100, 0, 0), combineRgb(255, 255, 255)),
		steps: [
			{
				down: [
					{
						actionId: 'set_selected_device_parameter',
						options: { value: '0' }
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['control_toggle'] = {
		type: 'layered',
		category: 'Controls',
		name: 'Toggle (0/100)',
		elements: boxTextElements('🔄 Toggle', combineRgb(255, 255, 0), combineRgb(0, 0, 0)),
		steps: [
			{
				down: [
					{
						actionId: 'toggle_selected_device_parameter',
						options: {}
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['control_value_display'] = {
		type: 'layered',
		category: 'Controls',
		name: 'Selected Parameter Value',
		elements: [
			{
				type: 'box',
				id: 'bg',
				name: 'Box',
				opacity: 100,
				x: 0, y: 0, width: 100, height: 100,
				color: combineRgb(192, 192, 255)
			},
			{
				type: 'gauge',
				id: 'param_ring',
				name: 'Gauge',
				opacity: 100,
				x: 10, y: 2, width: 80, height: 80,
				orientation: 'ring',
				min: 0,
				max: 100,
				startAngle: 210,
				endAngle: 150,
				ringWidth: 20,
				value: { isExpression: true, value: '$(ableton:selected_parameter_value_percent)' },
				stops: [
					{ value: 0, color: combineRgb(64, 64, 200), gradient: false }
				],
				roundedEnds: true,
				fillEnabled: true,
				multiColour: true,
				markerEnabled: true,
				markerColor: combineRgb(255, 255, 255),
				markerWidth: 10,
				trackStyle: 'transparent',
				trackAmount: 30,
				trackWidth: 70
			},
			{
				type: 'text',
				id: 'label',
				name: 'Value',
				opacity: 100,
				x: 22, y: 14, width: 56, height: 56,
				text: '$(ableton:selected_parameter_value)',
				fontsize: 40,
				fontsizeAllowShrink: true,
				color: combineRgb(0, 0, 0),
				halign: 'center',
				valign: 'center',
				outlineColor: 0xff000000
			},
			{
				type: 'text',
				id: 'param_label',
				name: 'Parameter Name',
				opacity: 85,
				x: 0, y: 80, width: 100, height: 20,
				text: '$(ableton:selected_parameter_name_short)',
				fontsize: 100,
				fontsizeAllowShrink: true,
				color: combineRgb(0, 0, 0),
				halign: 'center',
				valign: 'center',
				outlineColor: 0xff000000
			}
		],
		steps: [{ down: [], up: [] }],
		feedbacks: []
	}

	presets['control_param_name'] = {
		type: 'layered',
		category: 'Controls',
		name: 'Selected Parameter Name',
		elements: boxTextElements('$(ableton:selected_parameter_name)', combineRgb(64, 64, 128), combineRgb(255, 255, 255)),
		steps: [{ down: [], up: [] }],
		feedbacks: []
	}

	// ============================================================
	// 0. START HERE
	// ============================================================
	presets['utility_scan'] = {
		type: 'layered',
		category: '0. Start Here',
		name: 'Scan Project',
		elements: boxTextElements('🔍 Scan\\nProject', combineRgb(255, 192, 255), combineRgb(0, 0, 0)),
		steps: [
			{
				down: [
					{
						actionId: 'scan_project',
						options: {}
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['utility_raw_osc'] = {
		type: 'layered',
		category: '0. Start Here',
		name: 'Raw OSC Command',
		elements: boxTextElements('📡 Raw\\nOSC', combineRgb(64, 64, 64), combineRgb(255, 255, 255)),
		steps: [
			{
				down: [
					{
						actionId: 'raw_osc',
						options: {
							address: '/live/song/get/tempo',
							args: ''
						}
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['utility_raw_response'] = {
		type: 'layered',
		category: '0. Start Here',
		name: 'Last Raw Response',
		elements: boxTextElements('$(ableton:last_raw_response)', combineRgb(32, 32, 64), combineRgb(255, 255, 255)),
		steps: [{ down: [], up: [] }],
		feedbacks: []
	}

	// Generate a simple hash to detect changes
	const presetCount = Object.keys(presets).length
	const deviceCount = Object.keys(self.deviceNames || {}).length
	const hash = `${self.numTracks}_${self.numScenes}_${presetCount}_${deviceCount}_${hasClipData}`

	// Only update if presets changed
	if (hash !== self.lastPresetsHash) {
		self.lastPresetsHash = hash

		// API 2.x splits preset grouping into a separate "structure" (sections), built here from
		// each preset's `category` so the existing "Category / Subcategory" naming keeps working.
		const structureMap = new Map()
		for (const [presetId, preset] of Object.entries(presets)) {
			const category = preset.category || 'Other'
			let section = structureMap.get(category)
			if (!section) {
				section = { id: category, name: category, definitions: [] }
				structureMap.set(category, section)
			}
			section.definitions.push(presetId)
			delete preset.category
		}
		// Pin '0. Start Here' first and 'Controls' second, keep the rest (dynamic per-track/
		// per-device categories) in their natural order
		const categoryOrder = { '0. Start Here': 0, 'Controls': 1 }
		const structure = Array.from(structureMap.values())
			.map((section, index) => ({ section, index }))
			.sort((a, b) => {
				const orderA = categoryOrder[a.section.id] ?? 2
				const orderB = categoryOrder[b.section.id] ?? 2
				if (orderA !== orderB) return orderA - orderB
				return a.index - b.index
			})
			.map(({ section }) => section)

		self.setPresetDefinitions(structure, presets)
		const elapsed = Date.now() - startTime
		self.log('debug', `Presets updated: ${presetCount} presets in ${elapsed}ms`)
	}
}
