declare namespace MessagingPlugin {
	type Name = 'Messaging Plugin';

  /** Represents request names and their respective argument types. */
  type Request = {
    'chat': string;
    'group.list': undefined;
    'park.entrance.toggle': undefined;
    'pause.toggle': undefined;
    'player.group.set': {
      playerId: number,
      groupId: number
    }; 
    'player.kick': number;
    'player.list': undefined;
    'save': undefined;
    'scenario': undefined;
    'screenshot': undefined;
    'server.status': undefined;
  };

  type RequestResponse = {
    [R in keyof Request]: Response[R]
  };

  /** Represents response names and their respective return types. */
  type Response = {
    'chat': void;
    'group.list': {
      id: number,
      name: string
    }[];
    'park.entrance.toggle': void;
    'pause.toggle': boolean;
    'player.group.set': {
      id: number,
      name: string,
      group: string,
    } | undefined;
    'player.kick': string | undefined;
    'player.list': {
      id: number,
      name: string,
      groupId: number,
      group: string,
    }[];
    'plugin.error': string;
    'save': string;
    'scenario': {
      name: string,
      details: string,
      fileName: string,
      objective: {
        type:
          | "none"
          | "guestsBy"
          | "parkValueBy"
          | "haveFun"
          | "buildTheBest"
          | "10Rollercoasters"
          | "guestsAndRating"
          | "monthlyRideIncome"
          | "10RollercoastersLength"
          | "finish5Rollercoasters"
          | "repayLoanAndParkValue"
          | "monthlyFoodIncome",
        guests: number,
        year: number,
        length: number,
        excitement: number,
        parkValue: number,
        monthlyIncome: number
      },
      status: 'inProgress' | 'completed' | 'failed'
    };
    'screenshot': string;
    'server.status': {
      name: string,
      fileName: string,
      status: 'inProgress' | 'completed' | 'failed',
      ticks: number
    };

    'network.chat': {
      playerName: string,
      message: string
    };
    'network.join': string;
    'network.leave': string;
  };
}