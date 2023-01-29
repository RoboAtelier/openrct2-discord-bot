export const ServerAdapterPluginCode =
`var serverId = 0;
var port = 0;

function main() {
	var server = network.createListener();
	server.on('connection', function (conn) {
		conn.on('data', function(data) {
			try {
				var dataString = data.toString('utf8');
				var args = dataString.split(';');
				var actionQuery = args[0];
				var userId = args[1];
				
				if ('chat' === actionQuery) {
					network.sendMessage(args[2]);
					conn.write('chat'.concat(
						'_',
						userId,
						'_'
					));
				} else if ('scenario' === actionQuery) {
					conn.write('scenario'.concat(
						'_',
						userId,
						'_',
						JSON.stringify({
							name: scenario.name,
							details: scenario.details,
							filename: scenario.filename,
							status: scenario.status
						})
					));
				} else if ('screenshot' === actionQuery) {
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
					conn.write('screenshot'.concat(
						'_',
						userId,
						'_',
						screenshotFileName
					));
				};
			} catch (err) {
				console.log(data);
			};
		});

		context.subscribe('network.chat', function(eventArgs) { onNetworkChat(eventArgs, conn); });
		context.subscribe('network.join', function(eventArgs) { onNetworkJoin(eventArgs, conn); });
		context.subscribe('network.leave', function(eventArgs) { onNetworkLeave(eventArgs, conn); });
	});

	server.listen(port, 'localhost');

	console.log('Adapter plugin for server '.concat(
		serverId,
		' is active!'
	));
};

function getPlayerById(id) {
	for (var i = 0; i < network.players.length; ++i) {
		if (network.players[i].id === id) {
			return network.players[i];
		};
	};
	return null;
};

function onNetworkChat(eventArgs, conn) {
	if (!(0 === eventArgs.player && eventArgs.message.startsWith('{DISCORD}'))) {
		conn.write('network.chat'.concat(
			'_e_',
			JSON.stringify({
				playerName: getPlayerById(eventArgs.player).name,
				message: eventArgs.message
			})
		));
	};
};

function onNetworkJoin(eventArgs, conn) {
	conn.write('network.join'.concat(
		'_e_',
		getPlayerById(eventArgs.player).name
	));
};

function onNetworkLeave(eventArgs, conn) {
	conn.write('network.leave'.concat(
		'_e_',
		getPlayerById(eventArgs.player).name
	));
};

registerPlugin({
	name: 'Server Adapter OpenRCT2 Plugin',
	version: '0.1',
	authors: ['Robo'],
	type: 'remote',
	licence: 'MIT',
	targetApiVersion: 34,
	main: main
})`;