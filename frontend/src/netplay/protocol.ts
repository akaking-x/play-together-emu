import type { PS1Input } from '../emulator/input-mapper';

// Binary protocol: 8 bytes per input packet
// [frame:u32][buttons:u16][analogLX:i8][analogLY:i8]

export function encodeInput(frame: number, input: PS1Input): ArrayBuffer {
  const buf = new ArrayBuffer(8);
  const v = new DataView(buf);
  v.setUint32(0, frame, true);
  v.setUint16(4, input.buttons, true);
  v.setInt8(6, input.analogLX);
  v.setInt8(7, input.analogLY);
  return buf;
}

export function decodeInput(buf: ArrayBuffer): { frame: number; input: PS1Input } {
  const v = new DataView(buf);
  return {
    frame: v.getUint32(0, true),
    input: {
      buttons: v.getUint16(4, true),
      analogLX: v.getInt8(6),
      analogLY: v.getInt8(7),
    },
  };
}
