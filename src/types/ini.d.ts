declare module 'ini' {
  export interface StringifyOptions {
    section?: string;
    whitespace?: boolean;
  }
  export function parse(iniString: string): any;
  export function stringify(object: any, options?: StringifyOptions | string): string;
  export function safe(val: string): string;
  export function unsafe(val: string): string;
}
