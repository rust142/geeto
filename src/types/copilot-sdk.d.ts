/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '@github/copilot-sdk' {
  // Minimal type stubs for the optional @github/copilot-sdk package.
  // Keep types permissive because runtime shape may vary between SDK versions.
  export class CopilotClient {
    constructor(opts?: any)
    start(): Promise<void>
    stop(): Promise<any>
    forceStop(): Promise<void>
    createSession(config?: any): Promise<any>
    ping(message?: string): Promise<{ message: string; timestamp: number }>
  }

  export function defineTool(name: string, config: any): any

  export type Session = any

  const defaultExport: any
  export default defaultExport
}
