module.exports = function (self) {
	self.setActionDefinitions({
		fire_clip: {
			name: 'Fire Clip',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Clip Index',
					id: 'clip',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const clip = event.options.clip - 1
				self.sendOsc('/live/clip_slot/fire', [
					{
						type: 'i',
						value: track
					},
					{
						type: 'i',
						value: clip
					}
				])
			}
		},
		stop_clip: {
			name: 'Stop Clip',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Clip Index',
					id: 'clip',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const clip = event.options.clip - 1
				self.sendOsc('/live/clip/stop', [
					{
						type: 'i',
						value: track
					},
					{
						type: 'i',
						value: clip
					}
				])
			}
		},
		stop_track: {
			name: 'Stop Track',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				self.sendOsc('/live/track/stop_all_clips', [
					{
						type: 'i',
						value: track
					}
				])
			}
		},
		refresh_clip_info: {
			name: 'Refresh Clip Info',
			options: [
				{
					type: 'number',
					label: 'Track Index',
					id: 'track',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				},
				{
					type: 'number',
					label: 'Clip Index',
					id: 'clip',
					min: 1,
					max: 1000,
					default: 1,
					required: true
				}
			],
			callback: async (event) => {
				const track = event.options.track - 1
				const clip = event.options.clip - 1
				
				// Request Name
				self.sendOsc('/live/clip/get/name', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])

				// Request Color
				self.sendOsc('/live/clip/get/color', [
					{ type: 'i', value: track },
					{ type: 'i', value: clip }
				])
			}
		},
		scan_project: {
			name: 'Scan Project',
			options: [],
			callback: async (event) => {
				self.sendOsc('/live/song/get/num_tracks', [])
				self.sendOsc('/live/song/get/num_scenes', [])
			}
		}
	})
}
