/// <reference path="../src/modules/openrct2/openrct2.d.ts" />
/// <reference path="../src/modules/openrct2/index.d.ts"/>
//export {};

var serverId = 0;
var port = 0;

function startup() {
	const server = network.createListener();
	server.on('connection', conn => {
		conn.on('data', data => {
			try {
				const args = data.split(';', 3);
				const actionOrQueryName = args[0] as keyof OpenRCT2Module.AdapterRequest;
				const userId = args[1];
				
				if (actionOrQueryName === 'chat') {
					network.sendMessage(args[2]);
					conn.write(formatResponsePayload(actionOrQueryName, userId));
				} else if (actionOrQueryName === 'group.list') {
					const groupObjects: any[] = [];
					for (let i = 0; i < network.groups.length; ++i) {
						const group = network.groups[i];
						groupObjects.push({
							id: group.id,
							name: group.name
						});
					};
					conn.write(formatResponsePayload(
						actionOrQueryName,
						userId,
						groupObjects
					));
				} else if (actionOrQueryName === 'pause.toggle') {
					context.executeAction('pausetoggle', {});
					conn.write(formatResponsePayload(actionOrQueryName, userId));
				} else if (actionOrQueryName === 'player.group.set') {
					const requestArgs = JSON.parse(args[2]) as OpenRCT2Module.AdapterRequest[typeof actionOrQueryName];
					const player = network.getPlayer(requestArgs.playerId);
					const group = network.getGroup(requestArgs.groupId);
					if (player == null || group == null) {
						conn.write(formatResponsePayload(actionOrQueryName, userId));
					} else {
						player.group = requestArgs.groupId;
						conn.write(formatResponsePayload(
							actionOrQueryName,
							userId,
							{
								id: player.id,
								name: player.name,
								group: group.name
							}
						));
					};
				} else if (actionOrQueryName === 'player.kick') {
					const requestArgs = JSON.parse(args[2]) as OpenRCT2Module.AdapterRequest[typeof actionOrQueryName];
					const player = network.getPlayer(requestArgs);
					if (player) {
						network.kickPlayer(player.id);
						conn.write(formatResponsePayload(actionOrQueryName, userId, player.name));
					} else {
						conn.write(formatResponsePayload(actionOrQueryName, userId));
					};
				} else if (actionOrQueryName === 'player.list') {
					const playerObjects: PlayerDto[] = [];
					for (let i = 0; i < network.players.length; ++i) {
						const player = network.players[i];
						playerObjects.push(toPlayerDto(player));
					};
					conn.write(formatResponsePayload(
						actionOrQueryName,
						userId,
						playerObjects
					));
				} else if (actionOrQueryName === 'save') { // using legacy method, to change later
					const saveFileName = 's'.concat(serverId.toString(), '_save');
					console.executeLegacy('save_park '.concat(saveFileName));
					conn.write(formatResponsePayload(actionOrQueryName, userId, saveFileName));
				} else if (actionOrQueryName === 'scenario') {
					conn.write(formatResponsePayload(
						actionOrQueryName,
						userId,
						{
							name: scenario.name,
							details: scenario.details,
							fileName: scenario.filename,
							objective: {
								type: scenario.objective.type,
								guests: scenario.objective.guests,
								year: scenario.objective.year,
								length: scenario.objective.length,
								excitement: scenario.objective.excitement,
								parkValue: scenario.objective.parkValue,
								monthlyIncome: scenario.objective.monthlyIncome
							},
							status: scenario.status
						}
					));
				} else if (actionOrQueryName === 'scenario.status') {
					conn.write(formatResponsePayload(
						actionOrQueryName,
						userId,
						{
							name: scenario.name,
							fileName: scenario.filename,
							status: scenario.status,
							ticks: date.ticksElapsed
						}
					));
				} else if (actionOrQueryName === 'screenshot') {
					const screenshotFileName = scenario.name.concat('.png');
					const screenshotParams = {
						filename: screenshotFileName,
						zoom: 2,
						rotation: 0,
						transparent: true
						// width: map.size.x * 1.8 * 32,
						// height: map.size.y * 0.9 * 32,
						// position: { x: map.size.x / 2 * 32, y: map.size.y / 2 * 32 }
					};
					context.captureImage(screenshotParams);
					conn.write(formatResponsePayload(actionOrQueryName, userId, screenshotFileName));
				};
			} catch (err) {
				try {
					conn.write(formatResponsePayload('plugin.error', 'e', (err as Error).message));
				} catch (_) { };
			};
		});

		context.subscribe('interval.day', () => onIntervalDay(conn));
		context.subscribe('network.chat', eventArgs => onNetworkChat(eventArgs, conn));
		context.subscribe('network.join', eventArgs => onNetworkJoin(eventArgs, conn));
		context.subscribe('network.leave', eventArgs => onNetworkLeave(eventArgs, conn));
	});

	server.listen(port, 'localhost');
	console.log(`Adapter plugin for server ${serverId} is active!`);
};

// Event Handlers
function onIntervalDay(conn: Socket) {
	conn.write(formatResponsePayload(
		'scenario.status',
		'e',
		{
			name: scenario.name,
			fileName: scenario.filename,
			status: scenario.status,
			ticks: date.ticksElapsed
		}
	));
};

function onNetworkChat(eventArgs: NetworkChatEventArgs, conn: Socket) {
	if (!(eventArgs.player === 0 && eventArgs.message.startsWith('{DISCORD}'))) {
		conn.write(formatResponsePayload(
			'network.chat',
			'e',
			{
				playerName: network.getPlayer(eventArgs.player).name,
				message: eventArgs.message
			}
		));
	};
};

function onNetworkJoin(eventArgs: NetworkEventArgs, conn: Socket) {
	conn.write(formatResponsePayload('network.join', 'e', network.getPlayer(eventArgs.player).name));
};

function onNetworkLeave(eventArgs: NetworkEventArgs, conn: Socket) {
	conn.write(formatResponsePayload('network.leave', 'e', network.getPlayer(eventArgs.player).name));
};

// Utils
function removeNewLines(str: string) {
	return str.replace('\n', ' ').replace('\r', ' ');
};

// Transformers
function formatResponsePayload<R extends keyof OpenRCT2Module.AdapterResponse>(
	sourceName: R,
	source: string,
	data?: OpenRCT2Module.AdapterResponse[R]
) {
	if (data == null) {
		return `${sourceName};${source};;\n`;
	};
	return `${sourceName};${source};${removeNewLines(JSON.stringify(data))}\n`;
};

function toPlayerDto(player: Player) {
  return new PlayerDto(
    player.id,
    player.name,
		player.group,
    network.getGroup(player.group).name
  );
};

function toDetailedPlayerDto(player: Player) {
	return new PlayerDto(
		player.id,
		player.name,
	  player.group,
		network.getGroup(player.group).name,
		player.ipAddress,
		player.publicKeyHash
  );
};

class PlayerDto {
  constructor(
    public id: number,
		public name: string,
		public groupId: number,
		public group: string,
		public ipAddress?: string,
		public publicKeyHash?: string
  ) {};
};

registerPlugin({
	name: 'Server Adapter',
	version: '0.1.2',
	authors: ['Robo'],
	type: 'remote',
	licence: 'MIT',
	targetApiVersion: 77,
	main: startup
})