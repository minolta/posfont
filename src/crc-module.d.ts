/** Missing upstream types for `crc` (CommonJS). */
declare module 'crc' {
  export function crc16xmodem(data: string | BufferSource, initial?: number): number;
}
