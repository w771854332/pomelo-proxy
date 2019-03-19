import { Transform, TransformCallback, TransformOptions } from "stream";

import { ERRORS } from "./constant";
import { noop, ProtocolError } from "./helper";
import {
  ISocksPacket,
  SocksConnectRequest,
  SocksConnectResponse,
  SocksHandshakeRequest,
  SocksHandshakeResponse,
} from "./packet";
import { EPacketType } from "./packet/type";
import {
  IEncoderCallback,
  IEncoderPacketOptions,
  TEncoderTaskQueue,
} from "./type";

export interface IProtocolEncoderOptions extends TransformOptions {}

const debug = require("debug")("pomelo-core:encoder");

export class ProtocolEncoder extends Transform {
  private _limited = false;
  private _queue: TEncoderTaskQueue[] = [];
  constructor(options?: IProtocolEncoderOptions) {
    super(options);

    this.once("close", () => {
      this._queue = [];
    });
    this.on("drain", () => {
      debug("onDrain, start, queue: %o", this._queue);
      this._limited = false;
      do {
        const item = this._queue.shift();
        if (!item) {
          break;
        }

        const [packet, callback] = item;
        debug("onDrain, resume");
        // 对于 rpc 请求，如果已经超时，则不需要再写入了
        // TODO: 超时 continue
        this.writePacket(packet, callback);
      } while (!this._limited);
    });
  }

  // public writeR
  public _transform(
    buf: Buffer,
    encoding: string,
    callback: TransformCallback,
  ) {
    callback(null, buf);
  }

  public writePacket(
    options: IEncoderPacketOptions & any,
    callback: IEncoderCallback = noop,
  ) {
    debug("writePacket, start, options: %o", options);
    if (this._limited) {
      this._queue.push([options, callback]);
    } else {
      let buf;
      const start = Date.now();
      try {
        const packet = this._createPacket(options.type, options);
        buf = packet.toBuffer();
        packet.setMeta({
          data: buf,
          encodeRT: Date.now() - start,
          size: buf.length,
        });
        debug("writePacket, end, packet: %o", packet);
      } catch (err) {
        callback(err, options);
        return;
      }
      // @refer: https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback
      // The return value is true if the internal buffer is less than the highWaterMark configured
      // when the stream was created after admitting chunk. If false is returned, further attempts to
      // write data to the stream should stop until the 'drain' event is emitted.
      this._limited = !this.write(buf, (err) => {
        callback(err, options);
      });
    }
  }

  private _createPacket(type: EPacketType, packet: any): ISocksPacket {
    switch (type) {
      case EPacketType.CONNECT_REQUEST:
        return new SocksConnectRequest(packet);
      case EPacketType.CONNECT_RESPONSE:
        return new SocksConnectResponse(packet);
      case EPacketType.HANDSHAKE_REQUEST:
        return new SocksHandshakeRequest(packet);
      case EPacketType.HANDSHAKE_RESPONSE:
        return new SocksHandshakeResponse(packet);
      default:
        throw new ProtocolError(
          ERRORS.PROTOCOL_DECODE_ERROR +
            `invalid packetType, expect type in [${Object.values(
              EPacketType,
            )}], but got ${type}`,
        );
    }
  }
}