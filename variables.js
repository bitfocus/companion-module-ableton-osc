module.exports = async function (self) {
	self.variableDefinitions = [
		{ variableId: 'last_message', name: 'Last OSC Message' }
	]
	self.setVariableDefinitions(self.variableDefinitions)
}
