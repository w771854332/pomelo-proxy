import * as crypto from "crypto";
import * as net from "net";
import { ISocksConnectionOptions, logClassDecorator, SocksConnection } from "pomelo-core";
import { ISocksConnectRequestOptions } from "pomelo-core/build/protocol/packet";
import pump from "pump";
import { SSLocalRequest } from "./packet";

const debug = require("debug")("pomelo:ss-local-conn");

export interface ISSLocalConnectionOptions extends ISocksConnectionOptions {
  port: number;
  host: string;
  cipher: crypto.Cipher;
  decipher: crypto.Decipher;
}

@logClassDecorator(debug)
export class SSLocalConnection extends SocksConnection {
  protected _cipher: crypto.Cipher;
  protected _decipher: crypto.Decipher;
  private _remotePort: number;
  private _remoteHost: string;
  constructor(socket: net.Socket, options: ISSLocalConnectionOptions) {
    super(socket, options);
    this._remotePort = options.port;
    this._remoteHost = options.host;

    this._cipher = options.cipher;
    this._decipher = options.decipher;
  }

  protected _createProxy(data: ISocksConnectRequestOptions) {
    const remote = net.createConnection(this._remotePort, this._remoteHost, () => {
      debug("remote start! [%s:%s]", this._remoteHost, this._remotePort);
      remote.setTimeout(0);
      // ss-handshake packet
      const req = new SSLocalRequest({
        address: data.address,
        port: data.port,
        version: data.version,
      }).toBuffer();

      pump(
        this._cipher,
        remote,
        this._decipher,
        this._socket,
      );

      this._cipher.write(req);

      pump(
        this._socket,
        this._cipher,
      );
    });
    return remote;
  }
}
