import { Writable, WritableOptions } from "stream";

import {
  ISocksPacketClass,
} from "./packet";

const debug = require("debug")("pomelo-core:decoder");

export interface IProtocolDecoderOptions extends WritableOptions {
  PacketClass: ISocksPacketClass;
}

export class ProtocolDecoder extends Writable {
  private _buf: Buffer | null = null;
  private _PacketClass: ISocksPacketClass;
  constructor(options: IProtocolDecoderOptions) {
    super(options);
    this._PacketClass = options.PacketClass;
  }

  public _write(
    chunk: Buffer,
    encoding: string,
    callback: (error?: Error | null) => void,
  ) {
    debug("write, start, chunk: %o", chunk);
    this._buf = this._buf ? Buffer.concat([this._buf, chunk]) : chunk;

    try {
      let unfinished = false;
      do {
        debug("write, process loop, buf: %o", this._buf);
        unfinished = this._decode();
      } while (unfinished);
      callback();
    } catch (err) {
      // console.error(err);
      callback(err.message);
    }
  }

  public destroy() {
    this._buf = null;
    this.emit("close");
  }

  private _decode(): boolean {
    debug("decode, start");
    if (!this._buf) {
      debug("decode, stop, invalid buffer");
      return false;
    }
    const packet = new this._PacketClass(this._buf);
    const packetLength = packet.packetLength();
    const restLen = this._buf.length - packetLength;
    debug(
      "decode, bufferLength: %s, packetLength: %s, restLen: %s",
      this._buf.length,
      packetLength,
      restLen,
    );
    if (packetLength === 0 || this._buf.length < packetLength) {
      debug("decode, stop, no enough buffer length");
      return false;
    }
    const obj = packet.toJSON();
    debug("decode, emit: %s, obj: %o", this._PacketClass.displayName, obj);
    this.emit(this._PacketClass.displayName, obj);
    if (restLen) {
      this._buf = this._buf.slice(packetLength);
      return true;
    }
    this._buf = null;
    return false;
  }
}

// const request = new SocksConnectRequest({
//   address: "FF01::1101",
//   command: ESocksCommand.connect,
//   port: 90,
//   version: ESocksVersion.v5,
// });
// const response = new SocksConnectResponse({
//   address: "FF01::1101",
//   port: 90,
//   reply: ESocksReply.SUCCEEDED,
//   version: ESocksVersion.v5,
// });
// const buff1 = request.toBuffer();
// const req = new SocksConnectRequest(buff1);
// req.toJSON();
// const buff2 = response.toBuffer();
// const res = new SocksConnectResponse(buff2);
// const a = res.toJSON();
// const decoder = new ProtocolDecoder({
//   PacketClass: SocksConnectRequest,
// });

// decoder.on(SocksConnectRequest.displayName, (obj) => {
//   console.log(obj);
// });
// const b1 = buff1.slice(0, 2);
// const b2 = buff1.slice(2, buff1.length);
// decoder.write(Buffer.concat([buff1, b1]));
// decoder.write(b1);
// decoder.write(b1);
// decoder.write(b1);
// decoder.end(b2);