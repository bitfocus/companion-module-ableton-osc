module.exports = async function (self) {
	const variables = [
		{ variableId: 'last_message', name: 'Last OSC Message' },
		{ variableId: 'selected_parameter_track', name: 'Selected Parameter Track' },
		{ variableId: 'selected_parameter_device', name: 'Selected Parameter Device' },
		{ variableId: 'selected_parameter_num', name: 'Selected Parameter Number' },
		{ variableId: 'selected_parameter_value', name: 'Selected Parameter Value' },
		{ variableId: 'selected_parameter_name', name: 'Selected Parameter Name' },
		{ variableId: 'last_raw_response', name: 'Last Raw OSC Response' },
		{ variableId: 'last_raw_address', name: 'Last Raw OSC Address' }
	]

	const numTracks = self.numTracks || 8
	const numScenes = self.numScenes || 8

	for (let t = 1; t <= numTracks; t++) {
		variables.push({ variableId: `track_name_${t}`, name: `Track Name ${t}` })
		variables.push({ variableId: `track_meter_${t}`, name: `Track Meter ${t}` })
		variables.push({ variableId: `track_mute_${t}`, name: `Track Mute ${t}` })

		for (let s = 1; s <= numScenes; s++) {
			variables.push({ variableId: `clip_name_${t}_${s}`, name: `Clip Name ${t}-${s}` })
		}
	}

	self.variableDefinitions = variables
	
	// Update the Set for fast lookup
	self.variableIds = new Set(variables.map(v => v.variableId))

	self.setVariableDefinitions(variables)
}
