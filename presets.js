const { combineRgb } = require('@companion-module/base')

module.exports = async function (self) {
	const presets = {}

	const numTracks = self.numTracks || 8
	const numScenes = self.numScenes || 8

	// Helper to get track name
	const getTrackName = (t) => self.getVariableValue(`track_name_${t}`) || `Track ${t}`
	
	// Helper to get clip name
	const getClipName = (t, s) => self.clipNames?.[`${t}_${s}`] || `Scene ${s}`
	
	// Helper to check if clip exists
	const hasClip = (t, s) => self.clipSlotHasClip?.[`${t}_${s}`] === true

	// ============================================================
	// CLIPS / FIRE
	// ============================================================
	for (let t = 1; t <= numTracks; t++) {
		const trackName = getTrackName(t)
		for (let s = 1; s <= numScenes; s++) {
			// Only create preset if clip exists (after scan) or always if not scanned yet
			const clipExists = hasClip(t, s)
			const clipName = getClipName(t, s)
			
			// Skip empty slots if we have scan data
			if (Object.keys(self.clipSlotHasClip || {}).length > 0 && !clipExists) {
				continue
			}

			presets[`clip_fire_${t}_${s}`] = {
				type: 'button',
				category: `Clips / Fire / ${trackName}`,
				name: `Fire ${clipName}`,
				style: {
					text: `$(ableton:clip_name_${t}_${s})`,
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0)
				},
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
						options: { clipId: `${t}_${s}` }
					},
					{
						feedbackId: 'clip_playing',
						options: { clipId: `${t}_${s}` },
						style: {
							bgcolor: combineRgb(0, 0, 0),
							color: combineRgb(255, 255, 255)
						}
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
			const clipExists = hasClip(t, s)
			const clipName = getClipName(t, s)
			
			if (Object.keys(self.clipSlotHasClip || {}).length > 0 && !clipExists) {
				continue
			}

			presets[`clip_stop_${t}_${s}`] = {
				type: 'button',
				category: `Clips / Stop / ${trackName}`,
				name: `Stop ${clipName}`,
				style: {
					text: `⏹️\\n$(ableton:clip_name_${t}_${s})`,
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(100, 0, 0)
				},
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
			const clipExists = hasClip(t, s)
			const clipName = getClipName(t, s)
			
			if (Object.keys(self.clipSlotHasClip || {}).length > 0 && !clipExists) {
				continue
			}

			// Fade In Clip
			presets[`clip_fade_in_${t}_${s}`] = {
				type: 'button',
				category: `Clips / Fade / ${trackName}`,
				name: `Fade In ${clipName}`,
				style: {
					text: `📈\\n$(ableton:clip_name_${t}_${s})`,
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0)
				},
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
						options: { clipId: `${t}_${s}` }
					}
				]
			}

			// Fade Out Clip
			presets[`clip_fade_out_${t}_${s}`] = {
				type: 'button',
				category: `Clips / Fade / ${trackName}`,
				name: `Fade Out ${clipName}`,
				style: {
					text: `📉\\n$(ableton:clip_name_${t}_${s})`,
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0)
				},
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
						options: { clipId: `${t}_${s}` }
					}
				]
			}
		}
	}

	// ============================================================
	// TRACKS / CONTROLS
	// ============================================================
	for (let t = 1; t <= numTracks; t++) {
		const trackName = getTrackName(t)

		// Stop All Clips
		presets[`track_stop_${t}`] = {
			type: 'button',
			category: `Tracks / ${trackName}`,
			name: `Stop All Clips`,
			style: {
				text: `⏹️ STOP\\n$(ableton:track_name_${t})`,
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(128, 0, 0)
			},
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

		// Mute with Meter
		presets[`track_mute_${t}`] = {
			type: 'button',
			category: `Tracks / ${trackName}`,
			name: `Mute`,
			style: {
				text: `$(ableton:track_name_${t})`,
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 0, 0)
			},
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
					style: { bgcolor: combineRgb(255, 0, 0) }
				},
				{
					feedbackId: 'track_meter_visual',
					options: { track: t, position: 'stereoRight' }
				}
			]
		}

		// Fade In Track
		presets[`track_fade_in_${t}`] = {
			type: 'button',
			category: `Tracks / ${trackName}`,
			name: `Fade In`,
			style: {
				text: `📈 FADE IN\\n$(ableton:track_name_${t})`,
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 100, 0)
			},
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
			type: 'button',
			category: `Tracks / ${trackName}`,
			name: `Fade Out`,
			style: {
				text: `📉 FADE OUT\\n$(ableton:track_name_${t})`,
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(100, 0, 0)
			},
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
					type: 'button',
					category: `Devices / Toggle / ${trackName}`,
					name: deviceName,
					style: {
						text: `${deviceName}\\n$(ableton:track_name_${t})`,
						size: 'auto',
						color: combineRgb(255, 255, 255),
						bgcolor: combineRgb(0, 0, 0)
					},
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
							style: {
								bgcolor: combineRgb(0, 255, 0),
								color: combineRgb(0, 0, 0)
							}
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
				type: 'button',
				category: category,
				name: param.label,
				style: {
					text: shortName,
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0)
				},
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
						style: { bgcolor: combineRgb(255, 165, 0) }
					}
				]
			}
		})
	}

	// ============================================================
	// CONTROLS (Global device parameter controls)
	// ============================================================
	presets['control_step_minus'] = {
		type: 'button',
		category: 'Controls',
		name: 'Step Down (-)',
		style: {
			text: '➖',
			size: '44',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0)
		},
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
		type: 'button',
		category: 'Controls',
		name: 'Step Up (+)',
		style: {
			text: '➕',
			size: '44',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0)
		},
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
		type: 'button',
		category: 'Controls',
		name: 'Set ON (100%)',
		style: {
			text: 'ON',
			size: '24',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 100, 0)
		},
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
		type: 'button',
		category: 'Controls',
		name: 'Set OFF (0%)',
		style: {
			text: 'OFF',
			size: '24',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(100, 0, 0)
		},
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
		type: 'button',
		category: 'Controls',
		name: 'Toggle (0/100)',
		style: {
			text: '🔄 Toggle',
			size: '18',
			color: combineRgb(0, 0, 0),
			bgcolor: combineRgb(255, 255, 0)
		},
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
		type: 'button',
		category: 'Controls',
		name: 'Selected Parameter Value',
		style: {
			text: '$(ableton:selected_parameter_value)',
			size: 'auto',
			color: combineRgb(0, 0, 0),
			bgcolor: combineRgb(192, 192, 255)
		},
		steps: [{ down: [], up: [] }],
		feedbacks: []
	}

	presets['control_param_name'] = {
		type: 'button',
		category: 'Controls',
		name: 'Selected Parameter Name',
		style: {
			text: '$(ableton:selected_parameter_name)',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(64, 64, 128)
		},
		steps: [{ down: [], up: [] }],
		feedbacks: []
	}

	// ============================================================
	// 0. START HERE
	// ============================================================
	presets['utility_scan'] = {
		type: 'button',
		category: '0. Start Here',
		name: 'Scan Project',
		style: {
			text: '🔍 Scan\\nProject',
			size: '14',
			color: combineRgb(0, 0, 0),
			bgcolor: combineRgb(255, 192, 255)
		},
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

	self.setPresetDefinitions(presets)
}
