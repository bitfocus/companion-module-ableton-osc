module.exports = async function (self) {
	const variables = {
		last_message: { name: 'Last OSC Message' },
		selected_parameter_track: { name: 'Selected Parameter Track' },
		selected_parameter_device: { name: 'Selected Parameter Device' },
		selected_parameter_num: { name: 'Selected Parameter Number' },
		selected_parameter_value: { name: 'Selected Parameter Value' },
		selected_parameter_value_percent: { name: 'Selected Parameter Value (0-100)' },
		selected_parameter_name: { name: 'Selected Parameter Name (Track > Device > Parameter)' },
		selected_parameter_name_short: { name: 'Selected Parameter Name (Parameter only)' },
		last_raw_response: { name: 'Last Raw OSC Response' },
		last_raw_address: { name: 'Last Raw OSC Address' }
	}

	const numTracks = self.numTracks || 8
	const numScenes = self.numScenes || 8

	for (let t = 1; t <= numTracks; t++) {
		variables[`track_name_${t}`] = { name: `Track Name ${t}` }
		variables[`track_meter_${t}`] = { name: `Track Meter ${t}` }
		variables[`track_meter_left_${t}`] = { name: `Track Meter Left ${t}` }
		variables[`track_meter_right_${t}`] = { name: `Track Meter Right ${t}` }
		variables[`track_volume_${t}`] = { name: `Track Volume ${t}` }
		variables[`track_mute_${t}`] = { name: `Track Mute ${t}` }

		for (let s = 1; s <= numScenes; s++) {
			variables[`clip_name_${t}_${s}`] = { name: `Clip Name ${t}-${s}` }
		}
	}

	self.variableDefinitions = variables

	// Update the Set for fast lookup
	self.variableIds = new Set(Object.keys(variables))

	self.setVariableDefinitions(variables)
}
