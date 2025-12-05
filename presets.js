const { combineRgb } = require('@companion-module/base')

module.exports = async function (self) {
	const presets = {}

	// We can't dynamically generate presets based on Ableton state easily 
	// because presets are usually defined once.
	// However, we can define a reasonable grid (e.g. 8 tracks x 8 scenes)
	// or allow the user to "Scan" which updates the presets.
	
	// For now, let's create a grid of 8x8 generic presets.
	// If the user scans, we could update this list, but Companion 
	// might not refresh the preset list dynamically in the UI without a reload.
	
	// Actually, let's use the data we might have if the user ran a scan.
	// If not, default to 8x8.
	const numTracks = self.numTracks || 8
	const numScenes = self.numScenes || 8

	for (let t = 1; t <= numTracks; t++) {
		for (let s = 1; s <= numScenes; s++) {
			presets[`clip_${t}_${s}`] = {
				type: 'button',
				category: 'Clip - Fire',
				name: `Track ${t} Clip ${s}`,
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
								options: {
									clipId: `${t}_${s}`
								}
							}
						],
						up: []
					}
				],
				feedbacks: [
					{
						feedbackId: 'clip_color',
						options: {
							clipId: `${t}_${s}`
						}
					},
					{
						feedbackId: 'clip_playing',
						options: {
							clipId: `${t}_${s}`
						},
						style: {
							bgcolor: combineRgb(0, 0, 0),
							color: combineRgb(255, 255, 255)
						}
					}
				]
			}

			presets[`stop_clip_${t}_${s}`] = {
				type: 'button',
				category: 'Clip - Stop',
				name: `Stop Track ${t} Clip ${s}`,
				style: {
					text: `STOP\n$(ableton:clip_name_${t}_${s})`,
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(255, 0, 0)
				},
				steps: [
					{
						down: [
							{
								actionId: 'stop_clip',
								options: {
									clipId: `${t}_${s}`
								}
							}
						],
						up: []
					}
				],
				feedbacks: []
			}
		}
	}

	for (let t = 1; t <= numTracks; t++) {
		presets[`stop_track_${t}`] = {
			type: 'button',
			category: 'Track - Stop',
			name: `Stop Track ${t}`,
			style: {
				text: `STOP $(ableton:track_name_${t})`,
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(128, 0, 0)
			},
			steps: [
				{
					down: [
						{
							actionId: 'stop_track',
							options: {
								track: t
							}
						}
					],
					up: []
				}
			],
			feedbacks: []
		}

		presets[`mute_track_${t}`] = {
			type: 'button',
			category: 'Track - Meter & Mute',
			name: `Mute Track ${t}`,
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
							options: {
								track: t,
								mute: 'toggle'
							}
						}
					],
					up: []
				}
			],
			feedbacks: [
				{
					feedbackId: 'track_mute',
					options: {
						track: t
					},
					style: {
						bgcolor: combineRgb(255, 0, 0)
					}
				},
				{
					feedbackId: 'track_meter_visual',
					options: {
						track: t,
						position: 'stereoRight'
					}
				}
			]
		}

		presets[`meter_track_${t}`] = {
			type: 'button',
			category: 'Track - Meter',
			name: `Meter Track ${t}`,
			style: {
				text: `$(ableton:track_name_${t})`,
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 0, 0)
			},
			steps: [
				{
					down: [],
					up: []
				}
			],
			feedbacks: [
				{
					feedbackId: 'track_meter_visual',
					options: {
						track: t,
						position: 'stereoRight'
					}
				}
			]
		}

		// Device Presets
		if (self.deviceNames && self.deviceNames[t]) {
			const devices = self.deviceNames[t]
			for (let d = 0; d < devices.length; d++) {
				const deviceName = devices[d]
				const deviceIndex = d + 1
				
				presets[`device_${t}_${deviceIndex}`] = {
					type: 'button',
					category: 'Device - Toggle',
					name: `Track ${t} Device ${deviceIndex}`,
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
							options: {
								parameterId: `${t}_${deviceIndex}_1`
							},
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

	// Device Control Category
	presets['device_control_minus'] = {
		type: 'button',
		category: 'Device - Select and Control',
		name: 'Step Down (-)',
		style: {
			text: '-',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0)
		},
		steps: [
			{
				down: [
					{
						actionId: 'step_selected_device_parameter',
						options: {
							step: '-5'
						}
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['device_control_plus'] = {
		type: 'button',
		category: 'Device - Select and Control',
		name: 'Step Up (+)',
		style: {
			text: '+',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0)
		},
		steps: [
			{
				down: [
					{
						actionId: 'step_selected_device_parameter',
						options: {
							step: '5'
						}
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['device_control_on'] = {
		type: 'button',
		category: 'Device - Select and Control',
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
						options: {
							value: '100'
						}
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['device_control_off'] = {
		type: 'button',
		category: 'Device - Select and Control',
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
						options: {
							value: '0'
						}
					}
				],
				up: []
			}
		],
		feedbacks: []
	}

	presets['device_control_toggle'] = {
		type: 'button',
		category: 'Device - Select and Control',
		name: 'Toggle (0/100)',
		style: {
			text: 'Toggle',
			size: '22',
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

	presets['device_control_value'] = {
		type: 'button',
		category: 'Device - Select and Control',
		name: 'Selected Parameter Value',
		style: {
			text: '$(ableton:selected_parameter_value)',
			size: 'auto',
			color: combineRgb(0, 0, 0),
			bgcolor: combineRgb(192, 192, 255)
		},
		steps: [
			{
				down: [],
				up: []
			}
		],
		feedbacks: []
	}

	presets['device_select_param'] = {
		type: 'button',
		category: 'Device - Select and Control',
		name: 'Select Parameter',
		style: {
			text: 'Select Device',
			size: 'auto',
			color: combineRgb(255, 255, 255),
			bgcolor: combineRgb(0, 0, 0)
		},
		steps: [
			{
				down: [
					{
						actionId: 'select_device_parameter',
						options: {
							parameterId: '0_0_0'
						}
					}
				],
				up: []
			}
		],
		feedbacks: [
			{
				feedbackId: 'selected_parameter_active',
				options: {
					parameterId: '0_0_0'
				},
				style: {
					bgcolor: combineRgb(255, 165, 0)
				}
			}
		]
	}

	// Fades Category
	for (let t = 1; t <= numTracks; t++) {
		// Fade In Track
		presets[`fade_in_track_${t}`] = {
			type: 'button',
			category: 'Track - Fade',
			name: `Fade In Track ${t}`,
			style: {
				text: `FADE IN\n$(ableton:track_name_${t})`,
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 100, 0)
			},
			steps: [
				{
					down: [
						{
							actionId: 'fade_in_track',
							options: {
								track: t,
								duration: 1500
							}
						}
					],
					up: []
				}
			],
			feedbacks: []
		}

		// Fade Out Track
		presets[`fade_out_track_${t}`] = {
			type: 'button',
			category: 'Track - Fade',
			name: `Fade Out Track ${t}`,
			style: {
				text: `FADE OUT\n$(ableton:track_name_${t})`,
				size: 'auto',
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(100, 0, 0)
			},
			steps: [
				{
					down: [
						{
							actionId: 'fade_stop_track',
							options: {
								track: t,
								duration: 3500
							}
						}
					],
					up: []
				}
			],
			feedbacks: []
		}

		// Fade Clips (First 8 scenes only to avoid clutter)
		for (let s = 1; s <= Math.min(numScenes, 8); s++) {
			presets[`fade_in_clip_${t}_${s}`] = {
				type: 'button',
				category: 'Clip - Fade',
				name: `Fade In Clip ${t}-${s}`,
				style: {
					text: `FADE IN\n$(ableton:clip_name_${t}_${s})`,
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0)
				},
				steps: [
					{
						down: [
							{
								actionId: 'fade_fire_clip',
								options: {
									clipId: `${t}_${s}`,
									duration: 1500
								}
							}
						],
						up: []
					}
				],
				feedbacks: [
					{
						feedbackId: 'clip_color',
						options: {
							clipId: `${t}_${s}`
						}
					}
				]
			}

			presets[`fade_out_clip_${t}_${s}`] = {
				type: 'button',
				category: 'Clip - Fade',
				name: `Fade Out Clip ${t}-${s}`,
				style: {
					text: `FADE OUT\n$(ableton:clip_name_${t}_${s})`,
					size: 'auto',
					color: combineRgb(255, 255, 255),
					bgcolor: combineRgb(0, 0, 0)
				},
				steps: [
					{
						down: [
							{
								actionId: 'fade_stop_clip',
								options: {
									clipId: `${t}_${s}`,
									duration: 3500
								}
							}
						],
						up: []
					}
				],
				feedbacks: [
					{
						feedbackId: 'clip_color',
						options: {
							clipId: `${t}_${s}`
						}
					}
				]
			}
		}
	}

	// Utility Presets
	presets['scan_project'] = {
		type: 'button',
		category: 'Utility',
		name: 'Scan Project',
		style: {
			text: 'Scan\nProject',
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

	// Dynamic Presets for Scanned Parameters
	if (self.knownParameters && self.knownParameters.length > 0) {
		self.knownParameters.forEach(param => {
			// Extract simple name for button text (last part of "Track > Device > Param")
			const parts = param.label.split(' > ')
			const shortName = parts.length > 0 ? parts[parts.length - 1] : param.label
			
			presets[`select_param_${param.id}`] = {
				type: 'button',
				category: 'Device Parameters',
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
								options: {
									parameterId: param.id
								}
							}
						],
						up: []
					}
				],
				feedbacks: [
					{
						feedbackId: 'selected_parameter_active',
						options: {
							parameterId: param.id
						},
						style: {
							bgcolor: combineRgb(255, 165, 0)
						}
					}
				]
			}
		})
	}

	self.setPresetDefinitions(presets)
}