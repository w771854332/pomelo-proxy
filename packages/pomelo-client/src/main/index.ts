import { app, Tray } from "electron";
import unhandled from "electron-unhandled";
import { createLoggers, createPrefixLogger } from "pomelo-util";
import { BaseManager, TBaseManagerClass } from "./base-manager";
import { LocalManager } from "./local";
import { MainMenu } from "./menu";
import { PacManager } from "./pac";
import { ProxyHelper } from "./proxy-helper";
import { UserDefaultStore } from "./store";
import { EMode, IBaseOptions } from "./type";
// import { UpdateManager } from "./update";

// TODO:
// - 1.PAC mode
// - 2.auto set

const $MENU = Symbol("main#menu");
const $TRAY = Symbol("main#tray");
const $LOGGERS = Symbol("main#loggers");
const $LOGGER = Symbol("main#logger");

// function createSingleton<T extends []>(scope: any, symbol: string | symbol, createMethod: (...args: T) => any, ars: T) {
//   if (!scope[obj.__symbol]) {
//     obj.__symbol = typeof symbol === "string" ? Symbol(symbol) : symbol;
//     scope[obj.__symbol] = obj;
//   }
//   return scope[obj.__symbol];
// }
// let win: any;
// function sendStatusToWindow(text: string) {
//   console.log(text);
//   win.webContents.send("message", text);
// }
// function createDefaultWindow() {
//   win = new BrowserWindow();
//   win.on("closed", () => {
//     win = null;
//   });
//   win.loadURL(`file://${path.join(__static, "index.html")}#v${app.getVersion()}`);
//   return win;
// }

class Main {
  // TODO: refactor createGetters
  public get loggers() {
    if (!this[$LOGGERS]) {
      this[$LOGGERS] = createLoggers();
    }
    return this[$LOGGERS];
  }

  public get logger() {
    if (!this[$LOGGER]) {
      this[$LOGGER] = createPrefixLogger(this.loggers.coreLogger, "[pomelo-client][main]");
    }
    return this[$LOGGER];
  }

  private get _menu() {
    if (!this[$MENU]) {
      this[$MENU] = new MainMenu(this._store);
    }
    return this[$MENU];
  }

  private get _tray() {
    if (!this[$TRAY]) {
      this[$TRAY] = new Tray(this._store.icon);
    }
    return this[$TRAY];
  }

  private get _contextMenu() {
    return this._menu.create();
  }

  private _pacManager: PacManager;
  private _localManager: LocalManager;
  // private _updateManager: UpdateManager;
  private _app = app;
  private readonly _store: UserDefaultStore;
  private _awaitUpdate: Promise<any> | null = null;
  private [$MENU]: MainMenu;
  private [$TRAY]: Tray;
  private [$LOGGERS]: ReturnType<typeof createLoggers>;
  private [$LOGGER]: ReturnType<typeof createPrefixLogger>;
  constructor() {
    this._store = new UserDefaultStore();
    // this._updateManager = this._createManager(UpdateManager, {
    //   appVersion: this._app.getVersion(),
    //   platform: process.platform,
    // });
    this._localManager = this._createManager(LocalManager);
    this._pacManager = this._createManager(PacManager);
  }

  public start() {
    // app只会启动一个
    const gotTheLock = this._app.requestSingleInstanceLock();
    if (!gotTheLock) {
      this._app.quit();
      return;
    }
    unhandled({
      logger: (ex) => this.logger.error(ex),
    });
    this._app.once("ready", this._onReady);
    this._app.once("before-quit", this._onClose);
    this._app.on("window-all-closed", () => {
      this._app.quit();
    });
  }

  public close = () => {
    this._closeProxy();
  }

  private _createManager<T extends IBaseOptions, R extends BaseManager<T>>(ManagerClass: TBaseManagerClass<T, R>, args?: any) {
    return new ManagerClass(this._store, {
      logger: this.loggers.coreLogger,
      ...args,
    });
  }

  private async _closeProxy() {
    await Promise.all([
      this._pacManager.close(),
      ProxyHelper.disableAll(),
    ]);
  }

  private _updateTray() {
    this._tray.setImage(this._store.icon);
    this._tray.setContextMenu(this._contextMenu);
  }

  // private _checkUpdate() {
  //   // TODO: need code signature
  // }

  private async _setupPacProxy() {
    await this._closeProxy();
    await this._pacManager.start();
    await ProxyHelper.enableAutoMode(this._pacManager.address());
  }

  private async _setupGlobalProxy() {
    await this._closeProxy();
    await ProxyHelper.enableGlobalMode(this._store.localSocksHost, this._store.localSocksPort);
  }

  private async _setupProxy() {
    switch (this._store.mode) {
      case EMode.PAC:
        await this._setupPacProxy();
        break;
      case EMode.GLOBAL:
        await this._setupGlobalProxy();
        break;
      case EMode.MANUAL:
        await this._closeProxy();
        break;
      default:
        break;
    }
  }

  private _onClose = async () => {
    await this._closeProxy();
  }

  private _onReady = async () => {
    await ProxyHelper.disableAll();
    this._menu.on("on", this._onMenuON);
    this._menu.on("off", this._onMenuOFF);
    this._menu.on("mode", this._onMenuSwitchMode);

    // this._updateManager.once("download-begin", () => {
    //   createDefaultWindow();
    // });
    // this._updateManager.once("download-done", () => {
    //   win.setProgressBar(-1);
    //   win.close();
    // });
    // this._updateManager.on("download-progress", (progressObj) => {
    //   let log_message = "Download speed: " + (progressObj.bytesPerSecond / 1024).toFixed(2) + " k/s";
    //   log_message = log_message + " - Downloaded " + (progressObj.percent * 100).toFixed(2) + "%";
    //   log_message = log_message + " (" + progressObj.transferred + "/" + progressObj.total + ")";
    //   sendStatusToWindow(log_message);
    //   win.setProgressBar(progressObj.percent);
    // });
    // // TODO: close Window after downloaded
    // // prevent
    // this._awaitUpdate = this._updateManager.checkComponent();
  }

  private _onMenuON = async () => {
    await this._awaitUpdate;
    await this._localManager.instance();
    await this._setupProxy();

    if (!this._store.ready) {
      this._store.ready = true;
      this._tray.setContextMenu(this._contextMenu);
      this._app.dock.hide();
    }
    this._updateTray();
  }

  private _onMenuOFF = async () => {
    // await this._localManager.close();
    await this._closeProxy();
    this._updateTray();
  }

  private _onMenuSwitchMode = async () => {
    if (this._store.on) {
      await this._setupProxy();
    }
  }
}

new Main().start();
