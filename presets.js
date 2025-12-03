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
				category: 'Clips',
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
									track: t,
									clip: s
								}
							}
						],
						up: []
					},
					{
						down: [
							{
								actionId: 'stop_clip',
								options: {
									track: t,
									clip: s
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
							track: t,
							clip: s
						}
					}
				]
			}
		}
	}

	for (let t = 1; t <= numTracks; t++) {
		presets[`stop_track_${t}`] = {
			type: 'button',
			category: 'Tracks',
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

		presets[`meter_track_${t}`] = {
			type: 'button',
			category: 'Meters',
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
	}
	
	self.setPresetDefinitions(presets)
}
