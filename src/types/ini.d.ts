declare module 'ini' {
  export function parse(iniString: string): any;
  export function stringify(object: any, section?: string): string;
  export function safe(val: string): string;
  export function unsafe(val: string): string;
}
