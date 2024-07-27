export const ServerAdapterPluginCode =
`var serverId = 0;
var port = 0;

function main() {
	var server = network.createListener();
	server.on('connection', function (conn) {
		conn.on('data', function(data) {
			try {
				var dataStr = data.toString('utf8');
				var args = dataStr.split(';', 3);
				var actionQuery = args[0];
				var userId = args[1];
				
				if (actionQuery === 'chat') {
					network.sendMessage(args[2]);
					conn.write(formatResponsePayload(actionQuery, userId));
				} else if (actionQuery === 'player.list') {
					var playerObjects = [];
					for (var i = 0; i < network.players.length; ++i) {
						var player = network.players[i];
						playerObjects.push({
							name: player.name,
							group: getPlayerGroupById(player.group).name
						});
					};
					conn.write(formatResponsePayload(
						actionQuery,
						userId,
						JSON.stringify(playerObjects)
					));
				} else if (actionQuery === 'group.list') {
					var groupObjects = [];
					for (var i = 0; i < network.groups.length; ++i) {
						var group = network.groups[i];
						groupObjects.push({
							id: group.id,
							name: group.name
						});
					};
					conn.write(formatResponsePayload(
						actionQuery,
						userId,
						JSON.stringify(groupObjects)
					));
				} else if (actionQuery === 'save') { // using legacy method, to change later
					var saveFileName = 's'.concat(serverId, '_save');
					console.executeLegacy('save_park '.concat(saveFileName));
					conn.write(formatResponsePayload(actionQuery, userId, saveFileName));
				} else if (actionQuery === 'scenario') {
					conn.write(formatResponsePayload(
						actionQuery,
						userId,
						JSON.stringify({
							name: scenario.name,
							details: scenario.details,
							filename: scenario.filename,
							status: scenario.status
						})
					));
				} else if (actionQuery === 'screenshot') {
					var screenshotFileName = scenario.name.concat('.png');
					var screenshotParams = {
						filename: screenshotFileName,
						zoom: 2,
						rotation: 0,
						transparent: true
						// width: map.size.x * 1.8 * 32,
						// height: map.size.y * 0.9 * 32,
						// position: { x: map.size.x / 2 * 32, y: map.size.y / 2 * 32 }
					};
					context.captureImage(screenshotParams);
					conn.write(formatResponsePayload(actionQuery, userId, screenshotFileName));
				};
			} catch (err) {
				try {
					conn.write(formatResponsePayload('error', 'e', err.message));
				} catch (_) { };
			};
		});

		context.subscribe('network.chat', function(eventArgs) { onNetworkChat(eventArgs, conn); });
		context.subscribe('network.join', function(eventArgs) { onNetworkJoin(eventArgs, conn); });
		context.subscribe('network.leave', function(eventArgs) { onNetworkLeave(eventArgs, conn); });
	});

	server.listen(port, 'localhost');

	console.log('Adapter plugin for server '.concat(serverId, ' is active!'));
};

function onNetworkChat(eventArgs, conn) {
	if (!(0 === eventArgs.player && eventArgs.message.startsWith('{DISCORD}'))) {
		conn.write(formatResponsePayload(
			'network.chat',
			'e',
			JSON.stringify({
				playerName: getPlayerById(eventArgs.player).name,
				message: eventArgs.message
			})
		));
	};
};

function onNetworkJoin(eventArgs, conn) {
	conn.write(formatResponsePayload('network.join', 'e', getPlayerById(eventArgs.player).name));
};

function onNetworkLeave(eventArgs, conn) {
	conn.write(formatResponsePayload('network.leave', 'e', getPlayerById(eventArgs.player).name));
};

function getPlayerById(id) {
	for (var i = 0; i < network.players.length; ++i) {
		if (network.players[i].id === id) {
			return network.players[i];
		};
	};
	return null;
};

function getPlayerGroupById(id) {
	for (var i = 0; i < network.groups.length; ++i) {
		if (network.groups[i].id === id) {
			return network.groups[i];
		};
	};
	return null;
};

function removeNewLines(str) {
	return str.replace('\n', ' ').replace('\r', ' ');
};

function formatResponsePayload(actionName, source, data) {
	if (data == null) {
		return ''.concat(actionName, ';', source, ';\0');
	};
	return ''.concat(actionName, ';', source, ';', data, '\0');
};

function toPlayerDto(player) {
	return {
		currentId: id,
		name: player.name,
		group: getPlayerGroupById(player.group).name,
		ipAddress: player.ipAddress,
		publicKeyHash: player.publicKeyHash
	};
};

registerPlugin({
	name: 'Server Adapter OpenRCT2 Plugin',
	version: '0.1.1',
	authors: ['Robo'],
	type: 'remote',
	licence: 'MIT',
	targetApiVersion: 34,
	main: main
})`;