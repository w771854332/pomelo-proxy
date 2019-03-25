import graceful from "graceful";
import * as net from "net";
import { SocksBase } from "./base";
import { ISocksConnection, SocksConnection, TAuthenticate } from "./connection";

const debug = require("debug")("pomelo-core:server");
export interface ISocksServerOptions {
  port: number;
  killTimeout: number;
  authenticate?: TAuthenticate;
}

export class SocksServer extends SocksBase {
  get listenPorts() {
    return [ this._publishPort ];
  }

  private _options: ISocksServerOptions;
  private _connections: Map<string, ISocksConnection> = new Map();
  private _publishPort: number = 0;
  private _servers: net.Server[] = [];
  private _started = false;
  constructor(options: ISocksServerOptions) {
    super(options);

    this._options = options;
    this._publishPort = options.port;
  }

  public async close() {
    // 1. 关闭 tcp server
    for (const server of this._servers) {
      server.close();
    }
    // 2. 强制关闭连接
    const closeTasks = [];
    for (const connection of this._connections.values()) {
      closeTasks.push(connection.close());
    }
    await Promise.all(closeTasks);
    this.emit("close");
  }

  public async start() {
    debug("start, options: %o", this._options);
    if (!this._started) {
      this._started = true;

      for (const port of this.listenPorts) {
        const server = this._createServer(port);
        this._servers.push(server);
      }

      graceful({
        error: this._handleUncaughtError,
        killTimeout: this._options.killTimeout,
        server: this._servers,
      });
      Promise.all(
        this._servers.map((server) => this.awaitFirst(server, [ "listening", "error" ])))
        .then(() => {
          this._servers.forEach((server) => {
            const { port, address } = (server.address() as net.AddressInfo);
            debug("start, serverInstance[%s:%s] is ready", address, port);
          });
          this.emit("listening");
          this.ready(true);
        },    (err) => {
          this.ready(err);
        });
    }
    return this.ready();
  }

  private _handleUncaughtError = (ex: any) => {
    debug("handleUncaughtError", ex);
  }

  private _handleConnection = async (socket: net.Socket) => {
    const { port, address } = (socket.address() as net.AddressInfo);
    debug("handleConnection, serverInstance[%s:%s]", address, port);
    const connection = new SocksConnection({ socket, authenticate: this._options.authenticate });
    debug("handleConnection, create instance[%s]", connection.remoteAddress);
    this._connections.set(connection.remoteAddress, connection);
    try {
      await connection.awaitFirst(["connection", "error"]);
    } catch (ex) {
      // TODO: log error
    }
    debug("handleConnection, %s connect success!", connection.remoteAddress);
  }

  private _createServer(port: number) {
    const server = net.createServer();
    server.once("error", (err) => { this.emit("error", err); });
    server.on("connection", this._handleConnection);
    server.listen(port, () => {
      const realPort = (server.address() as net.AddressInfo).port;
      if (port === this._publishPort && port === 0) {
        this._publishPort = realPort;
      }
      console.log("[pomelo-core:server] server start on %s", realPort);
    });
    return server;
  }
}
