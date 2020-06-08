const { app, BrowserWindow, Menu, dialog } = require("electron");
const isDevMode = require("electron-is-dev");
const electronServe = require("electron-serve");
const path = require("path");
const {
  CapacitorSplashScreen,
  CapacitorDeeplinking,
  configCapacitor,
} = require("@capacitor-community/electron");

// electron-serve allows SPA and other webapps to run in electron
const loadWebApp = electronServe({
  directory: path.join(app.getAppPath(), "app"),
  scheme: "capacitor-electron",
});

// Place holders for our windows so they don't get garbage collected.
let mainWindow = null;

// Placeholder for SplashScreen ref
let splashScreen = null;

// Placeholder for deeplinking
let deepLinking = null;
// This is the function that will run when a deeplink is executed.
const deepLinkingHandler = (deeplinkingUrl) => {
  //Do something with passed deeplinking url (ex: mycapacitorapp://testing)
  console.log(deeplinkingUrl);
  dialog.showMessageBox(mainWindow, {
    message: deeplinkingUrl,
    title: "Log",
    buttons: ["Okay"],
  });
};

//Change this if you do not wish to have a splash screen
let useSplashScreen = true;

// Create simple menu for easy devtools access, and for demo
const menuTemplateDev = [
  {
    label: "Options",
    submenu: [
      {
        label: "Open Dev Tools",
        click() {
          mainWindow.openDevTools();
        },
      },
    ],
  },
];

async function createWindow() {
  // Define our main window size
  mainWindow = new BrowserWindow({
    height: 920,
    width: 1600,
    show: false,
    icon: path.join(app.getAppPath(), "appIcon.png"),
    title: "Capacitor App",
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      // Use preload to inject the electron varriant overrides for capacitor plugins.
      // Note: any windows you spawn that you want to include capacitor plugins must have this preload.
      preload: path.join(
        __dirname,
        "node_modules",
        "@capacitor-community",
        "electron",
        "dist",
        "electron-bridge.js"
      ),
    },
  });

  // Initialize Deeplinking for given custom protocol.
  deepLinking = new CapacitorDeeplinking(mainWindow, {
    customProtocol: "mycapacitorapp",
  });

  // Call to configure the useragent for capacitor.
  // Note: any windows you spawn that you want to include capacitor plugins must have this config function applied.
  configCapacitor(mainWindow);

  // Check if electron is in dev mode.
  if (isDevMode) {
    // Set our above template to the Menu Object if we are in development mode, dont want users having the devtools.
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplateDev));
    // If we are developers we might as well open the devtools by default.
    mainWindow.webContents.openDevTools();
  }

  // This function will get called after the SplashScreen timeout and load your content into the main window.
  const loadMainWindow = async () => {
    // Setup the handler for deeplinking if it has been setup.
    if (deepLinking !== null) deepLinking.init(deepLinkingHandler);

    // Here we use a production web app build reference but you could also reference a dev server instead with:
    // mainWindow.loadURL(`http://localhost:3000`);
    await loadWebApp(mainWindow);

    // After your content is loaded in we show the user the window.
    mainWindow.webContents.on("dom-ready", () => {
      mainWindow.show();
    });
  };

  //Based on Splashscreen choice actually load the window.
  if (useSplashScreen) {
    splashScreen = new CapacitorSplashScreen(mainWindow);
    splashScreen.init(loadMainWindow);
  } else {
    loadMainWindow();
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some Electron APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// Define any IPC or other custom functionality below here
