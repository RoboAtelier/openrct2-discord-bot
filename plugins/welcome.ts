/// <reference path="../src/modules/openrct2/openrct2.d.ts" />
/// <reference path="./welcome.d.ts" />

class WelcomePluginVariables {
  public static readonly pluginName: WelcomePlugin.Name = 'Welcome Message Plugin';
  public static readonly title: string = '';
  public static readonly bodyLines: [number, string][] = [];
  public static readonly bodyAlignment: 'left' | 'centred' = 'left';
  public static readonly listTitle: string = '';
  public static readonly listLines: [number, string][] = [];
  public static readonly listAlignment: 'left' | 'centred' = 'left';
  public static readonly footerLines: [number, string][] = [];
  public static readonly footerAlignment: 'left' | 'centred' = 'left';
};

function welcomePluginStartup() {
  let longestLine = '';
  const messageLines = WelcomePluginVariables.bodyLines.concat(WelcomePluginVariables.listLines).concat(WelcomePluginVariables.footerLines);
  for (const line of messageLines) {
    if (line[1].length > longestLine.length) {
      longestLine = line[1];
    };
  };

  if (!longestLine.length) {
    return;
  };

  const windowWidth = longestLine.length * 6 + 20;
  const labelWidth = windowWidth - 20;
  let windowHeight = messageLines.length * 10 + 30;
  let windowLineY = 20;

  const windowLabels: WidgetDesc[] = [];
  for (const bodyLine of WelcomePluginVariables.bodyLines) {
    const label: WidgetDesc = {
      type: 'label',
      name: `body${bodyLine[0]}`,
      x: 10,
      y: windowLineY,
      width: labelWidth,
      height: 10,
      text: bodyLine[1],
      textAlign: WelcomePluginVariables.bodyAlignment
    };

    windowLineY += 10;

    windowLabels.push(label);
  };

  if (WelcomePluginVariables.listLines.length) {
    windowLineY += 10;
    windowHeight += 10;
  };

  if (WelcomePluginVariables.listTitle.length) {
    windowLabels.push({
      type: 'label',
      name: 'listTitle',
      x: 10,
      y: windowLineY,
      width: labelWidth,
      height: 10,
      text: `${WelcomePluginVariables.listTitle}: `,
      textAlign: WelcomePluginVariables.listAlignment
    });

    windowLineY += 10;
    windowHeight += 10;
  };

  for (let i = 0; i < WelcomePluginVariables.listLines.length; ++i) {
    const listLine = WelcomePluginVariables.listLines[i];

    const label: WidgetDesc = {
      type: 'label',
      name: `list${listLine[0]}`,
      x: 10,
      y: windowLineY,
      width: labelWidth,
      height: 10,
      text: listLine.length ? `${i + 1}: ${listLine[1]}` : '',
      textAlign: WelcomePluginVariables.listAlignment
    };

    windowLineY += 10;

    windowLabels.push(label);
  };

  if (WelcomePluginVariables.footerLines.length) {
    windowLineY += 10;
    windowHeight += 10;
  };

  for (const footerLine of WelcomePluginVariables.footerLines) {
    const label: WidgetDesc = {
      type: 'label',
      name: `footer${footerLine[0]}`,
      x: 10,
      y: windowLineY,
      width: labelWidth,
      height: 10,
      text: footerLine[1],
      textAlign: WelcomePluginVariables.footerAlignment
    };

    windowLineY += 10;

    windowLabels.push(label);
  };

  ui.openWindow({
    title: WelcomePluginVariables.title,
    id: 1,
    classification: "Welcome Message",
    x: (ui.width / 2) - (windowWidth / 2),
    y: (ui.height / 2) - (windowHeight / 2),
    width: windowWidth,
    height: windowHeight,
    widgets: windowLabels,
    colours: [7, 1]
  });
};

registerPlugin({
	name: WelcomePluginVariables.pluginName,
	version: '1.0.0',
	authors: ['Robo'],
	type: 'remote',
	licence: 'MIT',
	targetApiVersion: 77,
	main: welcomePluginStartup
});